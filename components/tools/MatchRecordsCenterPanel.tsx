'use client'

import { useMemo, useRef, useState } from 'react'
import { CommunityGameRecord, CommunityPublicUser } from '@/lib/communityBuilds'
import { cdnUrl, heroAvatarUrl } from '@/lib/cdn'
import RecordScreenshotImage from '@/components/tools/RecordScreenshotImage'
import { resolveScreenshotOpenUrl } from '@/lib/recordScreenshot'
import styles from './MatchRecordsCenterPanel.module.css'

interface MatchRecordsCenterPanelProps {
  records: CommunityGameRecord[]
  total: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  selectedRecordId?: string
  usersById: Record<string, CommunityPublicUser>
  currentUserId?: string
  onlyMine?: boolean
  onSelectRecord: (record: CommunityGameRecord) => void
  onLoadMore: () => void
  onUpdateMatchTitle?: (matchId: string, title: string) => Promise<boolean>
}

type BattleCard = {
  template_id?: string
  name_cn?: string
  name_en?: string
  image?: string
  size?: string
}

type MatchSummary = {
  key: string
  matchId: string
  matchTitle: string
  authorUserId: string
  authorName: string
  hero: string
  gameDate: string
  startTime: string
  endTime: string
  isFinished: boolean
  matchVictory: boolean | null
  wins: number
  losses: number
  flowSequence: Array<'win' | 'lose'>
  lastDay: number
  latestBattle: CommunityGameRecord
  battles: CommunityGameRecord[]
}

type DisplayBattleRow = {
  day: number
  result: 'win' | 'lose' | null
  battle: CommunityGameRecord | null
}

function asObject(input: any): Record<string, any> {
  if (input && typeof input === 'object') return input as Record<string, any>
  return {}
}

function toNumber(input: any): number | null {
  const n = Number(input)
  return Number.isFinite(n) ? n : null
}

function toBoolean(input: any): boolean | null {
  if (typeof input === 'boolean') return input
  if (typeof input === 'number') return input !== 0
  const text = String(input || '').trim().toLowerCase()
  if (text === 'true' || text === '1' || text === 'yes') return true
  if (text === 'false' || text === '0' || text === 'no') return false
  return null
}

function formatDate(raw?: string): string {
  if (!raw) return '--'
  const text = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (text.includes('T')) return text.slice(0, 10)
  if (text.includes(' ')) return text.split(' ')[0]
  return text
}

function formatTime(raw?: string): string {
  if (!raw) return '--:--'
  const text = String(raw).trim()
  if (text.includes('T')) {
    const maybe = text.split('T')[1] || ''
    return maybe.slice(0, 5) || '--:--'
  }
  if (text.includes(' ')) {
    const maybe = text.split(' ')[1] || ''
    return maybe.slice(0, 5) || '--:--'
  }
  if (/^\d{2}:\d{2}/.test(text)) return text.slice(0, 5)
  return '--:--'
}

function getBattleCards(meta: Record<string, any>, enemy = false): BattleCard[] {
  const key = enemy ? 'enemy_lineup_cards' : 'lineup_cards'
  const altKey = enemy ? 'enemyLineupCards' : 'lineupCards'
  const list = Array.isArray(meta[key]) ? meta[key] : Array.isArray(meta[altKey]) ? meta[altKey] : []
  return list
    .map((c: any) => ({
      template_id: c?.template_id || c?.templateId || '',
      name_cn: c?.name_cn || c?.nameCn || '',
      name_en: c?.name_en || c?.nameEn || '',
      image: c?.image || '',
      size: c?.size || '',
    }))
    .filter((c: BattleCard) => !!c.template_id || !!c.image)
}

