import { describe, expect, it } from 'vitest'
import { accuseBlock } from './blocks/accuse/block'
import { answerBlock } from './blocks/answer/block'
import { ballparkBlock } from './blocks/ballpark/block'
import { buzzerBlock } from './blocks/buzzer/block'
import { drawBlock } from './blocks/draw/block'
import { drawVoteBlock } from './blocks/drawvote/block'
import { fakerBlock } from './blocks/faker/block'
import { fibBlock } from './blocks/fibvote/block'
import { fillBlock } from './blocks/fill/block'
import { guessBlock } from './blocks/guess/block'
import { hivemindBlock } from './blocks/hivemind/block'
import { mostLikelyBlock } from './blocks/mostlikely/block'
import { pollBlock } from './blocks/poll/block'
import { quipBlock } from './blocks/quip/block'
import { rankBlock } from './blocks/rank/block'
import { rateBlock } from './blocks/rate/block'
import { splitBlock } from './blocks/split/block'
import { voteBlock } from './blocks/vote/block'
import { parseMarkdownGame } from './markdown'
import { resolveComposition } from './runtime/decks'

const NO_BLOCKS_PLUGIN = { manifest: { id: 't', name: 'T', version: '0', author: 'x', capabilities: [] }, blocks: [], defaultConfig: { title: 'T', rounds: [] } } as never

