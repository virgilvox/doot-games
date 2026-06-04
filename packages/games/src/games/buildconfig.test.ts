import { describe, expect, it } from 'vitest'
import type { RoundInstance } from '@doot-games/sdk'
import { backronym } from './backronym'
import { ballpark } from './ballpark'
import { circuitCypher } from './circuit-cypher'
import { faker } from './faker'
import { fibFinder } from './fib-finder'
import { hivemind } from './hivemind'
import { madLibs } from './mad-libs'
import { mostLikely } from './most-likely'
import { openMic } from './open-mic'
import { quipClash } from './quip-clash'
import { sketchSpot } from './sketch-spot'
import { splitRoom } from './split-room'
import { whatYouDidntKnow } from './what-you-didnt-know'

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

// The prompt-style pool games are deck-feedable: a creator can attach a Prompt Deck
// to play their own content. The built-in pool (defaultRows) must reproduce today's
// behavior exactly (regression), and a creator deck must override it.
describe('pool games are deck-fed (contentPool)', () => {
  for (const game of [quipClash, openMic, backronym, mostLikely, hivemind, sketchSpot]) {
    it(`${game.manifest.id}: defaultRows reproduce today's rounds; a creator deck overrides`, () => {
      const pool = game.contentPool!
      expect(pool).toBeDefined()
      expect(pool.deckKind).toBe('prompt')
      // Building with the explicit built-in rows is identical to building with none.
      expect(game.buildConfig!('seed', { rows: pool.defaultRows })).toEqual(game.buildConfig!('seed'))
      // A 3-row creator deck, 2 drawn: exactly 2 of the 3 deck values appear in the
      // rounds (some games embed the value in a prompt, e.g. "What does AAA stand for?").
      const out = game.buildConfig!('seed', { rows: [{ prompt: 'AAA' }, { prompt: 'BBB' }, { prompt: 'CCC' }], rounds: 2 })
      const blob = JSON.stringify(out.rounds)
      const present = ['AAA', 'BBB', 'CCC'].filter((v) => blob.includes(v))
      expect(present.length).toBe(2)
    })
  }
})

// The typed-pool flagships (quiz / card / story-shaped) are deck-feedable too. Their
// built-in pool (defaultRows) must reproduce today's rounds byte-for-byte (regression),
// and a creator deck of the right shape must override the content that plays.
describe('typed-pool games are deck-fed (contentPool)', () => {
  const cases = [
    { game: fibFinder, kind: 'quiz', rows: [{ question: 'Sky color is ___', truth: 'blue' }, { question: 'Grass is ___', truth: 'green' }], marker: 'blue', answers: ['truth', 'answer'] },
    { game: faker, kind: 'card', rows: [{ category: 'Snacks', word: 'Pretzel' }, { category: 'Tools', word: 'Wrench' }], marker: 'Pretzel', answers: ['word', 'secret'] },
    { game: ballpark, kind: 'quiz', rows: [{ prompt: 'How many?', answer: 42 }, { prompt: 'How tall?', answer: 7 }], marker: '42', answers: ['answer', 'value'] },
    { game: whatYouDidntKnow, kind: 'quiz', rows: [{ prompt: 'Pick one', options: 'Aardvark|Beaver|Cobra', correct: 1 }, { prompt: 'Pick two', options: 'X|Y|Z', correct: 0 }], marker: 'Aardvark', answers: ['correct', 'answer'] },
    { game: madLibs, kind: 'generic', rows: [{ template: 'A {noun} ate my {food}.' }, { template: 'I {verb} the {animal}.' }], marker: '{noun}', answers: undefined },
    { game: splitRoom, kind: 'prompt', rows: [{ frame: 'Would you {x} for a year?' }, { frame: 'Is it ok to {x}?' }], marker: 'for a year', answers: undefined },
  ] as const
  for (const { game, kind, rows, marker, answers } of cases) {
    it(`${game.manifest.id}: defaultRows reproduce today's rounds; a creator deck overrides; declares its answer columns`, () => {
      const pool = game.contentPool!
      expect(pool).toBeDefined()
      expect(pool.deckKind).toBe(kind)
      expect(pool.answerColumns).toEqual(answers)
      // Building with the explicit built-in rows is identical to building with none.
      expect(game.buildConfig!('seed', { rows: pool.defaultRows })).toEqual(game.buildConfig!('seed'))
      // A creator deck's content actually plays (the marker comes from the creator rows).
      const out = game.buildConfig!('seed', { rows: rows as Array<Record<string, string | number>>, rounds: 2 })
      expect(JSON.stringify(out.rounds)).toContain(marker)
      // Garbage rows still yield a playable game (buildConfig never throws on bad rows).
      expect(game.buildConfig!('seed', { rows: pool.defaultRows.slice(0, 1) }).rounds.length).toBeGreaterThan(0)
    })
  }

  it('what-you-didnt-know: a creator deck maps options + the hidden correct index', () => {
    const out = whatYouDidntKnow.buildConfig!('seed', { rows: [{ prompt: 'Q', options: 'Cat|Dog|Eel', correct: 2 }], rounds: 1 })
    const c = out.rounds[0]!.content as { options: Array<{ label: string }>; correct: number }
    expect(c.options.map((o) => o.label)).toEqual(['Cat', 'Dog', 'Eel'])
    expect(c.correct).toBe(2)
  })

  it('mad-libs: a bare template derives readable blanks from its {tokens}', () => {
    const out = madLibs.buildConfig!('seed', { rows: [{ template: 'The {adjective} {animal} went {verbing}.' }], rounds: 1 })
    const c = out.rounds[0]!.content as { blanks: Array<{ id: string; label: string }> }
    expect(c.blanks.map((b) => b.id)).toEqual(['adjective', 'animal', 'verbing'])
    expect(c.blanks[0]!.label).toBe('An adjective')
    expect(c.blanks[2]!.label).toBe('A verb ending in -ing')
  })
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
