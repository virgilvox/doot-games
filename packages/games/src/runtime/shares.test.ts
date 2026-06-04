import type { GameComposition } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { buildDeriveContent } from './derive'
import { pickShare, shareValues } from './shares'

const identity = <T>(x: T[]): T[] => x
const plugin = { manifest: { id: 't', name: 'T', version: '0', author: 'x', capabilities: [] }, blocks: [], defaultConfig: { title: 'T', rounds: [] } } as never

describe('pickShare / shareValues', () => {
  it('lists non-empty shares of the requested kind, in player order', () => {
    const inputs = new Map([
      ['a', { text: 'hi' }], // no media
      ['b', { media: 'data:img/b' }],
      ['c', { media: '' }], // empty media ignored
      ['d', { media: 'data:img/d' }],
    ])
    expect(shareValues(inputs, 'media')).toEqual(['data:img/b', 'data:img/d'])
    expect(pickShare(inputs, 'media', 'first', identity)).toBe('data:img/b')
  })

  it('returns undefined when nobody shared that kind', () => {
    expect(pickShare(new Map([['a', { text: 'x' }]]), 'media', 'random', identity)).toBeUndefined()
  })
})

describe('buildDeriveContent fromShares (play-time variable)', () => {
  const config: GameComposition = {
    title: 'T',
    rounds: [
      { block: 'collect', content: { prompt: 'Share a photo', kind: 'photo' } },
      { block: 'rate', content: { prompt: 'Rate it', image: '' }, fromShares: { field: 'image', pick: 'first' } },
    ],
  }
  const derive = buildDeriveContent(plugin, config, 'seed', () => [])

  it("fills a later round's field from the prior collect round at advance", () => {
    const inputsFor = (i: number) => (i === 0 ? new Map([['a', { media: 'data:img/a' }]]) : new Map())
    const out = derive(1, inputsFor)
    expect((out?.publish as { image: string }).image).toBe('data:img/a')
  })

  it('leaves the authored field when nobody shared', () => {
    const out = derive(1, () => new Map())
    expect((out?.publish as { image: string }).image).toBe('')
  })

  it('is a no-op for a round without fromShares (returns undefined for a plain block)', () => {
    expect(derive(0, () => new Map())).toBeUndefined()
  })
})
