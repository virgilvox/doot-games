import { describe, expect, it } from 'vitest'
import type { RoundInstance } from '@doot-games/sdk'
import { circuitCypher } from './circuit-cypher'
import { madLibs } from './madlibs'
import { quipClash } from './quipclash'
import { splitRoom } from './splitroom'

// Each flagship pairs a make + judge round, so N items => 2N engine rounds.
describe('flagship buildConfig honors the host-chosen round count', () => {
  for (const game of [quipClash, madLibs, splitRoom, circuitCypher]) {
    const opts = game.roundOptions!
    it(`${game.manifest.id}: respects opts.rounds, clamps to the pool, defaults`, () => {
      expect(game.buildConfig).toBeDefined()
      expect(opts).toBeDefined()
      // A chosen count yields that many make/judge pairs.
      expect(game.buildConfig!('seed', { rounds: 2 }).rounds.length).toBe(4)
      // Default (no opts) uses roundOptions.default.
      expect(game.buildConfig!('seed').rounds.length).toBe(opts.default * 2)
      // Over-asking is clamped to the pool (never throws, never exceeds it).
      const huge = game.buildConfig!('seed', { rounds: 999 }).rounds.length
      expect(huge).toBeGreaterThan(0)
      expect(huge % 2).toBe(0)
      // Asking for 0/negative still yields at least one pair.
      expect(game.buildConfig!('seed', { rounds: 0 }).rounds.length).toBe(2)
    })
  }
})

describe('Circuit Cypher composition', () => {
  it('pairs each guided bars verse with a performing vote round', () => {
    const rounds = circuitCypher.buildConfig!('seed', { rounds: 2 }).rounds as RoundInstance[]
    expect(rounds.map((r) => r.block)).toEqual(['bars', 'vote', 'bars', 'vote'])
    // The judge rounds opt into the robot performance (the rap-battle moment).
    for (const r of rounds.filter((r) => r.block === 'vote')) {
      expect((r.content as { perform?: boolean }).perform).toBe(true)
    }
    // Each bars round gives the player robot lead lines to rhyme back.
    for (const r of rounds.filter((r) => r.block === 'bars')) {
      const couplets = (r.content as { couplets?: Array<{ lead: string }> }).couplets ?? []
      expect(couplets.length).toBeGreaterThanOrEqual(1)
      expect(couplets.every((c) => c.lead.length > 0)).toBe(true)
    }
  })
})
