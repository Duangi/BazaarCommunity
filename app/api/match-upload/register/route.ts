import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabaseClient'

export const runtime = 'nodejs'

type RegisterEntry = {
  battleId: string
  sourceUserId?: string
  r2Key?: string
  manifestKey?: string
  dbKey?: string
}

type RegisterBody = {
  entries?: RegisterEntry[]
}

function normalizeEntries(input: any): RegisterEntry[] {
  if (!Array.isArray(input)) return []
  const out: RegisterEntry[] = []
  input.forEach((x) => {
    const battleId = String(x?.battleId || '').trim()
    if (!battleId) return
    out.push({
      battleId,
      sourceUserId: String(x?.sourceUserId || '').trim() || undefined,
      r2Key: String(x?.r2Key || '').trim() || undefined,
      manifestKey: String(x?.manifestKey || '').trim() || undefined,
      dbKey: String(x?.dbKey || '').trim() || undefined,
    })
  })
  return out.slice(0, 8000)
}

export async function POST(request: NextRequest) {
  const service = createSupabaseServiceClient()
  if (!service) {
    return NextResponse.json({ error: 'Supabase Service Role 未配置' }, { status: 500 })
  }
  try {
    const body = (await request.json()) as RegisterBody
    const entries = normalizeEntries(body?.entries)
    if (entries.length === 0) {
      return NextResponse.json({ inserted: 0, updated: 0 })
    }

    const rows = entries.map((e) => ({
      battle_id: e.battleId,
      source_user_id: e.sourceUserId || null,
      r2_key: e.r2Key || null,
      manifest_key: e.manifestKey || null,
      db_key: e.dbKey || null,
      updated_at: new Date().toISOString(),
    }))

    const { data, error } = await service
      .from('community_bpp_battle_index')
      .upsert(rows, { onConflict: 'battle_id' })
      .select('battle_id')
    if (error) {
      return NextResponse.json({ error: error.message || '登记失败', code: error.code }, { status: 500 })
    }
    return NextResponse.json({ upserted: Array.isArray(data) ? data.length : rows.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '请求失败' }, { status: 500 })
  }
}

