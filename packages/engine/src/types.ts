/**
 * Core engine types. These describe the shape of a live room's ephemeral state,
 * all of which lives on the CLASP relay (never the database) during play.
 */

/** Top-level state of a room. */
export type Phase = 'lobby' | 'active' | 'results'

/**
 * State of a single round inside the active phase. The host drives every
 * transition; the names stay constant across all games so the UI and engine
 * stay predictable. A plugin may treat a state as a no-op (e.g. a poll's
 * `reveal` shows the distribution) but the names do not change.
 */
export type RoundState = 'ready' | 'open' | 'locked' | 'reveal'

/** Who a connected client is in the room. */
export type Role = 'host' | 'player' | 'viewer'

/** Current round pointer and timing. */
export interface RoundInfo {
  /** Zero-based index into the round sequence. */
  index: number
  state: RoundState
  /** Epoch ms when voting auto-locks, or null when the round has no timer. */
  deadline: number | null
}

/** The host-published, durable-per-room pointer state the engine reduces over. */
export interface RoomState {
  phase: Phase
  round: RoundInfo
}

/** What a player publishes about themselves under `/player/<pid>/profile`. */
export interface PlayerProfile {
  name: string
  /** First round index this player is eligible to act on. */
  joinedAtIndex: number
}

/** A roster entry as the host sees it, combining profile and presence. */
export interface Player extends PlayerProfile {
  id: string
  /** Epoch ms of the last heartbeat, or null if never seen. */
  lastPing: number | null
}

/** This client's own identity. */
export interface Identity {
  id: string
  name: string
  role: Role
}

/** Room-level metadata published by the host under `/meta`. */
export interface RoomMeta {
  pluginId: string
  pluginVersion: string
  title: string
  themeId: string
  themeOverrides?: Record<string, string>
  musicUrl?: string | null
}
