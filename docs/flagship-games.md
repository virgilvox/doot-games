# Flagship games & the engine extensions they need

A design doc for the "**Games From Doot**" phase: a slate of polished, replayable,
Jackbox-grade games, plus the smallest set of engine/SDK extensions that unlock them.

Pair with [`Doot-PRD.md`](../Doot-PRD.md), [`CLAUDE.md`](../CLAUDE.md), and
[`docs/authoring-a-game.md`](./authoring-a-game.md). This doc is the **proposal**;
the contract in §3 needs sign-off before the engine work begins.

---

## 1. What the best party games actually do (research synthesis)

Studied: Quiplash, Fibbage, Mad Verse City, Survive the Internet, Patently Stupid,
Joke Boat, Split the Room, Talking Points/Speech!, Drawful, Tee K.O., Kahoot,
Skribbl.io, Gartic Phone, Trivia Murder Party, Blather 'Round. Sources are the
Jackbox fan wikis ([fandom](https://jackboxgames.fandom.com), [jackbox.wiki](https://jackbox.wiki)),
official [jackboxgames.com](https://www.jackboxgames.com) pages, and
[Kahoot's scoring docs](https://onlineexammaker.com/kb/how-does-the-kahoot-points-system-work/).

### The shape almost every one shares

Nearly every great room game is **make → judge → score**, repeated 2–3 rounds with
a multiplier on the last:

1. **Make** - players author something against a *scaffold* (a prompt, a
   fill-in-the-blank stem, a drawing canvas). The scaffold is the accessibility
   lever: "fill the blank" beats "be funny on an empty page."
2. **Judge** - the authored things are shown back (anonymized) and the room votes.
   Two voting backbones cover most games:
   - **Head-to-head** - two answers to the *same* setup, side by side, vote the better (Quiplash, Mad Verse City, Joke Boat, Tee K.O.).
   - **Anonymized field** - all submissions (sometimes + a hidden truth) shuffled, pick one (Fibbage, Drawful, Quiplash Last Lash).
3. **Score** - vote share → points, with recurring **swing/inclusion knobs**:
   round multipliers (×2/×3), a sweep/unanimity bonus ("QUIPLASH!"), pity points
   for the loser, and a half-value safety net when a player times out.

### The mechanics worth calling out (with the numbers we'll need)

- **Closeness-to-target scoring (Split the Room).** You *don't* want to be liked
  or right - you want to **divide the room**. Score ∝ how close the YES/NO vote is
  to 50/50. Jackbox publishes only the principle, not the curve; we'll use
  `score = MAX × (1 − |yesFraction − 0.5| × 2)` (50/50 → full, unanimous → 0),
  plus a small **hesitation** term (slow room = agonizing scenario) and a flat
  **+50 prediction** bonus for calling a target player's vote.
- **Speed-decay scoring (Kahoot).** `points = round((1 − (t/timer)/2) × max)`.
  The `/2` floors a correct answer at **50%** - speed matters but never dominates.
  967/833/667/500 pts at 2/10/20/30 s on a 30 s timer. High-confidence formula;
  a cheap, reusable aggregate to bolt onto the existing Guess block later.
- **Performance as a phase (Mad Verse City).** The delight engine isn't the text,
  it's a **deadpan robot voice rapping a forced rhyme over a beat**. The vote
  phase length is the playback length. We get this free with the browser
  `speechSynthesis` API over a CSS beat - no assets, no network, fully client-side.
- **Live co-control / feeder role (Talking Points).** A **Speaker** improvises over
  slides they've never seen; an **Assistant** picks the next slide *live* from their
  own phone and pushes it to the big screen; the crowd taps up/down continuously
  (250 pts/press), and the Assistant earns **half** the Speaker's score. This needs
  a continuous low-latency relay channel (slide-advance events; reaction taps)
  distinct from discrete round submissions - the one genuinely new transport need.
- **Audience-at-discount.** Spectators vote alongside players, folded in as a
  weighted bloc at a discount (Trivia Murder Party pays the audience $333 vs a
  player's $1,000). One reusable rule; pairs with Doot's 10k-audience goal.

### The reusable primitives (→ Doot blocks)

| Primitive | Doot mapping | Games |
| --- | --- | --- |
| Free-text submission | **`quip` block** (new) | Quiplash, Fibbage, Mad Verse City, Joke Boat |
| Fill-in-the-blank scaffold | **`fill` block** (new) | Split the Room, Mad Verse City, Mad Libs, Fibbage |
| Head-to-head vote | **`vote` block, mode `head-to-head`** (new) | Quiplash, Mad Verse City, Tee K.O. |
| Anonymized-field vote | **`vote` block, mode `field`** (new) | Fibbage, Drawful, Quiplash Last Lash |
| Binary vote + live split bar | **`split` block** (new) | Split the Room |
| Closeness-to-50/50 scoring | `split` aggregate (new) | Split the Room |
| Speed-decay scoring | Guess aggregate option (later) | Kahoot, Skribbl, Blather |
| Withheld answer key / reveal | **already enforced** by the engine | all |
| Decoy/lie authoring | `quip` + injected truth in `vote` field | Fibbage, Drawful |
| Pooled prompts feeding later phases | **content pools** (new, games-layer) | Joke Boat, Patently Stupid |
| Performance/playback phase | block HostDisplay + `speechSynthesis` | Mad Verse City, Joke Boat |
| Draw → guess → vote | **existing `draw` block** + new `vote` | Drawful, Skribbl |
| Live reaction stream / co-control | live relay channel (new transport) | Talking Points |
| Round multiplier / sweep / pity | **shared scoring knobs** (new module) | nearly all |

**The headline finding:** all of this reduces to **one** hard engine primitive -
*runtime-derived round content* (round N+1's content built from round N's inputs,
published only at judge-time) - plus a handful of new blocks and a shared scoring
module. The two-phase "make → judge" loop is then just a **composition of two
ordinary rounds**, reusing the entire existing `ready→open→locked→reveal` state
machine, eligibility, reconnect, and answer-withholding. No new phases.

---

## 2. Proposed slate (more than the named four)

Ordered by how cleanly each sits on the new primitives. "Composable" = authorable
in the editor from blocks; "Custom" = ships full-custom `components`.

| # | Game | Pattern | Build | New surface it proves |
| --- | --- | --- | --- | --- |
| 1 | **Quip Clash** (Quiplash) | prompt → free text → head-to-head vote → vote-share score | Composable (`quip`→`vote`) | The whole two-phase mechanic with the least custom UI - **build first** |
| 2 | **Anonymous Mad Libs** | fill a story's blanks → vote the funniest completed story | Composable (`fill`→`vote` field) | Multi-blank fill + field vote + reveal-the-winner |
| 3 | **Split the Room** | fill a dividing "would you…" → YES/NO → closeness-to-50/50 score | Composable (`fill`→`split`) | The inverted-objective aggregate + live split bar |
| 4 | **Fib Finder** (Fibbage) | fact-with-blank → write a lie → spot the truth among lies → dual score | Composable (`quip`→`vote` field + injected truth) | Decoy authoring + dual-axis scoring |
| 5 | **Robot Rap Battle** (Mad Verse City) | fill rhyming words → robots perform (TTS over a beat) → head-to-head vote | Custom (performance HostDisplay + audio) | Performance phase, audio layer, head-to-head bracket |
| 6 | **Sketch & Spot** (Drawful) | draw the prompt → write decoy titles → spot the real one | Composable (existing `draw` → `vote` field) | Reuse of the shipped Draw block in the two-phase loop |
| 7 | **The Big Reveal** (Talking Points) | improvise over slides an Assistant feeds live; crowd taps up/down | Custom (live feed channel) | Live co-control + reaction stream - the ambitious capstone, ships last |

**Recommended commit:** 1–5 this phase (the four named + Fib Finder, which is
nearly free once `vote` exists). 6 is a cheap showcase of block reuse. 7 is the
stretch flagship - it needs the live-channel transport and should land after the
others prove out.

Every flagship ships with: a **deep content pool** (100+ prompts/templates,
sampled fresh per play, seeded by room code so a room is internally consistent but
no two rooms match), **music + SFX**, an **untimed host option**, semantic HTML +
reduced-motion, and reconnect-by-name.

---

## 3. The contract (needs sign-off before building)

Design principles held: durable vs ephemeral kept apart (everything below is
**relay-only**, nothing per-room touches the DB); answers/submissions **withheld
until reveal**; dependency direction one-way (**the engine never imports a game** -
it calls game-supplied callbacks); identity derived & reconnect-free; CSS-first.

### 3.1 The one hard primitive: runtime-derived round content

Today content is static: authored → redacted → published once at `start()`.
A judge round's content must instead be **derived at runtime from a prior round's
inputs** and published only when the room reaches it. The mechanism mirrors the
existing answer-withholding split exactly.

**Why it's safe.** During a *make* round, submissions sit at `/input/<i>/<pid>` -
and **players already subscribe only to their own input address; only the host sees
all** (verified in `room.ts`/`addresses.ts`). So submissions are private during
"make" for free. When the room enters the *judge* round, the host derives the vote
options - **shuffled and anonymized** - and publishes them. The author→option
mapping is withheld as that round's **answer key**, revealed at `reveal` like any
answer. The host keeps the full mapping locally for scoring. Same shape as static
content; no new withholding logic.

**Engine - new relay addresses** (`packages/engine/src/addresses.ts`):
```
roundContent(room, i) → /doot/<ROOM>/round/<i>/content   // host-published derived content (overrides authored)
roundReveal(room, i)  → /doot/<ROOM>/round/<i>/reveal     // host-published public per-round reveal summary
```

**Engine - `LoadedGame` gains two optional host callbacks** (`room.ts`). The engine
stays game-agnostic: it just invokes the closure and publishes what it returns.
```ts
interface LoadedGame {
  // …existing…
  /** Build round `index`'s content from earlier rounds. Called by the host when
   *  it lands on the round. Returns the anonymized content to publish + the
   *  withheld answer key (e.g. the author map), or undefined for a static round. */
  deriveContent?: (
    index: number,
    inputsFor: (i: number) => Map<string, RelayValue>,
  ) => { publish: RelayValue; answer?: RelayValue } | undefined

  /** A public per-round reveal payload (vote tallies, the winner). Published to
   *  roundReveal at `reveal` so phones can show personal feedback. */
  revealSummary?: (
    index: number,
    inputsFor: (i: number) => Map<string, RelayValue>,
  ) => RelayValue | undefined
}
```

**Engine - behavior** (no new phase states):
- `start()` (lands on round 0) and `next()` (lands on round i): call a private
  `publishDerivedIfAny(i)` - if `deriveContent(i, inputsFor)` returns a value,
  publish `publish` to `roundContent(i)` and stash `answer` into `answerKeys[i]`.
- `reveal()`: existing answer publish, **plus** if `revealSummary(i, …)` returns a
  value, publish it to `roundReveal(i)`.
- Players/viewers subscribe to `roundContent(r, *)` and `roundReveal(r, *)`;
  `RoomSnapshot` exposes `runtimeContentFor(i)` and `roundRevealFor(i)`.
- All published with the standard absolute TTL. Relay-only.

That is the **entire** engine change. Everything else is the games layer + UI.

### 3.2 SDK block contract additions (`packages/sdk/src/block.ts`)

```ts
interface RoundBlock<Content, Input> {
  // …existing…

  /** Two-phase: derive this round's content from source rounds' inputs. Pure,
   *  host-only. `content` is the full host-local copy (for scoring); `publish` is
   *  the anonymized/shuffled copy for the relay; `answer` is the withheld key. */
  derive?: (ctx: DeriveContext<Input>) => {
    content: Content
    publish: Content
    answer?: unknown
  }

  /** Public per-round reveal payload (host computes from all inputs). */
  revealSummary?: (ctx: RevealContext<Content, Input>) => unknown

  /** Phone view at reveal. Props: { content, myInput, reveal }. Falls back to the
   *  generic "answers are up" when absent. (Also fixes the existing polish gap:
   *  players never learn on their phone whether they were right.) */
  PlayerReveal?: Component

  /** Per-player prompt assignment from a pool, deterministic by pid (reconnect-
   *  safe, relay-free). 'shared' (default) = everyone sees the same content. */
  assignment?: 'shared' | 'per-player'
  promptFor?: (content: Content, pid: string, seed: string) => Content
}

interface DeriveContext<Input> {
  sources: Array<{ index: number; content: unknown; inputs: Map<string, Input> }>
  players: ScorePlayer[]
  shuffle: <T>(items: T[]) => T[]   // seeded, deterministic for a room
}
```

**`RoundInstance` gains** `from?: number[]` - the source round indices whose inputs
feed this round's `derive` (default: `[index - 1]`). Flagships hardcode it; the
editor can expose it for custom compositions later.

### 3.3 Content pools (games layer - no engine change)

`GamePlugin` gains an optional sampler. A flagship ships a big pool; the host draws
a fresh subset per play.
```ts
interface GamePlugin {
  // …existing…
  /** Build a composition for one play (sample N from a pool). Seed = room code, so
   *  a room is internally consistent across reconnects but rooms differ. Falls
   *  back to defaultConfig. */
  buildConfig?: (seed: string) => GameComposition
}
```
`HostRoom` calls `plugin.buildConfig?.(roomCode) ?? plugin.defaultConfig` before
`loadGame`. The **markdown importer** grows a pool format (a `## pool` section /
repeated stems) so big banks are authorable; see `docs/markdown-games.md`.

### 3.4 New blocks (`packages/games/src/blocks/`)

- **`quip`** - free text. Content `{ prompt, maxLength, timer }`; input `{ text }`;
  `isComplete` = non-empty trimmed. `assignment` supports per-player prompts.
- **`fill`** - multi-blank. Content `{ template, blanks:[{id,label,hint}], timer }`;
  input `{ values: Record<blankId,string> }`; `isComplete` = all blanks filled.
- **`vote`** - votes on derived submissions. `derive`s from the make round into
  `{ prompt, options:[{id,text}], mode:'head-to-head'|'field' }`; input
  `{ choice: optionId }`; `answer` = `{ optionId → authorPid }`. Aggregate awards
  authors by vote share (with the swing/inclusion knobs). `head-to-head` with >2
  submissions emits one matchup per pair across consecutive rounds (a small
  single-elimination set); v1 keeps the bracket shallow.
- **`split`** - binary + closeness scoring. `derive`s the dividing scenario from a
  `fill`/`quip` make round; input `{ vote: 'yes'|'no' }`; aggregate scores the
  author with `MAX × (1 − |yesFrac − 0.5| × 2)` + hesitation + prediction bonus.

### 3.5 Shared scoring knobs (`packages/games/src/blocks/scoring.ts`)

Pure, unit-tested helpers the vote/split aggregates compose: `voteSharePoints`,
`roundMultiplier(roundIndex)`, `sweepBonus`, `pityPoints`, `closenessToHalf`,
`speedDecay(t, timer, max)`, `audienceWeight`. CLAUDE.md wants exactly these pure
functions tested with Vitest.

### 3.6 Audio layer (`packages/ui`)

`RoomMeta.musicUrl` already exists. Add an `AudioController` (host-only) that loops
music and fires SFX on state transitions (`open`/`lock`/`reveal`/`finish`) and
block-declared cues. A **mute toggle** in the host bar, persisted; default off-loud
is fine but respect a stored preference. Honor `prefers-reduced-motion` for any
visual that accompanies sound. Robot Rap Battle's TTS is `window.speechSynthesis`
(client-only, lazy, SSR-guarded), played in the matchup HostDisplay over a CSS beat.

### 3.7 New UI components

`TextSubmit` (char-counted textarea), `FillBlanks` (inline blank inputs over a
template), `MatchupCard` (two answers side by side), `SplitBar` (live YES/NO),
`AudioController`, and a small bundled SFX set.

### 3.8 What does **not** change

The room state machine, phases, eligibility, reconnect, the relay wrapper, the
durable store, auth, uploads, and the generic `GameHost`/`GamePlayer`/`GameResults`
renderer (extended only to read `runtimeContent`/`roundReveal` and render
`PlayerReveal`). Existing blocks are untouched and keep working.

---

## 4. Build order

1. ✅ **Engine primitive** (§3.1) + tests: `roundContent`/`roundReveal` addresses,
   `deriveContent`/`revealSummary` host callbacks, derive-on-enter (start/next),
   reveal publish, runtime answer keys. Unit-tested in `room.test.ts` (the author
   map stays off the relay until reveal).
2. ✅ **SDK contract** (§3.2–3.3) + generic renderer wiring (`derive.ts` factories
   `buildDeriveContent`/`buildRevealSummary` + a seeded shuffle; GameHost overlays
   runtime content + scores the effective config; GamePlayer renders `PlayerReveal`)
   + `HostRoom` passes the closures and samples `buildConfig`.
3. ✅ **`quip` + `vote` blocks** + `scoring.ts` knobs → **Quip Clash** end-to-end.
   Verified: 97 unit tests, full typecheck + web build, and a 3-player real-browser
   playtest (`scripts/playtest.mjs`) through the write → derived-vote → reveal loop
   to results. The mechanic is sound.
4. ✅ **`fill` block** → **Anonymous Mad Libs** (shipped): players fill labelled
   blanks blind, the completed stories are derived into a vote round (a new block
   `toVoteText` hook + `DeriveSource.render` let the vote block render any "make"
   submission to votable text), and the room votes the funniest. 10-story pool
   sampled per play. ✅ **`split` block** → **Split the Room** (shipped): complete a
   dividing "would you...?" dilemma, the room votes yes/no on every scenario, and
   authors score on closeness to a 50/50 split (`closenessToHalf`/`splitPoints`).
5. ⏳ **Audio layer** + **Robot Rap Battle** (TTS performance + head-to-head vote
   mode). **Content pools** are in place (`buildConfig` + `seededShuffle`); Quip
   Clash already samples a 24-prompt pool per play.
6. ⏳ **Fib Finder** and **Sketch & Spot** (cheap, reuse `vote`).
7. ⏳ **"Games From Doot" category** on `/explore` + the catalog.
8. ⏳ **The Big Reveal** (live feed channel) - the stretch capstone.

Verify each increment with `pnpm test && pnpm -r typecheck && pnpm --filter
@doot-games/web build`; keep `main` deployable; two-phone playtest the flagships.

---

## 5. Polish-pass findings (this phase's sweep)

The loop is solid post-audit (global `prefers-reduced-motion` reset; `OptionGrid`
pairs color with a ✓ and `aria-pressed`; `aria-live` player surface; dead-room and
host-gone handling all present). Findings:

- **High-impact, folded into §3.2:** players get **no personal feedback on their
  phone at reveal** - only "answers are up, check the big screen." `PlayerReveal` +
  `roundReveal` fixes this for every game, old and new.
- **Minor (noted, not yet fixed):** Rank's `emptyInput` seeds the authored order
  (documented open trade in HANDOFF); the markdown importer doesn't yet do pools
  (addressed by §3.3).

## 6. Audit + robustness roadmap

An adversarial code audit (independent agent) plus a deep web-research pass on
Jackbox robustness/fairness/accessibility ran against the shipped Quip Clash.

**Verified solid:** submission withholding (players subscribe only to their own
input address), the author map is withheld until reveal, the published vote
content is anonymized, relay-only state, one-way dependency direction, reconnect
to a derived round, final-round doubling, reduced-motion + phone a11y basics.
All re-confirmed over the **real CLASP relay** by a new two-phase live test.

**Fixed this pass:**
- **Self-votes can't score** - enforced in the pure `tally` via the author map, so
  a tampered client that votes its own answer is ignored (not just hidden in UI).
- **A departed author still scores and is named** - author display names are
  captured at derive time; the leaderboard is built from the union of the live
  roster and everyone who scored (previously a player who left after submitting
  had their points silently dropped, which could miscrown the winner).
- Degenerate vote round (&lt;2 answers) shows a clear "not enough answers" state;
  `aria-live` on the empty vote state; `overflow-wrap` on long answers; `assignment`/
  `promptFor` marked RESERVED in the SDK.

**Known limitations (documented, acceptable for a party app):**
- Derive/reveal snapshot inputs at the instant the host clicks; a submission still
  in flight when the host advances can be missed (same soft-lock behavior as every
  existing game; narrow with auto-lock).
- Own-answer hiding on the vote screen is by text match, so identical submissions
  hide each other and a reconnecting player's own answer is briefly shown until
  their prior input loads - scoring still rejects the self-vote, so it's cosmetic.
  For Mad Libs the source input has no `.text` field, so own-story hiding does not
  fire at all (the player can see their own story in the vote list); scoring still
  excludes the self-vote. A clean fix is per-player delivery of "your option id"
  (the reserved `assignment`/`promptFor` path) or a `/player/<pid>/myoption` relay
  key; deferred.
- The relay is semi-open: a raw snooper with the room code can read inputs (true of
  all games today). The integrity-critical secret - the author map - is properly
  withheld until reveal.

**Research-backed robustness roadmap** (validated against Quiplash/Fibbage; build
next, in rough priority):
1. **Timeout safety net** - auto-fill an unsubmitted free-text round from a per-prompt
   pool of canned answers, scored at **50%** (Quiplash's "Safety Quip"). No dead air,
   no zeros. Make safety answers a field on the prompt-pack schema.
2. **Untimed / extended-timer mode** - "advance only when everyone has submitted"
   (PRD already requires it; the genre leader confirms it's the key text-game a11y lever).
3. **Content-filter tiers** (off / moderate / strict) + family/adult prompt-pack tracks,
   validated with Zod at the relay boundary; reject empty/duplicate on submit.
4. **Audience-as-discounted-bloc** voting (cap the audience's combined weight so a big
   crowd can't drown a small player group) - config constant per manifest.
5. **Tie handling** (split/co-crown) and **custom prompt packs** via a share code, with
   optional cross-session repeat avoidance (durable tier only).

## 7. UI (explore + footer, from doot-mockup.html)

The catalog UI was rebuilt to the mockup: a reusable theme-aware **`GameCover`**
(`@doot-games/ui`) renders a gradient cover (two theme accent colors), a white
line **motif per game type** (guess=?, rate/votebox=star, draw=squiggle, poll=bars,
rank=bars, quip-clash=burst, custom/other=grid), a big faded initial, and an
optional "N live" badge. A site-wide **`SiteFooter`** (Play / Create / About columns
+ tagline) renders on all chrome pages (`app.vue`, hidden on host/play). The
**explore page** now has the mockup's DISCOVER header, a search box, Type + Theme
filter chips (functional), a "Featured this week" hero (newest public game, else the
Quip Clash flagship), an optional "Your games" row, and a cover-card grid of public
games + game-type templates.
</content>
</invoke>
