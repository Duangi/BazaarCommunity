import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabaseClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function clampLimit(raw: string | null): number {
  const n = Number(raw || 10)
  if (!Number.isFinite(n)) return 10
  return Math.max(1, Math.min(50, Math.floor(n)))
}

export async function GET(request: NextRequest) {
  const service = createSupabaseServiceClient()
  if (!service) return NextResponse.json({ error: 'Supabase Service Role 未配置' }, { status: 500 })
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  const projectHost = supabaseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')

  try {
    const { searchParams } = request.nextUrl
    const keyword = String(searchParams.get('q') || searchParams.get('playerName') || '').trim()
    const limit = clampLimit(searchParams.get('limit'))
    if (!keyword) {
      return NextResponse.json({ rows: [], count: 0, tenWinCount: 0, keyword: '' })
    }

    let query = service
      .from('community_bpp_runs')
      .select(
        'run_id,player_account_id,player_name,hero,game_mode,started_at_utc,ended_at_utc,final_day,final_hour,victories,losses,status,reason,source_r2_key',
      )
      .order('ended_at_utc', { ascending: false, nullsFirst: false })
      .order('started_at_utc', { ascending: false, nullsFirst: false })
      .limit(limit)

    query = query.or(`player_name.ilike.%${keyword}%,player_account_id.ilike.%${keyword}%`)

    const { data, error } = await query
    if (error) throw error

    const rows = (data || []).map((row: any) => {
      const victories = Number(row?.victories || 0)
      const losses = Number(row?.losses || 0)
      return {
        ...row,
        victories,
        losses,
        isTenWin: victories >= 10,
      }
    })

    return NextResponse.json({
      rows,
      count: rows.length,
      tenWinCount: rows.filter((x) => x.isTenWin).length,
      keyword,
    })
  } catch (e: any) {
    const msg = String(e?.message || '读取玩家对局失败')
    if (String(e?.code || '') === 'PGRST205' || msg.includes('schema cache')) {
      return NextResponse.json(
        {
          error:
            '对局分析表不存在（或当前环境变量指向了另一个 Supabase 项目）。请先执行 supabase/bpp_analytics_schema.sql 并确认 URL/KEY 为同一项目。',
          detail: msg,
          projectHost,
        },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: msg, projectHost }, { status: 500 })
  }
}
