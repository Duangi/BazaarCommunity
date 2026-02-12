'use client'

import { useState, useEffect } from 'react'
import { useDrop } from 'react-dnd'
import styles from './RatingTool.module.css'
import ItemImage from './ItemImage'

interface RatingToolProps {
  onSelectItem: (item: any) => void
  onDraftApiChange?: (api: {
    getSnapshot: () => any
    applySnapshot: (payload: any) => void
    getContextLabel?: () => string
  } | null) => void
}

interface Preset {
  id: string
  name: string
  tiers: TierConfig[]
}

interface TierConfig {
  id: string
  name: string
  color: string
}

interface RatedItem {
  _ratedKey?: string
  id: string
  size?: string
  art_key?: string
  name_cn?: string
  name_en?: string
  ratingTier?: string | null
  [key: string]: any
}

const DEFAULT_TIERS: TierConfig[] = [
  { id: 'S', name: 'S', color: '#ff4757' },
  { id: 'A', name: 'A', color: '#ffa502' },
  { id: 'B', name: 'B', color: '#1e90ff' },
  { id: 'C', name: 'C', color: '#2ed573' },
]

export default function RatingTool({ onSelectItem, onDraftApiChange }: RatingToolProps) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [currentPreset, setCurrentPreset] = useState<Preset>({
    id: 'default',
    name: '默认预设',
    tiers: DEFAULT_TIERS,
  })
  const [ratedItems, setRatedItems] = useState<Record<string, RatedItem[]>>({})
  const [isEditingPreset, setIsEditingPreset] = useState(false)
  const [editingTiers, setEditingTiers] = useState(DEFAULT_TIERS)
  const [selectedRatedRef, setSelectedRatedRef] = useState<{ tierId: string; itemKey: string } | null>(null)

  // 确保所有层级都有初始化的数组
  useEffect(() => {
    const updated = { ...ratedItems }
    let needsUpdate = false
    
    currentPreset.tiers.forEach(tier => {
      if (!updated[tier.id]) {
        updated[tier.id] = []
        needsUpdate = true
      }
    })
    
    if (needsUpdate) {
      setRatedItems(updated)
    }
  }, [currentPreset])

  // 从 localStorage 加载预设
  useEffect(() => {
    const saved = localStorage.getItem('ratingPresets')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setPresets(parsed)
      } catch (e) {
        console.error('加载预设失败:', e)
      }
    }

    const savedRating = localStorage.getItem('ratedItems')
    if (savedRating) {
      try {
        const parsed = JSON.parse(savedRating)
        const normalized: Record<string, RatedItem[]> = {}
        Object.entries(parsed || {}).forEach(([tierId, list]) => {
          const arr = Array.isArray(list) ? list : []
          normalized[tierId] = arr.map((it: any, idx: number) => ({
            ...it,
            _ratedKey: it?._ratedKey || `${it?.id || 'item'}-legacy-${idx}`,
          }))
        })
        setRatedItems(normalized)
      } catch (e) {
        console.error('加载评分失败:', e)
      }
    }
  }, [])

  // 保存预设
  const savePreset = () => {
    const newPreset: Preset = {
      id: Date.now().toString(),
      name: '自定义预设 ' + (presets.length + 1),
      tiers: editingTiers,
    }
    const updatedPresets = [...presets, newPreset]
    setPresets(updatedPresets)
    setCurrentPreset(newPreset)
    
    // 初始化新等级的空数组
    const updatedRatedItems = { ...ratedItems }
    editingTiers.forEach(tier => {
      if (!updatedRatedItems[tier.id]) {
        updatedRatedItems[tier.id] = []
      }
    })
    setRatedItems(updatedRatedItems)
    
    localStorage.setItem('ratingPresets', JSON.stringify(updatedPresets))
    localStorage.setItem('ratedItems', JSON.stringify(updatedRatedItems))
    setIsEditingPreset(false)
  }

  // 更新评分：允许一条卡在多个等级存在，但同一等级不重复
  const updateRating = (tierId: string, item: RatedItem) => {
    setRatedItems((prev) => {
      const updated = { ...prev }
      const tierItems = Array.isArray(updated[tierId]) ? [...updated[tierId]] : []

      // 同一层级内：同卡 + 同卡牌等级 去重
      const incomingTier = item.ratingTier || null
      const exists = tierItems.some((i) => i.id === item.id && (i.ratingTier || null) === incomingTier)
      if (!exists) {
        tierItems.push({
          ...item,
          ratingTier: null,
          _ratedKey: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        })
      }

      updated[tierId] = tierItems
      localStorage.setItem('ratedItems', JSON.stringify(updated))
      return updated
    })
  }

  // 移除评分
  const removeRating = (tierId: string, removeIndex: number) => {
    setRatedItems((prev) => {
      const updated = { ...prev }
      const tierItems = Array.isArray(updated[tierId]) ? [...updated[tierId]] : []
      const target = tierItems[removeIndex]
      updated[tierId] = tierItems.filter((_, idx) => idx !== removeIndex)
      if (target?._ratedKey && selectedRatedRef?.itemKey === target._ratedKey && selectedRatedRef?.tierId === tierId) {
        setSelectedRatedRef(null)
      }
      localStorage.setItem('ratedItems', JSON.stringify(updated))
      return updated
    })
  }

  const updateRatedItemLevel = (tierId: string, itemKey: string, nextTier: string | null) => {
    setRatedItems((prev) => {
      const updated = { ...prev }
      const tierItems = Array.isArray(updated[tierId]) ? [...updated[tierId]] : []
      const index = tierItems.findIndex((it) => it._ratedKey === itemKey)
      if (index < 0) return prev

      const target = tierItems[index]
      const normalizedNext = nextTier || null
      const duplicateExists = tierItems.some(
        (it, idx) => idx !== index && it.id === target.id && (it.ratingTier || null) === normalizedNext
      )
      if (duplicateExists) return prev

      tierItems[index] = { ...target, ratingTier: normalizedNext }
      updated[tierId] = tierItems
      localStorage.setItem('ratedItems', JSON.stringify(updated))
      return updated
    })
  }

  useEffect(() => {
    if (!onDraftApiChange) return
    onDraftApiChange({
      getSnapshot: () => ({
        presets,
        currentPreset,
        ratedItems,
      }),
      applySnapshot: (payload: any) => {
        if (!payload || typeof payload !== 'object') return
        const nextPresets = Array.isArray(payload.presets) ? payload.presets : []
        const nextCurrent = payload.currentPreset && Array.isArray(payload.currentPreset.tiers)
          ? payload.currentPreset
          : {
              id: 'default',
              name: '默认预设',
              tiers: DEFAULT_TIERS,
            }
        const nextRated = payload.ratedItems && typeof payload.ratedItems === 'object' ? payload.ratedItems : {}
        setPresets(nextPresets)
        setCurrentPreset(nextCurrent)
        setRatedItems(nextRated)
        localStorage.setItem('ratingPresets', JSON.stringify(nextPresets))
        localStorage.setItem('ratedItems', JSON.stringify(nextRated))
      },
      getContextLabel: () => '卡牌评分',
    })
    return () => onDraftApiChange(null)
  }, [onDraftApiChange, presets, currentPreset, ratedItems])

  return (
    <div className={styles.container}>
      <div className={styles.ratingSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>卡牌评分器</h2>
          <button
            className={styles.editButton}
            onClick={() => setIsEditingPreset(!isEditingPreset)}
          >
            {isEditingPreset ? '完成' : '编辑等级'}
          </button>
        </div>

        {/* 预设选择 */}
        {presets.length > 0 && (
          <div className={styles.presetSelector}>
            <select
              value={currentPreset.id}
              onChange={(e) => {
                const preset = presets.find(p => p.id === e.target.value)
                if (preset) setCurrentPreset(preset)
              }}
              className={styles.presetSelect}
            >
              <option value="default">默认预设 (SABC)</option>
              {presets.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 等级编辑 */}
        {isEditingPreset && (
          <div className={styles.tierEditor}>
            {editingTiers.map((tier, index) => (
              <div key={tier.id} className={styles.tierEditRow}>
                <input
                  type="text"
                  value={tier.name}
                  onChange={(e) => {
                    const updated = [...editingTiers]
                    updated[index].name = e.target.value
                    setEditingTiers(updated)
                  }}
                  className={styles.tierNameInput}
                  placeholder="等级名称"
                />
                <input
                  type="color"
                  value={tier.color}
                  onChange={(e) => {
                    const updated = [...editingTiers]
                    updated[index].color = e.target.value
                    setEditingTiers(updated)
                  }}
                  className={styles.tierColorInput}
                />
                <button
                  onClick={() => {
                    const updated = editingTiers.filter((_, i) => i !== index)
                    setEditingTiers(updated)
                  }}
                  className={styles.deleteTierButton}
                  title="删除等级"
                >
                  ×
                </button>
              </div>
            ))}
            <button 
              onClick={() => {
                const newTier: TierConfig = {
                  id: `Tier${editingTiers.length + 1}`,
                  name: `等级${editingTiers.length + 1}`,
                  color: '#999999',
                }
                setEditingTiers([...editingTiers, newTier])
              }}
              className={styles.addTierButton}
            >
              + 新增等级
            </button>
            <button onClick={savePreset} className={styles.savePresetButton}>
              保存为新预设
            </button>
          </div>
        )}

        {/* 评分层级 */}
        <div className={styles.tiers}>
          {currentPreset.tiers.map((tier) => (
            <TierDropZone
              key={tier.id}
              tier={tier}
              items={ratedItems[tier.id] || []}
              onDrop={(item) => updateRating(tier.id, item)}
              onRemove={(itemIndex) => removeRating(tier.id, itemIndex)}
              selectedItemKey={selectedRatedRef?.tierId === tier.id ? selectedRatedRef.itemKey : null}
              onSelectRatedItem={(itemKey) => setSelectedRatedRef({ tierId: tier.id, itemKey })}
              onUpdateLevel={(itemKey, nextTier) => updateRatedItemLevel(tier.id, itemKey, nextTier)}
              onSelectItem={onSelectItem}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// 可拖放的评分层级
function TierDropZone({
  tier,
  items,
  onDrop,
  onRemove,
  selectedItemKey,
  onSelectRatedItem,
  onUpdateLevel,
  onSelectItem,
}: {
  tier: TierConfig
  items: RatedItem[]
  onDrop: (item: RatedItem) => void
  onRemove: (itemIndex: number) => void
  selectedItemKey: string | null
  onSelectRatedItem: (itemKey: string) => void
  onUpdateLevel: (itemKey: string, nextTier: string | null) => void
  onSelectItem: (item: any) => void
}) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'ITEM',
    drop: (draggedItem: { item: any }) => {
      onDrop(draggedItem.item)
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }))

  const getSizeSpan = (item: RatedItem): number => {
    const normalized = (item.size || 'Medium').split('/')[0].trim().toLowerCase()
    if (normalized.includes('small') || normalized.includes('小')) return 1
    if (normalized.includes('large') || normalized.includes('大')) return 3
    return 2
  }

  const getSizeClass = (item: RatedItem): string => {
    const normalized = (item.size || 'Medium').split('/')[0].trim().toLowerCase()
    if (normalized.includes('small') || normalized.includes('小')) return styles.sizeSmall
    if (normalized.includes('large') || normalized.includes('大')) return styles.sizeLarge
    return styles.sizeMedium
  }

  const getSizeWidth = (item: RatedItem): number => {
    const normalized = (item.size || 'Medium').split('/')[0].trim().toLowerCase()
    if (normalized.includes('small') || normalized.includes('小')) return 26
    if (normalized.includes('large') || normalized.includes('大')) return 78
    return 52
  }

  const getLevelColor = (level: string | null | undefined): string => {
    if (level === 'bronze') return '#cd7f32'
    if (level === 'silver') return '#c0c0c0'
    if (level === 'gold') return '#ffd700'
    if (level === 'diamond') return '#7fe9ff'
    if (level === 'legendary') return '#ff6b3d'
    return 'transparent'
  }

  const levelOptions = [
    { id: null, label: '不限' },
    { id: 'bronze', label: '青铜' },
    { id: 'silver', label: '白银' },
    { id: 'gold', label: '黄金' },
    { id: 'diamond', label: '钻石' },
    { id: 'legendary', label: '传奇' },
  ] as const

  return (
    <div
      ref={drop as any}
      className={`${styles.tierZone} ${isOver ? styles.tierZoneActive : ''}`}
      style={{ borderColor: tier.color }}
    >
      <div className={styles.tierHeader} style={{ background: tier.color }}>
        <span className={styles.tierName}>{tier.name}</span>
        <span className={styles.tierCount}>{items.length}</span>
      </div>
      <div className={styles.tierItems}>
        {items.length === 0 ? (
          <div className={styles.emptyState}>拖动物品到这里</div>
        ) : (
          items.map((item, index) => (
            <div
              key={item._ratedKey || `${item.id}-${index}`}
              className={styles.tierItem}
              style={{
                '--size-span': getSizeSpan(item),
                '--card-width': `${getSizeWidth(item)}px`,
                '--rating-border': getLevelColor(item.ratingTier),
              } as React.CSSProperties}
              onClick={() => {
                onSelectItem(item)
                if (item._ratedKey) onSelectRatedItem(item._ratedKey)
              }}
            >
              <div className={`${styles.tierItemImageWrap} ${getSizeClass(item)}`}>
                <ItemImage
                  item={item}
                  alt={item.name_cn || item.name_en || item.id}
                  className={styles.tierItemImage}
                  fallbackClassName={styles.tierItemImageFallback}
                />
              </div>
              <div className={styles.tierItemName}>{item.name_cn || item.name_en}</div>
              {selectedItemKey && item._ratedKey === selectedItemKey && (
                <div className={styles.ratingLevelEditor}>
                  {levelOptions.map((opt) => (
                    <button
                      key={opt.id || 'none'}
                      className={`${styles.ratingLevelBtn} ${(item.ratingTier || null) === opt.id ? styles.ratingLevelBtnActive : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (item._ratedKey) onUpdateLevel(item._ratedKey, opt.id)
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              <button
                className={styles.removeButton}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(index)
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
