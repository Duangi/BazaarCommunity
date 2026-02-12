const CDN_BASE = 'https://data.duang.work'

function stripLeadingSlash(path: string): string {
  return path.replace(/^\/+/, '')
}

export function cdnUrl(path: string): string {
  return `${CDN_BASE}/${stripLeadingSlash(path)}`
}

export function heroAvatarUrl(heroSlug: string): string {
  return cdnUrl(`images/heroes/${heroSlug}.webp`)
}

export function iconUrl(iconName: string): string {
  return cdnUrl(`images/icons/${iconName}.webp`)
}

export function itemsDbUrl(): string {
  return cdnUrl('items_db.json')
}

export function skillsDbUrl(): string {
  return cdnUrl('skills_db.json')
}
