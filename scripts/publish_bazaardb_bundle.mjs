#!/usr/bin/env node
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const ROOT = process.cwd()

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1]
  return fallback
}

function mustEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`missing env: ${name}`)
  return v
}

async function fileInfo(absPath) {
  const buf = await fs.readFile(absPath)
  const st = await fs.stat(absPath)
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
  return { buf, bytes: st.size, mtime: st.mtime.toISOString(), sha256 }
}

function pickVersion(itemsSha, now = new Date()) {
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const hh = String(now.getUTCHours()).padStart(2, '0')
  const min = String(now.getUTCMinutes()).padStart(2, '0')
  return `v${yyyy}${mm}${dd}${hh}${min}-${itemsSha.slice(0, 8)}`
}

async function uploadJson(s3, bucket, key, body) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'public,max-age=300',
    }),
  )
}

async function main() {
  const prefix = String(arg('prefix', 'bazaardb')).replace(/^\/+|\/+$/g, '')
  const publicBase = String(process.env.R2_PUBLIC_BASE_URL || 'https://records.duang.work').replace(/\/+$/, '')

  const itemsPath = path.join(ROOT, 'public/resources/bazaardb/items_db.json')
  const skillsPath = path.join(ROOT, 'public/resources/bazaardb/skills_db.json')
  const idMinPath = path.join(ROOT, 'public/resources/json/id_map_min.json')

  const [items, skills, idMin] = await Promise.all([
    fileInfo(itemsPath),
    fileInfo(skillsPath),
    fileInfo(idMinPath).catch(() => null),
  ])

  const nowIso = new Date().toISOString()
  const version = pickVersion(items.sha256)

  const manifest = {
    version,
    updated_at: nowIso,
    files: {
      items_db: {
        key: `${prefix}/items_db.json`,
        url: `${publicBase}/${prefix}/items_db.json`,
        bytes: items.bytes,
        sha256: items.sha256,
        mtime: items.mtime,
      },
      skills_db: {
        key: `${prefix}/skills_db.json`,
        url: `${publicBase}/${prefix}/skills_db.json`,
        bytes: skills.bytes,
        sha256: skills.sha256,
        mtime: skills.mtime,
      },
      ...(idMin
        ? {
            id_map_min: {
              key: `${prefix}/id_map_min.json`,
              url: `${publicBase}/${prefix}/id_map_min.json`,
              bytes: idMin.bytes,
              sha256: idMin.sha256,
              mtime: idMin.mtime,
            },
          }
        : {}),
    },
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

  await uploadJson(s3, bucket, `${prefix}/items_db.json`, items.buf)
  await uploadJson(s3, bucket, `${prefix}/skills_db.json`, skills.buf)
  if (idMin) await uploadJson(s3, bucket, `${prefix}/id_map_min.json`, idMin.buf)
  await uploadJson(s3, bucket, `${prefix}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))

  console.log(JSON.stringify({ ok: true, prefix, manifest_url: `${publicBase}/${prefix}/manifest.json`, version }, null, 2))
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exit(1)
})

