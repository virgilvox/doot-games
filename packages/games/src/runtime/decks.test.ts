import type { GameComposition } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { redactDecks } from '../catalog'
import {
  ballparkFromRow,
  choiceFromRow,
  factFromRow,
  frameFromRow,
  inlineDecks,
  poolRowsFor,
  promptFromRow,
  resolveComposition,
  secretFromRow,
  storyFromRow,
} from './decks'

// Mode-1 binding never calls getBlock, so a blocks-free plugin is fine for those.
const plugin = { manifest: { id: 't', name: 'T', version: '0', author: 'x', capabilities: [] }, blocks: [], defaultConfig: { title: 'T', rounds: [] } } as never

const triviaDeck = {
  columns: [
    { key: 'q', label: 'Question', type: 'text' as const },
    { key: 'pic', label: 'Image', type: 'image' as const },
    { key: 'a', label: 'Answer', type: 'text' as const },
  ],
  rows: [
    { q: 'Q1', pic: 'https://img/1.png', a: 'A1' },
    { q: 'Q2', pic: 'https://img/2.png', a: 'A2' },
    { q: 'Q3', pic: 'https://img/3.png', a: 'A3' },
  ],
}
const cfg = (rounds: GameComposition['rounds'], decks?: GameComposition['decks']): GameComposition => ({ title: 'T', rounds, decks })

describe('inlineDecks', () => {
  it('keeps inline decks and drops references', () => {
    const out = inlineDecks({ a: { inline: triviaDeck }, b: { ref: 'lib_1' } })
    expect(Object.keys(out)).toEqual(['a'])
    expect(out.a).toBe(triviaDeck)
  })
})

describe('promptFromRow (Prompt Deck row -> a single-prompt pool row)', () => {
  it('reads the prompt column, else the first non-empty text cell; null when no text', () => {
    expect(promptFromRow({ prompt: 'hi' })).toEqual({ prompt: 'hi' })
    expect(promptFromRow({ question: 'Q', n: 3 })).toEqual({ prompt: 'Q' }) // any one text column
    expect(promptFromRow({ prompt: '   ', other: 'x' })).toEqual({ prompt: 'x' }) // blank prompt -> first text
    expect(promptFromRow({ n: 5 })).toBeNull()
    expect(promptFromRow({})).toBeNull()
  })
})

describe('typed-pool row mappers (creator deck row -> a game pool row)', () => {
  it('frameFromRow: reads/normalizes a dividing frame, always with an {x} blank', () => {
    expect(frameFromRow({ frame: 'Would you {x} for $1M?' })).toEqual({ frame: 'Would you {x} for $1M?' })
    expect(frameFromRow({ prompt: 'Is it ok to {y}?' })).toEqual({ frame: 'Is it ok to {x}?' }) // other placeholder normalized
    expect(frameFromRow({ dilemma: 'Skydive naked' })).toEqual({ frame: 'Skydive naked {x}' }) // no blank -> appended
    expect(frameFromRow({ n: 3 })).toBeNull()
  })

  it('secretFromRow: a public category + the secret word', () => {
    expect(secretFromRow({ category: 'Animals', word: 'Otter' })).toEqual({ category: 'Animals', word: 'Otter' })
    expect(secretFromRow({ topic: 'Food', secret: 'Bagel' })).toEqual({ category: 'Food', word: 'Bagel' }) // synonyms
    expect(secretFromRow({ a: 'Sports', b: 'Curling' })).toEqual({ category: 'Sports', word: 'Curling' }) // positional fallback
    expect(secretFromRow({ category: 'Only one' })).toBeNull()
  })

  it('factFromRow: a question + its true answer', () => {
    expect(factFromRow({ question: 'A group of owls is a ___', truth: 'parliament' })).toEqual({ question: 'A group of owls is a ___', truth: 'parliament' })
    expect(factFromRow({ q: 'Capital?', a: 'Paris' })).toEqual({ question: 'Capital?', truth: 'Paris' })
    expect(factFromRow({ question: 'no answer' })).toBeNull()
  })

  it('ballparkFromRow: a numeric answer, tolerant of commas, skips non-numbers', () => {
    expect(ballparkFromRow({ prompt: 'How far to the Moon?', answer: '384,400', unit: 'km' })).toEqual({ prompt: 'How far to the Moon?', answer: 384400, unit: 'km', subject: '' })
    expect(ballparkFromRow({ prompt: 'Bones?', answer: 206 })).toEqual({ prompt: 'Bones?', answer: 206, unit: '', subject: '' })
    expect(ballparkFromRow({ prompt: 'No number', answer: 'lots' })).toBeNull()
    expect(ballparkFromRow({ prompt: 'Missing' })).toBeNull()
  })

  it('choiceFromRow: options from a delimited column or numbered columns; correct as index or text', () => {
    expect(choiceFromRow({ prompt: 'Pick', options: 'A|B|C', correct: 2 })).toEqual({ prompt: 'Pick', options: 'A|B|C', correct: 1 }) // 1-based -> 0-based
    expect(choiceFromRow({ question: 'Pick', option1: 'A', option2: 'B', option3: 'C', correct: 'B' })).toEqual({ prompt: 'Pick', options: 'A|B|C', correct: 1 }) // by text
    expect(choiceFromRow({ prompt: 'Pick', options: 'A, B, C', answer: 'C' })).toEqual({ prompt: 'Pick', options: 'A|B|C', correct: 2 }) // comma split + answer synonym
    expect(choiceFromRow({ prompt: 'Pick', options: 'A|B', correct: 9 })).toEqual({ prompt: 'Pick', options: 'A|B', correct: 0 }) // out of range -> 0
    expect(choiceFromRow({ prompt: 'only one', options: 'A' })).toBeNull() // needs >= 2 options
    // A pipe-separated option may itself contain a comma; it must NOT be split apart.
    expect(choiceFromRow({ prompt: 'Pick', options: 'Salt, pepper|Just salt|Neither', correct: 1 })).toEqual({ prompt: 'Pick', options: 'Salt, pepper|Just salt|Neither', correct: 0 })
  })

  it('storyFromRow: keeps a blanks JSON column, else leaves blanks empty for derivation', () => {
    expect(storyFromRow({ template: 'A {x} and a {y}' })).toEqual({ template: 'A {x} and a {y}', blanks: '' })
    expect(storyFromRow({ template: 'A {x}', blanks: '[{"id":"x","label":"A thing"}]' })).toEqual({ template: 'A {x}', blanks: '[{"id":"x","label":"A thing"}]' })
    expect(storyFromRow({ template: 'no blanks here' })).toBeNull()
  })
})

