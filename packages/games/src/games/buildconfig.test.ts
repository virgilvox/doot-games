import { describe, expect, it } from 'vitest'
import type { RoundInstance } from '@doot-games/sdk'
import { gameCatalog } from '../catalog'
import { builtinPlugins } from '../registry'
import { poolRowsFor, poolStarter } from '../runtime/decks'
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
import { quizOrDie } from './quiz-or-die'
import { sketchSpot } from './sketch-spot'
import { truthOrShare } from './truth-or-share'
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

  it('quiz-or-die (custom flow): its trivia bank is deck-feedable; finale rows are optional', () => {
    const pool = quizOrDie.contentPool!
    expect(pool.deckKind).toBe('quiz')
    expect(pool.answerColumns).toEqual(['correct', 'answer', 'belong'])
    // The built-in rows reproduce today's single cellar round exactly (regression).
    expect(quizOrDie.buildConfig!('seed', { rows: pool.defaultRows })).toEqual(quizOrDie.buildConfig!('seed'))
    // A creator quiz deck (1-based `correct`) overrides the trivia, end to end through
    // poolRowsFor; the finale categories remain built-in.
    const deck = {
      columns: [
        { key: 'category', label: 'Category', type: 'text' as const },
        { key: 'question', label: 'Question', type: 'text' as const },
        { key: 'options', label: 'Options', type: 'text' as const },
        { key: 'correct', label: 'Correct', type: 'number' as const },
      ],
      rows: [
        { category: 'DREAD', question: 'Which gas do we breathe out?', options: 'Oxygen|Carbon dioxide|Helium', correct: 2 },
        { category: 'DOOM', question: 'How many legs has a spider?', options: 'Six|Eight|Ten', correct: 2 },
        { category: 'GLOOM', question: 'What is frozen water?', options: 'Steam|Ice|Mist', correct: 2 },
      ],
    }
    const out = quizOrDie.buildConfig!('seed', { rows: poolRowsFor(pool, deck), rounds: 3 })
    const content = out.rounds[0]!.content as { questions: Array<{ q: string; a: string[]; c: number }>; finalCats: unknown[]; qPerGame: number }
    expect(content.questions.map((q) => q.q)).toContain('Which gas do we breathe out?')
    // correct came in 1-based (2) and resolves to 0-based index 1 (Carbon dioxide).
    const breathe = content.questions.find((q) => q.q.startsWith('Which gas'))!
    expect(breathe.a[breathe.c]).toBe('Carbon dioxide')
    expect(content.qPerGame).toBe(3)
    expect(content.finalCats.length).toBeGreaterThan(0) // finale is still the built-in bank
  })

  it('quiz-or-die: a deck may also carry finale `belong` rows, which feed the finale pool', () => {
    const pool = quizOrDie.contentPool!
    const deck = {
      columns: [
        { key: 'category', label: 'Category', type: 'text' as const },
        { key: 'question', label: 'Question', type: 'text' as const },
        { key: 'options', label: 'Options', type: 'text' as const },
        { key: 'correct', label: 'Correct', type: 'number' as const },
        { key: 'belong', label: 'Belong', type: 'text' as const },
      ],
      rows: [
        { category: 'DREAD', question: 'Which is a planet?', options: 'Mars|Pluto|Orion', correct: 1, belong: '' },
        { category: 'DOOM', question: 'Which is a planet?', options: 'Venus|Sirius|Ceres', correct: 1, belong: '' },
        { category: 'TRUE PLANETS', question: '', options: 'Mars|Pluto|Venus|Orion', correct: 0, belong: 'Mars|Venus' },
      ],
    }
    const out = quizOrDie.buildConfig!('seed', { rows: poolRowsFor(pool, deck), rounds: 2 })
    const c = out.rounds[0]!.content as { questions: unknown[]; finalCats: Array<{ cat: string; opts: Array<{ t: string; ok: boolean }> }> }
    expect(c.questions.length).toBe(2) // the two question rows (the finale row is not a question)
    const finale = c.finalCats.find((f) => f.cat === 'TRUE PLANETS')!
    expect(finale).toBeDefined()
    expect(finale.opts.filter((o) => o.ok).map((o) => o.t)).toEqual(['Mars', 'Venus']) // belong column resolved
  })

  it('truth-or-share (custom flow, multi-pool): one deck partitions into its four prompt pools', () => {
    const pool = truthOrShare.contentPool!
    expect(pool.deckKind).toBe('prompt')
    // The built-in rows reproduce today's four shuffled pools exactly (regression).
    expect(truthOrShare.buildConfig!('seed', { rows: pool.defaultRows })).toEqual(truthOrShare.buildConfig!('seed'))
    // A creator deck with kind/tier columns lands each prompt in the right pool; an empty
    // quadrant falls back to the built-in pool.
    const out = truthOrShare.buildConfig!('seed', {
      rows: [
        { kind: 'truth', tier: 'mild', prompt: 'My custom mild truth' },
        { kind: 'truth', tier: 'spicy', prompt: 'My custom spicy truth' },
        { kind: 'share', tier: 'mild', prompt: 'My custom mild share' },
      ],
    })
    const c = out.rounds[0]!.content as { truthsMild: string[]; truthsSpicy: string[]; sharesMild: string[]; sharesSpicy: string[] }
    expect(c.truthsMild).toEqual(['My custom mild truth'])
    expect(c.truthsSpicy).toEqual(['My custom spicy truth'])
    expect(c.sharesMild).toEqual(['My custom mild share'])
    expect(c.sharesSpicy.length).toBeGreaterThan(0) // empty quadrant -> built-in fallback
  })

  it('mad-libs: a bare template derives readable blanks from its {tokens}', () => {
    const out = madLibs.buildConfig!('seed', { rows: [{ template: 'The {adjective} {animal} went {verbing}.' }], rounds: 1 })
    const c = out.rounds[0]!.content as { blanks: Array<{ id: string; label: string }> }
    expect(c.blanks.map((b) => b.id)).toEqual(['adjective', 'animal', 'verbing'])
    expect(c.blanks[0]!.label).toBe('An adjective')
    expect(c.blanks[2]!.label).toBe('A verb ending in -ing')
  })
})

