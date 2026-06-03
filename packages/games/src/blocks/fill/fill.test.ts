import type { GameComposition } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { madLibs } from '../../games/mad-libs'
import { buildDeriveContent } from '../../runtime/derive'
import { type FillContent, type FillInput, fillBlock, renderFilled } from './block'

describe('renderFilled', () => {
  it('substitutes {id} placeholders and falls back to a blank', () => {
    expect(renderFilled('The {a} ate a {b}.', { a: 'cat', b: 'shoe' })).toBe('The cat ate a shoe.')
    expect(renderFilled('The {a} ate a {b}.', { a: 'cat' })).toBe('The cat ate a ___.')
  })
})

describe('fill block', () => {
  const content: FillContent = {
    subject: '',
    prompt: 'Fill it',
    template: 'A {adj} {animal}.',
    blanks: [
      { id: 'adj', label: 'An adjective' },
      { id: 'animal', label: 'An animal' },
    ],
    maxLength: 30,
    timer: null,
  }
  it('is complete only when every blank is filled', () => {
    expect(fillBlock.isComplete!(content, { values: { adj: 'big' } })).toBe(false)
    expect(fillBlock.isComplete!(content, { values: { adj: 'big', animal: 'dog' } })).toBe(true)
    expect(fillBlock.isComplete!(content, { values: { adj: ' ', animal: 'dog' } })).toBe(false)
  })
  it('renders its submission to a votable story via toVoteText', () => {
    const input: FillInput = { values: { adj: 'sleepy', animal: 'llama' } }
    expect(fillBlock.toVoteText!(content, input)).toBe('A sleepy llama.')
  })
})

describe('Mad Libs fill -> vote derivation', () => {
  it('derives vote options that are each player\'s completed story', () => {
    const config: GameComposition = {
      title: 'ML',
      rounds: [
        {
          block: 'fill',
          content: {
            subject: '',
            prompt: 'Fill it',
            template: 'My {animal} can {verb}.',
            blanks: [
              { id: 'animal', label: 'An animal' },
              { id: 'verb', label: 'A verb' },
            ],
            maxLength: 30,
            timer: null,
          },
        },
        { block: 'vote', content: { prompt: 'Funniest', options: [], mode: 'field', timer: null } },
      ],
    }
    const players = () => [
      { id: 'A', name: 'Ada', joinedAtIndex: 0 },
      { id: 'B', name: 'Bo', joinedAtIndex: 0 },
    ]
    const derive = buildDeriveContent(madLibs, config, 'seed', players)
    const inputsFor = (i: number) =>
      i === 0
        ? new Map<string, unknown>([
            ['A', { values: { animal: 'cat', verb: 'fly' } }],
            ['B', { values: { animal: 'dog', verb: 'sing' } }],
          ])
        : new Map<string, unknown>()
    const out = derive(1, inputsFor)
    const texts = (out?.publish as { options: Array<{ text: string }> }).options.map((o) => o.text).sort()
    expect(texts).toEqual(['My cat can fly.', 'My dog can sing.'])
  })
})
