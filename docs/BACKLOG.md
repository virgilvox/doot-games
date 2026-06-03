# Backlog - remaining work

The running tracker of what is **not yet built**, verified against the code on
2026-06-01 (after D13b Circuit Cypher shipped). Pair with `HANDOFF.md` (current
state) and `docs/flagship-games.md` (designs). Items are roughly ordered within
each group; `[size]` is a rough effort hint.

## Done (for context, do not redo)
- Consumer bugs A1–A5, author features B6–B9.
- 21 games incl. 14 flagships; the catalog IA; saved games + optional auth + uploads.
- **Editor redesign + two-phase recipes** (2026-06-02) - the schema editor is a
  three-pane layout (rounds rail + selected-round form + persistent host/phone
  preview) whose Add panel inserts single rounds or one-click make+judge "recipes"
  (Write & Vote, Mad Lib & Vote, Would You & Split, Lie Detector, Sketch & Vote,
  Hidden Faker), so every first-party two-phase game is buildable by hand, not only
  via markdown. Homepage "Create by vibe" -> "Create with blocks". See HANDOFF.
- **D13 Circuit Cypher** - full 3D animated rap-battle tournament (custom flow), MC
  voice, per-player verses, live-perform mode, co-host driving. Deployed. (Polish
  follow-ups tracked under "Circuit Cypher polish" below.)
- **C10 author display name** - community games and `/g/<id>` credit the author by
  display name (better-auth `user.name`, never the email). Deployed.
- **Fib Finder** (Fibbage) - new `fibvote` block: lies + an injected withheld truth,
  dual-axis scoring (find the truth / fool the room). Deployed.
- **Sketch & Spot** (Drawful) - new `drawvote` block: vote on a gallery of the
  room's drawings (the Draw block in the two-phase loop). Deployed.
- **Cheap-wins game batch** (5 new flagships, committed to `main` locally 2026-06-02, not
  yet pushed): **Backronym** + **Open Mic** (pure `quip→vote` compositions; Open Mic
  uses `vote.perform` TTS), **Hivemind** (new `hivemind` block, match-the-crowd),
  **Most Likely To** (new `mostlikely` block, roster-as-options), **Ballpark** (new
  `ballpark` block, closest-guess numeric trivia + needle reveal + withheld answer). See
  HANDOFF for details; 14 new tests, catalog/redaction sync verified.

---

## C. Social / discovery
- [x] **C10. Publisher / author name** on community games + the `/g/<id>` detail page
  (display name, never the email). Shipped: `server/utils/users.ts` resolves names
  from better-auth's `user` table; shown on `/g/<id>`, Explore, and Home rails.
- [x] **C11. User profile pages** + a profile editor (display name, avatar, bio); the
  profile lists that user's public games. Shipped: better-auth `username` plugin gives
  `@handle` vanity URLs (`/u/@handle`) + a `bio` additionalField (both via a manual
  SQLite-safe ALTER fallback in `auth-migrate.ts`, since SQLite can't ADD a UNIQUE
  column to the existing `user` table). `/account` editor (display name, @handle with
  live availability + reserved-name guard, avatar upload/URL/monogram, bio ≤280);
  public `/u/[handle]` page (avatar/name/@handle/bio + their public games, 404 unknown);
  `GET /api/users/[handle]` (never leaks email); C10 bylines on `/g/<id>`/Explore/Home
  now link to `/u/@handle` (stretched-link cards); nav shows Account + a "finish your
  profile" nudge. Verified end-to-end on a running server (handle claim/normalize,
  reserved/length rejection, public games shown, private excluded, no email leak, 404).
- [x] **C12. Bookmark / save games** so a logged-in user can find them again. Shipped (local,
  not yet pushed): a `bookmarks` table (user_id, game_id), repo CRUD
  (`addBookmark`/`removeBookmark`/`isBookmarked`/`listBookmarkedGames`, the listing
  visibility-filtered so a now-private game drops out), `POST`/`DELETE
  /api/games/[id]/bookmark` + `GET /api/me/bookmarks`, a `bookmarked` flag on the `/g/[id]`
  payload, a Save toggle on the detail page (optimistic, login-gated), a `/saved` page and a
  nav link. Anon endpoints 401; typecheck + build green (authed flow owner-verified on deploy).

