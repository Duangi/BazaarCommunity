#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const PROJECT_ROOT = process.cwd()
const OUT_SCHEMA = path.join(PROJECT_ROOT, 'supabase', 'bpp_mock_schema.sql')
const OUT_SEED = path.join(PROJECT_ROOT, 'supabase', 'bpp_mock_seed.sql')

const RUN_COUNT = Number(process.argv[2] || 2000)
const SEASON = Number(process.argv[3] || 11)

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

function pad2(n) {
  return String(n).padStart(2, '0')
}

function sqlEscape(str) {
  return String(str ?? '').replace(/'/g, "''")
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
  const localCandidates = [
    path.join(PROJECT_ROOT, 'public', 'resources', 'bazaardb', 'items_db.json'),
    path.join(PROJECT_ROOT, 'public', 'resources', 'items_db.json'),
  ]
  for (const p of localCandidates) {
    try {
      const txt = await fs.readFile(p, 'utf8')
      const arr = JSON.parse(txt)
      if (Array.isArray(arr) && arr.length > 0) {
        return arr
      }
    } catch {}
  }
  return null
}

async function tryLoadCardsFromRemote() {
  const bases = [
    process.env.R2_PUBLIC_BASE_URL || '',
    'https://data.duang.work',
  ].map((x) => String(x || '').replace(/\/+$/, '')).filter(Boolean)

  for (const base of bases) {
    const url = `${base}/items_db.json`
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const arr = await res.json()
      if (Array.isArray(arr) && arr.length > 0) return arr
    } catch {}
  }
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

async function main() {
  const seed = Number(process.env.BPP_MOCK_SEED || 20260330)
  const rand = rng(seed)

  const localItems = await tryLoadCardsFromLocal()
  const remoteItems = localItems ? null : await tryLoadCardsFromRemote()
  const cardsBySize = buildCardPools(localItems || remoteItems || [])

  const players = Array.from({ length: 180 }).map((_, i) => ({
    account: `mock-player-${pad2(Math.floor(i / 100))}-${String(i + 1).padStart(4, '0')}`,
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
      const cardsJson = JSON.stringify(board.cards)
      dayRows.push({
        run_id: runId,
        day,
        board_slots: board.slotCount,
        cards_json: cardsJson,
        skills_json: '[]',
      })
      if (day === finalDay) finalCards = board.cards
    }

    finalRows.push({
      run_id: runId,
      final_day: finalDay,
      board_slots: finalDay === 1 ? 6 : finalDay === 2 ? 8 : 10,
      cards_json: JSON.stringify(finalCards),
      skills_json: '[]',
    })
  }

  const schemaSql = `-- BazaarPlusPlus mock 分析表（测试）\n\ncreate table if not exists public.community_bpp_mock_run_finals (\n  run_id text primary key references public.community_bpp_runs(run_id) on delete cascade,\n  final_day integer not null,\n  board_slots integer not null,\n  cards jsonb not null default '[]'::jsonb,\n  skills jsonb not null default '[]'::jsonb,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now()\n);\n\ncreate table if not exists public.community_bpp_mock_run_lineups (\n  run_id text not null references public.community_bpp_runs(run_id) on delete cascade,\n  day integer not null,\n  board_slots integer not null,\n  cards jsonb not null default '[]'::jsonb,\n  skills jsonb not null default '[]'::jsonb,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now(),\n  primary key (run_id, day)\n);\n\ncreate index if not exists idx_bpp_mock_lineups_day on public.community_bpp_mock_run_lineups(day);\n\ncreate index if not exists idx_bpp_mock_runs_player on public.community_bpp_runs(player_name, ended_at_utc desc);\n\ncreate index if not exists idx_bpp_mock_runs_hero on public.community_bpp_runs(hero, ended_at_utc desc);\n`

  const runInsertValues = runRows
    .map((r) => `('${sqlEscape(r.run_id)}','${sqlEscape(r.player_account_id)}','${sqlEscape(r.player_name)}','${sqlEscape(r.hero)}','${sqlEscape(r.game_mode)}','${sqlEscape(r.started_at_utc)}','${sqlEscape(r.ended_at_utc)}',${r.final_day},${r.final_hour},${r.victories},${r.losses},'${sqlEscape(r.status)}','${sqlEscape(r.reason)}','${sqlEscape(r.source_r2_key)}')`)
    .join(',\n')

  const finalInsertValues = finalRows
    .map((r) => `('${sqlEscape(r.run_id)}',${r.final_day},${r.board_slots},'${sqlEscape(r.cards_json)}'::jsonb,'${sqlEscape(r.skills_json)}'::jsonb)`)
    .join(',\n')

  const dayInsertValues = dayRows
    .map((r) => `('${sqlEscape(r.run_id)}',${r.day},${r.board_slots},'${sqlEscape(r.cards_json)}'::jsonb,'${sqlEscape(r.skills_json)}'::jsonb)`)
    .join(',\n')

  const seedSql = `-- 2000 局 BazaarPlusPlus mock 数据（测试）\n-- 规则：Day1=6格，Day2=8格，Day3+=10格；Small=1格，Medium=2格，Large=3格。\n\nbegin;\n\n-- 仅清理本脚本写入的 mock 记录\ndelete from public.community_bpp_mock_run_lineups where run_id in (select run_id from public.community_bpp_runs where source_r2_key like 'mock://bpp/%');\ndelete from public.community_bpp_mock_run_finals where run_id in (select run_id from public.community_bpp_runs where source_r2_key like 'mock://bpp/%');\ndelete from public.community_bpp_runs where source_r2_key like 'mock://bpp/%';\n\ninsert into public.community_bpp_runs\n(run_id,player_account_id,player_name,hero,game_mode,started_at_utc,ended_at_utc,final_day,final_hour,victories,losses,status,reason,source_r2_key)\nvalues\n${runInsertValues}\n;\n\ninsert into public.community_bpp_mock_run_finals\n(run_id,final_day,board_slots,cards,skills)\nvalues\n${finalInsertValues}\n;\n\ninsert into public.community_bpp_mock_run_lineups\n(run_id,day,board_slots,cards,skills)\nvalues\n${dayInsertValues}\n;\n\ncommit;\n\n-- 快速校验\nselect count(*) as runs from public.community_bpp_runs where source_r2_key like 'mock://bpp/%';\nselect count(*) as finals from public.community_bpp_mock_run_finals;\nselect count(*) as lineups from public.community_bpp_mock_run_lineups;\n`

  await fs.writeFile(OUT_SCHEMA, schemaSql, 'utf8')
  await fs.writeFile(OUT_SEED, seedSql, 'utf8')

  console.log(`已生成：${OUT_SCHEMA}`)
  console.log(`已生成：${OUT_SEED}`)
  console.log(`runRows=${runRows.length}, finalRows=${finalRows.length}, dayRows=${dayRows.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
