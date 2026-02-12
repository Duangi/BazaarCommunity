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
  rating: number
  publishedAt: string
  cards_data: BuildCardData[]
  notes?: string
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
      rating: 3.8 + ((i * 7) % 12) / 10,
      publishedAt: new Date(Date.now() - i * 86400000).toISOString(),
      cards_data: cards,
      notes: '示例社区构筑（本地数据）',
    })
  }
  return builds
}
