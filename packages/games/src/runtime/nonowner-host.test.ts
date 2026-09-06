/**
 * Hosting a game you do not OWN silently unscores the whole night.
 *
 * `/api/games/[id].get.ts` strips every answer key for a non-owner, and it does
 * that on the HOST read (`?for=play`) too. The host then loads a config whose
 * `correct` is -1 on every round, publishes that as its answer key, and grades
 * the room against it. Nobody is ever right, every board reads `0 / N`, and the
 * results page declines to crown anyone because the top score is zero.
 *
 * That is exactly what happened in room Z2CP: all 14 guess rounds published
 * `{"correct": -1}` to the relay. These tests reproduce the chain end to end
 * from the same REDACTION_RULES the server applies. The scoring behaviour is
 * unchanged and correct (a key of -1 genuinely matches nothing); what changed is
 * that `roundsMissingAnswerKey` now catches it in the lobby, so the host is told
 * before the room plays a whole quiz for nothing.
 */
import { describe, expect, it } from 'vitest'
import type { GameComposition, ScorePlayer } from '@doot-games/sdk'
import { guessBlock } from '../blocks/guess/block'
import { REDACTION_RULES } from '../catalog'
import { gameAnswerKeys, roundsMissingAnswerKey, scoreGame } from './derive'

/** A four-question picture quiz, the shape room Z2CP actually ran. */
const QUIZ: GameComposition = {
  title: 'WHO THAT HOLE?',
  rounds: [0, 1, 2, 3].map((n) => ({
    block: 'guess',
    content: {
      ...guessBlock.defaultContent(),
      prompt: `Q${n + 1}`,
      options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }],
      correct: n % 4,
    },
  })),
} as GameComposition

const PLUGIN = { manifest: { id: 'custom' }, blocks: [guessBlock] } as never

const PLAYERS: ScorePlayer[] = [
  { id: 'p1', name: 'Allison', joinedAtIndex: 0 },
  { id: 'p2', name: 'chodejeans', joinedAtIndex: 0 },
]

/** Exactly what the server does to a config before handing it to a non-owner. */
function redactForViewer(config: GameComposition): GameComposition {
  return {
    ...config,
    rounds: config.rounds.map((r) => {
      const rule = REDACTION_RULES[r.block]
      return rule ? { ...r, content: { ...(r.content as object), ...rule } } : r
    }),
  }
}

/** Everyone answers every question correctly, per the REAL key. */
const perfectRoom = (config: GameComposition) => (i: number) =>
  new Map(
    PLAYERS.map((p) => [p.id, { choice: (config.rounds[i]?.content as { correct: number }).correct }]),
  )

describe('the owner hosts: scoring works', () => {
  it('grades a perfect room as perfect and crowns the tie', () => {
    const answerKeys = gameAnswerKeys(PLUGIN, QUIZ)
    const result = scoreGame(PLUGIN, QUIZ, {
      inputsFor: perfectRoom(QUIZ),
      players: PLAYERS,
      answerKeys,
    })
    expect(result.leaderboard?.map((e) => e.detail)).toEqual(['4 / 4', '4 / 4'])
    expect(result.headline).toContain('tie for the win')
  })
})

describe('a NON-OWNER hosts: the same perfect room scores zero', () => {
  const redacted = redactForViewer(QUIZ)

  it('strips the correct index out of every guess round', () => {
    expect(redacted.rounds.map((r) => (r.content as { correct: number }).correct)).toEqual([-1, -1, -1, -1])
  })

  it('publishes an unusable answer key, which is what landed on the relay', () => {
    // `{"correct": -1}` on every round -- byte-identical to /doot/Z2CP/round/*/answer.
    expect(Object.values(gameAnswerKeys(PLUGIN, redacted))).toEqual([
      { correct: -1 },
      { correct: -1 },
      { correct: -1 },
      { correct: -1 },
    ])
  })

  it('marks a flawless room 0 / 4 and refuses to name a winner', () => {
    const result = scoreGame(PLUGIN, redacted, {
      // The players answered correctly. The host just cannot tell.
      inputsFor: perfectRoom(QUIZ),
      players: PLAYERS,
      answerKeys: gameAnswerKeys(PLUGIN, redacted),
    })
    expect(result.leaderboard?.map((e) => e.detail)).toEqual(['0 / 4', '0 / 4'])
    expect(result.leaderboard?.every((e) => e.score === 0)).toBe(true)
    // No crown: crownHeadline bails when the top score is <= 0.
    expect(result.headline).toBe('The results are in')
  })

  it('the reveal tells a correct player they were wrong', () => {
    // The phone grades itself off the published reveal summary, built from the
    // same broken key, so the big screen and the phone agree on the wrong answer.
    const summary = guessBlock.revealSummary?.({
      content: redacted.rounds[0]?.content as never,
      answer: { correct: -1 },
      inputs: new Map([['p1', { choice: 0 }]]),
      players: PLAYERS,
    } as never) as { correctIndex: number; correctLabel: string }

    expect(summary.correctIndex).toBe(-1)
    // GuessReveal renders "The answer was <b></b>." -- a blank where the answer goes.
    expect(summary.correctLabel).toBe('')
    // p1 picked the genuinely correct option 0 and still fails the equality check.
    expect(0 === summary.correctIndex).toBe(false)
  })
})

describe('roundsMissingAnswerKey catches it before a single question is asked', () => {
  it('flags every guess round in a redacted config', () => {
    expect(roundsMissingAnswerKey(PLUGIN, redactForViewer(QUIZ))).toEqual([0, 1, 2, 3])
  })

  it('flags nothing when the owner hosts their own game', () => {
    expect(roundsMissingAnswerKey(PLUGIN, QUIZ)).toEqual([])
  })

  it('flags a single round whose key never resolved, e.g. from a broken deck column', () => {
    const half: GameComposition = {
      ...QUIZ,
      rounds: QUIZ.rounds.map((r, i) =>
        i === 2 ? { ...r, content: { ...(r.content as object), correct: -1 } } : r,
      ),
    } as GameComposition
    expect(roundsMissingAnswerKey(PLUGIN, half)).toEqual([2])
  })

  it('ignores rounds whose block does not score, so an unscored game stays quiet', () => {
    const display = { title: 'x', rounds: [{ block: 'slide', content: {} }] } as GameComposition
    expect(roundsMissingAnswerKey({ manifest: { id: 'custom' }, blocks: [] } as never, display)).toEqual([])
  })
})
