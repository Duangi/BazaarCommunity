'use client'

import { useEffect, useState } from 'react'
import { resolveItemImageUrl, type ImageItemLike } from '@/lib/itemImage'

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
  const [failed, setFailed] = useState(false)
  const src = resolveItemImageUrl(item)

  useEffect(() => {
    setFailed(false)
  }, [src, item.id, item.art_key])

  if (!src || failed) {
    return <div className={fallbackClassName}>🎴</div>
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => setFailed(true)}
    />
  )
}
