let resolvedTextMapPromise: Promise<Record<string, any> | null> | null = null

function normalizeKey(value: any): string {
  return String(value || '').trim().toLowerCase()
}

function pickItemKey(item: any): string {
  const id = String(item?.id || '').trim()
  if (id) return id
  const cn = normalizeKey(item?.name_cn)
  if (cn) return cn
  return normalizeKey(item?.name_en)
}

export async function loadResolvedTextMap(): Promise<Record<string, any> | null> {
  if (!resolvedTextMapPromise) {
    resolvedTextMapPromise = fetch('/resources/json/resolved_text_map.json', { cache: 'force-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
  }
  return resolvedTextMapPromise
}

export function enrichItemText(item: any, resolvedTextMap: Record<string, any> | null): any {
  if (!item) return item
  const hasMap = !!(resolvedTextMap && typeof resolvedTextMap === 'object')
  const byKey = hasMap ? (resolvedTextMap as Record<string, any>)[pickItemKey(item)] : null
  if (!byKey || typeof byKey !== 'object') {
    const fallback = { ...item }
    const nameCn = String(fallback?.name_cn || '').trim()
    const nameEn = String(fallback?.name_en || '').trim().toLowerCase()
    if (nameCn === '透镜' || nameEn === 'lens') {
      const descs = Array.isArray(fallback.descriptions) ? fallback.descriptions.slice() : []
      for (const d of descs) {
        if (!d || typeof d !== 'object') continue
        const en = String((d as any).en || '')
        const cn = String((d as any).cn || '')
        if (!cn.trim() && /Charge the Tech item to the right of this/i.test(en)) {
          ;(d as any).cn = '使用时，为右侧紧贴着的科技物品充能{ability.0}秒。'
        }
      }
      fallback.descriptions = descs
    }
    return fallback
  }
  // NOTE:
  // - Primary source is the latest manually-downloaded dump-derived items/skills DB.
  // - resolved_text_map is legacy fallback only; it should fill missing fields, never overwrite existing values.
  // - This avoids reintroducing stale text like unresolved placeholders or wrong duration scale.
  const hasSkills = Array.isArray(item.skills) && item.skills.length > 0
  const hasPassive = Array.isArray(item.skills_passive) && item.skills_passive.length > 0
  const hasDescs = Array.isArray(item.descriptions) && item.descriptions.length > 0
  const hasDescCn = !!String(item.description_cn || '').trim()
  const hasQuests = Array.isArray(item.quests) && item.quests.length > 0
  const hasEnchants = !!(item.enchantments && typeof item.enchantments === 'object' && Object.keys(item.enchantments).length > 0)
  const merged = {
    ...item,
    // New dump data is primary source; resolved map only fills missing holes.
    skills: hasSkills ? item.skills : (Array.isArray(byKey.skills) && byKey.skills.length ? byKey.skills : item.skills),
    skills_passive:
      hasPassive ? item.skills_passive : (Array.isArray(byKey.skills_passive) && byKey.skills_passive.length ? byKey.skills_passive : item.skills_passive),
    descriptions: hasDescs ? item.descriptions : (Array.isArray(byKey.descriptions) && byKey.descriptions.length ? byKey.descriptions : item.descriptions),
    description_cn: hasDescCn ? item.description_cn : (byKey.description_cn || item.description_cn),
    quests: hasQuests ? item.quests : (Array.isArray(byKey.quests) ? byKey.quests : item.quests),
    enchantments:
      hasEnchants ? item.enchantments : (byKey.enchantments && typeof byKey.enchantments === 'object' ? byKey.enchantments : item.enchantments),
  }

  // Card-specific text patch:
  // Lens has one missing CN line in some dumps; fill it to keep UI consistent.
  const nameCn = String(merged?.name_cn || '').trim()
  const nameEn = String(merged?.name_en || '').trim().toLowerCase()
  if (nameCn === '透镜' || nameEn === 'lens') {
    const descs = Array.isArray(merged.descriptions) ? merged.descriptions.slice() : []
    for (const d of descs) {
      if (!d || typeof d !== 'object') continue
      const en = String((d as any).en || '')
      const cn = String((d as any).cn || '')
      if (!cn.trim() && /Charge the Tech item to the right of this/i.test(en)) {
        ;(d as any).cn = '使用时，为右侧紧贴着的科技物品充能{ability.0}秒。'
      }
    }
    merged.descriptions = descs
  }
  return merged
}

export function enrichItemsWithResolvedText(items: any[], resolvedTextMap: Record<string, any> | null): any[] {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.map((item) => enrichItemText(item, resolvedTextMap))
}
