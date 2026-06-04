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
| **two-phase:** `derive(ctx)?` | build this round's content from earlier rounds' inputs; returns `{ publish, answer? }` |
| `toVoteText(content, input)?` | render this block's submission to votable text for a later judge round |

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
rate, poll, rank, draw, hivemind, most-likely, ballpark, buzzer) and **Two-phase
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
- **Markdown import:** the editor can build a whole game from a markdown spec
  (guess/poll/rank/rate/draw/hivemind/mostlikely/ballpark; a `## draw` round with
  `vote: true` expands to draw-then-vote). Format:
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
