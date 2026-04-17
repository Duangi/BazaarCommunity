'use client'

import { Fragment, useMemo, useRef, useState } from 'react'
import { useDrag, useDrop } from 'react-dnd'
import ItemImage from '@/components/ItemImage'
import styles from './JibaoWorkbench.module.css'

type LabItem = {
  id: string
  source_key?: string
  name_cn?: string
  name_en?: string
  size?: string
  starting_tier?: string
  tags?: any
  hidden_tags?: any
  __raw?: any
}

type PlacedCard = {
  placementId: string
  item: LabItem
  start: number
  width: number
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Legendary'
  cooldownOverrideSec?: number
  shieldEnchanted?: boolean
}

type DragPayload = {
  placementId?: string
  item?: LabItem
  width?: number
  sourceType?: 'items' | 'skills'
}

type ChargeRule = {
  sourceName: string
  sourceId: string
  amount: number
  amountByTier: Partial<Record<'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Legendary', number>>
  targetType: string
  targetMode: string
  targetSection: string
  requiredTags: string[]
  requiredExcludeTags: string[]
  requiredCooldownOnly: boolean
  requiredNotTriggerSource: boolean
  requiredSizes: string[]
  requiredExcludeSizes: string[]
  targetExcludeSelf: boolean
  triggerType: string
  triggerRequiredTags: string[]
  triggerRequiredExcludeTags: string[]
  triggerRequireCooldownOnly: boolean
  triggerRequiredSizes: string[]
  triggerRequiredExcludeSizes: string[]
  triggerExcludeSelf: boolean
  triggerSubjectType: string
  triggerSubjectMode: string
  description: string
}

type LinkHit = {
  fromId: string
  from: string
  toId: string
  to: string
  amount: number
  mode: string
  matchedBy: string
  triggeredById?: string
  triggeredBy?: string
}

type BrokenHit = {
  from: string
  amount: number
  mode: string
  reason: string
}

type Analysis = {
  potential: number
  effective: number
  efficiency: number
  links: LinkHit[]
  broken: BrokenHit[]
  staticPotential: number
  staticEffective: number
}

type NetworkMetrics = {
  activeCards: number
  sustainableCards: number
  sustainRatio: number
  pairCycles: number
  score: number
}

type SuggestionCandidate = {
  id: string
  rank: number
  damageGain: number
  next: PlacedCard[]
  totalUses: number
  totalDamage: number
  curve: number[]
  championSeconds: number[]
}

type CoreBuffRule = {
  sourceName: string
  sourceId: string
  targetType: string
  targetMode: string
  targetSection: string
  requiredTags: string[]
  requiredExcludeTags: string[]
  requiredCooldownOnly: boolean
  requiredNotTriggerSource: boolean
  requiredSizes: string[]
  requiredExcludeSizes: string[]
  targetExcludeSelf: boolean
  triggerType: string
  triggerRequiredTags: string[]
  triggerRequiredExcludeTags: string[]
  triggerRequireCooldownOnly: boolean
  triggerRequiredSizes: string[]
  triggerRequiredExcludeSizes: string[]
  triggerExcludeSelf: boolean
  triggerSubjectType: string
  triggerSubjectMode: string
  description: string
}

type TimelineSegment = {
  id: string
  label: string
  start: number
  end: number
}

type SegmentStat = {
  fires: number
  buffedFires: number
  avgCoreStacks: number
}

type SimWeaponRow = {
  placementId: string
  name: string
  totalFires: number
  totalBuffed: number
  segments: SegmentStat[]
}

type TimelinePoint = {
  placementId: string
  name: string
  kind: 'core' | 'weapon'
  time: number
  useIndex: number
}

type CoreTimelineSummary = {
  durationSec: number
  eventCount: number
  coreName: string
  coreFireTimes: number[]
  segments: TimelineSegment[]
  rows: SimWeaponRow[]
  points: TimelinePoint[]
  maxTime: number
}

type CoreUseStep = {
  useIndex: number
  atSec: number | null
  receivedCharge: number
  outputCharge: number
  outputValue: number
}

type CoreContribution = {
  placementId: string
  name: string
  rpm: number
  avgInterval: number
  totalReceived: number
  totalOutputCharge: number
  totalOutputValue: number
  compositeScore: number
  steps: CoreUseStep[]
}

type LayoutCoreContribution = {
  layoutId: string
  layoutName: string
  rankScore: number
  cores: CoreContribution[]
}

type UseCountSummary = {
  durationSec: number
  totalUses: number
  byCard: Record<string, number>
}

type CombatSummary = {
  durationSec: number
  totalUses: number
  byCard: Record<string, number>
  totalDamage: number
  byCardDamage: Record<string, number>
  cumulativeDamageBySecond: number[]
}

type CycleHit = {
  aId: string
  aName: string
  aCd: number
  bId: string
  bName: string
  bCd: number
  aToB: number
  bToA: number
  ok: boolean
  gapA: number
  gapB: number
}

const MAX_UNITS = 10
const EXAMPLE_1_ORDER: Array<{ name: string; tier: PlacedCard['tier'] }> = [
  { name: '克里斯军刀', tier: 'Silver' },
  { name: '脉冲步枪', tier: 'Silver' },
  { name: '悬浮垫', tier: 'Bronze' },
  { name: '武装核心', tier: 'Silver' },
  { name: '烤肉叉', tier: 'Silver' },
  { name: '电弧轰击枪', tier: 'Silver' },
]

function normalizeName(s?: string): string {
  return String(s || '').trim().toLowerCase()
}

function findItemByName(pool: LabItem[], name: string): LabItem | null {
  const target = normalizeName(name)
  if (!target) return null
  const exact = pool.find((it) => normalizeName(it.name_cn) === target || normalizeName(it.name_en) === target)
  if (exact) return exact
  const fuzzy = pool.find((it) => normalizeName(it.name_cn).includes(target) || normalizeName(it.name_en).includes(target))
  return fuzzy || null
}

function buildExample1Cards(pool: LabItem[]): { cards: PlacedCard[]; missing: string[] } {
  const out: PlacedCard[] = []
  const missing: string[] = []
  let cursor = 0
  let idx = 0
  for (const spec of EXAMPLE_1_ORDER) {
    const name = spec.name
    const item = findItemByName(pool, name)
    if (!item) {
      missing.push(name)
      continue
    }
    const width = getCardWidth(item.size)
    if (cursor + width > MAX_UNITS) break
    out.push({
      placementId: `example1-${item.id}-${idx}`,
      item,
      start: cursor,
      width,
      tier: spec.tier,
    })
    cursor += width
    idx += 1
  }
  return { cards: out, missing }
}

function getCardWidth(size?: string): number {
  const normalized = String(size || 'Medium').toLowerCase()
  if (normalized.includes('small') || normalized.includes('小')) return 1
  if (normalized.includes('large') || normalized.includes('大')) return 3
  return 2
}

function parseTierToken(input?: string): string {
  const s = String(input || '').toLowerCase()
  if (s.includes('legendary') || s.includes('传说')) return 'Legendary'
  if (s.includes('diamond') || s.includes('钻石')) return 'Diamond'
  if (s.includes('gold') || s.includes('黄金')) return 'Gold'
  if (s.includes('silver') || s.includes('白银')) return 'Silver'
  return 'Bronze'
}

function asTier(input?: string): 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Legendary' {
  return parseTierToken(input) as 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Legendary'
}

type TierToken = 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Legendary'

function toTierToken(input: any): TierToken | null {
  const t = parseTierToken(String(input || ''))
  return TIER_ORDER.includes(t as TierToken) ? (t as TierToken) : null
}

const TIER_ORDER: Array<'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Legendary'> = [
  'Bronze',
  'Silver',
  'Gold',
  'Diamond',
  'Legendary',
]

const TIER_LABEL_CN: Record<string, string> = {
  Bronze: '青铜',
  Silver: '白银',
  Gold: '黄金',
  Diamond: '钻石',
  Legendary: '传说',
}

function getAllowedTiers(item: LabItem): TierToken[] {
  const raw = item.__raw || {}
  const out = new Set<TierToken>()
  const push = (v: any) => {
    const t = toTierToken(v)
    if (t) out.add(t)
  }

  const attrs = Array.isArray(raw.attributes) ? raw.attributes : []
  for (const attr of attrs) {
    const byTier = Array.isArray(attr?.values_by_tier) ? attr.values_by_tier : []
    for (const row of byTier) push(row?.tier)
  }

  if (out.size === 0) {
    const base = asTier(item.starting_tier || raw.starting_tier)
    const cdRaw = String((item as any)?.cooldown_tiers || '').trim()
    const count = cdRaw ? cdRaw.split('/').filter(Boolean).length : 0
    const idx = TIER_ORDER.indexOf(base)
    if (count > 0 && idx >= 0) {
      for (let i = idx; i < Math.min(TIER_ORDER.length, idx + count); i += 1) out.add(TIER_ORDER[i])
    } else {
      out.add(base)
    }
  }

  const sorted = Array.from(out).sort((a, b) => TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b))
  return sorted.length ? sorted : [asTier(item.starting_tier)]
}

function getEffectiveTier(card: PlacedCard): TierToken {
  const allowed = getAllowedTiers(card.item)
  return allowed.includes(card.tier) ? card.tier : allowed[0]
}

function getCardTagSet(card: PlacedCard, auraTags?: Map<string, Set<string>>): Set<string> {
  const set = collectTagSet(card.item)
  if (card.shieldEnchanted) set.add('shield')
  const extra = auraTags?.get(card.placementId)
  if (extra) extra.forEach((t) => set.add(normalizeTag(t)))
  return set
}

function matchesCardTags(
  card: PlacedCard,
  requiredTags: string[],
  excludeTags: string[] = [],
  requiredSizes: string[] = [],
  excludeSizes: string[] = [],
  auraTags?: Map<string, Set<string>>,
): boolean {
  const set = getCardTagSet(card, auraTags)
  const req = requiredTags.map((x) => normalizeTag(x)).filter(Boolean)
  const ex = excludeTags.map((x) => normalizeTag(x)).filter(Boolean)
  const sizeNorm = String(card.item.size || '').trim().toLowerCase()
  const reqSize = requiredSizes.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
  const exSize = excludeSizes.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
  if (ex.some((x) => set.has(x))) return false
  if (exSize.length > 0 && exSize.includes(sizeNorm)) return false
  if (reqSize.length > 0 && !reqSize.includes(sizeNorm)) return false
  if (!req.length) return true
  return req.some((x) => set.has(x))
}

function getTierIndex(tier: TierToken): number {
  const idx = TIER_ORDER.indexOf(tier)
  return idx >= 0 ? idx : 0
}

function resolveActionValue(actionValue: any, sourceTier: TierToken): number {
  if (!actionValue || typeof actionValue !== 'object') return 0
  if (Number.isFinite(Number(actionValue?.Value))) return Number(actionValue.Value)
  const resolved = Array.isArray(actionValue?.resolved_values) ? actionValue.resolved_values : []
  if (resolved.length > 0) {
    const idx = getTierIndex(sourceTier)
    const val = resolved[Math.min(resolved.length - 1, idx)]
    if (Number.isFinite(Number(val))) return Number(val)
  }
  if (Number.isFinite(Number(actionValue?.default_value))) return Number(actionValue.default_value)
  return 0
}

function inferTagsFromAuraDescription(desc: string): string[] {
  const s = String(desc || '').toLowerCase()
  const out: string[] = []
  if (s.includes('vehicle') || s.includes('载具')) out.push('vehicle')
  if (s.includes('shield') || s.includes('护盾')) out.push('shield')
  return out
}

function normalizeTag(v: any): string {
  return String(v || '').trim().toLowerCase()
}

function collectTagSet(item: LabItem): Set<string> {
  const out = new Set<string>()

  const consume = (value: any) => {
    if (!value) return
    if (Array.isArray(value)) {
      for (const x of value) consume(x)
      return
    }
    if (typeof value === 'string') {
      value
        .split(/[|,/]/g)
        .map((x) => normalizeTag(x))
        .filter(Boolean)
        .forEach((x) => out.add(x))
      return
    }
    if (typeof value === 'object') {
      const id = normalizeTag((value as any).id)
      const en = normalizeTag((value as any).en)
      const cn = normalizeTag((value as any).cn)
      if (id) out.add(id)
      if (en) out.add(en)
      if (cn) out.add(cn)
    }
  }

  consume(item.tags)
  consume(item.hidden_tags)

  const raw = item.__raw
  if (raw) {
    consume(raw.tags)
    consume(raw.hidden_tags)
    consume(raw.tags_en)
    consume(raw.hidden_tags_en)
    consume(raw.tags_cn)
    consume(raw.hidden_tags_cn)
  }

  return out
}

function extractConditionMeta(node: any): {
  include: string[]
  exclude: string[]
  includeSizes: string[]
  excludeSizes: string[]
  requireCooldownOnly: boolean
  notTriggerSource: boolean
} {
  if (!node || typeof node !== 'object') {
    return { include: [], exclude: [], includeSizes: [], excludeSizes: [], requireCooldownOnly: false, notTriggerSource: false }
  }

  const include: string[] = []
  const exclude: string[] = []
  const includeSizes: string[] = []
  const excludeSizes: string[] = []
  let requireCooldownOnly = false
  let notTriggerSource = false
  const t = String(node.type || '').toLowerCase()
  const operator = String(node.Operator || node.operator || '').toLowerCase()

  const localTags = [
    ...(Array.isArray(node.Tags) ? node.Tags : []),
    ...(Array.isArray(node.tags) ? node.tags : []),
  ]
    .map((x) => String(x).trim())
    .filter(Boolean)

  if (localTags.length > 0) {
    if (t.includes('tag') && operator === 'none') exclude.push(...localTags)
    else include.push(...localTags)
  }

  if (t.includes('size')) {
    const sizes = [
      ...(Array.isArray(node.Sizes) ? node.Sizes : []),
      ...(Array.isArray(node.sizes) ? node.sizes : []),
    ]
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean)
    if (sizes.length > 0) {
      const isNot = Boolean(node.IsNot ?? node.isNot ?? false)
      if (isNot) excludeSizes.push(...sizes)
      else includeSizes.push(...sizes)
    }
  }

  if (t.includes('attribute')) {
    const attr = String(node.Attribute || node.attribute || '').toLowerCase()
    const cmp = String(node.ComparisonOperator || node.comparisonOperator || '').toLowerCase()
    const cv = Number(node?.ComparisonValue?.Value ?? node?.comparisonValue?.value ?? NaN)
    if (attr.includes('cooldown') && cmp.includes('greater') && Number.isFinite(cv) && cv >= 0) {
      requireCooldownOnly = true
    }
  }

  if (t.includes('triggersource')) {
    const isNot = Boolean(node.IsNot ?? node.isNot ?? false)
    if (isNot) notTriggerSource = true
  }

  if (Array.isArray(node.Conditions)) {
    for (const c of node.Conditions) {
      const nested = extractConditionMeta(c)
      include.push(...nested.include)
      exclude.push(...nested.exclude)
      includeSizes.push(...nested.includeSizes)
      excludeSizes.push(...nested.excludeSizes)
      requireCooldownOnly = requireCooldownOnly || nested.requireCooldownOnly
      notTriggerSource = notTriggerSource || nested.notTriggerSource
    }
  }
  if (node.conditions) {
    const nested = extractConditionMeta(node.conditions)
    include.push(...nested.include)
    exclude.push(...nested.exclude)
    includeSizes.push(...nested.includeSizes)
    excludeSizes.push(...nested.excludeSizes)
    requireCooldownOnly = requireCooldownOnly || nested.requireCooldownOnly
    notTriggerSource = notTriggerSource || nested.notTriggerSource
  }

  return {
    include: Array.from(new Set(include)),
    exclude: Array.from(new Set(exclude)),
    includeSizes: Array.from(new Set(includeSizes)),
    excludeSizes: Array.from(new Set(excludeSizes)),
    requireCooldownOnly,
    notTriggerSource,
  }
}

