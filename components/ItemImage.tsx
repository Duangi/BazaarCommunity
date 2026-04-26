'use client'

import { useEffect, useState } from 'react'
import { resolveItemImageCandidates, type ImageItemLike } from '@/lib/itemImage'

interface ItemImageProps {
  item: ImageItemLike
  alt: string
  className?: string
  fallbackClassName?: string
  loading?: 'lazy' | 'eager'
}

export default function ItemImage({
  item,
  alt,
  className,
  fallbackClassName,
  loading = 'lazy',
}: ItemImageProps) {
  const candidates = resolveItemImageCandidates(item)
  const [index, setIndex] = useState(0)
  const src = candidates[index] || ''

  useEffect(() => {
    setIndex(0)
  }, [item.id, item.art_key, candidates.join('|')])

  if (!src) {
    return <div className={fallbackClassName}>🎴</div>
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={className}
      loading={loading}
      onError={() => setIndex((prev) => prev + 1)}
    />
  )
}
