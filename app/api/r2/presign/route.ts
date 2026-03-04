import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-plugin-key',
  'Cache-Control': 'no-store',
}

function sanitizeFileName(raw: string): string {
  const file = raw.split('/').pop() || raw
  return file.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'image.webp'
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  try {
    const pluginKey = process.env.PLUGIN_INGEST_KEY
    if (pluginKey) {
      const inputKey = request.headers.get('x-plugin-key')
      if (!inputKey || inputKey !== pluginKey) {
        return NextResponse.json({ error: '无效的插件密钥' }, { status: 401, headers: CORS_HEADERS })
      }
    }

    const r2AccountId = process.env.R2_ACCOUNT_ID
    const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID
    const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    const r2Bucket = process.env.R2_BUCKET
    const publicBase = process.env.R2_PUBLIC_BASE_URL || 'https://data.duang.work'

    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
      return NextResponse.json({ error: 'R2 环境变量未配置完整' }, { status: 500, headers: CORS_HEADERS })
    }

    const body = await request.json()
    const fileName = sanitizeFileName(String(body?.fileName || 'image.webp'))
    const contentType = String(body?.contentType || 'image/webp')
    const folder = String(body?.folder || 'match-records').replace(/^\/+|\/+$/g, '')

    const dateKey = new Date().toISOString().slice(0, 10)
    const key = `${folder}/${dateKey}/${randomUUID()}-${fileName}`

    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    })
    const command = new PutObjectCommand({
      Bucket: r2Bucket,
      Key: key,
      ContentType: contentType,
    })
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 })

    return NextResponse.json({
      key,
      uploadUrl,
      publicUrl: `${publicBase.replace(/\/+$/, '')}/${key}`,
      expiresIn: 300,
    }, { headers: CORS_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '生成上传链接失败' }, { status: 500, headers: CORS_HEADERS })
  }
}
