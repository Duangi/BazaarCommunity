export interface CardRuleSupportResult {
  cardId: string
  cardName: string
  supported: boolean
  usedTokens: string[]
  unsupportedTokens: string[]
}

export interface RuleSupportSummary {
  totalCards: number
  fullySupportedCards: number
  unsupportedCards: number
  supportedTokens: string[]
  unsupportedTokenCounts: Array<{ token: string; count: number }>
  byCardId: Record<string, boolean>
  unsupportedByCard: Array<{ id: string; name: string; tokens: string[] }>
}

const SUPPORTED_ACTIONS = new Set<string>([
  'TActionCardCharge',
  'TActionCardHaste',
  'TActionCardSlow',
  'TActionCardForceUse',
  'TActionCardReload',
  'TActionCardModifyAttribute',
  'TActionCardFreeze',
  'TActionCardDestroy',
  'TActionCardTransformDestroyed',
  'TActionPlayerDamage',
  'TActionPlayerHeal',
  'TActionPlayerShieldApply',
  'TActionPlayerBurnApply',
  'TActionPlayerPoisonApply',
  'TActionPlayerRegenApply',
  'TActionPlayerReviveHeal',
])

const SUPPORTED_TRIGGERS = new Set<string>([
  'TTriggerOnCardFired',
  'TTriggerOnItemUsed',
  'TTriggerOnCardPerformedShield',
  'TTriggerOr',
  'OnUse',
  'performeddamage',
  'performedshield',
  'performedheal',
  'performedhaste',
  'performedslow',
  'performedfreeze',
  'performedburn',
  'performedpoison',
  'performedregen',
  'performedreload',
  'performeddestruction',
])

const SUPPORTED_TARGETS = new Set<string>([
  'TTargetCardSelf',
  'TTargetCardSection',
  'TTargetCardXMost',
  'TTargetCardPositional',
  'TTargetPlayerRelative',
])

const SUPPORTED_CONDITIONS = new Set<string>([
  'TCardConditionalAnd',
  'TCardConditionalOr',
  'TCardConditionalHasTags',
  'TCardConditionalTag',
  'TCardConditionalHiddenTag',
  'TCardConditionalSize',
])

function looksLikeRuleToken(value: string): boolean {
  return (
    value.startsWith('TAction') ||
    value.startsWith('TTrigger') ||
    value.startsWith('TTarget') ||
    value.startsWith('TCardConditional') ||
    value.toLowerCase().startsWith('performed') ||
    value === 'OnUse'
  )
}

function normalizeToken(value: string): string {
  const v = String(value || '').trim()
  if (!v) return ''
  if (v.toLowerCase().startsWith('performed')) return v.toLowerCase()
  return v
}

function collectRuleTokens(node: any, out: Set<string>) {
  if (!node) return
  if (Array.isArray(node)) {
    for (const entry of node) collectRuleTokens(entry, out)
    return
  }
  if (typeof node === 'object') {
    for (const [key, val] of Object.entries(node)) {
      if (typeof val === 'string') {
        const token = normalizeToken(val)
        if (token && (key === 'kind' || key === 'type' || key === 'action' || key === 'trigger') && looksLikeRuleToken(token)) {
          out.add(token)
        }
      } else {
        collectRuleTokens(val, out)
      }
    }
  }
}

function isSupportedToken(token: string): boolean {
  if (!token) return true
  if (token.startsWith('TAction')) return SUPPORTED_ACTIONS.has(token)
  if (token.startsWith('TTrigger') || token === 'OnUse' || token.toLowerCase().startsWith('performed')) {
    return SUPPORTED_TRIGGERS.has(token)
  }
  if (token.startsWith('TTarget')) return SUPPORTED_TARGETS.has(token)
  if (token.startsWith('TCardConditional')) return SUPPORTED_CONDITIONS.has(token)
  return true
}

