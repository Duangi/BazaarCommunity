#!/usr/bin/env node
import fs from 'fs/promises'
import path from 'path'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const PROJECT_ROOT = process.cwd()
const DEFAULT_IN = path.join(PROJECT_ROOT, 'public/resources/json/id_map_v1.json')
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'public/resources/json/id_map_min.json')

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
  if (!v) throw new Error(`missing env: ${name}`)
  return v
}

function pickPrimaryImageUrl(kind, sourceId, templateId) {
  const source = String(sourceId || '').trim()
  const tid = String(templateId || '').trim()
  const base = 'https://data.duang.work'
  if (kind === 'skill') {
    if (source) return `${base}/images/skill/${source}.webp`
    return `${base}/images/skill/${tid}.webp`
  }
  if (source) return `${base}/images/card/${source}.webp`
  return `${base}/images/card/${tid}.webp`
}

async function main() {
  const inFile = arg('in', DEFAULT_IN)
  const outFile = arg('out', DEFAULT_OUT)
  const upload = hasFlag('upload')
  const r2Prefix = String(arg('r2-prefix', 'bazaardb')).replace(/^\/+|\/+$/g, '')
  const publicBase = String(process.env.R2_PUBLIC_BASE_URL || 'https://records.duang.work').replace(/\/+$/, '')

  const raw = await fs.readFile(inFile, 'utf8')
  const src = JSON.parse(raw)
  const records = src?.records && typeof src.records === 'object' ? src.records : {}

  const map = {}
  for (const [templateId, row] of Object.entries(records)) {
    const sourceId = String(row?.source_id || '').trim()
    const kind = String(row?.kind || 'item').trim()
    map[templateId] = {
      source_id: sourceId,
      image_url: pickPrimaryImageUrl(kind, sourceId, templateId),
    }
  }

  const out = {
    version: 1,
    generated_at: new Date().toISOString(),
    count: Object.keys(map).length,
    map,
  }

  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, JSON.stringify(out, null, 2), 'utf8')
  console.log(`wrote: ${path.relative(PROJECT_ROOT, outFile)}`)
  console.log(`count: ${out.count}`)

  if (!upload) return

  const accountId = mustEnv('R2_ACCOUNT_ID')
  const accessKeyId = mustEnv('R2_ACCESS_KEY_ID')
  const secretAccessKey = mustEnv('R2_SECRET_ACCESS_KEY')
  const bucket = mustEnv('R2_BUCKET')

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  const key = `${r2Prefix}/id_map_min.json`
  const buf = await fs.readFile(outFile)
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'public,max-age=300',
    }),
  )

  console.log(`uploaded: ${key}`)
  console.log(`url: ${publicBase}/${key}`)
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exit(1)
})

