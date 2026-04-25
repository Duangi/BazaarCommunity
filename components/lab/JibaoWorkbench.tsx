'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useDrop } from 'react-dnd'
import LineupEditBoard from '@/components/common/LineupEditBoard'
import BorderTierSelector from '@/components/common/BorderTierSelector'
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
  sourceBoard?: 'main' | 'reserve'
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
  totalShield: number
  curve: number[]
  championSeconds: number[]
}

type BoardKey = 'main' | 'reserve'
type SlotMode = 6 | 8 | 10

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
  totalShield: number
  byCardDamage: Record<string, number>
  byCardShield: Record<string, number>
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

type WorkbenchCalcResult = {
  simSeconds: number
  analysis: Analysis
  combatCurrent: CombatSummary
  cycles: CycleHit[]
  suggestions: SuggestionCandidate[]
  chartLayouts: Array<{ id: string; label: string; color: string; curve: number[]; totalDamage: number }>
  optimizationBaseLen: number
}

const MAX_UNITS = 10
const EXAMPLE_1_ORDER: Array<{ name: string; tier: PlacedCard['tier'] }> = [
  { name: '弱点探测器', tier: 'Bronze' },
  { name: '哈姆锤特', tier: 'Bronze' },
  { name: '全能核心', tier: 'Silver' },
  { name: '尖刺铁丝网', tier: 'Bronze' },
  { name: '炫光 LED', tier: 'Bronze' },
  { name: '布胶带', tier: 'Bronze' },
]

function normalizeName(s?: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·•\-_.]/g, '')
    .trim()
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
    // 示例固定按 8 格布局
    if (cursor + width > 8) break
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

type TriggerBranch = {
  type: string
  subject: any
}

function expandTriggerBranches(trigger: any): TriggerBranch[] {
  if (!trigger || typeof trigger !== 'object') return [{ type: '', subject: {} }]
  const triggerType = String(trigger.type || '')
  if (triggerType === 'TTriggerOr') {
    const children = Array.isArray(trigger.Triggers) ? trigger.Triggers : Array.isArray(trigger.triggers) ? trigger.triggers : []
    const out: TriggerBranch[] = []
    for (const child of children) {
      out.push(...expandTriggerBranches(child))
    }
    return out.length > 0 ? out : [{ type: '', subject: {} }]
  }
  const subject = trigger.Subject || trigger.subject || {}
  return [{ type: triggerType, subject }]
}

function getAttrValueByTier(rawItem: any, attrType: string, preferredTier: string): number {
  const attrs = Array.isArray(rawItem?.attributes) ? rawItem.attributes : []
  const row = attrs.find((a: any) => String(a?.attribute || '') === String(attrType || ''))
  if (!row) return 0

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

  return 0
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

function getCardAmmoMaxByTier(item: LabItem, tierInput?: string): number {
  const raw = item.__raw || {}
  const tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier)

  const fromDirect = Number((item as any)?.ammo)
  if (Number.isFinite(fromDirect) && fromDirect > 0) return Math.max(0, Math.round(fromDirect))

  const ammoTiers = String((item as any)?.ammo_tiers || '').trim()
  if (ammoTiers) {
    const vals = ammoTiers
      .split('/')
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x))
    if (vals.length > 0) {
      const idxMap: Record<string, number> = { Bronze: 0, Silver: 1, Gold: 2, Diamond: 3, Legendary: 4 }
      const idx = idxMap[tier]
      if (vals.length >= 5 && Number.isInteger(idx) && vals[idx] != null) {
        return Math.max(0, Math.round(vals[idx]))
      }
      return Math.max(0, Math.round(vals[Math.min(vals.length - 1, Math.max(0, idx || 0))]))
    }
  }

  const fromRaw = getAttrValueByTier(raw, 'AmmoMax', tier)
  if (Number.isFinite(fromRaw) && fromRaw > 0) return Math.max(0, Math.round(fromRaw))

  return 0
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
    const triggerBranches = expandTriggerBranches(row?.trigger || {})
    const description = String(row.description_cn || row.description_en || '').trim()
    for (const branch of triggerBranches) {
      const subject = branch.subject || {}
      const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions)
      const triggerExcludeSelf = Boolean(subject.ExcludeSelf)
      const targetExcludeSelf = Boolean(target.ExcludeSelf)
      const triggerSubjectType = String(subject.type || '')
      const triggerSubjectMode = String(subject.TargetMode || subject.targetMode || '')

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
        triggerType: String(branch.type || ''),
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
    const description = String(row.description_cn || row.description_en || '').trim()
    const triggerBranches = expandTriggerBranches(row?.trigger || {})

    for (const branch of triggerBranches) {
      const subject = branch.subject || {}
      const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions)
      const triggerExcludeSelf = Boolean(subject.ExcludeSelf)
      const targetExcludeSelf = Boolean(target.ExcludeSelf)
      const triggerSubjectType = String(subject.type || '')
      const triggerSubjectMode = String(subject.TargetMode || subject.targetMode || '')
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
        triggerType: String(branch.type || ''),
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
    const triggerBranches = expandTriggerBranches(row?.trigger || {})
    for (const branch of triggerBranches) {
      const subject = branch.subject || {}
      const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions)
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
        triggerType: String(branch.type || ''),
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
  }
  return out
}

function readReloadRules(item: LabItem, tierInput?: string): ChargeRule[] {
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
    if (String(action.type || '') !== 'TActionCardReload') continue
    const amount = getAttrValueByTier(raw, String(action.attribute_type || 'ReloadAmount'), tier)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const amountByTier = getAttrValuesByTier(raw, String(action.attribute_type || 'ReloadAmount'))
    const target = action.target || {}
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    const targetSection = String(target.TargetSection || target.targetSection || '')
    const condMeta = extractConditionMeta(target.conditions || target.Conditions)
    const triggerBranches = expandTriggerBranches(row?.trigger || {})
    for (const branch of triggerBranches) {
      const subject = branch.subject || {}
      const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions)
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
        targetExcludeSelf: Boolean(target.ExcludeSelf),
        triggerType: String(branch.type || ''),
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
    const triggerBranches = expandTriggerBranches(row?.trigger || {})
    for (const branch of triggerBranches) {
      const subject = branch.subject || {}
      const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions)
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
        triggerType: String(branch.type || ''),
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
    const description = String(row.description_cn || row.description_en || '').trim()
    const triggerBranches = expandTriggerBranches(row?.trigger || {})
    for (const branch of triggerBranches) {
      const subject = branch.subject || {}
      const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions)
      const triggerExcludeSelf = Boolean(subject.ExcludeSelf)
      const targetExcludeSelf = Boolean(target.ExcludeSelf)
      const triggerSubjectType = String(subject.type || '')
      const triggerSubjectMode = String(subject.TargetMode || subject.targetMode || '')

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
        triggerType: String(branch.type || ''),
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
    const triggerBranches = expandTriggerBranches(row?.trigger || {})
    for (const branch of triggerBranches) {
      const subject = branch.subject || {}
      const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions)
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
        triggerType: String(branch.type || ''),
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
  }
  return out
}

