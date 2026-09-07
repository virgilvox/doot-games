<script setup lang="ts">
/**
 * Dev gallery for the end-of-game results page. Mounts `GameResults` against a
 * catalogue of REAL fragment shapes, in both the surfaces it has to work on: the
 * host big screen (a fixed frame, so overflow is visible) and a phone.
 *
 * Playing 38 games to look at their endings is not a review loop; every scenario
 * here is the merged `StandardResults` a real composition produces, so a change to
 * the board can be judged against all of them at once. Visual QA only; not linked
 * from navigation. See `docs/architecture.md`.
 */
import { GameResults } from '@doot-games/games'
import type { StandardResults } from '@doot-games/sdk'
import { computed, ref } from 'vue'

useHead({ title: 'Results gallery, dev showcase' })

const NAMES = [
  'Robin', 'Ada', 'Bo', 'Cy', 'Dev', 'Eli', 'Fern', 'Gus', 'Hana', 'Ivy',
  'Jo', 'Kit', 'Lex', 'Mo', 'Nia', 'Oz', 'Pia', 'Quinn', 'Rae', 'Sol',
]
const player = (i: number, score: number, detail?: string) => ({
  id: `p_${i}`,
  name: NAMES[i % NAMES.length] ?? `Player ${i + 1}`,
  score,
  ...(detail ? { detail } : {}),
})
/** A descending board of `n` players. */
const board = (n: number, top = 10, detail?: (i: number) => string) =>
  Array.from({ length: n }, (_, i) => player(i, Math.max(0, top - i), detail?.(i)))

