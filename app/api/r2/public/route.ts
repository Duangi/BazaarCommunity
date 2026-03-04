import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function normalizeKey(raw: string): string {
  const key = String(raw || '')
    .trim()
    .replace(/^\/+/, '')
  if (!key || key.includes('..')) return ''
  return key
}

function parseKeyFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(String(rawUrl || '').trim())
    return normalizeKey(decodeURIComponent(parsed.pathname || ''))
  } catch {
    return ''
  }
}

export async function GET(request: NextRequest) {
  const r2AccountId = process.env.R2_ACCOUNT_ID
  const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID
  const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const r2Bucket = process.env.R2_BUCKET

  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
    return NextResponse.json({ error: 'R2 环境变量未配置完整' }, { status: 500 })
  }

  const keyParam = request.nextUrl.searchParams.get('key') || ''
  const urlParam = request.nextUrl.searchParams.get('url') || ''
  const key = normalizeKey(keyParam) || parseKeyFromUrl(urlParam)
  if (!key) {
    return NextResponse.json({ error: '缺少有效 key' }, { status: 400 })
  }

  try {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    })

    const command = new GetObjectCommand({
      Bucket: r2Bucket,
      Key: key,
    })
    const signedUrl = await getSignedUrl(client, command, { expiresIn: 60 * 10 })

    const response = NextResponse.redirect(signedUrl, 302)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '读取截图失败' }, { status: 500 })
  }
}
