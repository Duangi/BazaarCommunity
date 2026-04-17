#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const DEFAULT_DIR = path.join(PROJECT_ROOT, 'tmp', 'lineup-index')

function parseArgs(argv) {
  const out = {
    dir: DEFAULT_DIR,
    prefix: 'analytics/v1',
  }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dir') out.dir = argv[++i] || out.dir
    else if (a === '--prefix') out.prefix = (argv[++i] || out.prefix).replace(/^\/+|\/+$/g, '')
  }
  return out
}

function must(name) {
  const v = process.env[name]
  if (!v) throw new Error(`missing env: ${name}`)
  return v
}

function walkFiles(dir) {
  const out = []
  const stack = [dir]
  while (stack.length > 0) {
    const cur = stack.pop()
    const ents = fs.readdirSync(cur, { withFileTypes: true })
    for (const ent of ents) {
      const full = path.join(cur, ent.name)
      if (ent.isDirectory()) stack.push(full)
      else if (ent.isFile()) out.push(full)
    }
  }
  return out
}

function findLatestVersionDir(rootDir) {
  if (!fs.existsSync(rootDir)) throw new Error(`index dir not found: ${rootDir}`)
  const dirs = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('v-'))
    .map((d) => d.name)
    .sort()
  if (dirs.length === 0) throw new Error(`no version dir found under: ${rootDir}`)
  return path.join(rootDir, dirs[dirs.length - 1])
}

async function main() {
  const args = parseArgs(process.argv)
  const accountId = must('R2_ACCOUNT_ID')
  const accessKeyId = must('R2_ACCESS_KEY_ID')
  const secretAccessKey = must('R2_SECRET_ACCESS_KEY')
  const bucket = must('R2_BUCKET')
  const publicBase = String(process.env.R2_PUBLIC_BASE_URL || 'https://data.duang.work').replace(/\/+$/, '')

  const versionDir = findLatestVersionDir(args.dir)
  const files = walkFiles(versionDir)

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  let done = 0
  for (const file of files) {
    const rel = path.relative(versionDir, file).replace(/\\/g, '/')
    const key = `${args.prefix}/${rel}`
    const body = fs.readFileSync(file)
    const contentType = file.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream'
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=300',
    }))
    done += 1
    if (done % 500 === 0) console.log(`uploaded ${done}/${files.length}`)
  }

  const manifestUrl = `${publicBase}/${args.prefix}/manifest.json`
  console.log(JSON.stringify({
    ok: true,
    uploaded: done,
    total: files.length,
    prefix: args.prefix,
    manifest_url: manifestUrl,
  }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

