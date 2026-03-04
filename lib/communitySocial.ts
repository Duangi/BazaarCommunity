import { CommunityGameRecord, CommunityPageResult, CommunityProfile, CommunityPublicUser } from '@/lib/communityBuilds'
import { getSupabaseBrowserClient } from '@/lib/supabaseClient'

function getClient() {
  return getSupabaseBrowserClient()
}

function isMissingColumnError(error: any, column: string): boolean {
  const msg = String(error?.message || '')
  return (
    msg.includes(column) &&
    (String(error?.code || '').includes('42703') ||
      String(error?.code || '').includes('PGRST') ||
      msg.toLowerCase().includes('column'))
  )
}

function extractMissingColumn(error: any): string | null {
  const msg = String(error?.message || '')
  const patterns = [
    /column\s+user_profiles\.([a-zA-Z0-9_]+)\s+does not exist/i,
    /column\s+"?([a-zA-Z0-9_]+)"?\s+of relation\s+"?user_profiles"?\s+does not exist/i,
    /could not find the '([a-zA-Z0-9_]+)' column of 'user_profiles' in the schema cache/i,
  ]
  for (const re of patterns) {
    const m = msg.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}

function normalizeHeroes(mainHeroesRaw: any, mainHeroLegacy: any): string[] {
  if (Array.isArray(mainHeroesRaw)) {
    const list = mainHeroesRaw.map((x) => String(x || '').trim()).filter(Boolean)
    if (list.length > 0) return Array.from(new Set(list))
  }
  const legacy = String(mainHeroLegacy || '').trim()
  if (legacy) return [legacy]
  return ['Pygmalien']
}

function mapRecordRow(row: any): CommunityGameRecord {
  return {
    id: String(row.id || ''),
    authorUserId: String(row.author_user_id || ''),
    authorName: row.author_name || '匿名',
    playedOn: row.played_on || '',
    result: row.result === 'lose' ? 'lose' : 'win',
    dayIndex: Number(row.day_index || 1),
    screenshotUrl: row.screenshot_url || '',
    note: row.note || '',
    meta: row.meta || null,
    createdAt: row.created_at || '',
  }
}

export async function fetchUserProfile(userId: string): Promise<CommunityProfile | null> {
  const client = getClient()
  if (!client || !userId) return null
  const { data, error } = await client
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return {
    userId: data.user_id,
    nickname: data.nickname || '',
    useBilibili: !!data.use_bilibili,
    bilibiliUid: data.bilibili_uid || '',
    mainHeroes: normalizeHeroes(data.main_heroes, data.main_hero),
    gameUsername: data.game_username || '',
    lastLoginIssuedAt: Number(data.last_login_issued_at || 0),
  }
}

export async function upsertUserProfile(profile: CommunityProfile): Promise<boolean> {
  const client = getClient()
  if (!client || !profile.userId || !profile.nickname) return false
  const mainHeroes = Array.isArray(profile.mainHeroes) && profile.mainHeroes.length > 0
    ? Array.from(new Set(profile.mainHeroes.map((x) => String(x || '').trim()).filter(Boolean)))
    : ['Pygmalien']
  const payload: Record<string, any> = {
    user_id: profile.userId,
    nickname: profile.nickname,
    use_bilibili: !!profile.useBilibili,
    bilibili_uid: profile.useBilibili ? profile.bilibiliUid || null : null,
    main_heroes: mainHeroes,
    main_hero: mainHeroes[0] || 'Pygmalien',
    game_username: profile.gameUsername || null,
    last_login_issued_at: Number(profile.lastLoginIssuedAt || 0) || null,
    last_login_at: new Date().toISOString(),
  }
  for (let i = 0; i < 8; i += 1) {
    const { error } = await client.from('user_profiles').upsert(payload, { onConflict: 'user_id' })
    if (!error) return true
    const missingCol = extractMissingColumn(error)
    if (!missingCol || !(missingCol in payload)) return false
    delete payload[missingCol]
  }
  return false
}

export async function upsertLoginIdentity(params: {
  userId: string
  username: string
  issuedAt: number
}): Promise<boolean> {
  const client = getClient()
  if (!client || !params.userId || !params.username) return false
  const existing = await fetchUserProfile(params.userId)
  const nickname = (existing?.nickname || '').trim() || params.username.trim()
  const payload: CommunityProfile = {
    userId: params.userId,
    nickname,
    useBilibili: existing?.useBilibili || false,
    bilibiliUid: existing?.bilibiliUid || '',
    mainHeroes: existing?.mainHeroes || ['Pygmalien'],
    gameUsername: params.username,
    lastLoginIssuedAt: params.issuedAt,
  }
  return upsertUserProfile(payload)
}

export async function fetchFollowingUserIds(userId: string): Promise<string[]> {
  const client = getClient()
  if (!client || !userId) return []
  const { data, error } = await client
    .from('user_follows')
    .select('following_user_id')
    .eq('follower_user_id', userId)
  if (error || !Array.isArray(data)) return []
  return data.map((x: any) => String(x.following_user_id || '')).filter(Boolean)
}

export async function fetchFollowersCount(userId: string): Promise<number> {
  const client = getClient()
  if (!client || !userId) return 0
  const { count, error } = await client
    .from('user_follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_user_id', userId)
  if (error) return 0
  return Number(count || 0)
}

export async function fetchAllPublicProfiles(): Promise<CommunityPublicUser[]> {
  const client = getClient()
  if (!client) return []

  const [{ data: profiles, error: pErr }, { data: follows, error: fErr }] = await Promise.all([
    client.from('user_profiles').select('*'),
    client.from('user_follows').select('following_user_id'),
  ])
  if (pErr || !Array.isArray(profiles)) return []

  const followersCountMap = new Map<string, number>()
  if (!fErr && Array.isArray(follows)) {
    follows.forEach((f: any) => {
      const uid = String(f?.following_user_id || '')
      if (!uid) return
      followersCountMap.set(uid, (followersCountMap.get(uid) || 0) + 1)
    })
  }

  return profiles
    .map((row: any) => ({
      userId: String(row.user_id || ''),
      nickname: row.nickname || '',
      useBilibili: !!row.use_bilibili,
      bilibiliUid: row.bilibili_uid || '',
      mainHeroes: normalizeHeroes(row.main_heroes, row.main_hero),
      gameUsername: row.game_username || '',
      followersCount: followersCountMap.get(String(row.user_id || '')) || 0,
      createdAt: row.created_at || '',
      lastLoginAt: row.last_login_at || '',
    }))
    .filter((x: CommunityPublicUser) => !!x.userId && !!x.nickname)
}

export async function fetchFollowingProfiles(userId: string): Promise<CommunityPublicUser[]> {
  const client = getClient()
  if (!client || !userId) return []
  const ids = await fetchFollowingUserIds(userId)
  if (ids.length === 0) return []
  const profiles = await fetchAllPublicProfiles()
  const map = new Map(profiles.map((x) => [x.userId, x]))
  return ids.map((id) => map.get(id)).filter(Boolean) as CommunityPublicUser[]
}

export async function toggleFollowUser(params: {
  followerUserId: string
  followingUserId: string
  enabled: boolean
}): Promise<boolean> {
  const client = getClient()
  if (!client || !params.followerUserId || !params.followingUserId) return false

  if (params.enabled) {
    const { error } = await client
      .from('user_follows')
      .upsert(
        {
          follower_user_id: params.followerUserId,
          following_user_id: params.followingUserId,
        },
        { onConflict: 'follower_user_id,following_user_id', ignoreDuplicates: true }
      )
    return !error
  }

  const { error } = await client
    .from('user_follows')
    .delete()
    .eq('follower_user_id', params.followerUserId)
    .eq('following_user_id', params.followingUserId)
  return !error
}

type FetchGameRecordsPageParams = {
  page?: number
  pageSize?: number
  viewerUserId?: string
  onlyFollowing?: boolean
  uploaderUserId?: string
  uploaderMainHero?: string
}

export async function fetchGameRecordsPage(
  params: FetchGameRecordsPageParams = {}
): Promise<CommunityPageResult<CommunityGameRecord>> {
  const client = getClient()
  const page = Math.max(1, Number(params.page || 1))
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize || 20)))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  if (!client) return { items: [], total: 0, page, pageSize, hasMore: false }

  let candidateUserIds: string[] | null = null

  if (params.onlyFollowing && params.viewerUserId) {
    const followIds = await fetchFollowingUserIds(params.viewerUserId)
    candidateUserIds = followIds
  }

  if (params.uploaderUserId) {
    candidateUserIds = candidateUserIds
      ? candidateUserIds.filter((x) => x === params.uploaderUserId)
      : [params.uploaderUserId]
  }

  if (params.uploaderMainHero) {
    const users = await fetchAllPublicProfiles()
    const heroIds = new Set(
      users
        .filter((u) => Array.isArray(u.mainHeroes) && u.mainHeroes.includes(params.uploaderMainHero!))
        .map((u) => u.userId)
    )
    candidateUserIds = candidateUserIds
      ? candidateUserIds.filter((id) => heroIds.has(id))
      : Array.from(heroIds)
  }

  if (candidateUserIds && candidateUserIds.length === 0) {
    return { items: [], total: 0, page, pageSize, hasMore: false }
  }

  let query = client
    .from('community_game_records')
    .select('id,author_user_id,author_name,played_on,result,day_index,screenshot_url,note,meta,created_at', { count: 'exact' })
    .order('played_on', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (candidateUserIds) query = query.in('author_user_id', candidateUserIds)

  const { data, error, count } = await query
  if (error || !Array.isArray(data)) return { items: [], total: 0, page, pageSize, hasMore: false }

  const items = data.map(mapRecordRow)
  const total = Number(count || 0)
  return {
    items,
    total,
    page,
    pageSize,
    hasMore: from + items.length < total,
  }
}

