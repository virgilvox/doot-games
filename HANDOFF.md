# Handoff

Snapshot of where Doot stands, for the next session or contributor. Pair with [`Doot-PRD.md`](./Doot-PRD.md) (the spec), [`CLAUDE.md`](./CLAUDE.md) (conventions), and [`docs/`](./docs).

_Last updated: 2026-05-29. Branch: `main` (the scaffold was merged to `main`; work on `main` or a branch off it)._

## What exists and is verified

A pnpm monorepo built from the PRD, **deployed live at https://doot.games**. **82 tests pass (+1 live test, opt-in), every package typechecks (including the stricter `nuxi typecheck`), and the Nuxt app builds (SSR).** The core play loop is **verified end-to-end against the real CLASP relay** (headless) **and in a real browser** (Playwright: host + player through a full game, the Pixi Draw canvas, and auth→editor→save). Authored games **persist** and are shareable, and a markdown importer builds whole games from an LLM-written spec. Multiple audit rounds ran (incl. an independent security + correctness pass); findings are fixed. The UI is mobile-responsive (verified no overflow at 360/390px) and free of em dashes.

**The full user loop works today:** open `/`, pick a type → edit rounds in the schema-driven editor → **Host now** (ephemeral) or **Save** for a shareable `/g/<id>` link → host on a big screen → players join from phones over the relay → play → animated results. Hosting and playing never need an account; **saving** uses an optional account (email/password, argon2id) and each saved game has a **visibility**: private (owner only), unlisted (anyone with the link), or public (also listed on `/explore`). Zero DB setup, accounts and games live in a local SQLite file.

