/**
 * Faker make block, the hidden-imposter half of the social-deduction loop and the
 * first game built on the SECRET per-player content primitive (`assignContent`).
 *
 * Everyone is shown a category and a secret WORD, except one player picked at
 * random (the faker), who is told the category but not the word. Each player
 * submits a one-word clue that proves they know the word, without giving it away.
 * The next round (`accuse`) shows every clue attributed to its author and the room
 * votes for who they think was bluffing.
 *
 * Withholding: the secret word is delivered ONLY to each non-faker's own private
 * relay address (`assignContent` -> `addr.roundContentForPlayer`); it is stripped
 * from the public/redacted config (`redactContent`) and never shown on the big
 * screen (`FakerHost` renders the category + a count only), because the faker is
 * watching that screen. Who the faker is rides along as the withheld answer key,
 * revealed only at the accuse round's reveal.
 *
 * Soft-secrecy caveat (same trade as the rest of the per-player primitive): the
 * per-player address is derivable from the public room + name, so a determined
 * devtools user could read another player's secret. Fine for casual play; not a
 * defense against a committed cheater.
 */
import {
  type AssignContext,
  type AssignedContent,
  type BlockResultsContext,
  type ResultsFragment,
  defineBlock,
  z,
} from '@doot-games/sdk'
import FakerHost from './FakerHost.vue'
import FakerPlayer from './FakerPlayer.vue'

export const fakerContentSchema = z.object({
  category: z.string().default('Animals').describe('The public theme everyone (including the faker) can see, e.g. "Fruit".'),
  word: z.string().default('Elephant').describe('The secret word every non-faker is told privately. Never shown on the big screen.'),
  prompt: z
    .string()
    .default('Give a one-word clue that proves you know the word, without giving it away.')
    .describe('Instruction shown on the phone while writing a clue.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(45)
    .describe('Seconds to write a clue. Turn off for an untimed round.'),
})
export type FakerContent = z.infer<typeof fakerContentSchema>

/** A player's input: a single short clue. */
export interface FakerInput {
  clue: string
}

/** The SECRET per-player view delivered to each player's own private address.
 *  Non-fakers get the real `word`; the faker gets a blank word + `isFaker:true`. */
export interface FakerSecret {
  category: string
  word: string
  isFaker: boolean
  prompt: string
}

/** The withheld answer key: who the faker is, plus the word for the reveal. */
export interface FakerAnswer {
  fakerPid: string
  word: string
}

/** Collapse a clue to a single trimmed token (a clue is one word by design). */
export function normalizeClue(raw: string): string {
  return raw.trim().split(/\s+/)[0] ?? ''
}

export const fakerBlock = defineBlock<FakerContent, FakerInput>({
  kind: 'faker',
  name: 'Faker',
  contentSchema: fakerContentSchema,
  defaultContent: () => ({
    category: 'Animals',
    word: 'Elephant',
    prompt: 'Give a one-word clue that proves you know the word, without giving it away.',
    timer: 45,
  }),
  defaultTimer: 45,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ clue: '' }),
  isComplete: (_c, input) => normalizeClue(input.clue).length > 0,
  PlayerInput: FakerPlayer,
  HostDisplay: FakerHost,

  // The secret word is never published in the open config; it reaches non-fakers
  // only through their own private per-player address (assignContent below).
  redactContent: (content) => ({ ...content, word: '' }),

  // Hidden-role assignment: pick exactly one faker from the roster (seeded so it is
  // deterministic and reconnect-safe), hand each non-faker the real word and the
  // faker a blank, and withhold WHO the faker is until reveal. The per-player view
  // (FakerSecret) is a different shape than the authored content, which is the whole
  // point of a hidden-role round; the engine carries each as an opaque relay value,
  // so we cast at this boundary to satisfy the shared AssignedContent<Content> type.
  assignContent: (ctx: AssignContext<FakerContent>): AssignedContent<FakerContent> => {
    const order = ctx.shuffle(ctx.players)
    const faker = order[0]
    const fakerPid = faker?.id ?? ''
    const perPlayer: Record<string, FakerSecret> = {}
    for (const p of ctx.players) {
      const isFaker = p.id === fakerPid
      perPlayer[p.id] = {
        category: ctx.content.category,
        word: isFaker ? '' : ctx.content.word,
        isFaker,
        prompt: ctx.content.prompt,
      }
    }
    return {
      perPlayer: perPlayer as unknown as Record<string, FakerContent>,
      answer: { fakerPid, word: ctx.content.word } satisfies FakerAnswer,
    }
  },

  // Render a submission to text so the accuse round (and any generic consumer) can
  // read the clue; accuse builds its own attributed list, but this keeps the
  // source-render contract honest.
  toVoteText: (_content, input) => normalizeClue(input.clue),

  // The make round scores nothing on its own (the accuse round awards points). A
  // tiny stat keeps it from being invisible if ever hosted standalone.
  aggregate: (ctx: BlockResultsContext<FakerContent, FakerInput>): ResultsFragment => ({
    stats: [
      {
        label: 'Clues given',
        value: ctx.rounds.reduce((n, r) => {
          let c = 0
          for (const v of ctx.inputsFor(r.index).values()) if (normalizeClue((v as FakerInput).clue)) c++
          return n + c
        }, 0),
      },
    ],
  }),
})
