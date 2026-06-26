import type { GameComposition } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { fillBlock } from '../blocks/fill/block'
import { quipBlock } from '../blocks/quip/block'
import { voteBlock } from '../blocks/vote/block'
import { chainOrder, chainSourceFor } from './chain'
import {
  buildAssignContent,
  buildDeriveContent,
  buildRevealSummary,
  crownHeadline,
  ownMakeText,
  seededShuffle,
} from './derive'

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

  it('fills an eligible non-submitter with a safety answer through the real runtime path', () => {
    // The quip round carries a safety pool; Bea is eligible (joinedAtIndex 0) but
    // never submits, so the derived vote round must include her safety answer,
    // flagged in the withheld key. Ada submitted; a late joiner (Cy, index 1) must NOT.
    const safetyConfig: GameComposition = {
      title: 'T',
      rounds: [
        { block: 'quip', content: { prompt: 'P', placeholder: '', maxLength: 80, timer: null, safetyAnswers: ['(blank stare)'] } },
        { block: 'vote', content: { prompt: 'V', options: [], mode: 'field', timer: 30 } },
      ],
    }
    const roster = () => [
      { id: 'A', name: 'Ada', joinedAtIndex: 0 },
      { id: 'B', name: 'Bea', joinedAtIndex: 0 },
      { id: 'C', name: 'Cy', joinedAtIndex: 1 }, // joined at the vote round: not eligible for the quip
    ]
    const derive = buildDeriveContent(plugin, safetyConfig, 'seed', roster)
    const out = derive(1, (i) => (i === 0 ? new Map([['A', { text: 'apple' }]]) : new Map()))
    const publish = out?.publish as { options: Array<{ id: string; text: string }> }
    const answer = out?.answer as { authors: Record<string, string>; safety?: string[] }
    const bea = publish.options.find((o) => answer.authors[o.id] === 'B')
    expect(bea?.text).toBe('(blank stare)') // Bea got the safety answer
    expect(answer.safety).toContain(bea!.id) // flagged
    expect(Object.values(answer.authors)).not.toContain('C') // the late joiner is not filled
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
  it('lists up to four tied names in full', () => {
    const lb = ['Ann', 'Bob', 'Cal', 'Dee'].map((name) => ({ name, score: 500 }))
    expect(crownHeadline(lb)).toBe('4-way tie: Ann, Bob, Cal & Dee')
  })
  it('caps a big tie so the headline stays one short line (no wall of names)', () => {
    // 76 players all correct: name the first three, summarise the rest.
    const lb = Array.from({ length: 76 }, (_, i) => ({ name: `Bot${i + 1}`, score: 22 }))
    expect(crownHeadline(lb)).toBe('76-way tie: Bot1, Bot2, Bot3 & 73 more')
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

describe('buildAssignContent (per-player content from a prior round: the chain)', () => {
  // A synthetic chain block: each player receives their LEFT neighbor's submission
  // from the source round (sources[0] = the prior round, by RoundInstance.from
  // default). The ring is seated by sorted pid (stable across rounds), so the
  // rotation reads a deterministic neighbor. This exercises the new wiring: that
  // buildAssignContent threads `inputsFor` through and builds `sources` from `from`.
  const chainBlock = {
    kind: 'dchain',
    name: 'Chain',
    contentSchema: quipBlock.contentSchema,
    defaultContent: () => ({}),
    emptyInput: () => ({ text: '' }),
    PlayerInput: {} as never,
    HostDisplay: {} as never,
    assignContent: (ctx: {
      players: Array<{ id: string }>
      sources: Array<{ inputs: Map<string, unknown> }>
    }) => {
      const order = chainOrder(
        ctx.players.map((p) => p.id),
        (x) => x, // sorted seating, stable across rounds
      )
      const prev = ctx.sources[0]?.inputs ?? new Map<string, unknown>()
      const perPlayer: Record<string, unknown> = {}
      for (const p of ctx.players) {
        const src = chainSourceFor(order, 1, p.id) // left neighbor
        perPlayer[p.id] = { received: src ? prev.get(src) : undefined }
      }
      return { perPlayer }
    },
  } as never
  const chainPlugin = { ...(plugin as object), blocks: [quipBlock, chainBlock] } as never
  const chainConfig: GameComposition = {
    title: 'Chain',
    rounds: [
      { block: 'quip', content: { prompt: 'Draw a thing', placeholder: '', maxLength: 80, timer: null } },
      { block: 'dchain', content: {} }, // from defaults to [0]
    ],
  }
  const trio = () => [
    { id: 'A', name: 'Ada', joinedAtIndex: 0 },
    { id: 'B', name: 'Bo', joinedAtIndex: 0 },
    { id: 'C', name: 'Cy', joinedAtIndex: 0 },
  ]

  it('hands each player their left-neighbor prior-round input (sources threaded from `from`)', () => {
    const assign = buildAssignContent(chainPlugin, chainConfig, 'seed', trio)
    const round0 = new Map<string, unknown>([
      ['A', { text: 'cat' }],
      ['B', { text: 'dog' }],
      ['C', { text: 'fish' }],
    ])
    const out = assign(1, (i) => (i === 0 ? round0 : new Map()))
    const perPlayer = out?.perPlayer as Record<string, { received?: { text: string } }>
    // Ring is sorted ['A','B','C']; left neighbor (one seat back, wrapping):
    expect(perPlayer.A?.received?.text).toBe('fish') // A <- C
    expect(perPlayer.B?.received?.text).toBe('cat') // B <- A
    expect(perPlayer.C?.received?.text).toBe('dog') // C <- B
  })

  it('returns undefined for a round whose block has no assignContent', () => {
    const assign = buildAssignContent(chainPlugin, chainConfig, 'seed', trio)
    expect(assign(0, () => new Map())).toBeUndefined() // the quip make round
  })
})