// One meta-test that holds for EVERY deck-feedable game (present and future), so a new
// pool game can't ship a broken or inconsistent contentPool. Covers: the built-in pool is
// internally valid (every default row survives its own fromRow), the lift-to-rows change
// is a pure regression (rows == no-opts), a creator deck overrides the play, the catalog
// stays in sync, and the saved defaultConfig is a lean preview rather than the whole bank.
describe('every deck-feedable game is self-consistent (meta)', () => {
  const feedable = builtinPlugins.filter((p) => p.contentPool)

  it('covers all 21 deck-fed flagships', () => {
    expect(feedable.map((p) => p.manifest.id).sort()).toEqual(
      ['backronym', 'ballpark', 'categories', 'faker', 'fib-finder', 'hivemind', 'mad-libs', 'most-likely', 'open-mic', 'over-under', 'quip-clash', 'quiz-or-die', 'sketch-spot', 'spectrum', 'split-room', 'survey', 'tier-list', 'truth-or-share', 'type-the-answer', 'what-you-didnt-know', 'would-you-rather'].sort(),
    )
  })

  for (const plugin of feedable) {
    it(`${plugin.manifest.id}: pool is valid, regresses, overrides, syncs, and stays lean`, () => {
      const pool = plugin.contentPool!
      expect(pool.defaultRows.length).toBeGreaterThan(0)
      // No duplicate rows in the built-in pool (a dup would replay the same round/prompt).
      const serialized = pool.defaultRows.map((r) => JSON.stringify(r))
      expect(new Set(serialized).size, `${plugin.manifest.id} has duplicate built-in rows`).toBe(serialized.length)
      // Every built-in row survives its OWN fromRow (the pool matches the mapper it ships).
      const mapped = pool.defaultRows.map((r) => pool.fromRow(r)).filter(Boolean)
      expect(mapped.length, `${plugin.manifest.id}: all built-in rows map`).toBe(pool.defaultRows.length)
      // Building over the explicit built-in rows equals building with none (regression).
      // (defaultRows are already in pool-row shape and bypass fromRow; an external deck
      // goes through fromRow, which the per-game tests cover with real decks.)
      expect(plugin.buildConfig!('seed', { rows: pool.defaultRows })).toEqual(plugin.buildConfig!('seed'))
      // A tiny creator deck still yields a playable game (never throws, never empty).
      expect(plugin.buildConfig!('seed', { rows: pool.defaultRows.slice(0, 1) }).rounds.length).toBeGreaterThan(0)
      // Catalog advertises it (so MCP + the remix UI can find it) and declares the same
      // deck kind + answer columns the plugin does.
      const entry = gameCatalog.find((g) => g.id === plugin.manifest.id)!
      expect(entry.pool?.deckKind).toBe(pool.deckKind)
      expect(entry.pool?.answerColumns).toEqual(pool.answerColumns)
      // The saved defaultConfig is a lean preview, not the entire content bank.
      expect(JSON.stringify(plugin.defaultConfig).length, `${plugin.manifest.id} defaultConfig should be lean`).toBeLessThan(8000)
      // A typed (quiz/card) pool must declare `requires` so the remix picker can filter out
      // decks of the wrong shape; a prompt/generic pool takes any prompt/template deck.
      if (pool.deckKind === 'quiz' || pool.deckKind === 'card') {
        expect(pool.requires?.length, `${plugin.manifest.id} (multi-column) needs requires`).toBeGreaterThan(0)
        // The built-in pool's own columns satisfy its requires (self-consistency).
        const keys = Object.keys(pool.defaultRows[0] ?? {})
        for (const group of pool.requires ?? []) {
          expect(group.some((k) => keys.includes(k)), `${plugin.manifest.id} defaultRows satisfy ${group.join('/')}`).toBe(true)
        }
      }
    })
  }
})

