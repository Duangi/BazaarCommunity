'use client'

import { useMemo, useState } from 'react'
import ItemImage from '@/components/ItemImage'
import { CommunityBuild, CommunityRatingShare } from '@/lib/communityBuilds'
import { cdnUrl } from '@/lib/cdn'
import styles from './ExploreMode.module.css'

type ExploreFilters = {
  hero: string
  dayMin: number
  dayMax: number
  sort: 'hot' | 'new'
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
  itemsById: Record<string, any>
  filters: ExploreFilters
  lookupCardId: string | null
  focusCardId?: string | null
  userReactions: Record<string, { liked?: boolean; favorited?: boolean }>
  favoriteLineupIds: string[]
  favoriteRatingIds: string[]
  onSelectItem: (item: any) => void
  onToggleLike: (build: CommunityBuild) => void
  onToggleFavorite: (build: CommunityBuild) => void
  onToggleRatingLike: (rating: CommunityRatingShare) => void
  onToggleRatingFavorite: (rating: CommunityRatingShare) => void
  onImportBuild: (build: CommunityBuild) => void
  onImportRating: (rating: CommunityRatingShare) => void
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
  itemsById,
  filters,
  lookupCardId,
  focusCardId,
  userReactions,
  favoriteLineupIds,
  favoriteRatingIds,
  onSelectItem,
  onToggleLike,
  onToggleFavorite,
  onToggleRatingLike,
  onToggleRatingFavorite,
  onImportBuild,
  onImportRating,
}: ExploreCenterPanelProps) {
  const [activeFeed, setActiveFeed] = useState<'lineup' | 'rating'>('lineup')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [focusFavoriteId, setFocusFavoriteId] = useState<string>('')
  const [feedScale, setFeedScale] = useState(1.6)
  const filtered = useMemo(() => {
    let result = [...builds]
    if (filters.hero) result = result.filter((b) => b.hero === filters.hero)
    if (filters.dayPlanTag) result = result.filter((b) => b.dayPlanTag === filters.dayPlanTag)
    if (filters.strengthTag) result = result.filter((b) => b.strengthTag === filters.strengthTag)
    if (filters.difficultyTag) result = result.filter((b) => b.difficultyTag === filters.difficultyTag)
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
  }, [builds, filters, lookupCardId, onlyFavorites, favoriteLineupIds, focusFavoriteId])

  const activeCardId = lookupCardId || focusCardId || null
  const communityRating = useMemo(() => {
    if (!activeCardId) return null
    const related = ratings.filter((r) => {
      const ratedItems = r?.ratingPayload?.ratedItems
      if (!ratedItems || typeof ratedItems !== 'object') return false
      return Object.values(ratedItems).some((list: any) =>
        Array.isArray(list) && list.some((x: any) => String(x?.id || '') === activeCardId)
      )
    })
    if (related.length === 0) return null

    let sum = 0
    let matched = 0
    related.forEach((r) => {
      const tiers = Array.isArray(r?.ratingPayload?.currentPreset?.tiers)
        ? r.ratingPayload.currentPreset.tiers
        : []
      const ratedItems = r?.ratingPayload?.ratedItems || {}
      if (tiers.length === 0 || !ratedItems) return

      // 顶级档位记 5 分，最后一档记 1 分，中间等比
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
    if (matched === 0) return null
    const score = sum / matched
    const grade = score >= 4.5 ? 'S' : score >= 4 ? 'A' : score >= 3.2 ? 'B' : score >= 2.6 ? 'C' : 'D'
    return { score, grade, total: matched, sourceCount: related.length }
  }, [ratings, activeCardId])

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
          <span>{activeFeed === 'lineup' ? filtered.length : ratings.length} 条结果</span>
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
            {communityRating && (
              <div className={styles.communityRatingBox}>
                <div className={styles.communityRatingTitle}>
                  卡牌社区评分：<strong>{communityRating.grade}</strong>（{communityRating.score.toFixed(2)}）
                </div>
                <div className={styles.communityRatingMeta}>
                  来自评分社区真实样本 {communityRating.total}（评分贴 {communityRating.sourceCount} 条）
                </div>
              </div>
            )}
            <div className={styles.feedList}>
              {filtered.map((build) => (
                <div key={build.id} className={styles.feedCard}>
                  <div className={styles.feedMeta}>
                    <div>
                      <div className={styles.feedTitle}>{build.name}</div>
                      <div className={styles.feedSub}>
                        {build.hero} · Day{build.dayFrom}-Day{build.dayTo} · {build.version}
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
                          className={`${styles.thumbBtn} ${getSizeClass(item?.size)} ${card.role === 'core' ? styles.roleCore : card.role === 'sub' ? styles.roleSub : styles.roleTech}`}
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
              ))}
            </div>
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
              {ratings
                .filter((r) => (onlyFavorites ? favoriteRatingIds.includes(r.id) : true))
                .filter((r) => (focusFavoriteId ? r.id === focusFavoriteId : true))
                .map((rating) => (
                  <div key={rating.id} className={styles.feedCard}>
                    <div className={styles.feedMeta}>
                      <div>
                        <div className={styles.feedTitle}>{rating.name}</div>
                        <div className={styles.feedSub}>
                          发布者：
                          {rating.authorBilibiliUid ? (
                            <a href={`https://space.bilibili.com/${rating.authorBilibiliUid}`} target="_blank" rel="noreferrer" className={styles.authorLink}>
                              <img src={cdnUrl('images/ui/Bilibili.svg')} alt="B站" className={styles.authorBiliIcon} />
                              {rating.authorName || '匿名'}
                            </a>
                          ) : (
                            <span>{rating.authorName || '匿名'}</span>
                          )}
                        </div>
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
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
