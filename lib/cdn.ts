const CDN_BASE = process.env.NEXT_PUBLIC_CDN_BASE_URL || 'https://data.duang.work'
const BUILTIN_HERO_AVATARS = new Set(['pygmalien', 'jules', 'vanessa', 'mak', 'dooley', 'stelle'])

function stripLeadingSlash(path: string): string {
  return path.replace(/^\/+/, '')
}

export function cdnUrl(path: string): string {
  return `${CDN_BASE}/${stripLeadingSlash(path)}`
}

function heroPlaceholderUrl(letter: string): string {
  const text = (letter || '?').slice(0, 1).toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3a2a14"/><stop offset="100%" stop-color="#1b130b"/></linearGradient></defs><rect width="96" height="96" rx="18" fill="url(#g)"/><rect x="3" y="3" width="90" height="90" rx="15" fill="none" stroke="#ffcd73" stroke-width="2"/><text x="48" y="61" text-anchor="middle" fill="#ffdf9f" font-size="44" font-family="Arial, sans-serif" font-weight="700">${text}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function heroAvatarUrl(heroSlug: string): string {
  const slug = String(heroSlug || '').trim().toLowerCase()
  if (!slug) return heroPlaceholderUrl('?')
  if (slug === 'karnok') return heroPlaceholderUrl('K')
  if (BUILTIN_HERO_AVATARS.has(slug)) return cdnUrl(`images/heroes/${slug}.webp`)
  return heroPlaceholderUrl(slug[0] || '?')
}

export function iconUrl(iconName: string): string {
  return cdnUrl(`images/icons/${iconName}.webp`)
}

export function itemsDbUrl(): string {
  // Use the bundled latest dump-derived data in this app build.
  return '/resources/bazaardb/items_db.json?v=20260416a'
}

export function skillsDbUrl(): string {
  // Use the bundled latest dump-derived data in this app build.
  return '/resources/bazaardb/skills_db.json?v=20260416a'
}
