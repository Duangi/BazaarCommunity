'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDrop } from 'react-dnd'
import LineupEditBoard from '@/components/common/LineupEditBoard'
import BorderTierSelector from '@/components/common/BorderTierSelector'
import type { RuleSupportSummary } from '@/lib/ruleSupport'
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
  requiredConditionMode: 'and' | 'or'
  requiredAttrConditions: AttrCondition[]
  targetCount?: number
  targetExcludeSelf: boolean
  targetIncludeOrigin?: boolean
  triggerType: string
  triggerRequiredTags: string[]
  triggerRequiredExcludeTags: string[]
  triggerRequireCooldownOnly: boolean
  triggerRequiredSizes: string[]
  triggerRequiredExcludeSizes: string[]
  triggerConditionMode: 'and' | 'or'
  triggerAttrConditions: AttrCondition[]
  triggerExcludeSelf: boolean
  triggerSubjectType: string
  triggerSubjectMode: string
  triggerAttributeChanged?: string
  triggerChangeType?: string
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
type CalcMode = 'seconds' | 'target-damage'

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
  requiredConditionMode: 'and' | 'or'
  requiredAttrConditions: AttrCondition[]
  targetExcludeSelf: boolean
  targetIncludeOrigin?: boolean
  triggerType: string
  triggerRequiredTags: string[]
  triggerRequiredExcludeTags: string[]
  triggerRequireCooldownOnly: boolean
  triggerRequiredSizes: string[]
  triggerRequiredExcludeSizes: string[]
  triggerConditionMode: 'and' | 'or'
  triggerAttrConditions: AttrCondition[]
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
  totalBurnApplied: number
  totalPoisonApplied: number
  totalBurnTickDamage: number
  totalPoisonTickDamage: number
  randomTrials?: number
  totalDamageMin?: number
  totalDamageMax?: number
  totalDamageAvg?: number
  totalShield: number
  byCardDamage: Record<string, number>
  byCardBurn: Record<string, number>
  byCardPoison: Record<string, number>
  byCardShield: Record<string, number>
  cumulativeDamageBySecond: number[]
  debugTimeline: Array<{
    time: number
    kind: 'use' | 'charge' | 'burn-apply' | 'burn-tick' | 'poison-apply' | 'poison-tick'
    source: string
    target?: string
    value?: number
    note?: string
  }>
}

