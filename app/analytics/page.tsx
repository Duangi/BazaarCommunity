'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import ItemDetail from '@/components/ItemDetail'
import HorizontalCardStrip from '@/components/common/HorizontalCardStrip'
import WikiFilterPanel from '@/components/tools/WikiFilterPanel'
import DayRangeInput from '@/components/common/DayRangeInput'
import { itemsDbUrl, skillsDbUrl } from '@/lib/cdn'
import { enrichItemsWithResolvedText, loadResolvedTextMap } from '@/lib/itemDataEnhancer'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import styles from './page.module.css'

const ENABLE_ROUTE_STATS = false

type LookupApiCard = {
  slot_index: number
  template_id: string
  tier?: number
  enchant_code?: string | null
}

type LookupApiItem = {
  combo_signature: string
  layout_signature: string
  hero: string
  day: number
  rating_bucket: string
  matches: number
  wins: number
  win_rate: number
  smoothed_win_rate?: number
  lineup: {
    layout_signature: string
    combo_signature: string
    cards: LookupApiCard[]
  } | null
}

type RouteChoiceStep = {
  hour: number
  template_id: string
  name_cn: string
  name_en: string
}

type RouteChoiceChainRow = {
  chain_signature: string
  picks: number
  ten_win_rate: number
  first5_pvp_win_rate: number
  first5_avg_wins: number
  first5_sample_battles: number
  steps: RouteChoiceStep[]
  missing_cn_count: number
}

type RouteChoiceHeroDay = {
  day: number
  chains: RouteChoiceChainRow[]
}

type RouteChoiceHero = {
  hero: string
  days: RouteChoiceHeroDay[]
}

type RouteChoicePayload = {
  generatedAt: string
  source: string
  filesScanned: number
  runsParsed: number
  heroes: RouteChoiceHero[]
}

function normalizeText(value: any): string {
  return String(value || '').trim().toLowerCase()
}

function cardRoleByPos(pos: number): 'core' | 'sub' | 'tech' {
  if (pos <= 2) return 'core'
  if (pos <= 4) return 'sub'
  return 'tech'
}

function pickLookupCardId(item: any): string {
  const candidates = [item?.id, item?.source_key, item?.template_id, item?.templateId, item?.name_cn, item?.name_en]
  for (const v of candidates) {
    const s = String(v || '').trim()
    if (s) return s
  }
  return ''
}

function createItemAliasMap(items: any[], resolvedTextMap: Record<string, any> | null): Map<string, any> {
  const aliasMap = new Map<string, any>()
  const byName = new Map<string, any>()

  for (const item of items) {
    const id = normalizeText(item?.id)
    const sourceKey = normalizeText(item?.source_key)
    const nameCn = normalizeText(item?.name_cn)
    const nameEn = normalizeText(item?.name_en)
    if (id) aliasMap.set(id, item)
    if (sourceKey) aliasMap.set(sourceKey, item)
    if (nameCn) byName.set(nameCn, item)
    if (nameEn) byName.set(nameEn, item)
  }

  if (resolvedTextMap && typeof resolvedTextMap === 'object') {
    for (const [rawKey, rawVal] of Object.entries(resolvedTextMap)) {
      const key = normalizeText(rawKey)
      if (!key || aliasMap.has(key)) continue
      const val: any = rawVal || {}
      const mapped =
        byName.get(normalizeText(val?.name_cn)) ||
        byName.get(normalizeText(val?.name_en)) ||
        null
      if (mapped) aliasMap.set(key, mapped)
    }
  }

  return aliasMap
}