export async function fetchFollowingGameRecords(userId: string, limit = 40): Promise<CommunityGameRecord[]> {
  const page = await fetchGameRecordsPage({
    page: 1,
    pageSize: limit,
    viewerUserId: userId,
    onlyFollowing: true,
  })
  return page.items
}

export async function fetchUserGameRecords(userId: string, limit = 80): Promise<CommunityGameRecord[]> {
  const page = await fetchGameRecordsPage({
    page: 1,
    pageSize: limit,
    uploaderUserId: userId,
  })
  return page.items
}

export async function deleteUserGameRecord(recordId: string, userId: string): Promise<boolean> {
  const client = getClient()
  if (!client || !recordId || !userId) return false
  const { error } = await client
    .from('community_game_records')
    .delete()
    .eq('id', recordId)
    .eq('author_user_id', userId)
  return !error
}

export async function deleteUserMatchRecords(userId: string, matchId: string): Promise<boolean> {
  if (!userId || !matchId) return false
  try {
    const response = await fetch('/api/game-records/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorUserId: userId,
        matchId,
      }),
    })
    if (!response.ok) return false
    const json = await response.json().catch(() => null)
    return !!json?.ok
  } catch {
    return false
  }
}

type UpdateMatchTitleParams = {
  userId: string
  matchId: string
  title: string
}

export async function updateUserMatchTitle(params: UpdateMatchTitleParams): Promise<boolean> {
  const client = getClient()
  if (!client) return false
  const userId = String(params.userId || '').trim()
  const matchId = String(params.matchId || '').trim()
  const title = String(params.title || '').trim().slice(0, 60)
  if (!userId || !matchId) return false

  const queryByKey = async (key: 'match_id' | 'matchId') => {
    const { data, error } = await client
      .from('community_game_records')
      .select('id,meta')
      .eq('author_user_id', userId)
      .contains('meta', { [key]: matchId })
      .limit(300)
    return { data, error }
  }

  let result = await queryByKey('match_id')
  if ((!result.data || result.data.length === 0) && !result.error) {
    result = await queryByKey('matchId')
  }
  if (result.error || !Array.isArray(result.data) || result.data.length === 0) return false

  for (const row of result.data) {
    const currentMeta = (row?.meta && typeof row.meta === 'object') ? { ...row.meta } : {}
    if (title) currentMeta.match_title = title
    else delete currentMeta.match_title

    const { error } = await client
      .from('community_game_records')
      .update({ meta: currentMeta })
      .eq('id', row.id)
      .eq('author_user_id', userId)
    if (error) return false
  }

  return true
}
