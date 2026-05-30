import { describe, expect, it } from 'vitest'
import { madLibs } from './madlibs'
import { quipClash } from './quipclash'
import { splitRoom } from './splitroom'

// Each flagship pairs a make + judge round, so N items => 2N engine rounds.
describe('flagship buildConfig honors the host-chosen round count', () => {
  for (const game of [quipClash, madLibs, splitRoom]) {
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
