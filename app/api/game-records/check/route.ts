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

function extractMetaValue(meta: any, keys: string[]): string {
  if (!meta || typeof meta !== 'object') return ''
  for (const key of keys) {
    const value = normalizeText((meta as any)?.[key])
    if (value) return value
  }
  return ''
}

function buildBattleKey(matchId: string, dayIndex: number, battleStart: string, result: string): string {
  return `${matchId}::${dayIndex}::${battleStart}::${result}`
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
    const authorUserId = normalizeText(body?.authorUserId)
    const matchIdsInput = Array.isArray(body?.matchIds) ? body.matchIds : []
    const matchIds = Array.from(new Set(matchIdsInput.map((x: any) => normalizeText(x)).filter(Boolean)))

    if (!authorUserId) {
      return NextResponse.json({ error: 'authorUserId 不能为空' }, { status: 400, headers: CORS_HEADERS })
    }
    if (matchIds.length === 0) {
      return NextResponse.json({
        ok: true,
        existingMatchIds: [],
        existingBattleKeys: [],
      }, { headers: CORS_HEADERS })
    }

    const { data, error } = await service
      .from('community_game_records')
      .select('day_index,result,meta')
      .eq('author_user_id', authorUserId)
      .limit(5000)
    if (error) {
      return NextResponse.json({ error: error.message || '查询失败', code: error.code }, { status: 500, headers: CORS_HEADERS })
    }

    const matchSet = new Set(matchIds)
    const existingMatchSet = new Set<string>()
    const existingBattleKeys = new Set<string>()

    for (const row of data || []) {
      const matchId = extractMetaValue(row?.meta, ['match_id', 'matchId'])
      if (!matchId || !matchSet.has(matchId)) continue
      existingMatchSet.add(matchId)
      const battleStart = extractMetaValue(row?.meta, ['battle_start_time', 'battleStartTime', 'start_time'])
      const key = buildBattleKey(
        matchId,
        Number(row?.day_index || 0),
        battleStart,
        normalizeText(row?.result || '').toLowerCase()
      )
      existingBattleKeys.add(key)
    }

    return NextResponse.json({
      ok: true,
      existingMatchIds: Array.from(existingMatchSet),
      existingBattleKeys: Array.from(existingBattleKeys),
    }, { headers: CORS_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '请求失败' }, { status: 500, headers: CORS_HEADERS })
  }
}