const pic = (bg: string, letter: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="${bg}"/><text x="160" y="160" font-size="130" font-family="sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">${letter}</text></svg>`,
  )}`

const votes = (title: string, opts: Array<[string, number]>, correct = -1) => ({
  title,
  bars: opts.map(([label, count], i) => ({ label, count, ...(i === correct ? { correct: true } : {}) })),
})
const podium = (title: string, items: Array<[string, string, string]>) => ({
  title,
  layout: 'podium' as const,
  bars: items.map(([label, image, note], i) => ({
    label,
    count: items.length - i,
    max: items.length,
    display: `#${i + 1}`,
    place: `#${i + 1}`,
    note,
    ...(image ? { image } : {}),
  })),
})

interface Scenario {
  id: string
  name: string
  /** The composition this shape comes from, so a regression can be traced back. */
  from: string
  results: StandardResults
  teams?: string[]
}

const SCENARIOS: Scenario[] = [
  {
    id: 'trivia-small',
    name: 'Trivia, 6 players, 3 rounds',
    from: 'Guess x3 (the common case: guess emits a board and one stat, no breakdowns)',
    results: {
      headline: 'Robin wins!',
      leaderboard: board(6, 3, (i) => `${Math.max(0, 3 - i)} / 3`),
      awards: [],
      distributions: [],
      stats: [{ label: 'Players', value: 6 }, { label: 'Guess rounds', value: 3 }],
    },
  },
  {
    id: 'trivia-poll',
    name: 'Trivia + polls',
    from: 'Guess x3 + Poll x3 (poll is what puts breakdowns on the page)',
    results: {
      headline: 'Robin wins!',
      leaderboard: board(9, 3, (i) => `${Math.max(0, 3 - i)} / 3`),
      awards: [],
      distributions: [
        votes('Pineapple on pizza?', [['Absolutely', 5], ['Never', 7], ['Only sometimes', 3]]),
        votes('Best season?', [['Autumn', 6], ['Summer', 5], ['Spring', 3], ['Winter', 1]]),
        votes('Cats or dogs?', [['Cats', 8], ['Dogs', 7]]),
      ],
      stats: [
        { label: 'Players', value: 9 },
        { label: 'Guess rounds', value: 3 },
        { label: 'Questions', value: 3 },
        { label: 'Votes cast', value: 27 },
      ],
    },
  },
  {
    id: 'trivia-party',
    name: 'Trivia at party scale, 200 players',
    from: 'Guess x3, the load-test shape',
    results: {
      headline: '7-way tie: Robin, Ada, Bo & 4 more',
      // Seven genuine co-leaders, so the tie headline and the board agree.
      leaderboard: Array.from({ length: 200 }, (_, i) =>
        player(i, i < 7 ? 3 : Math.max(0, 2 - Math.floor(i / 70)), `${i < 7 ? 3 : Math.max(0, 2 - Math.floor(i / 70))} / 3`),
      ),
      awards: [],
      distributions: [],
      stats: [{ label: 'Players', value: 200 }, { label: 'Guess rounds', value: 3 }],
    },
  },
  {
    id: 'trivia-long',
    name: 'Long quiz, 20 breakdowns',
    from: 'A deck-fed pool at max round count',
    results: {
      headline: 'Robin wins!',
      leaderboard: board(12, 18, (i) => `${18 - i} / 20`),
      awards: [],
      // Poll (and rank/tier/accuse/most-likely) push ONE breakdown per round with no
      // cap, so a long deck-fed night really is a 20-page carousel.
      distributions: Array.from({ length: 20 }, (_, i) =>
        votes(`Question ${i + 1}: a fairly long prompt that wraps onto two lines on the big screen`, [
          ['Answer A', 6 + (i % 5)],
          ['Answer B', 3],
          ['Answer C', 2],
        ], i % 3),
      ),
      stats: [{ label: 'Players', value: 12 }, { label: 'Questions', value: 20 }, { label: 'Votes cast', value: 240 }],
    },
  },
  {
    id: 'teams',
    name: 'Teams on',
    from: 'Any scored game with teams',
    teams: ['Red', 'Blue', 'Green', 'Gold'],
    results: {
      headline: 'Red takes it!',
      teamLeaderboard: [
        { team: 'Red', score: 22, members: 5 },
        { team: 'Blue', score: 19, members: 5 },
        { team: 'Green', score: 14, members: 4 },
        { team: 'Gold', score: 9, members: 4 },
      ],
      leaderboard: board(18, 6, (i) => `${Math.max(0, 6 - i)} / 6`),
      awards: [],
      distributions: [votes('Best snack?', [['Tacos', 8], ['Pizza', 6], ['Wings', 4]])],
      stats: [{ label: 'Players', value: 18 }, { label: 'Guess rounds', value: 6 }, { label: 'Questions', value: 1 }],
    },
  },
  {
    id: 'rank-pictures',
    name: 'Rank with pictures',
    from: 'Rank x2',
    results: {
      headline: 'The results are in',
      awards: [{ label: 'Rank the snacks', subject: 'Sushi', value: '#1', image: pic('#1971c2', 'S') }],
      distributions: [
        podium('Rank the snacks', [
          ['Sushi', pic('#1971c2', 'S'), 'avg place 1.2'],
          ['Tacos', pic('#e8590c', 'T'), 'avg place 2.2'],
          ['Pizza', pic('#2f9e44', 'P'), 'avg place 2.8'],
          ['Kale', '', 'avg place 3.8'],
        ]),
        podium('Rank the seasons', [
          ['Autumn', '', 'avg place 1.4'],
          ['Summer', '', 'avg place 2.1'],
          ['Spring', '', 'avg place 2.6'],
          ['Winter', '', 'avg place 3.9'],
        ]),
      ],
      stats: [{ label: 'Players', value: 9 }, { label: 'Rank rounds', value: 2 }],
    },
  },
  {
    id: 'consensus',
    name: 'Poll only, no winner',
    from: 'Poll x3 (nothing is scored)',
    results: {
      headline: 'The room has spoken',
      distributions: [
        votes('Pineapple on pizza?', [['Absolutely', 5], ['Never', 7], ['Only sometimes', 3]]),
        votes('Best season?', [['Autumn', 6], ['Summer', 5], ['Spring', 3], ['Winter', 1]]),
        votes('Cats or dogs?', [['Cats', 8], ['Dogs', 7]]),
      ],
      stats: [{ label: 'Players', value: 15 }, { label: 'Polls', value: 3 }],
    },
  },
  {
    id: 'two-phase',
    name: 'Write & Vote',
    from: 'Quip -> Vote',
    results: {
      headline: 'Robin wins!',
      leaderboard: board(8, 5, (i) => `${Math.max(0, 5 - i)} votes`),
      awards: [
        {
          label: 'Best answer',
          subject: 'A truly unreasonable amount of hot sauce, applied with confidence and no plan',
          value: '5 votes',
        },
      ],
      distributions: [
        votes('Which answer wins?', [
          ['A truly unreasonable amount of hot sauce, applied with confidence and no plan', 5],
          ['Telling everyone I once met a minor celebrity in an airport', 4],
          ['Nothing. I contain multitudes.', 3],
          ['My extremely normal opinions about breakfast', 1],
        ]),
      ],
      stats: [{ label: 'Players', value: 8 }, { label: 'Answers written', value: 8 }],
    },
  },
  {
    id: 'rate',
    name: 'Rate, combined ranking',
    from: 'Rate x3 in one "combine ratings" section',
    results: {
      headline: 'The results are in',
      awards: [
        { label: 'Top rated Overall', subject: 'The lemon tart', value: '9.1', image: pic('#f08c00', 'L') },
        { label: 'Top rated Presentation', subject: 'The lemon tart', value: '8.8', image: pic('#f08c00', 'L') },
      ],
      distributions: [
        {
          title: 'Combined ranking',
          layout: 'podium',
          bars: [
            { label: 'The lemon tart', count: 9.1, max: 10, display: '9.1', place: '#1', note: '', correct: true, image: pic('#f08c00', 'L') },
            { label: 'The chocolate thing', count: 7.4, max: 10, display: '7.4', place: '#2', note: '', image: pic('#7048e8', 'C') },
            { label: 'The mystery mousse', count: 4.2, max: 10, display: '4.2', place: '#3', note: '', image: pic('#37b24d', 'M') },
          ],
        },
      ],
      stats: [{ label: 'Players', value: 11 }, { label: 'Ratings cast', value: 99 }],
    },
  },
  {
    id: 'rate-many',
    name: 'Rate, ungrouped, many',
    from: 'Rate x14 with no "combine ratings" group (the shape a picture-quiz night makes)',
    results: {
      headline: 'The results are in',
      awards: [{ label: 'Top rated Hotness', subject: 'Low Tide in Twilight', value: '6.8' }],
      distributions: [
        {
          title: 'How the room rated them',
          layout: 'podium',
          bars: [
            'Low Tide in Twilight',
            'Unsleep',
            'Honey Trouble',
            'Blossoms of the White Night',
            "The Sacred Serpent's Seduction",
            'Soft Night',
            'Swallow You Whole',
            'Gig of the Day',
            'Nice to See You',
            'Roses and Champagne',
            'Red Thread Quest',
            'Jinx',
            "The Ghost's Nocturne",
            'Diamond Dust',
          ].map((label, i) => ({
            label,
            count: Math.round((6.8 - i * 0.35) * 10) / 10,
            max: 10,
            display: (Math.round((6.8 - i * 0.35) * 10) / 10).toFixed(1),
            place: `#${i + 1}`,
            note: '',
            ...(i === 0 ? { correct: true } : {}),
          })),
        },
      ],
      stats: [{ label: 'Players', value: 93 }, { label: 'Rate rounds', value: 14 }, { label: 'Ratings cast', value: 373 }],
    },
  },
  {
    id: 'vote-many',
    name: 'Vote gallery, 20 answers',
    from: 'A 20-player Quip Clash: one vote round, one bar per answer (not a podium)',
    results: {
      headline: 'Robin wins!',
      leaderboard: board(20, 5, (i) => `${Math.max(0, 5 - i)} pts`),
      distributions: [
        {
          title: 'Who said it best?',
          bars: Array.from({ length: 20 }, (_, i) => ({
            label: `Answer number ${i + 1}, which can run on a bit`,
            count: 20 - i,
            max: 20,
            note: `${20 - i} votes`,
          })),
        },
      ],
      stats: [{ label: 'Players', value: 20 }],
    },
  },
  {
    id: 'mixed',
    name: 'Mixed bag',
    from: 'Guess + Poll + Rank + Rate + Draw in one custom game',
    results: {
      headline: 'Robin wins!',
      leaderboard: board(10, 4, (i) => `${Math.max(0, 4 - i)} / 4`),
      awards: [
        { label: 'Top rated Overall', subject: 'The lemon tart', value: '9.1', image: pic('#f08c00', 'L') },
        { label: 'Rank the snacks', subject: 'Sushi', value: '#1', image: pic('#1971c2', 'S') },
        { label: 'Room agrees: S tier', subject: 'Pineapple on pizza', value: '82%', image: pic('#e03131', 'P') },
      ],
      distributions: [
        votes('Which planet is closest to the sun?', [['Mercury', 7], ['Venus', 3]], 0),
        votes('Pineapple on pizza?', [['Absolutely', 4], ['Never', 6]]),
        podium('Rank the snacks', [['Sushi', pic('#1971c2', 'S'), 'avg place 1.2'], ['Tacos', '', 'avg place 2.4']]),
      ],
      // What `mergeStats` produces for this composition: one tile per distinct label.
      stats: [
        { label: 'Players', value: 10 },
        { label: 'Guess rounds', value: 2 },
        { label: 'Questions', value: 1 },
        { label: 'Votes cast', value: 10 },
        { label: 'Rank rounds', value: 1 },
        { label: 'Rate rounds', value: 1 },
        { label: 'Ratings cast', value: 30 },
        { label: 'Drawings', value: 10 },
      ],
    },
  },
  {
    id: 'gallery-only',
    name: 'Draw gallery, nothing scored',
    from: 'Draw x1 (no leaderboard, no awards, no breakdowns)',
    results: {
      headline: 'Look what the room drew',
      stats: [{ label: 'Players', value: 7 }, { label: 'Drawings', value: 7 }, { label: 'Strokes', value: 288 }],
    },
  },
  {
    id: 'solo',
    name: 'One player',
    from: 'Any scored game hosted with a single phone',
    results: {
      headline: 'Robin wins!',
      leaderboard: [player(0, 2, '2 / 3')],
      awards: [],
      distributions: [],
      stats: [{ label: 'Players', value: 1 }, { label: 'Guess rounds', value: 3 }],
    },
  },
  {
    id: 'zeroes',
    name: 'Nobody scored',
    from: 'A scored game where every answer was wrong',
    results: {
      headline: 'The results are in',
      leaderboard: board(5, 0, () => '0 / 3'),
      awards: [],
      distributions: [],
      stats: [{ label: 'Players', value: 5 }, { label: 'Guess rounds', value: 3 }],
    },
  },
  {
    id: 'stress',
    name: 'Stress: long text, many awards, broken image',
    from: 'Adversarial, not a real game',
    results: {
      headline:
        '12-way tie: Bartholomew Fitzgerald-Windermere, Anastasia Kowalczyk-Nakamura, Maximilian Oyelaran-Sørensen & 9 more',
      leaderboard: [
        { id: 'p_0', name: 'Bartholomew Fitzgerald-Windermere III', score: 12, detail: '12 / 12 correct, no misses' },
        ...board(19, 11),
      ],
      awards: Array.from({ length: 8 }, (_, i) => ({
        label: `Top rated category number ${i + 1} with a long name`,
        subject: 'A subject line that keeps going well past what anyone would call reasonable for a card',
        value: `${9 - i}.${i}`,
        image: i % 3 === 0 ? 'https://example.invalid/gone.png' : pic('#495057', String.fromCharCode(65 + i)),
      })),
      distributions: [
        votes(
          'A question prompt that is genuinely very long indeed, the sort an author pastes in from somewhere else without trimming it, and which therefore wraps to several lines',
          [
            ['An option label that is itself much longer than any option label has any right to be', 9],
            ['Short', 4],
          ],
          0,
        ),
      ],
      stats: Array.from({ length: 9 }, (_, i) => ({ label: `Stat number ${i + 1}`, value: (i + 1) * 37 })),
    },
  },
  {
    id: 'empty',
    name: 'Empty: nothing at all',
    from: 'A degenerate config (every round excluded from results)',
    results: { headline: 'The results are in', stats: [] },
  },
]

const picked = ref(SCENARIOS[0]!.id)
const scenario = computed(() => SCENARIOS.find((s) => s.id === picked.value) ?? SCENARIOS[0]!)
/** Stand in for the viewing player, so the phone's "you" treatment is visible. The
 *  mid-pack option is the important one: most players in a big room are NOT in the
 *  top few rows, and that is exactly who the phone has to answer "how did I do?" for. */
const ME_OPTIONS = [
  { id: 'p_0', label: 'the winner' },
  { id: 'p_3', label: 'near the top' },
  { id: 'p_150', label: 'mid-pack' },
  { id: '', label: 'a spectator' },
]
const meId = ref('p_3')
const me = computed(() => meId.value || null)
const showHost = ref(true)
const showPhone = ref(true)
/** The author's `resultsOrder` ("open on Highlights"). Must apply on BOTH surfaces. */
const leadWithAwards = ref(false)
const order = computed<Array<'teams' | 'leaderboard' | 'awards' | 'breakdowns'>>(() =>
  leadWithAwards.value ? ['awards', 'leaderboard', 'teams', 'breakdowns'] : [],
)
</script>

<template>
  <main class="wrap">
    <h1>Results gallery</h1>
    <p class="lede">
      Every shape the end-of-game board has to handle, on both surfaces. The host frame is
      fixed at 1280x720 so anything that overflows is visible as a scrollbar; the phone frame
      is 390 wide. Visual QA only.
    </p>

    <div class="picker">
      <label v-for="s in SCENARIOS" :key="s.id" class="pick" :class="{ on: picked === s.id }">
        <input v-model="picked" type="radio" :value="s.id" name="scenario" />
        <span class="pick-name">{{ s.name }}</span>
        <span class="pick-from">{{ s.from }}</span>
      </label>
    </div>

    <div class="toggles">
      <label><input v-model="showHost" type="checkbox" /> Host</label>
      <label><input v-model="showPhone" type="checkbox" /> Phone</label>
      <label><input v-model="leadWithAwards" type="checkbox" /> Author order: lead with Highlights</label>
      <span class="me-pick">
        Viewing as
        <label v-for="o in ME_OPTIONS" :key="o.id">
          <input v-model="meId" type="radio" :value="o.id" name="me" /> {{ o.label }}
        </label>
      </span>
    </div>

    <div class="frames">
      <figure v-if="showHost" class="frame host">
        <figcaption>Host, 1280 x 720</figcaption>
        <!-- Mirrors the REAL host chain so overflow shows up here the way it does in
             play: Stage's `.stage-wrap` (min-height only, no cap) > `.stage-body` >
             GameHost's `.results-wrap` (a flex item with the default min-height:auto)
             > the results controls below the board. A friendlier frame would bound the
             carousel for free and hide the very thing this page exists to catch. -->
        <div class="host-box">
          <div class="sim-wrap">
            <div class="sim-bar">doot &nbsp; 12 players &nbsp; connected &nbsp; ABCD</div>
            <div class="sim-body">
              <div class="sim-results">
                <GameResults :results="scenario.results" :teams="scenario.teams ?? []" :me="me" :order="order" />
                <div class="sim-next">
                  <span class="sim-btn">Play again</span>
                  <span class="sim-btn ghost">New room</span>
                  <span class="sim-btn ghost">Pick another game</span>
                  <span class="sim-btn ghost">Home</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </figure>

      <figure v-if="showPhone" class="frame phone">
        <figcaption>Phone, 390 wide</figcaption>
        <div class="phone-box">
          <GameResults :results="scenario.results" :teams="scenario.teams ?? []" :me="me" :order="order" compact />
        </div>
      </figure>
    </div>
  </main>
</template>

<style scoped>
.wrap {
  max-width: 1500px;
  margin: 0 auto;
  padding: 24px;
}
h1 {
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 800;
}
.lede {
  color: var(--ink-soft);
  max-width: 70ch;
  margin: 8px 0 18px;
  line-height: 1.5;
}
.picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.pick {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 8px 12px;
  cursor: pointer;
  background: var(--surface);
  max-width: 280px;
}
.pick.on {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, var(--surface));
}
.pick input {
  display: none;
}
.pick-name {
  font-weight: 800;
  font-size: 13px;
}
.pick-from {
  font-size: 11px;
  color: var(--ink-soft);
}
.toggles {
  display: flex;
  gap: 18px;
  margin-bottom: 16px;
  font-size: 13px;
  align-items: center;
  flex-wrap: wrap;
}
.me-pick {
  display: flex;
  gap: 10px;
  align-items: center;
}
.frames {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}
figcaption {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
  margin-bottom: 6px;
}
/* Fixed frames: the point is to SEE overflow, so these do not grow. */
.host-box {
  --sim-vh: 720px;
  width: 1280px;
  height: var(--sim-vh);
  overflow: auto;
  border: var(--bd) solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--bg);
  resize: both;
}
/* --- the host chain, copied from Stage.vue + GameHost.vue --- */
.sim-wrap {
  max-width: 1180px;
  margin: 0 auto;
  padding: 18px 26px 26px;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.sim-bar {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
  padding-bottom: 12px;
}
.sim-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* GameHost's `.results-wrap`, verbatim, except that the real rule is against the
   VIEWPORT (`100dvh`) and this frame is a box on a page: `--sim-vh` stands in for it,
   so the cap resolves the same way here as it does in play. */
.sim-results {
  flex: 1;
  min-height: 0;
  max-height: calc(var(--sim-vh) - 116px);
  display: flex;
  flex-direction: column;
}
.sim-next {
  flex: none;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 18px;
}
.sim-btn {
  border: var(--bd) solid var(--line);
  border-radius: 999px;
  padding: 12px 22px;
  font-weight: 800;
  background: var(--primary);
  color: var(--primary-ink);
}
.sim-btn.ghost {
  background: var(--surface);
  color: var(--ink);
}
.phone-box {
  width: 390px;
  height: 780px;
  overflow: auto;
  border: var(--bd) solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--bg);
  padding: 14px;
  display: flex;
  flex-direction: column;
}
</style>
