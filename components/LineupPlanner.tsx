'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDrag, useDrop } from 'react-dnd'
import styles from './LineupPlanner.module.css'
import { resolveItemImageUrl } from '@/lib/itemImage'
import DayRangeInput from '@/components/common/DayRangeInput'
import { loadLineupScaleFromDb, saveLineupScaleToDb } from '@/lib/draftDb'

const MAX_UNITS = 10
const SLOT_GAP_PX = 0
const TIER_ORDER = ['bronze', 'silver', 'gold', 'diamond', 'legendary'] as const

const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  diamond: '#7fe9ff',
  legendary: '#ff6b3d',
}

const TIER_LABELS: Record<string, string> = {
  bronze: '青铜',
  silver: '白银',
  gold: '黄金',
  diamond: '钻石',
  legendary: '传奇',
}

type PlannerItem = {
  id: string
  name_cn?: string
  name_en?: string
  size?: string
  art_key?: string
  starting_tier?: string
  available_tiers?: string
  tier?: string
  [key: string]: any
}

type PlacedCard = {
  placementId: string
  item: PlannerItem
  start: number
  width: number
  borderTier: string
}

type CardBuild = {
  id: string
  name: string
  cards: PlacedCard[]
  corePlacementIds: string[]
  secondaryPlacementIds: string[]
  supportPlacementIds: string[]
}

type SkillEntry = {
  skillId: string
  item: PlannerItem
}

type Segment = {
  id: string
  dayFrom: number
  dayTo: number
  hero: string
  strategyText: string
  specialSlots: SpecialSlot[]
  builds: CardBuild[]
  skills: SkillEntry[]
  coreSkillIds: string[]
  importantSkillIds: string[]
  optionalSkillIds: string[]
}

type SpecialSlot = {
  id: string
  slot: number
  type: 'fire' | 'ice'
}

type DragPayload = {
  placementId?: string
  item?: PlannerItem
  width?: number
  sourceType?: 'items' | 'skills'
}

type PreviewResult = {
  cards: PlacedCard[]
}

type PlannerExportPayload = {
  version: 1 | 2 | 3
  dayStart: number
  dayEnd: number
  hero?: string
  lineupName?: string
  dayPlanTag?: '连胜早走' | '北伐阵容'
  strengthTag?: '版本强势' | '中规中矩' | '地沟油'
  difficultyTag?: '容易成型' | '比较困难' | '极难成型'
  segments: Segment[]
  activeSegmentIndex: number
  activeBuildBySegment: Record<string, string>
}

interface LineupPlannerProps {
  onSelectItem: (item: PlannerItem) => void
  onDraftApiChange?: (api: {
    getSnapshot: () => any
    applySnapshot: (payload: any) => void
    getContextLabel?: () => string
  } | null) => void
}

const HERO_OPTIONS = ['Pygmalien', 'Jules', 'Vanessa', 'Mak', 'Dooley', 'Stelle'] as const
const DAY_PLAN_OPTIONS = ['连胜早走', '北伐阵容'] as const
const STRENGTH_OPTIONS = ['版本强势', '中规中矩', '地沟油'] as const
const DIFFICULTY_OPTIONS = ['容易成型', '比较困难', '极难成型'] as const
const HERO_LABELS: Record<string, string> = {
  Pygmalien: '皮格马利翁',
  Jules: '厨师 Jules',
  Vanessa: '瓦内莎',
  Mak: '马克',
  Dooley: '多利',
  Stelle: '斯黛拉',
}

function createCardBuild(index = 1): CardBuild {
  return {
    id: `build-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `方案 ${index}`,
    cards: [],
    corePlacementIds: [],
    secondaryPlacementIds: [],
    supportPlacementIds: [],
  }
}

function cloneBuild(build: CardBuild): CardBuild {
  return {
    ...build,
    cards: [...build.cards],
    corePlacementIds: [...build.corePlacementIds],
    secondaryPlacementIds: [...build.secondaryPlacementIds],
    supportPlacementIds: [...build.supportPlacementIds],
  }
}

function createSegment(dayFrom: number, dayTo: number): Segment {
  return {
    id: `seg-${dayFrom}-${dayTo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dayFrom,
    dayTo,
    hero: 'Pygmalien',
    strategyText: '',
    specialSlots: [],
    builds: [createCardBuild(1)],
    skills: [],
    coreSkillIds: [],
    importantSkillIds: [],
    optionalSkillIds: [],
  }
}

function createDefaultSegments(): Segment[] {
  return [
    createSegment(1, 1),
    createSegment(2, 2),
    createSegment(3, 7),
    createSegment(8, 13),
  ]
}

function createSegmentWithHero(dayFrom: number, dayTo: number, hero: string): Segment {
  const seg = createSegment(dayFrom, dayTo)
  return {
    ...seg,
    hero,
    specialSlots: hero === 'Jules' ? createJulesSpecialSlots(dayFrom) : [],
  }
}

function createDefaultSegmentsForRange(dayFrom: number, dayTo: number, hero: string): Segment[] {
  const ranges: Array<[number, number]> = []

  const addRange = (from: number, to: number) => {
    if (from <= to) ranges.push([from, to])
  }

  if (dayFrom <= 1 && dayTo >= 1) addRange(1, 1)
  if (dayFrom <= 2 && dayTo >= 2) addRange(2, 2)
  addRange(Math.max(dayFrom, 3), Math.min(dayTo, 7))
  addRange(Math.max(dayFrom, 8), Math.min(dayTo, 13))
  if (dayTo > 13) addRange(Math.max(dayFrom, 14), dayTo)

  if (ranges.length === 0) addRange(dayFrom, dayTo)

  return ranges.map(([from, to]) => createSegmentWithHero(from, to, hero))
}

function getCardWidth(size?: string): number {
  const normalized = (size || 'Medium').split('/')[0].trim().toLowerCase()
  if (normalized.includes('small') || normalized.includes('小')) return 1
  if (normalized.includes('large') || normalized.includes('大')) return 3
  return 2
}

function parseTierToken(input?: string): string {
  if (!input) return 'bronze'
  const match = input.match(/bronze|silver|gold|diamond|legendary/i)
  return (match?.[0] || 'bronze').toLowerCase()
}

function parseAvailableTiers(input?: string): string[] {
  if (!input) return []
  const tokens = input.match(/bronze|silver|gold|diamond|legendary/gi) || []
  const uniq = Array.from(new Set(tokens.map((t) => t.toLowerCase())))
  return uniq.filter((t) => TIER_ORDER.includes(t as any))
}

function getBorderTierOptions(item: PlannerItem): { options: string[]; editable: boolean } {
  const start = parseTierToken(item.starting_tier || item.tier)
  if (start === 'diamond' || start === 'legendary') {
    return { options: [start], editable: false }
  }

  const startIndex = TIER_ORDER.indexOf(start as any)
  const available = parseAvailableTiers(item.available_tiers)
  if (available.length > 0) {
    const filtered = available
      .filter((t) => TIER_ORDER.indexOf(t as any) >= startIndex)
      .sort((a, b) => TIER_ORDER.indexOf(a as any) - TIER_ORDER.indexOf(b as any))
    if (filtered.length > 0) return { options: filtered, editable: true }
  }

  return {
    options: TIER_ORDER.slice(startIndex, TIER_ORDER.indexOf('diamond') + 1),
    editable: true,
  }
}

function getDefaultBorderTier(item: PlannerItem): string {
  return parseTierToken(item.starting_tier || item.tier)
}

function getItemImageUrl(item: PlannerItem): string {
  return resolveItemImageUrl(item)
}

function getSegmentLabel(segment: Segment): string {
  return segment.dayFrom === segment.dayTo
    ? `Day${segment.dayFrom}`
    : `Day${segment.dayFrom}-Day${segment.dayTo}`
}

function buildOccupancy(): boolean[] {
  return Array.from({ length: MAX_UNITS }, () => false)
}

function reserve(occ: boolean[], start: number, width: number) {
  for (let i = start; i < start + width; i += 1) occ[i] = true
}

function canReserve(occ: boolean[], start: number, width: number, allowed: boolean[]): boolean {
  if (start < 0 || start + width > MAX_UNITS) return false
  for (let i = start; i < start + width; i += 1) {
    if (occ[i] || !allowed[i]) return false
  }
  return true
}

function findNearestStart(occ: boolean[], width: number, preferred: number, allowed: boolean[]): number | null {
  const candidates: number[] = []
  for (let s = 0; s <= MAX_UNITS - width; s += 1) {
    if (canReserve(occ, s, width, allowed)) candidates.push(s)
  }
  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const da = Math.abs(a - preferred)
    const db = Math.abs(b - preferred)
    if (da !== db) return da - db
    return a - b
  })
  return candidates[0]
}

