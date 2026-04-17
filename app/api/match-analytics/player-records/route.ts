import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabaseClient'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { gunzipSync } from 'zlib'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type RunRow = {
  run_id: string
  player_account_id: string | null
  player_name: string | null
  hero: string | null
  started_at_utc: string | null
  ended_at_utc: string | null
  final_day: number | null
  victories: number | null
  losses: number | null
  status: string | null
  source_r2_key: string | null
}

type BattleCard = {
  template_id: string
  name_cn: string
  name_en: string
  image: string
  size: string
}

type BattleRow = {
  id: string
  dayIndex: number
  result: 'win' | 'lose'
  screenshotUrl: string
  battleTime: string
  duration: number | null
  selfCards: BattleCard[]
  enemyCards: BattleCard[]
}

function clampLimit(raw: string | null): number {
  const n = Number(raw || 10)
  if (!Number.isFinite(n)) return 10
  return Math.max(1, Math.min(20, Math.floor(n)))
}

function asObj(input: any): Record<string, any> {
  return input && typeof input === 'object' ? input : {}
}

function pickFirstNonEmptyString(...values: any[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function normalizeHandItems(raw: any): any[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  const obj = asObj(raw)
  if (Array.isArray(obj.items)) return obj.items
  if (Array.isArray(obj.Items)) return obj.Items
  if (Array.isArray(obj.cards)) return obj.cards
  if (Array.isArray(obj.Cards)) return obj.Cards
  if (Array.isArray(obj.slots)) return obj.slots
  return []
}

function parseCardsFromHandJson(rawJson: any): BattleCard[] {
  if (!rawJson) return []
  try {
    const obj = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson
    const items = normalizeHandItems(obj)
    return items
      .map((x: any) => ({
        template_id: pickFirstNonEmptyString(
          x?.template_id,
          x?.templateId,
          x?.item?.template_id,
          x?.item?.templateId,
          x?.id,
          x?.item?.id,
        ),
        name_cn: pickFirstNonEmptyString(x?.name_cn, x?.nameCN, x?.item?.name_cn, x?.item?.nameCN),
        name_en: pickFirstNonEmptyString(
          x?.name,
          x?.name_en,
          x?.item?.name,
          x?.item?.name_en,
          x?.display_name,
          x?.display_name_en,
        ),
        image: '',
        size: pickFirstNonEmptyString(x?.size, x?.item?.size, x?.slot_size),
      }))
      .filter((x: BattleCard) => !!x.template_id)
  } catch {
    return []
  }
}

function quoteSqlString(input: string): string {
  return `'${String(input || '').replace(/'/g, "''")}'`
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function makeR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) return null
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

async function loadBattlesByRunFromDbKey(
  s3: S3Client,
  bucket: string,
  dbKey: string,
  runIds: string[],
): Promise<Record<string, BattleRow[]>> {
  const out: Record<string, BattleRow[]> = {}
  if (!dbKey || runIds.length === 0) return out

  const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: dbKey }))
  const gz = await streamToBuffer(got.Body)
  const dbBytes = gunzipSync(gz)

  const dynamicImport = new Function('u', 'return import(u)') as (u: string) => Promise<any>
  const sqlModule = await dynamicImport('sql.js/dist/sql-wasm.js')
  const initSqlJs = (sqlModule as any).default
  const SQL = await initSqlJs({
    locateFile: (f: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', f),
  })
  const db = new SQL.Database(new Uint8Array(dbBytes))
  try {
    const inClause = runIds.map((id) => quoteSqlString(id)).join(',')
    const sql = `
      select
        battle_id,
        run_id,
        day,
        hour,
        recorded_at_utc,
        result,
        player_hand_json,
        opponent_hand_json
      from pvp_battles
      where run_id in (${inClause})
      order by run_id, day asc, hour asc, recorded_at_utc asc
    `
    const ret = db.exec(sql)
    const rows = ret?.[0]?.values || []
    const cols = ret?.[0]?.columns || []
    const idx = Object.fromEntries(cols.map((c: string, i: number) => [c, i]))

    for (const row of rows) {
      const runId = String(row[idx.run_id] || '').trim()
      if (!runId) continue
      if (!out[runId]) out[runId] = []
      const selfCards = parseCardsFromHandJson(row[idx.player_hand_json])
      const enemyCards = parseCardsFromHandJson(row[idx.opponent_hand_json])
      const result = String(row[idx.result] || '').toLowerCase() === 'win' ? 'win' : 'lose'
      out[runId].push({
        id: String(row[idx.battle_id] || '').trim() || `${runId}-${out[runId].length + 1}`,
        dayIndex: Number(row[idx.day] || 0) || 0,
        result,
        screenshotUrl: '',
        battleTime: String(row[idx.recorded_at_utc] || '').trim(),
        duration: null,
        selfCards,
        enemyCards,
      })
    }
  } finally {
    db.close()
  }
  return out
}

