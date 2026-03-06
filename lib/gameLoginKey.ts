export type DecodedGameLoginKey = {
  key: string
  username: string
  accountId: string
  issuedAt: number
}

const SECRET = 'BazaarHelper@LoginKey:v1'
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i

function fromHex(hex: string): Uint8Array | null {
  if (!hex || hex.length % 2 !== 0) return null
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    const b = hex.slice(i * 2, i * 2 + 2)
    out[i] = Number.parseInt(b, 16)
  }
  return out
}

function decodeObfuscatedPayload(encryptedHex: string): string | null {
  const bytes = fromHex(encryptedHex)
  if (!bytes) return null
  const secretBytes = new TextEncoder().encode(SECRET)
  const out = new Uint8Array(bytes.length)
  for (let idx = 0; idx < bytes.length; idx += 1) {
    const mask = secretBytes[idx % secretBytes.length] ^ ((idx * 31) & 0xff)
    out[idx] = bytes[idx] ^ mask
  }
  try {
    return new TextDecoder().decode(out)
  } catch {
    return null
  }
}

export function decodeGameLoginKey(rawKey: string): DecodedGameLoginKey | null {
  const key = (rawKey || '').trim()
  if (!key.startsWith('bh1.')) return null
  const parts = key.split('.')
  if (parts.length !== 3) return null
  const encrypted = parts[1]
  const payload = decodeObfuscatedPayload(encrypted)
  if (!payload || !payload.startsWith('v1|')) return null

  const segs = payload.split('|')
  if (segs.length < 4) return null
  const version = segs[0]
  if (version !== 'v1') return null
  const issuedAtRaw = segs[segs.length - 1]
  const accountIdRaw = segs[segs.length - 2]
  const username = segs.slice(1, -2).join('|').trim()
  const issuedAt = Number.parseInt(issuedAtRaw, 10)
  const accountId = (() => {
    const value = String(accountIdRaw || '').trim()
    if (!value) return ''
    const matched = value.match(UUID_PATTERN)
    return matched?.[0] || value
  })()
  if (!username || !accountId || !Number.isFinite(issuedAt)) return null

  return {
    key,
    username,
    accountId,
    issuedAt,
  }
}
