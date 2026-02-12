'use client'

import { useState } from 'react'
import WikiFilterPanel from '@/components/tools/WikiFilterPanel'
import DayRangeInput from '@/components/common/DayRangeInput'
import { heroAvatarUrl } from '@/lib/cdn'
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
type LookupRole = 'core' | 'sub' | 'tech'

interface ExploreLeftPanelProps {
  items: any[]
  skills: any[]
  filters: ExploreFilters
  onChangeFilters: (next: ExploreFilters) => void
  lookupCard: any | null
  onClearLookup: () => void
  onResetAll: () => void
  onSelectItem: (item: any) => void
  onLookupBuilds: (item: any) => void
}

const HERO_FILTER_OPTIONS = [
  { val: '', label: '全部', avatar: '' },
  { val: 'Pygmalien', label: '皮格马利翁', avatar: heroAvatarUrl('pygmalien') },
  { val: 'Jules', label: '朱尔斯', avatar: heroAvatarUrl('jules') },
  { val: 'Vanessa', label: '瓦内莎', avatar: heroAvatarUrl('vanessa') },
  { val: 'Mak', label: '马克', avatar: heroAvatarUrl('mak') },
  { val: 'Dooley', label: '多利', avatar: heroAvatarUrl('dooley') },
  { val: 'Stelle', label: '斯黛拉', avatar: heroAvatarUrl('stelle') },
] as const

