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

/** Family-friendly prompts: truths and tell/describe dares, all text-answerable. */
const MILD: string[] = [
  'What is the most useless talent you have?',
  'Describe your most embarrassing fashion phase.',
  'What is a small thing that makes you unreasonably happy?',
  'Tell us about your worst cooking disaster.',
  'What is the weirdest thing you believed as a kid?',
  'What is the pettiest reason you have ended a date or a friendship?',
  'Describe the last time you embarrassed yourself in public.',
  'What is a hill you will die on that nobody else agrees with?',
  'What is the most childish thing you still do?',
  'Confess a tiny crime you have gotten away with.',
  'What is your most irrational fear?',
  'Describe your group chat in one sentence.',
  'What is the worst gift you have ever received?',
  'Tell us about a time you got caught in a lie.',
  'What is a guilty-pleasure show you would defend to the death?',
  'What is the strangest compliment you have ever gotten?',
]

/** Spicier, still party-appropriate and brand-free. */
const SPICY: string[] = [
  'What is the most embarrassing thing in your search history that you will admit?',
  'Who in this room would you swap lives with for a day, and why?',
  'What is the boldest thing you have ever texted someone?',
  'Describe your worst date in three words.',
  'What is a secret talent you have never told anyone here?',
  'What is the most trouble you got into as a teenager?',
  'What is the wildest thing on your bucket list?',
  'What is a rumor that was once spread about you?',
  'What is the most you have ever spent on something pointless?',
  'Tell us a secret you have kept since school.',
  'What would an ex say is your most annoying habit?',
  'What is the pettiest grudge you are still holding?',
  'What is the cringiest thing you have done to impress someone?',
  'What is a lie you tell yourself constantly?',
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
    rounds: [{ block: 'spotlight', content: { tier: 'mild', turns: TURNS, mild: MILD, spicy: SPICY } }],
  },
  // Shuffle the decks by room so the dealt prompts differ session to session (the
  // host then deals from this room-shuffled deck per turn). Seeded, so it stays
  // reconnect-stable for a given room.
  buildConfig: (seed: string, opts?: { rounds?: number }) => ({
    title: 'Truth or Share',
    rounds: [
      {
        block: 'spotlight',
        content: {
          tier: 'mild',
          turns: Math.max(1, Math.min(opts?.rounds ?? TURNS, 40)),
          mild: seededShuffle(`truthshare:mild:${seed}`)(MILD),
          spicy: seededShuffle(`truthshare:spicy:${seed}`)(SPICY),
        },
      },
    ],
  }),
  roundOptions: { min: 3, max: 20, default: TURNS, label: 'Turns' },
})
