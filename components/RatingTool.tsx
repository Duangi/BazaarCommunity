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

type RatingStateV2 = {
  version: 2
  presets: Preset[]
  currentPresetId: string
  ratedItemsByPreset: Record<string, Record<string, RatedItem[]>>
}

const DEFAULT_PRESET: Preset = {
  id: 'default',
  name: '默认预设',
  tiers: DEFAULT_TIERS,
}

const RATING_STATE_KEY = 'rating_tool_state_v2'

export default function RatingTool({ onSelectItem, onDraftApiChange }: RatingToolProps) {
  const [presets, setPresets] = useState<Preset[]>([DEFAULT_PRESET])
  const [currentPresetId, setCurrentPresetId] = useState<string>('default')
  const [ratedItemsByPreset, setRatedItemsByPreset] = useState<Record<string, Record<string, RatedItem[]>>>({
    default: {},
  })
  const [isEditingPreset, setIsEditingPreset] = useState(false)
  const [editingTiers, setEditingTiers] = useState(DEFAULT_TIERS)
  const [selectedRatedRef, setSelectedRatedRef] = useState<{ tierId: string; itemKey: string } | null>(null)
  const [newPresetName, setNewPresetName] = useState('')

  const currentPreset = presets.find((p) => p.id === currentPresetId) || DEFAULT_PRESET
  const ratedItems = ratedItemsByPreset[currentPreset.id] || {}
  const customPresets = presets.filter((p) => p.id !== 'default')

  const ensureTierBuckets = (preset: Preset, input: Record<string, RatedItem[]>): Record<string, RatedItem[]> => {
    const normalized: Record<string, RatedItem[]> = { ...input }
    preset.tiers.forEach((tier) => {
      if (!Array.isArray(normalized[tier.id])) normalized[tier.id] = []
    })
    return normalized
  }

  const persistState = (
    nextPresets: Preset[],
    nextCurrentPresetId: string,
    nextRatedItemsByPreset: Record<string, Record<string, RatedItem[]>>
  ) => {
    const payload: RatingStateV2 = {
      version: 2,
      presets: nextPresets,
      currentPresetId: nextCurrentPresetId,
      ratedItemsByPreset: nextRatedItemsByPreset,
    }
    try {
      localStorage.setItem(RATING_STATE_KEY, JSON.stringify(payload))
    } catch {}
  }

  // 确保所有层级都有初始化的数组
  useEffect(() => {
    setRatedItemsByPreset((prev) => {
      const bucket = ensureTierBuckets(currentPreset, prev[currentPreset.id] || {})
      const same = JSON.stringify(bucket) === JSON.stringify(prev[currentPreset.id] || {})
      if (same) return prev
      const next = { ...prev, [currentPreset.id]: bucket }
      persistState(presets.length > 0 ? presets : [DEFAULT_PRESET], currentPreset.id, next)
      return next
    })
  }, [currentPreset.id, currentPreset.tiers])

  // 从 localStorage 加载评分状态
  useEffect(() => {
    const saved = localStorage.getItem(RATING_STATE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as RatingStateV2
        if (parsed?.version === 2 && Array.isArray(parsed.presets)) {
          const mergedPresets = [DEFAULT_PRESET, ...parsed.presets.filter((p) => p.id !== 'default')]
          setPresets(mergedPresets)
          setCurrentPresetId(
            mergedPresets.some((p) => p.id === parsed.currentPresetId) ? parsed.currentPresetId : 'default'
          )
          setRatedItemsByPreset(parsed.ratedItemsByPreset || { default: {} })
        }
      } catch (e) {
        console.error('加载预设失败:', e)
      }
    } else {
      // 兼容旧数据结构
      const legacyPresetsRaw = localStorage.getItem('ratingPresets')
      const legacyRatedRaw = localStorage.getItem('ratedItems')
      const loadedPresets = [DEFAULT_PRESET]
      if (legacyPresetsRaw) {
        try {
          const parsed = JSON.parse(legacyPresetsRaw)
          if (Array.isArray(parsed)) loadedPresets.push(...parsed.filter((p: Preset) => p.id !== 'default'))
        } catch {}
      }
      let legacyRated: Record<string, RatedItem[]> = {}
      if (legacyRatedRaw) {
        try {
          const parsed = JSON.parse(legacyRatedRaw)
          Object.entries(parsed || {}).forEach(([tierId, list]) => {
            const arr = Array.isArray(list) ? list : []
            legacyRated[tierId] = arr.map((it: any, idx: number) => ({
              ...it,
              _ratedKey: it?._ratedKey || `${it?.id || 'item'}-legacy-${idx}`,
            }))
          })
        } catch {}
      }
      const nextByPreset = { default: legacyRated }
      setPresets(loadedPresets)
      setCurrentPresetId('default')
      setRatedItemsByPreset(nextByPreset)
      persistState(loadedPresets, 'default', nextByPreset)
    }

    const pending = localStorage.getItem('pending_editor_import_rating')
    if (pending) {
      try {
        const payload = JSON.parse(pending)
        if (payload && typeof payload === 'object') {
          const nextPresetsRaw = Array.isArray(payload.presets) ? payload.presets : []
          const nextPresets = [DEFAULT_PRESET, ...nextPresetsRaw.filter((p: Preset) => p.id !== 'default')]
          const nextCurrentId = payload.currentPresetId || payload.currentPreset?.id || 'default'
          const nextRatedByPreset = payload.ratedItemsByPreset && typeof payload.ratedItemsByPreset === 'object'
            ? payload.ratedItemsByPreset
            : {
                [nextCurrentId]: payload.ratedItems && typeof payload.ratedItems === 'object' ? payload.ratedItems : {},
              }
          setPresets(nextPresets)
          setCurrentPresetId(nextPresets.some((p) => p.id === nextCurrentId) ? nextCurrentId : 'default')
          setRatedItemsByPreset(nextRatedByPreset)
          persistState(nextPresets, nextCurrentId, nextRatedByPreset)
        }
      } catch {}
      localStorage.removeItem('pending_editor_import_rating')
    }
  }, [])

  useEffect(() => {
    if (presets.length === 0) return
    persistState(presets, currentPresetId, ratedItemsByPreset)
  }, [presets, currentPresetId, ratedItemsByPreset])

  const savePreset = () => {
    const trimmedName = newPresetName.trim() || `自定义预设 ${customPresets.length + 1}`
    const newPreset: Preset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmedName,
      tiers: editingTiers.map((t) => ({ ...t })),
    }
    const updatedPresets = [...presets.filter((p) => p.id !== newPreset.id), newPreset]
    setPresets(updatedPresets)
    setCurrentPresetId(newPreset.id)
    const existing = ratedItemsByPreset[newPreset.id] || {}
    const updatedRatedItemsByPreset = {
      ...ratedItemsByPreset,
      [newPreset.id]: ensureTierBuckets(newPreset, existing),
    }
    setRatedItemsByPreset(updatedRatedItemsByPreset)
    persistState(updatedPresets, newPreset.id, updatedRatedItemsByPreset)
    setIsEditingPreset(false)
    setNewPresetName('')
  }

  const renamePreset = () => {
    if (currentPreset.id === 'default') return
    const nextName = window.prompt('重命名预设', currentPreset.name)
    if (!nextName?.trim()) return
    const updated = presets.map((p) => (p.id === currentPreset.id ? { ...p, name: nextName.trim() } : p))
    setPresets(updated)
    persistState(updated, currentPresetId, ratedItemsByPreset)
  }

  const deletePreset = () => {
    if (currentPreset.id === 'default') return
    const ok = window.confirm(`确认删除预设“${currentPreset.name}”？`)
    if (!ok) return
    const updatedPresets = presets.filter((p) => p.id !== currentPreset.id)
    const nextRatedByPreset = { ...ratedItemsByPreset }
    delete nextRatedByPreset[currentPreset.id]
    setPresets(updatedPresets)
    setCurrentPresetId('default')
    setRatedItemsByPreset(nextRatedByPreset)
    persistState(updatedPresets, 'default', nextRatedByPreset)
  }

  // 更新评分：允许一条卡在多个等级存在，但同一等级不重复
  const updateRating = (tierId: string, item: RatedItem) => {
    setRatedItemsByPreset((prevByPreset) => {
      const currentBucket = { ...(prevByPreset[currentPreset.id] || {}) }
      const updated = { ...currentBucket }
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
      const nextByPreset = { ...prevByPreset, [currentPreset.id]: updated }
      persistState(presets, currentPresetId, nextByPreset)
      return nextByPreset
    })
  }

  // 移除评分
  const removeRating = (tierId: string, removeIndex: number) => {
    setRatedItemsByPreset((prevByPreset) => {
      const currentBucket = { ...(prevByPreset[currentPreset.id] || {}) }
      const updated = { ...currentBucket }
      const tierItems = Array.isArray(updated[tierId]) ? [...updated[tierId]] : []
      const target = tierItems[removeIndex]
      updated[tierId] = tierItems.filter((_, idx) => idx !== removeIndex)
      if (target?._ratedKey && selectedRatedRef?.itemKey === target._ratedKey && selectedRatedRef?.tierId === tierId) {
        setSelectedRatedRef(null)
      }
      const nextByPreset = { ...prevByPreset, [currentPreset.id]: updated }
      persistState(presets, currentPresetId, nextByPreset)
      return nextByPreset
    })
  }

  const updateRatedItemLevel = (tierId: string, itemKey: string, nextTier: string | null) => {
    setRatedItemsByPreset((prevByPreset) => {
      const currentBucket = { ...(prevByPreset[currentPreset.id] || {}) }
      const updated = { ...currentBucket }
      const tierItems = Array.isArray(updated[tierId]) ? [...updated[tierId]] : []
      const index = tierItems.findIndex((it) => it._ratedKey === itemKey)
      if (index < 0) return prevByPreset

      const target = tierItems[index]
      const normalizedNext = nextTier || null
      const duplicateExists = tierItems.some(
        (it, idx) => idx !== index && it.id === target.id && (it.ratingTier || null) === normalizedNext
      )
      if (duplicateExists) return prevByPreset

      tierItems[index] = { ...target, ratingTier: normalizedNext }
      updated[tierId] = tierItems
      const nextByPreset = { ...prevByPreset, [currentPreset.id]: updated }
      persistState(presets, currentPresetId, nextByPreset)
      return nextByPreset
    })
  }

  useEffect(() => {
    if (!onDraftApiChange) return
    onDraftApiChange({
      getSnapshot: () => ({
        version: 2,
        presets,
        currentPresetId,
        currentPreset,
        ratedItemsByPreset,
        ratedItems,
      }),
      applySnapshot: (payload: any) => {
        if (!payload || typeof payload !== 'object') return
        const nextPresetsRaw = Array.isArray(payload.presets) ? payload.presets : []
        const nextPresets = [DEFAULT_PRESET, ...nextPresetsRaw.filter((p: Preset) => p.id !== 'default')]
        const nextCurrentId = payload.currentPresetId || payload.currentPreset?.id || 'default'
        const nextRatedByPreset = payload.ratedItemsByPreset && typeof payload.ratedItemsByPreset === 'object'
          ? payload.ratedItemsByPreset
          : { [nextCurrentId]: payload.ratedItems && typeof payload.ratedItems === 'object' ? payload.ratedItems : {} }
        setPresets(nextPresets)
        setCurrentPresetId(nextPresets.some((p) => p.id === nextCurrentId) ? nextCurrentId : 'default')
        setRatedItemsByPreset(nextRatedByPreset)
        persistState(nextPresets, nextCurrentId, nextRatedByPreset)
      },
      getContextLabel: () => '卡牌评分',
    })
    return () => onDraftApiChange(null)
  }, [onDraftApiChange, presets, currentPresetId, currentPreset, ratedItemsByPreset, ratedItems])

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

        <div className={styles.presetSelector}>
          <select
            value={currentPreset.id}
            onChange={(e) => setCurrentPresetId(e.target.value)}
            className={styles.presetSelect}
          >
            {presets.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.id === 'default' ? '默认预设 (SABC)' : preset.name}
              </option>
            ))}
          </select>
          <button className={styles.presetActionBtn} onClick={renamePreset} disabled={currentPreset.id === 'default'}>
            重命名预设
          </button>
          <button className={styles.presetDeleteBtn} onClick={deletePreset} disabled={currentPreset.id === 'default'}>
            删除预设
          </button>
        </div>

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
            <input
              className={styles.tierNameInput}
              value={newPresetName}
              maxLength={30}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder={`预设名称（默认：自定义预设 ${customPresets.length + 1}）`}
            />
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
