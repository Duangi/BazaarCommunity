export type TierToken = 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Legendary'

const TIER_ORDER: TierToken[] = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Legendary']

export function parseTierToken(input?: unknown): TierToken {
  const s = String(input || '').toLowerCase()
  if (s.includes('legendary') || s.includes('传说')) return 'Legendary'
  if (s.includes('diamond') || s.includes('钻石')) return 'Diamond'
  if (s.includes('gold') || s.includes('黄金')) return 'Gold'
  if (s.includes('silver') || s.includes('白银')) return 'Silver'
  return 'Bronze'
}

function parseSlashValues(input?: unknown): number[] {
  const raw = String(input || '').trim()
  if (!raw) return []
  return raw
    .split('/')
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x))
}

function normalizeTimeLike(v: number): number {
  if (!Number.isFinite(v)) return 0
  if (v >= 100) return v / 1000
  return v
}

function getAttrByTier(raw: any, attrName: string, tier: TierToken): number | null {
  const attrs = Array.isArray(raw?.attributes) ? raw.attributes : []
  const attr = attrs.find((a: any) => String(a?.attribute || '').toLowerCase() === String(attrName).toLowerCase())
  if (!attr) return null
  const byTier = Array.isArray(attr?.values_by_tier) ? attr.values_by_tier : []
  const exact = byTier.find((r: any) => parseTierToken(String(r?.tier || '')) === tier)
  if (exact && Number.isFinite(Number(exact?.value))) return Number(exact.value)
  const firstByTier = byTier.find((r: any) => Number.isFinite(Number(r?.value)))
  if (firstByTier) return Number(firstByTier.value)
  const uniq = Array.isArray(attr?.unique_values) ? attr.unique_values : []
  const firstUniq = uniq.find((x: any) => Number.isFinite(Number(x)))
  if (firstUniq != null) return Number(firstUniq)
  return null
}

function getTieredNumber(input: any, tier: TierToken): number | null {
  if (Number.isFinite(Number(input))) return Number(input)
  const vals = parseSlashValues(input)
  if (!vals.length) return null
  const idx = TIER_ORDER.indexOf(tier)
  if (vals.length >= 5 && idx >= 0 && vals[idx] != null) return vals[idx]
  return vals[Math.min(vals.length - 1, Math.max(0, idx))]
}

export function deriveAmmoMax(item: any, tierInput?: unknown): number | null {
  const tier = parseTierToken(tierInput || item?.starting_tier || item?.tier)
  const raw = item?.__raw || null

  const fromFlat = getTieredNumber(item?.ammo, tier)
  if (fromFlat != null && fromFlat > 0) return Math.round(fromFlat)

  const fromFlatTiers = getTieredNumber(item?.ammo_tiers, tier)
  if (fromFlatTiers != null && fromFlatTiers > 0) return Math.round(fromFlatTiers)

  if (raw) {
    const fromRaw = getAttrByTier(raw, 'AmmoMax', tier)
    if (fromRaw != null && fromRaw > 0) return Math.round(fromRaw)
  }

  const textPool = [
    item?.description_cn,
    ...(Array.isArray(item?.skills) ? item.skills : []),
    ...(Array.isArray(item?.descriptions) ? item.descriptions : []),
  ]
    .map((x) => String(typeof x === 'string' ? x : (x?.cn || x?.en || '')))
    .join(' ')
  const m = textPool.match(/(?:弹药|ammo)\s*[:：]?\s*(\d+)/i)
  if (m?.[1]) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) return Math.round(n)
  }

  return null
}

export function deriveCritChance(item: any, tierInput?: unknown): number | null {
  const tier = parseTierToken(tierInput || item?.starting_tier || item?.tier)
  const raw = item?.__raw || null

  const fromFlat = getTieredNumber(item?.crit, tier)
  if (fromFlat != null && fromFlat > 0) return Number(fromFlat)

  const fromFlatTiers = getTieredNumber(item?.crit_tiers, tier)
  if (fromFlatTiers != null && fromFlatTiers > 0) return Number(fromFlatTiers)

  if (raw) {
    const fromRaw = getAttrByTier(raw, 'CritChance', tier)
    if (fromRaw != null && fromRaw > 0) return Number(fromRaw)
  }

  return null
}

export function getDisplayTags(item: any): string[] {
  if (Array.isArray(item?.processed_tags) && item.processed_tags.length > 0) {
    return item.processed_tags
      .map((x: any) => String(x || '').trim())
      .filter(Boolean)
  }
  const tags = item?.tags
  if (Array.isArray(tags)) {
    return tags
      .map((x) => {
        const t = String(x || '').trim()
        const parts = t.split('/')
        return (parts[1] || parts[0] || '').trim()
      })
      .filter(Boolean)
  }
  if (typeof tags === 'string' && tags.trim()) {
    return tags
      .split('|')
      .map((t) => {
        const parts = String(t || '').trim().split('/')
        return (parts[1] || parts[0] || '').trim()
      })
      .filter(Boolean)
  }
  return []
}

export function deriveDisplayedCooldown(item: any, tierInput?: unknown): number | null {
  const tier = parseTierToken(tierInput || item?.starting_tier || item?.tier)
  const raw = item?.__raw || null
  const fromTiers = getTieredNumber(item?.cooldown_tiers, tier)
  if (fromTiers != null && fromTiers > 0) return normalizeTimeLike(fromTiers)
  if (Number.isFinite(Number(item?.cooldown)) && Number(item.cooldown) > 0) return normalizeTimeLike(Number(item.cooldown))
  if (raw) {
    const fromRaw = getAttrByTier(raw, 'CooldownMax', tier)
    if (fromRaw != null && fromRaw > 0) return normalizeTimeLike(fromRaw)
  }
  return null
}

