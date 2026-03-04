'use client'

import { CommunityGameRecord, CommunityPublicUser } from '@/lib/communityBuilds'
import { cdnUrl, heroAvatarUrl } from '@/lib/cdn'
import RecordScreenshotImage from '@/components/tools/RecordScreenshotImage'
import { resolveScreenshotOpenUrl } from '@/lib/recordScreenshot'
import styles from './MatchRecordDetailPanel.module.css'

interface MatchRecordDetailPanelProps {
  record: CommunityGameRecord | null
  user?: CommunityPublicUser | null
  currentUserId?: string
  onDeleteRecord?: (record: CommunityGameRecord) => Promise<boolean>
}

type BattleCard = {
  template_id?: string
  name_cn?: string
  name_en?: string
  image?: string
}

function asObject(input: any): Record<string, any> {
  if (input && typeof input === 'object') return input as Record<string, any>
  return {}
}

function cardImageUrl(card: BattleCard): string {
  if (card.image && /^https?:\/\//i.test(card.image)) return card.image
  if (card.image && card.image.startsWith('/')) return card.image
  if (card.template_id) return cdnUrl(`images/${card.template_id}.webp`)
  return ''
}

function pickCards(meta: Record<string, any>, enemy = false): BattleCard[] {
  const key = enemy ? 'enemy_lineup_cards' : 'lineup_cards'
  const altKey = enemy ? 'enemyLineupCards' : 'lineupCards'
  const list = Array.isArray(meta[key]) ? meta[key] : Array.isArray(meta[altKey]) ? meta[altKey] : []
  return list
    .map((x: any) => ({
      template_id: x?.template_id || x?.templateId || '',
      name_cn: x?.name_cn || x?.nameCn || '',
      name_en: x?.name_en || x?.nameEn || '',
      image: x?.image || '',
    }))
    .filter((x: BattleCard) => !!x.template_id || !!x.image)
}

export default function MatchRecordDetailPanel({
  record,
  user,
  currentUserId = '',
  onDeleteRecord,
}: MatchRecordDetailPanelProps) {
  if (!record) {
    return (
      <div className={styles.panel}>
        <div className={styles.placeholder}>请从中间列表选择一场对局或某一天详情</div>
      </div>
    )
  }

  const meta = asObject(record.meta)
  const hero = String(meta.hero || user?.mainHeroes?.[0] || 'Pygmalien')
  const duration = Number(meta.duration || 0)
  const selfCards = pickCards(meta, false)
  const enemyCards = pickCards(meta, true)
  const canDelete = !!currentUserId && currentUserId === record.authorUserId
  const openUrl = resolveScreenshotOpenUrl(record.screenshotUrl)

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.nameRow}>
          <span>{user?.nickname || record.authorName || '匿名'}</span>
          <img src={heroAvatarUrl(hero.toLowerCase())} alt={hero} className={styles.heroAvatar} />
        </div>
        <div className={styles.sub}>
          {record.playedOn} · Day{record.dayIndex} · {record.result === 'win' ? '胜利' : '失败'}
          {Number.isFinite(duration) && duration > 0 ? ` · ${duration.toFixed(1)}s` : ''}
        </div>
      </div>

      <RecordScreenshotImage src={record.screenshotUrl} alt={`${record.authorName}-detail`} className={styles.image} />

      {(selfCards.length > 0 || enemyCards.length > 0) && (
        <div className={styles.lineupWrap}>
          {selfCards.length > 0 && (
            <div className={styles.lineupGroup}>
              <div className={styles.lineupTitle}>我方阵容</div>
              <div className={styles.lineupRow}>
                {selfCards.map((card, idx) => (
                  <img
                    key={`detail-self-${idx}-${card.template_id || card.image || idx}`}
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
              <div className={styles.lineupTitle}>对手阵容</div>
              <div className={styles.lineupRow}>
                {enemyCards.map((card, idx) => (
                  <img
                    key={`detail-enemy-${idx}-${card.template_id || card.image || idx}`}
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

      {record.note && <div className={styles.note}>{record.note}</div>}
      <div className={styles.actionRow}>
        <a href={openUrl} target="_blank" rel="noreferrer" className={styles.openBtn}>
          打开原图
        </a>
        {canDelete && (
          <button
            className={styles.deleteBtn}
            onClick={async () => {
              if (!onDeleteRecord) return
              await onDeleteRecord(record)
            }}
          >
            删除本条
          </button>
        )}
      </div>
    </div>
  )
}
