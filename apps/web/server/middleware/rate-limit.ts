/**
 * Per-IP rate limiting for the mutating game/upload routes. better-auth limits
 * its own `/api/auth/*` endpoints; this covers the rest of the write surface
 * (save/update/delete/clone a game, presign an upload) so one client can't
 * hammer the store or the presigner. In-memory fixed window, fine for the
 * single-instance deploy; a multi-instance setup would move this to a shared
 * store. Reads (GET) are never limited.
 */
const WINDOW_MS = 60_000
const MAX_WRITES = 40 // per IP per window
const SWEEP_MS = 5 * 60_000

interface Bucket {
  count: number
  resetAt: number
}
const buckets = new Map<string, Bucket>()
let lastSweep = 0

function limited(ip: string, now: number): boolean {
  // Drop stale buckets occasionally so the map can't grow unbounded.
  if (now - lastSweep > SWEEP_MS) {
    lastSweep = now
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
  }
  const b = buckets.get(ip)
  if (!b || b.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  b.count++
  return b.count > MAX_WRITES
}

export default defineEventHandler((event) => {
  const method = event.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
  const path = event.path || ''
  if (
    !path.startsWith('/api/games') &&
    !path.startsWith('/api/uploads') &&
    !path.startsWith('/api/client-errors')
  )
    return

  // Behind Caddy the real client IP is in x-forwarded-for.
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  if (limited(ip, Date.now())) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests, slow down a moment.' })
  }
})
