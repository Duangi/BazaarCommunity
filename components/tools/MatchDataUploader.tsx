'use client'

import { useMemo, useRef, useState } from 'react'
import styles from './MatchDataUploader.module.css'

type ParsedSummary = {
  rootFolder: string
  dbName: string
  replayCount: number
  selectedCount: number
  totalBytes: number
  battleIdCount: number
  duplicateCount: number
  newCount: number
}

type UploadTask = {
  key: string
  fileName: string
  relPath: string
  category: 'db' | 'replay' | 'manifest'
  blob: Blob
  contentType: string
}

interface MatchDataUploaderProps {
  userId?: string
  uploaderName?: string
  onToast?: (text: string, tone?: 'success' | 'error' | 'info') => void
  onResolveIdentity?: (identity: { userId: string; username: string }) => void
}

function formatBytes(input: number): string {
  const n = Number(input || 0)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function gzipBlob(blob: Blob): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') return blob
  const cs = new CompressionStream('gzip')
  const stream = blob.stream().pipeThrough(cs)
  return await new Response(stream).blob()
}

function pickTargetFiles(fileList: FileList): {
  dbFile: File | null
  replayFiles: File[]
  rootFolder: string
} {
  const files = Array.from(fileList || [])
  const dbFile = files.find((f) => /(^|\/)bazaarplusplus\.db$/i.test(f.webkitRelativePath || f.name)) || null
  const replayFiles = files.filter((f) => /\/CombatReplays\/.+\.payload\.json$/i.test(f.webkitRelativePath || ''))
  const sample = files[0]?.webkitRelativePath || files[0]?.name || ''
  const rootFolder = sample.includes('/') ? sample.split('/')[0] : 'BazaarPlusPlus'
  return { dbFile, replayFiles, rootFolder }
}

function sleepFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

async function extractIdentityFromDbFile(file: File): Promise<{ userId: string; username: string } | null> {
  try {
    const dynamicImport = new Function('u', 'return import(u)') as (u: string) => Promise<any>
    const sqlModule = await dynamicImport('https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/sql-wasm.js')
    const initSqlJs = (sqlModule as any).default
    const SQL = await initSqlJs({
      locateFile: (name: string) => `https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/${name}`,
    })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const db = new SQL.Database(bytes)
    const result = db.exec(`
      select
        player_account_id as user_id,
        max(coalesce(player_name, '')) as username,
        count(*) as c
      from pvp_battles
      where coalesce(player_account_id, '') <> ''
      group by player_account_id
      order by c desc
      limit 1
    `)
    db.close()
    if (!Array.isArray(result) || result.length === 0) return null
    const row = result[0]?.values?.[0] || []
    const userId = String(row?.[0] || '').trim()
    const username = String(row?.[1] || '').trim()
    if (!userId) return null
    return { userId, username: username || userId }
  } catch {
    return null
  }
}

async function uploadOne(task: UploadTask, folder: string): Promise<{ key: string; publicUrl: string }> {
  const presignRes = await fetch('/api/r2/presign-web', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: task.fileName,
      contentType: task.contentType,
      folder,
    }),
  })
  const presignData = await presignRes.json()
  if (!presignRes.ok || !presignData?.uploadUrl) {
    throw new Error(presignData?.error || `获取上传签名失败: ${task.fileName}`)
  }
  const putRes = await fetch(String(presignData.uploadUrl), {
    method: 'PUT',
    headers: { 'Content-Type': task.contentType },
    body: task.blob,
  })
  if (!putRes.ok) {
    throw new Error(`上传失败: ${task.fileName}`)
  }
  return { key: String(presignData.key || ''), publicUrl: String(presignData.publicUrl || '') }
}

