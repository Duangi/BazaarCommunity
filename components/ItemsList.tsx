'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useDrag } from 'react-dnd'
import styles from './ItemsList.module.css'
import ItemDetailContent from './ItemDetailContent'
import ItemImage from './ItemImage'
import { heroAvatarUrl, iconUrl } from '@/lib/cdn'

export interface Item {
  id: string
  name_en: string
  name_cn: string
  type?: string
  size?: string
  tier?: string
  starting_tier?: string
  available_tiers?: string
  tags?: string
  hidden_tags?: string
  heroes?: string[]
  processed_tags?: string[]
  skills?: any[]
  enchantments?: any[]
  cooldown_tiers?: string
  cooldown?: number
  descriptions?: any[]
  description_cn?: any
  displayImg?: string
  art_key?: string
}

interface ItemsListProps {
  items: Item[]
  skills: any[]
  onSelectItem: (item: Item) => void
  enableBuildLookup?: boolean
  onLookupBuilds?: (item: Item) => void
}



const HERO_COLORS: Record<string, string> = {
  'Common': '#E0E0E0',
  'Pygmalien': '#5BA3FF',
  'Jules': '#D77EFF',
  'Vanessa': '#FF6B6B',
  'Mak': '#D4FF85',
  'Dooley': '#FFC048',
  'Stelle': '#FFE74C'
}

const HERO_FILTER_OPTIONS = [
  { val: 'Pygmalien', label: '皮格马利翁', avatar: heroAvatarUrl('pygmalien') },
  { val: 'Jules', label: '朱尔斯', avatar: heroAvatarUrl('jules') },
  { val: 'Vanessa', label: '瓦内莎', avatar: heroAvatarUrl('vanessa') },
  { val: 'Mak', label: '马克', avatar: heroAvatarUrl('mak') },
  { val: 'Dooley', label: '多利', avatar: heroAvatarUrl('dooley') },
  { val: 'Stelle', label: '斯黛拉', avatar: heroAvatarUrl('stelle') },
] as const

export function ItemCard({
  item,
  onClick,
  isExpanded,
  sourceType,
}: {
  item: Item
  onClick: () => void
  isExpanded: boolean
  sourceType: 'items' | 'skills'
}) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'ITEM',
    item: { item, sourceType },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }))

  const tierClass = (item.tier || item.starting_tier || 'Bronze').split(' / ')[0].toLowerCase()
  const tierNameZh: Record<string, string> = {
    'bronze': '青铜+',
    'silver': '白银+',
    'gold': '黄金+',
    'diamond': '钻石+',
    'legendary': '传说'
  }
  const tierLabel = tierNameZh[tierClass] || tierClass
  const sizeClass = (item.size || 'Medium').split(' / ')[0].toLowerCase()
  
  // 处理 heroes 字段（可能是字符串或数组）
  const heroesStr = typeof item.heroes === 'string' ? item.heroes : (Array.isArray(item.heroes) ? item.heroes[0] : '')
  const heroKey = heroesStr ? heroesStr.split(' / ')[0].trim() : 'Common'
  const heroSlug = heroKey.toLowerCase()
  // 技能英雄显示只要中文名（斜杠后的部分），没有就退回英文
  const heroZh = heroesStr
    ? (heroesStr.split(' / ')[1]?.trim() || heroesStr.split(' / ')[0].trim())
    : '通用'
  const heroColor = HERO_COLORS[heroKey]
  const isCommon = !heroKey || heroSlug === 'common'

  // 处理标签（技能和物品的结构可能不同）
  const getTags = () => {
    if (item.processed_tags && item.processed_tags.length > 0) {
      return item.processed_tags
    }
    // 如果没有 processed_tags，尝试从 tags 字段解析
    if (item.tags && typeof item.tags === 'string') {
      return item.tags.split('|').map(t => {
        const parts = t.trim().split('/')
        return parts.length > 1 ? parts[1].trim() : parts[0].trim()
      }).filter(t => t)
    }
    return []
  }

  const displayTags = getTags()

  return (
    <div 
      ref={drag as any}
      className={`${styles.itemCardContainer} ${isExpanded ? styles.expanded : ''} ${isDragging ? styles.dragging : ''}`}
      onClick={onClick}
    >
      <div className={`${styles.itemCard} ${styles[`tier${tierClass.charAt(0).toUpperCase() + tierClass.slice(1)}`]}`}>
        <div className={styles.cardLeft}>
          <div className={`${styles.imageBox} ${styles[`size${sizeClass.charAt(0).toUpperCase() + sizeClass.slice(1)}`]}`}>
            <ItemImage
              item={item}
              alt={item.name_cn || item.name_en}
              className={styles.itemImage}
              fallbackClassName={styles.placeholder}
            />
          </div>
        </div>

        <div className={styles.cardCenter}>
          <div className={styles.nameLine}>
            <span className={styles.nameCn}>{item.name_cn || item.name_en}</span>
            <span className={`${styles.tierLabel} ${styles[`tier${tierClass.charAt(0).toUpperCase() + tierClass.slice(1)}`]}`}>
              {tierLabel}
            </span>
          </div>
          <div className={styles.tagsLine}>
            {displayTags.slice(0, 3).map((tag, idx) => (
              <span key={idx} className={styles.tagBadge}>{tag}</span>
            ))}
          </div>
        </div>

        <div className={styles.cardRight}>
          <div className={styles.topRightGroup}>
            {isCommon ? (
              <span className={styles.heroBadge} style={{ color: heroColor }}>{heroZh}</span>
            ) : (
              <div className={styles.heroAvatarContainer} title={`专属英雄: ${heroZh}`}>
                <img
                  src={heroAvatarUrl(heroSlug)}
                  alt={heroZh}
                  className={styles.heroAvatar}
                />
              </div>
            )}
          </div>
          <div className={styles.expandChevron}>{isExpanded ? '▴' : '▾'}</div>
        </div>
      </div>

      {/* 展开的详情 */}
      {isExpanded && (
        <div className={styles.itemDetailsV2}>
          <ItemDetailContent item={item as any} />
        </div>
      )}
    </div>
  )
}

