'use client'

import { Fragment } from 'react'
import styles from './ItemDetail.module.css'

interface ItemDetailProps {
  item: any | null
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

export default function ItemDetail({ item }: ItemDetailProps) {
  if (!item) {
    return (
      <div className={styles.container}>
        <div className={styles.placeholder}>
          <p>👈 从右侧列表中点击或拖拽一个物品</p>
          <p>查看详细信息</p>
        </div>
      </div>
    )
  }

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
  
  // 处理英雄字段：只显示中文名（斜杠后的部分）
  const heroesStr = typeof item.heroes === 'string' ? item.heroes : (Array.isArray(item.heroes) ? item.heroes[0] : '')
  const heroZh = heroesStr
    ? (heroesStr.split(' / ')[1]?.trim() || heroesStr.split(' / ')[0].trim())
    : '通用'

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
    <div className={styles.container}>
      {/* 卡牌头部 */}
      <div className={`${styles.cardHeader} ${styles[`tier${tierClass.charAt(0).toUpperCase() + tierClass.slice(1)}`]}`}>
        <div className={styles.cardHeaderLeft}>
          <div className={`${styles.imageBox} ${styles[`size${sizeClass.charAt(0).toUpperCase() + sizeClass.slice(1)}`]}`}>
            <div className={styles.placeholder}>🎴</div>
          </div>
        </div>
        
        <div className={styles.cardHeaderCenter}>
          <div className={styles.nameLine}>
            <span className={styles.nameCn}>{item.name_cn || item.name_en}</span>
            <span className={`${styles.tierLabel} ${styles[`tier${tierClass.charAt(0).toUpperCase() + tierClass.slice(1)}`]}`}>
              {tierLabel}
            </span>
          </div>
          <div className={styles.nameEn}>{item.name_en}</div>
          <div className={styles.tagsLine}>
            {displayTags.slice(0, 3).map((tag: string, idx: number) => (
              <span key={idx} className={styles.tagBadge}>{tag}</span>
            ))}
          </div>
        </div>

        <div className={styles.cardHeaderRight}>
          <span className={styles.heroBadge}>{heroZh}</span>
        </div>
      </div>

      {/* 详细信息 */}
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
  )
}
