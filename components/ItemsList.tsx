'use client'

import { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import { useDrag } from 'react-dnd'
import styles from './ItemsList.module.css'

interface Item {
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
  displayImg?: string
}

interface ItemsListProps {
  items: Item[]
  skills: any[]
  onSelectItem: (item: Item) => void
}

// 关键词颜色映射
const KEYWORD_COLORS: Record<string, string> = {
  "弹药": "#ff8e00",
  "灼烧": "#ff9f45",
  "充能": "#00ecc3",
  "冷却": "#00ecc3",
  "暴击": "#f5503d",
  "伤害": "#f5503d",
  "金币": "#ffd700",
  "治疗": "#8eea31",
  "生命值": "#8eea31",
  "最大生命值": "#8eea31",
  "收入": "#ffcd19",
  "吸血": "#9d4a6f",
  "剧毒": "#0ebe4f",
  "生命再生": "#8eea31",
  "护盾": "#f4cf20",
  "减速": "#cb9f6e",
  "价值": "#ffcd19",
  "冻结": "#00ccff",
  "加速": "#00ecc3"
}

// 附魔颜色映射
const ENCHANT_COLORS: Record<string, string> = {
  "黄金": "var(--c-gold)",
  "沉重": "var(--c-slow)",
  "寒冰": "var(--c-freeze)",
  "疾速": "var(--c-haste)",
  "护盾": "var(--c-shield)",
  "回复": "var(--c-heal)",
  "毒素": "var(--c-poison)",
  "炽焰": "var(--c-burn)",
  "闪亮": "#98a8fe",
  "致命": "var(--c-damage)",
  "辉耀": "#98a8fe",
  "黑曜石": "#9d4a6f"
}

// 渲染文本，高亮关键词和数值序列
const renderText = (text: any) => {
  if (!text) return null
  
  let content = ""
  if (typeof text === 'string') {
    content = text
  } else if (text.cn) {
    content = text.cn
  } else if (text.en) {
    content = text.en
  } else {
    return null
  }
  
  // 1. 处理数值序列如 3/6/9/12
  const parts = content.split(/(\d+(?:\/\d+)+)/g)
  
  return parts.map((part, i) => {
    if (part.includes('/')) {
      const nums = part.split('/')
      return (
        <span key={i} style={{ fontWeight: 'bold' }}>
          {nums.map((n, idx) => {
            let colorIdx = idx
            if (nums.length === 2) colorIdx = idx + 2
            else if (nums.length === 3) colorIdx = idx + 1
            
            const tierColors = ['#cd7f32', '#c0c0c0', '#ffd700', '#b9f2ff']
            const color = tierColors[colorIdx] || '#ffd700'
            
            return (
              <Fragment key={idx}>
                <span style={{ color }}>{n}</span>
                {idx < nums.length - 1 && '/'}
              </Fragment>
            )
          })}
        </span>
      )
    }
    
    // 2. 高亮关键词
    const keywords = Object.keys(KEYWORD_COLORS)
    const regex = new RegExp(`(${keywords.join('|')})`, 'g')
    const subParts = part.split(regex)
    
    return subParts.map((sub, j) => {
      if (KEYWORD_COLORS[sub]) {
        return <span key={j} style={{ color: KEYWORD_COLORS[sub], fontWeight: 'bold' }}>{sub}</span>
      }
      return sub
    })
  })
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

function ItemCard({ item, onClick, isExpanded }: { item: Item; onClick: () => void; isExpanded: boolean }) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'ITEM',
    item: { item },
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
  // 技能英雄显示只要中文名（斜杠后的部分），没有就退回英文
  const heroZh = heroesStr
    ? (heroesStr.split(' / ')[1]?.trim() || heroesStr.split(' / ')[0].trim())
    : '通用'
  const heroColor = HERO_COLORS[heroKey]

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
      ref={drag}
      className={`${styles.itemCardContainer} ${isExpanded ? styles.expanded : ''} ${isDragging ? styles.dragging : ''}`}
      onClick={onClick}
    >
      <div className={`${styles.itemCard} ${styles[`tier${tierClass.charAt(0).toUpperCase() + tierClass.slice(1)}`]}`}>
        <div className={styles.cardLeft}>
          <div className={`${styles.imageBox} ${styles[`size${sizeClass.charAt(0).toUpperCase() + sizeClass.slice(1)}`]}`}>
            <div className={styles.placeholder}>🎴</div>
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
            <span className={styles.heroBadge} style={{ color: heroColor }}>{heroZh}</span>
          </div>
          <div className={styles.expandChevron}>{isExpanded ? '▴' : '▾'}</div>
        </div>
      </div>

      {/* 展开的详情 */}
      {isExpanded && (
        <div className={styles.itemDetailsV2}>
          <div className={styles.detailsContent}>
            {/* 冷却时间显示 */}
            {(() => {
              const cdTiersRaw = item.cooldown_tiers
              const availTiersRaw = item.available_tiers
              const hasProgression = cdTiersRaw && typeof cdTiersRaw === 'string' && cdTiersRaw.includes('/')
              
              if (hasProgression) {
                const cdVals = cdTiersRaw.split('/').map((v: string) => {
                  const ms = parseFloat(v)
                  if (isNaN(ms)) return "0.0"
                  return (ms > 100 ? ms / 1000 : ms).toFixed(1)
                })
                const availTiers = (availTiersRaw || '').split('/').map((t: string) => t.toLowerCase().trim())
                const tierSequence = ['bronze', 'silver', 'gold', 'diamond', 'legendary']
                
                return (
                  <div className={styles.detailsLeft}>
                    <div className={styles.cdProgression}>
                      {cdVals.map((v: string, i: number) => {
                        let tierName = 'gold'
                        if (availTiers[i]) {
                          tierName = availTiers[i]
                        } else {
                          if (cdVals.length === 2) tierName = i === 0 ? 'gold' : 'diamond'
                          else tierName = tierSequence[i] || 'gold'
                        }
                        
                        return (
                          <Fragment key={i}>
                            <div className={`${styles.cdStep} ${styles[`val${tierName.charAt(0).toUpperCase() + tierName.slice(1)}`]}`}>
                              {v}
                            </div>
                            {i < cdVals.length - 1 && <div className={styles.cdArrow}>↓</div>}
                          </Fragment>
                        )
                      })}
                      <div className={styles.cdUnit}>秒</div>
                    </div>
                  </div>
                )
              }
              
              // 单个CD值显示
              if (item.cooldown !== undefined && item.cooldown > 0) {
                return (
                  <div className={styles.detailsLeft}>
                    <div className={styles.cdDisplay}>
                      <div className={styles.cdValue}>{(item.cooldown > 100 ? item.cooldown / 1000 : item.cooldown).toFixed(1)}</div>
                      <div className={styles.cdUnit}>秒</div>
                    </div>
                  </div>
                )
              }
              
              return null
            })()}

            {/* 技能/描述 */}
            <div className={styles.detailsRight}>
              {/* 如果是物品，显示 skills */}
              {item.skills && item.skills.length > 0 && item.skills.map((skill: any, idx: number) => (
                <div key={idx} className={styles.skillItem}>
                  {renderText(skill)}
                </div>
              ))}
              {/* 如果是技能，显示 descriptions 或 description_cn */}
              {!item.skills && item.descriptions && item.descriptions.length > 0 && item.descriptions.map((desc: any, idx: number) => (
                <div key={idx} className={styles.skillItem}>
                  {renderText(desc)}
                </div>
              ))}
              {/* 如果是技能且没有 descriptions 数组，显示 description_cn */}
              {!item.skills && !item.descriptions && item.description_cn && (
                <div className={styles.skillItem}>
                  {renderText(item.description_cn)}
                </div>
              )}
            </div>
          </div>
          
          {/* 附魔区域 */}
          {item.enchantments && Object.keys(item.enchantments).length > 0 && (
            <div className={styles.itemEnchantmentsRow}>
              {Object.entries(item.enchantments).map(([enchKey, ench]: [string, any]) => {
                const name = ench.name_cn || enchKey
                const effect = ench.effect_cn || ench.effect_en || ''
                const color = ENCHANT_COLORS[name] || '#ffcd19'
                
                return (
                  <div key={enchKey} className={styles.enchantItem}>
                    <span 
                      className={styles.enchantBadge}
                      style={{ '--enc-clr': color } as React.CSSProperties}
                    >
                      {name}
                    </span>
                    <span className={styles.enchantEffect}>{renderText(effect)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ItemsList({ items, skills, onSelectItem }: ItemsListProps) {
  const [activeTab, setActiveTab] = useState<'items' | 'skills'>('items')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [size, setSize] = useState<'' | 'small' | 'medium' | 'large'>('')
  const [startTier, setStartTier] = useState<'' | 'bronze' | 'silver' | 'gold' | 'diamond' | 'legendary'>('')
  const [hero, setHero] = useState<string>('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedHiddenTags, setSelectedHiddenTags] = useState<string[]>([])
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all')
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false)
  const [visibleCount, setVisibleCount] = useState(30)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const scrollAreaRef = useRef<HTMLDivElement>(null)

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

    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      result = result.filter((item: any) => {
        const name = (item.name_cn || item.name_en || '').toLowerCase()
        const nameEn = (item.name_en || '').toLowerCase()
        const tags = (item.tags || '').toLowerCase()
        return name.includes(keyword) || nameEn.includes(keyword) || tags.includes(keyword)
      })
    }

    if (size) {
      result = result.filter((item: any) => {
        const itemSize = (item.size || '').toLowerCase()
        return itemSize.includes(size)
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

    return result
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

  return (
    <div className={styles.container}>
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
      <div className={styles.searchBoxContainer}>
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

                <div className={styles.buttonGroup}>
                  {[
                    { val: 'Common', label: '通用' },
                    { val: 'Pygmalien', label: '猪' },
                    { val: 'Jules', label: '朱尔斯' },
                    { val: 'Vanessa', label: '瓦内莎' },
                    { val: 'Mak', label: '马克' },
                    { val: 'Dooley', label: '多利' },
                    { val: 'Stelle', label: '斯黛尔' }
                  ].map(opt => (
                    <button
                      key={opt.val}
                      className={`${styles.toggleBtn} ${hero === opt.val ? styles.active : ''}`}
                      onClick={() => setHero(hero === opt.val ? '' : opt.val)}
                    >
                      {opt.label}
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
                              src={`/images/${group.icon}.webp`}
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
                setSize('')
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

      {/* 物品列表 */}
      <div 
        ref={scrollAreaRef}
        className={styles.itemsList}
        onScroll={handleScroll}
      >
        {filteredItems.slice(0, visibleCount).map((item: any) => (
          <ItemCard
            key={item.id}
            item={item}
            onClick={() => {
              toggleExpand(item.id)
              onSelectItem(item)
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
