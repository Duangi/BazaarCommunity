import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { CommunityBuild, CommunityRatingShare, BuildCardRole } from '@/lib/communityBuilds'

type PublisherProfile = {
  nickname: string
  useBilibili: boolean
  bilibiliUid?: string
}

type InteractionType = 'like' | 'favorite'
type TargetType = 'lineup' | 'rating'

type LineupSnapshot = {
  hero?: string
  lineupName?: string
  dayStart?: number
  dayEnd?: number
  dayPlanTag?: '连胜早走' | '北伐阵容'
  strengthTag?: '版本强势' | '中规中矩' | '地沟油'
  difficultyTag?: '容易成型' | '比较困难' | '极难成型'
  videoBv?: string
  videoTitle?: string
  segments?: any[]
}

function extractSpecialSlots(snapshot: LineupSnapshot | any): Array<{ slot: number; type: 'fire' | 'ice' }> {
  const segments = Array.isArray(snapshot?.segments) ? snapshot.segments : []
  if (segments.length === 0) return []
  const maxDaySeg = [...segments].sort((a, b) => (b?.dayTo || 0) - (a?.dayTo || 0))[0]
  const slots = Array.isArray(maxDaySeg?.specialSlots) ? maxDaySeg.specialSlots : []
  return slots
    .map((s: any) => ({
      slot: Number(s?.slot),
      type: s?.type === 'ice' ? 'ice' : 'fire',
    }))
    .filter((s: { slot: number; type: 'fire' | 'ice' }) => Number.isInteger(s.slot) && s.slot >= 0 && s.slot < 10)
}

let cachedClient: SupabaseClient | null = null

