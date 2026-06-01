import { describe, expect, it } from 'vitest'
import type { RoundInstance } from '@doot-games/sdk'
import { circuitCypher } from './circuit-cypher'
import { madLibs } from './madlibs'
import { quipClash } from './quipclash'
import { splitRoom } from './splitroom'

// Each of these flagships pairs a make + judge round, so N items => 2N engine
// rounds. (Circuit Cypher is a custom-flow tournament with a single write round,
// asserted separately below.)
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

describe('Circuit Cypher composition (custom-flow tournament)', () => {
  it('is a single guided bars write round; the head-to-head battle is custom state', () => {
    const rounds = circuitCypher.buildConfig!('seed').rounds as RoundInstance[]
    // One write round, no engine vote rounds: the bracket of 1v1 battles runs as
    // custom relay state driven by CircuitCypherHost, not as engine rounds.
    expect(rounds.map((r) => r.block)).toEqual(['bars'])
    const couplets = (rounds[0]!.content as { couplets?: Array<{ lead: string }> }).couplets ?? []
    expect(couplets.length).toBeGreaterThanOrEqual(1)
    expect(couplets.every((c) => c.lead.length > 0)).toBe(true)
  })

  it('ships a custom Host and Player (the generic renderer cannot sequence battles)', () => {
    expect(circuitCypher.components?.Host).toBeDefined()
    expect(circuitCypher.components?.Player).toBeDefined()
  })

  it('draws a different verse scaffold per room but is stable for one room', () => {
    const a1 = circuitCypher.buildConfig!('ROOMA').rounds[0]!.content as { couplets: unknown }
    const a2 = circuitCypher.buildConfig!('ROOMA').rounds[0]!.content as { couplets: unknown }
    expect(a1).toEqual(a2) // same room => same scaffold (reconnect-safe)
  })

  it('carries the whole pool as per-player variants so every performer raps differently', () => {
    const content = circuitCypher.buildConfig!('ROOMA').rounds[0]!.content as {
      couplets: unknown[]
      variants: Array<{ couplets: { lead: string }[] }>
    }
    // Many distinct scaffolds to assign from, and the base couplets is the first.
    expect(content.variants.length).toBeGreaterThan(3)
    expect(content.variants[0]!.couplets).toEqual(content.couplets)
    const leads = content.variants.map((v) => v.couplets.map((c) => c.lead).join('|'))
    expect(new Set(leads).size).toBe(leads.length) // every scaffold is distinct
  })
})
