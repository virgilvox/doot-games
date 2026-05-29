/**
 * Room codes and player identity. A player's id is derived from the room code
 * plus their chosen name, so re-entering the same name in the same room
 * reclaims the same identity and restores their inputs from the relay snapshot
 * — no login and no local storage required. See PRD section 7.4.
 */

/** Unambiguous alphabet: no I, O, 0, or 1. */
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const DEFAULT_ROOM_CODE_LENGTH = 4

/**
 * Generate a room code. `rand` is injectable for deterministic tests; it
 * defaults to `Math.random`.
 */
export function makeRoomCode(
  rand: () => number = Math.random,
  length: number = DEFAULT_ROOM_CODE_LENGTH,
): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ROOM_ALPHABET[Math.floor(rand() * ROOM_ALPHABET.length)]
  }
  return out
}

/** Accepts a 4-character code from the unambiguous alphabet (case-insensitive). */
export function isValidRoomCode(code: string): boolean {
  if (typeof code !== 'string') return false
  const upper = code.toUpperCase()
  if (upper.length !== DEFAULT_ROOM_CODE_LENGTH) return false
  for (const ch of upper) {
    if (!ROOM_ALPHABET.includes(ch)) return false
  }
  return true
}

/** FNV-1a hash, returned base-36. Small, fast, and stable across clients. */
export function fnv1a(str: string): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/** Derive a stable player id from room + name. */
export function playerId(room: string, name: string): string {
  return `p_${fnv1a(`${room}|${name.trim().toLowerCase()}`)}`
}

export const AVATAR_COLORS = [
  '#ff5a3c',
  '#ffcb3d',
  '#2fd3c2',
  '#ff85bd',
  '#7ddb6a',
  '#9d7bff',
  '#ff9a3c',
  '#56b8ff',
] as const

/** Pick a deterministic avatar color for an id. */
export function avatarColor(id: string): string {
  let n = 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) {
    n = (n + s.charCodeAt(i)) % AVATAR_COLORS.length
  }
  return AVATAR_COLORS[n] ?? AVATAR_COLORS[0]
}

/** Up to two initials from a display name. */
export function initials(name: string): string {
  const parts = String(name ?? '?')
    .trim()
    .split(/\s+/)
  const a = parts[0]?.[0] ?? '?'
  const b = parts[1]?.[0] ?? ''
  return (a + b).toUpperCase()
}
