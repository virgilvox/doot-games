import type { ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { teamCrownHeadline, teamLeaderboard } from './derive'

const lb = (entries: Array<[string, number]>) => entries.map(([id, score]) => ({ id, name: id, score }))

describe('teamLeaderboard', () => {
  const players: ScorePlayer[] = [
    { id: 'A', name: 'Ada', joinedAtIndex: 0, team: 'Red' },
    { id: 'B', name: 'Bea', joinedAtIndex: 0, team: 'Red' },
    { id: 'C', name: 'Cy', joinedAtIndex: 0, team: 'Blue' },
    { id: 'D', name: 'Dot', joinedAtIndex: 0, team: 'Blue' },
  ]

  it('sums per-player scores into team totals and counts members', () => {
    const out = teamLeaderboard(lb([['A', 3], ['B', 1], ['C', 5], ['D', 0]]), players)
    expect(out).toEqual([
      { team: 'Blue', score: 5, members: 2 },
      { team: 'Red', score: 4, members: 2 },
    ])
  })

  it('counts a teamed player who never scored as a member (0 points)', () => {
    const out = teamLeaderboard(lb([['A', 2]]), players) // only A appears on the board
    const red = out!.find((t) => t.team === 'Red')!
    const blue = out!.find((t) => t.team === 'Blue')!
    expect(red).toEqual({ team: 'Red', score: 2, members: 2 })
    expect(blue).toEqual({ team: 'Blue', score: 0, members: 2 })
  })

  it('ignores a leaderboard entry whose player has no team', () => {
    const mixed: ScorePlayer[] = [
      { id: 'A', name: 'Ada', joinedAtIndex: 0, team: 'Red' },
      { id: 'X', name: 'Xan', joinedAtIndex: 0 }, // no team
    ]
    const out = teamLeaderboard(lb([['A', 4], ['X', 99]]), mixed)
    expect(out).toEqual([{ team: 'Red', score: 4, members: 1 }])
  })

  it('returns undefined when no player has a team (non-team game unchanged)', () => {
    const none: ScorePlayer[] = [{ id: 'A', name: 'Ada', joinedAtIndex: 0 }]
    expect(teamLeaderboard(lb([['A', 5]]), none)).toBeUndefined()
  })

  it('sorts by score desc, then team name', () => {
    const out = teamLeaderboard(lb([['A', 2], ['C', 2]]), players)
    expect(out!.map((t) => t.team)).toEqual(['Blue', 'Red']) // tie -> alphabetical
  })
})

describe('teamCrownHeadline', () => {
  it('crowns a single winning team', () => {
    expect(teamCrownHeadline([{ team: 'Red', score: 5, members: 2 }, { team: 'Blue', score: 3, members: 2 }])).toBe('Red wins')
  })
  it('co-crowns a two-way tie', () => {
    expect(teamCrownHeadline([{ team: 'Red', score: 5, members: 2 }, { team: 'Blue', score: 5, members: 2 }])).toBe('Red & Blue tie')
  })
  it('reads an N-way tie', () => {
    expect(
      teamCrownHeadline([
        { team: 'Red', score: 5, members: 1 },
        { team: 'Blue', score: 5, members: 1 },
        { team: 'Green', score: 5, members: 1 },
      ]),
    ).toBe('3-way tie: Red, Blue & Green')
  })
  it('is null when nobody scored or there are no teams', () => {
    expect(teamCrownHeadline([{ team: 'Red', score: 0, members: 2 }])).toBeNull()
    expect(teamCrownHeadline(undefined)).toBeNull()
    expect(teamCrownHeadline([])).toBeNull()
  })
})
