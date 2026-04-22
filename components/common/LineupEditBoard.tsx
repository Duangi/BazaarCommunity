'use client'

import React from 'react'
import { useDrag } from 'react-dnd'
import styles from './LineupEditBoard.module.css'
import ItemImage from '@/components/ItemImage'

export type LineupBoardCard = {
  placementId: string
  item: any
  start: number
  width: number
  borderTier?: string
}

const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  diamond: '#7ad8ff',
  legendary: '#ff6a00',
}

function tierColor(v?: string): string {
  const key = String(v || 'bronze').toLowerCase()
  return TIER_COLORS[key] || TIER_COLORS.bronze
}

function DraggableCard({
  card,
  sourceBoard,
  selected,
  onSelect,
  onRemove,
  useCount,
  totalDamage,
}: {
  card: LineupBoardCard
  sourceBoard: 'main' | 'reserve'
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  useCount?: number
  totalDamage?: number
}) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'ITEM',
    item: {
      placementId: card.placementId,
      item: card.item,
      width: card.width,
      sourceType: 'items',
      sourceBoard,
    },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }))

  return (
    <div
      ref={drag as any}
      className={`${styles.placedCard} ${selected ? styles.placedCardSelected : ''} ${isDragging ? styles.dragging : ''}`}
      style={{
        gridColumn: `${card.start + 1} / span ${card.width}`,
        gridRow: '1 / 2',
        ['--border-tier' as any]: tierColor(card.borderTier),
      }}
      onClick={onSelect}
      title={card.item?.name_cn || card.item?.name_en || card.item?.id}
    >
      <ItemImage
        item={card.item}
        alt={card.item?.name_cn || card.item?.name_en || card.item?.id || 'card'}
        className={styles.placedImage}
      />
      {useCount != null && <span className={styles.useBadge}>{useCount}</span>}
      {totalDamage != null && <span className={styles.damageBadge}>{Number(totalDamage || 0).toFixed(1)}</span>}
      <button
        className={styles.removeButton}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        ×
      </button>
    </div>
  )
}

export default function LineupEditBoard({
  title,
  cards,
  sourceBoard,
  selectedId,
  onSelectCard,
  onRemoveCard,
  onAttachRef,
  isOver,
  useCountMap,
  damageMap,
  enabledMask,
  boardScale = 1,
}: {
  title: string
  cards: LineupBoardCard[]
  sourceBoard: 'main' | 'reserve'
  selectedId: string | null
  onSelectCard: (card: LineupBoardCard) => void
  onRemoveCard: (placementId: string) => void
  onAttachRef: (node: HTMLDivElement | null) => void
  isOver?: boolean
  useCountMap?: Record<string, number>
  damageMap?: Record<string, number>
  enabledMask?: boolean[]
  boardScale?: number
}) {
  const safeScale = Number.isFinite(boardScale) ? Math.max(0.8, Math.min(2.0, boardScale)) : 1
  const slotHeight = Math.round(72 * safeScale)
  const slotUnit = Math.round(36 * safeScale)
  const mask = Array.isArray(enabledMask) && enabledMask.length === 10 ? enabledMask : Array.from({ length: 10 }, () => true)

  return (
    <div
      className={`${styles.lineupBoard} ${isOver ? styles.lineupBoardOver : ''}`}
      style={{
        ['--slot-height' as any]: `${slotHeight}px`,
        ['--slot-unit-width' as any]: `${slotUnit}px`,
      }}
    >
      <div className={styles.title}>{title}</div>
      <div className={styles.boardArea} ref={onAttachRef}>
        <div className={styles.boardGrid}>
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className={`${styles.slotCell} ${!mask[idx] ? styles.slotCellDisabled : ''}`}>
              {!mask[idx] ? '禁用' : idx + 1}
            </div>
          ))}
        </div>
        <div className={styles.cardsOverlay}>
          {cards.map((card) => (
            <DraggableCard
              key={card.placementId}
              card={card}
              sourceBoard={sourceBoard}
              selected={selectedId === card.placementId}
              onSelect={() => onSelectCard(card)}
              onRemove={() => onRemoveCard(card.placementId)}
              useCount={useCountMap ? useCountMap[card.placementId] || 0 : undefined}
              totalDamage={damageMap ? damageMap[card.placementId] || 0 : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
