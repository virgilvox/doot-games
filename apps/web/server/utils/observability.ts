/**
 * Lightweight, vendor-neutral observability: an in-memory ring of recent errors
 * (server + client) plus the last-backup status, so a solo operator can SEE what's
 * breaking without watching logs. No external account or heavy SDK; it logs to
 * stdout (the `[doot]` convention) and, if `DOOT_ERROR_WEBHOOK` is set, forwards a
 * throttled line to any Slack/Discord-style incoming webhook. The recent errors +
 * backup status are exposed to admins at `GET /api/admin/status`.
 *
 * In-memory by design (mirrors server/middleware/rate-limit.ts): this is per-instance
 * runtime state, never the DB. It resets on restart, which is fine for "what broke
 * recently" — durable alerting is the optional webhook's job.
 */
interface ErrorRecord {
  /** epoch ms */
  at: number
  source: 'server' | 'client'
  message: string
  stack?: string
  context?: Record<string, unknown>
}

// Separate rings per source: frequent (and untrusted, anonymous) CLIENT reports
// must never evict the rarer, more important SERVER errors from the operator's view.
const SERVER_MAX = 100
const CLIENT_MAX = 100
const serverRing: ErrorRecord[] = []
const clientRing: ErrorRecord[] = []

const backup: {
  lastOkAt: number | null
  lastKey: string | null
  lastFailAt: number | null
  lastError: string | null
} = { lastOkAt: null, lastKey: null, lastFailAt: null, lastError: null }

let lastForwardAt = 0
const FORWARD_THROTTLE_MS = 10_000

/** Fire-and-forget forward to an optional incoming webhook. Sends both `text`
 *  (Slack) and `content` (Discord) so either works; never throws, never blocks. */
function forward(rec: ErrorRecord): void {
  const url = process.env.DOOT_ERROR_WEBHOOK
  if (!url) return
  const now = Date.now()
  if (now - lastForwardAt < FORWARD_THROTTLE_MS) return // don't flood on an error storm
  lastForwardAt = now
  const line = `[doot] ${rec.source} error: ${rec.message}`
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: line, content: line }),
  }).catch(() => {})
}

/** Record an error into the ring (capped), log it, and forward it (throttled). */
export function recordError(rec: { source: 'server' | 'client'; message: string; stack?: string; context?: Record<string, unknown> }): void {
  const entry: ErrorRecord = {
    at: Date.now(),
    source: rec.source,
    message: String(rec.message).slice(0, 500),
    stack: rec.stack ? rec.stack.slice(0, 4000) : undefined,
    context: rec.context,
  }
  const ring = entry.source === 'server' ? serverRing : clientRing
  const max = entry.source === 'server' ? SERVER_MAX : CLIENT_MAX
  ring.push(entry)
  if (ring.length > max) ring.shift()
  console.error(`[doot] ${entry.source} error:`, entry.message, entry.context ?? '')
  forward(entry)
}

/** The most recent errors across both sources, newest first. */
export function recentErrors(limit = 50): ErrorRecord[] {
  return [...serverRing, ...clientRing].sort((a, b) => b.at - a.at).slice(0, limit)
}

export function recordBackupOk(key: string): void {
  backup.lastOkAt = Date.now()
  backup.lastKey = key
}

export function recordBackupFail(message: string): void {
  backup.lastFailAt = Date.now()
  backup.lastError = String(message).slice(0, 500)
}

export function backupStatus(): typeof backup {
  return { ...backup }
}
