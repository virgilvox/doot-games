/**
 * QUIZ OR DIE, a Trivia-Murder-Party-style "Game From Doot": a cartoon villain
 * hosts a deadly quiz show on the big screen, the room answers trivia on their
 * phones, wrong answers are dragged to the Cellar for a game of chance, the dead
 * play on as ghosts, and a finale Escape race crowns the sole survivor.
 *
 * This is a CUSTOM-FLOW game (like Truth or Share / Circuit Cypher): it ships a
 * custom Host + Player that drive the whole cinematic show over the relay's `/x/`
 * channels, with the parked `cellar` round giving the engine a round to sit on. All
 * the outcome logic is the pure, tested code in `quiz-or-die-logic.ts`.
 */
import { defineGame } from '@doot-games/sdk'
import { cellarBlock } from '../blocks/cellar/block'
import type { CellarFinalCat, CellarQuestion } from '../blocks/cellar/block'
import { seededShuffle } from '../runtime/derive'
import QuizOrDieHost from './QuizOrDieHost.vue'
import QuizOrDiePlayer from './QuizOrDiePlayer.vue'

/** The trivia bank: morbid, but every answer is real. `c` is the correct index. */
const QUESTIONS: CellarQuestion[] = [
  { cat: 'MORBID GEOGRAPHY', q: 'Which body of water borders Saudi Arabia?', a: ['Red Sea', 'Bering Sea', 'Caspian Sea', 'Black Sea'], c: 0 },
  { cat: 'NUMBERS THAT HAUNT', q: 'What were the recurring numbers from the TV show Lost?', a: ['4 8 15 16 23 42', '1 2 3 5 8 13', '3 6 9 12 15 18', '7 14 21 28 35 42'], c: 0 },
  { cat: 'ANATOMY OF FEAR', q: 'Which organ pumps blood through the human body?', a: ['The liver', 'The heart', 'The spleen', 'The pancreas'], c: 1 },
  { cat: 'DEAD LANGUAGES', q: 'In Latin, what does the phrase "memento mori" mean?', a: ['Seize the day', 'Remember to live', 'Remember you must die', 'Forever and always'], c: 2 },
  { cat: 'POP CULTURE POST-MORTEM', q: "What kind of creature is Bram Stoker's Count Dracula?", a: ['A werewolf', 'A ghost', 'A vampire', 'A zombie'], c: 2 },
  { cat: 'GROSS BUT TRUE', q: 'How many bones are in the adult human body?', a: ['106', '186', '206', '256'], c: 2 },
  { cat: 'FAMOUS LAST PLACES', q: 'Which ancient city was buried by Mount Vesuvius in 79 AD?', a: ['Troy', 'Pompeii', 'Carthage', 'Atlantis'], c: 1 },
  { cat: 'CHILLING CHEMISTRY', q: 'Which toxic element was once used in green Victorian wallpaper?', a: ['Arsenic', 'Helium', 'Calcium', 'Neon'], c: 0 },
  { cat: 'THINGS WITH TEETH', q: 'What is the largest species of shark?', a: ['Great white', 'Tiger shark', 'Whale shark', 'Hammerhead'], c: 2 },
  { cat: 'BURIED HISTORY', q: 'The Black Death of the 1300s was a pandemic of which disease?', a: ['Cholera', 'Plague', 'Smallpox', 'Typhus'], c: 1 },
  { cat: 'NIGHT SKY OMENS', q: 'What is the closest star to Earth?', a: ['Polaris', 'Sirius', 'Proxima Centauri', 'The Sun'], c: 3 },
  { cat: 'FAIRY-TALE FORENSICS', q: 'In the Brothers Grimm tales, who is poisoned by an apple?', a: ['Cinderella', 'Snow White', 'Rapunzel', 'Gretel'], c: 1 },
]

/** Finale categories: tap every option that BELONGS (`ok: true`). */
const FINAL_CATS: CellarFinalCat[] = [
  { cat: 'APOSTLES OF JESUS', opts: [{ t: 'Thomas', ok: true }, { t: 'Matthew', ok: true }, { t: 'John', ok: true }, { t: 'Goliath', ok: false }, { t: 'Caesar', ok: false }] },
  { cat: 'PLANETS IN OUR SOLAR SYSTEM', opts: [{ t: 'Mars', ok: true }, { t: 'Jupiter', ok: true }, { t: 'Pluto', ok: false }, { t: 'Orion', ok: false }, { t: 'Venus', ok: true }] },
  { cat: 'U.S. PRESIDENTS', opts: [{ t: 'Lincoln', ok: true }, { t: 'Franklin', ok: false }, { t: 'Hamilton', ok: false }, { t: 'Roosevelt', ok: true }, { t: 'Kennedy', ok: true }] },
  { cat: 'VENOMOUS CREATURES', opts: [{ t: 'Cobra', ok: true }, { t: 'Scorpion', ok: true }, { t: 'Dolphin', ok: false }, { t: 'Box jellyfish', ok: true }, { t: 'Rabbit', ok: false }] },
  { cat: 'GREEK GODS', opts: [{ t: 'Zeus', ok: true }, { t: 'Thor', ok: false }, { t: 'Hades', ok: true }, { t: 'Apollo', ok: true }, { t: 'Ra', ok: false }] },
  { cat: 'PRIMARY COLORS', opts: [{ t: 'Red', ok: true }, { t: 'Green', ok: false }, { t: 'Blue', ok: true }, { t: 'Yellow', ok: true }, { t: 'Purple', ok: false }] },
]

const DEFAULT_QPG = 7

export const quizOrDie = defineGame({
  manifest: {
    id: 'quiz-or-die',
    name: 'Quiz or Die',
    version: '0.1.0',
    description: 'A deadly quiz show. Answer right and walk free; answer wrong and meet the host in the Cellar. The last one out the door survives.',
    author: 'Doot',
    capabilities: ['timer', 'music'],
    minPlayers: 2,
    maxPlayers: 10,
    flagship: true,
  },
  blocks: [cellarBlock],
  components: { Host: QuizOrDieHost, Player: QuizOrDiePlayer },
  defaultConfig: {
    title: 'Quiz or Die',
    rounds: [{ block: 'cellar', content: { qPerGame: DEFAULT_QPG, answerTime: 12, questions: QUESTIONS, finalCats: FINAL_CATS } }],
  },
  // Shuffle the trivia + finale decks by room so the order differs session to
  // session, seeded so it stays reconnect-stable for a given room.
  buildConfig: (seed: string, opts?: { rounds?: number }) => ({
    title: 'Quiz or Die',
    rounds: [
      {
        block: 'cellar',
        content: {
          qPerGame: Math.max(3, Math.min(opts?.rounds ?? DEFAULT_QPG, QUESTIONS.length)),
          answerTime: 12,
          questions: seededShuffle(`qod:q:${seed}`)(QUESTIONS),
          finalCats: seededShuffle(`qod:f:${seed}`)(FINAL_CATS),
        },
      },
    ],
  }),
  roundOptions: { min: 3, max: QUESTIONS.length, default: DEFAULT_QPG, label: 'Questions' },
})