function getAttrValueByTier(rawItem: any, attrType: string, preferredTier: string): number {
  const attrs = Array.isArray(rawItem?.attributes) ? rawItem.attributes : []
  const row = attrs.find((a: any) => String(a?.attribute || '') === String(attrType || ''))
  if (!row) return 1

  const byTier = Array.isArray(row.values_by_tier) ? row.values_by_tier : []
  const timeLikeAttrs = new Set(['ChargeAmount', 'HasteAmount', 'FreezeAmount', 'SlowAmount'])
  const normalizeChargeAmount = (v: number): number => {
    if (timeLikeAttrs.has(String(attrType || '')) && Number.isFinite(v) && Math.abs(v) >= 100) {
      return v / 1000
    }
    return v
  }

  const exact = byTier.find((x: any) => String(x?.tier || '') === preferredTier)
  if (exact && Number.isFinite(Number(exact.value))) return normalizeChargeAmount(Number(exact.value))

  const uniq = Array.isArray(row.unique_values) ? row.unique_values : []
  const first = uniq.find((x: any) => Number.isFinite(Number(x)))
  if (first != null) return normalizeChargeAmount(Number(first))

  const fromByTier = byTier.find((x: any) => Number.isFinite(Number(x?.value)))
  if (fromByTier) return normalizeChargeAmount(Number(fromByTier.value))

  return 1
}

function getAttrValuesByTier(rawItem: any, attrType: string): Partial<Record<'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Legendary', number>> {
  const out: Partial<Record<'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Legendary', number>> = {}
  const attrs = Array.isArray(rawItem?.attributes) ? rawItem.attributes : []
  const row = attrs.find((a: any) => String(a?.attribute || '') === String(attrType || ''))
  if (!row) return out

  const timeLikeAttrs = new Set(['ChargeAmount', 'HasteAmount', 'FreezeAmount', 'SlowAmount'])
  const normalizeChargeAmount = (v: number): number => {
    if (timeLikeAttrs.has(String(attrType || '')) && Number.isFinite(v) && Math.abs(v) >= 100) {
      return v / 1000
    }
    return v
  }

  const byTier = Array.isArray(row.values_by_tier) ? row.values_by_tier : []
  for (const t of byTier) {
    const tier = String(t?.tier || '')
    const val = Number(t?.value)
    if (!Number.isFinite(val)) continue
    if (TIER_ORDER.includes(tier as any)) {
      out[tier as 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Legendary'] = normalizeChargeAmount(val)
    }
  }

  if (Object.keys(out).length === 0) {
    const uniq = Array.isArray(row.unique_values) ? row.unique_values : []
    if (uniq.length > 0 && Number.isFinite(Number(uniq[0]))) {
      const v = normalizeChargeAmount(Number(uniq[0]))
      out.Bronze = v
      out.Silver = v
      out.Gold = v
      out.Diamond = v
    }
  }
  return out
}

function getCardCooldownSecByTier(item: LabItem, tier: string, overrideSec?: number): number {
  if (Number.isFinite(overrideSec) && Number(overrideSec) >= 0) return Number(overrideSec)

  const normalizeCd = (v: number): number => {
    if (!Number.isFinite(v) || v <= 0) return 0
    return v >= 100 ? v / 1000 : v
  }

  const rawItem: any = (item as any)?.__raw || {}
  const tiersRaw = String(
    (item as any)?.cooldown_tiers ||
      (item as any)?.cooldownTiers ||
      rawItem?.cooldown_tiers ||
      rawItem?.cooldownTiers ||
      '',
  ).trim()
  if (tiersRaw) {
    const vals = tiersRaw
      .split('/')
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x))
      .map((x) => normalizeCd(x))
    if (vals.length > 0) {
      const preferred = parseTierToken(
        tier ||
          (item as any)?.starting_tier ||
          (item as any)?.startingTier ||
          rawItem?.starting_tier ||
          rawItem?.startingTier,
      )
      const idxMap: Record<string, number> = { Bronze: 0, Silver: 1, Gold: 2, Diamond: 3, Legendary: 4 }
      const preferredIdx = idxMap[preferred]
      if (vals.length >= 5) {
        if (Number.isInteger(preferredIdx) && vals[preferredIdx] != null) return vals[preferredIdx]
      } else {
        // cooldown_tiers may only include tiers from starting_tier onward, e.g. Silver/Gold/Diamond.
        const startTier = parseTierToken(
          String((item as any)?.starting_tier || (item as any)?.startingTier || rawItem?.starting_tier || rawItem?.startingTier || 'Bronze'),
        )
        const startIdx = idxMap[startTier]
        if (Number.isInteger(preferredIdx) && Number.isInteger(startIdx)) {
          const rel = Math.max(0, Math.min(vals.length - 1, preferredIdx - startIdx))
          if (vals[rel] != null) return vals[rel]
        }
      }
      return vals[vals.length - 1]
    }
  }

  // Fallback: some data sources only keep cooldown inside __raw.attributes.
  const attrs = Array.isArray(rawItem?.attributes)
    ? rawItem.attributes
    : Array.isArray((item as any)?.attributes)
      ? (item as any).attributes
      : []
  const cdAttr = attrs.find((a: any) => String(a?.attribute || '').toLowerCase() === 'cooldown')
  if (cdAttr) {
    const preferred = parseTierToken(
      tier ||
        (item as any)?.starting_tier ||
        (item as any)?.startingTier ||
        rawItem?.starting_tier ||
        rawItem?.startingTier,
    )
    const byTier = Array.isArray(cdAttr?.values_by_tier) ? cdAttr.values_by_tier : []
    const exact = byTier.find((r: any) => parseTierToken(String(r?.tier || '')) === preferred)
    if (exact && Number.isFinite(Number(exact?.value))) {
      const v = normalizeCd(Number(exact.value))
      if (v > 0) return v
    }
    const firstTier = byTier.find((r: any) => Number.isFinite(Number(r?.value)))
    if (firstTier) {
      const v = normalizeCd(Number(firstTier.value))
      if (v > 0) return v
    }
    const uniq = Array.isArray(cdAttr?.unique_values) ? cdAttr.unique_values : []
    const firstUniq = uniq.find((x: any) => Number.isFinite(Number(x)))
    if (firstUniq != null) {
      const v = normalizeCd(Number(firstUniq))
      if (v > 0) return v
    }
  }

  const attrCooldown =
    Number((item as any)?.attributes?.Cooldown) ||
    Number((item as any)?.attributes?.cooldown) ||
    Number((item as any)?.attributes?.CooldownMax) ||
    Number((item as any)?.attributes?.cooldownMax) ||
    Number(rawItem?.attributes?.Cooldown) ||
    Number(rawItem?.attributes?.cooldown)
  if (Number.isFinite(attrCooldown) && attrCooldown > 0) {
    return normalizeCd(attrCooldown)
  }

  const raw = Number(
    (item as any)?.cooldown ??
      (item as any)?.cooldown_seconds ??
      (item as any)?.cooldownSeconds ??
      rawItem?.cooldown ??
      rawItem?.cooldown_seconds ??
      rawItem?.cooldownSeconds,
  )
  if (Number.isFinite(raw) && raw > 0) {
    return normalizeCd(raw)
  }
  return 0
}

function getCardCooldownSec(card: PlacedCard): number {
  return getCardCooldownSecByTier(card.item, getEffectiveTier(card), card.cooldownOverrideSec)
}

function readChargeRules(item: LabItem, tierInput?: string): { positionalRules: ChargeRule[]; staticCharge: number } {
  const raw = item.__raw
  if (!raw) return { positionalRules: [], staticCharge: 0 }

  const tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier)
  const rows = [
    ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
    ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
  ]

  const positionalRules: ChargeRule[] = []
  let staticCharge = 0

  for (const row of rows) {
    const action = row?.action || {}
    if (String(action.type || '') !== 'TActionCardCharge') continue

    const amount = getAttrValueByTier(raw, String(action.attribute_type || 'ChargeAmount'), tier)
    const amountByTier = getAttrValuesByTier(raw, String(action.attribute_type || 'ChargeAmount'))
    const target = action.target || {}
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    const targetSection = String(target.TargetSection || target.targetSection || '')
    const condMeta = extractConditionMeta(target.conditions || target.Conditions)
    const trigger = row?.trigger || {}
    const subject = trigger.Subject || trigger.subject || {}
    const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions || trigger.Conditions || trigger.conditions)
    const triggerExcludeSelf = Boolean(subject.ExcludeSelf)
    const targetExcludeSelf = Boolean(target.ExcludeSelf)
    const triggerSubjectType = String(subject.type || '')
    const triggerSubjectMode = String(subject.TargetMode || subject.targetMode || '')

    const description = String(row.description_cn || row.description_en || '').trim()

    const r: ChargeRule = {
      sourceName: item.name_cn || item.name_en || item.id,
      sourceId: item.id,
      amount,
      amountByTier,
      targetType,
      targetMode,
      targetSection,
      requiredTags: condMeta.include,
      requiredExcludeTags: condMeta.exclude,
      requiredSizes: condMeta.includeSizes,
      requiredExcludeSizes: condMeta.excludeSizes,
      requiredCooldownOnly: condMeta.requireCooldownOnly,
      requiredNotTriggerSource: condMeta.notTriggerSource,
      targetExcludeSelf,
      triggerType: String(trigger.type || ''),
      triggerRequiredTags: triggerMeta.include,
      triggerRequiredExcludeTags: triggerMeta.exclude,
      triggerRequiredSizes: triggerMeta.includeSizes,
      triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
      triggerRequireCooldownOnly: triggerMeta.requireCooldownOnly,
      triggerExcludeSelf,
      triggerSubjectType,
      triggerSubjectMode,
      description,
    }

    if (
      (targetType === 'TTargetCardPositional' &&
        ['Neighbor', 'LeftCard', 'RightCard', 'AllRightCards'].includes(targetMode)) ||
      targetType === 'TTargetCardSelf' ||
      targetType === 'TTargetCardSection' ||
      targetType === 'TTargetCardXMost'
    ) {
      positionalRules.push(r)
    } else {
      staticCharge += amount
    }
  }

  return { positionalRules, staticCharge }
}

function readHasteRules(item: LabItem, tierInput?: string): ChargeRule[] {
  const raw = item.__raw
  if (!raw) return []
  const tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier)
  const rows = [
    ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
    ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
  ]

  const out: ChargeRule[] = []
  for (const row of rows) {
    const action = row?.action || {}
    if (String(action.type || '') !== 'TActionCardHaste') continue
    const amount = getAttrValueByTier(raw, String(action.attribute_type || 'HasteAmount'), tier)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const amountByTier = getAttrValuesByTier(raw, String(action.attribute_type || 'HasteAmount'))
    const target = action.target || {}
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    const targetSection = String(target.TargetSection || target.targetSection || '')
    const condMeta = extractConditionMeta(target.conditions || target.Conditions)
    const trigger = row?.trigger || {}
    const subject = trigger.Subject || trigger.subject || {}
    const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions || trigger.Conditions || trigger.conditions)
    const triggerExcludeSelf = Boolean(subject.ExcludeSelf)
    const targetExcludeSelf = Boolean(target.ExcludeSelf)
    const triggerSubjectType = String(subject.type || '')
    const triggerSubjectMode = String(subject.TargetMode || subject.targetMode || '')
    const description = String(row.description_cn || row.description_en || '').trim()

    out.push({
      sourceName: item.name_cn || item.name_en || item.id,
      sourceId: item.id,
      amount,
      amountByTier,
      targetType,
      targetMode,
      targetSection,
      requiredTags: condMeta.include,
      requiredExcludeTags: condMeta.exclude,
      requiredSizes: condMeta.includeSizes,
      requiredExcludeSizes: condMeta.excludeSizes,
      requiredCooldownOnly: condMeta.requireCooldownOnly,
      requiredNotTriggerSource: condMeta.notTriggerSource,
      targetExcludeSelf,
      triggerType: String(trigger.type || ''),
      triggerRequiredTags: triggerMeta.include,
      triggerRequiredExcludeTags: triggerMeta.exclude,
      triggerRequiredSizes: triggerMeta.includeSizes,
      triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
      triggerRequireCooldownOnly: triggerMeta.requireCooldownOnly,
      triggerExcludeSelf,
      triggerSubjectType,
      triggerSubjectMode,
      description,
    })
  }
  return out
}

function readForceUseRules(item: LabItem, tierInput?: string): ChargeRule[] {
  const raw = item.__raw
  if (!raw) return []
  const _tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier)
  const rows = [
    ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
    ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
  ]
  const out: ChargeRule[] = []
  for (const row of rows) {
    const action = row?.action || {}
    if (String(action.type || '') !== 'TActionCardForceUse') continue
    const target = action.target || {}
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    const targetSection = String(target.TargetSection || target.targetSection || '')
    const condMeta = extractConditionMeta(target.conditions || target.Conditions)
    const trigger = row?.trigger || {}
    const subject = trigger.Subject || trigger.subject || {}
    const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions || trigger.Conditions || trigger.conditions)
    out.push({
      sourceName: item.name_cn || item.name_en || item.id,
      sourceId: item.id,
      amount: 1,
      amountByTier: {},
      targetType,
      targetMode,
      targetSection,
      requiredTags: condMeta.include,
      requiredExcludeTags: condMeta.exclude,
      requiredSizes: condMeta.includeSizes,
      requiredExcludeSizes: condMeta.excludeSizes,
      requiredCooldownOnly: condMeta.requireCooldownOnly,
      requiredNotTriggerSource: condMeta.notTriggerSource,
      targetExcludeSelf: Boolean(target.ExcludeSelf),
      triggerType: String(trigger.type || ''),
      triggerRequiredTags: triggerMeta.include,
      triggerRequiredExcludeTags: triggerMeta.exclude,
      triggerRequiredSizes: triggerMeta.includeSizes,
      triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
      triggerRequireCooldownOnly: triggerMeta.requireCooldownOnly,
      triggerExcludeSelf: Boolean(subject.ExcludeSelf),
      triggerSubjectType: String(subject.type || ''),
      triggerSubjectMode: String(subject.TargetMode || subject.targetMode || ''),
      description: String(row.description_cn || row.description_en || '').trim(),
    })
  }
  return out
}

