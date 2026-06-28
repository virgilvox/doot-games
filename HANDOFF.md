# Handoff

Snapshot of where Doot stands, for the next session or contributor. Pair with [`Doot-PRD.md`](./Doot-PRD.md) (the spec), [`CLAUDE.md`](./CLAUDE.md) (conventions), and [`docs/`](./docs).

_Last updated: 2026-06-28. The default branch is `main` (every push to `main` deploys to
prod via CI, no staging)._

> **ROOM LIFECYCLE: resume vs play-again vs new room (2026-06-28).** The resume change made
> "refresh = same game" the default (right for crash recovery), which made "start fresh" less
> obvious and exposed that the old "Play again" just reloaded — reusing the sticky per-context
> code and inheriting the previous game's retained roster/inputs (ghosts + score bleed).
> Designed against Kahoot (reconnect resumes; restart mints a new PIN; rematch keeps the crowd)
> and Jackbox (a new code per game). Three clearly-separated actions now; shipped to prod
> (863 tests + typecheck + build + a real-browser `scripts/host-lifecycle-smoke.mjs`):
> - **Refresh/reconnect = resume** (silent recovery; unchanged).
> - **"Play again" (results) = keep this crowd, wipe scores, back to round 1.** Now calls
>   `room.host.nextGame(rebuiltGame)` instead of `location.reload()`. `nextGame` already clears
>   the previous game's inputs at every round address (no score bleed) and keeps the roster
>   (unit-tested), so nobody re-scans the QR. HostRoom extracts `buildLoadedGame()` (shared by
>   `load()` + play-again) and `provide()`s `dootPlayAgain`; GameHost injects it (falls back to
>   reload if no host shell). Same code => same pooled content (rematch).
> - **"New room" = fresh code for a new group.** `resetHostSession` + reload; `provide`d as
>   `dootNewRoom`, surfaced on the results screen (next to Play again) AND in the lobby bar.
> - **"End game" (mid-round) = bail a false start.** The host bar shows "End game" (confirmed,
>   since it abandons the round) while `phase==='active'`, where "New room" used to be hidden,
>   so a misconfigured game now has an escape. Same fresh-room reset under the hood.
> - Results screen carries a one-line hint ("Play again keeps this crowd and resets scores;
>   New room starts a fresh group"). SessionHostRoom (playlist) keeps its own flow; its
>   New-room button is unchanged (no End-game variant there yet — follow-up).

> **POST-104-PLAYER-GAME FIXES: relay resilience, host resume, UX (2026-06-27).** Fixes
> from the first real 104-player game. All shipped to prod; 863 unit tests + typecheck +
> build + three real-browser smokes green.
> - **RELAY RECONNECTION SUPERVISOR (the headline bug: "ratings fail to load at scale").**
>   `@clasp-to/core` gives up permanently after 10 internal reconnect attempts and the engine
>   did nothing after, so a blipped socket stayed dead until a manual refresh (which dropped
>   the player to the name field). `createClaspRelay` (`packages/engine/src/relay.ts`) now OWNS
>   reconnection: it forces the client's own `reconnect:false` and runs a supervisor that, on
>   any drop, rebuilds the client + reconnects with jittered UNBOUNDED backoff + re-registers
>   every subscription (a fresh SUBSCRIBE makes the relay replay retained snapshots, so room
>   state re-hydrates in place, no reload). Engine listeners are preserved across rebuilds; a
>   `reconnecting` in-flight guard prevents racing rebuilds; `close()` (now called from all 5
>   room components on unmount) stops it + fixes a pre-existing socket leak. Injectable
>   `makeClient` for tests. 6 unit tests.
> - **Churn + payload hardening.** `emit()` (`room.ts`) is coalesced per-microtask, so a
>   reconnect SNAPSHOT replaying 100+ retained params is one snapshot recompute, not 100+
>   (the O(N) storm at party scale). Presence is re-broadcast immediately on reconnect so the
>   host's window doesn't drop a returning phone. `assertConfigBroadcastable` fails `start()`/
>   `nextGame()` loudly BEFORE any partial publish if a config exceeds ~60KB (CLASP's uint16
>   frame cap); `ImageField` rejects a pasted data-URL over 32KB. (maxRate intentionally NOT
>   applied to the ping wildcard: it would risk presence flapping; coalescing handles the CPU.)
> - **HOST MID-GAME RESUME (host refresh restores the game, players stay).** A host reload now
>   RESUMES an active game from retained relay state instead of resetting to the lobby
>   (`RoomRuntime.tryResumeMidGame`): it READS the retained phase/round (every read bounded at
>   700ms so an absent key can't stall connect) and reseeds local state, never publishing
>   phase/config/answers (no re-leak, no reset of live players). GATED to `resumable` games
>   (no `derive`/`assignContent`/`fromShares` round, so all answer keys are static + re-derivable);
>   two-phase/hidden-role keep the clean lobby reset because their answer keys live only in host
>   memory. Lobby choices (round count/timers/filter) are persisted per context in
>   `useHostSession` so the config rebuilds IDENTICALLY on reload. Only 'active' resumes (not
>   'results' — the host doesn't retain its own results summary). SessionHostRoom resume is a
>   follow-up (it doesn't pass `resumable`, so it safely keeps the lobby reset). 3 unit tests +
>   `scripts/host-resume-smoke.mjs` (real browser: host reload resumes Round 1/N, player not
>   reset, code stable).
> - **"Round X of N" excludes display rounds.** The counter used the raw engine pointer +
>   full `rounds.length`, counting slide/title cards. GameHost/GamePlayer/GameAudience now count
>   only PLAYABLE rounds (display excluded, solo still counts) for the DISPLAYED number; the
>   engine's pointer is unchanged.
> - **Scoring explanation in the lobby.** New `RoundBlock.scoring?` one-line blurb (sdk); 18
>   scoring blocks seeded; `scoringSummary` composes the distinct lines for the actual game,
>   rendered as a "How scoring works" `<details>` in the GameHost lobby. Custom-flow games
>   (own Host.vue) don't show it yet (follow-up).
> - **Name prefill + reconnect affordance.** The play page stashes the player name in
>   localStorage (fails open where storage is blocked, per the identity invariant) so a refresh
>   prefills it. `JoinForm`'s "It's me, reconnect" is now the big primary button (was a tiny
>   link; "pick a different name" demoted).
> - **Round triggers use NO CLASP param** (owner question): they are separate RETAINED pub/sub
>   keys (phase/index/state/deadline), so reconnecting clients converge from the relay snapshot
>   for free — the fix was socket resilience, not the trigger model.
> - KNOWN GAPS: the supervisor's real-socket-drop reconnect is covered by unit tests + the
>   strictly-better-than-before failure path, but not yet a real-browser forced-drop smoke; the
>   64KB guard uses JSON length (UTF-16) as a byte proxy (headroom covers it).

> **HOST-SCREEN LAYOUT + IMAGES + UNLOCKED PICKS (2026-06-27).** A pass on big-screen
> image sizing, the control bar, slide fit, rating ties, and a player-input safety net.
> All shipped to prod; verified by two new real-browser smokes + 850 unit tests + typecheck +
> build. Done in several commits; the net state:
> - **`MediaFrame` (`packages/ui/src/components/MediaFrame.vue`), the one image primitive.**
>   `fit="contain"` frames the `<img>` ITSELF (border/radius on the picture, not a wrapper
>   box) so the card always HUGS the picture — a portrait/square in a wide slot has no
>   letterbox gap and is never cropped. `fill` drives `height:100%` (capped by a viewport
>   `maxH`) so the picture also scales UP to fill its space while still hugging. `fit="cover"`
>   (ratio + 0..1 `focal` → object-position) exists for fixed-shape crop slots but isn't wired
>   in yet (the focal-point editor UI is the obvious next step). Used for the host prompt image
>   (`GameHost` split-grid), the slide/cover + title reveal, the guess answer-reveal, and the
>   phone prompt image (`GamePlayer`). Fixed the gap/"image too small" complaints with zero
>   per-image fiddling.
> - **Host stage is a scroll-content + flow-footer shell now.** `GameHost`'s active `.stage`
>   wraps the round content in `.stage-content { flex:1; min-height:0; overflow-y:auto }` and
>   the `ControlBar` is a normal-flow sibling BELOW it (NOT sticky). So tall content scrolls
>   inside its own region and the bar is never overlapped and never pushed off-screen. The
>   active stage is viewport-capped (`max-height: calc(100dvh - 104px)`, active-only — lobby
>   `.lobby` / results `.results-wrap` keep their own roots + page-scroll). KNOWN SMELL: that
>   104px offset is a constant tuned for the host big screen (single-row bar); the bar being
>   normal-flow means an under-estimate degrades to a small scroll, never an overlay. A fully
>   measured app-shell (bound `Stage`'s `.stage-wrap` to `100dvh` + internal scroll on every
>   phase) is the clean follow-up — `.stage-body` already got `min-height:0` toward it.
> - **Slides/titles AUTO-FIT instead of scrolling** (`useFitScale`, `packages/ui/src/composables/`).
>   A display slide should read at a glance, so `useFitScale` binary-searches a `--fit`
>   multiplier on the type sizes until the content stops overflowing its BOUNDED PARENT (it
>   measures the parent, not the node: a `height:100%` fill child reports its content height as
>   its own scrollHeight — the flexbox percentage-height gotcha — so the parent cell carries the
>   real budget; parent padding is subtracted). SlideView/TitleView multiply their font/gap
>   clamps by `var(--fit,1)`. Important: the fit is a GENTLE safety (min 0.72), NOT the primary
>   sizing — earlier it over-shrank the body to "tiny" on laptop-height windows because the side
>   image's `72vh` cap exceeded the available cell (chrome+bar eat ~250px), making the IMAGE the
>   constraint and the fit uselessly shrink the TEXT. Fixed in layout: side image capped at
>   `min(58vh,620px)`, text `max-width: 34rem` so it WRAPS at a readable measure, reasonable type
>   (heading `clamp(26px,3.4vw,52px)`, body `clamp(16px,1.9vw,26px)`). Now fits with `--fit≈1` and
>   readable type at 820/900/1100 heights.
> - **Rate ties: show EVERYONE tied** (`packages/games/src/blocks/rate/block.ts`). The
>   "Top rated {category}" award kept only the first of a tie (`avg > prev.avg` dropped equals);
>   it now keeps every subject within an epsilon of the best average and emits one award card
>   each (with its own image). Combined-ranking tie check hardened with the same epsilon. +2 tests.
> - **Capture an UNLOCKED pick when a round closes** (`GamePlayer`). If the round closes (host
>   locks, or the timer runs out) while a player has a complete selection they never tapped
>   "Lock it in" for, it's submitted for them so the pick still counts. `room.submit` isn't gated
>   on round state, so the late input lands before the host's separate reveal and is scored. Kept
>   in a `pendingPick` ref because `value` re-initialises on every state change. No-op for
>   solo/display blocks, already-submitted, or ineligible players.
> - **New smokes:** `scripts/image-layout-smoke.mjs` (hug/fill, bar-never-overlaps, slide
>   auto-fits 0px, no h/v overflow at 1440x900; drives a `custom` draft via the editor→host
>   `doot-game-draft` sessionStorage handoff) and `scripts/unlocked-pick-smoke.mjs` (select-but-
>   don't-lock → host lock → the vote is counted). Gotcha baked into both: `timer: 0` is a
>   0-second timer that auto-locks INSTANTLY; "off" is `timer: null`.

> **ROOM-CODE LIFECYCLE: codes now cycle between games (2026-06-26).** Owner reported the
> host code "always stays the same" and old players still show connected across games. Root
> cause: `useHostSession` persisted code+token in sessionStorage and NOTHING ever cycled it
> within a tab, so a new game reused the old code and inherited the previous room's retained
> relay state (profiles/pings/inputs, 8h TTL) — `recentPlayers()` keeps anyone with prior
> inputs (load-bearing for scoring; the aggregates map over `ctx.players`), so those ghosts
> persisted. The roster semantics are correct + well-tested; the real fix is the room
> lifecycle, not the roster.
> - **`useHostSession({ context })`** (`apps/web/app/composables/`): sessionStorage now holds a
>   per-CONTEXT map (`doot-host-rooms`: ctx → {room, token, ts}). A refresh of the SAME game
>   resumes its room; a DIFFERENT game gets its OWN room (never inherits the old code + ghosts);
>   alternating between two games keeps EACH game's room + crowd (a detour to another host page
>   and back no longer abandons the first room — the audit's only real lifecycle finding, now
>   fixed); an entry idle > 6h is pruned (the idle clock is bumped each load, so a live session
>   never trips it). Context = `g:<id>` (saved game), `p:<plugin>` (flagship/draft),
>   `pl:<ids>`/`session` (playlist host).
> - **"New room" button** in the host bar (HostRoom + SessionHostRoom), shown when NOT mid-game
>   (`phase !== 'active'`): `resetHostSession(context)` + reload → brand-new code for THIS game,
>   clean roster (other games' rooms untouched). The explicit "this game has ended" signal the
>   owner asked for. A fresh code = fresh relay namespace = zero ghosts, without touching the
>   (correct) scoring roster. (UPDATED 2026-06-28: HostRoom now shows a confirmed **"End game"**
>   in the bar DURING an active round where "New room" used to be hidden, and surfaces "New room"
>   on the results screen next to "Play again" — see the ROOM LIFECYCLE entry at the top.)
> - **Room conflict** is unchanged + already handled: on connect `ensureFreeRoomCode`/
>   `roomCodeTaken` regenerate if a DIFFERENT live host holds the code (host-token match keeps
>   your own on reload). Cycling mints a random code that still runs that collision check.
> - **Solo-block driver guard (audit fix):** a delegated MC could previously `lock`/`reveal` a
>   solo tier round mid-show (the round is held `'open'`, so `can('lock')` stayed true), cutting
>   it short. The driver button is now hidden during a solo show (only the end-of-round `next`/
>   `finish` step shows), and `GameHost` ignores `lock`/`reveal` drive intents for solo blocks.
> - Verified: 9 `useHostSession` lifecycle tests (incl. detour-and-return) + full suite green,
>   typecheck + build green, an e2e proving refresh RESUMES the code while "New room" CYCLES it.
> - **Tier confetti** now fires only on a TOP-tier (S) landing, not every reveal (was silly on
>   a C/D/F item). `TierHost.revealItem`: `confetti = currentResult?.tier === 0`.

> **TIER LIST is now a SOLO BLOCK (2026-06-26, final).** This supersedes the earlier interim
> tier approaches (the all-at-once block + the custom-flow flagship; both trimmed from this
> log). Per owner direction: the
> item-by-item tier experience is baked into the `tier` BLOCK itself, so dropping a Tier List
> round into any game runs the whole show (board fills, NOW RANKING, leaderboard, the reveal
> beat), then advances to whatever round comes next (any type). One block, not a special game.
> - **New renderer capability: `solo` blocks.** Added `RoundBlock.solo?: boolean` (sdk, mirrors
>   `display`). `GameHost` renders a solo block full-stage, hides the generic open/lock/reveal
>   ControlBar (shown again only at the round's `reveal` so the standard Next round / Final
>   results + end-of-game scoring still run), and skips `maybeAutoLock`. `GamePlayer` renders the
>   solo PlayerInput full (no "Lock it in"). All opt-in + gated; every other block/game untouched
>   (verified: 841 tests + typecheck green). Block views reach the room via `injectDootRoom()`
>   (works live AND in the editor preview's no-op mock room). Documented as "Way 5" in
>   docs/authoring-a-game.md.
> - **The `tier` block** (`packages/games/src/blocks/tier/`): `solo: true`, `timerOf: () => null`.
>   Its HostDisplay opens the round, drives an item-by-item show (broadcasts the current item on
>   `/x/tiershow`; reads the live cumulative board / lock count / leaderboard straight from the
>   STANDARD round `inputs`), and when items are exhausted calls `lock()`+`reveal()` to hand off.
>   PlayerInput shows ONE item + full-width tier buttons (sublabels like "GOD TIER"); a re-tap
>   CHANGES your vote until the host reveals that item (no early lock); it submits the growing
>   placements via `room.submit`, so the existing all-at-once `aggregate` scores it unchanged.
>   Per-item timer = `content.timer` seconds (default 20), pausable; honours the lobby "turn off
>   timers". `content.scored` gates the "Top of the room" leaderboard (flagship = true).
> - **Image vs text + overflow handled**: an item shows its image big (or the name big when text);
>   board cells are thumbnails or text chips; a packed band shrinks its cells and caps with a "+N"
>   chip so any distribution (incl. all 24 in one tier) fits; the lock indicator is dots for small
>   rooms, a bar for big ones (no per-player DOM).
> - **The flagship `tier-list` game is now just `[tier]`** (a one-line composition; the custom-flow
>   Host/Player/show/logic were deleted). Deck-feeding preserved. Verified `scripts/tier-flow-smoke.mjs`:
>   Part A = 98 players (95 headless voting via the standard input over `/x/`-synced items), 12
>   items, **1140 votes, 0 host errors, 0 overflow**, host + phone + editor-preview match the mockup;
>   Part B = a `[tier, poll]` game proves the block finishes its items and **advances to the poll
>   round**. (Note: the earlier custom-flow Host had a critical unvalidated-vote bug + a 100-player
>   lock-dot blowout - both gone, since votes now go through the validated standard input and the
>   dots cap.)
> - **Prod-bug pass (2026-06-26, after owner tested live):** four reported issues fixed.
>   (1) **Host cramped to the left** — `.tl-host` now `flex:1; width:100%; min-width:0; height:100%`
>   so it fills the solo `.stage-full` flex row instead of collapsing to content width.
>   (2) **"It doesn't let you vote, it auto locks"** — the per-item timer no longer auto-reveals an
>   item with ZERO votes in (`lockCount.locked > 0` guard); a lone tester now has unlimited time to
>   cast a first vote and the host's Reveal button always moves it on. Plus the host re-publishes
>   `/x/tiershow` whenever the roster grows, so a late joiner converges to the current item/phase
>   (never a stale retained `reveal`). The reconnect path was also hardened: TierPlayer reads its
>   board from `room.inputFor(index)` (engine replays it on reconnect) + a local `pending` overlay,
>   so a phone reload no longer overwrites the whole board with just the current item.
>   (3) **"Where is the real-time ranking"** — the "Top of the room" leaderboard is always shown
>   (was gated on `content.scored`); `scored` now defaults to TRUE.
>   (4) **Editor preview mismatch** — a solo block now previews FULL-BLEED (`curIsSolo` joins
>   `curIsDisplay` for both the phone scaffolding gate and the big-screen `.ed-bs-full` branch),
>   so the preview matches the real host/phone instead of the split "prompt big on half the screen".
>   Verified: 839 tests + all-package typecheck + web build green; `tier-flow-smoke` ALL GREEN
>   (12 items, 144 votes, advances to poll); host/phone/editor screenshots match the mockup.

> **LOAD TEST: 100 players in one room - PASSED (2026-06-26).** A new harness
> `scripts/load-test.mjs` (run with the repo's `jiti`, since it imports the TS engine
> package) stress-tests a real game at party scale. It authors + saves a `custom`
> block-composed game (guess + poll + guess) via the API, hosts it in a real Playwright
> browser, joins a few "phone" players in real browsers, and spawns the REST as HEADLESS
> players that connect straight to the live CLASP relay through the engine's real
> `RoomRuntime` (no DOM - `createRoom`/`createClaspRelay` run in Node 22 with no polyfill,
> resolved via jiti) and auto-answer each round. Headless is ~10x cheaper than a browser,
> so one process drives ~95 of them.
> - **Result at 95 headless + 5 phones (= 100 players, one room):** all 100 joined, the
>   host roster saw all 100, every headless player submitted every round, **0 host page
>   errors**, and host aggregation->reveal stayed **28-80ms** even scoring 100 inputs into
>   a leaderboard. The poll tallied all 100 votes correctly and the co-crown tie handling
>   produced a "76-way tie" headline. Phones + host rendered cleanly at 390/1440.
> - **Gotchas captured in the harness:** (a) `autoAdvance` defaults ON, so a fast headless
>   crowd auto-locks a round before a manual "Lock voting" click - the driver tolerates
>   either path. (b) backgrounded Playwright phone tabs throttle timers (the known gotcha),
>   so the harness `bringToFront()`s each phone before it answers. (c) players publish their
>   profile + heartbeat only AFTER receiving the host's `lobby` phase, so the host must be
>   up first (it is - the code is read off its page). (d) all virtual players join in the
>   lobby so `joinedAtIndex===0` (late joiners' submits are silently dropped by eligibility).
> - Env: `HEADLESS`, `PHONES`, `SHOTS=1`, `BASE_URL`. Ramps connections in batches of 10 to
>   avoid a per-IP burst on the public relay (95 connected in ~29s, 0 spawn fails).
> - **Layout-at-scale audit (what 100 players did to the UI):** horizontal overflow was
>   **0px on every surface** (lobby, active, results, phone); the leaderboard is already
>   capped at 10 rows and poll/distribution bars are per-option, so both are player-count
>   independent. **One real bug, now FIXED:** a big top-score tie made `crownHeadline`
>   enumerate ALL winners ("76-way tie: Bot001, Bot002, ... & Bot095"), a wall of names that
>   filled the host results `<h1>` and shoved the carousel off-screen. `tieNames()` now caps
>   it ("76-way tie: Bot001, Bot002, Bot004 & 73 more"); same cap on `teamCrownHeadline`; a
>   `-webkit-line-clamp:3` on the results h1 is the belt-and-suspenders. After the fix the host
>   results carousel (leaderboard slide + poll-breakdown slide) renders within bounds and the
>   stat strip reads "100 players".
> - **Lobby roster "+N more" cap - FIXED (2026-06-26).** The lobby roster wrapped all 100 pills
>   and scrolled the host page ~2286px, pushing the **Start button below the fold** (at 1120px of
>   a 900px viewport). `RosterChips` now caps the visible pills at `max` (default **12**) and
>   collapses the rest into a "+N more" chip the host can expand into a height-bounded (270px)
>   scroll box, so the full list is reachable (incl. kick) without the page ever scrolling.
>   Result at 100 players: lobby overflow **0px**, Start **VISIBLE** (808px) in BOTH collapsed
>   and expanded states. `max={0}` opts out (show everyone). Applied as the component default, so
>   all 7 host lobbies (generic + 6 custom-flow) benefit; host-kick smoke still green.
> - One NON-bug remains: the 10-row leaderboard slide is ~477px taller than an 1440x900 host
>   (its own internal scroll handles it; fits a 1080p TV; not player-count-specific, the board is
>   already capped at 10).

> **MODERATION 3/3: post-game report flow (2026-06-26). DONE - completes the moderation
> trio** (name filter -> host kick -> report flow). Players can now flag a game for a
> moderator from the results screen; admins triage the reports in the console.
> - **DB**: a new additive `reports` table (`apps/web/server/utils/db.ts` ensureSchema +
>   a `reports_status_idx`), durable and explicitly NOT room state - by the time a report
>   is filed the room is over, so it keeps only breadcrumbs (reason, optional note, the
>   live room code, the game's title + pluginId, a status). `REPORT_REASONS` /
>   `REPORT_STATUSES` consts are the server-side source of truth.
> - **Repo + API** (`server/utils/reports-repo.ts`): `createReport`/`listReports`/
>   `setReportStatus`/`openReportCount`, plus the exported `reportInputSchema` (the Zod
>   POST boundary - a plain object STRIPS unknown fields so a caller can't forge a
>   `status`/`id` into the store). Routes: `POST /api/reports` (ANONYMOUS - players have
>   no account - rate-limited via a new `rep:` bucket in `server/middleware/rate-limit.ts`
>   so a report burst can't starve game saves; size-capped; returns 204),
>   `GET /api/admin/reports` (admin, status-filtered + openCount), `POST
>   /api/admin/reports/[id]` (admin, set status). All admin routes gate with `requireAdmin`.
> - **Admin UI**: a **Reports** tab in `/admin` (filter open/reviewed/dismissed/all;
>   Reviewed/Dismiss/Reopen actions), an open-count **badge** on the tab + an alert
>   **stat card** on Overview that jumps to the tab. `getStats` gained `openReports`.
> - **Player UI**: a reusable `ReportButton.vue` (`packages/games/src/runtime`, exported)
>   wired into the GamePlayer **results** block (covers every block-composed game). It
>   reads context from `room` (code + meta.title + meta.pluginId) and posts with the
>   global `fetch` (no Nuxt dependency, so it lives in the games package). A new `flag`
>   Icon glyph. Custom-flow games (Quiz or Die / Circuit Cypher / etc.) have their own
>   Player.vue and don't show the button yet - a small follow-up (mount `ReportButton`
>   in those results views).
> - **Verified**: 6 new unit tests (the `reportInputSchema` boundary: rejects bad/missing
>   reason + over-long detail, strips a forged status/id) - 809 tests; `nuxi typecheck` +
>   build; a real-browser `scripts/report-flow-smoke.mjs` (bad reason -> 400, good -> 204;
>   the results button files end to end -> 204 -> thank-you state; rows land in the DB with
>   the real game title from `meta`; the admin endpoint is 401 without auth). Screenshots
>   at 390/1440 = 0 horizontal overflow on both the Reports tab and the player report panel.

> **MODERATION 1/3: player-name profanity filter (2026-06-26).** First of the moderation trio
> (name filter -> host kick -> report flow). Player names are public (projected on the big
> screen), so strong profanity/slurs in them are now masked.
> - **Engine**: new `RoomRuntimeOptions.nameFilter?: (name) => string`, applied in
>   `recentPlayers()` via a `displayName()` helper - the SINGLE chokepoint, since
>   `getSnapshot().players` and scoring's `getPlayers()` both go through it, so roster +
>   results + standings + custom-flow hosts are all covered by one seam. The RAW name is kept
>   for identity (`pid = hash(room+name)`), so reconnect-by-name is unaffected (masking is
>   display-only). The engine stays content-policy-agnostic (DI; it can't import `contentFilter`
>   - dependency direction is games->engine).
> - **App**: `app/utils/playerNameFilter.ts` (auto-imported) = `maskText(name, 'moderate')`
>   (reuses the existing obscenity-based gallery filter; 'moderate' = slurs/strong profanity,
>   not the mild list); wired into ALL 5 `useDootRoom` sites (HostRoom, SessionHostRoom,
>   PlayerRoom, AudienceRoom, WatchRoom) so every screen masks consistently. Names always mask
>   at 'moderate' regardless of a game's gallery content-filter tier (public screen = never OK).
> - **Verified**: 2 new engine unit tests (masks the roster name / keeps identity; no-op
>   without a filter) - 801 tests; `nuxi typecheck` + build; real-browser
>   `scripts/name-filter-smoke.mjs` ("fuckwit" -> "••••wit" on the host roster, no raw word).
> - **Deep audit (2026-06-26):** confirmed `recentPlayers()` is the true chokepoint - it
>   feeds BOTH `room.players` (snapshot) and the derive/scoring `ctx.players` (via
>   `getPlayers()`), so even name-bearing blocks (faker/accuse `names` map) mask correctly;
>   all 5 `useDootRoom` sites wired. KNOWN TRADE-OFFS (documented in `docs/admin.md`): masking
>   is display-only (the relay profile still carries the raw name - best-effort over a
>   trustless relay), and obscenity has rare false positives so a real name like "Dick" is
>   masked too (accepted cost of never projecting a slur).
> - **2/3 host "kick player" - DONE (2026-06-26).** A host-side ignore set in `RoomRuntime`
>   (`ignoredPids`) filtered out of `recentPlayers()` + `inputsFor()`, so a kicked player drops
>   from the roster, the board, the derive, AND scoring. No relay write (the relay is trustless,
>   can't force a client off; keyed by pid so re-entering the same name stays out); host-local +
>   in-memory, cleared on a host reload. `kickPlayer`/`unkickPlayer` host actions (unkick reverses
>   an accidental kick). UI: a `kickable` opt-in + `@kick` on `RosterChips` (a per-pill remove
>   button using a new `close` Icon glyph), wired in the GameHost lobby roster with a confirm.
>   Verified: engine unit tests (kick drops from roster+inputs, unkick restores; kicking the
>   driver revokes driving) - 803 tests; typecheck + build; real-browser
>   `scripts/host-kick-smoke.mjs` (dev + prod).
>   DEEP AUDIT (2026-06-26): (a) FIXED - `kickPlayer` now clears the delegated driver if the
>   kicked pid was driving (else a kicked co-host could keep sending drive commands; shipped
>   `f141419`). (b) VERIFIED OK - the "everyone answered" auto-advance respects the kick (its
>   eligible count iterates the kick-filtered `room.players` + `inputsFor`). (c) KNOWN LIMITS:
>   the kick UI is **lobby-only** (RosterChips is rendered in GameHost's `phase==='lobby'`
>   block; the engine supports kick in any phase, so a mid-GAME kick control is a follow-up,
>   as is wiring kick into custom-flow games' own rosters); there is no in-UI **unkick** yet
>   (reload clears the ignore set); and a mid-judge-round kick doesn't retroactively scrub an
>   already-published gallery entry (the gallery text is content-filtered regardless).
> - **NEXT (3/3):** a post-game report flow (a `reports` table + `/api/admin/reports` + a Reports
>   tab in the admin console next to Status + a report button on the results screen).

> **FIX: host reload keeps the room code (players no longer stranded) (2026-06-26).** The
> foundation half of host-reload recovery (see the prior entry for the verified bug). Now a
> host reload resumes the SAME room instead of regenerating the code. (NOTE: `useHostSession`
> has since evolved from this single code+token slot to a per-CONTEXT room map so codes cycle
> between games — see the "ROOM-CODE LIFECYCLE" entry at the top; the keep-on-reload property
> below still holds, now scoped per game.)
> - **App** (`composables/useHostSession.ts`, used by BOTH `HostRoom.client.vue` and
>   `SessionHostRoom.client.vue`): persist the room code + a per-host-instance token in
>   **sessionStorage** (per-tab; survives reload, not tab-close, which is exactly right; the
>   host is a real browser, not the storage-blocked player embed), reuse them on remount, pass
>   the token to `useDootRoom`, and persist the settled code if the engine regenerates it.
>   (Audit caught that the session/playlist host was a SECOND host entry point with the same
>   bug; centralizing the logic in the composable fixed both.)
> - **Engine**: `RoomRuntimeOptions.hostToken`; new `addr.hostToken` channel (the host publishes
>   its token on the settled code after `ensureFreeRoomCode`); `roomCodeTaken` now reads it - a
>   live code carrying MY token (a reload) reads as FREE (keep it), a different/absent token
>   reads as taken (regenerate). `hostPing` stays a plain number, so player liveness reads are
>   untouched (no deploy-time blip). Security: a genuine collision still regenerates; the token
>   being public on the trustless relay doesn't weaken the posture (the collision check only
>   constrains engine hosts - a determined attacker who knows a live code can already raw-publish
>   regardless; the fix was always an ACCIDENTAL-collision safeguard).
> - **Verified:** 2 new engine unit tests (own-token keeps / different-token regenerates) +
>   the existing 4 collision tests green (799 tests total); `nuxi typecheck` + build; and a
>   real-browser smoke `scripts/host-reload-smoke.mjs` (host reload keeps the code, the
>   pre-reload player stays in the roster, not stranded) + the core-loop smoke (no regression).
> - **[SHIPPED 2026-06-27, supersedes this "STILL TODO" item]** mid-game recovery now works
>   for `resumable` games (no derive/assign/fromShares): `RoomRuntime.tryResumeMidGame` reseeds
>   from retained relay state on a host reload instead of resetting to lobby, lobby choices are
>   persisted so the config rebuilds identically, and two-phase/hidden-role games keep the clean
>   lobby reset (their answer keys are host-only). See the POST-104 entry at the top. The
>   original analysis is kept below for context.
> - **STILL TODO (the other half) - mid-game recovery is a DESIGN effort, not a quick fix
>   (mapped 2026-06-26, do not attempt naively):** on a host reload mid-GAME the engine
>   re-publishes `lobby` on connect, so the game RESETS to the lobby (players stay, not
>   stranded - strictly better than before, but not full recovery). The investigation found
>   the host's authoritative state is largely UNRECOVERABLE from the relay by design:
>   - The host deliberately does NOT subscribe to its own phase/round/results/standings/
>     runtimeContent/reveals (`room.ts` subscribe(), `if (role !== 'host')`), so a reload must
>     EXPLICITLY relay.get + reseed them (inputs + roster DO re-read via subscribe). That part
>     is doable.
>   - But the **withhold-answers invariant** keeps answer keys host-only-in-memory (never on
>     the relay before reveal), and **pool-sampled flagships generate their full config (with
>     answers) fresh at load**, so a reload RESAMPLES and mismatches the in-progress game on
>     the relay. So full recovery (incl. scoring) is cleanly possible only for deterministic-
>     config games (saved-by-id, static built-ins) AND single-type (no derive); pool-sampled
>     or two-phase generic games + custom-flow have host-only state a reload can't restore.
>   - A naive partial fix (skip the lobby publish + reseed phase/round) would leave pool-sampled
>     games with a resampled config that mismatches the relay = CORRUPTION, worse than the clean
>     lobby-reset. So this needs real design (e.g. persist the resolved config to the relay/DB
>     keyed to the live room, or gate recovery to deterministic-config games), not a rushed
>     change. Current lobby-reset is SAFE; leave it until designed. The foundation (players not
>     stranded) already captured the bulk of the value.

> **VERIFIED BUG: host reload regenerates the room code + strands ALL players (2026-06-26).**
> Investigating Tier-1 "custom-flow host-reload recovery" surfaced a bigger, GENERAL
> regression (affects every game, not just custom-flow), **verified on prod**: host
> `/host/votebox` (code `N3HH`), reload the host tab, the code becomes `NMB8` - the players,
> still on the old code, are stranded. This CONTRADICTS the prior handoff claim that "generic
> games survive a host reload"; they do not.
> - **Root cause (two compounding):** (1) `apps/web/app/components/HostRoom.client.vue:50` runs
>   `const roomCode = makeRoomCode()` fresh on EVERY mount, so a reload (= remount) gets a new
>   code regardless. (2) Even if the code were reused, `ensureFreeRoomCode`/`roomCodeTaken`
>   (`packages/engine/src/room.ts:414-436`) can't tell the host's OWN ≤5s-old heartbeat
>   (`HOST_HEARTBEAT_INTERVAL_MS=5s`, `HOST_PRESENCE_WINDOW_MS=16s`) from a competing host's, so
>   it would regenerate the reused code too.
> - **Fix design (the FOUNDATION for any host-reload recovery; do BEFORE per-game turn state):**
>   persist the host's room code + a per-host-instance token (sessionStorage or a URL param -
>   host is not the storage-blocked embed case) in HostRoom and reuse them on reload; the host
>   heartbeat carries the token; `roomCodeTaken` treats a ping bearing MY token as free (it's
>   me) while a genuinely different host still regenerates (preserves the anti-hijack fix).
>   SECURITY-SENSITIVE + heartbeat payload shape changes number->{{t,h}} (players read
>   `lastHostPing` from it - keep it number-or-object tolerant). Needs the 4 collision unit
>   tests extended + a real-browser check of BOTH directions (reload keeps code; different host
>   regenerates). Only AFTER this does per-game turn-state recovery (Truth or Share `/x/turn` +
>   a new `/x/show` snapshot of order/results/names/turnIndex; Circuit Cypher rebuild bracket
>   from round-0 inputs + an awards snapshot) make sense - else the recovered host has a new
>   code and no players.
> - Not yet implemented (too security-sensitive to rush). Verified via a prod reload test.

> **POST-DEPLOY GAMEPLAY SMOKE (production safety net, part 3 - sprint complete) (2026-06-26).**
> CI ran tests + typecheck + build then deployed, but NOTHING exercised the real play loop
> over the relay, so a deploy that broke gameplay (the class of bug static checks miss - custom-
> flow show-stoppers, the preview iframe) shipped silently. Now a **`smoke` job** in
> `.github/workflows/deploy.yml` runs AFTER deploy and drives the actual host+player core loop
> against prod (host a VoteBox room -> player joins -> answer -> host advances -> both surfaces
> show results), turning the run red if gameplay is broken.
> - `scripts/smoke-coreloop.mjs` (factored from `playtest.mjs`'s `corePlayLoop`): BASE_URL-
>   parametrized, **timing-robust** (never waits on countdown timers - headless throttles
>   background-tab timers - only host-driven advancement + relay state, 40s waits), **health-
>   gated** (polls `/api/health` so a still-rolling deploy doesn't false-fail), and **retried**
>   (`SMOKE_ATTEMPTS`, default 2) so transient relay flake doesn't red a good deploy while a
>   real break (fails every attempt) still does. It's post-deploy = ALERT, not prevention (no
>   rollback wired); the deploy already happened.
> - **Verified:** ran green against PROD first try (hosted room, player joined, results on both
>   surfaces) - which also confirms live gameplay survived the backups + observability + audit
>   deploys. YAML validated (`check -> build -> deploy -> smoke`); biome lint clean.
> - **Production safety-net sprint DONE** (backups + observability + post-deploy smoke). Next
>   per plan: the operator infra TODOs (Spaces lifecycle rule, block volume + snapshots), then
>   Tier-1 custom-flow host-reload recovery, then the DO Managed Postgres migration (separate
>   project). Plan: `~/.claude/plans/snug-enchanting-glade.md`.

> **OBSERVABILITY / ERROR TRACKING (production safety net, part 2) (2026-06-26).** A
> solo operator was blind to breakage (only GoatCounter pageviews). Now errors are captured
> and visible. Vendor-neutral, no external account, fits the small-deps/self-host ethos.
> - **Core:** `server/utils/observability.ts` = an in-memory ring of recent errors (server +
>   client, capped 200) + last-backup status (mirrors the `rate-limit.ts` module-singleton
>   pattern; per-instance runtime state, never the DB). Optional `DOOT_ERROR_WEBHOOK`
>   forwards a THROTTLED line to any Slack/Discord-style webhook (sends both `text` +
>   `content` so either works); default off = structured stdout logs only.
> - **Capture:** `server/plugins/error-track.ts` hooks Nitro's `error` event and records
>   unhandled 5xx (4xx createErrors are normal control flow, skipped). Client side:
>   `app/plugins/error-track.client.ts` catches `vue:error` / `window error` /
>   `unhandledrejection` (deduped + 3s-throttled, fire-and-forget) -> `POST /api/client-errors`
>   (anonymous, rate-limited via the existing middleware + size-capped, manual validation -
>   zod is NOT an apps/web dep). The backup plugin now records ok/fail into the ring.
> - **Visibility:** `GET /api/admin/status` (admin-gated) + a new **Status tab** in the admin
>   console (`/admin`) showing last backup time/key + recent errors. This also makes "did the
>   backup run?" a glance instead of an SSH.
> - **Verified (runtime, via curl + a clean-DB dev server):** client error -> endpoint ->
>   ring -> admin status round-trips with source/message/stack/context intact; valid->204,
>   invalid->400; admin status 403 for a non-admin, 401 unauth; backup card correctly null in
>   dev (no storage). Gate: 797 tests, `nuxi typecheck` (validates the Nitro hook API + admin
>   route + Vue template), web build, `biome lint` clean. CAVEAT: the server 5xx hook is
>   typecheck-valid + boots clean + shares the proven `recordError` sink, but a LIVE 500 was
>   not forced (no safe trigger without a throwaway prod route); a 400 confirmed correct
>   non-capture. NOTE: in local dev a fresh first account did NOT auto-promote to admin
>   (used `scripts/set-admin.mjs`); pre-existing bootstrap quirk, unrelated, worth a look.
> - **Sprint status:** part 1 backups + part 2 observability done; **part 3 = CI gameplay E2E +
>   post-deploy smoke** next. Plan: `~/.claude/plans/snug-enchanting-glade.md`.

> **AUTOMATED DATABASE BACKUPS (production safety net, part 1) (2026-06-25).** The scariest
> gap from a platform audit: the durable libSQL/SQLite file (`/opt/doot/data/doot.sqlite`,
> which also holds better-auth's accounts + argon2id password hashes) had **no backup** - a
> disk failure lost everything. Now the app self-backs-up to object storage.
> - **Pattern (researched): `VACUUM INTO`, NOT Litestream.** Litestream streams the SQLite
>   `-wal` and shares checkpoint control with the writer, but we run **libSQL** (its own
>   virtual-WAL; Litestream documents no libSQL support; v0.5.6/0.5.7 had a silent
>   replication-loss bug). `VACUUM INTO` runs through libSQL itself = transaction-consistent,
>   zero WAL-format risk. (Revisit Litestream only after a move to plain SQLite/Postgres.)
> - **What shipped:** `server/utils/backup.ts` (`runBackup()` = `VACUUM INTO` -> gzip ->
>   PRIVATE upload to `backups/db/<Y>/<M>/<D>/<stamp>.sqlite.gz`) + `server/plugins/backup.ts`
>   (baseline ~30s after boot, then hourly; single-flight; no-op unless storage configured AND
>   a `file:` DB; `BACKUP_INTERVAL_MS`/`DOOT_BACKUP_DISABLED`). New
>   `uploadPrivateObject()` in `storage.ts` (`x-amz-acl: private` - the backup must NEVER be
>   public; `uploadObject` forces `public-read`). `scripts/restore-db.mjs` (list latest ->
>   download -> gunzip -> `integrity_check` + row counts -> prints swap-in steps) and
>   `scripts/backup-drill.mjs` (offline round-trip proof). `@libsql/client` + `aws4fetch`
>   added as ROOT devDeps so the scripts resolve (they only lived in `apps/web`).
> - **Verified:** the drill (online `VACUUM INTO` + gzip + restore `integrity_check` ok, rows
>   intact); a full e2e against a real MinIO (private PUT, **unauthenticated GET -> 403** so
>   the backup isn't world-readable, signed GET ok, `restore-db.mjs` round-trips it). Gate:
>   797 tests, `pnpm -r typecheck` (incl. `nuxi`), web build, `biome lint` clean.
> - **Owner/infra TODO (documented in `docs/deploy.md`):** add a Spaces lifecycle rule to
>   expire `backups/db/` after N days; move `/opt/doot/data` onto a DO **block volume** +
>   enable volume/droplet snapshots (whole-system secondary net). **NEXT in this sprint:**
>   error tracking + a CI gameplay E2E / post-deploy smoke. **Then (separate project):** the
>   DO Managed Postgres migration (E17) - `.env.example` still advertises Postgres but a
>   `postgres://` URL silently FALLS BACK to SQLite today (now noted in the file).
>   Full plan: `~/.claude/plans/snug-enchanting-glade.md`.

> **EDITOR PREVIEW = TRUE DEVICE VIEWPORTS (iframe-per-preview) (2026-06-25).** Closes the
> caveat the prior device-frame work left open: block views size some fonts in `vw`, which
> resolves to the *window*, so the old transform-scaled previews showed phone text too large.
> Both previews now render inside a real same-origin `<iframe>` whose own viewport equals the
> device width (390 phone / 1280 host), so `vw`/`vh` resolve to the device, pixel-faithful.
> New `apps/web/app/components/PreviewFrame.client.vue`:
> - **Teleports** its slot into the iframe (`<Teleport :to>` a `#doot-root` div in the frame
>   body), so the preview stays in the PARENT Vue tree: reactivity, two-way `modelValue`, and
>   `provideDootRoom` (HostPreview/PlayerPreview's mock room) all keep working; only the DOM
>   nodes live in the frame, where the viewport is correct. (Modern browsers auto-adopt nodes
>   across documents on insert, so this is sound.)
> - **Mirrors** every parent `<style>` + `link[rel=stylesheet]` into the frame head and keeps
>   them in sync (MutationObserver, for HMR / lazy scoped-style injects); links are re-created
>   with their absolute href (the frame base is about:blank). Sets `data-theme` on the frame
>   `<html>` and watches `themeId`, so the theme + its dark `color-scheme` apply live inside
>   the frame (verified across all 6 themes; cyber goes dark).
> - **Self-scales**: renders at logical size, transform-scaled to fit its container; phone is
>   capped at 1:1 (`maxScale`), host fills the 16:9 bezel. The editor no longer computes a
>   scale (`bsScale`/`previewW`/the surface ResizeObserver are gone). `.ed-screen-stage` now
>   fills the frame's 1280x720 viewport; `.ed-phone-device` widened to 412px for a true 390px
>   screen interior.
> - GATE GREEN: **797 unit tests, `pnpm -r typecheck` (incl. strict `nuxi typecheck`), web
>   build**, plus a real-browser smoke (`scripts/preview-frame-smoke.mjs`: proves frame
>   innerWidth === 390/1280 so `vw` resolves to the device; the teleported content + theme
>   render in the frame; clicking an option round-trips `modelValue` back through the
>   teleport; exactly one `#doot-root` (no load-race orphan); 0 editor overflow; 0 console
>   errors) and reviewed phone/host screenshots.
>   LESSONS (each cost real time, both browser-only - static checks were green throughout):
>   1. A ResizeObserver-only measure left the phone frame at 1px (boxH stuck at its 0 init,
>      the RO callback didn't settle in time): the frame must measure its container
>      SYNCHRONOUSLY in onMounted (+ rAF), not rely on the observer alone.
>   2. A `srcdoc` iframe exposes a transient `about:blank` (WITH a `body`, so a body-check
>      passes) before the srcdoc loads - wiring `#doot-root` on mount mounted into a doc the
>      browser then discards, then re-targeted on load. Wire the frame ONLY on `@load` (the
>      listener is bound at element creation, before insertion + before srcdoc navigation, so
>      it can't be missed). Audit confirmed no orphan/dup nodes after the fix.
>   (Pre-existing, NOT from this change: a closed preview-drawer overflows ~61px at the
>   900-1000px breakpoint; identical at HEAD.)

> **EDITOR DRAG + ROOM-CODE COLLISION + RESULTS/TIMER/CONFETTI POLISH (2026-06-25).**
> A second feedback pass. Gate green at ship: **797 unit tests, `pnpm -r typecheck`
> (incl. strict `nuxi typecheck`), web build**, plus a full Playwright visual audit
> (screenshots reviewed for the editor rail/sections, host lobby, guess board + focused
> reveal, player countdown, host + mobile results). What shipped:
> - **Editor: drag-to-reorder rounds + drag in/out of sections.** The rail uses native
>   HTML5 DnD (grip handle + a drop-indicator line; arrows stay for keyboard/touch). A
>   discoverable **"+ Add section"** button sits by "+ Add round". **Sections render as
>   visible container boxes** (tinted, bordered, a "Section" tag + inline-rename name): drag
>   a round onto a section box to put it IN (the box highlights and a live banner reads
>   "Drop into <name>"), or onto a loose round to take it OUT ("Drop here, no section").
>   The drop target is decided by **the round you're hovering** (join its section; a loose
>   round drops loose) - robust and never stuck on the section you started in. The rail
>   **auto-scrolls** while dragging near its edges so offscreen targets are reachable. The
>   round row is its own `RailRound.vue` component (kept out of the editor monolith).
>   [This went through three cuts on 2026-06-25: an invisible header + neighbor rule, then
>   visible boxes with event-bubbling + stopPropagation (drag-OUT was broken: the target
>   got stuck on the start section), then the final hovered-round model + auto-scroll.
>   LESSON: synthetic DragEvents in Playwright did NOT reproduce the real drag-out bug;
>   verify native DnD with real mouse drag (mouse.down + stepped mouse.move) or dragTo.]
> - **Editor preview = real device viewports.** The round preview renders like the actual
>   screens: a **16:9 monitor frame** with the real host stage at 1280x720 (prompt/image
>   left, board right, like GameHost) transform-scaled to fit; and a **390px phone device**
>   (bezel + the player view at true mobile width, scrolling inside). Both honor the
>   Answering/Reveal toggle. Replaces the old `zoom: 0.62` board hack. CAVEAT: the block
>   views size some fonts with `vw` (resolves to the editor window, not the frame), so phone
>   text reads a touch large; pixel-perfect font fidelity would need an `<iframe>` per
>   preview (its own viewport) - not done.
> - **Room-code collision fix (a live bug: a new game hijacked an existing room).** On
>   connect, a host checks the relay for a live host heartbeat on its code
>   (`HOST_PRESENCE_WINDOW_MS`) and **regenerates the code before subscribing/publishing**
>   if one exists, so a new game can never land on someone else's live room. The code is
>   reactive (`RoomSnapshot.code` -> composable `room.code`), so the join code/QR follow
>   the change; ALL host views were swept from `room.runtime.room` to `room.code`. Only
>   the host regenerates (players/audience keep their exact code). 4 engine tests pin the
>   live / free / stale-recycle / players-don't-regenerate cases. `RoomRuntime.room` is
>   now mutable. The regenerate runs after `relay.connect()` and BEFORE `subscribe()`/any
>   publish, and `loadGame` only publishes when already connected (it isn't at host setup),
>   so nothing lands on the old code.
> - **Player timer:** the phone shows the countdown ring when a round is timed, nothing
>   when off (matches the big screen). A light local tick drives it.
> - **Confetti:** fades to 0 and clears its pieces after the fall, so none linger as a
>   "line of fallen confetti" on a scrolling phone results page.
> - **Mobile results polish:** full player names show (wrap, no ellipsis) instead of being
>   cut; the **winner is emphasized** (bigger avatar/name, gold star, accent card); tighter
>   mobile panels; more names shown; join name cap raised 18 -> 24. **Audit fix:** the
>   between-round "standings so far" peek no longer lingers on the final results page (it
>   was gated on round state, which stays 'reveal' after finish; now gated on phase too).

> **CONSUMER POLISH BATCH: authoring + presentation overhaul (2026-06-24).** A large
> feedback-driven pass on how games look and how creators control them, driven by a
> playtester's notes. Gate green at ship: **791 unit tests, `pnpm -r typecheck` (incl.
> the strict `nuxi typecheck`), web build**, plus real-browser smokes (`playtest.mjs`
> core loop + both two-phase flagships + gameshow + draw, `cypher-smoke.mjs`, and
> targeted editor + Mad-Libs-host checks). What shipped:
> - **Guess block:** authored answer layout (`optionLayout` auto/grid/list; auto stacks
>   to one column when answers have pictures or long text), optional A/B/C/D letters
>   (`showLetters`; option pictures grow when letters are off), a **focused reveal** (the
>   correct answer shown large/centered with its count instead of the cramped 4-up board)
>   with an optional separate **`revealImage`**, and the same reveal picture on the phone.
> - **The correct-answer desync bug (real, fixed):** `correct` is an option INDEX, and the
>   schema-form's option reorder/remove never remapped it, so reordering options in the
>   editor silently marked the wrong answer correct (poisoning both the reveal and the
>   leaderboard). Fixed with an identity-based remap (`reindexAfterArrayEdit`) in
>   `SchemaForm`/`SchemaField` that fixes every options+correct block (guess/buzzer/answer/
>   wager/cellar). Unit-tested.
> - **Info slide / title:** `layout` (side vs banner, banner centers the picture on top)
>   and `showOnPhone` (mirror to phones or show a plain "watch the big screen" card).
> - **Fill (Mad Libs) host** redesigned from a lone number into a stage-filling view (the
>   blanks as chips = the story's shape, no spoilers, plus a big live count). Phone fill
>   inputs enlarged.
> - **Results:** the top-rated award now names the thing by its **prompt** (not "Round N")
>   and carries its **image** (shown large on the big screen); per-round **`inResults`**
>   to keep a round off the final board; author-set **results section order**
>   (`settings.resultsOrder`, what shows first); per-round **`showStandings`** to suppress
>   the between-round "standings so far"; and **combine-ratings**: a named section flagged
>   `combineRatings` rolls its rate rounds into one ranked breakdown.
> - **Editor (kept out of the monolith):** click-to-retitle rounds (`name`), **named
>   sections** (groups, with rail headers), a per-round options panel, and a **Game
>   Settings** panel (authored play defaults + results order), extracted into new isolated
>   components `RoundOptions.vue` + `GameSettingsPanel.vue` (the DeckManager/RoundBindings
>   pattern). The preview now has an **Answering/Reveal** toggle so authors can see the
>   reveal moment (it synthesizes the block's own `answerOf`/`revealSummary`/`PlayerReveal`).
> - **Host:** the 8 lobby toggles moved to **authored Create-side defaults** that seed a
>   **slimmed lobby** (join code, roster, who-drives, Start) with a collapsible "Adjust for
>   tonight" for live overrides. **Untimed rounds auto-open** (no pointless "Open voting"
>   click when there's no clock to start fairly). **"First to join drives" now defaults
>   off** (generic + circuit-cypher + open-mic).
> - **Data model (additive):** `RoundInstance.{name,group,inResults,showStandings}`,
>   `GameComposition.{groups,settings}`, `GameSettings`, `GroupDef`, `ResultsSection`,
>   `AwardCard.image`. Stored inside the existing JSON config blob, so **NO DB migration**.
>   The save boundary (`gameInputSchema` in `games-repo.ts`) + `SavedConfig` were extended
>   so the fields survive save (a plain Zod object strips unknown keys, unit-tested).
> - **TWO bugs the static gate missed, caught in audit + fixed:**
>   1. **`resolveComposition` dropped the new fields.** Every hosted game passes through it;
>      it reconstructed deck-backed rounds as `{block,content,from}` and returned only
>      `{title,rounds}`, throwing away config-level `groups`/`settings` and round metadata,
>      which would have made combine/inResults/showStandings/settings silently no-op for
>      EVERY game. Fixed to preserve round metadata + config groups/settings (regression
>      tested). LESSON: `resolveComposition` strips any field it doesn't explicitly carry.
>   2. **`revealImage` answer leak.** It was published in the redacted config before the
>      reveal (it can BE the answer). Now stripped in `guess.redactContent` + `REDACTION_
>      RULES` and delivered via the reveal summary at reveal only. Question image + options
>      stay (shown during play). LESSON: adding a second secret field to an already-listed
>      REDACTION_RULES block is NOT caught by the sync test, you must add it by hand.
> - **Custom-flow games unaffected** (they own Host/Player/Results); the only change there
>   is the intended first-to-join flip (cypher re-verified by its own smoke, incl. co-host
>   driving). Existing saved games with none of the new fields behave identically (every
>   field defaults to the old behavior).

> **PIT PARTY AUDIT PASS 2: MERGED to `main` + DEPLOYED (2026-06-12, commit `0b53f4c`,
> fast-forwarded from `pit-party-polish-2`; gate green at ship).** The headline find: the
> centripetal Catmull-Rom in `sim/track.ts` had WRONG Barry-Goldman weights (b1/b2 divided
> by single knot intervals instead of t2-t0 / t3-t1), so the spline was not C1 and the road
> kinked at every control point - the actual root cause of the "janky road paths" and the
> Sprue wall-judder symptom patched earlier. Fixed, and all 5 courses were re-authored on
> the correct spline (neon is now a true CITY STREET circuit: avenues + cross streets +
> collidable tower-block canyons + street lamps + sign gantries; ember's old layout
> self-overlapped; prism is all wide sweepers since a void course should never demand a
> hairpin). Sim fixes found by a new all-CPU race probe: prism races NEVER ended (CPUs fell
> at the same bend forever while fall-respawn loops inflated `progress`, which also broke
> ranking); now respawn charges the lost distance back, stuck CPUs get rescued to their
> last gate after 18s, and the AI reads the bend ahead to slow IN ADVANCE (leader pace went
> from 5-8 u/s wall-grinding to 20-33 u/s). logic.test.ts (26 tests) now pins: C1
> continuity + min turn radius per map, props fully off-road with SCALED collision radii,
> all-CPU races finishing on every course at pace, fall progress charge-back, and the
> stuck-CPU rescue. `track-viz.test.ts` is a map-authoring dev tool (SVG + curvature dump
> to /tmp). Polish: shared colour-coded item icons (`items-art.ts`) on host + phone, '?'
> item boxes, leader item roll skews defensive, faster wrench; select grid greys out
> TAKEN drivers (roster byPid + host first-come-first-served); standings ladder on 1-2 pane
> races; minimap finish tick; mid-race joiners see "race in progress" and get seated during
> the finish screen (cups no longer strand them); speed-aware chase cam; engine-drone
> crowd ducking + race music lowered; portraits redrawn with vignettes/shading/signature
> details; small driver-model accents; results chip no longer covers the name. The smoke
> (`scripts/pit-party-smoke.mjs`) now drives a FULL race to the results screen via a
> dev-only `window.__pitRace` handle (steering assist on the kb kart), screenshots
> lobby/select/count/HUD/drive/results to /tmp, asserts 8 placed finishers, and verifies a
> 3-race cup advances course (PP_QUICK=1 for the short run). Gate at commit: 776 unit
> tests, `pnpm -r typecheck` clean, web build green, smoke PASS. NOTE for headless smoke
> work: a backgrounded tab throttles rAF (the sim clock), and SwiftShader dilates sim time
> vs wall time on big viewports - keep the host tab foregrounded and the viewport modest.
> STILL OUTSTANDING: real-phone controller feel pass, audio balance check on real
> speakers, run-on-phone netcode (deferred), TURN for the stream copy, deck-feedable
> course/character packs.

> **PIT PARTY: SHIPPED + DEPLOYED to prod (2026-06-12/13).** The kart racer below was
> committed (`1a41bcc`) and deployed, then a playtest-driven polish pass (`bfeeb30`) shipped
> on top. Both deploys green. Live at doot.games/host/pit-party, featured-eligible (flagship +
> buildConfig). Full gate stays green (771 tests incl. 17 pit-party sim tests, `pnpm -r
> typecheck` 0 errors, web build). **A real-browser smoke now exists: `scripts/pit-party-smoke.mjs`
> (run `pnpm dev`, then `node scripts/pit-party-smoke.mjs`) drives host+phone through a full
> race and screenshots the controller/select to /tmp.** Polish pass (`bfeeb30`) fixed, all from
> live playtest:
> - **Controller rebuilt** with the `@doot-games/ui` kit (dished Thumbstick + rounded-rect
>   PadButtons themed to the KERF palette via CSS-var overrides on the pad root). Default scheme
>   is now **joystick** (push up to accelerate); STICK/WHEEL/AUTO toggle. The old one was ugly.
> - **Inverted steering fixed:** the chase cam looks down +z, mirroring world +x to screen-LEFT,
>   so `Host.vue` negates the human steer input (`k.input.steer = -d.input.s`); AI is untouched.
> - **GO overlay no longer sticks** on phones (host was sending countdown `c=0` for the whole
>   race; now gated to the `goFlash` window + phone auto-hide).
> - **Results screen** redesigned compact (two columns race+cup, small square chips, fits screen).
> - **Cart previews** (side-view silhouettes, `carts/preview.ts`) in the phone picker; **keyboard
>   driver** can pick driver/kart with arrows + a control legend; **copy-join-link** button on the
>   host lobby; **selecting a course in the lobby rebuilds the 3D preview**; **Sprue/walled-course
>   jank fixed** (the rail response stopped per-frame heading judder); **cover art redesigned**.
> - **REMAINING / next polish targets:** run-on-phone netcode (still deferred); TURN for the
>   stream copy; a deck-feedable course/character pack; per-race course pick in a cup (today it
>   auto-advances `MAPS`); the parked block is local to the folder (deliberate isolation, not in
>   `blocks/`); tune kart feel + AI difficulty on real hardware; verify the controller on real
>   phones (only headless-smoke-verified).

> **AUDIT PASS + 3 NEW CHARACTERS + QUIZ-OR-DIE TTS FIX (2026-06-12, folded into the deploy
> above; superseded by the SHIPPED note).**
> - **Pit Party audit fixes:** the Vue<->relay glue bugs are fixed - a phone's driver/kart
>   pick can no longer be dropped by the join-poll race (syncDrivers runs before subscribe +
>   the pick handler creates the driver if missing + seats are always published); the phone no
>   longer has its live selection overwritten by a seat echo (only adopts char/cart when
>   `locked`); a phone that drops mid-race hands its kart to a CPU and reclaims it on reconnect
>   (`handToCpu`/`seatHuman` via `lastSeen`, previously dead code); the spectator stream now
>   carries the host's music+SFX (`PitAudio.getAudioStream`); item-fire is rising-edge (no
>   retained-replay phantom); the big screen flashes GO; the `viewerCount` emoji is gone; dead
>   code removed (vec helpers, Race debug methods, the unused coin economy); description
>   shortened. 5 new sim tests (drift mini-turbo tiers + payout, collision mass asymmetry, item
>   volt/triple/boost). NO em-dashes or emojis anywhere in the game (swept).
> - **3 new characters (now 9):** KELZO (green-haired harlequin jester), JAIRA (red spotted
>   toadstool), PEACHO (pink-haired peach sprite) - punny names off the owner's references; 3D
>   driver builders + 2D portraits added; CPU pools auto-include them via `CHARACTER_IDS`.
> - **Quiz or Die TTS:** root cause of "still not speaking words in Chrome" was a PERMANENT
>   latch - a cold start (voices not loaded for the first line) dropped the whole session to the
>   synth blip-voice forever. Now recoverable + cold-start-safe (new `hasVoices()` gate; OS
>   speech retried every 4th line; misses only count once voices exist). See memory
>   `doot-tts-cast-architecture`. No new dependency (sam-js/meSpeak are license-unsafe for prod).

> **BUILT + FULL GATE GREEN (not yet committed/deployed): PIT PARTY, a split-screen kart
> Grand Prix flagship (2026-06-12).** A new full-custom flagship game adapted from the owner's
> `kerf`/`tiller` Three.js prototype. One big screen runs a 3D kart race; phones are the
> controllers (Doot's second-screen thesis); up to 4 humans drive split-screen, CPUs fill the
> grid to 8; remote folks watch via the WebRTC spectator stream. Lives entirely in
> `packages/games/src/games/pit-party/` (37 files, ~7.4k LOC), built in isolation. Gate:
> `pnpm test` (766, incl. 12 new pit-party sim tests), `pnpm -r typecheck` (0 errors, incl. the
> strict apps/web `noUncheckedIndexedAccess` pass), and `pnpm --filter @doot-games/web build`
> all green. The high-value facts:
> - **ARCHITECTURE = pure sim + Three renderer + Vue/CLASP shell, cleanly split.** `sim/`
>   (vec, track baker, physics, items, ai, race orchestrator, standings) is Three-free,
>   deterministic, fixed-step, and unit-tested via `logic.ts` — so it could later run headless
>   for authoritative netcode. `engine/` lazy-imports `three` client-only (mirrors
>   `RapBattleStage`; `three` was already a ui dep, now also a games dep) and mirrors sim state
>   into meshes, rendering 1-4 split-screen scissor panes. `Host.vue` owns the sim + rAF loop +
>   CLASP host + lobby/select/race/GP-results UI; `Player.vue` is the phone controller;
>   `Audience.vue` is the spectator viewer. Data is modular: `maps/` (5 courses as pure data),
>   `carts/` + `characters/` (Mario-Kart driver+vehicle stat model, `roster.ts` blends them).
> - **RESEARCH-BACKED gameplay.** Centripetal Catmull-Rom track bake -> arc-length-even samples;
>   ordered-checkpoint + monotonic-progress lap counting that can't be cheated by reversing
>   (tested); clamp-to-segment wall slide + circle obstacle collision (so the cactus you SEE is
>   the one you HIT — the prototype's cacti had no collision); 3-tier drift mini-turbo;
>   distance-from-leader item weighting (leaders get defensive, trailers get catch-up — tested);
>   pure-pursuit + patented rubber-band AI; MK8 points table + cumulative cup standings w/
>   tiebreaks. 5 courses (kiln/sprue/prism ported + fleshed out, NEON OVERPASS + EMBER WORKS new).
> - **CONTROLS = 3 schemes the player picks** (touch racing has no single standard): Auto-drive
>   (auto-accelerate, just steer+drift+item — the casual mobile-kart default), Joystick (left
>   stick steers + push-up accelerates, frees the other thumb — the owner's idea), Wheel+pedals
>   (TILLER classic). New REUSABLE `SteeringWheel.vue` added to the `@doot-games/ui` controller
>   kit (kit style, emits the logical-input `axis` event). Optional watch-stream overlay behind
>   the controls.
> - **AUDIO.** New reusable `Sampler` (`packages/ui/src/audio/sampler.ts`, cast-safe Web Audio
>   buffer + music player) any game can use. Pit Party keeps the prototype's synth engine drone +
>   SFX (dynamic, tied to sim state) and adds LICENSED music (menu/race/podium loops) + marquee
>   one-shots (GO / win / crash) transcoded small (~2.8MB total) into `apps/web/public/pit-party/
>   audio/`. **The owner confirmed they have rights to the RacingMusicPack + FREE CAR SFX pack;
>   re-confirm before any redistribution.**
> - **COVER ART:** bespoke night pit-lane cover generated (`scripts/gen-covers.mjs pit-party` ->
>   `public/covers/pit-party.jpg`, registered in `FLAGSHIP_COVERS`).
> - **WHAT REMAINS:** (1) **commit + deploy** (working tree only so far). (2) **Run-on-phone /
>   handheld mode** — the deferred netcode (host broadcasts ~20Hz authoritative world-state
>   snapshots, phones render their own kart with interpolation + client prediction; the research
>   brief + the headless-capable pure sim are the foundation). (3) **TURN for pit-party's stream**
>   — its `stream.ts` is a self-contained copy of retro-arcade's, so it's STUN-only until the app
>   `rtc.client.ts` plugin also calls pit-party's `setRtcConfig` (one line; consider extracting
>   the shared stream module to avoid the duplication). (4) **Real-device + multi-phone playtest**
>   (build verified, not yet driven on hardware). (5) deck-feedable course/character packs;
>   host-plugged gamepad drivers (kit `createGamepadBridge` makes this easy); per-race course
>   pick for the cup (today it auto-advances the course list).

> **SHIPPED + DEPLOYED + HEAVILY POLISHED: Retro Arcade (the emulator flagship), the
> controller kit, the Bubblegum theme, and CLASP-signaled WebRTC spectator streaming
> (2026-06-11 -> 06-12, on `main`, last commit `b1229d5`).** Doot now hosts ANY ROM on the
> big screen via EmulatorJS while phones (and gamepads plugged into the host) act as the
> controllers over the relay's `/x/` channels; spectators can watch by room code. It is the
> **featured game on /explore and the first flagship on the homepage** (`explore.vue`
> `FEATURED_ID='retro-arcade'`; `index.vue` `FLAGSHIP_LEAD` leads with it). The deep detail
> lives in the memory notes `doot-controller-kit-arcade` and `doot-clasp-webrtc-streaming`;
> the high-value facts:
> - **THREE PACKAGES.** (1) `@doot-games/ui` controller kit: `DPad`, `Thumbstick`,
>   `ActionCluster`, `PadButton`, `Bumper`, `Buzzer`, `ControllerPad`, `GamepadMapper`,
>   plus a pure-TS lib in `packages/ui/src/controllers/` (a LOGICAL-input contract unifying
>   touch + gamepad, a target-agnostic `ControllerLayout` schema + presets, `createGamepadBridge`).
>   (2) the **Bubblegum** theme (6th pack). (3) the `retro-arcade` custom-flow flagship in
>   `packages/games/src/games/retro-arcade/` (`Host.vue` big-screen emulator + `Player.vue`
>   phone controller + `Audience.vue` spectator stream + `logic.ts` the pure tested console
>   mapping + `emulator.ts` EmulatorJS loader + `stream.ts` WebRTC + `layouts.ts`).
> - **THE CONTROLLER DESIGN SYSTEM is `~/Downloads/doot-controller-kit.html`** (the owner's
>   canonical reference, NOT the emulator prototype). Its language: thick dark border + a
>   HARD offset shadow (`var(--shadow)`) + press-down; the thumbstick is a dished well with a
>   dashed range-ring and an accent glossy nub; face buttons are bold colored circles. The
>   kit was brought to this spec this session (it had drifted to faint borders / small shadows).
> - **THE C-BUTTON BUG (was DEAD on prod, now fixed, `4a4a09d`):** N64 C-buttons map to
>   EmulatorJS indices 20-23, which are the RIGHT ANALOG STICK axes, not digital buttons.
>   `applyDigital` sent value `1` (a ~0.003% stick nudge the core ignored). Fix: `simValueFor`
>   sends the full-scale `0x7fff` for any analog-axis index. Lesson recorded: a passing
>   input-plumbing smoke (press reaches `simulateInput`) does NOT prove the VALUE is right.
> - **This session's polish (commits `17c02b0`->`b1229d5`):** the controller is a `100dvh`
>   flex-fill pad (no transform auto-fit) faithful to the prototype `#pad`; N64 right hand
>   corrected (C-diamond over A/B); the analog stick leads with the d-pad tucked inboard;
>   the **squish bug** fixed (controls were `flex-shrink:1` and squashed out of square; now
>   `flex:0 0 auto` so they keep aspect and the fit-cap scales them); a **button-size control**
>   that caps to what fits (measured with transform-aware `getBoundingClientRect` vs the body
>   box, so the Sega arc / d-pad shift can't clip undetected); a real **portrait layout**
>   (controls bottom, stream floats on top); the **Sega 6-button** reworked into two arced
>   vibrant rows; the **host** decluttered (resizable screen that SHRINKS to keep the QR
>   beside it, a compact P1-P4 seat strip, a lean join card with Copy-link, a Swap-ROM
>   modal, a clear loaded-ROM state + a populated URL field for `?rom=&core=` deep links);
>   auto-broadcast (the stream arms at boot, captures on first viewer, no manual toggle); a
>   dedicated **Watch** toggle in the controller top bar; the join-page "Just watch" shows
>   the live stream (`GameComponents.Audience` seam).
> - **AUDIT (this session, `b1229d5`):** two deep code reviews + an empirical clip sweep.
>   Input/mapping: CLEAN (every console's layout ids resolve; gamepad right-stick drives C-
>   buttons; PSX dual-stick bases 16/20 with no collision). Fixed 5 lifecycle/CSS issues:
>   transform-blind fit-cap (now rect-based), gamepad remap not reloaded on console hot-swap,
>   black stream after rotating mid-watch (nextTick re-attach), double-tap viewer leak, and
>   relay `onExtra` not unsubscribed on unmount.
> - **INFRA NOTE:** the site sets COOP but NOT COEP (not cross-origin isolated), so EmulatorJS
>   uses NON-THREADED cores (N64/PSX still run, no SharedArrayBuffer). WebRTC is host-fanout
>   mesh ~5-15 viewers; ICE defaults to Google's full public STUN set (TURN optional, off).
>   The CSP/permissions denials are only on `plugins.doot.games`, not `doot.games`.
> - **GATE at ship:** 752 unit tests (incl. `simValueFor` + `logic.test` mapping), all
>   typechecks, web build, and `scripts/retro-arcade-smoke.mjs` (input wiring + C-up full-scale
>   + size-XL-grows-and-fits + square-aspect-no-squish + hot-swap + no-clip) +
>   `scripts/retro-arcade-stream-smoke.mjs` (WebRTC signaling + ICE + track over the relay).
> - **STREAM AUDIO: DONE (`2f19fc0`), then AUDIT-HARDENED (`7f080f6`).** EmulatorJS plays
>   through Web Audio, so `emulator.ts` patches `AudioNode.connect` (like the WebGL
>   `preserveDrawingBuffer` patch) to fork everything routed to the context destination into a
>   `MediaStreamAudioDestinationNode` (`getAudioStream`); the host folds that audio track in
>   alongside the canvas video. Viewers start muted (autoplay rules) and unmute from a tap
>   (`setMuted`; Sound toggle on `/watch`, the Audience view, AND the in-game watch overlay for
>   remote play). **Audit (an adversarial review) caught two High bugs the smoke missed and they
>   are FIXED:** (1) a viewer who joined BEFORE the game made sound never got audio (the track
>   was added to the shared stream but not to the already-negotiated peer, no renegotiation) -
>   now every peer gets an audio m-line up front (track or an empty `sendonly` transceiver) and
>   a 1.5s `syncPeers` loop fills it via `replaceTrack`; (2) a ROM hot-swap froze the stream
>   (the cached captureStream track stays 'live' on the detached old canvas) - `ensureStream`
>   now recaptures when the canvas object changes and `replaceTrack`s the fresh video+audio onto
>   all peers. The stream smoke now routes audio AFTER the viewer joins and asserts audio packets
>   actually flow (getStats), not just that a track exists. The real device pass confirmed the
>   controller path works on phones.
> - **TURN: WIRED, needs a server (`2f19fc0`).** CLASP is signaling-only (not a TURN server),
>   so the ICE config is now configurable: `setRtcConfig` appends a TURN relay to the STUN
>   default, set once from runtime env by `apps/web/app/plugins/rtc.client.ts`
>   (`NUXT_PUBLIC_TURN_URL` (comma-separated ok) / `_TURN_USERNAME` / `_TURN_CREDENTIAL`),
>   default STUN-only. To turn it on: provision a coturn server, set the env on the droplet,
>   recreate the app. Documented in `docs/deploy.md` + `.env.example`. No code redeploy needed.
> - **WHAT REMAINS (Retro Arcade):** (1) **deploy a coturn server** + set the TURN env (the
>   plumbing is done; only the server + credentials remain, when hard-NAT viewers show up);
>   (2) **cross-theme controller borders** (light themes bubblegum/cutesie render soft borders
>   vs the design system's always-dark - decide whether the controller forces a bold border
>   regardless of theme); (3) per-route **COEP** to unlock threaded N64/PSX cores; (4) test
>   hardening: assert layout-id->touchIndex coverage in `logic.test.ts` (today verified by
>   hand). FUTURE (not scheduled): a custom-controller builder (author `ControllerLayout` JSON)
>   and a personal ROM library + publish-your-ROM.

> **SHIPPED: cover art for the LAST 12 flagships (2026-06-09, `6064219`, deployed green
> in 3m27s).** Every Game From Doot now has real art: `scripts/gen-covers.mjs` gained 12
> more bespoke worlds (quip-clash fight bill, mad-libs ransom note, split-room modernist
> poster, fib-finder tabloid, sketch-spot gallery wall, what-you-didnt-know CRT
> television, backronym stenciled crate, hivemind honeycomb, most-likely yearbook,
> ballpark night stadium, faker masquerade, truth-or-share polaroid wall), registered in
> the shared `FLAGSHIP_COVERS` (packages/ui/src/covers.ts). Verified at every layer:
> all 28 flagship covers on /explore (0 broken, 0 errors, 0 overflow), gate green (703
> tests, typechecks, build), and POST-DEPLOY ON PROD: the 12 JPEGs serve 200 from
> doot.games/covers/ and game pages SSR an absolute `og:image` pointing at them
> (checked on /game/faker, /game/mad-libs, /game/ballpark), so shared links unfurl with
> the art. HOW COVERS WORK: static JPEGs committed under apps/web/public/covers,
> rendered OFFLINE by the script (never at page load); creator games instead upload via
> the MCP base64 `upload_image` + the FORMAT_GUIDE's COVER ART rules. GOTCHA: re-running
> the generator re-encodes JPEGs with byte-level differences, so after art changes only
> commit the ids you actually changed (restore the rest from git).
> **Next (per plan §8):** Quick Draw (the streaming game; transport spike first),
> survey two-phase, custom prompt packs via share code.

> **SHIPPED: MCP art + design guides, base64 upload, and 13 game covers (2026-06-09,
> merged to `main` from `polish-audit` and deployed).** Three pieces, audited (a 7-angle
> code review; fixes applied: upload_image schema `minProperties`, restored min-width
> guidance, lazy-loaded cover images, the cover map deduped into the shared
> `packages/ui/src/covers.ts` `FLAGSHIP_COVERS`, type-set sync comments):
> (1) the MCP FORMAT_GUIDE gained a "WHAT MAKES A PARTY GAME FUN" design-science
> section and a "COVER ART (make it, don't search for it)" guide with crop-safe composition
> rules (mirrored into docs/markdown-games.md + docs/connect-claude.md); (2) `upload_image`
> now accepts base64 `data` (a bare string or data: URI) alongside `url`, decoded +
> size-capped (5MB) with the type read from MAGIC BYTES (`decodeImageData`/`sniffImageType`
> in server/utils/fetch-image.ts, unit-tested; vitest now includes apps/web/server); (3)
> `scripts/gen-covers.mjs` renders cover art (1280x720 @2x JPEG) for the 13 flagships that
> showed the squared-grid placeholder (type-the-answer, would-you-rather, tier-list,
> over-under, categories, survey, spectrum, wager, story-chain, doodle-chain, wavelength,
> bingo, call-it), registered ONCE in `packages/ui/src/covers.ts` (`FLAGSHIP_COVERS`,
> imported by GameCover.vue AND useSeo.ts so cards and og:image can never drift).
> ART DIRECTION (the owner's bar, set by the luggage-label /
> enameled-die / desert-dusk custom-game covers): every game gets its OWN world (a
> typewriter desk, a carnival, an awards gala, a casino, a chalkboard, a 70s game show, a
> parchment storybook, a corkboard, a deco radio, a bingo parlor, a stadium), with period
> typography and one dimensional emblem; never one template with swapped props. That rule
> is codified in the FORMAT_GUIDE's COVER ART section. Gate: 703 unit tests, all
> typechecks, web build, /explore renders all covers with 0 errors and 0 overflow at
> 1440px. The covers ship as static assets in apps/web/public/covers and were verified live on prod after the deploy.

> **SHIPPED: the deep-audit polish pass is on `main` and deployed (2026-06-09).** A full
> repo/app/engine audit (TTS reliability + casting, round-stage sound feedback, crowded vote
> galleries, a11y, copy rules) and its four fix slices, merged from `polish-audit`. Gate at
> ship: 696 unit tests, all typechecks, web build, and these smokes green: answer, bingo,
> call-it, cypher, qod, own-answer, crowd-vote, split-crowd, the new vote-read, plus the
> headed cypher-tts-verify (real voices all spoke). No DB change. One real-device check
> remains for the owner: cast to a TV and confirm the Synth vox voice mode is audible. Dated
> entry below ("Deep audit polish pass"). Remaining §8 work: **Quick Draw** (the big
> streaming game), **survey two-phase**, **custom prompt packs via share code**.

> **SHIPPED: Bingo + Call It is on `main` and DEPLOYED (2026-06-09).** The two custom-flow
> games were committed (`d025684`), merged to `main`, and pushed; the CI deploy ran green and
> the post-ship gate (681 unit tests, typechecks, web build, both browser smokes) is green on
> `main`. The `bingo-call-it` branch points at the same commit. Full dated entry below.
> Remaining §8 work: **Quick Draw** (the big streaming game), **survey two-phase**, **custom
> prompt packs via share code**.

> **Deep audit polish pass (2026-06-09, branch `polish-audit`).** A six-agent audit of every
> block, game, and shell surface (player experience, stage feedback, TTS, layout, rules), then
> four verified fix slices:
> - **TTS reliability + casting.** Root cause of "no TTS on the TV": `speechSynthesis` renders
>   OUTSIDE the tab's audio pipeline, so tab casting / screen share never carries it; only Web
>   Audio travels with a cast. New cast-safe **robot vox** (`packages/ui/src/audio/vox.ts`):
>   syllable formant blips paced by the text with word callbacks for karaoke, pure tested
>   `voxPlan`. Circuit Cypher + Open Mic gain a lobby "voice engine" picker (device speech /
>   synth vox, with cast guidance) and AUTO-fall back to the vox when device speech proves
>   silent; Quiz or Die's existing synth fallback now cancels the dead OS queue first (no
>   overlap), goes sticky after two failures, and labels synth "(casts)". `speech.ts` hardened:
>   voice assignment cached (no mid-show robot voice swap) and invalidated on `voiceschanged`,
>   `visibilitychange` resume for suspended tabs, and a `speechLooksSilent()` health signal
>   (two consecutive never-started utterances). Headed `cypher-tts-verify` still green.
> - **Vote galleries fit + read time.** Judge rounds (vote/fibvote/drawvote/photovote/split)
>   now SCALE their timer to the derived gallery via shared pure `blocks/timing.ts
>   scaleReadTimer` (~15 chars/sec beyond the base budget, 2s per image past 4, capped +45s;
>   untimed stays untimed). New engine seam `LoadedGame.timerFor(index, runtimeContent)`
>   (room.ts `openVoting`) + `buildTimerFor` (runtime/derive.ts), wired in HostRoom +
>   SessionHostRoom, so the deadline, the ring, and the phones agree (engine-tested).
>   VoteHost/FibHost go two-column "dense" with tighter type at >4 options or long stories,
>   with a 76vh scroll cap. New `scripts/vote-read-smoke.mjs` (5 players, long mad-libs fills:
>   countdown opened at 75s, dense 2-col, 0 overflow at 1440px/390px).
> - **Stage SFX.** New `packages/ui/src/audio/stage.ts` + GameHost wiring: join pop, lock-in
>   click, "everyone's in" chime, ticks over the last 5s, time's-up drop, reveal sting,
>   results fanfare. Synthesized Web Audio (casts with the tab), armed on a lobby tap/Start,
>   "Sound effects on this screen" lobby toggle, host screen only.
> - **A11y + polish + rules.** GamePlayer's `aria-live` wrapper (which swapped whole subtrees,
>   announcing nothing) replaced by ONE persistent visually-hidden `role="status"` stage line;
>   the four v-if'd `aria-live` empty-notes (vote/split/mostlikely/accuse players) are now
>   always-mounted status regions; a visible lock-in check + "Round X of Y" on the phone; Quiz
>   or Die reveal pairs color with a CORRECT tag + strikethrough (colorblind-safe); phones now
>   get the results confetti; Call It result shows the room's pick spread (the tally already
>   rode the result call); Bingo claim safety timer 4s -> 8s; CC vote tally gained a live
>   region; em dash/glyph copy cleanup (quiz cellar line, placeholder dashes, RemixWithDeck
>   title, RoomTicket "Copied!", quiz Skip entity).
> - **Audit findings rejected as false positives** (so they are not re-chased): spotlight is a
>   parked block by design; reconnect-by-name is the identity model, not a flaw; Open Mic's
>   stacked watchdog timers are idempotent; the results carousel already has a page indicator;
>   Hivemind's counter live region is always mounted.
> - **Verified:** 696 unit tests (+15: voxPlan, scaleReadTimer, engine timerFor), all
>   typechecks, web build, and the smoke battery above. No DB change.
> - **Remaining from the audit (deliberately deferred):** an untimed option for Circuit
>   Cypher's live-perform mode; per-round timer overrides in the host UI; Truth or Share photo
>   preview before send; richer per-block reveal announcements on the phone status line.

> **SHIPPED: the expansion-plan work is MERGED to `main` and DEPLOYED (2026-06-09).** The
> `expansion-p1-answer-caption` work (43 commits) fast-forward-merged to `main` and pushed,
> which triggered the prod deploy. It was held on the branch until the plan reached
> completeness, then audited (full gate + all ~18 browser smokes green, README made a proper
> README, zero DB-schema changes so no migration risk) and shipped. **Continuing this work:**
> branch from `main`; the plan is `docs/expansion-plan.md`; the gate is `pnpm test && pnpm -r
> typecheck && pnpm --filter @doot-games/web build`; browser smokes live in `scripts/*-smoke.mjs`
> (run one with `pnpm dev` in another shell, then `node scripts/<x>-smoke.mjs`). What shipped,
> implementing `docs/expansion-plan.md`:
> - **Primitives:** P1 text-match · P5 Teams · P3 live standings · P4 Phase A audience tier.
> - **New games/blocks:** answer + Type the Answer · caption (quip image) · Would You
>   Rather · Tier List · Over/Under · Categories (Scattergories) · Survey (Family Feud) ·
>   Spectrum (consensus dial) · Wager (bet-a-tier trivia). Catalog now ~31 games.
>   P4 audience tier: A (watch + standings) AND B (vote as a capped crowd bloc - polls always,
>   plus scored vote/fibvote/split behind a host toggle).
> - **Content/UI:** audio-clip support (AudioClip) · SpectrumDial · StandingsPeek.
> - **§4.3 Sessions COMPLETE:** engine `nextGame` + the SessionHostRoom orchestrator +
>   durable playlists (table/repo/API + /host/playlist/[id] + /playlists).
> - **Engine primitives:** §4.3 Sessions (`nextGame`) · **P7 Pipeline foundation**
>   (per-player content derived from a PRIOR round's inputs - `AssignContext.sources` +
>   `assignContent(index, inputsFor)` + the pure chain helpers in `runtime/chain.ts`) ·
>   **Story Chain** (text telephone) + **Doodle Chain** (Gartic Phone, Pixi draw rounds)
>   both on that foundation · a generic `components.Results` seam (the renderer honors a
>   game's custom results view) + a `ResultsFragment.recap` passthrough · **Wavelength** (the
>   clue-giver dial - the first game using the foundation in a JUDGE round). Catalog now ~34 games.
> - **Tests:** ~681 unit + ~18 browser smokes (answer, audience, audience-vote, audio,
>   bingo, call-it, categories, crowd-vote, doodlechain, quickwins, spectrum, split-crowd,
>   standings, storychain, survey, teams, wavelength, session, playlists, wager).
> - **Bingo + Call It - DONE (2026-06-09, shipped to `main` as `d025684`).** Two
>   custom-flow party games for a room with a screen up front. Bingo: every player gets a
>   UNIQUE card dealt by a pure seeded function (`buildCard(room, pid, pool)` - no relay write,
>   reconnect-safe), the host calls items live off the big screen, players mark, and the first
>   to a line claims a bingo the host VERIFIES (re-derives the claimant's card + checks it
>   against what was called, so a tampered phone can't win). Call It: host poses a live
>   prediction (prompt + 2-4 options), the room picks, the host taps the real outcome, correct
>   callers score, and the board rolls across as many calls as the host wants. Both over the
>   proven `/x/` transport (no engine change); pure tested logic; excluded from Sessions/picker
>   (they ship `components`). Catalog now ~36 games. Dated entry below.
> - **REMAINING (now post-ship, per §8):** **Quick Draw** (real-time stroke streaming - the
>   big §5 custom-flow game; reuses the Pixi `DrawCanvas` + a `/x/strokes` channel + P1 fuzzy
>   matching + speed scoring) · **survey two-phase** (a board clustered from the room's own
>   answers) · **custom prompt packs via share code** (would also make Bingo + Call It
>   deck-feedable, today they ship built-in packs/starters only). Detailed dated entries below.

> _Deploy note: the Docker base image is now **digest-pinned** (`docker/Dockerfile`, a
> `NODE_IMAGE` ARG), so a surprise upstream `node:22-alpine` tag change can't silently alter
> or break a deploy._

> **Bingo + Call It - two custom-flow games for a room with a screen (2026-06-09).** SHIPPED
> to `main` (`d025684`, deployed). Both follow the proven Truth or Share /
> Circuit Cypher custom-flow pattern: a parked block gives the engine a round to sit on while a
> custom Host + Player drive the whole show over the relay's `/x/` channels; all win/score math
> is pure, tested `logic.ts`; both ship `components`, so they're auto-excluded from Sessions +
> the picker (`nextGame` only resets the engine, not `/x/` state).
> - **Bingo** (`games/bingo/`, block `blocks/bingo/`): the per-player card is NOT secret, so it
>   needs no `assignContent`/relay routing - each phone deals its own card with a pure seeded
>   function `buildCard(room, pid, pool, size)` (sizes 3/4/5, free center on odd), so it is
>   identical on every client and survives reconnect with zero relay writes. Cells **auto-mark**
>   from the retained `/x/calls` (a cell is covered iff its item was called), so the whole phone
>   surface is reconnect-safe by construction (no local mark state to lose) and there's no
>   tap-the-tiny-cell race; the player's one action is to claim BINGO when a line lights up. The
>   phone shows a live `role="status"` "Just called: X" line. Channels: `/x/setup` (host publishes
>   pack + size + pool), `/x/calls` (the growing called list), `/x/claim/<pid>` (a phone shouts
>   bingo; a 4s timeout reverts the claim so it can't hang), `/x/result` (verified winners). The
>   host VERIFIES every claim by re-deriving that pid's card from the seed and checking `hasBingo`
>   against the called set, so a tampered phone can't win. Built-in packs: Meeting / Party / Road
>   Trip (brand-free, short items, 28-30 each). Placement-scored leaderboard.
> - **Call It** (`games/call-it/`, block `blocks/callit/`): host-resolved live predictions, the
>   perfect second screen for a bar with a game already on the TV. The host poses a call (prompt +
>   2-4 options, with ready-made option sets + example prompts), the room locks a pick (`/x/pick`),
>   the host locks then taps the real-world outcome, correct callers earn flat points, and the
>   running board (`/x/board`) carries across as many calls as the host runs. Voidable calls.
> - **Verified:** 681 unit tests (`bingo/logic.test` 18: deterministic + reconnect-agreement +
>   distinct cards + win on row/col/diag + no false positive + host verify; `call-it/logic.test`
>   5: tally/score/accumulate/playable), all typechecks, the web build, and two real-browser
>   smokes - `scripts/bingo-smoke.mjs` (3 phones get DISTINCT auto-marking cards; host calls; a
>   phone RELOADS + rejoins and its marks come back; a player hits a line; the host verifies +
>   crowns; 0 horizontal overflow at 390px AND 1440px) and `scripts/call-it-smoke.mjs` (host
>   receives picks over the custom channel; a phone reconnects mid-open and its pick is restored;
>   correct callers show their win card + points; the board carries across a 2nd call; 0 overflow).
>   No DB change.
> - **Player-UX audit pass (2026-06-09):** an independent UX/a11y review + 390px/1440px screenshots
>   surfaced two reconnect defects (Bingo marks + Call It pick were local-only, lost on a drop) plus
>   gaps (no "what was just called" on the Bingo phone; one `aria-live` around a wholesale-swapped
>   subtree; a confusing loss icon; tiny long-pack text). All fixed: auto-mark + retained-pick
>   rehydrate make both phones reconnect-safe (now asserted by the smokes), each phone has a
>   persistent `role="status"` line, covered cells carry a non-color corner-dot marker, the loss
>   icon is gone, and the long pack items were tightened. ConfettiBurst is reduced-motion-safe.
> - **Follow-up:** deck-feedable packs/prompts via the planned "custom prompt packs via share
>   code" (today both ship built-in content only); a per-player card seeded by the live standing
>   would let Bingo run as a Session leg.

> **Wavelength - the clue-giver dial, the first game using the P7 foundation in a JUDGE round
> (2026-06-08).** BUILT + verified on the same branch (1 commit, not pushed). The §2 spectrum
> the plan intended (distinct from the already-shipped consensus Spectrum): each "read" is two
> rounds of one `wavelength` block (a `phase` field, like doodle). A rotating clue-giver is
> privately shown a SECRET target on a 0-100 spectrum and writes a clue; everyone else then
> guesses where it lands. Guessers score by closeness (ballparkCloseness vs the target, fixed
> half-scale 50); the clue-giver scores by the room's average closeness (a good clue lands all).
> - **The foundation usage:** the GUESS round's `assignContent` reads the prior CLUE round (its
>   inputs + its withheld answer, via `sources` - the P7 capability) to override ONLY the
>   clue-giver with a dial-less "watch" view; guessers fall back to the round's `derive`d content
>   (the shared clue + poles). So one round mixes a shared derived view (host + guessers) with a
>   per-player override (the clue-giver) - the "per-player view inside a derived round" the
>   handoff flagged as an engine gap, now closed.
> - **Withholding:** the target is stripped from the public config (`redactContent` +
>   `REDACTION_RULES wavelength:{target:-1}`) and reaches only the clue-giver's private address;
>   the clue round derives only the poles (target -1), so nothing leaks. The guess round's reveal
>   publishes the target via `revealSummary` (the big screen reads it).
> - **Reuse:** `SpectrumDial` (ui) for the dial + `ballparkCloseness` for scoring; a rotating
>   clue-giver via `chainOrder` seated by sorted pid, rotated by `item`. Standard-composed.
> - **Verified:** 653 unit tests (`logic` + `assignContent` clue rotation + the guess-round
>   foundation override + `derive` strips target + `aggregate`), typechecks, web build, and
>   `scripts/wavelength-smoke.mjs` (real 3-player: each clue round has one clue-giver; each guess
>   round splits the clue-giver off the dial; leaderboard scores the players; 0 overflow 390px).

> **P4B audience-counts on the `vote` block - BUILT (2026-06-08).** The first scored judge
> block now honors the owner's chosen design: a **lobby host toggle "Let the crowd's votes
> count", default OFF**. OFF keeps scoring player-only (unchanged). ON lets spectators vote on
> the vote round and folds them into the tally as a CAPPED, DISCOUNTED bloc (the whole crowd is
> worth at most ~half the players, split by the crowd's own choices), so the crowd can nudge a
> close round and the option author's score, while audience members NEVER enter the leaderboard.
> - **Reused:** the engine audience-vote transport + GameHost's `provide('dootAudienceVotes')`.
> - **New:** `RoomMeta.crowdCounts` + `room.host.setCrowdCounts` (engine, mirrors setTeams) +
>   a lobby toggle (shown only for games with a vote block) · a pure `runtime/crowd.ts`
>   (`crowdBloc` cap = `max(1, round(playerTotal * 0.5))`, `crowdChoiceCounts`) · optional
>   `BlockResultsContext.audienceVotesFor` + `RevealContext.audienceVotes`, supplied by
>   `scoreInputs`/`buildRevealSummary` ONLY when `meta.crowdCounts` is on (so the block code is
>   uniform and a no-op when off) · the `vote` block folds the crowd in its shared `tally()`,
>   used by BOTH `aggregate` (scoring) and `revealSummary` (the published reveal) - and VoteHost
>   reads that published summary at reveal, so the big screen, the phones, and the leaderboard
>   all agree with NO host-view change · GameAudience renders a vote surface on a vote round
>   when the toggle is on (options from the derived content, never the author map).
> - **Verified:** 639 unit tests (`crowd.test` cap/discount/floor + `vote.test` "a big crowd
>   nudges a close round, capped, and never on the leaderboard" + revealSummary folds the same),
>   typechecks, web build, and `scripts/crowd-vote-smoke.mjs` (real: toggle on, a spectator votes
>   on a SCORED vote round, the leaderboard shows only the 2 players, 0 overflow at 390px).
> - **fibvote: now DONE too (2026-06-08).** Same fold via its `tally()` (a crowd vote for a lie
>   lifts that liar's fooled count, capped; a crowd vote for the truth is neutral since the truth
>   has no author; truth-finder scoring is untouched because it iterates player inputs). Added to
>   `CROWD_VOTE_BLOCKS` + GameAudience `canVote` (single-choice, same surface as vote). Unit-tested
>   (`fibvote.test`); the end-to-end audience flow is the SAME shared code the vote smoke covers.
> - **split: now DONE too (2026-06-08).** Folds the crowd in its per-scenario `tally()` (the
>   crowd's yes/no for a scenario is capped against that scenario's player votes, so the crowd
>   can nudge how divided the room looks - changing the author's closeness-to-50/50 score - but
>   never run it up). GameAudience gained a NEW per-scenario yes/no surface (`.aud-split`, each
>   tap re-publishes the whole votes object; partial answers are fine). Unit-tested + a real
>   `scripts/split-crowd-smoke.mjs` (a spectator votes yes/no per scenario on a split-room round;
>   leaderboard stays player-only; 0 overflow at 390px). **P4B is now COMPLETE for vote +
>   fibvote + split.**

> **P4B for the SCORED vote blocks - DECIDED + scoped (2026-06-08).** The
> owner picked the design: a **lobby host toggle "Let the crowd's votes count", default OFF**.
> OFF keeps a scored game pure (players decide the score, the existing behavior). ON folds the
> audience as a CAPPED, DISCOUNTED bloc into the tally so the crowd can nudge which answer wins
> (and thus the author's score), while audience members NEVER appear on the leaderboard. This
> is the §4.2 Phase-B intent, now gated so a competitive host can opt out. NOT yet built (a
> scoring-touching change held back from a long session to keep it properly verified). Concrete
> plan (all reusable transport already exists from the poll work):
> - **Reuse as-is:** the engine transport (`submitAudience`/`audienceVotesFor`, the `/avote/<i>/<id>`
>   channel + host collector) and `GameHost.vue`'s `provide('dootAudienceVotes', ...)`.
> - **Toggle:** add `crowdCounts?: boolean` to `RoomMeta` (engine) + a host `setCrowdCounts` that
>   republishes meta (mirror the teams toggle exactly: `setTeams`/`meta.teams` is the template),
>   and a lobby switch in the GameHost lobby shown when the game has a vote/split/fibvote block.
> - **The primitive (pure + unit-test it):** a shared `runtime/crowd.ts` `crowdBloc(playerTotal,
>   crowdCountsPerOption) -> per-option additions`, CAPPED + DISCOUNTED (suggest: the whole crowd
>   is worth at most ~half the room, `cap = max(1, round(playerTotal * 0.5))`, distributed by the
>   crowd's own choice split). Note: poll's existing `max(3, playerTotal)` blend is NOT discounted
>   (full room) and is display-only; do NOT reuse that weight for scoring.
> - **Context threading:** add optional `audienceVotesFor?: (index) => Map<string, unknown>` to
>   `BlockResultsContext` and `audienceVotes?` to `RevealContext` (sdk). `HostRoom.client.vue`
>   passes `room.audienceVotesFor` into `scoreGame`/standings/`buildRevealSummary` ONLY when
>   `meta.crowdCounts` is true (so the toggle is enforced at the wiring layer; block code is
>   uniform and a no-op when off).
> - **Blocks (vote, split, fibvote):** in `aggregate` + `revealSummary`, fold the crowd into the
>   per-option/per-scenario tally via `crowdBloc` BEFORE scoring, so the big screen, the phone
>   reveal, and the leaderboard all agree. Audience is never added to `scores`/the leaderboard.
>   vote/fibvote crowd input is `{choice: optionId}`; split is `{votes: {scenarioId: 'yes'|'no'}}`.
> - **Audience phone view:** generalize `GameAudience.vue`'s `canVote` from `kind === 'poll'` to
>   also allow vote/split/fibvote WHEN `meta.crowdCounts` is on, rendering options from
>   `runtimeContentFor` (the derived, anonymized gallery) - never the author map.
> - **Host views:** VoteHost/SplitHost/FibHost blend the crowd into the displayed tally when
>   `meta.crowdCounts` is on (mirror PollHost's inject), so the screen matches the score.
> - **Verify:** unit-test `crowdBloc` + each block's aggregate-with-crowd (capped, off-leaderboard,
>   no effect when off); a browser smoke (vote round, toggle ON, a spectator votes, the crowd
>   nudges the tally, the results leaderboard shows ONLY players). Template: `scripts/audience-vote-smoke.mjs`.

> **Audit of the chain games + fixes (2026-06-08).** A full audit of Story Chain + Doodle
> Chain (style, gameplay, tests, usability) on the same branch (1 commit, not pushed). Style:
> ZERO em/en dashes anywhere in source or docs (verified by grep); no AI-voice clichés in
> the copy. Found + fixed: (1) a stray `✎` dingbat in DoodleHost (now a plain ASCII glyph,
> honoring the no-emoji rule). Gameplay: (2) **Doodle Chain ended on a DRAW round** with even
> counts (default 6), so the last drawing was never guessed and the "final guess vs the
> original prompt" payoff was lost; the lobby unit is now **"Drawings"** (2-5), and the round
> count is `1 + 2*drawings` (always ODD), so every chain ENDS ON A GUESS. (3) The results
> headline counted ALL threads while the view filtered empty ones; both aggregates now drop
> empty threads so the count matches the render. Usability: (4) the editor auto-form exposed
> chain-internal fields (step/total/seed/mode); the chain blocks now mark them
> `derivedFields` so a non-dev only sees prompt/timer (the editor hides them, and there is no
> misleading "built from the previous round" copy since chain blocks have no `derive`). (5) a
> small a11y label on the draw round's received prompt. Tests: +10 (the three shared ring
> helpers `chainSeedSource`/`chainRingFromSources`/`chainPrevSource` now have DIRECT tests
> incl. seed-flag-beats-lowest-index and late-joiner exclusion; a wrap test for rounds >
> players; doodle `emptyInput`/`isComplete` mode-switch; an empty-drawing aggregate edge).
> Verified: 629 unit tests, all typechecks, the web build, and BOTH chain smokes re-run green
> (storychain + doodlechain, the latter updated for the new Drawings picker). KNOWN (not
> bugs): small rooms (3 players) wrap the chain quickly - inherent and documented; the
> "untimed option" lobby toggle is a platform-wide pattern not specific to these games.

> **Doodle Chain - Gartic Phone, the second chain game on the P7 foundation (2026-06-08).**
> BUILT + verified on the same branch (1 commit, not pushed). The draw-and-describe
> telephone: everyone writes a prompt, the next player DRAWS it, the next DESCRIBES the
> drawing, the next draws that, and so on; the end unspools each chain as a gallery (prompt
> -> drawing -> guess -> drawing). It is the picture cousin of Story Chain and proves the
> chain plumbing generalizes to a mixed text/drawing input, still standard-composed.
> - **`doodle` block** (`blocks/doodle/`): a single block with two `mode`s (`draw` /
>   `describe`). Same rotation as `chainline` (the seed round's submitters are the frozen
>   ring; `from: [prev, 0]`), but the per-player `received` is the neighbor's TEXT on a draw
>   round and their DRAWING (strokes) on a describe round. Input is `{ text? | strokes? }`.
>   `aggregate` unspools each thread, resolving every step to text or a drawing by that
>   round's mode. No answer/secret in the config (same privacy model as chainline).
> - **Reuse, no new drawing tech:** `DrawCanvas` (ui, the existing Pixi surface) is the
>   draw-round input; `DrawThumb` (ui, pure-SVG readonly) renders the received drawing on a
>   describe round AND every drawing in the unspool gallery. Strokes ride inline in the
>   input (the proven `DrawValue` shape), so a drawing delivers fine as per-player content.
> - **Shared chain helpers lifted to `runtime/chain.ts`:** `chainSeedSource` /
>   `chainRingFromSources` / `chainPrevSource` (the seed-by-flag ring + prev-source logic),
>   now used by BOTH chainline and doodle (chainline refactored onto them; behavior
>   unchanged, its tests still pass). Keeps the chain primitive DRY.
> - **`doodle-chain` game**: a `buildConfig` flagship (host picks 4-8 rounds; round 0 writes
>   a prompt seeded per room, then alternates draw/describe), unscored, with a custom
>   gallery `components.Results`. minPlayers 3.
> - **Verified:** 619 unit tests (doodle rotation for both modes + the mode-aware unspool +
>   buildConfig alternation) + all typechecks + the web build + `scripts/doodlechain-smoke.mjs`
>   (a real 3-player 4-round game: a draw round mounts the Pixi canvas and submits a real
>   stroke; a describe round privately shows a NEIGHBOR's drawing - the rotation of drawings
>   through the live engine; the unspool is a 3-chain gallery with 6 drawings; 0 horizontal
>   overflow at 390px). Pixi runs fine headless.

> **Story Chain - the first chain game on the P7 foundation (2026-06-08).** BUILT +
> verified on the same branch (1 commit, not pushed). A collaborative "telephone" /
> exquisite-corpse party game: everyone writes an opening line, then each round your line
> is passed one seat and the next player, seeing ONLY that line, writes what comes next;
> the end "unspools" every story at once. It is the first consumer of the P7 foundation and
> proves a chain works as a STANDARD-COMPOSED game (so it is in Sessions + the picker), not
> custom-flow.
> - **`chainline` block** (`blocks/chainline/`): one block repeated. Its `assignContent`
>   reads the prior round's inputs via `sources` (the foundation) and hands each player
>   their LEFT neighbor's previous line; the seed round (no sources) hands out nothing and
>   the player sees the authored opener. The FROZEN RING needs ZERO engine state: it is the
>   sorted set of pids who submitted ROUND 0, passed to every later round as a source (the
>   composition sets `from: [prev, 0]`); round 0's inputs never change after it locks, so
>   the ring is stable + reconnect-safe + seeded (sorted seating). The seed source is found
>   by its `content.seed` flag, not a fixed index, so the block stays a reusable primitive.
>   `aggregate` unspools every thread (`runtime/chain.ts chainThreads`) into `recap`. No
>   answerOf/redactContent (nothing secret is in the authored config; the in-progress lines
>   are private per-player addresses the engine never publishes until the final unspool, so
>   no `REDACTION_RULES` entry - catalog.test agrees).
> - **`story-chain` game**: a `buildConfig` flagship (host picks 3-10 lines from the lobby;
>   the opener is seeded per room), unscored, with a custom `components.Results`
>   ("StoryChainResults", the unspool). minPlayers 3.
> - **Two small GENERIC seams** (reused, not story-chain hacks): (1) `ResultsFragment.recap`
>   + `StandardResults.recap`, passed through by `scoreGame`, so a block can hand a custom
>   payload to a custom Results view; (2) the generic renderer (GameHost/GamePlayer/
>   GameAudience) now honors `plugin.components?.Results ?? GameResults` (it hard-coded
>   GameResults before), mirroring how the shell honors `components.Host/Player`. Byte-
>   identical for every game that ships no custom Results.
> - **Verified:** 611 unit tests (chainline rotation + unspool aggregate + buildConfig
>   shape) + all typechecks + the web build + `scripts/storychain-smoke.mjs` (a real
>   3-player game: asserts each PASS round privately delivers a NEIGHBOR's line - the
>   foundation working through the live engine - never the player's own, and a 3-story
>   unspool with 0 horizontal overflow at 390px). Reviewed adversarially; the two findings
>   (key the ring off the seed flag not index 0; align the round clamp to 10) are fixed.
> - **Note for the next chain game (Doodle Chain):** it is now a SMALL increment - same
>   `chainline`-style plumbing with a `draw`-block input (Pixi `DrawCanvas`) on alternating
>   rounds and a drawing-gallery unspool, instead of building chain machinery from scratch.

> **P7 Pipeline foundation - per-player content derived from a prior round (2026-06-08).**
> BUILT + verified on the same branch (1 commit, not pushed). The engine capability the
> chain games (Doodle Chain / Story Chain) are built on, and ONLY the foundation this turn:
> the game is next, mirroring the `nextGame` -> Sessions precedent (build the engine bit,
> fully unit-tested, then the game). Generalizes the hidden-role per-player primitive so an
> assignment can derive from EARLIER ROUNDS' INPUTS, not just the roster:
> - **SDK:** `AssignContext` gains `sources: DeriveSource[]` (mirrors `DeriveContext`).
> - **Engine:** `LoadedGame.assignContent` gains the `inputsFor` param (mirrors
>   `deriveContent`); `publishAssignedIfAny` threads `(i) => this.inputsFor(i)`. At round i
>   the prior round's inputs are already host-side, so `sources[0]` (= round i-1) is
>   complete. Faker ignores it (no `from` -> empty sources): byte-identical, locked by the
>   existing faker integration test.
> - **Runtime:** `buildAssignContent` is now `(index, inputsFor)` + a `getAnswerKey` param,
>   building `sources` from `RoundInstance.from` via a shared `buildSources` helper extracted
>   from `buildDeriveContent` (so the two never drift). Host wiring (HostRoom +
>   SessionHostRoom) forwards `inputsFor` + `answerKeyFor`.
> - **Pure rotation helpers** (`packages/games/src/runtime/chain.ts`): `chainOrder` (a
>   stable seeded ring, sorted-canonical so it depends only on the SET not arrival order),
>   `chainSourceFor` (round 0 = your own thread; round >= 1 = your LEFT neighbor, one seat
>   back), `chainThreads` (the end-of-game "unspool" reconstruction). Fully unit-tested incl.
>   the 2-player + reconnect-agreement cases.
> - **Verified:** 601 unit tests, all typechecks, the web build. New: an engine-path
>   integration test drives a real 3-player / 2-round chain through `RoomRuntime` over an
>   in-memory relay (each player privately receives ONLY their left-neighbor's round-0
>   output) + `chain.test` rotation math + a `buildAssignContent` sources test. No browser
>   smoke (the foundation has no UI yet).
> - **DEFERRED to the game turn:** the `chain` + draw blocks, the Doodle Chain custom
>   Results "unspool" view, the Pixi `DrawCanvas` draw rounds, and the FROZEN-ROSTER at
>   start. The frozen roster is kept in the GAME layer (not the engine): the ring is stable
>   after round 0 since every chain member then has an input, so freeze at round-0
>   completion and seat via `chainOrder` with a ROOM-stable shuffle (NOT the per-index
>   shuffle `assignContent` hands the block - see the `chainOrder` doc note). This same
>   primitive also unblocks the clue-giver "Wavelength" Spectrum and a text-only Story Chain.

> **P4 Phase B - audience votes on polls (2026-06-08).** BUILT + verified on the same
> branch (1 commit, not pushed). Spectators weigh in: on a poll round, an audience phone
> shows the options + they vote; the big screen folds the crowd in as a CAPPED bloc
> (max(3, players) worth of votes, split by the crowd's choices) so a huge audience
> influences but never drowns out the room. Kept OFF the scoring path: audience votes go
> to a separate `/avote/<i>/<id>` namespace (engine `submitAudience` + a host-only
> collector + `audienceVotesFor`), never mixed into player inputs (no deanonymization, no
> leaderboard effect). The crowd tally reaches only the poll's host view via a
> provide/inject from GameHost (the SDK block contract is untouched); nextGame clears the
> votes. Verified: 590 unit tests (a new engine test), typechecks, web build,
> `scripts/audience-vote-smoke.mjs`, P4A smoke still green. REMAINING for full P4B:
> weighting the SCORED vote blocks (vote/split/fibvote) via the same channel.

> **Wager / high-stakes trivia (2026-06-08).** BUILT + verified on the same branch (1
> commit, not pushed). A scored standalone block + a "Wager" flagship: each round is a
> multiple-choice question, but first you bet a tier (100/300/500); right adds your bet,
> wrong subtracts it, off a 1000 base bankroll, richest wins. A CLEAN standard block (no
> engine change, no custom flow): the bet + answer ride in one input, scored in one
> aggregate (no cross-round coupling). Correct option withheld (redactContent + answerOf
> + REDACTION_RULES, like guess); bankroll = max(0, 1000 + net), order-independent. Pure
> scoring tested; reuses the guess option schema + OptionGrid; the phone reveal shows the
> +bet/-bet swing. Flagship draws fact-checked MC questions, deck-feedable via a quiz deck
> (choiceFromRow). `## wager` markdown + MCP guide + docs. Meta-test now covers 22
> flagships. NOTE: fixed tiers, NOT a fraction of the live bankroll (which would need
> per-player content seeded by the standings - an engine bit deferred). Verified: 589
> unit tests, typechecks, web build, `scripts/wager-smoke.mjs`, 0 overflow at 390px.

> **Durable playlists - save + reuse a session (§4.3 complete) (2026-06-08).** BUILT +
> verified on the same branch (1 commit, not pushed). The durable half of Sessions: a
> "playlist" is a saved, ordered list of game ids you host any time. Mirrors the
> games/decks storage pattern exactly: a `playlists` table + `playlists-repo.ts` (zod
> boundary, ownership, private/unlisted/public visibility, CRUD + list-mine/public) +
> REST under `/api/playlists`; game ids validated against the server-safe catalog
> (`isKnownPlugin`). UI: a "Save lineup" action in the session builder (auth-gated),
> `/host/playlist/[id]` (SessionHostRoom gained a `gameIds` prop + skips the picker,
> keeping only sequenceable games in order), and a `/playlists` list (host + delete). An
> unlisted lineup is hostable by link without login. Verified: typechecks, web build,
> `scripts/playlists-smoke.mjs` (authed API CRUD + visibility + a browser host-by-id
> check), and the ad-hoc session smoke + 579 unit tests still green. DEFERRED: a richer
> in-place editor (reorder/rename) + public-playlist discovery. **§4.3 Sessions is now
> COMPLETE (ad-hoc + durable).** Next (per §8): P4 Phase B (weighted audience), P7
> Pipeline -> Doodle Chain / Quick Draw / Bingo, Wager, the clue-giver Wavelength.

> **Sessions / a night of games (§4.3) (2026-06-08).** BUILT + verified on the same
> branch `expansion-p1-answer-caption` (2 commits, not yet pushed). The marquee
> structural feature for bars/classrooms/parties: several games played back to back in
> ONE room, players join once and stay.
> - **Engine `room.host.nextGame(game)`:** swaps in the next game in the same room.
>   Wipes the previous game's per-round relay state (inputs, derived content, answers,
>   reveals, per-player secrets) + standings + results + the pending drive command,
>   then re-enters active at round 0. Presence (players/audience/teams/driver) persists.
>   Clearing is by publishing null; the input/content/reveal/per-player handlers now
>   treat null as ABSENT (delete) so a cleared round reads as "not submitted". Real
>   values are never null, so existing games are unaffected. Unit-tested in room.test.
> - **`SessionHostRoom` + `/host/session`:** the host picks games, players join once,
>   and a cumulative session leaderboard accrues placement points per game (folded when
>   each leg's results land). Reuses the generic per-game machinery to build each leg's
>   LoadedGame; renders GameHost in a new `sessionMode` (hides the per-game play-again
>   CTA); drives the next leg via nextGame so the player's plugin follows the swap with
>   no rejoin. Custom-flow games are excluded from the picker (nextGame only resets the
>   engine, not their /x/ state).
> - **DEFERRED:** the durable `playlists` entity (save + reuse a night, mirroring
>   decks-repo: table + repo + API + a /playlists UI) - this MVP is ad-hoc (curate live).
> - **Verified:** 579 unit tests, all typechecks, the web build, `scripts/session-smoke.mjs`
>   (a 2-game night; a player plays both without rejoining; the session board accumulates
>   + the final board shows), and answer-smoke (normal hosting unaffected by sessionMode).
> **Next (per plan §8):** P4 Phase B (weighted audience), P7 Pipeline -> Doodle Chain /
> Quick Draw / Bingo, Wager, the durable playlists entity, the clue-giver Wavelength.

> **Spectrum / consensus dial (2026-06-08).** BUILT + verified on the same branch
> `expansion-p1-answer-caption` (1 more commit, not yet pushed). A new standard block
> + a "Spectrum" flagship: everyone slides a 0-100 dial to place the subject between
> two poles and scores by landing near the room's CONSENSUS (the mean) - read the room
> on a continuous scale. Nothing withheld (the target is the emergent mean), so no
> redaction; points-style scored (works with teams + standings). Closeness reuses
> ballpark's P6 scorer against a FIXED half-scale (50), NOT the round's worst error,
> because a field-relative curve degenerates for 2-3 players (all equidistant -> all 0);
> the absolute curve is fair at any size (unit-tested). New reusable `SpectrumDial` (ui,
> CSS-first): a draggable accessible range for input + a readonly track plotting marks +
> the consensus line for host/reveal. Deck-feedable (generic deck of prompts + optional
> left/right poles; bare prompt falls back to Disagree/Agree); `## spectrum` markdown +
> MCP guide + docs. The meta-test now covers **21** flagships. **IMPORTANT:** this is
> the crowd-consensus variant, NOT the clue-giver "Wavelength" the plan's §2 spectrum
> describes - true Wavelength needs per-player views inside a DERIVED round (the
> clue-giver sees the target + types a clue, others guess), which the engine doesn't
> wire (the reserved `assignment:'per-player'`/`promptFor` is unbuilt, and a derived
> round can't cleanly do per-player content); it'd need that engine wiring or a
> custom-flow game. Left as a future item. Verified: 576 tests, typechecks, web build,
> `scripts/spectrum-smoke.mjs`, 0 overflow at 390px.

> **Test-coverage audit + backfill (2026-06-08).** A pass over this branch's tests
> found ONE gap and closed it: the four deck-row mappers added for the new games
> (`answerRowFromRow`, `binaryFromRow`, `overUnderFromRow`, `surveyFromRow`) were only
> exercised on their happy-path default rows by the pool meta-test; their real logic
> (over/under text + 0/1 index + threshold/actual computation, two-choice column/
> positional fallbacks, synonym columns, rejection of unusable rows) is now unit-tested
> in `runtime/decks.test.ts`, matching how the existing mappers are covered. Also added
> 6 "build shape" tests in `buildconfig.test.ts` locking the new games' semantic
> output (a swapped/wrong-field bug parses-valid, so `compositions.test` wouldn't catch
> it and the smokes don't always assert it). Coverage map for the branch: every block
> has pure logic tests; engine changes (teams/standings/audience transport) are in
> `engine/room.test.ts`; every new markdown block has a parse test; ALL games are
> auto-covered by `compositions.test` (it iterates `builtinPlugins`, validating every
> defaultConfig + buildConfig against the block schemas) + the deck-feed meta-test +
> `catalog.test`; and 8 browser smokes cover the interactive flows (answer, audience,
> audio, categories, quickwins, standings, survey, teams). 565 unit tests, typechecks,
> web build all green.

> **Survey / Family Feud (2026-06-08).** BUILT + verified on the same branch
> `expansion-p1-answer-caption` (1 more commit, not yet pushed). A new scored
> standalone block + a "Survey" flagship. A round has a hidden BOARD of ranked
> answers worth points; players name as many as they can and each board answer they
> find scores its points (matched via the shared P1 tolerant matcher; no
> double-counting). A STANDARD block: the board is the answer key (redactContent +
> answerOf + a REDACTION_RULES entry, revealed only at reveal), points-style scored
> so it works with teams + standings. Pure tested logic (`scoreSurvey`, `parseBoard`);
> the host flips a "survey says" board with per-answer find counts, the phone
> highlights the player's matches. The flagship is deck-feedable via a quiz deck whose
> `answers` column lists the board ("Text:points | ...", points optional -> rank
> scored); authorable via `## survey` markdown (reusing `parseBoard`) + the MCP guide
> + docs. The deck-feed meta-test now covers **20** flagships. Verified: 555 unit
> tests, all typechecks, the web build, and `scripts/survey-smoke.mjs`, 0 overflow at
> 390px. **Next (per plan §8):** P4 Phase B (weighted audience voting), Wager
> (custom-flow), §4.3 sessions/playlists.

> **Categories / Scattergories (2026-06-08).** BUILT + verified on the same branch
> `expansion-p1-answer-caption` (1 more commit, not yet pushed). A new scored
> standalone block + a "Categories" flagship. Everyone gets the same letter + a few
> categories and types one answer each; an answer scores only if VALID (starts with
> the letter) AND UNIQUE (no one else gave it), using the shared P1 normalize fold for
> the uniqueness test. It's a STANDARD block (no engine changes, no answer-withholding:
> scoring is computed at reveal, so no REDACTION_RULES), correct-style scored so it
> works with teams + standings. Pure tested logic (`scoreCategories`/`startsWithLetter`);
> the host reveal flags every answer scored/duplicate/invalid, the phone grades the
> player's own. The flagship draws a random playable letter + category set per round
> (seeded), deck-feedable via a prompt deck of categories; authorable via `## categories`
> markdown + the MCP guide + docs. The deck-feed meta-test now covers **19** flagships.
> Verified: 544 unit tests, all typechecks, the web build, and
> `scripts/categories-smoke.mjs` (two players type valid+unique answers, host scores +
> reveals, phone shows the score, to final results), 0 overflow at 390px. **Next (per
> plan §8):** P4 Phase B (weighted audience voting), Wager (custom-flow), §4.3
> sessions/playlists, survey (Family Feud).

> **Audio-clip support for trivia / Name That Tune (2026-06-08).** BUILT + verified on
> the same branch `expansion-p1-answer-caption` (1 more commit, not yet pushed). An
> optional `audio` field on the **guess** and **answer** blocks turns any trivia round
> into a listen-and-answer round. New `AudioClip` component (ui): a themed play/pause +
> seek bar over a native `<audio>` element, SSR-safe (renders inert; playback only ever
> starts from a tap, so no autoplay and reduced-motion needs nothing), accessible, and
> a clean no-op when the clip 404s. The clip plays on the **big screen** (the shared
> speaker); phones show a "listen to the big screen" hint rather than 20 devices echoing
> it. Rendered in all three prompt-area surfaces (GameHost, the editor big-screen
> preview, plus the phone hint on GamePlayer + the phone preview). Authorable via an
> `audio:` field on `## guess`/`## answer` + the MCP guide + docs. Clips are
> user-provided URLs (none bundled), so a "Name That Tune" flagship is authorable today
> but not shipped as built-in content (same content-sourcing call as Caption This).
> Verified: 534 unit tests, all typechecks, the web build, `scripts/audio-smoke.mjs`
> (renders, play/pause no crash, phone hint, broken-URL no-op), and the answer +
> over-under play smokes still green. **Next (per plan §8):** P4 Phase B (weighted
> audience voting), Wager (P3-unblocked, likely custom-flow), §4.3 sessions/playlists.

> **Quick-win flagship games: Would You Rather, Tier List, Over/Under (2026-06-08).**
> BUILT + verified on the same branch `expansion-p1-answer-caption` (1 more commit,
> not yet pushed). Three classic party formats Doot lacked, each a small composition
> over an existing block + a curated, deck-feedable content pool (creators can remix
> them like every other flagship): **Would You Rather** (poll, forced-choice
> dilemmas, unscored, generic 2-column deck), **Tier List** (rate, place each subject
> on an S-to-D tier scale, prompt deck of subjects), **Over/Under** (guess,
> estimation trivia, SCORED so it shows the P3 running standings + P5 team board;
> correct side withheld via the guess block's redaction; built-in figures
> fact-checked, quiz deck). Two pure deck-row mappers (`binaryFromRow`,
> `overUnderFromRow`) join `runtime/decks.ts`; Tier List reuses `promptFromRow`. The
> deck-feed meta-test now covers **18** flagships. Verified: 533 unit tests (the
> meta-test proves each pool is self-consistent), all typechecks, the web build, and
> `scripts/quickwins-smoke.mjs` (each game hosts + plays a round to reveal, 0
> horizontal overflow at 390px). **Next (per plan §8):** P4 Phase B (weighted
> audience voting), Wager (P3-unblocked), §4.3 sessions/playlists, the Caption This
> flagship once images are sourced.

> **Audience tier (P4 Phase A) (2026-06-08).** BUILT + verified on the same branch
> `expansion-p1-answer-caption` (1 more commit, not yet pushed). A new `audience`
> engine role for untrusted phone spectators: they read the display state but NEVER
> subscribe to player inputs or the roster (so a spectator can't deanonymize a
> two-phase gallery, and stays low-bandwidth, the PRD scale story), never submit,
> never enter the scored roster, and never count toward the player cap (they
> heartbeat on a separate `/audience/<id>/ping`; the host counts distinct live pings
> as "N watching"). Because audience publish no player profile they are simply absent
> from the roster `scoreGame` sees, so scoring needed no role filter. Join flow: the
> JoinForm offers "Just watch instead" (no name), and a full room offers "Watch
> instead" (auto-spill); a new `AudienceRoom` mounts a read-only `GameAudience` view
> (prompt + image + a per-state status + the running standings + final results). The
> host lobby shows "N joined · N watching". Verified: 522 unit tests (4 new audience
> engine tests), all typechecks, the web build, `scripts/audience-smoke.mjs`, and the
> answer/standings/teams player-path smokes still green after the `subscribe()`
> restructure (the riskiest change). **Deferred:** P4 Phase B (weighted audience
> voting) needs a contract addition (`weightFor`) + audience submitting on a separate
> channel; not built. **Next (per plan §8):** Wager (needs P3, now landed), then
> §4.3 sessions/playlists, then the Caption This flagship once images are sourced.

> **Teams audit fixes + live standings (P3) (2026-06-08).** BUILT + verified on the
> same branch `expansion-p1-answer-caption` (2 more commits, not yet pushed).
> - **Teams audit (2 real bugs found + fixed):** (1) an unscored game (e.g. a
>   poll-only Custom game) with teams on rendered a meaningless all-zeros team board;
>   `teamLeaderboard()` now returns undefined when the per-player board is empty. (2)
>   After the host turned teams OFF, each player's team value lingers on the relay, so
>   `finish()` still rolled up a board; `finish()` now gates the team on `meta.teams`
>   being set (the lobby toggle is authoritative). Added engine-level coverage for the
>   team transport (set/assign/reconnect/handler-order).
> - **P3 live standings:** after each scored reveal the host computes the cumulative
>   standings and publishes them to an ephemeral `/standings` address; the big screen
>   (during reveal) and every phone (during the locked/reveal lull) show a running
>   leaderboard. Reuses `scoreGame` over the revealed rounds (`runtime/standings.ts`
>   `standingsThrough`), so it folds the SAME per-block aggregates + team roll-up the
>   final results use (one scoring path). A shared `scoreInputs()` in GameHost feeds
>   both `finish()` and the standings; a `watch` on the reveal state publishes (scored
>   games only). Shared `StandingsPeek` in ui (no sdk import, per the dependency
>   direction, which the typecheck enforced). Engine: `addr.standings` +
>   `publishStandings` + `room.standings` on the Vue binding.
> - **Verified:** 518 unit tests, all typechecks, the web build, and three real-browser
>   smokes (`answer-smoke`, `teams-smoke`, `standings-smoke`): accumulating standings,
>   the team board + "Red wins", 0 horizontal overflow at 390px. **Next (per plan §8):**
>   audience tier (P4), then Wager (now unblocked by P3), then the Caption This flagship
>   once images are sourced.

> **Expansion plan slice 1: text-match (P1), the answer block, caption, and Teams
> (P5) (2026-06-08).** BUILT + verified on branch `expansion-p1-answer-caption`,
> NOT yet pushed/deployed (3 commits; `main` auto-deploys, so push when ready).
> Working from `docs/expansion-plan.md` (corrected three layering mismatches first:
> `visuals.ts` is in `packages/ui` and is not test-enforced; `fibvote.norm` is a
> DIFFERENT normalizer from hivemind's, NOT the same, so it was left alone;
> `ballparkCloseness`/`ballparkBounds` are already exported).
> - **P1 text-match** (`packages/games/src/blocks/text-match.ts`): the shared
>   free-text matcher. The aggressive `normalizeAnswer` lifted out of hivemind
>   (which now re-exports it, its tests the regression lock) + diacritics fold +
>   synonym list + a bounded edit-distance typo tolerance. Pure + unit-tested.
> - **`answer` block + Type the Answer game**: type-the-answer trivia (free text,
>   no options). Answers withheld (`redactContent` + `answerOf` + `REDACTION_RULES`)
>   and graded by P1; correct-only scoring; host shows the answer + who got it; the
>   phone self-grades. A flagship `type-the-answer` game (built-in pool + buildConfig
>   + a deck-feedable quiz `contentPool` with answer columns withheld). `## answer`
>   markdown + MCP guide + docs.
> - **Caption** rounds: an additive optional `image` on the `quip` block (rendered
>   by the generic renderer on host + phone, the proven image path), a one-click
>   "Caption This" editor recipe, and `image:` on `## quip` markdown. A bundled
>   "Caption This" flagship is DEFERRED (needs curated self-hosted images, a content
>   call); caption is fully authorable/hostable today via the recipe + editor + md.
> - **Teams (P5)**: a cross-cutting roll-up, blocks untouched, non-team games
>   byte-identical. Ephemeral (invariant #1): team names on meta; each player's team
>   on their own `/player/<pid>/team` relay address (retained + TTL, reconnect-safe).
>   `Player.team` + `RoomMeta.teams` + the playerTeam address/pattern (folded into the
>   roster, preserved through profile/ping handlers); `setTeam`/`setTeams`/`assignTeam`
>   on the engine + Vue binding. `ScorePlayer.team` + `StandardResults.teamLeaderboard`;
>   pure tested `teamLeaderboard()` + `teamCrownHeadline()` in `runtime/derive.ts`,
>   called by `scoreGame`. UI: a lobby Teams toggle + count (2-4) + Auto-balance, a
>   player team picker, team-coloured roster chips, and a results team board (host +
>   phone) via a shared `teamColor()` helper.
> - **Verified:** 509 unit tests, all package typechecks, the web build, and the
>   real-browser smokes (`scripts/answer-smoke.mjs`, `scripts/teams-smoke.mjs`):
>   correct/wrong feedback, the team board + "Red wins", 0 horizontal overflow at
>   390px. **Next (per plan §8):** P3 live standings, then the Caption This flagship
>   once images are sourced; a teams default ("teams suggested" manifest capability)
>   is an optional later nicety.

> **Display-block follow-ups + Create ordering (2026-06-07).** SHIPPED + deployed.
> Three small follow-ups to the display blocks below: (1) the **Create** page's "Blocks
> and Custom" grid now leads with **Custom** (`apps/web/app/pages/create.vue`, a stable
> custom-first sort), since it's the mix-any-blocks / markdown-import starting point.
> (2) **Fixed a double image** on Info Slide: the editor preview wrapped the block in the
> generic kicker/prompt/`<img>` chrome AND rendered the block's own view (which already
> shows the image), so it appeared twice. The preview now skips that chrome for display
> blocks (`curIsDisplay` guard in `GameEditor.client.vue`, both phone + big-screen modes).
> (3) **Mobile-verified** the new blocks in a real browser at 390px (player + host hosting
> from a phone): image renders once, text wraps, zero horizontal overflow.

> **Display blocks: Info Slide + Title Card (2026-06-07).** NEW. Two no-input
> presentation blocks for the Custom game (mix them with any rounds in the editor):
> **Info Slide** (`slide`, heading + body + image, any combination) and **Title Card**
> (`title`, big centered title + kicker). Both set a new SDK flag `RoundBlock.display`.
> The generic renderer learned the display path: the host shows the block **full-bleed**
> (a `.stage-full`, not the split prompt grid), **auto-opens** the round on enter so the
> room sees it at once, and advances with a **single button** (it chains the unused
> open/lock/reveal beat to the next round; last slide = Final results). Phones **mirror**
> the slide with no "Lock it in" (a delegated MC gets one "Next slide →"). No
> aggregate/answer, so they score nothing and need no REDACTION_RULES. The schema-form
> now renders a `body` field as a textarea (like `prompt`); `image` already gets the
> uploader. Files: `packages/games/src/blocks/slide/` + `blocks/title/` (each a `block.ts`
> + a shared `*View.vue` used for both host + phone, `inheritAttrs:false`); wired into
> `games/custom`, `index.ts`, and the GameHost/GamePlayer renderer. Verified host+player in
> a real browser (title, text slide, image combo, finish); 473 tests + all typechecks green.

> **Social link previews / Open Graph (2026-06-07).** NEW. Links now unfurl with a
> title, description, and preview image. A shared `useDootSeo()` composable
> (`apps/web/app/composables/useSeo.ts`) sets og:* + twitter:* (summary_large_image) and
> resolves relative paths to absolute URLs via `runtimeConfig.public.baseUrl` or the request
> origin (`useRequestURL`). Defaults live in `app.vue` (the branded card); pages override:
> **a game page uses its own cover as og:image** (`gameOgImage()` mirrors GameCover:
> uploaded cover, else a flagship's `/covers/*.jpg`, else the default), title as the headline,
> and og:site_name="Doot" so a link reads as a game from doot.games. Wired on home, explore,
> /g/[id], /game/[id], /u/[handle] (avatar), /decks, /decks/[id], /create. The default
> preview is a branded 1200x630 card at `apps/web/public/og.png`, generated by
> `node scripts/gen-og.mjs` (Playwright screenshot of an on-brand HTML template, no runtime
> image-gen dependency, committed + served statically). Verified the og tags render in SSR
> (absolute URLs) for home, a flagship cover, a community game title, and the cover branch.

> **Nav account avatar dropdown (2026-06-07).** SHIPPED + deployed. The top bar's
> separate username link, Log out button, and Admin nav link are now one **avatar button**
> that opens an accessible dropdown (`apps/web/app/components/AccountMenu.vue`): header
> (name + @handle), **View profile** (`/u/@handle`, when a handle is claimed), **Edit
> profile** (`/account`, reads "Finish your profile" with a nudge dot until set up),
> **Admin** (admins only), **Log out**. Signed-out still shows Log in / Sign up. Menu has
> aria-haspopup/expanded, role=menu/menuitem, Escape + click-outside (returns focus), and
> Arrow/Home/End nav; avatar shows the user image or a monogram. Verified in a real browser
> at 1440 + 390 (0 horizontal overflow). `app.vue` slimmed accordingly.

> **Admin console + moderation + play counts + first-account-admin + featured (2026-06-07).**
> SHIPPED (verified: 473 tests, web typecheck + prod build green, live smokes against `pnpm dev`
> incl. a fresh-DB throwaway instance for the bootstrap). An auth-gated `/admin` console
> (`docs/admin.md`).
> - **Who is admin:** the **FIRST account ever created** is auto-promoted to `user.role='admin'`
>   **exactly once, forever** (`ensureFirstAdmin` in `admin-repo.ts`, run at startup + after every
>   sign-up, guarded by a durable `app_meta` marker so it never re-fires even if that admin is
>   later removed). `DOOT_ADMIN_EMAILS` is an optional env override (always-grants + ban-immune,
>   and picks WHICH existing account the bootstrap promotes). Verified all 3 paths: fresh-deploy
>   first-signup, existing-deploy startup-promotes-earliest, and marker-blocks-re-promotion.
> - **Security:** every `/api/admin/*` route calls `requireAdmin` server-side (401/403,
>   live-verified incl. a non-admin 403); page + nav link only reflect `/api/admin/me`.
> - **Tabs:** Overview (users/games/decks/plays metrics, by-type, most-played), Users (role +
>   suspend/unsuspend with reason), Games (visibility override, **Feature** flag, delete any),
>   Decks (visibility, delete any).
> - **Featured:** the Feature toggle sets `games.featured`; `listPublicGames` orders featured-first
>   (then newest), so a featured public game leads `/api/games` and shows first (with a "Featured"
>   badge) in the homepage "Fresh from creators" rail. Live-verified.
> - **Play counts:** durable `games.play_count`/`last_played_at`, bumped best-effort by the host
>   when a saved game's room leaves the lobby (`POST /api/games/[id]/play`, anonymous, rate-limited)
>   - a historical stat (PRD §1), never live room state.
> - **Bans:** enforced across the content-write surface by `server/middleware/ban-guard.ts` (403 +
>   reason; live-verified).
> - **Schema (additive + idempotent):** games play_count/last_played_at/featured + an `app_meta`
>   key/value table via `ensureSchema`; user role/banned/banReason/bannedAt via the auth-migrate
>   fallback. **Local dev** ships a generic admin `admin@doot.test` / `dootadmin` (local-only).
> - New files: `server/utils/admin.ts` + `admin-config.ts` + `admin-repo.ts`,
>   `server/middleware/ban-guard.ts`, `server/api/admin/*`, `server/api/games/[id]/play.post.ts`,
>   `app/pages/admin.vue`, `scripts/set-admin.mjs`, `docs/admin.md`. Still open (was bundled in
>   E18): DB-backed official games + game versioning.

> **Deck-fed TYPED pools + "Decks by Doot" (2026-06-04).** SHIPPED. Phase 2 of deck-fed
> pools: the 6 TYPED-pool games (fib-finder, faker, ballpark, what-you-didnt-know, mad-libs,
> split-room) now take a creator deck too, like the 6 prompt games already could. Each lifts
> its `*_POOL` to flat `DEFAULT_ROWS` and builds over `opts.rows ?? DEFAULT_ROWS`
> (byte-identical when no deck, anchored by `buildconfig.test`); a per-game `fromRow` mapper
> (`runtime/decks.ts`: `factFromRow`/`secretFromRow`/`ballparkFromRow`/`choiceFromRow`/`storyFromRow`/`frameFromRow`)
> maps a creator deck row to the game's pool row (multi-column: options + correct index for
> the buzzer game; templates with blanks derived from `{tokens}` for mad-libs).
> **SECURITY (invariant #3):** a typed pool deck carries answer columns (truth/answer/correct/word)
> and rides the reserved `config.decks.pool` key, NOT round bindings, so binding-driven
> `redactDecks` left it exposed. Fix: `ContentPool.answerColumns` (mirrored in `catalog.pool`,
> sync-tested), and `redactDecks(rounds, decks, pluginId)` nulls the pool deck's answer columns
> for non-owners. Proven by a catalog unit test + `scripts/pool-typed-smoke.mjs` (truth present
> for owner, null for non-owner) run against **prod**. UX: `RemixWithDeck` copy adapts per kind;
> `remix_game`/`list_game_types`/format guide cover both shapes (typed games go save_deck →
> deckId; the single-column csv path is rejected with the conventional columns). **Decks by Doot:**
> `scripts/seed-decks.mjs` (idempotent, keyed by name, owned by a stable `decks@doot.games`
> account) seeds 22 PUBLIC + REMIXABLE decks (`scripts/decks-by-doot.data.mjs`) covering every
> pool game (prompt decks + quiz/card/template decks; trivia fact-checked, zero em dashes).
> Verified: real Doot decks resolve + build host rounds end to end. **445 tests**, typecheck,
> build green. Plan: `~/.claude/plans/sunny-jumping-catmull.md`.
>
> **Editor clarity for deck-fed remixes (2026-06-05).** SHIPPED. A pool-fed flagship remix
> (e.g. Quiz or Die + a "Dark Trivia" deck) plays its attached `config.decks.pool` deck: the host
> re-runs `buildConfig` over the deck rows, so the saved `config.rounds` is **vestigial** (a
> built-in preview). Confirmed the deck IS passed correctly (`?for=play` inlines the full 20-row
> deck and the host builds from it), but the editor was misleading: it showed the built-in
> preview round and "pool · 0 rows", so it looked like the deck was ignored. Two fixes: (1)
> `DeckManager` now uses the editor's already-fetched `refDecks` to show a linked deck's real name
> + size ("Quiz or Die: Dark Trivia · 20 rows · linked", not "pool · 0 rows"); (2) the editor
> shows a banner on any pool-fed flagship ("This game plays your deck '<name>' (<N> rows) ... the
> round below is just a preview, not what plays ... edit or copy the deck"), linking to the deck.
> Verified by screenshot. Known follow-on: editing the vestigial round does nothing at host; the
> cleaner long-term fix is a deck-first edit flow (with "copy this Doot deck to customize"). 475
> tests, typecheck, build green.
>
> **Decks library: a "Decks by Doot" section + audit fixes (2026-06-04).** SHIPPED. Decks now
> carry an optional `game` tag (the game they are authored for): an additive `game` column on
> the `decks` table (ensureSchema ALTER for the live DB), threaded through `deckInputSchema` +
> `decks-repo`, and set by the seed for every Decks by Doot. The `/decks` page gained a dedicated
> **Decks by Doot** section (the official public decks, by `authorName === 'Doot'`) with per-game
> filter chips (driven by the catalog) + a game badge on each card; the browse tabs below split
> your decks from the community's. Verified by screenshot (filter to Fib Finder shows its 4
> decks) and re-seeded on **prod** (37 official decks, all tagged, 14 games). Phase-3 audit fixes:
> the QoD finale `belong` match is case-insensitive; the seed validator now rejects duplicate
> rows in ANY deck (full-row), not just single-column. No critical bugs found.
>
> **Decks Phase 3: the custom-flow multi-pool games are deck-feedable (2026-06-04).** SHIPPED.
> Both custom-flow flagships now take a creator deck, with NO new SDK shape. The realization:
> `buildConfig(seed, { rows })` already takes all rows in and returns a `GameComposition`, so a
> multi-pool game maps each deck row preserving a discriminator and `buildConfig` PARTITIONS
> the rows into its several arrays (no `fromRows` variant, no host change). **Truth or Share:**
> one prompt deck with optional `kind` (truth/share) + `tier` (mild/spicy) columns feeds all
> four pools (`spotlightRowFromRow`; an empty quadrant falls back to built-in; a plain prompt
> deck defaults to mild truths). **Quiz or Die:** the SAME trivia deck may also carry finale
> "tap all that belong" rows (a `belong` column lists the belonging options); `cellarRowFromRow`
> + buildConfig partition question vs finale rows, each pool falling back to built-in. `belong`
> is a withheld answer column (catalog + contentPool, sync-tested), verified on **prod** (owner
> sees it, non-owner gets null). The deck-feed meta-test now covers all **14** flagships (the
> `requires` picker filter is keyed to quiz/card kinds; prompt/generic take any deck). Added
> public Decks by Doot for Truth or Share (Icebreakers + Bolder) plus a Science quiz and a
> Holiday prompt deck (**37 Doot decks**). **475 tests**, typecheck, build green. Remaining
> deck loose end: a multi-column inline warm-start for typed games (the picker is already warm
> via official decks + the compatibility filter).
>
> **Remix warm-start + bank expansion + picker compatibility (2026-06-04).** SHIPPED.
> Three things. (1) **Warm-start remix:** `RemixWithDeck` no longer cold-starts a creator at
> a deck picker. Prompt/story games open an inline editor PRE-FILLED with ~6 of the official
> lines (`poolStarter`, a pure tested helper reading `contentPool.defaultRows`); edit a few,
> add your own, Create and host (saves a private deck + a remix that references it). Quiz/card
> games keep the picker, now grouping the user's decks with official Doot decks (badged via
> `authorName === 'Doot'`). The built-in pool IS the zero-config "official deck" (code-resident,
> no fragile DB dependency); Doot decks are official alternatives. (2) **Picker compatibility:**
> the `quiz` kind is overloaded (short-answer / numeric / multiple-choice), so the picker used
> to offer decks that would silently fall back. Each multi-column pool now declares
> `ContentPool.requires` (synonym column groups); the deck summary exposes column keys; the
> picker hides non-matching decks (`deckMatchesPool`, pure + tested). Verified by screenshot:
> Quiz or Die now offers only multiple-choice decks. (3) **Banks expanded** for default play
> across every pool game (Fib Finder/Ballpark/What You Didn't Know/Faker/Quip Clash/Open Mic
> +8 each; Most Likely/Hivemind/Sketch and Spot +8; Backronym/Split the Room +6; Quiz or Die
> +16 earlier). Quiz or Die's `defaultConfig` was the one flagship embedding its whole bank,
> now a lean 4Q/3-finale preview. **Testing:** one meta-test holds for ALL 13 deck-feedable
> games (pool internally valid, regression, override, catalog sync, lean defaultConfig,
> requires self-consistency) + `poolStarter`/`deckMatchesPool` unit tests. **470 tests**,
> typecheck, build green; warm-start + filter verified on **prod**.
>
> **Quiz or Die: expanded bank + deck-feedable trivia (2026-06-04).** SHIPPED. The built-in
> trivia bank grew 12 -> 28 questions and the Cellar finale categories 6 -> 12 (every answer
> checked). And Quiz or Die's TRIVIA is now creator-swappable via the SAME single-pool
> `contentPool` the typed games use: a `quiz` deck of question/options/correct (+ optional
> lurid `category`) feeds the questions through `cellarQuestionFromRow` (reuses `choiceFromRow`,
> so a What-You-Didn't-Know quiz deck works here too); the finale categories stay built-in. No
> host/SDK change (custom-flow game, single dominant pool). `buildConfig` builds over
> `opts.rows ?? DEFAULT_ROWS` (byte-identical when no deck), and `correct` is withheld from
> non-owners (answerColumns), verified on **prod** (owner sees it, non-owner gets null). Added
> the public "Quiz or Die: Dark Trivia" deck (33 Doot decks total). True multi-pool (a
> finale deck, or Truth or Share's tiered prompt arrays) is still the remaining Phase 3 piece.
>
> **Audit + polish (2026-06-04, same day).** Audited the above: (1) confirmed the ONLY
> saved-config serve path is `/api/games/[id]` (list endpoints return summaries with no
> config) and it redacts with `pluginId`, so a typed pool deck's answers can't leak to a
> non-owner. (2) Validated all 32 Doot decks through the real `fromRow`/`buildConfig` (zero
> dropped rows); found + fixed a duplicate `RAM` in Backronym: Tech. (3) Hardened
> `choiceFromRow` to split a delimited options column on `|`/`;` before `,` (so an option
> containing a comma isn't torn apart). (4) `seed-decks.mjs` now runs a pure structural
> pre-flight (required columns, >=2 options, no dup rows) and refuses bad content. **Shipped
> polish:** the lobby round slider clamps its max to an attached deck's usable row count;
> `RoundBindings` type-filters the column dropdown (image field -> image columns only). All
> verified on **prod** (both remix smokes pass). **Remaining:** more themed decks (the seed
> makes adding trivial), a Playwright host-a-remix smoke, an editor "Content" tab to
> attach/detach a pool deck (with a replace-vs-append toggle, which would need a per-game
> merge hint in config), and Phase 3 (Truth or Share + Quiz or Die multi-pool decks).

> **Deck-fed flagship pools — "Remix with your prompts" (2026-06-04).** SHIPPED (MVP): the 6
> single-prompt-column pool games (quip-clash, open-mic, backronym, most-likely, hivemind,
> sketch-spot) are now creator-customizable. New SDK `ContentPool` descriptor + `contentPool`
> on `GamePlugin` + a `rows?` opt on `buildConfig`; each game lifts its `*_POOL` to
> `DEFAULT_ROWS` and builds over `opts.rows ?? DEFAULT_ROWS` (byte-identical when unset — the
> regression anchor). A creator attaches a deck under the reserved `config.decks.pool` key
> (zero schema change — rides existing `resolveDeckRefs`/redaction); the host re-runs
> `buildConfig` over `poolRowsFor(contentPool, deck)` in `HostRoom.resolveConfig` (the saved
> `config.rounds` are vestigial — a pool-deck game is NOT hosted verbatim). UX: a
> **"Remix with your prompts"** button (`RemixWithDeck.vue` on `/game/[id]`) + an MCP
> **`remix_game`** tool (CSV in → deck + saved remix; `list_game_types` marks remixable games
> via `contentDeck`). `gameCatalog` gained a server-safe `pool: { deckKind, placeholderBlock }`
> (sync-tested against the plugins). Verified: **430 tests** (deck-fed regression + creator-rows
> per game, poolRowsFor/promptFromRow, catalog sync), typecheck, build, and
> `scripts/pool-remix-smoke.mjs` (a quip-clash remix persists + its pool ref resolves with the
> creator's prompts). Plan: `~/.claude/plans/sunny-jumping-catmull.md`. Audit fix: `remix_game` now takes the
> csv as **one prompt per line** (a CSV parse mis-split prompts containing commas). Deferred
> (Phase 2/3): typed-pool games (quiz/word/story decks: fib-finder, faker, ballpark,
> what-you-didnt-know, mad-libs, split-room — needs mode-2 multi-column mapping + answer-column
> redaction) + the custom-flow multi-pool games (Truth or Share, Quiz or Die). Other leftovers:
> clamp the lobby round-slider max to an attached deck's size; column-type filtering in the
> binding helper (image field → image columns); a browser smoke of host-plays-remix-prompts +
> collect→photovote; an editor "Content" tab to attach a pool deck. **And: author public
> "Decks by Doot" content for every pool game (see the fresh-session kickoff prompt).**

> **Decks phase 2c-c — collected photo as a play-time variable (2026-06-04).** SHIPPED (MVP):
> `RoundInstance.fromShares` lets a round fill a field (e.g. `image`) from a prior `collect`
> round's shares, picked at round-advance (`pickShare`, seeded). Wired by EXTENDING the
> games-layer `buildDeriveContent` (gated on `fromShares`), which the engine already calls on
> every round entry (`publishDerivedIfAny`) — so the **engine is untouched** and ordinary/
> two-phase rounds are unaffected. Persisted in `games-repo`; editor shows a "Shared photo"
> toggle on any round after a collect round whose block has an `image` field. Audit round 3
> first confirmed the path is sound: collect media flows through the standard per-player input
> channel (no size cap) and `inputsFor` hands full values to the derive. Verified: 418 tests
> (pickShare + end-to-end fromShares), typecheck, build. **Deferred (2c-c+):** a full runtime
> "share deck" (draw N collected rows, bind several fields, array/montage) — no consumer block
> for an image *array* yet; and a live multiplayer smoke of the photo paths. See roadmap §2.5.

> **Decks phase 2c-a/2c-b — the Share block + Share & Vote (2026-06-04).** SHIPPED: a new
> composable **`collect` ("Share")** block — every player shares a photo (downscaled
> on-device via the shared `@doot-games/ui` `compressPhoto`, rides the relay as an ephemeral
> data URL) or a short line; the host fills the screen with a live gallery. Unscored,
> standalone, in Custom + the Add panel. Plus **`photovote`** — the image-vote judge (a
> `drawvote` mirror that renders `<img>` instead of strokes, since draw stores vector strokes
> and a photo is a bitmap); it derives an anonymized, shuffled gallery from the prior collect
> round, excludes self-votes in the pure tally, scores by vote share. Wired as the **Share &
> Vote** recipe (`collect → photovote`). Verified: 413 tests (collect aggregate + 4 photovote
> derive/tally/reveal), typecheck, build. **Remaining 2c-c:** play-time slots (a collected photo
> as a cross-round variable) — `slotDeck(inputs)` + lazy resolution; see `docs/decks-roadmap.md`
> §2.5. Note: a live multiplayer smoke of the photo-share→vote relay path is still worth adding.

> **Decks phase 2b + audit (2026-06-04).** SHIPPED: editor **recipe discoverability** — each
> two-phase recipe card names its constituent blocks (e.g. "Quip + Vote") and the Add panel
> notes that Bars/Spotlight/Cellar are built into their flagship games (so all 17 composable
> blocks are visibly reachable: 9 singles + 6 recipes). **Mode-3 (column→array) is DEFERRED on
> purpose** — the only string-array content fields are `spotlight`/`cellar` (both custom-flow),
> so mode-3 has no consumer reachable through the generic editor+resolver; it should ship
> bundled with a deck-configurable Truth or Share or a new generic prompt-list block (see the
> §3 audit note in `docs/decks-roadmap.md`). **Audit fix:** forking a deck-backed game now
> **auto-snapshots** any referenced deck the forker can read (`cloneGame` runs `resolveDeckRefs`
> with the forker's id), so a fork is self-contained instead of carrying a live `{ref}` to a
> deck the forker can't read; this also lets a forkable quiz game snapshot its answers (then
> per-game redaction withholds them) rather than needing a public answer deck. Guidance added to
> `docs/decks.md` ("reference for your own reuse; snapshot for sharing"; keep answer decks
> private) and a decks pointer in `authoring-a-game.md`. Verified: 406 tests, typecheck, build,
> and the extended `scripts/decks-ref-smoke.mjs` (now also asserts the fork snapshot). No em
> dashes in site copy (swept). Next: phase 2c — the `collect` block + play-time slots.

> **Decks phase 2a — the `/decks` library SHIPPED (2026-06-03).** Reusable decks are now
> first-class: a durable `decks` table + `decks-repo.ts` (mirrors games-repo: zod boundary,
> ownership, visibility, remixable, `generic|quiz|prompt|card` kind), full REST
> (`/api/decks` list/create + `/api/decks/[id]` get/put/delete + `/clone`), a `/decks`
> browse page + a `DeckEditor` (CSV import, editable row/column grid, image-cell upload)
> with `new` + `[id]/edit` + a read-only `[id]` view, and a **Decks** nav link. A game uses
> a deck two ways: inline snapshot OR a live `{ ref }`. References resolve to inline
> **server-side on the play read only** (`?for=play` → `resolveDeckRefs`); the editor read
> stays raw so re-saving preserves the ref. The game editor's DeckManager can **link a
> library deck**, and RoundBindings/preview fetch a linked deck's columns+rows so binding
> dropdowns and the live preview work. MCP gained `list_my_decks` / `save_deck` / `update_deck`
> (CSV in) + a `## deck <name>` / `link: <deckId>` markdown directive (parser + test). Docs:
> `docs/decks.md` (user-facing). Verified: **406 tests** (+ a redaction-tie test and a
> markdown link-parse test), typecheck (incl. nuxi), the web build, and a new authed
> end-to-end smoke (`scripts/decks-ref-smoke.mjs`) proving a linked deck resolves for the
> owner with the answer present and **withheld (null) for a non-owner** (invariant #3).
> **PUSHED + DEPLOYED** (prod `doot.games/decks` + `/api/decks` 200; the `decks` table
> auto-created on startup). Next: phase 2b (editor recipe discoverability + spotlight prompt
> decks via mode-3 column→array), then 2c (the `collect` block). Map: `docs/decks-roadmap.md`.

> **Decks roadmap + verification pass (2026-06-03).** The decks MVP (slices a–d) is
> re-verified after the visual editor + home changes: full suite green (**405 tests**, incl.
> a new redaction→resolution tie test proving invariant #3 holds for deck-sourced answers),
> and live multiplayer smokes pass across guess / quiz-or-die / circuit-cypher / open-mic /
> truth-or-share / mad-libs / split-room — the deck work broke nothing. The forward plan for
> everything next (a **`/decks` library** page, a general **`collect` block** whose shared
> media becomes a play-time variable, decks×spotlight via mode-3 column→array, the Custom
> "all blocks" finding, and the MCP/docs work) is mapped with a build order in
> **[`docs/decks-roadmap.md`](docs/decks-roadmap.md)**. Custom finding: it already composes
> all 17 generic-renderer blocks (9 singles + 6 recipes); bars/spotlight/cellar are
> custom-flow-only — the reusable share primitive is the planned `collect` block.

> **Content decks: engine + persistence + markdown authoring (2026-06-03). PUSHED + DEPLOYED.**
> The data-driven "decks" feature is usable end to end (no new editor UI yet) - author via the
> editor's Import-from-Markdown or MCP `save_game`. All gates green: typecheck (incl. `nuxi`),
> **404 tests** (+25 across the slices), the web build. Full design: `docs/content-decks-plan.md`.
> - **Slice a (sdk + resolver):** `Deck`/`DeckColumn`/`DeckRef`/`DeckUse` + additive `RoundInstance`
>   fields (`draw`/`bindings`/`pool`) + `GameComposition.decks` + the block `pool` descriptor; a pure
>   `resolveComposition` (`runtime/decks.ts`) expands a deck-backed composition into plain rounds
>   (mode-1 field bindings with same-row correlation, `draw: N` seeded distinct sampling, mode-2
>   typed-pool via `block.pool.fromRow`). Reference-agnostic; no-op when absent.
> - **Slice b (persistence + host + redaction):** `gameInputSchema` accepts `config.decks` + the round
>   additions (rows capped 1000, `MAX_CONFIG_BYTES` -> 2MB); `HostRoom` expands decks at load so the
>   relay-published config is plain rounds (existing per-round redaction strips answers); a pure
>   `redactDecks` (server-safe, `catalog.ts`) nulls any deck column bound to an answer field for the
>   API-served stored config. Catalog-tested.
> - **Slice c (import + authoring):** `parseSheet` (pure CSV/TSV-from-Sheets parser, type inference,
>   quoting, dedup, ragged-row warnings) + markdown `## deck <id>` blocks + round `draw:`/`bind: f =
>   deck.col`/`pool:`. The editor's markdown import carries `config.decks`; the MCP format guide +
>   `markdown-games.md` document it. End-to-end test (parse -> resolveComposition).
> - **Slice d (visual editor):** two **isolated** components (kept out of the 1600-line editor) -
>   `DeckManager.vue` (rail panel: paste CSV/TSV -> preview -> add/remove decks, v-model over
>   `config.decks`) + `RoundBindings.vue` (the "Pull from a deck" control: a `draw: N` input +
>   field<-deck.column binding rows, introspecting the block's fields + the deck's columns). The
>   editor mounts them + a **sample-resolved preview** so a bound field shows a real drawn value
>   live. Browser-verified (paste -> bind -> preview shows the drawn row). Note: `resolveComposition`
>   now clones content via JSON (robust to Vue reactive proxies; `structuredClone` threw in the
>   preview path - fixed).
> - **Remaining (phase 2):** a `/decks` library (durable banks + references), mode-2 typed `pool`
>   descriptors on real blocks (whole-round typed import), and column-type filtering in the binding
>   helper (image field -> image columns). (See `docs/content-decks-plan.md`.)

> **Safety net extended to split + fibvote (2026-06-03). PUSHED + DEPLOYED.** The timeout safety net (canned answer for an eligible non-submitter, scored at half)
> now covers all three two-phase judges, not just vote. Extracted `blocks/safety.ts`
> (`stableIndex` + `safetyEntries`); vote refactored to it; split + fibvote derives/aggregates wired.
> Split the Room ships a generic-dilemma pool; Fib Finder intentionally has none (a generic lie
> can't fit a trivia blank). Split + fibvote safety unit-tested; vote behavior unchanged. 379 tests.

> **MCP connector completed + obscenity content filter (2026-06-03). PUSHED + DEPLOYED.** The
> Connect-with-Claude MCP can now set everything about a game, not just its rounds; the content
> filter now uses the `obscenity` library (obfuscation-aware). All gates green: typecheck (incl.
> `nuxi`), **375 tests**, the web build (~10KB gzip bundle delta); `/mcp` route + 401 auth gate live.
> - **Game settings over MCP:** `save_game`/`update_game` accept `description`, `visibility`
>   (private/unlisted/public), `remixable`, `coverImage`, `tags` (args override the same fields in
>   the spec header). New **`set_game_meta`** changes those on an existing game without re-sending
>   rounds (`patchGameMeta` extended for description/cover/tags/theme).
> - **Cover image:** `upload_image` reframed to host round images AND covers, with the size/crop
>   guidance baked into the tool + the format guide (16:9 landscape, ~1200×675; cards center-crop to a
>   wide strip, the detail page shows it full at 16:9).
> - **Every block reachable:** added a `## faker` markdown block (Hidden Faker -> faker+accuse). The
>   markdown header now parses `description`/`visibility`(or `published`)/`remixable`/`cover`/`tags`.
> - **`doot_format_guide` rewritten end to end:** every block, how two-phase make/judge rounds derive
>   at runtime, Mad Libs, the faker, cover sizing/cropping, visibility/remixable. Docs synced
>   (`markdown-games.md`, `connect-claude.md`). Parser metadata + faker unit-tested; full tool flow is
>   owner-verified on the live OAuth connect (can't exercise past the 401 here).

> **E16 robustness pack (2026-06-03). PUSHED + DEPLOYED.** Tie handling, timeout safety net, and
> content-filter tiers. All gates green: typecheck (incl. `nuxi`), **371 tests** (+14), the web build.
> - **Co-crown tie handling.** A top-score tie reads "Ann & Bob tie for the win" / "N-way tie: ..."
>   (pure `crownHeadline` in `runtime/derive.ts`); the `Leaderboard` uses competition ranking so
>   co-leaders share the star and the next entry is rank 3 (star only when score > 0).
> - **Timeout "Safety Quip"** (quip + fill -> vote). The make round carries `safetyAnswers`; the vote
>   derive fills eligible non-submitters with a deterministic canned answer (no gap, no zero), flagged
>   in the withheld key, and the aggregate scores it at half. Wired into Quip Clash + Mad Libs, a
>   markdown `safety: a | b | c` field, off by default elsewhere. **Follow-up:** split/fibvote/bars.
> - **Content-filter tiers** (off / moderate / strict) for free-text galleries. A host lobby picker
>   (shown for quip/fill games); HostRoom masks the derived gallery text before publish
>   (`runtime/contentFilter.ts`). **Follow-up:** the word list is a minimal slur-free starter, swap in
>   `obscenity` for comprehensive coverage; and family/adult **prompt-pack tracks** (tag built-in pools).
> - **Re-scoped:** `audienceWeight` does NOT exist in code (the backlog claim was wrong); it needs a
>   player-vs-audience role split first, so it's a feature, not a wiring. Deferred (see BACKLOG E16).
> - **Owner direction:** the delegated-driver forge (driver PIN / HMAC) was judged overkill for a
>   casual party app and set aside (left as a documented soft limitation).
> - **Audit:** the recent scoring changes were reviewed + a real-runtime-path safety-net test added;
>   no correctness bugs, only acceptable cosmetic edges (departed-player gallery clutter, all-zero
>   leaderboard showing every entry at rank 1).

> **Quick-wins cluster + driver-can-start + GoatCounter analytics (2026-06-03). PUSHED +
> DEPLOYED.** All gates green throughout: typecheck (incl. `nuxi`), **355 tests** (+7), the web
> build; behavior changes browser-verified (`scripts/driver-start-smoke.mjs`,
> `scripts/own-answer-smoke.mjs`). Spot-checked live (doot.games + stats.doot.games 200).
> - **Driver can start the game** (the owner ask). New `'start'` control intent so a designated
>   driver (the MC on their phone) can kick the game off from the lobby, not just advance rounds.
>   Wired into the generic GameHost (`host.start()` in lobby + a driver Start button) **and both
>   custom-flow games**: Quiz or Die and Circuit Cypher (its `/x/drive` transport). For the
>   audio-heavy games, `startGame()` was split into an idempotent `armAudio()` (fired by any host
>   lobby interaction, incl. picking a driver) + `beginShow()` (host button OR a driver's remote
>   start), so a remote start still has audible sound on the big screen.
> - **GoatCounter analytics is LIVE.** Privacy-friendly, cookie-free pageviews as a single Go
>   binary on its own SQLite file (no new DB), behind Caddy at `stats.doot.games`, mem-capped at
>   128MB for the 1GB droplet. Dashboard at `https://stats.doot.games` (owner login). Activation
>   env on the droplet is **`NUXT_PUBLIC_GOATCOUNTER_URL`** in `/opt/doot/.env` (the `NUXT_PUBLIC_`
>   prefix is required to override `runtimeConfig.public` at runtime; a plain `GOATCOUNTER_URL`
>   bakes at build and stays ''). The gated plugin (`app/plugins/analytics.client.ts`) drives
>   counts on `script.onload` + each SPA route change, because count.js's own onload auto-count
>   never fires for an async script injected after page load. Verified: real `POST /count` 200
>   beacons. (A couple of test pageviews incl. a stray `/_diag_test` are in the stats.)
> - **Prompt overflow closed.** Shared `PROMPT_MAX = 400` + `promptText()` in the sdk, used by all
>   16 prompt-bearing blocks. The editor form enforces a `maxlength` + live counter (introspector
>   now reads a string `.max()` as `maxLength`) and blocks save on overflow; the markdown/MCP
>   parser clamps `prompt`/`voteprompt` with a warning.
> - **E18 own-answer hiding for fill/split votes.** The renderer computes `ownMakeText` (the
>   player's own make submission rendered via the source block's toVoteText) and the judge view
>   hides the matching option/scenario (split pre-fills the hidden vote so the round still
>   completes). Was broken for fill (only quip worked). Pure helper tested + browser-verified.
> - **Circuit Cypher** optional "match arena colors to the theme" lobby toggle (derives the two
>   rapper colors from `--c1..--c5` with a contrast guard, default off = the neon identity).
> - **Docker base image digest-pinned** + **Rank** per-player-shuffle seed got a regression test
>   (it was already fixed in code).
> - **Still open:** the Claude connector-directory submission (square logo + public docs with 3+
>   examples + a reviewer test account; the terms-acceptance + claude.ai connect handshake are
>   owner-only). And the **delegated-driver forge** security hole is now more pertinent since the
>   driver can start games (see "Known limitations" below) - the recommended next build.
> - **DB/volume note (owner to verify on the droplet):** durable state is a single SQLite file at
>   `/opt/doot/data/doot.sqlite` (accounts + saved games + bookmarks); images are on Spaces; live
>   room state is on the relay. Whether `/opt/doot/data` is on a DO block volume vs. the root disk
>   is a provisioning detail not visible from the repo, check with `df -h /opt/doot/data` + `mount`.

> **QUIZ OR DIE flagship + look-restore + per-game-folder reorg (2026-06-03).** The QUIZ OR DIE
> game and the Truth or Share / profile fixes (bullets below) were PUSHED + DEPLOYED. A follow-up
> batch is **BUILT locally, not yet pushed**: a faithful re-port of the mockup's look, the per-game
> folder reorganization + the QuizOrDieHost monolith split, and audit-driven consistency fixes
> (see the last three bullets). All gates green: typecheck (incl. `nuxi`), 348 tests, the web build.
> A new cinematic custom-flow game built from the `quiz-or-die (3).html` mockup. The
> host screen is the shared TV (a horror stage: a narrating cartoon-villain host, a burlap-doll
> cast, trivia, the Cellar minigames, a finale Escape race); phones are controllers. Real players
> only (no bots): a no-answer counts as wrong and goes to the Cellar, the dead play on as ghosts
> and can steal a body in the finale. Gates green: typecheck (incl. `nuxi`), **348 tests**, the
> web build; a real-browser smoke (`scripts/qod-smoke.mjs`, host + 2 phones) runs the whole show
> intro -> trivia -> all four Cellar minigames -> death -> finale -> ending with 0 console/page
> errors, and the editor preview shows the phone + big-screen cards with 0 overflow at 1440/390.
> - **Custom-flow over `/x/`** like Truth or Share / Circuit Cypher: a parked `cellar` block holds
>   the trivia bank + finale categories; the host parks the engine and drives `/x/show` (retained
>   master state) plus per-player intent channels (`ans/cup/spin/roll/money/fin`). The host is the
>   sole authority and reads the unredacted bank from its local `room.config`.
> - **Answer withholding** is honored by hand (the engine reveal path is bypassed):
>   `redactQuestionForPublish` strips the correct index from every published question, the `cellar`
>   block has `redactContent`/`answerOf`, and `REDACTION_RULES.cellar` closes the saved-config API
>   path (verified: the phone never sees the answer before reveal).
> - **Files (per-game folder):** `games/quiz-or-die/` holds `index.ts` (the `defineGame`), `Host.vue`
>   (thin stage) + `Host.css`, `Player.vue`, `useQuizShow.ts` (the show "director": the relay-driven
>   sequencer + state + audio, lifted out of the .vue), `logic.ts` (+`.test.ts`, 26 pure tests),
>   `audio.ts` (ported WebAudio SFX + synth villain voice, SSR-safe), `cast.ts` (SVG cast),
>   `show.ts` (transport types). Plus `blocks/cellar/block.ts`. Registered in
>   registry/catalog/index/visuals, a `skull` cover motif in `GameCover.vue`, and horror fonts
>   (Creepster/Nosifer/Special Elite/VT323) in `nuxt.config.ts`.
> - **Look re-port (owner feedback: the first cut lost the mockup's character).** Faithfully restored
>   the cinematic stage: the checkerboard perspective **floor**, the **centered animated host** during
>   the intro (then in the wings), the **torn/crooked parchment answer ribbons** (clip-path + per-card
>   rotation + coloured chips), the per-phase **scene backdrops** (night/curtain/dungeon), the dripping
>   Nosifer category, the teal flip clock + "ANSWER NOW!", and a **working wheel** (spins to the
>   computed sector). Layered absolute stage inside a fluid 16:9 box (no overlap). **Voice** now
>   defaults to real OS speech (synth fallback), primed in the Start gesture. Lobby room-code overflow
>   fixed (ticket column widened).
> - **Reorg + monolith split (separation of concerns).** EVERY game now lives in its own folder
>   `games/<id>/index.ts` (folder name == `manifest.id`); custom-flow helpers are uniformly `logic.ts`;
>   `index.ts` exports the complete block + game set. QuizOrDieHost was split into `useQuizShow.ts`
>   (director) + thin `Host.vue` + external `Host.css`. The convention is now documented in CLAUDE.md.
> - **Known limits (consistent with the other custom-flow games):** a host reload mid-show restarts
>   the show (in-memory state is not resumable), and the roster is frozen at Start (latecomers get a
>   spectator card). Owner on-device pass still worth doing for the audio (synth villain voice + the
>   procedural horror SFX can't be asserted headless).
> - **Audit-driven fixes shipped in the same batch (owner-reported + a deep self-audit):**
>   - **Truth or Share light-on-light text.** Its `class="card"` collided with the global
>     discovery-card style (white `var(--surface)` background), so the light-on-dark spotlight text
>     rendered on a white box. Renamed to `.spot-card`; text now reads on the dark stage.
>   - **Truth or Share photo resolution + a latent send bug.** The CLASP core caps a published value
>     at a 65535-byte frame (Uint16 length, no chunking), so a large photo would throw `Payload too
>     large` and never send (the old fixed 560px/0.5 had no guard and could already hit this).
>     Replaced with a **budget-aware compressor** (`compressPhoto`) that aims high (1024px) and steps
>     size/quality down only as far as needed to fit ~56KB, so shares are sharper than before AND
>     always send. Verified end to end (a 3.7MB source compresses, sends, and renders; 0 errors).
>   - **Game covers on user profiles.** `u/[handle].vue` was the only games list not passing
>     `:image="g.coverImage"` to `GameCover` (the API already returned it), so uploaded covers fell
>     back to generated art there. Wired it through; verified the `<img>` renders.
>   - **QUIZ OR DIE Cellar intro flicker.** The Cellar published a `chalice` view ~3s before a
>     minigame was chosen, briefly flashing an empty chalice for non-chalice rounds. Added a neutral
>     `intro` step ("Down to the Cellar"). Also wired the `redactQuestionForPublish` guard into the
>     host's question publishes (it existed + was tested but wasn't being called).

> **Editor details rework + MCP two-phase authoring (2026-06-02, PUSHED + DEPLOYED, HEAD
> `3f1c97b`).** From owner playtest feedback. Gates green: typecheck (incl. `nuxi`), 320 tests,
> the web build; editor audit 0 overflow at 1440/900/390.
> - **Editor top bar.** Game details moved out of the rail disclosure into the top bar: the
>   description and a `Tags:` input sit under the title, the **cover image** is a small icon +
>   popover next to the description, and **Remixable** is a checkbox beside the visibility picker.
> - **Editor alignment fix.** `.editor` was zeroing `.wrap`'s 26px horizontal padding, so the
>   editor content sat 26px left of the site nav ("left tight", and the body's amber glow made
>   it read as a background artifact). Now `padding-bottom` only, so it aligns with the nav.
> - **Most Likely To cover** got a crown on the chosen player instead of the odd floating star.
> - **MCP / markdown now authors the new blocks.** Added `## buzzer` and the two-phase
>   `## quip` (Write & Vote; `truth:` makes it Lie Detector) and `## fill` (Mad Libs; `split: true`
>   makes it Would You & Split, with blanks auto-extracted from the `{template}`). Updated
>   `doot_format_guide`, `docs/markdown-games.md`, and parser tests; verified a full spec
>   round-trips into 9 valid editor rounds.
>
> **WHERE THINGS STAND (2026-06-02). No task in flight.** Doot is built, deployed, and live
> with **21 games (14 flagships)** and the full authoring loop (three-pane editor with one-click
> two-phase recipes + markdown import + Connect-with-Claude). Remaining work, roughly by tier
> (full detail + `[size]` hints in [`docs/BACKLOG.md`](./docs/BACKLOG.md)):
>
> - **Owner-only verification (can't be automated, small).** A two-device on-device playtest of
>   **Truth or Share photo-share** over the relay (the new spicy SHARE prompts lean on it) and of
>   **Circuit Cypher / Open Mic** TTS + WebGL. Plus the **Claude connector directory** submission
>   (BACKLOG F): a square logo, public docs with 3+ examples + a reviewer test account, then
>   accept the directory terms and run the live connect+save handshake.
> - **Robustness for party play (E16, medium, the recommended next build).** Timeout safety net
>   (auto-fill an unsubmitted free-text round at 50% so there is no dead air), **content-filter
>   tiers** (off / moderate / strict, which matters more now that Truth or Share is spicy),
>   audience-as-discounted-bloc voting (`audienceWeight` exists in `scoring.ts` but is unwired),
>   and tie handling (split / co-crown).
> - **Security hardening (medium, documented trade-offs).** The **delegated-driver forge** (add a
>   driver PIN, or keep `reveal` host-only) and **soft two-phase anonymity** (opaque per-round
>   input keys). Neither is a fresh regression.
> - **Infra / scale (E17, medium).** OAuth / magic-link, **Postgres** behind `useDb()` for
>   multi-instance scale, and upload hardening (presigned-POST size + content-type policy).
> - **The big platform feature (E15, large).** The **external-plugin runtime**: a sandboxed
>   iframe on `plugins.doot.games` + the typed postMessage bridge wired into the app +
>   manifest-by-URL with a SHA pin. The bridge and the locked-down origin already exist; wiring
>   them to users is the PRD phase-two headline. Security-critical; see `docs/external-plugins.md`.
> - **More games.** D14 the full "What, You Didn't Know That?" gameshow (4-contestant panel +
>   audience steal + content packs) `[large]`; The Big Reveal / Talking Points `[large]`; G3 the
>   closeness family (**Over/Under, Spectrum**, reuses `ballpark`) `[medium]`; G4 Doodle Chain
>   (a pipeline primitive) `[large]`; G5 Quick Draw (real-time strokes + fuzzy match) `[large]`;
>   G6 companion mode (Call It, Buzzword Bingo) `[medium]`; G7 Hot Seat / Two Truths `[large]`.
> - **Small polish.** A `prompt.max()` for the extreme-overflow case, themed Circuit Cypher arena
>   colors, Rank's authored-order seed, the own-answer hiding gap on fill/split votes, a Docker
>   base-image digest pin, and reconciling PRD §8 with the block model.

> **Editor + catalog follow-ups + Truth or Share polish (2026-06-02, PUSHED + DEPLOYED, HEAD
> `2f5d95f`).** A batch of fixes on top of the editor redesign, from owner playtest feedback,
> plus a new-games preview audit. All gates green: typecheck (incl. `nuxi`), 315 tests, the web
> build; editor audit shows 0 overflow at 1440/900/390.
> - **Buzzer is now a game type** (`games/buzzer.ts`, registry + catalog, `flagship: false`), so
>   first-correct trivia has a one-click card in the Create "Blocks and Custom" row and a
>   hostable `/editor/buzzer`, like the other primitives. It was previously only addable as a
>   round inside Custom (it is the only single block with no standalone game).
> - **Editor Details inlined, not a modal.** The description is a one-line input under the title;
>   cover image, tags, and "let others fork" moved into a collapsed "Cover, tags & sharing"
>   disclosure at the foot of the rounds rail. Dropped the Details modal and the "More" menu;
>   Import is now a direct bar button.
> - **Modal z-index fix.** The global `.topbar` is `z-index: 500`; the editor overlays were
>   `z-index: 60`, so every modal (Add round, Import) and the preview drawer rendered *under*
>   the site header and looked clipped. Raised the overlay/drawer/scrim/FAB z-indices above 500.
> - **Homepage** "Create with blocks" now leads with **Custom**, then the single-block primitives.
> - **Cover art** for the 7 newer flagships (Backronym, Open Mic, Hivemind, Most Likely To,
>   Ballpark, Faker, Truth or Share) plus the Buzzer game: bespoke gradients + line motifs in
>   `GameCover.vue`, matching the original seven (they had been falling back to generic art).
> - **Truth or Share, spicier prompts + a real editor preview.** Rewrote all four prompt decks
>   (truth/share x mild/spicy) to be genuinely high stakes: many spicy SHARE prompts let the
>   picker or the room choose what gets revealed (e.g. "let the picker choose a word, search it
>   in your messages, share the top result") so nothing can be pre-curated; the pass is still
>   always free. Also gave the parked `spotlight` block preview-only PlayerInput/HostDisplay
>   cards so the editor preview shows the game instead of a blank box (it was the one game whose
>   editor preview was empty).
> - **New-games preview/editor audit (this session):** swept every new game's editor at 1440px
>   (truth-or-share, faker, hivemind, most-likely, ballpark, buzzer, fib-finder, sketch-spot,
>   backronym, open-mic, circuit-cypher). No console errors or crashes; all phone + big-screen
>   previews render content. Truth or Share was the only blank one (now fixed).
>
> **Editor redesign + two-phase recipes + homepage rename (2026-06-02, PUSHED + DEPLOYED
> via CI).** The approved editor task is done and deployed. Three feature commits plus an
> audit/polish commit and a docs sweep. All gates green: typecheck (incl. `nuxi`), 314 tests,
> the web build; `scripts/editor-audit.mjs` shows 0 horizontal overflow at 1440/900/390.
> - **Homepage** (`index.vue`): the "Create by vibe" section is now **"Create with blocks"**
>   (kicker "Pick a lane" -> "Start from a block"); cards still link to `/editor/<block>`.
> - **Primitive exposure:** the Custom palette (`games/custom.ts`) now composes every block
>   (added quip/vote/fill/split/fibvote/buzzer; faker/accuse were already there). The editor's
>   Add panel offers **Single rounds** (guess/rate/poll/rank/draw/hivemind/most-likely/
>   ballpark/buzzer) and **Two-phase recipes** that insert a make+judge pair in one click:
>   Write & Vote (quip->vote), Mad Lib & Vote (fill->vote), Would You & Split (fill->split),
>   Lie Detector (quip->fibvote, author sets the truth), Sketch & Vote (draw->drawvote),
>   Hidden Faker (faker->accuse). Recipes are filtered to the blocks a plugin composes (a
>   single-type editor shows none; quip-clash shows just Write & Vote). Make-only blocks
>   (quip/fill/bars/faker/spotlight) and derived judges are hidden from the standalone list.
>   **This makes every first-party two-phase pattern buildable by hand, the real unlock**
>   (previously only the markdown importer could build them).
> - **Three-pane editor** (`GameEditor.client.vue`, all script logic kept, template + styles
>   rewritten): left rounds rail (chips + reorder/remove + an Add overlay), center selected-
>   round form + derived explainer, right persistent host/phone preview keyed to the selection
>   (the accordion `expanded` became `selected`). Below ~1000px it collapses to one column with
>   the preview behind a drawer + FAB; Details/Import are overlay sheets, not inline pushers;
>   Escape dismisses the topmost overlay/drawer/menu.
> - **Audit pass (this session):** confirmed all six recipe pairings match the shipped
>   flagships exactly (quip/fill/faker make -> vote/split/fibvote/drawvote/accuse judge). Fixed
>   an inaccurate derived-explainer line (it claimed "only the prompt and timer" but `fibvote`
>   also needs the truth and `vote` has a mode field) -> "the prompt, timer, and any other
>   fields". Added the Escape-to-dismiss handler for the new overlays/drawer. New
>   `scripts/editor-audit.mjs` (Playwright) drives the Add panel and checks overflow at three
>   widths incl. the drawer.
> - **Docs synced:** README (314 tests, 21 games, 14 flagships, 19 blocks), `docs/architecture.md`,
>   `docs/authoring-a-game.md` (the recipe + three-pane editor, markdown block list),
>   `packages/games/README.md`, and `CLAUDE.md` (block roster + editor recipes).
>
> **Audit of the new games + a CRITICAL roster fix (2026-06-02, PUSHED + DEPLOYED).** Played each new game with the "host screen IS the shared TV" + "few players"
> lens (the same lens that caught the Truth or Share gate). Findings:
> - **Most Likely To was broken (engine bug, now fixed).** Players never built `room.players`:
>   the roster subscriptions (`playerProfile`/`playerPing` wildcards) were in a host/viewer-only
>   branch, so `MostLikelyPlayer` showed "Waiting for players to join..." forever and **nobody
>   could vote** (every round was "a wash"). Fix: players now subscribe to the roster too (names
>   + presence are public), while `allInputs` stays host/viewer-only so answer-withholding holds.
>   This also makes any roster-reading player view reliable (it is why the Truth or Share picker
>   needed a host-pushed roster; that push is now belt-and-suspenders). Regression test added
>   (`room.test.ts`: a player sees the full roster but never another player's input). Verified in
>   a browser: all phones see the roster + vote.
> - **No big-screen spoilers** in Hivemind (count-only while writing, by design), Ballpark
>   (count-only, answer withheld until the needle), Faker (word off the big screen), Open Mic
>   (write-phase count-only), Backronym/quip->vote (`hideUntilReveal`). All clean.
>
> **Truth or Share rebuilt to the full spec (2026-06-02, PUSHED + DEPLOYED).**
> The first cut was text-only with a host "vet it first" moderation gate, which was broken:
> the host screen IS the shared big screen, so the gate showed the answer to the whole room
> anyway. Rebuilt: each turn the picker puts someone on the spot, the TARGET chooses **Truth**
> (answer in words) or **Share** (a photo), the picker then picks the prompt for that mode (or
> writes their own), the target responds (or passes, always free), and the answer/photo only
> reaches the big screen at `react`. Photos are downscaled on-device and sent over the relay
> (`/x/photo`, never S3), rendered on the host big screen only. Added an intro/rules card +
> per-phase showmanship and a spotlight-styled stage. New turn phases
> `pick -> mode -> prompt -> respond -> react -> result`. Verified: 315 tests, typecheck,
> build, and the 3-game browser smoke (intro shown, both modes offered, custom prompt, answer
> withheld until react, photo reaches the big screen over the relay). NOT pushed yet.
>
> **Faker + Open Mic + Truth or Share + audits + copy/em-dash sweep (2026-06-02, PUSHED to
> `main`, deploying via CI).** A large batch: three new flagships, two adversarial audit
> rounds, a real-browser smoke, a project-wide em-dash removal, and a pictographic-emoji
> cleanup in game reveals. All green: typecheck (incl. `nuxi`), the full suite (315 tests),
> the web build, and a 3-game real-browser smoke (`scripts/new-games-smoke.mjs`).
> - **Truth or Share (G1) shipped (text dares):** see its own entry below. Custom-flow over
>   the `/x/` transport; host-authoritative roster pushed in the turn state (so the picker
>   never depends on its own presence snapshot); moderation gate enforced by the pure tested
>   `redactTurnForPublish`.
> - **Browser smoke caught a real bug** the unit suite/build could not (custom-flow
>   orchestration lives in the Vue host): the Truth or Share `pick`/`response` `onExtra`
>   handlers parsed the wrong channel-key segment (turn index vs pid), so the picker check
>   always failed and the turn never advanced. Fixed + the smoke now drives all three games
>   end to end, including live withholding checks (Faker word stays off the big screen; the
>   Truth or Share answer is hidden until the host approves).
> - **Open Mic auto-lock fix:** the engine auto-locks a timed vote at its deadline, which had
>   stranded the host with no reveal control at `locked`; the control now shows for any
>   non-reveal voting state.
> - **Copy + em dashes:** all em dashes removed repo-wide (0 remaining); pictographic emoji
>   (trophy/crown/robot/chart/heart) removed from game reveals + the app shell in favor of the
>   `Icon` component or plain text (the monochrome check/x marks are kept as text symbols).
> - **Known presence caveat (verify on device):** in the headless multi-context smoke,
>   player-to-player presence does not propagate, so a player's own `room.players` roster can
>   lag. Truth or Share is now robust to this (host pushes the roster). **Most Likely To reads
>   `room.players` directly for its roster vote and would be affected by the same lag** if it
>   is real on devices, worth a real two-phone check.
>
> **Earlier in this batch (now part of the pushed set):** Three commits on top of the
> per-player primitive. All green: typecheck (incl. `nuxi`), the full suite, and the web build.
> - **Faker (G2) shipped**, the hidden-imposter flagship on the secret per-player primitive:
>   a `faker` make block (`assignContent` picks the imposter seeded/reconnect-safe, delivers
>   the word only to each non-faker's private address, `redactContent` strips it from the
>   public config, the host screen never shows it) + an `accuse` judge block (derived from the
>   faker round; learns the faker from the make round's withheld answer via a new additive
>   derive extension `DeriveSource.answer` + `buildDeriveContent(getAnswerKey)`; scores
>   catchers + the escaping faker; ties favor the faker; self-votes excluded; a silent player
>   is still accusable). Word pool, `[faker, accuse]` pairs, registered everywhere + Custom
>   palette + two Icon glyphs. Pure tests + a FakeHub end-to-end test.
> - **Open Mic reworked** from the thin `quip->vote(perform)` composition into the SAME
>   composition with a custom **`OpenMicHost.vue`** (a 3D standup club: new `ComedyStage.vue`
>   lazy-Three.js brick-wall stage + warm spotlight; the robot performs each anonymized bit
>   over the hardened TTS, the crowd laughs, then the room votes). New `arena.ts` `beat:false`
>   mode + `laugh()`/`rimshot()` SFX. Engine machinery reused; the generic player still drives
>   phones. TTS/WebGL need an owner on-device listen (can't assert headless).
> - **Audit fix (real withholding bug):** the engine's `reveal()` would publish a hidden-role
>   make round's `{ fakerPid, word }` answer, leaking the imposter before the accusation. Fixed:
>   an assigned answer is kept host-side (for the judge round + scoring) and **never** auto-
>   published at the make round's own reveal; the judge round unmasks it at its own reveal.
>   New engine regression test; the two integration tests assert the answer stays off the relay.
> - **Truth or Share (G1) shipped (text dares):** the directed/spotlight game, a custom-flow
>   game over the proven `/x/` transport (no new engine state). Each turn rotates a **picker**
>   who puts another player on the spot with a dealt prompt; the **target** answers in text or
>   passes (always free); the host **moderation gate** vets the answer before it hits the big
>   screen; the room **reacts**; and the picker takes a **cut** of the reactions, so the
>   optimal play is entertaining, not cruel. New `spotlight` parked block + `TruthOrShareHost`/
>   `TruthOrSharePlayer` + pure tested `truthshare.ts` (rotation, dealing, reaction tally,
>   reaction-cut scoring, and `redactTurnForPublish`, the moderation gate as a pure tested
>   rule so an unvetted answer can't reach the public turn state). Mild/spicy tiers in the
>   lobby. Registered (registry/catalog/visuals/index). **Deferred:** phone photos over the
>   ephemeral relay (with TTL + the same gate). **Known v1 limits (owner playtest):** a host
>   reload mid-show loses the in-memory turn order/scores (custom-flow, like Circuit Cypher);
>   the raw `/x/response` address is soft-readable (the gate governs what the room SEES, not
>   cryptographic secrecy).
>
> **START HERE (fresh session, 2026-06-02).** The last session's work is **pushed to `main`
> and deploying to prod via CI** (confirm the deploy is healthy, then do the Circuit Cypher
> TTS real-device listen once it is live). It shipped: the cheap-wins game batch (Backronym /
> Open Mic / Hivemind / Most Likely To / Ballpark), the **Circuit Cypher TTS fix**,
> poll/rate/rank/draw phone-reveal feedback, **C12 bookmarks**, and the **secret per-player
> content primitive** (the hidden-role foundation). All green: typecheck (incl. `nuxi`), the
> full test suite, and the web build.
>
> **Recommended next: build Faker** on the new primitive (full design is in the "Secret
> per-player content primitive" entry just below). Working rules: commit only verified work,
> in logical chunks; **plain commit messages with NO AI attribution** (no Co-Authored-By, no
> "Generated with"); no em dashes and no AI-sounding copy in UI or replies; gate "done" on
> typecheck + tests + build; push to deploy when the owner asks.

> **Secret per-player content primitive - the hidden-role foundation (2026-06-02, COMMITTED
> to `main` locally, not yet pushed).** The reusable engine capability that unlocks Faker /
> Hot Seat / (eventually) Truth or Share. The host can give each player DIFFERENT content
> for a round, delivered to each player's own private relay address so another player's UI
> never shows it, with an optional withheld answer (who the imposter is) revealed at reveal.
> - `addr.roundContentForPlayer` + the player's own `myRoundContent` subscription; `room.ts`
>   `publishAssignedIfAny` + `perPlayerContentFor`; `LoadedGame.assignContent`; the Vue
>   composable exposes `perPlayerContentFor`; the player renderer prefers it.
> - SDK: a roster-aware `assignContent(ctx) -> { perPlayer, answer }` block hook; runtime
>   `buildAssignContent`; `HostRoom` wires it. Additive (rounds without it are unchanged).
> - **Soft-secrecy caveat (documented, accepted):** the per-player address is derivable, so a
>   devtools user could read others' - the same trade-off as the existing soft two-phase
>   anonymity. Fine for casual play; not a defense against a determined cheater.
> - Integration test (`runtime/perplayer.integration.test.ts`) proves each player gets only
>   their own content and the answer is withheld until reveal.
> - **NEXT: build Faker on it** (deliberately not rushed into this session). Concrete design:
>   (1) a `faker` make block - content `{ category, word }`; `redactContent` strips `word`
>   from the public config; `assignContent` picks one imposter (seeded), gives non-fakers the
>   word and the faker a blank + "you're the faker", `answer = { fakerPid, word }`; players
>   submit a one-word clue; the HostDisplay shows only the category + a count (never the word,
>   since the faker watches the big screen). (2) an `accuse` judge block deriving from the
>   faker round - needs a small **derive extension: pass the source round's answer key into
>   `DeriveContext.sources[i].answer`** (so `accuse` learns `fakerPid`); shows the attributed
>   clues + a roster vote; scores accusers who picked the real faker and the faker if it
>   escaped (not top-voted); reveal unmasks the faker + word. (3) `faker` game = a word pool
>   via `buildConfig`. Plus REDACTION_RULES `faker: { word: '' }` (catalog test enforces it).

> **Circuit Cypher TTS - true root cause finally found + fixed (2026-06-02, COMMITTED to
> `main` locally, not yet pushed).** After several prior "fixes" that didn't
> hold, I reproduced it in a real headed browser (`scripts/tts-probe.mjs` + the instrumented
> `scripts/cypher-tts-verify.mjs`) and the per-utterance timeline showed the actual bugs:
> - **The "stuck on the title card" freeze = a single over-long utterance stalling.** The MC
>   welcome line (~194 chars) `start@21.7s … end@71.7s` - a **50-second hang**. Chrome/macOS
>   silently STOPS an utterance that speaks longer than ~15s; it goes quiet and `onend` fires
>   tens of seconds late, so the show sits frozen on one card. The short robot verses (~7s)
>   were unaffected, which is why earlier scripted checks looked "PASS". **Fix:** `chunkText`
>   in `packages/ui/src/audio/speech.ts` splits long lines into short, sentence-sized
>   utterances (none crosses the stall threshold) + a `resume()` keepalive. Unit-tested
>   (`speech.test.ts`).
> - **"Silent second robot" (Sparky quiet, Drive fine) = a per-robot voice that produces no
>   audio on the device** (an undownloaded macOS premium voice, or a network voice). Giving
>   robot A and robot B their *own* voices reintroduces this. **Fix:** both robots now SHARE
>   one reliable voice (the platform default / first LOCAL voice - most likely to actually
>   play), told apart by pitch/rate; if one robot is audible, both are. The **MC** takes a
>   *different* local voice (female-leaning), so rappers ≠ host (the owner's ask). Selection
>   is **local-only** (never the silent network "Google …" voices) and by language +
>   availability, **never by hardcoded name** (voice names differ per OS; "Samantha" isn't on
>   every Mac, and the available set even changes between `getVoices()` calls as voices load).
> - Probe on this Mac confirms: MC=Fiona, both robots=Alex (default), both produce audio
>   (`start`→`end`, no error). Why it kept regressing before: fixes were scripted-verified in
>   headless/short-line conditions that never hit the >15s stall or a device's bad voice.
> - **Still owner-side:** a real two-device on-device playtest (the audio itself can't be
>   asserted headlessly), then deploy. Dev server picks up the fix via HMR (reload the host).

> **C12 bookmark / save games (2026-06-02, COMMITTED to `main` locally, not yet pushed).**
> Logged-in users can save a game and find it again. New `bookmarks` table (user_id,
> game_id, created_at), repo CRUD (`listBookmarkedGames` is visibility-filtered so a game
> that later goes private drops out instead of leaking its title), `POST`/`DELETE
> /api/games/[id]/bookmark` + `GET /api/me/bookmarks`, a `bookmarked` flag on the `/g/[id]`
> GET, a login-gated optimistic **Save** toggle on the detail page, a **/saved** page and a
> nav link. Anon endpoints 401 (smoke-checked); typecheck + build green. The authenticated
> add/list flow is owner-verified on deploy (no headless auth/DB harness here), as with C10/C11.

> **E18 phone-reveal feedback (2026-06-02, COMMITTED to `main` locally, not yet pushed).**
> Closed the backlog gap where poll/rank/rate/draw showed only a generic "check the big
> screen" at reveal. Added a `revealSummary` + `PlayerReveal` to each (purely additive - the
> engine already publishes any block's `revealSummary` and the generic player renderer mounts
> its `PlayerReveal`): **poll** = you-vs-room top pick; **rate** = your score vs the room
> average per category (on the round's own scale); **rank** = the consensus order with your #1
> called out; **draw** = your own drawing back on your phone (`DrawThumb`). Pure summaries
> unit-tested (`blocks/reveals.test.ts`). 279 tests, typecheck (incl. `nuxi`), build all green.

> **Cheap-wins game batch - five new flagships (2026-06-02, COMMITTED to `main` locally,
> not yet pushed).** Adapted from an external idea dump; the brief was the
> highest games-per-effort set with no engine changes. Verified with `pnpm typecheck`
> (incl. `nuxi`), the full suite (**225 tests**, +14 new), and the web build.
>
> - **Backronym** (`games/backronym.ts`) and **Open Mic** (`games/openmic.ts`) are pure
>   `quip → vote` compositions, the Quip Clash spine reused: Backronym generates a
>   familiar initialism (NASA/TPS/LOL) per round from a seeded pool; Open Mic flips
>   `vote.perform` on so the robots read each one-liner aloud (TTS) before the vote. No
>   new blocks.
> - **Hivemind** (new `hivemind` block) is the "read the room" game Doot lacked: free-text
>   answers cluster by a normalized key; you score by matching the crowd
>   (`(k-1)/(total-1)`, a lone answer scores 0). Reveal stacks the emergent clusters.
> - **Most Likely To** (new `mostlikely` block) is roster-driven: the vote options ARE the
>   lobby (the player/host views read `room.players`; scoring resolves names from
>   `ctx.players`, with the chosen name captured on each vote so a nominee who leaves is
>   still named). No `derive`, so it stays editable (the two-phase "needs a source"
>   validation doesn't apply). The most-nominated player takes the dubious crown.
> - **Ballpark** (new `ballpark` block) is closest-guess numeric trivia: the true number is
>   withheld (`answerOf`/`redactContent` + a `REDACTION_RULES` entry), scoring is
>   self-scaling (worst guess in the round = 0, closest = full + a bullseye bonus), and the
>   reveal animates a CSS needle/dial to the answer with every guess marked. This is the
>   first of the pitched "closeness" family (Spectrum / Over-Under would reuse the block,
>   but each needs a per-player role, so they're deferred).
> - All five are **flagships** (manifest `flagship` + `buildConfig` content pools +
>   `roundOptions`), registered in `registry.ts` / `catalog.ts` / `visuals.ts`, with the
>   three standalone blocks added to the Custom editor palette. Pure scoring is unit-tested
>   (`hivemind`/`mostlikely`/`ballpark` `.test.ts`). The catalog sync + redaction-coverage
>   tests pass, so registration is provably consistent.
>
> **Audit + hardening of the batch (same session).** An adversarial pass over the above,
> then fixes + deeper tests (272 tests total, all green; typecheck incl. `nuxi`; build):
> - **Editor-preview crash fixed (real bug).** `injectDootRoom()` THROWS with no provider,
>   and Most Likely To is the first *non-derived* block whose `PlayerInput` injects the room
>   (for the roster), so the editor's bare phone-preview would have crashed on it. Added
>   `PlayerPreview.client.vue` (mirrors `HostPreview`: a scoped mock room, here with a
>   sample roster so roster inputs render real chips) and routed the editor's phone preview
>   through it. The big-screen previews were already safe (HostPreview renders the open
>   state; the reveal/`roundRevealFor` computeds are lazy and never evaluated there).
> - **Ballpark needle made outlier-robust.** A single wild guess (999999) would blow out the
>   dial and squash everyone else; the dial radius is now ~5x the *median* error capped at
>   the worst guess, so a tight pack stays tight and outliers clamp to the track edge.
>   `ballparkBounds` is exported + unit-tested.
> - **End-to-end integration tests** (`runtime/cheap-wins.integration.test.ts`) wire a real
>   `RoomRuntime` (host + players over a fake relay) exactly like `HostRoom.client.vue`.
>   Proven through the engine: **Ballpark's answer is never on the relay before reveal**
>   (redacted config + no `roundAnswer` until reveal), then published at reveal with the
>   needle summary naming the closest guesser; Most Likely To's roster vote reveal resolves
>   real names; Hivemind's free-text clusters publish with the crowd answer on top.
> - **Markdown / MCP authoring** for the three new blocks: parser cases (`## hivemind`,
>   `## mostlikely` / `## most likely`, `## ballpark` with `answer:`/`unit:`), the
>   `doot_format_guide` MCP text, `docs/markdown-games.md`, and parser tests. So the Claude
>   connector can now author Ballpark/Hivemind/Most Likely To games, not just play them.
>
> Still ahead (the bigger adapted ideas the owner ranked behind this batch, in
> `docs/BACKLOG.md §G`): **Truth or Share** (a new directed/spotlight engine primitive +
> photo-share-over-relay + consent/moderation), **Faker** (wire the reserved `assignment`/
> `promptFor` per-player path), Doodle Chain (a pipeline primitive), and the rest.

> **Deep-audit + hardening pass (2026-06-02, SHIPPED + DEPLOYED). Three review rounds
> on top of the UX pass below.** Verified after each deploy.
>
> - **Results carousel, final form.** Replaced the bottom tab bar (long poll-prompt
>   labels wrapped off-screen): now an arrow on each side, the current section title in
>   a pill on top (an `aria-live` region), one section in view, and the stat strip pinned
>   at the bottom. The leaderboard (winners) is page 1 when a game scores; poll/rank
>   games have no scored winner and open on the first breakdown. `GameResults.vue`.
> - **Claude connector gates done:** a plain-language **privacy policy** (`/privacy`) and
>   **terms of service** (`/terms`), both footer-linked, plus an SVG **favicon**. Still
>   needed for the directory: a square logo asset, public docs with 3+ examples, a
>   reviewer test account, accepting the directory terms, and the owner-run claude.ai
>   connect+save handshake (cannot be automated).
> - **Circuit Cypher, root-caused and fixed.** "Wouldn't auto-advance scenes / no voices"
>   was three things: every announcer beat sat on a flat ~18s cap when the voice fired no
>   start/end events; the first `speak()` fired from a timer, which some browsers drop;
>   and a host reload built an empty bracket before the relay re-delivered inputs. Fixes:
>   an `onStart` watchdog plus a length-scaled cap (with headroom for the long welcome
>   line); `primeSpeech` inside the Start/unmute gesture; a reload guard that waits for
>   the verse count to settle. The MC is now pinned to a **female voice** (Samantha and
>   equivalents) by name instead of trusting the unreliable platform `default` flag.
>   Verified end to end with an instrumented 2-player battle (every line spoken, full
>   sequence runs).
> - **Audit fixes:** the SSRF guard now actually blocks IPv6-literal image URLs (a
>   bracket-strip bug had made the IPv6 blocklist dead code); idle players notice the host
>   leaving (a presence ticker re-evaluates time-based `hostPresent`); accessibility
>   (filter `aria-pressed` + groups, results `aria-live`, progressbar label); a derived
>   round's `from` survives save/load; results confetti fires once; a draw-only results
>   screen no longer renders blank; long phone names truncate. Docs synced (README
>   counts, CLAUDE block list, connector tool table).
> - **Cruft removed:** the never-imported `vue3-pixi` dep, the dead `RobotBattle.vue`, and
>   two scratch scripts.
>
> **Known limitations the audits surfaced (architectural, not one-line bugs):**
> - **Delegated-driver forge.** When "let a player drive" is on, a forged drive command
>   (the host trusts a client-asserted `pid`, derivable from the public room+name) can
>   trigger an early `reveal` and publish the answer key. Inherent to the trustless public
>   relay + login-free identity; the real fix is a driver PIN (an out-of-band secret shown
>   on the host screen, entered on the co-host's phone) or keeping `reveal` host-only.
> - **Soft two-phase anonymity.** A spectator reading the raw relay can correlate an
>   identical submission in a vote gallery back to its per-player input address and recover
>   the author before reveal (drawvote/fibvote/split). Not an answer-key leak, and not a
>   stated invariant; inherent to per-player inputs + reconnect-by-name on a public relay.
> - **Extreme prompt overflow.** A pathological 600+ char prompt can scroll past the host
>   control bar (the column `overflow` was removed because it clipped the selected answer's
>   glow). Acceptable trade for the common case; a `prompt` `.max()` would close it.

> **UX pass after the first real Claude-built games (2026-06-02, SHIPPED + DEPLOYED).**
> Fixes from hosting and publishing real MCP-authored games:
>
> - **Host screen fits long prompts.** A paragraph-length prompt no longer overflows
>   the stage: the prompt font scales down by length and each stage column is
>   height-contained (`GameHost.vue`), so the question image is not clipped and the
>   control bar is not overlapped. Verified at 1920x1080.
> - **Results carousel.** The host results screen pages one section at a time with a
>   tab bar (and left/right arrow keys), adapting to however many sections there are,
>   so a game with several breakdowns still fits the screen (`GameResults.vue`). The
>   phone (`compact`) view still stacks and scrolls. Verified at host resolution.
> - **Cover images on cards.** `GameCover` gained an optional `image` prop; explore,
>   Your Games, and the home rails now show a game's uploaded cover (dead URL falls
>   back to the gradient art). The detail-page cover shows the whole banner (contain on
>   a neutral backdrop) instead of cropping. Verified live on the Tuvix game card.
> - **Bylines never leak the email-derived name.** Once an author claims an `@handle`,
>   the saved-game list/detail payloads drop the display name entirely
>   (`games-repo.ts`, `[id].get.ts`), so a gmail-derived name can't appear in a public
>   byline.
> - **Draw rounds can vote.** A markdown/MCP `## draw` round with `vote: true` expands
>   to draw-then-vote (draw with the gallery hidden, then a `drawvote` round derived
>   from it); best drawing wins points and tops the leaderboard. Reuses the existing
>   `drawvote` block. Parser + tests + MCP `doot_format_guide` + `docs/markdown-games.md`
>   updated.
> - **Create page:** ready-made games use the GameCover art cards; the blocks/Custom
>   row keeps its compact `GameTypeIcon` cards (owner preference).
> - **MCP now also has `list_my_games` + `update_game`** (owner-checked) so Claude can
>   list and edit games it saved, not only create them.
>
> Still open from this pass: privacy-policy page + favicon/logo (the Claude connector
> directory submission hard gate).

> **Connect with Claude (MCP) + the plugin-authoring foundation. SHIPPED + DEPLOYED +
> AUDITED (2026-06-02).** A long session. Full plan in
> [`docs/plugin-authoring-roadmap.md`](./docs/plugin-authoring-roadmap.md); the
> Claude integration in [`docs/connect-claude.md`](./docs/connect-claude.md).
>
> - **Connect with Claude (the AI rail; owner decision: no Doot-paid AI, no heavy "AI"
>   copy).** Doot runs a Model Context Protocol server at `https://doot.games/mcp`. v1
>   was no-auth read-only tools; it is now **OAuth account-linked**: a user adds the
>   connector in claude.ai (or `claude mcp add`), links their Doot account, and Claude
>   builds a game and **saves it straight to the account**. Doot runs no inference and
>   stores no keys. Built on better-auth's **`mcp` plugin** (oidc provider: authorize/
>   token/consent/DCR) in `server/utils/auth.ts`; discovery at the two `/.well-known/`
>   routes; the endpoint in `server/routes/mcp.ts` wrapped in `withMcpAuth`; consent
>   screen at `/oauth/consent`. Tools: `list_game_types`, `doot_format_guide`,
>   `validate_doot_game` (reads), `save_game`, `upload_image` (writes), all annotated.
>   **Verified in prod:** existing email/password auth still works (bad creds 401 not
>   500), oidc tables created on the real DB, discovery + dynamic client registration +
>   401-challenge all work. **The full claude.ai connect+save handshake needs the owner
>   to test** (sign in, Allow, ask Claude to build+save); I can't drive claude.ai.
> - **Migration gotcha (again, the same family as C11).** `auth-migrate.ts` ran
>   better-auth's schema as one `runMigrations()` batch that **aborts on the first
>   failure**, and the username UNIQUE-column ALTER always fails on the existing prod
>   `user` table, so the new **oidc tables would never be created in prod** (dev worked
>   only because it is a fresh DB). Fixed: run `compileMigrations()` **statement by
>   statement**, each in try/catch; benign errors (already exists / UNIQUE ALTER) are
>   ignored, anything else is logged loudly. Proven on a simulated prod DB (drop oidc
>   tables, keep `user`, restart: tables come back, signin still works).
> - **`upload_image` is SSRF-guarded** (`server/utils/fetch-image.ts`): Claude hands an
>   https image URL, Doot fetches it (https only; blocks private/loopback/link-local/
>   metadata/CGNAT/NAT64/6to4, re-checked per redirect; image content-type; 5MB streamed
>   cap) and re-hosts it to Spaces via the new `storage.uploadObject`. Returns a media
>   URL for a round's `image:` field. SSRF rejections unit-verified.
> - **`/mcp` write throttle.** The per-IP middleware does not cover `/mcp` and Claude
>   shares egress IPs, so `save_game`/`upload_image` are throttled **per user** (30/min)
>   in `mcp.ts`. `save_game` also validates through `gameInputSchema` (title<=120,
>   rounds<=50) and passes the parsed theme through.
> - **Claude connector directory.** Custom-connector-by-URL works today. To be *listed*
>   in the in-app directory: a free form submission, ~2 weeks. Doot already meets the
>   hard parts (OAuth/PRM/DCR/PKCE, Streamable HTTP, tool annotations, read/write split).
>   **Still needed:** a **privacy policy** page (hard gate), ToS, a square logo + favicon
>   on doot.games, public docs with examples, a test account. See `docs/connect-claude.md`.
> - **Plugin sandbox foundation (untrusted external plugins; not wired to users yet).**
>   `plugins.doot.games` is a live, locked-down static origin (separate origin, strict
>   CSP, `connect-src 'none'`; safe as a subdomain only because auth cookies are
>   host-only, see [[doot-plugin-origin-cookie-coupling]]). `@doot-games/plugin-bridge`
>   is the shipped, hardened, unit-tested host<->plugin postMessage bridge (source-pinned
>   handshake, flood/size/phase caps, protocol version). The standalone dev harness in
>   `examples/external-plugin/` **now actually runs** (`npx vite` -> `/dev-host.html`);
>   it had two latent blockers (zod not resolvable from the folder, null-origin frame
>   CORS) that are fixed. Design: `docs/external-plugins.md`.
> - **Tier 0 authoring (the non-coder primary user).** (1) Big-screen **host preview** in
>   the editor (a Phone / Big screen toggle; host views render through a scoped mock-room
>   provider, `HostPreview.client.vue`, because they inject the room). (2) **Create is a
>   template gallery** now: "Remix a ready-made game" (flagships, pre-filled) vs "Build
>   from blocks" vs "Build it with Claude" -> `/connect`. Both reuse the existing catalog
>   split + editor seeding; no server changes.
> - **Style rule from the owner: NO em dashes, no AI-sounding copy** (UI and replies).
>   See [[doot-no-emdash-no-ai-voice]].
> - **Remaining roadmap work** (in `docs/plugin-authoring-roadmap.md`, build order):
>   wire the bridge into the app + serve a real plugin shell on the origin; first-party
>   blocks through the iframe (needs protocol extension); Tier 2 `CanvasBlock` (Pixi/
>   Three rounds); Tier 3 in-app `@vue/repl` editor; Tier 1 custom-renderer registry;
>   external registration/registry. Smaller follow-ups: one-click "Remix" on Explore
>   (most public games are `forkable: false`); richer block starter content; the
>   consent-screen client name + an expired-token/unused-DCR-client sweep (audit notes).
>
> **C11 user profiles + Circuit Cypher TTS fix - SHIPPED + DEPLOYED + AUDITED (2026-06-01).**
> Three commits to `main`, all live on https://doot.games and verified in production
> (`/api/health`, the profile endpoints, the validation hook, both robot verses).
> - **C11 profiles (C11 in `docs/BACKLOG.md`).** Public creator identity via
>   better-auth's `username` plugin: **`@handle` vanity URLs** (`/u/@handle`) + a new
>   `bio` field. **Migration gotcha (burned real time):** SQLite can't `ALTER TABLE
>   ADD COLUMN username` with the plugin's UNIQUE constraint on the existing prod
>   `user` table, and `auth-migrate.ts` swallows migration errors, so the columns would
>   silently never appear. Fixed with a manual additive ALTER (`username`,
>   `displayUsername`, `bio` as **camelCase** columns + a separate `CREATE UNIQUE INDEX`)
>   in `auth-migrate.ts` after `runMigrations`. There is **no `setUsername`** API in
>   v1.6.12 - set the handle via `authClient.updateUser({ username, displayUsername })`;
>   availability is `authClient.isUsernameAvailable`. New: `/account` editor, public
>   `/u/[handle]` page, `GET /api/users/[handle]` (email-free), `listPublicGamesByOwner`,
>   `authorsFor` returning `{name,handle}`; C10 bylines now link to `/u/@handle` via a
>   stretched-link card pattern (a card can't nest an `<a>` in its `<a>`). Verified
>   end-to-end on a running server.
> - **Circuit Cypher: the second robot was silent + MC intros were cut off.** Root
>   cause of the silence: the code gave each robot a *different platform voice by index*;
>   the 2nd robot's voice (index 1) produced no audio on the host machine (proven: the MC
>   spoke fine immediately before the silent verse, so it was the voice, not an engine
>   wedge). Fix: speak the MC + both robots through **one** reliable voice
>   (`reliableVoice()` in `packages/ui/src/audio/speech.ts`, prefers default/local),
>   differentiated by **pitch/rate**, not by gambling on a 2nd voice existing. Also kept
>   the one real hardening (Chrome drops a `speak()` issued the same tick as a `cancel()`
>   of active speech, so defer the speak when interrupting). MC cutoff fixed by advancing
>   talky steps on the announce's `onDone` (`sayThenAdvance`) instead of a fixed timer.
>   Confirmed in a headed browser (`scripts/cypher-tts-verify.mjs`): both verses speak,
>   MC lines complete, nothing dropped.
> - **Audit hardening (adversarial audit of the above).** Two MED issues found + fixed:
>   (1) `name`/`bio`/`image`/`displayUsername` were only capped client-side, so a direct
>   `POST /api/auth/update-user` could store a multi-MB bio/name (storage DoS) or a non-URL
>   avatar rendered as `<img src>` on every public profile - now bounded by a better-auth
>   `hooks.before` middleware (`validateProfile` in `server/utils/auth.ts`, http(s)-only
>   avatar); (2) `/u/@handle` overflowed horizontally on a phone when a name/handle was long
>   - fixed with `min-width:0` + `overflow-wrap`. Also: `displayUsername` is pinned to the
>   normalized handle (no impersonation), the public API no longer returns the internal
>   account id, and the Home-rail stretch-links got action-verb aria-labels. **Confirmed
>   clean by the audit:** email never exposed, no SQL injection, visibility enforced
>   (private games never on a profile), migration idempotent, the Cypher state machine
>   can't stall. Verified live (oversized name/bio → 400, `javascript:` avatar → 400).
>
> **Quick-wins batch - SHIPPED + DEPLOYED (2026-06-01).** Four increments, each
> verified (200 tests, full typecheck incl. `nuxi`, web build) and pushed to `main`:
> - **Circuit Cypher visual polish** - verse-box overflow fix (one row per line,
>   flex-wrapped), a new `Icon` component in `@doot-games/ui` replacing every emoji
>   (**standing rule: use `Icon`, never emoji**), slower mockup-matched pacing (`PACE`
>   table), the robot-freeze-when-muted fix (motion now runs off a local clock, not
>   `audio.beatPhase()` which is `0` when muted), camera pulled back, and an opening
>   "CIRCUIT CYPHER" title sequence. (Headless Playwright throttles background-tab
>   `setTimeout`, so verify timing-sensitive UI on a real foreground browser.)
> - **C10 author display name** - community games + `/g/<id>` credit the author by
>   display name (better-auth `user.name`, never the email). New `server/utils/users.ts`
>   batch-resolves owner ids to names; shown on `/g/<id>`, Explore, and the Home rails.
> - **Fib Finder** (Fibbage flagship) - new `fibvote` block: a `quip` make round of lies
>   plus an injected, withheld `truth`, dual-axis scoring (find the truth + fool the
>   room). 20-fact brand-free pool. The truth is an answer key (stripped via
>   `redactContent` + `REDACTION_RULES`).
> - **Sketch & Spot** (Drawful flagship) - new `drawvote` block: vote on a gallery of the
>   room's drawings (Draw block in the two-phase loop), derived from the prior draw
>   round's strokes. 16-prompt pool. `scripts/sketch-smoke.mjs` drives the Pixi canvas +
>   gallery vote end to end.
>
> Doot now ships **14 games incl. 7 flagships**. Both new flagships were verified end to
> end in a real browser (`scripts/playtest.mjs` gained a `fib-finder` scenario + an
> `ONLY=` filter; `scripts/sketch-smoke.mjs` is new) with host + phone screenshots.
>
> **Consumer-polish round (2026-06-01).** Shipped + deployed after the audit:
> - **Circuit Cypher robots went silent for reduced-motion users** (the host conflated
>   `prefers-reduced-motion` with muted). Reduced motion now only calms animation; audio
>   stays on. Also hardened TTS (`warmUpSpeech` primes voices; a `resume()` kick guards
>   Chrome's paused bug), gave a longer, mode-aware opening title line, and live-perform
>   mode now calls the human to the mic in the announcer voice with a slightly longer count.
> - **Host lobby, TV-friendly:** bigger checkboxes/labels/selects; **"Let the first to join
>   drive" now defaults on** (Circuit Cypher and the generic GameHost); a new **"turn off
>   round timers" checkbox** on the generic host page (timers on by default; off nulls every
>   round timer so nothing auto-locks, host/driver advances by hand). Wired in
>   `HostRoom.client.vue` via a `dootTimersOff` provide/inject + config reshape.
> - **Sketch & Spot:** draw timer 120s; the vote gallery scales tile size to the crowd
>   (down to a small min for 20+) and caps height with scroll so a full room fits.
> - **No-emoji sweep finished:** the last UI emoji (GameHost/GamePlayer controller, VoteHost
>   mic, BarsPlayer robot, Buzzer bell) are now `Icon` glyphs (added a `bell` glyph).
> - **Per-game covers:** each Game From Doot got a bespoke `GameCover` motif + palette.
> - **E16 robustness (partial):** the host page gained a **"turn off round timers"** toggle
>   and an **"advance as soon as everyone has answered"** toggle (auto-locks the round when
>   all eligible players are in; host still controls reveal/next). Both on the generic
>   `GameHost`, **on by default**, host-tick-driven; Circuit Cypher keeps its own timing.
>   Also fixed a `warmUpSpeech` listener leak.
>
> **Two intentional default-ON behavior changes this round** (both toggleable in the lobby):
> "Let the first to join drive" (the first player auto-drives) and "advance when everyone's
> answered" (rounds auto-close on full submission). If either should be opt-in instead, flip
> the `ref(true)` defaults in `GameHost.vue` / `CircuitCypherHost.vue`.
>
> **Audit pass (2026-06-01, follow-up).** Adversarial review of the new blocks confirmed
> the withholding/anonymization/scoring/determinism invariants hold. Fixes applied: the
> draw block gained a `liveGallery` flag (default on) and **Sketch & Spot turns it off so
> the make-round gallery is hidden on the big screen until the vote** (it was spoiling the
> blind vote, since `DrawHost` shows drawings live for the standalone Draw game); FibReveal
> now computes "you fooled N" by author id (correct for duplicate lies) via an `authors`
> map added to the reveal summary; reveal verdicts got `aria-live`; draw-vote thumbnails
> got distinguishing accessible names (`DrawThumb` `label` prop); the empty-truth
> degenerate bar is suppressed; the draw-vote 0-vote "winner" is gated; the catalog
> redaction-sync test now covers `redactContent` blocks (not just `answerOf`). Also:
> **Games From Doot list alphabetically on Home + Explore.**
> Next per `docs/BACKLOG.md`: robustness (E16), then D14 the gameshow.

> **D13b Circuit Cypher tournament + full animated 3D battle - SHIPPED + DEPLOYED (2026-05-31).**
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
> socket connected** - a custom-flow host subscribes from `onMounted` (pre-connect), so
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

> **D13 Circuit Cypher tournament - started (2026-05-31).** Shipped + tested foundations (no user-facing change yet, all additive): **`buildBracket`** (round-robin pairing so everyone battles, capped for big rooms), **`tallyBattle`** + **`headToHeadPoints`** (1v1 matchup tally + Mad Verse City payout), a **`RobotBattle`** two-robot face-off view, and the **battle transport** the custom flow needs (`room.publishExtra`/`onExtra`, a `/<room>/x/<key>` custom relay channel with wildcards, also the cheer channel). **Remaining = D13b**, the custom tournament components (`CircuitCypherHost`/`Player`): wire the bracket + host-driven matchup sequencing (perform A -> perform B -> vote -> result) over the battle channel, then layer cheers/live-perform/Tone.js beat. Full plan in `docs/flagship-games.md` section 8 ("Build status").

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
