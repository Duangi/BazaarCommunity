'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { cdnUrl } from '@/lib/cdn'
import HorizontalCardStrip from '@/components/common/HorizontalCardStrip'
import styles from './BattleSnapshotViewer.module.css'

type SnapshotItem = {
  instance_id?: string
  template_id?: string
  type?: string
  size?: string
  section?: string
  socket?: string
  name?: string
  tier?: string
  enchant?: string
  tags?: string[]
  attributes?: Record<string, any>
}

type SnapshotContainer = {
  items?: SnapshotItem[]
  source?: string
  status?: string
}

type PvpBattle = {
  battle_id: string
  recorded_at_utc?: string
  run_id?: string
  day?: number
  hour?: number
  combat_kind?: string
  result?: string
  player_name?: string
  player_account_id?: string
  opponent_name?: string
  opponent_account_id?: string
  player_hand?: SnapshotContainer
  opponent_hand?: SnapshotContainer
  player_skills?: SnapshotContainer
  opponent_skills?: SnapshotContainer
  [k: string]: any
}

type RunIndexItem = {
  runId: string
  basePath: string
  files: {
    meta: string
    status: string
    checkpoint: string
    events: string
    decisionChain: string
    pvpBattles: string
  }
}

type SnapshotIndex = {
  runs: RunIndexItem[]
  globalFiles?: {
    pvpBattles?: string
  }
}

type LoadedRun = {
  runId: string
  basePath: string
  meta: any | null
  status: any | null
  checkpoint: any | null
  events: any[]
  decisionChain: any[]
  pvpBattles: PvpBattle[]
}

