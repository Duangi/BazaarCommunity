function normalizeKey(raw: string): string {
  const key = String(raw || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  if (!key || key.includes('..')) return ''
  return key
}

function tryDecode(input: string): string {
  try {
    return decodeURIComponent(input)
  } catch {
    return input
  }
}

export function extractScreenshotObjectKey(rawUrl: string): string {
  const raw = String(rawUrl || '').trim()
  if (!raw) return ''

  if (raw.startsWith('/api/r2/public')) {
    try {
      const parsed = new URL(raw, 'http://localhost')
      const key = normalizeKey(parsed.searchParams.get('key') || '')
      if (key) return key
    } catch {
      return ''
    }
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw)
      return normalizeKey(tryDecode(parsed.pathname))
    } catch {
      return ''
    }
  }

  return normalizeKey(tryDecode(raw))
}

export function buildScreenshotProxyUrl(rawUrl: string): string {
  const key = extractScreenshotObjectKey(rawUrl)
  if (!key) return ''
  return `/api/r2/public?key=${encodeURIComponent(key)}`
}

export function resolveScreenshotOpenUrl(rawUrl: string): string {
  return buildScreenshotProxyUrl(rawUrl) || rawUrl
}

