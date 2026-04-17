#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import initSqlJs from 'sql.js/dist/sql-wasm.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1]
  return fallback
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function must(name) {
  const v = process.env[name]
  if (!v) throw new Error(`missing env: ${name}`)
  return v
}

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function readFileBytes(file) {
  const buf = await fs.readFile(file)
  if (/\.gz$/i.test(file)) return new Uint8Array(gunzipSync(buf))
  return new Uint8Array(buf)
}

async function walk(dir) {
  const out = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const ent of entries) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...(await walk(p)))
    else out.push(p)
  }
  return out
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (c) => chunks.push(c))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

async function listR2DbKeys(s3, bucket, prefix) {
  const out = []
  let token
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: token,
      MaxKeys: 1000,
    }))
    ;(res.Contents || []).forEach((x) => {
      const k = x.Key || ''
      if (/-bazaarplusplus\.db\.gz$/i.test(k)) out.push(k)
    })
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return out
}

function toNum(v, d = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

function safeJson(input) {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

function pickEncounterId(payload) {
  return String(payload?.encounter_id || '').trim()
}

function optionName(op) {
  return String(op?.name || op?.title || op?.template_id || '').trim()
}

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''))
}

async function loadRouteNameMap() {
  const p = path.join(process.cwd(), 'public/resources/analytics/route_name_zh_map.json')
  if (!(await exists(p))) return {}
  try {
    const raw = JSON.parse(await fs.readFile(p, 'utf8'))
    if (!raw || typeof raw !== 'object') return {}
    return raw
  } catch {
    return {}
  }
}

function normalizeResult(result) {
  const r = String(result || '').toLowerCase()
  if (r === 'win' || r === 'won') return 'win'
  if (r === 'lose' || r === 'loss' || r === 'lost') return 'loss'
  return ''
}

function toRouteStepName(step, routeNameMap) {
  const tid = String(step.template_id || '')
  const raw = String(step.name || '').trim()
  if (hasChinese(raw)) return { name_cn: raw, name_en: raw, missing: false }

  const mappedById = String(routeNameMap?.byTemplateId?.[tid] || '').trim()
  if (mappedById) return { name_cn: mappedById, name_en: raw || tid, missing: false }

  const mappedByEn = String(routeNameMap?.byEnglishName?.[raw] || '').trim()
  if (mappedByEn) return { name_cn: mappedByEn, name_en: raw || tid, missing: false }

  return { name_cn: '', name_en: raw || tid, missing: true }
}

function finalizeChainRows(chainMap) {
  const rows = Array.from(chainMap.values()).map((x) => {
    const tenWinRate = x.picks > 0 ? x.tenWins / x.picks : 0
    const first5Rate = x.first5Total > 0 ? x.first5Wins / x.first5Total : 0
    const first5AvgWins = x.picks > 0 ? x.first5Wins / x.picks : 0
    return {
      chain_signature: x.chain_signature,
      picks: x.picks,
      ten_win_rate: Number(tenWinRate.toFixed(4)),
      first5_pvp_win_rate: Number(first5Rate.toFixed(4)),
      first5_avg_wins: Number(first5AvgWins.toFixed(3)),
      first5_sample_battles: x.first5Total,
      steps: x.steps.map((s) => ({
        hour: s.hour,
        template_id: s.template_id,
        name_cn: s.name_cn || '',
        name_en: s.name_en || s.template_id,
      })),
      missing_cn_count: x.steps.filter((s) => s.cn_missing).length,
    }
  })
  rows.sort((a, b) => (b.picks - a.picks) || (b.first5_pvp_win_rate - a.first5_pvp_win_rate))
  return rows
}

function detectSelectedOption(events, i, optionById, day, hour) {
  const maxLookAhead = 80
  for (let j = i + 1; j < events.length && j <= i + maxLookAhead; j += 1) {
    const e = events[j]
    const p = e.payload
    if (!p) continue
    if (e.kind === 'choice_options_seen') {
      const d2 = toNum(p.day, -1)
      const h2 = toNum(p.hour, -1)
      if (d2 !== day || h2 !== hour) break
    }
    const encounterId = pickEncounterId(p)
    if (encounterId && optionById.has(encounterId)) return optionById.get(encounterId)
  }
  return null
}

