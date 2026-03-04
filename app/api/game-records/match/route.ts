import { DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabaseClient'

export const runtime = 'nodejs'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-plugin-key',
  'Cache-Control': 'no-store',
}

function normalizeText(input: any): string {
  return String(input || '').trim()
}

function normalizeKey(raw: string): string {
  const key = String(raw || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  if (!key || key.includes('..')) return ''
  return key
}

function extractScreenshotObjectKey(rawUrl: string): string {
  const raw = normalizeText(rawUrl)
  if (!raw) return ''

  if (raw.startsWith('/api/r2/public')) {
    try {
      const parsed = new URL(raw, 'http://localhost')
      return normalizeKey(parsed.searchParams.get('key') || '')
    } catch {
      return ''
    }
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw)
      return normalizeKey(decodeURIComponent(parsed.pathname || ''))
    } catch {
      return ''
    }
  }

  return normalizeKey(raw)
}

async function loadRowsByMatch(service: any, authorUserId: string, matchId: string) {
  const queryBy = async (key: 'match_id' | 'matchId') => {
    const { data, error } = await service
      .from('community_game_records')
      .select('id,screenshot_url,meta')
      .eq('author_user_id', authorUserId)
      .contains('meta', { [key]: matchId })
      .limit(5000)
    return { data, error }
  }

  let result = await queryBy('match_id')
  if ((!result.data || result.data.length === 0) && !result.error) {
    result = await queryBy('matchId')
  }
  return result
}

async function deleteR2Objects(keys: string[]): Promise<{ deleted: number; error?: string }> {
  if (keys.length === 0) return { deleted: 0 }

  const r2AccountId = process.env.R2_ACCOUNT_ID
  const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID
  const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const r2Bucket = process.env.R2_BUCKET
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
    return { deleted: 0, error: 'R2 环境变量未配置完整' }
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  })

  try {
    await client.send(new DeleteObjectsCommand({
      Bucket: r2Bucket,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
        Quiet: true,
      },
    }))
    return { deleted: keys.length }
  } catch (error: any) {
    return { deleted: 0, error: error?.message || '删除 R2 对象失败' }
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  const service = createSupabaseServiceClient()
  if (!service) {
    return NextResponse.json({ error: 'Supabase Service Role 未配置' }, { status: 500, headers: CORS_HEADERS })
  }

  try {
    const body = await request.json()
    const authorUserId = normalizeText(body?.authorUserId)
    const matchId = normalizeText(body?.matchId)
    if (!authorUserId || !matchId) {
      return NextResponse.json({ error: 'authorUserId 与 matchId 不能为空' }, { status: 400, headers: CORS_HEADERS })
    }

    const { data, error } = await loadRowsByMatch(service, authorUserId, matchId)
    if (error) {
      return NextResponse.json({ error: error.message || '查询对局失败', code: error.code }, { status: 500, headers: CORS_HEADERS })
    }
    const rows = Array.isArray(data) ? data : []
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, deletedRecords: 0, deletedImages: 0 }, { headers: CORS_HEADERS })
    }

    const ids = rows.map((row: any) => String(row?.id || '').trim()).filter(Boolean)
    const imageKeys = Array.from(
      new Set(
        rows
          .map((row: any) => extractScreenshotObjectKey(String(row?.screenshot_url || '')))
          .filter(Boolean)
      )
    )

    const { error: delError } = await service
      .from('community_game_records')
      .delete()
      .in('id', ids)
      .eq('author_user_id', authorUserId)
    if (delError) {
      return NextResponse.json({ error: delError.message || '删除记录失败', code: delError.code }, { status: 500, headers: CORS_HEADERS })
    }

    const imageResult = await deleteR2Objects(imageKeys)
    return NextResponse.json({
      ok: true,
      deletedRecords: ids.length,
      deletedImages: imageResult.deleted,
      imageDeleteError: imageResult.error || null,
    }, { headers: CORS_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '请求失败' }, { status: 500, headers: CORS_HEADERS })
  }
}

