/**
 * Pure tests for the Faker make block and the Accuse judge block: role assignment,
 * answer withholding, the derive that learns the faker from the source round's
 * answer key, and the catch/escape scoring with its edge cases.
 */
import type { DeriveContext, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { type AccuseAnswer, type AccuseContent, type AccuseInput, accuseBlock } from '../accuse/block'
import { type FakerAnswer, type FakerContent, type FakerSecret, fakerBlock } from './block'

const players: ScorePlayer[] = [
  { id: 'p_a', name: 'Ada', joinedAtIndex: 0 },
  { id: 'p_b', name: 'Bo', joinedAtIndex: 0 },
  { id: 'p_c', name: 'Cy', joinedAtIndex: 0 },
]
const identity = <T>(x: T[]): T[] => x
const content: FakerContent = { category: 'Fruit', word: 'Banana', prompt: 'clue', timer: 45 }

describe('faker make block', () => {
  it('strips the secret word from the public/redacted config', () => {
    expect(fakerBlock.redactContent?.(content)).toEqual({ ...content, word: '' })
    // original is untouched (no mutation)
    expect(content.word).toBe('Banana')
  })

  it('assigns exactly one faker; everyone else gets the word; the faker gets a blank', () => {
    const { perPlayer, answer } = fakerBlock.assignContent!({ content, players, shuffle: identity })
    // identity shuffle => players[0] is the faker
    expect((answer as FakerAnswer).fakerPid).toBe('p_a')
    expect((answer as FakerAnswer).word).toBe('Banana')
    const secrets = perPlayer as Record<string, FakerSecret>
    expect(secrets.p_a).toEqual({ category: 'Fruit', word: '', isFaker: true, prompt: 'clue' })
    expect(secrets.p_b).toEqual({ category: 'Fruit', word: 'Banana', isFaker: false, prompt: 'clue' })
    expect(secrets.p_c.word).toBe('Banana')
    // exactly one faker
    expect(Object.values(secrets).filter((s) => s.isFaker)).toHaveLength(1)
  })

  it('is deterministic for a fixed shuffle (reconnect-safe)', () => {
    const rotate = <T>(x: T[]): T[] => [x[1] as T, x[2] as T, x[0] as T]
    const a = fakerBlock.assignContent!({ content, players, shuffle: rotate })
    const b = fakerBlock.assignContent!({ content, players, shuffle: rotate })
    expect((a.answer as FakerAnswer).fakerPid).toBe('p_b')
    expect(a).toEqual(b)
  })

  it('does not crash on an empty roster', () => {
    const { perPlayer, answer } = fakerBlock.assignContent!({ content, players: [], shuffle: identity })
    expect(perPlayer).toEqual({})
    expect((answer as FakerAnswer).fakerPid).toBe('')
  })
})

/** Build a derive context whose single source is a faker round. */
function fakerSource(clues: Record<string, string>, answer: FakerAnswer): DeriveContext<AccuseContent> {
  return {
    content: { prompt: 'Who is the faker?', category: '', clues: [], timer: 45 },
    sources: [
      {
        index: 0,
        content,
        inputs: new Map(Object.entries(clues).map(([pid, clue]) => [pid, { clue }])),
        answer,
        render: (i) => (i as { clue: string }).clue,
      },
    ],
    players,
    shuffle: identity,
  }
}

describe('accuse derive', () => {
  it('attributes each clue to its author and learns the faker from the source answer', () => {
    const ctx = fakerSource(
      { p_a: 'long', p_b: 'yellow', p_c: 'peel' },
      { fakerPid: 'p_a', word: 'Banana' },
    )
    const { publish, answer } = accuseBlock.derive!(ctx)
    expect(publish.category).toBe('Fruit')
    expect(publish.clues.map((c) => [c.pid, c.clue])).toEqual([
      ['p_a', 'long'],
      ['p_b', 'yellow'],
      ['p_c', 'peel'],
    ])
    // the word is NOT in the published (anonymized) content
    expect(JSON.stringify(publish)).not.toContain('Banana')
    expect(answer as AccuseAnswer).toMatchObject({ fakerPid: 'p_a', word: 'Banana' })
    expect((answer as AccuseAnswer).names).toMatchObject({ p_a: 'Ada', p_b: 'Bo', p_c: 'Cy' })
  })

  it('keeps a silent player as an accusable candidate (no auto-escape for staying quiet)', () => {
    // p_a (the faker) wrote no clue; they must still be a candidate, shown "(no clue)".
    const ctx = fakerSource({ p_a: '', p_b: 'yellow', p_c: 'peel' }, { fakerPid: 'p_a', word: 'Banana' })
    const { publish } = accuseBlock.derive!(ctx)
    expect(publish.clues.map((c) => c.pid).sort()).toEqual(['p_a', 'p_b', 'p_c'])
    expect(publish.clues.find((c) => c.pid === 'p_a')?.clue).toBe('')
  })
})

/** Build the aggregate context for one accuse round. */
function aggregateOf(votes: Record<string, string>, answer: AccuseAnswer) {
  const roundContent: AccuseContent = {
    prompt: 'Who is the faker?',
    category: 'Fruit',
    clues: players.map((p) => ({ pid: p.id, name: p.name, clue: 'x' })),
    timer: 45,
  }
  return accuseBlock.aggregate!({
    rounds: [{ index: 1, content: roundContent }],
    inputsFor: (i) =>
      i === 1
        ? new Map<string, AccuseInput>(Object.entries(votes).map(([pid, choice]) => [pid, { choice, name: '' }]))
        : new Map(),
    answerFor: () => answer,
    players,
  })
}

describe('accuse scoring', () => {
  const ANS: AccuseAnswer = { fakerPid: 'p_a', word: 'Banana', names: { p_a: 'Ada', p_b: 'Bo', p_c: 'Cy' } }

  it('rewards accusers who caught the faker and gives the faker nothing', () => {
    // Both non-fakers point at p_a (the faker): caught.
    const frag = aggregateOf({ p_b: 'p_a', p_c: 'p_a' }, ANS)
    const score = (id: string) => frag.leaderboard?.find((l) => l.id === id)?.score ?? 0
    expect(score('p_b')).toBe(100)
    expect(score('p_c')).toBe(100)
    expect(score('p_a')).toBe(0) // caught faker scores nothing
  })

  it('pays the faker for escaping, with a cut per fooled voter', () => {
    // Neither non-faker points at the faker; they split onto each other => no strict
    // top is the faker, so the faker escapes and is paid for both misses.
    const frag = aggregateOf({ p_b: 'p_c', p_c: 'p_b' }, ANS)
    const score = (id: string) => frag.leaderboard?.find((l) => l.id === id)?.score ?? 0
    expect(score('p_b')).toBe(0)
    expect(score('p_c')).toBe(0)
    expect(score('p_a')).toBe(100 + 2 * 100) // flat escape + 2 fooled
  })

  it('a tie on the faker still counts as an escape (ambiguity favors the faker)', () => {
    // p_a (faker) and p_b each get one vote: a tie, so not "caught".
    const frag = aggregateOf({ p_b: 'p_a', p_c: 'p_b' }, ANS)
    const score = (id: string) => frag.leaderboard?.find((l) => l.id === id)?.score ?? 0
    expect(score('p_b')).toBe(100) // p_b correctly caught the faker
    expect(score('p_c')).toBe(0)
    // faker tied for top => escapes, paid for the 1 voter who missed (p_c)
    expect(score('p_a')).toBe(100 + 1 * 100)
  })

  it('ignores a self-accusation', () => {
    // The faker votes for themselves (tampered client): it must not count as caught.
    const frag = aggregateOf({ p_a: 'p_a', p_b: 'p_c', p_c: 'p_b' }, ANS)
    const score = (id: string) => frag.leaderboard?.find((l) => l.id === id)?.score ?? 0
    // p_a self-vote dropped; no one caught the faker => escape, both non-fakers missed
    expect(score('p_a')).toBe(100 + 2 * 100)
  })

  it('revealSummary reports caught + the unmasked word', () => {
    const summary = accuseBlock.revealSummary!({
      content: { prompt: '', category: 'Fruit', clues: players.map((p) => ({ pid: p.id, name: p.name, clue: 'x' })), timer: 45 },
      inputs: new Map<string, AccuseInput>([
        ['p_b', { choice: 'p_a', name: '' }],
        ['p_c', { choice: 'p_a', name: '' }],
      ]),
      answer: ANS,
      players,
    }) as { caught: boolean; word: string; fakerName: string }
    expect(summary.caught).toBe(true)
    expect(summary.word).toBe('Banana')
    expect(summary.fakerName).toBe('Ada')
  })
})
