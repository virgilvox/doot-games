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
// Ephemeral blob uploads are part of live play (a host offloading each round's
// gallery + the results, a player offloading a dense drawing), so they get a more
// generous bucket than game-save writes.
const MAX_EPHEMERAL = 120
const SWEEP_MS = 5 * 60_000

interface Bucket {
  count: number
  resetAt: number
}
const buckets = new Map<string, Bucket>()
let lastSweep = 0

function limited(key: string, now: number, max: number): boolean {
  // Drop stale buckets occasionally so the map can't grow unbounded.
  if (now - lastSweep > SWEEP_MS) {
    lastSweep = now
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
  }
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  b.count++
  return b.count > max
}

export default defineEventHandler((event) => {
  const method = event.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
  const path = event.path || ''
  const isEphemeral = path.startsWith('/api/rooms/') && path.includes('/blobs/')
  if (
    !path.startsWith('/api/games') &&
    !path.startsWith('/api/uploads') &&
    !path.startsWith('/api/client-errors') &&
    !path.startsWith('/api/reports') &&
    !isEphemeral
  )
    return

  // Behind Caddy the real client IP is in x-forwarded-for.
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  // Anonymous, high-volume endpoints get their own bucket so a burst from one venue's
  // shared IP (an error storm, or report spam) can't starve a host's legitimate game
  // saves from that same IP.
  const key = isEphemeral
    ? `eph:${ip}`
    : path.startsWith('/api/client-errors')
      ? `ce:${ip}`
      : path.startsWith('/api/reports')
        ? `rep:${ip}`
        : ip
  if (limited(key, Date.now(), isEphemeral ? MAX_EPHEMERAL : MAX_WRITES)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests, slow down a moment.' })
  }
})
