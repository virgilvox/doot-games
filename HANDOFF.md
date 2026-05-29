# Handoff

Snapshot of where Doot stands, for the next session or contributor. Pair with [`Doot-PRD.md`](./Doot-PRD.md) (the spec), [`CLAUDE.md`](./CLAUDE.md) (conventions), and [`docs/`](./docs).

_Last updated: 2026-05-29. Branch: `main` (the scaffold was merged to `main`; work on `main` or a branch off it)._

## What exists and is verified

A pnpm monorepo built from the PRD. **69 tests pass, every package typechecks (including the stricter `nuxi typecheck`), and the Nuxt app builds (SSR).** Multiple rounds of deep multi-agent audit ran; all findings are fixed (see below).

| Package | State |
| --- | --- |
| `@doot-games/engine` | Done + tested. Room runtime, phase/round state machine, reconnect-by-name identity (via `relay.get`), late-joiner eligibility, CLASP wrapper, answer withholding, reactive `useDootRoom`. |
| `@doot-games/sdk` | Done. The **block** contract (`RoundBlock` + `defineBlock`) and the **composition** contract (`GamePlugin` + `defineGame`), Zod manifest, round primitives, results types. |
| `@doot-games/themes` | Done + tested. Five token packs (doot/cutesie/cyber/professional/playful), CSS generation, base stylesheet. |
| `@doot-games/ui` | Done. 18 theme-aware components + the ported design-system stylesheet + the **schema-driven editor form** (`SchemaForm` + `describeSchema`/`blankValue` introspection, tested). |
| `@doot-games/games` | Done + tested. Blocks (guess/rate/poll/rank), the generic renderer (GameHost/GamePlayer/GameResults), and five games (Guess, Rate, Poll, Rank, VoteBox) as block compositions. |
| `apps/web` | Builds. Home/explore/create + client-only host/play + the **editor** (`/editor/<type>`); renders a game's block-driven views (or a custom override) over the live relay. |

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
pnpm test         # 69 tests
pnpm -r typecheck # all packages, incl. nuxi typecheck of apps/web
pnpm --filter @doot-games/web build
```

Author a game: open `/create`, pick a type → `/editor/<type>`, edit the rounds, "Host this game". Or exercise the default deck directly: host a type (e.g. `/host/votebox`) on one screen, open `/play/<CODE>` on another.

## Key decisions

- **Blocks + compositions** (above) — the easy path; full-custom override is the escape hatch.
- **Game types are round kinds**: Guess, Rate, Poll are distinct single-type games; VoteBox is the Guess+Rate composite.
- **CSS-first animation**; `vue3-pixi` is installed and reserved for canvas-heavy work (DrawCanvas, mini-games). ConfettiBurst is CSS.
- **Answer withholding**: the host keeps full content locally and publishes a redacted composition; answers are revealed per round. Players/spectators never receive answer keys.
- **Per-game theme** is applied on host/play (host stamps `meta.themeId`; player adopts it via the global ThemeProvider).
- **The editor is schema-driven**: `SchemaForm` (in `@doot-games/ui`) walks a block's `contentSchema` and renders the form — no per-block editor code. Doot field-name conventions (`image`/`prompt`/`timer`/`correct`/`id`) get nicer controls; a block can still set `Editor` for a full-custom round editor. The authored composition reaches the host via an in-memory draft (`useGameDraft`), never a DB.
- **The design system** is `doot-mockup.html`, ported to `@doot-games/themes` + `@doot-games/ui`, with an accessibility baseline.
- Commit messages contain **no AI attribution** (project rule).

## Audit findings (all fixed)

Across audit rounds we fixed: a reconnect bug (couldn't restore `joinedAtIndex` against real CLASP — now uses `relay.get`); reactivity bugs (host tallies / player submit state were stale — the composable now routes reads through the reactive snapshot); a player-input null-`value` crash on mid-round joins; a shared-relay `connected` seeding bug; `timer:0` auto-lock; rate scale fixes (tie rounding, min-baseline fill, tier labels on the host, required ratings); and the results page dropping a block's distribution `display`/`note` (rankings rendered as "N votes") — now a shared, tested `distributionToBars` honors block-provided `max`/`display`/`note`. Tests were strengthened to cover reconnect, the rate scale, and results rendering.

**Open design note (Rank):** `emptyInput` seeds the authored order, so a player who submits without reordering casts the authored order as a real ballot — consensus drifts toward the authored order proportional to non-engagement. It's a deliberate trade (a ranking has no natural "empty" state); revisit with a per-player shuffle or a "must reorder" gate if it matters.

## Not built yet (PRD phase one and beyond)

1. **More blocks**: Draw (Pixi canvas + ephemeral media — would finally exercise vue3-pixi), Buzz (reaction/first-correct), Quip (free-text + a follow-on vote). Each is one block — and each becomes authorable in the editor for free the moment it ships.
2. **Persistence**: Postgres + Drizzle schema, the `/api/games` routes, saved games. The editor already produces a clean `GameComposition`; this just needs to store/load it (it currently lives only in the in-memory draft).
3. **Auth**: `nuxt-auth-utils` email/password, optional and non-blocking.
4. **Uploads**: presigned PUT to Spaces/MinIO. The editor's image fields are URL-input + preview today; swapping in an uploader only changes how the field's value is set (see `ImageField.vue`).
5. **External plugins**: sandboxed iframe + postMessage bridge + publishing (PRD §9).
6. **A live browser playtest** has not been run here (needs the relay + two devices). The editor routes were smoke-tested (200, no boot errors); interactive form/preview behavior wants a real browser pass.

## Known gaps / things to check first

- `apps/web` typecheck via `nuxi typecheck` is heavier than the library `tsc` checks (it applies `noUncheckedIndexedAccess` to imported package source). It is **green now** — a latent guarded-index hole in `poll/block.ts` it surfaced was fixed — so keep `pnpm -r typecheck` clean. The production build remains the fast signal that everything integrates.
- Per-package READMEs are not written yet (PRD §22 asks for them).
- PRD §8 still describes the pre-block plugin contract; the block model is in `docs/authoring-a-game.md` and `packages/sdk/src/block.ts`. Reconcile when convenient.

## Suggested next step

With the editor in, the two highest-leverage moves are: **persistence** (Postgres + Drizzle + `/api/games`) to save the `GameComposition`s the editor now produces, and the **Draw block** to exercise the Pixi + ephemeral-media path (and pick up an auto-generated editor form for free). Both are well-scoped against the block contract.

---

## Fresh-session kickoff prompt

Paste this into a new session to onboard the next agent:

> You're picking up **Doot** — a self-hostable platform for live party games (one host on a big screen, players join from phones over the CLASP real-time relay). Repo: this directory; git remote `virgilvox/doot-games`; trunk branch **`main`** (the MVP scaffold was merged in).
>
> **Read first, in order:** `HANDOFF.md` (current state + what's next), `CLAUDE.md` (conventions + invariants — read fully), `docs/authoring-a-game.md` (the block model), `Doot-PRD.md` (full spec). Design sources: `doot-mockup.html` (the shell/theme look + copy — source of truth) and `votebox (1).html` (the original gameplay prototype).
>
> **Hard rules:**
> - Commit messages are plain with **no AI attribution** (no "Generated with", no `Co-Authored-By` trailers). `main` is the trunk now — work on `main` or a branch off it.
> - **Games are blocks + compositions.** A *block* is a standalone round kind (guess/rate/poll/rank) declaring a content schema + Player view + Host view + `aggregate` + optional answer-withholding; a *game* is a manifest + an ordered `{ block, content }` list rendered by the generic `GameHost`/`GamePlayer`/`GameResults`. New game = compose blocks; new round kind = one block; full-custom = override `components`. Never reintroduce per-game components or make one game import another.
> - Architecture invariants (see `CLAUDE.md`): ephemeral state lives on the relay, durable on Postgres, nothing about a live room is written to the DB during play; the engine never imports a game; answer keys are withheld until reveal; identity is reconnect-by-name.
> - **CSS-first animation**; use `vue3-pixi` (installed) only for canvas-heavy work (the Draw block, mini-games).
> - Verify every change: `pnpm test`, `pnpm -r typecheck`, `pnpm --filter @doot-games/web build`. Today: 69 tests pass, all typecheck, the app builds.
>
> **Stack & run:** pnpm monorepo; Nuxt 4 + Vue 3; packages `@doot-games/{engine,sdk,ui,themes,games}` + `apps/web`. `pnpm install && pnpm dev` → http://localhost:3000 (uses the public relay `wss://relay.clasp.to`; no DB needed to host/play). Author at `/editor/<type>`, host at `/host/<type>` (votebox, guess, rate, poll, rank), play at `/play/<CODE>`.
>
> **Your task:** see `HANDOFF.md` → "Not built yet" / "Suggested next step" and pick one — likely **persistence** (Postgres + Drizzle + `/api/games` to save the editor's compositions) or the **Draw block** (vue3-pixi canvas + ephemeral media on the relay). Confirm scope with me before large changes, work in small verified increments, and update `HANDOFF.md` as you go.
