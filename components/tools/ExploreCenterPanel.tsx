'use client'

import { useEffect, useMemo, useState } from 'react'
import ItemImage from '@/components/ItemImage'
import { CommunityBuild, CommunityRatingShare } from '@/lib/communityBuilds'
import { cdnUrl } from '@/lib/cdn'
import { fetchRatingSummariesForCard } from '@/lib/communitySupabase'
import styles from './ExploreMode.module.css'

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

interface ExploreCenterPanelProps {
  builds: CommunityBuild[]
  ratings: CommunityRatingShare[]
  loading?: boolean
  loadingMoreLineups?: boolean
  loadingMoreRatings?: boolean
  lineupsTotal?: number
  ratingsTotal?: number
  hasMoreLineups?: boolean
  hasMoreRatings?: boolean
  itemsById: Record<string, any>
  filters: ExploreFilters
  lookupCardId: string | null
  lookupCard?: any | null
  focusCardId?: string | null
  userReactions: Record<string, { liked?: boolean; favorited?: boolean }>
  favoriteLineupIds: string[]
  favoriteRatingIds: string[]
  currentUserId?: string | null
  followingUserIds?: string[]
  onSelectItem: (item: any) => void
  onToggleLike: (build: CommunityBuild) => void
  onToggleFavorite: (build: CommunityBuild) => void
  onToggleRatingLike: (rating: CommunityRatingShare) => void
  onToggleRatingFavorite: (rating: CommunityRatingShare) => void
  onToggleFollow: (targetUserId: string, enabled: boolean) => void
  onImportBuild: (build: CommunityBuild) => void
  onImportRating: (rating: CommunityRatingShare) => void
  onLoadMoreLineups: () => void
  onLoadMoreRatings: () => void
}

function getRoleWeight(role: 'core' | 'sub' | 'tech'): number {
  if (role === 'core') return 0
  if (role === 'sub') return 1
  return 2
}