function isCooldownGreaterThanZeroCondition(cond: any): boolean {
  if (!cond || typeof cond !== 'object') return false
  if (Array.isArray(cond)) return cond.some((x) => isCooldownGreaterThanZeroCondition(x))
  const t = String(cond.type || '').trim()
  if (t === 'TCardConditionalAttribute') {
    const attr = String(cond.Attribute || cond.attribute || '').trim()
    const op = String(cond.ComparisonOperator || cond.comparisonOperator || '').trim()
    const val = Number(cond?.ComparisonValue?.Value ?? cond?.comparisonValue?.value ?? NaN)
    return attr === 'CooldownMax' && op === 'GreaterThan' && Number.isFinite(val) && val === 0
  }
  if (cond.conditions) return isCooldownGreaterThanZeroCondition(cond.conditions)
  if (Array.isArray(cond.Conditions)) return cond.Conditions.some((x: any) => isCooldownGreaterThanZeroCondition(x))
  return false
}

function isSupportedCardConditionalAttributeNode(cond: any): boolean {
  if (!cond || typeof cond !== 'object') return false
  if (Array.isArray(cond)) return cond.every((x) => isSupportedCardConditionalAttributeNode(x))
  const t = String(cond.type || '').trim()
  if (t === 'TCardConditionalAttribute') {
    const attr = String(cond.Attribute || cond.attribute || '').trim()
    const op = String(cond.ComparisonOperator || cond.comparisonOperator || '').trim()
    const val = Number(cond?.ComparisonValue?.Value ?? cond?.comparisonValue?.value ?? NaN)
    return attr === 'CooldownMax' && op === 'GreaterThan' && Number.isFinite(val) && val === 0
  }
  if (t === 'TCardConditionalAnd' || t === 'TCardConditionalOr') {
    const children = Array.isArray(cond.Conditions) ? cond.Conditions : Array.isArray(cond.conditions) ? cond.conditions : []
    if (!children.length) return false
    return children.every((x: any) => isSupportedCardConditionalAttributeNode(x))
  }
  // Any other wrapper doesn't affect this token's support decision.
  if (cond.conditions) return isSupportedCardConditionalAttributeNode(cond.conditions)
  if (Array.isArray(cond.Conditions)) return cond.Conditions.every((x: any) => isSupportedCardConditionalAttributeNode(x))
  return false
}

function rowHasOnlySupportedCardConditionalAttribute(row: any): boolean {
  if (!row || typeof row !== 'object') return false
  const spots = [
    row?.action?.target?.conditions,
    row?.action?.target?.Conditions,
    row?.trigger?.Subject?.Conditions,
    row?.trigger?.subject?.conditions,
    row?.Subject?.Conditions,
    row?.subject?.conditions,
  ].filter(Boolean)
  if (!spots.length) return false
  return spots.every((s) => isSupportedCardConditionalAttributeNode(s))
}

function isContextuallySupported(row: any, token: string): boolean {
  const action = row?.action || {}
  const actionType = String(action?.type || '')
  const target = action?.target || {}
  const targetType = String(target?.type || '')
  const targetSection = String(target?.TargetSection || target?.targetSection || '')
  const targetMode = String(target?.TargetMode || target?.targetMode || '')
  const cond = target?.conditions || target?.Conditions || null

  // 目前仅支持“随机选对手可读条物品并施加减速”这一类，
  // 因为它只影响触发次数上限，和目标身份无关；随机加速/随机充能等仍不支持。
  const supportsOpponentRandomSlow =
    actionType === 'TActionCardSlow' &&
    targetType === 'TTargetCardRandom' &&
    /opponent/i.test(targetSection) &&
    isCooldownGreaterThanZeroCondition(cond)

  // 支持“随机己方可读条物品”：
  // 通过 Monte Carlo 多次模拟（min/max/avg）估算结果。
  const SELF_RANDOM_SUPPORTED_ACTIONS = new Set<string>([
    'TActionCardCharge',
    'TActionCardHaste',
    'TActionCardSlow',
    'TActionCardForceUse',
    'TActionCardReload',
    'TActionCardModifyAttribute',
    'TActionCardFreeze',
    'TActionPlayerDamage',
    'TActionPlayerHeal',
    'TActionPlayerShieldApply',
    'TActionPlayerBurnApply',
    'TActionPlayerPoisonApply',
    'TActionPlayerRegenApply',
  ])
  const supportsSelfRandomAction =
    SELF_RANDOM_SUPPORTED_ACTIONS.has(actionType) &&
    targetType === 'TTargetCardRandom' &&
    !/opponent/i.test(targetSection) &&
    (!targetMode || /any|self/i.test(targetMode)) &&
    isCooldownGreaterThanZeroCondition(cond)

  if (token === 'TTargetCardRandom') return supportsOpponentRandomSlow || supportsSelfRandomAction
  if (token === 'TCardConditionalAttribute') {
    // Allow only vetted subset globally: CooldownMax > 0.
    if (rowHasOnlySupportedCardConditionalAttribute(row)) return true
    return supportsOpponentRandomSlow || supportsSelfRandomAction
  }
  return false
}

