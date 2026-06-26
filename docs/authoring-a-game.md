# Authoring a game

A guide for developers building games on Doot. You'll use **TypeScript**, a little
**Vue 3**, and **Zod** for content schemas. If you can write a Vue component and a
Zod object, you can ship a game.

Runnable, copy-paste starting points for everything below live in
[`examples/`](../examples/). This doc explains the model; the examples show the code.

---

## 1. The mental model

Two concepts, and the engine does the rest.

- A **block** is a *round kind*: Guess, Rate, Poll, Quip, Vote, Fill, Split, Draw.
  It declares only what's unique to that kind, a content schema, a phone (Player)
  view, a big-screen (Host) view, and a pure `aggregate` for results. It knows
  nothing about any game.
- A **game** is a *composition*: a manifest plus an ordered list of
  `{ block, content }` rounds. VoteBox is literally `[guess, rate]` alternating.

The engine owns everything else, so you never touch it: the CLASP relay, the room,
the `lobby → active(ready → open → locked → reveal) → results` state machine,
timers and auto-lock, the roster, late joiners, reconnect-by-name, and
**answer-withholding** (correct answers and derived submissions never reach a
player's relay feed early). The generic renderer mounts the right block per round
and merges their results, so **most games are ~20 lines and need no components**.

```
packages/games/src/
  blocks/<kind>/   block.ts (schema + aggregate + withholding) + Player.vue + Host.vue
  runtime/         GameHost / GamePlayer / GameResults (generic) + derive.ts
  games/           compositions: votebox = [guess, rate]; quip-clash = [quip, vote]; ...
  registry.ts      builtinPlugins[]    catalog.ts  server-safe list (id/name/version/flagship)
```

**Dependency rule (do not break):** games depend on `engine`, `sdk`, `themes`,
`ui`. The engine never imports a game; no game imports another. New game = compose
blocks. New round kind = one block.

---

## 2. The four ways to author

Pick the lowest-effort one that fits. Each links a complete example.

### Way 1 - Compose existing blocks (no code)

A new game is just a manifest and a list of rounds.
→ [`examples/01-compose-blocks.ts`](../examples/01-compose-blocks.ts)

```ts
import { defineGame } from '@doot-games/sdk'
import { guessBlock, rateBlock } from '@doot-games/games'

export const myGame = defineGame({
  manifest: { id: 'my-game', name: 'My Game', version: '0.1.0', author: 'you', capabilities: ['timer'] },
  blocks: [guessBlock, rateBlock],
  defaultConfig: { title: 'My Game', rounds: [/* { block, content }, ... */] },
})
```

### Way 2 - Write a new block (a new round kind)

When no existing block covers your interaction. Build it with `defineBlock`: a Zod
content schema (the editor auto-forms from it), an `emptyInput`, a Player view, a
Host view, and a pure `aggregate`.
→ [`examples/02-new-block/`](../examples/02-new-block/) (a complete "Slider" block)

The Player view is a **controlled input** (`v-model` of the input value); the
generic renderer owns the "Lock it in" button and gates it on `isComplete`. The
Host view shows the live tally. `aggregate` is pure and unit-testable.

### Way 3 - Remix / template with a content pool

A curated composition of existing blocks. Add a `buildConfig(seed)` to draw a fresh
random subset from a large pool each play, so no two rooms get the same game.
→ [`examples/03-template-with-pool.ts`](../examples/03-template-with-pool.ts)

### Way 4 - Full custom (override the views)

For a game the block model doesn't fit. Override the rendered components; the
engine still handles the relay, room, and state machine.
→ [`examples/04-full-custom/`](../examples/04-full-custom/) (a "Tap Battle")

```ts
defineGame({
  manifest, blocks: [],
  defaultConfig: { title, rounds: [/* one round for timing */] },
  components: { Host: MyHost, Player: MyPlayer, Results: MyResults },
})
```

Custom views reach the live room with `injectDootRoom()` from
`@doot-games/engine/vue`: reactive reads (`phase`, `round`, `players`, `me`,
`results`), `room.submit(input)`, and host actions (`room.host.start/openVoting/
lock/reveal/next/finish`, gated by `room.host.can(...)`).

### Way 5 - A SOLO block (one block that runs its own multi-step show)

When you want a single **block** (composable into any game, advances to the next
round when done) that runs a richer host-driven flow than one open→lock→reveal beat
- e.g. the Tier List, which votes one item at a time and fills a board. Set
`solo: true` on the block (mirrors `display`). The renderer then shows the block's
HostDisplay full-stage with NO prompt grid, shows the PlayerInput full with no generic
"Lock it in", hides the open/lock/reveal ControlBar, and never auto-locks. The block's
own views drive everything via `injectDootRoom()`:

- the **HostDisplay** opens the round (`room.host.openVoting()`), holds it open while it
  sequences its steps (broadcasting state on a custom channel, e.g. `room.publishExtra('tiershow', ...)`),
  and when finished calls `room.host.lock()` + `room.host.reveal()` so the standard "Next
  round / Final results" button reappears (end-of-game scoring runs over every round as usual);
- the **PlayerInput** reads that channel (`room.onExtra(...)`) and submits through the
  **standard round input** (`room.submit(input)`) so the normal `aggregate` still scores it.

The block MUST set `timerOf` to `null` (the engine must never auto-lock under it; drive
your own per-step timer). It works in the editor preview too: the mock room's
`publishExtra`/`onExtra`/`submit` are no-ops, so the views render a static first-step.
The `tier` block (`packages/games/src/blocks/tier/`) is the reference.

---

## 3. The two-phase pattern (make → judge)

The Jackbox-style loop: collect free-text in one round, then vote on the
**anonymized, shuffled** submissions in the next. This is how Quip Clash, Mad Libs,
and Split the Room work, and you get it by **composing blocks**, no engine code.
→ [`examples/05-two-phase.ts`](../examples/05-two-phase.ts)

How it works:

- A **make** block (`quip` free-text, or `fill` multi-blank) collects each player's
  submission. Submissions stay private (a player only receives their own input over
  the relay; the host sees all).
- A **judge** block (`vote`, or `split` for yes/no) has empty content authored. When
  the room reaches it, the engine calls the block's `derive` with the make round's
  inputs; the block returns the shuffled, anonymized options to publish plus a
  withheld author map. The map is revealed only at reveal, so authorship can't leak.
- `RoundInstance.from` selects which earlier round feeds a derived round (defaults
  to the previous round).
- A make block declares `toVoteText(content, input)` so the judge round can render
  any submission to a votable string (a Quip = its text; a Mad Lib = its filled-in
  story). That's why the same `vote` block judges both.

Scoring helpers for these games are pure and tested in `blocks/scoring.ts`:
`voteSharePoints`, `roundMultiplier`, `sweepBonus`, `pityPoints`, `closenessToHalf`
/ `splitPoints` (Split the Room), `speedDecay` (Kahoot-style).

---

## 4. The block contract

`RoundBlock<Content, Input>` (see `packages/sdk/src/block.ts`):

| Field | Purpose |
| --- | --- |
| `kind`, `name` | id and display name |
| `contentSchema` | Zod schema for one round's content; the editor auto-forms from it |
| `defaultContent()` | a sensible starting content |
| `timerOf(content)` / `defaultTimer` | seconds before auto-lock, or `null` for untimed |
| `emptyInput(content)` | the initial player input (avoid biasing a no-op submit) |
| `isComplete(content, input)?` | gate the "Lock it in" button (default: always) |
| `PlayerInput` | phone view. Props `{ content, modelValue, disabled }`; emits `update:modelValue` |
| `HostDisplay` | big-screen view. Props `{ content, inputs: Map, state, answer }` |
| `aggregate(ctx)?` | pure → results fragment (leaderboard / awards / distributions / stats) |
| `redactContent(content)?` | strip answers before publish (deep-copy what you edit) |
| `answerOf(content)?` | the answer key, revealed only at that round's reveal |
| `PlayerReveal?` | phone reveal view. Props `{ content, myInput, reveal }` (the public per-round reveal payload). Falls back to a generic notice |
| `revealSummary(ctx)?` | host computes a public per-round payload (tallies, winner) published at reveal so phones can show personal feedback |
| `Editor?` | a custom per-round editor (auto-generated from the schema otherwise) |
| **two-phase:** `derive(ctx)?` | build this round's SHARED content from earlier rounds' inputs (`ctx.sources`); returns `{ publish, answer? }` |
| **per-player:** `assignContent(ctx)?` | build SECRET per-player content (a hidden role, OR a per-player slice of a prior round); returns `{ perPlayer: Record<pid, content>, answer? }`. `ctx.sources` carries earlier rounds' inputs + their withheld answer, so an assignment can derive from a PRIOR round (the P7 foundation), not just the roster |
| `toVoteText(content, input)?` | render this block's submission to votable text for a later judge round |

A block's `aggregate`/`derive`/`revealSummary` may also read `ctx.audienceVotesFor`/
`ctx.audienceVotes` (P4B: spectator votes, supplied only when the host turns on "let
the crowd's votes count"; the vote-tallying blocks fold them as a capped bloc) and a
fragment may carry `recap` (an arbitrary payload a game's `components.Results` reads;
the generic board ignores it).

---

## 4.5 Per-player content and chains (the P7 foundation)

Some games hand each player a DIFFERENT view of a round, derived from a prior round:

- **Hidden role** (Faker): `assignContent` reads the roster and gives one player a
  different prompt; the secret is delivered only to that player's private relay
  address (the engine publishes each `perPlayer` entry to `addr.roundContentForPlayer`),
  stripped from the public config (`redactContent`) and listed in `REDACTION_RULES`.
- **A per-player CHAIN** (Story Chain / Doodle Chain): each round, `assignContent` reads
  the PRIOR round's inputs (via `ctx.sources`) and hands each player their left
  neighbor's previous output. The pure rotation lives in `runtime/chain.ts`
  (`chainOrder` / `chainSourceFor` / `chainThreads`); the frozen ring is just the
  sorted set of round-0 submitters (`chainRingFromSources`), passed forward as a source
  via `RoundInstance.from: [prev, 0]`.
- **A per-player slice of a DERIVED round** (Wavelength): the guess round's `derive`
  publishes the shared clue + poles (for the host and guessers) while its
  `assignContent` reads the prior clue round to override ONLY the clue-giver with a
  "watch" view. One round mixes a shared derived view with a per-player override.

A game that needs a non-leaderboard results screen (a chain's "unspool", Wavelength's
dial) overrides `components.Results` (the generic renderer honors it) and feeds it via a
block `aggregate` returning `{ recap }`, which `scoreGame` passes through to the
published `StandardResults.recap`.

---

## 5. The editor (auto-form from your schema)

Every block is authorable in the UI with **no editor code**. `/editor/<type>` seeds
from a game's default composition; `@doot-games/ui`'s `SchemaForm` walks each
block's `contentSchema` and renders a control per field (objects nest, arrays get
add/remove/reorder, a discriminated union becomes a variant selector). A few
field-name conventions get nicer controls for free:

| Field name | Rendered as |
| --- | --- |
| `image` (string) | URL input + preview (with an Upload button when storage is configured) |
| `prompt` (string) | multi-line textarea |
| `timer` / any nullable number | a number with an on/off toggle |
| `correct` (number, with a sibling `options` array) | a "mark correct" option select |
| `id` inside an array item | a compact slug, auto-seeded |

So naming your fields with these conventions gives good editor ergonomics. When the
generic form can't express something, set `Editor` on the block.

The editor is a three-pane layout: a rounds rail on the left (reorder/remove + an
**Add** panel), the selected round's auto-form in the center, and a persistent
host/phone preview on the right. The Add panel offers **Single rounds** (guess,
answer, wager, rate, poll, rank, draw, hivemind, most-likely, ballpark, buzzer,
categories, survey, spectrum, plus the no-input `slide` / `title` display cards)
and **Two-phase
recipes** that insert a make+judge pair in one click, Write & Vote (`quip`→`vote`),
Mad Lib & Vote (`fill`→`vote`), Would You & Split (`fill`→`split`), Lie Detector
(`quip`→`fibvote`, you author the truth), Sketch & Vote (`draw`→`drawvote`), and
Hidden Faker (`faker`→`accuse`). A judge block is never offered on its own (it needs
a make round above it), so the Custom editor (`/editor/custom`) can build every
first-party two-phase pattern by hand, not just via markdown import. Recipes are
filtered to the blocks a given game type composes, so a single-type editor shows
only its own block.

From the editor you **Host now** (stows an in-memory draft and opens `/host/<type>`)
or **Save** (POSTs to `/api/games`, returns a shareable `/g/<id>`). Saving needs an
optional account; hosting and playing never do. Each saved game has a visibility
(`private` / `unlisted` / `public`), enforced server-side.

---

## 6. Content pools, replayability, and markdown

- **Pools:** add `buildConfig(seed)` to a `GamePlugin` to sample a fresh subset of a
  large pool each play. The host calls `buildConfig(roomCode)`, so a room is
  internally consistent across reconnects but differs from other rooms. Use
  `seededShuffle(seed)` from `@doot-games/games` for a deterministic shuffle. (Way 3.)
- **Markdown import:** the editor can build a whole game from a markdown spec. The
  standalone kinds are guess/answer/wager/poll/rank/rate/draw/buzzer/hivemind/
  mostlikely/ballpark/categories/survey/spectrum, plus the two-phase make blocks
  quip/fill/faker (`quip`+`truth:` -> Fibbage, `fill`+`split: true` -> Split the
  Room, `faker` -> the Hidden Faker); a `## draw` round with `vote: true` expands to
  draw-then-vote. The custom-flow flagships (Quiz or Die, Circuit Cypher, the chain
  games, Wavelength, ...) are NOT markdown-authorable. Full format + the current list:
  [`docs/markdown-games.md`](./markdown-games.md).
- **Content decks (the data-driven path):** a reusable `/decks` library deck (a
  named-column table of rows) that a round draws rows from and binds fields to, used
  inline (snapshot) or linked (`{ ref }`). This is the modern, type-driven successor to
  ad-hoc `buildConfig` pools for creator content. See [`docs/decks.md`](./decks.md).

---

## 7. Testing

Test the logic that matters: a block's `aggregate` (and any `derive`/`revealSummary`
/scoring) is **pure**, so it's a plain Vitest unit test, no relay, no DOM. See
`packages/games/src/blocks/*/*.test.ts` (e.g. `vote/vote.test.ts`,
`split/split.test.ts`, `blocks/scoring.test.ts`) for worked examples. Run `pnpm test`.

---

## 8. Registering your game

Once your files live under `packages/games/src/`:

1. `export` your `defineGame(...)` plugin from its file.
2. Add it to `builtinPlugins` in `registry.ts`.
3. Add a matching `gameCatalog` entry in `catalog.ts` (`id`, `name`, `version`,
   `flagship`, `description`). A test keeps the catalog in sync with the registry.
4. New round kinds (Way 2): `export` the block from `packages/games/src/index.ts`.

It now appears on **Create** as a template. If you set `manifest.flagship: true`
**and** ship a `buildConfig` pool, it's a ready-to-play **Game From Doot**, surfaced
as a "Host now" card on **Explore** and **Home** (a catalog test enforces that a
flagship really has a pool).

---

## 9. External plugins (roadmap, not yet)

Registering a game by **URL** as a sandboxed external plugin (an iframe behind a
typed postMessage bridge, so it never sees cookies, DB routes, or the raw relay) is
specified in PRD §9 but **not yet implemented**. Today, games live in-repo as above.
When the bridge lands, the contract on this page is what an external plugin will
implement; nothing here changes.
