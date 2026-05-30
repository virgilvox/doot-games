# Handoff

Snapshot of where Doot stands, for the next session or contributor. Pair with [`Doot-PRD.md`](./Doot-PRD.md) (the spec), [`CLAUDE.md`](./CLAUDE.md) (conventions), and [`docs/`](./docs).

_Last updated: 2026-05-30. Branch: `main` (the scaffold was merged to `main`; work on `main` or a branch off it)._

## What exists and is verified

A pnpm monorepo built from the PRD, **deployed live at https://doot.games**. **82 tests pass (+1 opt-in live test), every package typechecks (including the stricter `nuxi typecheck`), and the Nuxt app builds (SSR).** The core play loop is **verified end-to-end against the real CLASP relay** (headless) **and in a real browser** (Playwright: host + player through a full game, the Pixi Draw canvas, and auth→editor→save). Authored games **persist** and are shareable, and a markdown importer builds whole games from an LLM-written spec. Multiple audit rounds ran (incl. an independent security + correctness pass); findings are fixed. The UI is mobile-responsive (verified no overflow at 360/390px) and free of em dashes.

**The full user loop works today:** open `/`, pick a type → edit rounds in the schema-driven editor → **Host now** (ephemeral) or **Save** for a shareable `/g/<id>` link → host on a big screen → players join from phones over the relay → play → animated results. Hosting and playing never need an account; **saving** uses an optional account (email/password, argon2id) and each saved game has a **visibility**: private (owner only), unlisted (anyone with the link), or public (also listed on `/explore`). Zero DB setup, accounts and games live in a local SQLite file.

| Package | State |
| --- | --- |
| `@doot-games/engine` | Done + tested. Room runtime, phase/round state machine, reconnect-by-name identity (via `relay.get`), late-joiner eligibility, CLASP wrapper, answer withholding, reactive `useDootRoom`. |
| `@doot-games/sdk` | Done. The **block** contract (`RoundBlock` + `defineBlock`) and the **composition** contract (`GamePlugin` + `defineGame`), Zod manifest, round primitives, results types. |
| `@doot-games/themes` | Done + tested. Five token packs (doot/cutesie/cyber/professional/playful), CSS generation, base stylesheet. |
| `@doot-games/ui` | Done. Theme-aware components + the ported design-system stylesheet + the **schema-driven editor form** (`SchemaForm`) + the **Pixi drawing surface** (`DrawCanvas`) and SVG gallery thumbnail (`DrawThumb`). |
| `@doot-games/games` | Done + tested. Blocks (guess/rate/poll/rank/**draw**), the generic renderer, seven games (Guess, Rate, Poll, Rank, Draw, VoteBox, **Custom** = all blocks), and a **markdown game parser** (`parseMarkdownGame`). |
| `apps/web` | Builds + **deployed**. Home/explore/create + host/play + the **editor** (`/editor/<type>` new, `/editor/g/<id>` to **edit-in-place or fork**, with **Import from Markdown** and a Details panel for cover image / description / tags / forkable) + **persistence** (`/api/games` create/get/list/**put**/patch/delete, owner-scoped, visibility + answer-redaction enforced) + **auth** (`better-auth` + argon2id) + presigned image **uploads** (live, to the `doot` Space; the Upload button shows on every image field). Mobile-responsive. |

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
- **To SSH**: `ssh root@<droplet-ip>` with the private half of the deploy
  keypair (the same key whose public half is the droplet's `authorized_keys` and
  whose private half is the `DEPLOY_SSH_KEY` repo secret). Find the IP with
  `doctl compute droplet list`.

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

