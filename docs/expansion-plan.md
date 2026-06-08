# Doot expansion plan

A staged plan for the gaps identified in the app review: new games, new blocks, and the
cross-cutting features (teams, audience, sessions) the PRD's target rooms need. The
guiding rule is **architecture-first**: build a few shared primitives once, keep every
block pure and game-agnostic, and keep cross-cutting roll-ups in the engine + generic
renderer, never inside a block or a game.

This is a living plan, not a commitment. Effort tags: `[S]` small, `[M]` medium, `[L]` large.

---

## 0. Where things live (the decision rules)

The monorepo's dependency direction is one-way and must stay that way:

```
games → (engine, sdk, themes, ui)      sdk → (engine, themes)      ui → (engine, themes)
apps/web → everything
engine never imports a game · sdk never imports the shell · no cycles
```

So every feature below is placed by asking two questions:

1. **Is it game-specific, or cross-cutting?**
   - *A single round kind* → a **block** in `packages/games/src/blocks/<kind>/` (content
     schema + Host/Player views + `aggregate` + answer-withholding). Pure, knows no game.
   - *A reusable contract* (types a block/game declares) → the **SDK**
     (`packages/sdk/src/block.ts`).
   - *Transport / room state / state machine* → the **engine** (`packages/engine/src`).
     Game-agnostic, always.
   - *A cross-cutting roll-up* over any game (teams, audience weighting, cumulative
     scores) → the **generic renderer** (`packages/games/src/runtime/`) + a small engine
     state addition. Blocks stay unaware.
   - *A shared visual* (a dial, an audio player) → **ui** (`packages/ui/src`).
   - *Orchestration, durable storage, routing* → **apps/web**.