function computeAutoLayout(
  cardsWithoutMoving: PlacedCard[],
  movingTemplate: PlacedCard,
  targetStart: number,
  allowed: boolean[]
): PlacedCard[] | null {
  const availableUnits = allowed.filter(Boolean).length
  if (cardsWithoutMoving.reduce((sum, c) => sum + c.width, 0) + movingTemplate.width > availableUnits) {
    return null
  }

  const occ = buildOccupancy()
  const placed: PlacedCard[] = []

  const preferred = Math.max(0, Math.min(MAX_UNITS - movingTemplate.width, targetStart))
  const movingStart = findNearestStart(occ, movingTemplate.width, preferred, allowed)
  if (movingStart === null) return null
  reserve(occ, movingStart, movingTemplate.width)
  placed.push({ ...movingTemplate, start: movingStart })

  const sortedOthers = [...cardsWithoutMoving].sort((a, b) => a.start - b.start)
  for (const card of sortedOthers) {
    const chosen = findNearestStart(occ, card.width, card.start, allowed)
    if (chosen === null) return null
    reserve(occ, chosen, card.width)
    placed.push({ ...card, start: chosen })
  }

  return placed.sort((a, b) => a.start - b.start)
}

function getAvailableSlotsByDay(day: number): number[] {
  if (day <= 1) return [2, 3, 4, 5, 6, 7]
  if (day === 2) return [1, 2, 3, 4, 5, 6, 7, 8]
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
}

function getAllowedMaskByDay(day: number): boolean[] {
  const available = new Set(getAvailableSlotsByDay(day))
  return Array.from({ length: MAX_UNITS }, (_, idx) => available.has(idx))
}

function randomPick(values: number[]): number {
  return values[Math.floor(Math.random() * values.length)]
}

function createJulesSpecialSlots(day: number): SpecialSlot[] {
  const slots: SpecialSlot[] = []
  const firePool = [3, 4, 5, 6]
  const fire = randomPick(firePool)
  slots.push({ id: `fire-${fire}`, slot: fire, type: 'fire' })

  if (day >= 2) {
    const icePool = [1, 2, 3, 4, 5, 6, 7, 8].filter((idx) => idx !== fire)
    const ice = randomPick(icePool)
    slots.push({ id: `ice-${ice}`, slot: ice, type: 'ice' })
  }

  if (day >= 7) {
    const used = new Set(slots.map((s) => s.slot))
    const thirdPool = Array.from({ length: 10 }, (_, idx) => idx).filter((idx) => !used.has(idx))
    const third = randomPick(thirdPool)
    slots.push({ id: `mix-${third}`, slot: third, type: Math.random() > 0.5 ? 'fire' : 'ice' })
  }

  return slots
}

function getJulesSlotCount(day: number): number {
  if (day >= 7) return 3
  if (day >= 2) return 2
  return 1
}

function syncJulesSpecialSlotsAcrossSegments(segments: Segment[]): Segment[] {
  const jules = segments.filter((seg) => seg.hero === 'Jules')
  if (jules.length === 0) {
    let changed = false
    const cleaned = segments.map((seg) => {
      if (seg.specialSlots.length === 0) return seg
      changed = true
      return { ...seg, specialSlots: [] }
    })
    return changed ? cleaned : segments
  }

  const sorted = [...jules].sort((a, b) => a.dayFrom - b.dayFrom)
  const templateByRank: Array<{ slot: number; type: 'fire' | 'ice' } | null> = [null, null, null]
  for (let rank = 0; rank < 3; rank += 1) {
    const sourceForRank = sorted.find(
      (seg) => getJulesSlotCount(seg.dayFrom) >= rank + 1 && seg.specialSlots.length > rank
    )
    templateByRank[rank] = sourceForRank
      ? { slot: sourceForRank.specialSlots[rank].slot, type: sourceForRank.specialSlots[rank].type }
      : null
  }

  let changed = false
  const next = segments.map((seg) => {
    if (seg.hero !== 'Jules') {
      if (seg.specialSlots.length === 0) return seg
      changed = true
      return { ...seg, specialSlots: [] }
    }

    const maxCount = getJulesSlotCount(seg.dayFrom)
    const allowedMask = getAllowedMaskByDay(seg.dayFrom)
    const used = new Set<number>()
    const slots: SpecialSlot[] = []

    for (let i = 0; i < maxCount; i += 1) {
      const base = templateByRank[i]
      if (!base) continue
      let target = base.slot
      const candidatePool = Array.from({ length: MAX_UNITS }, (_, idx) => idx).filter((idx) => allowedMask[idx])
      const day1Pool = [3, 4, 5, 6]

      if (seg.dayFrom <= 1 && i === 0 && !day1Pool.includes(target)) target = 4
      if (!allowedMask[target] || used.has(target) || (seg.dayFrom <= 1 && i === 0 && !day1Pool.includes(target))) {
        const fallback = (seg.dayFrom <= 1 && i === 0 ? day1Pool : candidatePool).find((idx) => !used.has(idx))
        if (fallback === undefined) continue
        target = fallback
      }

      used.add(target)
      slots.push({
        id: `jules-slot-${i + 1}`,
        slot: target,
        type: seg.dayFrom <= 1 && i === 0 ? 'fire' : base.type,
      })
    }

    const same =
      seg.specialSlots.length === slots.length &&
      seg.specialSlots.every(
        (slot, idx) => slot.id === slots[idx]?.id && slot.slot === slots[idx]?.slot && slot.type === slots[idx]?.type
      )
    if (same) return seg
    changed = true
    return { ...seg, specialSlots: slots }
  })

  return changed ? next : segments
}

function normalizeCardsToAllowed(cards: PlacedCard[], allowed: boolean[]): PlacedCard[] {
  const occ = buildOccupancy()
  const next: PlacedCard[] = []
  const sorted = [...cards].sort((a, b) => a.start - b.start)
  for (const card of sorted) {
    const chosen = findNearestStart(occ, card.width, card.start, allowed)
    if (chosen === null) continue
    reserve(occ, chosen, card.width)
    next.push({ ...card, start: chosen })
  }
  return next
}

function getSlotIndexFromPointer(relativeX: number, boardWidth: number): number {
  const cellWidth = (boardWidth - SLOT_GAP_PX * (MAX_UNITS - 1)) / MAX_UNITS
  let cursor = 0
  for (let i = 0; i < MAX_UNITS; i += 1) {
    const end = cursor + cellWidth
    if (relativeX <= end) return i
    cursor = end + SLOT_GAP_PX
  }
  return MAX_UNITS - 1
}