function readShieldGainRules(item: LabItem, tierInput?: string): ChargeRule[] {
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
    if (String(action.type || '') !== 'TActionPlayerShieldApply') continue
    const amount = getAttrValueByTier(raw, String(action.attribute_type || 'ShieldApplyAmount'), tier)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const amountByTier = getAttrValuesByTier(raw, String(action.attribute_type || 'ShieldApplyAmount'))
    const target = action.target || {}
    const condMeta = extractConditionMeta(target.conditions || target.Conditions)
    const triggerBranches = expandTriggerBranches(row?.trigger || {})
    for (const branch of triggerBranches) {
      const subject = branch.subject || {}
      const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions)
      out.push({
        sourceName: item.name_cn || item.name_en || item.id,
        sourceId: item.id,
        amount,
        amountByTier,
        targetType: String(target.type || ''),
        targetMode: String(target.TargetMode || target.targetMode || ''),
        targetSection: String(target.TargetSection || target.targetSection || ''),
        requiredTags: condMeta.include,
        requiredExcludeTags: condMeta.exclude,
        requiredSizes: condMeta.includeSizes,
        requiredExcludeSizes: condMeta.excludeSizes,
        requiredCooldownOnly: condMeta.requireCooldownOnly,
        requiredNotTriggerSource: condMeta.notTriggerSource,
        targetExcludeSelf: Boolean(target.ExcludeSelf),
        triggerType: String(branch.type || ''),
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

function findNearestStart(occ: boolean[], width: number, preferred: number, allowedMask?: boolean[]): number | null {
  const candidates: number[] = []
  for (let s = 0; s <= MAX_UNITS - width; s += 1) {
    if (allowedMask) {
      let ok = true
      for (let i = s; i < s + width; i += 1) {
        if (!allowedMask[i]) {
          ok = false
          break
        }
      }
      if (!ok) continue
    }
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

function autoLayout(
  cardsWithoutMoving: PlacedCard[],
  moving: PlacedCard,
  targetStart: number,
  allowedMask?: boolean[],
): PlacedCard[] | null {
  const occ = buildOccupancy()
  const placed: PlacedCard[] = []

  const mStart = findNearestStart(occ, moving.width, targetStart, allowedMask)
  if (mStart == null) return null
  reserve(occ, mStart, moving.width)
  placed.push({ ...moving, start: mStart })

  const sorted = [...cardsWithoutMoving].sort((a, b) => a.start - b.start)
  for (const c of sorted) {
    const s = findNearestStart(occ, c.width, c.start, allowedMask)
    if (s == null) return null
    reserve(occ, s, c.width)
    placed.push({ ...c, start: s })
  }

  return placed.sort((a, b) => a.start - b.start)
}

function compactByMask(rows: PlacedCard[], allowedMask?: boolean[]): PlacedCard[] {
  const sorted = [...rows].sort((a, b) => a.start - b.start || a.item.id.localeCompare(b.item.id))
  if (!allowedMask) {
    let cursor = 0
    const out: PlacedCard[] = []
    for (const c of sorted) {
      if (cursor + c.width > MAX_UNITS) continue
      out.push({ ...c, start: cursor })
      cursor += c.width
    }
    return out
  }
  const occ = buildOccupancy()
  const out: PlacedCard[] = []
  for (const c of sorted) {
    const s = findNearestStart(occ, c.width, c.start, allowedMask)
    if (s == null) continue
    reserve(occ, s, c.width)
    out.push({ ...c, start: s })
  }
  return out
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

function inferTriggerActionTypes(triggerType: string): string[] {
  const lowerTrigger = String(triggerType || '').toLowerCase()
  if (!lowerTrigger) return []
  if (lowerTrigger.includes('performedslow') || lowerTrigger.endsWith('slow')) return ['TActionCardSlow']
  if (lowerTrigger.includes('performedhaste') || lowerTrigger.endsWith('haste')) return ['TActionCardHaste']
  if (lowerTrigger.includes('performedfreeze') || lowerTrigger.endsWith('freeze')) return ['TActionCardFreeze']
  if (lowerTrigger.includes('performedburn') || lowerTrigger.endsWith('burn')) return ['TActionPlayerBurnApply']
  if (lowerTrigger.includes('performedpoison') || lowerTrigger.endsWith('poison')) return ['TActionPlayerPoisonApply']
  if (lowerTrigger.includes('performedshield') || lowerTrigger.endsWith('shield')) return ['TActionPlayerShieldApply']
  if (lowerTrigger.includes('performedregen') || lowerTrigger.endsWith('regen')) return ['TActionPlayerRegenApply']
  if (lowerTrigger.includes('performedheal') || lowerTrigger.endsWith('heal')) return ['TActionPlayerHeal', 'TActionPlayerReviveHeal']
  if (lowerTrigger.includes('performedreload') || lowerTrigger.endsWith('reload')) return ['TActionCardReload']
  if (lowerTrigger.includes('performeddestruction') || lowerTrigger.endsWith('destruction')) return ['TActionCardDestroy', 'TActionCardTransformDestroyed']
  if (lowerTrigger.includes('performeddamage') || lowerTrigger.endsWith('damage')) return ['TActionPlayerDamage']
  return []
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

  const triggerActionTypes = inferTriggerActionTypes(triggerType)

  const isSupportedTrigger =
    !triggerType ||
    triggerType === 'TTriggerOnCardFired' ||
    lowerTrigger.includes('itemused') ||
    lowerTrigger.includes('performed') ||
    lowerTrigger.includes('slow') ||
    lowerTrigger.includes('haste') ||
    lowerTrigger.includes('freeze') ||
    lowerTrigger.includes('burn') ||
    lowerTrigger.includes('poison')
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

  if (triggerActionTypes.length > 0) {
    pool = pool.filter((c) => triggerActionTypes.some((t) => hasAction(c, t)))
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

function compactOrderLayout(order: PlacedCard[], capacityUnits = MAX_UNITS): PlacedCard[] | null {
  const out: PlacedCard[] = []
  let cursor = 0
  for (const c of order) {
    if (cursor + c.width > capacityUnits) return null
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
    return { durationSec, totalUses: 0, byCard: {}, totalDamage: 0, totalShield: 0, byCardDamage: {}, byCardShield: {}, cumulativeDamageBySecond: buildCumulativeDamageCurve([], durationSec) }
  }

  const auraTags = computeAuraTagMap(cards)
  const multicastMap = computeMulticastMap(cards, auraTags)
  const chargeRulesBySource = new Map<string, ChargeRule[]>()
  const hasteRulesBySource = new Map<string, ChargeRule[]>()
  const forceUseRulesBySource = new Map<string, ChargeRule[]>()
  const reloadRulesBySource = new Map<string, ChargeRule[]>()
  const shieldRulesBySource = new Map<string, ChargeRule[]>()
  const offenseRulesBySource = new Map<string, Array<ChargeRule & { valueAmount: number; attributeType: string }>>()
  const baseDamageByCard = new Map<string, number>()
  const ammoState = new Map<string, { max: number; current: number; readyWhenEmpty: boolean }>()
  for (const c of cards) {
    chargeRulesBySource.set(c.placementId, readChargeRules(c.item, getEffectiveTier(c)).positionalRules)
    hasteRulesBySource.set(c.placementId, readHasteRules(c.item, getEffectiveTier(c)))
    forceUseRulesBySource.set(c.placementId, readForceUseRules(c.item, getEffectiveTier(c)))
    reloadRulesBySource.set(c.placementId, readReloadRules(c.item, getEffectiveTier(c)))
    shieldRulesBySource.set(c.placementId, readShieldGainRules(c.item, getEffectiveTier(c)))
    offenseRulesBySource.set(c.placementId, readOffenseBuffRules(c.item, getEffectiveTier(c)))
    baseDamageByCard.set(c.placementId, readDamageOnUse(c.item, getEffectiveTier(c)))
    const maxAmmo = getCardAmmoMaxByTier(c.item, getEffectiveTier(c))
    if (maxAmmo > 0) ammoState.set(c.placementId, { max: maxAmmo, current: maxAmmo, readyWhenEmpty: false })
  }

  const state = new Map<string, { remaining: number; speedUntil: number }>()
  for (const c of activeCards) state.set(c.placementId, { remaining: getCardCooldownSec(c), speedUntil: 0 })
  const uses = new Map<string, number>()
  const byCardDamage = new Map<string, number>()
  const byCardShield = new Map<string, number>()
  const bonusDamage = new Map<string, number>()
  let totalDamage = 0
  const damageEvents: Array<{ time: number; amount: number }> = []
  for (const c of activeCards) uses.set(c.placementId, 0)
  for (const c of activeCards) {
    byCardDamage.set(c.placementId, 0)
    byCardShield.set(c.placementId, 0)
    bonusDamage.set(c.placementId, 0)
  }

  const resolveEventTriggerMatch = (
    source: PlacedCard,
    rule: ChargeRule,
    fired: PlacedCard,
    shieldPerformedSet?: Set<string>,
  ): boolean => {
    if (String(rule.triggerType || '') === 'TTriggerOnCardPerformedShield') {
      const cands = resolveTriggerCandidates(cards, source, rule, auraTags)
      return cands.some((x) => (shieldPerformedSet || new Set()).has(x.placementId))
    }
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
      const ammo = ammoState.get(c.placementId)
      if (ammo && ammo.readyWhenEmpty) continue
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
        const ammo = ammoState.get(c.placementId)
        if (ammo && ammo.readyWhenEmpty) continue
        const speed = now < st.speedUntil ? 2 : 1
        st.remaining = Math.max(0, st.remaining - dt * speed)
      }
      now += dt
    }

    const firedNow = activeCards.filter((c) => {
      const st = state.get(c.placementId)
      if (!st) return false
      const ammo = ammoState.get(c.placementId)
      if (ammo && ammo.readyWhenEmpty) return false
      return st.remaining <= epsilon
    })
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
      const firedAmmo = ammoState.get(fired.placementId)
      if (firedAmmo && firedAmmo.current <= 0) {
        firedAmmo.readyWhenEmpty = true
        fs.remaining = 0
        continue
      }
      const casts = Math.max(1, Number(multicastMap.get(fired.placementId) || 1))
      if (firedAmmo) {
        firedAmmo.current = Math.max(0, firedAmmo.current - 1)
        firedAmmo.readyWhenEmpty = false
      }
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

      // 先结算“获得护盾”事件，再让“触发护盾后充能”在同一轮生效
      const shieldPerformedBy = new Set<string>()
      for (const source of cards) {
        const casts = Math.max(1, Number(multicastMap.get(fired.placementId) || 1))
        const shieldRules = shieldRulesBySource.get(source.placementId) || []
        for (const rule of shieldRules) {
          if (!resolveEventTriggerMatch(source, rule, fired)) continue
          const amount = Math.max(0, Number(rule.amount || 0)) * casts
          if (amount <= 0) continue
          byCardShield.set(source.placementId, (byCardShield.get(source.placementId) || 0) + amount)
          shieldPerformedBy.add(source.placementId)
        }
      }

      for (const source of cards) {
        const chargeRules = chargeRulesBySource.get(source.placementId) || []
        for (const rule of chargeRules) {
          const isShieldTrigger = String(rule.triggerType || '') === 'TTriggerOnCardPerformedShield'
          if (!resolveEventTriggerMatch(source, rule, fired, shieldPerformedBy)) continue
          const triggerCards = isShieldTrigger
            ? resolveTriggerCandidates(cards, source, rule, auraTags).filter((x) => shieldPerformedBy.has(x.placementId))
            : [fired]
          for (const triggerCard of triggerCards) {
            const casts = Math.max(1, Number(multicastMap.get(triggerCard.placementId) || 1))
            const targets = resolveTargetsForTrigger(cards, source, triggerCard, rule, auraTags)
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

        const reloadRules = reloadRulesBySource.get(source.placementId) || []
        for (const rule of reloadRules) {
          if (!resolveEventTriggerMatch(source, rule, fired)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags)
          const amount = Math.max(0, Number(rule.amount || 0)) * casts
          if (amount <= 0) continue
          for (const t of targets) {
            const ammo = ammoState.get(t.placementId)
            const ts = state.get(t.placementId)
            if (!ammo || !ts) continue
            const before = ammo.current
            ammo.current = Math.min(ammo.max, ammo.current + amount)
            if (before <= 0 && ammo.current > 0 && ammo.readyWhenEmpty && ts.remaining <= epsilon && !queuedNormal.has(t.placementId)) {
              ammo.readyWhenEmpty = false
              queue.push({ card: t, forced: false })
              queuedNormal.add(t.placementId)
            }
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
  const byCardShieldObj: Record<string, number> = {}
  let totalUses = 0
  let totalShield = 0
  uses.forEach((v, k) => {
    byCard[k] = v
    totalUses += v
  })
  byCardDamage.forEach((v, k) => {
    byCardDamageObj[k] = v
  })
  byCardShield.forEach((v, k) => {
    byCardShieldObj[k] = v
    totalShield += v
  })
  return {
    durationSec,
    totalUses,
    byCard,
    totalDamage,
    totalShield,
    byCardDamage: byCardDamageObj,
    byCardShield: byCardShieldObj,
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

function normalizeSequentialLayout(cards: PlacedCard[], capacityUnits = MAX_UNITS): PlacedCard[] {
  const sorted = [...cards].sort((a, b) => a.start - b.start || a.item.id.localeCompare(b.item.id))
  const out: PlacedCard[] = []
  let cursor = 0
  for (const c of sorted) {
    if (cursor + c.width > capacityUnits) continue
    out.push({ ...c, start: cursor })
    cursor += c.width
  }
  return out
}

function buildOptimizationPools(mainCards: PlacedCard[], reserveCards: PlacedCard[], windowSec: number, capacityUnits = MAX_UNITS): PlacedCard[][] {
  const allMap = new Map<string, PlacedCard>()
  for (const c of [...mainCards, ...reserveCards]) {
    if (!allMap.has(c.placementId)) allMap.set(c.placementId, c)
  }
  const all = Array.from(allMap.values())
  if (!all.length) return []

  const totalWidth = all.reduce((s, c) => s + c.width, 0)
  const addPool = (rows: PlacedCard[], bag: Map<string, PlacedCard[]>) => {
    const packed = normalizeSequentialLayout(rows, capacityUnits)
    if (!packed.length) return
    const sig = packed.map((x) => x.placementId).join('|')
    if (!bag.has(sig)) bag.set(sig, packed)
  }

  const pools = new Map<string, PlacedCard[]>()
  if (totalWidth <= capacityUnits) {
    addPool(all, pools)
    return Array.from(pools.values())
  }

  const quickScore = new Map<string, number>()
  for (const c of all) {
    const single = scoreLayout([{ ...c, start: 0 }], windowSec).combat.totalDamage
    quickScore.set(c.placementId, single / Math.max(1, c.width))
  }
  const byScore = [...all].sort((a, b) => (quickScore.get(b.placementId) || 0) - (quickScore.get(a.placementId) || 0))
  const byWidthAsc = [...all].sort((a, b) => a.width - b.width || (quickScore.get(b.placementId) || 0) - (quickScore.get(a.placementId) || 0))
  const byCooldown = [...all].sort((a, b) => getCardCooldownSec(a) - getCardCooldownSec(b))
  const byCooldownDesc = [...all].sort((a, b) => getCardCooldownSec(b) - getCardCooldownSec(a))
  const byCurrentOrder = [...mainCards, ...reserveCards].filter((c) => allMap.has(c.placementId))

  const greedyPick = (ordered: PlacedCard[]) => {
    const chosen: PlacedCard[] = []
    let used = 0
    for (const c of ordered) {
      if (used + c.width > capacityUnits) continue
      chosen.push(c)
      used += c.width
      if (used >= capacityUnits) break
    }
    return chosen
  }

  addPool(greedyPick(byScore), pools)
  addPool(greedyPick(byWidthAsc), pools)
  addPool(greedyPick(byCooldown), pools)
  addPool(greedyPick(byCooldownDesc), pools)
  addPool(greedyPick(byCurrentOrder), pools)

  const seed = byCurrentOrder.reduce((s, c) => s + c.item.id.charCodeAt(0), 31)
  const rand = (n: number) => {
    const x = Math.sin(seed * 12.13 + n * 17.91) * 10000
    return x - Math.floor(x)
  }
  for (let r = 0; r < 16; r += 1) {
    const order = [...all]
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand(r * 97 + i * 11) * (i + 1))
      const t = order[i]
      order[i] = order[j]
      order[j] = t
    }
    addPool(greedyPick(order), pools)
    if (pools.size >= 8) break
  }
  return Array.from(pools.values()).slice(0, 8)
}

function suggestTop(cards: PlacedCard[], limit = 5, windowSec = 20, capacityUnits = MAX_UNITS): SuggestionCandidate[] {
  const normalizedBase = compactOrderLayout(cards, capacityUnits)
  if (!normalizedBase || normalizedBase.length <= 1) return []

  const base = scoreLayout(normalizedBase, windowSec)
  const candidateMap = new Map<string, { next: PlacedCard[]; score: number; analysis: Analysis; metrics: NetworkMetrics; usage: UseCountSummary; combat: CombatSummary }>()
  const orderBase = normalizedBase.slice().sort((a, b) => a.start - b.start)

  const tryAdd = (order: PlacedCard[]) => {
    const compact = compactOrderLayout(order, capacityUnits)
    if (!compact || compact.length !== normalizedBase.length) return
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
        totalShield: data.combat.totalShield,
        curve: data.combat.cumulativeDamageBySecond,
      }
    })
    .sort((a, b) => b.totalDamage - a.totalDamage || b.totalShield - a.totalShield || b.totalUses - a.totalUses)

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

export default function JibaoWorkbench({
  onSelectItem,
  itemsPool = [],
}: {
  onSelectItem: (item: any) => void
  itemsPool?: LabItem[]
}) {
  const [cards, setCards] = useState<PlacedCard[]>([])
  const [reserveCards, setReserveCards] = useState<PlacedCard[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<PlacedCard[] | null>(null)
  const [reservePreview, setReservePreview] = useState<PlacedCard[] | null>(null)
  const [suggestPreviewId, setSuggestPreviewId] = useState<string | null>(null)
  const [paramCollapsed, setParamCollapsed] = useState(false)
  const [suggestCollapsed, setSuggestCollapsed] = useState(false)
  const [simSeconds, setSimSeconds] = useState(20)
  const [simSecondsDraft, setSimSecondsDraft] = useState(20)
  const [boardScale, setBoardScale] = useState(1.6)
  const [slotMode, setSlotMode] = useState<SlotMode>(10)
  const [isCalculating, setIsCalculating] = useState(false)
  const [autoOptimizeNote, setAutoOptimizeNote] = useState('')
  const boardRef = useRef<HTMLDivElement | null>(null)
  const reserveBoardRef = useRef<HTMLDivElement | null>(null)
  const slotMask = useMemo(() => {
    if (slotMode === 6) return [false, false, true, true, true, true, true, true, false, false]
    if (slotMode === 8) return [false, true, true, true, true, true, true, true, true, false]
    return Array.from({ length: 10 }, () => true)
  }, [slotMode])
  const enabledUnits = useMemo(() => slotMask.filter(Boolean).length, [slotMask])
  const buildCalcResult = (mainCards: PlacedCard[], reserve: PlacedCard[], sec: number): WorkbenchCalcResult => {
    const analysis = analyze(mainCards)
    const combatCurrent = simulateCombatStats(mainCards, sec)
    const cycles = analyzeCycles(mainCards, analysis.links)
    const optimizationPools = buildOptimizationPools(mainCards, reserve, sec, enabledUnits)
    const optimizationBase =
      optimizationPools.length > 0 ? optimizationPools[0] : (mainCards.length > 0 ? mainCards : [])
    const merged = new Map<string, SuggestionCandidate>()
    const localPools = optimizationPools.length > 0 ? optimizationPools : (mainCards.length > 0 ? [mainCards] : [])
    for (const pool of localPools) {
      const local = suggestTop(pool, 5, sec, enabledUnits)
      for (const s of local) {
        const prev = merged.get(s.id)
        if (
          !prev ||
          s.totalDamage > prev.totalDamage ||
          (Math.abs(s.totalDamage - prev.totalDamage) <= 1e-6 && s.totalShield > prev.totalShield)
        ) {
          merged.set(s.id, s)
        } else if (prev && s.totalDamage === prev.totalDamage && s.totalShield === prev.totalShield) {
          merged.set(s.id, {
            ...prev,
            championSeconds: Array.from(new Set([...(prev.championSeconds || []), ...(s.championSeconds || [])])).sort((a, b) => a - b),
          })
        }
      }
    }
    const suggestions = Array.from(merged.values())
      .sort((a, b) => b.totalDamage - a.totalDamage || b.totalShield - a.totalShield || b.totalUses - a.totalUses)
      .slice(0, 5)
      .map((x, idx) => ({
        ...x,
        rank: idx + 1,
        damageGain: x.totalDamage - combatCurrent.totalDamage,
      }))
    const palette = ['#ff6b6b', '#4fc3f7', '#81c784', '#ba68c8', '#ffb74d', '#64ffda']
    const chartLayouts: Array<{ id: string; label: string; color: string; curve: number[]; totalDamage: number }> = [
      {
        id: 'current',
        label: '当前摆法',
        color: '#ffd447',
        curve: combatCurrent.cumulativeDamageBySecond,
        totalDamage: combatCurrent.totalDamage,
      },
      ...suggestions.map((s, i) => ({
        id: s.id,
        label: `方案${s.rank}`,
        color: palette[i % palette.length],
        curve: s.curve,
        totalDamage: s.totalDamage,
      })),
    ]
    return {
      simSeconds: sec,
      analysis,
      combatCurrent,
      cycles,
      suggestions,
      chartLayouts,
      optimizationBaseLen: optimizationBase.length,
    }
  }
  const [calc, setCalc] = useState<WorkbenchCalcResult>(() => buildCalcResult([], [], 20))
  const suggestions = calc.suggestions
  const compactByOrder = (rows: PlacedCard[], allowedMask?: boolean[]): PlacedCard[] => compactByMask(rows, allowedMask)
  const suggestionPreview = useMemo(
    () => {
      const next = suggestions.find((s) => s.id === suggestPreviewId)?.next
      if (!next) return null
      return compactByMask(next, slotMask)
    },
    [suggestions, suggestPreviewId, slotMask],
  )
  const renderCards = preview || suggestionPreview || cards
  const renderReserveCards = reservePreview || reserveCards
  const combatDisplay = calc.combatCurrent

  const commit = (next: PlacedCard[]) => {
    const sorted = compactByOrder(next, slotMask)
    setCards(sorted)
    setSuggestPreviewId(null)
    if (selectedId && !sorted.some((c) => c.placementId === selectedId)) {
      setSelectedId(null)
    }
  }

  const commitReserve = (next: PlacedCard[]) => {
    const sorted = compactByOrder(next, slotMask)
    setReserveCards(sorted)
    if (selectedId && !cards.some((c) => c.placementId === selectedId) && !sorted.some((c) => c.placementId === selectedId)) {
      setSelectedId(null)
    }
  }

  const applyExample1 = () => {
    const { cards: demoCards, missing } = buildExample1Cards(itemsPool)
    if (!demoCards.length) {
      window.alert('全能核示例摆放失败：当前物品库中未找到示例卡牌。')
      return
    }
    setSlotMode(8)
    commit(demoCards)
    setReserveCards([])
    setPreview(null)
    setReservePreview(null)
    setSuggestPreviewId(null)
    setSelectedId(demoCards[0]?.placementId || null)
    if (demoCards[0]) onSelectItem(demoCards[0].item)
    if (missing.length > 0) {
      window.alert(`全能核示例已摆放，但缺少以下卡牌：${missing.join('、')}`)
    }
  }

  const applySuggestion = (nextMain: PlacedCard[]) => {
    const allMap = new Map<string, PlacedCard>()
    for (const c of [...cards, ...reserveCards]) allMap.set(c.placementId, c)
    const nextMainPacked = compactByOrder(nextMain, slotMask)
    const used = new Set(nextMainPacked.map((x) => x.placementId))
    const leftOver = Array.from(allMap.values()).filter((x) => !used.has(x.placementId))
    const nextReservePacked = compactByOrder(leftOver, slotMask)
    commit(nextMainPacked)
    setReserveCards(nextReservePacked)
    setPreview(null)
    setReservePreview(null)
    setSuggestPreviewId(null)
  }

  const requestCalculate = () => {
    const nextSeconds = Math.max(1, Math.min(90, Math.floor(Number(simSecondsDraft) || 1)))
    setSimSecondsDraft(nextSeconds)
    setSimSeconds(nextSeconds)
    setAutoOptimizeNote('')
    const snapshotMain = cards.map((c) => ({ ...c }))
    const snapshotReserve = reserveCards.map((c) => ({ ...c }))
    setIsCalculating(true)
    window.setTimeout(() => {
      try {
        const next = buildCalcResult(snapshotMain, snapshotReserve, nextSeconds)
        setCalc(next)
      } finally {
        setIsCalculating(false)
      }
    }, 16)
  }

  const requestAutoOptimize = () => {
    const nextSeconds = Math.max(1, Math.min(90, Math.floor(Number(simSecondsDraft) || 1)))
    setSimSecondsDraft(nextSeconds)
    setSimSeconds(nextSeconds)
    const initialMain = cards.map((c) => ({ ...c }))
    const initialReserve = reserveCards.map((c) => ({ ...c }))
    setIsCalculating(true)
    window.setTimeout(() => {
      try {
        const seen = new Set<string>()
        const maxRounds = 16
        let rounds = 0
        let currentMain = initialMain
        let currentReserve = initialReserve
        let result = buildCalcResult(currentMain, currentReserve, nextSeconds)
        const initialDamage = result.combatCurrent.totalDamage
        const initialShield = result.combatCurrent.totalShield

        while (rounds < maxRounds) {
          const sig = `${layoutSignature(compactByOrder(currentMain, slotMask))}||${layoutSignature(compactByOrder(currentReserve, slotMask))}`
          if (seen.has(sig)) break
          seen.add(sig)

          const curDamage = result.combatCurrent.totalDamage
          const curShield = result.combatCurrent.totalShield
          const better = result.suggestions
            .map((s) => ({ suggestion: s, packedMain: compactByOrder(s.next, slotMask) }))
            .filter((x) => {
              if (x.packedMain.length <= 0) return false
              if (x.suggestion.totalDamage > curDamage + 1e-6) return true
              return Math.abs(x.suggestion.totalDamage - curDamage) <= 1e-6 && x.suggestion.totalShield > curShield + 1e-6
            })
            .sort(
              (a, b) =>
                b.suggestion.totalDamage - a.suggestion.totalDamage ||
                b.suggestion.totalShield - a.suggestion.totalShield ||
                b.suggestion.totalUses - a.suggestion.totalUses,
            )
          if (!better.length) break

          const best = better[0]
          const allMap = new Map<string, PlacedCard>()
          for (const c of [...currentMain, ...currentReserve]) allMap.set(c.placementId, c)
          const used = new Set(best.packedMain.map((x) => x.placementId))
          const leftOver = Array.from(allMap.values()).filter((x) => !used.has(x.placementId))

          currentMain = best.packedMain
          currentReserve = compactByOrder(leftOver, slotMask)
          result = buildCalcResult(currentMain, currentReserve, nextSeconds)
          rounds += 1
        }

        setCards(currentMain)
        setReserveCards(currentReserve)
        setCalc(result)
        setPreview(null)
        setReservePreview(null)
        setSuggestPreviewId(null)
        if (selectedId && !currentMain.some((c) => c.placementId === selectedId) && !currentReserve.some((c) => c.placementId === selectedId)) {
          setSelectedId(null)
        }

        const gain = result.combatCurrent.totalDamage - initialDamage
        const shieldGain = result.combatCurrent.totalShield - initialShield
        if (rounds > 0 && (gain > 1e-6 || shieldGain > 1e-6)) {
          setAutoOptimizeNote(`自动寻优完成：迭代${rounds}轮，伤害 +${gain.toFixed(1)}，护盾 +${shieldGain.toFixed(1)}`)
        } else {
          setAutoOptimizeNote('自动寻优完成：当前已接近最优，无更优方案')
        }
      } finally {
        setIsCalculating(false)
      }
    }, 16)
  }

  const buildDropPreview = (
    targetBoard: BoardKey,
    dragged: DragPayload,
    target: number,
  ): { nextMain: PlacedCard[]; nextReserve: PlacedCard[]; movingItem: LabItem } | null => {
    const sourceBoard = dragged.sourceBoard
    const sourceMain = dragged.placementId ? cards.find((c) => c.placementId === dragged.placementId) : null
    const sourceReserve = dragged.placementId ? reserveCards.find((c) => c.placementId === dragged.placementId) : null
    const movingExisting = sourceMain || sourceReserve
    const movingItem = movingExisting?.item || dragged.item
    if (!movingItem) return null
    const width = movingExisting?.width || dragged.width || getCardWidth(movingItem.size)
    const moving: PlacedCard = movingExisting || {
      placementId: `${movingItem.id || 'card'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      item: movingItem,
      width,
      start: target,
      tier: asTier(movingItem.starting_tier),
    }

    const nextMainBase = [...cards]
    const nextReserveBase = [...reserveCards]
    if (movingExisting) {
      if ((sourceBoard === 'main' || sourceMain) && sourceMain) {
        const idx = nextMainBase.findIndex((c) => c.placementId === movingExisting.placementId)
        if (idx >= 0) nextMainBase.splice(idx, 1)
      }
      if ((sourceBoard === 'reserve' || sourceReserve) && sourceReserve) {
        const idx = nextReserveBase.findIndex((c) => c.placementId === movingExisting.placementId)
        if (idx >= 0) nextReserveBase.splice(idx, 1)
      }
    }

    if (targetBoard === 'main') {
      const nextTarget = autoLayout(nextMainBase, { ...moving, start: target, width }, target, slotMask)
      if (!nextTarget) return null
      return { nextMain: [...nextTarget].sort((a, b) => a.start - b.start), nextReserve: [...nextReserveBase].sort((a, b) => a.start - b.start), movingItem }
    }
    const nextTarget = autoLayout(nextReserveBase, { ...moving, start: target, width }, target, slotMask)
    if (!nextTarget) return null
    return { nextMain: [...nextMainBase].sort((a, b) => a.start - b.start), nextReserve: [...nextTarget].sort((a, b) => a.start - b.start), movingItem }
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
      const res = buildDropPreview('main', dragged, target)
      if (!res) {
        setPreview(null)
        return
      }
      setPreview(res.nextMain)
      setReservePreview(res.nextReserve)
    },
    drop: (dragged: DragPayload, monitor) => {
      if (dragged.sourceType === 'skills') return
      if (!boardRef.current) return
      const pt = monitor.getClientOffset()
      if (!pt) {
        if (preview) setCards(preview)
        if (reservePreview) setReserveCards(reservePreview)
        if (dragged.item) onSelectItem(dragged.item)
        window.requestAnimationFrame(() => {
          setPreview(null)
          setReservePreview(null)
        })
        return
      }
      const rect = boardRef.current.getBoundingClientRect()
      const unit = rect.width / MAX_UNITS
      const width = dragged.width || getCardWidth(dragged.item?.size)
      const target = Math.max(0, Math.min(MAX_UNITS - width, Math.round((pt.x - rect.left) / unit - width / 2)))

      const res = buildDropPreview('main', dragged, target)
      if (res) {
        setCards(res.nextMain)
        setReserveCards(res.nextReserve)
        onSelectItem(res.movingItem)
      }
      window.requestAnimationFrame(() => {
        setPreview(null)
        setReservePreview(null)
      })
    },
    collect: (monitor) => ({ isOver: monitor.isOver({ shallow: true }) }),
  }), [cards, reserveCards, selectedId, slotMask, preview, reservePreview, onSelectItem])

  const [{ isOverReserve }, dropReserve] = useDrop(() => ({
    accept: 'ITEM',
    hover: (dragged: DragPayload, monitor) => {
      if (!reserveBoardRef.current || dragged.sourceType === 'skills') return
      const pt = monitor.getClientOffset()
      if (!pt) return
      const rect = reserveBoardRef.current.getBoundingClientRect()
      const unit = rect.width / MAX_UNITS
      const width = dragged.width || getCardWidth(dragged.item?.size)
      const target = Math.max(0, Math.min(MAX_UNITS - width, Math.round((pt.x - rect.left) / unit - width / 2)))
      const res = buildDropPreview('reserve', dragged, target)
      if (!res) {
        setReservePreview(null)
        return
      }
      setPreview(res.nextMain)
      setReservePreview(res.nextReserve)
    },
    drop: (dragged: DragPayload, monitor) => {
      if (dragged.sourceType === 'skills') return
      if (!reserveBoardRef.current) return
      const pt = monitor.getClientOffset()
      if (!pt) {
        if (preview) setCards(preview)
        if (reservePreview) setReserveCards(reservePreview)
        if (dragged.item) onSelectItem(dragged.item)
        window.requestAnimationFrame(() => {
          setPreview(null)
          setReservePreview(null)
        })
        return
      }
      const rect = reserveBoardRef.current.getBoundingClientRect()
      const unit = rect.width / MAX_UNITS
      const width = dragged.width || getCardWidth(dragged.item?.size)
      const target = Math.max(0, Math.min(MAX_UNITS - width, Math.round((pt.x - rect.left) / unit - width / 2)))
      const res = buildDropPreview('reserve', dragged, target)
      if (res) {
        setCards(res.nextMain)
        setReserveCards(res.nextReserve)
        onSelectItem(res.movingItem)
      }
      window.requestAnimationFrame(() => {
        setPreview(null)
        setReservePreview(null)
      })
    },
    collect: (monitor) => ({ isOverReserve: monitor.isOver({ shallow: true }) }),
  }), [cards, reserveCards, selectedId, slotMask, preview, reservePreview, onSelectItem])

  useEffect(() => {
    setCards((prev) => compactByOrder(prev, slotMask))
    setReserveCards((prev) => compactByOrder(prev, slotMask))
    setPreview(null)
    setReservePreview(null)
    setSuggestPreviewId(null)
  }, [slotMask])

  const bindBoardRef = (node: HTMLDivElement | null) => {
    boardRef.current = node
    drop(node)
  }
  const bindReserveBoardRef = (node: HTMLDivElement | null) => {
    reserveBoardRef.current = node
    dropReserve(node)
  }

  useEffect(() => {
    if (!isOver) setPreview(null)
  }, [isOver])

  useEffect(() => {
    if (!isOverReserve) setReservePreview(null)
  }, [isOverReserve])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>机煲实验室 · 结构化充能解析</h3>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.sizeControl}>
            <span className={styles.axisLabel}>卡牌大小</span>
            <button
              className={styles.sizeBtn}
              onClick={() => setBoardScale((v) => Math.max(0.8, Math.round((v - 0.1) * 10) / 10))}
            >
              -
            </button>
            <span className={styles.sizeValue}>{Math.round(boardScale * 100)}%</span>
            <button
              className={styles.sizeBtn}
              onClick={() => setBoardScale((v) => Math.min(2.0, Math.round((v + 0.1) * 10) / 10))}
            >
              +
            </button>
          </div>
          <div className={styles.modeTabs}>
            {[6, 8, 10].map((m) => (
              <button
                key={m}
                className={`${styles.modeTab} ${slotMode === m ? styles.modeTabActive : ''}`}
                onClick={() => setSlotMode(m as SlotMode)}
              >
                {m}格
              </button>
            ))}
          </div>
          <button className={styles.applyBtn} onClick={applyExample1}>全能核示例</button>
          <button className={styles.clearBtn} onClick={() => { setCards([]); setReserveCards([]); setPreview(null); setReservePreview(null); setSelectedId(null) }}>清空</button>
        </div>
      </div>

      <LineupEditBoard
        title={`主阵容（最多${enabledUnits}格）`}
        cards={renderCards.map((c) => ({ ...c, borderTier: String(c.tier || 'bronze').toLowerCase() }))}
        sourceBoard="main"
        selectedId={selectedId}
        onSelectCard={(card) => {
          setSelectedId(card.placementId)
          onSelectItem(card.item)
        }}
        onRemoveCard={(placementId) => commit(cards.filter((c) => c.placementId !== placementId))}
        onAttachRef={bindBoardRef}
        isOver={isOver}
        useCountMap={combatDisplay.byCard}
        damageMap={combatDisplay.byCardDamage}
        shieldMap={combatDisplay.byCardShield}
        enabledMask={slotMask}
        boardScale={boardScale}
      />

      <LineupEditBoard
        title={`备选卡牌库（最多${enabledUnits}格，参与联合优化）`}
        cards={renderReserveCards.map((c) => ({ ...c, borderTier: String(c.tier || 'bronze').toLowerCase() }))}
        sourceBoard="reserve"
        selectedId={selectedId}
        onSelectCard={(card) => {
          setSelectedId(card.placementId)
          onSelectItem(card.item)
        }}
        onRemoveCard={(placementId) => commitReserve(reserveCards.filter((c) => c.placementId !== placementId))}
        onAttachRef={bindReserveBoardRef}
        isOver={isOverReserve}
        enabledMask={slotMask}
        boardScale={boardScale}
      />

      <div className={styles.statsRow}>
        <div className={styles.statItem}>{simSeconds}秒总伤害：<strong>{calc.combatCurrent.totalDamage.toFixed(1)}</strong></div>
        <div className={styles.statItem}>联合优化池：<strong>{calc.optimizationBaseLen}</strong> 张</div>
        <div className={styles.useCtrl}>
          <button className={styles.spinBtn} onClick={() => setSimSecondsDraft((v) => Math.max(1, v - 1))}>-</button>
          <input
            className={styles.useInput}
            type="number"
            min={1}
            max={90}
            value={simSecondsDraft}
            onChange={(e) => {
              const n = Number(e.target.value || 1)
              setSimSecondsDraft(Math.max(1, Math.min(90, Number.isFinite(n) ? Math.floor(n) : 1)))
            }}
          />
          <button className={styles.spinBtn} onClick={() => setSimSecondsDraft((v) => Math.min(90, v + 1))}>+</button>
          <button className={styles.applyBtn} onClick={requestCalculate}>计算伤害</button>
          <button className={styles.applyBtn} onClick={requestAutoOptimize}>计算并应用最优方案</button>
        </div>
      </div>
      {autoOptimizeNote ? <div className={styles.statItem}>{autoOptimizeNote}</div> : null}

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
          (() => {
            const selected = cards.find((c) => c.placementId === selectedId) || cards[0]
            if (!selected) return null
            const allowedTiers = getAllowedTiers(selected.item)
            const effectiveTier = getEffectiveTier(selected)
            const startTier = parseTierToken(
              selected.item?.starting_tier ||
                (selected.item as any)?.startingTier ||
                selected.item?.__raw?.starting_tier ||
                (selected.item?.__raw as any)?.startingTier ||
                'Bronze',
            ) as TierToken
            const defaultCd = getCardCooldownSecByTier(selected.item, effectiveTier)
            const currentCd = getCardCooldownSec(selected)
            const editableCd = defaultCd > 0
            const editableTier =
              allowedTiers.length > 1 && !(startTier === 'Diamond' || startTier === 'Legendary')
            return (
              <>
                <BorderTierSelector
                  title={`卡牌等级 · ${selected.item.name_cn || selected.item.name_en || selected.item.id}`}
                  options={allowedTiers.map((x) => String(x).toLowerCase())}
                  selected={String(effectiveTier).toLowerCase()}
                  editable={editableTier}
                  onSelect={(tier) => {
                    const nextTier = String(tier || '').toLowerCase()
                    const mapTier: Record<string, PlacedCard['tier']> = {
                      bronze: 'Bronze',
                      silver: 'Silver',
                      gold: 'Gold',
                      diamond: 'Diamond',
                      legendary: 'Legendary',
                    }
                    const normalized = mapTier[nextTier] || 'Bronze'
                    commit(cards.map((x) => (x.placementId === selected.placementId ? { ...x, tier: normalized, cooldownOverrideSec: undefined } : x)))
                  }}
                />
                <div className={styles.paramRow}>
                  <div className={styles.paramName}>冷却与附魔</div>
                  <button
                    className={`${styles.tagToggle} ${selected.shieldEnchanted ? styles.tagToggleOn : ''}`}
                    onClick={() =>
                      commit(cards.map((x) => (x.placementId === selected.placementId ? { ...x, shieldEnchanted: !x.shieldEnchanted } : x)))
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
                        value={Number.isFinite(selected.cooldownOverrideSec) ? String(selected.cooldownOverrideSec) : ''}
                        onChange={(e) => {
                          const v = e.target.value.trim()
                          const next = v === '' ? undefined : Math.max(0, Number(v))
                          commit(cards.map((x) => (x.placementId === selected.placementId ? { ...x, cooldownOverrideSec: next } : x)))
                        }}
                      />
                      <button
                        className={styles.paramReset}
                        onClick={() => commit(cards.map((x) => (x.placementId === selected.placementId ? { ...x, cooldownOverrideSec: undefined } : x)))}
                      >
                        重置
                      </button>
                      <div className={styles.paramHint}>当前CD {currentCd.toFixed(1)}s</div>
                    </>
                  ) : (
                    <div className={styles.paramPassive}>被动（无冷却）</div>
                  )}
                </div>
              </>
            )
          })()
        )}
      </div>

      {suggestions.length > 0 ? (
        <div className={styles.suggestWrap}>
          <div className={styles.sectionHead}>
            <div className={styles.suggestHead}>
              发现 {suggestions.length} 个备选方案（主阵容 + 备选库联合计算）
              {isCalculating ? ' · 计算中…' : ''}
            </div>
            <button className={styles.collapseBtn} onClick={() => setSuggestCollapsed((v) => !v)}>
              {suggestCollapsed ? '展开' : '收起'}
            </button>
          </div>
          {suggestCollapsed ? null : suggestions.map((s) => (
            <div key={s.id} className={styles.suggestRow}>
                <div className={styles.suggestText}>
                  方案{s.rank}：{simSeconds}秒总伤害 <strong>{s.totalDamage.toFixed(1)}</strong>
                  {' '}（较当前 {s.damageGain >= 0 ? '+' : ''}{s.damageGain.toFixed(1)}） · 总护盾 {s.totalShield.toFixed(1)} · 总出手 {s.totalUses}
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
                <button className={styles.applyBtn} onClick={() => applySuggestion(s.next)}>应用</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.okBox}>当前摆位暂无明显可提升项。</div>
      )}

      <div className={`${styles.listBox} ${styles.chartSection}`}>
        <div className={styles.listTitle}>累计伤害对比（每秒）</div>
        {calc.chartLayouts.length === 0 ? (
          <div className={styles.empty}>暂无可对比方案</div>
        ) : (
          <>
            <div className={styles.chartLegend}>
              {calc.chartLayouts.map((l) => (
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
                  ...calc.chartLayouts.map((l) => l.curve.reduce((m, v) => Math.max(m, v || 0), 0)),
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
                    {calc.chartLayouts.map((l) => {
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
          {calc.analysis.links.length === 0 ? <div className={styles.empty}>暂无</div> : calc.analysis.links.slice(0, 16).map((x, idx) => (
            <div key={`${x.from}-${x.to}-${idx}`} className={styles.lineItem}>
              {x.from} → {x.to}（{x.amount.toFixed(1)}秒）触发源：{x.triggeredBy || x.from}
            </div>
          ))}
        </div>
        <div className={styles.listBox}>
          <div className={styles.listTitle}>未生效连接</div>
          {calc.analysis.broken.length === 0 ? <div className={styles.empty}>暂无</div> : calc.analysis.broken.slice(0, 16).map((x, idx) => (
            <div key={`${x.from}-${x.mode}-${idx}`} className={styles.lineItem}>{x.from}（{x.mode}，{x.amount}）未命中：{x.reason}</div>
          ))}
        </div>
      </div>

      <div className={styles.detailLists}>
        <div className={styles.listBox}>
          <div className={styles.listTitle}>永续闭环检测（双向充能 vs 双方冷却）</div>
          {calc.cycles.length === 0 ? (
            <div className={styles.empty}>暂无双向充能对</div>
          ) : (
            calc.cycles.slice(0, 16).map((c, idx) => (
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

      {isCalculating ? (
        <div className={styles.calculatingOverlay}>
          <div className={styles.calculatingCard}>正在计算备选方案与伤害曲线，请稍候…</div>
        </div>
      ) : null}
    </div>
  )
}
