import { SupabaseClient } from '@supabase/supabase-js'
import {
  BuildCardRole,
  CommunityBuild,
  CommunityPageResult,
  CommunityRatingShare,
} from '@/lib/communityBuilds'
import { getSupabaseBrowserClient } from '@/lib/supabaseClient'

type PublisherProfile = {
  userId?: string
  nickname: string
  useBilibili: boolean
  bilibiliUid?: string
}

type PublishOptions = {
  season: number
}

type InteractionType = 'like' | 'favorite'
type TargetType = 'lineup' | 'rating'

type FetchPageParams = {
  page?: number
  pageSize?: number
}

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

const DEFAULT_PAGE_SIZE = 20

function isMissingColumnError(error: any, column: string): boolean {
  const msg = String(error?.message || '')
  return (
    msg.includes(column) &&
    (String(error?.code || '').includes('42703') ||
      String(error?.code || '').includes('PGRST') ||
      msg.toLowerCase().includes('column'))
  )
}

function getClient(): SupabaseClient | null {
  return getSupabaseBrowserClient()
}

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

function getPage(page?: number, pageSize?: number): { page: number; pageSize: number; from: number; to: number } {
  const p = Math.max(1, Number(page || 1))
  const s = Math.min(100, Math.max(1, Number(pageSize || DEFAULT_PAGE_SIZE)))
  const from = (p - 1) * s
  const to = from + s - 1
  return { page: p, pageSize: s, from, to }
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
    season: Number(row.season || 11),
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
    authorUserId: row.author_user_id || '',
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
    season: Number(row.season || 11),
    likes: Number(row.likes_count || 0),
    favorites: Number(row.favorites_count || 0),
    publishedAt: row.created_at || new Date().toISOString(),
    authorName: row.author_name || '',
    authorUserId: row.author_user_id || '',
    authorBilibiliUid: row.author_bilibili_uid || '',
    ratingPayload: row.rating_payload || null,
  }
}

async function fetchLineupSummaryRows(
  client: SupabaseClient,
  from: number,
  to: number
): Promise<{ data: any[] | null; count: number | null; error: any }> {
  const legacyColumns = [
    'uuid',
    'name',
    'hero',
    'day_from',
    'day_to',
    'day_plan_tag',
    'strength_tag',
    'difficulty_tag',
    'version',
    'cards_data',
    'special_slots',
    'likes_count',
    'favorites_count',
    'rating_score',
    'author_name',
    'author_bilibili_uid',
    'video_bv',
    'video_title',
    'created_at',
  ].join(',')
  const baseColumns = `season,${legacyColumns}`
  const withAuthorUserColumns = `${baseColumns},author_user_id`
  const withCount = { count: 'exact' as const }

  const queryWithAuthor = await client
    .from('community_lineups')
    .select(withAuthorUserColumns, withCount)
    .order('created_at', { ascending: false })
    .range(from, to)
  if (!queryWithAuthor.error) return queryWithAuthor
  if (!isMissingColumnError(queryWithAuthor.error, 'author_user_id')) {
    if (!isMissingColumnError(queryWithAuthor.error, 'season')) return queryWithAuthor
    const withoutSeasonWithAuthor = await client
      .from('community_lineups')
      .select(`${legacyColumns},author_user_id`, withCount)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (!withoutSeasonWithAuthor.error) return withoutSeasonWithAuthor
    if (!isMissingColumnError(withoutSeasonWithAuthor.error, 'author_user_id')) return withoutSeasonWithAuthor
    return client
      .from('community_lineups')
      .select(legacyColumns, withCount)
      .order('created_at', { ascending: false })
      .range(from, to)
  }

  return client
    .from('community_lineups')
    .select(baseColumns, withCount)
    .order('created_at', { ascending: false })
    .range(from, to)
}