export default function MatchDataUploader({
  userId = '',
  uploaderName = '',
  onToast,
  onResolveIdentity,
}: MatchDataUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [summary, setSummary] = useState<ParsedSummary | null>(null)
  const [dbFile, setDbFile] = useState<File | null>(null)
  const [replayFiles, setReplayFiles] = useState<File[]>([])
  const [battleIdByPath, setBattleIdByPath] = useState<Record<string, string>>({})
  const [existingBattleIds, setExistingBattleIds] = useState<Set<string>>(new Set())
  const [dedupeReady, setDedupeReady] = useState(false)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [analysisText, setAnalysisText] = useState('')
  const [uploadText, setUploadText] = useState('')
  const [uploaded, setUploaded] = useState<{ total: number; folder: string }>({ total: 0, folder: '' })

  const canUpload = !!dbFile && replayFiles.length > 0 && !working && dedupeReady
  const analysisWidth = useMemo(() => `${Math.max(0, Math.min(100, analysisProgress))}%`, [analysisProgress])
  const uploadWidth = useMemo(() => `${Math.max(0, Math.min(100, uploadProgress))}%`, [uploadProgress])

  const handlePickFolder = async (list: FileList | null) => {
    setError('')
    setUploaded({ total: 0, folder: '' })
    setAnalysisProgress(0)
    setUploadProgress(0)
    setAnalysisText('')
    setUploadText('')
    setBattleIdByPath({})
    setExistingBattleIds(new Set())
    setDedupeReady(false)
    if (!list || list.length === 0) return
    setAnalyzing(true)
    const { dbFile: db, replayFiles: replays, rootFolder } = pickTargetFiles(list)
    if (!db) {
      setError('未找到 bazaarplusplus.db，请选择包含该文件的 BazaarPlusPlus 目录')
      setDbFile(null)
      setReplayFiles([])
      setSummary(null)
      setAnalyzing(false)
      return
    }
    if (replays.length === 0) {
      setError('未找到 CombatReplays/*.payload.json，请选择完整目录')
      setDbFile(null)
      setReplayFiles([])
      setSummary(null)
      setAnalyzing(false)
      return
    }
    setAnalysisText('解析数据库中的上传者信息...')
    const identity = await extractIdentityFromDbFile(db)
    if (identity?.userId) {
      onResolveIdentity?.(identity)
    }
    const battleIds = new Set<string>()
    const idMap: Record<string, string> = {}
    const validBattleId = /^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const cap = Math.min(replays.length, 800)
    for (let i = 0; i < cap; i += 1) {
      const file = replays[i]
      setAnalysisText(`分析回放中 ${i + 1}/${cap}: ${file.name}`)
      try {
        const text = await file.text()
        const obj = JSON.parse(text)
        const bid = String(obj?.BattleId || '').trim()
        if (bid && validBattleId.test(bid)) {
          battleIds.add(bid)
          idMap[file.webkitRelativePath || file.name] = bid
        }
      } catch {
        // ignore invalid json
      }
      setAnalysisProgress(((i + 1) / cap) * 100)
      if ((i + 1) % 8 === 0) await sleepFrame()
    }
    let existedSet = new Set<string>()
    if (battleIds.size > 0) {
      try {
        const res = await fetch('/api/match-upload/dedupe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ battleIds: Array.from(battleIds) }),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.error || '查重接口异常')
        }
        if (Array.isArray(data?.existingBattleIds)) {
          existedSet = new Set((data.existingBattleIds as any[]).map((x) => String(x || '').trim()).filter(Boolean))
        }
      } catch (e: any) {
        const msg = `查重失败：${e?.message || '请检查 Supabase Service Role 和索引表'}`
        setError(msg)
        setAnalysisText(msg)
        setAnalyzing(false)
        onToast?.(msg, 'error')
        return
      }
    }

    const totalBytes = db.size + replays.reduce((acc, f) => acc + f.size, 0)
    setDbFile(db)
    setReplayFiles(replays)
    setBattleIdByPath(idMap)
    setExistingBattleIds(existedSet)
    setSummary({
      rootFolder,
      dbName: db.name,
      replayCount: replays.length,
      selectedCount: 1 + replays.length,
      totalBytes,
      battleIdCount: battleIds.size,
      duplicateCount: existedSet.size,
      newCount: Math.max(0, battleIds.size - existedSet.size),
    })
    setDedupeReady(true)
    setAnalysisText(`分析完成：${battleIds.size} 个唯一 BattleId，重复 ${existedSet.size} 个`)
    setAnalyzing(false)
    onToast?.(`已识别 ${replays.length} 个 PVP 回放文件`, 'success')
  }

  const handleUpload = async () => {
    if (!dbFile || replayFiles.length === 0 || !summary) return
    setError('')
    setWorking(true)
    setUploadProgress(0)
    setUploadText('准备压缩与上传...')
    try {
      const uid = userId || ''
      const uploaderSeg = `${uploaderName || ''}${uploaderName && uid ? '_' : ''}${uid}`.trim() || 'guest'
      const folder = `match-db-upload/${uploaderSeg}`
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const baseFolder = `match-db-upload/${uploaderSeg}/${ts}`
      const replayNewFiles = replayFiles.filter((file) => {
        const p = file.webkitRelativePath || file.name
        const bid = battleIdByPath[p]
        return !bid || !existingBattleIds.has(bid)
      })
      const total = 1 + replayNewFiles.length + 1 // db + replay(new) + manifest
      let done = 0
      const uploadedReplayMeta: Array<{ battleId: string; r2Key: string }> = []

      const dbGz = await gzipBlob(dbFile)
      await uploadOne(
        {
          key: `db-${dbFile.name}`,
          fileName: `${dbFile.name}.gz`,
          relPath: `${baseFolder}/${dbFile.webkitRelativePath || dbFile.name}`,
          category: 'db',
          blob: dbGz,
          contentType: 'application/gzip',
        },
        folder
      )
      done += 1
      setUploadProgress((done / total) * 100)
      setUploadText(`已上传 DB (${done}/${total})`)

      for (let i = 0; i < replayNewFiles.length; i += 1) {
        const file = replayNewFiles[i]
        setUploadText(`压缩并上传回放 ${i + 1}/${replayNewFiles.length}: ${file.name}`)
        const gz = await gzipBlob(file)
        const put = await uploadOne(
          {
            key: `replay-${file.name}-${file.size}`,
            fileName: `${file.name}.gz`,
            relPath: `${baseFolder}/${file.webkitRelativePath || file.name}`,
            category: 'replay',
            blob: gz,
            contentType: 'application/gzip',
          },
          folder
        )
        const p = file.webkitRelativePath || file.name
        const battleId = battleIdByPath[p]
        if (battleId) {
          uploadedReplayMeta.push({ battleId, r2Key: put.key })
        }
        done += 1
        setUploadProgress((done / total) * 100)
        if ((i + 1) % 5 === 0) await sleepFrame()
      }

      const manifest = {
        schema: 'match-db-upload/v1',
        uploadedAt: new Date().toISOString(),
        sourceUserId: uid || null,
        sourceUsername: uploaderName || null,
        summary,
      }
      const manifestPut = await uploadOne(
        {
          key: 'manifest',
          fileName: 'manifest.json',
          relPath: `${baseFolder}/${summary.rootFolder}/manifest.json`,
          category: 'manifest',
          blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
          contentType: 'application/json',
        },
        folder
      )
      done += 1
      setUploadProgress((done / total) * 100)
      setUploadText('上传完成')

      if (uploadedReplayMeta.length > 0) {
        const regRes = await fetch('/api/match-upload/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entries: uploadedReplayMeta.map((x) => ({
              battleId: x.battleId,
              sourceUserId: uid || null,
              r2Key: x.r2Key,
              manifestKey: manifestPut.key,
            })),
          }),
        })
        const regData = await regRes.json().catch(() => ({}))
        if (!regRes.ok) {
          throw new Error(regData?.error || '索引登记失败')
        }

        setUploadText('索引登记完成，正在自动解析对局...')
        const processRes = await fetch('/api/match-upload/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'auto-after-upload' }),
        })
        const processData = await processRes.json().catch(() => ({}))
        if (!processRes.ok) {
          const msg = processData?.error || '自动解析失败'
          throw new Error(msg)
        }
        const parsed = processData?.parsed || {}
        const upsertedRuns = Number(parsed?.runsUpserted || 0)
        setUploadText(`自动解析完成，新增/更新对局 ${upsertedRuns} 条`)
      }

      setUploaded({ total, folder })
      onToast?.(`上传完成，新上传回放 ${replayNewFiles.length}，跳过重复 ${replayFiles.length - replayNewFiles.length}`, 'success')
    } catch (e: any) {
      const msg = e?.message || '上传失败'
      setError(msg)
      onToast?.(msg, 'error')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.title}>对局文件上传（Beta）</div>
      <div className={styles.sub}>
        请选择包含 <span className={styles.mono}>bazaarplusplus.db</span> 与
        <span className={styles.mono}> CombatReplays/*.payload.json</span> 的目录。前端会先 gzip 压缩后上传到 R2。
      </div>
      <div className={styles.row}>
        <button
          className={styles.btn}
          disabled={working}
          onClick={() => inputRef.current?.click()}
        >
          选择 BazaarPlusPlus 文件夹
        </button>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={!canUpload}
          onClick={handleUpload}
        >
          开始压缩并上传
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => handlePickFolder(e.target.files)}
          {...({ webkitdirectory: 'true', directory: 'true' } as any)}
        />
      </div>

      {summary && (
        <div className={styles.summary}>
          <div className={styles.item}>目录：{summary.rootFolder}</div>
          <div className={styles.item}>DB：{summary.dbName}</div>
          <div className={styles.item}>回放文件：{summary.replayCount}</div>
          <div className={styles.item}>唯一 BattleId：{summary.battleIdCount}</div>
          <div className={styles.item}>重复 BattleId：{summary.duplicateCount}</div>
          <div className={styles.item}>新增 BattleId：{summary.newCount}</div>
          <div className={styles.item}>预计上传文件数：{summary.newCount + 2}（DB + 新回放 + manifest）</div>
          <div className={styles.item}>原始体积：{formatBytes(summary.totalBytes)}</div>
        </div>
      )}

      {(analyzing || analysisProgress > 0) && (
        <div className={styles.phaseBlock}>
          <div className={styles.phaseTitle}>分析进度 {analysisProgress.toFixed(0)}%</div>
          <div className={styles.progressBar}>
            <div className={`${styles.progressFill} ${styles.progressFillAnalyze}`} style={{ width: analysisWidth }} />
          </div>
          {analysisText && <div className={styles.meta}>{analysisText}</div>}
        </div>
      )}

      {(working || uploadProgress > 0) && (
        <div className={styles.phaseBlock}>
          <div className={styles.phaseTitle}>上传进度 {uploadProgress.toFixed(0)}%</div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: uploadWidth }} />
          </div>
          {uploadText && <div className={styles.meta}>{uploadText}</div>}
          <div className={styles.meta}>支持切到后台标签页继续上传（关闭页面会中断）</div>
        </div>
      )}

      {!working && uploaded.total > 0 && (
        <div className={styles.meta}>
          已上传 {uploaded.total} 个文件，R2 路径前缀：
          <span className={styles.mono}> {uploaded.folder}</span>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </div>
  )
}
