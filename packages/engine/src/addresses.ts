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
  /** Host liveness heartbeat; players watch it to detect a vanished host. */
  hostPing: (room: string) => `${roomBase(room)}/host/ping`,
  /** The delegated driver (co-host/MC): a player's pid, or '' for none. Host writes. */
  controlDriver: (room: string) => `${roomBase(room)}/control/driver`,
  /** A drive intent from the delegated player (advance the round). They write it;
   *  the host validates (right driver, current round) and applies it. */
  controlCommand: (room: string) => `${roomBase(room)}/control/command`,
  /** Answer key for round `i`, published only at reveal. */
  roundAnswer: (room: string, i: number) => `${roomBase(room)}/round/${i}/answer`,
  /** Runtime-derived content for round `i` (the two-phase pattern): the host
   *  builds it from an earlier round's inputs and publishes it (shuffled +
   *  anonymized) when the room reaches the round. Overrides the authored content. */
  roundContent: (room: string, i: number) => `${roomBase(room)}/round/${i}/content`,
  /** Public per-round reveal summary for round `i` (vote tallies, the winner),
   *  published at reveal so phones can show personal feedback. */
  roundReveal: (room: string, i: number) => `${roomBase(room)}/round/${i}/reveal`,
  /** SECRET per-player content for round `i`: the host publishes a different
   *  payload to each player's own address (e.g. a hidden-role game where one
   *  player gets a different prompt). A player subscribes only to their own, so
   *  another player's UI never shows it. NOTE (soft secrecy): the address is
   *  derivable, so a determined relay reader could subscribe to others'. This is the
   *  same accepted trade-off as soft two-phase anonymity; fine for casual play. */
  roundContentForPlayer: (room: string, i: number, pid: string) =>
    `${roomBase(room)}/round/${i}/content/${pid}`,
  resultsSummary: (room: string) => `${roomBase(room)}/results/summary`,
  /** Running standings (cumulative scores through the revealed rounds), published
   *  by the host after each reveal so phones + the big screen can show a between-
   *  round leaderboard. Ephemeral, like everything else; the final results use the
   *  separate resultsSummary. */
  standings: (room: string) => `${roomBase(room)}/standings`,
  playerProfile: (room: string, pid: string) => `${roomBase(room)}/player/${pid}/profile`,
  playerPing: (room: string, pid: string) => `${roomBase(room)}/player/${pid}/ping`,
  /** A player's team (when teams are on): a team name, or '' to clear. The player
   *  writes their own; the host may write any player's (assign / auto-balance).
   *  Retained + TTL-scoped, so a reconnecting player keeps their team. */
  playerTeam: (room: string, pid: string) => `${roomBase(room)}/player/${pid}/team`,
  /** A player's submission for round `i`. */
  input: (room: string, i: number, pid: string) => `${roomBase(room)}/input/${i}/${pid}`,
  /** Ephemeral image or drawing, TTL-scoped. */
  media: (room: string, key: string) => `${roomBase(room)}/media/${key}`,
  /** A game-defined custom channel (custom-flow games, e.g. the Circuit Cypher
   *  battle state + live cheers). `key` may be multi-segment and contain `*`. */
  extra: (room: string, key: string) => `${roomBase(room)}/x/${key}`,
} as const

/** Wildcard subscription patterns. */
export const patterns = {
  playerProfile: (room: string) => `${roomBase(room)}/player/*/profile`,
  playerPing: (room: string) => `${roomBase(room)}/player/*/ping`,
  /** Every player's team (everyone tracks the roster's teams). */
  playerTeam: (room: string) => `${roomBase(room)}/player/*/team`,
  /** All players' inputs for all rounds (host only). */
  allInputs: (room: string) => `${roomBase(room)}/input/*/*`,
  /** This player's own inputs across rounds (reconnect restore + private score). */
  inputsForPlayer: (room: string, pid: string) => `${roomBase(room)}/input/*/${pid}`,
  /** Runtime-derived content for all rounds (player/viewer reads these). */
  roundContent: (room: string) => `${roomBase(room)}/round/*/content`,
  /** Per-round reveal summaries for all rounds (player/viewer reads these). */
  roundReveal: (room: string) => `${roomBase(room)}/round/*/reveal`,
  /** This player's own SECRET per-round content across rounds. The round index uses
   *  a single-segment wildcard, so it never collides with the shared round-content
   *  subscription (which has no trailing player segment). */
  myRoundContent: (room: string, pid: string) => `${roomBase(room)}/round/*/content/${pid}`,
} as const

/**
 * Extract the round index from a `/round/<i>/<leaf>` address (e.g. `content`,
 * `reveal`), or null if it doesn't match.
 */
export function parseRoundSubAddress(address: string, leaf: string): number | null {
  const parts = address.split('/')
  // /doot/<room>/round/<i>/<leaf> => 0='' 1='doot' 2=room 3='round' 4=i 5=leaf.
  // Require EXACTLY 6 segments so the secret per-player channel
  // (`round/<i>/content/<pid>`, 7 segments) is never mistaken for shared content.
  if (parts.length !== 6 || parts[3] !== 'round' || parts[5] !== leaf || parts[4] === undefined) return null
  const i = Number.parseInt(parts[4], 10)
  return Number.isNaN(i) ? null : i
}

/** Extract the player id from a `/player/<pid>/...` address. */
export function pidFromPlayerAddress(address: string): string | null {
  const parts = address.split('/')
  // /doot/<room>/player/<pid>/<leaf>  => indices: 0='' 1='doot' 2=room 3='player' 4=pid
  return parts[3] === 'player' && parts[4] ? parts[4] : null
}

/** Extract `{ roundIndex, pid }` from a `/round/<i>/content/<pid>` address (the
 *  secret per-player content channel), or null if it doesn't match. */
export function parseRoundContentForPlayer(address: string): { roundIndex: number; pid: string } | null {
  const parts = address.split('/')
  // /doot/<room>/round/<i>/content/<pid> => 3='round' 4=i 5='content' 6=pid
  if (parts[3] !== 'round' || parts[5] !== 'content' || parts[4] === undefined || !parts[6]) return null
  const roundIndex = Number.parseInt(parts[4], 10)
  if (Number.isNaN(roundIndex)) return null
  return { roundIndex, pid: parts[6] }
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
