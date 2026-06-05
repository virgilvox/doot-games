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
import { cellarBlock } from '../../blocks/cellar/block'
import type { CellarFinalCat, CellarQuestion } from '../../blocks/cellar/block'
import { cellarRowFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'
import QuizOrDieHost from './Host.vue'
import QuizOrDiePlayer from './Player.vue'

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
  { cat: 'GRAVE GEOGRAPHY', q: 'The Dead Sea is so salty because it has no what?', a: ['Outlet', 'Fish', 'Tide', 'Bottom'], c: 0 },
  { cat: 'TOXIC TRUTHS', q: 'Which metal, once used in hat-making, drove hatters "mad"?', a: ['Lead', 'Mercury', 'Cadmium', 'Thallium'], c: 1 },
  { cat: 'CREATURES OF THE NIGHT', q: 'Which mammal is the only one capable of true flight?', a: ['Flying squirrel', 'Bat', 'Sugar glider', 'Colugo'], c: 1 },
  { cat: 'BURIED TREASURE', q: "Which pharaoh's tomb was found nearly intact in 1922?", a: ['Ramesses II', 'Tutankhamun', 'Khufu', 'Akhenaten'], c: 1 },
  { cat: 'KILLER PLANTS', q: 'Which plant lures and digests insects in its "jaws"?', a: ['Venus flytrap', 'Aloe vera', 'Bamboo', 'Ivy'], c: 0 },
  { cat: 'PLAGUES AND POXES', q: 'Which disease was declared eradicated worldwide in 1980?', a: ['Polio', 'Measles', 'Smallpox', 'Malaria'], c: 2 },
  { cat: 'COLD CASES', q: 'Which planet has the coldest recorded atmosphere?', a: ['Neptune', 'Uranus', 'Pluto', 'Saturn'], c: 1 },
  { cat: 'THINGS THAT BITE', q: 'Which animal causes the most human deaths each year?', a: ['Shark', 'Snake', 'Mosquito', 'Crocodile'], c: 2 },
  { cat: 'DEEP AND DARK', q: 'What is the deepest known point in the ocean?', a: ['Puerto Rico Trench', 'Mariana Trench', 'Java Trench', 'Tonga Trench'], c: 1 },
  { cat: 'POISON IN THE POT', q: 'Raw kidney beans are dangerous because of which kind of toxin?', a: ['Cyanide', 'Lectin', 'Arsenic', 'Solanine'], c: 1 },
  { cat: 'HAUNTED HISTORY', q: 'Which ship famously sank on its maiden voyage in 1912?', a: ['Lusitania', 'Titanic', 'Bismarck', 'Endurance'], c: 1 },
  { cat: 'BONES AND ALL', q: 'What is the smallest bone in the human body?', a: ['Stapes', 'Femur', 'Coccyx', 'Patella'], c: 0 },
  { cat: 'VENOM', q: 'Which is considered the most venomous fish in the world?', a: ['Lionfish', 'Stonefish', 'Pufferfish', 'Stingray'], c: 1 },
  { cat: 'FROZEN IN TIME', q: 'The preserved "Iceman" mummy found in the Alps is nicknamed what?', a: ['Otzi', 'Frosty', 'Klaus', 'Hans'], c: 0 },
  { cat: 'DEADLY WEATHER', q: 'What is a violently rotating column of air touching the ground called?', a: ['Hurricane', 'Tornado', 'Monsoon', 'Cyclone'], c: 1 },
  { cat: 'MORBID MATH', q: 'Roughly how many times does the average human heart beat per day?', a: ['1,000', '10,000', '100,000', '1,000,000'], c: 2 },
  { cat: 'GHOSTLY GASES', q: 'Which odorless gas is known as the "silent killer"?', a: ['Carbon dioxide', 'Carbon monoxide', 'Oxygen', 'Nitrogen'], c: 1 },
]

