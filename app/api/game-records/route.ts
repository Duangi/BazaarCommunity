import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabaseClient'

export const runtime = 'nodejs'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-plugin-key',
  'Cache-Control': 'no-store',
}

type RecordPayload = {
  authorUserId: string
  authorName: string
  playedOn: string
  result: 'win' | 'lose'
  dayIndex: number
  screenshotUrl: string
  note?: string
  meta?: any
}

type ExistingRecordRow = {
  id: string
  day_index: number
  result: 'win' | 'lose'
  played_on: string
  meta: any
}

function normalizeDate(raw: string): string {
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function validate(body: any): { ok: boolean; payload?: RecordPayload; message?: string } {
  const authorUserId = String(body?.authorUserId || '').trim()
  const authorName = String(body?.authorName || '').trim()
  const screenshotUrl = String(body?.screenshotUrl || '').trim()
  const resultRaw = String(body?.result || '').toLowerCase()
  const result: 'win' | 'lose' = resultRaw === 'lose' ? 'lose' : 'win'
  const dayIndex = Number(body?.dayIndex || 1)
  const playedOn = normalizeDate(String(body?.playedOn || new Date().toISOString()))

  if (!authorUserId) return { ok: false, message: 'authorUserId 不能为空' }
  if (!authorName) return { ok: false, message: 'authorName 不能为空' }
  if (!screenshotUrl) return { ok: false, message: 'screenshotUrl 不能为空' }
  if (!Number.isFinite(dayIndex) || dayIndex < 1 || dayIndex > 30) {
    return { ok: false, message: 'dayIndex 不合法' }
  }

  return {
    ok: true,
    payload: {
      authorUserId,
      authorName,
      playedOn,
      result,
      dayIndex,
      screenshotUrl,
      note: String(body?.note || '').slice(0, 300),
      meta: body?.meta || null,
    },
  }
}

function normalizeText(input: any): string {
  return String(input || '').trim()
}

function extractMetaValue(meta: any, keys: string[]): string {
  if (!meta || typeof meta !== 'object') return ''
  for (const key of keys) {
    const value = normalizeText((meta as any)?.[key])
    if (value) return value
  }
  return ''
}

function sameBattleByMeta(aMeta: any, bMeta: any): boolean {
  const aMatchId = extractMetaValue(aMeta, ['match_id', 'matchId'])
  const bMatchId = extractMetaValue(bMeta, ['match_id', 'matchId'])
  if (!aMatchId || !bMatchId || aMatchId !== bMatchId) return false
  const aBattleStart = extractMetaValue(aMeta, ['battle_start_time', 'battleStartTime', 'start_time'])
  const bBattleStart = extractMetaValue(bMeta, ['battle_start_time', 'battleStartTime', 'start_time'])
  if (aBattleStart && bBattleStart) return aBattleStart === bBattleStart
  return true
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  const pluginKey = process.env.PLUGIN_INGEST_KEY
  if (pluginKey) {
    const inputKey = request.headers.get('x-plugin-key')
    if (!inputKey || inputKey !== pluginKey) {
      return NextResponse.json({ error: '无效的插件密钥' }, { status: 401, headers: CORS_HEADERS })
    }
  }

  const service = createSupabaseServiceClient()
  if (!service) {
    return NextResponse.json({ error: 'Supabase Service Role 未配置' }, { status: 500, headers: CORS_HEADERS })
  }

  try {
    const body = await request.json()
    const checked = validate(body)
    if (!checked.ok || !checked.payload) {
      return NextResponse.json({ error: checked.message || '参数不合法' }, { status: 400, headers: CORS_HEADERS })
    }

    const payload = checked.payload
    const payloadMatchId = extractMetaValue(payload.meta, ['match_id', 'matchId'])
    if (payloadMatchId) {
      const { data: existingRows, error: queryError } = await service
        .from('community_game_records')
        .select('id,day_index,result,played_on,meta')
        .eq('author_user_id', payload.authorUserId)
        .eq('day_index', payload.dayIndex)
        .eq('result', payload.result)
        .eq('played_on', payload.playedOn)
        .limit(50)
      if (queryError) {
        return NextResponse.json({ error: queryError.message || '查询去重失败', code: queryError.code }, { status: 500, headers: CORS_HEADERS })
      }
      const duplicated = (existingRows || []).find((row) => sameBattleByMeta(row.meta, payload.meta))
      if (duplicated) {
        return NextResponse.json({ ok: true, duplicated: true, id: duplicated.id }, { headers: CORS_HEADERS })
      }
    }

    const { data, error } = await service
      .from('community_game_records')
      .insert({
        author_user_id: payload.authorUserId,
        author_name: payload.authorName,
        played_on: payload.playedOn,
        result: payload.result,
        day_index: payload.dayIndex,
        screenshot_url: payload.screenshotUrl,
        note: payload.note || null,
        meta: payload.meta || null,
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message || '入库失败', code: error.code }, { status: 500, headers: CORS_HEADERS })
    }

    return NextResponse.json({ ok: true, id: data?.id || null }, { headers: CORS_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '请求失败' }, { status: 500, headers: CORS_HEADERS })
  }
}
