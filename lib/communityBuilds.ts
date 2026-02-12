export type BuildCardRole = 'core' | 'sub' | 'tech'

export type BuildCardData = {
  id: string
  role: BuildCardRole
  pos: number
}

export type CommunityBuild = {
  id: string
  name: string
  hero: string
  dayPlanTag?: '连胜早走' | '北伐阵容'
  strengthTag?: '版本强势' | '中规中矩' | '地沟油'
  difficultyTag?: '容易成型' | '比较困难' | '极难成型'
  dayFrom: number
  dayTo: number
  version: string
  likes: number
  favorites?: number
  rating: number
  publishedAt: string
  cards_data: BuildCardData[]
  notes?: string
  authorName?: string
  authorBilibiliUid?: string
  videoBv?: string
  videoTitle?: string
  snapshot?: any
  specialSlots?: Array<{ slot: number; type: 'fire' | 'ice' }>
}

export type CommunityRatingShare = {
  id: string
  name: string
  likes: number
  favorites?: number
  publishedAt: string
  authorName?: string
  authorBilibiliUid?: string
  ratingPayload: any
}

const HEROES = ['Pygmalien', 'Jules', 'Vanessa', 'Mak', 'Dooley', 'Stelle']

function pick<T>(arr: T[], idx: number): T {
  return arr[idx % arr.length]
}

export function createMockBuildsFromItems(items: any[]): CommunityBuild[] {
  if (!Array.isArray(items) || items.length === 0) return []
  const itemIds = items.map((i) => i.id).filter(Boolean)
  const total = Math.min(18, Math.max(8, Math.floor(itemIds.length / 80)))
  const builds: CommunityBuild[] = []
  for (let i = 0; i < total; i += 1) {
    const hero = pick(HEROES, i)
    const dayFrom = i % 2 === 0 ? 1 : 3
    const dayTo = i % 3 === 0 ? 13 : 10
    const base = (i * 7) % itemIds.length
    const cards = Array.from({ length: 7 }).map((_, k) => {
      const id = itemIds[(base + k * 3) % itemIds.length]
      let role: BuildCardRole = 'tech'
      if (k < 2) role = 'core'
      else if (k < 4) role = 'sub'
      return { id, role, pos: k + 1 }
    })

    builds.push({
      id: `mock-${i + 1}`,
      name: `${hero} Day${dayFrom}-${dayTo} 构筑 ${i + 1}`,
      hero,
      dayPlanTag: i % 2 === 0 ? '连胜早走' : '北伐阵容',
      strengthTag: i % 3 === 0 ? '版本强势' : i % 3 === 1 ? '中规中矩' : '地沟油',
      difficultyTag: i % 3 === 0 ? '容易成型' : i % 3 === 1 ? '比较困难' : '极难成型',
      dayFrom,
      dayTo,
      version: i % 2 === 0 ? 'v0.9.2' : 'v0.9.3',
      likes: 20 + ((i * 13) % 230),
      favorites: 5 + ((i * 9) % 100),
      rating: 3.8 + ((i * 7) % 12) / 10,
      publishedAt: new Date(Date.now() - i * 86400000).toISOString(),
      cards_data: cards,
      notes: '示例社区构筑（本地数据）',
      authorName: `${hero}玩家`,
      authorBilibiliUid: i % 2 === 0 ? `10${i}9524263` : '',
      videoBv: i % 2 === 0 ? 'BV1fW6zB6EwP' : '',
      videoTitle: i % 2 === 0 ? `第${i + 1}期构筑讲解` : '',
      snapshot: null,
    })
  }
  return builds
}

export function createMockRatingsFromItems(items: any[]): CommunityRatingShare[] {
  if (!Array.isArray(items) || items.length === 0) return []
  const top = items.slice(0, 12)
  return Array.from({ length: 8 }).map((_, idx) => ({
    id: `mock-rating-${idx + 1}`,
    name: `社区评分样例 ${idx + 1}`,
    likes: 10 + idx * 7,
    favorites: 3 + idx * 4,
    publishedAt: new Date(Date.now() - idx * 3600 * 1000 * 18).toISOString(),
    authorName: `评分作者${idx + 1}`,
    authorBilibiliUid: idx % 2 === 0 ? `25195${400 + idx}` : '',
    ratingPayload: {
      currentPreset: {
        id: 'default',
        name: '默认预设',
        tiers: [
          { id: 'S', name: 'S', color: '#ff4757' },
          { id: 'A', name: 'A', color: '#ffa502' },
          { id: 'B', name: 'B', color: '#1e90ff' },
          { id: 'C', name: 'C', color: '#2ed573' },
        ],
      },
      ratedItems: {
        S: top.slice(0, 2).map((x) => ({ id: x.id, name_cn: x.name_cn || x.name_en })),
        A: top.slice(2, 6).map((x) => ({ id: x.id, name_cn: x.name_cn || x.name_en })),
      },
    },
  }))
}
