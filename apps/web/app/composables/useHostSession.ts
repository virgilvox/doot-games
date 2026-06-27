import { makeRoomCode } from '@doot-games/engine'

/**
 * A per-tab host identity that survives a reload, so a host who refreshes (or whose
 * tab crashes and reopens) RESUMES the same room instead of regenerating the code and
 * stranding every player. The room code + a per-host-instance token are persisted in
 * sessionStorage (per-tab; survives reload, not tab close, which is exactly the scope
 * we want); the token is passed to `useDootRoom` so the engine recognizes the host's
 * own live room and keeps the code (see RoomRuntime.roomCodeTaken / addr.hostToken).
 *
 * Refresh resilience must NOT mean "the same code forever". A persisted room is only
 * resumed for a genuine REFRESH of the same hosting context that hasn't gone idle:
 *   - a DIFFERENT game (a new `context`) mints a fresh code, so a new game never
 *     inherits the previous game's code + ghost roster (the relay still holds the old
 *     room's retained profiles/inputs for its TTL, and reusing the code replays them);
 *   - a tab left idle past `MAX_IDLE_MS` mints a fresh code, so a window reopened the
 *     next day doesn't resurrect a dead room;
 *   - otherwise (a real refresh of a live session) the code + token are kept.
 * The host can also force a clean room explicitly via `resetHostSession()` (the
 * "New room" button) — the unambiguous "this game has ended, start fresh" signal.
 *
 * The host is a real browser, not the storage-blocked embedded player surface, so a
 * storage dependency here is fine. Shared by every host entry point (single-game host
 * and the session/playlist host) so they behave identically.
 */
const ROOM_KEY = 'doot-host-room'
const TOKEN_KEY = 'doot-host-token'
const CTX_KEY = 'doot-host-ctx'
const TS_KEY = 'doot-host-ts'

// Past this much INACTIVITY (no host page load), a persisted room is treated as a
// finished session. Active hosting bumps the stamp on every load, so a live session
// (reloaded now and then) never trips it; only a forgotten tab does. Comfortably under
// the relay's 8h value TTL, beyond which the old room is gone anyway.
const MAX_IDLE_MS = 6 * 60 * 60 * 1000

function newToken(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function persist(room: string, token: string, context: string, now: number): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(ROOM_KEY, room)
  sessionStorage.setItem(TOKEN_KEY, token)
  sessionStorage.setItem(CTX_KEY, context)
  sessionStorage.setItem(TS_KEY, String(now))
}

/**
 * Get this tab's host room code + token. Pass a `context` that identifies WHAT is being
 * hosted (e.g. a saved game's id or a plugin id) so switching to a different game starts
 * a fresh room; omit it (or keep it stable, like the playlist host) to always resume.
 */
export function useHostSession(opts: { context?: string } = {}): { room: string; token: string } {
  const context = opts.context ?? ''
  const now = Date.now()
  if (typeof sessionStorage === 'undefined') return { room: makeRoomCode(), token: newToken() }

  const room = sessionStorage.getItem(ROOM_KEY)
  const token = sessionStorage.getItem(TOKEN_KEY)
  const ctx = sessionStorage.getItem(CTX_KEY)
  const ts = Number(sessionStorage.getItem(TS_KEY))
  const idle = !ts || now - ts > MAX_IDLE_MS

  // Resume only a refresh of the SAME context that's still active.
  if (room && token && ctx === context && !idle) {
    sessionStorage.setItem(TS_KEY, String(now)) // still hosting: keep the idle clock fresh
    return { room, token }
  }

  const fresh = { room: makeRoomCode(), token: newToken() }
  persist(fresh.room, fresh.token, context, now)
  return fresh
}

/** Persist the settled code, since the engine may regenerate it on a real collision. */
export function persistHostRoom(code: string): void {
  if (code && typeof sessionStorage !== 'undefined') sessionStorage.setItem(ROOM_KEY, code)
}

/**
 * Forget this tab's room entirely, so the next host mount mints a brand-new code with no
 * ghost roster. Backs the "New room" button; the caller reloads the host page afterwards.
 */
export function resetHostSession(): void {
  if (typeof sessionStorage === 'undefined') return
  for (const k of [ROOM_KEY, TOKEN_KEY, CTX_KEY, TS_KEY]) sessionStorage.removeItem(k)
}