export async function GET(request: NextRequest) {
  const service = createSupabaseServiceClient()
  if (!service) return NextResponse.json({ error: 'Supabase Service Role 未配置' }, { status: 500 })
  const s3 = makeR2Client()
  const bucket = process.env.R2_BUCKET || ''
  if (!s3 || !bucket) {
    return NextResponse.json({ error: 'R2 配置缺失，无法读取 db.gz' }, { status: 500 })
  }

  try {
    const { searchParams } = request.nextUrl
    const q = String(searchParams.get('q') || '').trim()
    const limit = clampLimit(searchParams.get('limit'))
    if (!q) return NextResponse.json({ matches: [], count: 0, totalMatched: 0, query: '' })

    const looksLikeUserId = /^[0-9a-f-]{8,}$/i.test(q)
    let runQuery = service
      .from('community_bpp_runs')
      .select(
        'run_id,player_account_id,player_name,hero,started_at_utc,ended_at_utc,final_day,victories,losses,status,source_r2_key',
      )
      .order('ended_at_utc', { ascending: false, nullsFirst: false })
      .limit(60)

    if (looksLikeUserId) {
      runQuery = runQuery.eq('player_account_id', q)
    } else {
      runQuery = runQuery.or(`player_name.ilike.%${q}%,player_account_id.ilike.%${q}%`)
    }

    const runRes = await runQuery
    if (runRes.error) throw runRes.error
    const runs = (runRes.data || []) as RunRow[]
    if (runs.length === 0) {
      return NextResponse.json({ matches: [], count: 0, totalMatched: 0, query: q })
    }

    const limitedRuns = runs.slice(0, limit)
    const dbKeyToRunIds = new Map<string, string[]>()
    for (const r of limitedRuns) {
      const key = String(r.source_r2_key || '').trim()
      const runId = String(r.run_id || '').trim()
      if (!key || !runId) continue
      const list = dbKeyToRunIds.get(key) || []
      list.push(runId)
      dbKeyToRunIds.set(key, list)
    }

    const runBattlesMap: Record<string, BattleRow[]> = {}
    for (const [dbKey, runIds] of Array.from(dbKeyToRunIds.entries())) {
      const partial = await loadBattlesByRunFromDbKey(s3, bucket, dbKey, Array.from(new Set(runIds)))
      Object.assign(runBattlesMap, partial)
    }

    const matches = limitedRuns.map((r) => {
      const runId = String(r.run_id || '').trim()
      const battles = [...(runBattlesMap[runId] || [])].sort((a, b) => {
        if (b.dayIndex !== a.dayIndex) return b.dayIndex - a.dayIndex
        return String(b.battleTime || '').localeCompare(String(a.battleTime || ''))
      })
      const latest = battles[0] || null
      const wins = Math.max(0, Number(r.victories || 0))
      const losses = Math.max(0, Number(r.losses || 0))
      const finalDay = Math.max(Number(r.final_day || 0), wins + losses, latest?.dayIndex || 0)
      return {
        key: `run:${runId}`,
        matchId: runId,
        authorUserId: String(r.player_account_id || '').trim(),
        authorName: String(r.player_name || '').trim() || '匿名',
        hero: String(r.hero || '').trim() || 'Unknown',
        playedOn: String(r.ended_at_utc || r.started_at_utc || '').trim(),
        createdAt: String(r.ended_at_utc || r.started_at_utc || '').trim(),
        startTime: String(r.started_at_utc || '').trim(),
        endTime: String(r.ended_at_utc || '').trim(),
        isFinished: String(r.status || '').toLowerCase() === 'completed',
        matchVictory: wins >= 10,
        wins,
        losses,
        flow: [...battles]
          .sort((a, b) => a.dayIndex - b.dayIndex)
          .map((b) => b.result),
        finalDay,
        finalSelfCards: latest ? latest.selfCards : [],
        finalEnemyCards: latest ? latest.enemyCards : [],
        battles,
      }
    })

    return NextResponse.json({
      matches,
      count: matches.length,
      totalMatched: runs.length,
      query: q,
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || '读取玩家对局失败') }, { status: 500 })
  }
}