function generateUuid(): string {
  const cryptoObj = (globalThis as any)?.crypto
  if (typeof cryptoObj?.randomUUID === 'function') return cryptoObj.randomUUID()
  if (typeof cryptoObj?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    cryptoObj.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `uuid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  cachedClient = createClient(url, anonKey)
  return cachedClient
}

function computeCardsData(snapshot: LineupSnapshot): CommunityBuild['cards_data'] {
  const segments = Array.isArray(snapshot.segments) ? snapshot.segments : []
  if (segments.length === 0) return []

  const maxDaySeg = [...segments].sort((a, b) => (b?.dayTo || 0) - (a?.dayTo || 0))[0]
  const build = maxDaySeg?.builds?.[0]
  const cards = Array.isArray(build?.cards) ? build.cards : []
  const coreIds = new Set(Array.isArray(build?.corePlacementIds) ? build.corePlacementIds : [])
  const subIds = new Set(Array.isArray(build?.secondaryPlacementIds) ? build.secondaryPlacementIds : [])

  return cards
    .map((card: any, index: number) => {
      const placementId = String(card?.placementId || '')
      let role: BuildCardRole = 'tech'
      if (coreIds.has(placementId)) role = 'core'
      else if (subIds.has(placementId)) role = 'sub'
      return {
        id: String(card?.item?.id || ''),
        role,
        pos: Number(card?.start ?? index) + 1,
      }
    })
    .filter((x: { id: string }) => !!x.id)
}

function mapRowToBuild(row: any): CommunityBuild {
  return {
    id: row.uuid,
    name: row.name || '未命名阵容',
    hero: row.hero || 'Pygmalien',
    dayPlanTag: row.day_plan_tag || undefined,
    strengthTag: row.strength_tag || undefined,
    difficultyTag: row.difficulty_tag || undefined,
    dayFrom: Number(row.day_from || 1),
    dayTo: Number(row.day_to || 13),
    version: row.version || 'web-v1',
    likes: Number(row.likes_count || 0),
    favorites: Number(row.favorites_count || 0),
    rating: Number(row.rating_score || 0),
    publishedAt: row.created_at || new Date().toISOString(),
    cards_data: Array.isArray(row.cards_data) ? row.cards_data : [],
    notes: row.notes || '',
    authorName: row.author_name || '',
    authorBilibiliUid: row.author_bilibili_uid || '',
    videoBv: row.video_bv || '',
    videoTitle: row.video_title || '',
    snapshot: row.lineup_payload || null,
    specialSlots: Array.isArray(row.special_slots) ? row.special_slots : extractSpecialSlots(row.lineup_payload),
  }
}

function mapRowToRating(row: any): CommunityRatingShare {
  return {
    id: row.uuid,
    name: row.name || '未命名评分',
    likes: Number(row.likes_count || 0),
    favorites: Number(row.favorites_count || 0),
    publishedAt: row.created_at || new Date().toISOString(),
    authorName: row.author_name || '',
    authorBilibiliUid: row.author_bilibili_uid || '',
    ratingPayload: row.rating_payload || null,
  }
}

export async function fetchCommunityLineups(): Promise<CommunityBuild[]> {
  const client = getClient()
  if (!client) return []

  const { data, error } = await client
    .from('community_lineups')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error || !Array.isArray(data)) return []
  return data.map(mapRowToBuild)
}

export async function fetchCommunityRatings(): Promise<CommunityRatingShare[]> {
  const client = getClient()
  if (!client) return []
  const { data, error } = await client
    .from('community_ratings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error || !Array.isArray(data)) return []
  return data.map(mapRowToRating)
}

export async function publishLineup(snapshot: LineupSnapshot, profile: PublisherProfile): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('Supabase 未配置')

  const uuid = generateUuid()
  const payload = {
    uuid,
    name: snapshot.lineupName?.trim() || `${snapshot.hero || 'Unknown'} Day${snapshot.dayStart || 1}-Day${snapshot.dayEnd || 13}`,
    hero: snapshot.hero || 'Pygmalien',
    day_from: Number(snapshot.dayStart || 1),
    day_to: Number(snapshot.dayEnd || 13),
    day_plan_tag: snapshot.dayPlanTag || null,
    strength_tag: snapshot.strengthTag || null,
    difficulty_tag: snapshot.difficultyTag || null,
    cards_data: computeCardsData(snapshot),
    lineup_payload: snapshot,
    version: 'web-v1',
    likes_count: 0,
    favorites_count: 0,
    rating_score: 0,
    author_name: profile.nickname,
    author_bilibili_uid: profile.useBilibili ? (profile.bilibiliUid || null) : null,
    video_bv: snapshot.videoBv?.trim() || null,
    video_title: snapshot.videoTitle?.trim() || null,
    special_slots: extractSpecialSlots(snapshot),
    notes: null,
  }
  const { error } = await client.from('community_lineups').insert(payload)
  if (error) throw error
  return uuid
}

export async function publishRating(snapshot: any, profile: PublisherProfile): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('Supabase 未配置')
  const uuid = generateUuid()
  const { error } = await client.from('community_ratings').insert({
    uuid,
    name: snapshot?.name || `评分 ${new Date().toISOString()}`,
    rating_payload: snapshot,
    likes_count: 0,
    favorites_count: 0,
    author_name: profile.nickname,
    author_bilibili_uid: profile.useBilibili ? (profile.bilibiliUid || null) : null,
  })
  if (error) throw error
  return uuid
}

async function recountAndUpdate(
  client: SupabaseClient,
  targetType: TargetType,
  targetUuid: string,
  interactionType: InteractionType
): Promise<number> {
  const { count } = await client
    .from('community_interactions')
    .select('*', { count: 'exact', head: true })
    .eq('target_uuid', targetUuid)
    .eq('target_type', targetType)
    .eq('interaction_type', interactionType)

  const total = Number(count || 0)
  const table = targetType === 'lineup' ? 'community_lineups' : 'community_ratings'
  const field = interactionType === 'like' ? 'likes_count' : 'favorites_count'
  await client.from(table).update({ [field]: total }).eq('uuid', targetUuid)
  return total
}

export async function toggleInteraction(params: {
  targetType: TargetType
  targetUuid: string
  interactionType: InteractionType
  enabled: boolean
  nickname: string
}): Promise<number | null> {
  const client = getClient()
  if (!client) return null

  const payload = {
    target_uuid: params.targetUuid,
    target_type: params.targetType,
    interaction_type: params.interactionType,
    nickname: params.nickname,
  }
  if (params.enabled) {
    const { error } = await client
      .from('community_interactions')
      .upsert(payload, { onConflict: 'target_uuid,target_type,interaction_type,nickname', ignoreDuplicates: true })
    if (error) return null
  } else {
    const { error } = await client
      .from('community_interactions')
      .delete()
      .eq('target_uuid', params.targetUuid)
      .eq('target_type', params.targetType)
      .eq('interaction_type', params.interactionType)
      .eq('nickname', params.nickname)
    if (error) return null
  }

  return recountAndUpdate(client, params.targetType, params.targetUuid, params.interactionType)
}