/** Finale categories: tap every option that BELONGS (`ok: true`). */
const FINAL_CATS: CellarFinalCat[] = [
  { cat: 'APOSTLES OF JESUS', opts: [{ t: 'Thomas', ok: true }, { t: 'Matthew', ok: true }, { t: 'John', ok: true }, { t: 'Goliath', ok: false }, { t: 'Caesar', ok: false }] },
  { cat: 'PLANETS IN OUR SOLAR SYSTEM', opts: [{ t: 'Mars', ok: true }, { t: 'Jupiter', ok: true }, { t: 'Pluto', ok: false }, { t: 'Orion', ok: false }, { t: 'Venus', ok: true }] },
  { cat: 'U.S. PRESIDENTS', opts: [{ t: 'Lincoln', ok: true }, { t: 'Franklin', ok: false }, { t: 'Hamilton', ok: false }, { t: 'Roosevelt', ok: true }, { t: 'Kennedy', ok: true }] },
  { cat: 'VENOMOUS CREATURES', opts: [{ t: 'Cobra', ok: true }, { t: 'Scorpion', ok: true }, { t: 'Dolphin', ok: false }, { t: 'Box jellyfish', ok: true }, { t: 'Rabbit', ok: false }] },
  { cat: 'GREEK GODS', opts: [{ t: 'Zeus', ok: true }, { t: 'Thor', ok: false }, { t: 'Hades', ok: true }, { t: 'Apollo', ok: true }, { t: 'Ra', ok: false }] },
  { cat: 'PRIMARY COLORS', opts: [{ t: 'Red', ok: true }, { t: 'Green', ok: false }, { t: 'Blue', ok: true }, { t: 'Yellow', ok: true }, { t: 'Purple', ok: false }] },
  { cat: 'OCEANS OF THE WORLD', opts: [{ t: 'Pacific', ok: true }, { t: 'Atlantic', ok: true }, { t: 'Mediterranean', ok: false }, { t: 'Indian', ok: true }, { t: 'Caspian', ok: false }] },
  { cat: 'SHADES OF RED', opts: [{ t: 'Crimson', ok: true }, { t: 'Teal', ok: false }, { t: 'Scarlet', ok: true }, { t: 'Maroon', ok: true }, { t: 'Indigo', ok: false }] },
  { cat: 'CONTINENTS', opts: [{ t: 'Africa', ok: true }, { t: 'Europe', ok: true }, { t: 'Greenland', ok: false }, { t: 'Asia', ok: true }, { t: 'Atlantis', ok: false }] },
  { cat: 'WORLD CAPITALS', opts: [{ t: 'Tokyo', ok: true }, { t: 'Sydney', ok: false }, { t: 'Cairo', ok: true }, { t: 'Ottawa', ok: true }, { t: 'New York', ok: false }] },
  { cat: 'NOBLE GASES', opts: [{ t: 'Helium', ok: true }, { t: 'Oxygen', ok: false }, { t: 'Neon', ok: true }, { t: 'Argon', ok: true }, { t: 'Hydrogen', ok: false }] },
  { cat: 'SHAKESPEARE PLAYS', opts: [{ t: 'Hamlet', ok: true }, { t: 'Macbeth', ok: true }, { t: 'Inferno', ok: false }, { t: 'Othello', ok: true }, { t: 'Faust', ok: false }] },
]

const DEFAULT_QPG = 7

/** The built-in trivia bank as flat deck rows (options pipe-joined, `correct` 0-based); a
 *  creator Quiz Deck (question + options + correct, plus an optional category) overrides
 *  these. The finale categories stay built-in. */
const DEFAULT_ROWS = QUESTIONS.map((q) => ({ cat: q.cat, question: q.q, options: q.a.join('|'), correct: q.c }))
const rowToQuestion = (r: Record<string, string | number>): CellarQuestion => ({
  cat: String(r.cat ?? ''),
  q: String(r.question),
  a: String(r.options).split('|'),
  c: Number(r.correct),
})
/** A finale "tap all that belong" row -> a CellarFinalCat (its `belong` column lists the
 *  option texts that belong; the rest are decoys). */
const rowToFinalCat = (r: Record<string, string | number>): CellarFinalCat => {
  // Case-insensitive match between an option's text and the belong list, so a creator who
  // writes "mars" in `belong` still marks the "Mars" option as belonging.
  const belong = new Set(String(r.belong).split('|').map((s) => s.trim().toLowerCase()))
  return { cat: String(r.cat ?? ''), opts: String(r.options).split('|').map((t) => ({ t, ok: belong.has(t.trim().toLowerCase()) })) }
}

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
  // A LEAN preview/fallback only: a small slice, not the whole bank (the live show plays
  // the full pool via buildConfig, and a remix plays its attached deck). Keeping this small
  // means forking/remixing the game carries a tidy config, not 28 embedded questions.
  defaultConfig: {
    title: 'Quiz or Die',
    rounds: [{ block: 'cellar', content: { qPerGame: 3, answerTime: 12, questions: QUESTIONS.slice(0, 4), finalCats: FINAL_CATS.slice(0, 3) } }],
  },
  // Deck-feedable: a creator attaches a Quiz Deck of trivia (question + options + correct, +
  // optional category). The SAME deck may also carry finale "tap all that belong" rows (a
  // `belong` column lists the options that belong); buildConfig partitions them. Each pool
  // falls back to built-in when the deck has none. `correct`/`belong` are withheld from non-owners.
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'quiz', fromRow: cellarRowFromRow, answerColumns: ['correct', 'answer', 'belong'], requires: [['question', 'prompt', 'q'], ['options', 'choices', 'option1', 'a']] },
  // Shuffle the trivia + finale decks by room so the order differs session to session, seeded
  // so it stays reconnect-stable. A row with a `belong` column feeds the finale; the rest feed
  // the question pool.
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const qRows = rows.filter((r) => r.belong == null || r.belong === '')
    const fRows = rows.filter((r) => r.belong != null && r.belong !== '')
    const questions = (qRows.length ? qRows : DEFAULT_ROWS).map(rowToQuestion)
    const finalCats = fRows.length ? fRows.map(rowToFinalCat) : FINAL_CATS
    return {
      title: 'Quiz or Die',
      rounds: [
        {
          block: 'cellar',
          content: {
            // Floor of 3, but never more than the trivia available (a small creator deck).
            qPerGame: Math.min(Math.max(3, opts?.rounds ?? DEFAULT_QPG), questions.length),
            answerTime: 12,
            questions: seededShuffle(`qod:q:${seed}`)(questions),
            finalCats: seededShuffle(`qod:f:${seed}`)(finalCats),
          },
        },
      ],
    }
  },
  roundOptions: { min: 3, max: QUESTIONS.length, default: DEFAULT_QPG, label: 'Questions' },
})
