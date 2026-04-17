import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type LookupRecord = {
  template_id: string
  combo_signature: string
  layout_signature: string
  hero: string
  day: number
  rating_bucket: string
  matches: number
  wins: number
  win_rate: number
}

type LookupLineup = {
  layout_signature: string
  combo_signature: string
  cards: Array<{ slot_index: number; template_id: string; tier?: number; enchant_code?: string | null }>
}

type AliasState = {
  byKey: Map<string, string[]>
  byName: Map<string, string[]>
  loadedAt: number
}

let aliasState: AliasState | null = null
const JSON_CACHE_TTL = 3 * 60 * 1000
const jsonCache = new Map<string, { expiresAt: number; value: any | null }>()

function parseCards(raw: string | null): string[] {
  return String(raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

function normalizeKey(v: unknown): string {
  return String(v || '').trim().toLowerCase()
}

function looksLikeCardId(v: string): boolean {
  const s = String(v || '').trim()
  if (!s) return false
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(s)) return true
  return /^[a-z0-9]{12,}$/i.test(s)
}

function uniq(list: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of list) {
    const k = String(x || '').trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

async function loadAliasState(): Promise<AliasState> {
  const now = Date.now()
  if (aliasState && now - aliasState.loadedAt < 5 * 60 * 1000) return aliasState

  const byKey = new Map<string, string[]>()
  const byName = new Map<string, string[]>()
  try {
    const p = path.join(process.cwd(), 'public', 'resources', 'json', 'resolved_text_map.json')
    const text = await fs.readFile(p, 'utf8')
    const json = JSON.parse(text)
    if (json && typeof json === 'object') {
      const groups = new Map<string, Set<string>>()
      for (const [rawKey, rawVal] of Object.entries(json as Record<string, any>)) {
        const k = String(rawKey || '').trim()
        const val = rawVal || {}
        const cn = normalizeKey(val.name_cn)
        const en = normalizeKey(val.name_en)
        const groupKey = cn || en
        if (!groupKey) continue
        const set = groups.get(groupKey) || new Set<string>()
        if (looksLikeCardId(k)) set.add(k)
        groups.set(groupKey, set)
      }
      for (const [groupKey, set] of Array.from(groups.entries())) {
        const ids = uniq(Array.from(set.values()))
        if (ids.length === 0) continue
        byName.set(groupKey, ids)
        for (const id of ids) {
          byKey.set(normalizeKey(id), ids)
        }
      }
    }
  } catch {
    // Ignore alias file errors; query path will still work for direct IDs.
  }

  aliasState = { byKey, byName, loadedAt: now }
  return aliasState
}

function resolveCardCandidates(input: string, aliases: AliasState): string[] {
  const raw = String(input || '').trim()
  const out: string[] = []
  if (raw) out.push(raw)

  const keyHit = aliases.byKey.get(normalizeKey(raw))
  if (keyHit) out.push(...keyHit)

  const nameHit = aliases.byName.get(normalizeKey(raw))
  if (nameHit) out.push(...nameHit)

  return uniq(out)
}

function parseLimit(raw: string | null): number {
  const n = Number(raw || 50)
  if (!Number.isFinite(n)) return 50
  return Math.max(1, Math.min(200, Math.floor(n)))
}

function num(raw: string | null, fallback: number): number {
  const n = Number(raw || fallback)
  if (!Number.isFinite(n)) return fallback
  return n
}

function bySort(a: LookupRecord, b: LookupRecord, sort: 'hot' | 'win_rate') {
  if (sort === 'win_rate') {
    const d = (Number(b.win_rate || 0) - Number(a.win_rate || 0))
    if (d !== 0) return d
  }
  const d2 = (Number(b.matches || 0) - Number(a.matches || 0))
  if (d2 !== 0) return d2
  return Number(b.wins || 0) - Number(a.wins || 0)
}

function applyFilters(
  rows: LookupRecord[],
  hero: string,
  dayMin: number,
  dayMax: number,
  ratingBuckets: Set<string>,
) {
  return rows.filter((r) => {
    if (hero && String(r.hero || '') !== hero) return false
    const d = Number(r.day || 0)
    if (dayMin > 0 && d < dayMin) return false
    if (dayMax > 0 && d > dayMax) return false
    if (ratingBuckets.size > 0 && !ratingBuckets.has(String(r.rating_bucket || ''))) return false
    return true
  })
}

async function loadJsonSafe(url: string) {
  const now = Date.now()
  const hit = jsonCache.get(url)
  if (hit && hit.expiresAt > now) return hit.value
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      jsonCache.set(url, { expiresAt: now + JSON_CACHE_TTL, value: null })
      return null
    }
    const value = await res.json()
    jsonCache.set(url, { expiresAt: now + JSON_CACHE_TTL, value })
    return value
  } catch {
    jsonCache.set(url, { expiresAt: now + 20_000, value: null })
    return null
  }
}

