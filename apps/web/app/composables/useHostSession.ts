import { makeRoomCode } from '@doot-games/engine'

/**
 * A per-tab host identity that survives a reload, so a host who refreshes (or whose
 * tab crashes and reopens) RESUMES the same room instead of regenerating the code and
 * stranding every player. The room code + a per-host-instance token are persisted in
 * sessionStorage (per-tab; survives reload, not tab close, which is exactly the scope
 * we want); the token is passed to `useDootRoom` so the engine recognizes the host's
 * own live room and keeps the code (see RoomRuntime.roomCodeTaken / addr.hostToken).
 *
 * Refresh resilience must NOT mean "the same code forever". A persisted room is keyed by
 * the hosting CONTEXT (what is being hosted), so:
 *   - a refresh of the SAME game resumes its room (players stay);
 *   - a DIFFERENT game gets its OWN room, so a new game never inherits the previous one's
 *     code + ghost roster (the relay holds the old room's retained profiles/inputs for its
 *     TTL, and reusing the code replays them);
 *   - alternating between two games (a game night) keeps EACH game's room + crowd, and a
 *     detour to another host page and back doesn't abandon the first room;
 *   - an entry idle past `MAX_IDLE_MS` is dropped, so a tab reopened the next day starts
 *     fresh rather than resurrecting a dead room.
 * The host can also force a clean room explicitly via `resetHostSession(context)` (the
 * "New room" button) — the unambiguous "this game has ended, start fresh" signal.
 *
 * The host is a real browser, not the storage-blocked embedded player surface, so a
 * storage dependency here is fine. Shared by every host entry point (single-game host
 * and the session/playlist host) so they behave identically.
 */
const STORE_KEY = 'doot-host-rooms'

// Past this much INACTIVITY (no host page load for a context), its room is treated as a
// finished session and dropped. Active hosting bumps the stamp on every load, so a live
// session never trips it; only a forgotten tab does. Comfortably under the relay's 8h
// value TTL, beyond which the old room is gone anyway.
const MAX_IDLE_MS = 6 * 60 * 60 * 1000

/** The host's lobby choices, persisted so a reload rebuilds the IDENTICAL config
 *  (a pooled game re-samples deterministically off the room code + round count) and
 *  can therefore resume mid-game instead of resetting. See HostRoom + tryResumeMidGame. */
export interface HostLobby {
  roundCount?: number
  timersOff?: boolean
  contentFilter?: string
}

interface Entry {
  room: string
  token: string
  ts: number
  lobby?: HostLobby
}

function newToken(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function readStore(): Record<string, Entry> {
  if (typeof sessionStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Entry>) : {}
  } catch {
    return {} // corrupt/legacy value: start clean
  }
}

function writeStore(store: Record<string, Entry>): void {
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(STORE_KEY, JSON.stringify(store))
}

/** Drop entries that have gone idle (also bounds the map's size across many games). */
function prune(store: Record<string, Entry>, now: number): void {
  for (const [k, e] of Object.entries(store)) {
    if (!e || !e.room || !e.token || !e.ts || now - e.ts > MAX_IDLE_MS) delete store[k]
  }
}

/**
 * Get this tab's host room code + token for a hosting `context` (e.g. a saved game's id,
 * a plugin id, or a playlist). The same context resumes its room across refreshes; a
 * different context gets its own room.
 */
export function useHostSession(opts: { context?: string } = {}): {
  room: string
  token: string
  lobby: HostLobby | undefined
} {
  const context = opts.context ?? ''
  const now = Date.now()
  if (typeof sessionStorage === 'undefined')
    return { room: makeRoomCode(), token: newToken(), lobby: undefined }

  const store = readStore()
  prune(store, now)
  const entry: Entry = store[context]
    ? { ...(store[context] as Entry), ts: now } // resume; keep the idle clock fresh
    : { room: makeRoomCode(), token: newToken(), ts: now } // first host of this context
  store[context] = entry
  writeStore(store)
  return { room: entry.room, token: entry.token, lobby: entry.lobby }
}

/** Persist the host's lobby choices for a context, so a reload rebuilds the same
 *  config (and can resume mid-game). Merges; keeps room/token/other contexts. */
export function persistHostLobby(context: string, lobby: HostLobby): void {
  if (typeof sessionStorage === 'undefined') return
  const store = readStore()
  const entry = store[context]
  if (!entry) return
  store[context] = { ...entry, lobby: { ...entry.lobby, ...lobby }, ts: Date.now() }
  writeStore(store)
}

/** Persist the settled code for a context, since the engine may regenerate it on a real
 *  collision. Updates only that context's room; its token + the other contexts are kept. */
export function persistHostRoom(context: string, code: string): void {
  if (!code || typeof sessionStorage === 'undefined') return
  const store = readStore()
  const entry = store[context]
  if (!entry) return // useHostSession creates the entry first; nothing to update otherwise
  store[context] = { ...entry, room: code, ts: Date.now() }
  writeStore(store)
}

/**
 * Forget a context's room (or, with no argument, every host room in this tab), so the next
 * host mount mints a brand-new code with no ghost roster. Backs the "New room" button; the
 * caller reloads the host page afterwards.
 */
export function resetHostSession(context?: string): void {
  if (typeof sessionStorage === 'undefined') return
  if (context == null) {
    sessionStorage.removeItem(STORE_KEY)
    return
  }
  const store = readStore()
  delete store[context]
  writeStore(store)
}
