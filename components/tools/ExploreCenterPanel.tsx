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
    if (lookupCardId) {
      result = result.filter((b) => b.cards_data.some((c) => c.id === lookupCardId))
      result = result.filter((b) => {
        const role = b.cards_data.find((c) => c.id === lookupCardId)?.role
        return role ? filters.lookupRoles.includes(role) : false
      })
      result.sort((a, b) => {
        const aRole = a.cards_data.find((c) => c.id === lookupCardId)?.role || 'tech'
        const bRole = b.cards_data.find((c) => c.id === lookupCardId)?.role || 'tech'
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
  }, [builds, filters, lookupCardId, onlyFavorites, favoriteLineupIds, focusFavoriteId, followingSet])

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
                      {[...build.cards_data].sort((a, b) => a.pos - b.pos).map((card) => {
                        const item = itemsById[card.id]
                        return (
                          <button
                            key={`${build.id}-${card.id}-${card.pos}`}
                            className={`${styles.thumbBtn} ${getSizeClass(item?.size)} ${
                              card.role === 'core' ? styles.roleCore : card.role === 'sub' ? styles.roleSub : styles.roleTech
                            }`}
                            onClick={() => item && onSelectItem(item)}
                            title={`${item?.name_cn || item?.name_en || card.id} (${card.role})`}
                          >
                            {item ? <ItemImage item={item} alt={item.name_cn || item.name_en || item.id} className={styles.thumbImg} /> : <span>{card.id}</span>}
                          </button>
                        )
                      })}
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
