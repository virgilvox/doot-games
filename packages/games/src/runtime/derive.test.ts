import type { GameComposition } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { quipBlock } from '../blocks/quip/block'
import { voteBlock } from '../blocks/vote/block'
import { buildDeriveContent, buildRevealSummary, seededShuffle } from './derive'

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
