'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import ToolWikiPanel from '@/components/tools/ToolWikiPanel'
import ToolFunctionPanel from '@/components/tools/ToolFunctionPanel'
import ToolDetailPanel from '@/components/tools/ToolDetailPanel'
import ExploreLeftPanel from '@/components/tools/ExploreLeftPanel'
import ExploreCenterPanel from '@/components/tools/ExploreCenterPanel'
import CommunityAuthBar from '@/components/tools/CommunityAuthBar'
import ProfileCenterModal from '@/components/tools/ProfileCenterModal'
import MatchRecordsLeftPanel from '@/components/tools/MatchRecordsLeftPanel'
import MatchRecordsCenterPanel from '@/components/tools/MatchRecordsCenterPanel'
import MatchRecordDetailPanel from '@/components/tools/MatchRecordDetailPanel'
import { CommunityBuild, CommunityGameRecord, CommunityPublicUser, CommunityRatingShare } from '@/lib/communityBuilds'
import { itemsDbUrl, skillsDbUrl } from '@/lib/cdn'
import {
  CommunityLoginSession,
  CommunityUserProfile,
  CommunityUserReactions,
  loadCommunityLoginSessionFromDb,
  loadCommunityProfileFromDb,
  loadCommunityProfileFromLocal,
  loadCommunityReactionsFromDb,
  loadFavoriteLineupIdsFromDb,
  loadFavoriteRatingIdsFromDb,
  saveCommunityLoginSessionToDb,
  saveCommunityProfileToDb,
  saveCommunityReactionsToDb,
  saveFavoriteLineupIdsToDb,
  saveFavoriteRatingIdsToDb,
} from '@/lib/draftDb'
import {
  fetchCommunityLineupsPage,
  fetchCommunityRatingsPage,
  fetchLineupSnapshot,
  fetchRatingPayload,
  publishLineup,
  publishRating,
  toggleInteraction,
} from '@/lib/communitySupabase'
import {
  deleteUserGameRecord,
  deleteUserMatchRecords,
  fetchAllPublicProfiles,
  fetchFollowersCount,
  fetchFollowingProfiles,
  fetchFollowingUserIds,
  fetchGameRecordsPage,
  fetchUserGameRecords,
  fetchUserProfile,
  toggleFollowUser,
  updateUserMatchTitle,
  upsertLoginIdentity,
  upsertUserProfile,
} from '@/lib/communitySocial'
import { enrichItemsWithResolvedText, loadResolvedTextMap } from '@/lib/itemDataEnhancer'
import styles from './tools.module.css'

type ExploreFilters = {
  season: number | ''
  hero: string
  dayMin: number
  dayMax: number
  sort: 'hot' | 'new'
  followingOnly: boolean
  lookupRoles: Array<'core' | 'sub' | 'tech'>
  dayPlanTag: '' | '连胜早走' | '北伐阵容'
  strengthTag: '' | '版本强势' | '中规中矩' | '地沟油'
  difficultyTag: '' | '容易成型' | '比较困难' | '极难成型'
  specialSlots: Array<'' | 'fire' | 'ice'>
}

type MatchRecordFilters = {
  onlyFollowing: boolean
  onlyMine: boolean
  uploaderMainHero: string
  uploaderUserId: string
}

type SeasonRangeConfig = {
  minSeason: number
  maxSeason: number
  defaultSeason: number
}

const DEFAULT_SEASON_RANGE: SeasonRangeConfig = {
  minSeason: 11,
  maxSeason: 13,
  defaultSeason: 13,
}

const defaultExploreFilters: ExploreFilters = {
  season: '',
  hero: '',
  dayMin: 1,
  dayMax: 13,
  sort: 'hot',
  followingOnly: false,
  lookupRoles: ['core', 'sub', 'tech'],
  dayPlanTag: '',
  strengthTag: '',
  difficultyTag: '',
  specialSlots: Array.from({ length: 10 }, () => '' as '' | 'fire' | 'ice'),
}

const defaultRecordFilters: MatchRecordFilters = {
  onlyFollowing: false,
  onlyMine: false,
  uploaderMainHero: '',
  uploaderUserId: '',
}

const FIRST_PAGE = 1
const PAGE_SIZE = 20
const COMMUNITY_TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

function mergeById<T extends { id: string }>(prev: T[], next: T[]): T[] {
  const map = new Map<string, T>()
  prev.forEach((x) => map.set(x.id, x))
  next.forEach((x) => map.set(x.id, x))
  return Array.from(map.values())
}

function normalizeSeasonRange(input: any): SeasonRangeConfig {
  const minSeason = Number(input?.minSeason)
  const maxSeason = Number(input?.maxSeason)
  const defaultSeason = Number(input?.defaultSeason)
  const min = Number.isFinite(minSeason) ? Math.max(1, Math.floor(minSeason)) : DEFAULT_SEASON_RANGE.minSeason
  const max = Number.isFinite(maxSeason) ? Math.max(min, Math.floor(maxSeason)) : Math.max(min, DEFAULT_SEASON_RANGE.maxSeason)
  const def = Number.isFinite(defaultSeason) ? Math.min(max, Math.max(min, Math.floor(defaultSeason))) : max
  return { minSeason: min, maxSeason: max, defaultSeason: def }
}