async function fetchRatingSummaryRows(
  client: SupabaseClient,
  from: number,
  to: number
): Promise<{ data: any[] | null; count: number | null; error: any }> {
  const legacyColumns = [
    'uuid',
    'name',
    'likes_count',
    'favorites_count',
    'author_name',
    'author_bilibili_uid',
    'created_at',
  ].join(',')
  const baseColumns = `season,${legacyColumns}`
  const withAuthorUserColumns = `${baseColumns},author_user_id`
  const withCount = { count: 'exact' as const }

  const queryWithAuthor = await client
    .from('community_ratings')
    .select(withAuthorUserColumns, withCount)
    .order('created_at', { ascending: false })
    .range(from, to)
  if (!queryWithAuthor.error) return queryWithAuthor
  if (!isMissingColumnError(queryWithAuthor.error, 'author_user_id')) {
    if (!isMissingColumnError(queryWithAuthor.error, 'season')) return queryWithAuthor
    const withoutSeasonWithAuthor = await client
      .from('community_ratings')
      .select(`${legacyColumns},author_user_id`, withCount)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (!withoutSeasonWithAuthor.error) return withoutSeasonWithAuthor
    if (!isMissingColumnError(withoutSeasonWithAuthor.error, 'author_user_id')) return withoutSeasonWithAuthor
    return client
      .from('community_ratings')
      .select(legacyColumns, withCount)
      .order('created_at', { ascending: false })
      .range(from, to)
  }

  return client
    .from('community_ratings')
    .select(baseColumns, withCount)
    .order('created_at', { ascending: false })
    .range(from, to)
}

export async function fetchCommunityLineupsPage(params: FetchPageParams = {}): Promise<CommunityPageResult<CommunityBuild>> {
  const client = getClient()
  const { page, pageSize, from, to } = getPage(params.page, params.pageSize)
  if (!client) return { items: [], total: 0, page, pageSize, hasMore: false }

  const { data, error, count } = await fetchLineupSummaryRows(client, from, to)
  if (error || !Array.isArray(data)) {
    return { items: [], total: 0, page, pageSize, hasMore: false }
  }

  const total = Number(count || 0)
  const items = data.map(mapRowToBuild)
  return {
    items,
    total,
    page,
    pageSize,
    hasMore: from + items.length < total,
  }
}

export async function fetchCommunityRatingsPage(
  params: FetchPageParams = {}
): Promise<CommunityPageResult<CommunityRatingShare>> {
  const client = getClient()
  const { page, pageSize, from, to } = getPage(params.page, params.pageSize)
  if (!client) return { items: [], total: 0, page, pageSize, hasMore: false }

  const { data, error, count } = await fetchRatingSummaryRows(client, from, to)
  if (error || !Array.isArray(data)) {
    return { items: [], total: 0, page, pageSize, hasMore: false }
  }

  const total = Number(count || 0)
  const items = data.map(mapRowToRating)
  return {
    items,
    total,
    page,
    pageSize,
    hasMore: from + items.length < total,
  }
}

export async function fetchCommunityLineups(): Promise<CommunityBuild[]> {
  const page = await fetchCommunityLineupsPage({ page: 1, pageSize: DEFAULT_PAGE_SIZE })
  return page.items
}

export async function fetchCommunityRatings(): Promise<CommunityRatingShare[]> {
  const page = await fetchCommunityRatingsPage({ page: 1, pageSize: DEFAULT_PAGE_SIZE })
  return page.items
}

export async function fetchLineupSnapshot(uuid: string): Promise<any | null> {
  const client = getClient()
  if (!client || !uuid) return null
  const { data, error } = await client
    .from('community_lineups')
    .select('lineup_payload')
    .eq('uuid', uuid)
    .maybeSingle()
  if (error) return null
  return data?.lineup_payload || null
}

export async function fetchRatingPayload(uuid: string): Promise<any | null> {
  const client = getClient()
  if (!client || !uuid) return null
  const { data, error } = await client
    .from('community_ratings')
    .select('rating_payload')
    .eq('uuid', uuid)
    .maybeSingle()
  if (error) return null
  return data?.rating_payload || null
}

