/**
 * Anonymous Mad Libs, the second flagship: players fill a story's blanks (by part
 * of speech, blind to the sentence), then the completed stories are revealed and
 * the room votes the funniest. Pure composition, [fill, vote, ...]; the vote
 * round derives its options from the fill round via the fill block's toVoteText.
 * A fresh set of stories is drawn from a pool each play (buildConfig).
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { fillBlock } from '../blocks/fill/block'
import { voteBlock } from '../blocks/vote/block'
import { seededShuffle } from '../runtime/derive'

interface Story {
  template: string
  blanks: Array<{ id: string; label: string }>
}

/** Story templates. `{id}` placeholders match the blank ids. */
const STORY_POOL: Story[] = [
  {
    template: 'Breaking news: a {adj} {animal} was spotted {verbing} through {place}, shouting "{exclaim}!"',
    blanks: [
      { id: 'adj', label: 'An adjective' },
      { id: 'animal', label: 'An animal' },
      { id: 'verbing', label: 'A verb ending in -ing' },
      { id: 'place', label: 'A place' },
      { id: 'exclaim', label: 'Something you shout' },
    ],
  },
  {
    template: 'My dating profile: I love {activity}, eating {food}, and {verbing} with my {noun}. Swipe right if you can {verb}.',
    blanks: [
      { id: 'activity', label: 'An activity' },
      { id: 'food', label: 'A food' },
      { id: 'verbing', label: 'A verb ending in -ing' },
      { id: 'noun', label: 'A noun' },
      { id: 'verb', label: 'A verb' },
    ],
  },
  {
    template: 'The recipe: {number} cups of {food}, a pinch of {noun}, and one {adj} {animal}. Bake until {adj2}.',
    blanks: [
      { id: 'number', label: 'A number' },
      { id: 'food', label: 'A food' },
      { id: 'noun', label: 'A noun' },
      { id: 'adj', label: 'An adjective' },
      { id: 'animal', label: 'An animal' },
      { id: 'adj2', label: 'An adjective' },
    ],
  },
  {
    template: 'Tonight on the news: local {profession} {verbs} a {adj} {noun}, then {verbs2} away in a {vehicle}.',
    blanks: [
      { id: 'profession', label: 'A job' },
      { id: 'verbs', label: 'A verb (he/she ___s)' },
      { id: 'adj', label: 'An adjective' },
      { id: 'noun', label: 'A noun' },
      { id: 'verbs2', label: 'A verb (he/she ___s)' },
      { id: 'vehicle', label: 'A vehicle' },
    ],
  },
  {
    template: 'Dear diary, today my {relative} taught me to {verb} a {noun}. It was very {adj}, and only slightly {adj2}.',
    blanks: [
      { id: 'relative', label: 'A family member' },
      { id: 'verb', label: 'A verb' },
      { id: 'noun', label: 'A noun' },
      { id: 'adj', label: 'An adjective' },
      { id: 'adj2', label: 'An adjective' },
    ],
  },
  {
    template: 'The ad said: tired of {plural}? Try new {brand}, the {adj} way to {verb} your {bodypart} in just {number} days!',
    blanks: [
      { id: 'plural', label: 'A plural noun' },
      { id: 'brand', label: 'A made-up brand name' },
      { id: 'adj', label: 'An adjective' },
      { id: 'verb', label: 'A verb' },
      { id: 'bodypart', label: 'A body part' },
      { id: 'number', label: 'A number' },
    ],
  },
  {
    template: 'In a galaxy far away, Captain {name} fought the evil {adj} {animal} using only a {noun} and a lot of {liquid}.',
    blanks: [
      { id: 'name', label: 'A first name' },
      { id: 'adj', label: 'An adjective' },
      { id: 'animal', label: 'An animal' },
      { id: 'noun', label: 'A noun' },
      { id: 'liquid', label: 'A liquid' },
    ],
  },
  {
    template: 'My self-help book, "{number} Habits of Highly {adj} {plural}", teaches you to {verb} before breakfast and never {verb2}.',
    blanks: [
      { id: 'number', label: 'A number' },
      { id: 'adj', label: 'An adjective' },
      { id: 'plural', label: 'A plural noun (people)' },
      { id: 'verb', label: 'A verb' },
      { id: 'verb2', label: 'A verb' },
    ],
  },
  {
    template: 'The tour guide said: on your left, the {adj} statue of a {animal} {verbing} a {noun}. Please do not feed the {plural}.',
    blanks: [
      { id: 'adj', label: 'An adjective' },
      { id: 'animal', label: 'An animal' },
      { id: 'verbing', label: 'A verb ending in -ing' },
      { id: 'noun', label: 'A noun' },
      { id: 'plural', label: 'A plural noun' },
    ],
  },
  {
    template: 'Worst superhero ever: {name}, who can turn any {noun} into a slightly {adj} {noun2}, but only while {verbing}.',
    blanks: [
      { id: 'name', label: 'A superhero name' },
      { id: 'noun', label: 'A noun' },
      { id: 'adj', label: 'An adjective' },
      { id: 'noun2', label: 'A noun' },
      { id: 'verbing', label: 'A verb ending in -ing' },
    ],
  },
]

const ROUNDS_PER_GAME = 3

function pair(story: Story): RoundInstance[] {
  return [
    {
      block: 'fill',
      content: {
        subject: '',
        prompt: 'Fill in the blanks (no peeking at the story!)',
        template: story.template,
        blanks: story.blanks,
        maxLength: 30,
        timer: 75,
      },
    },
    { block: 'vote', content: { prompt: 'Funniest story wins', options: [], mode: 'field', timer: 30 } },
  ]
}

function deckFrom(stories: Story[]): RoundInstance[] {
  return stories.flatMap(pair)
}

export const madLibs = defineGame({
  manifest: {
    id: 'mad-libs',
    name: 'Mad Libs',
    version: '0.1.0',
    description: 'Fill in a story\'s blanks, then vote for the funniest tale. Nobody sees the sentence until the reveal.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [fillBlock, voteBlock],
  defaultConfig: { title: 'Mad Libs', rounds: deckFrom(STORY_POOL.slice(0, ROUNDS_PER_GAME)) },
  buildConfig: (seed: string, opts?: { rounds?: number }) => {
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, STORY_POOL.length))
    return { title: 'Mad Libs', rounds: deckFrom(seededShuffle(`madlibs:${seed}`)(STORY_POOL).slice(0, n)) }
  },
  roundOptions: { min: 1, max: 6, default: ROUNDS_PER_GAME, label: 'Stories' },
})
