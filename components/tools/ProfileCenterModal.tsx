'use client'

import { useEffect, useMemo, useState } from 'react'
import { CommunityGameRecord, CommunityPublicUser } from '@/lib/communityBuilds'
import { heroAvatarUrl } from '@/lib/cdn'
import RecordScreenshotImage from '@/components/tools/RecordScreenshotImage'
import { resolveScreenshotOpenUrl } from '@/lib/recordScreenshot'
import styles from './ProfileCenterModal.module.css'

const HERO_OPTIONS = [
  { val: 'Pygmalien', label: '皮格马利翁', avatar: heroAvatarUrl('pygmalien') },
  { val: 'Jules', label: '朱尔斯', avatar: heroAvatarUrl('jules') },
  { val: 'Vanessa', label: '瓦内莎', avatar: heroAvatarUrl('vanessa') },
  { val: 'Mak', label: '马克', avatar: heroAvatarUrl('mak') },
  { val: 'Dooley', label: '多利', avatar: heroAvatarUrl('dooley') },
  { val: 'Stelle', label: '斯黛拉', avatar: heroAvatarUrl('stelle') },
  { val: 'Karnok', label: 'Karnok', avatar: heroAvatarUrl('karnok') },
] as const

type ProfileDraft = {
  nickname: string
  useBilibili: boolean
  bilibiliUid: string
  mainHeroes: string[]
}

interface ProfileCenterModalProps {
  open: boolean
  onClose: () => void
  profile: ProfileDraft
  followersCount: number
  followingUsers: CommunityPublicUser[]
  onSaveProfile: (draft: ProfileDraft) => Promise<boolean>
  onLoadUserRecords: (userId: string) => Promise<CommunityGameRecord[]>
}