const SCHEMAS: Record<string, { safeParse: (c: unknown) => { success: boolean } }> = {
  guess: guessBlock.contentSchema,
  answer: answerBlock.contentSchema,
  rate: rateBlock.contentSchema,
  poll: pollBlock.contentSchema,
  rank: rankBlock.contentSchema,
  draw: drawBlock.contentSchema,
  drawvote: drawVoteBlock.contentSchema,
  hivemind: hivemindBlock.contentSchema,
  mostlikely: mostLikelyBlock.contentSchema,
  ballpark: ballparkBlock.contentSchema,
  buzzer: buzzerBlock.contentSchema,
  quip: quipBlock.contentSchema,
  vote: voteBlock.contentSchema,
  fibvote: fibBlock.contentSchema,
  fill: fillBlock.contentSchema,
  split: splitBlock.contentSchema,
  faker: fakerBlock.contentSchema,
  accuse: accuseBlock.contentSchema,
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

  it('expands a draw round with vote:true into draw + drawvote', () => {
    const { rounds, warnings } = parseMarkdownGame(
      '## draw\nprompt: Draw your nemesis\nvote: true\nvotetimer: 25',
    )
    expect(rounds.map((r) => r.block)).toEqual(['draw', 'drawvote'])
    // The draw round hides its live gallery so the vote gallery is a surprise.
    expect((rounds[0]!.content as { liveGallery: boolean }).liveGallery).toBe(false)
    // The drawvote derives from the prior round (no explicit `from` needed).
    expect(rounds[1]!.from).toBeUndefined()
    expect((rounds[1]!.content as { timer: number | null }).timer).toBe(25)
    // Both rounds validate against their block schemas.
    expect(drawBlock.contentSchema.safeParse(rounds[0]!.content).success).toBe(true)
    expect(drawVoteBlock.contentSchema.safeParse(rounds[1]!.content).success).toBe(true)
    expect(warnings).toEqual([])
  })

  it('leaves a plain draw round (no vote) with its live gallery on', () => {
    const { rounds } = parseMarkdownGame('## draw\nprompt: Draw a cat')
    expect(rounds.map((r) => r.block)).toEqual(['draw'])
    expect((rounds[0]!.content as { liveGallery: boolean }).liveGallery).toBe(true)
  })

  it('parses the new standalone blocks (hivemind, mostlikely, ballpark)', () => {
    const { rounds, warnings } = parseMarkdownGame(
      [
        '# Mixed',
        '## hivemind',
        'prompt: Name a fruit',
        'timer: 25',
        '## most likely', // multi-word heading normalizes to the mostlikely block
        'prompt: Most likely to oversleep',
        '## ballpark',
        'prompt: How many bones in the body?',
        'unit: bones',
        'answer: 206',
      ].join('\n'),
    )
    expect(rounds.map((r) => r.block)).toEqual(['hivemind', 'mostlikely', 'ballpark'])
    expect(warnings).toEqual([])
    // Each validates against its block schema.
    for (const round of rounds) expect(SCHEMAS[round.block]!.safeParse(round.content).success).toBe(true)
    expect((rounds[0]!.content as { timer: number | null }).timer).toBe(25)
    const bp = rounds[2]!.content as { answer: number; unit: string }
    expect(bp.answer).toBe(206)
    expect(bp.unit).toBe('bones')
  })

  it('parses a buzzer round with points and the correct flag', () => {
    const { rounds, warnings } = parseMarkdownGame(
      '## buzzer\nprompt: Closest planet to the Sun?\npoints: 200\n- Mercury (correct)\n- Venus',
    )
    expect(rounds.map((r) => r.block)).toEqual(['buzzer'])
    const c = rounds[0]!.content as { points: number; correct: number; options: Array<{ label: string }> }
    expect(c.points).toBe(200)
    expect(c.correct).toBe(0)
    expect(c.options.map((o) => o.label)).toEqual(['Mercury', 'Venus'])
    expect(SCHEMAS.buzzer!.safeParse(rounds[0]!.content).success).toBe(true)
    expect(warnings).toEqual([])
  })

  it('expands quip into quip + vote (Write & Vote)', () => {
    const { rounds, warnings } = parseMarkdownGame('## quip\nprompt: Worst boat name\nvoteprompt: Pick the winner')
    expect(rounds.map((r) => r.block)).toEqual(['quip', 'vote'])
    expect((rounds[1]!.content as { prompt: string }).prompt).toBe('Pick the winner')
    expect(rounds[1]!.from).toBeUndefined() // derives from the prior round
    for (const r of rounds) expect(SCHEMAS[r.block]!.safeParse(r.content).success).toBe(true)
    expect(warnings).toEqual([])
  })

  it('carries an image on a quip make round (Caption This)', () => {
    const { rounds } = parseMarkdownGame('## quip\nprompt: Caption this\nimage: https://example.com/meme.jpg\nvoteprompt: Funniest wins')
    expect(rounds.map((r) => r.block)).toEqual(['quip', 'vote'])
    expect((rounds[0]!.content as { image: string }).image).toBe('https://example.com/meme.jpg')
    for (const r of rounds) expect(SCHEMAS[r.block]!.safeParse(r.content).success).toBe(true)
  })

  it('expands quip with truth into quip + fibvote (Lie Detector)', () => {
    const { rounds } = parseMarkdownGame('## quip\nprompt: How tall is the Eiffel Tower?\ntruth: 330 metres')
    expect(rounds.map((r) => r.block)).toEqual(['quip', 'fibvote'])
    expect((rounds[1]!.content as { truth: string }).truth).toBe('330 metres')
    for (const r of rounds) expect(SCHEMAS[r.block]!.safeParse(r.content).success).toBe(true)
  })

  it('expands fill into fill + vote with blanks auto-extracted from the template', () => {
    const { rounds, warnings } = parseMarkdownGame(
      '## fill\ntemplate: The {animal} learned to {verb}.\n- animal: an animal',
    )
    expect(rounds.map((r) => r.block)).toEqual(['fill', 'vote'])
    const fill = rounds[0]!.content as { blanks: Array<{ id: string; label: string }>; showTemplate: boolean }
    expect(fill.blanks.map((b) => b.id)).toEqual(['animal', 'verb'])
    expect(fill.blanks[0]!.label).toBe('an animal') // from the hint line
    expect(fill.blanks[1]!.label).toBe('Verb') // auto-prettified
    expect(fill.showTemplate).toBe(false) // Mad Libs is blind
    for (const r of rounds) expect(SCHEMAS[r.block]!.safeParse(r.content).success).toBe(true)
    expect(warnings).toEqual([])
  })

  it('expands fill with split:true into fill + split (Would You & Split)', () => {
    const { rounds } = parseMarkdownGame('## fill\nsplit: true\ntemplate: Would you {action} for {amount}?')
    expect(rounds.map((r) => r.block)).toEqual(['fill', 'split'])
    expect((rounds[0]!.content as { showTemplate: boolean }).showTemplate).toBe(true) // visible dilemma
    for (const r of rounds) expect(SCHEMAS[r.block]!.safeParse(r.content).success).toBe(true)
  })

  it('parses game-level metadata from the spec header', () => {
    const g = parseMarkdownGame(
      [
        '# My Party',
        'theme: cyber',
        'description: A wild night.',
        'visibility: public',
        'remixable: yes',
        'cover: https://img.example/c.jpg',
        'tags: trivia, party, mixed',
        '## poll',
        'prompt: P',
        '- A',
        '- B',
      ].join('\n'),
    )
    expect(g.themeId).toBe('cyber')
    expect(g.description).toBe('A wild night.')
    expect(g.visibility).toBe('public')
    expect(g.forkable).toBe(true)
    expect(g.coverImage).toBe('https://img.example/c.jpg')
    expect(g.tags).toEqual(['trivia', 'party', 'mixed'])
  })

  it('maps "published: yes" to public and leaves visibility unset when absent', () => {
    expect(parseMarkdownGame('# G\npublished: yes\n## poll\nprompt: P\n- A\n- B').visibility).toBe('public')
    expect(parseMarkdownGame('# G\n## poll\nprompt: P\n- A\n- B').visibility).toBeUndefined()
  })

  it('expands ## faker into faker + accuse (Hidden Faker), withholding the word from the public config', () => {
    const { rounds } = parseMarkdownGame('## faker\ncategory: In the kitchen\nword: Toaster')
    expect(rounds.map((r) => r.block)).toEqual(['faker', 'accuse'])
    const faker = rounds[0]!.content as { category: string; word: string }
    expect(faker).toMatchObject({ category: 'In the kitchen', word: 'Toaster' })
    for (const r of rounds) expect(SCHEMAS[r.block]!.safeParse(r.content).success).toBe(true)
  })

  it('parses a "## deck" block into config decks (header + rows via parseSheet)', () => {
    const g = parseMarkdownGame('# T\n## deck capitals\ncountry, capital\nFrance, Paris\nJapan, Tokyo\n## poll\nprompt: P\n- a\n- b')
    const d = (g.decks?.capitals as { inline: { columns: Array<{ key: string }>; rows: unknown[] } }).inline
    expect(d.columns.map((c) => c.key)).toEqual(['country', 'capital'])
    expect(d.rows).toEqual([
      { country: 'France', capital: 'Paris' },
      { country: 'Japan', capital: 'Tokyo' },
    ])
  })

  it('parses a "## deck" block with a "link:" line into a library reference', () => {
    const g = parseMarkdownGame('# T\n## deck trivia\nlink: lib_ab12cd34ef56\n## guess\nprompt: Q\ndraw: 3\nbind: prompt = trivia.question')
    expect(g.decks?.trivia).toEqual({ ref: 'lib_ab12cd34ef56' })
    // The round still carries its draw/bindings; the ref resolves to inline at serve.
    expect(g.rounds[0]!.draw).toBe(3)
  })

  it('parses round draw/bind into the round additions', () => {
    const g = parseMarkdownGame('## deck d\nx\nv1\nv2\n## poll\nprompt: P\ndraw: 2\nbind: prompt = d.x\n- a\n- b')
    const r = g.rounds[0]!
    expect(r.draw).toBe(2)
    expect(r.bindings).toEqual({ prompt: { deck: 'd', column: 'x' } })
  })

  it('resolves a deck-backed markdown game end to end (parse -> resolveComposition)', () => {
    const g = parseMarkdownGame('## deck d\ncity\nParis\nTokyo\n## poll\nprompt: placeholder\ndraw: 2\nbind: prompt = d.city\n- yes\n- no')
    const out = resolveComposition(NO_BLOCKS_PLUGIN, { title: g.title, rounds: g.rounds, decks: g.decks }, 'seed')
    expect(out.rounds).toHaveLength(2)
    const prompts = out.rounds.map((r) => (r.content as { prompt: string }).prompt)
    expect([...prompts].sort()).toEqual(['Paris', 'Tokyo']) // both cities drawn, distinct
    // the authored options are preserved on each drawn round
    expect((out.rounds[0]!.content as { options: Array<{ label: string }> }).options.map((o) => o.label)).toEqual(['yes', 'no'])
  })

  it('warns when deck fields are used on a two-phase block (unsupported for now)', () => {
    const g = parseMarkdownGame('## deck d\nx\nv1\n## quip\nprompt: P\ndraw: 2\nbind: prompt = d.x')
    expect(g.warnings.join(' ')).toMatch(/single-round blocks/)
  })

  it('parses a ## answer round, accepting synonyms and a fuzzy flag', () => {
    const fromLine = parseMarkdownGame('## answer\nprompt: Biggest US city?\nanswers: New York City | NYC')
    const c = fromLine.rounds[0]!.content as { prompt: string; answers: string[]; fuzzy: boolean }
    expect(fromLine.rounds[0]!.block).toBe('answer')
    expect(c.answers).toEqual(['New York City', 'NYC'])
    expect(c.fuzzy).toBe(true)
    expect(SCHEMAS.answer!.safeParse(c).success).toBe(true)
    // Single answer via list item + fuzzy off.
    const fromItem = parseMarkdownGame('## answer\nprompt: Capital of Japan?\nfuzzy: no\n- Tokyo')
    const c2 = fromItem.rounds[0]!.content as { answers: string[]; fuzzy: boolean }
    expect(c2.answers).toEqual(['Tokyo'])
    expect(c2.fuzzy).toBe(false)
    // No answer -> a warning, but still parses to a valid (placeholder) round.
    const empty = parseMarkdownGame('## answer\nprompt: ?')
    expect(empty.warnings.join(' ')).toMatch(/needs an answer/)
  })

  it('warns on unknown blocks and empty input', () => {
    expect(parseMarkdownGame('## bogus\nprompt: x').warnings.join(' ')).toMatch(/Unknown block/)
    expect(parseMarkdownGame('# Just a title').warnings.join(' ')).toMatch(/No rounds/)
  })

  it('parses safety: into a quip/fill safety pool (pipe-separated, comma-safe)', () => {
    const q = parseMarkdownGame('## quip\nprompt: P\nsafety: oops, nothing | I plead the fifth')
    expect((q.rounds[0]!.content as { safetyAnswers: string[] }).safetyAnswers).toEqual(['oops, nothing', 'I plead the fifth'])
    const f = parseMarkdownGame('## fill\ntemplate: The {a} sat.\nsafety: a full story | another one')
    expect((f.rounds[0]!.content as { safetyAnswers: string[] }).safetyAnswers).toEqual(['a full story', 'another one'])
    for (const r of [...q.rounds, ...f.rounds]) expect(SCHEMAS[r.block]?.safeParse(r.content).success ?? true).toBe(true)
  })

  it('clamps a runaway prompt to PROMPT_MAX and warns, so the host stage cannot overflow', () => {
    const long = 'x'.repeat(900)
    const { rounds, warnings } = parseMarkdownGame(`## poll\nprompt: ${long}\n- A\n- B`)
    const prompt = (rounds[0]!.content as { prompt: string }).prompt
    expect(prompt.length).toBe(400)
    expect(warnings.join(' ')).toMatch(/shortened to 400 characters/)
    expect(SCHEMAS.poll!.safeParse(rounds[0]!.content).success).toBe(true)
  })
})