describe('poolRowsFor (creator deck -> pool game rows)', () => {
  const pool = { defaultRows: [{ prompt: 'D1' }, { prompt: 'D2' }], deckKind: 'prompt' as const, fromRow: promptFromRow }
  const deck = (rows: Array<Record<string, string | number>>) => ({ columns: [{ key: 'prompt', label: 'P', type: 'text' as const }], rows })
  it('replaces the built-in pool by default', () => {
    expect(poolRowsFor(pool, deck([{ prompt: 'A' }, { prompt: 'B' }]))).toEqual([{ prompt: 'A' }, { prompt: 'B' }])
  })
  it('appends to the built-in pool when merge=append', () => {
    expect(poolRowsFor({ ...pool, merge: 'append' }, deck([{ prompt: 'A' }]))).toEqual([{ prompt: 'D1' }, { prompt: 'D2' }, { prompt: 'A' }])
  })
  it('falls back to defaultRows when the deck maps to nothing (garbage or empty)', () => {
    expect(poolRowsFor(pool, deck([{ n: 1 }]))).toEqual(pool.defaultRows)
    expect(poolRowsFor(pool, deck([]))).toEqual(pool.defaultRows)
  })
})

describe('resolveComposition', () => {
  it('passes plain rounds through unchanged (no-op)', () => {
    const config = cfg([{ block: 'poll', content: { prompt: 'P', options: [] } }])
    const out = resolveComposition(plugin, config, 'seed')
    expect(out.rounds).toEqual(config.rounds)
    expect((out as { decks?: unknown }).decks).toBeUndefined() // decks resolved away
  })

  it('binds a single field from a drawn row', () => {
    const config = cfg(
      [{ block: 'guess', content: { prompt: '', options: [], timer: 20 }, bindings: { prompt: { deck: 'd', column: 'q' } } }],
      { d: { inline: triviaDeck } },
    )
    const out = resolveComposition(plugin, config, 'seed')
    expect(out.rounds).toHaveLength(1)
    expect(['Q1', 'Q2', 'Q3']).toContain((out.rounds[0]!.content as { prompt: string }).prompt)
    // The authored timer (a non-bound field) is preserved.
    expect((out.rounds[0]!.content as { timer: number }).timer).toBe(20)
  })

  it('keeps fields bound to the same deck correlated to ONE row', () => {
    const config = cfg(
      [
        {
          block: 'guess',
          content: { prompt: '', image: '', subject: '', options: [] },
          bindings: { prompt: { deck: 'd', column: 'q' }, image: { deck: 'd', column: 'pic' }, subject: { deck: 'd', column: 'a' } },
        },
      ],
      { d: { inline: triviaDeck } },
    )
    const c = resolveComposition(plugin, config, 'seed').rounds[0]!.content as { prompt: string; image: string; subject: string }
    // The three filled fields must come from the SAME row (correlation), not a mix.
    expect(triviaDeck.rows).toContainEqual({ q: c.prompt, pic: c.image, a: c.subject })
  })

  it('draws N distinct rows into N rounds (and is deterministic by seed)', () => {
    const config = cfg(
      [{ block: 'guess', content: { prompt: '', options: [] }, draw: 3, bindings: { prompt: { deck: 'd', column: 'q' } } }],
      { d: { inline: triviaDeck } },
    )
    const prompts = () => resolveComposition(plugin, config, 'room-A').rounds.map((r) => (r.content as { prompt: string }).prompt)
    expect(prompts()).toHaveLength(3)
    expect([...prompts()].sort()).toEqual(['Q1', 'Q2', 'Q3']) // all three, distinct
    expect(prompts()).toEqual(prompts()) // deterministic
  })

  it('cycles rows when draw exceeds the deck size, and clamps to 50 rounds', () => {
    const small = { columns: [{ key: 'q', label: 'Q', type: 'text' as const }], rows: [{ q: 'only' }] }
    const config = cfg(
      [{ block: 'poll', content: { prompt: '' }, draw: 60, bindings: { prompt: { deck: 'd', column: 'q' } } }],
      { d: { inline: small } },
    )
    const out = resolveComposition(plugin, config, 'seed')
    expect(out.rounds).toHaveLength(50) // clamped
    expect((out.rounds[0]!.content as { prompt: string }).prompt).toBe('only') // cycled
  })

  it('leaves an authored value when the deck or column is missing', () => {
    const config = cfg(
      [{ block: 'poll', content: { prompt: 'authored' }, bindings: { prompt: { deck: 'nope', column: 'q' } } }],
      { d: { inline: triviaDeck } },
    )
    expect((resolveComposition(plugin, config, 'seed').rounds[0]!.content as { prompt: string }).prompt).toBe('authored')
  })

  it('sets a nested dotted path (e.g. options.0.label)', () => {
    const config = cfg(
      [{ block: 'guess', content: { prompt: 'P', options: [{ id: 'o0', label: '' }, { id: 'o1', label: 'b' }] }, bindings: { 'options.0.label': { deck: 'd', column: 'q' } } }],
      { d: { inline: triviaDeck } },
    )
    const opts = (resolveComposition(plugin, config, 'seed').rounds[0]!.content as { options: Array<{ label: string }> }).options
    expect(['Q1', 'Q2', 'Q3']).toContain(opts[0]!.label)
    expect(opts[1]!.label).toBe('b') // untouched
  })

  it('redaction → resolution: an answer-bound column is the real value for the owner but null after redactDecks (invariant #3)', () => {
    // A guess round whose `correct` answer is pulled from a deck column.
    const answerDeck = {
      columns: [
        { key: 'q', label: 'Q', type: 'text' as const },
        { key: 'ans', label: 'Answer', type: 'text' as const },
      ],
      rows: [{ q: 'Capital of France?', ans: 'Paris' }],
    }
    const rounds = [
      {
        block: 'guess',
        content: { prompt: '', correct: '', options: [] },
        bindings: { prompt: { deck: 'd', column: 'q' }, correct: { deck: 'd', column: 'ans' } },
      },
    ]
    // Owner sees the real answer (so the host can withhold it, then reveal it).
    const owner = resolveComposition(plugin, cfg(rounds, { d: { inline: answerDeck } }), 'seed')
    expect((owner.rounds[0]!.content as { correct: string }).correct).toBe('Paris')

    // A non-owner gets the redacted decks; the answer column is nulled, so the
    // resolved round carries no answer. The prompt (a non-answer column) survives.
    const redacted = redactDecks(rounds as never, { d: { inline: answerDeck } } as never)
    const viewer = resolveComposition(plugin, cfg(rounds, redacted as never), 'seed')
    expect((viewer.rounds[0]!.content as { correct: string | null }).correct).toBeNull()
    expect((viewer.rounds[0]!.content as { prompt: string }).prompt).toBe('Capital of France?')
  })

  it('mode 2: builds whole content from a row via the block pool descriptor', () => {
    const poolBlock = {
      kind: 'q',
      name: 'Q',
      contentSchema: {} as never,
      defaultContent: () => ({}),
      emptyInput: () => ({}),
      PlayerInput: {} as never,
      HostDisplay: {} as never,
      pool: { fromRow: (row: Record<string, string | number>, s: { timer?: number }) => ({ prompt: row.q, answer: row.a, timer: s.timer ?? 30 }) },
    } as never
    const poolPlugin = { manifest: { id: 'p', name: 'P', version: '0', author: 'x', capabilities: [] }, blocks: [poolBlock], defaultConfig: { title: 'P', rounds: [] } } as never
    const config = cfg([{ block: 'q', content: { timer: 45 }, draw: 2, pool: { deck: 'd' } }], { d: { inline: triviaDeck } })
    const out = resolveComposition(poolPlugin, config, 'seed')
    expect(out.rounds).toHaveLength(2)
    for (const r of out.rounds) {
      const c = r.content as { prompt: string; answer: string; timer: number }
      expect(triviaDeck.rows).toContainEqual({ q: c.prompt, pic: expect.any(String), a: c.answer }) // prompt+answer from one row
      expect(c.timer).toBe(45) // shared setting merged
    }
  })
})
