/**
 * Categories block (Scattergories). Everyone gets the same letter + a set of
 * categories and types one answer per category. Scoring is computed at reveal (no
 * withheld answer key, so no redaction needed): an answer scores 1 only if it is
 * valid (starts with the letter) AND unique (no one else gave the same answer in
 * that category). Uniqueness uses the shared P1 fold. Correct-style scoring, so it
 * works with teams + the running standings.
 */
import { isEligible } from '@doot-games/engine'
import {
  type BlockResultsContext,
  type ResultsFragment,
  type RevealContext,
  defineBlock,
  promptText,
  z,
} from '@doot-games/sdk'
import CategoriesHost from './CategoriesHost.vue'
import CategoriesPlayer from './CategoriesPlayer.vue'
import CategoriesReveal from './CategoriesReveal.vue'
import { type CategoriesContent, type CategoriesInput, scoreCategories } from './logic'

export const categoriesContentSchema = z.object({
  prompt: promptText('Categories'),
  letter: z
    .string()
    .min(1)
    .max(1)
    .default('C')
    .describe('The letter every answer must start with (one character).'),
  categories: z
    .array(z.object({ id: z.string().min(1).describe('Internal id (auto-filled).'), label: z.string().min(1) }))
    .min(1)
    .describe('The categories to fill, e.g. An animal, A food, A city.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(120)
    .describe('Seconds to fill them all in. Turn off for an untimed round.'),
})

/** The public reveal payload phones read for personal feedback (anonymized: no pids,
 *  just each answer + how it scored). */
export interface CategoriesRevealSummary {
  letter: string
  categories: Array<{
    id: string
    label: string
    answers: Array<{ text: string; valid: boolean; unique: boolean; scored: boolean }>
  }>
}

export const categoriesBlock = defineBlock<CategoriesContent, CategoriesInput>({
  kind: 'categories',
  name: 'Categories',
  contentSchema: categoriesContentSchema,
  defaultContent: () => ({
    prompt: 'Categories',
    letter: 'C',
    categories: [
      { id: 'animal', label: 'An animal' },
      { id: 'food', label: 'A food' },
      { id: 'city', label: 'A city' },
      { id: 'movie', label: 'A movie' },
    ],
    timer: 120,
  }),
  defaultTimer: 120,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ answers: {} }),
  // Allow locking in whatever you have (a hard letter may leave blanks); an empty
  // submit just scores nothing.
  PlayerInput: CategoriesPlayer,
  HostDisplay: CategoriesHost,
  PlayerReveal: CategoriesReveal,

  revealSummary: (ctx: RevealContext<CategoriesContent, CategoriesInput>): CategoriesRevealSummary => {
    const { breakdown } = scoreCategories(ctx.content, ctx.inputs as Map<string, CategoriesInput>)
    return {
      letter: ctx.content.letter,
      categories: breakdown.map((b) => ({
        id: b.id,
        label: b.label,
        answers: b.entries.map((e) => ({ text: e.text, valid: e.valid, unique: e.unique, scored: e.scored })),
      })),
    }
  },

  aggregate: (ctx: BlockResultsContext<CategoriesContent, CategoriesInput>): ResultsFragment => {
    const totals = ctx.players.map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex, score: 0 }))
    const byId = new Map(totals.map((t) => [t.id, t]))
    let topAnswer: { text: string; cat: string } | null = null
    for (const { index, content } of ctx.rounds) {
      const { scores, breakdown } = scoreCategories(content, ctx.inputsFor(index) as Map<string, CategoriesInput>)
      for (const [pid, s] of scores) {
        const t = byId.get(pid)
        if (!t || !isEligible(t.joinedAtIndex, index)) continue
        t.score += s
      }
      // A fun award: the first scored answer becomes a "nobody else thought of it".
      if (!topAnswer) {
        for (const b of breakdown) {
          const hit = b.entries.find((e) => e.scored)
          if (hit) {
            topAnswer = { text: hit.text, cat: b.label }
            break
          }
        }
      }
    }
    totals.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    return {
      leaderboard: totals.map((t) => ({ id: t.id, name: t.name, score: t.score, detail: `${t.score} pts` })),
      awards: topAnswer ? [{ label: 'Original thinker', subject: topAnswer.text, value: topAnswer.cat }] : [],
      stats: [
        { label: 'Rounds', value: ctx.rounds.length },
        { label: 'Top score', value: totals[0]?.score ?? 0 },
      ],
    }
  },
})
