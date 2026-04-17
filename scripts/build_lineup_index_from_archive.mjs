#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { spawn } from 'child_process'
import crypto from 'crypto'

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const DEFAULT_ZIP = path.join(process.env.HOME || '', 'Downloads', '归档.zip')
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'tmp', 'lineup-index')

function parseArgs(argv) {
  const out = {
    zip: DEFAULT_ZIP,
    outDir: DEFAULT_OUT,
    includeOpponent: false,
    limitBattles: 0,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--zip') out.zip = argv[++i] || out.zip
    else if (a === '--out') out.outDir = argv[++i] || out.outDir
    else if (a === '--include-opponent') out.includeOpponent = true
    else if (a === '--limit-battles') out.limitBattles = Math.max(0, Number(argv[++i] || 0) || 0)
  }
  return out
}

function bucketRating(rating) {
  const r = Number(rating || 0)
  if (!Number.isFinite(r)) return '<500'
  if (r < 500) return '<500'
  if (r < 600) return '500-600'
  if (r < 700) return '600-700'
  if (r < 800) return '700-800'
  if (r < 900) return '800-900'
  if (r < 1000) return '900-1000'
  if (r < 1050) return '1000-1050'
  return '>=1050'
}

function sqlUnescape(text) {
  return text.replace(/''/g, "'")
}

function parseSqlValuesTuple(tupleText) {
  const values = []
  let i = 0
  let cur = ''
  let inQuote = false
  while (i < tupleText.length) {
    const ch = tupleText[i]
    if (inQuote) {
      if (ch === "'") {
        const next = tupleText[i + 1]
        if (next === "'") {
          cur += "'"
          i += 2
          continue
        }
        inQuote = false
        i += 1
        continue
      }
      cur += ch
      i += 1
      continue
    }
    if (ch === "'") {
      inQuote = true
      i += 1
      continue
    }
    if (ch === ',') {
      values.push(cur.trim())
      cur = ''
      i += 1
      continue
    }
    cur += ch
    i += 1
  }
  values.push(cur.trim())
  return values.map((v) => {
    if (v.toLowerCase() === 'null') return null
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
    return sqlUnescape(v)
  })
}

async function eachInsertRowFromZip(zipPath, fileName, onRow) {
  const proc = spawn('unzip', ['-p', zipPath, fileName], { stdio: ['ignore', 'pipe', 'inherit'] })
  const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity })
  let count = 0
  for await (const line of rl) {
    if (!line.startsWith('INSERT INTO')) continue
    const idx = line.indexOf('VALUES')
    if (idx < 0) continue
    const s = line.indexOf('(', idx)
    const e = line.lastIndexOf(')')
    if (s < 0 || e <= s) continue
    const tuple = line.slice(s + 1, e)
    const values = parseSqlValuesTuple(tuple)
    count += 1
    await onRow(values, count)
  }
  await new Promise((resolve, reject) => {
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`unzip ${fileName} exited ${code}`))))
    proc.on('error', reject)
  })
  return count
}