## D. Flagship depth / more content
- [ ] **D14. The full "What, You Didn't Know That?" gameshow** (`docs/flagship-games.md`
  §9) - the big remaining flagship-depth item, analogous to what D13 did for Circuit
  Cypher: the **4-contestant panel + audience steal** (custom components; first audience
  member to buzz in correct takes the lowest contestant's seat + points), a **quick-draw
  tiebreaker** (reuse `draw`), a **final lightning round**, and the **specialty content
  packs** (actor photos via option images, poorly-described plots, a **theme-song
  audio-clip block**, macguffins, misheard lyrics, Six Degrees of Kevin Bacon…). `[large]`
- [x] **Fib Finder** (Fibbage) - shipped. `quip` → new `fibvote` block (lies + an
  injected withheld truth, dual-axis scoring). 20-fact pool; verified end to end.
- [x] **Sketch & Spot** (Drawful) - shipped. `draw` → new `drawvote` block (vote on a
  gallery of the room's drawings). 16-prompt pool; verified end to end
  (`scripts/sketch-smoke.mjs` drives the Pixi canvas + the gallery vote).
- [ ] **The Big Reveal** (Talking Points) - the stretch capstone: a presenter improvises
  over slides an Assistant feeds live; the crowd taps up/down. Needs a continuous
  reaction/feed channel - now more feasible since `publishExtra`/`onExtra` + the
  `/x/drive` pattern exist. `[large]`

### Circuit Cypher polish (D13 follow-ups)
- [ ] Real **two-phone, on-device** playtest (touch + device WebGL/audio/TTS). `[testing]`
- [ ] Optional **themed arena colors** (currently the deliberate neon cyan/magenta battle
  palette; could derive from theme accents). `[small]`

## E. Roadmap
- [ ] **E16. Robustness** (`docs/flagship-games.md` §6) - partially wired:
  - [x] a host **"turn off round timers"** toggle (nulls every round timer) and an
    **"advance as soon as everyone has answered"** toggle (auto-locks the round when
    all eligible players are in; host still controls reveal/next). Both on the generic
    host page (GameHost); Circuit Cypher keeps its own choreographed timing.
  - **timeout safety net**: auto-fill an unsubmitted free-text round at 50% (no dead air);
  - **content-filter tiers** (off / moderate / strict) + family/adult prompt tracks;
  - **audience-as-discounted-bloc** voting (`audienceWeight` exists in `scoring.ts` but is
    not wired into any game);
  - tie handling (split / co-crown) + custom prompt packs via a share code.
- [ ] **E18. Smaller engine gaps:**
  - [x] `PlayerReveal` everywhere - added to **poll / rank / rate / draw** (poll: you-vs-room
    top pick; rate: your score vs the room average per category; rank: the consensus order
    with your #1 called out; draw: your own drawing back on your phone). Pure `revealSummary`
    unit-tested (`blocks/reveals.test.ts`); committed to `main` locally, not yet pushed.
  - own-answer hiding does not fire for **fill / split** votes (wire the reserved
    `assignment` / `promptFor` per-player path, currently unused by the renderer);
  - **admin role** + DB-backed official games + versioning.
- [ ] **E15. External-plugin runtime** - sandboxed iframe on a separate `plugins.doot.games`
  origin + a typed postMessage bridge + manifest-by-URL with a SHA pin. Security-critical;
  designed in `docs/external-plugins.md`. `[large]`
- [ ] **E17. Infra:** OAuth / magic-link (better-auth config); **Postgres** for
  multi-instance scale (driver behind `useDb()`); **upload hardening** (presigned-POST
  size policy + content-type enforcement).

## F. Claude connector directory submission
- [x] Hard gates done: **privacy policy** (`/privacy`), **terms of service** (`/terms`),
  **favicon** (`/favicon.svg`); OAuth/PRM/DCR/PKCE, Streamable HTTP + 401 challenge, tool
  annotations, read/write split, consent screen. (See `docs/connect-claude.md`.)
- [ ] A dedicated **square logo** asset for the submission form. `[small]`
- [ ] **Public docs** with 3+ usage examples + a reviewer **test account**. `[small]`
- [ ] Accept the Anthropic Software Directory Terms at submission; run the live
  **claude.ai connect+save handshake** (owner-only, cannot be automated). `[owner]`

## Known security/architecture limitations (from the 2026-06-02 audits)
- [ ] **Delegated-driver forge.** With "let a player drive" on, a forged drive command
  (host trusts a client-asserted `pid`, derivable from the public room+name) can force an
  early `reveal` and publish the answer key. Inherent to the trustless public relay; fix
  is a driver PIN (an out-of-band secret) or keeping `reveal` host-only. `[medium]`
- [ ] **Soft two-phase anonymity.** A relay reader can correlate an identical submission
  in a vote gallery to its per-player input and unmask the author before reveal
  (drawvote/fibvote/split). Not an answer-key leak; document as best-effort or use opaque
  per-round input keys. `[medium]`
- [x] **Extreme prompt overflow.** Closed (committed local, not yet pushed): a shared
  `PROMPT_MAX = 400` + `promptText()` helper in the sdk, used by every prompt-bearing block,
  so the cap lives in one place. The editor form enforces it (a `maxlength` + live counter on
  the prompt textarea, via the introspector's new `maxLength`) and blocks save on overflow,
  and the markdown/MCP parser clamps `prompt`/`voteprompt` with a warning. New tests: introspect
  `maxLength`, the markdown clamp.

## G. Adapted game ideas (remaining, ranked behind the cheap-wins batch)
From an external idea dump; the cheap-wins batch (Backronym/Open Mic/Hivemind/Most Likely
To/Ballpark) shipped first. These need new primitives, so they're real builds, not
compositions. (**Open Mic** was later reworked from the thin `quip->vote(perform)` composition
into the same composition with a custom 3D standup-club host: `ComedyStage.vue` +
`OpenMicHost.vue` + hardened TTS. Committed local, not yet pushed.)
- [x] **G1. Truth or Share** - the owner's headline idea, now built to the full spec: the
  TARGET chooses **Truth** (answer in words) or **Share** (a photo), the picker then supplies
  the prompt for that mode (or writes their own), and the answer/photo only hits the big
  screen at `react` (no broken "host vets it privately" gate, since the host screen IS the
  shared TV; consent is the target's own choice + a free pass). Photos are downscaled
  on-device and sent over the relay (`/x/photo`, never S3), shown on the host big screen only.
  Added an intro/rules card + per-phase showmanship and a spotlight stage. Earlier text-only
  cut below, superseded:
- [~] **(superseded) G1 text-dares cut** - the first pass shipped text-only with a host
  moderation gate (committed
  local, not yet pushed): the **directed/spotlight** game as a custom-flow game over the
  proven `/x/` transport (picker → target → respond → react), a **host moderation gate**
  (the target's answer is vetted before it reaches the big screen, enforced by the pure tested
  `redactTurnForPublish`), passes (always free) + mild/spicy tiers, and **reaction-cut
  scoring** (the picker takes a cut of the room's reactions so the optimal play is
  entertaining, not cruel). New `spotlight` parked block + `TruthOrShareHost`/`Player` + pure
  tested `truthshare.ts`. **Still deferred:** photo-share over the **ephemeral relay with TTL**
  (never S3) with the same gate. **Known v1 limits:** host-reload mid-show loses in-memory
  turn state (custom-flow, like Circuit Cypher); the raw `/x/response` is soft-readable (the
  gate governs what the room sees, not cryptographic secrecy).
- [x] **G2. Faker** (social deduction). **SHIPPED** (committed local, not yet pushed): a
  `faker` make block (`assignContent` picks the imposter, `redactContent` + REDACTION_RULES
  hide the word, host screen never shows it) + an `accuse` judge block (derived from the faker
  round via the new additive derive extension `DeriveSource.answer` +
  `buildDeriveContent(getAnswerKey)`; scores catchers + the escaping faker; ties favor the
  faker; self-votes excluded; a silent player stays accusable) + a `[faker, accuse]` word-pool
  composition. Registered everywhere + Custom palette + Icon glyphs. Pure tests + a FakeHub
  end-to-end test. **Audit fix:** an assigned hidden-role answer is kept host-side and never
  auto-published at the make round's reveal (the judge round unmasks it), closing an imposter
  leak. The same primitive still unlocks **Hot Seat** and **Spectrum**.
- [ ] **G3. Closeness family extensions** - reuse the new `ballpark` block for **Over/Under**
  (streak) and **Spectrum** (Wavelength; needs the per-player clue-giver role from G2). `[medium]`
- [ ] **G4. Doodle Chain** (Gartic Phone) - a new **pipeline** primitive (each player's
  output feeds the next, rotated per player) + the end-of-game unspool reveal. `[large]`
- [ ] **G5. Quick Draw** (skribbl) - real-time stroke streaming + fuzzy answer matching,
  speed-scored. Reuses the Pixi surface + relay. `[large]`
- [ ] **G6. Companion mode** - **Call It** (host-resolved live predictions; host is the
  answer key, marks outcomes as they land) and **Buzzword Bingo** (per-player randomized
  cards + win detection). `[medium]`
- [ ] **G7. Hot Seat / Two Truths & a Lie** - per-round subject roles / dynamic per-author
  round counts; depends on the directed primitive (G1) or per-player assignment (G2). `[large]`
- [x] **Markdown-parser support** for the three new standalone blocks (hivemind / mostlikely /
  ballpark) so MCP/markdown can author them. Shipped: parser cases + `doot_format_guide` +
  `docs/markdown-games.md` + tests.

## Misc / docs / known trades
- [ ] PRD §8 still documents the pre-block plugin contract - reconcile with the block model.
- [x] **Rank** `emptyInput` now seeds a **per-player shuffle** (not the authored order), so a
  player who locks in without reordering casts a noise ballot instead of crowning the author's
  declared order (the consensus-drift fix the backlog called for). Regression test in
  `blocks/aggregate.test.ts` (every seed is a full permutation; the first slot varies across players).
- [ ] Docker base image not digest-pinned; rate-limiting is per-instance (move to a shared
  store before running multiple app containers).
- [ ] The dead per-round answer publish (a harmless write-only relay channel).
