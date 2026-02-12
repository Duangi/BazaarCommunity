'use client'

import { useState, useEffect, useRef } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import ToolWikiPanel from '@/components/tools/ToolWikiPanel'
import ToolFunctionPanel from '@/components/tools/ToolFunctionPanel'
import ToolDetailPanel from '@/components/tools/ToolDetailPanel'
import ExploreLeftPanel from '@/components/tools/ExploreLeftPanel'
import ExploreCenterPanel from '@/components/tools/ExploreCenterPanel'
import { CommunityBuild, createMockBuildsFromItems } from '@/lib/communityBuilds'
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
  }
  const [items, setItems] = useState<any[]>([])
  const [skills, setSkills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [appMode, setAppMode] = useState<'edit' | 'explore'>('explore')
  const [activeView, setActiveView] = useState<'rating' | 'lineup'>('lineup')
  const [communityBuilds, setCommunityBuilds] = useState<CommunityBuild[]>([])
  const [lookupCardId, setLookupCardId] = useState<string | null>(null)
  const [exploreFilters, setExploreFilters] = useState<ExploreFilters>(defaultExploreFilters)
  const [leftWidth, setLeftWidth] = useState(20)
  const [rightWidth, setRightWidth] = useState(25)
  const [draggingResizer, setDraggingResizer] = useState<'left' | 'right' | null>(null)
  const mainContentRef = useRef<HTMLDivElement | null>(null)
  const resizeStartRef = useRef({ x: 0, left: 20, right: 25 })

  useEffect(() => {
    loadData()
  }, [])

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
      const itemsResponse = await fetch('/items_db.json')
      const itemsData = await itemsResponse.json()
      const filteredItems = Array.isArray(itemsData) ? itemsData.filter(isValidTranslated) : []
      setItems(filteredItems)
      setCommunityBuilds(createMockBuildsFromItems(filteredItems))

      // 加载技能数据
      const skillsResponse = await fetch('/skills_db.json')
      const skillsData = await skillsResponse.json()
      const filteredSkills = Array.isArray(skillsData) ? skillsData.filter(isValidTranslated) : []
      setSkills(filteredSkills)

      setLoading(false)
    } catch (error) {
      console.error('加载数据失败:', error)
      setLoading(false)
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
                />
              ) : (
                <ExploreCenterPanel
                  builds={communityBuilds}
                  itemsById={Object.fromEntries(items.map((it) => [it.id, it]))}
                  filters={exploreFilters}
                  lookupCardId={lookupCardId}
                  focusCardId={selectedItem?.id || null}
                  onSelectItem={setSelectedItem}
                  onImportBuild={(build) => {
                    localStorage.setItem('pending_editor_import_build', JSON.stringify(build))
                    setAppMode('edit')
                    setActiveView('lineup')
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