function readCoreBuffRules(item: LabItem, tierInput?: string): CoreBuffRule[] {
  const raw = item.__raw
  if (!raw) return []
  const _tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier)
  const rows = [
    ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
    ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
  ]
  const out: CoreBuffRule[] = []
  for (const row of rows) {
    const action = row?.action || {}
    if (String(action.type || '') !== 'TActionCardModifyAttribute') continue
    const target = action.target || {}
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    const targetSection = String(target.TargetSection || target.targetSection || '')
    const condMeta = extractConditionMeta(target.conditions || target.Conditions)
    // 只关注“给武器加成”的核心类规则
    const isWeaponBuff =
      condMeta.include.map((x) => normalizeTag(x)).includes('weapon') ||
      /武器|weapon/i.test(String(row.description_cn || row.description_en || ''))
    if (!isWeaponBuff) continue
    const trigger = row?.trigger || {}
    const subject = trigger.Subject || trigger.subject || {}
    const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions || trigger.Conditions || trigger.conditions)
    out.push({
      sourceName: item.name_cn || item.name_en || item.id,
      sourceId: item.id,
      targetType,
      targetMode,
      targetSection,
      requiredTags: condMeta.include,
      requiredExcludeTags: condMeta.exclude,
      requiredSizes: condMeta.includeSizes,
      requiredExcludeSizes: condMeta.excludeSizes,
      requiredCooldownOnly: condMeta.requireCooldownOnly,
      requiredNotTriggerSource: condMeta.notTriggerSource,
      targetExcludeSelf: Boolean(target.ExcludeSelf),
      triggerType: String(trigger.type || ''),
      triggerRequiredTags: triggerMeta.include,
      triggerRequiredExcludeTags: triggerMeta.exclude,
      triggerRequiredSizes: triggerMeta.includeSizes,
      triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
      triggerRequireCooldownOnly: triggerMeta.requireCooldownOnly,
      triggerExcludeSelf: Boolean(subject.ExcludeSelf),
      triggerSubjectType: String(subject.type || ''),
      triggerSubjectMode: String(subject.TargetMode || subject.targetMode || ''),
      description: String(row.description_cn || row.description_en || '').trim(),
    })
  }
  return out
}

function readValueGrowthRules(item: LabItem, tierInput?: string): Array<ChargeRule & { valueAmount: number }> {
  const raw = item.__raw
  if (!raw) return []
  const tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier) as TierToken
  const rows = [
    ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
    ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
  ]
  const out: Array<ChargeRule & { valueAmount: number }> = []
  for (const row of rows) {
    const action = row?.action || {}
    if (String(action.type || '') !== 'TActionCardModifyAttribute') continue
    const valueAmount = Math.abs(resolveActionValue(action?.value, tier))
    if (!Number.isFinite(valueAmount) || valueAmount <= 0) continue
    const target = action.target || {}
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    const targetSection = String(target.TargetSection || target.targetSection || '')
    const condMeta = extractConditionMeta(target.conditions || target.Conditions)
    const trigger = row?.trigger || {}
    const subject = trigger.Subject || trigger.subject || {}
    const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions || trigger.Conditions || trigger.conditions)
    const triggerExcludeSelf = Boolean(subject.ExcludeSelf)
    const targetExcludeSelf = Boolean(target.ExcludeSelf)
    const triggerSubjectType = String(subject.type || '')
    const triggerSubjectMode = String(subject.TargetMode || subject.targetMode || '')
    const description = String(row.description_cn || row.description_en || '').trim()

    out.push({
      sourceName: item.name_cn || item.name_en || item.id,
      sourceId: item.id,
      amount: valueAmount,
      amountByTier: {},
      targetType,
      targetMode,
      targetSection,
      requiredTags: condMeta.include,
      requiredExcludeTags: condMeta.exclude,
      requiredSizes: condMeta.includeSizes,
      requiredExcludeSizes: condMeta.excludeSizes,
      requiredCooldownOnly: condMeta.requireCooldownOnly,
      requiredNotTriggerSource: condMeta.notTriggerSource,
      targetExcludeSelf,
      triggerType: String(trigger.type || ''),
      triggerRequiredTags: triggerMeta.include,
      triggerRequiredExcludeTags: triggerMeta.exclude,
      triggerRequiredSizes: triggerMeta.includeSizes,
      triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
      triggerRequireCooldownOnly: triggerMeta.requireCooldownOnly,
      triggerExcludeSelf,
      triggerSubjectType,
      triggerSubjectMode,
      description,
      valueAmount,
    })
  }
  return out
}

function readOffenseBuffRules(
  item: LabItem,
  tierInput?: string,
): Array<ChargeRule & { valueAmount: number; attributeType: string }> {
  const raw = item.__raw
  if (!raw) return []
  const tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier) as TierToken
  const rows = [
    ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
    ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
  ]
  const out: Array<ChargeRule & { valueAmount: number; attributeType: string }> = []
  for (const row of rows) {
    const action = row?.action || {}
    if (String(action.type || '') !== 'TActionCardModifyAttribute') continue
    const attributeType = String(action.attribute_type || '')
    if (!['DamageAmount', 'BurnAmount', 'PoisonAmount'].includes(attributeType)) continue
    const valueAmount = Math.abs(resolveActionValue(action?.value, tier))
    if (!Number.isFinite(valueAmount) || valueAmount <= 0) continue
    const target = action.target || {}
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    const targetSection = String(target.TargetSection || target.targetSection || '')
    const condMeta = extractConditionMeta(target.conditions || target.Conditions)
    const trigger = row?.trigger || {}
    const subject = trigger.Subject || trigger.subject || {}
    const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions || trigger.Conditions || trigger.conditions)
    out.push({
      sourceName: item.name_cn || item.name_en || item.id,
      sourceId: item.id,
      amount: valueAmount,
      amountByTier: {},
      targetType,
      targetMode,
      targetSection,
      requiredTags: condMeta.include,
      requiredExcludeTags: condMeta.exclude,
      requiredSizes: condMeta.includeSizes,
      requiredExcludeSizes: condMeta.excludeSizes,
      requiredCooldownOnly: condMeta.requireCooldownOnly,
      requiredNotTriggerSource: condMeta.notTriggerSource,
      targetExcludeSelf: Boolean(target.ExcludeSelf),
      triggerType: String(trigger.type || ''),
      triggerRequiredTags: triggerMeta.include,
      triggerRequiredExcludeTags: triggerMeta.exclude,
      triggerRequiredSizes: triggerMeta.includeSizes,
      triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
      triggerRequireCooldownOnly: triggerMeta.requireCooldownOnly,
      triggerExcludeSelf: Boolean(subject.ExcludeSelf),
      triggerSubjectType: String(subject.type || ''),
      triggerSubjectMode: String(subject.TargetMode || subject.targetMode || ''),
      description: String(row.description_cn || row.description_en || '').trim(),
      valueAmount,
      attributeType,
    })
  }
  return out
}

function readDamageOnUse(item: LabItem, tierInput?: string): number {
  const raw = item.__raw
  if (!raw) return 0
  const tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier) as TierToken
  const rows = [
    ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
    ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
  ]
  let sum = 0
  for (const row of rows) {
    const action = row?.action || {}
    if (String(action.type || '') !== 'TActionPlayerDamage') continue
    const triggerType = String(row?.trigger?.type || '')
    if (triggerType && triggerType !== 'TTriggerOnCardFired') continue
    const attrType = String(action.attribute_type || '')
    let value = 0
    if (attrType) value = getAttrValueByTier(raw, attrType, tier)
    else value = resolveActionValue(action?.value, tier)
    if (Number.isFinite(value) && value > 0) sum += value
  }
  return sum
}

function buildCumulativeDamageCurve(
  events: Array<{ time: number; amount: number }>,
  durationSec: number,
): number[] {
  const maxSec = Math.max(1, Math.floor(durationSec))
  const sorted = events
    .filter((e) => Number.isFinite(e.time) && Number.isFinite(e.amount) && e.amount > 0)
    .sort((a, b) => a.time - b.time)
  const curve: number[] = []
  let i = 0
  let acc = 0
  for (let sec = 0; sec <= maxSec; sec += 1) {
    while (i < sorted.length && sorted[i].time <= sec + 1e-6) {
      acc += sorted[i].amount
      i += 1
    }
    curve.push(acc)
  }
  return curve
}

function formatSecondRanges(seconds: number[]): string {
  if (!seconds.length) return ''
  const sorted = Array.from(new Set(seconds.filter((x) => Number.isFinite(x) && x > 0).map((x) => Math.floor(x))))
    .sort((a, b) => a - b)
  if (!sorted.length) return ''
  const chunks: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i]
    if (cur === prev + 1) {
      prev = cur
      continue
    }
    chunks.push(start === prev ? `${start}s` : `${start}-${prev}s`)
    start = cur
    prev = cur
  }
  chunks.push(start === prev ? `${start}s` : `${start}-${prev}s`)
  return chunks.join(' / ')
}

function canTriggerSelfRule(
  cards: PlacedCard[],
  source: PlacedCard,
  rule: ChargeRule,
  auraTags?: Map<string, Set<string>>,
): { ok: boolean; reason?: string } {
  if (!rule.triggerType) return { ok: true }

  const mode = String(rule.triggerSubjectMode || '')
  const left = cards.find((c) => c.start + c.width === source.start)
  const right = cards.find((c) => c.start === source.start + source.width)
  const allLeft = cards.filter((c) => c.start + c.width <= source.start).sort((a, b) => a.start - b.start)
  const allRight = cards.filter((c) => c.start >= source.start + source.width).sort((a, b) => a.start - b.start)

  let positionalPool: PlacedCard[] = []
  if (mode === 'LeftCard') positionalPool = left ? [left] : []
  else if (mode === 'RightCard') positionalPool = right ? [right] : []
  else if (mode === 'Neighbor') positionalPool = [left, right].filter(Boolean) as PlacedCard[]
  else if (mode === 'AllLeftCards') positionalPool = allLeft
  else if (mode === 'AllRightCards') positionalPool = allRight
  else positionalPool = cards

  const filtered = positionalPool.filter((c) => {
    if (rule.triggerExcludeSelf && c.placementId === source.placementId) return false
    const cd = getCardCooldownSec(c)
    const needsCd = rule.triggerRequireCooldownOnly || String(rule.triggerType || '').includes('TTriggerOnItemUsed')
    if (needsCd && cd <= 0) return false
    return matchesCardTags(
      c,
      rule.triggerRequiredTags,
      rule.triggerRequiredExcludeTags,
      rule.triggerRequiredSizes,
      rule.triggerRequiredExcludeSizes,
      auraTags,
    )
  })

  let candidates = filtered
  if (mode === 'LeftMostCard') {
    const sorted = [...filtered].sort((a, b) => a.start - b.start)
    candidates = sorted.length ? [sorted[0]] : []
  } else if (mode === 'RightMostCard') {
    const sorted = [...filtered].sort((a, b) => (a.start + a.width) - (b.start + b.width))
    candidates = sorted.length ? [sorted[sorted.length - 1]] : []
  }

  if (candidates.length > 0) return { ok: true }

  if (mode) return { ok: false, reason: `触发条件未满足（${mode}无有效目标）` }
  if (rule.triggerRequiredTags.length > 0 || rule.triggerRequiredExcludeTags.length > 0) {
    return {
      ok: false,
      reason: `触发条件未满足（需要:${rule.triggerRequiredTags.join('/') || '任意'} 排除:${rule.triggerRequiredExcludeTags.join('/') || '无'}）`,
    }
  }
  return { ok: false, reason: '触发条件未满足' }
}

function buildOccupancy(): boolean[] {
  return Array.from({ length: MAX_UNITS }, () => false)
}

function canReserve(occ: boolean[], start: number, width: number): boolean {
  if (start < 0 || start + width > MAX_UNITS) return false
  for (let i = start; i < start + width; i += 1) {
    if (occ[i]) return false
  }
  return true
}

function reserve(occ: boolean[], start: number, width: number) {
  for (let i = start; i < start + width; i += 1) occ[i] = true
}

function findNearestStart(occ: boolean[], width: number, preferred: number): number | null {
  const candidates: number[] = []
  for (let s = 0; s <= MAX_UNITS - width; s += 1) {
    if (canReserve(occ, s, width)) candidates.push(s)
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    const da = Math.abs(a - preferred)
    const db = Math.abs(b - preferred)
    if (da !== db) return da - db
    return a - b
  })
  return candidates[0]
}

function autoLayout(cardsWithoutMoving: PlacedCard[], moving: PlacedCard, targetStart: number): PlacedCard[] | null {
  const occ = buildOccupancy()
  const placed: PlacedCard[] = []

  const mStart = findNearestStart(occ, moving.width, targetStart)
  if (mStart == null) return null
  reserve(occ, mStart, moving.width)
  placed.push({ ...moving, start: mStart })

  const sorted = [...cardsWithoutMoving].sort((a, b) => a.start - b.start)
  for (const c of sorted) {
    const s = findNearestStart(occ, c.width, c.start)
    if (s == null) return null
    reserve(occ, s, c.width)
    placed.push({ ...c, start: s })
  }

  return placed.sort((a, b) => a.start - b.start)
}

function getLeft(cards: PlacedCard[], card: PlacedCard): PlacedCard | null {
  const leftEdge = card.start
  return cards.find((c) => c.start + c.width === leftEdge) || null
}

function getRight(cards: PlacedCard[], card: PlacedCard): PlacedCard | null {
  const rightEdge = card.start + card.width
  return cards.find((c) => c.start === rightEdge) || null
}

function getAllRight(cards: PlacedCard[], card: PlacedCard): PlacedCard[] {
  const rightEdge = card.start + card.width
  return cards.filter((c) => c.start >= rightEdge).sort((a, b) => a.start - b.start)
}

function pickXMost(pool: PlacedCard[], mode: string): PlacedCard | null {
  if (!pool.length) return null
  if (mode === 'LeftMostCard') {
    const sorted = [...pool].sort((a, b) => a.start - b.start)
    return sorted[0] || null
  }
  const sorted = [...pool].sort((a, b) => (a.start + a.width) - (b.start + b.width))
  return sorted[sorted.length - 1] || null
}

