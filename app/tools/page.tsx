'use client'

import { useState, useEffect, useRef } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import ToolWikiPanel from '@/components/tools/ToolWikiPanel'
import ToolFunctionPanel from '@/components/tools/ToolFunctionPanel'
import ToolDetailPanel from '@/components/tools/ToolDetailPanel'
import ExploreLeftPanel from '@/components/tools/ExploreLeftPanel'
import ExploreCenterPanel from '@/components/tools/ExploreCenterPanel'
import { CommunityBuild, CommunityRatingShare } from '@/lib/communityBuilds'
import { itemsDbUrl, skillsDbUrl } from '@/lib/cdn'
import {
  loadCommunityProfileFromDb,
  loadCommunityProfileFromLocal,
  saveCommunityProfileToDb,
  loadCommunityReactionsFromDb,
  saveCommunityReactionsToDb,
  loadFavoriteLineupIdsFromDb,
  saveFavoriteLineupIdsToDb,
  loadFavoriteRatingIdsFromDb,
  saveFavoriteRatingIdsToDb,
  CommunityUserProfile,
  CommunityUserReactions,
} from '@/lib/draftDb'
import { fetchCommunityLineups, fetchCommunityRatings, publishLineup, publishRating, toggleInteraction } from '@/lib/communitySupabase'
import styles from './tools.module.css'

