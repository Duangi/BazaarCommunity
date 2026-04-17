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
  size: string
}

type BattleRow = {
  runId: string
  dayIndex: number
  battleTime: string
  selfCards: BattleCard[]
}

type MockFinalRow = {
  run_id: string
  final_day: number | null
  cards: any
}

function clampLimit(raw: string | null): number {
  const n = Number(raw || 40)
  if (!Number.isFinite(n)) return 40
  return Math.max(1, Math.min(120, Math.floor(n)))
}

function asObj(input: any): Record<string, any> {
  return input && typeof input === 'object' ? input : {}
}

function pickFirst(...values: any[]): string {
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
        template_id: pickFirst(
          x?.template_id,
          x?.templateId,
          x?.item?.template_id,
          x?.item?.templateId,
          x?.id,
          x?.item?.id,
        ),
        name_cn: pickFirst(x?.name_cn, x?.nameCN, x?.item?.name_cn, x?.item?.nameCN),
        name_en: pickFirst(
          x?.name,
          x?.name_en,
          x?.item?.name,
          x?.item?.name_en,
          x?.display_name,
          x?.display_name_en,
        ),
        size: pickFirst(x?.size, x?.item?.size, x?.slot_size),
      }))
      .filter((x: BattleCard) => !!x.template_id)
  } catch {
    return []
  }
}

function parseCardsFromJsonArray(raw: any): BattleCard[] {
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : []
  return arr
    .map((x: any) => ({
      template_id: pickFirst(x?.template_id, x?.templateId, x?.id),
      name_cn: pickFirst(x?.name_cn, x?.nameCN),
      name_en: pickFirst(x?.name_en, x?.name, x?.title),
      size: pickFirst(x?.size),
    }))
    .filter((x: BattleCard) => !!x.template_id)
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

async function loadFinalBattleByRunFromDbKey(
  s3: S3Client,
  bucket: string,
  dbKey: string,
  runIds: string[],
): Promise<Record<string, BattleRow | null>> {
  const out: Record<string, BattleRow | null> = {}
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
      select run_id, day, hour, recorded_at_utc, player_hand_json
      from pvp_battles
      where run_id in (${inClause})
      order by run_id, day desc, hour desc, recorded_at_utc desc
    `
    const ret = db.exec(sql)
    const rows = ret?.[0]?.values || []
    const cols = ret?.[0]?.columns || []
    const idx = Object.fromEntries(cols.map((c: string, i: number) => [c, i]))

    const seen = new Set<string>()
    for (const row of rows) {
      const runId = String(row[idx.run_id] || '').trim()
      if (!runId || seen.has(runId)) continue
      seen.add(runId)
      out[runId] = {
        runId,
        dayIndex: Number(row[idx.day] || 0) || 0,
        battleTime: String(row[idx.recorded_at_utc] || '').trim(),
        selfCards: parseCardsFromHandJson(row[idx.player_hand_json]),
      }
    }
    for (const rid of runIds) {
      if (!(rid in out)) out[rid] = null
    }
  } finally {
    db.close()
  }
  return out
}

async function loadMockFinalMap(service: any): Promise<Record<string, BattleRow>> {
  const out: Record<string, BattleRow> = {}
  const { data, error } = await service
    .from('community_bpp_mock_run_finals')
    .select('run_id,final_day,cards')
    .limit(5000)
  if (error) {
    if (String((error as any)?.code || '') === 'PGRST205') return out
    throw error
  }
  for (const row of (data || []) as MockFinalRow[]) {
    const runId = String(row.run_id || '').trim()
    if (!runId) continue
    out[runId] = {
      runId,
      dayIndex: Math.max(1, Number(row.final_day || 1)),
      battleTime: '',
      selfCards: parseCardsFromJsonArray(row.cards),
    }
  }
  return out
}

export async function GET(request: NextRequest) {
  const service = createSupabaseServiceClient()
  if (!service) return NextResponse.json({ error: 'Supabase Service Role 未配置' }, { status: 500 })
  const s3 = makeR2Client()
  const bucket = process.env.R2_BUCKET || ''

  try {
    const limit = clampLimit(request.nextUrl.searchParams.get('limit'))
    const { data, error } = await service
      .from('community_bpp_runs')
      .select('run_id,player_account_id,player_name,hero,ended_at_utc,final_day,victories,losses,status,source_r2_key')
      .order('ended_at_utc', { ascending: false, nullsFirst: false })
      .limit(limit * 2)
    if (error) throw error

    const rows = (data || []) as RunRow[]
    if (rows.length === 0) return NextResponse.json({ items: [], count: 0 })

    const dbKeyToRunIds = new Map<string, string[]>()
    for (const r of rows) {
      const dbKey = String(r.source_r2_key || '').trim()
      const runId = String(r.run_id || '').trim()
      if (!dbKey || !runId) continue
      if (dbKey.startsWith('mock://')) continue
      const list = dbKeyToRunIds.get(dbKey) || []
      list.push(runId)
      dbKeyToRunIds.set(dbKey, list)
    }

    const finalBattleMap: Record<string, BattleRow | null> = {}
    if (s3 && bucket) {
      for (const [dbKey, runIds] of Array.from(dbKeyToRunIds.entries())) {
        const partial = await loadFinalBattleByRunFromDbKey(s3, bucket, dbKey, Array.from(new Set(runIds)))
        Object.assign(finalBattleMap, partial)
      }
    }

    const mockFinalMap = await loadMockFinalMap(service)
    for (const [runId, row] of Object.entries(mockFinalMap)) {
      if (!(runId in finalBattleMap)) finalBattleMap[runId] = row
    }

    const items = rows
      .map((r) => {
        const runId = String(r.run_id || '').trim()
        const finalBattle = finalBattleMap[runId]
        if (!finalBattle || finalBattle.selfCards.length === 0) return null
        return {
          id: `bpp-${runId}`,
          runId,
          name: `${String(r.hero || 'Unknown').trim() || 'Unknown'} Day1-Day${Math.max(Number(r.final_day || 0), Number(r.victories || 0) + Number(r.losses || 0), finalBattle.dayIndex || 0)}`,
          authorUserId: String(r.player_account_id || '').trim(),
          authorName: String(r.player_name || '').trim() || '匿名',
          hero: String(r.hero || '').trim() || 'Unknown',
          publishedAt: String(r.ended_at_utc || '').trim(),
          dayFrom: 1,
          dayTo: Math.max(Number(r.final_day || 0), Number(r.victories || 0) + Number(r.losses || 0), finalBattle.dayIndex || 0),
          likes: 0,
          rating: 0,
          cards: finalBattle.selfCards,
          status: String(r.status || '').trim(),
          wins: Number(r.victories || 0),
          losses: Number(r.losses || 0),
        }
      })
      .filter(Boolean)
      .slice(0, limit)

    return NextResponse.json({
      items,
      count: items.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || '读取单卡阵容失败') }, { status: 500 })
  }
}
