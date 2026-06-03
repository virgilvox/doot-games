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
import { spotlightBlock } from '../blocks/spotlight/block'
import { seededShuffle } from '../runtime/derive'
import TruthOrShareHost from './TruthOrShareHost.vue'
import TruthOrSharePlayer from './TruthOrSharePlayer.vue'

// TRUTH prompts: answered in words. SHARE prompts: answered with a photo (snapped
// or from the camera roll). Each turn the target picks which kind to do; the picker
// then supplies the prompt. All brand-free.

/** Family-friendly truth questions. */
const TRUTH_MILD: string[] = [
  'What is the most useless talent you have?',
  'Describe your most embarrassing fashion phase.',
  'What is a small thing that makes you unreasonably happy?',
  'Tell us about your worst cooking disaster.',
  'What is the weirdest thing you believed as a kid?',
  'Describe the last time you embarrassed yourself in public.',
  'What is a hill you will die on that nobody else agrees with?',
  'What is the most childish thing you still do?',
  'What is your most irrational fear?',
  'What is the worst gift you have ever received?',
  'What is a guilty-pleasure show you would defend to the death?',
  'What is the strangest compliment you have ever gotten?',
]
/** Spicier truth questions, still party-appropriate. */
const TRUTH_SPICY: string[] = [
  'What is the most embarrassing thing in your search history that you will admit?',
  'Who in this room would you swap lives with for a day, and why?',
  'What is the boldest thing you have ever texted someone?',
  'Describe your worst date in three words.',
  'What is a secret talent you have never told anyone here?',
  'What is the most trouble you got into as a teenager?',
  'What is a rumor that was once spread about you?',
  'Tell us a secret you have kept since school.',
  'What would an ex say is your most annoying habit?',
  'What is the cringiest thing you have done to impress someone?',
  'What is a lie you tell yourself constantly?',
]
/** Family-friendly photo-share prompts (snap it or pull it from the camera roll). */
const SHARE_MILD: string[] = [
  'Show the last photo you took.',
  'Show your phone home screen.',
  'Show the oldest photo on your phone.',
  'Take a photo of what is right in front of you.',
  'Show the most recent photo of food on your phone.',
  'Show your most-used emoji (snap the keyboard).',
  'Take a photo of your shoes right now.',
  'Show the last thing you saved or screenshotted.',
  'Show a photo that always makes you smile.',
  'Take a photo of your facial expression right now.',
  'Show the last meme you sent someone.',
  'Show your lock screen.',
]
/** Spicier photo-share prompts, still party-appropriate. */
const SHARE_SPICY: string[] = [
  'Show the most recent selfie on your phone.',
  'Show the last photo in your camera roll, no peeking first.',
  'Show your most-played song (snap the screen).',
  'Show the last text you sent.',
  'Show a photo of you from at least five years ago.',
  'Show the contact name you have saved for someone here.',
  'Show your screen time for today.',
  'Take a photo recreating your worst selfie pose.',
  'Show the last thing you bought online.',
  'Show your most recent search.',
]

const TURNS = 5

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
  // Shuffle the decks by room so the dealt prompts differ session to session (the
  // host then deals from these room-shuffled decks per turn). Seeded, so it stays
  // reconnect-stable for a given room.
  buildConfig: (seed: string, opts?: { rounds?: number }) => ({
    title: 'Truth or Share',
    rounds: [
      {
        block: 'spotlight',
        content: {
          tier: 'mild',
          turns: Math.max(1, Math.min(opts?.rounds ?? TURNS, 40)),
          truthsMild: seededShuffle(`tos:tm:${seed}`)(TRUTH_MILD),
          truthsSpicy: seededShuffle(`tos:ts:${seed}`)(TRUTH_SPICY),
          sharesMild: seededShuffle(`tos:sm:${seed}`)(SHARE_MILD),
          sharesSpicy: seededShuffle(`tos:ss:${seed}`)(SHARE_SPICY),
        },
      },
    ],
  }),
  roundOptions: { min: 3, max: 20, default: TURNS, label: 'Turns' },
})
