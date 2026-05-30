/**
 * Way 1: Compose existing blocks (no code).
 *
 * A new game type is just a manifest + an ordered list of `{ block, content }`.
 * The engine renders Host/Player/Results, runs the room, and withholds answers.
 * This game alternates a Guess round and a Rate round (exactly how VoteBox works).
 *
 * To ship it: save this under packages/games/src/games/, then register it
 * (see examples/README.md → "Registering a game").
 */
import { guessBlock, rateBlock } from '@doot-games/games'
import { defineGame } from '@doot-games/sdk'

export const characterNight = defineGame({
  manifest: {
    id: 'character-night',
    name: 'Character Night',
    version: '0.1.0',
    description: 'Guess who the character is, then rate them.',
    author: 'you',
    capabilities: ['timer', 'images'],
    minPlayers: 1,
  },
  // The blocks this game composes. Order here doesn't matter; the rounds do.
  blocks: [guessBlock, rateBlock],
  // The seed composition a creator starts editing from.
  defaultConfig: {
    title: 'Character Night',
    rounds: [
      {
        block: 'guess',
        content: {
          subject: 'Round 1',
          prompt: 'Who is this?',
          image: '',
          timer: 20,
          options: [{ label: 'Sailor' }, { label: 'Knight' }, { label: 'Witch' }, { label: 'Pilot' }],
          correct: 0, // index of the right answer; the engine strips this before publishing
        },
      },
      {
        block: 'rate',
        content: {
          subject: 'Round 1',
          prompt: 'Rate the design',
          image: '',
          timer: null, // null = no timer (untimed round)
          categories: [
            { id: 'art', label: 'Art' },
            { id: 'cool', label: 'Coolness' },
          ],
          scale: { kind: 'numeric', min: 1, max: 10, step: 1 },
        },
      },
    ],
  },
})
