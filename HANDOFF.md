# Handoff

Snapshot of where Doot stands, for the next session or contributor. Pair with [`Doot-PRD.md`](./Doot-PRD.md) (the spec), [`CLAUDE.md`](./CLAUDE.md) (conventions), and [`docs/`](./docs).

_Last updated: 2026-06-01. Branch: `main` (work on `main` or a branch off it; every push to `main` deploys via CI)._

> **Quick-wins batch — SHIPPED + DEPLOYED (2026-06-01).** Four increments, each
> verified (200 tests, full typecheck incl. `nuxi`, web build) and pushed to `main`:
> - **Circuit Cypher visual polish** — verse-box overflow fix (one row per line,
>   flex-wrapped), a new `Icon` component in `@doot-games/ui` replacing every emoji
>   (**standing rule: use `Icon`, never emoji**), slower mockup-matched pacing (`PACE`
>   table), the robot-freeze-when-muted fix (motion now runs off a local clock, not
>   `audio.beatPhase()` which is `0` when muted), camera pulled back, and an opening
>   "CIRCUIT CYPHER" title sequence. (Headless Playwright throttles background-tab
>   `setTimeout`, so verify timing-sensitive UI on a real foreground browser.)
> - **C10 author display name** — community games + `/g/<id>` credit the author by
>   display name (better-auth `user.name`, never the email). New `server/utils/users.ts`
>   batch-resolves owner ids to names; shown on `/g/<id>`, Explore, and the Home rails.
> - **Fib Finder** (Fibbage flagship) — new `fibvote` block: a `quip` make round of lies
>   plus an injected, withheld `truth`, dual-axis scoring (find the truth + fool the
>   room). 20-fact brand-free pool. The truth is an answer key (stripped via
>   `redactContent` + `REDACTION_RULES`).
> - **Sketch & Spot** (Drawful flagship) — new `drawvote` block: vote on a gallery of the
>   room's drawings (Draw block in the two-phase loop), derived from the prior draw
>   round's strokes. 16-prompt pool. `scripts/sketch-smoke.mjs` drives the Pixi canvas +
>   gallery vote end to end.
>
> Doot now ships **14 games incl. 7 flagships**. Both new flagships were verified end to
> end in a real browser (`scripts/playtest.mjs` gained a `fib-finder` scenario + an
> `ONLY=` filter; `scripts/sketch-smoke.mjs` is new) with host + phone screenshots.
> Next per `docs/BACKLOG.md`: robustness (E16), then D14 the gameshow.

