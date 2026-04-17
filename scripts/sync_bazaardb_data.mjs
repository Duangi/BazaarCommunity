#!/usr/bin/env node
import fs from 'fs/promises'
import path from 'path'

const DEFAULT_IMAGE_BASE = 'https://s.bazaardb.gg/v1'
const DEFAULT_IMAGE_VERSION = 'z12.3'
const DEFAULT_IMAGE_SIZE = 256
const DEFAULT_IMAGE_QUERY = 'v=6'

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1]
  return fallback
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function toArray(v) {
  return Array.isArray(v) ? v : []
}

function toText(v) {
  return String(v ?? '').trim()
}

function toTier(v) {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return ''
  if (s.includes('bronze') || s.includes('青铜')) return 'bronze'
  if (s.includes('silver') || s.includes('白银')) return 'silver'
  if (s.includes('gold') || s.includes('黄金')) return 'gold'
  if (s.includes('diamond') || s.includes('钻石')) return 'diamond'
  if (s.includes('legendary') || s.includes('传说')) return 'legendary'
  return s
}

function normalizeSize(v) {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return 'medium'
  if (s.includes('small') || s.includes('小')) return 'small'
  if (s.includes('large') || s.includes('大')) return 'large'
  return 'medium'
}

function safeFileId(id) {
  return String(id || '')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function tierList(input) {
  const arr = toArray(input).map((x) => toTier(x)).filter(Boolean)
  return Array.from(new Set(arr))
}

function dedupeTextArray(input) {
  const out = []
  const seen = new Set()
  for (const x of toArray(input)) {
    const s = toText(typeof x === 'object' ? (x.id ?? x.name ?? x.en ?? x.cn ?? '') : x)
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

function pick(rec, keys) {
  for (const k of keys) {
    const v = rec?.[k]
    if (v !== undefined && v !== null && String(v).trim() !== '') return v
  }
  return ''
}

/**
 * 数据组装规则（请保留）：
 * 1) 必须先用 TooltipReplacements 替换占位符（如 {ability.e1}）。
 * 2) 与“秒”相关的数值若是毫秒量级（>=100）要转成秒，避免出现 1000秒。
 * 3) 前端依赖本脚本输出的 skills / skills_passive / enchantments 作为中文展示主来源。
 */
function parseTooltips(rec) {
  const list = toArray(rec?.Tooltips || rec?.tooltips || [])
  const replacements = rec?.TooltipReplacements || rec?.tooltipReplacements || {}
  const tierHint = toTier(rec?.BaseTier || rec?.baseTier || rec?.starting_tier || '')

  const tierOrder = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Legendary']

  const toSecIfMs = (v, isDuration) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return String(v ?? '')
    if (isDuration && Math.abs(n) >= 100) return String(Number((n / 1000).toFixed(3)).toString())
    return String(Number(n.toFixed(3)).toString())
  }

  const applyTooltipReplacements = (raw) => {
    let text = toText(raw)
    if (!text || !replacements || typeof replacements !== 'object') return text
    for (const [ph, values] of Object.entries(replacements)) {
      if (!text.includes(ph)) continue
      const isDuration = text.includes(`${ph}秒`) || (text.includes('秒') && /ability|aura/i.test(ph))
      let replacement = ''
      if (values && typeof values === 'object' && !Array.isArray(values)) {
        if (values.Fixed !== undefined && values.Fixed !== null && values.Fixed !== '') {
          replacement = toSecIfMs(values.Fixed, isDuration)
        } else {
          // 为了前端“所有等级一目了然”，这里默认输出完整档位序列，
          // 不再按 starting_tier 只取单档（例如 1/1/2/2，而不是只显示 2）。
          const seq = tierOrder
            .filter((k) => values[k] !== undefined && values[k] !== null && values[k] !== '')
            .map((k) => toSecIfMs(values[k], isDuration))
          if (seq.length > 0) {
            replacement = seq.join('/')
          } else if (tierHint) {
            const map = {
              bronze: 'Bronze',
              silver: 'Silver',
              gold: 'Gold',
              diamond: 'Diamond',
              legendary: 'Legendary',
            }
            const fallbackTier = map[tierHint]
            if (fallbackTier && values[fallbackTier] !== undefined) {
              replacement = toSecIfMs(values[fallbackTier], isDuration)
            }
          }
        }
      } else {
        replacement = toSecIfMs(values, isDuration)
      }
      if (!replacement) continue
      text = text.split(ph).join(replacement)
    }
    return text
  }

  const cleaned = list
    .map((x) => ({
      type: toText(x?.type || x?.Type || ''),
      text: applyTooltipReplacements(x?.text || x?.Text || ''),
    }))
    .filter((x) => x.text)
  const active = cleaned.filter((x) => x.type.toLowerCase() !== 'passive').map((x) => x.text)
  const passive = cleaned.filter((x) => x.type.toLowerCase() === 'passive').map((x) => x.text)
  const all = cleaned.map((x) => x.text)
  return { all, active, passive }
}

function parseCooldown(texts) {
  for (const t of toArray(texts)) {
    const text = toText(t)
    const low = text.toLowerCase()
    // Cooldown heuristics:
    // - accept explicit cadence lines: "每X秒..." / "Cooldown ..."
    // - reject reduction modifiers: "冷却时间缩短/减少/降低X秒"
    if (/(缩短|减少|降低)/.test(text)) continue
    const isCadence =
      (text.includes('每') && text.includes('秒')) ||
      /冷却时间[为:：]?/.test(text) ||
      /cooldown\s*[:：]?/i.test(low)
    if (!isCadence) continue
    const m = text.match(/([0-9]+(?:\.[0-9]+)?(?:\/[0-9]+(?:\.[0-9]+)?)*)\s*秒/)
    if (!m) continue
    const raw = m[1]
    if (raw.includes('/')) return raw
    const n = Number(raw)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function parseQuests(texts) {
  const out = []
  for (const t of toArray(texts)) {
    const text = toText(t)
    if (!text) continue
    if (text.includes('任务') || /quest/i.test(text)) {
      out.push({ cn_target: text, cn_reward: '' })
    }
  }
  return out
}

const ENCHANT_NAME_CN = {
  Golden: '黄金',
  Heavy: '沉重',
  Icy: '寒冰',
  Turbo: '疾速',
  Shielded: '护盾',
  Restorative: '回复',
  Toxic: '毒素',
  Fiery: '炽焰',
  Shiny: '闪亮',
  Deadly: '致命',
  Radiant: '辉耀',
  Obsidian: '黑曜石',
}

function parseEnchantments(rec) {
  const ench = rec?.Enchantments || rec?.enchantments || {}
  if (!ench || typeof ench !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(ench)) {
    const tooltipHost = {
      Tooltips: toArray(v?.tooltips || v?.Tooltips || []).map((x) => ({
        text: x?.text || x?.Text || '',
        type: x?.type || x?.Type || 'Active',
      })),
      // Enchant often reuses owner-card placeholders (ability.e1, aura.e1, etc).
      TooltipReplacements: {
        ...(rec?.TooltipReplacements || rec?.tooltipReplacements || {}),
        ...(v?.TooltipReplacements || v?.tooltipReplacements || {}),
      },
      BaseTier: rec?.BaseTier || rec?.baseTier || rec?.starting_tier || '',
    }
    const tips = parseTooltips(tooltipHost).all
    out[k] = {
      name_cn: ENCHANT_NAME_CN[k] || k,
      effect_cn: tips.join('；'),
    }
  }
  return out
}

function looksHexHash40(s) {
  return /^[0-9a-f]{40}$/i.test(String(s || '').trim())
}

function buildImageUrlFromHash(hash, cfg) {
  const h = String(hash || '').trim()
  if (!looksHexHash40(h)) return ''
  const q = cfg.imageQuery ? `?${cfg.imageQuery}` : ''
  return `${cfg.imageBase}/${cfg.imageVersion}/${h}@${cfg.imageSize}.webp${q}`
}

function extractImageUrl(rec, cfg) {
  const direct = pick(rec, [
    'image_url',
    'imageUrl',
    'image',
    'icon_url',
    'iconUrl',
    'icon',
    'art_url',
    'artUrl',
    'portrait_url',
    'portraitUrl',
  ])
  const ds = toText(direct)
  if (/^https?:\/\//i.test(ds)) return ds
  const hashCandidate = toText(
    pick(rec, [
      'image_hash',
      'imageHash',
      'art_hash',
      'artHash',
      'hash',
      'asset_hash',
      'assetHash',
    ]),
  )
  if (hashCandidate) return buildImageUrlFromHash(hashCandidate, cfg)
  if (looksHexHash40(ds)) return buildImageUrlFromHash(ds, cfg)
  return ''
}

function flattenArrays(obj, prefix = '', acc = []) {
  if (!obj || typeof obj !== 'object') return acc
  if (Array.isArray(obj)) {
    acc.push({ path: prefix || '(root)', value: obj })
    return acc
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k
    if (Array.isArray(v)) acc.push({ path: p, value: v })
    else if (v && typeof v === 'object') flattenArrays(v, p, acc)
  }
  return acc
}

function detectArrayByHeuristic(dump, mode) {
  const arrays = flattenArrays(dump)
  let best = null
  let bestScore = -1
  for (const it of arrays) {
    const arr = it.value
    if (!Array.isArray(arr) || arr.length < 50) continue
    const sample = arr.slice(0, 30).filter((x) => x && typeof x === 'object')
    if (sample.length < 10) continue
    const hit = (keys) => sample.filter((x) => keys.some((k) => x[k] !== undefined)).length
    const idHit = hit(['id', 'template_id', 'templateId'])
    const nameHit = hit(['name_cn', 'name_en', 'name', 'title'])
    const typeHit = hit(['type', 'size', 'starting_tier', 'startingTier'])
    const descHit = hit(['description_cn', 'description_en', 'description', 'descriptions'])
    const skillHint = hit(['art_key', 'card_pack_id', 'spawning'])
    let score = idHit + nameHit
    if (mode === 'items') score += typeHit * 2
    if (mode === 'skills') score += (descHit + skillHint) * 2
    if (score > bestScore) {
      bestScore = score
      best = { path: it.path, arr }
    }
  }
  return best
}

function detectItemsSkills(dump) {
  if (dump && typeof dump === 'object' && !Array.isArray(dump)) {
    const entries = Object.entries(dump).filter(([, v]) => v && typeof v === 'object')
    const hasTyped = entries.slice(0, 50).some(([, v]) => typeof v?.Type === 'string' && typeof v?.Title === 'string')
    if (hasTyped) {
      const items = []
      const skills = []
      for (const [k, v] of entries) {
        const rec = { __dumpKey: String(k), ...v }
        const t = String(v?.Type || '').toLowerCase()
        if (t === 'item') items.push(rec)
        else if (t === 'skill') skills.push(rec)
      }
      if (items.length || skills.length) return { items, skills }
    }
  }
  if (Array.isArray(dump)) {
    const sample = dump.slice(0, 30).filter((x) => x && typeof x === 'object')
    const hasType = sample.filter((x) => x.type !== undefined || x.quests !== undefined || x.skills_passive !== undefined).length
    const hasDesc = sample.filter((x) => x.description_en !== undefined || x.description_cn !== undefined || x.art_key !== undefined).length
    if (hasType >= hasDesc) return { items: dump, skills: [] }
    return { items: [], skills: dump }
  }
  const knownItemsPaths = ['items', 'cards', 'data.items', 'data.cards']
  const knownSkillsPaths = ['skills', 'abilities', 'data.skills', 'data.abilities']
  const byPath = (p) => p.split('.').reduce((a, b) => (a && a[b] !== undefined ? a[b] : undefined), dump)
  let items = []
  let skills = []
  for (const p of knownItemsPaths) {
    const v = byPath(p)
    if (Array.isArray(v) && v.length > 100) {
      items = v
      break
    }
  }
  for (const p of knownSkillsPaths) {
    const v = byPath(p)
    if (Array.isArray(v) && v.length > 50) {
      skills = v
      break
    }
  }
  if (!items.length) items = detectArrayByHeuristic(dump, 'items')?.arr || []
  if (!skills.length) skills = detectArrayByHeuristic(dump, 'skills')?.arr || []
  return { items, skills }
}

function normalizeItem(rec, cfg) {
  const id = toText(pick(rec, ['id', 'template_id', 'templateId', '__dumpKey']))
  if (!id) return null
  const rawTags = dedupeTextArray(pick(rec, ['tags', 'tags_raw', 'Tags']))
  const rawHeroes = dedupeTextArray(pick(rec, ['heroes', 'heroes_raw', 'Heroes']))
  const filteredTags = rawTags.filter((x) => {
    const lx = x.toLowerCase()
    if (lx === 'item' || lx === 'small' || lx === 'medium' || lx === 'large') return false
    if (rawHeroes.some((h) => h.toLowerCase() === lx)) return false
    return true
  })
  const tips = parseTooltips(rec)
  const cooldown = parseCooldown(tips.all)
  const quests = parseQuests(tips.all)
  const out = {
    id,
    source_key: toText(rec.__dumpKey || ''),
    shortlink: toText(rec.Shortlink || rec.shortlink || ''),
    name_en: toText(pick(rec, ['name_en', 'nameEn', 'name', 'TitleEn', 'Title'])),
    name_cn: toText(pick(rec, ['name_cn', 'nameCn', 'name_zh', 'nameZh', 'name_zh_cn', 'Title'])),
    type: toText(pick(rec, ['type', 'Type'])) || 'Item',
    size: normalizeSize(pick(rec, ['size', 'Size'])),
    starting_tier: toTier(pick(rec, ['starting_tier', 'startingTier', 'BaseTier'])),
    available_tiers: tierList(pick(rec, ['available_tiers', 'availableTiers'])),
    heroes: rawHeroes,
    tags: filteredTags,
    hidden_tags: dedupeTextArray(pick(rec, ['hidden_tags', 'hidden_tags_raw', 'HiddenTags'])),
    cooldown: typeof cooldown === 'number' && cooldown > 0 ? cooldown : undefined,
    cooldown_tiers: typeof cooldown === 'string' ? cooldown : undefined,
    skills: tips.active,
    skills_passive: tips.passive,
    description_cn: tips.active[0] || tips.passive[0] || '',
    descriptions: tips.active,
    quests: quests.length ? quests : toArray(rec.quests || []).map((x) => ({
      id: toText(x?.id || ''),
      objective: toText(x?.objective || x?.description || ''),
    })),
    enchantments: parseEnchantments(rec),
    image_url: extractImageUrl(rec, cfg),
  }
  return out
}

function normalizeSkill(rec, cfg) {
  const id = toText(pick(rec, ['id', 'template_id', 'templateId', '__dumpKey']))
  if (!id) return null
  const rawTags = dedupeTextArray(pick(rec, ['tags', 'tags_raw', 'Tags']))
  const rawHeroes = dedupeTextArray(pick(rec, ['heroes', 'heroes_raw', 'Heroes']))
  const filteredTags = rawTags.filter((x) => {
    const lx = x.toLowerCase()
    if (lx === 'skill' || lx === 'small' || lx === 'medium' || lx === 'large') return false
    if (rawHeroes.some((h) => h.toLowerCase() === lx)) return false
    return true
  })
  const tips = parseTooltips(rec)
  const cooldown = parseCooldown(tips.all)
  const quests = parseQuests(tips.all)
  const out = {
    id,
    source_key: toText(rec.__dumpKey || ''),
    shortlink: toText(rec.Shortlink || rec.shortlink || ''),
    name_en: toText(pick(rec, ['name_en', 'nameEn', 'name', 'TitleEn', 'Title'])),
    name_cn: toText(pick(rec, ['name_cn', 'nameCn', 'name_zh', 'nameZh', 'name_zh_cn', 'Title'])),
    description_en: toText(pick(rec, ['description_en', 'descriptionEn', 'description'])) || tips.active[0] || tips.passive[0] || '',
    description_cn: toText(pick(rec, ['description_cn', 'descriptionCn'])) || tips.active[0] || tips.passive[0] || '',
    size: normalizeSize(pick(rec, ['size', 'Size'])),
    starting_tier: toTier(pick(rec, ['starting_tier', 'startingTier', 'BaseTier'])),
    available_tiers: tierList(pick(rec, ['available_tiers', 'availableTiers'])),
    heroes: rawHeroes,
    tags: filteredTags,
    hidden_tags: dedupeTextArray(pick(rec, ['hidden_tags', 'hidden_tags_raw', 'HiddenTags'])),
    cooldown: typeof cooldown === 'number' && cooldown > 0 ? cooldown : undefined,
    cooldown_tiers: typeof cooldown === 'string' ? cooldown : undefined,
    skills: tips.active,
    skills_passive: tips.passive,
    descriptions: tips.active,
    quests: quests,
    enchantments: parseEnchantments(rec),
    art_key: toText(pick(rec, ['art_key', 'artKey'])),
    image_url: extractImageUrl(rec, cfg),
  }
  return out
}

// 注意：按项目规范，dump 文件必须手动下载后通过 --dump-file 传入（脚本不提供远程下载）。

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function loadJsonIfExists(file) {
  try {
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function compareById(existing, next) {
  const a = new Set(toArray(existing).map((x) => toText(x?.id)).filter(Boolean))
  const b = new Set(toArray(next).map((x) => toText(x?.id)).filter(Boolean))
  let overlap = 0
  for (const id of b) if (a.has(id)) overlap += 1
  return {
    existingCount: a.size,
    nextCount: b.size,
    overlap,
    onlyExisting: a.size - overlap,
    onlyNext: b.size - overlap,
  }
}

function normalizeNameKey(v) {
  return String(v || '').trim().toLowerCase()
}

function normalizeHeroList(v) {
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (x && typeof x === 'object') return String(x.id || x.en || x.cn || '').trim()
        return String(x || '').trim()
      })
      .filter(Boolean)
  }
  const s = String(v || '').trim()
  if (!s) return []
  return s
    .split(/[|,]/)
    .map((x) => x.split('/')[0].trim())
    .filter(Boolean)
}

function overlap(a, b) {
  const sa = new Set(a.map((x) => String(x).toLowerCase()))
  for (const x of b) if (sa.has(String(x).toLowerCase())) return true
  return false
}

function isLegacyCooldownMatch(cur, old) {
  const curSize = normalizeSize(cur?.size || '')
  const oldSize = normalizeSize(old?.size || '')
  if (curSize && oldSize && curSize !== oldSize) return false

  const curHeroes = normalizeHeroList(cur?.heroes)
  const oldHeroes = normalizeHeroList(old?.heroes)
  if (curHeroes.length > 0 && oldHeroes.length > 0 && !overlap(curHeroes, oldHeroes)) return false

  return true
}

async function mergeLegacyCooldown(projectRoot, items, skills) {
  const itemsPath = path.join(projectRoot, 'public/resources/raw_exports/items_export_20260319_092219.json')
  const skillsPath = path.join(projectRoot, 'public/resources/raw_exports/skills_export_20260319_092220.json')
  const [oldItems, oldSkills] = await Promise.all([loadJsonIfExists(itemsPath), loadJsonIfExists(skillsPath)])

  const itemByName = new Map()
  for (const x of toArray(oldItems)) {
    const cn = normalizeNameKey(x?.name_cn)
    const en = normalizeNameKey(x?.name_en)
    if (cn) itemByName.set(cn, [...(itemByName.get(cn) || []), x])
    if (en) itemByName.set(en, [...(itemByName.get(en) || []), x])
  }

  const skillByName = new Map()
  for (const x of toArray(oldSkills)) {
    const cn = normalizeNameKey(x?.name_cn)
    const en = normalizeNameKey(x?.name_en)
    if (cn) skillByName.set(cn, [...(skillByName.get(cn) || []), x])
    if (en) skillByName.set(en, [...(skillByName.get(en) || []), x])
  }

  let itemMerged = 0
  let skillMerged = 0
  for (const rec of items) {
    if (rec.cooldown || rec.cooldown_tiers) continue
    const candidates = [
      ...(itemByName.get(normalizeNameKey(rec?.name_cn)) || []),
      ...(itemByName.get(normalizeNameKey(rec?.name_en)) || []),
    ]
    const old = candidates.find((x) => isLegacyCooldownMatch(rec, x))
    if (!old) continue
    const oldCd = Number(old?.cooldown)
    const oldCdTiers = String(old?.cooldown_tiers || '').trim()
    if (Number.isFinite(oldCd) && oldCd > 0) {
      rec.cooldown = oldCd
      if (oldCdTiers) rec.cooldown_tiers = oldCdTiers
      itemMerged += 1
    } else if (oldCdTiers) {
      rec.cooldown_tiers = oldCdTiers
      itemMerged += 1
    }
  }

  for (const rec of skills) {
    if (rec.cooldown || rec.cooldown_tiers) continue
    const candidates = [
      ...(skillByName.get(normalizeNameKey(rec?.name_cn)) || []),
      ...(skillByName.get(normalizeNameKey(rec?.name_en)) || []),
    ]
    const old = candidates.find((x) => isLegacyCooldownMatch(rec, x))
    if (!old) continue
    const oldCd = Number(old?.cooldown)
    const oldCdTiers = String(old?.cooldown_tiers || '').trim()
    if (Number.isFinite(oldCd) && oldCd > 0) {
      rec.cooldown = oldCd
      if (oldCdTiers) rec.cooldown_tiers = oldCdTiers
      skillMerged += 1
    } else if (oldCdTiers) {
      rec.cooldown_tiers = oldCdTiers
      skillMerged += 1
    }
  }

  return { itemMerged, skillMerged }
}

async function downloadAllImages(records, outDir, kind) {
  await ensureDir(outDir)
  let ok = 0
  let fail = 0
  let skip = 0
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i]
    const id = safeFileId(rec.id)
    const url = toText(rec.image_url)
    if (!id || !url) {
      skip += 1
      continue
    }
    const file = path.join(outDir, `${id}.webp`)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ab = await res.arrayBuffer()
      await fs.writeFile(file, Buffer.from(ab))
      ok += 1
    } catch {
      fail += 1
    }
    if ((i + 1) % 100 === 0) {
      console.log(`[${kind}] image ${i + 1}/${records.length} ok=${ok} fail=${fail} skip=${skip}`)
    }
  }
  return { ok, fail, skip }
}

async function main() {
  const projectRoot = process.cwd()
  const itemsFile = arg('items-file', '')
  const skillsFile = arg('skills-file', '')
  const dumpFile = arg('dump-file', '')
  const outDir = arg('out-dir', path.join(projectRoot, 'public/resources/bazaardb'))
  const imageBase = arg('image-base', DEFAULT_IMAGE_BASE)
  const imageVersion = arg('image-version', DEFAULT_IMAGE_VERSION)
  const imageSize = Number(arg('image-size', String(DEFAULT_IMAGE_SIZE))) || DEFAULT_IMAGE_SIZE
  const imageQuery = arg('image-query', DEFAULT_IMAGE_QUERY)
  const downloadImages = hasFlag('download-images')

  const cfg = { imageBase, imageVersion, imageSize, imageQuery }

  let rawItems = []
  let rawSkills = []
  if (itemsFile || skillsFile) {
    if (itemsFile) {
      rawItems = JSON.parse(await fs.readFile(itemsFile, 'utf8'))
      console.log(`读取本地 items: ${itemsFile}`)
    }
    if (skillsFile) {
      rawSkills = JSON.parse(await fs.readFile(skillsFile, 'utf8'))
      console.log(`读取本地 skills: ${skillsFile}`)
    }
  } else {
    if (!dumpFile) {
      throw new Error('缺少 --dump-file。请先手动下载 dump JSON 到本地后再执行。')
    }
    const dump = JSON.parse(await fs.readFile(dumpFile, 'utf8'))
    console.log(`读取本地 dump: ${dumpFile}`)
    const detected = detectItemsSkills(dump)
    rawItems = detected.items || []
    rawSkills = detected.skills || []
  }

  if (!rawItems.length || !rawSkills.length) {
    throw new Error(`无法识别 dump 中的物品/技能数组：items=${rawItems.length}, skills=${rawSkills.length}`)
  }

  const items = rawItems.map((x) => normalizeItem(x, cfg)).filter(Boolean)
  const skills = rawSkills.map((x) => normalizeSkill(x, cfg)).filter(Boolean)
  const legacyMerge = await mergeLegacyCooldown(projectRoot, items, skills)

  const existingItemsFile = path.join(projectRoot, 'public/resources/raw_exports/items_export_20260319_092219.json')
  const existingSkillsFile = path.join(projectRoot, 'public/resources/raw_exports/skills_export_20260319_092220.json')
  const existingItems = await loadJsonIfExists(existingItemsFile)
  const existingSkills = await loadJsonIfExists(existingSkillsFile)
  const itemCmp = compareById(existingItems, items)
  const skillCmp = compareById(existingSkills, skills)

  await ensureDir(outDir)
  const itemsOut = path.join(outDir, 'items_db.json')
  const skillsOut = path.join(outDir, 'skills_db.json')
  const reportOut = path.join(outDir, 'sync_report.json')
  await fs.writeFile(itemsOut, JSON.stringify(items, null, 2), 'utf8')
  await fs.writeFile(skillsOut, JSON.stringify(skills, null, 2), 'utf8')

  const report = {
    generatedAt: new Date().toISOString(),
    source: itemsFile || skillsFile
      ? { type: 'split-files', itemsFile: itemsFile || null, skillsFile: skillsFile || null }
      : { type: 'file', value: dumpFile },
    detected: {
      rawItems: rawItems.length,
      rawSkills: rawSkills.length,
      normalizedItems: items.length,
      normalizedSkills: skills.length,
    },
    compareWithExisting: {
      items: itemCmp,
      skills: skillCmp,
    },
    mergedCooldownFromLegacy: legacyMerge,
    imageConfig: cfg,
  }
  await fs.writeFile(reportOut, JSON.stringify(report, null, 2), 'utf8')

  console.log('对比结果:')
  console.log('items:', itemCmp)
  console.log('skills:', skillCmp)
  console.log(`已写入: ${itemsOut}`)
  console.log(`已写入: ${skillsOut}`)
  console.log(`已写入: ${reportOut}`)

  if (downloadImages) {
    const itemImageDir = path.join(outDir, 'images/card')
    const skillImageDir = path.join(outDir, 'images/skill')
    const itemRet = await downloadAllImages(items, itemImageDir, 'items')
    const skillRet = await downloadAllImages(skills, skillImageDir, 'skills')
    const summary = { itemImages: itemRet, skillImages: skillRet }
    await fs.writeFile(path.join(outDir, 'image_download_report.json'), JSON.stringify(summary, null, 2), 'utf8')
    console.log('图片下载结果:', summary)
  }
}

main().catch((e) => {
  console.error('[sync_bazaardb_data] 失败:', e?.message || e)
  process.exit(1)
})