function resolveAuraTargets(
  cards: PlacedCard[],
  source: PlacedCard,
  target: any,
  condMeta: ReturnType<typeof extractConditionMeta>,
  auraTags: Map<string, Set<string>>,
): PlacedCard[] {
  const targetType = String(target?.type || '')
  const targetMode = String(target?.TargetMode || target?.targetMode || '')
  const excludeSelf = Boolean(target?.ExcludeSelf)
  const match = (c: PlacedCard) => {
    if (excludeSelf && c.placementId === source.placementId) return false
    if (condMeta.requireCooldownOnly && getCardCooldownSec(c) <= 0) return false
    return matchesCardTags(c, condMeta.include, condMeta.exclude, condMeta.includeSizes, condMeta.excludeSizes, auraTags)
  }

  if (targetType === 'TTargetCardSelf') return match(source) ? [source] : []
  if (targetType === 'TTargetCardSection') return cards.filter(match)
  if (targetType === 'TTargetCardXMost') {
    const pool = cards.filter(match)
    const chosen = pickXMost(pool, targetMode || 'RightMostCard')
    return chosen ? [chosen] : []
  }

  const left = cards.find((c) => c.start + c.width === source.start) || null
  const right = cards.find((c) => c.start === source.start + source.width) || null
  const allRight = cards.filter((c) => c.start >= source.start + source.width).sort((a, b) => a.start - b.start)
  if (targetMode === 'LeftCard') return left && match(left) ? [left] : []
  if (targetMode === 'RightCard') return right && match(right) ? [right] : []
  if (targetMode === 'Neighbor') return [left, right].filter(Boolean).filter((x) => match(x as PlacedCard)) as PlacedCard[]
  if (targetMode === 'AllRightCards') return allRight.filter(match)
  return cards.filter(match)
}

function compareByOp(left: number, op: string, right: number): boolean {
  const o = String(op || '')
  if (o === 'Equal') return left === right
  if (o === 'NotEqual') return left !== right
  if (o === 'GreaterThan') return left > right
  if (o === 'GreaterThanOrEqual') return left >= right
  if (o === 'LessThan') return left < right
  if (o === 'LessThanOrEqual') return left <= right
  return left >= right
}

function resolvePrerequisiteSubjectCards(
  cards: PlacedCard[],
  source: PlacedCard,
  subject: any,
  auraTags: Map<string, Set<string>>,
): PlacedCard[] {
  const subjectType = String(subject?.type || '')
  const targetMode = String(subject?.TargetMode || subject?.targetMode || '')
  const targetSection = String(subject?.TargetSection || subject?.targetSection || '')
  const includeOrigin = Boolean(subject?.IncludeOrigin ?? false)
  const excludeSelf = Boolean(subject?.ExcludeSelf ?? false)
  const condMeta = extractConditionMeta(subject?.Conditions || subject?.conditions)

  const match = (c: PlacedCard): boolean => {
    if (!includeOrigin && c.placementId === source.placementId) return false
    if (excludeSelf && c.placementId === source.placementId) return false
    if (condMeta.requireCooldownOnly && getCardCooldownSec(c) <= 0) return false
    return matchesCardTags(c, condMeta.include, condMeta.exclude, condMeta.includeSizes, condMeta.excludeSizes, auraTags)
  }

  if (subjectType === 'TTargetCardSection') {
    const pool = targetSection === 'SelfHand' ? cards : cards
    return pool.filter(match)
  }

  if (subjectType === 'TTargetCardPositional') {
    const left = cards.find((c) => c.start + c.width === source.start) || null
    const right = cards.find((c) => c.start === source.start + source.width) || null
    const allLeft = cards.filter((c) => c.start + c.width <= source.start).sort((a, b) => a.start - b.start)
    const allRight = cards.filter((c) => c.start >= source.start + source.width).sort((a, b) => a.start - b.start)
    if (targetMode === 'LeftCard') return left && match(left) ? [left] : []
    if (targetMode === 'RightCard') return right && match(right) ? [right] : []
    if (targetMode === 'Neighbor') return [left, right].filter(Boolean).filter((x) => match(x as PlacedCard)) as PlacedCard[]
    if (targetMode === 'AllLeftCards') return allLeft.filter(match)
    if (targetMode === 'AllRightCards') return allRight.filter(match)
    return cards.filter(match)
  }

  return cards.filter(match)
}

function evaluatePrerequisites(
  prerequisites: any[] | null | undefined,
  cards: PlacedCard[],
  source: PlacedCard,
  auraTags: Map<string, Set<string>>,
): boolean {
  const list = Array.isArray(prerequisites) ? prerequisites : []
  if (!list.length) return true
  for (const p of list) {
    const t = String(p?.type || '')
    if (t === 'TPrerequisiteCardCount') {
      const subjectCards = resolvePrerequisiteSubjectCards(cards, source, p?.Subject || p?.subject || {}, auraTags)
      const count = subjectCards.length
      const cmp = String(p?.Comparison || p?.comparison || 'GreaterThanOrEqual')
      const amount = Number(p?.Amount ?? p?.amount ?? 0)
      if (!compareByOp(count, cmp, Number.isFinite(amount) ? amount : 0)) return false
      continue
    }
  }
  return true
}

function computeAuraTagMap(cards: PlacedCard[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  const ensure = (id: string) => {
    if (!map.has(id)) map.set(id, new Set<string>())
    return map.get(id)!
  }

  const hasDino = cards.some((c) => matchesCardTags(c, ['Dinosaur'], []))
  for (const source of cards) {
    const raw = source.item.__raw
    if (!raw) continue
    const rows = [...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []), ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : [])]
    for (const row of rows) {
      const action = row?.action || {}
      if (String(action.type || '') !== 'TAuraActionCardAddTagsList') continue
      const desc = String(row?.description_cn || row?.description_en || '')
      if ((desc.includes('如果拥有恐龙') || /if you have a dinosaur/i.test(desc)) && !hasDino) continue
      const tagsToAdd = inferTagsFromAuraDescription(desc)
      if (!tagsToAdd.length) continue
      const condMeta = extractConditionMeta(action?.target?.conditions || action?.target?.Conditions)
      const targets = resolveAuraTargets(cards, source, action?.target || {}, condMeta, map)
      for (const t of targets) {
        const set = ensure(t.placementId)
        for (const tag of tagsToAdd) set.add(normalizeTag(tag))
      }
    }
  }
  return map
}

function getCardBaseMulticast(card: PlacedCard): number {
  const raw = card.item.__raw
  if (raw) {
    const v = getAttrValueByTier(raw, 'Multicast', getEffectiveTier(card))
    if (Number.isFinite(v) && v > 0) return Math.max(1, Math.round(v))
  }
  const skills = (card.item as any)?.skills || []
  const parsed = Array.isArray(skills)
    ? skills
        .map((s: any) => String(typeof s === 'string' ? s : (s?.cn || s?.en || '')))
        .map((s: string) => s.match(/multicast[:：]\s*(\d+)/i))
        .find(Boolean)
    : null
  if (parsed?.[1]) return Math.max(1, Number(parsed[1]))
  return 1
}

function computeMulticastMap(cards: PlacedCard[], auraTags: Map<string, Set<string>>): Map<string, number> {
  const out = new Map<string, number>()
  for (const c of cards) out.set(c.placementId, getCardBaseMulticast(c))

  for (const source of cards) {
    const raw = source.item.__raw
    if (!raw) continue
    const rows = [...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []), ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : [])]
    for (const row of rows) {
      const action = row?.action || {}
      if (String(action.type || '') !== 'TAuraActionCardModifyAttribute') continue
      if (String(action.attribute_type || '') !== 'Multicast') continue
      if (!evaluatePrerequisites(row?.prerequisites, cards, source, auraTags)) continue
      const condMeta = extractConditionMeta(action?.target?.conditions || action?.target?.Conditions)
      const targets = resolveAuraTargets(cards, source, action?.target || {}, condMeta, auraTags)
      const bonus = resolveActionValue(action?.value, getEffectiveTier(source))
      if (!Number.isFinite(bonus) || bonus === 0) continue
      for (const t of targets) out.set(t.placementId, (out.get(t.placementId) || 1) + bonus)
    }
  }
  out.forEach((v, k) => {
    out.set(k, Math.max(1, Math.round(v)))
  })

  return out
}

function resolveTriggerCandidates(
  cards: PlacedCard[],
  source: PlacedCard,
  rule: ChargeRule,
  auraTags?: Map<string, Set<string>>,
): PlacedCard[] {
  const triggerType = String(rule.triggerType || '')
  const lowerTrigger = triggerType.toLowerCase()
  const cardActionSet = (c: PlacedCard): Set<string> => {
    const raw = c.item.__raw || {}
    const rows = [
      ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
      ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
    ]
    const set = new Set<string>()
    for (const row of rows) {
      const t = String(row?.action?.type || '')
      if (t) set.add(t)
    }
    return set
  }
  const hasAction = (c: PlacedCard, actionType: string) => cardActionSet(c).has(actionType)

  const hasExplicitFiredSubject =
    Boolean(rule.triggerSubjectMode) ||
    rule.triggerRequiredTags.length > 0 ||
    rule.triggerRequiredExcludeTags.length > 0 ||
    rule.triggerRequiredSizes.length > 0 ||
    rule.triggerRequiredExcludeSizes.length > 0 ||
    rule.triggerRequireCooldownOnly ||
    rule.triggerExcludeSelf ||
    Boolean(rule.triggerSubjectType)

  // 默认 TTriggerOnCardFired 按“自己出手触发”，只有显式 Subject 条件时才按条件匹配
  if (triggerType === 'TTriggerOnCardFired' && !hasExplicitFiredSubject) {
    return [source]
  }

  // 减速/加速触发：只允许由具有对应 action 的卡作为触发源
  // 避免把所有卡都误当成触发源
  const forcePoolByActionType =
    lowerTrigger.includes('slow') ? 'TActionCardSlow' :
    lowerTrigger.includes('haste') ? 'TActionCardHaste' :
    ''

  const isSupportedTrigger =
    !triggerType ||
    triggerType === 'TTriggerOnCardFired' ||
    lowerTrigger.includes('itemused') ||
    lowerTrigger.includes('slow') ||
    lowerTrigger.includes('haste')
  if (!isSupportedTrigger) return []

  if (!rule.triggerType) return [source]
  const mode = String(rule.triggerSubjectMode || '')
  const left = cards.find((c) => c.start + c.width === source.start)
  const right = cards.find((c) => c.start === source.start + source.width)
  const allLeft = cards.filter((c) => c.start + c.width <= source.start).sort((a, b) => a.start - b.start)
  const allRight = cards.filter((c) => c.start >= source.start + source.width).sort((a, b) => a.start - b.start)

  let pool: PlacedCard[] = []
  if (mode === 'LeftCard') pool = left ? [left] : []
  else if (mode === 'RightCard') pool = right ? [right] : []
  else if (mode === 'Neighbor') pool = [left, right].filter(Boolean) as PlacedCard[]
  else if (mode === 'AllLeftCards') pool = allLeft
  else if (mode === 'AllRightCards') pool = allRight
  else if (mode === 'LeftMostCard' || mode === 'RightMostCard') pool = cards
  else pool = cards

  if (forcePoolByActionType) {
    pool = pool.filter((c) => hasAction(c, forcePoolByActionType))
  }

  const filtered = pool.filter((c) => {
    if (rule.triggerExcludeSelf && c.placementId === source.placementId) return false
    const needsCd = rule.triggerRequireCooldownOnly || String(rule.triggerType || '').includes('TTriggerOnItemUsed')
    if (needsCd && getCardCooldownSec(c) <= 0) return false
    return matchesCardTags(
      c,
      rule.triggerRequiredTags,
      rule.triggerRequiredExcludeTags,
      rule.triggerRequiredSizes,
      rule.triggerRequiredExcludeSizes,
      auraTags,
    )
  })

  if (mode === 'LeftMostCard' || mode === 'RightMostCard') {
    const chosen = pickXMost(filtered, mode)
    return chosen ? [chosen] : []
  }
  return filtered
}

function resolveTargetsForTrigger(
  cards: PlacedCard[],
  source: PlacedCard,
  triggerCard: PlacedCard,
  rule: ChargeRule,
  auraTags?: Map<string, Set<string>>,
): PlacedCard[] {
  const matchTarget = (c: PlacedCard): boolean => {
    if (rule.targetExcludeSelf && c.placementId === source.placementId) return false
    if (rule.requiredNotTriggerSource && c.placementId === triggerCard.placementId) return false
    if (rule.requiredCooldownOnly && getCardCooldownSec(c) <= 0) return false
    return matchesCardTags(
      c,
      rule.requiredTags,
      rule.requiredExcludeTags,
      rule.requiredSizes,
      rule.requiredExcludeSizes,
      auraTags,
    )
  }

  if (rule.targetType === 'TTargetCardSelf') return matchTarget(source) ? [source] : []
  if (rule.targetType === 'TTargetCardSection') return cards.filter((c) => getCardCooldownSec(c) > 0).filter(matchTarget)
  if (rule.targetType === 'TTargetCardXMost') {
    const pool = cards.filter((c) => getCardCooldownSec(c) > 0).filter(matchTarget)
    const chosen = pickXMost(pool, rule.targetMode || 'RightMostCard')
    return chosen ? [chosen] : []
  }

  const left = cards.find((c) => c.start + c.width === source.start) || null
  const right = cards.find((c) => c.start === source.start + source.width) || null
  const allRight = cards
    .filter((c) => c.start >= source.start + source.width)
    .sort((a, b) => a.start - b.start)

  if (rule.targetMode === 'LeftCard') return left && getCardCooldownSec(left) > 0 && matchTarget(left) ? [left] : []
  if (rule.targetMode === 'RightCard') return right && getCardCooldownSec(right) > 0 && matchTarget(right) ? [right] : []
  if (rule.targetMode === 'Neighbor') {
    return [left, right].filter(Boolean).filter((x) => getCardCooldownSec(x as PlacedCard) > 0).filter((x) => matchTarget(x as PlacedCard)) as PlacedCard[]
  }
  if (rule.targetMode === 'AllRightCards') {
    return allRight.filter((x) => getCardCooldownSec(x) > 0).filter(matchTarget)
  }
  return []
}