> **D13b Circuit Cypher tournament + full animated 3D battle — SHIPPED + DEPLOYED (2026-05-31).**
> Circuit Cypher is now a **custom-flow** game: `circuit-cypher.ts` ships
> `components: { Host: CircuitCypherHost, Player: CircuitCypherPlayer }` + a single
> `bars` write round. Everyone writes one verse; on the mic closing the host builds a
> bracket (`buildBracket`) and runs **1v1 matchups** as custom relay state
> (`publishExtra`/`onExtra` `/x/battle`), tallying votes (`tallyBattle`), paying cash
> (`battleAward` = `headToHeadPoints` + capped `cheerBonus`), and crowning the MC
> (`tournamentLeaderboard`). The performance is the **animated rap-battle mockup**
> reimplemented in Vue: a reusable **`RapBattleStage`** (`@doot-games/ui`, lazy
> **Three.js** [pinned `three` 0.184], client-only, SSR-guarded, kept out of the SSR
> bundle) renders a neon **3D arena** (robots, crowd, EQ wall, light rig/beams, camera
> presets) reacting to a new **procedural Web Audio engine** (`createArenaAudio`: beat
> + analyser + SFX + ducking; replaced the earlier Tone.js beat). The host overlays the
> mockup's **choreography** (round banner -> "on the mic" intro -> 3-2-1 countdown ->
> **karaoke** with TTS word-sync + jaw -> "verse complete" -> vote -> crown + confetti)
> with a distinct **MC/announcer TTS voice** (`announce`) narrating each beat, plus Skip
> + mute and `prefers-reduced-motion`. Phones cheer + vote over the relay; reconnect-safe.
> **Each performer gets a DIFFERENT verse scaffold** (the write round carries the
> room-shuffled pool as bars `variants`; the host assigns a unique scaffold per pid and
> publishes it on `/x/assign`), so every rap is completely different. **(d) Live-perform
> mode** (lobby toggle: robots TTS vs players-perform-live with a per-performer countdown
> over the beat) and **co-host/MC delegation** (the lobby picker hands driving to a phone;
> a unified `/x/drive/*/*` channel lets the MC drive write + battle from their phone,
> validated by driverPid + nonce) both ship.
>
> **Two critical bugs were found + fixed during verification** (would have made the game
> unplayable): (1) **the engine dropped any `onExtra` subscription made before the relay
> socket connected** — a custom-flow host subscribes from `onMounted` (pre-connect), so
> the host received NO votes/cheers/drive at all; `RoomRuntime.onExtra` now defers the
> real subscribe to `onConnect` (regression test added). (2) the host stored bare vote
> choice **strings** while `tallyBattle` reads `{choice}` **objects**, so every vote
> tallied 0; now stores objects. After both fixes a real winner is crowned.
> **Verified:** 182 tests, full typecheck (incl. `nuxi`), web build, three.js absent from
> SSR, and a 2-scenario real-browser smoke (`scripts/cypher-smoke.mjs`: host-driven robots
> battle crowning a real winner from real votes + live-perform with a phone-driven MC,
> zero console/page errors). **Deployed to `main` (CI).** STILL RECOMMENDED before heavy
> use: a real **two-phone playtest** on devices (touch + on-device WebGL/audio/TTS).
> Remaining polish: themed arena colors (currently the deliberate neon battle palette),
> MC battle-step labels. Full detail: `docs/flagship-games.md` §8 "Build status".

> **D13 Circuit Cypher tournament — started (2026-05-31).** Shipped + tested foundations (no user-facing change yet, all additive): **`buildBracket`** (round-robin pairing so everyone battles, capped for big rooms), **`tallyBattle`** + **`headToHeadPoints`** (1v1 matchup tally + Mad Verse City payout), a **`RobotBattle`** two-robot face-off view, and the **battle transport** the custom flow needs (`room.publishExtra`/`onExtra`, a `/<room>/x/<key>` custom relay channel with wildcards, also the cheer channel). **Remaining = D13b**, the custom tournament components (`CircuitCypherHost`/`Player`): wire the bracket + host-driven matchup sequencing (perform A -> perform B -> vote -> result) over the battle channel, then layer cheers/live-perform/Tone.js beat. Full plan in `docs/flagship-games.md` section 8 ("Build status").

