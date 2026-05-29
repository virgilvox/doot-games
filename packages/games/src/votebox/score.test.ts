import type { ScoreContext, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { type VoteBoxConfig, type VoteBoxInput, defaultVoteBoxConfig } from './config'
import { voteBoxAnswerKeys, voteBoxRedactConfig, voteBoxRounds } from './rounds'
import { voteBoxScore } from './score'

const config: VoteBoxConfig = {
  title: 'Test Night',
  ratingScale: { min: 1, max: 10, step: 1 },
  categories: [{ id: 'art', label: 'Art' }],
  slides: [
    { id: 's0', type: 'guess', subject: 'A', prompt: 'Who?', image: '', timer: 20, options: [{ label: 'a' }, { label: 'b' }, { label: 'c' }, { label: 'd' }], correct: 1 },
    { id: 's1', type: 'rate', subject: 'A', prompt: 'Rate A', image: '', timer: null, categories: ['art'] },
    { id: 's2', type: 'guess', subject: 'B', prompt: 'Who?', image: '', timer: 20, options: [{ label: 'a' }, { label: 'b' }, { label: 'c' }, { label: 'd' }], correct: 2 },
    { id: 's3', type: 'rate', subject: 'B', prompt: 'Rate B', image: '', timer: null, categories: ['art'] },
  ],
}

const players: ScorePlayer[] = [
  { id: 'p_robin', name: 'Robin', joinedAtIndex: 0 },
  { id: 'p_sam', name: 'Sam', joinedAtIndex: 2 }, // joined mid-game
]

const inputsByRound: Record<number, Map<string, VoteBoxInput>> = {
  0: new Map([['p_robin', { choice: 1 }]]), // Robin correct; Sam not eligible
  1: new Map([['p_robin', { ratings: { art: 8 } }]]),
  2: new Map([
    ['p_robin', { choice: 0 }], // wrong
    ['p_sam', { choice: 2 }], // correct
  ]),
  3: new Map([
    ['p_robin', { ratings: { art: 4 } }],
    ['p_sam', { ratings: { art: 10 } }],
  ]),
}

function makeCtx(): ScoreContext<VoteBoxConfig, VoteBoxInput> {
  return {
    config,
    rounds: voteBoxRounds(config),
    players,
    inputsFor: (i) => inputsByRound[i] ?? new Map(),
    answerKeys: voteBoxAnswerKeys(config),
  }
}

describe('voteBoxScore', () => {
  const r = voteBoxScore(makeCtx())

  it('ranks by correct guesses, then answered, then name', () => {
    expect(r.leaderboard.map((e) => e.name)).toEqual(['Robin', 'Sam'])
    expect(r.headline).toBe('Robin wins')
  })

  it('counts only eligible rounds (late joiner)', () => {
    const robin = r.leaderboard.find((e) => e.name === 'Robin')
    const sam = r.leaderboard.find((e) => e.name === 'Sam')
    expect(robin?.detail).toBe('1 / 2') // eligible for both guess rounds
    expect(sam?.detail).toBe('1 / 1') // eligible only from round 2
  })

  it('awards the top-rated subject per category', () => {
    const art = r.awards.find((a) => a.label === 'Top rated Art')
    expect(art?.subject).toBe('A') // A avg 8 beats B avg 7
    expect(art?.value).toBe('8.0')
  })

  it('picks the crowd favorite overall', () => {
    expect(r.favorite?.subject).toBe('A')
    expect(r.favorite?.average).toBeCloseTo(8)
  })

  it('reports headline stats', () => {
    expect(r.totals).toEqual({ players: 2, guessRounds: 2, ratingsCast: 3 })
    expect(r.stats.find((s) => s.label === 'Top score')?.value).toBe(1)
  })
})

describe('answer withholding', () => {
  it('strips correct indices from the published config', () => {
    const redacted = voteBoxRedactConfig(config)
    for (const slide of redacted.slides) {
      if (slide.type === 'guess') expect(slide.correct).toBe(-1)
    }
    // original is untouched
    expect((config.slides[0] as { correct: number }).correct).toBe(1)
  })

  it('extracts answer keys only for guess rounds', () => {
    expect(voteBoxAnswerKeys(config)).toEqual({ 0: { correct: 1 }, 2: { correct: 2 } })
  })
})

describe('rate-only deck', () => {
  it('does not declare a winner when there are no guess rounds', () => {
    const rateConfig: VoteBoxConfig = {
      title: 'Rate Only',
      ratingScale: { min: 1, max: 10, step: 1 },
      categories: [{ id: 'art', label: 'Art' }],
      slides: [
        { id: 'r0', type: 'rate', subject: 'A', prompt: 'Rate A', image: '', timer: null, categories: ['art'] },
      ],
    }
    const r = voteBoxScore({
      config: rateConfig,
      rounds: voteBoxRounds(rateConfig),
      players,
      inputsFor: (i) => (i === 0 ? new Map([['p_robin', { ratings: { art: 7 } }]]) : new Map()),
      answerKeys: voteBoxAnswerKeys(rateConfig),
    })
    expect(r.leaderboard).toEqual([])
    expect(r.headline).toBe('The results are in')
    expect(r.awards.find((a) => a.label === 'Top rated Art')?.subject).toBe('A')
  })
})

describe('rounds mapping', () => {
  it('maps slides to round primitives with resolved category labels', () => {
    const rounds = voteBoxRounds(config)
    expect(rounds[0]).toMatchObject({ kind: 'multiple-choice', correct: 1 })
    expect(rounds[1]).toMatchObject({ kind: 'rating', categories: [{ id: 'art', label: 'Art' }] })
  })

  it('builds a valid default config', () => {
    const def = defaultVoteBoxConfig()
    expect(def.slides).toHaveLength(6)
    expect(voteBoxRounds(def)).toHaveLength(6)
  })
})