function analyze(cards: PlacedCard[]): Analysis {
  let potential = 0
  let effective = 0
  let staticPotential = 0
  let staticEffective = 0

  const links: LinkHit[] = []
  const broken: BrokenHit[] = []
  const auraTags = computeAuraTagMap(cards)
  const multicastMap = computeMulticastMap(cards, auraTags)

  for (const card of cards) {
    const { positionalRules, staticCharge } = readChargeRules(card.item, getEffectiveTier(card))
    if (staticCharge > 0) {
      staticPotential += staticCharge
      staticEffective += staticCharge
      potential += staticCharge
      effective += staticCharge
    }

    for (const rule of positionalRules) {
      const amount = Number(rule.amount || 0)
      if (amount <= 0) continue
      potential += amount

      const tagInfo = [
        rule.requiredTags.length ? `包含:${rule.requiredTags.join('/')}` : '',
        rule.requiredExcludeTags.length ? `排除:${rule.requiredExcludeTags.join('/')}` : '',
        rule.requiredCooldownOnly ? '仅有冷却物品' : '',
      ].filter(Boolean).join('，') || '不限标签'
      const triggers = resolveTriggerCandidates(cards, card, rule, auraTags)
      if (triggers.length === 0) {
        broken.push({
          from: card.item.name_cn || card.item.name_en || card.item.id,
          amount,
          mode: `Trigger:${rule.triggerSubjectMode || rule.triggerType || 'Unknown'}`,
          reason: '触发源未命中',
        })
        continue
      }

      for (const trig of triggers) {
        const targets = resolveTargetsForTrigger(cards, card, trig, rule, auraTags)
        const casts = Math.max(1, Number(multicastMap.get(trig.placementId) || 1))
        const appliedAmount = amount * casts
        if (targets.length === 0) {
          broken.push({
            from: card.item.name_cn || card.item.name_en || card.item.id,
            amount: appliedAmount,
            mode: `${rule.targetType}:${rule.targetMode || 'Any'}`,
            reason: `触发源 ${trig.item.name_cn || trig.item.name_en || trig.item.id} 已命中，但无可用目标（${tagInfo}）`,
          })
          continue
        }
        for (const t of targets) {
          effective += appliedAmount
          links.push({
            fromId: card.placementId,
            from: card.item.name_cn || card.item.name_en || card.item.id,
            toId: t.placementId,
            to: t.item.name_cn || t.item.name_en || t.item.id,
            amount: appliedAmount,
            mode: `${rule.targetType}:${rule.targetMode || 'Any'}`,
            matchedBy: `${tagInfo}${casts > 1 ? `，多重释放x${casts}` : ''}`,
            triggeredById: trig.placementId,
            triggeredBy: trig.item.name_cn || trig.item.name_en || trig.item.id,
          })
        }
      }
    }
  }

  return {
    potential,
    effective,
    efficiency: potential > 0 ? (effective / potential) * 100 : 100,
    links,
    broken,
    staticPotential,
    staticEffective,
  }
}

function analyzeCycles(cards: PlacedCard[], links: LinkHit[]): CycleHit[] {
  if (!cards.length || !links.length) return []

  const byId = new Map(cards.map((c) => [c.placementId, c]))
  const edge = new Map<string, number>()
  for (const l of links) {
    const fromEffective = l.triggeredById || l.fromId
    if (!fromEffective || !l.toId) continue
    const key = `${fromEffective}->${l.toId}`
    edge.set(key, (edge.get(key) || 0) + Number(l.amount || 0))
  }

  const out: CycleHit[] = []
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const a = cards[i]
      const b = cards[j]
      const aToB = edge.get(`${a.placementId}->${b.placementId}`) || 0
      const bToA = edge.get(`${b.placementId}->${a.placementId}`) || 0
      if (aToB <= 0 || bToA <= 0) continue

      const aCd = getCardCooldownSec(a)
      const bCd = getCardCooldownSec(b)
      const gapA = bToA - aCd
      const gapB = aToB - bCd
      const ok = aCd > 0 && bCd > 0 && gapA >= 0 && gapB >= 0

      out.push({
        aId: a.placementId,
        aName: a.item.name_cn || a.item.name_en || a.item.id,
        aCd,
        bId: b.placementId,
        bName: b.item.name_cn || b.item.name_en || b.item.id,
        bCd,
        aToB,
        bToA,
        ok,
        gapA,
        gapB,
      })
    }
  }

  out.sort((x, y) => {
    if (x.ok !== y.ok) return x.ok ? -1 : 1
    const sx = Math.min(x.gapA, x.gapB)
    const sy = Math.min(y.gapA, y.gapB)
    return sy - sx
  })
  return out
}

function computeNetworkMetrics(cards: PlacedCard[], analysis: Analysis): NetworkMetrics {
  const active = cards.filter((c) => getCardCooldownSec(c) > 0)
  if (active.length === 0) {
    return {
      activeCards: 0,
      sustainableCards: 0,
      sustainRatio: 1,
      pairCycles: 0,
      score: Math.max(0, Math.min(100, analysis.efficiency)),
    }
  }

  const incoming = new Map<string, number>()
  const edge = new Map<string, number>()
  for (const l of analysis.links) {
    const from = l.triggeredById || l.fromId
    if (!from || !l.toId) continue
    incoming.set(l.toId, (incoming.get(l.toId) || 0) + Number(l.amount || 0))
    const key = `${from}->${l.toId}`
    edge.set(key, (edge.get(key) || 0) + Number(l.amount || 0))
  }

  let sustainableCards = 0
  for (const c of active) {
    const inc = incoming.get(c.placementId) || 0
    const cd = getCardCooldownSec(c)
    if (inc >= cd) sustainableCards += 1
  }
  const sustainRatio = sustainableCards / active.length

  let pairCycles = 0
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i]
      const b = active[j]
      const ab = edge.get(`${a.placementId}->${b.placementId}`) || 0
      const ba = edge.get(`${b.placementId}->${a.placementId}`) || 0
      if (ab > 0 && ba > 0) pairCycles += 1
    }
  }

  const efficiencyPart = Math.max(0, Math.min(100, analysis.efficiency)) * 0.55
  const sustainPart = sustainRatio * 35
  const cyclePart = Math.min(10, pairCycles * 2)
  const score = Math.max(0, Math.min(100, efficiencyPart + sustainPart + cyclePart))

  return {
    activeCards: active.length,
    sustainableCards,
    sustainRatio,
    pairCycles,
    score,
  }
}

function compactOrderLayout(order: PlacedCard[]): PlacedCard[] | null {
  const out: PlacedCard[] = []
  let cursor = 0
  for (const c of order) {
    if (cursor + c.width > MAX_UNITS) return null
    out.push({ ...c, start: cursor })
    cursor += c.width
  }
  return out
}

function layoutSignature(cards: PlacedCard[]): string {
  return cards
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((c) => `${c.item.id}@${c.start}:${c.width}`)
    .join('|')
}

function computeValueSynergy(cards: PlacedCard[]): number {
  if (!cards.length) return 0
  const auraTags = computeAuraTagMap(cards)
  const multicastMap = computeMulticastMap(cards, auraTags)
  let score = 0

  for (const source of cards) {
    const buffRules = readCoreBuffRules(source.item, getEffectiveTier(source))
    for (const rule of buffRules) {
      const fake = rule as any as ChargeRule
      const triggers = resolveTriggerCandidates(cards, source, fake, auraTags)
      if (!triggers.length) continue
      for (const trig of triggers) {
        const targets = resolveTargetsForTrigger(cards, source, trig, fake, auraTags)
        if (!targets.length) continue
        const casts = Math.max(1, Number(multicastMap.get(trig.placementId) || 1))
        for (const t of targets) {
          const isWeapon = matchesCardTags(t, ['Weapon'], [])
          const base = isWeapon ? 1.4 : 0.8
          score += base * casts
        }
      }
    }

    // 额外统计可量化的 ModifyAttribute 数值输出（用于区分武装核心/原始核心/装甲核心/引燃核心这类）
    const valueRules = readValueGrowthRules(source.item, getEffectiveTier(source))
    for (const rule of valueRules) {
      const triggers = resolveTriggerCandidates(cards, source, rule, auraTags)
      if (!triggers.length) continue
      for (const trig of triggers) {
        const targets = resolveTargetsForTrigger(cards, source, trig, rule, auraTags)
        if (!targets.length) continue
        const casts = Math.max(1, Number(multicastMap.get(trig.placementId) || 1))
        const v = Number(rule.valueAmount || 0)
        if (v <= 0) continue
        score += Math.min(6, v / 30) * targets.length * casts
      }
    }
  }

  return score
}

function simulateCombatStats(cards: PlacedCard[], durationSec = 20): CombatSummary {
  const epsilon = 1e-6
  const activeCards = cards.filter((c) => getCardCooldownSec(c) > 0)
  if (!activeCards.length) {
    return { durationSec, totalUses: 0, byCard: {}, totalDamage: 0, byCardDamage: {}, cumulativeDamageBySecond: buildCumulativeDamageCurve([], durationSec) }
  }

  const auraTags = computeAuraTagMap(cards)
  const multicastMap = computeMulticastMap(cards, auraTags)
  const chargeRulesBySource = new Map<string, ChargeRule[]>()
  const hasteRulesBySource = new Map<string, ChargeRule[]>()
  const forceUseRulesBySource = new Map<string, ChargeRule[]>()
  const offenseRulesBySource = new Map<string, Array<ChargeRule & { valueAmount: number; attributeType: string }>>()
  const baseDamageByCard = new Map<string, number>()
  for (const c of cards) {
    chargeRulesBySource.set(c.placementId, readChargeRules(c.item, getEffectiveTier(c)).positionalRules)
    hasteRulesBySource.set(c.placementId, readHasteRules(c.item, getEffectiveTier(c)))
    forceUseRulesBySource.set(c.placementId, readForceUseRules(c.item, getEffectiveTier(c)))
    offenseRulesBySource.set(c.placementId, readOffenseBuffRules(c.item, getEffectiveTier(c)))
    baseDamageByCard.set(c.placementId, readDamageOnUse(c.item, getEffectiveTier(c)))
  }

  const state = new Map<string, { remaining: number; speedUntil: number }>()
  for (const c of activeCards) state.set(c.placementId, { remaining: getCardCooldownSec(c), speedUntil: 0 })
  const uses = new Map<string, number>()
  const byCardDamage = new Map<string, number>()
  const bonusDamage = new Map<string, number>()
  let totalDamage = 0
  const damageEvents: Array<{ time: number; amount: number }> = []
  for (const c of activeCards) uses.set(c.placementId, 0)
  for (const c of activeCards) {
    byCardDamage.set(c.placementId, 0)
    bonusDamage.set(c.placementId, 0)
  }

  const resolveEventTriggerMatch = (source: PlacedCard, rule: ChargeRule, fired: PlacedCard): boolean => {
    if (
      String(rule.triggerType || '') === 'TTriggerOnCardFired' &&
      !rule.triggerSubjectMode &&
      !rule.triggerRequiredTags.length &&
      !rule.triggerRequiredExcludeTags.length &&
      !rule.triggerRequiredSizes.length &&
      !rule.triggerRequiredExcludeSizes.length
    ) return source.placementId === fired.placementId
    const cands = resolveTriggerCandidates(cards, source, rule, auraTags)
    return cands.some((x) => x.placementId === fired.placementId)
  }

  let now = 0
  let guard = 0
  while (now < durationSec && guard < 1600) {
    guard += 1
    let dt = Infinity
    for (const c of activeCards) {
      const st = state.get(c.placementId)
      if (!st) continue
      const speed = now < st.speedUntil ? 2 : 1
      dt = Math.min(dt, st.remaining / speed)
    }
    if (!Number.isFinite(dt) || dt === Infinity) break
    if (dt < epsilon) dt = 0
    if (now + dt > durationSec) break

    if (dt > 0) {
      for (const c of activeCards) {
        const st = state.get(c.placementId)
        if (!st) continue
        const speed = now < st.speedUntil ? 2 : 1
        st.remaining = Math.max(0, st.remaining - dt * speed)
      }
      now += dt
    }

    const firedNow = activeCards.filter((c) => (state.get(c.placementId)?.remaining ?? Number.POSITIVE_INFINITY) <= epsilon)
    if (!firedNow.length) break

    type UseEvent = { card: PlacedCard; forced: boolean }
    const queue: UseEvent[] = [...firedNow].sort((a, b) => a.start - b.start).map((c) => ({ card: c, forced: false }))
    const queuedNormal = new Set(queue.map((x) => x.card.placementId))
    let qGuard = 0
    while (queue.length > 0 && qGuard < 260) {
      qGuard += 1
      const evt = queue.shift()!
      const fired = evt.card
      if (!evt.forced) queuedNormal.delete(fired.placementId)
      const fs = state.get(fired.placementId)
      if (!fs) continue
      const casts = Math.max(1, Number(multicastMap.get(fired.placementId) || 1))
      if (!evt.forced) {
        fs.remaining += getCardCooldownSec(fired)
        if (fs.remaining <= epsilon && !queuedNormal.has(fired.placementId)) {
          queue.push({ card: fired, forced: false })
          queuedNormal.add(fired.placementId)
        }
      }
      uses.set(fired.placementId, (uses.get(fired.placementId) || 0) + casts)

      const perCastDamage = Math.max(0, (baseDamageByCard.get(fired.placementId) || 0) + (bonusDamage.get(fired.placementId) || 0))
      const dealt = perCastDamage * casts
      if (dealt > 0) {
        totalDamage += dealt
        damageEvents.push({ time: now, amount: dealt })
        byCardDamage.set(fired.placementId, (byCardDamage.get(fired.placementId) || 0) + dealt)
      }

      for (const source of cards) {
        const chargeRules = chargeRulesBySource.get(source.placementId) || []
        for (const rule of chargeRules) {
          if (!resolveEventTriggerMatch(source, rule, fired)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags)
          const amount = Number(rule.amount || 0) * casts
          if (amount <= 0) continue
          for (const t of targets) {
            const ts = state.get(t.placementId)
            if (!ts) continue
            ts.remaining -= amount
            if (ts.remaining <= epsilon && !queuedNormal.has(t.placementId)) {
              queue.push({ card: t, forced: false })
              queuedNormal.add(t.placementId)
            }
          }
        }

        const hasteRules = hasteRulesBySource.get(source.placementId) || []
        for (const rule of hasteRules) {
          if (!resolveEventTriggerMatch(source, rule, fired)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags)
          const hasteSec = Number(rule.amount || 0) * casts
          if (hasteSec <= 0) continue
          for (const t of targets) {
            const ts = state.get(t.placementId)
            if (!ts) continue
            ts.speedUntil = Math.max(ts.speedUntil, now + hasteSec)
          }
        }

        const forceRules = forceUseRulesBySource.get(source.placementId) || []
        for (const rule of forceRules) {
          if (!resolveEventTriggerMatch(source, rule, fired)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags)
          for (let c = 0; c < casts; c += 1) {
            for (const t of targets) queue.push({ card: t, forced: true })
          }
        }

        const offenseRules = offenseRulesBySource.get(source.placementId) || []
        for (const rule of offenseRules) {
          if (rule.attributeType !== 'DamageAmount') continue
          if (!resolveEventTriggerMatch(source, rule, fired)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags)
          const inc = Math.max(0, Number(rule.valueAmount || 0)) * casts
          if (inc <= 0) continue
          for (const t of targets) {
            if (!bonusDamage.has(t.placementId)) continue
            bonusDamage.set(t.placementId, (bonusDamage.get(t.placementId) || 0) + inc)
          }
        }

      }
    }
  }

  const byCard: Record<string, number> = {}
  const byCardDamageObj: Record<string, number> = {}
  let totalUses = 0
  uses.forEach((v, k) => {
    byCard[k] = v
    totalUses += v
  })
  byCardDamage.forEach((v, k) => {
    byCardDamageObj[k] = v
  })
  return {
    durationSec,
    totalUses,
    byCard,
    totalDamage,
    byCardDamage: byCardDamageObj,
    cumulativeDamageBySecond: buildCumulativeDamageCurve(damageEvents, durationSec),
  }
}

