'use client'

import { useMemo, useState } from 'react'
import WikiFilterPanel from '@/components/tools/WikiFilterPanel'
import { CommunityPublicUser } from '@/lib/communityBuilds'
import { heroAvatarUrl } from '@/lib/cdn'
import styles from './MatchRecordsLeftPanel.module.css'

const HERO_OPTIONS = [
  { val: '', label: '全部', avatar: '' },
  { val: 'Pygmalien', label: '皮格马利翁', avatar: heroAvatarUrl('pygmalien') },
  { val: 'Jules', label: '朱尔斯', avatar: heroAvatarUrl('jules') },
  { val: 'Vanessa', label: '瓦内莎', avatar: heroAvatarUrl('vanessa') },
  { val: 'Mak', label: '马克', avatar: heroAvatarUrl('mak') },
  { val: 'Dooley', label: '多利', avatar: heroAvatarUrl('dooley') },
  { val: 'Stelle', label: '斯黛拉', avatar: heroAvatarUrl('stelle') },
] as const

type MatchRecordFilters = {
  onlyFollowing: boolean
  uploaderMainHero: string
  uploaderUserId: string
}

interface MatchRecordsLeftPanelProps {
  items: any[]
  skills: any[]
  recordFilters: MatchRecordFilters
  currentUserId?: string
  followingUsers: CommunityPublicUser[]
  allUsers: CommunityPublicUser[]
  followingUserIds: string[]
  onChangeRecordFilters: (next: MatchRecordFilters) => void
  onToggleFollowUser: (targetUserId: string, enabled: boolean) => void
  onSelectItem: (item: any) => void
}

const PAGE_SIZE = 20

export default function MatchRecordsLeftPanel({
  items,
  skills,
  recordFilters,
  currentUserId = '',
  followingUsers,
  allUsers,
  followingUserIds,
  onChangeRecordFilters,
  onToggleFollowUser,
  onSelectItem,
}: MatchRecordsLeftPanelProps) {
  const [keyword, setKeyword] = useState('')
  const [heroFilter, setHeroFilter] = useState('')
  const [sort, setSort] = useState<'followers' | 'name'>('followers')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const followingSet = useMemo(() => new Set(followingUserIds), [followingUserIds])
  const filteredUsers = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    let result = allUsers.filter((u) => {
      const byName = !q || (u.nickname || '').toLowerCase().includes(q) || (u.gameUsername || '').toLowerCase().includes(q)
      const byHero = !heroFilter || (u.mainHeroes || []).includes(heroFilter)
      return byName && byHero
    })
    if (sort === 'followers') {
      result = result.sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0))
    } else {
      result = result.sort((a, b) => (a.nickname || '').localeCompare(b.nickname || ''))
    }
    return result
  }, [allUsers, keyword, heroFilter, sort])

  const visibleUsers = filteredUsers.slice(0, visibleCount)

  return (
    <div className={styles.stack}>
      <div className={styles.panel}>
        <div className={styles.title}>对局筛选</div>
        <div className={styles.row}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={recordFilters.onlyFollowing}
              onChange={(e) => onChangeRecordFilters({ ...recordFilters, onlyFollowing: e.target.checked })}
            />
            <span>仅关注玩家</span>
          </label>
        </div>
        <div className={styles.rowLabel}>上传者主玩英雄</div>
        <div className={styles.heroRow}>
          {HERO_OPTIONS.map((opt) => (
            <button
              key={`match-hero-${opt.val || 'all'}`}
              className={`${styles.heroBtn} ${recordFilters.uploaderMainHero === opt.val ? styles.heroBtnActive : ''}`}
              onClick={() => onChangeRecordFilters({ ...recordFilters, uploaderMainHero: opt.val })}
              title={opt.label}
            >
              {opt.avatar ? <img src={opt.avatar} alt={opt.label} /> : '全'}
            </button>
          ))}
        </div>
        <div className={styles.row}>
          <div className={styles.rowLabel}>关注列表</div>
          {recordFilters.uploaderUserId && (
            <button className={styles.clearBtn} onClick={() => onChangeRecordFilters({ ...recordFilters, uploaderUserId: '' })}>
              清除指定玩家
            </button>
          )}
        </div>
        <div className={styles.followingList}>
          {followingUsers.length === 0 && <div className={styles.empty}>暂无关注</div>}
          {followingUsers.map((u) => (
            <button
              key={`my-follow-${u.userId}`}
              className={`${styles.followingItem} ${recordFilters.uploaderUserId === u.userId ? styles.followingItemActive : ''}`}
              onClick={() => onChangeRecordFilters({ ...recordFilters, uploaderUserId: u.userId })}
            >
              <img src={heroAvatarUrl((u.mainHeroes?.[0] || 'pygmalien').toLowerCase())} alt={u.nickname} />
              <span>{u.nickname}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.title}>玩家库</div>
        <div className={styles.searchRow}>
          <input
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              setVisibleCount(PAGE_SIZE)
            }}
            placeholder="按昵称搜索"
          />
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as 'followers' | 'name')
              setVisibleCount(PAGE_SIZE)
            }}
          >
            <option value="followers">按粉丝排序</option>
            <option value="name">按名字排序</option>
          </select>
        </div>
        <div className={styles.heroRow}>
          {HERO_OPTIONS.map((opt) => (
            <button
              key={`userlib-hero-${opt.val || 'all'}`}
              className={`${styles.heroBtn} ${heroFilter === opt.val ? styles.heroBtnActive : ''}`}
              onClick={() => {
                setHeroFilter(opt.val)
                setVisibleCount(PAGE_SIZE)
              }}
              title={opt.label}
            >
              {opt.avatar ? <img src={opt.avatar} alt={opt.label} /> : '全'}
            </button>
          ))}
        </div>
        <div className={styles.userList}>
          {visibleUsers.map((u) => {
            const canFollow = !!currentUserId && u.userId !== currentUserId
            const followed = followingSet.has(u.userId)
            return (
              <div key={`userlib-${u.userId}`} className={styles.userItem}>
                <button
                  className={styles.userMain}
                  onClick={() => onChangeRecordFilters({ ...recordFilters, uploaderUserId: u.userId })}
                >
                  <img src={heroAvatarUrl((u.mainHeroes?.[0] || 'pygmalien').toLowerCase())} alt={u.nickname} />
                  <div>
                    <div className={styles.userName}>{u.nickname}</div>
                    <div className={styles.userSub}>主玩 {(u.mainHeroes || ['Pygmalien']).join(' / ')} · 粉丝 {u.followersCount || 0}</div>
                  </div>
                </button>
                {canFollow && (
                  <button
                    className={`${styles.followBtn} ${followed ? styles.followedBtn : ''}`}
                    onClick={() => onToggleFollowUser(u.userId, !followed)}
                  >
                    {followed ? '已关注' : '关注'}
                  </button>
                )}
              </div>
            )
          })}
          {visibleUsers.length < filteredUsers.length && (
            <button className={styles.loadBtn} onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
              加载更多玩家
            </button>
          )}
        </div>
      </div>

      <div className={styles.wikiWrap}>
        <WikiFilterPanel
          items={items}
          skills={skills}
          onSelectItem={onSelectItem}
        />
      </div>
    </div>
  )
}
