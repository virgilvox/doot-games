# Handoff

Snapshot of where Doot stands, for the next session or contributor. Pair with [`Doot-PRD.md`](./Doot-PRD.md) (the spec), [`CLAUDE.md`](./CLAUDE.md) (conventions), and [`docs/`](./docs).

_Last updated: 2026-06-03. Branch: `main` (the GitHub **default** branch; every push to
`main` deploys to prod via CI, no staging). Everything on `main` is **pushed and deployed**
(verified live: `doot.games` + `stats.doot.games` 200). Any "committed locally, not yet
pushed" notes in the older entries below are superseded._
>
> _Deploy note: the Docker base image is now **digest-pinned** (`docker/Dockerfile`, a
> `NODE_IMAGE` ARG), so a surprise upstream `node:22-alpine` tag change can't silently alter
> or break a deploy._

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