function simulateUseCounts(cards: PlacedCard[], durationSec = 20): UseCountSummary {
  const combat = simulateCombatStats(cards, durationSec)
  return { durationSec: combat.durationSec, totalUses: combat.totalUses, byCard: combat.byCard }
}

function scoreLayout(cards: PlacedCard[], windowSec = 20): {
  analysis: Analysis
  metrics: NetworkMetrics
  valueSynergy: number
  usage: UseCountSummary
  combat: CombatSummary
  score: number
} {
  const analysis = analyze(cards)
  const metrics = computeNetworkMetrics(cards, analysis)
  const valueSynergy = computeValueSynergy(cards)
  const combat = simulateCombatStats(cards, windowSec)
  const usage: UseCountSummary = { durationSec: combat.durationSec, totalUses: combat.totalUses, byCard: combat.byCard }
  // 方案优先级改为“总伤害优先”
  const score = combat.totalDamage
  return { analysis, metrics, valueSynergy, usage, combat, score }
}

function suggestTop(cards: PlacedCard[], limit = 5, windowSec = 20): SuggestionCandidate[] {
  if (cards.length <= 1) return []

  const base = scoreLayout(cards, windowSec)
  const candidateMap = new Map<string, { next: PlacedCard[]; score: number; analysis: Analysis; metrics: NetworkMetrics; usage: UseCountSummary; combat: CombatSummary }>()
  const orderBase = cards.slice().sort((a, b) => a.start - b.start)

  const tryAdd = (order: PlacedCard[]) => {
    const compact = compactOrderLayout(order)
    if (!compact || compact.length !== cards.length) return
    const sig = layoutSignature(compact)
    const scored = scoreLayout(compact, windowSec)
    const prev = candidateMap.get(sig)
    if (!prev || scored.score > prev.score) {
      candidateMap.set(sig, { next: compact, score: scored.score, analysis: scored.analysis, metrics: scored.metrics, usage: scored.usage, combat: scored.combat })
    }
  }

  for (let start = 0; start < orderBase.length; start += 1) {
    const remain = orderBase.filter((_, i) => i !== start)
    const seq: PlacedCard[] = [orderBase[start]]
    while (remain.length > 0) {
      const cur = seq[seq.length - 1]
      let bestIdx = 0
      let bestPair = -Infinity
      for (let i = 0; i < remain.length; i += 1) {
        const cand = remain[i]
        const rc = readChargeRules(cur.item, getEffectiveTier(cur)).positionalRules
        const lc = readChargeRules(cand.item, getEffectiveTier(cand)).positionalRules
        const curRight = rc.filter((x) => x.targetMode === 'RightCard' || x.targetMode === 'Neighbor').reduce((n, x) => n + x.amount, 0)
        const candLeft = lc.filter((x) => x.targetMode === 'LeftCard' || x.targetMode === 'Neighbor').reduce((n, x) => n + x.amount, 0)
        const pair = curRight + candLeft
        if (pair > bestPair) {
          bestPair = pair
          bestIdx = i
        }
      }
      seq.push(remain.splice(bestIdx, 1)[0])
    }
    tryAdd(seq)
  }

  for (let i = 0; i < orderBase.length - 1; i += 1) {
    const copy = orderBase.slice()
    const t = copy[i]
    copy[i] = copy[i + 1]
    copy[i + 1] = t
    tryAdd(copy)
  }

  const byCdAsc = orderBase.slice().sort((a, b) => getCardCooldownSec(a) - getCardCooldownSec(b) || a.start - b.start)
  const byCdDesc = orderBase.slice().sort((a, b) => getCardCooldownSec(b) - getCardCooldownSec(a) || a.start - b.start)
  const byWidth = orderBase.slice().sort((a, b) => a.width - b.width || a.start - b.start)
  tryAdd(byCdAsc)
  tryAdd(byCdDesc)
  tryAdd(byWidth)

  const seedBase = orderBase.reduce((s, c) => s + c.item.id.charCodeAt(0), 17)
  const rand = (n: number) => {
    const x = Math.sin(seedBase * 13.37 + n * 17.11) * 10000
    return x - Math.floor(x)
  }
  for (let r = 0; r < 36; r += 1) {
    const copy = orderBase.slice()
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand(r * 101 + i * 13) * (i + 1))
      const t = copy[i]
      copy[i] = copy[j]
      copy[j] = t
    }
    tryAdd(copy)
  }

  const baseSig = layoutSignature(orderBase)
  const allCandidates = Array.from(candidateMap.entries())
    .filter(([sig]) => sig !== baseSig)
    .map(([sig, data]) => {
      const damageGain = data.combat.totalDamage - base.combat.totalDamage
      return {
        id: sig,
        damageGain,
        next: data.next,
        totalUses: data.usage.totalUses,
        totalDamage: data.combat.totalDamage,
        curve: data.combat.cumulativeDamageBySecond,
      }
    })
    .sort((a, b) => b.totalDamage - a.totalDamage || b.totalUses - a.totalUses)

  if (!allCandidates.length) return []

  // Multi-horizon selection:
  // pick winners at different seconds first, then fill by overall damage.
  const selected: Array<(typeof allCandidates)[number]> = []
  const selectedIds = new Set<string>()
  const championSecMap = new Map<string, number[]>()
  const maxSec = Math.max(1, Math.floor(windowSec))
  const checkpoints: number[] = []
  for (let s = 1; s <= maxSec; s += 1) checkpoints.push(s)

  for (const sec of checkpoints) {
    let best: (typeof allCandidates)[number] | null = null
    let bestDamage = -Infinity
    for (const c of allCandidates) {
      const d = c.curve[sec] ?? c.curve[c.curve.length - 1] ?? 0
      if (d > bestDamage) {
        bestDamage = d
        best = c
      }
    }
    if (best && !selectedIds.has(best.id)) {
      selected.push(best)
      selectedIds.add(best.id)
    }
    if (best) {
      const list = championSecMap.get(best.id) || []
      list.push(sec)
      championSecMap.set(best.id, list)
    }
    if (selected.length >= limit && sec >= maxSec) break
  }

  if (selected.length < limit) {
    for (const c of allCandidates) {
      if (selectedIds.has(c.id)) continue
      selected.push(c)
      selectedIds.add(c.id)
      if (selected.length >= limit) break
    }
  }

  return selected.slice(0, limit).map((x, idx) => ({
    ...x,
    rank: idx + 1,
    championSeconds: championSecMap.get(x.id) || [],
  }))
}

function simulateCoreTimeline(cards: PlacedCard[]): CoreTimelineSummary {
  const durationSec = 30
  const epsilon = 1e-6
  const activeCards = cards.filter((c) => getCardCooldownSec(c) > 0)
  if (activeCards.length === 0) {
    return {
      durationSec,
      eventCount: 0,
      coreName: '武装核心',
      coreFireTimes: [],
      segments: [],
      rows: [],
      points: [],
      maxTime: 0,
    }
  }

  const auraTags = computeAuraTagMap(cards)
  const multicastMap = computeMulticastMap(cards, auraTags)
  const chargeRulesBySource = new Map<string, ChargeRule[]>()
  const hasteRulesBySource = new Map<string, ChargeRule[]>()
  const coreBuffRulesBySource = new Map<string, CoreBuffRule[]>()
  for (const c of cards) {
    chargeRulesBySource.set(c.placementId, readChargeRules(c.item, getEffectiveTier(c)).positionalRules)
    hasteRulesBySource.set(c.placementId, readHasteRules(c.item, getEffectiveTier(c)))
    coreBuffRulesBySource.set(c.placementId, readCoreBuffRules(c.item, getEffectiveTier(c)))
  }

  const state = new Map<string, { remaining: number; speedUntil: number; fires: number }>()
  for (const c of activeCards) {
    state.set(c.placementId, { remaining: getCardCooldownSec(c), speedUntil: 0, fires: 0 })
  }

  const weaponRows = new Map<string, { placementId: string; name: string }>()
  for (const c of activeCards) {
    if (!matchesCardTags(c, ['Weapon'], [])) continue
    weaponRows.set(c.placementId, {
      placementId: c.placementId,
      name: c.item.name_cn || c.item.name_en || c.item.id,
    })
  }

  const isCoreCard = (c: PlacedCard): boolean => {
    const cn = String(c.item.name_cn || '')
    const en = String(c.item.name_en || '').toLowerCase()
    return cn.includes('武装核心') || en.includes('weaponized core')
  }

  const explicitCore = cards.find(isCoreCard) || null
  const fallbackCore = activeCards.find((c) => matchesCardTags(c, ['Core'], [])) || null
  const coreCard = explicitCore || fallbackCore

  const coreName = coreCard ? (coreCard.item.name_cn || coreCard.item.name_en || coreCard.item.id) : '武装核心'

  const weaponEvents = new Map<string, Array<{ time: number; stacks: number }>>()
  const timelinePoints: TimelinePoint[] = []
  const coreStacks = new Map<string, number>()
  const coreFireTimes: number[] = []
  let now = 0
  let eventCount = 0
  let shouldStopAtCore3 = false

  const resolveEventTriggerMatch = (source: PlacedCard, rule: ChargeRule, fired: PlacedCard): boolean => {
    if (
      String(rule.triggerType || '') === 'TTriggerOnCardFired' &&
      !rule.triggerSubjectMode &&
      !rule.triggerRequiredTags.length &&
      !rule.triggerRequiredExcludeTags.length &&
      !rule.triggerRequiredSizes.length &&
      !rule.triggerRequiredExcludeSizes.length
    ) {
      return source.placementId === fired.placementId
    }
    const cands = resolveTriggerCandidates(cards, source, rule, auraTags)
    return cands.some((x) => x.placementId === fired.placementId)
  }

  while (now < durationSec && eventCount < 1200) {
    let dt = Infinity
    for (const c of activeCards) {
      const st = state.get(c.placementId)
      if (!st) continue
      const speed = now < st.speedUntil ? 2 : 1
      const t = st.remaining / speed
      if (t < dt) dt = t
    }
    if (!Number.isFinite(dt) || dt === Infinity) break
    if (dt < epsilon) dt = 0
    if (now + dt > durationSec) break

    if (dt > 0) {
      for (const c of activeCards) {
        const st = state.get(c.placementId)
        if (!st) continue
        const speed = now < st.speedUntil ? 2 : 1
        st.remaining = Math.max(0, st.remaining - dt * speed)
      }
      now += dt
    }

    const firedNow = activeCards.filter((c) => {
      const st = state.get(c.placementId)
      return st && st.remaining <= epsilon
    })
    if (firedNow.length === 0) break

    const queue: PlacedCard[] = [...firedNow].sort((a, b) => a.start - b.start)
    const queued = new Set(queue.map((x) => x.placementId))
    let guard = 0
    while (queue.length > 0 && guard < 200) {
      guard += 1
      const fired = queue.shift()!
      queued.delete(fired.placementId)
      const firedState = state.get(fired.placementId)
      if (!firedState) continue
      eventCount += 1
      firedState.fires += 1
      firedState.remaining += getCardCooldownSec(fired)
      if (firedState.remaining <= epsilon && !queued.has(fired.placementId)) {
        queue.push(fired)
        queued.add(fired.placementId)
      }

      const isCoreFire = coreCard ? fired.placementId === coreCard.placementId : false
      if (isCoreFire) {
        coreFireTimes.push(now)
        timelinePoints.push({
          placementId: fired.placementId,
          name: coreName,
          kind: 'core',
          time: now,
          useIndex: firedState.fires,
        })
        if (coreFireTimes.length >= 3) shouldStopAtCore3 = true
      }

      const weaponStat = weaponRows.get(fired.placementId)
      if (weaponStat) {
        const stacks = coreStacks.get(fired.placementId) || 0
        if (!weaponEvents.has(fired.placementId)) weaponEvents.set(fired.placementId, [])
        weaponEvents.get(fired.placementId)!.push({ time: now, stacks })
        timelinePoints.push({
          placementId: fired.placementId,
          name: weaponStat.name,
          kind: 'weapon',
          time: now,
          useIndex: firedState.fires,
        })
      }

      for (const source of cards) {
        const casts = Math.max(1, Number(multicastMap.get(fired.placementId) || 1))

        const coreRules = coreBuffRulesBySource.get(source.placementId) || []
        for (const rule of coreRules) {
          const fake = rule as any as ChargeRule
          if (!resolveEventTriggerMatch(source, fake, fired)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, fake, auraTags)
          for (const t of targets) {
            coreStacks.set(t.placementId, (coreStacks.get(t.placementId) || 0) + casts)
          }
        }

        const chargeRules = chargeRulesBySource.get(source.placementId) || []
        for (const rule of chargeRules) {
          if (!resolveEventTriggerMatch(source, rule, fired)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags)
          const amount = Number(rule.amount || 0) * casts
          if (amount <= 0) continue
          for (const t of targets) {
            const ts = state.get(t.placementId)
            if (!ts) continue
            ts.remaining -= amount
            if (ts.remaining <= epsilon && !queued.has(t.placementId)) {
              queue.push(t)
              queued.add(t.placementId)
            }
          }
        }

        const hasteRules = hasteRulesBySource.get(source.placementId) || []
        for (const rule of hasteRules) {
          if (!resolveEventTriggerMatch(source, rule, fired)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags)
          const hasteSec = Number(rule.amount || 0) * casts
          if (hasteSec <= 0) continue
          for (const t of targets) {
            const ts = state.get(t.placementId)
            if (!ts) continue
            ts.speedUntil = Math.max(ts.speedUntil, now + hasteSec)
          }
        }
      }
    }

    if (shouldStopAtCore3) break
  }

  const maxObserved = timelinePoints.reduce((m, p) => Math.max(m, p.time), 0)
  const maxTime = coreFireTimes[2] ?? Math.max(maxObserved, coreFireTimes[coreFireTimes.length - 1] ?? 0)

  const segments: TimelineSegment[] = []
  if (coreFireTimes.length >= 1) {
    const c1 = coreFireTimes[0]
    segments.push({ id: 's0', label: '0s → 核心第1次', start: 0, end: c1 })
    if (coreFireTimes.length >= 2) {
      const c2 = coreFireTimes[1]
      segments.push({ id: 's1', label: '核心第1次 → 第2次', start: c1, end: c2 })
      if (coreFireTimes.length >= 3) {
        const c3 = coreFireTimes[2]
        segments.push({ id: 's2', label: '核心第2次 → 第3次', start: c2, end: c3 })
      } else {
        segments.push({ id: 's2', label: '核心第2次 → 当前', start: c2, end: maxTime })
      }
    } else {
      segments.push({ id: 's1', label: '核心第1次 → 当前', start: c1, end: maxTime })
      segments.push({ id: 's2', label: '核心第2次 → 第3次', start: maxTime, end: maxTime })
    }
  }

  const rows: SimWeaponRow[] = Array.from(weaponRows.values())
    .map((w) => {
      const events = weaponEvents.get(w.placementId) || []
      const segStats = segments.map((seg, idx) => {
        const inSeg = events.filter((e) => {
          if (seg.end <= seg.start + epsilon) return false
          if (idx === segments.length - 1) return e.time >= seg.start - epsilon && e.time <= seg.end + epsilon
          return e.time >= seg.start - epsilon && e.time < seg.end - epsilon
        })
        const fires = inSeg.length
        const buffedFires = inSeg.filter((e) => e.stacks > 0).length
        const avgCoreStacks = fires > 0 ? inSeg.reduce((s, e) => s + e.stacks, 0) / fires : 0
        return { fires, buffedFires, avgCoreStacks }
      })
      const totalFires = events.length
      const totalBuffed = events.filter((e) => e.stacks > 0).length
      return {
        placementId: w.placementId,
        name: w.name,
        totalFires,
        totalBuffed,
        segments: segStats,
      }
    })
    .filter((r) => r.totalFires > 0)
    .sort((a, b) => b.totalBuffed - a.totalBuffed || b.totalFires - a.totalFires)

  return {
    durationSec,
    eventCount,
    coreName,
    coreFireTimes,
    segments,
    rows,
    points: timelinePoints,
    maxTime,
  }
}

