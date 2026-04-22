'use client'

import React from 'react'
import styles from './BorderTierSelector.module.css'

const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  diamond: '#7ad8ff',
  legendary: '#ff6a00',
}

const TIER_LABELS: Record<string, string> = {
  bronze: '青铜',
  silver: '白银',
  gold: '黄金',
  diamond: '钻石',
  legendary: '传说',
}

export default function BorderTierSelector({
  title = '卡牌等级',
  options,
  selected,
  editable = true,
  onSelect,
}: {
  title?: string
  options: string[]
  selected: string
  editable?: boolean
  onSelect: (tier: string) => void
}) {
  return (
    <div className={styles.borderEditor}>
      <div className={styles.borderEditorTitle}>{title}</div>
      {!editable ? (
        <div className={styles.borderHint}>该卡等级不可修改。</div>
      ) : (
        <div className={styles.borderSwatches}>
          {options.map((tier) => {
            const key = String(tier || '').toLowerCase()
            return (
              <button
                key={tier}
                className={`${styles.borderSwatch} ${String(selected || '').toLowerCase() === key ? styles.borderSwatchActive : ''}`}
                style={{ ['--tier-clr' as any]: TIER_COLORS[key] || TIER_COLORS.bronze }}
                onClick={() => onSelect(tier)}
                title={TIER_LABELS[key] || tier}
              >
                <span className={styles.swatchDot}></span>
                {TIER_LABELS[key] || tier}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
