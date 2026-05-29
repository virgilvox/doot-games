# Handoff

Snapshot of where Doot stands, for the next session or contributor. Pair with [`Doot-PRD.md`](./Doot-PRD.md) (the spec), [`CLAUDE.md`](./CLAUDE.md) (conventions), and [`docs/`](./docs).

_Last updated: 2026-05-29. Branch: `build/mvp-scaffold`._

## What exists and is verified

A pnpm monorepo built from the PRD. **54 tests pass, all library packages typecheck, and the Nuxt app builds (SSR).** Two rounds of deep multi-agent audit ran; all findings are fixed (see below).

| Package | State |
| --- | --- |
| `@doot-games/engine` | Done + tested. Room runtime, phase/round state machine, reconnect-by-name identity (via `relay.get`), late-joiner eligibility, CLASP wrapper, answer withholding, reactive `useDootRoom`. |
| `@doot-games/sdk` | Done. The **block** contract (`RoundBlock` + `defineBlock`) and the **composition** contract (`GamePlugin` + `defineGame`), Zod manifest, round primitives, results types. |
| `@doot-games/themes` | Done + tested. Five token packs (doot/cutesie/cyber/professional/playful), CSS generation, base stylesheet. |
| `@doot-games/ui` | Done. 18 theme-aware components + the ported design-system stylesheet. |
| `@doot-games/games` | Done + tested. Blocks (guess/rate/poll/rank), the generic renderer (GameHost/GamePlayer/GameResults), and five games (Guess, Rate, Poll, Rank, VoteBox) as block compositions. |
| `apps/web` | Builds. Home/explore/create + client-only host/play; renders a game's block-driven views (or a custom override) over the live relay. |

## The architecture (read this first)

Games are built from **blocks** — standalone round kinds (Guess, Rate, Poll, Rank), like Node-RED nodes. A **game** is a *composition*: a manifest + an ordered list of `{ block, content }`. The generic renderer mounts the right block per round and merges their results, so most games need no components. See [`docs/authoring-a-game.md`](./docs/authoring-a-game.md).

```
packages/games/src/
  blocks/{guess,rate,poll,rank}/   block.ts (schema + aggregate + withholding) + Player.vue + Host.vue
  runtime/                    GameHost/GamePlayer/GameResults (generic) + derive.ts (rounds/redact/answers/score)
  games/                      votebox=[guess,rate]; guess/rate/poll/rank = single-block  (~20 lines each)
```

No game imports another. New game = compose blocks. New round kind = one block. Full-custom = override `components`. **Rate** has a flexible scale: numeric, letter grades, or tiers.

## How to run

```bash
pnpm install
pnpm dev          # http://localhost:3000  (uses the public relay; no DB needed)
pnpm test         # 54 tests
pnpm -r typecheck
pnpm --filter @doot-games/web build
```

Exercise a game: open `/`, host a type (e.g. `/host/votebox`) on one screen, open `/play/<CODE>` on another.

## Key decisions

- **Blocks + compositions** (above) — the easy path; full-custom override is the escape hatch.
- **Game types are round kinds**: Guess, Rate, Poll are distinct single-type games; VoteBox is the Guess+Rate composite.
- **CSS-first animation**; `vue3-pixi` is installed and reserved for canvas-heavy work (DrawCanvas, mini-games). ConfettiBurst is CSS.
- **Answer withholding**: the host keeps full content locally and publishes a redacted composition; answers are revealed per round. Players/spectators never receive answer keys.
- **Per-game theme** is applied on host/play (host stamps `meta.themeId`; player adopts it via the global ThemeProvider).
- **The design system** is `doot-mockup.html`, ported to `@doot-games/themes` + `@doot-games/ui`, with an accessibility baseline.
- Commit messages contain **no AI attribution** (project rule).

## Audit findings (all fixed)

A deep audit found and we fixed: a reconnect bug (couldn't restore `joinedAtIndex` against real CLASP — now uses `relay.get`); reactivity bugs (host tallies / player submit state were stale — the composable now routes reads through the reactive snapshot); a shared-relay `connected` seeding bug; `timer:0` auto-lock; rate-only declaring a bogus winner; and RatingStrip ARIA. Tests were strengthened to cover the reconnect case.

## Not built yet (PRD phase one and beyond)

1. **More blocks**: Draw (Pixi canvas + ephemeral media — would finally exercise vue3-pixi), Buzz (reaction/first-correct), Quip (free-text + a follow-on vote). Each is one block.
2. **Persistence**: Postgres + Drizzle schema, the `/api/games` routes, saved games.
3. **Auth**: `nuxt-auth-utils` email/password, optional and non-blocking.
4. **The editor**: auto-generate a form from each block's `contentSchema` (image fields → upload + preview).
5. **Uploads**: presigned PUT to Spaces/MinIO.
6. **External plugins**: sandboxed iframe + postMessage bridge + publishing (PRD §9).
7. **A live browser playtest** has not been run here (needs the relay + two devices).

## Known gaps / things to check first

- `apps/web` typecheck via `nuxi typecheck` is heavier than the library `tsc` checks; the production build is the fast signal that everything integrates.
- Per-package READMEs are not written yet (PRD §22 asks for them).
- PRD §8 still describes the pre-block plugin contract; the block model is in `docs/authoring-a-game.md` and `packages/sdk/src/block.ts`. Reconcile when convenient.

## Suggested next step

The editor (auto-form from a block's `contentSchema`, with image upload + preview) is high-leverage — it makes every block authorable in the UI and unblocks saved games. Or add the Draw block to exercise the Pixi + ephemeral-media path. Both are well-scoped against the block contract.