function buildRunDayChains(run, routeNameMap) {
  const out = new Map()
  const events = run.events || []
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i]
    if (e.kind !== 'choice_options_seen') continue
    const payload = e.payload
    if (!payload) continue
    const day = toNum(payload.day, 0)
    const hour = toNum(payload.hour, 0)
    if (day <= 0) continue

    const options = Array.isArray(payload.options) ? payload.options : []
    if (!options.length) continue
    const optionById = new Map()
    for (const op of options) {
      const tid = String(op?.template_id || '').trim()
      if (!tid) continue
      optionById.set(tid, {
        template_id: tid,
        name: optionName(op) || tid,
      })
    }
    if (!optionById.size) continue

    const picked = detectSelectedOption(events, i, optionById, day, hour)
    if (!picked) continue

    const key = String(day)
    if (!out.has(key)) out.set(key, [])
    const nameInfo = toRouteStepName(picked, routeNameMap)
    out.get(key).push({
      seq: toNum(e.seq, i),
      hour,
      template_id: picked.template_id,
      name_cn: nameInfo.name_cn,
      name_en: nameInfo.name_en,
      cn_missing: nameInfo.missing,
    })
  }

  for (const [k, arr] of out.entries()) {
    arr.sort((a, b) => a.seq - b.seq)
    const deduped = []
    let prev = null
    for (const s of arr) {
      const sig = `${s.hour}|${s.template_id}`
      if (sig === prev) continue
      deduped.push(s)
      prev = sig
    }
    out.set(k, deduped)
  }

  return out
}

function aggregateRuns(runs, routeNameMap) {
  const heroDayMap = new Map()
  let parsedRuns = 0

  for (const run of runs) {
    const hero = String(run.hero || 'Unknown').trim() || 'Unknown'
    const wins = toNum(run.victories, 0)
    const dayChains = buildRunDayChains(run, routeNameMap)
    if (!dayChains.size) continue
    parsedRuns += 1

    const early = run.early || { wins: 0, total: 0 }
    for (const [dayStr, steps] of dayChains.entries()) {
      const day = toNum(dayStr, 0)
      if (!steps.length) continue
      const key = `${hero}|${day}`
      if (!heroDayMap.has(key)) {
        heroDayMap.set(key, {
          hero,
          day,
          chainMap: new Map(),
        })
      }
      const bucket = heroDayMap.get(key)
      const chainSignature = steps.map((s) => `${s.hour}:${s.template_id}`).join(' > ')
      if (!bucket.chainMap.has(chainSignature)) {
        bucket.chainMap.set(chainSignature, {
          chain_signature: chainSignature,
          steps,
          picks: 0,
          tenWins: 0,
          first5Wins: 0,
          first5Total: 0,
        })
      }
      const r = bucket.chainMap.get(chainSignature)
      r.picks += 1
      if (wins >= 10) r.tenWins += 1
      r.first5Wins += toNum(early.wins, 0)
      r.first5Total += toNum(early.total, 0)
    }
  }

  const byHero = new Map()
  for (const v of heroDayMap.values()) {
    if (!byHero.has(v.hero)) byHero.set(v.hero, [])
    byHero.get(v.hero).push({
      day: v.day,
      chains: finalizeChainRows(v.chainMap),
    })
  }

  const heroes = Array.from(byHero.entries()).map(([hero, days]) => ({
    hero,
    days: days.sort((a, b) => a.day - b.day),
  }))
  heroes.sort((a, b) => a.hero.localeCompare(b.hero))

  return { heroes, parsedRuns }
}

