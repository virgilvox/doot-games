# Handoff

Snapshot of where Doot stands, for the next session or contributor. Pair with [`Doot-PRD.md`](./Doot-PRD.md) (the spec), [`CLAUDE.md`](./CLAUDE.md) (conventions), and [`docs/`](./docs).

_Last updated: 2026-05-29. Branch: `main` (the scaffold was merged to `main`; work on `main` or a branch off it)._

## What exists and is verified

A pnpm monorepo built from the PRD. **72 tests pass (+1 live test, opt-in), every package typechecks (including the stricter `nuxi typecheck`), and the Nuxt app builds (SSR).** The core play loop is **verified end-to-end against the real CLASP relay** (see below), and authored games now **persist** and are shareable. Multiple rounds of deep multi-agent audit ran; all findings are fixed.

**The full user loop works today:** open `/`, pick a type → edit rounds in the schema-driven editor → **Host now** (ephemeral) or **Save** for a shareable `/g/<id>` link → host on a big screen → players join from phones over the relay → play → animated results. Hosting and playing never need an account; **saving** uses an optional account (email/password, argon2id) and each saved game has a **visibility**: private (owner only), unlisted (anyone with the link), or public (also listed on `/explore`). Zero DB setup — accounts and games live in a local SQLite file.

| Package | State |
| --- | --- |
| `@doot-games/engine` | Done + tested. Room runtime, phase/round state machine, reconnect-by-name identity (via `relay.get`), late-joiner eligibility, CLASP wrapper, answer withholding, reactive `useDootRoom`. |
| `@doot-games/sdk` | Done. The **block** contract (`RoundBlock` + `defineBlock`) and the **composition** contract (`GamePlugin` + `defineGame`), Zod manifest, round primitives, results types. |
| `@doot-games/themes` | Done + tested. Five token packs (doot/cutesie/cyber/professional/playful), CSS generation, base stylesheet. |
| `@doot-games/ui` | Done. 18 theme-aware components + the ported design-system stylesheet + the **schema-driven editor form** (`SchemaForm` + `describeSchema`/`blankValue` introspection, tested). |
| `@doot-games/games` | Done + tested. Blocks (guess/rate/poll/rank), the generic renderer (GameHost/GamePlayer/GameResults), and five games (Guess, Rate, Poll, Rank, VoteBox) as block compositions. |
| `apps/web` | Builds. Home/explore/create + client-only host/play + the **editor** (`/editor/<type>`) + **persistence** (`/api/games` over Drizzle+libSQL, save → shareable `/g/<id>`, host-by-id at `/host/g/<id>`) + **optional auth** (`nuxt-auth-utils` + argon2id, `/login`, owner-scoped saves with private/unlisted/public visibility); renders a game's block-driven views (or a custom override) over the live relay. |

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
pnpm test         # 72 tests (+1 live test, skipped unless DOOT_LIVE=1)
pnpm -r typecheck # all packages, incl. nuxi typecheck of apps/web
pnpm --filter @doot-games/web build

# Verify the core loop against the real relay (network; ~7s):
DOOT_LIVE=1 pnpm vitest run packages/games/src/relay.live.test.ts
```

Author a game: open `/create`, pick a type → `/editor/<type>`, edit the rounds, then **Host now** or **Save** (→ shareable `/g/<id>`). Or exercise a default deck directly: host a type (e.g. `/host/votebox`) on one screen, open `/play/<CODE>` on another.

**Persistence** is zero-config: with no `DATABASE_URL`, accounts and saved games go to a local SQLite file (`apps/web/.data/doot.sqlite`, git-ignored). A libSQL/Turso URL (`file:`, `libsql://`, `http(s)://`) is used as-is; a `postgres://` URL currently falls back to SQLite with a warning (Postgres wiring is a follow-up).

**Auth** is optional — needed only to save games. Set `SESSION_PASSWORD` (32+ chars) to seal session cookies in production; dev uses a stable fallback. Sign up / in at `/login`.

