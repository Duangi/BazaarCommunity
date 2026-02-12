import { openDB } from 'idb'

const DB_NAME = 'bazaar_tools_db'
const DB_VERSION = 1
const STORE = 'kv'
const DRAFTS_KEY = 'tool_drafts_v1'
const LINEUP_SCALE_KEY = 'lineup_board_scale_v1'

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
    return (data as T) || null
  } catch {
    return null
  }
}

export async function saveToolDraftsToDb(data: any): Promise<void> {
  try {
    const db = await getDb()
    await db.put(STORE, data, DRAFTS_KEY)
  } catch {
    // ignore write failures; caller may still have localStorage fallback
  }
}

export async function loadLineupScaleFromDb(): Promise<number | null> {
  try {
    const db = await getDb()
    const data = await db.get(STORE, LINEUP_SCALE_KEY)
    const n = Number(data)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export async function saveLineupScaleToDb(scale: number): Promise<void> {
  try {
    const db = await getDb()
    await db.put(STORE, scale, LINEUP_SCALE_KEY)
  } catch {
    // ignore
  }
}