function getSeasonOptions(config: SeasonRangeConfig): number[] {
  const options: number[] = []
  for (let s = config.minSeason; s <= config.maxSeason; s += 1) options.push(s)
  return options
}

export default function ToolsPage() {
  const [allItems, setAllItems] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [skills, setSkills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [appMode, setAppMode] = useState<'edit' | 'explore' | 'records'>('explore')
  const [activeView, setActiveView] = useState<'rating' | 'lineup'>('lineup')
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [selectedRecord, setSelectedRecord] = useState<CommunityGameRecord | null>(null)

  const [seasonRange, setSeasonRange] = useState<SeasonRangeConfig>(DEFAULT_SEASON_RANGE)
  const [publishSeason, setPublishSeason] = useState<number>(DEFAULT_SEASON_RANGE.defaultSeason)

  const [communityBuilds, setCommunityBuilds] = useState<CommunityBuild[]>([])
  const [communityRatings, setCommunityRatings] = useState<CommunityRatingShare[]>([])
  const [communityLoading, setCommunityLoading] = useState(false)
  const [lineupPage, setLineupPage] = useState(FIRST_PAGE)
  const [lineupTotal, setLineupTotal] = useState(0)
  const [hasMoreLineups, setHasMoreLineups] = useState(false)
  const [loadingMoreLineups, setLoadingMoreLineups] = useState(false)
  const [ratingPage, setRatingPage] = useState(FIRST_PAGE)
  const [ratingTotal, setRatingTotal] = useState(0)
  const [hasMoreRatings, setHasMoreRatings] = useState(false)
  const [loadingMoreRatings, setLoadingMoreRatings] = useState(false)

  const [records, setRecords] = useState<CommunityGameRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsPage, setRecordsPage] = useState(FIRST_PAGE)
  const [recordsTotal, setRecordsTotal] = useState(0)
  const [recordsHasMore, setRecordsHasMore] = useState(false)
  const [recordsLoadingMore, setRecordsLoadingMore] = useState(false)

  const [lookupCardId, setLookupCardId] = useState<string | null>(null)
  const [exploreFilters, setExploreFilters] = useState<ExploreFilters>(defaultExploreFilters)
  const [recordFilters, setRecordFilters] = useState<MatchRecordFilters>(defaultRecordFilters)

  const [userProfile, setUserProfile] = useState<CommunityUserProfile>({
    nickname: '',
    useBilibili: false,
    bilibiliUid: '',
    mainHeroes: ['Pygmalien'],
  })
  const [userReactions, setUserReactions] = useState<CommunityUserReactions>({})
  const [favoriteLineupIds, setFavoriteLineupIds] = useState<string[]>([])
  const [favoriteRatingIds, setFavoriteRatingIds] = useState<string[]>([])

  const [loginSession, setLoginSession] = useState<CommunityLoginSession | null>(null)
  const [authUserId, setAuthUserId] = useState<string>('')
  const [authUsername, setAuthUsername] = useState<string>('')
  const [followingUserIds, setFollowingUserIds] = useState<string[]>([])
  const [followingUsers, setFollowingUsers] = useState<CommunityPublicUser[]>([])
  const [followersCount, setFollowersCount] = useState(0)
  const [allPublicUsers, setAllPublicUsers] = useState<CommunityPublicUser[]>([])
  const [profileCenterOpen, setProfileCenterOpen] = useState(false)
  const [globalToast, setGlobalToast] = useState<{ text: string; tone: 'success' | 'error' | 'info' } | null>(null)

  const [leftWidth, setLeftWidth] = useState(20)
  const [rightWidth, setRightWidth] = useState(25)
  const [draggingResizer, setDraggingResizer] = useState<'left' | 'right' | null>(null)
  const mainContentRef = useRef<HTMLDivElement | null>(null)
  const resizeStartRef = useRef({ x: 0, left: 20, right: 25 })
  const recordsFetchSeqRef = useRef(0)

  const seasonOptions = getSeasonOptions(seasonRange)
  const usersById = useMemo(
    () => Object.fromEntries(allPublicUsers.map((u) => [u.userId, u])),
    [allPublicUsers]
  )
  const lookupCardResolved = useMemo(
    () =>
      lookupCardId
        ? items.find((it) => it.id === lookupCardId) ||
          skills.find((it) => it.id === lookupCardId) ||
          null
        : null,
    [lookupCardId, items, skills]
  )
  const showGlobalToast = (text: string, tone: 'success' | 'error' | 'info' = 'info') => {
    setGlobalToast({ text, tone })
  }

  const loadPublicUsers = async () => {
    const users = await fetchAllPublicProfiles()
    setAllPublicUsers(users)
  }

  const refreshFollowingState = async (userId: string) => {
    const [followedIds, followedUsers, followerCount] = await Promise.all([
      fetchFollowingUserIds(userId),
      fetchFollowingProfiles(userId),
      fetchFollowersCount(userId),
    ])
    setFollowingUserIds(followedIds)
    setFollowingUsers(followedUsers)
    setFollowersCount(followerCount)
  }

  const applyLoginSession = async (session: CommunityLoginSession | null) => {
    setLoginSession(session)
    await saveCommunityLoginSessionToDb(session)
    if (!session) {
      setAuthUserId('')
      setAuthUsername('')
      setFollowingUserIds([])
      setFollowingUsers([])
      setFollowersCount(0)
      setExploreFilters((prev) => ({ ...prev, followingOnly: false }))
      setRecordFilters((prev) => ({ ...prev, onlyFollowing: false, onlyMine: false }))
      return
    }

    setAuthUserId(session.userId)
    setAuthUsername(session.username)
    try {
      await upsertLoginIdentity({
        userId: session.userId,
        username: session.username,
        issuedAt: session.issuedAt,
      })
      const remoteProfile = await fetchUserProfile(session.userId)
      if (remoteProfile?.nickname) {
        setUserProfile({
          nickname: remoteProfile.nickname,
          useBilibili: remoteProfile.useBilibili,
          bilibiliUid: remoteProfile.bilibiliUid || '',
          mainHeroes: remoteProfile.mainHeroes || ['Pygmalien'],
        })
      } else {
        setUserProfile((prev) => ({
          ...prev,
          nickname: prev.nickname.trim() || session.username,
        }))
      }
      await refreshFollowingState(session.userId)
      await loadPublicUsers()
    } catch (error) {
      console.error('登录后同步用户信息失败:', error)
      setUserProfile((prev) => ({
        ...prev,
        nickname: prev.nickname.trim() || session.username,
      }))
    }
  }

  const handleLoginWithUsername = async (rawUsername: string): Promise<{ ok: boolean; message: string }> => {
    const username = String(rawUsername || '').trim()
    if (!username) {
      return { ok: false, message: '用户名不能为空' }
    }
    const session: CommunityLoginSession = {
      key: '',
      userId: username.toLowerCase(),
      username,
      issuedAt: Date.now(),
    }
    await applyLoginSession(session)
    return { ok: true, message: `登录成功：${username}` }
  }

  const handleLogout = async () => {
    await applyLoginSession(null)
  }

  const loadCommunityFirstPage = async (nextFilters: ExploreFilters = exploreFilters) => {
    setCommunityLoading(true)
    try {
      const [lineupsPage, ratingsPage] = await Promise.all([
        withTimeout(
          fetchCommunityLineupsPage({
            page: FIRST_PAGE,
            pageSize: PAGE_SIZE,
            hero: nextFilters.hero || undefined,
          }),
          COMMUNITY_TIMEOUT_MS
        ),
        withTimeout(fetchCommunityRatingsPage({ page: FIRST_PAGE, pageSize: PAGE_SIZE }), COMMUNITY_TIMEOUT_MS),
      ])
      setCommunityBuilds(lineupsPage.items || [])
      setCommunityRatings(ratingsPage.items || [])
      setLineupPage(lineupsPage.page)
      setLineupTotal(lineupsPage.total)
      setHasMoreLineups(lineupsPage.hasMore)
      setRatingPage(ratingsPage.page)
      setRatingTotal(ratingsPage.total)
      setHasMoreRatings(ratingsPage.hasMore)
    } catch (error) {
      console.error('加载社区数据失败:', error)
      setCommunityBuilds([])
      setCommunityRatings([])
      setLineupPage(FIRST_PAGE)
      setLineupTotal(0)
      setHasMoreLineups(false)
      setRatingPage(FIRST_PAGE)
      setRatingTotal(0)
      setHasMoreRatings(false)
    } finally {
      setCommunityLoading(false)
    }
  }

  const loadRecordsFirstPage = async (
    nextFilters: MatchRecordFilters = recordFilters,
    nextAuthUserId: string = authUserId
  ) => {
    const requestSeq = ++recordsFetchSeqRef.current
    setRecordsLoading(true)
    try {
      const uploaderUserId =
        nextFilters.onlyMine && nextAuthUserId
          ? nextAuthUserId
          : (nextFilters.uploaderUserId || undefined)
      const page = await fetchGameRecordsPage({
        page: FIRST_PAGE,
        pageSize: PAGE_SIZE,
        viewerUserId: nextAuthUserId || undefined,
        onlyFollowing: nextFilters.onlyFollowing,
        uploaderMainHero: nextFilters.uploaderMainHero || undefined,
        uploaderUserId,
      })
      if (requestSeq !== recordsFetchSeqRef.current) return
      setRecords(page.items || [])
      setRecordsPage(page.page)
      setRecordsTotal(page.total)
      setRecordsHasMore(page.hasMore)
      setSelectedRecord((prev) => {
        if (!prev) return page.items[0] || null
        return page.items.find((x) => x.id === prev.id) || page.items[0] || null
      })
    } catch (error) {
      if (requestSeq !== recordsFetchSeqRef.current) return
      console.error('加载对局记录失败:', error)
      setRecords([])
      setRecordsPage(FIRST_PAGE)
      setRecordsTotal(0)
      setRecordsHasMore(false)
      setSelectedRecord(null)
    } finally {
      if (requestSeq !== recordsFetchSeqRef.current) return
      setRecordsLoading(false)
    }
  }

  const loadMoreLineups = async () => {
    if (loadingMoreLineups || !hasMoreLineups) return
    setLoadingMoreLineups(true)
    try {
      const nextPage = lineupPage + 1
      const result = await fetchCommunityLineupsPage({
        page: nextPage,
        pageSize: PAGE_SIZE,
        hero: exploreFilters.hero || undefined,
      })
      setCommunityBuilds((prev) => mergeById(prev, result.items))
      setLineupPage(result.page)
      setLineupTotal(result.total)
      setHasMoreLineups(result.hasMore)
    } finally {
      setLoadingMoreLineups(false)
    }
  }

  const handleChangeExploreFilters = (next: ExploreFilters) => {
    setExploreFilters(next)
    if (appMode === 'explore' && next.hero !== exploreFilters.hero) {
      void loadCommunityFirstPage(next)
    }
  }

  const loadMoreRatings = async () => {
    if (loadingMoreRatings || !hasMoreRatings) return
    setLoadingMoreRatings(true)
    try {
      const nextPage = ratingPage + 1
      const result = await fetchCommunityRatingsPage({ page: nextPage, pageSize: PAGE_SIZE })
      setCommunityRatings((prev) => mergeById(prev, result.items))
      setRatingPage(result.page)
      setRatingTotal(result.total)
      setHasMoreRatings(result.hasMore)
    } finally {
      setLoadingMoreRatings(false)
    }
  }

  const loadMoreRecords = async () => {
    if (recordsLoadingMore || !recordsHasMore) return
    setRecordsLoadingMore(true)
    try {
      const nextPage = recordsPage + 1
      const uploaderUserId =
        recordFilters.onlyMine && authUserId
          ? authUserId
          : (recordFilters.uploaderUserId || undefined)
      const page = await fetchGameRecordsPage({
        page: nextPage,
        pageSize: PAGE_SIZE,
        viewerUserId: authUserId || undefined,
        onlyFollowing: recordFilters.onlyFollowing,
        uploaderMainHero: recordFilters.uploaderMainHero || undefined,
        uploaderUserId,
      })
      setRecords((prev) => mergeById(prev, page.items))
      setRecordsPage(page.page)
      setRecordsTotal(page.total)
      setRecordsHasMore(page.hasMore)
    } finally {
      setRecordsLoadingMore(false)
    }
  }

  const handleChangeRecordFilters = (next: MatchRecordFilters) => {
    setRecordFilters(next)
    if (appMode === 'records') {
      void loadRecordsFirstPage(next, authUserId)
    }
  }

  async function loadData() {
    try {
      const hasChineseName = (item: any) => {
        const n = (item?.name_cn || '').trim()
        return !!n
      }

      const hasUntranslatedDesc = (item: any) => {
        const fields = [item?.description_cn, item?.descriptions, item?.description]
        return fields.some((field) => {
          if (field == null) return false
          const text = typeof field === 'string' ? field : JSON.stringify(field)
          return text.includes('[未翻译]')
        })
      }

      const isValidTranslated = (item: any) => hasChineseName(item) && !hasUntranslatedDesc(item)
      const [itemsResponse, skillsResponse, seasonResponse, resolvedTextMap] = await Promise.all([
        fetch(itemsDbUrl()),
        fetch(skillsDbUrl()),
        fetch('/config/season_range.json').catch(() => null),
        loadResolvedTextMap(),
      ])
      const [itemsData, skillsData, seasonData] = await Promise.all([
        itemsResponse.json(),
        skillsResponse.json(),
        seasonResponse ? seasonResponse.json().catch(() => null) : Promise.resolve(null),
      ])

      const range = normalizeSeasonRange(seasonData)
      setSeasonRange(range)
      setPublishSeason(range.defaultSeason)
      setExploreFilters((prev) => ({ ...prev, season: '' }))

      const normalizedItems = enrichItemsWithResolvedText(Array.isArray(itemsData) ? itemsData : [], resolvedTextMap)
      const normalizedSkills = enrichItemsWithResolvedText(Array.isArray(skillsData) ? skillsData : [], resolvedTextMap)
      const filteredItems = normalizedItems.filter(isValidTranslated)
      const filteredSkills = normalizedSkills.filter(isValidTranslated)
      setAllItems(normalizedItems)
      setItems(filteredItems)
      setSkills(filteredSkills)
    } catch (error) {
      console.error('加载数据失败:', error)
      setAllItems([])
      setItems([])
      setSkills([])
    } finally {
      setLoading(false)
    }
    loadCommunityFirstPage(defaultExploreFilters)
    loadPublicUsers()
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const [profile, reactions, favorites, favoriteRatings, savedSession] = await Promise.all([
        loadCommunityProfileFromDb(),
        loadCommunityReactionsFromDb(),
        loadFavoriteLineupIdsFromDb(),
        loadFavoriteRatingIdsFromDb(),
        loadCommunityLoginSessionFromDb(),
      ])
      if (!mounted) return
      if (profile) setUserProfile({ ...profile, mainHeroes: profile.mainHeroes || ['Pygmalien'] })
      if (reactions) setUserReactions(reactions)
      if (favorites) setFavoriteLineupIds(favorites)
      if (favoriteRatings) setFavoriteRatingIds(favoriteRatings)
      if (savedSession?.userId) {
        await applyLoginSession({
          key: savedSession.key || '',
          userId: savedSession.userId,
          username: savedSession.username || savedSession.userId,
          issuedAt: Number(savedSession.issuedAt || Date.now()),
        })
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    saveCommunityProfileToDb(userProfile)
  }, [userProfile])

  useEffect(() => {
    saveCommunityReactionsToDb(userReactions)
  }, [userReactions])

  useEffect(() => {
    saveFavoriteLineupIdsToDb(favoriteLineupIds)
  }, [favoriteLineupIds])

  useEffect(() => {
    saveFavoriteRatingIdsToDb(favoriteRatingIds)
  }, [favoriteRatingIds])

  useEffect(() => {
    if (appMode !== 'records') return
    void loadRecordsFirstPage(recordFilters, authUserId)
  }, [appMode, authUserId])

  useEffect(() => {
    if (!globalToast) return
    const timer = window.setTimeout(() => setGlobalToast(null), 1800)
    return () => window.clearTimeout(timer)
  }, [globalToast])

  const ensureNickname = (): string | null => {
    const trimmed = userProfile.nickname.trim()
    if (trimmed) return trimmed
    if (authUsername.trim()) {
      setUserProfile((prev) => ({ ...prev, nickname: authUsername.trim() }))
      return authUsername.trim()
    }
    const local = loadCommunityProfileFromLocal()
    const localName = (local?.nickname || '').trim()
    if (localName) {
      setUserProfile((prev) => ({
        ...prev,
        nickname: localName,
        useBilibili: typeof local?.useBilibili === 'boolean' ? local.useBilibili : prev.useBilibili,
        bilibiliUid: local?.bilibiliUid || prev.bilibiliUid,
      }))
      return localName
    }
    const input = window.prompt('请输入昵称后再点赞或收藏')
    const nickname = (input || '').trim()
    if (!nickname) return null
    setUserProfile((prev) => ({ ...prev, nickname }))
    return nickname
  }

  const handleSaveProfile = async (profile: CommunityUserProfile): Promise<boolean> => {
    if (!authUserId) {
      window.alert('请先登录后再保存个人资料。')
      return false
    }
    if (!profile.nickname.trim()) return false
    const normalized: CommunityUserProfile = {
      nickname: profile.nickname.trim(),
      useBilibili: !!profile.useBilibili,
      bilibiliUid: profile.useBilibili ? (profile.bilibiliUid || '').trim() : '',
      mainHeroes: Array.isArray(profile.mainHeroes) && profile.mainHeroes.length > 0
        ? Array.from(new Set(profile.mainHeroes))
        : ['Pygmalien'],
    }
    setUserProfile(normalized)
    const ok = await upsertUserProfile({
      userId: authUserId,
      nickname: normalized.nickname,
      useBilibili: normalized.useBilibili,
      bilibiliUid: normalized.bilibiliUid || '',
      mainHeroes: normalized.mainHeroes || ['Pygmalien'],
      gameUsername: authUsername || '',
    })
    if (!ok) return false
    await refreshFollowingState(authUserId)
    await loadPublicUsers()
    return true
  }

  const handlePublish = async (mode: 'lineup' | 'rating', snapshot: any, season: number): Promise<boolean> => {
    if (!authUserId) {
      window.alert('请先登录后再上传阵容或评分。')
      return false
    }
    const nickname = ensureNickname()
    if (!nickname) return false
    const profile = { ...userProfile, nickname, userId: authUserId || undefined }
    try {
      if (mode === 'lineup') await publishLineup(snapshot, profile, { season })
      else await publishRating(snapshot, profile, { season })
      await loadCommunityFirstPage()
      return true
    } catch (error) {
      console.error('发布失败', error)
      const code = (error as any)?.code
      if (String(code || '') === 'PGRST205') {
        window.alert('发布失败：Supabase 缺少社区数据表。请先在 Supabase SQL Editor 执行 docs/supabase_schema.sql。')
      }
      return false
    }
  }

  const reactionKey = (targetType: 'lineup' | 'rating', uuid: string) => `${targetType}:${uuid}`

  const handleToggleAction = async (
    targetType: 'lineup' | 'rating',
    item: CommunityBuild | CommunityRatingShare,
    action: 'like' | 'favorite'
  ) => {
    const nickname = ensureNickname()
    if (!nickname) return
    const key = reactionKey(targetType, item.id)
    const current = userReactions[key] || {}
    const enabled = action === 'like' ? !current.liked : !current.favorited

    setUserReactions((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [action === 'like' ? 'liked' : 'favorited']: enabled,
      },
    }))

    if (action === 'favorite' && targetType === 'lineup') {
      setFavoriteLineupIds((prev) => (
        enabled ? Array.from(new Set([...prev, item.id])) : prev.filter((id) => id !== item.id)
      ))
    }
    if (action === 'favorite' && targetType === 'rating') {
      setFavoriteRatingIds((prev) => (
        enabled ? Array.from(new Set([...prev, item.id])) : prev.filter((id) => id !== item.id)
      ))
    }

    if (targetType === 'lineup') {
      setCommunityBuilds((prev) => prev.map((b) => {
        if (b.id !== item.id) return b
        if (action === 'like') return { ...b, likes: Math.max(0, (b.likes || 0) + (enabled ? 1 : -1)) }
        return { ...b, favorites: Math.max(0, (b.favorites || 0) + (enabled ? 1 : -1)) }
      }))
    } else {
      setCommunityRatings((prev) => prev.map((r) => {
        if (r.id !== item.id) return r
        if (action === 'like') return { ...r, likes: Math.max(0, (r.likes || 0) + (enabled ? 1 : -1)) }
        return { ...r, favorites: Math.max(0, (r.favorites || 0) + (enabled ? 1 : -1)) }
      }))
    }

    const count = await toggleInteraction({
      targetType,
      targetUuid: item.id,
      interactionType: action,
      enabled,
      nickname,
    })
    if (count == null) return
    if (targetType === 'lineup') {
      setCommunityBuilds((prev) => prev.map((b) => {
        if (b.id !== item.id) return b
        return action === 'like' ? { ...b, likes: count } : { ...b, favorites: count }
      }))
    } else {
      setCommunityRatings((prev) => prev.map((r) => {
        if (r.id !== item.id) return r
        return action === 'like' ? { ...r, likes: count } : { ...r, favorites: count }
      }))
    }
  }

  const handleToggleFollow = async (targetUserId: string, enabled: boolean) => {
    if (!authUserId) {
      showGlobalToast('请先登录后再关注作者。', 'error')
      return
    }
    if (targetUserId === authUserId) {
      showGlobalToast('不能关注自己。', 'error')
      return
    }
    const ok = await toggleFollowUser({
      followerUserId: authUserId,
      followingUserId: targetUserId,
      enabled,
    })
    if (!ok) {
      showGlobalToast(enabled ? '关注失败，请稍后重试。' : '取消关注失败，请稍后重试。', 'error')
      return
    }
    await refreshFollowingState(authUserId)
    await loadPublicUsers()
    showGlobalToast(enabled ? '已关注该玩家。' : '已取消关注。', 'success')
  }

  const handleDeleteRecord = async (record: CommunityGameRecord): Promise<boolean> => {
    if (!authUserId) {
      showGlobalToast('请先登录后再删除记录。', 'error')
      return false
    }
    if (record.authorUserId !== authUserId) {
      showGlobalToast('只能删除自己上传的记录。', 'error')
      return false
    }
    const meta = (record.meta && typeof record.meta === 'object') ? record.meta : {}
    const matchId = String(meta.match_id || meta.matchId || '').trim()
    if (!window.confirm(`确认删除整局对局记录？\n这会同时删除 Supabase 记录与 R2 截图。`)) {
      return false
    }
    const ok = matchId
      ? await deleteUserMatchRecords(authUserId, matchId)
      : await deleteUserGameRecord(record.id, authUserId)
    if (!ok) {
      showGlobalToast('删除失败，请检查服务器配置。', 'error')
      return false
    }
    showGlobalToast(matchId ? '已删除整局记录。' : '已删除该记录。', 'success')
    await loadRecordsFirstPage()
    return true
  }

  const handleUpdateMatchTitle = async (matchId: string, title: string): Promise<boolean> => {
    if (!authUserId) {
      showGlobalToast('请先登录后再编辑标题。', 'error')
      return false
    }
    const ok = await updateUserMatchTitle({
      userId: authUserId,
      matchId,
      title,
    })
    if (!ok) {
      showGlobalToast('保存标题失败，请检查数据库权限。', 'error')
      return false
    }
    showGlobalToast('对局标题已保存。', 'success')
    await loadRecordsFirstPage()
    return true
  }

  useEffect(() => {
    if (!draggingResizer) return
    const onMove = (e: MouseEvent) => {
      if (!mainContentRef.current) return
      const rect = mainContentRef.current.getBoundingClientRect()
      const width = rect.width
      if (width <= 0) return
      const deltaPct = ((e.clientX - resizeStartRef.current.x) / width) * 100
      const minLeft = 14
      const minRight = 18
      const minMiddle = 30

      if (draggingResizer === 'left') {
        const maxLeft = 100 - resizeStartRef.current.right - minMiddle
        const nextLeft = Math.max(minLeft, Math.min(maxLeft, resizeStartRef.current.left + deltaPct))
        setLeftWidth(nextLeft)
        return
      }

      const maxRight = 100 - leftWidth - minMiddle
      const nextRight = Math.max(minRight, Math.min(maxRight, resizeStartRef.current.right - deltaPct))
      setRightWidth(nextRight)
    }
    const onUp = () => {
      setDraggingResizer(null)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [draggingResizer, leftWidth])

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={styles.container}>
        <div className={styles.floatingNav}>
          <div className={styles.navLeft}>
            <a href="/" className={styles.logo}>
              ← 返回首页
            </a>
            <h1 className={styles.title}>大巴扎实用小工具</h1>
          </div>
          <div className={styles.navRight}>
            <CommunityAuthBar
              isAuthed={!!authUserId}
              nickname={userProfile.nickname || authUsername}
              onLoginWithUsername={handleLoginWithUsername}
              onSignOut={handleLogout}
            />
            <button
              className={styles.profileEntryBtn}
              onClick={() => setProfileCenterOpen(true)}
              title="个人主页"
            >
              个人主页
            </button>
            <div className={styles.modeSwitch}>
              <button
                className={`${styles.modeBtn} ${appMode === 'explore' ? styles.modeBtnActive : ''}`}
                onClick={() => setAppMode('explore')}
              >
                探索模式
              </button>
              <button
                className={`${styles.modeBtn} ${appMode === 'edit' ? styles.modeBtnActive : ''}`}
                onClick={() => setAppMode('edit')}
              >
                编辑模式
              </button>
              <button
                className={`${styles.modeBtn} ${appMode === 'records' ? styles.modeBtnActive : ''}`}
                onClick={() => setAppMode('records')}
              >
                对局记录
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>加载数据中...</p>
          </div>
        ) : (
          <div
            ref={mainContentRef}
            className={styles.mainContent}
            style={
              {
                '--left-width': `${leftWidth}%`,
                '--middle-width': `${100 - leftWidth - rightWidth}%`,
                '--right-width': `${rightWidth}%`,
              } as React.CSSProperties
            }
          >
            {appMode === 'edit' ? (
              <ToolWikiPanel items={items} skills={skills} onSelectItem={setSelectedItem} />
            ) : appMode === 'explore' ? (
              <div className={`${styles.leftPanel} ${styles.leftPanelExplore}`}>
                <ExploreLeftPanel
                  items={items}
                  skills={skills}
                  filters={exploreFilters}
                  canUseFollowingFilter={!!authUserId}
                  seasonOptions={seasonOptions}
                  onChangeFilters={handleChangeExploreFilters}
                  lookupCard={lookupCardResolved}
                  onClearLookup={() => setLookupCardId(null)}
                  onResetAll={() => {
                    const next = {
                      ...defaultExploreFilters,
                      followingOnly: exploreFilters.followingOnly && !!authUserId,
                      season: '',
                    } as ExploreFilters
                    setExploreFilters(next)
                    void loadCommunityFirstPage(next)
                    setLookupCardId(null)
                  }}
                  onSelectItem={setSelectedItem}
                  onLookupBuilds={(item) => {
                    setLookupCardId(item.id)
                    setSelectedItem(item)
                  }}
                />
              </div>
            ) : (
              <div className={`${styles.leftPanel} ${styles.leftPanelExplore}`}>
                <MatchRecordsLeftPanel
                  items={items}
                  skills={skills}
                  currentUserId={authUserId}
                  followingUsers={followingUsers}
                  allUsers={allPublicUsers}
                  followingUserIds={followingUserIds}
                  recordFilters={recordFilters}
                  onChangeRecordFilters={handleChangeRecordFilters}
                  onToggleFollowUser={handleToggleFollow}
                  onSelectItem={setSelectedItem}
                />
              </div>
            )}

            <div
              className={styles.columnResizer}
              onMouseDown={(e) => {
                if (window.innerWidth <= 1200) return
                resizeStartRef.current = { x: e.clientX, left: leftWidth, right: rightWidth }
                setDraggingResizer('left')
              }}
              title="拖动调整左栏宽度"
            />

            <div className={styles.middlePanel}>
              {appMode === 'edit' ? (
                <ToolFunctionPanel
                  onSelectItem={setSelectedItem}
                  activeView={activeView}
                  onChangeView={setActiveView}
                  profileName={userProfile.nickname || authUsername || ''}
                  requireLoginToPublish={!authUserId}
                  seasonOptions={seasonOptions}
                  selectedSeason={publishSeason}
                  onChangeSeason={setPublishSeason}
                  onPublish={handlePublish}
                />
              ) : appMode === 'explore' ? (
                <ExploreCenterPanel
                  builds={communityBuilds}
                  ratings={communityRatings}
                  loading={communityLoading}
                  loadingMoreLineups={loadingMoreLineups}
                  loadingMoreRatings={loadingMoreRatings}
                  lineupsTotal={lineupTotal}
                  ratingsTotal={ratingTotal}
                  hasMoreLineups={hasMoreLineups}
                  hasMoreRatings={hasMoreRatings}
                  itemsById={Object.fromEntries(allItems.map((it) => [it.id, it]))}
                  filters={exploreFilters}
                  lookupCardId={lookupCardId}
                  lookupCard={lookupCardResolved}
                  focusCardId={selectedItem?.id || null}
                  userReactions={userReactions}
                  favoriteLineupIds={favoriteLineupIds}
                  favoriteRatingIds={favoriteRatingIds}
                  currentUserId={authUserId || null}
                  followingUserIds={followingUserIds}
                  onSelectItem={setSelectedItem}
                  onToggleLike={(build) => handleToggleAction('lineup', build, 'like')}
                  onToggleFavorite={(build) => handleToggleAction('lineup', build, 'favorite')}
                  onToggleRatingLike={(rating) => handleToggleAction('rating', rating, 'like')}
                  onToggleRatingFavorite={(rating) => handleToggleAction('rating', rating, 'favorite')}
                  onToggleFollow={handleToggleFollow}
                  onLoadMoreLineups={loadMoreLineups}
                  onLoadMoreRatings={loadMoreRatings}
                  onImportBuild={async (build) => {
                    const snapshot = build.snapshot || await fetchLineupSnapshot(build.id)
                    if (!snapshot) return
                    localStorage.setItem('pending_editor_import_build', JSON.stringify(snapshot))
                    setAppMode('edit')
                    setActiveView('lineup')
                  }}
                  onImportRating={async (rating) => {
                    const payload = rating.ratingPayload || await fetchRatingPayload(rating.id)
                    if (!payload) return
                    localStorage.setItem('pending_editor_import_rating', JSON.stringify(payload))
                    setAppMode('edit')
                    setActiveView('rating')
                  }}
                />
              ) : (
                <MatchRecordsCenterPanel
                  records={records}
                  total={recordsTotal}
                  loading={recordsLoading}
                  loadingMore={recordsLoadingMore}
                  hasMore={recordsHasMore}
                  usersById={usersById}
                  selectedRecordId={selectedRecord?.id}
                  currentUserId={authUserId}
                  onlyMine={recordFilters.onlyMine}
                  onSelectRecord={setSelectedRecord}
                  onLoadMore={loadMoreRecords}
                  onUpdateMatchTitle={handleUpdateMatchTitle}
                />
              )}
            </div>

            <div
              className={styles.columnResizer}
              onMouseDown={(e) => {
                if (window.innerWidth <= 1200) return
                resizeStartRef.current = { x: e.clientX, left: leftWidth, right: rightWidth }
                setDraggingResizer('right')
              }}
              title="拖动调整右栏宽度"
            />

            {appMode === 'records' ? (
              <MatchRecordDetailPanel
                record={selectedRecord}
                user={selectedRecord ? usersById[selectedRecord.authorUserId] : null}
                currentUserId={authUserId}
                onDeleteRecord={handleDeleteRecord}
              />
            ) : (
              <ToolDetailPanel item={selectedItem} />
            )}
          </div>
        )}

        {globalToast && (
          <div className={`${styles.globalToast} ${globalToast.tone === 'success' ? styles.globalToastSuccess : globalToast.tone === 'error' ? styles.globalToastError : styles.globalToastInfo}`}>
            {globalToast.text}
          </div>
        )}

        <ProfileCenterModal
          open={profileCenterOpen}
          onClose={() => setProfileCenterOpen(false)}
          profile={{
            nickname: userProfile.nickname || authUsername || '',
            useBilibili: !!userProfile.useBilibili,
            bilibiliUid: userProfile.bilibiliUid || '',
            mainHeroes: userProfile.mainHeroes || ['Pygmalien'],
          }}
          followersCount={followersCount}
          followingUsers={followingUsers}
          onSaveProfile={(draft) => handleSaveProfile({
            nickname: draft.nickname,
            useBilibili: draft.useBilibili,
            bilibiliUid: draft.bilibiliUid,
            mainHeroes: draft.mainHeroes,
          })}
          onLoadUserRecords={(uid) => fetchUserGameRecords(uid, 120)}
        />
      </div>
    </DndProvider>
  )
}