export default function ToolsPage() {
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

  const defaultExploreFilters: ExploreFilters = {
    hero: '',
    dayMin: 1,
    dayMax: 13,
    sort: 'hot',
    lookupRoles: ['core', 'sub', 'tech'],
    dayPlanTag: '',
    strengthTag: '',
    difficultyTag: '',
    specialSlots: Array.from({ length: 10 }, () => '' as '' | 'fire' | 'ice'),
  }
  const [items, setItems] = useState<any[]>([])
  const [skills, setSkills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [appMode, setAppMode] = useState<'edit' | 'explore'>('explore')
  const [activeView, setActiveView] = useState<'rating' | 'lineup'>('lineup')
  const [communityBuilds, setCommunityBuilds] = useState<CommunityBuild[]>([])
  const [communityRatings, setCommunityRatings] = useState<CommunityRatingShare[]>([])
  const [communityLoading, setCommunityLoading] = useState(false)
  const [lookupCardId, setLookupCardId] = useState<string | null>(null)
  const [exploreFilters, setExploreFilters] = useState<ExploreFilters>(defaultExploreFilters)
  const [userProfile, setUserProfile] = useState<CommunityUserProfile>({
    nickname: '',
    useBilibili: false,
    bilibiliUid: '',
  })
  const [userReactions, setUserReactions] = useState<CommunityUserReactions>({})
  const [favoriteLineupIds, setFavoriteLineupIds] = useState<string[]>([])
  const [favoriteRatingIds, setFavoriteRatingIds] = useState<string[]>([])
  const [leftWidth, setLeftWidth] = useState(20)
  const [rightWidth, setRightWidth] = useState(25)
  const [draggingResizer, setDraggingResizer] = useState<'left' | 'right' | null>(null)
  const mainContentRef = useRef<HTMLDivElement | null>(null)
  const resizeStartRef = useRef({ x: 0, left: 20, right: 25 })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const [profile, reactions, favorites, favoriteRatings] = await Promise.all([
        loadCommunityProfileFromDb(),
        loadCommunityReactionsFromDb(),
        loadFavoriteLineupIdsFromDb(),
        loadFavoriteRatingIdsFromDb(),
      ])
      if (!mounted) return
      if (profile) setUserProfile(profile)
      if (reactions) setUserReactions(reactions)
      if (favorites) setFavoriteLineupIds(favorites)
      if (favoriteRatings) setFavoriteRatingIds(favoriteRatings)
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

  async function loadData() {
    try {
      const hasChineseName = (item: any) => {
        const n = (item?.name_cn || '').trim()
        return !!n
      }

      const hasUntranslatedDesc = (item: any) => {
        const fields = [
          item?.description_cn,
          item?.descriptions,
          item?.description,
        ]
        return fields.some((field) => {
          if (field == null) return false
          const text = typeof field === 'string' ? field : JSON.stringify(field)
          return text.includes('[未翻译]')
        })
      }

      const isValidTranslated = (item: any) => hasChineseName(item) && !hasUntranslatedDesc(item)

      // 加载物品数据
      const itemsResponse = await fetch(itemsDbUrl())
      const itemsData = await itemsResponse.json()
      const filteredItems = Array.isArray(itemsData) ? itemsData.filter(isValidTranslated) : []
      setItems(filteredItems)

      // 加载技能数据
      const skillsResponse = await fetch(skillsDbUrl())
      const skillsData = await skillsResponse.json()
      const filteredSkills = Array.isArray(skillsData) ? skillsData.filter(isValidTranslated) : []
      setSkills(filteredSkills)

      setCommunityLoading(true)
      const [remoteBuilds, remoteRatings] = await Promise.all([
        fetchCommunityLineups(),
        fetchCommunityRatings(),
      ])
      setCommunityBuilds(remoteBuilds)
      setCommunityRatings(remoteRatings)
      setCommunityLoading(false)

      setLoading(false)
    } catch (error) {
      console.error('加载数据失败:', error)
      setLoading(false)
      setCommunityLoading(false)
    }
  }

  const ensureNickname = (): string | null => {
    const trimmed = userProfile.nickname.trim()
    if (trimmed) return trimmed
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

  const handleSaveProfile = (profile: CommunityUserProfile) => {
    setUserProfile(profile)
  }

  const handlePublish = async (mode: 'lineup' | 'rating', snapshot: any): Promise<boolean> => {
    const nickname = ensureNickname()
    if (!nickname) return false
    const profile = { ...userProfile, nickname }
    try {
      if (mode === 'lineup') await publishLineup(snapshot, profile)
      else await publishRating(snapshot, profile)
      const [remoteBuilds, remoteRatings] = await Promise.all([
        fetchCommunityLineups(),
        fetchCommunityRatings(),
      ])
      if (remoteBuilds.length > 0) setCommunityBuilds(remoteBuilds)
      if (remoteRatings.length > 0) setCommunityRatings(remoteRatings)
      return true
    } catch (error) {
      console.error('发布失败', error)
      const code = (error as any)?.code
      if (code === 'PGRST205') {
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
            ) : (
              <div className={`${styles.leftPanel} ${styles.leftPanelExplore}`}>
                <ExploreLeftPanel
                  items={items}
                  skills={skills}
                  filters={exploreFilters}
                  onChangeFilters={setExploreFilters}
                  lookupCard={lookupCardId ? items.find((it) => it.id === lookupCardId) || null : null}
                  onClearLookup={() => setLookupCardId(null)}
                  onResetAll={() => {
                    setExploreFilters(defaultExploreFilters)
                    setLookupCardId(null)
                  }}
                  onSelectItem={setSelectedItem}
                  onLookupBuilds={(item) => {
                    setLookupCardId(item.id)
                    setSelectedItem(item)
                  }}
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
                  userProfile={userProfile}
                  onSaveProfile={handleSaveProfile}
                  onPublish={handlePublish}
                />
              ) : (
                <ExploreCenterPanel
                  builds={communityBuilds}
                  ratings={communityRatings}
                  loading={communityLoading}
                  itemsById={Object.fromEntries(items.map((it) => [it.id, it]))}
                  filters={exploreFilters}
                  lookupCardId={lookupCardId}
                  focusCardId={selectedItem?.id || null}
                  userReactions={userReactions}
                  favoriteLineupIds={favoriteLineupIds}
                  favoriteRatingIds={favoriteRatingIds}
                  onSelectItem={setSelectedItem}
                  onToggleLike={(build) => handleToggleAction('lineup', build, 'like')}
                  onToggleFavorite={(build) => handleToggleAction('lineup', build, 'favorite')}
                  onToggleRatingLike={(rating) => handleToggleAction('rating', rating, 'like')}
                  onToggleRatingFavorite={(rating) => handleToggleAction('rating', rating, 'favorite')}
                  onImportBuild={(build) => {
                    const payload = build.snapshot || (build as any).lineup_payload || build
                    localStorage.setItem('pending_editor_import_build', JSON.stringify(payload))
                    setAppMode('edit')
                    setActiveView('lineup')
                  }}
                  onImportRating={(rating) => {
                    localStorage.setItem('pending_editor_import_rating', JSON.stringify(rating.ratingPayload))
                    setAppMode('edit')
                    setActiveView('rating')
                  }}
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
            <ToolDetailPanel item={selectedItem} />
          </div>
        )}
      </div>
    </DndProvider>
  )
}
