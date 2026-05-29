/**
 * The room namespace and address scheme. All real-time state for a room sits
 * under a single prefix: `/doot/<ROOM>/...`. Games never build these by hand;
 * they go through the engine. See PRD section 7.2.
 */

export const ROOM_PREFIX = '/doot'

export function roomBase(room: string): string {
  return `${ROOM_PREFIX}/${room}`
}

/** Concrete addresses for a room. */
export const addr = {
  meta: (room: string) => `${roomBase(room)}/meta`,
  config: (room: string) => `${roomBase(room)}/config`,
  phase: (room: string) => `${roomBase(room)}/phase`,
  roundIndex: (room: string) => `${roomBase(room)}/round/index`,
  roundState: (room: string) => `${roomBase(room)}/round/state`,
  roundDeadline: (room: string) => `${roomBase(room)}/round/deadline`,
  /** Answer key for round `i`, published only at reveal. */
  roundAnswer: (room: string, i: number) => `${roomBase(room)}/round/${i}/answer`,
  resultsSummary: (room: string) => `${roomBase(room)}/results/summary`,
  playerProfile: (room: string, pid: string) => `${roomBase(room)}/player/${pid}/profile`,
  playerPing: (room: string, pid: string) => `${roomBase(room)}/player/${pid}/ping`,
  /** A player's submission for round `i`. */
  input: (room: string, i: number, pid: string) => `${roomBase(room)}/input/${i}/${pid}`,
  /** Ephemeral image or drawing, TTL-scoped. */
  media: (room: string, key: string) => `${roomBase(room)}/media/${key}`,
} as const

/** Wildcard subscription patterns. */
export const patterns = {
  playerProfile: (room: string) => `${roomBase(room)}/player/*/profile`,
  playerPing: (room: string) => `${roomBase(room)}/player/*/ping`,
  /** All players' inputs for all rounds (host only). */
  allInputs: (room: string) => `${roomBase(room)}/input/*/*`,
  /** This player's own inputs across rounds (reconnect restore + private score). */
  inputsForPlayer: (room: string, pid: string) => `${roomBase(room)}/input/*/${pid}`,
} as const

/** Extract the player id from a `/player/<pid>/...` address. */
export function pidFromPlayerAddress(address: string): string | null {
  const parts = address.split('/')
  // /doot/<room>/player/<pid>/<leaf>  => indices: 0='' 1='doot' 2=room 3='player' 4=pid
  return parts[3] === 'player' && parts[4] ? parts[4] : null
}

/** Extract `{ roundIndex, pid }` from an `/input/<i>/<pid>` address. */
export function parseInputAddress(address: string): { roundIndex: number; pid: string } | null {
  const parts = address.split('/')
  // /doot/<room>/input/<i>/<pid> => 3='input' 4=i 5=pid
  if (parts[3] !== 'input' || parts[4] === undefined || !parts[5]) return null
  const roundIndex = Number.parseInt(parts[4], 10)
  if (Number.isNaN(roundIndex)) return null
  return { roundIndex, pid: parts[5] }
}