function cardImageUrl(card: BattleCard): string {
  if (card.image && /^https?:\/\//i.test(card.image)) return card.image
  if (card.image && card.image.startsWith('/')) return card.image
  if (card.template_id) return cdnUrl(`images/${card.template_id}.webp`)
  return ''
}

function getMatchKey(record: CommunityGameRecord): string {
  const meta = asObject(record.meta)
  const rawMatchId = String(meta.match_id || meta.matchId || meta.run_id || meta.runId || '').trim()
  if (rawMatchId) return `${record.authorUserId}::match:${rawMatchId}`
  const start = String(meta.start_time || meta.match_start_time || meta.matchStartTime || '').trim()
  if (start) return `${record.authorUserId}::start:${start}`
  return `${record.authorUserId}::date:${record.playedOn}`
}

function deriveScore(latestMeta: Record<string, any>, battles: CommunityGameRecord[]): { wins: number; losses: number } {
  const explicitWins = toNumber(latestMeta.match_total_wins ?? latestMeta.matchWins ?? latestMeta.total_wins)
  const explicitLosses = toNumber(latestMeta.match_total_losses ?? latestMeta.matchLosses ?? latestMeta.total_losses)
  if (explicitWins != null && explicitLosses != null) {
    return {
      wins: Math.max(0, Math.round(explicitWins)),
      losses: Math.max(0, Math.round(explicitLosses)),
    }
  }

  const wins = battles.filter((x) => x.result === 'win').length
  return { wins, losses: battles.length - wins }
}

function parseMatchFlow(latestMeta: Record<string, any>, battles: CommunityGameRecord[]): Array<'win' | 'lose'> {
  const raw = latestMeta.match_flow ?? latestMeta.matchFlow
  if (Array.isArray(raw) && raw.length > 0) {
    const normalized = raw
      .map((entry: any, index: number) => {
        if (typeof entry === 'string') {
          const token = entry.trim().toLowerCase()
          if (token === 'win' || token === 'w') return { day: null as number | null, order: index, result: 'win' as const }
          if (token === 'lose' || token === 'loss' || token === 'l') return { day: null as number | null, order: index, result: 'lose' as const }
          return null
        }
        const day = toNumber(entry?.day ?? entry?.dayIndex)
        const resultToken = String(entry?.result || entry?.outcome || entry?.victory || '').trim().toLowerCase()
        if (resultToken === 'win' || resultToken === 'w' || resultToken === 'true' || resultToken === '1') {
          return { day, order: index, result: 'win' as const }
        }
        if (resultToken === 'lose' || resultToken === 'loss' || resultToken === 'l' || resultToken === 'false' || resultToken === '0') {
          return { day, order: index, result: 'lose' as const }
        }
        if (typeof entry?.victory === 'boolean') {
          return { day, order: index, result: entry.victory ? 'win' as const : 'lose' as const }
        }
        return null
      })
      .filter(Boolean) as Array<{ day: number | null; order: number; result: 'win' | 'lose' }>
    const parsed = normalized
      .sort((a, b) => {
        const da = a.day ?? Number.MAX_SAFE_INTEGER
        const db = b.day ?? Number.MAX_SAFE_INTEGER
        if (da !== db) return da - db
        return a.order - b.order
      })
      .map((entry) => entry.result)
    if (parsed.length > 0) return parsed
  }

  return [...battles]
    .sort((a, b) => {
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex
      const ta = String(asObject(a.meta).battle_start_time || asObject(a.meta).start_time || a.createdAt || '')
      const tb = String(asObject(b.meta).battle_start_time || asObject(b.meta).start_time || b.createdAt || '')
      return ta.localeCompare(tb)
    })
    .map((b) => (b.result === 'win' ? 'win' : 'lose') as 'win' | 'lose')
}

function buildSummaries(records: CommunityGameRecord[], usersById: Record<string, CommunityPublicUser>): MatchSummary[] {
  const grouped = new Map<string, CommunityGameRecord[]>()
  records.forEach((record) => {
    const key = getMatchKey(record)
    const list = grouped.get(key) || []
    list.push(record)
    grouped.set(key, list)
  })

  const summaries: MatchSummary[] = Array.from(grouped.entries()).map(([key, list]) => {
    const sorted = [...list].sort((a, b) => {
      if (b.dayIndex !== a.dayIndex) return b.dayIndex - a.dayIndex
      return +new Date(b.createdAt || b.playedOn) - +new Date(a.createdAt || a.playedOn)
    })
    const latest = sorted[0]
    const latestMeta = asObject(latest.meta)
    const user = usersById[latest.authorUserId]
    const hero = String(
      latestMeta.hero ||
      latestMeta.main_hero ||
      latestMeta.mainHero ||
      user?.mainHeroes?.[0] ||
      'Pygmalien'
    )
    const date = String(latestMeta.game_date || latestMeta.gameDate || latest.playedOn || '')
    const start = String(latestMeta.start_time || latestMeta.match_start_time || latestMeta.matchStartTime || '')
    const end = String(latestMeta.end_time || latestMeta.match_end_time || latestMeta.matchEndTime || '')
    const isFinished = toBoolean(latestMeta.is_finished) ?? true
    const matchVictory = toBoolean(latestMeta.match_victory ?? latestMeta.matchVictory ?? latestMeta.victory)
    const score = deriveScore(latestMeta, sorted)
    const flowSequence = parseMatchFlow(latestMeta, sorted)
    const exactTotalDays = Math.max(0, score.wins + score.losses)
    const inferredDay = toNumber(latestMeta.match_days ?? latestMeta.matchDays) ?? 0
    const lastDay = Math.max(
      exactTotalDays,
      exactTotalDays > 0 ? 0 : Math.max(...sorted.map((x) => Math.max(0, Number(x.dayIndex || 0))), 0),
      exactTotalDays > 0 ? 0 : Math.max(0, Math.round(inferredDay))
    )
    const matchId = String(latestMeta.match_id || latestMeta.matchId || '').trim()
    const matchTitle = String(latestMeta.match_title || latestMeta.matchTitle || '').trim()

    return {
      key,
      matchId,
      matchTitle,
      authorUserId: latest.authorUserId,
      authorName: user?.nickname || latest.authorName || '匿名',
      hero,
      gameDate: formatDate(date),
      startTime: formatTime(start),
      endTime: formatTime(end),
      isFinished,
      matchVictory,
      wins: score.wins,
      losses: score.losses,
      flowSequence,
      lastDay,
      latestBattle: latest,
      battles: sorted,
    }
  })

  return summaries.sort((a, b) => {
    const ta = +new Date(a.latestBattle.createdAt || a.latestBattle.playedOn)
    const tb = +new Date(b.latestBattle.createdAt || b.latestBattle.playedOn)
    return tb - ta
  })
}

function buildDisplayRows(summary: MatchSummary): DisplayBattleRow[] {
  const byDay = new Map<number, CommunityGameRecord>()
  summary.battles.forEach((battle) => {
    const day = Math.max(1, Number(battle.dayIndex || 0))
    if (!day || byDay.has(day)) return
    byDay.set(day, battle)
  })

  const expectedDays = Math.max(
    0,
    Number(summary.wins || 0) + Number(summary.losses || 0),
    Number(summary.flowSequence.length || 0),
    Number(summary.lastDay || 0)
  )

  if (expectedDays <= 0) {
    return [...summary.battles].map((battle) => ({
      day: Math.max(1, Number(battle.dayIndex || 1)),
      result: battle.result === 'win' ? 'win' : 'lose',
      battle,
    }))
  }

  const rows: DisplayBattleRow[] = []
  for (let day = expectedDays; day >= 1; day -= 1) {
    const battle = byDay.get(day) || null
    const flowResult = summary.flowSequence[day - 1] || null
    const result = battle ? (battle.result === 'win' ? 'win' : 'lose') : flowResult
    rows.push({ day, result, battle })
  }
  return rows
}

export default function MatchRecordsCenterPanel({
  records,
  total,
  loading,
  loadingMore,
  hasMore,
  selectedRecordId,
  usersById,
  currentUserId = '',
  onlyMine = false,
  onSelectRecord,
  onLoadMore,
  onUpdateMatchTitle,
}: MatchRecordsCenterPanelProps) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [editingTitleKey, setEditingTitleKey] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [savingTitleKey, setSavingTitleKey] = useState<string | null>(null)

  const summaries = useMemo(() => buildSummaries(records, usersById), [records, usersById])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>对局记录</h2>
        <span className={styles.count}>{summaries.length} 局 / {total || summaries.length} 局</span>
      </div>
      <div
        ref={boxRef}
        className={styles.list}
        onScroll={(e) => {
          const el = e.currentTarget
          if (!hasMore || loadingMore) return
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) onLoadMore()
        }}
      >
        {loading && summaries.length === 0 && <div className={styles.empty}>加载中...</div>}
        {!loading && summaries.length === 0 && <div className={styles.empty}>没有符合条件的对局记录</div>}

        {summaries.map((summary) => {
          const open = expanded.has(summary.key)
          const heroAvatar = heroAvatarUrl(summary.hero.toLowerCase())
          const statusText = !summary.isFinished
            ? '进行中'
            : summary.matchVictory === true
              ? '胜利收官'
              : summary.matchVictory === false
                ? '失败收官'
                : (summary.wins > summary.losses ? '优势收官' : '惜败收官')
          const flowList = summary.flowSequence
          const latest = summary.latestBattle
          const canEditTitle = onlyMine && !!currentUserId && currentUserId === summary.authorUserId && !!summary.matchId && !!onUpdateMatchTitle
          const displayTitle = summary.matchTitle || `${summary.hero} · Day${summary.lastDay} · ${summary.wins}胜${summary.losses}负`
          return (
            <div key={summary.key} className={`${styles.card} ${open ? styles.cardOpen : ''}`}>
              <button
                className={styles.cardHead}
                onClick={() => {
                  setExpanded((prev) => {
                    const next = new Set(prev)
                    if (next.has(summary.key)) next.delete(summary.key)
                    else next.add(summary.key)
                    return next
                  })
                  onSelectRecord(latest)
                }}
              >
                <div className={styles.cardLeft}>
                  <div className={styles.heroAvatarWrap}>
                    <img src={heroAvatar} alt={summary.hero} className={styles.heroAvatar} />
                  </div>
                  <div className={styles.titleBlock}>
                    <div className={styles.cardTitle}>{displayTitle}</div>
                    <div className={styles.cardSub}>
                      {summary.authorName} · {summary.gameDate} {summary.startTime} · {statusText}
                    </div>
                    <div className={styles.flowRow}>
                      {flowList.map((b, idx) => (
                        <span key={`${summary.key}-flow-${idx}`} className={`${styles.flowDot} ${b === 'win' ? styles.flowWin : styles.flowLose}`} title={b === 'win' ? '胜利' : '失败'}>
                          {b === 'win' ? '✓' : '✗'}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className={styles.cardRight}>
                  <span className={styles.arrow}>{open ? '▴' : '▾'}</span>
                </div>
              </button>

              {open && (
                <div className={styles.cardBody}>
                  {canEditTitle && (
                    <div className={styles.titleEditRow}>
                      {editingTitleKey === summary.key ? (
                        <>
                          <input
                            className={styles.titleEditInput}
                            value={titleDraft}
                            maxLength={60}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            placeholder="输入这局的标题（如核心卡）"
                          />
                          <button
                            className={styles.titleActionBtn}
                            disabled={savingTitleKey === summary.key}
                            onClick={async () => {
                              if (!onUpdateMatchTitle) return
                              setSavingTitleKey(summary.key)
                              const ok = await onUpdateMatchTitle(summary.matchId, titleDraft.trim())
                              setSavingTitleKey(null)
                              if (ok) {
                                setEditingTitleKey(null)
                                setTitleDraft('')
                              }
                            }}
                          >
                            {savingTitleKey === summary.key ? '保存中...' : '保存'}
                          </button>
                          <button
                            className={styles.titleActionBtnGhost}
                            onClick={() => {
                              setEditingTitleKey(null)
                              setTitleDraft('')
                            }}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={styles.titleHint}>对局标题：{summary.matchTitle || '未设置'}</span>
                          <button
                            className={styles.titleActionBtn}
                            onClick={() => {
                              setEditingTitleKey(summary.key)
                              setTitleDraft(summary.matchTitle || '')
                            }}
                          >
                            编辑标题
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {buildDisplayRows(summary).map((row) => {
                    const battle = row.battle
                    const isPlaceholder = !battle
                    const result = row.result
                    if (isPlaceholder) {
                      return (
                        <div key={`${summary.key}-placeholder-${row.day}`} className={styles.battleBlock}>
                          <div className={`${styles.battleRow} ${styles.battleRowPlaceholder}`}>
                            <span className={styles.battleDay}>DAY {row.day}</span>
                            <span
                              className={`${styles.battleResult} ${
                                result === 'win' ? styles.battleWin : result === 'lose' ? styles.battleLose : ''
                              }`}
                            >
                              {result === 'win' ? '胜利' : result === 'lose' ? '失败' : '--'}
                            </span>
                            <span className={styles.battleTime}>--:--</span>
                            <span className={styles.battleDuration}>--</span>
                            <div className={styles.noShot}>无上传记录</div>
                          </div>
                        </div>
                      )
                    }

                    const meta = asObject(battle.meta)
                    const selfCards = getBattleCards(meta, false)
                    const enemyCards = getBattleCards(meta, true)
                    const duration = toNumber(meta.duration)
                    const battleTime = formatTime(meta.battle_start_time || meta.start_time || battle.createdAt)
                    const hasShot = !!String(battle.screenshotUrl || '').trim()
                    return (
                      <div key={battle.id} className={styles.battleBlock}>
                        <div
                          className={`${styles.battleRow} ${selectedRecordId === battle.id ? styles.battleRowActive : ''}`}
                          onClick={() => onSelectRecord(battle)}
                        >
                          <span className={styles.battleDay}>DAY {battle.dayIndex}</span>
                          <span className={`${styles.battleResult} ${battle.result === 'win' ? styles.battleWin : styles.battleLose}`}>
                            {battle.result === 'win' ? '胜利' : '失败'}
                          </span>
                          <span className={styles.battleTime}>{battleTime}</span>
                          <span className={styles.battleDuration}>{duration != null ? `${duration.toFixed(1)}s` : '--'}</span>
                          {hasShot ? (
                            <RecordScreenshotImage
                              src={battle.screenshotUrl}
                              alt={`day${battle.dayIndex}`}
                              className={styles.battleShot}
                              onClick={(event) => {
                                event.stopPropagation()
                                const openUrl = resolveScreenshotOpenUrl(battle.screenshotUrl)
                                setPreviewImage(openUrl || battle.screenshotUrl)
                              }}
                            />
                          ) : (
                            <div className={styles.noShot}>无截图</div>
                          )}
                        </div>

                        {(selfCards.length > 0 || enemyCards.length > 0) && (
                          <div className={styles.lineupWrap}>
                            {selfCards.length > 0 && (
                              <div className={styles.lineupGroup}>
                                <div className={styles.lineupLabel}>我方阵容</div>
                                <div className={styles.lineupRow}>
                                  {selfCards.map((card, idx) => (
                                    <img
                                      key={`${battle.id}-self-${idx}-${card.template_id || card.image || idx}`}
                                      src={cardImageUrl(card)}
                                      alt={card.name_cn || card.name_en || card.template_id || ''}
                                      className={styles.lineupCard}
                                      title={card.name_cn || card.name_en || card.template_id || ''}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                            {enemyCards.length > 0 && (
                              <div className={styles.lineupGroup}>
                                <div className={styles.lineupLabel}>对手阵容</div>
                                <div className={styles.lineupRow}>
                                  {enemyCards.map((card, idx) => (
                                    <img
                                      key={`${battle.id}-enemy-${idx}-${card.template_id || card.image || idx}`}
                                      src={cardImageUrl(card)}
                                      alt={card.name_cn || card.name_en || card.template_id || ''}
                                      className={styles.lineupCard}
                                      title={card.name_cn || card.name_en || card.template_id || ''}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {hasMore && (
          <button className={styles.loadMoreBtn} onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? '加载中...' : '加载更多'}
          </button>
        )}
      </div>

      {previewImage && (
        <div className={styles.previewMask} onClick={() => setPreviewImage(null)}>
          <div className={styles.previewInner} onClick={(e) => e.stopPropagation()}>
            <button className={styles.previewClose} onClick={() => setPreviewImage(null)}>×</button>
            <RecordScreenshotImage src={previewImage} alt="battle-preview" className={styles.previewImage} />
          </div>
        </div>
      )}
    </div>
  )
}
