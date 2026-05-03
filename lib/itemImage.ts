import { cdnUrl } from '@/lib/cdn'
import idMapMin from '@/public/resources/json/id_map_min.json'

export type ImageItemLike = {
  id?: string
  art_key?: string
  source_id?: string
}

function normalizeSkillKey(item: ImageItemLike): string {
  const raw = item.art_key ? item.art_key.split('/').pop() || '' : item.id || ''
  return raw.replace(/\.png$/i, '')
}

export function resolveItemImageUrl(item: ImageItemLike): string {
  if (!item?.id) return ''
  if (item.art_key) return cdnUrl(`images/skill/${normalizeSkillKey(item)}.webp`)
  return cdnUrl(`images/card/${String(item.id).trim()}.webp`)
}

export function resolveItemImageCandidates(item: ImageItemLike): string[] {
  if (!item?.id) return []
  const id = String(item.id).trim()
  const skillKey = normalizeSkillKey(item)
  const mappedSourceId = (() => {
    const explicit = String((item as any)?.source_id || '').trim()
    if (explicit) return explicit
    const map = (idMapMin as any)?.map || {}
    const hit = map[id]
    const source = String(hit?.source_id || '').trim()
    return source
  })()
  const candidates = item.art_key
    ? [
        cdnUrl(`images/skill/${skillKey}.webp`),
        cdnUrl(`images/skill/${id}.webp`),
        cdnUrl(`images/card/${id}.webp`),
        mappedSourceId ? cdnUrl(`images/card/${mappedSourceId}.webp`) : '',
      ]
    : [
        cdnUrl(`images/card/${id}.webp`),
        mappedSourceId ? cdnUrl(`images/card/${mappedSourceId}.webp`) : '',
        cdnUrl(`images/skill/${id}.webp`),
      ]
  return Array.from(new Set(candidates.filter(Boolean)))
}
