# Authoring a game

Doot games are built from **blocks**. A block is a standalone round kind (Guess, Rate, Poll, …), think of it like a node in Node-RED. A game is a **composition**: a manifest plus an ordered list of `{ block, content }`. The engine's generic renderer mounts the right block per round and merges their results, so most games need *no components at all*.

There are four ways to author, easy → powerful.

## 1. Compose existing blocks (no code)

A new game type is just a manifest and a default composition:

```ts
import { defineGame } from '@doot-games/sdk'
import { guessBlock, rateBlock } from '@doot-games/games'

export const myGame = defineGame({
  manifest: { id: 'my-game', name: 'My Game', version: '0.1.0', author: 'you', capabilities: ['timer'] },
  blocks: [guessBlock, rateBlock],
  defaultConfig: {
    title: 'My Game',
    rounds: [
      { block: 'guess', content: { subject: 'Q1', prompt: 'Who is this?', image: '', timer: 20,
        options: [{ label: 'A' }, { label: 'B' }], correct: 0 } },
      { block: 'rate',  content: { subject: 'Q1', prompt: 'Rate it', image: '', timer: null,
        categories: [{ id: 'fun', label: 'Fun' }], scale: { kind: 'numeric', min: 1, max: 10, step: 1 } } },
    ],
  },
})
```

That's it, Host, Player, and Results are rendered for you. **VoteBox is exactly this**: `[guess, rate]` alternating (`packages/games/src/games/votebox.ts`).

## 2. Write a new block (a new round kind)

A block declares only what's unique to its kind. Build it with `defineBlock`:

```ts
import { defineBlock, z } from '@doot-games/sdk'
import MyPlayer from './MyPlayer.vue'
import MyHost from './MyHost.vue'

export const myBlock = defineBlock<MyContent, MyInput>({
  kind: 'my-kind',
  name: 'My Kind',
  contentSchema,                 // Zod; the editor auto-forms from it (image fields → upload+preview)
  defaultContent: () => ({ /* … */ }),
  timerOf: (c) => c.timer,
  emptyInput: () => ({ /* initial value */ }),
  isComplete: (c, input) => /* ready to submit? */ true,
  PlayerInput: MyPlayer,         // phone view: props { content, modelValue, disabled }, emits update:modelValue
  HostDisplay: MyHost,           // big-screen view: props { content, inputs, state, answer }
  aggregate: (ctx) => ({ /* leaderboard / awards / distributions / stats */ }),
  redactContent: (c) => c,       // optional: strip answers before publish
  answerOf: (c) => undefined,    // optional: answer revealed at reveal
})
```

The player view is a controlled input (`v-model` of the input value); the generic renderer owns the "Lock it in" button and gates it on `isComplete`. The host view shows the live tally. `aggregate` is pure and unit-testable (see `packages/games/src/blocks/aggregate.test.ts`). The standard blocks, `guess`, `rate`, `poll` in `packages/games/src/blocks/`, are the worked examples. **Rate** shows a flexible scale: numeric, letter grades, or tiers (any ordered `{ label, value }` steps).

## 3. Remix / template

Ship a preconfigured composition of existing blocks, same as (1), with curated default content.

## 4. Full custom

For a game that doesn't fit the block model, override the rendered views:

```ts
defineGame({
  manifest, blocks: [],
  defaultConfig: { title, rounds: [] },
  components: { Host: MyHost, Player: MyPlayer, Results: MyResults },
})
```

Custom views reach the live room with `injectDootRoom()` from `@doot-games/engine/vue` (reactive reads, `room.submit`, `room.host.*`), the engine still handles all the relay machinery.

## The editor (auto-form from a block's schema)

Every block is authorable in the UI with **no editor code**. The web app's
editor (`/editor/<game-type>`) seeds from a game type's default composition,
then lets a host edit the title and the ordered list of rounds. Each round is
authored by a form generated from its block's `contentSchema`:
`@doot-games/ui`'s `SchemaForm` walks the Zod schema (`describeSchema`) into a
field tree and renders a control per field, objects nest, arrays get
add/remove/reorder, and a discriminated union (like Rate's `scale`) becomes a
variant selector. A live preview of the phone view sits beside the form, and
each round is validated against its block schema before hosting.

On top of the raw schema the editor applies a few **field-name conventions**:

| Field name | Rendered as |
| --- | --- |
| `image` (string) | URL input + live preview (presigned upload swaps in later) |
| `prompt` (string) | multi-line textarea |
| `timer` / any nullable number | a number with an on/off toggle |
| `correct` (number, with a sibling `options` array) | a "mark correct" option select |
| `id` inside an array item | a compact slug, auto-seeded when you add an item |

So naming a block's content fields with these conventions gets you good form
ergonomics for free. When a block needs something the generic form can't
express, set `Editor` on the block (the `RoundBlock.Editor?` slot) for a custom
per-round editor; everything else still renders generically.

From the editor you can either **Host now**, which stows the composition in an
in-memory draft (`useGameDraft`) and opens `/host/<type>`, or **Save**, which
`POST`s it to `/api/games` and returns a shareable `/g/<id>` link. A saved game
is hosted by id at `/host/g/<id>` (HostRoom loads the stored composition);
either way the host publishes the **redacted** config to the relay exactly as
it does the default deck. The durable store holds game *definitions* only, never live room state, which stays on the relay.

Saving requires an account (optional, argon2id via `nuxt-auth-utils`); hosting
and playing never do. Each saved game has a **visibility**, `private` (owner
only), `unlisted` (anyone with the link), or `public` (also listed on
`/explore`), enforced server-side in `getGame`/the list routes.

## How it fits together

- The engine owns rooms, roster, the round state machine, late joiners, reconnect, timers, and answer-withholding, none of it per-game.
- `gameRounds`, `redactGameConfig`, `gameAnswerKeys`, and `scoreGame` (in `@doot-games/games/runtime`) derive everything the engine and results need from the blocks.
- `GameHost`, `GamePlayer`, `GameResults` are the generic renderer; a plugin overrides them only for the full-custom path.

No game imports another. New game = compose blocks. New round kind = one block.
