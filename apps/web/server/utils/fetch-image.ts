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
// Keep in sync with sniffImageType below and storage.ts extensionFor: the URL
// path trusts this set, the base64 path trusts the magic bytes, storage maps
// the extension. All three must agree on the allowed formats.
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
  // A URL's hostname for an IPv6 literal arrives bracketed (e.g. "[::1]"), and
  // net.isIP rejects the bracketed form, so strip the brackets first or the
  // literal-IP block below never runs (it would fall through to a DNS lookup).
  const host = hostname.replace(/^\[/, '').replace(/\]$/, '')
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error('blocked')
    return
  }
  const resolved = await dnsPromises.lookup(host, { all: true })
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

/**
 * Identify an image by its magic bytes. The byte signature is authoritative for
 * the base64 upload path (a caller-claimed content type proves nothing), and it
 * keeps the accepted set identical to the URL path: PNG, JPEG, GIF, WebP.
 */
export function sniffImageType(b: Uint8Array): string | null {
  if (b.length > 11 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length > 2 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 5 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif'
  if (
    b.length > 11 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'image/webp'
  return null
}

/**
 * Decode raw base64 image data (the MCP `upload_image` "data" argument), with or
 * without a `data:image/...;base64,` prefix. Same caps as the URL path: 5MB,
 * PNG/JPEG/GIF/WebP only, with the type read from the bytes themselves.
 */
export function decodeImageData(raw: string): FetchedImage {
  let b64 = raw.trim()
  const dataUri = /^data:[a-z0-9.+/-]+;base64,/i.exec(b64)
  if (dataUri) b64 = b64.slice(dataUri[0].length)
  b64 = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!b64 || !/^[A-Za-z0-9+/]+=*$/.test(b64)) throw new Error('That is not valid base64 image data.')
  // Cheap pre-decode cap: base64 is ~4/3 the byte size.
  if (b64.length > MAX_BYTES * 1.4) throw new Error('Image is too large (5MB limit).')
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'))
  if (bytes.length === 0) throw new Error('Empty image data.')
  if (bytes.length > MAX_BYTES) throw new Error('Image is too large (5MB limit).')
  const contentType = sniffImageType(bytes)
  if (!contentType) throw new Error('That data is not a PNG, JPEG, GIF, or WebP image.')
  return { contentType, bytes }
}
