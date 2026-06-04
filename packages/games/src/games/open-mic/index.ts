/**
 * Open Mic, a standup-comedy "Game From Doot": players write a one-liner to a
 * comedy premise, then a robot comic performs each bit on a 3D brick-wall club
 * stage (TTS) before the room votes for the funniest. It is an ordinary
 * `[quip, vote, ...]` composition (the same two-phase spine as Quip Clash, so all
 * the engine withholding/derive/scoring is reused) with a CUSTOM Host that runs the
 * comedy show; the generic player still drives the phones (write a bit, then vote).
 *
 * Each play draws fresh premises from a large pool (`buildConfig`, seeded by the
 * room code) so no two rooms get the same set.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { quipBlock } from '../../blocks/quip/block'
import { voteBlock } from '../../blocks/vote/block'
import { promptFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'
import OpenMicHost from './Host.vue'

/** Comedy premises: write a punchy one-liner, the robot reads it deadpan. */
const PREMISE_POOL: string[] = [
  'Write a one-liner about Mondays.',
  'Tell a joke a robot would find hilarious.',
  'Your worst piece of dating advice, as a joke.',
  'A one-liner about working from home.',
  'Open for a comedy set in a town with one stoplight.',
  'A joke that only makes sense at 3am.',
  'Roast the concept of meetings in one line.',
  'A one-liner about your phone battery.',
  'Tell a joke about cats plotting something.',
  'The punchline to a joke that has no setup.',
  'A one-liner you would put on a motivational poster (ironically).',
  'A joke about the gym you never go to.',
  'Comedy bit: explain airplane food, but make it funny.',
  'A one-liner about being an adult.',
  'Tell a joke about the future that is too real.',
  'A one-liner about coffee.',
  'The worst opening line for a wedding speech.',
  'A joke about your group chat.',
  'A one-liner about Mondays, but for robots.',
  'Heckle the host in one polite line.',
  'A one-liner about waiting rooms.',
  'Write a joke about a GPS that gives up on you.',
  'Tell a one-liner about leftovers in the fridge.',
  'A bit about escalators becoming stairs the moment they break.',
  'A one-liner about your browser search history.',
  'Tell a one-liner about a group project where one person does everything.',
  'A bit about the alarm clock you keep negotiating with.',
  'A joke about the single sock that never finds its pair.',
]

const ROUNDS_PER_GAME = 3

/** Build one make+perform-vote pair for a premise. The vote derives from the quip. */
function pair(premise: string): RoundInstance[] {
  return [
    {
      block: 'quip',
      content: {
        prompt: premise,
        placeholder: 'Your bit...',
        maxLength: 140,
        timer: 75,
      },
    },
    // The custom OpenMicHost performs each bit on the comedy stage, so the vote
    // block does not need its own `perform` flag here.
    { block: 'vote', content: { prompt: 'Funniest bit wins', options: [], mode: 'field', timer: 30 } },
  ]
}

function deckFrom(premises: string[]): RoundInstance[] {
  return premises.flatMap(pair)
}

/** The built-in pool as deck rows; a creator Prompt Deck overrides these. */
const DEFAULT_ROWS = PREMISE_POOL.map((prompt) => ({ prompt }))

export const openMic = defineGame({
  manifest: {
    id: 'open-mic',
    name: 'Open Mic',
    version: '0.1.0',
    description: 'Write a one-liner, let the robots deliver it deadpan, then vote for the funniest bit.',
    author: 'Doot',
    capabilities: ['timer', 'music'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [quipBlock, voteBlock],
  components: { Host: OpenMicHost },
  defaultConfig: { title: 'Open Mic', rounds: deckFrom(PREMISE_POOL.slice(0, ROUNDS_PER_GAME)) },
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'prompt', fromRow: promptFromRow },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    return { title: 'Open Mic', rounds: deckFrom(seededShuffle(`openmic:${seed}`)(rows).slice(0, n).map((r) => String(r.prompt))) }
  },
  roundOptions: { min: 1, max: 8, default: ROUNDS_PER_GAME, label: 'Premises' },
})