> **Author/host batch B6, B8, B9 shipped + deployed (2026-05-31).** (B6) guess/buzzer options gain an optional **subtitle** (e.g. a character's series), shown on the host board, the phone, and the reveal. (B8) the host can set an optional **player cap** from the lobby; the join screen counts the roster and turns a new player away with "This room is full" (a reconnecting name still gets in). (B9) the host can **delegate driving to a player (co-host/MC)**: pick from the roster or an off-by-default "first to join", and the delegate drives the round cycle from their phone while still playing; the host stays the sole authority (the delegate sends intents, the host validates + applies them) and can take back control. **B7 was reverted**: scoring is correct-only, a wrong answer never scores (the earlier "points for answering" mode was a misread and is gone). Plus two fixes found en route: the pre-join name probe no longer hangs ~2.5s on a fresh name, and **"Host now" after editing a game** works again (a structuredClone-on-reactive-proxy throw). **161 tests** pass; full typecheck + web build; 6/6 real-browser playtest incl. the co-host flow. Remaining: **D13** (Circuit Cypher tournament), then C / D14 / E.

> **Consumer-bug batch A1-A5 shipped + deployed (2026-05-31).** (1) **Guess** rounds now render a gameshow answer board (lettered illuminated panels, locked-in count, a dramatic correct-panel reveal) and the question image fits whole (no crop). (2) The live vote/answer **distribution is hidden until reveal** by default (author `hideUntilReveal` flag + a host "Peek" toggle; rows keep authored order while hidden; phones never got the tally). (3) **Join latency** fixed: a player shows in the host roster the instant they join (presence seeded from the profile; lobby joiners skip the pre-join reads). (4) **Uploads** are honestly gated: a logged-out author sees "Sign in to upload images, or paste a URL" instead of a button that 401s (hosting stays account-free, verified logged-out). (5) **Identity**: a pre-join probe warns on a live same-name collision ("Pick a different name" / "That's me, reconnect") instead of silently colliding two players onto one identity; genuine reconnect is unchanged. **149 tests** (+10), full typecheck + web build green, real-browser playtest (all games) + visual checks at 390px. Remaining backlog below: **B** (author features), **D13** (Circuit Cypher tournament), and the rest.

> **Latest session (2026-05-31) shipped + live:** two new flagships - **Circuit Cypher** (robot rap battle: a guided `bars` couplet block → a `vote` round where an animated **`RobotRapper`** performs each verse via `speechSynthesis`) and **"What, You Didn't Know That?"** (trivia gameshow on a new **`buzzer`** block: escalating point values, client-timed answers, a first-correct "buzz-in" that **dings** the winner's phone, a gameshow stage HostDisplay). Plus consumer-UX work: a **host "N / M locked in"** pill in the ControlBar; **mobile responsiveness** fixed (topbar wraps; 0px overflow at 390px everywhere); home **"Create by vibe"** trimmed to the core primitives (+ "See all → /create"); explore flagship cards now show the **description** (not the title twice); a **copy cleanup** (no em dashes, no brand names, "Create" heading, short line-clamped card descriptions); and a **stale-bundle recovery** (a phone whose loaded bundle predates a new block now shows "Tap to catch up / Reload" instead of a silent stall). **~141 tests pass.** A large consumer-feedback backlog was captured - see the kickoff prompt at the bottom; nothing is dropped.

## What exists and is verified

A pnpm monorepo built from the PRD, **deployed live at https://doot.games**. **~141 tests pass (+2 opt-in live tests), every package typechecks (including the stricter `nuxi typecheck`), and the Nuxt app builds (SSR).** The core play loop and the **two-phase (make→judge) loop** are **verified end-to-end against the real CLASP relay** (headless) **and in a real browser** (Playwright: host + players through full games incl. all three flagships, the Pixi Draw canvas, and auth→editor→save). Authored games **persist** and are shareable; a markdown importer builds whole games from an LLM spec. Many audit rounds ran (security/correctness, a flagship-code audit, a docs audit); findings are fixed. The UI is mobile-responsive (no overflow at 360/390px) and free of em dashes.

**Shipped to date:** the **runtime-derived-content** engine primitive; **twelve games** including **five flagship "Games From Doot"** (Quip Clash, Mad Libs, Split the Room, Circuit Cypher, "What, You Didn't Know That?") built on the two-phase / buzzer patterns with content pools; blocks guess/rate/poll/rank/draw/quip/vote/fill/split/**bars**/**buzzer**; UI extras `RobotRapper` (animated CSS robot) + a client-only audio layer (`speakLines` TTS, `playDing` SFX) + the ControlBar lock-in count; the **catalog IA** (Explore = public + Games From Doot, Create = templates with per-type icons, **Your Games** `/mine` with a visibility filter, Home with a Games-From-Doot rail / Browse-by-vibe / Trending+Fresh gated to ≥5); `GameCover`/`GameTypeIcon`/`SiteFooter` + a `gameVisual` map; the `flagship` manifest flag + surfaced `manifest.version`; **end-of-game navigation** (Play again / Pick another / Home); a `/support` page + top-right Support button + footer Ko-fi/Patreon/hack.build + a Sign-up CTA; the editor's gradient theme swatches; the **make→judge host flow fix** (Collect→Lock→Start the vote) and a **host-pickable round count** for pooled games; and a docs overhaul + `examples/` (all authoring paths) + a **deep external-plugin design** (`docs/external-plugins.md`) with a standalone dev harness (`examples/external-plugin/`).

**The full user loop works today:** open `/`, pick a type → edit rounds in the schema-driven editor → **Host now** (ephemeral) or **Save** for a shareable `/g/<id>` link → host on a big screen → players join from phones over the relay → play → animated results. Hosting and playing never need an account; **saving** uses an optional account (email/password, argon2id) and each saved game has a **visibility**: private (owner only), unlisted (anyone with the link), or public (also listed on `/explore`). Zero DB setup, accounts and games live in a local SQLite file.

| Package | State |
| --- | --- |
| `@doot-games/engine` | Done + tested. Room runtime, phase/round state machine, reconnect-by-name identity (via `relay.get`), late-joiner eligibility, CLASP wrapper, answer withholding, reactive `useDootRoom`, and **runtime-derived round content** (`roundContent`/`roundReveal` + `deriveContent`/`revealSummary` host callbacks) for two-phase games. |
| `@doot-games/sdk` | Done. The **block** contract (`RoundBlock` + `defineBlock`, incl. `derive`/`revealSummary`/`PlayerReveal`) and the **composition** contract (`GamePlugin` + `defineGame`, incl. `buildConfig` content pools, `RoundInstance.from`), Zod manifest, round primitives, results types. |
| `@doot-games/themes` | Done + tested. Five token packs (doot/cutesie/cyber/professional/playful), CSS generation, base stylesheet. |
| `@doot-games/ui` | Done. Theme-aware components + the ported design-system stylesheet + the **schema-driven editor form** (`SchemaForm`) + the **Pixi drawing surface** (`DrawCanvas`) and SVG gallery thumbnail (`DrawThumb`) + **`GameCover`** (gradient covers with per-type motifs) and **`SiteFooter`**. |
| `@doot-games/games` | Done + tested. Blocks (guess/rate/poll/rank/**draw**/**quip**/**vote**/**fill**/**split**), the generic renderer, the **two-phase derive wiring** (`toVoteText`/`DeriveSource.render`) + a pure tested **`scoring.ts`** (vote-share, multiplier, sweep/pity, closeness, speed-decay), **ten games** (Guess, Rate, Poll, Rank, Draw, VoteBox, **Quip Clash** + **Mad Libs** + **Split the Room** flagships, **Custom**), and a **markdown game parser** (`parseMarkdownGame`). |
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
pnpm test         # ~141 tests (+2 live tests, skipped unless DOOT_LIVE=1)
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

**Doot is live at https://doot.games** with git-push CI/CD (SHA-pinned, non-root deploy user + non-root container), working CDN-served uploads, ten games (incl. the **Quip Clash** + **Mad Libs** + **Split the Room** flagships), markdown import, full game editing/cloning/forking with cover/description/tags, per-game themes, host-gone detection, rate-limiting, account management, and a responsive UI (explore + footer rebuilt from the mockup). The platform is solid; **the next push is more flagship content and depth** (below). Smaller polish items still open: a **two-phone test on real devices** (touch + QR join), **OAuth / magic-link** (better-auth config), **Postgres** for multi-instance scale, and **upload hardening** (presigned-POST size policy).

## Next phase: flagship games & replayable content

**Progress (merged to `main` and deployed).** The design doc + contract is
[`docs/flagship-games.md`](./docs/flagship-games.md) (research synthesis, the
proposed slate, the signed-off contract). **Shipped + verified (108 tests, full
typecheck + web build, real-relay two-phase live test, 3-player real-browser playtest):**
- The **runtime-derived-content engine primitive** (the one hard piece): new relay
  addresses `roundContent`/`roundReveal`, two optional host callbacks on
  `LoadedGame` (`deriveContent`/`revealSummary`), derive-on-enter + reveal publish,
  runtime answer keys. No new phase states; the two-phase loop is a composition of
  ordinary rounds. Submissions stay off the relay until the anonymized vote opens;
  the author map is withheld until reveal (unit-tested over the wire fake).
- **SDK contract**: `derive`/`revealSummary`/`PlayerReveal`/`assignment` on a block,
  `RoundInstance.from`, `GamePlugin.buildConfig`. `PlayerReveal` also closes the
  polish gap (phones now show personal reveal feedback, not just the big screen).
- **`quip` + `vote` blocks** + a pure, tested `scoring.ts` (vote-share, round
  multiplier, sweep/pity, closeness-to-50/50, Kahoot speed-decay) → **Quip Clash**,
  the first flagship: a fill-the-blank prompt → free-text answer → derived
  anonymized vote → score by vote share. Ships with a 24-prompt pool sampled per
  play (`buildConfig` + a seeded shuffle). Registered in the catalog.

**Audit + tests + UI pass (shipped together):**
- An independent adversarial code audit + a Jackbox robustness/a11y research pass ran
  against Quip Clash. **Verified:** withholding, anonymized vote content, author-map
  withheld until reveal, relay-only state, reconnect-to-derived-round, final-round
  doubling - all re-confirmed **over the real CLASP relay** by a new two-phase live test.
- **Fixed:** self-votes can't score (enforced in the pure tally, not just UI); a player
  who submits then leaves still scores and is named (leaderboard = roster ∪ scorers,
  names captured at derive time); degenerate (&lt;2 answers) vote round handled;
  `aria-live` + `overflow-wrap`; `assignment`/`promptFor` marked reserved.
- **Tests:** 108 offline (+2 live, opt-in) pass - added vote self-vote/doubling/empty/
  duplicate/departed-author cases, engine reconnect-to-derived-round, derive-helper +
  seeded-shuffle tests, and a live two-phase relay test. Full typecheck + web build green.
- **UI rebuilt from `doot-mockup.html`:** a theme-aware `GameCover` (gradient + per-type
  motif), a site-wide `SiteFooter`, and a new **explore page** (DISCOVER header, search,
  Type/Theme filter chips, featured hero, cover-card grid). See doc §6 (audit + research
  roadmap: timeout safety net, untimed mode, content filters, audience bloc) and §7 (UI).
- **Catalog IA + Games From Doot** (see [`docs/games-from-doot.md`](./docs/games-from-doot.md)):
  Explore now shows **public games + ready-to-play "Games From Doot"** (no templates);
  templates moved to **Create** (typecards with colored per-type icons via `GameTypeIcon`);
  **Your Games** is its own nav-gated page (`/mine`) with a visibility filter; **Home** has
  a Games-From-Doot rail, Browse-by-vibe, and Trending/Fresh rails gated to ≥5 public games.
  A `flagship` manifest flag (+ catalog `version`/`flagship`, sync-tested) marks first-party
  replayable games; the editor color-codes rounds by block type and groups its settings.
  `manifest.version` is now surfaced. Official-games-via-admin + DB-backed versioning are a
  documented future path (`docs/games-from-doot.md`), deliberately not built yet.

**Next (build order in the doc §4):** `fill`→Mad Libs, `split`→Split the Room,
audio layer + Circuit Cypher (TTS + head-to-head vote mode), then the "Games
From Doot" `/explore` category. Polish-pass findings are in the doc §5.

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

Paste the prompt below into a new session. It carries the remaining backlog (the
detail lives in `docs/BACKLOG.md`), the rules, the hard-won gotchas, and where to look.

> You're picking up **Doot**, a self-hostable platform for **live party games**: a host puts a game on a big screen, a crowd joins from their phones via a 4-char code or QR, and everyone plays in real time over the **CLASP** relay (`wss://relay.clasp.to`). Live at **https://doot.games**; repo `virgilvox/doot-games`; trunk `main` (**every push to `main` deploys via CI**). It is mature and deployed: **twelve games** incl. **five flagship "Games From Doot"** (Quip Clash, Mad Libs, Split the Room, **Circuit Cypher** = a full **3D animated robot rap battle**, **"What, You Didn't Know That?"** = trivia gameshow); a **two-phase make→judge** engine primitive + a **`buzzer`** trivia block + a **custom-flow** override path (used by Circuit Cypher); the full catalog IA; saved games + optional auth + image uploads; a mobile-responsive, em-dash-free, **emoji-free** UI; **~182 tests + 2 opt-in live**, all green.
>
> **The most important lens: the average non-developer consumer is the primary user, not devs.** Optimize every change for "how will a regular person at a party host/play/customize this?" Clarity and obvious next-actions over cleverness.
>
> **FIRST THING:** the working tree has an **uncommitted, verified visual-polish batch** for Circuit Cypher (verse-box overflow fix, emojis→a real `Icon` component, slower pacing, a robot-animation fix, an opening title sequence; + `docs/BACKLOG.md`). It passes `pnpm test && pnpm -r typecheck && pnpm --filter @doot-games/web build`. **Decide:** pull it up on `pnpm dev` to eyeball it, then commit + push to deploy (no AI attribution), OR keep iterating on the look/pacing. See the top of `HANDOFF.md` for the file-by-file list.
>
> **Recently shipped (deployed + verified, do not redo):** consumer bugs **A1-A5**, author/host features **B6-B9**, and **D13 Circuit Cypher** in full: the custom-flow 1v1 tournament (single `bars` write round → `buildBracket` → host-driven matchups over the `/x/battle` channel → `tallyBattle`/`battleAward`/`tournamentLeaderboard`), a **3D Three.js arena** (`RapBattleStage`), a procedural **Web Audio engine** (`createArenaAudio`: beat + analyser + SFX + ducking), an **MC/announcer TTS voice** (`announce`/`speakVerse`), **per-player verse scaffolds**, **live-perform mode**, and **co-host phone-driving**. Two show-stopper bugs were found + fixed in verification (see Gotchas).
>
> **Read first, in order:** `HANDOFF.md` (current state - the notes above this prompt), `CLAUDE.md` (invariants, read fully), **`docs/BACKLOG.md`** (the remaining-work source of truth), `docs/authoring-a-game.md` + `examples/`, `docs/flagship-games.md` (**§8** Circuit Cypher build status; **§9** the gameshow plan; **§6** robustness roadmap), `docs/external-plugins.md`, `docs/games-from-doot.md`, `Doot-PRD.md`. Design sources: `doot-mockup.html` (the site), and `~/Downloads/robot-rap-battle (1).html` (the rap-battle mockup Circuit Cypher is based on).
>
> **Hard rules (do not violate):**
> - **Commits:** no AI attribution - no "Generated with", no `Co-Authored-By` trailers; the word "CLAUDE" only ever refers to the file `CLAUDE.md`.
> - **Copy:** **no em dashes** anywhere in user-facing copy, game/manifest descriptions, or docs (use commas/colons/periods/spaced hyphens); **no emojis in UI** - use the `Icon` component (`@doot-games/ui`; mic/volume/mute/skip/cheer/crown/cpu/mc, easy to extend); **no third-party brand names** in product copy (say "an AI assistant", never a brand); keep card descriptions **short + line-clamped**; the Create page heading is **"Create"**.
> - **Architecture:** games are **blocks + compositions** (a block = a round kind: content schema + Player/Host views + `aggregate` + answer-withholding; a game = manifest + ordered `{block,content}`; two-phase flagships compose a make block (quip/fill/bars) with a judge block (vote/split) **derived at runtime**). A **custom-flow** game overrides `components: {Host, Player}` and drives its own state over **custom relay channels** (`room.publishExtra`/`onExtra`, the `/x/<key>` namespace) - Circuit Cypher is the reference. **Never make one game import another.** **Ephemeral room state lives on the relay only** - nothing about a live room touches the DB. **Answers/submissions are withheld until reveal.** Identity is **reconnect-by-name** (`p_<hash(room+name)>`). The **host is the sole authority** (CLASP has no ACL; the engine enforces rules in code).
> - **Animation:** **CSS-first**. Canvas escape hatches are sanctioned only where they earn it: **Pixi** for 2D pointer canvas (`DrawCanvas`), **Three.js** for the rap-battle 3D arena (`RapBattleStage`) ONLY. Both are **lazy-imported, client-only, SSR-guarded** (kept out of the SSR bundle). Any **audio** is **client-only, SSR-guarded, a clean no-op where unavailable** (`speakLines`/`announce`/`speakVerse`/`createArenaAudio`/`playDing`); honor mute + `prefers-reduced-motion`.
> - **Accessibility is a build requirement:** semantic HTML + ARIA, color paired with shape/label, `prefers-reduced-motion` (global reset in `packages/themes/src/base.css`), an untimed option, screen-reader support on phones.
> - **Workflow:** branch off `main`. Verify EVERY change with `pnpm test && pnpm -r typecheck && pnpm --filter @doot-games/web build` (~182 tests; the 2 live tests need `DOOT_LIVE=1`). Real-browser smokes: `node scripts/playtest.mjs` (the block games) and **`node scripts/cypher-smoke.mjs`** (the Circuit Cypher custom flow end-to-end; both need a running `pnpm dev`). For UI, **screenshot at 390px** (phone) and at 1440px (host) and check 0 horizontal overflow. Keep `main` deployable; **ship small verified increments**; deploy = push to `main` (CI builds + deploys); after deploy verify `/api/health` + the changed pages on production.
>
> **Gotchas burned in this cycle (read these, they cost real time):**
> - **The engine drops a relay `.on()` subscription made before the socket connects** (CLASP doesn't replay it). A custom-flow host subscribes from `onMounted`, which runs before the room's async `connect()`. `RoomRuntime.onExtra` now **defers the subscribe to `onConnect`** - rely on that; don't subscribe to your own custom channels any other way. (This bug silently dropped ALL votes/cheers/drive on the host.)
> - **Custom channel shape:** use a proven 2-level wildcard (`vote/*/*`, `cheer/*/*`, `drive/*/*`); and **store payloads as the shape the consumer reads** - the vote tally bug was storing bare strings while `tallyBattle` reads `{choice}` objects, so every vote counted as zero.
> - **Headless Playwright throttles background-tab `setTimeout`**, so pacing/animation/title hold-times are unmeasurable headless. Verify timing-sensitive UI on a real foreground browser; use the smoke for logic/flow, not for timing.
> - **Static checks (typecheck/tests) missed two show-stoppers** in the custom flow. Deep-verify custom-flow features end-to-end in a real browser before trusting them.
>
> **Remaining work - `docs/BACKLOG.md` is the source of truth (verified against code).** A/B (consumer + author batches) and **D13 Circuit Cypher** are DONE + deployed; do NOT redo them. What's left, by rough priority:
> - **Quick consumer wins:** **C10 publisher/author display name** on community games + `/g/<id>` (small); two cheap flagships that are nearly free now - **Fib Finder** (`quip`→`vote` field + injected truth) and **Sketch & Spot** (existing `draw`→`vote` field). More replayable content is the highest payoff per hour.
> - **Robustness (E16, `docs/flagship-games.md` §6):** untimed "advance when everyone's submitted" mode, the **timeout safety-net auto-fill at 50%**, content-filter tiers, audience-as-discounted-bloc (`audienceWeight` exists in `scoring.ts`, unwired).
> - **D14 the full gameshow** for "What, You Didn't Know That?" (`docs/flagship-games.md` §9) - the big next flagship-depth piece (4-contestant panel + audience steal, quick-draw tiebreaker, final lightning round, specialty packs incl. a theme-song audio-clip block). Custom-flow, like Circuit Cypher.
> - **Engine gaps (E18):** `PlayerReveal` missing on poll/rank/rate/draw; own-answer hiding unwired for fill/split (reserved `assignment`/`promptFor` path); admin role + DB-backed official games + versioning.
> - **Roadmap (E15/E17):** external-plugin runtime (sandboxed iframe on `plugins.doot.games`, security-critical); OAuth/magic-link; Postgres for multi-instance; upload hardening.
> - **Circuit Cypher follow-ups:** a real **two-phone, on-device** playtest (touch + device WebGL/audio/TTS); optional themed arena colors (currently the deliberate neon palette); **The Big Reveal** (Talking Points capstone) is now more feasible given the live custom-channel transport.
>
> **Where things live:** blocks in `packages/games/src/blocks/<kind>/` (guess/rate/poll/rank/draw/quip/vote/fill/split/**bars**/**buzzer**); games in `packages/games/src/games/` (composed games are ~20 lines; **custom-flow** games ship `.vue` Host/Player - `circuit-cypher.ts` + `CircuitCypherHost.vue`/`CircuitCypherPlayer.vue` + `cypher-bracket.ts` (pure bracket/tally/award/leaderboard/scaffoldIndex, tested); `what-you-didnt-know.ts`); generic renderer + scoring in `packages/games/src/runtime/` + `blocks/scoring.ts`; **engine** in `packages/engine/src/` (`room.ts` = state machine, presence, runtime-derived content, player cap, co-host, **custom channels `publishExtra`/`onExtra` with the connect-safe defer**; `addresses.ts`; the Vue binding `vue/index.ts`); SDK in `packages/sdk/src/block.ts`. **UI** in `packages/ui/src/components|audio` - **`Icon.vue`** (the no-emoji icon set), **`RapBattleStage.vue`** (the lazy Three.js 3D arena), **`audio/arena.ts`** (`createArenaAudio`: procedural beat + analyser + SFX + duck), **`audio/speech.ts`** (`speakLines`/`announce`/`speakVerse`), `RobotRapper`/`RobotBattle`, `ControlBar`, `CountdownRing`, `ConfettiBurst`, `JoinForm`, `GameCover`/`GameTypeIcon`/`SiteFooter`/`visuals.ts`, `schema-form/`. Shell/editor/catalog in `apps/web` (`components/HostRoom.client.vue` mounts `plugin.components?.Host ?? GameHost`, same for Player; `PlayerRoom.client.vue`; `pages/play/[room].vue` join gate; editor/catalog pages). `packages/games/src/catalog.ts` is the server-safe game list, kept in sync with `registry.ts` by a test (new flagship: game file → `registry.ts` → `catalog.ts` → `visuals.ts`; an answer-bearing block also needs a `REDACTION_RULES` entry). Auth = better-auth (`server/utils/auth.ts`); durable store = libSQL/SQLite (`server/utils/db.ts`). Real-browser smoke for the rap battle: `scripts/cypher-smoke.mjs`.
>
> **Suggested order:** decide the uncommitted visual batch first (review + deploy, or iterate). Then the quick consumer wins (C10 + Fib Finder + Sketch & Spot), then robustness (E16), then D14 (the gameshow), then the roadmap (external plugins, OAuth/Postgres, engine gaps). `docs/BACKLOG.md` is the live checklist.
