# Authoring examples

Copy-paste starting points for the four ways to author a Doot game, plus the
two-phase (make → judge) pattern that powers the flagship games. Each example is
a small, heavily-commented, self-contained reference. Read them alongside
[`docs/authoring-a-game.md`](../docs/authoring-a-game.md), which explains the
model in prose.

> These are **reference files**, not part of the build. To ship a real game, drop
> the equivalent files under `packages/games/src/` and register them (see the last
> section). The APIs here mirror the real first-party games, so they stay accurate.

## The model in one sentence

A **block** is a round kind (Guess, Rate, Poll, Quip, …); a **game** is a manifest
plus an ordered list of `{ block, content }`. The engine renders Host, Player, and
Results for you, runs the room/relay/state-machine, and withholds answers, so most
games are ~20 lines and need no components.

## The four ways to author (easy → powerful)

| # | Way | When | Example |
| --- | --- | --- | --- |
| 1 | **Compose existing blocks** (no code) | You just want a new game out of Guess/Rate/Poll/Rank/Draw | [`01-compose-blocks.ts`](./01-compose-blocks.ts) |
| 2 | **Write a new block** (a new round kind) | You need an interaction the existing blocks don't cover | [`02-new-block/`](./02-new-block/) |
| 3 | **Remix / template with a content pool** | A curated, replayable game that draws fresh content each play | [`03-template-with-pool.ts`](./03-template-with-pool.ts) |
| 4 | **Full custom** (override the views) | The block model doesn't fit; you want bespoke Host/Player/Results | [`04-full-custom/`](./04-full-custom/) |

Plus: [`05-two-phase.ts`](./05-two-phase.ts) - the **make → judge** pattern (collect
free-text, then vote on the anonymized, shuffled answers). This is how Quip Clash,
Mad Libs, and Split the Room work.

## Registering a game

Once your files live under `packages/games/src/`:

1. `export` your `defineGame(...)` plugin (e.g. from `packages/games/src/games/my-game.ts`).
2. Add it to `builtinPlugins` in `packages/games/src/registry.ts`.
3. Add a matching entry to `gameCatalog` in `packages/games/src/catalog.ts`
   (`id`, `name`, `version`, `flagship`, `description`). A test keeps the catalog
   in sync with the registry, so this is enforced.
4. New round kinds (way 2): `export` the block from `packages/games/src/index.ts`.

That's it: it appears on **Create** (as a template) and, if `flagship: true` with a
`buildConfig` content pool, under **Games From Doot** on Explore/Home.

## External plugins (not yet)

Registering a game by **URL** as a sandboxed external plugin (iframe + postMessage
bridge) is on the roadmap (PRD §9), **not yet implemented**. Today, first-party
games live in-repo as above. See `docs/architecture.md` for the planned bridge.