export async function fetchRatingSummariesForCard(cardId: string, limit = 120): Promise<CommunityRatingShare[]> {
  const client = getClient()
  if (!client || !cardId) return []
  const query = await client
    .from('community_ratings')
    .select('uuid,name,season,likes_count,favorites_count,author_name,author_user_id,author_bilibili_uid,created_at,rating_payload')
    .order('created_at', { ascending: false })
    .limit(limit)
  let rows: any[] | null = query.data
  if (query.error && isMissingColumnError(query.error, 'author_user_id')) {
    const fallback = await client
      .from('community_ratings')
      .select('uuid,name,season,likes_count,favorites_count,author_name,author_bilibili_uid,created_at,rating_payload')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (fallback.error || !Array.isArray(fallback.data)) return []
    rows = fallback.data
  }
  if (query.error && isMissingColumnError(query.error, 'season')) {
    const fallback = await client
      .from('community_ratings')
      .select('uuid,name,likes_count,favorites_count,author_name,author_bilibili_uid,created_at,rating_payload')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (fallback.error || !Array.isArray(fallback.data)) return []
    rows = fallback.data
  }
  if (query.error && !isMissingColumnError(query.error, 'author_user_id')) return []
  if (!Array.isArray(rows)) return []
  return rows
    .map(mapRowToRating)
    .filter((r) => {
      const ratedItems = r?.ratingPayload?.ratedItems
      if (!ratedItems || typeof ratedItems !== 'object') return false
      return Object.values(ratedItems).some(
        (list: any) => Array.isArray(list) && list.some((x: any) => String(x?.id || '') === cardId)
      )
    })
}

export async function publishLineup(
  snapshot: LineupSnapshot,
  profile: PublisherProfile,
  options: PublishOptions
): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('Supabase 未配置')

  const uuid = generateUuid()
  const basePayload: Record<string, any> = {
    uuid,
    name:
      snapshot.lineupName?.trim() ||
      `${snapshot.hero || 'Unknown'} Day${snapshot.dayStart || 1}-Day${snapshot.dayEnd || 13}`,
    hero: snapshot.hero || 'Pygmalien',
    season: Number(options.season || 11),
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
    author_bilibili_uid: profile.useBilibili ? profile.bilibiliUid || null : null,
    video_bv: snapshot.videoBv?.trim() || null,
    video_title: snapshot.videoTitle?.trim() || null,
    special_slots: extractSpecialSlots(snapshot),
    notes: null,
  }

  const withUserId = profile.userId ? { ...basePayload, author_user_id: profile.userId } : basePayload
  const firstTry = await client.from('community_lineups').insert(withUserId)
  if (!firstTry.error) return uuid
  if (isMissingColumnError(firstTry.error, 'season')) {
    const noSeasonPayload = { ...withUserId }
    delete noSeasonPayload.season
    const fallbackNoSeason = await client.from('community_lineups').insert(noSeasonPayload)
    if (!fallbackNoSeason.error) return uuid
    if (!isMissingColumnError(fallbackNoSeason.error, 'author_user_id')) throw fallbackNoSeason.error
    const legacy = { ...basePayload }
    delete legacy.season
    const legacyFallback = await client.from('community_lineups').insert(legacy)
    if (legacyFallback.error) throw legacyFallback.error
    return uuid
  }
  if (!isMissingColumnError(firstTry.error, 'author_user_id')) throw firstTry.error

  const fallback = await client.from('community_lineups').insert(basePayload)
  if (fallback.error) throw fallback.error
  return uuid
}

export async function publishRating(snapshot: any, profile: PublisherProfile, options: PublishOptions): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('Supabase 未配置')
  const uuid = generateUuid()
  const basePayload: Record<string, any> = {
    uuid,
    name: snapshot?.name || `评分 ${new Date().toISOString()}`,
    season: Number(options.season || 11),
    rating_payload: snapshot,
    likes_count: 0,
    favorites_count: 0,
    author_name: profile.nickname,
    author_bilibili_uid: profile.useBilibili ? profile.bilibiliUid || null : null,
  }
  const withUserId = profile.userId ? { ...basePayload, author_user_id: profile.userId } : basePayload
  const firstTry = await client.from('community_ratings').insert(withUserId)
  if (!firstTry.error) return uuid
  if (isMissingColumnError(firstTry.error, 'season')) {
    const noSeasonPayload = { ...withUserId }
    delete noSeasonPayload.season
    const fallbackNoSeason = await client.from('community_ratings').insert(noSeasonPayload)
    if (!fallbackNoSeason.error) return uuid
    if (!isMissingColumnError(fallbackNoSeason.error, 'author_user_id')) throw fallbackNoSeason.error
    const legacy = { ...basePayload }
    delete legacy.season
    const legacyFallback = await client.from('community_ratings').insert(legacy)
    if (legacyFallback.error) throw legacyFallback.error
    return uuid
  }
  if (!isMissingColumnError(firstTry.error, 'author_user_id')) throw firstTry.error

  const fallback = await client.from('community_ratings').insert(basePayload)
  if (fallback.error) throw fallback.error
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
