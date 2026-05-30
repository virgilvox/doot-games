import { describe, expect, it } from 'vitest'
import { drawBlock } from './blocks/draw/block'
import { guessBlock } from './blocks/guess/block'
import { pollBlock } from './blocks/poll/block'
import { rankBlock } from './blocks/rank/block'
import { rateBlock } from './blocks/rate/block'
import { parseMarkdownGame } from './markdown'

const SCHEMAS: Record<string, { safeParse: (c: unknown) => { success: boolean } }> = {
  guess: guessBlock.contentSchema,
  rate: rateBlock.contentSchema,
  poll: pollBlock.contentSchema,
  rank: rankBlock.contentSchema,
  draw: drawBlock.contentSchema,
}

const SAMPLE = `# Movie Night
theme: cyber

## guess
subject: Round 1
prompt: Who directed Inception?
image: https://example.com/x.jpg
timer: 25
- Christopher Nolan (correct)
- Steven Spielberg
- Quentin Tarantino

## rate
prompt: Rate the popcorn
categories: Flavor, Crunch
scale: 1-5

## poll
prompt: Best snack?
- Popcorn
- Candy
- Nachos

## rank
prompt: Rank these movies
- Inception
- The Matrix
- Interstellar

## draw
prompt: Draw the villain
timer: none
`

describe('parseMarkdownGame', () => {
  it('parses title, theme, and one round per heading', () => {
    const game = parseMarkdownGame(SAMPLE)
    expect(game.title).toBe('Movie Night')
    expect(game.themeId).toBe('cyber')
    expect(game.rounds.map((r) => r.block)).toEqual(['guess', 'rate', 'poll', 'rank', 'draw'])
    expect(game.warnings).toEqual([])
  })

  it('produces content that validates against every block schema', () => {
    const game = parseMarkdownGame(SAMPLE)
    for (const round of game.rounds) {
      const result = SCHEMAS[round.block]!.safeParse(round.content)
      expect(result.success, `${round.block} content should validate`).toBe(true)
    }
  })

  it('reads guess options, the correct flag, and the timer', () => {
    const { rounds } = parseMarkdownGame(SAMPLE)
    const guess = rounds[0]!.content as { options: Array<{ label: string }>; correct: number; timer: number | null }
    expect(guess.options.map((o) => o.label)).toEqual(['Christopher Nolan', 'Steven Spielberg', 'Quentin Tarantino'])
    expect(guess.correct).toBe(0)
    expect(guess.timer).toBe(25)
  })

  it('reads rate categories and a numeric scale; "none" timer becomes null', () => {
    const { rounds } = parseMarkdownGame(SAMPLE)
    const rate = rounds[1]!.content as { categories: Array<{ label: string }>; scale: { kind: string; min?: number; max?: number } }
    expect(rate.categories.map((c) => c.label)).toEqual(['Flavor', 'Crunch'])
    expect(rate.scale).toMatchObject({ kind: 'numeric', min: 1, max: 5 })
    const draw = rounds[4]!.content as { timer: number | null }
    expect(draw.timer).toBeNull()
  })

  it('parses a letter-grade scale into ordered levels', () => {
    const { rounds } = parseMarkdownGame('## rate\nprompt: Grade it\ncategories: Overall\nscale: F, D, C, B, A')
    const rate = rounds[0]!.content as { scale: { kind: string; levels?: Array<{ label: string; value: number }> } }
    expect(rate.scale.kind).toBe('levels')
    expect(rate.scale.levels?.map((l) => l.label)).toEqual(['F', 'D', 'C', 'B', 'A'])
  })

  it('warns on unknown blocks and empty input', () => {
    expect(parseMarkdownGame('## bogus\nprompt: x').warnings.join(' ')).toMatch(/Unknown block/)
    expect(parseMarkdownGame('# Just a title').warnings.join(' ')).toMatch(/No rounds/)
  })
})
