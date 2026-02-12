'use client'

import { useMemo } from 'react'
import ItemImage from '@/components/ItemImage'
import { CommunityBuild } from '@/lib/communityBuilds'
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
}

interface ExploreCenterPanelProps {
  builds: CommunityBuild[]
  itemsById: Record<string, any>
  filters: ExploreFilters
  lookupCardId: string | null
  focusCardId?: string | null
  onSelectItem: (item: any) => void
  onImportBuild: (build: CommunityBuild) => void
}

function getRoleWeight(role: 'core' | 'sub' | 'tech'): number {
  if (role === 'core') return 0
  if (role === 'sub') return 1
  return 2
}

export default function ExploreCenterPanel({
  builds,
  itemsById,
  filters,
  lookupCardId,
  focusCardId,
  onSelectItem,
  onImportBuild,
}: ExploreCenterPanelProps) {
  const filtered = useMemo(() => {
    let result = [...builds]
    if (filters.hero) result = result.filter((b) => b.hero === filters.hero)
    if (filters.dayPlanTag) result = result.filter((b) => b.dayPlanTag === filters.dayPlanTag)
    if (filters.strengthTag) result = result.filter((b) => b.strengthTag === filters.strengthTag)
    if (filters.difficultyTag) result = result.filter((b) => b.difficultyTag === filters.difficultyTag)
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
    return result
  }, [builds, filters, lookupCardId])

  const activeCardId = lookupCardId || focusCardId || null
  const communityRating = useMemo(() => {
    if (!activeCardId) return null
    const related = builds.filter((b) => b.cards_data.some((c) => c.id === activeCardId))
    if (related.length === 0) return null
    const roleValues: Record<string, number> = { core: 5, sub: 3.5, tech: 2 }
    let sum = 0
    let core = 0
    let sub = 0
    let tech = 0
    related.forEach((b) => {
      const role = b.cards_data.find((c) => c.id === activeCardId)?.role || 'tech'
      sum += roleValues[role] || 2
      if (role === 'core') core += 1
      else if (role === 'sub') sub += 1
      else tech += 1
    })
    const score = sum / related.length
    const grade = score >= 4.5 ? 'S' : score >= 4 ? 'A' : score >= 3.2 ? 'B' : score >= 2.6 ? 'C' : 'D'
    return { score, grade, total: related.length, core, sub, tech }
  }, [builds, activeCardId])

  const getSizeClass = (sizeRaw?: string) => {
    const s = (sizeRaw || 'Medium').toLowerCase()
    if (s.includes('small') || s.includes('小')) return styles.thumbSmall
    if (s.includes('large') || s.includes('大')) return styles.thumbLarge
    return styles.thumbMedium
  }

  return (
    <div className={styles.feedPanel}>
      <div className={styles.feedHeader}>
        <h2>社区构筑</h2>
        <span>{filtered.length} 条结果</span>
      </div>
      {communityRating && (
        <div className={styles.communityRatingBox}>
          <div className={styles.communityRatingTitle}>
            卡牌社区评分：<strong>{communityRating.grade}</strong>（{communityRating.score.toFixed(2)}）
          </div>
          <div className={styles.communityRatingMeta}>
            样本 {communityRating.total} · 核心 {communityRating.core} · 次核心 {communityRating.sub} · 搭配 {communityRating.tech}
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
                <div className={styles.feedTags}>
                  {build.dayPlanTag && <span className={styles.feedTag}>{build.dayPlanTag}</span>}
                  {build.strengthTag && <span className={styles.feedTag}>{build.strengthTag}</span>}
                  {build.difficultyTag && <span className={styles.feedTag}>{build.difficultyTag}</span>}
                </div>
              </div>
              <div className={styles.feedStats}>
                <span>❤️ {build.likes}</span>
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
              <button>❤️ 点赞 / 收藏</button>
              <button onClick={() => onImportBuild(build)}>⚡ 一键导入编辑器</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