export default function ExploreCenterPanel({
  builds,
  ratings,
  loading = false,
  loadingMoreLineups = false,
  loadingMoreRatings = false,
  lineupsTotal = 0,
  ratingsTotal = 0,
  hasMoreLineups = false,
  hasMoreRatings = false,
  itemsById,
  filters,
  lookupCardId,
  lookupCard = null,
  focusCardId,
  userReactions,
  favoriteLineupIds,
  favoriteRatingIds,
  currentUserId,
  followingUserIds = [],
  onSelectItem,
  onToggleLike,
  onToggleFavorite,
  onToggleRatingLike,
  onToggleRatingFavorite,
  onToggleFollow,
  onImportBuild,
  onImportRating,
  onLoadMoreLineups,
  onLoadMoreRatings,
}: ExploreCenterPanelProps) {
  const [activeFeed, setActiveFeed] = useState<'lineup' | 'rating'>('lineup')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [focusFavoriteId, setFocusFavoriteId] = useState<string>('')
  const [feedScale, setFeedScale] = useState(1.6)
  const [cardCommunityRating, setCardCommunityRating] = useState<{
    score: number
    grade: string
    total: number
    sourceCount: number
  } | null>(null)

  const followingSet = useMemo(() => new Set(followingUserIds), [followingUserIds])
  const normalizeLookupText = (value: any): string => String(value || '').trim().toLowerCase()

  const lookupNeedle = useMemo(() => {
    if (!lookupCardId && !lookupCard) return null
    const idSet = new Set<string>()
    const nameSet = new Set<string>()
    const pushName = (value: any) => {
      const s = normalizeLookupText(value)
      if (s) nameSet.add(s)
    }
    const pushId = (value: any) => {
      const s = normalizeLookupText(value)
      if (s) idSet.add(s)
    }
    pushId(lookupCardId)
    pushId(lookupCard?.id)
    pushId(lookupCard?.source_key)
    pushName(lookupCard?.name_cn)
    pushName(lookupCard?.name_en)
    return { idSet, nameSet }
  }, [lookupCardId, lookupCard])

  const parseSnapshot = (build: CommunityBuild): any | null => {
    const raw = (build as any)?.snapshot
    if (!raw) return null
    if (typeof raw === 'object') return raw
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw)
      } catch {
        return null
      }
    }
    return null
  }

  const isLookupItemMatch = (item: any): boolean => {
    if (!lookupNeedle || !item) return false
    const sid = normalizeLookupText(item?.id || item?.templateId || item?.template_id || item?.source_key)
    const scn = normalizeLookupText(item?.name_cn || item?.name)
    const sen = normalizeLookupText(item?.name_en || item?.title)
    return Boolean(
      (sid && lookupNeedle.idSet.has(sid)) ||
      (scn && lookupNeedle.nameSet.has(scn)) ||
      (sen && lookupNeedle.nameSet.has(sen))
    )
  }

  const findLookupRoleFromSnapshot = (build: CommunityBuild): 'core' | 'sub' | 'tech' | null => {
    if (!lookupNeedle) return null
    const snapshot = parseSnapshot(build)
    const segments = Array.isArray(snapshot?.segments) ? snapshot.segments : []
    if (segments.length === 0) return null

    const matchedRoles: Array<'core' | 'sub' | 'tech'> = []
    for (const seg of segments) {
      const segBuilds = Array.isArray(seg?.builds) ? seg.builds : []
      for (const oneBuild of segBuilds) {
        const cards = Array.isArray(oneBuild?.cards) ? oneBuild.cards : []
        const coreSet = new Set((Array.isArray(oneBuild?.corePlacementIds) ? oneBuild.corePlacementIds : []).map((x: any) => String(x)))
        const subSet = new Set((Array.isArray(oneBuild?.secondaryPlacementIds) ? oneBuild.secondaryPlacementIds : []).map((x: any) => String(x)))
        for (const card of cards) {
          const item = card?.item || {}
          if (!isLookupItemMatch(item)) continue
          const pid = String(card?.placementId || '')
          let role: 'core' | 'sub' | 'tech' = 'tech'
          if (pid && coreSet.has(pid)) role = 'core'
          else if (pid && subSet.has(pid)) role = 'sub'
          matchedRoles.push(role)
        }
      }
    }
    if (matchedRoles.length === 0) return null
    return [...matchedRoles].sort((a, b) => getRoleWeight(a) - getRoleWeight(b))[0]
  }

  const findLookupRole = (build: CommunityBuild): 'core' | 'sub' | 'tech' | null => {
    if (!lookupNeedle) return null
    const cards = Array.isArray(build.cards_data) ? build.cards_data : []
    for (const card of cards) {
      const rawId = normalizeLookupText((card as any)?.id)
      if (!rawId) continue
      if (lookupNeedle.idSet.has(rawId)) return ((card as any)?.role || 'tech') as 'core' | 'sub' | 'tech'
      const mapped = itemsById[(card as any)?.id]
      const mappedCn = normalizeLookupText(mapped?.name_cn)
      const mappedEn = normalizeLookupText(mapped?.name_en)
      if ((mappedCn && lookupNeedle.nameSet.has(mappedCn)) || (mappedEn && lookupNeedle.nameSet.has(mappedEn))) {
        return ((card as any)?.role || 'tech') as 'core' | 'sub' | 'tech'
      }
    }
    return findLookupRoleFromSnapshot(build)
  }

  const buildMatchesLookup = (build: CommunityBuild): boolean => {
    if (!lookupNeedle) return true
    const cards = Array.isArray(build.cards_data) ? build.cards_data : []
    for (const card of cards) {
      const rawId = normalizeLookupText((card as any)?.id)
      if (rawId && lookupNeedle.idSet.has(rawId)) return true
      const mapped = itemsById[(card as any)?.id]
      const mappedCn = normalizeLookupText(mapped?.name_cn)
      const mappedEn = normalizeLookupText(mapped?.name_en)
      if ((mappedCn && lookupNeedle.nameSet.has(mappedCn)) || (mappedEn && lookupNeedle.nameSet.has(mappedEn))) {
        return true
      }
    }
    const snapshot = parseSnapshot(build)
    const segments = Array.isArray(snapshot?.segments) ? snapshot.segments : []
    for (const seg of segments) {
      const segBuilds = Array.isArray(seg?.builds) ? seg.builds : []
      for (const oneBuild of segBuilds) {
        const snapshotCards = Array.isArray(oneBuild?.cards) ? oneBuild.cards : []
        for (const card of snapshotCards) {
          if (isLookupItemMatch(card?.item || {})) return true
        }
      }
    }
    return false
  }

  const filtered = useMemo(() => {
    let result = [...builds]
    if (filters.season !== '') result = result.filter((b) => Number(b.season || 11) === Number(filters.season))
    if (filters.hero) result = result.filter((b) => b.hero === filters.hero)
    if (filters.dayPlanTag) result = result.filter((b) => b.dayPlanTag === filters.dayPlanTag)
    if (filters.strengthTag) result = result.filter((b) => b.strengthTag === filters.strengthTag)
    if (filters.difficultyTag) result = result.filter((b) => b.difficultyTag === filters.difficultyTag)
    if (filters.followingOnly) {
      result = result.filter((b) => !!b.authorUserId && followingSet.has(b.authorUserId))
    }
    const slotReq = filters.specialSlots
      .map((type, idx) => (type ? { slot: idx, type } : null))
      .filter(Boolean) as Array<{ slot: number; type: 'fire' | 'ice' }>
    if (slotReq.length > 0) {
      result = result.filter((b) => {
        const slots = Array.isArray(b.specialSlots) ? b.specialSlots : []
        return slotReq.every((req) => slots.some((s) => s.slot === req.slot && s.type === req.type))
      })
    }
    result = result.filter((b) => b.dayTo >= filters.dayMin && b.dayFrom <= filters.dayMax)
    if (lookupNeedle) {
      result = result.filter((b) => buildMatchesLookup(b))
      result = result.filter((b) => {
        const role = findLookupRole(b) || 'tech'
        return filters.lookupRoles.includes(role)
      })
      result.sort((a, b) => {
        const aRole = findLookupRole(a) || 'tech'
        const bRole = findLookupRole(b) || 'tech'
        if (getRoleWeight(aRole) !== getRoleWeight(bRole)) return getRoleWeight(aRole) - getRoleWeight(bRole)
        return b.dayTo - a.dayTo
      })
    } else {
      result.sort((a, b) => {
        if (b.dayTo !== a.dayTo) return b.dayTo - a.dayTo
        if (b.dayFrom !== a.dayFrom) return b.dayFrom - a.dayFrom
        if (filters.sort === 'hot') return b.likes - a.likes
        return +new Date(b.publishedAt) - +new Date(a.publishedAt)
      })
    }
    if (onlyFavorites) {
      const favSet = new Set(favoriteLineupIds)
      result = result.filter((b) => favSet.has(b.id))
    }
    if (focusFavoriteId) {
      result = result.filter((b) => b.id === focusFavoriteId)
    }
    return result
  }, [builds, filters, lookupNeedle, onlyFavorites, favoriteLineupIds, focusFavoriteId, followingSet])

  const activeCardId = lookupCardId || focusCardId || null
  const filteredRatings = useMemo(() => {
    let result = [...ratings]
    if (filters.season !== '') result = result.filter((r) => Number(r.season || 11) === Number(filters.season))
    if (filters.followingOnly) result = result.filter((r) => !!r.authorUserId && followingSet.has(r.authorUserId))
    result = result
      .filter((r) => (onlyFavorites ? favoriteRatingIds.includes(r.id) : true))
      .filter((r) => (focusFavoriteId ? r.id === focusFavoriteId : true))
    return result
  }, [ratings, filters.season, filters.followingOnly, followingSet, onlyFavorites, favoriteRatingIds, focusFavoriteId])

  useEffect(() => {
    let canceled = false
    ;(async () => {
      if (!activeCardId) {
        setCardCommunityRating(null)
        return
      }
      const related = await fetchRatingSummariesForCard(activeCardId)
      if (canceled) return
      if (related.length === 0) {
        setCardCommunityRating(null)
        return
      }
      let sum = 0
      let matched = 0
      related.forEach((r) => {
        const tiers = Array.isArray(r?.ratingPayload?.currentPreset?.tiers)
          ? r.ratingPayload.currentPreset.tiers
          : []
        const ratedItems = r?.ratingPayload?.ratedItems || {}
        if (tiers.length === 0 || !ratedItems) return

        tiers.forEach((tier: any, idx: number) => {
          const tierId = String(tier?.id || '')
          const list = Array.isArray(ratedItems[tierId]) ? ratedItems[tierId] : []
          const hit = list.some((x: any) => String(x?.id || '') === activeCardId)
          if (!hit) return
          const ratio = tiers.length <= 1 ? 1 : (tiers.length - 1 - idx) / (tiers.length - 1)
          const value = 1 + ratio * 4
          sum += value
          matched += 1
        })
      })
      if (matched === 0) {
        setCardCommunityRating(null)
        return
      }
      const score = sum / matched
      const grade = score >= 4.5 ? 'S' : score >= 4 ? 'A' : score >= 3.2 ? 'B' : score >= 2.6 ? 'C' : 'D'
      setCardCommunityRating({ score, grade, total: matched, sourceCount: related.length })
    })()
    return () => {
      canceled = true
    }
  }, [activeCardId])

  const getSizeClass = (sizeRaw?: string) => {
    const s = (sizeRaw || 'Medium').toLowerCase()
    if (s.includes('small') || s.includes('小')) return styles.thumbSmall
    if (s.includes('large') || s.includes('大')) return styles.thumbLarge
    return styles.thumbMedium
  }

  const extractSnapshotCards = (build: CommunityBuild) => {
    const rawSnapshot = (build as any)?.snapshot
    const snapshot =
      rawSnapshot && typeof rawSnapshot === 'string'
        ? (() => {
            try {
              return JSON.parse(rawSnapshot)
            } catch {
              return null
            }
          })()
        : rawSnapshot
    const segments = Array.isArray(snapshot?.segments) ? snapshot.segments : []
    if (segments.length === 0) return []
    const maxSeg = [...segments].sort((a: any, b: any) => Number(b?.dayTo || 0) - Number(a?.dayTo || 0))[0]
    const firstBuild = maxSeg?.builds?.[0]
    const cards = Array.isArray(firstBuild?.cards)
      ? firstBuild.cards
      : Array.isArray(firstBuild?.placements)
      ? firstBuild.placements
      : []
    return cards
      .map((c: any, idx: number) => {
        const item = c?.item || {}
        const id = String(item?.id || item?.templateId || item?.template_id || c?.id || '').trim()
        if (!id) return null
        return {
          id,
          pos: Number(c?.start ?? idx) + 1,
          size: String(item?.size || 'Medium'),
          role: 'tech' as 'core' | 'sub' | 'tech',
          item,
        }
      })
      .filter(Boolean) as Array<{ id: string; pos: number; size: string; role: 'core' | 'sub' | 'tech'; item: any }>
  }

  return (
    <div className={styles.feedPanel}>
      <div className={styles.feedHeader}>
        <h2>{activeFeed === 'lineup' ? '社区构筑' : '评分社区流'}</h2>
        <div className={styles.feedHeaderRight}>
          <label className={styles.scaleControl}>
            <span className={styles.scaleText}>内容缩放</span>
            <input
              className={styles.scaleSlider}
              type="range"
              min={0.8}
              max={2.6}
              step={0.1}
              value={feedScale}
              onChange={(e) => setFeedScale(Number(e.target.value))}
            />
            <span className={styles.scaleValue}>{Math.round(feedScale * 100)}%</span>
          </label>
          <span>{activeFeed === 'lineup' ? `${filtered.length}/${lineupsTotal || filtered.length}` : `${filteredRatings.length}/${ratingsTotal || filteredRatings.length}`} 条</span>
        </div>
      </div>
      <div className={styles.feedScalable} style={{ '--feed-scale': String(feedScale) } as any}>
        <div className={styles.feedFilterBar}>
          <button className={activeFeed === 'lineup' ? styles.activeActionBtn : ''} onClick={() => setActiveFeed('lineup')}>阵容</button>
          <button className={activeFeed === 'rating' ? styles.activeActionBtn : ''} onClick={() => setActiveFeed('rating')}>评分</button>
        </div>

        {activeFeed === 'lineup' ? (
          <>
            <div className={styles.feedFilterBar}>
              <label>
                <input type="checkbox" checked={onlyFavorites} onChange={(e) => setOnlyFavorites(e.target.checked)} />
                仅看收藏
              </label>
              <select value={focusFavoriteId} onChange={(e) => setFocusFavoriteId(e.target.value)}>
                <option value="">我的收藏列表</option>
                {builds.filter((b) => favoriteLineupIds.includes(b.id)).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            {loading && <div className={styles.loadingHint}>正在读取 Supabase 社区数据...</div>}
            {cardCommunityRating && (
              <div className={styles.communityRatingBox}>
                <div className={styles.communityRatingTitle}>
                  卡牌社区评分：<strong>{cardCommunityRating.grade}</strong>（{cardCommunityRating.score.toFixed(2)}）
                </div>
                <div className={styles.communityRatingMeta}>
                  来自评分社区真实样本 {cardCommunityRating.total}（评分贴 {cardCommunityRating.sourceCount} 条）
                </div>
              </div>
            )}
            <div className={styles.feedList}>
              {filtered.map((build) => {
                const followed = !!build.authorUserId && followingSet.has(build.authorUserId)
                const canFollow = !!currentUserId && !!build.authorUserId && build.authorUserId !== currentUserId
                return (
                  <div key={build.id} className={styles.feedCard}>
                    <div className={styles.feedMeta}>
                      <div>
                        <div className={styles.feedTitle}>{build.name}</div>
                        <div className={styles.feedSub}>
                          S{build.season || 11} · {build.hero} · Day{build.dayFrom}-Day{build.dayTo} · {build.version}
                        </div>
                        <div className={styles.feedSub}>
                          发布者：
                          {build.authorBilibiliUid ? (
                            <a href={`https://space.bilibili.com/${build.authorBilibiliUid}`} target="_blank" rel="noreferrer" className={styles.authorLink}>
                              <img src={cdnUrl('images/ui/Bilibili.svg')} alt="B站" className={styles.authorBiliIcon} />
                              {build.authorName || '匿名'}
                            </a>
                          ) : (
                            <span>{build.authorName || '匿名'}</span>
                          )}
                        </div>
                        {canFollow && (
                          <button
                            className={`${styles.followBtn} ${followed ? styles.activeActionBtn : ''}`}
                            onClick={() => onToggleFollow(build.authorUserId!, !followed)}
                          >
                            {followed ? '已关注' : '+ 关注作者'}
                          </button>
                        )}
                        {build.videoBv && build.videoTitle && (
                          <a
                            href={`https://www.bilibili.com/video/${build.videoBv}/`}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.videoLink}
                          >
                            ▶ {build.videoTitle}
                          </a>
                        )}
                        <div className={styles.feedTags}>
                          {build.dayPlanTag && <span className={styles.feedTag}>{build.dayPlanTag}</span>}
                          {build.strengthTag && <span className={styles.feedTag}>{build.strengthTag}</span>}
                          {build.difficultyTag && <span className={styles.feedTag}>{build.difficultyTag}</span>}
                        </div>
                      </div>
                      <div className={styles.feedStats}>
                        <span>❤️ {build.likes}</span>
                        <span>⭐ {build.favorites || 0}</span>
                        <span>评分 {build.rating.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className={styles.thumbRow}>
                      {(() => {
                        const byPos = new Map<number, 'core' | 'sub' | 'tech'>()
                        const byId = new Map<string, 'core' | 'sub' | 'tech'>()
                        for (const c of build.cards_data || []) {
                          byPos.set(Number(c.pos || 0), c.role)
                          byId.set(String(c.id || ''), c.role)
                        }
                        const snapshotCards = extractSnapshotCards(build)
                        const renderCards =
                          snapshotCards.length > 0
                            ? snapshotCards.map((c) => ({
                                ...c,
                                role: byPos.get(c.pos) || byId.get(c.id) || 'tech',
                                itemRef: c.item,
                              }))
                            : [...build.cards_data].sort((a, b) => a.pos - b.pos).map((c) => ({
                                ...c,
                                size: itemsById[c.id]?.size || 'Medium',
                                itemRef: itemsById[c.id] || null,
                              }))

                        return renderCards.map((card) => {
                          const item = card.itemRef || itemsById[card.id] || null
                          if (!item) return null
                        return (
                          <button
                            key={`${build.id}-${card.id}-${card.pos}`}
                            className={`${styles.thumbBtn} ${getSizeClass(card.size || item?.size)} ${
                              card.role === 'core' ? styles.roleCore : card.role === 'sub' ? styles.roleSub : styles.roleTech
                            }`}
                            onClick={() => item && onSelectItem(item)}
                            title={`${item?.name_cn || item?.name_en || card.id} (${card.role})`}
                          >
                            {item ? <ItemImage item={item} alt={item.name_cn || item.name_en || item.id} className={styles.thumbImg} /> : <span>{card.id}</span>}
                          </button>
                        )
                      }).filter(Boolean)})()}
                    </div>
                    <div className={styles.feedActions}>
                      <button
                        className={userReactions[`lineup:${build.id}`]?.liked ? styles.activeActionBtn : ''}
                        onClick={() => onToggleLike(build)}
                      >
                        ❤️ {userReactions[`lineup:${build.id}`]?.liked ? '已点赞' : '点赞'}
                      </button>
                      <button
                        className={userReactions[`lineup:${build.id}`]?.favorited ? styles.activeActionBtn : ''}
                        onClick={() => onToggleFavorite(build)}
                      >
                        ⭐ {userReactions[`lineup:${build.id}`]?.favorited ? '已收藏' : '收藏'}
                      </button>
                      <button onClick={() => onImportBuild(build)}>⚡ 一键导入编辑器</button>
                    </div>
                  </div>
                )
              })}
            </div>
            {hasMoreLineups && (
              <div className={styles.paginationRow}>
                <button className={styles.loadMoreBtn} disabled={loadingMoreLineups} onClick={onLoadMoreLineups}>
                  {loadingMoreLineups ? '加载中...' : '加载更多阵容'}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.feedFilterBar}>
              <label>
                <input type="checkbox" checked={onlyFavorites} onChange={(e) => setOnlyFavorites(e.target.checked)} />
                仅看收藏
              </label>
              <select value={focusFavoriteId} onChange={(e) => setFocusFavoriteId(e.target.value)}>
                <option value="">我的收藏评分</option>
                {ratings.filter((r) => favoriteRatingIds.includes(r.id)).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.feedList}>
              {filteredRatings
                .map((rating) => {
                  const followed = !!rating.authorUserId && followingSet.has(rating.authorUserId)
                  const canFollow = !!currentUserId && !!rating.authorUserId && rating.authorUserId !== currentUserId
                  return (
                    <div key={rating.id} className={styles.feedCard}>
                      <div className={styles.feedMeta}>
                        <div>
                          <div className={styles.feedTitle}>{rating.name}</div>
                          <div className={styles.feedSub}>
                            S{rating.season || 11} · 发布者：
                            {rating.authorBilibiliUid ? (
                              <a href={`https://space.bilibili.com/${rating.authorBilibiliUid}`} target="_blank" rel="noreferrer" className={styles.authorLink}>
                                <img src={cdnUrl('images/ui/Bilibili.svg')} alt="B站" className={styles.authorBiliIcon} />
                                {rating.authorName || '匿名'}
                              </a>
                            ) : (
                              <span>{rating.authorName || '匿名'}</span>
                            )}
                          </div>
                          {canFollow && (
                            <button
                              className={`${styles.followBtn} ${followed ? styles.activeActionBtn : ''}`}
                              onClick={() => onToggleFollow(rating.authorUserId!, !followed)}
                            >
                              {followed ? '已关注' : '+ 关注作者'}
                            </button>
                          )}
                        </div>
                        <div className={styles.feedStats}>
                          <span>❤️ {rating.likes}</span>
                          <span>⭐ {rating.favorites || 0}</span>
                        </div>
                      </div>
                      <div className={styles.feedActions}>
                        <button
                          className={userReactions[`rating:${rating.id}`]?.liked ? styles.activeActionBtn : ''}
                          onClick={() => onToggleRatingLike(rating)}
                        >
                          ❤️ {userReactions[`rating:${rating.id}`]?.liked ? '已点赞' : '点赞'}
                        </button>
                        <button
                          className={userReactions[`rating:${rating.id}`]?.favorited ? styles.activeActionBtn : ''}
                          onClick={() => onToggleRatingFavorite(rating)}
                        >
                          ⭐ {userReactions[`rating:${rating.id}`]?.favorited ? '已收藏' : '收藏'}
                        </button>
                        <button onClick={() => onImportRating(rating)}>⚡ 一键导入评分器</button>
                      </div>
                    </div>
                  )
                })}
            </div>
            {hasMoreRatings && (
              <div className={styles.paginationRow}>
                <button className={styles.loadMoreBtn} disabled={loadingMoreRatings} onClick={onLoadMoreRatings}>
                  {loadingMoreRatings ? '加载中...' : '加载更多评分'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
