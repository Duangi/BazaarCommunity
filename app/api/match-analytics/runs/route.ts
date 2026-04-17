import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabaseClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function clampLimit(raw: string | null): number {
  const n = Number(raw || 600)
  if (!Number.isFinite(n)) return 600
  return Math.max(1, Math.min(2000, Math.floor(n)))
}

export async function GET(request: NextRequest) {
  const service = createSupabaseServiceClient()
  if (!service) return NextResponse.json({ error: 'Supabase Service Role 未配置' }, { status: 500 })

  try {
    const limit = clampLimit(request.nextUrl.searchParams.get('limit'))
    const { data, error } = await service
      .from('community_bpp_runs')
      .select(
        'run_id,player_account_id,player_name,hero,game_mode,started_at_utc,ended_at_utc,final_day,final_hour,victories,losses,status,reason,source_r2_key',
      )
      .order('ended_at_utc', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (error) throw error
    return NextResponse.json({ items: data || [], count: Array.isArray(data) ? data.length : 0 })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || '读取 runs 失败') }, { status: 500 })
  }
}