export default function ExploreLeftPanel({
  items,
  skills,
  filters,
  onChangeFilters,
  lookupCard,
  onClearLookup,
  onResetAll,
  onSelectItem,
  onLookupBuilds,
}: ExploreLeftPanelProps) {
  const [dayMinInput, setDayMinInput] = useState(String(filters.dayMin))
  const [dayMaxInput, setDayMaxInput] = useState(String(filters.dayMax))
  const [filterCollapsed, setFilterCollapsed] = useState(false)

  const bumpRange = (field: 'min' | 'max', delta: number) => {
    if (field === 'min') {
      const next = Math.max(1, Number(dayMinInput || filters.dayMin) + delta)
      setDayMinInput(String(next))
      onChangeFilters({ ...filters, dayMin: next })
      return
    }
    const next = Math.max(1, Number(dayMaxInput || filters.dayMax) + delta)
    setDayMaxInput(String(next))
    onChangeFilters({ ...filters, dayMax: next })
  }

  return (
    <div className={styles.leftStack}>
      <div className={`${styles.panel} ${filterCollapsed ? styles.panelCollapsed : ''}`}>
        <div className={styles.panelHeader}>
          <div className={styles.sectionTitle}>社区过滤器</div>
          <button
            className={styles.collapseBtn}
            onClick={() => setFilterCollapsed((v) => !v)}
          >
            {filterCollapsed ? '展开' : '收起'}
          </button>
        </div>
        {!filterCollapsed && <div className={styles.fieldRow}>
          <label>英雄</label>
          <div className={styles.heroFilterGroup}>
            {HERO_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.val || 'all'}
                className={`${styles.heroFilterBtn} ${filters.hero === opt.val ? styles.heroFilterBtnActive : ''}`}
                onClick={() => onChangeFilters({ ...filters, hero: opt.val })}
                title={opt.label}
              >
                {opt.avatar ? (
                  <img src={opt.avatar} alt={opt.label} className={styles.heroFilterAvatar} />
                ) : (
                  <span className={styles.heroAllLabel}>全部</span>
                )}
              </button>
            ))}
          </div>
        </div>}
        {!filterCollapsed && <div className={styles.fieldRow}>
          <label>天数范围</label>
          <DayRangeInput
            startValue={dayMinInput}
            endValue={dayMaxInput}
            onStartChange={(value) => {
              setDayMinInput(value)
              onChangeFilters({ ...filters, dayMin: Number(value || 1) })
            }}
            onEndChange={(value) => {
              setDayMaxInput(value)
              onChangeFilters({ ...filters, dayMax: Number(value || 1) })
            }}
            onStartStep={(delta) => bumpRange('min', delta)}
            onEndStep={(delta) => bumpRange('max', delta)}
          />
        </div>}
        {!filterCollapsed && <div className={styles.fieldRow}>
          <label>排序</label>
          <div className={styles.inlineButtons}>
            <button
              className={filters.sort === 'hot' ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, sort: 'hot' })}
            >
              热度
            </button>
            <button
              className={filters.sort === 'new' ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, sort: 'new' })}
            >
              最新
            </button>
          </div>
        </div>}
        {!filterCollapsed && <div className={styles.fieldRow}>
          <label>卡牌角色过滤</label>
          <div className={styles.roleFilterButtons}>
            <button
              className={filters.lookupRoles.length === 3 ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, lookupRoles: ['core', 'sub', 'tech'] })}
            >
              全部
            </button>
            <button
              className={filters.lookupRoles.includes('core') ? styles.activeBtn : ''}
              onClick={() => {
                const has = filters.lookupRoles.includes('core')
                const next: LookupRole[] = has
                  ? filters.lookupRoles.filter((x) => x !== 'core')
                  : [...filters.lookupRoles, 'core']
                onChangeFilters({ ...filters, lookupRoles: next.length ? next : ['core'] })
              }}
            >
              核心
            </button>
            <button
              className={filters.lookupRoles.includes('sub') ? styles.activeBtn : ''}
              onClick={() => {
                const has = filters.lookupRoles.includes('sub')
                const next: LookupRole[] = has
                  ? filters.lookupRoles.filter((x) => x !== 'sub')
                  : [...filters.lookupRoles, 'sub']
                onChangeFilters({ ...filters, lookupRoles: next.length ? next : ['sub'] })
              }}
            >
              次核心
            </button>
            <button
              className={filters.lookupRoles.includes('tech') ? styles.activeBtn : ''}
              onClick={() => {
                const has = filters.lookupRoles.includes('tech')
                const next: LookupRole[] = has
                  ? filters.lookupRoles.filter((x) => x !== 'tech')
                  : [...filters.lookupRoles, 'tech']
                onChangeFilters({ ...filters, lookupRoles: next.length ? next : ['tech'] })
              }}
            >
              搭配
            </button>
          </div>
        </div>}
        {!filterCollapsed && <div className={styles.fieldRow}>
          <label>天数定位</label>
          <div className={styles.inlineButtons}>
            <button
              className={filters.dayPlanTag === '' ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, dayPlanTag: '' })}
            >
              全部
            </button>
            <button
              className={filters.dayPlanTag === '连胜早走' ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, dayPlanTag: '连胜早走' })}
            >
              连胜早走
            </button>
            <button
              className={filters.dayPlanTag === '北伐阵容' ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, dayPlanTag: '北伐阵容' })}
            >
              北伐阵容
            </button>
          </div>
        </div>}
        {!filterCollapsed && <div className={styles.fieldRow}>
          <label>强度定位</label>
          <div className={styles.inlineButtons}>
            <button
              className={filters.strengthTag === '' ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, strengthTag: '' })}
            >
              全部
            </button>
            <button
              className={filters.strengthTag === '版本强势' ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, strengthTag: '版本强势' })}
            >
              版本强势
            </button>
            <button
              className={filters.strengthTag === '中规中矩' ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, strengthTag: '中规中矩' })}
            >
              中规中矩
            </button>
            <button
              className={filters.strengthTag === '地沟油' ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, strengthTag: '地沟油' })}
            >
              地沟油
            </button>
          </div>
        </div>}
        {!filterCollapsed && <div className={styles.fieldRow}>
          <label>成型难度</label>
          <div className={styles.inlineButtons}>
            <button
              className={filters.difficultyTag === '' ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, difficultyTag: '' })}
            >
              全部
            </button>
            <button
              className={filters.difficultyTag === '容易成型' ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, difficultyTag: '容易成型' })}
            >
              容易成型
            </button>
            <button
              className={filters.difficultyTag === '比较困难' ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, difficultyTag: '比较困难' })}
            >
              比较困难
            </button>
            <button
              className={filters.difficultyTag === '极难成型' ? styles.activeBtn : ''}
              onClick={() => onChangeFilters({ ...filters, difficultyTag: '极难成型' })}
            >
              极难成型
            </button>
          </div>
        </div>}
        {!filterCollapsed && <div className={styles.lookupStateRow}>
          <div className={styles.lookupStateText}>
            当前过滤卡牌：{lookupCard ? (lookupCard.name_cn || lookupCard.name_en || lookupCard.id) : '无'}
          </div>
          {lookupCard && (
            <button className={styles.clearChipBtn} onClick={onClearLookup} title="清除卡牌过滤">
              ×
            </button>
          )}
          <button
            className={styles.resetAllBtn}
            onClick={() => {
              onResetAll()
              setDayMinInput('1')
              setDayMaxInput('13')
            }}
          >
            重置全部
          </button>
        </div>}
      </div>
      <div className={styles.wikiWrap}>
        <WikiFilterPanel
          items={items}
          skills={skills}
          onSelectItem={onSelectItem}
          enableBuildLookup
          onLookupBuilds={onLookupBuilds}
        />
      </div>
    </div>
  )
}
