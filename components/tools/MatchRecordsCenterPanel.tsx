'use client'

import { useMemo, useRef, useState } from 'react'
import { CommunityGameRecord, CommunityPublicUser } from '@/lib/communityBuilds'
import { cdnUrl, heroAvatarUrl } from '@/lib/cdn'
import RecordScreenshotImage from '@/components/tools/RecordScreenshotImage'
import styles from './MatchRecordsCenterPanel.module.css'

interface MatchRecordsCenterPanelProps {
  records: CommunityGameRecord[]
  total: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  selectedRecordId?: string
  usersById: Record<string, CommunityPublicUser>
  onSelectRecord: (record: CommunityGameRecord) => void
  onLoadMore: () => void
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
  authorUserId: string
  authorName: string
  hero: string
  gameDate: string
  startTime: string
  endTime: string
  isFinished: boolean
  wins: number
  losses: number
  lastDay: number
  latestBattle: CommunityGameRecord
  battles: CommunityGameRecord[]
}

function asObject(input: any): Record<string, any> {
  if (input && typeof input === 'object') return input as Record<string, any>
  return {}
}

function toNumber(input: any): number | null {
  const n = Number(input)
  return Number.isFinite(n) ? n : null
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
    const finishedRaw = latestMeta.is_finished
    const isFinished = typeof finishedRaw === 'boolean' ? finishedRaw : true
    const wins = sorted.filter((x) => x.result === 'win').length
    const losses = sorted.length - wins
    const lastDay = sorted.reduce((max, x) => Math.max(max, Number(x.dayIndex || 0)), 0)

    return {
      key,
      authorUserId: latest.authorUserId,
      authorName: user?.nickname || latest.authorName || '匿名',
      hero,
      gameDate: formatDate(date),
      startTime: formatTime(start),
      endTime: formatTime(end),
      isFinished,
      wins,
      losses,
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

export default function MatchRecordsCenterPanel({
  records,
  total,
  loading,
  loadingMore,
  hasMore,
  selectedRecordId,
  usersById,
  onSelectRecord,
  onLoadMore,
}: MatchRecordsCenterPanelProps) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const summaries = useMemo(() => buildSummaries(records, usersById), [records, usersById])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>对局记录</h2>
        <span className={styles.count}>{summaries.length} 局 / {total || records.length} 条</span>
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
          const statusText = summary.isFinished
            ? (summary.losses === 0 ? '全胜' : summary.wins > summary.losses ? '优势收官' : '惜败收官')
            : '进行中'
          const flowList = [...summary.battles]
            .sort((a, b) => a.dayIndex - b.dayIndex)
            .slice(0, 18)
          const latest = summary.latestBattle
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
                    <div className={styles.cardTitle}>
                      {summary.hero} · Day{summary.lastDay} · {summary.wins}胜{summary.losses}负
                    </div>
                    <div className={styles.cardSub}>
                      {summary.authorName} · {summary.gameDate} {summary.startTime} · {statusText}
                    </div>
                    <div className={styles.flowRow}>
                      {flowList.map((b, idx) => (
                        <span key={`${summary.key}-flow-${idx}`} className={`${styles.flowDot} ${b.result === 'win' ? styles.flowWin : styles.flowLose}`} title={`Day${b.dayIndex} ${b.result === 'win' ? '胜利' : '失败'}`}>
                          {b.result === 'win' ? '✓' : '✗'}
                        </span>
                      ))}
                      {summary.battles.length > flowList.length && (
                        <span className={styles.flowMore}>+{summary.battles.length - flowList.length}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className={styles.cardRight}>
                  <RecordScreenshotImage src={latest.screenshotUrl} alt={`${summary.authorName}-Day${summary.lastDay}`} className={styles.latestShot} />
                  <span className={styles.arrow}>{open ? '▴' : '▾'}</span>
                </div>
              </button>

              {open && (
                <div className={styles.cardBody}>
                  {summary.battles.map((battle) => {
                    const meta = asObject(battle.meta)
                    const selfCards = getBattleCards(meta, false)
                    const enemyCards = getBattleCards(meta, true)
                    const duration = toNumber(meta.duration)
                    const battleTime = formatTime(meta.battle_start_time || meta.start_time || battle.createdAt)
                    return (
                      <div key={battle.id} className={styles.battleBlock}>
                        <button
                          className={`${styles.battleRow} ${selectedRecordId === battle.id ? styles.battleRowActive : ''}`}
                          onClick={() => onSelectRecord(battle)}
                        >
                          <span className={styles.battleDay}>DAY {battle.dayIndex}</span>
                          <span className={`${styles.battleResult} ${battle.result === 'win' ? styles.battleWin : styles.battleLose}`}>
                            {battle.result === 'win' ? '胜利' : '失败'}
                          </span>
                          <span className={styles.battleTime}>{battleTime}</span>
                          <span className={styles.battleDuration}>{duration != null ? `${duration.toFixed(1)}s` : '--'}</span>
                          <RecordScreenshotImage src={battle.screenshotUrl} alt={`day${battle.dayIndex}`} className={styles.battleShot} />
                        </button>

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
    </div>
  )
}
