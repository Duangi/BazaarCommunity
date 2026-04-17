#!/usr/bin/env node
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import initSqlJs from 'sql.js/dist/sql-wasm.js'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { gunzipSync } from 'zlib'

function must(name) {
  const v = process.env[name]
  if (!v) throw new Error(`missing env: ${name}`)
  return v
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (c) => chunks.push(c))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

async function listAllDbKeys(s3, bucket) {
  const out = []
  let token
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'match-db-upload/',
      ContinuationToken: token,
      MaxKeys: 1000,
    }))
    ;(res.Contents || []).forEach((x) => {
      const key = x.Key || ''
      if (/-bazaarplusplus\.db\.gz$/i.test(key)) out.push(key)
    })
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return out
}

function uploaderFromKey(key) {
  const parts = String(key || '').split('/')
  return parts.length >= 2 ? parts[1] : ''
}

async function parseRunsFromDbBytes(SQL, bytes, sourceKey) {
  const db = new SQL.Database(bytes)
  const out = []
  try {
    const runsRes = db.exec(`
      select
        r.run_id,
        r.hero,
        r.game_mode,
        r.started_at_utc,
        s.ended_at_utc,
        s.final_day,
        s.final_hour,
        s.victories,
        s.losses,
        s.status,
        s.reason
      from runs r
      left join run_status s on s.run_id = r.run_id
    `)
    const playerRes = db.exec(`
      select
        run_id,
        max(coalesce(player_account_id, '')) as player_account_id,
        max(coalesce(player_name, '')) as player_name
      from pvp_battles
      group by run_id
    `)
    const playerMap = new Map()
    if (playerRes?.[0]?.values) {
      const cols = playerRes[0].columns
      const iRun = cols.indexOf('run_id')
      const iId = cols.indexOf('player_account_id')
      const iName = cols.indexOf('player_name')
      playerRes[0].values.forEach((row) => {
        playerMap.set(String(row[iRun] || ''), {
          player_account_id: String(row[iId] || '') || null,
          player_name: String(row[iName] || '') || null,
        })
      })
    }
    if (runsRes?.[0]?.values) {
      const c = runsRes[0].columns
      const idx = Object.fromEntries(c.map((k, i) => [k, i]))
      runsRes[0].values.forEach((row) => {
        const runId = String(row[idx.run_id] || '').trim()
        if (!runId) return
        const p = playerMap.get(runId) || { player_account_id: null, player_name: null }
        out.push({
          run_id: runId,
          player_account_id: p.player_account_id,
          player_name: p.player_name,
          hero: row[idx.hero] ?? null,
          game_mode: row[idx.game_mode] ?? null,
          started_at_utc: row[idx.started_at_utc] ?? null,
          ended_at_utc: row[idx.ended_at_utc] ?? null,
          final_day: row[idx.final_day] ?? null,
          final_hour: row[idx.final_hour] ?? null,
          victories: row[idx.victories] ?? null,
          losses: row[idx.losses] ?? null,
          status: row[idx.status] ?? null,
          reason: row[idx.reason] ?? null,
          source_r2_key: sourceKey,
          updated_at: new Date().toISOString(),
        })
      })
    }
  } finally {
    db.close()
  }
  return out
}

async function upsertHeroAgg(supabase) {
  const { data, error } = await supabase
    .from('community_bpp_runs')
    .select('hero,victories')
  if (error) throw error
  const map = new Map()
  ;(data || []).forEach((x) => {
    const hero = String(x.hero || '').trim() || 'Unknown'
    const v = Number(x.victories || 0)
    const cur = map.get(hero) || { total_runs: 0, total_10w: 0, total_v: 0 }
    cur.total_runs += 1
    if (v >= 10) cur.total_10w += 1
    cur.total_v += v
    map.set(hero, cur)
  })
  const rows = Array.from(map.entries()).map(([hero, v]) => ({
    hero,
    total_runs: v.total_runs,
    total_10w: v.total_10w,
    avg_victories: v.total_runs > 0 ? Number((v.total_v / v.total_runs).toFixed(3)) : 0,
    updated_at: new Date().toISOString(),
  }))
  if (rows.length === 0) return { upserted: 0 }
  const { error: upErr } = await supabase
    .from('community_bpp_hero_agg')
    .upsert(rows, { onConflict: 'hero' })
  if (upErr) throw upErr
  return { upserted: rows.length }
}

async function main() {
  const url = must('NEXT_PUBLIC_SUPABASE_URL')
  const serviceKey = must('SUPABASE_SERVICE_ROLE_KEY')
  const bucket = must('R2_BUCKET')
  const endpoint = `https://${must('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`
  const accessKeyId = must('R2_ACCESS_KEY_ID')
  const secretAccessKey = must('R2_SECRET_ACCESS_KEY')

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const s3 = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } })

  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const wasmDir = join(moduleDir, '..', 'node_modules', 'sql.js', 'dist')
  const SQL = await initSqlJs({ locateFile: (f) => join(wasmDir, f) })

  const keys = await listAllDbKeys(s3, bucket)
  const { data: doneRows } = await supabase
    .from('community_bpp_ingest_files')
    .select('r2_key,status')
    .in('r2_key', keys)
  const doneSet = new Set((doneRows || []).filter((x) => x.status === 'done').map((x) => x.r2_key))
  const pending = keys.filter((k) => !doneSet.has(k))

  let filesDone = 0
  let runsUpserted = 0
  let filesFailed = 0

  for (const key of pending) {
    try {
      const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      const body = await streamToBuffer(get.Body)
      const dbBytes = gunzipSync(body)
      const runs = await parseRunsFromDbBytes(SQL, new Uint8Array(dbBytes), key)
      if (runs.length > 0) {
        const { error: upErr } = await supabase
          .from('community_bpp_runs')
          .upsert(runs, { onConflict: 'run_id' })
        if (upErr) throw upErr
        runsUpserted += runs.length
      }
      const { error: markErr } = await supabase
        .from('community_bpp_ingest_files')
        .upsert({
          r2_key: key,
          uploader_segment: uploaderFromKey(key),
          status: 'done',
          processed_at: new Date().toISOString(),
          error: null,
        }, { onConflict: 'r2_key' })
      if (markErr) throw markErr
      filesDone += 1
    } catch (e) {
      filesFailed += 1
      await supabase
        .from('community_bpp_ingest_files')
        .upsert({
          r2_key: key,
          uploader_segment: uploaderFromKey(key),
          status: 'failed',
          processed_at: new Date().toISOString(),
          error: String(e?.message || e).slice(0, 800),
        }, { onConflict: 'r2_key' })
    }
  }

  const heroAgg = await upsertHeroAgg(supabase)
  console.log(JSON.stringify({
    scannedDbFiles: keys.length,
    pendingDbFiles: pending.length,
    filesDone,
    filesFailed,
    runsUpserted,
    heroAgg,
  }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