export default function ProfileCenterModal({
  open,
  onClose,
  profile,
  followersCount,
  followingUsers,
  onSaveProfile,
  onLoadUserRecords,
}: ProfileCenterModalProps) {
  const [tab, setTab] = useState<'profile' | 'following'>('profile')
  const [draft, setDraft] = useState<ProfileDraft>(profile)
  const [saving, setSaving] = useState(false)
  const [hint, setHint] = useState('')
  const [selectedFollowingId, setSelectedFollowingId] = useState('')
  const [records, setRecords] = useState<CommunityGameRecord[]>([])
  const [loadingRecords, setLoadingRecords] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(profile)
  }, [open, profile.nickname, profile.useBilibili, profile.bilibiliUid, profile.mainHeroes])

  useEffect(() => {
    if (!hint) return
    const t = window.setTimeout(() => setHint(''), 1800)
    return () => window.clearTimeout(t)
  }, [hint])

  useEffect(() => {
    if (!open || tab !== 'following') return
    if (!selectedFollowingId && followingUsers.length > 0) {
      setSelectedFollowingId(followingUsers[0].userId)
      return
    }
    if (!selectedFollowingId) {
      setRecords([])
      return
    }
    setLoadingRecords(true)
    onLoadUserRecords(selectedFollowingId)
      .then((list) => setRecords(list))
      .finally(() => setLoadingRecords(false))
  }, [open, tab, selectedFollowingId, followingUsers, onLoadUserRecords])

  const selectedUser = useMemo(
    () => followingUsers.find((u) => u.userId === selectedFollowingId) || null,
    [followingUsers, selectedFollowingId]
  )

  const save = async () => {
    const nickname = draft.nickname.trim()
    if (!nickname) {
      setHint('昵称不能为空')
      return
    }
    setSaving(true)
    const ok = await onSaveProfile({
      nickname,
      useBilibili: draft.useBilibili,
      bilibiliUid: draft.useBilibili ? draft.bilibiliUid.trim() : '',
      mainHeroes: Array.isArray(draft.mainHeroes) && draft.mainHeroes.length > 0 ? draft.mainHeroes : ['Pygmalien'],
    })
    setSaving(false)
    setHint(ok ? '已保存' : '保存失败')
  }

  if (!open) return null

  return (
    <div className={styles.mask} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>个人主页</h3>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <div className={styles.tabRow}>
          <button className={tab === 'profile' ? styles.tabActive : ''} onClick={() => setTab('profile')}>资料设置</button>
          <button className={tab === 'following' ? styles.tabActive : ''} onClick={() => setTab('following')}>我的关注</button>
        </div>
        {tab === 'profile' ? (
          <div className={styles.body}>
            <div className={styles.formRow}>
              <label>昵称</label>
              <input
                value={draft.nickname}
                maxLength={24}
                onChange={(e) => setDraft((p) => ({ ...p, nickname: e.target.value }))}
                placeholder="输入昵称"
              />
            </div>
            <div className={styles.formRow}>
              <label>是否B站UP主</label>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={draft.useBilibili}
                  onChange={(e) => setDraft((p) => ({ ...p, useBilibili: e.target.checked }))}
                />
                <span>启用</span>
              </label>
            </div>
            <div className={styles.formRow}>
              <label>B站用户ID</label>
              <input
                value={draft.bilibiliUid}
                disabled={!draft.useBilibili}
                onChange={(e) => setDraft((p) => ({ ...p, bilibiliUid: e.target.value }))}
                placeholder="例如 251954263"
              />
            </div>
            <div className={styles.formRow}>
              <label>主玩英雄（可多选）</label>
              <div className={styles.heroRow}>
                {HERO_OPTIONS.map((hero) => (
                  <button
                    key={`profile-hero-${hero.val}`}
                    className={`${styles.heroBtn} ${draft.mainHeroes.includes(hero.val) ? styles.heroBtnActive : ''}`}
                    onClick={() => setDraft((p) => {
                      const has = p.mainHeroes.includes(hero.val)
                      const next = has ? p.mainHeroes.filter((x) => x !== hero.val) : [...p.mainHeroes, hero.val]
                      return { ...p, mainHeroes: next.length > 0 ? next : [hero.val] }
                    })}
                    title={hero.label}
                  >
                    <img src={hero.avatar} alt={hero.label} />
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.statLine}>粉丝数：{followersCount}</div>
            <div className={styles.footer}>
              <button className={styles.saveBtn} onClick={save} disabled={saving}>
                {saving ? '保存中...' : '保存资料'}
              </button>
              {hint && <span className={styles.hint}>{hint}</span>}
            </div>
          </div>
        ) : (
          <div className={styles.followLayout}>
            <div className={styles.followList}>
              {followingUsers.length === 0 && <div className={styles.empty}>暂无关注用户</div>}
              {followingUsers.map((user) => (
                <button
                  key={`following-${user.userId}`}
                  className={`${styles.followUserBtn} ${selectedFollowingId === user.userId ? styles.followUserBtnActive : ''}`}
                  onClick={() => setSelectedFollowingId(user.userId)}
                >
                  <img
                    src={heroAvatarUrl((user.mainHeroes?.[0] || 'Pygmalien').toLowerCase())}
                    alt={(user.mainHeroes || ['Pygmalien']).join('/')}
                  />
                  <div>
                    <div>{user.nickname}</div>
                    <div className={styles.followSub}>主玩 {(user.mainHeroes || ['Pygmalien']).join(' / ')}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className={styles.recordsPane}>
              <div className={styles.recordsTitle}>
                {selectedUser ? `${selectedUser.nickname} 的战绩截图` : '选择一个关注用户查看战绩'}
              </div>
              {loadingRecords ? (
                <div className={styles.empty}>加载中...</div>
              ) : records.length === 0 ? (
                <div className={styles.empty}>暂无战绩</div>
              ) : (
                <div className={styles.recordsGrid}>
                  {records.map((record) => (
                    <a key={record.id} href={resolveScreenshotOpenUrl(record.screenshotUrl)} target="_blank" rel="noreferrer" className={styles.recordCard}>
                      <RecordScreenshotImage src={record.screenshotUrl} alt={`${record.authorName}-day${record.dayIndex}`} />
                      <div className={styles.recordMeta}>
                        <span>{record.playedOn}</span>
                        <span>Day{record.dayIndex}</span>
                        <span>{record.result === 'win' ? '胜' : '负'}</span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
