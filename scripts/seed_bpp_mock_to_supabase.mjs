#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RUN_COUNT = Number(process.argv[2] || 2000)
const SEASON = Number(process.argv[3] || 11)
const BATCH_RUNS = 200
const BATCH_FINALS = 300
const BATCH_DAYS = 400

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRole) {
  console.error('缺少环境变量：NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })

const HEROES = ['Dooley', 'Mak', 'Vanessa', 'Pygmalien', 'Jules', 'Stelle', 'Karnok']
const MODES = ['Ranked', 'Normal']

const DEFAULT_CARDS = {
  small: [
    { id: 'b52323c8-a44d-4db4-b9e0-cf9d57e8c9dc', cn: '信使麻雀', en: 'Messenger Sparrow' },
    { id: '2f7090e4-a8bc-4ab3-89f1-1ef6c43a2d01', cn: '放大镜', en: 'Magnifying Glass' },
    { id: '5f1db8a9-9be8-48d2-b034-ecac28b64c56', cn: '起爆器', en: 'Detonator' },
    { id: 'f87ce211-85de-41b8-8d8a-76f7dca3a882', cn: '小弹簧', en: 'Tiny Spring' },
  ],
  medium: [
    { id: 'a2b2f5a2-8e7f-4623-a11f-1dfcc31e1c10', cn: '地下商街', en: 'Underground Market' },
    { id: '8c1849f4-fc4a-4307-bcf0-9ff35e6f8eb0', cn: '寒冰之核', en: 'Ice Core' },
    { id: '7adff99e-3ad9-4f18-8bb9-18a5f68c85fd', cn: '火焰喷口', en: 'Flame Nozzle' },
    { id: '9a1a37b0-64be-4af1-b6f7-a3d515c7ff45', cn: '轨道炮', en: 'Rail Cannon' },
  ],
  large: [
    { id: '741f0548-b913-4358-8454-c61a4f69b8ab', cn: '巨型发电机', en: 'Mega Dynamo' },
    { id: 'ef8b5cef-d620-4a26-b507-8fcb6f5d3d59', cn: '实验反应堆', en: 'Experimental Reactor' },
    { id: '0b95d620-a3b9-4582-bf6e-90723f37a813', cn: '空天母舰', en: 'Sky Carrier' },
  ],
}

function rng(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function pick(arr, rand) {
  return arr[Math.floor(rand() * arr.length)]
}

function tieredScore(rand) {
  const r = rand()
  if (r < 0.08) return 450 + Math.floor(rand() * 50)
  if (r < 0.20) return 500 + Math.floor(rand() * 100)
  if (r < 0.45) return 600 + Math.floor(rand() * 200)
  if (r < 0.70) return 800 + Math.floor(rand() * 100)
  if (r < 0.90) return 900 + Math.floor(rand() * 100)
  if (r < 0.97) return 1000 + Math.floor(rand() * 50)
  return 1050 + Math.floor(rand() * 120)
}

function pickWidth(rand, remain) {
  const candidates = []
  if (remain >= 1) candidates.push({ w: 1, p: 0.34 })
  if (remain >= 2) candidates.push({ w: 2, p: 0.46 })
  if (remain >= 3) candidates.push({ w: 3, p: 0.20 })
  let total = 0
  for (const c of candidates) total += c.p
  let r = rand() * total
  for (const c of candidates) {
    r -= c.p
    if (r <= 0) return c.w
  }
  return candidates[candidates.length - 1].w
}

function generateBoard(day, rand, cardsBySize) {
  const slotCount = day === 1 ? 6 : day === 2 ? 8 : 10
  const fillTarget = day <= 2 ? 0.85 : 0.92
  const target = Math.max(1, Math.floor(slotCount * fillTarget))

  const cards = []
  let slot = 1
  let used = 0
  let guard = 0

  while (slot <= slotCount && used < target && guard < 30) {
    guard += 1
    const remain = slotCount - slot + 1
    let w = pickWidth(rand, remain)
    if (used + w > target && remain > 1) {
      w = Math.min(Math.max(1, target - used), remain)
      if (![1, 2, 3].includes(w)) w = 1
    }

    const sizeKey = w === 1 ? 'small' : w === 2 ? 'medium' : 'large'
    const pool = cardsBySize[sizeKey]
    const card = pool[Math.floor(rand() * pool.length)]

    cards.push({
      template_id: card.id,
      name_cn: card.cn,
      name_en: card.en,
      size: w === 1 ? 'Small' : w === 2 ? 'Medium' : 'Large',
      start_slot: slot,
      end_slot: slot + w - 1,
      width: w,
    })

    used += w
    slot += w
    if (rand() < 0.08 && slot <= slotCount && day >= 3) slot += 1
  }

  return { slotCount, cards }
}

async function tryLoadCardsFromLocal() {
  const p = path.join(process.cwd(), 'public', 'resources', 'bazaardb', 'items_db.json')
  try {
    const txt = await fs.readFile(p, 'utf8')
    const arr = JSON.parse(txt)
    if (Array.isArray(arr) && arr.length > 0) return arr
  } catch {}
  return null
}

function buildCardPools(items) {
  if (!Array.isArray(items) || items.length === 0) return DEFAULT_CARDS
  const out = { small: [], medium: [], large: [] }
  for (const it of items) {
    const id = String(it?.id || '').trim()
    if (!id) continue
    const cn = String(it?.name_cn || it?.name || '').trim() || id
    const en = String(it?.name_en || it?.title || '').trim() || id
    const sizeRaw = String(it?.size || '').toLowerCase()
    if (sizeRaw.includes('small') || sizeRaw.includes('小')) out.small.push({ id, cn, en })
    else if (sizeRaw.includes('large') || sizeRaw.includes('大')) out.large.push({ id, cn, en })
    else out.medium.push({ id, cn, en })
  }
  if (!out.small.length || !out.medium.length || !out.large.length) return DEFAULT_CARDS
  return out
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function checkMockTables() {
  const t1 = await supabase.from('community_bpp_mock_run_finals').select('run_id').limit(1)
  if (t1.error) throw t1.error
  const t2 = await supabase.from('community_bpp_mock_run_lineups').select('run_id').limit(1)
  if (t2.error) throw t2.error
}

async function cleanupOldMock() {
  const runIds = []
  let from = 0
  const page = 1000
  while (true) {
    const { data, error } = await supabase
      .from('community_bpp_runs')
      .select('run_id')
      .like('source_r2_key', 'mock://bpp/%')
      .order('run_id', { ascending: true })
      .range(from, from + page - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const r of data) runIds.push(String(r.run_id))
    if (data.length < page) break
    from += page
  }

  if (runIds.length === 0) return 0

  for (const part of chunk(runIds, 400)) {
    const a = await supabase.from('community_bpp_mock_run_lineups').delete().in('run_id', part)
    if (a.error) throw a.error
    const b = await supabase.from('community_bpp_mock_run_finals').delete().in('run_id', part)
    if (b.error) throw b.error
    const c = await supabase.from('community_bpp_runs').delete().in('run_id', part)
    if (c.error) throw c.error
  }
  return runIds.length
}

async function main() {
  console.log(`准备写入 mock：runs=${RUN_COUNT}, season=${SEASON}`)
  await checkMockTables()

  const seed = Number(process.env.BPP_MOCK_SEED || 20260330)
  const rand = rng(seed)

  const items = await tryLoadCardsFromLocal()
  const cardsBySize = buildCardPools(items || [])

  const players = Array.from({ length: 180 }).map((_, i) => ({
    account: `mock-player-${String(Math.floor(i / 100)).padStart(2, '0')}-${String(i + 1).padStart(4, '0')}`,
    name: `MockPlayer${String(i + 1).padStart(3, '0')}`,
  }))

  const runRows = []
  const finalRows = []
  const dayRows = []
  const baseTime = new Date('2026-03-01T00:00:00Z').getTime()

  for (let i = 0; i < RUN_COUNT; i += 1) {
    const runId = crypto.randomUUID()
    const player = pick(players, rand)
    const hero = pick(HEROES, rand)
    const gameMode = rand() < 0.82 ? MODES[0] : MODES[1]

    const wins = rand() < 0.42 ? 10 : Math.max(1, Math.min(9, Math.floor(rand() * 10)))
    const losses = wins >= 10 ? Math.floor(rand() * 6) : Math.floor(rand() * 9)
    const finalDay = Math.max(1, wins + losses)
    const finalHour = 8 + Math.floor(rand() * 10)
    const score = tieredScore(rand)

    const startAt = new Date(baseTime + Math.floor(rand() * 25) * 86400000 + Math.floor(rand() * 86400000))
    const endAt = new Date(startAt.getTime() + finalDay * 330000 + Math.floor(rand() * 600000))

    runRows.push({
      run_id: runId,
      player_account_id: player.account,
      player_name: player.name,
      hero,
      game_mode: gameMode,
      started_at_utc: startAt.toISOString(),
      ended_at_utc: endAt.toISOString(),
      final_day: finalDay,
      final_hour: finalHour,
      victories: wins,
      losses,
      status: 'completed',
      reason: `mock_seed_v1|score=${score}|season=${SEASON}`,
      source_r2_key: `mock://bpp/${runId}`,
    })

    let finalCards = []
    for (let day = 1; day <= finalDay; day += 1) {
      const board = generateBoard(day, rand, cardsBySize)
      dayRows.push({
        run_id: runId,
        day,
        board_slots: board.slotCount,
        cards: board.cards,
        skills: [],
      })
      if (day === finalDay) finalCards = board.cards
    }

    finalRows.push({
      run_id: runId,
      final_day: finalDay,
      board_slots: finalDay === 1 ? 6 : finalDay === 2 ? 8 : 10,
      cards: finalCards,
      skills: [],
    })
  }

  const removed = await cleanupOldMock()
  console.log(`已清理旧 mock runs: ${removed}`)

  let doneRuns = 0
  for (const part of chunk(runRows, BATCH_RUNS)) {
    const { error } = await supabase.from('community_bpp_runs').insert(part)
    if (error) throw error
    doneRuns += part.length
    if (doneRuns % 400 === 0 || doneRuns === runRows.length) {
      console.log(`runs 写入: ${doneRuns}/${runRows.length}`)
    }
  }

  let doneFinals = 0
  for (const part of chunk(finalRows, BATCH_FINALS)) {
    const { error } = await supabase.from('community_bpp_mock_run_finals').insert(part)
    if (error) throw error
    doneFinals += part.length
    if (doneFinals % 600 === 0 || doneFinals === finalRows.length) {
      console.log(`finals 写入: ${doneFinals}/${finalRows.length}`)
    }
  }

  let doneDays = 0
  for (const part of chunk(dayRows, BATCH_DAYS)) {
    const { error } = await supabase.from('community_bpp_mock_run_lineups').insert(part)
    if (error) throw error
    doneDays += part.length
    if (doneDays % 4000 === 0 || doneDays === dayRows.length) {
      console.log(`lineups 写入: ${doneDays}/${dayRows.length}`)
    }
  }

  const c1 = await supabase.from('community_bpp_runs').select('*', { count: 'exact', head: true }).like('source_r2_key', 'mock://bpp/%')
  const c2 = await supabase.from('community_bpp_mock_run_finals').select('*', { count: 'exact', head: true })
  const c3 = await supabase.from('community_bpp_mock_run_lineups').select('*', { count: 'exact', head: true })

  console.log('完成')
  console.log(`mock runs: ${c1.count || 0}`)
  console.log(`mock finals: ${c2.count || 0}`)
  console.log(`mock lineups: ${c3.count || 0}`)
}

main().catch((e) => {
  const msg = String(e?.message || e)
  if (msg.includes("Could not find the table 'public.community_bpp_mock_run_finals'")) {
    console.error('缺少 mock 表。请先在 Supabase 执行：/supabase/bpp_mock_schema.sql')
  } else {
    console.error('写入失败:', msg)
  }
  process.exit(1)
})
