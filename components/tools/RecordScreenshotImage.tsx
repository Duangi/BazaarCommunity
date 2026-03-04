'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildScreenshotProxyUrl } from '@/lib/recordScreenshot'

interface RecordScreenshotImageProps {
  src: string
  alt: string
  className?: string
  title?: string
}

export default function RecordScreenshotImage({ src, alt, className, title }: RecordScreenshotImageProps) {
  const fallbackSrc = useMemo(() => buildScreenshotProxyUrl(src), [src])
  const [resolvedSrc, setResolvedSrc] = useState(src)
  const [triedFallback, setTriedFallback] = useState(false)

  useEffect(() => {
    setResolvedSrc(src)
    setTriedFallback(false)
  }, [src])

  const handleError = () => {
    if (triedFallback) return
    if (!fallbackSrc || fallbackSrc === resolvedSrc) return
    setResolvedSrc(fallbackSrc)
    setTriedFallback(true)
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      title={title}
      onError={handleError}
    />
  )
}

