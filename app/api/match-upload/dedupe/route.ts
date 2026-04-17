import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabaseClient'

export const runtime = 'nodejs'

type DedupeBody = {
  battleIds?: string[]
}

function uniqBattleIds(input: any): string[] {
  if (!Array.isArray(input)) return []
  const set = new Set<string>()
  const valid = /^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  input.forEach((x) => {
    const id = String(x || '').trim()
    if (!id) return
    if (!valid.test(id)) return
    set.add(id)
  })
  return Array.from(set).slice(0, 5000)
}

export async function POST(request: NextRequest) {
  const service = createSupabaseServiceClient()
  if (!service) {
    return NextResponse.json({ error: 'Supabase Service Role 未配置' }, { status: 500 })
  }
  try {
    const body = (await request.json()) as DedupeBody
    const battleIds = uniqBattleIds(body?.battleIds)
    if (battleIds.length === 0) {
      return NextResponse.json({ existingBattleIds: [] })
    }
    const existing = new Set<string>()
    for (let i = 0; i < battleIds.length; i += 200) {
      const chunk = battleIds.slice(i, i + 200)
      const { data, error } = await service
        .from('community_bpp_battle_index')
        .select('battle_id')
        .in('battle_id', chunk)
      if (error) {
        return NextResponse.json({ error: error.message || '查重失败', code: error.code }, { status: 500 })
      }
      ;(data || []).forEach((x: any) => {
        const id = String(x?.battle_id || '').trim()
        if (id) existing.add(id)
      })
    }
    return NextResponse.json({ existingBattleIds: Array.from(existing) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '请求失败' }, { status: 500 })
  }
}
