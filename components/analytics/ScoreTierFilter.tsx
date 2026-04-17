'use client'

import styles from './ScoreTierFilter.module.css'

export type ScoreTier =
  | '<500'
  | '500-600'
  | '600-700'
  | '700-800'
  | '800-900'
  | '900-1000'
  | '1000-1050'
  | '>=1050'

export const SCORE_TIER_OPTIONS: Array<{ key: ScoreTier; label: string }> = [
  { key: '<500', label: '<500' },
  { key: '500-600', label: '500-600' },
  { key: '600-700', label: '600-700' },
  { key: '700-800', label: '700-800' },
  { key: '800-900', label: '800-900' },
  { key: '900-1000', label: '900-1000' },
  { key: '1000-1050', label: '1000-1050' },
  { key: '>=1050', label: '>=1050' },
]

interface ScoreTierFilterProps {
  value: ScoreTier[]
  onChange: (next: ScoreTier[]) => void
  onlyHighRank: boolean
  onChangeOnlyHighRank: (next: boolean) => void
  sampleCounts?: Partial<Record<ScoreTier, number>>
}

export default function ScoreTierFilter({
  value,
  onChange,
  onlyHighRank,
  onChangeOnlyHighRank,
  sampleCounts = {},
}: ScoreTierFilterProps) {
  const toggle = (tier: ScoreTier) => {
    if (value.includes(tier)) onChange(value.filter((x) => x !== tier))
    else onChange([...value, tier])
  }

  const setHigh = (enabled: boolean) => {
    onChangeOnlyHighRank(enabled)
    if (enabled) onChange(['1000-1050', '>=1050'])
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <span className={styles.title}>分数分层</span>
        <button
          type="button"
          className={`${styles.highBtn} ${onlyHighRank ? styles.highBtnActive : ''}`}
          onClick={() => setHigh(!onlyHighRank)}
        >
          仅高分局
        </button>
      </div>
      <div className={styles.grid}>
        {SCORE_TIER_OPTIONS.map((opt) => {
          const active = value.includes(opt.key)
          return (
            <button
              key={opt.key}
              type="button"
              className={`${styles.tierBtn} ${active ? styles.tierBtnActive : ''}`}
              onClick={() => toggle(opt.key)}
            >
              <span>{opt.label}</span>
              <span className={styles.count}>{sampleCounts[opt.key] ?? 0}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

