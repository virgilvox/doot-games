/**
 * Circuit Cypher tournament pairing + matchup tally + payout (pure, unit-tested).
 * The battle phase pairs the players who wrote a verse so that everyone gets to
 * battle: a round-robin via the circle method, capped at a few pairing-rounds so
 * a big room doesn't run dozens of matchups. The host drives the resulting
 * schedule client-side, publishing one matchup at a time to the relay (the
 * `/x/battle` custom channel), tallies each head-to-head vote, and accumulates
 * cash. All of the logic that decides who wins lives here, pure and tested; the
 * `CircuitCypherHost` component is just the driver around it.
 */
import { cheerBonus, headToHeadPoints } from '../blocks/scoring'

export interface Matchup {
  /** The two performers' player ids. */
  a: string
  b: string
  /** Which pairing-round this matchup belongs to (0-based). */
  round: number
}

const BYE = '__bye__'

/**
 * Build the battle schedule. The circle method gives a round-robin where, across
 * `n-1` rounds, everyone faces everyone once; we cap it at `maxRounds` so large
 * rooms stay short (each player still battles `maxRounds` times). An odd player
 * count adds a rotating bye (that player sits the round out). `droppedRounds`
 * reports how many round-robin rounds the cap cut, so the host can log it.
 */
export function buildBracket(
  players: string[],
  maxRounds = 3,
): { matchups: Matchup[]; rounds: number; droppedRounds: number } {
  const ps = [...players]
  if (ps.length < 2) return { matchups: [], rounds: 0, droppedRounds: 0 }
  if (ps.length % 2 === 1) ps.push(BYE) // the circle method needs an even count
  const n = ps.length
  const totalRounds = n - 1
  const rounds = Math.max(1, Math.min(maxRounds, totalRounds))
  const matchups: Matchup[] = []
  const arr = [...ps] // arr[0] is fixed; the rest rotate each round
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]
      const b = arr[n - 1 - i]
      if (a && b && a !== BYE && b !== BYE) matchups.push({ a, b, round: r })
    }
    // Rotate everything but arr[0]: move the last entry to the front of the tail.
    const tail = arr.slice(1)
    const last = tail.pop()
    if (last !== undefined) tail.unshift(last)
    arr.splice(1, arr.length - 1, ...tail)
  }
  return { matchups, rounds, droppedRounds: totalRounds - rounds }
}

export interface BattleTally {
  winner: 'a' | 'b' | 'tie'
  votesA: number
  votesB: number
}

/**
 * Tally a 1v1 matchup vote. Inputs map a voter's pid to their `{ choice: 'a' | 'b' }`.
 * A performer cannot vote for their own side (a self-vote is dropped); voting for
 * the opponent counts like anyone else's. An empty/unknown choice is ignored.
 */
export function tallyBattle(
  inputs: Map<string, { choice?: string } | null | undefined>,
  performerA: string,
  performerB: string,
): BattleTally {
  let votesA = 0
  let votesB = 0
  for (const [pid, v] of inputs) {
    if (!pid) continue
    const choice = v?.choice
    if (choice === 'a' && pid !== performerA) votesA++
    else if (choice === 'b' && pid !== performerB) votesB++
  }
  const winner = votesA === votesB ? 'tie' : votesA > votesB ? 'a' : 'b'
  return { winner, votesA, votesB }
}

/**
 * A deterministic scaffold index for a player, by hashing their pid into
 * `[0, poolSize)`. Used as a fallback so a phone always has a verse to write even
 * before the host's unique assignment arrives (the host then publishes a
 * collision-free assignment that both sides agree on). Pure + reconnect-safe (a
 * pid is stable). FNV-1a over the pid.
 */
export function scaffoldIndex(pid: string, poolSize: number): number {
  if (poolSize <= 0) return 0
  let h = 0x811c9dc5
  for (let i = 0; i < pid.length; i++) {
    h ^= pid.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) % poolSize
}

// ---- the battle step machine + payout ------------------------------------

/** One performer in a matchup, as published to the battle channel. */
export interface Performer {
  pid: string
  name: string
  /** The full four-line verse (robot lead + the player's rhyming line, per couplet). */
  verse: string
}

/**
 * The coarse, player-facing view of a matchup, published to `/x/battle`. The host
 * runs a finer internal show sequence (banner, intro, countdown, perform, hype,
 * vote, result) but phones only need to know which of these to render: `intro`
 * (the matchup is being announced), `perform` (a robot is on the mic - cheer the
 * `performing` side), `vote` (cast the head-to-head A/B vote), `result` (the
 * winner is up).
 */
export type BattleView = 'intro' | 'perform' | 'vote' | 'result'

/** The whole battle state the host publishes to `/x/battle` (retained, so a
 *  rejoining phone reads the current matchup on subscribe). */
export interface BattleState {
  /** Current matchup index (0-based). */
  i: number
  /** Total matchups in the bracket. */
  total: number
  view: BattleView
  /** Which side is on the mic right now during `perform` (else null). */
  performing: 'left' | 'right' | null
  left: Performer
  right: Performer
  /** Filled at `result`: vote counts and the winning side. */
  votesLeft: number
  votesRight: number
  winner: 'left' | 'right' | 'tie' | null
}

/** One matchup's resolved outcome, the input to the payout. */
export interface MatchupOutcome {
  a: string
  b: string
  tally: BattleTally
  cheersA?: number
  cheersB?: number
}

/**
 * Cash each performer earns from a single matchup: the Mad Verse City head-to-head
 * payout (winner more, a voted loser something, a shut-out nothing) plus a small
 * capped cheer bonus for crowd energy. A tie pays both the win rate. Pure: the
 * vote decides the win, cheers only pad the cash.
 */
export function battleAward(o: MatchupOutcome): Record<string, number> {
  const aWins = o.tally.winner === 'a' || o.tally.winner === 'tie'
  const bWins = o.tally.winner === 'b' || o.tally.winner === 'tie'
  return {
    [o.a]: headToHeadPoints(o.tally.votesA, aWins) + cheerBonus(o.cheersA ?? 0),
    [o.b]: headToHeadPoints(o.tally.votesB, bWins) + cheerBonus(o.cheersB ?? 0),
  }
}

export interface PerformerCash {
  id: string
  name: string
  cash: number
}

/**
 * Sum every matchup's award into a cash leaderboard, highest first. `names` maps
 * each performer's pid to their display name (captured when the bracket is built,
 * so a performer who later leaves is still named and still scored). Every named
 * performer appears even with zero cash; ties break by name for a stable order.
 */
export function tournamentLeaderboard(
  awards: Array<Record<string, number>>,
  names: Map<string, string>,
): PerformerCash[] {
  const cash = new Map<string, number>()
  for (const pid of names.keys()) cash.set(pid, 0)
  for (const award of awards) {
    for (const [pid, n] of Object.entries(award)) {
      cash.set(pid, (cash.get(pid) ?? 0) + n)
    }
  }
  return [...cash.entries()]
    .map(([id, c]) => ({ id, name: names.get(id) ?? 'Robot', cash: c }))
    .sort((x, y) => y.cash - x.cash || x.name.localeCompare(y.name))
}
