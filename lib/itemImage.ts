import { cdnUrl } from '@/lib/cdn'

export type ImageItemLike = {
  id?: string
  art_key?: string
}

function normalizeSkillKey(item: ImageItemLike): string {
  const raw = item.art_key ? item.art_key.split('/').pop() || '' : item.id || ''
  return raw.replace(/\.png$/i, '')
}

export function resolveItemImageUrl(item: ImageItemLike): string {
  if (!item?.id) return ''
  const hasArtKeyField = Object.prototype.hasOwnProperty.call(item, 'art_key')
  if (hasArtKeyField) {
    return cdnUrl(`images/skill/${normalizeSkillKey(item)}.webp`)
  }
  return cdnUrl(`images/card/${item.id}.webp`)
}