function parseNdjson(text: string): any[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

async function fetchJson(path: string): Promise<any | null> {
  const res = await fetch(path, { cache: 'no-store' })
  if (!res.ok) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

async function fetchNdjson(path: string): Promise<any[]> {
  const res = await fetch(path, { cache: 'no-store' })
  if (!res.ok) return []
  const text = await res.text()
  return parseNdjson(text)
}

function itemImageByTemplate(templateId?: string): string {
  const id = String(templateId || '').trim()
  if (!id) return ''
  return cdnUrl(`images/card/${id}.webp`)
}

function getImageCandidatesByTemplate(templateId?: string): string[] {
  const id = String(templateId || '').trim()
  if (!id) return []
  return [
    cdnUrl(`images/card/${id}.webp`),
    cdnUrl(`images/skill/${id}.webp`),
    cdnUrl(`images/${id}.webp`),
  ]
}

function renderContainer(
  title: string,
  container: SnapshotContainer | undefined,
  sideKey: string,
  forceMedium = false
) {
  const items = container?.items || []
  return (
    <div>
      <div className={styles.groupTitle}>
        {title} · source={container?.source || '-'} · status={container?.status || '-'} · count={items.length}
      </div>
      {items.length === 0 ? (
        <div className={styles.empty}>无数据</div>
      ) : (
        <>
          <HorizontalCardStrip
            scale={1.25}
            cards={items.map((it, idx) => ({
              key: `${sideKey}-${title}-${it.instance_id || it.template_id || idx}`,
              name: it.name || it.template_id || 'item',
              size: forceMedium ? 'Medium' : it.size || 'Medium',
              tooltip: `${it.name || it.template_id || 'item'} · ${it.tier || '-'} · ${it.enchant || '无附魔'}`,
              imageSrc: itemImageByTemplate(it.template_id),
              imageSrcCandidates: getImageCandidatesByTemplate(it.template_id),
            }))}
          />
          <details className={styles.detailWrap}>
            <summary className={styles.groupTitle}>展开详细字段</summary>
            <div className={styles.itemGrid}>
              {items.map((item, idx) => {
                const attrEntries = Object.entries(item.attributes || {})
                return (
                  <div key={`${sideKey}-${title}-detail-${item.instance_id || item.template_id || idx}`} className={styles.itemMetaCard}>
                    <div className={styles.itemName}>{item.name || '(unknown item)'}</div>
                    <div className={styles.itemMeta}>
                      {item.tier || '-'} · {item.enchant || '无附魔'} · {forceMedium ? 'Medium' : item.size || '-'}
                    </div>
                    <div className={styles.itemMeta}>
                      socket: {item.socket || '-'} · section: {item.section || '-'}
                    </div>
                    <div className={styles.itemMeta}>template: {item.template_id || '-'}</div>
                    <div className={styles.itemMeta}>instance: {item.instance_id || '-'}</div>
                    <div className={styles.itemMeta}>tags: {(item.tags || []).join(', ') || '-'}</div>
                    <details>
                      <summary className={styles.groupTitle}>属性 ({attrEntries.length})</summary>
                      <ul className={styles.attrs}>
                        {attrEntries.map(([k, v]) => (
                          <li key={`${sideKey}-${title}-${idx}-${k}`}>
                            <strong>{k}</strong>: {String(v)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                )
              })}
            </div>
          </details>
        </>
      )}
    </div>
  )
}

export default function BattleSnapshotViewer() {
  const [runs, setRuns] = useState<LoadedRun[]>([])
  const [globalBattles, setGlobalBattles] = useState<PvpBattle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const index = await fetchJson('/resources/battle_snapshots/index.json')
        if (!index || !Array.isArray(index.runs)) {
          throw new Error('缺少 index.json 或结构不合法')
        }
        const parsed = index as SnapshotIndex
        const loadedRuns = await Promise.all(
          parsed.runs.map(async (run): Promise<LoadedRun> => {
            const base = run.basePath.replace(/\/+$/, '')
            const [meta, status, checkpoint, events, decisionChain, pvpBattles] = await Promise.all([
              fetchJson(`${base}/${run.files.meta}`),
              fetchJson(`${base}/${run.files.status}`),
              fetchJson(`${base}/${run.files.checkpoint}`),
              fetchNdjson(`${base}/${run.files.events}`),
              fetchNdjson(`${base}/${run.files.decisionChain}`),
              fetchNdjson(`${base}/${run.files.pvpBattles}`),
            ])
            return {
              runId: run.runId,
              basePath: base,
              meta,
              status,
              checkpoint,
              events,
              decisionChain,
              pvpBattles: (pvpBattles as PvpBattle[]) || [],
            }
          })
        )
        let global: PvpBattle[] = []
        if (parsed.globalFiles?.pvpBattles) {
          global = (await fetchNdjson(parsed.globalFiles.pvpBattles)) as PvpBattle[]
        }
        if (!cancelled) {
          setRuns(loadedRuns)
          setGlobalBattles(global)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const totalBattles = useMemo(
    () => runs.reduce((acc, run) => acc + (run.pvpBattles?.length || 0), 0),
    [runs]
  )

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>战斗快照测试版</h1>
            <p className={styles.subtitle}>
              Run 数量: {runs.length} · Battle 总数: {totalBattles} · 全局快照: {globalBattles.length}
            </p>
          </div>
          <Link href="/" className={styles.backLink}>
            返回首页
          </Link>
        </div>

        {loading ? <div className={styles.empty}>加载中...</div> : null}
        {error ? <div className={styles.empty}>加载失败：{error}</div> : null}

        {globalBattles.length > 0 ? (
          <details className={styles.runCard}>
            <summary className={styles.battleTitle}>全局 pvp_battles.ndjson（{globalBattles.length} 条）</summary>
            <div className={styles.jsonWrap}>
              <pre className={styles.jsonPre}>{JSON.stringify(globalBattles, null, 2)}</pre>
            </div>
          </details>
        ) : null}

        {runs.map((run) => (
          <div key={run.runId} className={styles.runCard}>
            <h2 className={styles.battleTitle}>Run: {run.runId}</h2>
            <div className={styles.runMeta}>
              <div>hero: {run.meta?.hero || '-'}</div>
              <div>mode: {run.meta?.game_mode || '-'}</div>
              <div>status: {run.status?.status || run.meta?.status || '-'}</div>
              <div>victories/losses: {run.status?.victories ?? '-'} / {run.status?.losses ?? '-'}</div>
              <div>final day/hour: {run.status?.final_day ?? '-'} / {run.status?.final_hour ?? '-'}</div>
              <div>events: {run.events.length} · decisions: {run.decisionChain.length} · battles: {run.pvpBattles.length}</div>
            </div>

            <div className={styles.battleList}>
              {run.pvpBattles.map((battle, idx) => {
                const result = String(battle.result || '').toLowerCase()
                const win = result === 'win'
                return (
                  <div key={battle.battle_id || `${run.runId}-${idx}`} className={styles.battleCard}>
                    <div className={styles.battleHeader}>
                      <h3 className={styles.battleTitle}>
                        Day {battle.day ?? '-'} · Hour {battle.hour ?? '-'} · {battle.combat_kind || 'PVPCombat'}
                      </h3>
                      <div className={win ? styles.resultWin : styles.resultLoss}>
                        {battle.result || '-'} · vs {battle.opponent_name || '-'}
                      </div>
                    </div>
                    <div className={styles.itemMeta}>
                      battle_id={battle.battle_id} · ts={battle.recorded_at_utc || '-'}
                    </div>
                    <div className={styles.pairGrid}>
                      <div className={styles.sideCard}>
                        <h4 className={styles.sideTitle}>
                          我方：{battle.player_name || '-'} ({battle.player_account_id || '-'})
                        </h4>
                        {renderContainer('物品', battle.player_hand, `player-hand-${battle.battle_id}`)}
                        {renderContainer('技能', battle.player_skills, `player-skills-${battle.battle_id}`, true)}
                      </div>
                      <div className={styles.sideCard}>
                        <h4 className={styles.sideTitle}>
                          对手：{battle.opponent_name || '-'} ({battle.opponent_account_id || '-'})
                        </h4>
                        {renderContainer('物品', battle.opponent_hand, `enemy-hand-${battle.battle_id}`)}
                        {renderContainer('技能', battle.opponent_skills, `enemy-skills-${battle.battle_id}`, true)}
                      </div>
                    </div>
                    <details className={styles.jsonWrap}>
                      <summary className={styles.groupTitle}>查看本场原始 JSON</summary>
                      <pre className={styles.jsonPre}>{JSON.stringify(battle, null, 2)}</pre>
                    </details>
                  </div>
                )
              })}
              {run.pvpBattles.length === 0 ? <div className={styles.empty}>该 Run 暂无 pvp battle</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
