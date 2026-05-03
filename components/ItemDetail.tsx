'use client'

import styles from './ItemDetail.module.css'
import ItemDetailContent from './ItemDetailContent'
import ItemImage from './ItemImage'
import { heroAvatarUrl } from '@/lib/cdn'
import { deriveAmmoMax, deriveCritChance, getDisplayTags } from '@/lib/itemDerived'

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

function normalizeHeroPair(heroValue: any): { en: string; cn: string } {
  if (typeof heroValue === 'string') {
    const parts = heroValue.split(' / ').map((x) => x.trim()).filter(Boolean)
    const en = parts[0] || 'Common'
    const cn = parts[1] || en
    return { en, cn }
  }
  if (Array.isArray(heroValue) && heroValue.length > 0) {
    const first = heroValue[0]
    if (typeof first === 'string') {
      const parts = first.split(' / ').map((x) => x.trim()).filter(Boolean)
      const en = parts[0] || first
      const cn = parts[1] || en
      return { en, cn }
    }
    if (first && typeof first === 'object') {
      const en = String((first as any).en || (first as any).id || 'Common').trim() || 'Common'
      const cn = String((first as any).cn || en).trim() || en
      return { en, cn }
    }
  }
  if (heroValue && typeof heroValue === 'object') {
    const en = String((heroValue as any).en || (heroValue as any).id || 'Common').trim() || 'Common'
    const cn = String((heroValue as any).cn || en).trim() || en
    return { en, cn }
  }
  return { en: 'Common', cn: 'Common' }
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
  const heroPair = normalizeHeroPair(item.heroes)
  const heroEn = heroPair.en
  const heroSlug = heroEn.toLowerCase()
  const heroCn = heroPair.cn
  const isCommon = !heroEn || heroSlug === 'common'

  // 标签处理
  const displayTags = getDisplayTags(item)
  const ammoMax = deriveAmmoMax(item, startingTierRaw)
  const critChance = deriveCritChance(item, startingTierRaw)

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
            {displayTags.slice(0, 6).map((tag, idx) => (
              <span key={idx} className={styles.tagBadge}>{tag}</span>
            ))}
            {ammoMax != null && ammoMax > 0 && (
              <span className={styles.tagBadge}>弹药：{ammoMax}</span>
            )}
            {critChance != null && critChance > 0 && (
              <span className={styles.tagBadge}>暴击：{critChance}%</span>
            )}
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