export function analyzeCardRuleSupport(item: any): CardRuleSupportResult {
  const raw = item?.__raw
  const id = String(item?.id || raw?.id || '')
  const name = String(item?.name_cn || item?.name_en || raw?.name_cn || raw?.name_en || id)
  const tokenSet = new Set<string>()
  if (raw) {
    collectRuleTokens(raw?.abilities_detail, tokenSet)
    collectRuleTokens(raw?.auras_detail, tokenSet)
  }
  const usedTokens = Array.from(tokenSet).sort((a, b) => a.localeCompare(b))
  const unsupported = new Set<string>()
  for (const token of usedTokens) {
    if (isSupportedToken(token)) continue
    let contextual = false
    if (raw) {
      const rows = [
        ...(Array.isArray(raw?.abilities_detail) ? raw.abilities_detail : []),
        ...(Array.isArray(raw?.auras_detail) ? raw.auras_detail : []),
      ]
      contextual = rows.some((row: any) => isContextuallySupported(row, token))
    }
    if (!contextual) unsupported.add(token)
  }
  const unsupportedTokens = Array.from(unsupported).sort((a, b) => a.localeCompare(b))
  return {
    cardId: id,
    cardName: name,
    supported: unsupportedTokens.length === 0,
    usedTokens,
    unsupportedTokens,
  }
}

export function buildRuleSupportSummary(items: any[]): RuleSupportSummary {
  const byCardId: Record<string, boolean> = {}
  const unsupportedTokenMap = new Map<string, number>()
  const supportedTokenSet = new Set<string>()
  const unsupportedByCard: Array<{ id: string; name: string; tokens: string[] }> = []
  let totalCards = 0
  let fullySupportedCards = 0

  for (const item of items || []) {
    if (!item || String(item?.type || '').toLowerCase() === 'skill') continue
    const res = analyzeCardRuleSupport(item)
    if (!res.cardId) continue
    totalCards += 1
    byCardId[res.cardId] = res.supported
    for (const tk of res.usedTokens) {
      if (isSupportedToken(tk)) supportedTokenSet.add(tk)
    }
    if (res.supported) {
      fullySupportedCards += 1
    } else {
      unsupportedByCard.push({ id: res.cardId, name: res.cardName, tokens: res.unsupportedTokens })
      for (const tk of res.unsupportedTokens) {
        unsupportedTokenMap.set(tk, (unsupportedTokenMap.get(tk) || 0) + 1)
      }
    }
  }

  const unsupportedTokenCounts = Array.from(unsupportedTokenMap.entries())
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token))

  return {
    totalCards,
    fullySupportedCards,
    unsupportedCards: Math.max(0, totalCards - fullySupportedCards),
    supportedTokens: Array.from(supportedTokenSet).sort((a, b) => a.localeCompare(b)),
    unsupportedTokenCounts,
    byCardId,
    unsupportedByCard: unsupportedByCard.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
  }
}
