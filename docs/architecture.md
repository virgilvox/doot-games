# Architecture

Doot has three layers: a real-time **engine**, a game **plugin contract**, and a **shell** app. The full rationale is in [`Doot-PRD.md`](../Doot-PRD.md); this is the implementer's map of what exists today.

## Packages

```
packages/engine   @doot-games/engine  CLASP wrapper, room runtime, state machine, Vue composable
packages/sdk      @doot-games/sdk     plugin contract, round primitives, Zod schemas, scoring types
packages/themes   @doot-games/themes  five theme token packs + CSS generation (the design system)
packages/ui       @doot-games/ui      theme-aware Vue components + design-system stylesheet
packages/games    @doot-games/games   blocks (incl. quip/vote/fill/split) + 10 games (incl. flagships) + renderer + scoring + markdown import
apps/web          @doot-games/web     Nuxt shell: home, explore, create, editor, host, play, auth, /api
```

**Dependency direction (one-way):** `games → sdk, ui`; `sdk → engine, themes`; `ui → themes, engine`; `apps/web → everything`. The engine never imports a game; the sdk never imports the shell.

## The two-state split

- **Ephemeral** state (phase, rounds, roster, inputs, live media) lives on the **CLASP relay**, namespaced under `/doot/<ROOM>/…`. Nothing about a live room touches the database.
- **Durable** state (accounts, saved games, plugin registry, stats) lives in a SQL store, Drizzle over libSQL/SQLite today (zero-config local file), Postgres behind the same `useDb()` seam as the documented prod follow-up. Auth (better-auth), saved games, and presigned uploads are all built and live; only the live-room state stays off the database, on the relay.

## The engine (the heart)

- `state-machine.ts`, the pure phase/round reducer (`lobby → active → (ready→open→locked→reveal)* → results`). Fully unit-tested.
- `identity.ts`, room codes (unambiguous alphabet) and `playerId = p_<hash(room+name)>` for reconnect-by-name.
- `eligibility.ts`, late-joiner `joinedAtIndex`.
- `addresses.ts`, the relay address scheme.
- `relay.ts`, the `RelayClient` interface + `createClaspRelay` (wraps `@clasp-to/core`).
- `room.ts`, `RoomRuntime`: subscriptions, host actions, roster/presence, heartbeat, host auto-lock, **answer withholding** (publishes a redacted config; reveals each answer only at that round's reveal).
- `vue/index.ts`, `useDootRoom` (reactive surface) + `provideDootRoom`/`injectDootRoom`.

The runtime is framework-agnostic and is exercised by an in-memory fake relay in `room.test.ts` (host + player end to end).

## Game types and plugins

Games are built from **blocks** + **compositions** (see [authoring-a-game.md](./authoring-a-game.md)). A *block* is a standalone round kind declaring a content schema, Player/Host views, a pure `aggregate`, and optional answer-withholding (nine blocks: guess, rate, poll, rank, draw, plus the two-phase family quip, vote, fill, split). A *game* is a manifest plus an ordered `{ block, content }` list; the generic `GameHost`/`GamePlayer`/`GameResults` renderer mounts the right block per round and merges results. The ten built-ins: Guess, Rate, Poll, Rank, Draw (single-block), **VoteBox** (`[guess, rate]`), **Custom** (all blocks), and three flagship **"Games From Doot"**, Quip Clash, Mad Libs, and Split the Room (two-phase make→judge games with content pools, surfaced as ready-to-play). The **two-phase primitive** lets a judge round's content be derived at runtime from the prior round's anonymized inputs (`room.ts` publishes to `round/<i>/content` + `round/<i>/reveal`). No game imports another.

## Tests

`pnpm test` runs Vitest across the workspace (117 tests + 2 opt-in live): the engine state machine, identity, eligibility, addresses, the room runtime + two-phase derive/reveal (fake relay), the theme registry, schema-form introspection, the block aggregates + scoring knobs (guess/rate/poll/rank/vote/fill/split), the catalog/registry sync, markdown import, and a two-phase integration test. The opt-in `DOOT_LIVE=1` tests drive the real CLASP relay.
