/**
 * Truth or Share, the directed/spotlight "Game From Doot" (the owner's headline
 * idea). Each turn the spotlight rotates to a picker, who puts another player on
 * the spot with a prompt; the target answers in text (or passes, no penalty); the
 * room reacts; and the picker earns a cut of the reactions, so the optimal play is
 * to be entertaining, not cruel. The host vets each answer before it hits the big
 * screen (a moderation gate), and a spice tier is chosen in the lobby. Consent is a
 * feature: passing is always free.
 *
 * This is a CUSTOM-FLOW game: it ships a custom Host + Player that drive the
 * spotlight over the relay's custom channels (the proven Circuit Cypher transport),
 * with the parked `spotlight` round giving the engine a round to sit on. All the
 * scoring is the pure, tested logic in `truthshare.ts`.
 *
 * v1 is TEXT answers only; sharing a photo over the ephemeral relay (with a TTL and
 * the same host moderation gate) is a planned follow-up.
 */
import { defineGame } from '@doot-games/sdk'
import { spotlightBlock } from '../../blocks/spotlight/block'
import { spotlightRowFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'
import TruthOrShareHost from './Host.vue'
import TruthOrSharePlayer from './Player.vue'

// TRUTH prompts: answered in words. SHARE prompts: answered with a photo (snapped
// or from the camera roll). Each turn the target picks which kind to do; the picker
// then supplies the prompt. All brand-free.

/** Mild truth questions: juicy but safe for mixed company. */
const TRUTH_MILD: string[] = [
  'What is the most embarrassing thing you have done to impress a crush?',
  'What is a small, petty thing you secretly judge people for?',
  'What is the worst date you have ever been on?',
  'What is a white lie you tell so often it basically feels true now?',
  'What is the cringiest phase you ever went through? Details required.',
  'What is your most irrational fear, and the story behind it?',
  'What is a guilty-pleasure show or song you would defend to the death?',
  'What is the pettiest thing you have ever done to get back at someone?',
  'What is the worst gift you have ever given or received?',
  'What is the most childish thing you still do as an adult?',
  'What is a rumor that has been spread about you, true or not?',
  'What is the last thing that made you ugly-cry?',
]
/** Spicy truth questions: high stakes among friends. The pass is always free. */
const TRUTH_SPICY: string[] = [
  'What is the most embarrassing thing in your search or watch history right now?',
  'Who in this room have you thought about more than they realize?',
  'What is the biggest lie you have ever told someone in this room?',
  'What is the pettiest reason you have ever ghosted or unfollowed someone?',
  'What is something you snooped to find out, and what did you learn?',
  'What is the most money you have spent on something you are embarrassed about?',
  'Whose phone in this room would you least want to be handed, and why?',
  'What is the closest you have come to getting caught doing something you should not have?',
  'Let the room pick: ex, crush, or rival. You have to tell the story.',
  'What is a secret you are keeping right now that you could actually share?',
  'What is the last thing you lied about to get out of plans?',
  'What is the boldest message you have ever sent, and did it work?',
]
/** Mild photo-share prompts: snap it now or pull it from the camera roll. */
const SHARE_MILD: string[] = [
  'Show the last photo you took.',
  'Let the picker choose a color. Show something that color near you.',
  'Show your phone wallpaper.',
  'Show the oldest photo in your camera roll.',
  'Let the room pick: pet, food, or view. Show your best recent photo of it.',
  'Show your most-used emoji by snapping your keyboard.',
  'Show the last thing you screenshotted.',
  'Show your screen time or step count for today.',
  'Take a photo of your current facial expression, on command.',
  'Let the picker pick a number 1 to 9. Show that photo from the top of your camera roll.',
  'Show the most recent photo of food on your phone.',
  'Show the last meme you saved.',
]
/** Spicy photo-share prompts: the picker or the room usually chooses what gets
 *  revealed, so nobody can pre-curate it. The pass is always free. */
const SHARE_SPICY: string[] = [
  'Let the picker choose any word. Search it in your messages and share the top result.',
  'Let the room pick a contact. Share your most recent text with them.',
  'Open your camera roll and share the very last photo, no peeking first.',
  'Let the picker name an app. Share your last notification or screen from it.',
  'Share your most recent search, exactly as it is.',
  'Let the picker pick: messages, camera roll, or notes. Share the most recent thing in it.',
  'Share the last photo you sent to your most-texted person.',
  'Let the room pick an emoji. Share your most recent message that uses it.',
  'Share your most-played song and your top artist.',
  'Let the picker choose a letter. Share the first contact saved under it.',
  'Share the last thing you bought online.',
  'Share your screen time and your single most-used app.',
]

const TURNS = 5

/** The four built-in pools as flat, tagged deck rows; a creator deck (a `prompt` column,
 *  plus optional `kind` = truth/share and `tier` = mild/spicy columns) overrides them. */
const DEFAULT_ROWS = [
  ...TRUTH_MILD.map((prompt) => ({ kind: 'truth', tier: 'mild', prompt })),
  ...TRUTH_SPICY.map((prompt) => ({ kind: 'truth', tier: 'spicy', prompt })),
  ...SHARE_MILD.map((prompt) => ({ kind: 'share', tier: 'mild', prompt })),
  ...SHARE_SPICY.map((prompt) => ({ kind: 'share', tier: 'spicy', prompt })),
]

/** Partition tagged rows back into the four prompt arrays. An empty quadrant (a creator
 *  deck that, say, has only truths) falls back to the built-in pool for that quadrant, so
 *  every Truth/Share x mild/spicy combination always has prompts to deal. */
function partition(rows: Array<Record<string, string | number>>) {
  const tm: string[] = []
  const ts: string[] = []
  const sm: string[] = []
  const ss: string[] = []
  for (const r of rows) {
    const prompt = String(r.prompt)
    const spicy = String(r.tier) === 'spicy'
    if (String(r.kind) === 'share') (spicy ? ss : sm).push(prompt)
    else (spicy ? ts : tm).push(prompt)
  }
  return {
    truthsMild: tm.length ? tm : TRUTH_MILD,
    truthsSpicy: ts.length ? ts : TRUTH_SPICY,
    sharesMild: sm.length ? sm : SHARE_MILD,
    sharesSpicy: ss.length ? ss : SHARE_SPICY,
  }
}

export const truthOrShare = defineGame({
  manifest: {
    id: 'truth-or-share',
    name: 'Truth or Share',
    version: '0.1.0',
    description: 'Put someone in the spotlight with a prompt, answer or pass, and the room reacts. Pick well and you score too.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [spotlightBlock],
  components: { Host: TruthOrShareHost, Player: TruthOrSharePlayer },
  defaultConfig: {
    title: 'Truth or Share',
    rounds: [
      {
        block: 'spotlight',
        content: { tier: 'mild', turns: TURNS, truthsMild: TRUTH_MILD, truthsSpicy: TRUTH_SPICY, sharesMild: SHARE_MILD, sharesSpicy: SHARE_SPICY },
      },
    ],
  },
  // Deck-feedable (multi-pool): a creator can attach a prompt deck with optional `kind`
  // (truth/share) + `tier` (mild/spicy) columns; buildConfig partitions its rows into the
  // four pools. No answer key (nothing is withheld at this layer).
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'prompt', fromRow: spotlightRowFromRow },
  // Shuffle the (built-in, or a creator deck's partitioned) prompts by room so the dealt
  // order differs session to session. Seeded, so it stays reconnect-stable for a given room.
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const p = partition(opts?.rows?.length ? opts.rows : DEFAULT_ROWS)
    return {
      title: 'Truth or Share',
      rounds: [
        {
          block: 'spotlight',
          content: {
            tier: 'mild',
            turns: Math.max(1, Math.min(opts?.rounds ?? TURNS, 40)),
            truthsMild: seededShuffle(`tos:tm:${seed}`)(p.truthsMild),
            truthsSpicy: seededShuffle(`tos:ts:${seed}`)(p.truthsSpicy),
            sharesMild: seededShuffle(`tos:sm:${seed}`)(p.sharesMild),
            sharesSpicy: seededShuffle(`tos:ss:${seed}`)(p.sharesSpicy),
          },
        },
      ],
    }
  },
  roundOptions: { min: 3, max: 20, default: TURNS, label: 'Turns' },
})