## Key decisions

- **Blocks + compositions** (above) — the easy path; full-custom override is the escape hatch.
- **Game types are round kinds**: Guess, Rate, Poll are distinct single-type games; VoteBox is the Guess+Rate composite.
- **CSS-first animation**; `vue3-pixi` is installed and reserved for canvas-heavy work (DrawCanvas, mini-games). ConfettiBurst is CSS.
- **Answer withholding**: the host keeps full content locally and publishes a redacted composition; answers are revealed per round. Players/spectators never receive answer keys.
- **Per-game theme** is applied on host/play (host stamps `meta.themeId`; player adopts it via the global ThemeProvider).
- **The editor is schema-driven**: `SchemaForm` (in `@doot-games/ui`) walks a block's `contentSchema` and renders the form — no per-block editor code. Doot field-name conventions (`image`/`prompt`/`timer`/`correct`/`id`) get nicer controls; a block can still set `Editor` for a full-custom round editor.
- **Persistence stores definitions only.** Drizzle over libSQL (SQLite by default, zero-config); the `games` table holds the JSON `GameComposition`. `/api/games` validates at the boundary (shape + known plugin via the server-safe `@doot-games/games/catalog`; deep per-round validation is client-side in the editor). Honors the invariant: nothing about a live room is ever written here. "Host now" still uses the in-memory draft for an ephemeral game.
- **Auth is optional and only gates saving.** `nuxt-auth-utils` (sealed httpOnly cookie, no server store) + argon2id (`@node-rs/argon2`). Hosting and playing need no account. Saving requires login and stamps an `ownerId`; `/api/games` returns the caller's games for `?scope=mine` and publicly-listed games otherwise. **Visibility** (`private`/`unlisted`/`public`) is enforced server-side: a private game reads as 404 to non-owners (so its existence doesn't leak); unlisted is link-only; public is also listed. Augment the session-user type in `apps/web/auth.d.ts`.
- **The core loop is verified live.** A `DOOT_LIVE=1` test drives a host + player headlessly through the engine against `wss://relay.clasp.to` and asserts redacted-config delivery, the answer-withholding invariant over the wire, input round-trip, and play-to-results. It is skipped by default so the suite stays offline.
- **The design system** is `doot-mockup.html`, ported to `@doot-games/themes` + `@doot-games/ui`, with an accessibility baseline.
- Commit messages contain **no AI attribution** (project rule).

## Audit findings (all fixed)

