import { openDB } from 'idb'

const DB_NAME = 'bazaar_tools_db'
const DB_VERSION = 1
const STORE = 'kv'
const DRAFTS_KEY = 'tool_drafts_v1'
const LINEUP_SCALE_KEY = 'lineup_board_scale_v1'
const USER_PROFILE_KEY = 'community_user_profile_v1'
const USER_REACTIONS_KEY = 'community_user_reactions_v1'
const FAVORITE_LINEUPS_KEY = 'community_favorite_lineups_v1'
const FAVORITE_RATINGS_KEY = 'community_favorite_ratings_v1'

function readLocal<T = any>(key: string): T | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeLocal(key: string, data: any): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // ignore
  }
}

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    },
  })
}

export async function loadToolDraftsFromDb<T = any[]>(): Promise<T | null> {
  try {
    const db = await getDb()
    const data = await db.get(STORE, DRAFTS_KEY)
    if (data) return data as T
  } catch {
    // ignore and fallback
  }
  return readLocal<T>(DRAFTS_KEY)
}

export async function saveToolDraftsToDb(data: any): Promise<void> {
  writeLocal(DRAFTS_KEY, data)
  try {
    const db = await getDb()
    await db.put(STORE, data, DRAFTS_KEY)
  } catch {
    // ignore
  }
}

export async function loadLineupScaleFromDb(): Promise<number | null> {
  try {
    const db = await getDb()
    const data = await db.get(STORE, LINEUP_SCALE_KEY)
    const n = Number(data)
    return Number.isFinite(n) ? n : null
  } catch {
    const local = readLocal<number>(LINEUP_SCALE_KEY)
    const n = Number(local)
    return Number.isFinite(n) ? n : null
  }
}

export async function saveLineupScaleToDb(scale: number): Promise<void> {
  writeLocal(LINEUP_SCALE_KEY, scale)
  try {
    const db = await getDb()
    await db.put(STORE, scale, LINEUP_SCALE_KEY)
  } catch {
    // ignore
  }
}

export type CommunityUserProfile = {
  nickname: string
  useBilibili: boolean
  bilibiliUid: string
}

export type CommunityUserReactions = Record<string, { liked?: boolean; favorited?: boolean }>

export async function loadCommunityProfileFromDb(): Promise<CommunityUserProfile | null> {
  try {
    const db = await getDb()
    const data = await db.get(STORE, USER_PROFILE_KEY)
    if (data) return data as CommunityUserProfile
  } catch {
    // ignore and fallback to localStorage
  }
  return readLocal<CommunityUserProfile>(USER_PROFILE_KEY)
}

export function loadCommunityProfileFromLocal(): CommunityUserProfile | null {
  return readLocal<CommunityUserProfile>(USER_PROFILE_KEY)
}

export async function saveCommunityProfileToDb(profile: CommunityUserProfile): Promise<void> {
  writeLocal(USER_PROFILE_KEY, profile)
  try {
    const db = await getDb()
    await db.put(STORE, profile, USER_PROFILE_KEY)
  } catch {
    // ignore
  }
}

export async function loadCommunityReactionsFromDb(): Promise<CommunityUserReactions | null> {
  try {
    const db = await getDb()
    const data = await db.get(STORE, USER_REACTIONS_KEY)
    if (data) return data as CommunityUserReactions
  } catch {
    // ignore and fallback
  }
  return readLocal<CommunityUserReactions>(USER_REACTIONS_KEY)
}

export async function saveCommunityReactionsToDb(reactions: CommunityUserReactions): Promise<void> {
  writeLocal(USER_REACTIONS_KEY, reactions)
  try {
    const db = await getDb()
    await db.put(STORE, reactions, USER_REACTIONS_KEY)
  } catch {
    // ignore
  }
}

export async function loadFavoriteLineupIdsFromDb(): Promise<string[] | null> {
  try {
    const db = await getDb()
    const data = await db.get(STORE, FAVORITE_LINEUPS_KEY)
    if (Array.isArray(data)) return data as string[]
  } catch {
    // ignore and fallback
  }
  const local = readLocal<string[]>(FAVORITE_LINEUPS_KEY)
  return Array.isArray(local) ? local : null
}

export async function saveFavoriteLineupIdsToDb(ids: string[]): Promise<void> {
  writeLocal(FAVORITE_LINEUPS_KEY, ids)
  try {
    const db = await getDb()
    await db.put(STORE, ids, FAVORITE_LINEUPS_KEY)
  } catch {
    // ignore
  }
}

export async function loadFavoriteRatingIdsFromDb(): Promise<string[] | null> {
  try {
    const db = await getDb()
    const data = await db.get(STORE, FAVORITE_RATINGS_KEY)
    if (Array.isArray(data)) return data as string[]
  } catch {
    // ignore and fallback
  }
  const local = readLocal<string[]>(FAVORITE_RATINGS_KEY)
  return Array.isArray(local) ? local : null
}

export async function saveFavoriteRatingIdsToDb(ids: string[]): Promise<void> {
  writeLocal(FAVORITE_RATINGS_KEY, ids)
  try {
    const db = await getDb()
    await db.put(STORE, ids, FAVORITE_RATINGS_KEY)
  } catch {
    // ignore
  }
}