**Round 2 (deep audit, 2026-05-30, all fixed).** Five parallel agents swept engine/relay, security, persistence, frontend/UX, and build/deploy/docs. Fixed:
- **Game editing + forking + metadata** (the headline feature work): owners edit a saved game in place at `/editor/g/<id>` (`PUT /api/games/:id`); a **server-side clone** (`POST /api/games/:id/clone`) copies a game into a new one you own, from the *stored* config so answers survive (fixes a real gap where forking a Guess game would have saved `correct:-1`). You can clone your **own** game (Duplicate) or any game the owner marked **forkable**. A copy starts private + non-forkable. Each game carries a cover image (upload), description, tags, and the forkable flag, set in the editor's Details panel; the **Upload button now shows on every image field** (a dead duplicate `ImageField` was the cause).
- **Auth/redaction hardening**: `getGame` no longer leaks a null-owner private row to an anonymous viewer (null owner never matches null requester); the session secret now fails closed unless `NODE_ENV=development` (an unset env in a prod image used to fall back to the committed dev secret); `baseURL`/`trustedOrigins` pin better-auth's CSRF.
- **PUT no longer resets metadata**: a rounds-only update leaves omitted fields untouched (an explicit empty value clears them), so saving rounds can't silently flip a public game back to private.
- **Config size cap** (512 KB serialized) on create/update/clone, blunting a stored-payload DoS via the open per-round `content` record.
- **Dead-room UX**: a phone that joins a stale/typo'd code now shows "Can't find room" with a way back after an 8s grace window, instead of spinning on "Joining…" forever.
- **Unsaved-work safety**: the editor warns on unload with unsaved changes, and the editor→host draft is mirrored to `sessionStorage` so reloading the host tab keeps the authored game (it used to silently fall back to the default deck).
- **Broken-image fallback** on the host stage and game page (hide rather than show a broken glyph); **optimistic manage toggles roll back** on a failed PATCH.
- **Docs reconciled**: PRD now says better-auth (not nuxt-auth-utils); CLAUDE.md status/dep-direction corrected; architecture.md "not yet built" parenthetical removed; em dashes purged from `docs/markdown-games.md`; test counts say "82 pass + 1 opt-in".