export default function ItemsList({
  items,
  skills,
  onSelectItem,
  enableBuildLookup = false,
  onLookupBuilds,
}: ItemsListProps) {
  const normalizeText = (value: any): string =>
    (value == null ? '' : String(value)).toLowerCase().trim()

  const subsequenceMatch = (text: string, query: string): boolean => {
    if (!query) return true
    let qi = 0
    for (let i = 0; i < text.length && qi < query.length; i += 1) {
      if (text[i] === query[qi]) qi += 1
    }
    return qi === query.length
  }

  const buildSearchBlob = (item: any): string => {
    const parts = [
      item?.id,
      item?.name_cn,
      item?.name_en,
      item?.tags,
      item?.hidden_tags,
      item?.description_cn,
      item?.descriptions ? JSON.stringify(item.descriptions) : '',
      item?.skills ? JSON.stringify(item.skills) : '',
      item?.skills_passive ? JSON.stringify(item.skills_passive) : '',
      item?.quests ? JSON.stringify(item.quests) : '',
    ]
    return normalizeText(parts.filter(Boolean).join(' '))
  }

  const scoreByKeyword = (item: any, keyword: string): number => {
    const query = normalizeText(keyword)
    if (!query) return 0

    const tokens = query.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return 0

    const nameCn = normalizeText(item?.name_cn)
    const nameEn = normalizeText(item?.name_en)
    const id = normalizeText(item?.id)
    const blob = buildSearchBlob(item)

    let score = 0
    for (const token of tokens) {
      let tokenScore = -1
      const cnIdx = nameCn.indexOf(token)
      const enIdx = nameEn.indexOf(token)
      const idIdx = id.indexOf(token)
      const blobIdx = blob.indexOf(token)

      if (cnIdx >= 0) tokenScore = Math.max(tokenScore, 220 - Math.min(cnIdx, 80))
      if (enIdx >= 0) tokenScore = Math.max(tokenScore, 200 - Math.min(enIdx, 80))
      if (idIdx >= 0) tokenScore = Math.max(tokenScore, 160 - Math.min(idIdx, 80))
      if (blobIdx >= 0) tokenScore = Math.max(tokenScore, 100 - Math.min(blobIdx, 90))

      if (tokenScore < 0 && (subsequenceMatch(nameCn, token) || subsequenceMatch(nameEn, token))) {
        tokenScore = 70
      }
      if (tokenScore < 0 && subsequenceMatch(blob, token)) {
        tokenScore = 40
      }
      if (tokenScore < 0) return -1
      score += tokenScore
    }
    return score
  }

  const [activeTab, setActiveTab] = useState<'items' | 'skills'>('items')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [size, setSize] = useState<'' | 'small' | 'medium' | 'large'>('')
  const [startTier, setStartTier] = useState<'' | 'bronze' | 'silver' | 'gold' | 'diamond' | 'legendary'>('')
  const [hero, setHero] = useState<string>('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedHiddenTags, setSelectedHiddenTags] = useState<string[]>([])
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('any')
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false)
  const [visibleCount, setVisibleCount] = useState(30)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [lookupTarget, setLookupTarget] = useState<Item | null>(null)
  const [filterHeight, setFilterHeight] = useState(320)
  const [isResizing, setIsResizing] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const resizeStartYRef = useRef(0)
  const resizeStartHeightRef = useRef(320)

  useEffect(() => {
    if (activeTab === 'skills') {
      setSize('medium')
    } else {
      setSize('')
    }
  }, [activeTab])

  useEffect(() => {
    setVisibleCount(30)
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = 0
    }
  }, [searchKeyword, size, startTier, hero, selectedTags, selectedHiddenTags, activeTab])

  const filteredItems = useMemo(() => {
    let result = activeTab === 'items' ? items : skills

    result = result.filter((item: any) => 
      !item.name_cn?.includes('中型包裹') && 
      !item.name_en?.includes('Medium Package')
    )

    const effectiveSize = activeTab === 'skills' ? 'medium' : size
    if (effectiveSize) {
      result = result.filter((item: any) => {
        const itemSize = (item.size || '').toLowerCase()
        return itemSize.includes(effectiveSize)
      })
    }

    if (startTier) {
      result = result.filter((item: any) => {
        const tier = ((item.tier || item.starting_tier) || '').toLowerCase()
        return tier.includes(startTier)
      })
    }

    if (hero && hero !== 'Common') {
      result = result.filter((item: any) => {
        const heroes = item.heroes || ''
        const heroStr = typeof heroes === 'string' ? heroes : (Array.isArray(heroes) ? heroes.join(' ') : '')
        return heroStr.includes(hero)
      })
    } else if (hero === 'Common') {
      result = result.filter((item: any) => {
        const heroes = item.heroes || ''
        const heroStr = typeof heroes === 'string' ? heroes : (Array.isArray(heroes) ? heroes.join(' ') : '')
        return !heroStr || heroStr === '' || heroStr.includes('Common') || heroStr.includes('通用')
      })
    }

    if (selectedTags.length > 0) {
      result = result.filter((item: any) => {
        const itemTags = (item.tags || '').toLowerCase()
        if (matchMode === 'all') {
          return selectedTags.every(tag => itemTags.includes(tag.toLowerCase()))
        } else {
          return selectedTags.some(tag => itemTags.includes(tag.toLowerCase()))
        }
      })
    }

    if (selectedHiddenTags.length > 0) {
      result = result.filter((item: any) => {
        const itemHiddenTags = (item.hidden_tags || '').toLowerCase()
        if (matchMode === 'all') {
          return selectedHiddenTags.every(tag => itemHiddenTags.includes(tag.toLowerCase()))
        } else {
          return selectedHiddenTags.some(tag => itemHiddenTags.includes(tag.toLowerCase()))
        }
      })
    }

    const trimmedKeyword = searchKeyword.trim()
    if (!trimmedKeyword) return result

    return result
      .map((item: any) => ({ item, score: scoreByKeyword(item, trimmedKeyword) }))
      .filter((x: any) => x.score >= 0)
      .sort((a: any, b: any) => {
        if (b.score !== a.score) return b.score - a.score
        const aName = (a.item?.name_cn || a.item?.name_en || a.item?.id || '').toString()
        const bName = (b.item?.name_cn || b.item?.name_en || b.item?.id || '').toString()
        return aName.localeCompare(bName, 'zh-CN')
      })
      .map((x: any) => x.item)
  }, [items, skills, activeTab, searchKeyword, size, startTier, hero, selectedTags, selectedHiddenTags, matchMode])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight
    
    if (scrollBottom < 200 && visibleCount < filteredItems.length) {
      setVisibleCount(prev => Math.min(prev + 30, filteredItems.length))
    }
  }

  const toggleExpand = (itemId: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId)
    } else {
      newExpanded.add(itemId)
    }
    setExpandedItems(newExpanded)
  }

  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isFilterCollapsed) return
    setIsResizing(true)
    resizeStartYRef.current = e.clientY
    resizeStartHeightRef.current = filterHeight
  }

  const handleResizeEnter = () => {
    if (!isResizing) document.body.style.cursor = 'ns-resize'
  }

  const handleResizeLeave = () => {
    if (!isResizing) document.body.style.cursor = ''
  }

  useEffect(() => {
    if (!isResizing) return

    const originalBodyCursor = document.body.style.cursor
    const originalBodySelect = document.body.style.userSelect
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizeStartYRef.current
      const containerHeight = containerRef.current?.clientHeight || 0
      const minFilterHeight = 140
      const minListHeight = 220
      const maxFilterHeight = Math.max(minFilterHeight, containerHeight - minListHeight)
      const nextHeight = Math.min(
        maxFilterHeight,
        Math.max(minFilterHeight, resizeStartHeightRef.current + deltaY)
      )
      setFilterHeight(nextHeight)
    }

    const onMouseUp = () => {
      setIsResizing(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      document.body.style.cursor = originalBodyCursor
      document.body.style.userSelect = originalBodySelect
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isResizing])

  return (
    <div ref={containerRef} className={styles.container}>
      {/* 顶部标签 */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'items' ? styles.active : ''}`}
          onClick={() => setActiveTab('items')}
        >
          物品 ({items.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'skills' ? styles.active : ''}`}
          onClick={() => setActiveTab('skills')}
        >
          技能 ({skills.length})
        </button>
      </div>

      {/* 搜索过滤器 */}
      <div
        className={styles.searchBoxContainer}
        style={isFilterCollapsed ? undefined : { height: `${filterHeight}px` }}
      >
        <div className={styles.filterContent}>
          <div className={styles.filterHeader}>
            <div className={styles.filterHeaderLeft}>
              <div className={styles.filterTitle}>搜索过滤器</div>
              <div className={styles.matchModeButtons}>
                <button
                  className={`${styles.matchModeBtn} ${matchMode === 'all' ? styles.active : ''}`}
                  onClick={() => setMatchMode('all')}
                >
                  匹配所有
                </button>
                <button
                  className={`${styles.matchModeBtn} ${matchMode === 'any' ? styles.active : ''}`}
                  onClick={() => setMatchMode('any')}
                >
                  匹配任一
                </button>
              </div>
            </div>
            <button 
              className={styles.collapseBtn}
              onClick={() => setIsFilterCollapsed(!isFilterCollapsed)}
            >
              {isFilterCollapsed ? '展开 ▼' : '收起 ▲'}
            </button>
          </div>

          {!isFilterCollapsed && (
            <div className={styles.filterBody}>
              <div className={styles.filterRow}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="搜索名称 / 描述..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                />
              </div>

              {activeTab === 'items' && (
                <div className={styles.filterRow}>
                  <div className={styles.buttonGroup}>
                    {[
                      { val: 'small', label: '小' },
                      { val: 'medium', label: '中' },
                      { val: 'large', label: '大' }
                    ].map(opt => (
                      <button
                        key={opt.val}
                        className={`${styles.toggleBtn} ${size === opt.val ? styles.active : ''}`}
                        onClick={() => setSize(size === opt.val ? '' : opt.val as any)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.filterRow}>
                <div className={styles.buttonGroup}>
                  {[
                    { val: 'bronze', label: '青铜', color: '#cd7f32' },
                    { val: 'silver', label: '白银', color: '#c0c0c0' },
                    { val: 'gold', label: '黄金', color: '#ffd700' },
                    { val: 'diamond', label: '钻石', color: '#b9f2ff' },
                    { val: 'legendary', label: '传说', color: '#ff4500' }
                  ].map(opt => (
                    <button
                      key={opt.val}
                      className={`${styles.toggleBtn} ${startTier === opt.val ? styles.active : ''}`}
                      onClick={() => setStartTier(startTier === opt.val ? '' : opt.val as any)}
                      style={{ color: opt.color }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className={styles.heroFilterGroup}>
                  <button
                    className={`${styles.toggleBtn} ${styles.heroCommonBtn} ${hero === 'Common' ? styles.active : ''}`}
                    onClick={() => setHero(hero === 'Common' ? '' : 'Common')}
                  >
                    通用
                  </button>
                  {HERO_FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt.val}
                      className={`${styles.heroFilterBtn} ${hero === opt.val ? styles.heroFilterBtnActive : ''}`}
                      onClick={() => setHero(hero === opt.val ? '' : opt.val)}
                      title={opt.label}
                    >
                      <img src={opt.avatar} alt={opt.label} className={styles.heroFilterAvatar} />
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.filterSection}>
                <div className={styles.sectionLabel}>标签 (可多选)</div>
                <div className={styles.tagButtons}>
                  {[
                    ["Drone", "无人机"], ["Property", "地产"], ["Ray", "射线"], 
                    ["Tool", "工具"], ["Dinosaur", "恐龙"], ["Loot", "战利品"], 
                    ["Apparel", "服饰"], ["Core", "核心"], ["Weapon", "武器"], 
                    ["Aquatic", "水系"], ["Toy", "玩具"], ["Tech", "科技"], 
                    ["Potion", "药水"], ["Reagent", "原料"], ["Vehicle", "载具"], 
                    ["Relic", "遗物"], ["Food", "食物"], ["Dragon", "龙"], 
                    ["Friend", "伙伴"]
                  ].sort((a, b) => a[1].localeCompare(b[1], 'zh-CN')).map(([val, label]) => (
                    <button
                      key={val}
                      className={`${styles.toggleBtn} ${styles.tagBtn} ${selectedTags.includes(val) ? styles.active : ''}`}
                      onClick={() => {
                        if (selectedTags.includes(val)) {
                          setSelectedTags(selectedTags.filter(t => t !== val))
                        } else {
                          setSelectedTags([...selectedTags, val])
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.filterSection}>
                <div className={styles.sectionLabel}>隐藏标签 (可多选)</div>
                <div className={styles.hiddenTagButtons}>
                  {[
                    { tags: [["Ammo", "弹药"], ["AmmoRef", "弹药相关"]], icon: "Ammo", color: "#ff8e00" },
                    { tags: [["Burn", "灼烧"], ["BurnRef", "灼烧相关"]], icon: "Burn", color: "#ff9f45" },
                    { tags: [["Charge", "充能"]], icon: "Charge", color: "#00ecc3" },
                    { tags: [["Cooldown", "冷却"], ["CooldownReference", "冷却相关"]], icon: "Cooldown", color: "#00ecc3" },
                    { tags: [["Crit", "暴击"], ["CritRef", "暴击相关"]], icon: "CritChance", color: "#f5503d" },
                    { tags: [["Damage", "伤害"], ["DamageRef", "伤害相关"]], icon: "Damage", color: "#f5503d" },
                    { tags: [["EconomyRef", "经济相关"], ["Gold", "金币"]], icon: "Income", color: "#ffcd19" },
                    { tags: [["Flying", "飞行"], ["FlyingRef", "飞行相关"]], icon: "Flying", color: "#f4cf20" },
                    { tags: [["Freeze", "冻结"], ["FreezeRef", "冻结相关"]], icon: "Freeze", color: "#00ccff" },
                    { tags: [["Haste", "加速"], ["HasteRef", "加速相关"]], icon: "Haste", color: "#00ecc3" },
                    { tags: [["Heal", "治疗"], ["HealRef", "治疗相关"]], icon: "Health", color: "#8eea31" },
                    { tags: [["Health", "生命值"], ["HealthRef", "生命值相关"]], icon: "MaxHPHeart", color: "#8eea31" },
                    { tags: [["Lifesteal", "生命偷取"]], icon: "Lifesteal", color: "#9d4a6f" },
                    { tags: [["Poison", "剧毒"], ["PoisonRef", "剧毒相关"]], icon: "Poison", color: "#0ebe4f" },
                    { tags: [["Quest", "任务"]], icon: null, color: "#9098fe" },
                    { tags: [["Regen", "再生"], ["RegenRef", "再生相关"]], icon: "Regen", color: "#8eea31" },
                    { tags: [["Shield", "护盾"], ["ShieldRef", "护盾相关"]], icon: "Shield", color: "#00bcd4" },
                    { tags: [["Slow", "减速"], ["SlowRef", "减速相关"]], icon: "Slowness", color: "#00ccff" },
                  ].map((group, groupIndex) => (
                    <div key={groupIndex} className={styles.hiddenTagGroup}>
                      {group.tags.map(([val, label], index) => (
                        <button
                          key={val}
                          className={`${styles.toggleBtn} ${styles.hiddenTagBtn} ${selectedHiddenTags.includes(val) ? styles.active : ''}`}
                          onClick={() => {
                            if (selectedHiddenTags.includes(val)) {
                              setSelectedHiddenTags(selectedHiddenTags.filter(t => t !== val))
                            } else {
                              setSelectedHiddenTags([...selectedHiddenTags, val])
                            }
                          }}
                          style={{ color: group.color }}
                        >
                          {index === 0 && group.icon && (
                            <img 
                              src={iconUrl(group.icon)}
                              alt="" 
                              className={styles.tagIcon}
                            />
                          )}
                          {label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className={styles.filterFooter}>
            <div className={styles.resultCount}>
              找到 <span className={styles.resultNumber}>{filteredItems.length}</span> 个结果
            </div>
            <button
              className={styles.resetBtn}
              onClick={() => {
                setSearchKeyword('')
                setSize(activeTab === 'skills' ? 'medium' : '')
                setStartTier('')
                setHero('')
                setSelectedTags([])
                setSelectedHiddenTags([])
              }}
            >
              重置
            </button>
          </div>
        </div>
      </div>

      {!isFilterCollapsed && (
        <div
          className={`${styles.resizeBar} ${isResizing ? styles.resizing : ''}`}
          onMouseDown={handleResizeStart}
          onMouseEnter={handleResizeEnter}
          onMouseLeave={handleResizeLeave}
          title="上下拖动调整过滤器高度"
        >
          <div className={styles.resizeBarGrip} />
        </div>
      )}

      {/* 物品列表 */}
      {enableBuildLookup && (
        <div className={styles.lookupActionBar}>
          <div className={styles.lookupTargetName}>
            {lookupTarget ? `当前选中：${lookupTarget.name_cn || lookupTarget.name_en || lookupTarget.id}` : '先在列表中选一张卡'}
          </div>
          <button
            className={styles.lookupBuildBtn}
            disabled={!lookupTarget || !onLookupBuilds}
            onClick={() => {
              if (!lookupTarget || !onLookupBuilds) return
              onLookupBuilds(lookupTarget)
            }}
          >
            🔍 寻找包含此卡的阵容
          </button>
        </div>
      )}
      <div 
        ref={scrollAreaRef}
        className={styles.itemsList}
        onScroll={handleScroll}
      >
        {filteredItems.slice(0, visibleCount).map((item: any) => (
          <ItemCard
            key={item.id}
            item={item}
            sourceType={activeTab}
            onClick={() => {
              toggleExpand(item.id)
              onSelectItem(item)
              setLookupTarget(item)
            }}
            isExpanded={expandedItems.has(item.id)}
          />
        ))}
        {visibleCount < filteredItems.length && (
          <div className={styles.loadingMore}>
            向下滚动加载更多...
          </div>
        )}
      </div>
    </div>
  )
}