export default function AnalyticsPage() {
  const [viewMode, setViewMode] = useState<'card_lookup' | 'route_stats'>('card_lookup')
  const [items, setItems] = useState<any[]>([])
  const [skills, setSkills] = useState<any[]>([])
  const [resolvedTextMap, setResolvedTextMap] = useState<Record<string, any> | null>(null)
  const [selectedItem, setSelectedItem] = useState<any | null>(null)
  const [lookupCard, setLookupCard] = useState<any | null>(null)
  const [lookupSortBy, setLookupSortBy] = useState<'hot' | 'win_rate'>('hot')
  const [lookupDayMin, setLookupDayMin] = useState('1')
  const [lookupDayMax, setLookupDayMax] = useState('13')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [lookupItems, setLookupItems] = useState<LookupApiItem[]>([])
  const [routeStats, setRouteStats] = useState<RouteChoicePayload | null>(null)
  const [routeStatsLoading, setRouteStatsLoading] = useState(false)
  const [routeStatsError, setRouteStatsError] = useState('')
  const [routeHero, setRouteHero] = useState('全部')
  const [routeDay, setRouteDay] = useState('1')

  useEffect(() => {
    let canceled = false
    ;(async () => {
      try {
        const [itemsRes, skillsRes, map] = await Promise.all([fetch(itemsDbUrl()), fetch(skillsDbUrl()), loadResolvedTextMap()])
        const [itemsData, skillsData] = await Promise.all([itemsRes.json(), skillsRes.json()])
        if (canceled) return
        const listItems = enrichItemsWithResolvedText(Array.isArray(itemsData) ? itemsData : [], map)
        const listSkills = enrichItemsWithResolvedText(Array.isArray(skillsData) ? skillsData : [], map)
        setItems(listItems)
        setSkills(listSkills)
        setResolvedTextMap(map)
      } catch {
        if (!canceled) {
          setItems([])
          setSkills([])
          setResolvedTextMap(null)
        }
      }
    })()
    return () => {
      canceled = true
    }
  }, [])

  const itemAliasMap = useMemo(() => createItemAliasMap(items, resolvedTextMap), [items, resolvedTextMap])
  const isRouteMode = ENABLE_ROUTE_STATS && viewMode === 'route_stats'

  useEffect(() => {
    if (!ENABLE_ROUTE_STATS) return
    let canceled = false
    ;(async () => {
      setRouteStatsLoading(true)
      setRouteStatsError('')
      try {
        const res = await fetch('/resources/analytics/route_choice_stats.json', { cache: 'no-store' })
        const json = await res.json()
        if (canceled) return
        if (!res.ok || !json || !Array.isArray(json?.heroes)) {
          setRouteStats(null)
          setRouteStatsError('路线统计文件不存在或格式错误。先运行 npm run build:route-stats')
          return
        }
        setRouteStats(json as RouteChoicePayload)
      } catch {
        if (!canceled) {
          setRouteStats(null)
          setRouteStatsError('路线统计读取失败。先运行 npm run build:route-stats')
        }
      } finally {
        if (!canceled) setRouteStatsLoading(false)
      }
    })()
    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    let canceled = false
    const cardId = pickLookupCardId(lookupCard)
    if (!cardId) {
      setLookupItems([])
      setLookupError('')
      setLookupLoading(false)
      return () => {
        canceled = true
      }
    }

    ;(async () => {
      setLookupLoading(true)
      setLookupError('')
      try {
        const params = new URLSearchParams()
        params.set('cards', cardId)
        params.set('mode', 'and')
        params.set('dayMin', String(Math.max(1, Number(lookupDayMin || 1))))
        params.set('dayMax', String(Math.max(1, Number(lookupDayMax || 13))))
        params.set('sort', lookupSortBy)
        params.set('limit', '40')
        const res = await fetch(`/api/match-analytics/card-lookup?${params.toString()}`, { cache: 'no-store' })
        const json = await res.json()
        if (canceled) return
        if (!res.ok) {
          setLookupItems([])
          setLookupError(String(json?.error || '查询失败'))
          return
        }
        setLookupItems(Array.isArray(json?.items) ? json.items : [])
      } catch (err: any) {
        if (canceled) return
        setLookupItems([])
        setLookupError(String(err?.message || '查询失败'))
      } finally {
        if (!canceled) setLookupLoading(false)
      }
    })()

    return () => {
      canceled = true
    }
  }, [lookupCard, lookupDayMin, lookupDayMax, lookupSortBy])

  const routeHeroOptions = useMemo(() => {
    const set = new Set<string>(['全部'])
    ;(routeStats?.heroes || []).forEach((h) => {
      if (h?.hero) set.add(String(h.hero))
    })
    return Array.from(set)
  }, [routeStats])

  const routeRows = useMemo(() => {
    if (!routeStats) return []
    const out: Array<RouteChoiceChainRow & { hero: string; day: number }> = []
    const dayNum = Math.max(1, Number(routeDay || 1))
    for (const heroBucket of routeStats.heroes || []) {
      if (!heroBucket) continue
      if (routeHero !== '全部' && String(heroBucket.hero) !== routeHero) continue
      const dayBucket = (heroBucket.days || []).find((d) => Number(d?.day || 0) === dayNum)
      if (!dayBucket) continue
      for (const r of dayBucket.chains || []) {
        out.push({
          hero: String(heroBucket.hero || 'Unknown'),
          day: dayNum,
          chain_signature: String(r.chain_signature || ''),
          picks: Number(r.picks || 0),
          ten_win_rate: Number(r.ten_win_rate || 0),
          first5_pvp_win_rate: Number(r.first5_pvp_win_rate || 0),
          first5_avg_wins: Number(r.first5_avg_wins || 0),
          first5_sample_battles: Number(r.first5_sample_battles || 0),
          steps: Array.isArray(r.steps) ? r.steps : [],
          missing_cn_count: Number(r.missing_cn_count || 0),
        })
      }
    }
    out.sort((a, b) => b.picks - a.picks || b.first5_pvp_win_rate - a.first5_pvp_win_rate)
    return out
  }, [routeStats, routeHero, routeDay])

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.topBar}>
            <div>
              <h1 className={styles.title}>大数据分析（测试版）</h1>
              <div className={styles.sub}>单卡查阵容（BazaarPlusPlus 数据）</div>
            </div>
            <Link href="/" className={styles.back}>
              返回首页
            </Link>
          </div>

          <div className={styles.layout}>
            <aside className={`${styles.panel} ${styles.left}`}>
              <div className={styles.wikiHost}>
                <WikiFilterPanel
                  items={items}
                  skills={skills}
                  onSelectItem={setSelectedItem}
                  enableBuildLookup
                  onLookupBuilds={(item) => {
                    setLookupCard(item)
                    setSelectedItem(item)
                  }}
                  lookupFilterItem={lookupCard}
                  onClearLookupFilter={() => setLookupCard(null)}
                />
              </div>
            </aside>

            <section className={`${styles.panel} ${styles.middle}`}>
              <div className={styles.block}>
                <div className={styles.modeTabs}>
                  <button
                    type="button"
                    className={`${styles.modeTabBtn} ${!isRouteMode ? styles.modeTabBtnActive : ''}`}
                    onClick={() => setViewMode('card_lookup')}
                  >
                    单卡查阵容
                  </button>
                  {ENABLE_ROUTE_STATS ? (
                    <button
                      type="button"
                      className={`${styles.modeTabBtn} ${isRouteMode ? styles.modeTabBtnActive : ''}`}
                      onClick={() => setViewMode('route_stats')}
                    >
                      路线胜率（Day1~）
                    </button>
                  ) : null}
                </div>

                {!isRouteMode ? (
                  <>
                  <div className={styles.tableTopBar}>
                    <h3 className={styles.blockTitle}>
                      通过单卡查询阵容
                    {lookupCard ? ` · ${lookupCard.name_cn || lookupCard.name_en || lookupCard.id}` : ''}
                  </h3>
                  <div className={styles.sortControls}>
                    <DayRangeInput
                      className={styles.lookupDayRange}
                      startValue={lookupDayMin}
                      endValue={lookupDayMax}
                      onStartChange={setLookupDayMin}
                      onEndChange={setLookupDayMax}
                      onStartStep={(delta) => setLookupDayMin((v) => String(Math.max(1, Number(v || 1) + delta)))}
                      onEndStep={(delta) =>
                        setLookupDayMax((v) => {
                          const min = Math.max(1, Number(lookupDayMin || 1))
                          return String(Math.max(min, Number(v || min) + delta))
                        })
                      }
                    />
                    <button
                      type="button"
                      className={`${styles.sortBtn} ${lookupSortBy === 'hot' ? styles.sortBtnActive : ''}`}
                      onClick={() => setLookupSortBy('hot')}
                    >
                      按热度
                    </button>
                    <button
                      type="button"
                      className={`${styles.sortBtn} ${lookupSortBy === 'win_rate' ? styles.sortBtnActive : ''}`}
                      onClick={() => setLookupSortBy('win_rate')}
                    >
                      按胜率
                    </button>
                  </div>
                </div>

                {!lookupCard ? (
                  <div className={styles.lookupEmpty}>先在左侧百科里选中一张卡，然后点击“寻找包含此卡的阵容”。</div>
                ) : lookupLoading ? (
                  <div className={styles.lookupEmpty}>正在加载阵容数据...</div>
                ) : lookupError ? (
                  <div className={styles.lookupEmpty}>{lookupError}</div>
                ) : lookupItems.length === 0 ? (
                  <div className={styles.lookupEmpty}>未找到包含该卡牌的阵容。</div>
                ) : (
                  <div className={styles.lookupList}>
                    {lookupItems.map((row, idx) => {
                      const lineupCards = Array.isArray(row.lineup?.cards) ? row.lineup!.cards : []
                      const stripCards = lineupCards
                        .slice()
                        .sort((a, b) => Number(a.slot_index || 0) - Number(b.slot_index || 0))
                        .map((c, cIdx) => {
                          const mapped = itemAliasMap.get(normalizeText(c.template_id))
                          if (!mapped) return null
                          const item = mapped
                          return {
                            key: `${row.layout_signature}-${c.template_id}-${cIdx}`,
                            name: item?.name_cn || item?.name_en || c.template_id,
                            size: item?.size || 'medium',
                            role: cardRoleByPos(cIdx + 1),
                            item,
                            onClick: () => setSelectedItem(item),
                          }
                        })
                        .filter(Boolean) as Array<any>
                      return (
                        <div key={`${row.layout_signature}-${idx}`} className={styles.lookupBuildCard}>
                          <div className={styles.lookupBuildHeader}>
                            <div className={styles.lookupBuildTitle}>{row.hero || 'Unknown'} · Day{row.day || '-'}</div>
                            <div className={styles.muted}>
                              命中 {row.matches} · 胜率 {(Number((row.smoothed_win_rate ?? row.win_rate) || 0) * 100).toFixed(1)}%
                              {Number(row.matches || 0) <= 2 ? '（小样本修正）' : ''}
                              {' · 原始 '}
                              {(Number(row.win_rate || 0) * 100).toFixed(1)}%
                              {' · 分段 '}
                              {row.rating_bucket || '-'}
                            </div>
                          </div>
                          <div className={styles.lookupCardsRow}>
                            <HorizontalCardStrip cards={stripCards} scale={1} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                  </>
                ) : (
                  <>
                    <div className={styles.tableTopBar}>
                      <h3 className={styles.blockTitle}>英雄路线选择与胜率</h3>
                      <div className={styles.sortControls}>
                        <select className={styles.select} value={routeHero} onChange={(e) => setRouteHero(e.target.value)}>
                          {routeHeroOptions.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                        <select className={styles.select} value={routeDay} onChange={(e) => setRouteDay(e.target.value)}>
                          {Array.from({ length: 13 }).map((_, i) => (
                            <option key={i + 1} value={String(i + 1)}>
                              Day{i + 1}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {routeStatsLoading ? (
                      <div className={styles.lookupEmpty}>正在加载路线统计...</div>
                    ) : routeStatsError ? (
                      <div className={styles.lookupEmpty}>{routeStatsError}</div>
                    ) : routeRows.length === 0 ? (
                      <div className={styles.lookupEmpty}>当前筛选下暂无路线数据。</div>
                    ) : (
                      <div className={styles.routeTableWrap}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>英雄</th>
                              <th>Day路径链</th>
                              <th>样本</th>
                              <th>前5天PVP胜率</th>
                              <th>10胜收官率</th>
                            </tr>
                          </thead>
                          <tbody>
                            {routeRows.map((r, idx) => (
                              <tr key={`${r.hero}-${r.day}-${r.chain_signature}-${idx}`}>
                                <td>{idx + 1}</td>
                                <td>{r.hero}</td>
                                <td>
                                  {r.steps.length === 0 ? (
                                    <span className={styles.muted}>无路径步骤</span>
                                  ) : (
                                    <div className={styles.routeChainCell}>
                                      {r.steps.map((s, i) => {
                                        const label = (s.name_cn || '').trim() || `${s.name_en}（无官方中文映射）`
                                        return (
                                          <span key={`${r.chain_signature}-${s.template_id}-${i}`} className={styles.routeStep}>
                                            H{s.hour} {label}
                                            {i < r.steps.length - 1 ? <span className={styles.routeArrow}>→</span> : null}
                                          </span>
                                        )
                                      })}
                                    </div>
                                  )}
                                </td>
                                <td>{r.picks}</td>
                                <td>{(r.first5_pvp_win_rate * 100).toFixed(1)}%</td>
                                <td>{(r.ten_win_rate * 100).toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            <aside className={`${styles.panel} ${styles.right}`}>
              <div className={styles.block}>
                <h3 className={styles.blockTitle}>当前查询</h3>
                {!isRouteMode ? (
                  <>
                    <div className={styles.muted}>卡牌：{lookupCard ? (lookupCard.name_cn || lookupCard.name_en || lookupCard.id) : '未选择'}</div>
                    <div className={styles.muted}>天数范围：Day{lookupDayMin} - Day{lookupDayMax}</div>
                    <div className={styles.muted}>排序：{lookupSortBy === 'hot' ? '按热度' : '按胜率'}</div>
                  </>
                ) : (
                  <>
                    <div className={styles.muted}>英雄：{routeHero}</div>
                    <div className={styles.muted}>天数：Day{routeDay}</div>
                    <div className={styles.muted}>
                      样本：{routeRows.length} 条路线
                      {routeStats ? ` · runs ${routeStats.runsParsed}` : ''}
                    </div>
                  </>
                )}
              </div>

              <div className={styles.detailBlock}>
                <ItemDetail item={selectedItem} />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </DndProvider>
  )
}