async function parseRunsFromDbBytes(SQL, bytes) {
  const db = new SQL.Database(bytes)
  const runMap = new Map()
  try {
    const runsRes = db.exec(`
      select
        r.run_id,
        coalesce(r.hero, '') as hero,
        coalesce(s.victories, 0) as victories,
        coalesce(s.losses, 0) as losses
      from runs r
      left join run_status s on s.run_id = r.run_id
    `)
    if (runsRes?.[0]?.values) {
      const cols = runsRes[0].columns
      const iRun = cols.indexOf('run_id')
      const iHero = cols.indexOf('hero')
      const iV = cols.indexOf('victories')
      const iL = cols.indexOf('losses')
      for (const row of runsRes[0].values) {
        const runId = String(row[iRun] || '').trim()
        if (!runId) continue
        runMap.set(runId, {
          run_id: runId,
          hero: String(row[iHero] || '').trim(),
          victories: toNum(row[iV], 0),
          losses: toNum(row[iL], 0),
          events: [],
          early: { wins: 0, total: 0 },
        })
      }
    }

    const pvpRes = db.exec(`
      select run_id, day, result
      from pvp_battles
      where day is not null and day <= 5
    `)
    if (pvpRes?.[0]?.values) {
      const cols = pvpRes[0].columns
      const iRun = cols.indexOf('run_id')
      const iDay = cols.indexOf('day')
      const iResult = cols.indexOf('result')
      for (const row of pvpRes[0].values) {
        const runId = String(row[iRun] || '').trim()
        const day = toNum(row[iDay], 0)
        if (!runId || day <= 0 || !runMap.has(runId)) continue
        const r = runMap.get(runId)
        const norm = normalizeResult(row[iResult])
        if (!norm) continue
        r.early.total += 1
        if (norm === 'win') r.early.wins += 1
      }
    }

    const evRes = db.exec(`
      select run_id, seq, kind, payload_json
      from run_events
      where kind in ('choice_options_seen','state_seen','encounter_options_seen','loot_options_seen')
      order by run_id asc, seq asc
    `)
    if (evRes?.[0]?.values) {
      const cols = evRes[0].columns
      const iRun = cols.indexOf('run_id')
      const iSeq = cols.indexOf('seq')
      const iKind = cols.indexOf('kind')
      const iPayload = cols.indexOf('payload_json')
      for (const row of evRes[0].values) {
        const runId = String(row[iRun] || '').trim()
        if (!runId || !runMap.has(runId)) continue
        const payload = safeJson(String(row[iPayload] || ''))
        if (!payload || typeof payload !== 'object') continue
        runMap.get(runId).events.push({
          seq: toNum(row[iSeq], 0),
          kind: String(row[iKind] || ''),
          payload,
        })
      }
    }
  } finally {
    db.close()
  }

  return Array.from(runMap.values())
}

async function buildFromLocalDbDir(SQL, dbDir) {
  const files = (await walk(dbDir)).filter((f) => /\.(db|db\.gz)$/i.test(f))
  const allRuns = []
  for (const file of files) {
    const bytes = await readFileBytes(file)
    const runs = await parseRunsFromDbBytes(SQL, bytes)
    allRuns.push(...runs)
  }
  return { source: 'local', filesScanned: files.length, runs: allRuns }
}

async function buildFromR2(SQL, prefix) {
  const bucket = must('R2_BUCKET')
  const endpoint = `https://${must('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`
  const accessKeyId = must('R2_ACCESS_KEY_ID')
  const secretAccessKey = must('R2_SECRET_ACCESS_KEY')
  const s3 = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } })
  const keys = await listR2DbKeys(s3, bucket, prefix)
  const allRuns = []
  for (const key of keys) {
    const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const body = await streamToBuffer(get.Body)
    const bytes = new Uint8Array(gunzipSync(body))
    const runs = await parseRunsFromDbBytes(SQL, bytes)
    allRuns.push(...runs)
  }
  return { source: 'r2', filesScanned: keys.length, runs: allRuns }
}

async function main() {
  const fromR2 = hasFlag('from-r2')
  const dbDir = arg('db-dir', '/Users/duang/Downloads/BazaarPlusPlus')
  const outFile = arg('out-file', path.join(process.cwd(), 'public/resources/analytics/route_choice_stats.json'))
  const r2Prefix = arg('r2-prefix', 'match-db-upload/')
  const routeNameMap = await loadRouteNameMap()

  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const wasmDir = join(moduleDir, '..', 'node_modules', 'sql.js', 'dist')
  const SQL = await initSqlJs({ locateFile: (f) => join(wasmDir, f) })

  const sourceData = fromR2
    ? await buildFromR2(SQL, r2Prefix)
    : await buildFromLocalDbDir(SQL, dbDir)

  const { heroes, parsedRuns } = aggregateRuns(sourceData.runs, routeNameMap)
  const payload = {
    generatedAt: new Date().toISOString(),
    source: sourceData.source,
    filesScanned: sourceData.filesScanned,
    runsParsed: parsedRuns,
    note: '路径统计按“整天选择链”聚合；中文名优先原始中文或 route_name_zh_map.json，缺失则保留原名并统计 missing_cn_count。',
    heroes,
  }

  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`[route-stats] done => ${outFile}`)
  console.log(JSON.stringify({ filesScanned: sourceData.filesScanned, runsParsed: parsedRuns, heroes: heroes.length }, null, 2))
}

main().catch((e) => {
  console.error('[route-stats] failed:', e?.message || e)
  process.exit(1)
})