function hashText(text) {
  return crypto.createHash('sha1').update(text).digest('hex')
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function jsonWrite(filePath, data) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function pickHero(meta, side) {
  if (side === 'player') return String(meta.player_hero || '').trim() || 'Unknown'
  return String(meta.opponent_hero || '').trim() || 'Unknown'
}

function pickRating(meta, side) {
  return side === 'player' ? Number(meta.player_rating || 0) : Number(meta.opponent_rating || 0)
}

function pickResult(meta, side) {
  const r = String(meta.result || '').toLowerCase()
  if (!r) return 'unknown'
  if (side === 'player') return r
  if (r === 'win') return 'loss'
  if (r === 'loss') return 'win'
  return r
}

function cardSortKey(card) {
  return `${card.template_id}#${card.tier || 0}`
}

function makeComboSignature(cards) {
  const key = cards
    .map((c) => cardSortKey(c))
    .sort()
    .join('|')
  return hashText(key)
}

function makeLayoutSignature(cards) {
  const key = cards
    .slice()
    .sort((a, b) => Number(a.slot_index) - Number(b.slot_index))
    .map((c) => `${c.slot_index}:${cardSortKey(c)}`)
    .join('|')
  return hashText(key)
}


async function main() {
  const args = parseArgs(process.argv)
  ensureDir(args.outDir)

  const cardTemplateMap = new Map()
  await eachInsertRowFromZip(args.zip, 'card_templates.sql', async (v) => {
    cardTemplateMap.set(Number(v[0]), String(v[1]))
  })

  const battles = new Map()
  await eachInsertRowFromZip(args.zip, 'battles.sql', async (v, count) => {
    if (args.limitBattles > 0 && count > args.limitBattles) return
    battles.set(String(v[0]), {
      battle_id: String(v[0]),
      run_id: String(v[1]),
      day: Number(v[3] || 0) || 0,
      player_hero: v[6],
      player_rating: Number(v[8] || 0) || 0,
      opponent_hero: v[12],
      opponent_rating: Number(v[14] || 0) || 0,
      result: v[16],
    })
  })

  const cardsByBattleSide = new Map()
  await eachInsertRowFromZip(args.zip, 'battle_cards.sql', async (v) => {
    const battleId = String(v[1])
    const side = String(v[2])
    if (!args.includeOpponent && side !== 'player') return
    if (!battles.has(battleId)) return
    const slotIndex = Number(v[3] || 0) || 0
    const templateFk = Number(v[4] || 0) || 0
    const templateId = cardTemplateMap.get(templateFk)
    if (!templateId) return
    const tier = Number(v[5] || 0) || 0
    const enchant = v[6] == null ? null : String(v[6])
    const k = `${battleId}|${side}`
    const list = cardsByBattleSide.get(k) || []
    list.push({
      slot_index: slotIndex,
      template_id: templateId,
      tier,
      enchant_code: enchant,
    })
    cardsByBattleSide.set(k, list)
  })

  const snapshots = []
  for (const [k, cards] of cardsByBattleSide.entries()) {
    const [battleId, side] = k.split('|')
    const meta = battles.get(battleId)
    if (!meta || cards.length === 0) continue
    cards.sort((a, b) => a.slot_index - b.slot_index)
    const hero = pickHero(meta, side)
    const playerRating = pickRating(meta, side)
    const ratingBucket = bucketRating(playerRating)
    const result = pickResult(meta, side)
    const comboSig = makeComboSignature(cards)
    const layoutSig = makeLayoutSignature(cards)
    snapshots.push({
      battle_id: battleId,
      run_id: meta.run_id,
      side,
      hero,
      day: meta.day,
      player_rating: playerRating,
      rating_bucket: ratingBucket,
      result,
      cards,
      combo_signature: comboSig,
      layout_signature: layoutSig,
    })
  }

  const variantMap = new Map()
  const cardAggMap = new Map()

  for (const s of snapshots) {
    const vKey = `${s.combo_signature}|${s.layout_signature}|${s.hero}|${s.day}|${s.rating_bucket}`
    const v = variantMap.get(vKey) || {
      combo_signature: s.combo_signature,
      layout_signature: s.layout_signature,
      hero: s.hero,
      day: s.day,
      rating_bucket: s.rating_bucket,
      matches: 0,
      wins: 0,
      losses: 0,
      top_cards: s.cards,
    }
    v.matches += 1
    if (s.result === 'win') v.wins += 1
    else if (s.result === 'loss') v.losses += 1
    variantMap.set(vKey, v)

    const uniqCards = new Set(s.cards.map((c) => c.template_id))
    for (const cardId of uniqCards) {
      const cKey = `${cardId}|${s.layout_signature}|${s.hero}|${s.day}|${s.rating_bucket}`
      const c = cardAggMap.get(cKey) || {
        template_id: cardId,
        combo_signature: s.combo_signature,
        layout_signature: s.layout_signature,
        hero: s.hero,
        day: s.day,
        rating_bucket: s.rating_bucket,
        matches: 0,
        wins: 0,
      }
      c.matches += 1
      if (s.result === 'win') c.wins += 1
      cardAggMap.set(cKey, c)
    }
  }

  const variantAgg = Array.from(variantMap.values()).map((x) => ({
    ...x,
    win_rate: x.matches > 0 ? Number((x.wins / x.matches).toFixed(4)) : 0,
  }))

  const cardRecordsById = new Map()
  for (const row of cardAggMap.values()) {
    const list = cardRecordsById.get(row.template_id) || []
    list.push({
      template_id: row.template_id,
      combo_signature: row.combo_signature,
      layout_signature: row.layout_signature,
      hero: row.hero,
      day: row.day,
      rating_bucket: row.rating_bucket,
      matches: row.matches,
      wins: row.wins,
      win_rate: row.matches > 0 ? Number((row.wins / row.matches).toFixed(4)) : 0,
    })
    cardRecordsById.set(row.template_id, list)
  }

  for (const records of cardRecordsById.values()) {
    records.sort((a, b) => (b.matches - a.matches) || (b.win_rate - a.win_rate))
  }

  const lineupMap = new Map()
  for (const v of variantAgg) {
    if (!lineupMap.has(v.layout_signature)) {
      lineupMap.set(v.layout_signature, {
        layout_signature: v.layout_signature,
        combo_signature: v.combo_signature,
        cards: v.top_cards,
      })
    }
  }

  const version = `v-${Date.now()}`
  const baseDir = path.join(args.outDir, version)
  const cardDir = path.join(baseDir, 'card')
  const lineupShardDir = path.join(baseDir, 'lineup-shards')
  ensureDir(cardDir)
  ensureDir(lineupShardDir)

  for (const [cardId, records] of cardRecordsById.entries()) {
    jsonWrite(path.join(cardDir, `${cardId}.json`), {
      template_id: cardId,
      count: records.length,
      records,
    })
  }
  const shardMap = new Map()
  for (const [layoutSig, row] of lineupMap.entries()) {
    const shard = String(layoutSig || '').slice(0, 2) || '00'
    const bucket = shardMap.get(shard) || {}
    bucket[layoutSig] = row
    shardMap.set(shard, bucket)
  }
  for (const [shard, payload] of shardMap.entries()) {
    jsonWrite(path.join(lineupShardDir, `${shard}.json`), payload)
  }

  const manifest = {
    version,
    created_at: new Date().toISOString(),
    source_zip: args.zip,
    include_opponent: args.includeOpponent,
    snapshots: snapshots.length,
    variants: variantAgg.length,
    card_files: cardRecordsById.size,
    lineup_files: lineupMap.size,
    lineup_shards: shardMap.size,
    paths: {
      card: 'card/{template_id}.json',
      lineup_shard: 'lineup-shards/{layout_signature_prefix2}.json',
    },
  }
  jsonWrite(path.join(baseDir, 'manifest.json'), manifest)

  console.log(JSON.stringify({ ok: true, out: baseDir, manifest }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
