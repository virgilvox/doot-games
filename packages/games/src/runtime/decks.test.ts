import type { GameComposition } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { redactDecks } from '../catalog'
import { inlineDecks, resolveComposition } from './decks'

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
