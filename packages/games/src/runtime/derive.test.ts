import type { GameComposition } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { fillBlock } from '../blocks/fill/block'
import { quipBlock } from '../blocks/quip/block'
import { voteBlock } from '../blocks/vote/block'
import { buildDeriveContent, buildRevealSummary, crownHeadline, ownMakeText, seededShuffle } from './derive'

describe('seededShuffle', () => {
  it('is deterministic for a given seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(seededShuffle('room-A')(items)).toEqual(seededShuffle('room-A')(items))
  })
  it('produces different orders for different seeds (usually) and does not mutate input', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    const a = seededShuffle('room-A')(items)
    const b = seededShuffle('room-B')(items)
    expect(a).not.toEqual(items) // shuffled
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]) // original untouched
    expect(a).not.toEqual(b) // different seed -> different order
  })
})

// A two-phase plugin shape for the helper tests.
const plugin = {
  manifest: { id: 't', name: 'T', version: '0', author: 'x', capabilities: [] },
  blocks: [quipBlock, voteBlock],
  defaultConfig: { title: 'T', rounds: [] },
} as never

const config: GameComposition = {
  title: 'T',
  rounds: [
    { block: 'quip', content: { prompt: 'P', placeholder: '', maxLength: 80, timer: null } },
    { block: 'vote', content: { prompt: 'V', options: [], mode: 'field', timer: 30 } },
  ],
}
const players = () => [{ id: 'A', name: 'Ada', joinedAtIndex: 0 }]

describe('buildDeriveContent', () => {
  it('derives a vote round from the previous round by default (RoundInstance.from)', () => {
    const derive = buildDeriveContent(plugin, config, 'seed', players)
    const inputsFor = (i: number) => (i === 0 ? new Map([['A', { text: 'apple' }]]) : new Map())
    const out = derive(1, inputsFor)
    expect(out).toBeTruthy()
    expect((out?.publish as { options: unknown[] }).options).toEqual([{ id: 'o0', text: 'apple' }])
    expect((out?.answer as { authors: Record<string, string> }).authors).toEqual({ o0: 'A' })
  })
  it('returns undefined for a static (non-derived) round', () => {
    const derive = buildDeriveContent(plugin, config, 'seed', players)
    expect(derive(0, () => new Map())).toBeUndefined() // round 0 is a quip (no derive)
  })
  it('threads the source round answer key into the derive context (faker -> accuse)', () => {
    // A 'probe' block whose derive echoes back the source answer it was handed, to
    // prove the getAnswerKey accessor reaches sources[i].answer.
    const probe = {
      kind: 'probe',
      name: 'Probe',
      contentSchema: quipBlock.contentSchema,
      defaultContent: () => ({}),
      emptyInput: () => ({ text: '' }),
      PlayerInput: {} as never,
      HostDisplay: {} as never,
      derive: (ctx: { sources: Array<{ answer?: unknown }> }) => ({ publish: {}, answer: ctx.sources[0]?.answer }),
    } as never
    const probePlugin = { ...(plugin as object), blocks: [quipBlock, probe] } as never
    const probeConfig: GameComposition = {
      title: 'T',
      rounds: [
        { block: 'quip', content: { prompt: 'P', placeholder: '', maxLength: 80, timer: null } },
        { block: 'probe', content: {} },
      ],
    }
    const derive = buildDeriveContent(probePlugin, probeConfig, 'seed', players, (i) =>
      i === 0 ? { fakerPid: 'A', word: 'Banana' } : undefined,
    )
    expect(derive(1, () => new Map())?.answer).toEqual({ fakerPid: 'A', word: 'Banana' })
  })
})

describe('ownMakeText (hide your own answer in a judge round)', () => {
  it('renders the voter own quip text so the vote view can hide it', () => {
    const text = ownMakeText(plugin, config, 1, (i) => (i === 0 ? { text: 'apple' } : undefined))
    expect(text).toBe('apple')
  })

  it('renders a fill submission via the source block toVoteText (the fill->vote gap)', () => {
    const fillPlugin = { ...(plugin as object), blocks: [fillBlock, voteBlock] } as never
    const fillConfig: GameComposition = {
      title: 'T',
      rounds: [
        {
          block: 'fill',
          content: {
            prompt: 'P',
            template: 'My {animal} can {verb}.',
            blanks: [
              { id: 'animal', label: 'animal' },
              { id: 'verb', label: 'verb' },
            ],
            timer: null,
            showTemplate: false,
          },
        },
        { block: 'vote', content: { prompt: 'V', options: [], mode: 'field', timer: 30 } },
      ],
    }
    const text = ownMakeText(fillPlugin, fillConfig, 1, (i) =>
      i === 0 ? { values: { animal: 'cat', verb: 'fly' } } : undefined,
    )
    // Matches exactly what the derive renders as the option text, so the player UI
    // can hide it. The old `.text`-only path returned '' here (the bug).
    expect(text).toBe('My cat can fly.')
  })

  it('is empty for a non-judge round or a player with no submission', () => {
    expect(ownMakeText(plugin, config, 0, () => ({ text: 'apple' }))).toBe('') // quip is not a judge
    expect(ownMakeText(plugin, config, 1, () => undefined)).toBe('') // no submission
  })
})

describe('crownHeadline (tie handling / co-crown)', () => {
  it('crowns a single winner', () => {
    expect(crownHeadline([{ name: 'Ann', score: 900 }, { name: 'Bob', score: 400 }])).toBe('Ann wins')
  })
  it('co-crowns a two-way tie at the top', () => {
    expect(crownHeadline([{ name: 'Ann', score: 900 }, { name: 'Bob', score: 900 }, { name: 'Cal', score: 100 }])).toBe(
      'Ann & Bob tie for the win',
    )
  })
  it('names an N-way tie', () => {
    const lb = [{ name: 'Ann', score: 500 }, { name: 'Bob', score: 500 }, { name: 'Cal', score: 500 }]
    expect(crownHeadline(lb)).toBe('3-way tie: Ann, Bob & Cal')
  })
  it('returns null when nobody scored above 0 (so the caller falls back)', () => {
    expect(crownHeadline([{ name: 'Ann', score: 0 }, { name: 'Bob', score: 0 }])).toBeNull()
    expect(crownHeadline([])).toBeNull()
    expect(crownHeadline(undefined)).toBeNull()
  })
})

describe('buildRevealSummary', () => {
  it('returns undefined for a block without revealSummary, a payload for vote', () => {
    const runtime = new Map<number, unknown>([[1, { prompt: 'V', options: [{ id: 'o0', text: 'apple' }], mode: 'field', timer: 30 }]])
    const answers = new Map<number, unknown>([[1, { authors: { o0: 'A' }, names: { A: 'Ada' } }]])
    const reveal = buildRevealSummary(
      plugin,
      config,
      players,
      (i) => runtime.get(i),
      (i) => answers.get(i),
    )
    expect(reveal(0, () => new Map())).toBeUndefined() // quip has no revealSummary
    const summary = reveal(1, () => new Map([['B', { choice: 'o0' }]])) as { winnerId: string }
    expect(summary.winnerId).toBe('o0')
  })
})