function simulateCoreContributions(
  cards: PlacedCard[],
  layoutId: string,
  layoutName: string,
  rankScore: number,
  maxUses: number,
): LayoutCoreContribution {
  const durationSec = 30
  const epsilon = 1e-6
  const activeCards = cards.filter((c) => getCardCooldownSec(c) > 0)
  const coreCards = cards.filter((c) => matchesCardTags(c, ['Core'], []))
  const targetUses = Math.max(1, Math.min(20, Math.floor(maxUses || 3)))
  if (activeCards.length === 0 || coreCards.length === 0) {
    return { layoutId, layoutName, rankScore, cores: [] }
  }

  const auraTags = computeAuraTagMap(cards)
  const multicastMap = computeMulticastMap(cards, auraTags)

  const chargeRulesBySource = new Map<string, ChargeRule[]>()
  const forceUseRulesBySource = new Map<string, ChargeRule[]>()
  const valueRulesBySource = new Map<string, Array<ChargeRule & { valueAmount: number }>>()
  for (const c of cards) {
    chargeRulesBySource.set(c.placementId, readChargeRules(c.item, getEffectiveTier(c)).positionalRules)
    forceUseRulesBySource.set(c.placementId, readForceUseRules(c.item, getEffectiveTier(c)))
    valueRulesBySource.set(c.placementId, readValueGrowthRules(c.item, getEffectiveTier(c)))
  }

  const state = new Map<string, { remaining: number; speedUntil: number; fires: number }>()
  for (const c of activeCards) {
    state.set(c.placementId, { remaining: getCardCooldownSec(c), speedUntil: 0, fires: 0 })
  }

  type CoreRuntime = {
    info: CoreContribution
    fireTimes: number[]
    currentStep: number
    stepReceived: number[]
    stepOutputCharge: number[]
    stepOutputValue: number[]
  }
  const coreRuntime = new Map<string, CoreRuntime>()
  for (const core of coreCards) {
    coreRuntime.set(core.placementId, {
      info: {
        placementId: core.placementId,
        name: core.item.name_cn || core.item.name_en || core.item.id,
        rpm: 0,
        avgInterval: 0,
        totalReceived: 0,
        totalOutputCharge: 0,
        totalOutputValue: 0,
        compositeScore: 0,
        steps: Array.from({ length: targetUses }, (_, i) => ({
          useIndex: i + 1,
          atSec: null,
          receivedCharge: 0,
          outputCharge: 0,
          outputValue: 0,
        })),
      },
      fireTimes: [],
      currentStep: 0,
      stepReceived: Array.from({ length: targetUses }, () => 0),
      stepOutputCharge: Array.from({ length: targetUses }, () => 0),
      stepOutputValue: Array.from({ length: targetUses }, () => 0),
    })
  }

  const resolveEventTriggerMatch = (source: PlacedCard, rule: ChargeRule, fired: PlacedCard): boolean => {
    if (
      String(rule.triggerType || '') === 'TTriggerOnCardFired' &&
      !rule.triggerSubjectMode &&
      !rule.triggerRequiredTags.length &&
      !rule.triggerRequiredExcludeTags.length &&
      !rule.triggerRequiredSizes.length &&
      !rule.triggerRequiredExcludeSizes.length
    ) {
      return source.placementId === fired.placementId
    }
    const cands = resolveTriggerCandidates(cards, source, rule, auraTags)
    return cands.some((x) => x.placementId === fired.placementId)
  }

  const allReachedN = () => Array.from(coreRuntime.values()).every((x) => x.currentStep >= targetUses)

  let now = 0
  let guard = 0
  while (now < durationSec && guard < 1500) {
    guard += 1
    let dt = Infinity
    for (const c of activeCards) {
      const st = state.get(c.placementId)
      if (!st) continue
      const speed = now < st.speedUntil ? 2 : 1
      dt = Math.min(dt, st.remaining / speed)
    }
    if (!Number.isFinite(dt) || dt === Infinity) break
    if (dt < epsilon) dt = 0
    if (now + dt > durationSec) break

    if (dt > 0) {
      for (const c of activeCards) {
        const st = state.get(c.placementId)
        if (!st) continue
        const speed = now < st.speedUntil ? 2 : 1
        st.remaining = Math.max(0, st.remaining - dt * speed)
      }
      now += dt
    }

    const firedNow = activeCards.filter((c) => {
      const st = state.get(c.placementId)
      return st && st.remaining <= epsilon
    })
    if (!firedNow.length) break

    type UseEvent = { card: PlacedCard; forced: boolean; sourceId?: string }
    const queue: UseEvent[] = [...firedNow].sort((a, b) => a.start - b.start).map((c) => ({ card: c, forced: false }))
    const queuedNormal = new Set(queue.map((x) => x.card.placementId))

    let qGuard = 0
    while (queue.length > 0 && qGuard < 240) {
      qGuard += 1
      const evt = queue.shift()!
      const fired = evt.card
      if (!evt.forced) queuedNormal.delete(fired.placementId)
      const firedState = state.get(fired.placementId)
      if (!firedState) continue
      firedState.fires += 1
      if (!evt.forced) {
        firedState.remaining += getCardCooldownSec(fired)
        if (firedState.remaining <= epsilon && !queuedNormal.has(fired.placementId)) {
          queue.push({ card: fired, forced: false })
          queuedNormal.add(fired.placementId)
        }
      }

      const firedCore = coreRuntime.get(fired.placementId)
      if (firedCore && firedCore.currentStep < targetUses) {
        const idx = firedCore.currentStep
        firedCore.fireTimes.push(now)
        firedCore.info.steps[idx].atSec = now
        firedCore.info.steps[idx].receivedCharge = firedCore.stepReceived[idx]
        firedCore.currentStep += 1
      }

      for (const source of cards) {
        const casts = Math.max(1, Number(multicastMap.get(fired.placementId) || 1))

        const chargeRules = chargeRulesBySource.get(source.placementId) || []
        for (const rule of chargeRules) {
          if (!resolveEventTriggerMatch(source, rule, fired)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags)
          const amount = Number(rule.amount || 0) * casts
          if (amount <= 0) continue
          for (const t of targets) {
            const ts = state.get(t.placementId)
            if (ts) {
              ts.remaining -= amount
              if (ts.remaining <= epsilon && !queuedNormal.has(t.placementId)) {
                queue.push({ card: t, forced: false })
                queuedNormal.add(t.placementId)
              }
            }
            const targetCore = coreRuntime.get(t.placementId)
            if (targetCore) {
              const stepIdx = Math.min(targetUses - 1, targetCore.currentStep)
              targetCore.stepReceived[stepIdx] += amount
              targetCore.info.totalReceived += amount
            }
            const sourceCore = coreRuntime.get(source.placementId)
            if (sourceCore) {
              const stepIdx = Math.max(0, Math.min(targetUses - 1, sourceCore.currentStep - 1))
              sourceCore.stepOutputCharge[stepIdx] += amount
              sourceCore.info.totalOutputCharge += amount
            }
          }
        }

        const forceRules = forceUseRulesBySource.get(source.placementId) || []
        for (const rule of forceRules) {
          if (!resolveEventTriggerMatch(source, rule, fired)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags)
          for (let c = 0; c < casts; c += 1) {
            for (const t of targets) {
              queue.push({ card: t, forced: true, sourceId: source.placementId })
            }
          }
        }

        const valueRules = valueRulesBySource.get(source.placementId) || []
        for (const rule of valueRules) {
          if (!resolveEventTriggerMatch(source, rule, fired)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags)
          if (!targets.length) continue
          const valueOut = Number(rule.valueAmount || 0) * casts * targets.length
          if (valueOut <= 0) continue
          const sourceCore = coreRuntime.get(source.placementId)
          if (sourceCore) {
            const stepIdx = Math.max(0, Math.min(targetUses - 1, sourceCore.currentStep - 1))
            sourceCore.stepOutputValue[stepIdx] += valueOut
            sourceCore.info.totalOutputValue += valueOut
          }
        }
      }
    }

    if (allReachedN()) break
  }

  const cores = Array.from(coreRuntime.values()).map((runtime) => {
    for (let i = 0; i < targetUses; i += 1) {
      runtime.info.steps[i].outputCharge = runtime.stepOutputCharge[i]
      runtime.info.steps[i].outputValue = runtime.stepOutputValue[i]
      if (runtime.info.steps[i].receivedCharge === 0) runtime.info.steps[i].receivedCharge = runtime.stepReceived[i]
    }
    if (runtime.fireTimes.length >= 2) {
      const gaps: number[] = []
      for (let i = 1; i < runtime.fireTimes.length; i += 1) gaps.push(runtime.fireTimes[i] - runtime.fireTimes[i - 1])
      const avg = gaps.reduce((s, x) => s + x, 0) / gaps.length
      runtime.info.avgInterval = avg
      runtime.info.rpm = avg > 0 ? 60 / avg : 0
    } else {
      runtime.info.avgInterval = 0
      runtime.info.rpm = 0
    }
    runtime.info.compositeScore =
      runtime.info.totalOutputCharge * 0.55 +
      runtime.info.totalOutputValue * 0.35 +
      runtime.info.totalReceived * 0.1 +
      runtime.info.rpm * 0.15
    return runtime.info
  }).sort((a, b) => b.compositeScore - a.compositeScore)

  return {
    layoutId,
    layoutName,
    rankScore,
    cores,
  }
}

function sizeClass(width: number): string {
  if (width === 1) return styles.cardSmall
  if (width === 3) return styles.cardLarge
  return styles.cardMedium
}

function DraggablePlacedCard({
  card,
  selected,
  useCount,
  totalDamage,
  onSelect,
  onRemove,
}: {
  card: PlacedCard
  selected: boolean
  useCount?: number
  totalDamage?: number
  onSelect: () => void
  onRemove: () => void
}) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'ITEM',
    item: {
      placementId: card.placementId,
      item: card.item,
      width: card.width,
      sourceType: 'items',
    } as DragPayload,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }))

  return (
    <button
      ref={drag as any}
      className={`${styles.placedCard} ${sizeClass(card.width)} ${selected ? styles.placedCardSelected : ''} ${
        isDragging ? styles.dragging : ''
      }`}
      style={{ left: `calc(${card.start} * var(--slot-unit))` }}
      onClick={onSelect}
      title={card.item.name_cn || card.item.name_en || card.item.id}
    >
      <ItemImage
        item={card.item}
        alt={card.item.name_cn || card.item.name_en || card.item.id}
        className={styles.cardImage}
        fallbackClassName={styles.cardFallback}
      />
      <span className={styles.useBadge}>{useCount ?? 0}</span>
      <span className={styles.damageBadge}>{Number(totalDamage || 0).toFixed(1)}</span>
      <span className={styles.removeBtn} onClick={(e) => { e.stopPropagation(); onRemove() }}>×</span>
    </button>
  )
}