// Beyond "the output parses" (compositions.test) and "the pool is consistent" (the
// meta-test), lock the SEMANTIC shape each new quick-win/standalone game builds: a
// swapped or wrong-field bug would still parse-valid, so assert the derived shape.
describe('new games build the shape they claim', () => {
  const plugin = (id: string) => builtinPlugins.find((p) => p.manifest.id === id)!
  const rounds = (id: string) => plugin(id).buildConfig!('seed').rounds as RoundInstance[]

  it('over-under: guess rounds with [Over, Under] options + a 0/1 correct side', () => {
    for (const r of rounds('over-under')) {
      expect(r.block).toBe('guess')
      const c = r.content as { options: Array<{ label: string }>; correct: number }
      expect(c.options.map((o) => o.label)).toEqual(['Over', 'Under'])
      expect([0, 1]).toContain(c.correct)
    }
  })

  it('would-you-rather: poll rounds with exactly two choices', () => {
    for (const r of rounds('would-you-rather')) {
      expect(r.block).toBe('poll')
      expect((r.content as { options: unknown[] }).options).toHaveLength(2)
    }
  })

  it('tier-list: rate rounds on a labelled tier scale', () => {
    for (const r of rounds('tier-list')) {
      expect(r.block).toBe('rate')
      const c = r.content as { scale: { kind: string }; categories: Array<{ id: string }>; subject: string }
      expect(c.scale.kind).toBe('levels')
      expect(c.categories[0]!.id).toBe('tier')
      expect(c.subject.length).toBeGreaterThan(0)
    }
  })

  it('categories: a single uppercase letter + at least one category', () => {
    for (const r of rounds('categories')) {
      expect(r.block).toBe('categories')
      const c = r.content as { letter: string; categories: unknown[] }
      expect(c.letter).toMatch(/^[A-Z]$/)
      expect(c.categories.length).toBeGreaterThan(0)
    }
  })

  it('survey: a parsed board of {text, points}, highest-ranked usable', () => {
    for (const r of rounds('survey')) {
      expect(r.block).toBe('survey')
      const c = r.content as { answers: Array<{ text: string; points: number }> }
      expect(c.answers.length).toBeGreaterThanOrEqual(2)
      expect(c.answers.every((a) => a.text.length > 0 && a.points > 0)).toBe(true)
    }
  })

  it('type-the-answer: answer rounds with at least one accepted answer', () => {
    for (const r of rounds('type-the-answer')) {
      expect(r.block).toBe('answer')
      expect((r.content as { answers: string[] }).answers.length).toBeGreaterThan(0)
    }
  })

  it('spectrum: spectrum rounds with two non-empty dial poles', () => {
    for (const r of rounds('spectrum')) {
      expect(r.block).toBe('spectrum')
      const c = r.content as { leftLabel: string; rightLabel: string }
      expect(c.leftLabel.length).toBeGreaterThan(0)
      expect(c.rightLabel.length).toBeGreaterThan(0)
    }
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