export default function LineupPlanner({ onSelectItem, onDraftApiChange }: LineupPlannerProps) {
  const [dayStart, setDayStart] = useState(1)
  const [dayEnd, setDayEnd] = useState(13)
  const [dayStartInput, setDayStartInput] = useState('1')
  const [dayEndInput, setDayEndInput] = useState('13')

  const [segments, setSegments] = useState<Segment[]>(() => createDefaultSegments())
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0)
  const [activeBuildBySegment, setActiveBuildBySegment] = useState<Record<string, string>>({})

  const [dropHint, setDropHint] = useState('')
  const [dropHintTone, setDropHintTone] = useState<'error' | 'success'>('error')
  const [draggingHandleIndex, setDraggingHandleIndex] = useState<number | null>(null)
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null)
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [previewCards, setPreviewCards] = useState<PlacedCard[] | null>(null)
  const [boardScale, setBoardScale] = useState(1)
  const [lineupName, setLineupName] = useState('')
  const [isEditingLineupName, setIsEditingLineupName] = useState(false)
  const [lineupNameDraft, setLineupNameDraft] = useState('')
  const [dayPlanTag, setDayPlanTag] = useState<'连胜早走' | '北伐阵容'>('连胜早走')
  const [strengthTag, setStrengthTag] = useState<'版本强势' | '中规中矩' | '地沟油'>('中规中矩')
  const [difficultyTag, setDifficultyTag] = useState<'容易成型' | '比较困难' | '极难成型'>('比较困难')

  const boardRef = useRef<HTMLDivElement | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const boardScaleHydrated = useRef(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const saved = await loadLineupScaleFromDb()
      if (!mounted) return
      if (saved && saved >= 0.8 && saved <= 1.6) {
        setBoardScale(Math.round(saved * 10) / 10)
      }
      boardScaleHydrated.current = true
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!boardScaleHydrated.current) return
    saveLineupScaleToDb(boardScale)
  }, [boardScale])

  const activeSegment = useMemo(
    () => segments[Math.max(0, Math.min(activeSegmentIndex, segments.length - 1))],
    [segments, activeSegmentIndex]
  )

  const activeBuild = useMemo(() => {
    if (!activeSegment) return null
    const activeBuildId = activeBuildBySegment[activeSegment.id]
    return activeSegment.builds.find((b) => b.id === activeBuildId) || activeSegment.builds[0] || null
  }, [activeSegment, activeBuildBySegment])

  const cardsForRender = previewCards || activeBuild?.cards || []
  const dayRule = activeSegment?.dayFrom || dayStart
  const allowedMask = useMemo(() => getAllowedMaskByDay(dayRule), [dayRule])
  const activeHero = segments[0]?.hero || activeSegment?.hero || 'Pygmalien'
  const displayLineupName = useMemo(() => {
    if (lineupName.trim()) return lineupName.trim()
    return `${HERO_LABELS[activeHero] || activeHero} Day${dayStart}-Day${dayEnd}`
  }, [lineupName, activeHero, dayStart, dayEnd])
  const visibleSpecialSlots = useMemo(() => {
    if (!activeSegment || activeHero !== 'Jules') return []
    return activeSegment.specialSlots
  }, [activeSegment, activeHero])

  useEffect(() => {
    setActiveBuildBySegment((prev) => {
      if (Object.keys(prev).length > 0) return prev
      const next: Record<string, string> = {}
      segments.forEach((seg) => {
        if (seg.builds[0]) next[seg.id] = seg.builds[0].id
      })
      return next
    })
  }, [])

  const selectedCard = useMemo(() => {
    if (!activeBuild || !selectedPlacementId) return null
    return activeBuild.cards.find((card) => card.placementId === selectedPlacementId) || null
  }, [activeBuild, selectedPlacementId])

  const selectedSkill = useMemo(() => {
    if (!activeSegment || !selectedSkillId) return null
    return activeSegment.skills.find((s) => s.skillId === selectedSkillId) || null
  }, [activeSegment, selectedSkillId])

  const activeBuildIndex = useMemo(() => {
    if (!activeSegment || !activeBuild) return 0
    const idx = activeSegment.builds.findIndex((b) => b.id === activeBuild.id)
    return idx >= 0 ? idx : 0
  }, [activeSegment, activeBuild])

  useEffect(() => {
    if (!activeBuild) return
    const normalized = normalizeCardsToAllowed(activeBuild.cards, allowedMask)
    const changed =
      normalized.length !== activeBuild.cards.length ||
      normalized.some((card, idx) => {
        const old = activeBuild.cards[idx]
        return !old || old.placementId !== card.placementId || old.start !== card.start
      })
    if (!changed) return

    updateActiveBuild((build) => {
      const nextCards = normalizeCardsToAllowed(build.cards, allowedMask)
      const stillExists = new Set(nextCards.map((c) => c.placementId))
      return {
        ...build,
        cards: nextCards,
        corePlacementIds: build.corePlacementIds.filter((id) => stillExists.has(id)),
        secondaryPlacementIds: build.secondaryPlacementIds.filter((id) => stillExists.has(id)),
        supportPlacementIds: build.supportPlacementIds.filter((id) => stillExists.has(id)),
      }
    })
  }, [activeBuild?.id, activeSegment?.id, allowedMask])

  useEffect(() => {
    setSegments((prev) => syncJulesSpecialSlotsAcrossSegments(prev))
  }, [dayStart, dayEnd])

  const updateActiveSegment = (updater: (seg: Segment) => Segment) => {
    setSegments((prev) => {
      const idx = Math.max(0, Math.min(activeSegmentIndex, prev.length - 1))
      return prev.map((seg, i) => (i === idx ? updater(seg) : seg))
    })
  }

  const applyActiveHero = (hero: string) => {
    if (hero === activeHero) return
    const hasAnyCards = segments.some((seg) => seg.builds.some((b) => b.cards.length > 0))
    if (hasAnyCards) {
      const ok = window.confirm('切换英雄会清空当前所有方案内容，是否继续？')
      if (!ok) return
    }

    const nextSegments = syncJulesSpecialSlotsAcrossSegments(
      segments.map((seg) => {
        if (!hasAnyCards) {
          return {
            ...seg,
            hero,
            specialSlots: hero === 'Jules'
              ? (seg.specialSlots.length > 0 ? seg.specialSlots : createJulesSpecialSlots(seg.dayFrom))
              : [],
          }
        }
        const firstBuild = createCardBuild(1)
        return {
          ...seg,
          hero,
          specialSlots: hero === 'Jules' ? createJulesSpecialSlots(seg.dayFrom) : [],
          builds: [firstBuild],
          skills: [],
          coreSkillIds: [],
          importantSkillIds: [],
          optionalSkillIds: [],
        }
      })
    )
    setSegments(nextSegments)
    if (hasAnyCards) {
      const nextBuildBySeg: Record<string, string> = {}
      nextSegments.forEach((seg) => {
        if (seg.builds[0]) nextBuildBySeg[seg.id] = seg.builds[0].id
      })
      setActiveBuildBySegment(nextBuildBySeg)
      setSelectedPlacementId(null)
      setSelectedSkillId(null)
      setPreviewCards(null)
    }
    setDropHint('')
  }

  const toggleSpecialSlotType = (slotId: string) => {
    if ((activeSegment?.dayFrom || 1) <= 1) {
      setDropHint('Day1 仅允许火位，不能切换。')
      return
    }
    setSegments((prev) => {
      const idx = Math.max(0, Math.min(activeSegmentIndex, prev.length - 1))
      const next = prev.map((seg, i) => {
        if (i !== idx) return seg
        return {
          ...seg,
          specialSlots: seg.specialSlots.map((slot) =>
            slot.id === slotId
              ? { ...slot, type: (slot.type === 'fire' ? 'ice' : 'fire') as 'fire' | 'ice' }
              : slot
          ),
        }
      })
      return syncJulesSpecialSlotsAcrossSegments(next)
    })
  }

  const removeSpecialSlot = (slotId: string) => {
    setSegments((prev) => {
      // 删除某一“层位”时，同步删除所有时间轴该层位
      const next = prev.map((seg) =>
        seg.hero === 'Jules'
          ? { ...seg, specialSlots: seg.specialSlots.filter((slot) => slot.id !== slotId) }
          : seg
      )
      return syncJulesSpecialSlotsAcrossSegments(next)
    })
  }

  const addSpecialSlotAt = (targetSlot: number) => {
    if (!activeSegment || activeHero !== 'Jules') return
    const allowed = getAllowedMaskByDay(activeSegment.dayFrom)
    const maxCount = getJulesSlotCount(activeSegment.dayFrom)

    if (!allowed[targetSlot]) {
      setDropHint(`Day${activeSegment.dayFrom} 该位置不可生成冰火位。`)
      return
    }
    if (activeSegment.dayFrom <= 1 && ![3, 4, 5, 6].includes(targetSlot)) {
      setDropHint('Day1 冰火位只能在中间四格生成。')
      return
    }
    if (activeSegment.specialSlots.some((slot) => slot.slot === targetSlot)) {
      setDropHint('该位置已有冰火位。')
      return
    }
    if (activeSegment.specialSlots.length >= maxCount) {
      setDropHint(`Day${activeSegment.dayFrom} 最多只能有 ${maxCount} 个冰火位。`)
      return
    }

    const nextType: 'fire' | 'ice' =
      activeSegment.dayFrom <= 1
        ? 'fire'
        : activeSegment.specialSlots.length === 0
          ? 'fire'
          : activeSegment.specialSlots.length === 1
            ? 'ice'
            : Math.random() > 0.5
              ? 'fire'
              : 'ice'

    setSegments((prev) => {
      const idx = Math.max(0, Math.min(activeSegmentIndex, prev.length - 1))
      const next = prev.map((seg, i) =>
        i === idx
          ? {
              ...seg,
              specialSlots: [...seg.specialSlots, { id: `sp-${Date.now()}-${targetSlot}`, slot: targetSlot, type: nextType }],
            }
          : seg
      )
      return syncJulesSpecialSlotsAcrossSegments(next)
    })
    setDropHint('')
  }

  const updateActiveBuild = (updater: (build: CardBuild) => CardBuild) => {
    updateActiveSegment((seg) => {
      const activeId = activeBuildBySegment[seg.id] || seg.builds[0]?.id
      if (!activeId) return seg
      return {
        ...seg,
        builds: seg.builds.map((build) => (build.id === activeId ? updater(build) : build)),
      }
    })
  }

  const setActiveBuildId = (segmentId: string, buildId: string) => {
    setActiveBuildBySegment((prev) => ({ ...prev, [segmentId]: buildId }))
    setSelectedPlacementId(null)
    setPreviewCards(null)
  }

  const addCardBuild = () => {
    if (!activeSegment) return
    const newBuild = createCardBuild(activeSegment.builds.length + 1)
    updateActiveSegment((seg) => ({ ...seg, builds: [...seg.builds, newBuild] }))
    setActiveBuildId(activeSegment.id, newBuild.id)
  }

  const deleteCardBuild = (buildId: string) => {
    if (!activeSegment) return
    const target = activeSegment.builds.find((b) => b.id === buildId)
    if (!target) return
    if (activeSegment.builds.length <= 1) {
      setDropHint('至少需要保留一个卡牌方案。')
      return
    }
    const hasContent =
      target.cards.length > 0 ||
      target.corePlacementIds.length > 0 ||
      target.secondaryPlacementIds.length > 0 ||
      target.supportPlacementIds.length > 0
    if (hasContent) {
      const ok = window.confirm('该方案已有内容，删除后无法恢复，确定删除吗？')
      if (!ok) return
    }

    updateActiveSegment((seg) => ({
      ...seg,
      builds: seg.builds.filter((b) => b.id !== buildId),
    }))

    const fallback = activeSegment.builds.find((b) => b.id !== buildId)
    if (fallback) setActiveBuildId(activeSegment.id, fallback.id)
    if (selectedPlacementId && target.cards.some((c) => c.placementId === selectedPlacementId)) {
      setSelectedPlacementId(null)
    }
    setDropHint('')
  }

  const hasUserWork = useMemo(() => {
    return segments.some((seg) => {
      if (seg.skills.length > 0) return true
      if (seg.builds.length > 1) return true
      return seg.builds.some((b) => b.cards.length > 0)
    })
  }, [segments])

  const exportToClipboard = async () => {
    try {
      const payload: PlannerExportPayload = {
        version: 3,
        dayStart,
        dayEnd,
        hero: activeHero,
        lineupName,
        dayPlanTag,
        strengthTag,
        difficultyTag,
        segments,
        activeSegmentIndex,
        activeBuildBySegment,
      }
      await navigator.clipboard.writeText(JSON.stringify(payload))
      setDropHint('已复制到剪贴板。')
    } catch {
      setDropHint('复制失败，请检查浏览器剪贴板权限。')
    }
  }

  const importFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text?.trim()) {
        setDropHint('剪贴板为空。')
        return
      }

      const parsed = JSON.parse(text) as Partial<PlannerExportPayload>
      if ((parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) || !Array.isArray(parsed.segments)) {
        setDropHint('导入失败：格式不正确。')
        return
      }

      const nextStart = Number(parsed.dayStart)
      const nextEnd = Number(parsed.dayEnd)
      if (!Number.isInteger(nextStart) || !Number.isInteger(nextEnd) || nextStart < 1 || nextEnd < nextStart) {
        setDropHint('导入失败：天数范围无效。')
        return
      }

      const importedHero = parsed.hero || parsed.segments[0]?.hero || 'Pygmalien'
      const importedName = typeof parsed.lineupName === 'string' ? parsed.lineupName.slice(0, 40) : ''
      const importedDayPlan = DAY_PLAN_OPTIONS.includes(parsed.dayPlanTag as any) ? (parsed.dayPlanTag as any) : '连胜早走'
      const importedStrength = STRENGTH_OPTIONS.includes(parsed.strengthTag as any) ? (parsed.strengthTag as any) : '中规中矩'
      const importedDifficulty = DIFFICULTY_OPTIONS.includes(parsed.difficultyTag as any) ? (parsed.difficultyTag as any) : '比较困难'
      const normalizedSegments: Segment[] = parsed.segments.map((seg: any) => ({
        ...seg,
        hero: importedHero,
        strategyText: typeof seg.strategyText === 'string' ? seg.strategyText.slice(0, 300) : '',
        specialSlots: Array.isArray(seg.specialSlots) ? seg.specialSlots : [],
        builds: (seg.builds || []).map((build: any) => ({
          ...build,
          corePlacementIds: Array.isArray(build.corePlacementIds)
            ? build.corePlacementIds
            : build.corePlacementId
              ? [build.corePlacementId]
              : [],
          secondaryPlacementIds: Array.isArray(build.secondaryPlacementIds)
            ? build.secondaryPlacementIds
            : build.secondaryPlacementId
              ? [build.secondaryPlacementId]
              : [],
          supportPlacementIds: Array.isArray(build.supportPlacementIds) ? build.supportPlacementIds : [],
        })),
        skills: Array.isArray(seg.skills) ? seg.skills : [],
        coreSkillIds: Array.isArray(seg.coreSkillIds)
          ? seg.coreSkillIds
          : seg.coreSkillId
            ? [seg.coreSkillId]
            : [],
        importantSkillIds: Array.isArray(seg.importantSkillIds) ? seg.importantSkillIds : [],
        optionalSkillIds: Array.isArray(seg.optionalSkillIds) ? seg.optionalSkillIds : [],
      }))

      setDayStart(nextStart)
      setDayEnd(nextEnd)
      setLineupName(importedName)
      setLineupNameDraft(importedName)
      setIsEditingLineupName(false)
      setDayPlanTag(importedDayPlan)
      setStrengthTag(importedStrength)
      setDifficultyTag(importedDifficulty)
      setDayStartInput(String(nextStart))
      setDayEndInput(String(nextEnd))
      setSegments(syncJulesSpecialSlotsAcrossSegments(normalizedSegments))
      setActiveSegmentIndex(
        Math.max(0, Math.min(Number(parsed.activeSegmentIndex || 0), normalizedSegments.length - 1))
      )
      setActiveBuildBySegment(parsed.activeBuildBySegment || {})
      setSelectedPlacementId(null)
      setSelectedSkillId(null)
      setPreviewCards(null)
      setDropHint('已从剪贴板导入。')
    } catch {
      setDropHint('导入失败：剪贴板内容不是有效 JSON。')
    }
  }

  const applySnapshot = (parsed: Partial<PlannerExportPayload>) => {
    if (!Array.isArray(parsed.segments)) return
    const nextStart = Number(parsed.dayStart)
    const nextEnd = Number(parsed.dayEnd)
    if (!Number.isInteger(nextStart) || !Number.isInteger(nextEnd) || nextStart < 1 || nextEnd < nextStart) return
    const importedHero = parsed.hero || parsed.segments[0]?.hero || 'Pygmalien'
    const normalizedSegments: Segment[] = parsed.segments.map((seg: any) => ({
      ...seg,
      hero: importedHero,
      strategyText: typeof seg.strategyText === 'string' ? seg.strategyText.slice(0, 300) : '',
      specialSlots: Array.isArray(seg.specialSlots) ? seg.specialSlots : [],
      builds: (seg.builds || []).map((build: any) => ({
        ...build,
        corePlacementIds: Array.isArray(build.corePlacementIds)
          ? build.corePlacementIds
          : build.corePlacementId
            ? [build.corePlacementId]
            : [],
        secondaryPlacementIds: Array.isArray(build.secondaryPlacementIds)
          ? build.secondaryPlacementIds
          : build.secondaryPlacementId
            ? [build.secondaryPlacementId]
            : [],
        supportPlacementIds: Array.isArray(build.supportPlacementIds) ? build.supportPlacementIds : [],
      })),
      skills: Array.isArray(seg.skills) ? seg.skills : [],
      coreSkillIds: Array.isArray(seg.coreSkillIds) ? seg.coreSkillIds : [],
      importantSkillIds: Array.isArray(seg.importantSkillIds) ? seg.importantSkillIds : [],
      optionalSkillIds: Array.isArray(seg.optionalSkillIds) ? seg.optionalSkillIds : [],
    }))

    setDayStart(nextStart)
    setDayEnd(nextEnd)
    const importedName = typeof parsed.lineupName === 'string' ? parsed.lineupName.slice(0, 40) : ''
    setLineupName(importedName)
    setLineupNameDraft(importedName)
    setIsEditingLineupName(false)
    setDayPlanTag(DAY_PLAN_OPTIONS.includes(parsed.dayPlanTag as any) ? (parsed.dayPlanTag as any) : '连胜早走')
    setStrengthTag(STRENGTH_OPTIONS.includes(parsed.strengthTag as any) ? (parsed.strengthTag as any) : '中规中矩')
    setDifficultyTag(DIFFICULTY_OPTIONS.includes(parsed.difficultyTag as any) ? (parsed.difficultyTag as any) : '比较困难')
    setDayStartInput(String(nextStart))
    setDayEndInput(String(nextEnd))
    setSegments(syncJulesSpecialSlotsAcrossSegments(normalizedSegments))
    setActiveSegmentIndex(Math.max(0, Math.min(Number(parsed.activeSegmentIndex || 0), normalizedSegments.length - 1)))
    setActiveBuildBySegment(parsed.activeBuildBySegment || {})
    setSelectedPlacementId(null)
    setSelectedSkillId(null)
    setPreviewCards(null)
  }

  useEffect(() => {
    if (!onDraftApiChange) return
    onDraftApiChange({
      getSnapshot: () => ({
        version: 3,
        dayStart,
        dayEnd,
        hero: activeHero,
        lineupName,
        dayPlanTag,
        strengthTag,
        difficultyTag,
        segments,
        activeSegmentIndex,
        activeBuildBySegment,
      }),
      applySnapshot: (payload: any) => applySnapshot(payload),
      getContextLabel: () => activeHero,
    })
    return () => onDraftApiChange(null)
  }, [onDraftApiChange, dayStart, dayEnd, activeHero, lineupName, dayPlanTag, strengthTag, difficultyTag, segments, activeSegmentIndex, activeBuildBySegment])

  const beginEditLineupName = () => {
    setLineupNameDraft(lineupName)
    setIsEditingLineupName(true)
  }

  const saveLineupName = () => {
    setLineupName(lineupNameDraft.slice(0, 40))
    setIsEditingLineupName(false)
  }

  const moveBoundary = (handleIdx: number, day: number) => {
    setSegments((prev) => {
      if (handleIdx < 0 || handleIdx >= prev.length - 1) return prev
      const left = prev[handleIdx]
      const right = prev[handleIdx + 1]
      const minDay = left.dayFrom
      const maxDay = right.dayTo - 1
      const nextDay = Math.max(minDay, Math.min(maxDay, day))
      if (nextDay === left.dayTo) return prev

      const next = [...prev]
      next[handleIdx] = { ...left, dayTo: nextDay }
      next[handleIdx + 1] = { ...right, dayFrom: nextDay + 1 }
      return next
    })
  }

  useEffect(() => {
    if (draggingHandleIndex === null) return
    document.body.style.cursor = 'ew-resize'

    const onMove = (event: MouseEvent) => {
      if (!timelineRef.current) return
      const rect = timelineRef.current.getBoundingClientRect()
      if (rect.width <= 0 || dayEnd <= dayStart) return

      const clampedX = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
      const ratio = rect.width === 0 ? 0 : clampedX / rect.width
      const targetDay = Math.round(dayStart + ratio * (dayEnd - dayStart))
      moveBoundary(draggingHandleIndex, targetDay)
    }

    const onUp = () => {
      setDraggingHandleIndex(null)
      document.body.style.cursor = ''
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [draggingHandleIndex, dayStart, dayEnd])

  const applyDayRange = () => {
    const start = Number(dayStartInput)
    const end = Number(dayEndInput)
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      setDropHint('天数范围无效，请输入如 Day3-Day13。')
      return
    }

    if (hasUserWork) {
      const confirmed = window.confirm('应用新的天数范围会覆盖当前阵容内容，确定继续吗？')
      if (!confirmed) return
    }

    const heroForNewSegments = activeSegment?.hero || segments[0]?.hero || 'Pygmalien'
    const nextSegments = syncJulesSpecialSlotsAcrossSegments(
      createDefaultSegmentsForRange(start, end, heroForNewSegments)
    )
    const defaultBuildBySegment: Record<string, string> = {}
    nextSegments.forEach((seg) => {
      if (seg.builds[0]) defaultBuildBySegment[seg.id] = seg.builds[0].id
    })

    setDayStart(start)
    setDayEnd(end)
    setSegments(nextSegments)
    setActiveSegmentIndex(0)
    setActiveBuildBySegment(defaultBuildBySegment)
    setSelectedPlacementId(null)
    setSelectedSkillId(null)
    setPreviewCards(null)
    setDropHint('')
  }

  const bumpRange = (field: 'start' | 'end', delta: number) => {
    if (field === 'start') {
      const next = Math.max(1, Number(dayStartInput || dayStart) + delta)
      setDayStartInput(String(next))
      return
    }
    const next = Math.max(1, Number(dayEndInput || dayEnd) + delta)
    setDayEndInput(String(next))
  }

  const addSplitPoint = () => {
    if (!activeSegment) return
    if (activeSegment.dayFrom >= activeSegment.dayTo) {
      setDropHint('当前区间只有一天，无法再分割。')
      return
    }

    const splitDay = Math.floor((activeSegment.dayFrom + activeSegment.dayTo) / 2)
    const left: Segment = {
      ...activeSegment,
      dayTo: splitDay,
      builds: activeSegment.builds.map(cloneBuild),
      skills: [...activeSegment.skills],
      specialSlots: activeSegment.hero === 'Jules' ? activeSegment.specialSlots : [],
      importantSkillIds: [...activeSegment.importantSkillIds],
      optionalSkillIds: [...activeSegment.optionalSkillIds],
    }
    const rightBase = createSegment(splitDay + 1, activeSegment.dayTo)
    const right: Segment = {
      ...rightBase,
      hero: activeSegment.hero,
      specialSlots: activeSegment.hero === 'Jules' ? activeSegment.specialSlots : [],
    }

    setSegments((prev) => {
      const idx = Math.max(0, Math.min(activeSegmentIndex, prev.length - 1))
      const next = [...prev]
      next.splice(idx, 1, left, right)
      return syncJulesSpecialSlotsAcrossSegments(next)
    })

    setActiveBuildBySegment((prev) => {
      const activeLeftBuildId = prev[activeSegment.id] || left.builds[0].id
      return {
        ...prev,
        [left.id]: activeLeftBuildId,
        [right.id]: right.builds[0].id,
      }
    })

    setPreviewCards(null)
    setDropHint('')
  }

  const mergeToLeft = () => {
    if (!activeSegment || activeSegmentIndex <= 0) return
    setSegments((prev) => {
      const idx = activeSegmentIndex
      const left = prev[idx - 1]
      const current = prev[idx]
      const merged: Segment = {
        ...current,
        dayFrom: left.dayFrom,
      }
      const next = [...prev]
      next.splice(idx - 1, 2, merged)
      return syncJulesSpecialSlotsAcrossSegments(next)
    })
    setActiveSegmentIndex((idx) => Math.max(0, idx - 1))
    setDropHint('')
  }

  const mergeToRight = () => {
    if (!activeSegment || activeSegmentIndex >= segments.length - 1) return
    setSegments((prev) => {
      const idx = activeSegmentIndex
      const current = prev[idx]
      const right = prev[idx + 1]
      const merged: Segment = {
        ...current,
        dayTo: right.dayTo,
      }
      const next = [...prev]
      next.splice(idx, 2, merged)
      return syncJulesSpecialSlotsAcrossSegments(next)
    })
    setDropHint('')
  }

  const inheritPrevSegmentBuild = () => {
    if (!activeSegment || activeSegmentIndex <= 0) return
    const prevSeg = segments[activeSegmentIndex - 1]
    const prevBuild = prevSeg?.builds?.[0]
    if (!prevBuild) {
      setDropHintTone('error')
      setDropHint('上一个时间轴没有可沿用的方案1。')
      return
    }

    updateActiveSegment((seg) => {
      const targetBuild = seg.builds[0] || createCardBuild(1)
      const idMap = new Map<string, string>()
      const clonedCards = prevBuild.cards.map((card) => {
        const newId = `${card.item.id || 'card'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        idMap.set(card.placementId, newId)
        return { ...card, placementId: newId }
      })
      const allowed = getAllowedMaskByDay(seg.dayFrom)
      const normalized = normalizeCardsToAllowed(clonedCards, allowed)
      const still = new Set(normalized.map((c) => c.placementId))
      return {
        ...seg,
        builds: [
          {
            ...targetBuild,
            cards: normalized,
            corePlacementIds: prevBuild.corePlacementIds
              .map((id) => idMap.get(id) || '')
              .filter((id) => id && still.has(id)),
            secondaryPlacementIds: prevBuild.secondaryPlacementIds
              .map((id) => idMap.get(id) || '')
              .filter((id) => id && still.has(id)),
            supportPlacementIds: prevBuild.supportPlacementIds
              .map((id) => idMap.get(id) || '')
              .filter((id) => id && still.has(id)),
          },
          ...seg.builds.slice(1),
        ],
      }
    })
    setDropHintTone('success')
    setDropHint('已沿用上一个时间轴的方案1。')
  }

  const onPlacedCardClick = (placementId: string, item: PlannerItem) => {
    onSelectItem(item)
    setSelectedPlacementId(placementId)
  }

  const onSkillClick = (skillId: string, item: PlannerItem) => {
    onSelectItem(item)
    setSelectedSkillId(skillId)
  }

  const toggleId = (arr: string[], id: string): string[] => {
    return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]
  }

  const applySelectedCardRole = (role: 'core' | 'secondary' | 'support') => {
    if (!selectedPlacementId) {
      setDropHint('请先点击一张卡牌，再设置角色。')
      return
    }
    updateActiveBuild((build) => {
      if (role === 'core') {
        return {
          ...build,
          corePlacementIds: toggleId(build.corePlacementIds, selectedPlacementId),
          secondaryPlacementIds: build.secondaryPlacementIds.filter((id) => id !== selectedPlacementId),
          supportPlacementIds: build.supportPlacementIds.filter((id) => id !== selectedPlacementId),
        }
      }
      if (role === 'secondary') {
        return {
          ...build,
          secondaryPlacementIds: toggleId(build.secondaryPlacementIds, selectedPlacementId),
          corePlacementIds: build.corePlacementIds.filter((id) => id !== selectedPlacementId),
          supportPlacementIds: build.supportPlacementIds.filter((id) => id !== selectedPlacementId),
        }
      }
      return {
        ...build,
        supportPlacementIds: toggleId(build.supportPlacementIds, selectedPlacementId),
        corePlacementIds: build.corePlacementIds.filter((id) => id !== selectedPlacementId),
        secondaryPlacementIds: build.secondaryPlacementIds.filter((id) => id !== selectedPlacementId),
      }
    })
    setDropHint('')
  }

  const applySelectedSkillRole = (role: 'core' | 'important' | 'optional') => {
    if (!selectedSkillId) {
      setDropHint('请先点击一个技能，再设置分级。')
      return
    }
    updateActiveSegment((seg) => {
      if (role === 'core') {
        return {
          ...seg,
          coreSkillIds: toggleId(seg.coreSkillIds, selectedSkillId),
          importantSkillIds: seg.importantSkillIds.filter((id) => id !== selectedSkillId),
          optionalSkillIds: seg.optionalSkillIds.filter((id) => id !== selectedSkillId),
        }
      }
      if (role === 'important') {
        return {
          ...seg,
          importantSkillIds: toggleId(seg.importantSkillIds, selectedSkillId),
          coreSkillIds: seg.coreSkillIds.filter((id) => id !== selectedSkillId),
          optionalSkillIds: seg.optionalSkillIds.filter((id) => id !== selectedSkillId),
        }
      }
      return {
        ...seg,
        optionalSkillIds: toggleId(seg.optionalSkillIds, selectedSkillId),
        coreSkillIds: seg.coreSkillIds.filter((id) => id !== selectedSkillId),
        importantSkillIds: seg.importantSkillIds.filter((id) => id !== selectedSkillId),
      }
    })
    setDropHint('')
  }

  const updateSelectedCardBorder = (tier: string) => {
    if (!selectedPlacementId) return
    updateActiveBuild((build) => ({
      ...build,
      cards: build.cards.map((card) =>
        card.placementId === selectedPlacementId ? { ...card, borderTier: tier } : card
      ),
    }))
  }

  const getPreviewResult = (dragged: DragPayload, targetStart: number): PreviewResult | null => {
    if (!activeBuild) return null
    if (!dragged.placementId && dragged.sourceType === 'skills') return null

    const movingExisting = dragged.placementId
      ? activeBuild.cards.find((c) => c.placementId === dragged.placementId)
      : null

    const movingItem = movingExisting?.item || dragged.item
    if (!movingItem) return null

    const movingWidth = movingExisting?.width || dragged.width || getCardWidth(movingItem.size)
    const movingBorder = movingExisting?.borderTier || getDefaultBorderTier(movingItem)
    const movingId = movingExisting?.placementId || '__preview__'

    const remaining = activeBuild.cards.filter((card) => card.placementId !== movingId)
    const layout = computeAutoLayout(
      remaining,
      {
        placementId: movingId,
        item: movingItem,
        width: movingWidth,
        start: targetStart,
        borderTier: movingBorder,
      },
      targetStart,
      allowedMask
    )
    if (!layout) return null

    return { cards: layout }
  }

  const commitPreview = (preview: PreviewResult, dragged: DragPayload) => {
    const isNewCard = !dragged.placementId
    const newPlacementId = isNewCard
      ? `${dragged.item?.id || 'card'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : null

    updateActiveBuild((build) => {
      const committedCards = preview.cards.map((card) => {
        if (card.placementId === '__preview__' && newPlacementId) {
          return { ...card, placementId: newPlacementId }
        }
        return card
      })
      return { ...build, cards: committedCards }
    })

    if (newPlacementId) {
      setSelectedPlacementId(newPlacementId)
      if (dragged.item) onSelectItem(dragged.item)
    } else if (dragged.placementId) {
      setSelectedPlacementId(dragged.placementId)
      const card = activeBuild?.cards.find((c) => c.placementId === dragged.placementId)
      if (card) onSelectItem(card.item)
    }

    setPreviewCards(null)
    setDropHint('')
  }

  const [{ isOverBoard }, dropBoard] = useDrop(
    () => ({
      accept: ['ITEM', 'LINEUP_CARD'],
      hover: (dragged: DragPayload, monitor) => {
        if (!boardRef.current || !monitor.isOver({ shallow: true })) return
        if (!dragged.placementId && dragged.sourceType === 'skills') {
          setPreviewCards(null)
          setDropHint('技能请拖拽到下方技能栏。')
          return
        }

        const clientOffset = monitor.getClientOffset()
        if (!clientOffset) return

        const overlayRect =
          boardRef.current.querySelector(`.${styles.cardsOverlay}`)?.getBoundingClientRect() ||
          boardRef.current.getBoundingClientRect()
        const relativeX = Math.max(0, Math.min(overlayRect.width - 1, clientOffset.x - overlayRect.left))
        const slotIndex = getSlotIndexFromPointer(relativeX, overlayRect.width)

        const preview = getPreviewResult(dragged, slotIndex)
        if (!preview) {
          setPreviewCards(null)
          setDropHint('该位置无法放置（空间不足）。')
          return
        }

        setPreviewCards(preview.cards)
        setDropHint('')
      },
      drop: (dragged: DragPayload, monitor) => {
        if (!boardRef.current || monitor.didDrop()) return
        if (!dragged.placementId && dragged.sourceType === 'skills') return

        const clientOffset = monitor.getClientOffset()
        if (!clientOffset) return

        const overlayRect =
          boardRef.current.querySelector(`.${styles.cardsOverlay}`)?.getBoundingClientRect() ||
          boardRef.current.getBoundingClientRect()
        const relativeX = Math.max(0, Math.min(overlayRect.width - 1, clientOffset.x - overlayRect.left))
        const slotIndex = getSlotIndexFromPointer(relativeX, overlayRect.width)

        const preview = getPreviewResult(dragged, slotIndex)
        if (!preview) {
          setPreviewCards(null)
          setDropHint('该位置无法放置（空间不足）。')
          return
        }

        commitPreview(preview, dragged)
      },
      collect: (monitor) => ({
        isOverBoard: monitor.isOver({ shallow: true }),
      }),
    }),
    [activeBuild, selectedPlacementId, activeSegment, allowedMask]
  )

  useEffect(() => {
    if (!isOverBoard) setPreviewCards(null)
  }, [isOverBoard])

  useEffect(() => {
    if (!dropHint) return
    const timer = window.setTimeout(() => setDropHint(''), 1600)
    return () => window.clearTimeout(timer)
  }, [dropHint])

  const [{ isOverSkill, canDropSkill }, dropSkill] = useDrop(
    () => ({
      accept: ['ITEM'],
      canDrop: (dragged: DragPayload) => dragged.sourceType === 'skills',
      drop: (dragged: DragPayload) => {
        if (!dragged.item || dragged.sourceType !== 'skills') return
        const skillItem = dragged.item

        updateActiveSegment((seg) => {
          if (seg.skills.some((s) => s.skillId === skillItem.id)) return seg
          return {
            ...seg,
            skills: [...seg.skills, { skillId: skillItem.id, item: skillItem }],
          }
        })

        onSelectItem(skillItem)
        setSelectedSkillId(skillItem.id)
        setDropHint('')
      },
      hover: (dragged: DragPayload) => {
        if (dragged.sourceType !== 'skills') setDropHint('这里仅接收技能。')
        else setDropHint('')
      },
      collect: (monitor) => ({
        isOverSkill: monitor.isOver({ shallow: true }),
        canDropSkill: monitor.canDrop(),
      }),
    }),
    [activeSegment]
  )

  const attachBoardRef = (node: HTMLDivElement | null) => {
    boardRef.current = node
    dropBoard(node)
  }

  const removePlacedCard = (placementId: string) => {
    updateActiveBuild((build) => ({
      ...build,
      cards: build.cards.filter((card) => card.placementId !== placementId),
      corePlacementIds: build.corePlacementIds.filter((id) => id !== placementId),
      secondaryPlacementIds: build.secondaryPlacementIds.filter((id) => id !== placementId),
      supportPlacementIds: build.supportPlacementIds.filter((id) => id !== placementId),
    }))
    setSelectedPlacementId((prev) => (prev === placementId ? null : prev))
  }

  const removeSkill = (skillId: string) => {
    updateActiveSegment((seg) => ({
      ...seg,
      skills: seg.skills.filter((s) => s.skillId !== skillId),
      coreSkillIds: seg.coreSkillIds.filter((id) => id !== skillId),
      importantSkillIds: seg.importantSkillIds.filter((id) => id !== skillId),
      optionalSkillIds: seg.optionalSkillIds.filter((id) => id !== skillId),
    }))
    setSelectedSkillId((prev) => (prev === skillId ? null : prev))
  }

  const getCardNames = (build: CardBuild, ids: string[]): string => {
    if (ids.length === 0) return '未设置'
    return ids
      .map((id) => build.cards.find((c) => c.placementId === id))
      .filter(Boolean)
      .map((c: any) => c.item.name_cn || c.item.name_en || c.item.id)
      .join(' / ')
  }

  const getSkillNames = (seg: Segment, ids: string[]): string => {
    if (ids.length === 0) return '未设置'
    return ids
      .map((id) => seg.skills.find((s) => s.skillId === id))
      .filter(Boolean)
      .map((s: any) => s.item.name_cn || s.item.name_en || s.item.id)
      .join(' / ')
  }

  const rangeSpan = Math.max(1, dayEnd - dayStart + 1)
  const handlePoints = segments.slice(0, -1).map((seg, idx) => {
    const leftPercent = ((seg.dayTo - dayStart + 1) / rangeSpan) * 100
    return { idx, day: seg.dayTo, left: `${leftPercent}%` }
  })

  const onHandleMouseEnter = () => {
    document.body.style.cursor = 'ew-resize'
  }

  const onHandleMouseLeave = () => {
    if (draggingHandleIndex === null) document.body.style.cursor = ''
  }

  return (
    <div className={styles.container}>
      <div className={styles.planSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>阵容推荐</h2>
          <div className={styles.headerActions}>
            <button className={styles.axisApplyButton} onClick={exportToClipboard}>导出到剪贴板</button>
            <button className={styles.addSplitButton} onClick={importFromClipboard}>从剪贴板导入</button>
          </div>
        </div>

        <div className={styles.planMetaBox}>
          <div className={styles.metaField}>
            <span className={styles.axisLabel}>阵容名称</span>
            {isEditingLineupName ? (
              <div className={styles.planNameRow}>
                <input
                  className={styles.planNameInput}
                  maxLength={40}
                  value={lineupNameDraft}
                  onChange={(e) => setLineupNameDraft(e.target.value.slice(0, 40))}
                  placeholder={displayLineupName}
                />
                <button className={styles.nameActionBtn} onClick={saveLineupName}>
                  保存应用
                </button>
                <button
                  className={styles.nameActionBtn}
                  onClick={() => {
                    setIsEditingLineupName(false)
                    setLineupNameDraft(lineupName)
                  }}
                >
                  取消
                </button>
              </div>
            ) : (
              <div className={styles.planNameRow}>
                <span className={styles.planNameText}>{displayLineupName}</span>
                <button className={styles.nameActionBtn} onClick={beginEditLineupName}>
                  编辑名称
                </button>
              </div>
            )}
          </div>
          <div className={styles.metaField}>
            <span className={styles.axisLabel}>天数定位</span>
            <div className={styles.metaBtnRow}>
              {DAY_PLAN_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`${styles.roleBtn} ${dayPlanTag === opt ? styles.roleBtnActive : ''}`}
                  onClick={() => setDayPlanTag(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.metaField}>
            <span className={styles.axisLabel}>强度定位</span>
            <div className={styles.metaBtnRow}>
              {STRENGTH_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`${styles.roleBtn} ${strengthTag === opt ? styles.roleBtnActive : ''}`}
                  onClick={() => setStrengthTag(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.metaField}>
            <span className={styles.axisLabel}>成型难度</span>
            <div className={styles.metaBtnRow}>
              {DIFFICULTY_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`${styles.roleBtn} ${difficultyTag === opt ? styles.roleBtnActive : ''}`}
                  onClick={() => setDifficultyTag(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeSegment && (
          <div className={styles.heroBar}>
            <span className={styles.axisLabel}>阵容英雄</span>
            <div className={styles.heroButtons}>
              {HERO_OPTIONS.map((hero) => (
                <button
                  key={hero}
                  className={`${styles.heroBtn} ${activeHero === hero ? styles.heroBtnActive : ''}`}
                  onClick={() => applyActiveHero(hero)}
                  title={HERO_LABELS[hero]}
                >
                  <img
                    src={`/images/heroes/${hero.toLowerCase()}.webp`}
                    alt={HERO_LABELS[hero]}
                    className={styles.heroAvatar}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.axisConfigRow}>
          <span className={styles.axisLabel}>范围</span>
          <DayRangeInput
            startValue={dayStartInput}
            endValue={dayEndInput}
            onStartChange={setDayStartInput}
            onEndChange={setDayEndInput}
            onStartStep={(delta) => bumpRange('start', delta)}
            onEndStep={(delta) => bumpRange('end', delta)}
          />

          <button className={styles.axisApplyButton} onClick={applyDayRange}>应用</button>

        </div>

        <div className={styles.timelineWrap}>
          <div className={styles.timelineTrack} ref={timelineRef}>
            {segments.map((seg, idx) => {
              const leftRatio = (seg.dayFrom - dayStart) / rangeSpan
              const widthRatio = (seg.dayTo - seg.dayFrom + 1) / rangeSpan
              return (
                <div
                  key={seg.id}
                  className={`${styles.timelineSegment} ${idx === activeSegmentIndex ? styles.activeTimelineSegment : ''}`}
                  style={{ left: `${leftRatio * 100}%`, width: `${Math.max(4, widthRatio * 100)}%` }}
                  onClick={() => {
                    setActiveSegmentIndex(idx)
                    setSelectedPlacementId(null)
                    setPreviewCards(null)
                  }}
                >
                  {getSegmentLabel(seg)}
                </div>
              )
            })}

            {handlePoints.map((point) => (
              <button
                key={`handle-${point.idx}`}
                className={styles.splitHandle}
                style={{ left: point.left }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setDraggingHandleIndex(point.idx)
                }}
                onMouseEnter={onHandleMouseEnter}
                onMouseLeave={onHandleMouseLeave}
                title={`分割点: Day${point.day}`}
              >
                <span className={styles.handleDot}></span>
                <span className={styles.handleLabel}>D{point.day}</span>
              </button>
            ))}
          </div>

          <div className={styles.axisTickRow}>
            <span>Day{dayStart}</span>
            <span>Day{dayEnd}</span>
          </div>

          <div className={styles.timelineActions}>
            <button className={styles.addSplitButton} onClick={addSplitPoint}>新增分割点</button>
            <button
              className={styles.addBuildBtn}
              onClick={inheritPrevSegmentBuild}
              disabled={activeSegmentIndex <= 0}
            >
              沿用上一个时间轴(方案1)
            </button>
            <button
              className={styles.axisApplyButton}
              onClick={mergeToLeft}
              disabled={activeSegmentIndex === 0}
            >
              合并到左边
            </button>
            <button
              className={styles.addSplitButton}
              onClick={mergeToRight}
              disabled={activeSegmentIndex >= segments.length - 1}
            >
              合并到右边
            </button>
          </div>
        </div>

        {activeSegment && activeBuild && (
          <div className={styles.cardUnit}>
            <div className={styles.buildBar}>
              <span className={styles.axisLabel}>卡牌方案</span>
              <div className={styles.buildPills}>
                {activeSegment.builds.map((build) => (
                  <div
                    key={build.id}
                    className={`${styles.buildPill} ${build.id === activeBuild.id ? styles.buildPillActive : ''}`}
                    onClick={() => setActiveBuildId(activeSegment.id, build.id)}
                    role="button"
                    tabIndex={0}
                  >
                    {build.name}
                    {build.id === activeBuild.id && (
                      <button
                        className={styles.buildDeleteBtn}
                        title="删除该方案"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteCardBuild(build.id)
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <span className={styles.buildIndexHint}>当前方案 #{activeBuildIndex + 1}</span>
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
                  onClick={() => setBoardScale((v) => Math.min(1.6, Math.round((v + 0.1) * 10) / 10))}
                >
                  +
                </button>
              </div>
              <button className={styles.addBuildBtn} onClick={addCardBuild}>新增卡牌方案</button>
            </div>

            <div className={styles.boardHint}>拖拽卡牌到横向区域，Small=1格 / Medium=2格 / Large=3格</div>

            <div
              className={styles.lineupBoard}
              ref={attachBoardRef}
              style={
                {
                  '--slot-height': `${Math.round(72 * boardScale)}px`,
                  '--slot-unit-width': `${Math.round(36 * boardScale)}px`,
                } as React.CSSProperties
              }
            >
              <div className={styles.boardGrid}>
                {Array.from({ length: MAX_UNITS }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`${styles.slotCell} ${!allowedMask[idx] ? styles.slotCellDisabled : ''}`}
                  >
                    {!allowedMask[idx] ? '禁用' : idx + 1}
                  </div>
                ))}
              </div>

              <div className={styles.cardsOverlay}>
                {cardsForRender.map((card) => (
                  card.placementId === '__preview__' ? (
                    <PreviewPlacedCardView key={card.placementId} card={card} />
                  ) : (
                    <PlacedCardView
                      key={card.placementId}
                      card={card}
                      isSelected={selectedPlacementId === card.placementId}
                      isCore={activeBuild.corePlacementIds.includes(card.placementId)}
                      isSecondary={activeBuild.secondaryPlacementIds.includes(card.placementId)}
                      isSupport={activeBuild.supportPlacementIds.includes(card.placementId)}
                      onCardClick={onPlacedCardClick}
                      onRemove={removePlacedCard}
                    />
                  )
                ))}
              </div>
              {activeHero === 'Jules' && (
                <div className={styles.specialSlotsRow}>
                {Array.from({ length: MAX_UNITS }).map((_, idx) => {
                  const marker = visibleSpecialSlots.find((s) => s.slot === idx)
                  return (
                    <div
                      key={`sp-${idx}`}
                      className={styles.specialSlotCell}
                    >
                      {marker && (
                        <span
                          className={`${styles.specialBadge} ${marker.type === 'fire' ? styles.badgeFire : styles.badgeIce}`}
                          title={marker.type === 'fire' ? '火位' : '冰位'}
                          onClick={() => toggleSpecialSlotType(marker.id)}
                        >
                          <button
                            className={styles.specialRemoveBtn}
                            onClick={(e) => {
                              e.stopPropagation()
                              removeSpecialSlot(marker.id)
                            }}
                            title="删除冰火位"
                          >
                            ×
                          </button>
                        </span>
                      )}
                      {!marker && (
                        <button
                          className={styles.specialAddBtn}
                          onClick={() => addSpecialSlotAt(idx)}
                          title={`在第 ${idx + 1} 槽生成冰火位`}
                        >
                          +
                        </button>
                      )}
                    </div>
                  )
                })}
                </div>
              )}
            </div>

            {selectedCard && (
              <div className={styles.borderEditor}>
                <div className={styles.borderEditorTitle}>卡牌等级</div>
                {(() => {
                  const { options, editable } = getBorderTierOptions(selectedCard.item)
                  if (!editable) return <div className={styles.borderHint}>该卡起始为钻石或传奇，等级不可修改。</div>
                  return (
                    <div className={styles.borderSwatches}>
                      {options.map((tier) => (
                        <button
                          key={tier}
                          className={`${styles.borderSwatch} ${selectedCard.borderTier === tier ? styles.borderSwatchActive : ''}`}
                          style={{ '--tier-clr': TIER_COLORS[tier] } as React.CSSProperties}
                          onClick={() => updateSelectedCardBorder(tier)}
                          title={TIER_LABELS[tier]}
                        >
                          <span className={styles.swatchDot}></span>
                          {TIER_LABELS[tier]}
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

            <div className={styles.metaSection}>
              <div className={styles.roleSetRow}>
                <span className={styles.metaLabel}>卡牌角色：</span>
                <button
                  className={styles.roleBtn}
                  onClick={() => applySelectedCardRole('core')}
                >
                  核心卡
                </button>
                <button
                  className={styles.roleBtn}
                  onClick={() => applySelectedCardRole('secondary')}
                >
                  次核心卡
                </button>
                <button
                  className={styles.roleBtn}
                  onClick={() => applySelectedCardRole('support')}
                >
                  搭配卡
                </button>
              </div>

              <div className={styles.modeHint}>
                先点击卡牌，再点击按钮设置为核心/次核心/搭配（再次点击可取消）。
              </div>

              <div className={styles.metaItem}>
                <span className={styles.metaName}>核心卡</span>
                <span className={styles.metaValue}>{getCardNames(activeBuild, activeBuild.corePlacementIds)}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaName}>次核心卡</span>
                <span className={styles.metaValue}>{getCardNames(activeBuild, activeBuild.secondaryPlacementIds)}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaName}>搭配卡</span>
                <span className={styles.metaValue}>{getCardNames(activeBuild, activeBuild.supportPlacementIds)}</span>
              </div>
            </div>

            <div className={styles.strategySection}>
              <div className={styles.strategyHeader}>
                <span className={styles.metaLabel}>文字攻略</span>
                <span className={styles.strategyCount}>{(activeSegment.strategyText || '').length}/300</span>
              </div>
              <textarea
                className={styles.strategyInput}
                maxLength={300}
                placeholder="输入这个时间段的运营思路、关键抉择、替代卡等（最多300字）"
                value={activeSegment.strategyText || ''}
                onChange={(e) => {
                  const value = e.target.value.slice(0, 300)
                  updateActiveSegment((seg) => ({ ...seg, strategyText: value }))
                }}
              />
            </div>
          </div>
        )}

        {dropHint && <div className={`${styles.toastHint} ${dropHintTone === 'success' ? styles.toastSuccess : styles.toastError}`}>{dropHint}</div>}

        <div className={styles.skillsSection}>
          <div className={styles.skillsHeader}>技能列表</div>
          <div
            ref={dropSkill as any}
            className={`${styles.skillDropZone} ${isOverSkill ? (canDropSkill ? styles.skillDropActive : styles.skillDropBlocked) : ''}`}
          >
            <div className={styles.skillList}>
              {(activeSegment?.skills || []).map((skill) => (
                <button
                  key={skill.skillId}
                  className={`${styles.skillChip} ${selectedSkillId === skill.skillId ? styles.skillChipSelected : ''}`}
                  onClick={() => onSkillClick(skill.skillId, skill.item)}
                  title={skill.item.name_cn || skill.item.name_en}
                >
                  <img src={getItemImageUrl(skill.item)} alt={skill.item.name_cn || skill.item.name_en || skill.skillId} className={styles.skillImage} />
                  {activeSegment?.coreSkillIds.includes(skill.skillId) && <span className={`${styles.skillTag} ${styles.skillCore}`}>核心</span>}
                  {activeSegment?.importantSkillIds.includes(skill.skillId) && <span className={`${styles.skillTag} ${styles.skillImportant}`}>重要</span>}
                  {activeSegment?.optionalSkillIds.includes(skill.skillId) && <span className={`${styles.skillTag} ${styles.skillOptional}`}>可选</span>}
                  <span
                    className={styles.skillRemove}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSkill(skill.skillId)
                    }}
                  >
                    ×
                  </span>
                </button>
              ))}
              {(activeSegment?.skills || []).length === 0 && <div className={styles.skillEmpty}>把右侧“技能”拖到这个框里</div>}
            </div>
          </div>

          <div className={styles.roleSetRow}>
            <span className={styles.metaLabel}>技能分级：</span>
            <button
              className={styles.roleBtn}
              onClick={() => applySelectedSkillRole('core')}
            >
              核心技能
            </button>
            <button
              className={styles.roleBtn}
              onClick={() => applySelectedSkillRole('important')}
            >
              重要技能
            </button>
            <button
              className={styles.roleBtn}
              onClick={() => applySelectedSkillRole('optional')}
            >
              可选技能
            </button>
          </div>

          <div className={styles.modeHint}>
            先点击技能，再点击按钮设置为核心/重要/可选（再次点击可取消）。
          </div>

          {activeSegment && (
            <div className={styles.metaGrid3}>
              <div className={styles.metaItem}>
                <span className={styles.metaName}>核心技能</span>
                <span className={styles.metaValue}>{getSkillNames(activeSegment, activeSegment.coreSkillIds)}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaName}>重要技能</span>
                <span className={styles.metaValue}>{getSkillNames(activeSegment, activeSegment.importantSkillIds)}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaName}>可选技能</span>
                <span className={styles.metaValue}>{getSkillNames(activeSegment, activeSegment.optionalSkillIds)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PlacedCardView({
  card,
  isSelected,
  isCore,
  isSecondary,
  isSupport,
  onCardClick,
  onRemove,
}: {
  card: PlacedCard
  isSelected: boolean
  isCore: boolean
  isSecondary: boolean
  isSupport: boolean
  onCardClick: (placementId: string, item: PlannerItem) => void
  onRemove: (placementId: string) => void
}) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'LINEUP_CARD',
    item: {
      placementId: card.placementId,
      item: card.item,
      width: card.width,
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }))

  return (
    <div
      ref={drag as any}
      className={`${styles.placedCard} ${isDragging ? styles.dragging : ''} ${isSelected ? styles.placedCardSelected : ''}`}
      style={{
        gridColumn: `${card.start + 1} / span ${card.width}`,
        gridRow: '1 / 2',
        '--border-tier': TIER_COLORS[card.borderTier] || TIER_COLORS.bronze,
      } as React.CSSProperties}
      onClick={() => onCardClick(card.placementId, card.item)}
      title={card.item.name_cn || card.item.name_en}
    >
      <img
        src={getItemImageUrl(card.item)}
        alt={card.item.name_cn || card.item.name_en || card.item.id}
        className={styles.placedImage}
      />
      <div className={styles.cardRoleTags}>
        {isCore && <span className={`${styles.skillTag} ${styles.skillCore}`}>核心</span>}
        {isSecondary && <span className={`${styles.skillTag} ${styles.skillImportant}`}>次核</span>}
        {isSupport && <span className={`${styles.skillTag} ${styles.skillOptional}`}>搭配</span>}
      </div>
      <button
        className={styles.removeButton}
        onClick={(e) => {
          e.stopPropagation()
          onRemove(card.placementId)
        }}
      >
        ×
      </button>
    </div>
  )
}

function PreviewPlacedCardView({ card }: { card: PlacedCard }) {
  return (
    <div
      className={`${styles.placedCard} ${styles.previewCard}`}
      style={{
        gridColumn: `${card.start + 1} / span ${card.width}`,
        gridRow: '1 / 2',
        '--border-tier': TIER_COLORS[card.borderTier] || TIER_COLORS.bronze,
      } as React.CSSProperties}
      title={card.item.name_cn || card.item.name_en}
    >
      <img
        src={getItemImageUrl(card.item)}
        alt={card.item.name_cn || card.item.name_en || card.item.id}
        className={styles.placedImage}
      />
    </div>
  )
}