| Package | State |
| --- | --- |
| `@doot-games/engine` | Done + tested. Room runtime, phase/round state machine, reconnect-by-name identity (via `relay.get`), late-joiner eligibility, CLASP wrapper, answer withholding, reactive `useDootRoom`. |
| `@doot-games/sdk` | Done. The **block** contract (`RoundBlock` + `defineBlock`) and the **composition** contract (`GamePlugin` + `defineGame`), Zod manifest, round primitives, results types. |
| `@doot-games/themes` | Done + tested. Five token packs (doot/cutesie/cyber/professional/playful), CSS generation, base stylesheet. |
| `@doot-games/ui` | Done. Theme-aware components + the ported design-system stylesheet + the **schema-driven editor form** (`SchemaForm`) + the **Pixi drawing surface** (`DrawCanvas`) and SVG gallery thumbnail (`DrawThumb`). |
| `@doot-games/games` | Done + tested. Blocks (guess/rate/poll/rank/**draw**), the generic renderer, seven games (Guess, Rate, Poll, Rank, Draw, VoteBox, **Custom** = all blocks), and a **markdown game parser** (`parseMarkdownGame`). |
| `apps/web` | Builds + **deployed**. Home/explore/create + client-only host/play + the **editor** (`/editor/<type>`, with **Import from Markdown**) + **persistence** (`/api/games`, save → `/g/<id>`, host-by-id, owner edit/delete + change-visibility) + **auth** (`better-auth` + argon2id) + presigned image **uploads** (live, to the `doot` Space). Mobile-responsive. |

## The architecture (read this first)

Games are built from **blocks**, standalone round kinds (Guess, Rate, Poll, Rank), like Node-RED nodes. A **game** is a *composition*: a manifest + an ordered list of `{ block, content }`. The generic renderer mounts the right block per round and merges their results, so most games need no components. See [`docs/authoring-a-game.md`](./docs/authoring-a-game.md).

```
packages/games/src/
  blocks/{guess,rate,poll,rank,draw}/  block.ts (schema + aggregate + withholding) + Player.vue + Host.vue
  runtime/                    GameHost/GamePlayer/GameResults (generic) + derive.ts (rounds/redact/answers/score)
  games/                      votebox=[guess,rate]; guess/rate/poll/rank = single-block  (~20 lines each)
```

No game imports another. New game = compose blocks. New round kind = one block. Full-custom = override `components`. **Rate** has a flexible scale: numeric, letter grades, or tiers.

## How to run

```bash
pnpm install
pnpm dev          # http://localhost:3000  (uses the public relay; no DB needed)
pnpm test         # 82 tests (+1 live test, skipped unless DOOT_LIVE=1)
pnpm -r typecheck # all packages, incl. nuxi typecheck of apps/web
pnpm --filter @doot-games/web build

# Verify the core loop against the real relay (network; ~7s):
DOOT_LIVE=1 pnpm vitest run packages/games/src/relay.live.test.ts

# Real-browser playtest (needs a running dev server + Chromium):
npx playwright install chromium   # once
node scripts/playtest.mjs          # host+player loop, Draw canvas, auth→save
```

Author a game: open `/create`, pick a type → `/editor/<type>`, edit the rounds, then **Host now** or **Save** (→ shareable `/g/<id>`). Or exercise a default deck directly: host a type (e.g. `/host/votebox`) on one screen, open `/play/<CODE>` on another.

**Persistence** is zero-config: with no `DATABASE_URL`, accounts and saved games go to a local SQLite file (`apps/web/.data/doot.sqlite`, git-ignored). A libSQL/Turso URL (`file:`, `libsql://`, `http(s)://`) is used as-is; a `postgres://` URL currently falls back to SQLite with a warning (Postgres wiring is a follow-up).

**Auth** is optional, needed only to save games. Set `SESSION_PASSWORD` (32+ chars) to seal session cookies in production; dev uses a stable fallback. Sign up / in at `/login`.

**Uploads** are optional too: with no `SPACES_*` env, image fields are URL-paste only. Set `SPACES_ENDPOINT`/`SPACES_REGION`/`SPACES_BUCKET`/`SPACES_KEY`/`SPACES_SECRET` (+ optional `SPACES_PUBLIC_URL`) to enable presigned uploads. To try it locally: run MinIO, make a public-read bucket, and start dev with those vars pointed at it.

## Deployment (live at https://doot.games)

**Git push deploys.** Pushing to `main` runs `.github/workflows/deploy.yml`: a
`check` job (`pnpm test` + `pnpm -r typecheck`) gates a `build` job that builds
the Docker image (`docker/Dockerfile`) and pushes it to GHCR
(`ghcr.io/virgilvox/doot-games`), then a `deploy` job SSHes to the droplet,
copies the compose + Caddyfile, and runs `docker compose pull && up`. Migrations
are idempotent and run at container startup, so every deploy migrates.

- **Droplet**: `doot-prod`, DigitalOcean `s-1vcpu-1gb` ($6/mo) in `sfo3` (same
  region as the Space), Docker + a 2G swapfile, in the `doot` project. State is
  a SQLite file at `/opt/doot/data` (host volume); secrets live in `/opt/doot/.env`
  (never in git). The compose runs the app behind **Caddy** (automatic HTTPS).
- **DNS**: `doot.games` apex A record → the droplet (DO-managed DNS).
- **Repo secrets**: `DROPLET_HOST`, `DEPLOY_SSH_KEY` (a dedicated keypair; the
  public half is in the droplet's `authorized_keys`). GHCR auth uses the
  workflow's ephemeral `GITHUB_TOKEN`.
- **Env on the droplet**: `SESSION_PASSWORD` (generated), `PUBLIC_BASE_URL=https://doot.games`,
  `DATABASE_URL=file:/app/.data/doot.sqlite`, and the `SPACES_*` (the `doot`
  Space in sfo3; the upload key is scoped to that bucket, readwrite, and the
  bucket has CORS allowing PUT from `doot.games`).
- **Native libSQL note**: Nitro bundles libSQL's JS but not its native addon, so
  `docker/Dockerfile` copies `@libsql/linux-x64-musl` into the server output.
  A pnpm override pins one `@libsql/client` version so the bundle has a single
  native binary (better-auth's Kysely dialect and the games store agree).
- **To SSH**: `ssh -i ~/.ssh/id_ed25519 root@<droplet-ip>` (the `quirc-deploy`
  key is authorized). Find the IP with `doctl compute droplet list`.

## Key decisions

- **Blocks + compositions** (above), the easy path; full-custom override is the escape hatch.
- **Game types are round kinds**: Guess, Rate, Poll are distinct single-type games; VoteBox is the Guess+Rate composite.
- **CSS-first animation**; `vue3-pixi` is installed and reserved for canvas-heavy work (DrawCanvas, mini-games). ConfettiBurst is CSS.
- **Answer withholding**: the host keeps full content locally and publishes a redacted composition; answers are revealed per round. Players/spectators never receive answer keys.
- **Per-game theme** is applied on host/play (host stamps `meta.themeId`; player adopts it via the global ThemeProvider).
- **The editor is schema-driven**: `SchemaForm` (in `@doot-games/ui`) walks a block's `contentSchema` and renders the form, no per-block editor code. Doot field-name conventions (`image`/`prompt`/`timer`/`correct`/`id`) get nicer controls; a block can still set `Editor` for a full-custom round editor.
- **Persistence stores definitions only.** Drizzle over libSQL (SQLite by default, zero-config); the `games` table holds the JSON `GameComposition`. `/api/games` validates at the boundary (shape + known plugin via the server-safe `@doot-games/games/catalog`; deep per-round validation is client-side in the editor). Honors the invariant: nothing about a live room is ever written here. "Host now" still uses the in-memory draft for an ephemeral game.
- **Auth is `better-auth`, optional, and only gates saving.** Sealed httpOnly cookie sessions + argon2id (`@node-rs/argon2`, plugged in over better-auth's default scrypt), with built-in rate-limiting and Origin/CSRF checks. better-auth owns its own tables (user/session/account/verification) via its Kysely adapter over the **same libSQL DB** as the games store, and runs its migrations at startup (`server/plugins/auth-migrate.ts`) so the app stays zero-config. One catch-all route (`/api/auth/[...all]`) serves all endpoints; the games/uploads routes read the session via `requireUser`/`optionalUser` (`server/utils/session.ts`); the client uses `better-auth/vue` (`app/utils/auth-client.ts`). Hosting and playing need no account. Saving stamps an `ownerId`; `/api/games?scope=mine` returns the caller's games, default returns publicly-listed ones. **Visibility** (`private`/`unlisted`/`public`) is enforced server-side: a private game reads as 404 to non-owners (existence doesn't leak); unlisted is link-only; public is also listed. (Audit replaced the earlier hand-rolled `nuxt-auth-utils` setup, see commit history.)
- **Draw is the first Pixi block.** Drawings are normalized vector **strokes** sent over the relay (small, replayable), not rasterized, so no uploads are needed to play. `DrawCanvas` is an imperative Pixi 8 `Application` (the sanctioned fallback for a pointer-driven widget) that **lazy-imports `pixi.js`** in `onMounted`, so Pixi stays out of SSR and ships as a ~500KB on-demand client chunk. The host gallery renders many drawings as lightweight **SVG** (`DrawThumb`) to avoid a WebGL context per tile.
- **Image uploads are presigned + direct-to-storage.** `/api/uploads/presign` (session-gated) signs a PUT with `aws4fetch`; the browser uploads straight to S3/Spaces (MinIO locally), and the editor stores the resulting public URL. `ImageField` shows an Upload button only when the app injects an uploader (`IMAGE_UPLOAD` provide/inject) and `/api/uploads/config` reports enabled (storage configured + signed in); otherwise it's URL-paste, so dev with no storage still works. Verified end-to-end against MinIO (presign → PUT → public GET). Caveats for the audit: the signed `content-type` isn't enforced (only `host`+`x-amz-acl` are signed), there's no server-side size cap, the S3 endpoint must be reachable under the *same* hostname by both app and browser, and the bucket needs CORS for browser PUTs.
- **The core loop is verified live.** A `DOOT_LIVE=1` test drives a host + player headlessly through the engine against `wss://relay.clasp.to` and asserts redacted-config delivery, the answer-withholding invariant over the wire, input round-trip, and play-to-results. It is skipped by default so the suite stays offline.
- **And in a real browser.** `scripts/playtest.mjs` (Playwright) drives the actual Vue UI: host + player through a full VoteBox game to results, the Pixi Draw canvas (sketch → host SVG gallery), and auth→editor→save. It caught two UI-only bugs the headless test couldn't, the host published `meta` only at `start()` (so lobby joiners were stuck on "Joining…") and the "Start" button was gated on a config that didn't exist until `start()`. Both fixed: the host now publishes `meta` and holds its config from `loadGame`/connect time (see `room.test.ts` lobby test).
- **The design system** is `doot-mockup.html`, ported to `@doot-games/themes` + `@doot-games/ui`, with an accessibility baseline.
- Commit messages contain **no AI attribution** (project rule).

## Audit findings (all fixed)

Across audit rounds we fixed: a reconnect bug (couldn't restore `joinedAtIndex` against real CLASP, now uses `relay.get`); reactivity bugs (host tallies / player submit state were stale, the composable now routes reads through the reactive snapshot); a player-input null-`value` crash on mid-round joins; a shared-relay `connected` seeding bug; `timer:0` auto-lock; rate scale fixes (tie rounding, min-baseline fill, tier labels on the host, required ratings); and the results page dropping a block's distribution `display`/`note` (rankings rendered as "N votes"), now a shared, tested `distributionToBars` honors block-provided `max`/`display`/`note`. Tests were strengthened to cover reconnect, the rate scale, and results rendering.

**Open design note (Rank):** `emptyInput` seeds the authored order, so a player who submits without reordering casts the authored order as a real ballot, consensus drifts toward the authored order proportional to non-engagement. It's a deliberate trade (a ranking has no natural "empty" state); revisit with a per-player shuffle or a "must reorder" gate if it matters.

## Not built yet (PRD phase one and beyond)

1. **Postgres**: the durable store is libSQL/SQLite today (zero-config). For multi-instance prod, wire `drizzle-orm/node-postgres` behind the same `useDb()`/repo seam and select the driver by `DATABASE_URL`. The docker prod compose still names Postgres, reconcile when this lands.
3. **More blocks**: Buzz (reaction/first-correct), Quip (free-text + a follow-on vote), or a "vote for the best drawing" follow-on to Draw. Each is one block, and each becomes authorable in the editor and savable for free the moment it ships. (**Draw** shipped, see the Pixi decision above.)
4. **Account niceties**: edit/delete a saved game and change-visibility-after-save are built (owner-only, on `/g/<id>`). Still open: editing a saved game's *rounds* (re-open in the editor), OAuth / magic-link sign-in.
5. **External plugins**: sandboxed iframe + postMessage bridge + publishing (PRD §9).
6. **A two-phone playtest on real devices** (not just a headless browser) hasn't been run, `scripts/playtest.mjs` drives two Chromium contexts through the full UI, but touch/QR-join on actual phones is unverified.

## Known gaps / things to check first

- `apps/web` typecheck via `nuxi typecheck` is heavier than the library `tsc` checks (it applies `noUncheckedIndexedAccess` to imported package source). It is **green now**, a latent guarded-index hole in `poll/block.ts` it surfaced was fixed, so keep `pnpm -r typecheck` clean. The production build remains the fast signal that everything integrates.
- **DB driver**: only the libSQL/SQLite path is implemented; a `postgres://` `DATABASE_URL` silently falls back to the local file (with a console warning). Don't assume Postgres works in prod yet.
- **Set `SESSION_PASSWORD`** (32+ chars) in production, it's better-auth's `secret`; the dev fallback in `server/utils/auth.ts` must not ship. Also set `PUBLIC_BASE_URL` so better-auth's Origin/CSRF check trusts your domain.
- Auth rate-limiting is on (better-auth, 20 req/60s/IP), tune for your instance.
- **Uploads**: the signed `content-type` isn't enforced and there's no server-side size cap (a client 5 MB check only); objects are stored `public-read`. Fine for a party app; tighten with a presigned-POST policy before a high-trust deployment.
- A pre-auth saved game (legacy/anonymous, `owner_id` null) can still be fetched by anyone if its visibility is `private`, since "no owner" matches "no requester". New games always have an owner, so this only affects rows created before auth.
- Per-package READMEs are not written yet (PRD §22 asks for them).
- PRD §8 still describes the pre-block plugin contract; the block model is in `docs/authoring-a-game.md` and `packages/sdk/src/block.ts`. Reconcile when convenient.

## Suggested next step

**Doot is live at https://doot.games** with git-push CI/CD, working uploads, seven games, markdown import, account management, and a responsive UI. Highest-leverage next: a **two-phone test on real devices** (the last unverified surface, touch + QR join); **re-open a saved game in the editor** to edit its rounds (today you re-author); **OAuth / magic-link** via better-auth config; **Postgres** for multi-instance scale; and **upload hardening** (presigned-POST with a size policy). Per-package READMEs (PRD §22) are still unwritten.

---

## Fresh-session kickoff prompt

Paste this into a new session to onboard the next agent:

> You're picking up **Doot**, a self-hostable platform for live party games (one host on a big screen, players join from phones over the CLASP real-time relay). Repo: this directory; git remote `virgilvox/doot-games`; trunk branch **`main`** (the MVP scaffold was merged in).
>
> **Read first, in order:** `HANDOFF.md` (current state + what's next), `CLAUDE.md` (conventions + invariants, read fully), `docs/authoring-a-game.md` (the block model), `Doot-PRD.md` (full spec). Design sources: `doot-mockup.html` (the shell/theme look + copy, source of truth) and `votebox (1).html` (the original gameplay prototype).
>
> **Hard rules:**
> - Commit messages are plain with **no AI attribution** (no "Generated with", no `Co-Authored-By` trailers). `main` is the trunk now, work on `main` or a branch off it.
> - **Games are blocks + compositions.** A *block* is a standalone round kind (guess/rate/poll/rank) declaring a content schema + Player view + Host view + `aggregate` + optional answer-withholding; a *game* is a manifest + an ordered `{ block, content }` list rendered by the generic `GameHost`/`GamePlayer`/`GameResults`. New game = compose blocks; new round kind = one block; full-custom = override `components`. Never reintroduce per-game components or make one game import another.
> - Architecture invariants (see `CLAUDE.md`): ephemeral state lives on the relay, durable on Postgres, nothing about a live room is written to the DB during play; the engine never imports a game; answer keys are withheld until reveal; identity is reconnect-by-name.
> - **CSS-first animation**; use `vue3-pixi` (installed) only for canvas-heavy work (the Draw block, mini-games).
> - Verify every change: `pnpm test`, `pnpm -r typecheck`, `pnpm --filter @doot-games/web build`. Today: 82 tests pass (+1 opt-in live test), all typecheck, the app builds.
>
> **Stack & run:** pnpm monorepo; Nuxt 4 + Vue 3; packages `@doot-games/{engine,sdk,ui,themes,games}` + `apps/web`. **Live at https://doot.games** (git push to `main` deploys, see the Deployment section). `pnpm install && pnpm dev` → http://localhost:3000 (public relay, zero-config SQLite). Author at `/editor/<type>` (e.g. `custom` for any mix, with Import from Markdown), **Save** → `/g/<id>`, host at `/host/<type>` or `/host/g/<id>` (votebox, guess, rate, poll, rank, draw, custom), play at `/play/<CODE>`.
>
> **Your task:** see `HANDOFF.md` → "Not built yet" / "Suggested next step" and pick one, likely a **real-device two-phone playtest**, **re-open a saved game in the editor** to edit its rounds, **OAuth/magic-link** (better-auth config), or **Postgres**. Auth is `better-auth` (`server/utils/auth.ts`); markdown import is `packages/games/src/markdown.ts` + `docs/markdown-games.md`; the browser playtest is `scripts/playtest.mjs`. Every push to `main` deploys, so keep `main` green. Confirm scope with me before large changes, work in small verified increments, and update `HANDOFF.md` as you go.
