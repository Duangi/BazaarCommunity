'use client'

import { CommunityPublicUser } from '@/lib/communityBuilds'
import { heroAvatarUrl } from '@/lib/cdn'
import styles from './PlayerDirectoryPanel.module.css'

const HERO_OPTIONS = [
  { val: '', label: '全部', avatar: '' },
  { val: 'Pygmalien', label: '皮格马利翁', avatar: heroAvatarUrl('pygmalien') },
  { val: 'Jules', label: '朱尔斯', avatar: heroAvatarUrl('jules') },
  { val: 'Vanessa', label: '瓦内莎', avatar: heroAvatarUrl('vanessa') },
  { val: 'Mak', label: '马克', avatar: heroAvatarUrl('mak') },
  { val: 'Dooley', label: '多利', avatar: heroAvatarUrl('dooley') },
  { val: 'Stelle', label: '斯黛拉', avatar: heroAvatarUrl('stelle') },
] as const

interface PlayerDirectoryPanelProps {
  users: CommunityPublicUser[]
  heroFilter: string
  currentUserId?: string
  followingUserIds: string[]
  onChangeHeroFilter: (hero: string) => void
  onToggleFollow: (targetUserId: string, enabled: boolean) => void
  onOpenUserRecords: (user: CommunityPublicUser) => void
}

export default function PlayerDirectoryPanel({
  users,
  heroFilter,
  currentUserId = '',
  followingUserIds,
  onChangeHeroFilter,
  onToggleFollow,
  onOpenUserRecords,
}: PlayerDirectoryPanelProps) {
  const followingSet = new Set(followingUserIds)
  const filtered = users
    .filter((u) => (heroFilter ? Array.isArray(u.mainHeroes) && u.mainHeroes.includes(heroFilter) : true))
    .sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0))

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h3 className={styles.title}>关注列表</h3>
        <span className={styles.count}>{filtered.length} 位玩家</span>
      </div>
      <div className={styles.heroRow}>
        {HERO_OPTIONS.map((opt) => (
          <button
            key={`hero-filter-${opt.val || 'all'}`}
            className={`${styles.heroBtn} ${heroFilter === opt.val ? styles.heroBtnActive : ''}`}
            onClick={() => onChangeHeroFilter(opt.val)}
            title={opt.label}
          >
            {opt.avatar ? <img src={opt.avatar} alt={opt.label} className={styles.heroAvatar} /> : '全'}
          </button>
        ))}
      </div>
      <div className={styles.list}>
        {filtered.map((user) => {
          const canFollow = !!currentUserId && user.userId !== currentUserId
          const followed = followingSet.has(user.userId)
          return (
            <div key={user.userId} className={styles.userCard}>
              <button className={styles.userMain} onClick={() => onOpenUserRecords(user)}>
                  <img
                    src={heroAvatarUrl((user.mainHeroes?.[0] || 'Pygmalien').toLowerCase())}
                    alt={user.mainHeroes?.join(',') || 'Pygmalien'}
                    className={styles.userHero}
                  />
                  <div className={styles.userMeta}>
                    <div className={styles.userName}>{user.nickname}</div>
                    <div className={styles.userSub}>
                      主玩 {(user.mainHeroes || ['Pygmalien']).join(' / ')} · 粉丝 {user.followersCount || 0}
                    </div>
                  </div>
                </button>
              {canFollow && (
                <button
                  className={`${styles.followBtn} ${followed ? styles.followedBtn : ''}`}
                  onClick={() => onToggleFollow(user.userId, !followed)}
                >
                  {followed ? '已关注' : '关注'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
