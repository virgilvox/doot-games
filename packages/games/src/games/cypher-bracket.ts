/**
 * Circuit Cypher tournament pairing + matchup tally (pure, unit-tested). The
 * battle phase pairs the players who wrote a verse so that everyone gets to
 * battle: a round-robin via the circle method, capped at a few pairing-rounds so
 * a big room doesn't run dozens of matchups. The host drives the resulting
 * schedule client-side, publishing one matchup at a time to the relay.
 */

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
    const choice = v?.choice
    if (choice === 'a' && pid !== performerA) votesA++
    else if (choice === 'b' && pid !== performerB) votesB++
  }
  const winner = votesA === votesB ? 'tie' : votesA > votesB ? 'a' : 'b'
  return { winner, votesA, votesB }
}