2. **Is the state durable or ephemeral?** (Invariant #1.)
   - Anything about an *in-progress room* (roster, team membership, votes, live scores,
     audience presence) is **ephemeral** → CLASP relay, never the DB.
   - Anything *reusable across rooms* (a saved game, a deck, a playlist) is **durable** →
     Drizzle (`apps/web/server/utils/*-repo.ts`), behind the same `useDb()` seam.

**The anti-pattern to avoid:** baking teams/audience/wager/scoring logic into individual
games. If two games would need it, it's a primitive (§1) or a renderer roll-up (§4).

### Definition of done for a new block (the consistency checklist)

Every new block follows the same path, enforced by `catalog.test.ts`:

1. `packages/games/src/blocks/<kind>/block.ts` (+ `*Host.vue` / `*Player.vue` / `*Reveal.vue`).
2. Pure rules in a sibling `.ts` (matcher, scorer) with a Vitest spec. Test the scoring,
   not the components.
3. If it withholds an answer (`answerOf` or `redactContent` or a per-player secret via
   `assignContent`): add a `REDACTION_RULES` entry in `catalog.ts` (the test fails
   otherwise) so the API serve path redacts it like the relay does.
4. Register it: export from `packages/games/src/index.ts`; add to the `custom` game's
   `blocks` (and any dedicated game).
5. A game that uses it: game file → `registry.ts` → `catalog.ts`, then the visual
   identity in `packages/ui/src/visuals.ts` (NOT `packages/games`). What is actually
   test-enforced: `catalog.test.ts` checks registry↔catalog id/metadata sync, that every
   answer-bearing block (any `answerOf`/`redactContent`) has a `REDACTION_RULES` entry, and
   that a `contentPool` game's catalog `pool` descriptor matches; `compositions.test.ts`
   checks every `defaultConfig`/`buildConfig` round parses against its block's schema.
   `visuals.ts` is NOT covered by a test, so add its entry by hand or a new block/game falls
   back to the generic grid icon.
6. Deck-feedable? Add a `pool` (typed deck) descriptor and/or a `ContentPool`.
7. Authoring reach: a `parseMarkdownGame` case + the MCP `doot_format_guide` entry +
   `docs/markdown-games.md`. A two-phase pair gets an editor "recipe".
8. The editor auto-forms from the Zod schema for free; only add a custom `Editor` if the
   auto-form can't express it.

---

## 1. Shared primitives (build these first; everything else reuses them)

These are the backbone. Getting them right is what keeps the rest consistent.

### P1. Free-text answer matcher `[S]`
A pure module `packages/games/src/blocks/text-match.ts`: lift the existing aggressive
`normalizeAnswer` (exported from `hivemind/block.ts`: lowercases, folds every non-alphanumeric
to a space, drops a leading `the/a/an`) and add tolerant matching (diacritics fold, optional
small edit-distance, accepted-synonym list). Pure + unit-tested.
CORRECTION (verified in code, the original plan was wrong here): `fibvote/block.ts`'s private
`norm` is NOT the same function. It only strips trailing `.!?,;:` and collapses spaces; it
keeps apostrophes/internal punctuation and leading articles, deliberately, because it tests a
lie for equality against the exact truth. Refactoring it onto the aggressive matcher WOULD
change behavior. So: refactor ONLY `hivemind` to import the shared `normalizeAnswer` (truly
behavior-identical, its tests lock it); LEAVE `fibvote.norm` and `faker.normalizeClue`
(first-token/one-word) as they are.
**Reused by:** the `answer` block (aggressive fold + synonyms is right for trivia), Quick Draw
guesses, `survey`, `categories`.

### P2. Per-player assignment, finished `[M]`
The SDK already reserves `assignment: 'per-player'` + `promptFor` (and `faker` already
ships the hidden-role cousin `assignContent` → a private per-player relay address). Finish
and unify this into one primitive: the host derives a per-player view at round-enter and
publishes it only to each player's private address; the engine already has the transport
(`assignContent` → `room.perPlayerContentFor`). Generalize `buildAssignContent` in
`runtime/derive.ts` so any block can supply per-player content deterministically (seeded by
room, reconnect-safe).
**Reused by:** Spectrum (clue-giver role), Bingo (per-player card), Two Truths (per-author
subject), Hot Seat, and the Pipeline rotation (P7).

### P3. Live running scores `[M]`
Today scores are computed once at `finish()`. Add an *optional* cumulative leaderboard the
host computes after each `reveal` and publishes to an ephemeral relay address
(`/room/<r>/standings`), via a pure `runtime/standings.ts` that folds each revealed round's
per-block contribution. The generic Host/Player can show a between-round leaderboard
(Kahoot-style). Nothing durable.
**Reused by:** between-round standings (a polish win on its own), Wager (§7), Sessions (§4.3).
Keep it additive: games that don't opt in are unchanged.

### P4. Role split: player vs audience `[M]`
Engine presence gains a `role: 'player' | 'audience'` (host stays separate). Audience join
the relay, read state, never count toward the player cap, never appear on the leaderboard.
`ScorePlayer` gains an optional `role`; `runtime/derive.ts scoreGame` filters the board to
players. The join page (`play/[room].vue`) offers "play" vs "just watch", and auto-spills to
audience once the cap is hit. Bandwidth: audience only subscribes to display channels.
**Reused by:** scale (the PRD's marquee differentiator), audience voting (Phase B below).

### P5. Team roll-up `[M]`
Engine presence gains an optional `team` (a player self-selects or the host assigns from the
lobby; an ephemeral relay write to the player's own address, exactly like `name`). Blocks
**do not change** — they keep scoring players. `runtime/derive.ts` rolls per-player scores
into team totals; `GameResults.vue` renders a team leaderboard when teams are on; roster
chips + reveals get team colors via theme tokens. A saved game may carry a durable
*default* ("teams suggested") in its manifest capabilities, but assignment is ephemeral.
**Reused by:** every game, opt-in. Critical for bar trivia + classrooms (two of four target
rooms).

### P6. Closeness scoring (exists) `[done]`
`ballpark`'s pure closeness scorer. `ballparkCloseness(error, maxError)` and
`ballparkBounds(answer, values)` are already EXPORTED from `blocks/ballpark/block.ts`, so
Spectrum and Over/Under can import them directly; only lift to a neutral shared module if a
third consumer wants a name not tied to `ballpark`.

### P7. Pipeline rotation `[L]`
A new engine primitive generalizing two-phase derive from many→one to a per-player **chain**:
round N's per-player content is another player's round N-1 output, rotated deterministically
(built on P2). Plus an end-of-game "unspool" reveal showing each chain's evolution. This is
the one genuinely new engine concept; isolate it behind a `pipeline`/`chain` block + a
results view so it doesn't complicate the standard loop.
**Reused by:** Doodle Chain, story-telephone.

---

## 2. New blocks (standard contract, no engine changes beyond P1/P2)

| Block | What | Withholding | Pool/deck | Depends | Effort |
| --- | --- | --- | --- | --- | --- |
| `answer` | Type-the-answer trivia (free text), graded by P1 | `answerOf` accepted answers + redact + `REDACTION_RULES` | quiz pool (`question`/`answers`) | P1 | `[M]` |
| `spectrum` | Wavelength: clue-giver gets a hidden dial target, room guesses, closeness-scored | secret target via `assignContent` (P2), revealed at reveal | prompt pool (spectrum endpoints) | P2, P6 | `[M]` |
| `categories` | Scattergories: a letter + categories; score valid **and unique** answers | none (computed at reveal) | letter/category pool | P1 | `[M]` |
| `survey` | Family-Feud (authored): guess the top ranked answers | `answerOf` ranked answers + redact | survey pool | P1 | `[M]` |
| `caption` | Caption an **image** prompt → vote (meme) | none (it's a make block) | image prompt pool | — | `[S]` |

Notes:
- **`caption`** is mostly free: extend the `quip` content schema with an optional `image`
  (additive, backward-compatible), then compose `caption → vote` with an image-prompt pool.
  Prefer extending `quip` over a near-duplicate block unless the views truly diverge.
- **`survey` two-phase variant** ("collect from the room, then guess") is a later follow-up;
  the authored variant is a clean standard block first.
- All of these auto-form in the editor and need the §0 authoring-reach steps.

---

## 3. Content + UI additions (not new blocks)

- **Audio-clip support** `[M]` — *not* a new block. Add an optional `audio` field to the
  trivia content (`guess`/`answer`) and an `AudioClip.vue` in `ui` (client-only,
  SSR-guarded, honors mute + `prefers-reduced-motion`, a clean no-op where unavailable —
  the same rules as `audio/arena.ts`/`speech.ts`). The generic renderer plays it in the
  prompt area like it shows `image` today. "Name That Tune" then = a `guess`/`answer` game
  with audio prompts. Copyright: user-provided URLs only; never bundle clips.
- **Spectrum dial** `[S]` — a CSS-first gauge/slider component in `ui` (no canvas needed).
- **Standings view** `[S]` — a between-round leaderboard component (ui) fed by P3.

---

## 4. Cross-cutting features (engine + runtime + apps/web; blocks untouched)

### 4.1 Teams `[M]` (P5)
Lobby: host toggles teams, sets count/names, players self-pick (or auto-balance). Roster
chips group by team; results show a team board (and still the MVP per player). Pure
roll-up in `runtime/derive.ts` + `GameResults.vue`; engine adds `team` to presence. No game
or block changes. **Highest leverage** for the stated audiences.

### 4.2 Audience tier `[M]→[L]`
- **Phase A (role only)** — P4: watch + don't count to cap + not on board. Big-screen-driven,
  low per-client bandwidth (the PRD's scale story).
- **Phase B (weighted voting)** — a contract addition: `BlockResultsContext` (and the
  derive/reveal contexts) gain an optional `weightFor(pid) => number` (default 1). Only the
  vote-tallying blocks (`vote`/`split`/`poll`/`fibvote`) multiply by it; everyone else
  ignores it. Audience votes count as a capped, discounted bloc. This finally wires the
  `audienceWeight` idea correctly (as a primitive, not a per-game hack).

### 4.3 Sessions / playlists `[L]`
- **Durable:** a new `playlists` entity (ordered game ids + meta), mirroring the
  games/decks pattern exactly — a `playlists` table, a `playlists-repo.ts`, owned +
  visibility, `/api/playlists/*`, a `/host/playlist/[id]` route. Consistency over novelty.
- **Ephemeral:** the engine sequences games in one room — presence persists across the
  playlist; a cumulative score map (P3) carries between games; after each game's results the
  host taps "Next game" and `loadGame` swaps in the next composition. A thin `SessionHost`
  orchestrator in apps/web wraps the existing per-game `HostRoom`; individual games stay
  unchanged. Serves "a night of trivia" for bars/classrooms.

---

## 5. Big custom-flow games (the `circuit-cypher` pattern: own `.vue` Host/Player + `/x/` channels)

- **Doodle Chain** (Gartic Phone) `[L]` — P7 pipeline + the existing `DrawCanvas` (Pixi) +
  an unspool reveal. Custom-flow.
- **Quick Draw** (skribbl) `[L]` — real-time stroke streaming over a custom `/x/strokes`
  channel + P1 fuzzy guess matching + speed scoring. Reuses the Pixi surface and the proven
  custom-channel transport (mind the connect-safe `onExtra` defer gotcha).
- **Two Truths & a Lie** `[M]` — P2 per-author rounds (each round is about one author; the
  room guesses the lie). Also unlocks **Hot Seat** (G7).
- **Bingo + Call It** (companion) `[M]` — Bingo = P2 per-player card + host calls + win
  detection. Call It = host-resolved live predictions (host marks outcomes live). Great for a
  bar with a game already on the TV.

---

## 6. Quick-win compositions (existing blocks + a pool; `[S]` each)
- **Would You Rather / This or That / Hot Takes** — `poll`/`rate` + binary pools.
- **Tier List** — `rate` already does tiers; package it as a game with a pool.
- **Over/Under** — `ballpark` (P6) streak variant.
- **Meme / Caption This** — the `caption` block (§2).

---

## 7. Wager `[M]` (depends on P3)
A true wager needs *live* running scores (you bet a fraction of your current total). Build it
only after P3. Shape: a `wager` make round (collect a bet bounded by the live standing) feeding
a trivia round; scored together (correct → +bet, wrong → −bet). Defer until P3 lands;
flag the dependency so it isn't attempted as a standalone block.

---

## 8. Sequencing (dependency-ordered)

```
Phase 1 — primitives & cheap wins (unlocks the most, lowest risk)
  P1 text-match ── answer block ── audio content/UI ──► Name That Tune, type-the-answer trivia
  caption block (quip+image) ──────────────────────────► Meme / Caption This
  §6 quick-win compositions (Would You Rather, Tier List, Over/Under)

Phase 2 — the audience-facing differentiators
  P5 Teams ───────────────────────────────────────────► team play across every game
  P3 Live standings ──────────────────────────────────► between-round leaderboard
  P2 Per-player assignment (finish) ──► Spectrum, categories, survey, Two Truths

Phase 3 — scale & depth
  P4 Audience role (Phase A) ─► P4 Phase B weighted voting
  §4.3 Sessions / playlists
  P7 Pipeline ─► Doodle Chain ;  Quick Draw streaming ;  Bingo / Call It

Phase 4 — stakes & polish
  Wager (needs P3) ;  survey two-phase ;  custom prompt packs via share code
```

**Recommended first slice:** P1 + the `answer` block + the `caption` game, then **Teams (P5)**.
That ships three crowd-pleasers and the single highest-leverage structural feature without any
change to the engine's core loop or to existing blocks.

---

## 9. Invariant compliance (quick audit per feature)

- **Durable vs ephemeral:** teams/audience/standings/votes/strokes are all ephemeral (relay);
  only saved games, decks, and the new **playlists** entity are durable. Nothing about a live
  room is written during play. ✓
- **Answer-withholding:** `answer`/`spectrum`/`survey` add secrets; each gets `answerOf`/
  `assignContent` + a `REDACTION_RULES` entry so the relay *and* the API serve path redact
  identically (enforced by `catalog.test.ts`). `categories`/`caption` have no secret. ✓
- **Dependency direction:** new blocks live in `games`; the contract additions
  (`weightFor`, `role`, `team`, `assignment`) live in `sdk`; transport/state in `engine`;
  the dial/audio/standings views in `ui`; orchestration + storage in `apps/web`. No game is
  imported by the engine; no cycle introduced. ✓
- **Second-screen + CSS-first:** the dial and standings are CSS; canvas stays limited to
  Draw (Pixi) and the rap arena (Three); audio is client-only + SSR-guarded + mute-aware. ✓
- **Reconnect-by-name:** per-player assignment (P2) and pipeline (P7) are seeded by the room
  so a reconnecting player deterministically gets the same role/chain. ✓