function combineR2Records(cardRecordsList: LookupRecord[][], mode: 'and' | 'or'): LookupRecord[] {
  if (cardRecordsList.length === 0) return []
  const maps = cardRecordsList.map((rows) => {
    const m = new Map<string, LookupRecord>()
    for (const r of rows) {
      const key = `${r.layout_signature}|${r.hero}|${r.day}|${r.rating_bucket}`
      const cur = m.get(key)
      if (!cur || Number(r.matches || 0) > Number(cur.matches || 0)) m.set(key, r)
    }
    return m
  })

  if (mode === 'or') {
    const merged = new Map<string, LookupRecord>()
    for (const m of maps) {
      for (const [k, v] of Array.from(m.entries())) {
        const cur = merged.get(k)
        if (!cur) merged.set(k, v)
        else {
          merged.set(k, {
            ...cur,
            matches: Math.max(Number(cur.matches || 0), Number(v.matches || 0)),
            wins: Math.max(Number(cur.wins || 0), Number(v.wins || 0)),
            win_rate: Math.max(Number(cur.win_rate || 0), Number(v.win_rate || 0)),
          })
        }
      }
    }
    return Array.from(merged.values())
  }

  const firstKeys = Array.from(maps[0].keys())
  const out: LookupRecord[] = []
  for (const key of firstKeys) {
    if (maps.every((m) => m.has(key))) out.push(maps[0].get(key)!)
  }
  return out
}

async function queryFromR2(opts: {
  cards: string[]
  mode: 'and' | 'or'
  hero: string
  dayMin: number
  dayMax: number
  ratingBuckets: Set<string>
  sort: 'hot' | 'win_rate'
  limit: number
}) {
  const base = String(process.env.R2_PUBLIC_BASE_URL || 'https://data.duang.work').replace(/\/+$/, '')
  const aliases = await loadAliasState()
  const cardRecordsList: LookupRecord[][] = []
  for (const requestedCard of opts.cards) {
    const candidates = resolveCardCandidates(requestedCard, aliases)
    let foundRecords: LookupRecord[] | null = null
    for (const card of candidates) {
      const json = await loadJsonSafe(`${base}/analytics/v1/card/${card}.json`)
      if (json && Array.isArray(json.records)) {
        foundRecords = json.records as LookupRecord[]
        break
      }
    }
    if (!foundRecords) {
      return { source: 'r2' as const, items: [] }
    }
    cardRecordsList.push(foundRecords)
  }

  let rows = combineR2Records(cardRecordsList, opts.mode)
  rows = applyFilters(rows, opts.hero, opts.dayMin, opts.dayMax, opts.ratingBuckets)
  rows.sort((a, b) => bySort(a, b, opts.sort))
  rows = rows.slice(0, opts.limit)

  const lineupMap = new Map<string, LookupLineup>()
  const shardKeys = new Set<string>()
  for (const r of rows) {
    const layout = String(r.layout_signature || '')
    if (!layout) continue
    const shard = layout.slice(0, 2) || '00'
    shardKeys.add(shard)
  }

  const shardEntries = await Promise.all(
    Array.from(shardKeys).map(async (shard) => {
      const shardJson = await loadJsonSafe(`${base}/analytics/v1/lineup-shards/${shard}.json`)
      const bucket =
        shardJson && typeof shardJson === 'object'
          ? (shardJson as Record<string, LookupLineup>)
          : {}
      return [shard, bucket] as const
    }),
  )
  const shardCache = new Map<string, Record<string, LookupLineup>>(shardEntries)

  for (const r of rows) {
    const layout = String(r.layout_signature || '')
    if (!layout || lineupMap.has(layout)) continue
    const shard = layout.slice(0, 2) || '00'
    const bucket = shardCache.get(shard) || {}
    const lineup = bucket[layout]
    if (lineup) lineupMap.set(layout, lineup)
  }

  const items = rows.map((r) => ({
    ...r,
    smoothed_win_rate:
      Number(r.matches || 0) > 0
        ? Number(((Number(r.wins || 0) + 1) / (Number(r.matches || 0) + 2)).toFixed(4))
        : 0.5,
    lineup: lineupMap.get(r.layout_signature) || null,
  }))
  return { source: 'r2' as const, items }
}

export async function GET(request: NextRequest) {
  const cards = parseCards(request.nextUrl.searchParams.get('cards'))
  if (cards.length === 0) {
    return NextResponse.json({ error: 'cards 参数必填，格式如 cards=id1,id2' }, { status: 400 })
  }
  const mode = request.nextUrl.searchParams.get('mode') === 'or' ? 'or' : 'and'
  const hero = String(request.nextUrl.searchParams.get('hero') || '').trim()
  const dayMin = Math.max(0, num(request.nextUrl.searchParams.get('dayMin'), 0))
  const dayMax = Math.max(0, num(request.nextUrl.searchParams.get('dayMax'), 0))
  const sort = request.nextUrl.searchParams.get('sort') === 'win_rate' ? 'win_rate' : 'hot'
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'))
  const ratingBuckets = new Set(
    String(request.nextUrl.searchParams.get('ratingBuckets') || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  )

  const r2 = await queryFromR2({ cards, mode, hero, dayMin, dayMax, ratingBuckets, sort, limit })
  if (r2) {
    return NextResponse.json({ ...r2, count: r2.items.length })
  }
  return NextResponse.json(
    { error: 'R2 分片索引未就绪或缺失，请先生成并上传 analytics/v1 分片数据。' },
    { status: 503 },
  )
}
