#!/usr/bin/env node
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const IMG_RE = /https:\/\/s\.bazaardb\.gg\/v1\/[^"'\s)]+?\.webp(?:\?v=\d+)?/gi

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1]
  return fallback
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function mustEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`缺少环境变量 ${name}`)
  return v
}

function toText(v) {
  return String(v ?? '').trim()
}

function typeToFolder(cardType) {
  const map = {
    Item: 'items',
    Skill: 'skills',
    CombatEncounter: 'monsters',
    EventEncounter: 'events',
  }
  return map[cardType] || 'other'
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function fileExists(file) {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

function extractImageUrls(html) {
  const found = html.match(IMG_RE) || []
  return Array.from(new Set(found))
}

function pickBestImage(urls) {
  if (!urls.length) return ''
  for (const m of ['@256.webp', '@400L.webp', '@400.webp']) {
    const hit = urls.find((x) => x.includes(m))
    if (hit) return hit
  }
  return urls[0]
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (/<title>Just a moment/i.test(text) || /cf-challenge|_cf_chl_opt/i.test(text)) {
    throw new Error('cloudflare_challenge')
  }
  return text
}

async function fetchBytes(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

async function runSyncDataScript(projectRoot, dumpFile) {
  return await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['scripts/sync_bazaardb_data.mjs', '--dump-file', dumpFile], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env,
    })
    p.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`sync_bazaardb_data.mjs 退出码 ${code}`))
    })
    p.on('error', reject)
  })
}

async function collectLocalFiles(dir, out = []) {
  const list = await fs.readdir(dir, { withFileTypes: true })
  for (const d of list) {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) await collectLocalFiles(p, out)
    else out.push(p)
  }
  return out
}

async function uploadBuffer(s3, bucket, key, buf, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
      CacheControl: contentType.startsWith('image/') ? 'public,max-age=2592000,immutable' : 'public,max-age=300',
    }),
  )
}