Across audit rounds we fixed: a reconnect bug (couldn't restore `joinedAtIndex` against real CLASP — now uses `relay.get`); reactivity bugs (host tallies / player submit state were stale — the composable now routes reads through the reactive snapshot); a player-input null-`value` crash on mid-round joins; a shared-relay `connected` seeding bug; `timer:0` auto-lock; rate scale fixes (tie rounding, min-baseline fill, tier labels on the host, required ratings); and the results page dropping a block's distribution `display`/`note` (rankings rendered as "N votes") — now a shared, tested `distributionToBars` honors block-provided `max`/`display`/`note`. Tests were strengthened to cover reconnect, the rate scale, and results rendering.

**Open design note (Rank):** `emptyInput` seeds the authored order, so a player who submits without reordering casts the authored order as a real ballot — consensus drifts toward the authored order proportional to non-engagement. It's a deliberate trade (a ranking has no natural "empty" state); revisit with a per-player shuffle or a "must reorder" gate if it matters.

## Not built yet (PRD phase one and beyond)

1. **Uploads**: presigned PUT to Spaces/MinIO. The editor's image fields are URL-input + preview today (`ImageField.vue`); swapping in an uploader only changes how the field's value is set.
2. **Postgres**: the durable store is libSQL/SQLite today (zero-config). For multi-instance prod, wire `drizzle-orm/node-postgres` behind the same `useDb()`/repo seam and select the driver by `DATABASE_URL`. The docker prod compose still names Postgres — reconcile when this lands.
3. **More blocks**: Draw (Pixi canvas + ephemeral media — would finally exercise vue3-pixi), Buzz (reaction/first-correct), Quip (free-text + a follow-on vote). Each is one block — and each becomes authorable in the editor and savable for free the moment it ships.
4. **Account niceties**: editing/deleting saved games, changing visibility after save, and magic-link (SMTP) sign-in are not built. Today a save creates a new immutable record; there is no update/delete route yet.
5. **External plugins**: sandboxed iframe + postMessage bridge + publishing (PRD §9).
6. **A real-browser playtest** (two phones) has not been run; the headless engine loop is verified live and all routes/flows are HTTP-smoke-tested (incl. the full auth + visibility matrix), but interactive form/preview behavior wants a manual pass.

## Known gaps / things to check first

- `apps/web` typecheck via `nuxi typecheck` is heavier than the library `tsc` checks (it applies `noUncheckedIndexedAccess` to imported package source). It is **green now** — a latent guarded-index hole in `poll/block.ts` it surfaced was fixed — so keep `pnpm -r typecheck` clean. The production build remains the fast signal that everything integrates.
- **DB driver**: only the libSQL/SQLite path is implemented; a `postgres://` `DATABASE_URL` silently falls back to the local file (with a console warning). Don't assume Postgres works in prod yet.
- **Set `SESSION_PASSWORD`** (32+ chars) in production — the dev fallback in `nuxt.config.ts` must not ship.
- There is **no update/delete** for saved games yet, and **no rate-limiting** on auth routes — add before exposing an instance publicly.
- A pre-auth saved game (legacy/anonymous, `owner_id` null) can still be fetched by anyone if its visibility is `private`, since "no owner" matches "no requester". New games always have an owner, so this only affects rows created before auth.
- Per-package READMEs are not written yet (PRD §22 asks for them).
- PRD §8 still describes the pre-block plugin contract; the block model is in `docs/authoring-a-game.md` and `packages/sdk/src/block.ts`. Reconcile when convenient.

## Suggested next step

The end-to-end loop (author → save/share → host → play → results) works, with optional accounts and per-game visibility. The highest-leverage next moves: **(a) a real-browser two-phone playtest** to validate the interactive UI (the one thing not yet exercised), **(b) the Draw block** to exercise Pixi + ephemeral media (and get an editor form + persistence for free), **(c) uploads** (presigned PUT) to upgrade `ImageField` from URL-only, and **(d) account niceties** (edit/delete a saved game, change visibility, magic-link sign-in). (a) hardens confidence; (b)/(c) widen what hosts can make; (d) rounds out account UX.

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
> - Verify every change: `pnpm test`, `pnpm -r typecheck`, `pnpm --filter @doot-games/web build`. Today: 72 tests pass (+1 opt-in live test), all typecheck, the app builds.
>
> **Stack & run:** pnpm monorepo; Nuxt 4 + Vue 3; packages `@doot-games/{engine,sdk,ui,themes,games}` + `apps/web`. `pnpm install && pnpm dev` → http://localhost:3000 (uses the public relay `wss://relay.clasp.to`; saved games use a zero-config local SQLite file — no DB setup needed). Author at `/editor/<type>`, **Save** → `/g/<id>`, host at `/host/<type>` or `/host/g/<id>` (votebox, guess, rate, poll, rank), play at `/play/<CODE>`.
>
> **Your task:** see `HANDOFF.md` → "Not built yet" / "Suggested next step" and pick one — likely the **Draw block** (vue3-pixi canvas + ephemeral media on the relay), **uploads** (presigned PUT for `ImageField`), or **account niceties** (edit/delete saved games, change visibility). Confirm scope with me before large changes, work in small verified increments, and update `HANDOFF.md` as you go.
