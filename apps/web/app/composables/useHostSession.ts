import { makeRoomCode } from '@doot-games/engine'

/**
 * A per-tab host identity that survives a reload, so a host who refreshes (or whose
 * tab crashes and reopens) RESUMES the same room instead of regenerating the code and
 * stranding every player. The room code + a per-host-instance token are persisted in
 * sessionStorage (per-tab; survives reload, not tab close, which is exactly the scope
 * we want); the token is passed to `useDootRoom` so the engine recognizes the host's
 * own live room and keeps the code (see RoomRuntime.roomCodeTaken / addr.hostToken).
 *
 * The host is a real browser, not the storage-blocked embedded player surface, so a
 * storage dependency here is fine. Shared by every host entry point (single-game host
 * and the session/playlist host) so they behave identically.
 */
const ROOM_KEY = 'doot-host-room'
const TOKEN_KEY = 'doot-host-token'

function freshSession(): { room: string; token: string } {
  return {
    room: makeRoomCode(),
    token: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }
}

export function useHostSession(): { room: string; token: string } {
  if (typeof sessionStorage === 'undefined') return freshSession()
  let room = sessionStorage.getItem(ROOM_KEY)
  let token = sessionStorage.getItem(TOKEN_KEY)
  if (!room || !token) {
    const f = freshSession()
    room = f.room
    token = f.token
    sessionStorage.setItem(ROOM_KEY, room)
    sessionStorage.setItem(TOKEN_KEY, token)
  }
  return { room, token }
}

/** Persist the settled code, since the engine may regenerate it on a real collision. */
export function persistHostRoom(code: string): void {
  if (code && typeof sessionStorage !== 'undefined') sessionStorage.setItem(ROOM_KEY, code)
}