async function main() {
  const projectRoot = process.cwd()
  const dumpFile = arg('dump-file', '/Users/duang/Downloads/dump.zh-CN.json')
  const outRoot = arg('out-root', path.join(projectRoot, 'public/resources/bazaardb_site'))
  const r2Prefix = arg('r2-prefix', 'bazaardb')
  const maxWorkers = Number(arg('max-workers', '10')) || 10
  const limit = Number(arg('limit', '0')) || 0
  const skipUpload = hasFlag('skip-upload')

  if (!(await fileExists(dumpFile))) {
    throw new Error(`找不到 dump 文件: ${dumpFile}`)
  }

  await runSyncDataScript(projectRoot, dumpFile)

  const raw = await fs.readFile(dumpFile, 'utf8')
  const dump = JSON.parse(raw)
  if (!dump || typeof dump !== 'object' || Array.isArray(dump)) {
    throw new Error('dump 文件结构不正确：需要顶层 object')
  }

  const imagesBase = path.join(outRoot, 'images_site')
  const mapPath = path.join(outRoot, 'site_image_map.json')
  const failPath = path.join(outRoot, 'site_image_failures.json')
  await ensureDir(imagesBase)

  let entries = Object.entries(dump).filter(([, rec]) => rec && typeof rec === 'object')
  if (limit > 0) entries = entries.slice(0, limit)
  const results = []
  let index = 0
  let active = 0

  async function worker() {
    while (true) {
      const i = index++
      if (i >= entries.length) return
      const [cardId, rec] = entries[i]
      active += 1
      try {
        const type = toText(rec.Type)
        const title = toText(rec.Title)
        const folder = typeToFolder(type)
        const outDir = path.join(imagesBase, folder)
        await ensureDir(outDir)
        const outFile = path.join(outDir, `${cardId}.webp`)
        const shortlink = toText(rec.Shortlink)
        const fallback = `https://bazaardb.gg/card/${cardId}`
        let pageUrl = shortlink || fallback
        let status = ''
        let imageUrl = ''
        let imageCandidates = 0
        let error = ''

        const exists = await fileExists(outFile)
        if (exists) {
          status = 'exists'
        } else {
          try {
            let html = await fetchText(pageUrl)
            let urls = extractImageUrls(html)
            if (!urls.length && pageUrl !== fallback) {
              pageUrl = fallback
              html = await fetchText(pageUrl)
              urls = extractImageUrls(html)
            }
            imageCandidates = urls.length
            if (!urls.length) {
              status = 'no_image_url'
            } else {
              imageUrl = pickBestImage(urls)
              const bytes = await fetchBytes(imageUrl)
              await fs.writeFile(outFile, bytes)
              status = 'downloaded'
            }
          } catch (e) {
            status = 'error'
            error = String(e?.message || e)
          }
        }

        results.push({
          id: cardId,
          title,
          type,
          file: path.relative(outRoot, outFile).replace(/\\/g, '/'),
          page_url: pageUrl,
          image_url: imageUrl,
          image_candidates: imageCandidates,
          status,
          error,
        })
      } finally {
        active -= 1
        const done = results.length
        if (done % 100 === 0 || done === entries.length) {
          console.log(`image progress: ${done}/${entries.length} (active=${active})`)
        }
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, maxWorkers) }, () => worker())
  await Promise.all(workers)

  const siteMap = {}
  const failures = []
  for (const r of results) {
    const full = path.join(outRoot, r.file)
    const ok = await fileExists(full)
    if (ok && (r.status === 'downloaded' || r.status === 'exists')) {
      siteMap[r.id] = {
        id: r.id,
        title: r.title,
        type: r.type,
        file: r.file,
        image_url: r.image_url,
        page_url: r.page_url,
        status: r.status,
      }
    } else {
      failures.push(r)
    }
  }

  await ensureDir(outRoot)
  await fs.writeFile(mapPath, JSON.stringify(siteMap, null, 2), 'utf8')
  await fs.writeFile(failPath, JSON.stringify(failures, null, 2), 'utf8')
  console.log(`site map: ${mapPath}`)
  console.log(`site failures: ${failPath}`)

  if (skipUpload) {
    console.log('skip-upload 模式，未上传 R2')
    return
  }

  const accountId = mustEnv('R2_ACCOUNT_ID')
  const accessKeyId = mustEnv('R2_ACCESS_KEY_ID')
  const secretAccessKey = mustEnv('R2_SECRET_ACCESS_KEY')
  const bucket = mustEnv('R2_BUCKET')

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  const uploadList = []
  const imagesList = await collectLocalFiles(imagesBase)
  imagesList.forEach((f) => uploadList.push(f))
  uploadList.push(mapPath, failPath)
  const syncedItems = path.join(projectRoot, 'public/resources/bazaardb/items_db.json')
  const syncedSkills = path.join(projectRoot, 'public/resources/bazaardb/skills_db.json')
  const idBridgeMap = path.join(projectRoot, 'public/resources/json/id_bridge_map.json')
  const idMapV1 = path.join(projectRoot, 'public/resources/json/id_map_v1.json')
  if (await fileExists(syncedItems)) uploadList.push(syncedItems)
  if (await fileExists(syncedSkills)) uploadList.push(syncedSkills)
  if (await fileExists(idBridgeMap)) uploadList.push(idBridgeMap)
  if (await fileExists(idMapV1)) uploadList.push(idMapV1)

  let uploaded = 0
  for (const file of uploadList) {
    const rel =
      file.startsWith(imagesBase)
        ? path.relative(imagesBase, file).replace(/\\/g, '/')
        : file === mapPath
          ? 'site_image_map.json'
          : file === failPath
            ? 'site_image_failures.json'
            : file.endsWith('items_db.json')
              ? 'items_db.json'
              : file.endsWith('skills_db.json')
                ? 'skills_db.json'
                : file.endsWith('id_bridge_map.json')
                  ? 'id_bridge_map.json'
                  : 'id_map_v1.json'
    const key = `${r2Prefix}/${rel}`
    const buf = await fs.readFile(file)
    const ext = path.extname(file).toLowerCase()
    const contentType = ext === '.webp' ? 'image/webp' : 'application/json; charset=utf-8'
    await uploadBuffer(s3, bucket, key, buf, contentType)
    uploaded += 1
    if (uploaded % 100 === 0 || uploaded === uploadList.length) {
      console.log(`upload progress: ${uploaded}/${uploadList.length}`)
    }
  }

  const publicBase = toText(process.env.R2_PUBLIC_BASE_URL || 'https://data.duang.work').replace(/\/+$/, '')
  console.log('全部完成')
  console.log(`建议网页读取：${publicBase}/${r2Prefix}/items_db.json`)
  console.log(`建议网页读取：${publicBase}/${r2Prefix}/skills_db.json`)
  console.log(`建议网页读取：${publicBase}/${r2Prefix}/site_image_map.json`)
  if (await fileExists(idBridgeMap)) console.log(`建议网页读取：${publicBase}/${r2Prefix}/id_bridge_map.json`)
  if (await fileExists(idMapV1)) console.log(`建议网页读取：${publicBase}/${r2Prefix}/id_map_v1.json`)
}

main().catch((e) => {
  console.error('[sync_bazaardb_to_r2] 失败:', e?.message || e)
  process.exit(1)
})
