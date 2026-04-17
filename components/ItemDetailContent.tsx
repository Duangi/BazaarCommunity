// components/ItemDetailContent.tsx
'use client'

import { Fragment } from 'react'
import styles from './ItemDetail.module.css' // 继续沿用 ItemDetail 的样式
import { renderText, ENCHANT_COLORS } from '@/lib/rendering'

// 从 ItemDetail.tsx 复制过来的 Item 类型定义
interface Item {
  id: string
  name_en: string
  name_cn: string
  tier?: string
  starting_tier?: string
  available_tiers?: string
  size?: string
  tags?: string
  processed_tags?: string[]
  heroes?: string | string[]
  cooldown?: number
  cooldown_tiers?: string
  skills?: any[]
  skills_passive?: any[]
  descriptions?: any[]
  description_cn?: any
  quests?: any
  enchantments?: Record<string, any>
  art_key?: string
}

interface ItemDetailContentProps {
  item: Item
}

// 这是我们的“详情展示标准件”
export default function ItemDetailContent({ item }: ItemDetailContentProps) {
  const activeLines = Array.isArray(item.skills) && item.skills.length > 0
    ? item.skills
    : Array.isArray(item.descriptions) && item.descriptions.length > 0
      ? item.descriptions
      : item.description_cn
        ? [item.description_cn]
        : []
  const passiveLines = Array.isArray(item.skills_passive) ? item.skills_passive : []
  const questLines = item.quests ? (Array.isArray(item.quests) ? item.quests : [item.quests]) : []
  const enchantEntries = item.enchantments ? Object.entries(item.enchantments) : []

  return (
    <>
      {/* 详细信息 */}
      <div className={styles.detailsContent}>
        {/* 左侧：冷却 */}
        {(() => {
          const cdTiersRaw = item.cooldown_tiers
          const hasProgression = typeof cdTiersRaw === 'string' && cdTiersRaw.includes('/')
          
          if (hasProgression) {
            // cooldown_tiers is normalized to seconds during data assembly.
            const cdVals = cdTiersRaw.split('/').map(v => {
              const ms = parseFloat(v)
              return isNaN(ms) ? "0.0" : (ms > 100 ? ms / 1000 : ms).toFixed(1)
            })
            return (
              <div className={styles.detailsLeft}>
                <div className={styles.cdProgression}>
                  {cdVals.map((v, i) => (
                    <Fragment key={i}>
                      <div className={styles.cdStep}>{v}</div>
                      {i < cdVals.length - 1 && <div className={styles.cdArrow}>→</div>}
                    </Fragment>
                  ))}
                  <div className={styles.cdUnit}>秒</div>
                </div>
              </div>
            )
          }
          
          if (item.cooldown !== undefined && item.cooldown > 0) {
            const cdValue = (item.cooldown > 100 ? item.cooldown / 1000 : item.cooldown).toFixed(1)
            return (
              <div className={styles.detailsLeft}>
                <div className={styles.cdDisplay}>
                  <div className={styles.cdValue}>{cdValue}</div>
                  <div className={styles.cdUnit}>秒</div>
                </div>
              </div>
            )
          }
          
          return <div className={styles.detailsLeft}></div> // 占位
        })()}

        {/* 右侧：技能/描述 */}
        <div className={styles.detailsRight}>
          {activeLines.map((desc, idx) => (
            <div key={`desc-${idx}`} className={styles.skillItem}>
              🗡️ {renderText(desc, item)}
            </div>
          ))}
          {passiveLines.map((skill, idx) => (
            <div key={`passive-${idx}`} className={`${styles.skillItem} ${styles.passive}`}>
              ⚙️ {renderText(skill, item)}
            </div>
          ))}
        </div>
      </div>
      
      {/* 任务区域 */}
      {questLines.length > 0 && (
        <div className={styles.questsSection}>
          {questLines.map((quest, index) => (
            <div key={index} className={styles.questItem}>
              <div className={styles.questHeader}>📜 任务 {index + 1}:</div>
              {(quest?.cn_target || quest?.en_target || quest?.objective) && (
                <div className={styles.questTarget}>→ {renderText(quest.cn_target || quest.en_target || quest.objective, item)}</div>
              )}
              {(quest?.cn_reward || quest?.en_reward || quest?.reward) && (
                <div className={styles.questReward}>✨ {renderText(quest.cn_reward || quest.en_reward || quest.reward, item)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 附魔区域 */}
      {enchantEntries.length > 0 && (
        <div className={styles.itemEnchantmentsRow}>
          {enchantEntries.map(([enchKey, ench]) => {
            const data = (ench && typeof ench === 'object') ? ench : { effect_cn: String(ench || '') }
            const name = data.name_cn || enchKey
            const effect = data.effect_cn || data.effect_en || ''
            const color = ENCHANT_COLORS[name] || '#ffcd19'
            
            return (
              <div key={enchKey} className={styles.enchantItem}>
                <span className={styles.enchantBadge} style={{ '--enc-clr': color } as React.CSSProperties}>
                  {name}
                </span>
                <span className={styles.enchantEffect}>{renderText(effect, item)}</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
