/**
 * Cellar block, the parked round for QUIZ OR DIE (the Trivia-Murder-Party-style
 * horror show). Like Truth or Share's `spotlight` and Circuit Cypher's `bars`, it
 * gives the engine a single round to sit on while the custom Host drives the whole
 * cinematic show over the relay's `/x/` channels (`/x/show` + the per-player intent
 * keys). The game overrides `components`, so this block's own views are never
 * mounted in a real game; they exist only so the editor's preview pane shows a
 * representative card instead of an empty box.
 *
 * The content is the show config: the trivia bank, the finale "belongs?" categories,
 * how many questions before the finale, and the answer clock. Because the questions
 * carry their correct index (and the finale options carry which belong), the block
 * WITHHOLDS those: `redactContent` strips them before the config is published to the
 * relay, and a matching `REDACTION_RULES.cellar` entry strips them from the saved-game
 * API path. The host reads the full (unredacted) config it holds locally for the
 * answers and only ever publishes a question WITHOUT its key over `/x/show`.
 */
import { type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import { type PropType, defineComponent, h } from 'vue'

export const cellarQuestionSchema = z.object({
  cat: z.string().default('').describe('The (lurid) category shown above the question.'),
  q: z.string().default('').describe('The question text.'),
  a: z.array(z.string()).default([]).describe('The answer options.'),
  c: z.number().int().default(0).describe('Index of the correct option (withheld until reveal).'),
})
export type CellarQuestion = z.infer<typeof cellarQuestionSchema>

export const cellarFinalCatSchema = z.object({
  cat: z.string().default('').describe('A "tap every answer that belongs" category for the finale.'),
  opts: z
    .array(z.object({ t: z.string().default(''), ok: z.boolean().default(false) }))
    .default([])
    .describe('Options; `ok` marks the ones that belong (withheld until reveal).'),
})
export type CellarFinalCat = z.infer<typeof cellarFinalCatSchema>

export const cellarContentSchema = z.object({
  qPerGame: z.number().int().positive().max(20).default(7).describe('Trivia questions before the finale.'),
  answerTime: z.number().int().positive().max(60).default(12).describe('Seconds on the answer clock.'),
  questions: z.array(cellarQuestionSchema).default([]).describe('The trivia bank.'),
  finalCats: z.array(cellarFinalCatSchema).default([]).describe('The finale "belongs?" categories.'),
})
export type CellarContent = z.infer<typeof cellarContentSchema>

/** No per-round input: the host collects answers/picks over custom channels. */
export type CellarInput = Record<string, never>

const pill =
  'padding:6px 12px;border-radius:999px;font-weight:700;font-size:13px;background:var(--surface);border:var(--bd) solid var(--line-soft)'

// Editor-preview only (see the header): the phone card describes the controller,
// the big-screen card describes the show.
const CellarPlayer = defineComponent({
  name: 'CellarPlayerPreview',
  props: { content: { type: Object as PropType<CellarContent>, default: () => ({}) } },
  setup() {
    return () =>
      h('div', { style: 'display:flex;flex-direction:column;gap:14px;text-align:center' }, [
        h('div', { style: 'font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)' }, 'Quiz or Die'),
        h('p', { style: 'margin:0;font-size:15px;line-height:1.5;color:var(--ink-soft)' }, 'Your phone is your buzzer. Tap the answer before the clock runs out. Get it wrong and the host drags you to the Cellar for a little game of chance.'),
        h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' }, [
          h('span', { style: 'padding:14px;border-radius:12px;font-weight:800;background:var(--surface-2);border:var(--bd) solid var(--line-soft)' }, '1  Red Sea'),
          h('span', { style: 'padding:14px;border-radius:12px;font-weight:800;background:var(--surface-2);border:var(--bd) solid var(--line-soft)' }, '2  Black Sea'),
          h('span', { style: 'padding:14px;border-radius:12px;font-weight:800;background:var(--surface-2);border:var(--bd) solid var(--line-soft)' }, '3  Bering Sea'),
          h('span', { style: 'padding:14px;border-radius:12px;font-weight:800;background:var(--surface-2);border:var(--bd) solid var(--line-soft)' }, '4  Caspian Sea'),
        ]),
      ])
  },
})
const CellarHost = defineComponent({
  name: 'CellarHostPreview',
  props: { content: { type: Object as PropType<CellarContent>, default: () => ({}) } },
  setup(props) {
    return () => {
      const q = props.content?.qPerGame ?? 7
      const t = props.content?.answerTime ?? 12
      return h('div', { style: 'text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center' }, [
        h('div', { style: 'font-family:var(--font-horror-disp, var(--font-display, inherit));font-size:30px;font-weight:800;letter-spacing:1px' }, 'QUIZ OR DIE'),
        h('p', { style: 'margin:0;font-size:15px;color:var(--ink-soft);max-width:40ch;line-height:1.5' }, 'A deadly little quiz show. Answer correctly and you walk free. Answer wrong and you meet the host in the Cellar, where a game of chance decides if you live. The last one out the door wins.'),
        h('div', { style: 'display:flex;gap:10px' }, [
          h('span', { style: pill }, `${q} questions`),
          h('span', { style: pill }, `${t}s clock`),
        ]),
        h('p', { style: 'margin:0;font-size:13px;color:var(--mute)' }, 'Host this game to run the live show.'),
      ])
    }
  },
})

export const cellarBlock = defineBlock<CellarContent, CellarInput>({
  kind: 'cellar',
  name: 'Cellar',
  contentSchema: cellarContentSchema,
  defaultContent: () => ({ qPerGame: 7, answerTime: 12, questions: [], finalCats: [] }),
  defaultTimer: null,
  timerOf: () => null,
  emptyInput: () => ({}),
  isComplete: () => true,
  PlayerInput: CellarPlayer,
  HostDisplay: CellarHost,
  // Withhold the correct answers from the published config (the host publishes a
  // keyless question over /x/show and reads its local full config for the key).
  redactContent: (c) => ({
    ...c,
    questions: c.questions.map((q) => ({ ...q, c: -1 })),
    finalCats: c.finalCats.map((fc) => ({ ...fc, opts: fc.opts.map((o) => ({ ...o, ok: false })) })),
  }),
  answerOf: (c) => ({
    correct: c.questions.map((q) => q.c),
    finalOk: c.finalCats.map((fc) => fc.opts.map((o) => o.ok)),
  }),
  // The game computes its own results via room.host.finish (like Circuit Cypher /
  // Truth or Share); no generic aggregate is used.
  aggregate: (): ResultsFragment => ({ stats: [] }),
})
