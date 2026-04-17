import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabaseClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const service = createSupabaseServiceClient()
  if (!service) return NextResponse.json({ error: 'Supabase Service Role 未配置' }, { status: 500 })
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  const projectHost = supabaseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')

  try {
    const [{ count: runsCount, error: runErr }, { count: filesCount, error: fileErr }, { data: heroes, error: heroErr }] = await Promise.all([
      service.from('community_bpp_runs').select('*', { count: 'exact', head: true }),
      service.from('community_bpp_ingest_files').select('*', { count: 'exact', head: true }),
      service.from('community_bpp_hero_agg').select('*').order('total_runs', { ascending: false }),
    ])
    if (runErr) throw runErr
    if (fileErr) throw fileErr
    if (heroErr) throw heroErr

    return NextResponse.json({
      runsCount: Number(runsCount || 0),
      ingestFilesCount: Number(filesCount || 0),
      heroAgg: heroes || [],
    })
  } catch (e: any) {
    const msg = String(e?.message || '读取聚合失败')
    if (String(e?.code || '') === 'PGRST205' || msg.includes('schema cache')) {
      return NextResponse.json(
        {
          error:
            '分析表不存在（或当前环境变量指向了另一个 Supabase 项目）。请先执行 supabase/bpp_analytics_schema.sql 并确认 URL/KEY 为同一项目。',
          detail: msg,
          projectHost,
        },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: msg, projectHost }, { status: 500 })
  }
}