**Round 3 (the deferred items, 2026-05-30, done + deployed).**
- **Players now see the prompt image on their phone** (not only the host screen), with a broken-image fallback; the editor's "as players see it" preview shows it too.
- **Per-game theme actually applies in the editor.** The editor's theme dropdown set the saved/hosted `themeId` but never restyled the editor; now it live-applies (verified: editor/host/player all adopt the chosen theme). HostRoom also falls back to the persisted draft's theme so a host-tab reload keeps it.
- **Uploads serve via the Spaces CDN edge** (`SPACES_PUBLIC_URL=https://doot.sfo3.cdn.digitaloceanspaces.com` on the droplet) instead of the raw origin.
- **Host-gone detection.** The host broadcasts a liveness heartbeat (`/host/ping`); players show "the host's screen went away" and stop submitting un-tallyable inputs once it lapses (`room.hostPresent`). A dead/typo'd room still resolves via the join timeout.
- **Late-joiner race fixed.** `joinedAtIndex` is computed from an authoritative `relay.get` of phase/index/state (via `allSettled`), not a possibly half-arrived local snapshot.
- **Identity hash widened** to ~64 bits (two FNV-1a passes) so different names in one room can't collide onto one identity.
- **Per-IP rate limiting** on mutating `/api/games` + `/api/uploads` (in-memory fixed window; auth routes already had better-auth's limiter).
- **`/api/health` + Docker `HEALTHCHECK`**; Caddy waits for app health before starting.
- **CI/CD hardened.** Every GitHub Action pinned to a commit SHA; deploy SSHes as a non-root `deploy` user (docker group); the container runs the server as the unprivileged `node` user via a `su-exec` entrypoint (verified on prod: server runs as uid 1000, data dir node-owned, healthy). Deploy docs reconciled to the real SQLite+GHCR path.

Still deferred (low value): the dead per-round answer publish (a write-only relay channel, harmless); a presigned-POST upload size policy (only a client-side 5 MB check today); rate-limiting moving to a shared store if the app ever runs multi-instance; pinning the Docker base image to a digest.

**Open design note (Rank):** `emptyInput` seeds the authored order, so a player who submits without reordering casts the authored order as a real ballot, consensus drifts toward the authored order proportional to non-engagement. It's a deliberate trade (a ranking has no natural "empty" state); revisit with a per-player shuffle or a "must reorder" gate if it matters.

## Not built yet (PRD phase one and beyond)

1. **Postgres**: the durable store is libSQL/SQLite today (zero-config). For multi-instance prod, wire `drizzle-orm/node-postgres` behind the same `useDb()`/repo seam and select the driver by `DATABASE_URL`. The docker prod compose still names Postgres, reconcile when this lands.
3. **More blocks**: Buzz (reaction/first-correct), Quip (free-text + a follow-on vote), or a "vote for the best drawing" follow-on to Draw. Each is one block, and each becomes authorable in the editor and savable for free the moment it ships. (**Draw** shipped, see the Pixi decision above.)
4. **Account niceties**: edit/delete a saved game, change visibility, edit its *rounds* (re-open at `/editor/g/<id>`), set forkable, and clone/fork are all built (owner-only where it should be). Still open: OAuth / magic-link sign-in.
5. **External plugins**: sandboxed iframe + postMessage bridge + publishing (PRD §9).
6. **A two-phone playtest on real devices** (not just a headless browser) hasn't been run, `scripts/playtest.mjs` drives two Chromium contexts through the full UI, but touch/QR-join on actual phones is unverified.

## Known gaps / things to check first

- `apps/web` typecheck via `nuxi typecheck` is heavier than the library `tsc` checks (it applies `noUncheckedIndexedAccess` to imported package source). It is **green now**, a latent guarded-index hole in `poll/block.ts` it surfaced was fixed, so keep `pnpm -r typecheck` clean. The production build remains the fast signal that everything integrates.
- **DB driver**: only the libSQL/SQLite path is implemented; a `postgres://` `DATABASE_URL` silently falls back to the local file (with a console warning). Don't assume Postgres works in prod yet.
- **Set `SESSION_PASSWORD`** (32+ chars) in production, it's better-auth's `secret`. The code now fails closed unless `NODE_ENV=development`, so a prod image without it won't boot (intended). Also set `PUBLIC_BASE_URL` so better-auth's Origin/CSRF check trusts your domain.
- Rate-limiting: better-auth limits `/api/auth/*` (20 req/60s/IP); a separate in-memory limiter (`server/middleware/rate-limit.ts`, 40 writes/60s/IP) covers mutating `/api/games` + `/api/uploads`. It's per-instance, move to a shared store if you run more than one app container.
- **Uploads**: the signed `content-type` isn't enforced and there's no server-side object-size cap (a client 5 MB check only); objects are stored `public-read`. The saved-game *config* now has a 512 KB server cap. Fine for a party app; tighten uploads with a presigned-POST policy before a high-trust deployment.
- Per-package READMEs exist (`packages/*/README.md` + `apps/web/README.md`).
- PRD §8 still describes the pre-block plugin contract; the block model is in `docs/authoring-a-game.md` and `packages/sdk/src/block.ts`. Reconcile when convenient.

## Suggested next step

**Doot is live at https://doot.games** with git-push CI/CD (SHA-pinned, non-root deploy user + non-root container), working CDN-served uploads, seven games, markdown import, full game editing/cloning/forking with cover/description/tags, per-game themes, host-gone detection, rate-limiting, account management, and a responsive UI. The platform is solid; **the next push is content and depth** (below). Smaller polish items still open: a **two-phone test on real devices** (touch + QR join), **OAuth / magic-link** (better-auth config), **Postgres** for multi-instance scale, and **upload hardening** (presigned-POST size policy).

## Next phase: flagship games & replayable content

The big direction now is a slate of polished, replayable, Jackbox-grade games under a "**Games From Doot**" banner, plus the engine/SDK extensions they need. The full brief is the kickoff prompt below; the engineering shape:

**Target games** (research the real designs before building): a **robot rap battle** (Mad Verse City-style: fill words → robots "perform" → head-to-head audience vote), a **presentation/improv** game (Speech!/Talking Points-style: the room feeds a presenter slides they've never seen), **anonymous mad libs** (fill a story's blanks → vote the funniest), and **Split the Room** (fill a dividing "would you…" scenario → yes/no → score on how close to a 50/50 split). All with **music + sound** and deep replayability.

**What the engine/SDK needs first (the foundational, hard part).** Every current block (guess/rate/poll/rank/draw) is single-input. These games need new patterns:
- a **free-text submission** block ("Quip");
- the **submit→vote two-phase** pattern (Jackbox core): collect player text in phase 1, then show the *anonymized, shuffled* submissions as the options to vote on in phase 2. Today round content is static and published up front; this needs the host to **derive a round's content from the previous round's inputs at runtime** and publish it only at vote time, **without breaking answer-withholding** (no early peeking at submissions) or the relay-only rule (nothing to the DB). Design as a multi-phase block or a composition where round N+1's content is injected from round N's inputs;
- **head-to-head matchups / a small bracket** (pair submissions, vote per pair, tally wins) for the rap battle;
- a **multi-blank fill** block (mad libs) and a **dividing-scenario + split-scoring** block (Split the Room);
- an **audio layer**: the host plays background music + SFX (round start / lock / reveal / winner). `RoomMeta.musicUrl` already exists but isn't wired. Honor mute + `prefers-reduced-motion`;
- **content pools for replayability**: a game carries a large pool of prompts/templates and draws a fresh random subset each play (shuffle, optionally seed by room code) so no two sessions match. Extend the markdown importer / a content-pack format to author big pools.

**"Games From Doot" category**: surface these first-party, deeply-stocked flagship games as a distinct category on `/explore` (and the catalog), as the showcase.

---

## Fresh-session kickoff prompt

Paste this into a new session to onboard the next agent on the flagship-games phase:

> You're picking up **Doot**, a live party-game platform (host on a big screen, players join from phones over the CLASP relay). Live at https://doot.games; repo `virgilvox/doot-games`; trunk `main` (every push to `main` deploys via CI). It's built and solid; this phase is about **content and depth**.
>
> **Read first, in order:** `HANDOFF.md` (state + the "Next phase: flagship games" section), `CLAUDE.md` (invariants, read fully), `docs/authoring-a-game.md` (the block model), `Doot-PRD.md`. Design source of truth: `doot-mockup.html`.
>
> **Hard rules:** no AI attribution in commits (no "Generated with" / `Co-Authored-By`); games are **blocks + compositions** (a block = a round kind with content schema + Player/Host views + `aggregate` + answer-withholding; a game = manifest + ordered `{block, content}`; never make one game import another); ephemeral state lives on the relay only (nothing about a live room touches the DB); answers/submissions withheld until reveal; identity is reconnect-by-name; **CSS-first animation** (Pixi only for canvas-heavy bits). Verify every change with `pnpm test && pnpm -r typecheck && pnpm --filter @doot-games/web build` (currently 84 tests green). Keep `main` deployable; ship small verified increments.
>
> **Mission: build a slate of flagship, replayable "Games From Doot."** Work in this order:
>
> 1. **Polish pass.** Sweep the existing loop (lobby → host → play → results), the editor, mobile, and the seven existing games for rough edges. Fix the cheap, high-impact ones; note the rest.
>
> 2. **Research the web, seriously.** Study how the best party games actually work and why they're fun and replayable — Jackbox especially (Quiplash, Fibbage, **Mad Verse City** = robot rap battle, **Speech!/Talking Points** = presentation, **Split the Room**, Survive the Internet, Drawful, Patently Stupid), plus Kahoot/Skribbl/etc. For each capture: round structure, the submit/vote/score loop, timing, ideal player counts, the source of replayability, and what makes it land in a room. Write `docs/flagship-games.md` (a design doc) and propose the **full template slate** (more than the four named below).
>
> 3. **Extend the engine/SDK for the new interaction patterns** (foundational and hard — design carefully and get my sign-off on the contract before building): a **free-text submission** block; the **submit→vote two-phase** pattern (collect player text, then vote on *anonymized, shuffled* submissions — round content derived from the prior round's inputs at runtime and revealed only at vote time, **without breaking answer-withholding or the relay-only rule**); **head-to-head matchups / a small bracket**; a **multi-blank fill** block and a **dividing-scenario + split-scoring** block; an **audio layer** (host plays music + SFX; `RoomMeta.musicUrl` exists, wire it; honor mute + reduced-motion); and **content pools** (draw a fresh random subset of prompts each play; extend the markdown importer / a content-pack format for big pools).
>
> 4. **Build the flagship games end-to-end** on top of those: **Robot Rap Battle** (fill → robots perform over a beat → head-to-head vote), **anonymous Mad Libs** (fill blanks → vote the funniest), **Split the Room** (dividing prompt → yes/no → split-based scoring), and a **presentation/improv** game (the room feeds a presenter slides they've never seen). Each: deep content pool, music/SFX, accessible (semantic HTML, reduced-motion, an untimed option), genuinely fun and replayable. Some standalone (full-custom `components`), some composable/editable in the editor.
>
> 5. **"Games From Doot" category.** Surface these flagship, well-stocked games as a distinct category on `/explore` and the catalog — the showcase.
>
> 6. **Verify + ship incrementally.** test/typecheck/build on every change; each push deploys, so keep `main` green; playtest with `scripts/playtest.mjs` and ideally a two-phone real-device pass. Update `HANDOFF.md` + the design doc as you go.
>
> **Where things live:** blocks in `packages/games/src/blocks/`, generic renderer in `packages/games/src/runtime/`, engine + state machine in `packages/engine/`, markdown import in `packages/games/src/markdown.ts` (+ `docs/markdown-games.md`), shell/editor/catalog in `apps/web` (`packages/games/src/catalog.ts` is the server-safe game list). Auth is better-auth (`server/utils/auth.ts`).
>
> **Start with the polish pass + the research, then bring me the proposed game slate and the block-contract design before building the engine extensions.**
