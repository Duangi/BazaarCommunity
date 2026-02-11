'use client'

import { useState, useEffect } from 'react'
import { useDrop } from 'react-dnd'
import ItemDetail from './ItemDetail'
import styles from './RatingTool.module.css'

interface RatingToolProps {
  selectedItem: any
  onSelectItem: (item: any) => void
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

const DEFAULT_TIERS: TierConfig[] = [
  { id: 'S', name: 'S', color: '#ff4757' },
  { id: 'A', name: 'A', color: '#ffa502' },
  { id: 'B', name: 'B', color: '#1e90ff' },
  { id: 'C', name: 'C', color: '#2ed573' },
]

export default function RatingTool({ selectedItem, onSelectItem }: RatingToolProps) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [currentPreset, setCurrentPreset] = useState<Preset>({
    id: 'default',
    name: '默认预设',
    tiers: DEFAULT_TIERS,
  })
  const [ratedItems, setRatedItems] = useState<Record<string, any[]>>({})
  const [isEditingPreset, setIsEditingPreset] = useState(false)
  const [editingTiers, setEditingTiers] = useState(DEFAULT_TIERS)

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
        setRatedItems(parsed)
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
  const updateRating = (tierId: string, item: any) => {
    const updated = { ...ratedItems }

    if (!updated[tierId]) {
      updated[tierId] = []
    }

    // 同一等级内去重（按原始 id）
    const exists = updated[tierId].some((i: any) => i.id === item.id)
    if (!exists) {
      updated[tierId] = [...updated[tierId], item]
    }

    setRatedItems(updated)
    localStorage.setItem('ratedItems', JSON.stringify(updated))
  }

  // 移除评分
  const removeRating = (tierId: string, itemId: string) => {
    const updated = { ...ratedItems }
    updated[tierId] = updated[tierId].filter((i: any) => i.id !== itemId)
    setRatedItems(updated)
    localStorage.setItem('ratedItems', JSON.stringify(updated))
  }

  return (
    <div className={styles.container}>
      {/* 左侧：评分器 */}
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
              onRemove={(itemId) => removeRating(tier.id, itemId)}
              onSelectItem={onSelectItem}
            />
          ))}
        </div>
      </div>

      {/* 右侧：物品详情 */}
      <div className={styles.detailSection}>
        <ItemDetail item={selectedItem} />
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
  onSelectItem,
}: {
  tier: TierConfig
  items: any[]
  onDrop: (item: any) => void
  onRemove: (itemId: string) => void
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
          items.map((item) => (
            <div
              key={item.id}
              className={styles.tierItem}
              onClick={() => onSelectItem(item)}
            >
              <div className={styles.tierItemImage}>🎴</div>
              <div className={styles.tierItemName}>{item.name_cn || item.name_en}</div>
              <button
                className={styles.removeButton}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(item.id)
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
