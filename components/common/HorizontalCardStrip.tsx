'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import ItemImage from '@/components/ItemImage'
import styles from './HorizontalCardStrip.module.css'

type RoleType = 'core' | 'sub' | 'tech' | 'none'
type SizeType = 'small' | 'medium' | 'large'

export interface HorizontalCardItem {
  key: string
  name?: string
  size?: string
  role?: RoleType
  tooltip?: string
  item?: {
    id?: string
    art_key?: string
  }
  imageSrc?: string
  imageSrcCandidates?: string[]
  onClick?: () => void
}

interface HorizontalCardStripProps {
  cards: HorizontalCardItem[]
  scale?: number
  className?: string
}

function parseSize(raw?: string): SizeType {
  const s = String(raw || 'medium').toLowerCase()
  if (s.includes('small') || s.includes('小')) return 'small'
  if (s.includes('large') || s.includes('大')) return 'large'
  return 'medium'
}

function roleClass(role?: RoleType): string {
  if (role === 'core') return styles.roleCore
  if (role === 'sub') return styles.roleSub
  if (role === 'tech') return styles.roleTech
  return ''
}

function CandidateImage({
  alt,
  className,
  fallbackClassName,
  candidates,
}: {
  alt: string
  className?: string
  fallbackClassName?: string
  candidates: string[]
}) {
  const deduped = useMemo(() => Array.from(new Set(candidates.filter(Boolean))), [candidates])
  const [index, setIndex] = useState(0)
  const src = deduped[index] || ''

  useEffect(() => {
    setIndex(0)
  }, [deduped.join('|')])

  if (!src) return <div className={fallbackClassName}>🎴</div>

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setIndex((prev) => prev + 1)}
    />
  )
}

export default function HorizontalCardStrip({ cards, scale = 1, className }: HorizontalCardStripProps) {
  return (
    <div className={`${styles.row} ${className || ''}`} style={{ '--strip-scale': String(scale) } as CSSProperties}>
      {cards.map((card) => {
        const size = parseSize(card.size)
        const baseClass = `${size === 'small' ? styles.small : size === 'large' ? styles.large : styles.medium} ${roleClass(card.role)}`
        const title = card.tooltip || card.name || ''
        const content = card.item ? (
          <ItemImage
            item={card.item}
            alt={card.name || 'card'}
            className={styles.img}
            fallbackClassName={styles.fallback}
          />
        ) : (
          <CandidateImage
            alt={card.name || 'card'}
            className={styles.img}
            fallbackClassName={styles.fallback}
            candidates={card.imageSrcCandidates?.length ? card.imageSrcCandidates : [card.imageSrc || '']}
          />
        )

        if (card.onClick) {
          return (
            <button key={card.key} className={`${styles.cardBtn} ${baseClass}`} onClick={card.onClick} title={title}>
              {content}
            </button>
          )
        }
        return (
          <div key={card.key} className={`${styles.cardStatic} ${baseClass}`} title={title}>
            {content}
          </div>
        )
      })}
    </div>
  )
}