export default function JibaoWorkbench({
  onSelectItem,
  itemsPool = [],
}: {
  onSelectItem: (item: any) => void
  itemsPool?: LabItem[]
}) {
  const [cards, setCards] = useState<PlacedCard[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<PlacedCard[] | null>(null)
  const [suggestPreviewId, setSuggestPreviewId] = useState<string | null>(null)
  const [paramCollapsed, setParamCollapsed] = useState(false)
  const [suggestCollapsed, setSuggestCollapsed] = useState(false)
  const [simSeconds, setSimSeconds] = useState(20)
  const boardRef = useRef<HTMLDivElement | null>(null)

  const analysis = useMemo(() => analyze(cards), [cards])
  const combatCurrent = useMemo(() => simulateCombatStats(cards, simSeconds), [cards, simSeconds])
  const cycles = useMemo(() => analyzeCycles(cards, analysis.links), [cards, analysis.links])
  const suggestions = useMemo(() => suggestTop(cards, 5, simSeconds), [cards, simSeconds])
  const suggestionPreview = useMemo(
    () => suggestions.find((s) => s.id === suggestPreviewId)?.next || null,
    [suggestions, suggestPreviewId],
  )
  const renderCards = preview || suggestionPreview || cards
  const combatDisplay = useMemo(() => simulateCombatStats(renderCards, simSeconds), [renderCards, simSeconds])
  const chartLayouts = useMemo(() => {
    const baseCurve = combatCurrent.cumulativeDamageBySecond
    const rows: Array<{ id: string; label: string; color: string; curve: number[]; totalDamage: number }> = [
      { id: 'current', label: '当前摆法', color: '#ffd447', curve: baseCurve, totalDamage: combatCurrent.totalDamage },
    ]
    const palette = ['#ff6b6b', '#4fc3f7', '#81c784', '#ba68c8', '#ffb74d', '#64ffda']
    suggestions.forEach((s, i) => {
      rows.push({
        id: s.id,
        label: `方案${s.rank}`,
        color: palette[i % palette.length],
        curve: s.curve,
        totalDamage: s.totalDamage,
      })
    })
    return rows
  }, [combatCurrent.cumulativeDamageBySecond, combatCurrent.totalDamage, suggestions])

  const commit = (next: PlacedCard[]) => {
    const sorted = [...next].sort((a, b) => a.start - b.start)
    setCards(sorted)
    setSuggestPreviewId(null)
    if (selectedId && !sorted.some((c) => c.placementId === selectedId)) {
      setSelectedId(null)
    }
  }

  const applyExample1 = () => {
    const { cards: demoCards, missing } = buildExample1Cards(itemsPool)
    if (!demoCards.length) {
      window.alert('示例1摆放失败：当前物品库中未找到示例卡牌。')
      return
    }
    commit(demoCards)
    setPreview(null)
    setSuggestPreviewId(null)
    setSelectedId(demoCards[0]?.placementId || null)
    if (demoCards[0]) onSelectItem(demoCards[0].item)
    if (missing.length > 0) {
      window.alert(`示例1已摆放，但缺少以下卡牌：${missing.join('、')}`)
    }
  }

  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'ITEM',
    hover: (dragged: DragPayload, monitor) => {
      if (!boardRef.current || dragged.sourceType === 'skills') return
      const pt = monitor.getClientOffset()
      if (!pt) return
      const rect = boardRef.current.getBoundingClientRect()
      const unit = rect.width / MAX_UNITS
      const width = dragged.width || getCardWidth(dragged.item?.size)
      const target = Math.max(0, Math.min(MAX_UNITS - width, Math.round((pt.x - rect.left) / unit - width / 2)))

      const movingExisting = dragged.placementId ? cards.find((c) => c.placementId === dragged.placementId) : null
      const moving: PlacedCard = movingExisting || {
        placementId: `${dragged.item?.id || 'card'}-${Date.now()}`,
        item: dragged.item!,
        width,
        start: target,
        tier: asTier(dragged.item?.starting_tier),
      }
      const others = movingExisting ? cards.filter((c) => c.placementId !== movingExisting.placementId) : cards
      const next = autoLayout(others, { ...moving, width, start: target }, target)
      setPreview(next)
    },
    drop: (dragged: DragPayload, monitor) => {
      if (dragged.sourceType === 'skills') return
      if (!boardRef.current) return
      const pt = monitor.getClientOffset()
      if (!pt) return
      const rect = boardRef.current.getBoundingClientRect()
      const unit = rect.width / MAX_UNITS
      const width = dragged.width || getCardWidth(dragged.item?.size)
      const target = Math.max(0, Math.min(MAX_UNITS - width, Math.round((pt.x - rect.left) / unit - width / 2)))

      const movingExisting = dragged.placementId ? cards.find((c) => c.placementId === dragged.placementId) : null
      const moving: PlacedCard = movingExisting || {
        placementId: `${dragged.item?.id || 'card'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        item: dragged.item!,
        width,
        start: target,
        tier: asTier(dragged.item?.starting_tier),
      }
      const others = movingExisting ? cards.filter((c) => c.placementId !== movingExisting.placementId) : cards
      const next = autoLayout(others, { ...moving, width, start: target }, target)
      if (next) {
        commit(next)
        onSelectItem(moving.item)
      }
      setPreview(null)
    },
    collect: (monitor) => ({ isOver: monitor.isOver({ shallow: true }) }),
  }), [cards, selectedId])

  const bindBoardRef = (node: HTMLDivElement | null) => {
    boardRef.current = node
    drop(node)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>机煲实验室 · 结构化充能解析</h3>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.applyBtn} onClick={applyExample1}>示例1一键摆放</button>
          <button className={styles.clearBtn} onClick={() => { setCards([]); setPreview(null); setSelectedId(null) }}>清空</button>
        </div>
      </div>

      <div className={`${styles.board} ${isOver ? styles.boardOver : ''}`} ref={bindBoardRef}>
        <div className={styles.grid}>
          {Array.from({ length: MAX_UNITS }).map((_, i) => (
            <div key={i} className={styles.slot}>{i + 1}</div>
          ))}
        </div>
        {renderCards.map((card) => (
          <DraggablePlacedCard
            key={card.placementId}
            card={card}
            selected={selectedId === card.placementId}
            useCount={combatDisplay.byCard[card.placementId] || 0}
            totalDamage={combatDisplay.byCardDamage[card.placementId] || 0}
            onSelect={() => {
              setSelectedId(card.placementId)
              onSelectItem(card.item)
            }}
            onRemove={() => commit(cards.filter((c) => c.placementId !== card.placementId))}
          />
        ))}
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statItem}>{simSeconds}秒总伤害：<strong>{combatCurrent.totalDamage.toFixed(1)}</strong></div>
        <div className={styles.useCtrl}>
          <button className={styles.spinBtn} onClick={() => setSimSeconds((v) => Math.max(1, v - 1))}>-</button>
          <input
            className={styles.useInput}
            type="number"
            min={1}
            max={90}
            value={simSeconds}
            onChange={(e) => {
              const n = Number(e.target.value || 1)
              setSimSeconds(Math.max(1, Math.min(90, Number.isFinite(n) ? Math.floor(n) : 1)))
            }}
          />
          <button className={styles.spinBtn} onClick={() => setSimSeconds((v) => Math.min(90, v + 1))}>+</button>
        </div>
      </div>

      <div className={styles.paramBox}>
        <div className={styles.sectionHead}>
          <div className={styles.listTitle}>卡牌参数（等级 / 实际冷却秒）</div>
          <button className={styles.collapseBtn} onClick={() => setParamCollapsed((v) => !v)}>
            {paramCollapsed ? '展开' : '收起'}
          </button>
        </div>
        {paramCollapsed ? null : cards.length === 0 ? (
          <div className={styles.empty}>先拖入卡牌</div>
        ) : (
          cards.map((c) => {
            const allowedTiers = getAllowedTiers(c.item)
            const effectiveTier = getEffectiveTier(c)
            const defaultCd = getCardCooldownSecByTier(c.item, effectiveTier)
            const currentCd = getCardCooldownSec(c)
            const editableCd = defaultCd > 0
            return (
              <div key={`param-${c.placementId}`} className={styles.paramRow}>
                <div className={styles.paramName}>{c.item.name_cn || c.item.name_en || c.item.id}</div>
                <select
                  className={styles.paramSelect}
                  value={effectiveTier}
                  onChange={(e) => {
                    const nextTier = e.target.value as PlacedCard['tier']
                    commit(cards.map((x) => (x.placementId === c.placementId ? { ...x, tier: nextTier, cooldownOverrideSec: undefined } : x)))
                  }}
                >
                  {allowedTiers.map((t) => (
                    <option key={t} value={t}>{TIER_LABEL_CN[t]}</option>
                  ))}
                </select>
                <button
                  className={`${styles.tagToggle} ${c.shieldEnchanted ? styles.tagToggleOn : ''}`}
                  onClick={() =>
                    commit(cards.map((x) => (x.placementId === c.placementId ? { ...x, shieldEnchanted: !x.shieldEnchanted } : x)))
                  }
                >
                  护盾附魔
                </button>
                {editableCd ? (
                  <>
                    <input
                      className={styles.paramInput}
                      type="number"
                      min={0}
                      step={0.1}
                      placeholder={defaultCd.toFixed(1)}
                      value={Number.isFinite(c.cooldownOverrideSec) ? String(c.cooldownOverrideSec) : ''}
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        const next = v === '' ? undefined : Math.max(0, Number(v))
                        commit(cards.map((x) => (x.placementId === c.placementId ? { ...x, cooldownOverrideSec: next } : x)))
                      }}
                    />
                    <button
                      className={styles.paramReset}
                      onClick={() => commit(cards.map((x) => (x.placementId === c.placementId ? { ...x, cooldownOverrideSec: undefined } : x)))}
                    >
                      重置
                    </button>
                    <div className={styles.paramHint}>当前CD {currentCd.toFixed(1)}s</div>
                  </>
                ) : (
                  <div className={styles.paramPassive}>被动（无冷却）</div>
                )}
              </div>
            )
          })
        )}
      </div>

      {suggestions.length > 0 ? (
        <div className={styles.suggestWrap}>
          <div className={styles.sectionHead}>
            <div className={styles.suggestHead}>发现 {suggestions.length} 个备选方案（多时间点优选，可预览切换）</div>
            <button className={styles.collapseBtn} onClick={() => setSuggestCollapsed((v) => !v)}>
              {suggestCollapsed ? '展开' : '收起'}
            </button>
          </div>
          {suggestCollapsed ? null : suggestions.map((s) => (
            <div key={s.id} className={styles.suggestRow}>
              <div className={styles.suggestText}>
                方案{s.rank}：{simSeconds}秒总伤害 <strong>{s.totalDamage.toFixed(1)}</strong>
                {' '}（较当前 {s.damageGain >= 0 ? '+' : ''}{s.damageGain.toFixed(1)}） · 总出手 {s.totalUses}
                {s.championSeconds.length > 0
                  ? ` · 冠军秒：${formatSecondRanges(s.championSeconds)}`
                  : ''}
              </div>
              <div className={styles.suggestActions}>
                <button
                  className={styles.applyBtn}
                  onClick={() => setSuggestPreviewId((prev) => (prev === s.id ? null : s.id))}
                >
                  {suggestPreviewId === s.id ? '取消预览' : '预览'}
                </button>
                <button className={styles.applyBtn} onClick={() => commit(s.next)}>应用</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.okBox}>当前摆位暂无明显可提升项。</div>
      )}

      <div className={`${styles.listBox} ${styles.chartSection}`}>
        <div className={styles.listTitle}>累计伤害对比（每秒）</div>
        {chartLayouts.length === 0 ? (
          <div className={styles.empty}>暂无可对比方案</div>
        ) : (
          <>
            <div className={styles.chartLegend}>
              {chartLayouts.map((l) => (
                <div key={`legend-${l.id}`} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: l.color }} />
                  <span>{l.label}：{l.totalDamage.toFixed(1)}</span>
                </div>
              ))}
            </div>
            <div className={styles.chartWrap}>
              {(() => {
                const width = 900
                const height = 240
                const padL = 42
                const padR = 10
                const padT = 12
                const padB = 28
                const plotW = width - padL - padR
                const plotH = height - padT - padB
                const maxX = Math.max(1, simSeconds)
                const maxY = Math.max(
                  1,
                  ...chartLayouts.map((l) => l.curve.reduce((m, v) => Math.max(m, v || 0), 0)),
                )
                const yTicks = 4
                const xTicks = Math.min(10, maxX)
                return (
                  <svg viewBox={`0 0 ${width} ${height}`} className={styles.chartSvg}>
                    {Array.from({ length: yTicks + 1 }).map((_, i) => {
                      const y = padT + (plotH * i) / yTicks
                      const val = maxY - (maxY * i) / yTicks
                      return (
                        <g key={`y-${i}`}>
                          <line x1={padL} y1={y} x2={padL + plotW} y2={y} className={styles.chartGrid} />
                          <text x={padL - 6} y={y + 4} className={styles.chartAxisLabel}>{val.toFixed(0)}</text>
                        </g>
                      )
                    })}
                    {Array.from({ length: xTicks + 1 }).map((_, i) => {
                      const sec = Math.round((maxX * i) / xTicks)
                      const x = padL + (plotW * sec) / maxX
                      return (
                        <g key={`x-${i}`}>
                          <line x1={x} y1={padT} x2={x} y2={padT + plotH} className={styles.chartGridV} />
                          <text x={x} y={padT + plotH + 16} textAnchor="middle" className={styles.chartAxisLabel}>
                            {sec}s
                          </text>
                        </g>
                      )
                    })}
                    {chartLayouts.map((l) => {
                      const series = l.curve
                      const points = Array.from({ length: maxX + 1 }).map((_, sec) => {
                        const x = padL + (plotW * sec) / maxX
                        const yVal = series[sec] ?? series[series.length - 1] ?? 0
                        const y = padT + plotH - (plotH * yVal) / maxY
                        return `${x},${y}`
                      })
                      return (
                        <polyline
                          key={`line-${l.id}`}
                          fill="none"
                          stroke={l.color}
                          strokeWidth={2.5}
                          points={points.join(' ')}
                        />
                      )
                    })}
                  </svg>
                )
              })()}
            </div>
          </>
        )}
      </div>

      <div className={styles.detailLists}>
        <div className={styles.listBox}>
          <div className={styles.listTitle}>生效连接</div>
          {analysis.links.length === 0 ? <div className={styles.empty}>暂无</div> : analysis.links.slice(0, 16).map((x, idx) => (
            <div key={`${x.from}-${x.to}-${idx}`} className={styles.lineItem}>
              {x.from} → {x.to}（{x.amount.toFixed(1)}秒）触发源：{x.triggeredBy || x.from}
            </div>
          ))}
        </div>
        <div className={styles.listBox}>
          <div className={styles.listTitle}>未生效连接</div>
          {analysis.broken.length === 0 ? <div className={styles.empty}>暂无</div> : analysis.broken.slice(0, 16).map((x, idx) => (
            <div key={`${x.from}-${x.mode}-${idx}`} className={styles.lineItem}>{x.from}（{x.mode}，{x.amount}）未命中：{x.reason}</div>
          ))}
        </div>
      </div>

      <div className={styles.detailLists}>
        <div className={styles.listBox}>
          <div className={styles.listTitle}>永续闭环检测（双向充能 vs 双方冷却）</div>
          {cycles.length === 0 ? (
            <div className={styles.empty}>暂无双向充能对</div>
          ) : (
            cycles.slice(0, 16).map((c, idx) => (
              <div key={`${c.aId}-${c.bId}-${idx}`} className={styles.lineItem}>
                <div>
                  {c.aName} ⇄ {c.bName} {c.ok ? <span className={styles.okTag}>可永续</span> : <span className={styles.warnTag}>未达标</span>}
                </div>
                <div className={styles.subLine}>
                  {c.aName}→{c.bName}: {c.aToB.toFixed(1)}s / 需覆盖 {c.bCd.toFixed(1)}s
                </div>
                <div className={styles.subLine}>
                  {c.bName}→{c.aName}: {c.bToA.toFixed(1)}s / 需覆盖 {c.aCd.toFixed(1)}s
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