type CombatSimOptions = {
  stopAtDamage?: number
  opponentActiveCount?: number
  randomTrials?: number
  rng?: () => number
  _singleTrial?: boolean
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

function getDnDPoint(monitor: any): { x: number; y: number } | null {
  return (
    monitor?.getClientOffset?.() ||
    monitor?.getSourceClientOffset?.() ||
    monitor?.getInitialClientOffset?.() ||
    null
  )
}

function resolveBoardRect(node: HTMLDivElement): DOMRect {
  const inner = node.querySelector('[data-board-area="1"]') as HTMLDivElement | null
  return (inner || node).getBoundingClientRect()
}

function isLocalRuntimeDebug(): boolean {
  if (typeof window === 'undefined') return false
  const host = String(window.location.hostname || '').toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1') return true
  if (host.startsWith('192.168.')) return true
  if (host.startsWith('10.')) return true
  const m = host.match(/^172\.(\d+)\./)
  if (m) {
    const seg = Number(m[1])
    if (seg >= 16 && seg <= 31) return true
  }
  return false
}

function logDndLocal(stage: string, data?: any) {
  if (!isLocalRuntimeDebug()) return
  try {
    if (data === undefined) console.info(`[JibaoDnD] ${stage}`)
    else console.info(`[JibaoDnD] ${stage}`, data)
  } catch {}
}

function diagnoseAutoLayoutFailure(
  cardsWithoutMoving: PlacedCard[],
  moving: PlacedCard,
  targetStart: number,
  allowedMask?: boolean[],
): string {
  if (!Number.isFinite(moving.width) || moving.width <= 0) return `非法宽度 width=${moving.width}`
  if (moving.width > MAX_UNITS) return `宽度超上限 width=${moving.width}`
  const occ = buildOccupancy()
  const mStart = findNearestStart(occ, moving.width, targetStart, allowedMask)
  if (mStart == null) return `无法放入拖拽卡（target=${targetStart}, width=${moving.width}）`
  reserve(occ, mStart, moving.width)
  const sorted = [...cardsWithoutMoving].sort((a, b) => a.start - b.start)
  for (const c of sorted) {
    const s = findNearestStart(occ, c.width, c.start, allowedMask)
    if (s == null) {
      return `为拖拽卡腾位后，原卡无法回填：${c.item?.name_cn || c.item?.name_en || c.item?.id} width=${c.width} prefer=${c.start}`
    }
    reserve(occ, s, c.width)
  }
  return '未知失败'
}

const MAX_UNITS = 10
const EXAMPLE_1_ORDER: Array<{ name: string; tier: PlacedCard['tier'] }> = [
  { name: '弱点探测器', tier: 'Silver' },
  { name: '布胶带', tier: 'Bronze' },
  { name: '电钻', tier: 'Silver' },
  { name: '冲锋枪', tier: 'Silver' },
  { name: '全能核心', tier: 'Silver' },
  { name: '炫光 LED', tier: 'Silver' },
  { name: '尖刺铁丝网', tier: 'Bronze' },
]

const EXAMPLE_1_RESERVE_ORDER: Array<{ name: string; tier: PlacedCard['tier'] }> = [
  { name: '哈姆锤特', tier: 'Bronze' },
  { name: '等离子手雷', tier: 'Silver' },
]

const EXAMPLE_POISON_ORDER: Array<{ name: string; tier: PlacedCard['tier'] }> = [
  { name: '机械黑蜘蛛', tier: 'Gold' },
  { name: 'C.O.R.A.', tier: 'Gold' },
  { name: '伽马射线', tier: 'Silver' },
  { name: '獠牙', tier: 'Bronze' },
  { name: '炫光 LED', tier: 'Silver' },
  { name: '全能核心', tier: 'Gold' },
  { name: 'GPU', tier: 'Silver' },
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

function buildExampleCards(
  pool: LabItem[],
  specs: Array<{ name: string; tier: PlacedCard['tier'] }>,
  capacity: number,
  prefix: string,
): { cards: PlacedCard[]; missing: string[] } {
  const out: PlacedCard[] = []
  const missing: string[] = []
  let cursor = 0
  let idx = 0
  for (const spec of specs) {
    const name = spec.name
    const item = findItemByName(pool, name)
    if (!item) {
      missing.push(name)
      continue
    }
    const width = getCardWidth(item.size)
    if (cursor + width > capacity) break
    out.push({
      placementId: `${prefix}-${item.id}-${idx}`,
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

function resolveRawItem(item: LabItem): any {
  return (item as any)?.__raw || item || {}
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
  conditionMode: 'and' | 'or' = 'and',
): boolean {
  const set = getCardTagSet(card, auraTags)
  const req = requiredTags.map((x) => normalizeTag(x)).filter(Boolean)
  const ex = excludeTags.map((x) => normalizeTag(x)).filter(Boolean)
  const normalizeSize = (input: any): string => {
    const s = String(input || '').trim().toLowerCase()
    if (!s) return ''
    if (s.includes('small') || s.includes('小')) return 'small'
    if (s.includes('medium') || s.includes('中')) return 'medium'
    if (s.includes('large') || s.includes('大')) return 'large'
    return s.split('/')[0].trim()
  }
  const sizeNorm = normalizeSize(card.item.size)
  const reqSize = requiredSizes.map((x) => normalizeSize(x)).filter(Boolean)
  const exSize = excludeSizes.map((x) => normalizeSize(x)).filter(Boolean)
  if (ex.some((x) => set.has(x))) return false
  if (exSize.length > 0 && exSize.includes(sizeNorm)) return false

  const tagPass = req.length === 0 ? true : req.some((x) => set.has(x))
  const sizePass = reqSize.length === 0 ? true : reqSize.includes(sizeNorm)

  if (conditionMode === 'or' && req.length > 0 && reqSize.length > 0) {
    return tagPass || sizePass
  }
  return tagPass && sizePass
}

type AttrCondition = {
  attribute: string
  operator: string
  value: number
}

function normalizeComparator(op?: string): string {
  const s = String(op || '').trim().toLowerCase()
  if (s === 'equal' || s === '==') return 'eq'
  if (s === 'notequal' || s === '!=' || s === '<>') return 'ne'
  if (s === 'greaterthan' || s === '>') return 'gt'
  if (s === 'greaterthanorequal' || s === '>=') return 'ge'
  if (s === 'lessthan' || s === '<') return 'lt'
  if (s === 'lessthanorequal' || s === '<=') return 'le'
  return ''
}

function compareNumberByOp(left: number, op: string, right: number): boolean {
  const c = normalizeComparator(op)
  if (!Number.isFinite(left) || !Number.isFinite(right) || !c) return false
  if (c === 'eq') return left === right
  if (c === 'ne') return left !== right
  if (c === 'gt') return left > right
  if (c === 'ge') return left >= right
  if (c === 'lt') return left < right
  if (c === 'le') return left <= right
  return false
}

function resolveCardAttributeForCondition(
  card: PlacedCard,
  attrName: string,
  auraTags?: Map<string, Set<string>>,
  cards?: PlacedCard[],
): number {
  const name = String(attrName || '').trim()
  const lower = name.toLowerCase()
  const raw = resolveRawItem(card.item)
  const tier = getEffectiveTier(card)

  if (lower === 'cooldownmax' || lower === 'cooldown') return getCardCooldownSec(card, cards)
  if (lower === 'ammomax') return getCardAmmoMaxByTier(card.item, tier)

  if (lower === 'ammo') {
    const direct = Number((card.item as any)?.ammo)
    if (Number.isFinite(direct)) return direct
    return getCardAmmoMaxByTier(card.item, tier)
  }

  if (lower === 'flying') {
    const tagSet = getCardTagSet(card, auraTags)
    return tagSet.has('flying') || tagSet.has('飞行') ? 1 : 0
  }

  const fromTier = getAttrValueByTier(raw, name, tier)
  if (Number.isFinite(fromTier)) return fromTier

  const attrs = Array.isArray(raw?.attributes) ? raw.attributes : []
  const row = attrs.find((a: any) => String(a?.attribute || '').toLowerCase() === lower)
  if (row) {
    const byTier = Array.isArray(row.values_by_tier) ? row.values_by_tier : []
    const exact = byTier.find((x: any) => String(x?.tier || '') === tier)
    if (exact && Number.isFinite(Number(exact?.value))) return Number(exact.value)
    const first = byTier.find((x: any) => Number.isFinite(Number(x?.value)))
    if (first) return Number(first.value)
    const uniq = Array.isArray(row.unique_values) ? row.unique_values : []
    const u = uniq.find((x: any) => Number.isFinite(Number(x)))
    if (u != null) return Number(u)
  }
  return NaN
}

function matchesAttributeConditions(
  card: PlacedCard,
  conditions: AttrCondition[] = [],
  mode: 'and' | 'or' = 'and',
  auraTags?: Map<string, Set<string>>,
  cards?: PlacedCard[],
): boolean {
  if (!conditions.length) return true
  const checks = conditions.map((c) => {
    const left = resolveCardAttributeForCondition(card, c.attribute, auraTags, cards)
    return compareNumberByOp(left, c.operator, c.value)
  })
  if (mode === 'or') return checks.some(Boolean)
  return checks.every(Boolean)
}

function getTierIndex(tier: TierToken): number {
  const idx = TIER_ORDER.indexOf(tier)
  return idx >= 0 ? idx : 0
}

function resolveActionValue(actionValue: any, sourceTier: TierToken, startTierInput?: string): number {
  if (!actionValue || typeof actionValue !== 'object') return 0
  if (Number.isFinite(Number(actionValue?.Value))) return Number(actionValue.Value)
  const resolved = Array.isArray(actionValue?.resolved_values) ? actionValue.resolved_values : []
  if (resolved.length > 0) {
    const idx = getTierIndex(sourceTier)
    let resolvedIdx = Math.min(resolved.length - 1, idx)
    // Some cards only expose tiers from starting_tier onward (e.g. Silver/Gold/Diamond),
    // so resolved_values length can be 2-4 instead of full 5 tiers.
    if (resolved.length < 5) {
      const startTier = parseTierToken(String(startTierInput || 'Bronze')) as TierToken
      const startIdx = getTierIndex(startTier)
      resolvedIdx = Math.max(0, Math.min(resolved.length - 1, idx - startIdx))
    }
    const val = resolved[resolvedIdx]
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

  const raw = resolveRawItem(item)
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

function collectVisibleTypeTags(item: LabItem): Set<string> {
  const out = new Set<string>()
  const consume = (value: any) => {
    if (!value) return
    if (Array.isArray(value)) return value.forEach(consume)
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
      else if (en) out.add(en)
      else if (cn) out.add(cn)
    }
  }
  consume(item.tags)
  const raw = resolveRawItem(item)
  if (raw) {
    consume(raw.tags)
    consume(raw.tags_en)
    consume(raw.tags_cn)
  }
  return out
}

function computeBoardVisibleTypeCount(cards: PlacedCard[]): number {
  const all = new Set<string>()
  for (const c of cards) {
    collectVisibleTypeTags(c.item).forEach((t) => all.add(t))
  }
  return all.size
}

function cardHasUseTrigger(item: LabItem): boolean {
  const raw = resolveRawItem(item)
  const rows = Array.isArray(raw?.abilities_detail) ? raw.abilities_detail : []
  return rows.some((r: any) => {
    const tt = String(r?.trigger?.type || '').toLowerCase()
    return tt === 'ttriggeroncardfired' || tt === 'ttriggeronitemused' || tt === 'onuse'
  })
}

function extractConditionMeta(node: any): {
  include: string[]
  exclude: string[]
  includeSizes: string[]
  excludeSizes: string[]
  attrConditions: AttrCondition[]
  requireCooldownOnly: boolean
  notTriggerSource: boolean
  conditionMode: 'and' | 'or'
} {
  if (!node || typeof node !== 'object') {
    return {
      include: [],
      exclude: [],
      includeSizes: [],
      excludeSizes: [],
      attrConditions: [],
      requireCooldownOnly: false,
      notTriggerSource: false,
      conditionMode: 'and',
    }
  }

  const include: string[] = []
  const exclude: string[] = []
  const includeSizes: string[] = []
  const excludeSizes: string[] = []
  const attrConditions: AttrCondition[] = []
  let requireCooldownOnly = false
  let notTriggerSource = false
  const t = String(node.type || '').toLowerCase()
  let conditionMode: 'and' | 'or' = t.includes('conditionalor') ? 'or' : 'and'
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
    const attr = String(node.Attribute || node.attribute || '').trim()
    const cmp = String(node.ComparisonOperator || node.comparisonOperator || '').trim()
    const cv = Number(node?.ComparisonValue?.Value ?? node?.comparisonValue?.value ?? NaN)
    if (attr && cmp && Number.isFinite(cv)) {
      attrConditions.push({ attribute: attr, operator: cmp, value: cv })
    }
    if (attr.toLowerCase().includes('cooldown') && normalizeComparator(cmp) === 'gt' && Number.isFinite(cv) && cv >= 0) {
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
      attrConditions.push(...nested.attrConditions)
      requireCooldownOnly = requireCooldownOnly || nested.requireCooldownOnly
      notTriggerSource = notTriggerSource || nested.notTriggerSource
      if (nested.conditionMode === 'or') conditionMode = 'or'
    }
  }
  if (node.conditions) {
    const nested = extractConditionMeta(node.conditions)
    include.push(...nested.include)
    exclude.push(...nested.exclude)
    includeSizes.push(...nested.includeSizes)
    excludeSizes.push(...nested.excludeSizes)
    attrConditions.push(...nested.attrConditions)
    requireCooldownOnly = requireCooldownOnly || nested.requireCooldownOnly
    notTriggerSource = notTriggerSource || nested.notTriggerSource
    if (nested.conditionMode === 'or') conditionMode = 'or'
  }

  return {
    include: Array.from(new Set(include)),
    exclude: Array.from(new Set(exclude)),
    includeSizes: Array.from(new Set(includeSizes)),
    excludeSizes: Array.from(new Set(excludeSizes)),
    attrConditions,
    requireCooldownOnly,
    notTriggerSource,
    conditionMode,
  }
}

type TriggerBranch = {
  type: string
  subject: any
  raw?: any
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
  return [{ type: triggerType, subject, raw: trigger }]
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

function getCardCooldownSecByTier(item: LabItem, tier: string, overrideSec?: number, cards?: PlacedCard[]): number {
  if (Number.isFinite(overrideSec) && Number(overrideSec) >= 0) return Number(overrideSec)

  const normalizeCd = (v: number): number => {
    if (!Number.isFinite(v) || v <= 0) return 0
    return v >= 100 ? v / 1000 : v
  }

  const rawItem: any = resolveRawItem(item)
  // Passive-only cards should not be treated as active cooldown cards.
  if (!cardHasUseTrigger(item)) return 0
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
          if (vals[rel] != null) {
            let base = vals[rel]
            if (String(item.name_cn || item.name_en || '') === '划艇' && Array.isArray(cards)) {
              // 划艇：当场上可见类型总数 >=7 时，冷却缩短5秒
              const typeCount = computeBoardVisibleTypeCount(cards)
              if (typeCount >= 7) base = Math.max(0, base - 5)
            }
            return base
          }
        }
      }
      let base = vals[vals.length - 1]
      if (String(item.name_cn || item.name_en || '') === '划艇' && Array.isArray(cards)) {
        const typeCount = computeBoardVisibleTypeCount(cards)
        if (typeCount >= 7) base = Math.max(0, base - 5)
      }
      return base
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
      if (v > 0) {
        if (String(item.name_cn || item.name_en || '') === '划艇' && Array.isArray(cards) && computeBoardVisibleTypeCount(cards) >= 7) {
          return Math.max(0, v - 5)
        }
        return v
      }
    }
    const firstTier = byTier.find((r: any) => Number.isFinite(Number(r?.value)))
    if (firstTier) {
      const v = normalizeCd(Number(firstTier.value))
      if (v > 0) {
        if (String(item.name_cn || item.name_en || '') === '划艇' && Array.isArray(cards) && computeBoardVisibleTypeCount(cards) >= 7) {
          return Math.max(0, v - 5)
        }
        return v
      }
    }
    const uniq = Array.isArray(cdAttr?.unique_values) ? cdAttr.unique_values : []
    const firstUniq = uniq.find((x: any) => Number.isFinite(Number(x)))
    if (firstUniq != null) {
      const v = normalizeCd(Number(firstUniq))
      if (v > 0) {
        if (String(item.name_cn || item.name_en || '') === '划艇' && Array.isArray(cards) && computeBoardVisibleTypeCount(cards) >= 7) {
          return Math.max(0, v - 5)
        }
        return v
      }
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
    let base = normalizeCd(attrCooldown)
    if (String(item.name_cn || item.name_en || '') === '划艇' && Array.isArray(cards) && computeBoardVisibleTypeCount(cards) >= 7) {
      base = Math.max(0, base - 5)
    }
    return base
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
    let base = normalizeCd(raw)
    if (String(item.name_cn || item.name_en || '') === '划艇' && Array.isArray(cards) && computeBoardVisibleTypeCount(cards) >= 7) {
      base = Math.max(0, base - 5)
    }
    return base
  }
  return 0
}

function getCardCooldownSec(card: PlacedCard, cards?: PlacedCard[]): number {
  return getCardCooldownSecByTier(card.item, getEffectiveTier(card), card.cooldownOverrideSec, cards)
}

function getCardAmmoMaxByTier(item: LabItem, tierInput?: string): number {
  const raw = resolveRawItem(item)
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
  const raw = resolveRawItem(item)

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
    const rawTargetCount = Number(
      target?.target_count ??
      target?.TargetCount ??
      action?.target_count ??
      action?.TargetCount ??
      row?.target_count ??
      row?.TargetCount,
    )
    const targetCount = Number.isFinite(rawTargetCount) && rawTargetCount > 0 ? Math.floor(rawTargetCount) : undefined
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    const targetSection = String(target.TargetSection || target.targetSection || '')
    const sourceTags = collectTagSet(item)
    const sourceIsCore = sourceTags.has('core') || sourceTags.has('核心')
    const includeOriginByRule =
      sourceIsCore &&
      targetType === 'TTargetCardPositional' &&
      targetMode === 'AllRightCards' &&
      String(row?.trigger?.type || '') === 'TTriggerOnCardFired'
    const condMeta = extractConditionMeta(target.conditions || target.Conditions)
    const triggerBranches = expandTriggerBranches(row?.trigger || {})
    const description = String(row.description_cn || row.description_en || '').trim()
    for (const branch of triggerBranches) {
      const subject = branch.subject || {}
      const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions)
      const triggerExcludeSelf = Boolean(subject.ExcludeSelf)
      const targetExcludeSelf = Boolean(target.ExcludeSelf)
      const targetIncludeOrigin = Boolean(target.IncludeOrigin ?? target.includeOrigin)
      const triggerSubjectType = String(subject.type || '')
      const triggerSubjectMode = String(subject.TargetMode || subject.targetMode || '')
      const triggerRaw = (branch as any)?.raw || row?.trigger || {}

      const r: ChargeRule = {
        sourceName: item.name_cn || item.name_en || item.id,
        sourceId: item.id,
        amount,
        amountByTier,
        targetType,
        targetMode,
        targetSection,
        targetCount,
        requiredTags: condMeta.include,
        requiredExcludeTags: condMeta.exclude,
        requiredSizes: condMeta.includeSizes,
        requiredExcludeSizes: condMeta.excludeSizes,
        requiredConditionMode: condMeta.conditionMode,
        requiredAttrConditions: condMeta.attrConditions,
        requiredCooldownOnly: condMeta.requireCooldownOnly,
        requiredNotTriggerSource: condMeta.notTriggerSource,
        targetExcludeSelf,
        targetIncludeOrigin,
        triggerType: String(branch.type || ''),
        triggerRequiredTags: triggerMeta.include,
        triggerRequiredExcludeTags: triggerMeta.exclude,
        triggerRequiredSizes: triggerMeta.includeSizes,
        triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
        triggerConditionMode: triggerMeta.conditionMode,
        triggerAttrConditions: triggerMeta.attrConditions,
        triggerRequireCooldownOnly: triggerMeta.requireCooldownOnly,
        triggerExcludeSelf,
        triggerSubjectType,
        triggerSubjectMode,
        triggerAttributeChanged: String(triggerRaw.AttributeChanged || triggerRaw.attributeChanged || ''),
        triggerChangeType: String(triggerRaw.ChangeType || triggerRaw.changeType || ''),
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
  const raw = resolveRawItem(item)
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
    const rawTargetCount = Number(
      target?.target_count ??
      target?.TargetCount ??
      action?.target_count ??
      action?.TargetCount ??
      row?.target_count ??
      row?.TargetCount,
    )
    const targetCount = Number.isFinite(rawTargetCount) && rawTargetCount > 0 ? Math.floor(rawTargetCount) : undefined
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    const targetSection = String(target.TargetSection || target.targetSection || '')
    const sourceTags = collectTagSet(item)
    const sourceIsCore = sourceTags.has('core') || sourceTags.has('核心')
    const includeOriginByRule =
      sourceIsCore &&
      targetType === 'TTargetCardPositional' &&
      targetMode === 'AllRightCards' &&
      String(row?.trigger?.type || '') === 'TTriggerOnCardFired'
    const condMeta = extractConditionMeta(target.conditions || target.Conditions)
    const description = String(row.description_cn || row.description_en || '').trim()
    const triggerBranches = expandTriggerBranches(row?.trigger || {})

    for (const branch of triggerBranches) {
      const subject = branch.subject || {}
      const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions)
      const triggerExcludeSelf = Boolean(subject.ExcludeSelf)
      const targetExcludeSelf = Boolean(target.ExcludeSelf)
      const targetIncludeOrigin = Boolean(target.IncludeOrigin ?? target.includeOrigin)
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
        targetCount,
        requiredTags: condMeta.include,
        requiredExcludeTags: condMeta.exclude,
        requiredSizes: condMeta.includeSizes,
        requiredExcludeSizes: condMeta.excludeSizes,
        requiredConditionMode: condMeta.conditionMode,
        requiredAttrConditions: condMeta.attrConditions,
        requiredCooldownOnly: condMeta.requireCooldownOnly,
        requiredNotTriggerSource: condMeta.notTriggerSource,
        targetExcludeSelf,
        targetIncludeOrigin,
        triggerType: String(branch.type || ''),
        triggerRequiredTags: triggerMeta.include,
        triggerRequiredExcludeTags: triggerMeta.exclude,
        triggerRequiredSizes: triggerMeta.includeSizes,
        triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
        triggerConditionMode: triggerMeta.conditionMode,
        triggerAttrConditions: triggerMeta.attrConditions,
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

function readSlowRules(item: LabItem, tierInput?: string): ChargeRule[] {
  const raw = resolveRawItem(item)
  const tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier)
  const rows = [
    ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
    ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
  ]

  const out: ChargeRule[] = []
  for (const row of rows) {
    const action = row?.action || {}
    if (String(action.type || '') !== 'TActionCardSlow') continue
    const amount = getAttrValueByTier(raw, String(action.attribute_type || 'SlowAmount'), tier)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const amountByTier = getAttrValuesByTier(raw, String(action.attribute_type || 'SlowAmount'))
    const target = action.target || {}
    const rawTargetCount = Number(
      target?.target_count ??
      target?.TargetCount ??
      action?.target_count ??
      action?.TargetCount ??
      row?.target_count ??
      row?.TargetCount,
    )
    const targetCount = Number.isFinite(rawTargetCount) && rawTargetCount > 0 ? Math.floor(rawTargetCount) : undefined
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    const targetSection = String(target.TargetSection || target.targetSection || '')
    const sourceTags = collectTagSet(item)
    const sourceIsCore = sourceTags.has('core') || sourceTags.has('核心')
    const includeOriginByRule =
      sourceIsCore &&
      targetType === 'TTargetCardPositional' &&
      targetMode === 'AllRightCards' &&
      String(row?.trigger?.type || '') === 'TTriggerOnCardFired'
    const condMeta = extractConditionMeta(target.conditions || target.Conditions)
    const description = String(row.description_cn || row.description_en || '').trim()
    const triggerBranches = expandTriggerBranches(row?.trigger || {})

    for (const branch of triggerBranches) {
      const subject = branch.subject || {}
      const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions)
      const triggerExcludeSelf = Boolean(subject.ExcludeSelf)
      const targetExcludeSelf = Boolean(target.ExcludeSelf)
      const targetIncludeOrigin = Boolean(target.IncludeOrigin ?? target.includeOrigin)
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
        targetCount,
        requiredTags: condMeta.include,
        requiredExcludeTags: condMeta.exclude,
        requiredSizes: condMeta.includeSizes,
        requiredExcludeSizes: condMeta.excludeSizes,
        requiredConditionMode: condMeta.conditionMode,
        requiredAttrConditions: condMeta.attrConditions,
        requiredCooldownOnly: condMeta.requireCooldownOnly,
        requiredNotTriggerSource: condMeta.notTriggerSource,
        targetExcludeSelf,
        targetIncludeOrigin,
        triggerType: String(branch.type || ''),
        triggerRequiredTags: triggerMeta.include,
        triggerRequiredExcludeTags: triggerMeta.exclude,
        triggerRequiredSizes: triggerMeta.includeSizes,
        triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
        triggerConditionMode: triggerMeta.conditionMode,
        triggerAttrConditions: triggerMeta.attrConditions,
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

function readFreezeRules(item: LabItem, tierInput?: string): ChargeRule[] {
  const raw = resolveRawItem(item)
  const tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier)
  const rows = [
    ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
    ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
  ]

  const out: ChargeRule[] = []
  for (const row of rows) {
    const action = row?.action || {}
    if (String(action.type || '') !== 'TActionCardFreeze') continue
    const amount = getAttrValueByTier(raw, String(action.attribute_type || 'FreezeAmount'), tier)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const amountByTier = getAttrValuesByTier(raw, String(action.attribute_type || 'FreezeAmount'))
    const target = action.target || {}
    const rawTargetCount = Number(
      target?.target_count ??
      target?.TargetCount ??
      action?.target_count ??
      action?.TargetCount ??
      row?.target_count ??
      row?.TargetCount,
    )
    const targetCount = Number.isFinite(rawTargetCount) && rawTargetCount > 0 ? Math.floor(rawTargetCount) : undefined
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    const targetSection = String(target.TargetSection || target.targetSection || '')
    const condMeta = extractConditionMeta(target.conditions || target.Conditions)
    const description = String(row.description_cn || row.description_en || '').trim()
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
        targetCount,
        requiredTags: condMeta.include,
        requiredExcludeTags: condMeta.exclude,
        requiredSizes: condMeta.includeSizes,
        requiredExcludeSizes: condMeta.excludeSizes,
        requiredConditionMode: condMeta.conditionMode,
        requiredAttrConditions: condMeta.attrConditions,
        requiredCooldownOnly: condMeta.requireCooldownOnly,
        requiredNotTriggerSource: condMeta.notTriggerSource,
        targetExcludeSelf: Boolean(target.ExcludeSelf),
        targetIncludeOrigin: Boolean(target.IncludeOrigin ?? target.includeOrigin),
        triggerType: String(branch.type || ''),
        triggerRequiredTags: triggerMeta.include,
        triggerRequiredExcludeTags: triggerMeta.exclude,
        triggerRequiredSizes: triggerMeta.includeSizes,
        triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
        triggerConditionMode: triggerMeta.conditionMode,
        triggerAttrConditions: triggerMeta.attrConditions,
        triggerRequireCooldownOnly: triggerMeta.requireCooldownOnly,
        triggerExcludeSelf: Boolean(subject.ExcludeSelf),
        triggerSubjectType: String(subject.type || ''),
        triggerSubjectMode: String(subject.TargetMode || subject.targetMode || ''),
        description,
      })
    }
  }
  return out
}

function readDestructionRules(item: LabItem, tierInput?: string): ChargeRule[] {
  const raw = resolveRawItem(item)
  const tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier)
  const rows = [
    ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
    ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
  ]
  const out: ChargeRule[] = []
  for (const row of rows) {
    const action = row?.action || {}
    const actionType = String(action.type || '')
    if (actionType !== 'TActionCardDestroy' && actionType !== 'TActionCardTransformDestroyed') continue
    const target = action.target || {}
    const rawTargetCount = Number(
      target?.target_count ??
      target?.TargetCount ??
      action?.target_count ??
      action?.TargetCount ??
      row?.target_count ??
      row?.TargetCount,
    )
    const targetCount = Number.isFinite(rawTargetCount) && rawTargetCount > 0 ? Math.floor(rawTargetCount) : undefined
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    const targetSection = String(target.TargetSection || target.targetSection || '')
    const condMeta = extractConditionMeta(target.conditions || target.Conditions)
    const triggerBranches = expandTriggerBranches(row?.trigger || {})
    const description = String(row.description_cn || row.description_en || '').trim()
    for (const branch of triggerBranches) {
      const subject = branch.subject || {}
      const triggerMeta = extractConditionMeta(subject.Conditions || subject.conditions)
      out.push({
        sourceName: item.name_cn || item.name_en || item.id,
        sourceId: item.id,
        amount: 1,
        amountByTier: { Bronze: 1, Silver: 1, Gold: 1, Diamond: 1, Legendary: 1 },
        targetType,
        targetMode,
        targetSection,
        targetCount,
        requiredTags: condMeta.include,
        requiredExcludeTags: condMeta.exclude,
        requiredSizes: condMeta.includeSizes,
        requiredExcludeSizes: condMeta.excludeSizes,
        requiredConditionMode: condMeta.conditionMode,
        requiredAttrConditions: condMeta.attrConditions,
        requiredCooldownOnly: condMeta.requireCooldownOnly,
        requiredNotTriggerSource: condMeta.notTriggerSource,
        targetExcludeSelf: Boolean(target.ExcludeSelf),
        targetIncludeOrigin: Boolean(target.IncludeOrigin ?? target.includeOrigin),
        triggerType: String(branch.type || ''),
        triggerRequiredTags: triggerMeta.include,
        triggerRequiredExcludeTags: triggerMeta.exclude,
        triggerRequiredSizes: triggerMeta.includeSizes,
        triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
        triggerConditionMode: triggerMeta.conditionMode,
        triggerAttrConditions: triggerMeta.attrConditions,
        triggerRequireCooldownOnly: triggerMeta.requireCooldownOnly,
        triggerExcludeSelf: Boolean(subject.ExcludeSelf),
        triggerSubjectType: String(subject.type || ''),
        triggerSubjectMode: String(subject.TargetMode || subject.targetMode || ''),
        description,
      })
    }
  }
  return out
}

function readForceUseRules(item: LabItem, tierInput?: string): ChargeRule[] {
  const raw = resolveRawItem(item)
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
    const sourceTags = collectTagSet(item)
    const sourceIsCore = sourceTags.has('core') || sourceTags.has('核心')
    const includeOriginByRule =
      sourceIsCore &&
      targetType === 'TTargetCardPositional' &&
      targetMode === 'AllRightCards' &&
      String(row?.trigger?.type || '') === 'TTriggerOnCardFired'
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
        requiredConditionMode: condMeta.conditionMode,
        requiredAttrConditions: condMeta.attrConditions,
        requiredCooldownOnly: condMeta.requireCooldownOnly,
        requiredNotTriggerSource: condMeta.notTriggerSource,
        targetExcludeSelf: Boolean(target.ExcludeSelf),
        targetIncludeOrigin: Boolean(target.IncludeOrigin ?? target.includeOrigin) || includeOriginByRule,
        triggerType: String(branch.type || ''),
        triggerRequiredTags: triggerMeta.include,
        triggerRequiredExcludeTags: triggerMeta.exclude,
        triggerRequiredSizes: triggerMeta.includeSizes,
        triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
        triggerConditionMode: triggerMeta.conditionMode,
        triggerAttrConditions: triggerMeta.attrConditions,
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
  const raw = resolveRawItem(item)
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
    const sourceTags = collectTagSet(item)
    const sourceIsCore = sourceTags.has('core') || sourceTags.has('核心')
    const includeOriginByRule =
      sourceIsCore &&
      targetType === 'TTargetCardPositional' &&
      targetMode === 'AllRightCards' &&
      String(row?.trigger?.type || '') === 'TTriggerOnCardFired'
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
        requiredConditionMode: condMeta.conditionMode,
        requiredAttrConditions: condMeta.attrConditions,
        requiredCooldownOnly: condMeta.requireCooldownOnly,
        requiredNotTriggerSource: condMeta.notTriggerSource,
        targetExcludeSelf: Boolean(target.ExcludeSelf),
        targetIncludeOrigin: Boolean(target.IncludeOrigin ?? target.includeOrigin) || includeOriginByRule,
        triggerType: String(branch.type || ''),
        triggerRequiredTags: triggerMeta.include,
        triggerRequiredExcludeTags: triggerMeta.exclude,
        triggerRequiredSizes: triggerMeta.includeSizes,
        triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
        triggerConditionMode: triggerMeta.conditionMode,
        triggerAttrConditions: triggerMeta.attrConditions,
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
  const raw = resolveRawItem(item)
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
    const sourceTags = collectTagSet(item)
    const sourceIsCore = sourceTags.has('core') || sourceTags.has('核心')
    const includeOriginByRule =
      sourceIsCore &&
      targetType === 'TTargetCardPositional' &&
      targetMode === 'AllRightCards' &&
      String(row?.trigger?.type || '') === 'TTriggerOnCardFired'
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
        requiredConditionMode: condMeta.conditionMode,
        requiredAttrConditions: condMeta.attrConditions,
        requiredCooldownOnly: condMeta.requireCooldownOnly,
        requiredNotTriggerSource: condMeta.notTriggerSource,
        targetExcludeSelf: Boolean(target.ExcludeSelf),
        targetIncludeOrigin: Boolean(target.IncludeOrigin ?? target.includeOrigin) || includeOriginByRule,
        triggerType: String(branch.type || ''),
        triggerRequiredTags: triggerMeta.include,
        triggerRequiredExcludeTags: triggerMeta.exclude,
        triggerRequiredSizes: triggerMeta.includeSizes,
        triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
        triggerConditionMode: triggerMeta.conditionMode,
        triggerAttrConditions: triggerMeta.attrConditions,
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
  const raw = resolveRawItem(item)
  const tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier) as TierToken
  const rows = [
    ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
    ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
  ]
  const out: Array<ChargeRule & { valueAmount: number }> = []
  for (const row of rows) {
    const action = row?.action || {}
    if (String(action.type || '') !== 'TActionCardModifyAttribute') continue
    const valueAmount = Math.abs(resolveActionValue(action?.value, tier, String(raw?.starting_tier || item.starting_tier || 'Bronze')))
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
      const targetIncludeOrigin = Boolean(target.IncludeOrigin ?? target.includeOrigin)
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
        requiredConditionMode: condMeta.conditionMode,
        requiredAttrConditions: condMeta.attrConditions,
        requiredCooldownOnly: condMeta.requireCooldownOnly,
        requiredNotTriggerSource: condMeta.notTriggerSource,
        targetExcludeSelf,
        targetIncludeOrigin,
        triggerType: String(branch.type || ''),
        triggerRequiredTags: triggerMeta.include,
        triggerRequiredExcludeTags: triggerMeta.exclude,
        triggerRequiredSizes: triggerMeta.includeSizes,
        triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
        triggerConditionMode: triggerMeta.conditionMode,
        triggerAttrConditions: triggerMeta.attrConditions,
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
  const raw = resolveRawItem(item)
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
    if (!['DamageAmount', 'BurnAmount', 'BurnApplyAmount', 'PoisonAmount', 'PoisonApplyAmount', 'ShieldApplyAmount'].includes(attributeType)) continue
    const valueAmount = Math.abs(resolveActionValue(action?.value, tier, String(raw?.starting_tier || item.starting_tier || 'Bronze')))
    if (!Number.isFinite(valueAmount) || valueAmount <= 0) continue
    const target = action.target || {}
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    const targetSection = String(target.TargetSection || target.targetSection || '')
    const sourceTags = collectTagSet(item)
    const sourceIsCore = sourceTags.has('core') || sourceTags.has('核心')
    const includeOriginByRule =
      sourceIsCore &&
      targetType === 'TTargetCardPositional' &&
      targetMode === 'AllRightCards' &&
      String(row?.trigger?.type || '') === 'TTriggerOnCardFired'
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
        requiredConditionMode: condMeta.conditionMode,
        requiredAttrConditions: condMeta.attrConditions,
        requiredCooldownOnly: condMeta.requireCooldownOnly,
        requiredNotTriggerSource: condMeta.notTriggerSource,
        targetExcludeSelf: Boolean(target.ExcludeSelf),
        targetIncludeOrigin: Boolean(target.IncludeOrigin ?? target.includeOrigin) || includeOriginByRule,
        triggerType: String(branch.type || ''),
        triggerRequiredTags: triggerMeta.include,
        triggerRequiredExcludeTags: triggerMeta.exclude,
        triggerRequiredSizes: triggerMeta.includeSizes,
        triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
        triggerConditionMode: triggerMeta.conditionMode,
        triggerAttrConditions: triggerMeta.attrConditions,
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
  const raw = resolveRawItem(item)
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
        requiredConditionMode: condMeta.conditionMode,
        requiredAttrConditions: condMeta.attrConditions,
        requiredCooldownOnly: condMeta.requireCooldownOnly,
        requiredNotTriggerSource: condMeta.notTriggerSource,
        targetExcludeSelf: Boolean(target.ExcludeSelf),
        targetIncludeOrigin: Boolean(target.IncludeOrigin ?? target.includeOrigin),
        triggerType: String(branch.type || ''),
        triggerRequiredTags: triggerMeta.include,
        triggerRequiredExcludeTags: triggerMeta.exclude,
        triggerRequiredSizes: triggerMeta.includeSizes,
        triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
        triggerConditionMode: triggerMeta.conditionMode,
        triggerAttrConditions: triggerMeta.attrConditions,
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

function readPoisonApplyRules(item: LabItem, tierInput?: string): ChargeRule[] {
  const raw = resolveRawItem(item)
  const tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier)
  const rows = [
    ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
    ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
  ]
  const out: ChargeRule[] = []
  for (const row of rows) {
    const action = row?.action || {}
    if (String(action.type || '') !== 'TActionPlayerPoisonApply') continue
    const target = action.target || {}
    const targetType = String(target.type || '')
    const targetMode = String(target.TargetMode || target.targetMode || '')
    // 仅处理“对手施加剧毒”的规则，己方/其他目标暂不纳入伤害模拟
    if (!(targetType === 'TTargetPlayerRelative' && targetMode === 'Opponent')) continue
    const amount = getAttrValueByTier(raw, String(action.attribute_type || 'PoisonApplyAmount'), tier)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const amountByTier = getAttrValuesByTier(raw, String(action.attribute_type || 'PoisonApplyAmount'))
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
        targetSection: String(target.TargetSection || target.targetSection || ''),
        requiredTags: condMeta.include,
        requiredExcludeTags: condMeta.exclude,
        requiredSizes: condMeta.includeSizes,
        requiredExcludeSizes: condMeta.excludeSizes,
        requiredConditionMode: condMeta.conditionMode,
        requiredAttrConditions: condMeta.attrConditions,
        requiredCooldownOnly: condMeta.requireCooldownOnly,
        requiredNotTriggerSource: condMeta.notTriggerSource,
        targetExcludeSelf: Boolean(target.ExcludeSelf),
        targetIncludeOrigin: Boolean(target.IncludeOrigin ?? target.includeOrigin),
        triggerType: String(branch.type || ''),
        triggerRequiredTags: triggerMeta.include,
        triggerRequiredExcludeTags: triggerMeta.exclude,
        triggerRequiredSizes: triggerMeta.includeSizes,
        triggerRequiredExcludeSizes: triggerMeta.excludeSizes,
        triggerConditionMode: triggerMeta.conditionMode,
        triggerAttrConditions: triggerMeta.attrConditions,
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
  return readAttributeOnUse(item, tierInput, 'TActionPlayerDamage')
}

function readBurnOnUse(item: LabItem, tierInput?: string): number {
  return readAttributeOnUse(item, tierInput, 'TActionPlayerBurnApply', true)
}

function readPoisonOnUse(item: LabItem, tierInput?: string): number {
  return readAttributeOnUse(item, tierInput, 'TActionPlayerPoisonApply', true)
}

function readAttributeOnUse(
  item: LabItem,
  tierInput: string | undefined,
  actionType: string,
  opponentOnly = false,
): number {
  const raw = resolveRawItem(item)
  const tier = parseTierToken(tierInput || item.starting_tier || raw.starting_tier) as TierToken
  const rows = [
    ...(Array.isArray(raw.abilities_detail) ? raw.abilities_detail : []),
    ...(Array.isArray(raw.auras_detail) ? raw.auras_detail : []),
  ]
  let sum = 0
  for (const row of rows) {
    const action = row?.action || {}
    if (String(action.type || '') !== actionType) continue
    if (opponentOnly) {
      const target = action?.target || {}
      const targetType = String(target.type || '')
      const targetMode = String(target.TargetMode || target.targetMode || '')
      if (!(targetType === 'TTargetPlayerRelative' && targetMode === 'Opponent')) continue
    }
    const triggerType = String(row?.trigger?.type || '')
    if (triggerType && triggerType !== 'TTriggerOnCardFired') continue
    const attrType = String(action.attribute_type || '')
    let value = 0
    if (attrType) value = getAttrValueByTier(raw, attrType, tier)
    else value = resolveActionValue(action?.value, tier, String(raw?.starting_tier || item.starting_tier || 'Bronze'))
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
      rule.triggerConditionMode || 'and',
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
    if (condMeta.requireCooldownOnly && getCardCooldownSec(c, cards) <= 0) return false
    const tagOk = matchesCardTags(c, condMeta.include, condMeta.exclude, condMeta.includeSizes, condMeta.excludeSizes, auraTags, condMeta.conditionMode)
    if (!tagOk) return false
    return matchesAttributeConditions(c, condMeta.attrConditions, condMeta.conditionMode, auraTags, cards)
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
    if (condMeta.requireCooldownOnly && getCardCooldownSec(c, cards) <= 0) return false
    const tagOk = matchesCardTags(c, condMeta.include, condMeta.exclude, condMeta.includeSizes, condMeta.excludeSizes, auraTags, condMeta.conditionMode)
    if (!tagOk) return false
    return matchesAttributeConditions(c, condMeta.attrConditions, condMeta.conditionMode, auraTags, cards)
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
      const srcRaw = resolveRawItem(source.item)
      const bonus = resolveActionValue(action?.value, getEffectiveTier(source), String(srcRaw?.starting_tier || source.item.starting_tier || 'Bronze'))
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
    if (needsCd && getCardCooldownSec(c, cards) <= 0) return false
    const tagOk = matchesCardTags(
      c,
      rule.triggerRequiredTags,
      rule.triggerRequiredExcludeTags,
      rule.triggerRequiredSizes,
      rule.triggerRequiredExcludeSizes,
      auraTags,
      rule.triggerConditionMode || 'and',
    )
    if (!tagOk) return false
    return matchesAttributeConditions(c, rule.triggerAttrConditions || [], rule.triggerConditionMode || 'and', auraTags, cards)
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
  rng?: (() => number) | null,
): PlacedCard[] {
  const includeOrigin = Boolean((rule as any).targetIncludeOrigin)
  const matchTarget = (c: PlacedCard): boolean => {
    if (rule.targetExcludeSelf && c.placementId === source.placementId) return false
    if (rule.requiredNotTriggerSource && c.placementId === triggerCard.placementId) return false
    if (rule.requiredCooldownOnly && getCardCooldownSec(c, cards) <= 0) return false
    const tagOk = matchesCardTags(
      c,
      rule.requiredTags,
      rule.requiredExcludeTags,
      rule.requiredSizes,
      rule.requiredExcludeSizes,
      auraTags,
      rule.requiredConditionMode || 'and',
    )
    if (!tagOk) return false
    return matchesAttributeConditions(c, rule.requiredAttrConditions || [], rule.requiredConditionMode || 'and', auraTags, cards)
  }

  if (rule.targetType === 'TTargetCardSelf') return matchTarget(source) ? [source] : []
  if (rule.targetType === 'TTargetCardSection') return cards.filter((c) => getCardCooldownSec(c, cards) > 0).filter(matchTarget)
  if (rule.targetType === 'TTargetCardXMost') {
    const pool = cards.filter((c) => getCardCooldownSec(c, cards) > 0).filter(matchTarget)
    const chosen = pickXMost(pool, rule.targetMode || 'RightMostCard')
    return chosen ? [chosen] : []
  }
  if (rule.targetType === 'TTargetCardRandom') {
    const pool = cards
      .filter((c) => getCardCooldownSec(c, cards) > 0)
      .filter(matchTarget)
      .sort((a, b) => a.start - b.start)
    if (!pool.length) return []
    const requested = Number(rule.targetCount)
    const k = Number.isFinite(requested) && requested > 0 ? Math.min(pool.length, Math.max(1, Math.floor(requested))) : 1
    if (!rng) return pool.slice(0, k)
    const pick = pool.slice()
    const out: PlacedCard[] = []
    for (let i = 0; i < k && pick.length > 0; i += 1) {
      const idx = Math.max(0, Math.min(pick.length - 1, Math.floor(rng() * pick.length)))
      out.push(pick[idx])
      pick.splice(idx, 1)
    }
    return out
  }

  const left = cards.find((c) => c.start + c.width === source.start) || null
  const right = cards.find((c) => c.start === source.start + source.width) || null
  const allRight = cards
    .filter((c) => c.start >= source.start + source.width)
    .sort((a, b) => a.start - b.start)

  if (rule.targetMode === 'LeftCard') return left && getCardCooldownSec(left, cards) > 0 && matchTarget(left) ? [left] : []
  if (rule.targetMode === 'RightCard') return right && getCardCooldownSec(right, cards) > 0 && matchTarget(right) ? [right] : []
  if (rule.targetMode === 'Neighbor') {
    return [left, right].filter(Boolean).filter((x) => getCardCooldownSec(x as PlacedCard) > 0).filter((x) => matchTarget(x as PlacedCard)) as PlacedCard[]
  }
  if (rule.targetMode === 'AllRightCards') {
    const picked = allRight.filter((x) => getCardCooldownSec(x) > 0).filter(matchTarget)
    if (includeOrigin && getCardCooldownSec(source, cards) > 0 && matchTarget(source)) {
      return [source, ...picked]
    }
    return picked
  }
  if (includeOrigin && getCardCooldownSec(source, cards) > 0 && matchTarget(source)) {
    return [source]
  }
  return []
}

function isOpponentTargetRule(rule: ChargeRule): boolean {
  const section = String(rule.targetSection || '').toLowerCase()
  const mode = String(rule.targetMode || '').toLowerCase()
  return section.includes('opponent') || mode.includes('opponent')
}

function estimateOpponentTargetCount(rule: ChargeRule, opponentActiveCount: number): number {
  if (!isOpponentTargetRule(rule)) return 0
  const pool = Math.max(0, Math.min(10, Math.floor(Number(opponentActiveCount) || 0)))
  if (pool <= 0) return 0
  const requested = Number(rule.targetCount)
  if (Number.isFinite(requested) && requested > 0) return Math.max(0, Math.min(pool, Math.floor(requested)))
  return pool
}

function isHasteAttributeChangedChargeRule(rule: ChargeRule): boolean {
  if (String(rule.triggerType || '') !== 'TTriggerOnCardAttributeChanged') return false
  const changed = String(rule.triggerAttributeChanged || '').trim().toLowerCase()
  const changeType = String(rule.triggerChangeType || '').trim().toLowerCase()
  if (changed && changed !== 'haste') return false
  if (changeType && changeType !== 'gain') return false
  return true
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
  const active = cards.filter((c) => getCardCooldownSec(c, cards) > 0)
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

function simulateCombatStats(
  cards: PlacedCard[],
  durationSec = 20,
  options?: CombatSimOptions,
): CombatSummary {
  const randomSelfTarget = hasSelfRandomTargetRule(cards)
  const trialCount = Math.max(1, Math.floor(Number(options?.randomTrials ?? 10)))
  if (randomSelfTarget && trialCount > 1 && !options?._singleTrial) {
    const runs: CombatSummary[] = []
    for (let i = 0; i < trialCount; i += 1) {
      runs.push(
        simulateCombatStats(cards, durationSec, {
          ...options,
          randomTrials: 1,
          _singleTrial: true,
          rng: () => Math.random(),
        }),
      )
    }
    return aggregateCombatSummaries(runs, durationSec)
  }

  const epsilon = 1e-6
  const activeCards = cards.filter((c) => getCardCooldownSec(c, cards) > 0)
  if (!activeCards.length) {
    return {
      durationSec,
      totalUses: 0,
      byCard: {},
      totalDamage: 0,
      totalBurnApplied: 0,
      totalPoisonApplied: 0,
      totalBurnTickDamage: 0,
      totalPoisonTickDamage: 0,
      totalShield: 0,
      byCardDamage: {},
      byCardBurn: {},
      byCardPoison: {},
      byCardShield: {},
      cumulativeDamageBySecond: buildCumulativeDamageCurve([], durationSec),
      debugTimeline: [],
    }
  }

  const auraTags = computeAuraTagMap(cards)
  const multicastMap = computeMulticastMap(cards, auraTags)
  const chargeRulesBySource = new Map<string, ChargeRule[]>()
  const hasteRulesBySource = new Map<string, ChargeRule[]>()
  const slowRulesBySource = new Map<string, ChargeRule[]>()
  const forceUseRulesBySource = new Map<string, ChargeRule[]>()
  const reloadRulesBySource = new Map<string, ChargeRule[]>()
  const freezeRulesBySource = new Map<string, ChargeRule[]>()
  const destructionRulesBySource = new Map<string, ChargeRule[]>()
  const shieldRulesBySource = new Map<string, ChargeRule[]>()
  const poisonRulesBySource = new Map<string, ChargeRule[]>()
  const offenseRulesBySource = new Map<string, Array<ChargeRule & { valueAmount: number; attributeType: string }>>()
  const baseDamageByCard = new Map<string, number>()
  const baseBurnByCard = new Map<string, number>()
  const basePoisonByCard = new Map<string, number>()
  const ammoState = new Map<string, { max: number; current: number; readyWhenEmpty: boolean }>()
  for (const c of cards) {
    chargeRulesBySource.set(c.placementId, readChargeRules(c.item, getEffectiveTier(c)).positionalRules)
    hasteRulesBySource.set(c.placementId, readHasteRules(c.item, getEffectiveTier(c)))
    slowRulesBySource.set(c.placementId, readSlowRules(c.item, getEffectiveTier(c)))
    forceUseRulesBySource.set(c.placementId, readForceUseRules(c.item, getEffectiveTier(c)))
    reloadRulesBySource.set(c.placementId, readReloadRules(c.item, getEffectiveTier(c)))
    freezeRulesBySource.set(c.placementId, readFreezeRules(c.item, getEffectiveTier(c)))
    destructionRulesBySource.set(c.placementId, readDestructionRules(c.item, getEffectiveTier(c)))
    shieldRulesBySource.set(c.placementId, readShieldGainRules(c.item, getEffectiveTier(c)))
    poisonRulesBySource.set(c.placementId, readPoisonApplyRules(c.item, getEffectiveTier(c)))
    offenseRulesBySource.set(c.placementId, readOffenseBuffRules(c.item, getEffectiveTier(c)))
    baseDamageByCard.set(c.placementId, readDamageOnUse(c.item, getEffectiveTier(c)))
    baseBurnByCard.set(c.placementId, readBurnOnUse(c.item, getEffectiveTier(c)))
    basePoisonByCard.set(c.placementId, readPoisonOnUse(c.item, getEffectiveTier(c)))
    const maxAmmo = getCardAmmoMaxByTier(c.item, getEffectiveTier(c))
    if (maxAmmo > 0) ammoState.set(c.placementId, { max: maxAmmo, current: maxAmmo, readyWhenEmpty: false })
  }

  const state = new Map<string, { remaining: number; speedUntil: number }>()
  for (const c of activeCards) state.set(c.placementId, { remaining: getCardCooldownSec(c), speedUntil: 0 })
  const uses = new Map<string, number>()
  const byCardDamage = new Map<string, number>()
  const byCardBurn = new Map<string, number>()
  const byCardPoison = new Map<string, number>()
  const byCardShield = new Map<string, number>()
  const bonusDamage = new Map<string, number>()
  const bonusBurn = new Map<string, number>()
  const bonusPoison = new Map<string, number>()
  const bonusShield = new Map<string, number>()
  let totalDamage = 0
  let totalBurnApplied = 0
  let totalPoisonApplied = 0
  let totalBurnTickDamage = 0
  let totalPoisonTickDamage = 0
  const stopAtDamage = Number(options?.stopAtDamage || 0)
  const opponentActiveCount = Math.max(0, Math.min(10, Math.floor(Number(options?.opponentActiveCount ?? 7))))
  const rng = options?.rng || null
  const shouldStopEarly = () => stopAtDamage > 0 && totalDamage >= stopAtDamage
  let stopLoop = false
  const damageEvents: Array<{ time: number; amount: number }> = []
  const burnApplyEvents: Array<{ time: number; amount: number; source: string }> = []
  const poisonApplyEvents: Array<{ time: number; amount: number; source: string }> = []
  const debugTimeline: CombatSummary['debugTimeline'] = []
  for (const c of activeCards) uses.set(c.placementId, 0)
  for (const c of activeCards) {
    byCardDamage.set(c.placementId, 0)
    byCardBurn.set(c.placementId, 0)
    byCardPoison.set(c.placementId, 0)
    byCardShield.set(c.placementId, 0)
    bonusDamage.set(c.placementId, 0)
    bonusBurn.set(c.placementId, 0)
    bonusPoison.set(c.placementId, 0)
    bonusShield.set(c.placementId, 0)
  }

  const resolveEventTriggerMatch = (
    source: PlacedCard,
    rule: ChargeRule,
    fired: PlacedCard,
    shieldPerformedSet?: Set<string>,
    performedCtx?: {
      slowHits?: number
      burnHits?: number
      poisonHits?: number
      damageHits?: number
      hasteHits?: number
      freezeHits?: number
      reloadHits?: number
      destructionHits?: number
      shieldHits?: number
    },
  ): boolean => {
    const lowerTrigger = String(rule.triggerType || '').toLowerCase()
    if (lowerTrigger.includes('performedslow') && Number(performedCtx?.slowHits || 0) <= 0) return false
    if (lowerTrigger.includes('performedburn') && Number(performedCtx?.burnHits || 0) <= 0) return false
    if (lowerTrigger.includes('performedpoison') && Number(performedCtx?.poisonHits || 0) <= 0) return false
    if (lowerTrigger.includes('performeddamage') && Number(performedCtx?.damageHits || 0) <= 0) return false
    if (lowerTrigger.includes('performedhaste') && Number(performedCtx?.hasteHits || 0) <= 0) return false
    if (lowerTrigger.includes('performedfreeze') && Number(performedCtx?.freezeHits || 0) <= 0) return false
    if (lowerTrigger.includes('performedreload') && Number(performedCtx?.reloadHits || 0) <= 0) return false
    if (lowerTrigger.includes('performeddestruction') && Number(performedCtx?.destructionHits || 0) <= 0) return false
    if (lowerTrigger.includes('performedshield') && Number(performedCtx?.shieldHits || 0) <= 0) return false
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
      let dealt = perCastDamage * casts
      // C.O.R.A.: core damage scales with current poison stack via Custom_0 multiplier.
      const coraName = String(fired.item.name_en || fired.item.name_cn || '')
      const isCora = coraName.toLowerCase() === 'c.o.r.a.' || coraName.toLowerCase() === 'cora'
      if (isCora) {
        const raw = resolveRawItem(fired.item)
        const tier = getEffectiveTier(fired)
        const poisonMultiplier = Math.max(0, getAttrValueByTier(raw, 'Custom_0', tier))
        if (poisonMultiplier > 0 && totalPoisonApplied > 0) {
          dealt += totalPoisonApplied * poisonMultiplier * casts
        }
      }
      if (dealt > 0) {
        totalDamage += dealt
        damageEvents.push({ time: now, amount: dealt })
        byCardDamage.set(fired.placementId, (byCardDamage.get(fired.placementId) || 0) + dealt)
      }
      const perCastBurn = Math.max(0, (baseBurnByCard.get(fired.placementId) || 0) + (bonusBurn.get(fired.placementId) || 0))
      const burnApplied = perCastBurn * casts
      if (burnApplied > 0) {
        totalBurnApplied += burnApplied
        byCardBurn.set(fired.placementId, (byCardBurn.get(fired.placementId) || 0) + burnApplied)
        burnApplyEvents.push({
          time: now,
          amount: burnApplied,
          source: fired.item.name_cn || fired.item.name_en || fired.item.id,
        })
        debugTimeline.push({
          time: now,
          kind: 'burn-apply',
          source: fired.item.name_cn || fired.item.name_en || fired.item.id,
          value: burnApplied,
          note: `施加灼烧 ${burnApplied.toFixed(1)}`,
        })
      }
      const perCastPoison = Math.max(0, (basePoisonByCard.get(fired.placementId) || 0) + (bonusPoison.get(fired.placementId) || 0))
      const poisonApplied = perCastPoison * casts
      let performedPoisonHits = 0
      const performedPoisonBy = new Set<string>()
      if (poisonApplied > 0) {
        totalPoisonApplied += poisonApplied
        byCardPoison.set(fired.placementId, (byCardPoison.get(fired.placementId) || 0) + poisonApplied)
        performedPoisonHits += casts
        performedPoisonBy.add(fired.placementId)
        poisonApplyEvents.push({
          time: now,
          amount: poisonApplied,
          source: fired.item.name_cn || fired.item.name_en || fired.item.id,
        })
        debugTimeline.push({
          time: now,
          kind: 'poison-apply',
          source: fired.item.name_cn || fired.item.name_en || fired.item.id,
          value: poisonApplied,
          note: `施加剧毒 ${poisonApplied.toFixed(1)}`,
        })
      }
      let performedSlowHits = 0
      let performedHasteHits = 0
      let performedFreezeHits = 0
      let performedReloadHits = 0
      let performedDestructionHits = 0
      const firedSlowRules = slowRulesBySource.get(fired.placementId) || []
      for (const rule of firedSlowRules) {
        const cands = resolveTriggerCandidates(cards, fired, rule, auraTags)
        const firedMatched = cands.some((x) => x.placementId === fired.placementId)
        if (!firedMatched) continue
        const targets = resolveTargetsForTrigger(cards, fired, fired, rule, auraTags, rng)
        let hits = targets.length
        if (hits <= 0 && isOpponentTargetRule(rule)) {
          hits = estimateOpponentTargetCount(rule, opponentActiveCount)
        }
        if (hits > 0) performedSlowHits += hits * casts
      }
      const firedHasteRules = hasteRulesBySource.get(fired.placementId) || []
      for (const rule of firedHasteRules) {
        const cands = resolveTriggerCandidates(cards, fired, rule, auraTags)
        const firedMatched = cands.some((x) => x.placementId === fired.placementId)
        if (!firedMatched) continue
        const targets = resolveTargetsForTrigger(cards, fired, fired, rule, auraTags, rng)
        const hits = targets.length
        if (hits > 0) performedHasteHits += hits * casts
      }
      const firedFreezeRules = freezeRulesBySource.get(fired.placementId) || []
      for (const rule of firedFreezeRules) {
        const cands = resolveTriggerCandidates(cards, fired, rule, auraTags)
        const firedMatched = cands.some((x) => x.placementId === fired.placementId)
        if (!firedMatched) continue
        const targets = resolveTargetsForTrigger(cards, fired, fired, rule, auraTags, rng)
        let hits = targets.length
        if (hits <= 0 && isOpponentTargetRule(rule)) {
          hits = estimateOpponentTargetCount(rule, opponentActiveCount)
        }
        if (hits > 0) performedFreezeHits += hits * casts
      }
      const firedReloadRules = reloadRulesBySource.get(fired.placementId) || []
      for (const rule of firedReloadRules) {
        const cands = resolveTriggerCandidates(cards, fired, rule, auraTags)
        const firedMatched = cands.some((x) => x.placementId === fired.placementId)
        if (!firedMatched) continue
        const targets = resolveTargetsForTrigger(cards, fired, fired, rule, auraTags, rng)
        const hits = targets.length
        if (hits > 0) performedReloadHits += hits * casts
      }
      const firedDestructionRules = destructionRulesBySource.get(fired.placementId) || []
      for (const rule of firedDestructionRules) {
        const cands = resolveTriggerCandidates(cards, fired, rule, auraTags)
        const firedMatched = cands.some((x) => x.placementId === fired.placementId)
        if (!firedMatched) continue
        const targets = resolveTargetsForTrigger(cards, fired, fired, rule, auraTags, rng)
        let hits = targets.length
        if (hits <= 0 && isOpponentTargetRule(rule)) {
          hits = estimateOpponentTargetCount(rule, opponentActiveCount)
        }
        if (hits > 0) performedDestructionHits += hits * casts
      }
      const performedCtx = {
        slowHits: performedSlowHits,
        burnHits: burnApplied > 0 ? casts : 0,
        poisonHits: performedPoisonHits,
        damageHits: dealt > 0 ? casts : 0,
        hasteHits: performedHasteHits,
        freezeHits: performedFreezeHits,
        reloadHits: performedReloadHits,
        destructionHits: performedDestructionHits,
        shieldHits: 0,
      }
      debugTimeline.push({
        time: now,
        kind: 'use',
        source: fired.item.name_cn || fired.item.name_en || fired.item.id,
        value: dealt,
        note: `出手x${casts}${dealt > 0 ? `，伤害 ${dealt.toFixed(1)}` : ''}`,
      })
      if (shouldStopEarly()) {
        stopLoop = true
        break
      }

      // 先结算“获得护盾”事件，再让“触发护盾后充能”在同一轮生效
      const shieldPerformedBy = new Set<string>()
      let performedShieldHits = 0
      for (const source of cards) {
        const casts = Math.max(1, Number(multicastMap.get(fired.placementId) || 1))
        const shieldRules = shieldRulesBySource.get(source.placementId) || []
        for (const rule of shieldRules) {
          if (!resolveEventTriggerMatch(source, rule, fired, undefined, performedCtx)) continue
          const shieldBonus = Math.max(0, Number(bonusShield.get(source.placementId) || 0))
          const perCastShield = Math.max(0, Number(rule.amount || 0) + shieldBonus)
          const amount = perCastShield * casts
          if (amount <= 0) continue
          byCardShield.set(source.placementId, (byCardShield.get(source.placementId) || 0) + amount)
          performedShieldHits += casts
          shieldPerformedBy.add(source.placementId)
        }
      }
      performedCtx.shieldHits = performedShieldHits

      for (const source of cards) {
        const sourceCastsFromFired = Math.max(1, Number(multicastMap.get(fired.placementId) || 1))
        const poisonRules = poisonRulesBySource.get(source.placementId) || []
        for (const rule of poisonRules) {
          if (!resolveEventTriggerMatch(source, rule, fired, undefined, performedCtx)) continue
          const triggerCards = resolveTriggerCandidates(cards, source, rule, auraTags)
            .filter((x) => x.placementId === fired.placementId)
          if (!triggerCards.length) continue
          for (const triggerCard of triggerCards) {
            const triggerCasts = Math.max(1, Number(multicastMap.get(triggerCard.placementId) || sourceCastsFromFired))
            const amount = Math.max(0, Number(rule.amount || 0)) * triggerCasts
            if (amount <= 0) continue
            totalPoisonApplied += amount
            byCardPoison.set(source.placementId, (byCardPoison.get(source.placementId) || 0) + amount)
            poisonApplyEvents.push({
              time: now,
              amount,
              source: source.item.name_cn || source.item.name_en || source.item.id,
            })
            debugTimeline.push({
              time: now,
              kind: 'poison-apply',
              source: source.item.name_cn || source.item.name_en || source.item.id,
              value: amount,
              note: `施加剧毒 ${amount.toFixed(1)}`,
            })
            performedPoisonHits += triggerCasts
            performedPoisonBy.add(source.placementId)
          }
        }
        performedCtx.poisonHits = performedPoisonHits

        const chargeRules = chargeRulesBySource.get(source.placementId) || []
        for (const rule of chargeRules) {
          const isShieldTrigger = String(rule.triggerType || '') === 'TTriggerOnCardPerformedShield'
          const isPoisonTrigger = String(rule.triggerType || '').toLowerCase().includes('performedpoison')
          const lowerTriggerType = String(rule.triggerType || '').toLowerCase()
          const triggerCards = isShieldTrigger
            ? resolveTriggerCandidates(cards, source, rule, auraTags).filter((x) => shieldPerformedBy.has(x.placementId))
            : isPoisonTrigger
              ? Array.from(performedPoisonBy).map((id) => cards.find((c) => c.placementId === id)).filter(Boolean) as PlacedCard[]
              : [fired]
          for (const triggerCard of triggerCards) {
            if (!resolveEventTriggerMatch(source, rule, triggerCard, shieldPerformedBy, performedCtx)) continue
            const casts = Math.max(1, Number(multicastMap.get(triggerCard.placementId) || 1))
            let pulseCount = casts
            // 对于“PerformedXxx”触发，触发次数应按本次事件的命中次数结算，
            // 不能只按触发源卡牌 multicast 次数结算（例如 LED/手雷多目标减速）。
            if (lowerTriggerType.includes('performedslow')) {
              pulseCount = Math.max(1, Number(performedCtx?.slowHits || 0))
            } else if (lowerTriggerType.includes('performedfreeze')) {
              pulseCount = Math.max(1, Number(performedCtx?.freezeHits || 0))
            } else if (lowerTriggerType.includes('performedhaste')) {
              pulseCount = Math.max(1, Number(performedCtx?.hasteHits || 0))
            } else if (lowerTriggerType.includes('performedreload')) {
              pulseCount = Math.max(1, Number(performedCtx?.reloadHits || 0))
            } else if (lowerTriggerType.includes('performeddestruction')) {
              pulseCount = Math.max(1, Number(performedCtx?.destructionHits || 0))
            } else if (lowerTriggerType.includes('performedpoison')) {
              pulseCount = Math.max(1, Number(performedCtx?.poisonHits || 0))
            }
            const targets = resolveTargetsForTrigger(cards, source, triggerCard, rule, auraTags, rng)
            const amountPerCast = Number(rule.amount || 0)
            if (amountPerCast <= 0) continue
            for (let castIdx = 0; castIdx < pulseCount; castIdx += 1) {
              for (const t of targets) {
                const ts = state.get(t.placementId)
                if (!ts) continue
                ts.remaining -= amountPerCast
                debugTimeline.push({
                  time: now,
                  kind: 'charge',
                  source: triggerCard.item.name_cn || triggerCard.item.name_en || triggerCard.item.id,
                  target: t.item.name_cn || t.item.name_en || t.item.id,
                  value: amountPerCast,
                  note: `充能 ${amountPerCast.toFixed(1)}s 充能端口【${source.item.name_cn || source.item.name_en || source.item.id}】`,
                })

                // 逐次脉冲结算：每次充能命中就判断是否触发“立刻出手”，
                // 避免把多重释放合并成一次大额充能。
                while (ts.remaining <= epsilon) {
                  const cd = getCardCooldownSec(t, cards)
                  if (cd <= epsilon) break
                  queue.push({ card: t, forced: true })
                  ts.remaining += cd
                }
              }
            }
          }
        }

        const hasteRules = hasteRulesBySource.get(source.placementId) || []
        for (const rule of hasteRules) {
          if (!resolveEventTriggerMatch(source, rule, fired, undefined, performedCtx)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags, rng)
          const hasteSec = Number(rule.amount || 0) * casts
          if (hasteSec <= 0) continue
          for (const t of targets) {
            const ts = state.get(t.placementId)
            if (!ts) continue
            ts.speedUntil = Math.max(ts.speedUntil, now + hasteSec)

            // 处理 TTriggerOnCardAttributeChanged(Haste, Gain)：
            // 例如透镜“被加速时，为自己充能X秒”。
            const selfChargeRules = (chargeRulesBySource.get(t.placementId) || []).filter((r) =>
              isHasteAttributeChangedChargeRule(r),
            )
            for (const sr of selfChargeRules) {
              const selfTargets = resolveTargetsForTrigger(cards, t, t, sr, auraTags, rng)
              const selfAmount = Math.max(0, Number(sr.amount || 0))
              if (selfAmount <= 0) continue
              for (const stCard of selfTargets) {
                const st = state.get(stCard.placementId)
                if (!st) continue
                st.remaining -= selfAmount
                debugTimeline.push({
                  time: now,
                  kind: 'charge',
                  source: t.item.name_cn || t.item.name_en || t.item.id,
                  target: stCard.item.name_cn || stCard.item.name_en || stCard.item.id,
                  value: selfAmount,
                  note: `充能 ${selfAmount.toFixed(1)}s 充能端口【${t.item.name_cn || t.item.name_en || t.item.id}】(被加速触发)`,
                })
                while (st.remaining <= epsilon) {
                  const cd = getCardCooldownSec(stCard, cards)
                  if (cd <= epsilon) break
                  queue.push({ card: stCard, forced: true })
                  st.remaining += cd
                }
              }
            }
          }
        }

        const slowRules = slowRulesBySource.get(source.placementId) || []
        for (const rule of slowRules) {
          if (!resolveEventTriggerMatch(source, rule, fired, undefined, performedCtx)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags, rng)
          const slowSec = Number(rule.amount || 0) * casts
          if (slowSec <= 0) continue
          if (!targets.length && isOpponentTargetRule(rule)) {
            const affected = estimateOpponentTargetCount(rule, opponentActiveCount)
            if (affected > 0) {
              debugTimeline.push({
                time: now,
                kind: 'use',
                source: source.item.name_cn || source.item.name_en || source.item.id,
                value: affected,
                note: `对手减速生效 ${affected} 次（按对手可读条物品数上限）`,
              })
            }
          }
          for (const t of targets) {
            const ts = state.get(t.placementId)
            if (!ts) continue
            // 减速等价于“额外增加剩余读条时间”
            ts.remaining += slowSec
          }
        }

        const forceRules = forceUseRulesBySource.get(source.placementId) || []
        for (const rule of forceRules) {
          if (!resolveEventTriggerMatch(source, rule, fired, undefined, performedCtx)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags, rng)
          for (let c = 0; c < casts; c += 1) {
            for (const t of targets) queue.push({ card: t, forced: true })
          }
        }

        const reloadRules = reloadRulesBySource.get(source.placementId) || []
        for (const rule of reloadRules) {
          if (!resolveEventTriggerMatch(source, rule, fired, undefined, performedCtx)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags, rng)
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
          if (!resolveEventTriggerMatch(source, rule, fired, undefined, performedCtx)) continue
          const targets = resolveTargetsForTrigger(cards, source, fired, rule, auraTags, rng)
          const inc = Math.max(0, Number(rule.valueAmount || 0)) * casts
          if (inc <= 0) continue
          for (const t of targets) {
            if (rule.attributeType === 'DamageAmount') {
              if (!bonusDamage.has(t.placementId)) continue
              bonusDamage.set(t.placementId, (bonusDamage.get(t.placementId) || 0) + inc)
            } else if (rule.attributeType === 'BurnAmount' || rule.attributeType === 'BurnApplyAmount') {
              if (!bonusBurn.has(t.placementId)) continue
              bonusBurn.set(t.placementId, (bonusBurn.get(t.placementId) || 0) + inc)
            } else if (rule.attributeType === 'PoisonAmount' || rule.attributeType === 'PoisonApplyAmount') {
              if (!bonusPoison.has(t.placementId)) continue
              bonusPoison.set(t.placementId, (bonusPoison.get(t.placementId) || 0) + inc)
            } else if (rule.attributeType === 'ShieldApplyAmount') {
              if (!bonusShield.has(t.placementId)) continue
              bonusShield.set(t.placementId, (bonusShield.get(t.placementId) || 0) + inc)
            }
          }
        }

      }
      if (stopLoop) break
    }
    if (stopLoop) break
  }

  // 剧毒按 1s 结算：
  // - 每 1s 造成当前剧毒层数伤害
  // - 剧毒层数不随时间衰减
  if (poisonApplyEvents.length > 0) {
    const sortedPoison = poisonApplyEvents.slice().sort((a, b) => a.time - b.time)
    let idx = 0
    let stack = 0
    const tickCount = Math.max(1, Math.floor(durationSec))
    for (let t = 1; t <= tickCount + 1e-6; t += 1) {
      while (idx < sortedPoison.length && sortedPoison[idx].time <= t + 1e-6) {
        stack += sortedPoison[idx].amount
        idx += 1
      }
      if (stack > 0) {
        totalPoisonTickDamage += stack
        totalDamage += stack
        damageEvents.push({ time: t, amount: stack })
        debugTimeline.push({
          time: t,
          kind: 'poison-tick',
          source: '剧毒',
          value: stack,
          note: `剧毒结算 ${stack.toFixed(1)}`,
        })
      }
    }
  }

  // 灼烧按 0.5s 结算：
  // - 每 0.5s 造成当前灼烧层数伤害
  // - 每 0.5s 后衰减 3%，且单次至少衰减 1
  // - 衰减后向上取整（如 462 -> 449）
  if (burnApplyEvents.length > 0) {
    const sortedBurn = burnApplyEvents.slice().sort((a, b) => a.time - b.time)
    let idx = 0
    let stack = 0
    const tickCount = Math.max(1, Math.floor(durationSec / 0.5))
    for (let t = 0.5; t <= tickCount * 0.5 + 1e-6; t += 0.5) {
      while (idx < sortedBurn.length && sortedBurn[idx].time <= t + 1e-6) {
        stack += sortedBurn[idx].amount
        idx += 1
      }
      if (stack > 0) {
        totalBurnTickDamage += stack
        totalDamage += stack
        damageEvents.push({ time: t, amount: stack })
        const decayByRate = Math.ceil(stack * 0.03)
        const decay = Math.max(1, decayByRate)
        const nextStack = Math.max(0, Math.ceil(stack - decay))
        debugTimeline.push({
          time: t,
          kind: 'burn-tick',
          source: '灼烧',
          value: stack,
          note: `灼烧结算 ${stack.toFixed(1)}，衰减后 ${nextStack.toFixed(1)}`,
        })
        stack = nextStack
        if (shouldStopEarly()) break
      }
    }
  }

  const byCard: Record<string, number> = {}
  const byCardDamageObj: Record<string, number> = {}
  const byCardBurnObj: Record<string, number> = {}
  const byCardPoisonObj: Record<string, number> = {}
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
  byCardBurn.forEach((v, k) => {
    byCardBurnObj[k] = v
  })
  byCardPoison.forEach((v, k) => {
    byCardPoisonObj[k] = v
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
    totalBurnApplied,
    totalPoisonApplied,
    totalBurnTickDamage,
    totalPoisonTickDamage,
    totalShield,
    byCardDamage: byCardDamageObj,
    byCardBurn: byCardBurnObj,
    byCardPoison: byCardPoisonObj,
    byCardShield: byCardShieldObj,
    cumulativeDamageBySecond: buildCumulativeDamageCurve(damageEvents, durationSec),
    debugTimeline: debugTimeline.sort((a, b) => a.time - b.time),
  }
}

function simulateUseCounts(cards: PlacedCard[], durationSec = 20): UseCountSummary {
  const combat = simulateCombatStats(cards, durationSec, { opponentActiveCount: 7 })
  return { durationSec: combat.durationSec, totalUses: combat.totalUses, byCard: combat.byCard }
}

function scoreLayout(cards: PlacedCard[], windowSec = 20, options?: { opponentActiveCount?: number }): {
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
  const combat = simulateCombatStats(cards, windowSec, { opponentActiveCount: options?.opponentActiveCount ?? 7 })
  const usage: UseCountSummary = { durationSec: combat.durationSec, totalUses: combat.totalUses, byCard: combat.byCard }
  // 方案优先级改为“总伤害优先”
  const score = combat.totalDamage
  return { analysis, metrics, valueSynergy, usage, combat, score }
}

function isOpponentSectionLike(v: string): boolean {
  return /opponent/i.test(String(v || ''))
}

function hasSelfRandomTargetRule(cards: PlacedCard[]): boolean {
  for (const c of cards) {
    const raw = resolveRawItem(c.item)
    const rows = [
      ...(Array.isArray(raw?.abilities_detail) ? raw.abilities_detail : []),
      ...(Array.isArray(raw?.auras_detail) ? raw.auras_detail : []),
    ]
    for (const row of rows) {
      const target = row?.action?.target || {}
      const targetType = String(target?.type || '')
      const section = String(target?.TargetSection || target?.targetSection || '')
      if (targetType === 'TTargetCardRandom' && !isOpponentSectionLike(section)) return true
    }
  }
  return false
}

function aggregateCombatSummaries(summaries: CombatSummary[], durationSec: number): CombatSummary {
  const n = Math.max(1, summaries.length)
  const sumMap = (getter: (s: CombatSummary) => Record<string, number>) => {
    const out = new Map<string, number>()
    for (const s of summaries) {
      const rec = getter(s) || {}
      for (const [k, v] of Object.entries(rec)) out.set(k, (out.get(k) || 0) + Number(v || 0))
    }
    const obj: Record<string, number> = {}
    out.forEach((v, k) => { obj[k] = v / n })
    return obj
  }
  const maxCurveLen = summaries.reduce((m, s) => Math.max(m, s.cumulativeDamageBySecond.length), 0)
  const avgCurve: number[] = Array.from({ length: maxCurveLen }, (_, i) => {
    let acc = 0
    for (const s of summaries) acc += Number(s.cumulativeDamageBySecond[i] || 0)
    return acc / n
  })
  const totalDamageList = summaries.map((s) => Number(s.totalDamage || 0))
  const totalDamageMin = Math.min(...totalDamageList)
  const totalDamageMax = Math.max(...totalDamageList)
  const totalDamageAvg = totalDamageList.reduce((a, b) => a + b, 0) / n

  return {
    durationSec,
    totalUses: summaries.reduce((a, s) => a + Number(s.totalUses || 0), 0) / n,
    byCard: sumMap((s) => s.byCard),
    totalDamage: totalDamageAvg,
    totalBurnApplied: summaries.reduce((a, s) => a + Number(s.totalBurnApplied || 0), 0) / n,
    totalPoisonApplied: summaries.reduce((a, s) => a + Number(s.totalPoisonApplied || 0), 0) / n,
    totalBurnTickDamage: summaries.reduce((a, s) => a + Number(s.totalBurnTickDamage || 0), 0) / n,
    totalPoisonTickDamage: summaries.reduce((a, s) => a + Number(s.totalPoisonTickDamage || 0), 0) / n,
    randomTrials: n,
    totalDamageMin,
    totalDamageMax,
    totalDamageAvg,
    totalShield: summaries.reduce((a, s) => a + Number(s.totalShield || 0), 0) / n,
    byCardDamage: sumMap((s) => s.byCardDamage),
    byCardBurn: sumMap((s) => s.byCardBurn),
    byCardPoison: sumMap((s) => s.byCardPoison),
    byCardShield: sumMap((s) => s.byCardShield),
    cumulativeDamageBySecond: avgCurve,
    debugTimeline: summaries[0]?.debugTimeline || [],
  }
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

function enumeratePermutations<T>(arr: T[], onVisit: (perm: T[]) => void) {
  const a = arr.slice()
  const used = new Array(a.length).fill(false)
  const path: T[] = []
  const dfs = () => {
    if (path.length === a.length) {
      onVisit(path.slice())
      return
    }
    for (let i = 0; i < a.length; i += 1) {
      if (used[i]) continue
      used[i] = true
      path.push(a[i])
      dfs()
      path.pop()
      used[i] = false
    }
  }
  dfs()
}

function buildGlobalMainCandidates(
  mainCards: PlacedCard[],
  reserveCards: PlacedCard[],
  windowSec: number,
  capacityUnits = MAX_UNITS,
): PlacedCard[][] {
  const allMap = new Map<string, PlacedCard>()
  for (const c of [...mainCards, ...reserveCards]) {
    if (!allMap.has(c.placementId)) allMap.set(c.placementId, c)
  }
  const all = Array.from(allMap.values())
  if (!all.length) return []

  const totalWidth = all.reduce((s, c) => s + c.width, 0)
  const exactCandidateLimit = 8

  // 小规模可精确搜索：结果不受初始摆法影响，可视作全局最优。
  if (all.length <= exactCandidateLimit && totalWidth <= capacityUnits) {
    const scored: Array<{ cards: PlacedCard[]; dmg: number }> = []
    enumeratePermutations(all, (perm) => {
      const packed = normalizeSequentialLayout(perm, capacityUnits)
      const dmg = scoreLayout(packed, windowSec).combat.totalDamage
      scored.push({ cards: packed, dmg })
    })
    scored.sort((a, b) => b.dmg - a.dmg)
    const uniq = new Map<string, PlacedCard[]>()
    for (const s of scored) {
      const sig = layoutSignature(s.cards)
      if (!uniq.has(sig)) uniq.set(sig, s.cards)
      if (uniq.size >= 64) break
    }
    return Array.from(uniq.values())
  }

  const pools = buildOptimizationPools(mainCards, reserveCards, windowSec, capacityUnits)
  const candidateMap = new Map<string, PlacedCard[]>()
  for (const p of pools) {
    const packed = compactOrderLayout(p, capacityUnits)
    if (!packed || !packed.length) continue
    candidateMap.set(layoutSignature(packed), packed)
    const local = suggestTop(p, 8, windowSec, capacityUnits, { opponentActiveCount: 7 })
    for (const s of local) {
      const pp = compactOrderLayout(s.next, capacityUnits)
      if (!pp || !pp.length) continue
      candidateMap.set(layoutSignature(pp), pp)
    }
  }
  return Array.from(candidateMap.values()).slice(0, 96)
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

function suggestTop(
  cards: PlacedCard[],
  limit = 5,
  windowSec = 20,
  capacityUnits = MAX_UNITS,
  options?: { opponentActiveCount?: number },
): SuggestionCandidate[] {
  const normalizedBase = compactOrderLayout(cards, capacityUnits)
  if (!normalizedBase || normalizedBase.length <= 1) return []

  const base = scoreLayout(normalizedBase, windowSec, options)
  const candidateMap = new Map<string, { next: PlacedCard[]; score: number; analysis: Analysis; metrics: NetworkMetrics; usage: UseCountSummary; combat: CombatSummary }>()
  const orderBase = normalizedBase.slice().sort((a, b) => a.start - b.start)

  const tryAdd = (order: PlacedCard[]) => {
    const compact = compactOrderLayout(order, capacityUnits)
    if (!compact || compact.length !== normalizedBase.length) return
    const sig = layoutSignature(compact)
    const scored = scoreLayout(compact, windowSec, options)
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
  const activeCards = cards.filter((c) => getCardCooldownSec(c, cards) > 0)
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
  const activeCards = cards.filter((c) => getCardCooldownSec(c, cards) > 0)
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
  supportSummary = null,
}: {
  onSelectItem: (item: any) => void
  itemsPool?: LabItem[]
  supportSummary?: RuleSupportSummary | null
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
  const [calcMode, setCalcMode] = useState<CalcMode>('seconds')
  const [targetDamageDraft, setTargetDamageDraft] = useState(1000)
  const [targetDamageInput, setTargetDamageInput] = useState('1000')
  const [boardScale, setBoardScale] = useState(1.6)
  const [slotMode, setSlotMode] = useState<SlotMode>(10)
  const [isCalculating, setIsCalculating] = useState(false)
  const [calcProgress, setCalcProgress] = useState(0)
  const [calcProgressLabel, setCalcProgressLabel] = useState('')
  const [autoOptimizeNote, setAutoOptimizeNote] = useState('')
  const [showSupportPanel, setShowSupportPanel] = useState(false)
  const [opponentCooldownItems, setOpponentCooldownItems] = useState(7)
  useEffect(() => {
    if (calcMode === 'target-damage' && !targetDamageInput) {
      setTargetDamageInput(String(targetDamageDraft || 1000))
    }
  }, [calcMode, targetDamageDraft, targetDamageInput])
  const waitFrame = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
          window.setTimeout(() => resolve(), 0)
          return
        }
        window.requestAnimationFrame(() => resolve())
      }),
    [],
  )
  const boardRef = useRef<HTMLDivElement | null>(null)
  const reserveBoardRef = useRef<HTMLDivElement | null>(null)
  const nativeMainCleanupRef = useRef<(() => void) | null>(null)
  const nativeReserveCleanupRef = useRef<(() => void) | null>(null)
  const lastHoverMainStartRef = useRef<number>(0)
  const lastHoverReserveStartRef = useRef<number>(0)
  const cardsRef = useRef<PlacedCard[]>([])
  const reserveCardsRef = useRef<PlacedCard[]>([])
  const previewRef = useRef<PlacedCard[] | null>(null)
  const reservePreviewRef = useRef<PlacedCard[] | null>(null)
  const slotMask = useMemo(() => {
    if (slotMode === 6) return [false, false, true, true, true, true, true, true, false, false]
    if (slotMode === 8) return [false, true, true, true, true, true, true, true, true, false]
    return Array.from({ length: 10 }, () => true)
  }, [slotMode])
  const enabledUnits = useMemo(() => slotMask.filter(Boolean).length, [slotMask])
  useEffect(() => { cardsRef.current = cards }, [cards])
  useEffect(() => { reserveCardsRef.current = reserveCards }, [reserveCards])
  useEffect(() => { previewRef.current = preview }, [preview])
  useEffect(() => { reservePreviewRef.current = reservePreview }, [reservePreview])
  const buildCalcResult = (
    mainCards: PlacedCard[],
    reserve: PlacedCard[],
    sec: number,
    options?: { skipSuggestions?: boolean; stopAtDamage?: number },
  ): WorkbenchCalcResult => {
    const analysis = analyze(mainCards)
    const combatCurrent = simulateCombatStats(mainCards, sec, {
      stopAtDamage: options?.stopAtDamage,
      opponentActiveCount: opponentCooldownItems,
    })
    const cycles = analyzeCycles(mainCards, analysis.links)
    if (options?.skipSuggestions) {
      return {
        simSeconds: sec,
        analysis,
        combatCurrent,
        cycles,
        suggestions: [],
        chartLayouts: [
          {
            id: 'current',
            label: '当前摆法',
            color: '#ffd447',
            curve: combatCurrent.cumulativeDamageBySecond,
            totalDamage: combatCurrent.totalDamage,
          },
        ],
        optimizationBaseLen: mainCards.length,
      }
    }
    const optimizationPools = buildOptimizationPools(mainCards, reserve, sec, enabledUnits)
    const optimizationBase =
      optimizationPools.length > 0 ? optimizationPools[0] : (mainCards.length > 0 ? mainCards : [])
    const merged = new Map<string, SuggestionCandidate>()
    const localPools = optimizationPools.length > 0 ? optimizationPools : (mainCards.length > 0 ? [mainCards] : [])
    for (const pool of localPools) {
      const local = suggestTop(pool, 5, sec, enabledUnits, { opponentActiveCount: opponentCooldownItems })
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
  const useTimelineHalfSec = useMemo(() => {
    const useEvents = combatDisplay.debugTimeline.filter((x) => x.kind === 'use')
    const bucket = new Map<number, string[]>()
    for (const e of useEvents) {
      const key = Math.round((e.time + 1e-6) * 2) / 2
      if (!bucket.has(key)) bucket.set(key, [])
      bucket.get(key)!.push(e.source)
    }
    return Array.from(bucket.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, list]) => ({ time, list }))
  }, [combatDisplay.debugTimeline])

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
    const { cards: demoCards, missing } = buildExampleCards(itemsPool, EXAMPLE_1_ORDER, 10, 'example1-main')
    const { cards: reserveDemoCards, missing: reserveMissing } = buildExampleCards(itemsPool, EXAMPLE_1_RESERVE_ORDER, 10, 'example1-reserve')
    if (!demoCards.length) {
      window.alert('全能核示例摆放失败：当前物品库中未找到示例卡牌。')
      return
    }
    setSlotMode(10)
    commit(demoCards)
    setReserveCards(reserveDemoCards)
    setPreview(null)
    setReservePreview(null)
    setSuggestPreviewId(null)
    setSelectedId(demoCards[0]?.placementId || null)
    if (demoCards[0]) onSelectItem(demoCards[0].item)
    const allMissing = [...missing, ...reserveMissing]
    if (allMissing.length > 0) {
      window.alert(`全能核示例已摆放，但缺少以下卡牌：${allMissing.join('、')}`)
    }
  }

  const applyPoisonExample = () => {
    const { cards: demoCards, missing } = buildExampleCards(itemsPool, EXAMPLE_POISON_ORDER, 10, 'example-poison-main')
    if (!demoCards.length) {
      window.alert('毒核示例摆放失败：当前物品库中未找到示例卡牌。')
      return
    }
    setSlotMode(10)
    commit(demoCards)
    setReserveCards([])
    setPreview(null)
    setReservePreview(null)
    setSuggestPreviewId(null)
    setSelectedId(demoCards[0]?.placementId || null)
    if (demoCards[0]) onSelectItem(demoCards[0].item)
    if (missing.length > 0) {
      window.alert(`毒核示例已摆放，但缺少以下卡牌：${missing.join('、')}`)
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
    const baseSeconds = Math.max(1, Math.min(90, Math.floor(Number(simSecondsDraft) || 1)))
    const parsedTargetDamage = Math.max(1, Math.floor(Number(targetDamageInput) || 0))
    setSimSecondsDraft(baseSeconds)
    if (calcMode === 'target-damage') {
      setTargetDamageDraft(parsedTargetDamage)
      setTargetDamageInput(String(parsedTargetDamage))
    }
    setAutoOptimizeNote('')
    const snapshotMain = cards.map((c) => ({ ...c }))
    const snapshotReserve = reserveCards.map((c) => ({ ...c }))
    setIsCalculating(true)
    setCalcProgress(6)
    setCalcProgressLabel(calcMode === 'target-damage' ? '正在定伤求时…' : '正在计算伤害…')
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const progressTimer = window.setInterval(() => {
      setCalcProgress((prev) => (prev >= 88 ? prev : prev + 4))
    }, 90)
    window.setTimeout(async () => {
      try {
        let nextSeconds = baseSeconds
        if (calcMode === 'target-damage') {
          setCalcProgress(18)
          setCalcProgressLabel('正在定伤求时：准备模拟…')
          await waitFrame()
          const targetDamage = parsedTargetDamage
          // 单次前推模拟：一次跑到 90 秒（支持提前停止），再从累计伤害曲线找首次达标秒数。
          setCalcProgress(42)
          setCalcProgressLabel('正在定伤求时：运行模拟…')
          await waitFrame()
          const full = buildCalcResult(snapshotMain, snapshotReserve, 90, {
            skipSuggestions: true,
            stopAtDamage: targetDamage,
          })
          setCalcProgress(74)
          setCalcProgressLabel('正在定伤求时：解析结果…')
          await waitFrame()
          const curve = Array.isArray(full.combatCurrent.cumulativeDamageBySecond)
            ? full.combatCurrent.cumulativeDamageBySecond
            : []
          const firstHit = curve.findIndex((v) => Number(v || 0) >= targetDamage)

          if (firstHit >= 0) {
            nextSeconds = Math.max(1, Math.min(90, firstHit))
            setSimSeconds(nextSeconds)
            setSimSecondsDraft(nextSeconds)
            // 定伤模式展示“命中秒数”的实际结果，而不是 90 秒全量结果。
            const hit = buildCalcResult(snapshotMain, snapshotReserve, nextSeconds, { skipSuggestions: true })
            setCalc(hit)
            setCalcProgress(96)
            const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
            setAutoOptimizeNote(`达到 ${targetDamage.toFixed(1)} 伤害约需 ${nextSeconds} 秒（计算耗时 ${(elapsed / 1000).toFixed(2)}s）`)
            return
          }

          setSimSeconds(90)
          setSimSecondsDraft(90)
          setCalc(full)
          setCalcProgress(96)
          const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
          setAutoOptimizeNote(`90 秒内未达到 ${targetDamage.toFixed(1)} 伤害（当前 ${full.combatCurrent.totalDamage.toFixed(1)}，耗时 ${(elapsed / 1000).toFixed(2)}s）`)
          return
        }
        setCalcProgress(24)
        setCalcProgressLabel('正在计算伤害：准备模拟…')
        await waitFrame()
        setSimSeconds(nextSeconds)
        setCalcProgress(52)
        setCalcProgressLabel('正在计算伤害：运行模拟…')
        await waitFrame()
        const next = buildCalcResult(snapshotMain, snapshotReserve, nextSeconds, { skipSuggestions: true })
        setCalcProgress(86)
        setCalcProgressLabel('正在计算伤害：整理结果…')
        await waitFrame()
        setCalc(next)
        setCalcProgress(96)
        const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
        setAutoOptimizeNote(`伤害计算完成（当前摆法，耗时 ${(elapsed / 1000).toFixed(2)}s）`)
      } finally {
        window.clearInterval(progressTimer)
        setCalcProgress(100)
        setIsCalculating(false)
        window.setTimeout(() => {
          setCalcProgress(0)
          setCalcProgressLabel('')
        }, 180)
      }
    }, 16)
  }

  const requestSuggestLayouts = () => {
    const nextSeconds = Math.max(1, Math.min(90, Math.floor(Number(simSecondsDraft) || simSeconds || 1)))
    const snapshotMain = cards.map((c) => ({ ...c }))
    const snapshotReserve = reserveCards.map((c) => ({ ...c }))
    setIsCalculating(true)
    setCalcProgress(10)
    setCalcProgressLabel('正在生成推荐摆法…')
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    window.setTimeout(async () => {
      try {
        setSimSeconds(nextSeconds)
        await waitFrame()
        const base = buildCalcResult(snapshotMain, snapshotReserve, nextSeconds, { skipSuggestions: true })
        setCalc(base)

        const optimizationPools = buildOptimizationPools(snapshotMain, snapshotReserve, nextSeconds, enabledUnits)
        const optimizationBase =
          optimizationPools.length > 0 ? optimizationPools[0] : (snapshotMain.length > 0 ? snapshotMain : [])
        const merged = new Map<string, SuggestionCandidate>()
        const localPools = optimizationPools.length > 0 ? optimizationPools : (snapshotMain.length > 0 ? [snapshotMain] : [])
        const totalPools = Math.max(1, localPools.length)
        setCalcProgress(22)
        await waitFrame()

        for (let i = 0; i < localPools.length; i += 1) {
          const local = suggestTop(localPools[i], 5, nextSeconds, enabledUnits, { opponentActiveCount: opponentCooldownItems })
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
          const done = i + 1
          setCalcProgress(22 + Math.floor((done / totalPools) * 70))
          setCalcProgressLabel(`正在评估候选摆法（${done}/${totalPools}）…`)
          await waitFrame()
        }

        const suggestions = Array.from(merged.values())
          .sort((a, b) => b.totalDamage - a.totalDamage || b.totalShield - a.totalShield || b.totalUses - a.totalUses)
          .slice(0, 5)
          .map((x, idx) => ({
            ...x,
            rank: idx + 1,
            damageGain: x.totalDamage - base.combatCurrent.totalDamage,
          }))
        const palette = ['#ff6b6b', '#4fc3f7', '#81c784', '#ba68c8', '#ffb74d', '#64ffda']
        const chartLayouts: Array<{ id: string; label: string; color: string; curve: number[]; totalDamage: number }> = [
          {
            id: 'current',
            label: '当前摆法',
            color: '#ffd447',
            curve: base.combatCurrent.cumulativeDamageBySecond,
            totalDamage: base.combatCurrent.totalDamage,
          },
          ...suggestions.map((s, idx) => ({
            id: s.id,
            label: `方案${s.rank}`,
            color: palette[idx % palette.length],
            curve: s.curve,
            totalDamage: s.totalDamage,
          })),
        ]
        setCalc({
          ...base,
          suggestions,
          chartLayouts,
          optimizationBaseLen: optimizationBase.length,
        })
        setCalcProgress(96)
        const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
        setAutoOptimizeNote(`推荐摆法已生成（耗时 ${(elapsed / 1000).toFixed(2)}s）`)
      } finally {
        setCalcProgress(100)
        setIsCalculating(false)
        window.setTimeout(() => {
          setCalcProgress(0)
          setCalcProgressLabel('')
        }, 180)
      }
    }, 16)
  }

  const requestAutoOptimize = () => {
    const nextSeconds =
      calcMode === 'target-damage'
        ? Math.max(1, Math.min(90, Math.floor(Number(simSeconds) || 1)))
        : Math.max(1, Math.min(90, Math.floor(Number(simSecondsDraft) || 1)))
    setSimSecondsDraft(nextSeconds)
    setSimSeconds(nextSeconds)
    const initialMain = cards.map((c) => ({ ...c }))
    const initialReserve = reserveCards.map((c) => ({ ...c }))
    setIsCalculating(true)
    setCalcProgress(8)
    setCalcProgressLabel(calcMode === 'target-damage' ? '正在搜索最快达标摆法…' : '正在搜索最优摆法…')
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const progressTimer = window.setInterval(() => {
      setCalcProgress((prev) => (prev >= 92 ? prev : prev + 2))
    }, 120)
    window.setTimeout(async () => {
      try {
        if (calcMode === 'target-damage') {
          const targetDamage = Math.max(1, Number(targetDamageDraft) || 1)
          setCalcProgress(18)
          setCalcProgressLabel('正在生成候选摆法…')
          await waitFrame()

          const baseMainPacked = compactByOrder(initialMain, slotMask)
          const candidates = buildGlobalMainCandidates(initialMain, initialReserve, Math.max(10, nextSeconds), enabledUnits)
          if (!candidates.some((x) => layoutSignature(x) === layoutSignature(baseMainPacked))) {
            candidates.unshift(baseMainPacked)
          }
          if (!candidates.length) {
            const fallback = buildCalcResult(initialMain, initialReserve, nextSeconds)
            setCalc(fallback)
            setAutoOptimizeNote('未生成候选方案，保持当前摆法')
            return
          }

          setCalcProgress(32)
          setCalcProgressLabel(`正在评估 ${candidates.length} 个候选方案…`)
          await waitFrame()

          let bestMain = baseMainPacked
          let bestReserve = compactByOrder(initialReserve, slotMask)
          let bestHitSec = Number.POSITIVE_INFINITY
          let bestDamageAtHit = -1
          let bestFull: WorkbenchCalcResult | null = null

          for (let i = 0; i < candidates.length; i += 1) {
            const mainPacked = candidates[i]
            const allMap = new Map<string, PlacedCard>()
            for (const c of [...initialMain, ...initialReserve]) allMap.set(c.placementId, c)
            const used = new Set(mainPacked.map((x) => x.placementId))
            const reservePacked = compactByOrder(
              Array.from(allMap.values()).filter((x) => !used.has(x.placementId)),
              slotMask,
            )

            const quick = buildCalcResult(mainPacked, reservePacked, 90, {
              skipSuggestions: true,
              stopAtDamage: targetDamage,
            })
            const curve = quick.combatCurrent.cumulativeDamageBySecond || []
            const hitIdx = curve.findIndex((v) => Number(v || 0) >= targetDamage)
            const hitSec = hitIdx >= 0 ? Math.max(1, hitIdx) : Number.POSITIVE_INFINITY
            const damageAtHit = hitIdx >= 0 ? Number(curve[hitIdx] || 0) : Number(quick.combatCurrent.totalDamage || 0)

            if (
              hitSec < bestHitSec ||
              (hitSec === bestHitSec && damageAtHit > bestDamageAtHit)
            ) {
              bestHitSec = hitSec
              bestDamageAtHit = damageAtHit
              bestMain = mainPacked
              bestReserve = reservePacked
              bestFull = quick
            }

            const p = 32 + Math.floor(((i + 1) / candidates.length) * 58)
            setCalcProgress(Math.max(32, Math.min(90, p)))
            if ((i + 1) % 2 === 0) await waitFrame()
          }

          setCards(bestMain)
          setReserveCards(bestReserve)
          setPreview(null)
          setReservePreview(null)
          setSuggestPreviewId(null)

          if (Number.isFinite(bestHitSec)) {
            const finalSec = Math.max(1, Math.min(90, bestHitSec))
            setSimSeconds(finalSec)
            setSimSecondsDraft(finalSec)
            // 使用目标秒数生成完整结果（含建议与图表），便于继续比较。
            const finalResult = buildCalcResult(bestMain, bestReserve, finalSec)
            setCalc(finalResult)
            const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
            setAutoOptimizeNote(`最优方案已应用：达到 ${targetDamage.toFixed(1)} 伤害约需 ${finalSec} 秒（耗时 ${(elapsed / 1000).toFixed(2)}s）`)
          } else {
            const fallback = bestFull || buildCalcResult(bestMain, bestReserve, 90, { skipSuggestions: true })
            setSimSeconds(90)
            setSimSecondsDraft(90)
            setCalc(buildCalcResult(bestMain, bestReserve, 90))
            const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
            setAutoOptimizeNote(
              `90 秒内无方案达到 ${targetDamage.toFixed(1)}（最优总伤害 ${fallback.combatCurrent.totalDamage.toFixed(1)}，耗时 ${(elapsed / 1000).toFixed(2)}s）`,
            )
          }
          return
        }

        const seen = new Set<string>()
        const maxRounds = 8
        let rounds = 0
        let currentMain = initialMain
        let currentReserve = initialReserve
        let result = buildCalcResult(currentMain, currentReserve, nextSeconds)
        const initialDamage = result.combatCurrent.totalDamage
        const initialShield = result.combatCurrent.totalShield
        setCalcProgress(22)
        setCalcProgressLabel('正在迭代寻优…')
        await waitFrame()

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
          setCalcProgress(22 + Math.floor((rounds / maxRounds) * 66))
          await waitFrame()
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
        const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
        if (rounds > 0 && (gain > 1e-6 || shieldGain > 1e-6)) {
          setAutoOptimizeNote(`自动寻优完成：迭代${rounds}轮，伤害 +${gain.toFixed(1)}，护盾 +${shieldGain.toFixed(1)}（耗时 ${(elapsed / 1000).toFixed(2)}s）`)
        } else {
          setAutoOptimizeNote(`自动寻优完成：当前已接近最优，无更优方案（耗时 ${(elapsed / 1000).toFixed(2)}s）`)
        }
      } finally {
        window.clearInterval(progressTimer)
        setCalcProgress(100)
        setIsCalculating(false)
        window.setTimeout(() => {
          setCalcProgress(0)
          setCalcProgressLabel('')
        }, 180)
      }
    }, 16)
  }

  const buildDropPreview = (
    targetBoard: BoardKey,
    dragged: DragPayload,
    target: number,
  ): { nextMain: PlacedCard[]; nextReserve: PlacedCard[]; movingItem: LabItem } | null => {
    const currentCards = cardsRef.current
    const currentReserveCards = reserveCardsRef.current
    const sourceBoard = dragged.sourceBoard
    const sourceMain = dragged.placementId ? currentCards.find((c) => c.placementId === dragged.placementId) : null
    const sourceReserve = dragged.placementId ? currentReserveCards.find((c) => c.placementId === dragged.placementId) : null
    const movingExisting = sourceMain || sourceReserve
    const movingItem = movingExisting?.item || dragged.item
    if (!movingItem) {
      logDndLocal('buildDropPreview:missing-moving-item', { targetBoard, dragged, target })
      return null
    }
    const width = movingExisting?.width || dragged.width || getCardWidth(movingItem.size)
    const moving: PlacedCard = movingExisting || {
      placementId: `${movingItem.id || 'card'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      item: movingItem,
      width,
      start: target,
      tier: asTier(movingItem.starting_tier),
    }

    const nextMainBase = [...currentCards]
    const nextReserveBase = [...currentReserveCards]
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
      if (!nextTarget) {
        logDndLocal('buildDropPreview:main-failed', {
          targetBoard,
          target,
          width,
          sourceBoard,
          moving: movingItem?.name_cn || movingItem?.name_en || movingItem?.id,
          reason: diagnoseAutoLayoutFailure(nextMainBase, { ...moving, start: target, width }, target, slotMask),
        })
        return null
      }
      return { nextMain: [...nextTarget].sort((a, b) => a.start - b.start), nextReserve: [...nextReserveBase].sort((a, b) => a.start - b.start), movingItem }
    }
    const nextTarget = autoLayout(nextReserveBase, { ...moving, start: target, width }, target, slotMask)
    if (!nextTarget) {
      logDndLocal('buildDropPreview:reserve-failed', {
        targetBoard,
        target,
        width,
        sourceBoard,
        moving: movingItem?.name_cn || movingItem?.name_en || movingItem?.id,
        reason: diagnoseAutoLayoutFailure(nextReserveBase, { ...moving, start: target, width }, target, slotMask),
      })
      return null
    }
    return { nextMain: [...nextMainBase].sort((a, b) => a.start - b.start), nextReserve: [...nextTarget].sort((a, b) => a.start - b.start), movingItem }
  }

  const readNativeDragPayload = (): DragPayload | null => {
    if (typeof window === 'undefined') return null
    const raw = (window as any).__JIBAO_LAST_DRAG_PAYLOAD
    if (!raw || typeof raw !== 'object') return null
    return raw as DragPayload
  }

  const writeLastDragTarget = (board: BoardKey, target: number) => {
    if (typeof window === 'undefined') return
    ;(window as any).__JIBAO_LAST_DRAG_TARGET = {
      board,
      target,
      ts: Date.now(),
    }
  }

  const buildDropDedupeKey = (board: BoardKey, payload: DragPayload | null | undefined, target: number) => {
    const sourceType = String(payload?.sourceType || '')
    const pid = String(payload?.placementId || '')
    const iid = String(payload?.item?.id || '')
    const width = Number(payload?.width || 0)
    return `${board}|${sourceType}|${pid}|${iid}|${target}|${width}`
  }

  const shouldSkipDuplicateDrop = (key: string): boolean => {
    if (typeof window === 'undefined') return false
    const now = Date.now()
    const prev = (window as any).__JIBAO_DROP_DEDUPE || null
    if (prev && prev.key === key && Number.isFinite(prev.ts) && now - prev.ts < 200) {
      return true
    }
    ;(window as any).__JIBAO_DROP_DEDUPE = { key, ts: now }
    return false
  }

  const attachNativeDropFallback = (node: HTMLDivElement, targetBoard: BoardKey): (() => void) => {
    const onDragOver = (e: DragEvent) => {
      const payload = readNativeDragPayload()
      if (!payload || payload.sourceType === 'skills') return
      e.preventDefault()
      e.dataTransfer && (e.dataTransfer.dropEffect = 'move')
      const clientX = Number(e.clientX || 0)
      const rect = resolveBoardRect(node)
      const unit = rect.width / MAX_UNITS
      if (!Number.isFinite(unit) || unit <= 0) return
      const width = payload.width || getCardWidth(payload.item?.size)
      const target = Math.max(0, Math.min(MAX_UNITS - width, Math.round((clientX - rect.left) / unit - width / 2)))
      writeLastDragTarget(targetBoard, target)
    }
    const onDrop = (e: DragEvent) => {
      const payload = readNativeDragPayload()
      if (!payload || payload.sourceType === 'skills') return
      e.preventDefault()
      const clientX = Number(e.clientX || 0)
      const rect = resolveBoardRect(node)
      const unit = rect.width / MAX_UNITS
      if (!Number.isFinite(unit) || unit <= 0) {
        logDndLocal(`native-drop-${targetBoard}:invalid-unit`, { rectWidth: rect.width, unit })
        return
      }
      const width = payload.width || getCardWidth(payload.item?.size)
      const target = Math.max(0, Math.min(MAX_UNITS - width, Math.round((clientX - rect.left) / unit - width / 2)))
      const dedupeKey = buildDropDedupeKey(targetBoard, payload, target)
      if (shouldSkipDuplicateDrop(dedupeKey)) {
        logDndLocal(`native-drop-${targetBoard}:deduped`, { dedupeKey })
        return
      }
      writeLastDragTarget(targetBoard, target)
      const res = buildDropPreview(targetBoard, payload, target)
      logDndLocal(`native-drop-${targetBoard}`, {
        x: clientX,
        left: rect.left,
        unit,
        width,
        target,
        ok: Boolean(res),
      })
      if (!res) return
      setCards(res.nextMain)
      setReserveCards(res.nextReserve)
      onSelectItem(res.movingItem)
      if (typeof window !== 'undefined') {
        ;(window as any).__JIBAO_LAST_DRAG_TARGET = null
      }
      window.requestAnimationFrame(() => {
        setPreview(null)
        setReservePreview(null)
      })
    }
    node.addEventListener('dragover', onDragOver)
    node.addEventListener('drop', onDrop)
    return () => {
      node.removeEventListener('dragover', onDragOver)
      node.removeEventListener('drop', onDrop)
    }
  }

  const [{ isOver }, drop] = useDrop(() => ({
    accept: ['ITEM', 'LINEUP_CARD'],
    hover: (dragged: DragPayload, monitor) => {
      if (!monitor.isOver({ shallow: true })) return
      if (!boardRef.current) return
      if (dragged.sourceType === 'skills') {
        logDndLocal('hover-main:ignored-skill', { dragged })
        return
      }
      const pt = getDnDPoint(monitor)
      if (!pt) {
        logDndLocal('hover-main:no-point', { dragged })
        return
      }
      const rect = resolveBoardRect(boardRef.current)
      const unit = rect.width / MAX_UNITS
      if (!Number.isFinite(unit) || unit <= 0) {
        logDndLocal('hover-main:invalid-unit', { rectWidth: rect.width, unit })
        return
      }
      const width = dragged.width || getCardWidth(dragged.item?.size)
      const target = Math.max(0, Math.min(MAX_UNITS - width, Math.round((pt.x - rect.left) / unit - width / 2)))
      logDndLocal('hover-main', { x: pt.x, left: rect.left, unit, width, target, sourceType: dragged.sourceType })
      lastHoverMainStartRef.current = target
      writeLastDragTarget('main', target)
      const res = buildDropPreview('main', dragged, target)
      if (!res) {
        setPreview(null)
        return
      }
      setPreview(res.nextMain)
      setReservePreview(res.nextReserve)
    },
    drop: (dragged: DragPayload, monitor) => {
      if (monitor.didDrop()) return
      if (dragged.sourceType === 'skills') {
        logDndLocal('drop-main:ignored-skill', { dragged })
        return
      }
      if (!boardRef.current) return
      const pt = getDnDPoint(monitor)
      if (!pt) {
        logDndLocal('drop-main:no-point', {
          dragged,
          hasPreview: Boolean(previewRef.current),
          hasReservePreview: Boolean(reservePreviewRef.current),
          fallbackTarget: lastHoverMainStartRef.current,
        })
        if (previewRef.current || reservePreviewRef.current) {
          if (previewRef.current) setCards(previewRef.current)
          if (reservePreviewRef.current) setReserveCards(reservePreviewRef.current)
          if (dragged.item) onSelectItem(dragged.item)
        } else {
          const width = dragged.width || getCardWidth(dragged.item?.size)
          const fallbackTarget = Math.max(0, Math.min(MAX_UNITS - width, lastHoverMainStartRef.current || 0))
          const fallback = buildDropPreview('main', dragged, fallbackTarget)
          if (fallback) {
            setCards(fallback.nextMain)
            setReserveCards(fallback.nextReserve)
            onSelectItem(fallback.movingItem)
          }
        }
        window.requestAnimationFrame(() => {
          setPreview(null)
          setReservePreview(null)
        })
        return
      }
      const rect = resolveBoardRect(boardRef.current)
      const unit = rect.width / MAX_UNITS
      if (!Number.isFinite(unit) || unit <= 0) {
        logDndLocal('drop-main:invalid-unit', { rectWidth: rect.width, unit })
        const width = dragged.width || getCardWidth(dragged.item?.size)
        const fallbackTarget = Math.max(0, Math.min(MAX_UNITS - width, lastHoverMainStartRef.current || 0))
        const fallback = buildDropPreview('main', dragged, fallbackTarget)
        if (fallback) {
          setCards(fallback.nextMain)
          setReserveCards(fallback.nextReserve)
          onSelectItem(fallback.movingItem)
        }
        window.requestAnimationFrame(() => {
          setPreview(null)
          setReservePreview(null)
        })
        return
      }
      const width = dragged.width || getCardWidth(dragged.item?.size)
      const target = Math.max(0, Math.min(MAX_UNITS - width, Math.round((pt.x - rect.left) / unit - width / 2)))
      const dedupeKey = buildDropDedupeKey('main', dragged, target)
      if (shouldSkipDuplicateDrop(dedupeKey)) {
        logDndLocal('drop-main:deduped', { dedupeKey })
        return
      }
      logDndLocal('drop-main', { x: pt.x, left: rect.left, unit, width, target, sourceType: dragged.sourceType })
      writeLastDragTarget('main', target)

      const res = buildDropPreview('main', dragged, target)
      if (res) {
        setCards(res.nextMain)
        setReserveCards(res.nextReserve)
        onSelectItem(res.movingItem)
        if (typeof window !== 'undefined') {
          ;(window as any).__JIBAO_LAST_DRAG_TARGET = null
        }
      } else {
        logDndLocal('drop-main:preview-null', { target, width, dragged })
      }
      window.requestAnimationFrame(() => {
        setPreview(null)
        setReservePreview(null)
      })
    },
    collect: (monitor) => ({ isOver: monitor.isOver({ shallow: true }) }),
  }), [slotMask, onSelectItem])

  const [{ isOverReserve }, dropReserve] = useDrop(() => ({
    accept: ['ITEM', 'LINEUP_CARD'],
    hover: (dragged: DragPayload, monitor) => {
      if (!monitor.isOver({ shallow: true })) return
      if (!reserveBoardRef.current) return
      if (dragged.sourceType === 'skills') {
        logDndLocal('hover-reserve:ignored-skill', { dragged })
        return
      }
      const pt = getDnDPoint(monitor)
      if (!pt) {
        logDndLocal('hover-reserve:no-point', { dragged })
        return
      }
      const rect = resolveBoardRect(reserveBoardRef.current)
      const unit = rect.width / MAX_UNITS
      if (!Number.isFinite(unit) || unit <= 0) {
        logDndLocal('hover-reserve:invalid-unit', { rectWidth: rect.width, unit })
        return
      }
      const width = dragged.width || getCardWidth(dragged.item?.size)
      const target = Math.max(0, Math.min(MAX_UNITS - width, Math.round((pt.x - rect.left) / unit - width / 2)))
      logDndLocal('hover-reserve', { x: pt.x, left: rect.left, unit, width, target, sourceType: dragged.sourceType })
      lastHoverReserveStartRef.current = target
      writeLastDragTarget('reserve', target)
      const res = buildDropPreview('reserve', dragged, target)
      if (!res) {
        setReservePreview(null)
        return
      }
      setPreview(res.nextMain)
      setReservePreview(res.nextReserve)
    },
    drop: (dragged: DragPayload, monitor) => {
      if (monitor.didDrop()) return
      if (dragged.sourceType === 'skills') {
        logDndLocal('drop-reserve:ignored-skill', { dragged })
        return
      }
      if (!reserveBoardRef.current) return
      const pt = getDnDPoint(monitor)
      if (!pt) {
        logDndLocal('drop-reserve:no-point', {
          dragged,
          hasPreview: Boolean(previewRef.current),
          hasReservePreview: Boolean(reservePreviewRef.current),
          fallbackTarget: lastHoverReserveStartRef.current,
        })
        if (previewRef.current || reservePreviewRef.current) {
          if (previewRef.current) setCards(previewRef.current)
          if (reservePreviewRef.current) setReserveCards(reservePreviewRef.current)
          if (dragged.item) onSelectItem(dragged.item)
        } else {
          const width = dragged.width || getCardWidth(dragged.item?.size)
          const fallbackTarget = Math.max(0, Math.min(MAX_UNITS - width, lastHoverReserveStartRef.current || 0))
          const fallback = buildDropPreview('reserve', dragged, fallbackTarget)
          if (fallback) {
            setCards(fallback.nextMain)
            setReserveCards(fallback.nextReserve)
            onSelectItem(fallback.movingItem)
          }
        }
        window.requestAnimationFrame(() => {
          setPreview(null)
          setReservePreview(null)
        })
        return
      }
      const rect = resolveBoardRect(reserveBoardRef.current)
      const unit = rect.width / MAX_UNITS
      if (!Number.isFinite(unit) || unit <= 0) {
        logDndLocal('drop-reserve:invalid-unit', { rectWidth: rect.width, unit })
        const width = dragged.width || getCardWidth(dragged.item?.size)
        const fallbackTarget = Math.max(0, Math.min(MAX_UNITS - width, lastHoverReserveStartRef.current || 0))
        const fallback = buildDropPreview('reserve', dragged, fallbackTarget)
        if (fallback) {
          setCards(fallback.nextMain)
          setReserveCards(fallback.nextReserve)
          onSelectItem(fallback.movingItem)
        }
        window.requestAnimationFrame(() => {
          setPreview(null)
          setReservePreview(null)
        })
        return
      }
      const width = dragged.width || getCardWidth(dragged.item?.size)
      const target = Math.max(0, Math.min(MAX_UNITS - width, Math.round((pt.x - rect.left) / unit - width / 2)))
      const dedupeKey = buildDropDedupeKey('reserve', dragged, target)
      if (shouldSkipDuplicateDrop(dedupeKey)) {
        logDndLocal('drop-reserve:deduped', { dedupeKey })
        return
      }
      logDndLocal('drop-reserve', { x: pt.x, left: rect.left, unit, width, target, sourceType: dragged.sourceType })
      writeLastDragTarget('reserve', target)
      const res = buildDropPreview('reserve', dragged, target)
      if (res) {
        setCards(res.nextMain)
        setReserveCards(res.nextReserve)
        onSelectItem(res.movingItem)
        if (typeof window !== 'undefined') {
          ;(window as any).__JIBAO_LAST_DRAG_TARGET = null
        }
      } else {
        logDndLocal('drop-reserve:preview-null', { target, width, dragged })
      }
      window.requestAnimationFrame(() => {
        setPreview(null)
        setReservePreview(null)
      })
    },
    collect: (monitor) => ({ isOverReserve: monitor.isOver({ shallow: true }) }),
  }), [slotMask, onSelectItem])

  useEffect(() => {
    setCards((prev) => compactByOrder(prev, slotMask))
    setReserveCards((prev) => compactByOrder(prev, slotMask))
    setPreview(null)
    setReservePreview(null)
    setSuggestPreviewId(null)
  }, [slotMask])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const forceDrop = (payload: DragPayload): boolean => {
      if (!payload || payload.sourceType === 'skills') return false
      const rawTarget = (window as any).__JIBAO_LAST_DRAG_TARGET || null
      const width = payload.width || getCardWidth(payload.item?.size)
      const board: BoardKey = rawTarget?.board === 'reserve' ? 'reserve' : 'main'
      const fallbackMain = Math.max(0, Math.min(MAX_UNITS - width, lastHoverMainStartRef.current || 0))
      const fallbackReserve = Math.max(0, Math.min(MAX_UNITS - width, lastHoverReserveStartRef.current || 0))
      const target = Math.max(
        0,
        Math.min(
          MAX_UNITS - width,
          Number.isFinite(Number(rawTarget?.target))
            ? Number(rawTarget.target)
            : board === 'reserve'
              ? fallbackReserve
              : fallbackMain,
        ),
      )
      const res = buildDropPreview(board, payload, target)
      logDndLocal('force-drop', {
        board,
        target,
        width,
        hasRawTarget: Boolean(rawTarget),
        ok: Boolean(res),
      })
      if (!res) return false
      setCards(res.nextMain)
      setReserveCards(res.nextReserve)
      onSelectItem(res.movingItem)
      ;(window as any).__JIBAO_LAST_DRAG_TARGET = null
      window.requestAnimationFrame(() => {
        setPreview(null)
        setReservePreview(null)
      })
      return true
    }
    ;(window as any).__JIBAO_FORCE_DROP = forceDrop
    return () => {
      if ((window as any).__JIBAO_FORCE_DROP === forceDrop) {
        ;(window as any).__JIBAO_FORCE_DROP = null
      }
    }
  }, [buildDropPreview, onSelectItem])

  const bindBoardRef = useCallback((node: HTMLDivElement | null) => {
    if (nativeMainCleanupRef.current) {
      nativeMainCleanupRef.current()
      nativeMainCleanupRef.current = null
    }
    boardRef.current = node
    if (node) {
      const rect = node.getBoundingClientRect()
      logDndLocal('bind-main-board', { width: rect.width, height: rect.height })
      nativeMainCleanupRef.current = attachNativeDropFallback(node, 'main')
    } else {
      logDndLocal('bind-main-board:null')
    }
    drop(node)
  }, [drop, onSelectItem, slotMask])
  const bindReserveBoardRef = useCallback((node: HTMLDivElement | null) => {
    if (nativeReserveCleanupRef.current) {
      nativeReserveCleanupRef.current()
      nativeReserveCleanupRef.current = null
    }
    reserveBoardRef.current = node
    if (node) {
      const rect = node.getBoundingClientRect()
      logDndLocal('bind-reserve-board', { width: rect.width, height: rect.height })
      nativeReserveCleanupRef.current = attachNativeDropFallback(node, 'reserve')
    } else {
      logDndLocal('bind-reserve-board:null')
    }
    dropReserve(node)
  }, [dropReserve, onSelectItem, slotMask])

  useEffect(() => {
    return () => {
      if (nativeMainCleanupRef.current) nativeMainCleanupRef.current()
      if (nativeReserveCleanupRef.current) nativeReserveCleanupRef.current()
      nativeMainCleanupRef.current = null
      nativeReserveCleanupRef.current = null
    }
  }, [])

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
          <button className={styles.applyBtn} onClick={applyPoisonExample}>毒核示例</button>
          <button className={styles.applyBtn} onClick={() => setShowSupportPanel((v) => !v)}>
            已经支持的卡牌词条
          </button>
          <button className={styles.clearBtn} onClick={() => { setCards([]); setReserveCards([]); setPreview(null); setReservePreview(null); setSelectedId(null) }}>清空</button>
        </div>
      </div>

      {showSupportPanel ? (
        <div className={styles.supportPanel}>
          <div className={styles.supportStats}>
            <span>总卡牌：<strong>{supportSummary?.totalCards ?? 0}</strong></span>
            <span>完全支持：<strong className={styles.supportOk}>{supportSummary?.fullySupportedCards ?? 0}</strong></span>
            <span>待支持：<strong className={styles.supportPending}>{supportSummary?.unsupportedCards ?? 0}</strong></span>
          </div>
          <div className={styles.supportBlock}>
            <div className={styles.supportTitle}>已支持词条</div>
            <div className={styles.supportTags}>
              {(supportSummary?.supportedTokens || []).map((token) => (
                <span key={token} className={styles.supportTag}>{token}</span>
              ))}
            </div>
          </div>
          <div className={styles.supportBlock}>
            <div className={styles.supportTitle}>未支持词条（按出现次数）</div>
            <div className={styles.unsupportedList}>
              {(supportSummary?.unsupportedTokenCounts || []).length ? (
                (supportSummary?.unsupportedTokenCounts || []).map((x) => (
                  <div key={x.token} className={styles.unsupportedRow}>
                    <span>{x.token}</span>
                    <strong>{x.count}</strong>
                  </div>
                ))
              ) : (
                <div className={styles.supportEmpty}>暂无</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
        burnMap={combatDisplay.byCardBurn}
        poisonMap={combatDisplay.byCardPoison}
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
        <div className={styles.modeTabs}>
          <button
            className={`${styles.modeTab} ${calcMode === 'seconds' ? styles.modeTabActive : ''}`}
            onClick={() => setCalcMode('seconds')}
          >
            定时看伤害
          </button>
          <button
            className={`${styles.modeTab} ${calcMode === 'target-damage' ? styles.modeTabActive : ''}`}
            onClick={() => setCalcMode('target-damage')}
          >
            定伤看用时
          </button>
        </div>
        <div className={styles.useCtrl}>
          <span className={styles.axisLabel}>对手冷却物品</span>
          <button
            className={styles.spinBtn}
            onClick={() => setOpponentCooldownItems((v) => Math.max(0, v - 1))}
          >
            -
          </button>
          <input
            className={styles.useInput}
            type="number"
            min={0}
            max={10}
            value={opponentCooldownItems}
            onChange={(e) => {
              const raw = e.target.value
              if (raw === '') return
              const n = Math.floor(Number(raw))
              if (!Number.isFinite(n)) return
              setOpponentCooldownItems(Math.max(0, Math.min(10, n)))
            }}
          />
          <button
            className={styles.spinBtn}
            onClick={() => setOpponentCooldownItems((v) => Math.min(10, v + 1))}
          >
            +
          </button>
        </div>
        <div className={styles.statItem}>{simSeconds}秒总伤害：<strong>{calc.combatCurrent.totalDamage.toFixed(1)}</strong></div>
        {Number(calc.combatCurrent.randomTrials || 0) > 1 ? (
          <div className={styles.statItem}>
            随机模拟（{calc.combatCurrent.randomTrials}次）：
            <strong>
              最低 {Number(calc.combatCurrent.totalDamageMin || 0).toFixed(1)}
              {' / '}平均 {Number(calc.combatCurrent.totalDamageAvg || calc.combatCurrent.totalDamage || 0).toFixed(1)}
              {' / '}最高 {Number(calc.combatCurrent.totalDamageMax || 0).toFixed(1)}
            </strong>
          </div>
        ) : null}
        <div className={styles.statItem}>{simSeconds}秒灼烧累计：<strong>{calc.combatCurrent.totalBurnApplied.toFixed(1)}</strong></div>
        <div className={styles.statItem}>{simSeconds}秒剧毒累计：<strong>{calc.combatCurrent.totalPoisonApplied.toFixed(1)}</strong></div>
        <div className={styles.statItem}>{simSeconds}秒剧毒伤害：<strong>{calc.combatCurrent.totalPoisonTickDamage.toFixed(1)}</strong></div>
        <div className={styles.statItem}>联合优化池：<strong>{calc.optimizationBaseLen}</strong> 张</div>
        <div className={styles.useCtrl}>
          {calcMode === 'seconds' ? (
            <>
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
            </>
          ) : null}
          {calcMode === 'target-damage' ? (
            <>
              <button
                className={styles.spinBtn}
                onClick={() => {
                  const cur = Math.max(1, Math.floor(Number(targetDamageInput) || targetDamageDraft || 1))
                  const next = Math.max(1, cur - 100)
                  setTargetDamageDraft(next)
                  setTargetDamageInput(String(next))
                }}
              >
                -
              </button>
              <input
                className={styles.useInput}
                type="text"
                inputMode="numeric"
                value={targetDamageInput}
                onChange={(e) => {
                  const v = String(e.target.value || '')
                  if (v === '' || /^\d+$/.test(v)) setTargetDamageInput(v)
                }}
                placeholder="目标伤害"
              />
              <button
                className={styles.spinBtn}
                onClick={() => {
                  const cur = Math.max(1, Math.floor(Number(targetDamageInput) || targetDamageDraft || 1))
                  const next = cur + 100
                  setTargetDamageDraft(next)
                  setTargetDamageInput(String(next))
                }}
              >
                +
              </button>
            </>
          ) : null}
          <button className={styles.applyBtn} onClick={requestCalculate}>计算伤害</button>
          <button className={styles.applyBtn} onClick={requestSuggestLayouts}>推荐摆法</button>
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

      <div className={styles.listBox}>
        <div className={styles.listTitle}>出手时间轴（每0.5秒）</div>
        {useTimelineHalfSec.length === 0 ? (
          <div className={styles.empty}>暂无事件</div>
        ) : (
          useTimelineHalfSec.slice(0, 240).map((e, idx) => (
            <div key={`use-half-${idx}`} className={styles.lineItem}>
              [{e.time.toFixed(1)}s] {e.list.join('，')}
            </div>
          ))
        )}
      </div>

      <div className={styles.listBox}>
        <div className={styles.listTitle}>调试明细（触发/充能/灼烧）</div>
        {calc.combatCurrent.debugTimeline.length === 0 ? (
          <div className={styles.empty}>暂无事件</div>
        ) : (
          calc.combatCurrent.debugTimeline.slice(0, 240).map((e, idx) => (
            <div key={`dbg-${idx}`} className={styles.lineItem}>
              [{e.time.toFixed(1)}s] {e.source}{e.target ? ` -> ${e.target}` : ''} · {e.note || e.kind}
            </div>
          ))
        )}
      </div>

      {isCalculating ? (
        <div className={styles.calculatingOverlay}>
          <div className={styles.calculatingCard}>
            <div className={styles.calculatingTitle}>{calcProgressLabel || '正在计算…'}</div>
            <div className={styles.calculatingBar}>
              <div className={styles.calculatingBarFill} style={{ width: `${Math.max(0, Math.min(100, calcProgress))}%` }} />
            </div>
            <div className={styles.calculatingHint}>{Math.round(calcProgress)}%</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
