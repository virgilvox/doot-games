import { describe, expect, it } from 'vitest'
import { cheerBonus, headToHeadPoints } from '../../blocks/scoring'
import {
  type Matchup,
  battleAward,
  buildBracket,
  scaffoldIndex,
  tallyBattle,
  tournamentLeaderboard,
} from './logic'

const key = (m: Matchup) => [m.a, m.b].sort().join('|')
const counts = (ms: Matchup[]) => {
  const c = new Map<string, number>()
  for (const m of ms) for (const p of [m.a, m.b]) c.set(p, (c.get(p) ?? 0) + 1)
  return c
}

describe('buildBracket', () => {
  it('returns nothing for fewer than two players', () => {
    expect(buildBracket([]).matchups).toEqual([])
    expect(buildBracket(['solo']).matchups).toEqual([])
  })

  it('pairs two players once', () => {
    const { matchups, rounds, droppedRounds } = buildBracket(['A', 'B'])
    expect(matchups).toHaveLength(1)
    expect(key(matchups[0]!)).toBe('A|B')
    expect(rounds).toBe(1)
    expect(droppedRounds).toBe(0)
  })

  it('runs a full round-robin for a small even room (everyone faces everyone once)', () => {
    const { matchups, rounds, droppedRounds } = buildBracket(['A', 'B', 'C', 'D'], 3)
    expect(matchups).toHaveLength(6) // 4 choose 2
    expect(new Set(matchups.map(key)).size).toBe(6) // all distinct pairs, no repeats
    expect(rounds).toBe(3)
    expect(droppedRounds).toBe(0)
    for (const n of counts(matchups).values()) expect(n).toBe(3) // each battles 3 times
  })

  it('covers all pairs for an odd room via rotating byes', () => {
    const pairs = new Set(buildBracket(['A', 'B', 'C'], 3).matchups.map(key))
    expect(pairs).toEqual(new Set(['A|B', 'A|C', 'B|C']))
  })

  it('caps a large room at maxRounds and reports the dropped rounds', () => {
    const { matchups, rounds, droppedRounds } = buildBracket(['A', 'B', 'C', 'D', 'E', 'F'], 3)
    expect(rounds).toBe(3)
    expect(matchups).toHaveLength(9) // 3 matchups/round * 3 rounds
    expect(droppedRounds).toBe(2) // a 6-player round-robin is 5 rounds
    for (const n of counts(matchups).values()) expect(n).toBe(3) // everyone battles exactly maxRounds times
    // No one is ever paired with themselves, and no pair repeats within the cap.
    for (const m of matchups) expect(m.a).not.toBe(m.b)
    expect(new Set(matchups.map(key)).size).toBe(9)
  })
})

describe('tallyBattle', () => {
  it('counts side votes and picks the winner', () => {
    const inputs = new Map<string, { choice?: string }>([
      ['x', { choice: 'a' }],
      ['y', { choice: 'a' }],
      ['z', { choice: 'b' }],
    ])
    expect(tallyBattle(inputs, 'A', 'B')).toEqual({ winner: 'a', votesA: 2, votesB: 1 })
  })

  it('drops a performer voting for their own side but keeps their vote for the opponent', () => {
    const inputs = new Map<string, { choice?: string }>([
      ['A', { choice: 'a' }], // performer A self-vote -> dropped
      ['B', { choice: 'a' }], // performer B voting the opponent -> counts
      ['z', { choice: 'b' }],
    ])
    expect(tallyBattle(inputs, 'A', 'B')).toEqual({ winner: 'tie', votesA: 1, votesB: 1 })
  })

  it('reports a tie on equal (or zero) votes', () => {
    expect(tallyBattle(new Map(), 'A', 'B')).toEqual({ winner: 'tie', votesA: 0, votesB: 0 })
  })
})

describe('scaffoldIndex', () => {
  it('is stable per pid and stays in range', () => {
    expect(scaffoldIndex('p_abc', 10)).toBe(scaffoldIndex('p_abc', 10))
    for (const pid of ['p_a', 'p_b', 'p_c', 'p_xyz', 'player-42']) {
      const i = scaffoldIndex(pid, 8)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(8)
    }
  })
  it('handles an empty pool without dividing by zero', () => {
    expect(scaffoldIndex('p_a', 0)).toBe(0)
  })
})

describe('cheerBonus', () => {
  it('rewards cheers but stays capped and bounded below the head-to-head payout', () => {
    expect(cheerBonus(0)).toBe(0)
    expect(cheerBonus(4)).toBe(60) // 4 * 15
    expect(cheerBonus(1000)).toBe(150) // capped
    // The cap can never out-weigh a voted loser's "show" payout (400), so cheers
    // pad cash but never flip who wins a battle.
    expect(cheerBonus(1000)).toBeLessThan(headToHeadPoints(1, false))
  })
})

describe('battleAward', () => {
  it('pays the winner more, a voted loser the show rate, and adds capped cheers', () => {
    const award = battleAward({
      a: 'A',
      b: 'B',
      tally: { winner: 'a', votesA: 3, votesB: 1 },
      cheersA: 4,
      cheersB: 0,
    })
    expect(award).toEqual({ A: 1000 + 60, B: 400 })
  })

  it('pays both the win rate on a tie, and nothing to a shut-out performer', () => {
    const award = battleAward({ a: 'A', b: 'B', tally: { winner: 'tie', votesA: 2, votesB: 2 } })
    expect(award).toEqual({ A: 1000, B: 1000 })
    const shutout = battleAward({ a: 'A', b: 'B', tally: { winner: 'a', votesA: 2, votesB: 0 } })
    expect(shutout).toEqual({ A: 1000, B: 0 })
  })
})

describe('tournamentLeaderboard', () => {
  it('sums cash across matchups, names everyone, and sorts high to low', () => {
    const names = new Map([
      ['A', 'Ada'],
      ['B', 'Bot'],
      ['C', 'Cy'],
    ])
    const awards = [
      { A: 1000, B: 400 },
      { A: 400, C: 1000 },
    ]
    expect(tournamentLeaderboard(awards, names)).toEqual([
      { id: 'A', name: 'Ada', cash: 1400 },
      { id: 'C', name: 'Cy', cash: 1000 },
      { id: 'B', name: 'Bot', cash: 400 },
    ])
  })

  it('includes a named performer who never scored at zero', () => {
    const names = new Map([['A', 'Ada'], ['B', 'Bot']])
    const board = tournamentLeaderboard([{ A: 400 }], names)
    expect(board).toEqual([
      { id: 'A', name: 'Ada', cash: 400 },
      { id: 'B', name: 'Bot', cash: 0 },
    ])
  })
})

describe('headToHeadPoints', () => {
  it('pays the winner more, the shut-out nothing, and a voted loser something', () => {
    expect(headToHeadPoints(3, true)).toBe(1000) // winner
    expect(headToHeadPoints(1, false)).toBe(400) // lost but drew a vote
    expect(headToHeadPoints(0, false)).toBe(0) // shut out
    expect(headToHeadPoints(0, true)).toBe(0) // can't win on zero votes
  })
})
