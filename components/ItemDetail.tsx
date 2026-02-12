'use client'

import styles from './ItemDetail.module.css'
import ItemDetailContent from './ItemDetailContent'
import ItemImage from './ItemImage'
import { heroAvatarUrl } from '@/lib/cdn'

// 定义了组件所需的所有数据字段
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
  skills_passive?: any[] // 新增：被动技能
  descriptions?: any[]
  description_cn?: any
  quests?: any // 新增：任务，可以是对象或数组
  enchantments?: Record<string, any>
  art_key?: string // 新增：用于查找技能图片
}

interface ItemDetailProps {
  item: Item | null
}



export default function ItemDetail({ item }: ItemDetailProps) {
  if (!item) {
    return (
      <div className={styles.container}>
        <div className={styles.placeholder}>
          <p>请从左侧百科搜索或中间功能区选择卡牌/技能</p>
          <p>右侧会显示对应详情</p>
        </div>
      </div>
    )
  }

  const startingTierRaw = item.starting_tier || item.tier || 'Bronze'
  const tierClass = startingTierRaw.split(' / ')[0].toLowerCase()

  const tierNameMap: Record<string, string> = {
    'bronze': '青铜+', 'silver': '白银+', 'gold': '黄金+',
    'diamond': '钻石', // 无 '+'
    'legendary': '传说' // 无 '+'
  }
  const tierLabel = tierNameMap[tierClass] || tierClass

  const sizeClass = (item.size || 'Medium').split(' / ')[0].toLowerCase()
  
  // 英雄处理
  const heroesRaw = item.heroes || ''
  const heroesStr = Array.isArray(heroesRaw) ? heroesRaw[0] : heroesRaw
  const heroEn = heroesStr.split(' / ')[0].trim()
  const heroSlug = heroEn.toLowerCase()
  const heroCn = heroesStr.split(' / ')[1]?.trim() || heroEn
  const isCommon = !heroEn || heroSlug === 'common'

  // 标签处理
  const getTags = () => {
    if (item.processed_tags?.length) {
      return item.processed_tags
    }
    if (typeof item.tags === 'string') {
      return item.tags.split('|').map(t => {
        const parts = t.trim().split('/')
        return parts[1]?.trim() || parts[0].trim()
      }).filter(Boolean)
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
            <ItemImage
              item={item}
              alt={item.name_cn || item.name_en}
              className={styles.itemImage}
              fallbackClassName={styles.imageFallback}
              loading="eager"
            />
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
            {displayTags.slice(0, 4).map((tag, idx) => (
              <span key={idx} className={styles.tagBadge}>{tag}</span>
            ))}
          </div>
        </div>

        {/* 仅在非通用时显示英雄头像 */}
        {!isCommon && (
          <div className={styles.cardHeaderRight}>
            <div className={styles.heroAvatarContainer}>
              <img src={heroAvatarUrl(heroSlug)} alt={heroCn} className={styles.heroAvatar} title={`专属英雄: ${heroCn}`} />
            </div>
          </div>
        )}
      </div>

      <ItemDetailContent item={item} />
    </div>
  )
}
