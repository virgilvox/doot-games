/**
 * Fetch a remote image safely, for the MCP `upload_image` tool (Claude hands us an
 * image URL and we re-host it to Doot's store). This fetches a URL the caller chose,
 * so it is SSRF-sensitive: we allow https only, block private/loopback/link-local/
 * metadata addresses (re-checking on every redirect hop), require an allowed image
 * content-type, and cap the body size while streaming. Residual risk: DNS rebinding
 * between our lookup and the socket connect is not fully closed (would need
 * connect-to-pinned-IP); acceptable for an authenticated, size-capped image fetch.
 */
import dnsPromises from 'node:dns/promises'
import net from 'node:net'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 4
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number)
    const a = p[0] ?? -1
    const b = p[1] ?? -1
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true // link-local + cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a >= 224) return true // multicast / reserved
    return false
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase()
    if (low === '::1' || low === '::') return true
    if (/^fe[89a-f]/.test(low)) return true // link-local fe80::/10 + site-local fec0::/10
    if (low.startsWith('fc') || low.startsWith('fd')) return true // ULA fc00::/7
    if (low.startsWith('64:ff9b:') || low.startsWith('64:ff9b::')) return true // NAT64 (embeds v4)
    if (low.startsWith('2002:')) return true // 6to4 (embeds arbitrary v4)
    if (low.startsWith('::ffff:')) return isBlockedIp(low.slice(7)) // IPv4-mapped
    return false
  }
  return true // unknown form: block
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error('blocked')
    return
  }
  const resolved = await dnsPromises.lookup(hostname, { all: true })
  if (!resolved.length) throw new Error('unresolvable')
  for (const { address } of resolved) if (isBlockedIp(address)) throw new Error('blocked')
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader()
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > max) throw new Error('Image is too large (5MB limit).')
    return buf
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      throw new Error('Image is too large (5MB limit).')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out
}

export interface FetchedImage {
  contentType: string
  bytes: Uint8Array
}

/** Fetch and validate an image URL. Throws a user-facing Error on any rejection. */
export async function fetchImage(rawUrl: string): Promise<FetchedImage> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('That is not a valid URL.')
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== 'https:') throw new Error('The image URL must start with https.')
    try {
      await assertPublicHost(url.hostname)
    } catch {
      throw new Error('That URL points somewhere that is not allowed.')
    }

    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 10_000)
    let res: Response
    try {
      res = await fetch(url, { redirect: 'manual', signal: ctl.signal, headers: { accept: 'image/*' } })
    } catch {
      throw new Error('Could not reach that image URL.')
    } finally {
      clearTimeout(timer)
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error('That image URL did not resolve.')
      url = new URL(loc, url) // re-validated at the top of the next loop
      continue
    }
    if (!res.ok) throw new Error(`Could not fetch the image (status ${res.status}).`)

    const ct = (res.headers.get('content-type') || '').split(';')[0]?.trim().toLowerCase() ?? ''
    if (!ALLOWED_TYPES.has(ct)) throw new Error('That URL is not a PNG, JPEG, GIF, or WebP image.')

    const declared = Number(res.headers.get('content-length') || 0)
    if (declared > MAX_BYTES) throw new Error('Image is too large (5MB limit).')

    const bytes = await readCapped(res, MAX_BYTES)
    return { contentType: ct, bytes }
  }
  throw new Error('That image URL redirected too many times.')
}
