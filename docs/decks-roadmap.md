# Decks roadmap — stock-take + the path to a deck library, shared variables, and full block access

This is the **forward map**. For the shipped MVP's internal design see
[`content-decks-plan.md`](./content-decks-plan.md); this doc takes stock of what is
built and why, then lays out the best way to do everything still asked:

1. a **`/decks` page** — a durable, reusable deck library you can browse and build by hand or by type;
2. a general **share / collect block** whose collected media becomes a **play-time variable** any later round can use;
3. how a deck feeds **spotlight** (Truth or Share) and other pool-shaped blocks;
4. closing the **"all blocks usable by users"** gap in Custom (what is actually missing, and why);
5. keeping **MCP + docs** complete as each piece lands.

Guiding rule, unchanged: **additive, isolated, type-driven.** A game with no decks
behaves exactly as today; the engine/host stay reference-agnostic and play plain rounds.

---

## 0. Stock-take — what is built, and why it is shaped this way

The content-decks **MVP is shipped and verified** (full suite green incl. a
redaction→resolution tie test; live multiplayer smokes across 7 games unbroken; the
editor deck flow browser-verified end to end).

| Layer | File | What | Why this seam |
| --- | --- | --- | --- |
| Contract | `sdk/src/block.ts` | `Deck`/`DeckColumn`/`DeckRef`/`DeckUse`; `RoundInstance.draw/bindings/pool`; `GameComposition.decks`; `RoundBlock.pool` | One shape every layer speaks (editor, markdown, MCP, serve, host). |
| Resolver | `games/src/runtime/decks.ts` | `resolveComposition` expands a deck-backed composition into **plain rounds**; sees only **inline** decks; pure + seeded | The host already plays plain rounds — decks resolve to plain rounds *before* play, so **zero engine change** and a deck game plays identically to a hand-authored one. |
| Reference | (serve / host-load) | a `{ref}` resolves to inline **upstream** of the resolver | Snapshot and reference both collapse to inline at **one** seam; the pure resolver never touches the DB. |
| Redaction | `games/src/catalog.ts` (`redactDecks` + `REDACTION_RULES`) | a column bound to an **answer field** is nulled for non-owners | Invariant #3 (withhold answers) must hold for deck-sourced answers too — now tied end to end by `decks.test.ts`. |
| Import | `games/src/markdown.ts` (`## deck`), `runtime/sheet.ts` (`parseSheet`) | CSV/TSV → decks; round `draw:/bind:/pool:` syntax | Bulk authoring + paste-from-Sheets. |
| Persist | `apps/web/server/utils/games-repo.ts` | `config.decks` + round draw/bindings/pool validated (rows ≤ 1000, 2 MB cap) | A durable game definition carries its **snapshot** decks. |
| Editor | `DeckManager.vue` + `RoundBindings.vue` (isolated) | paste→preview→add decks; per-field binding; sample-resolved preview | SoC: kept **out** of the 1600-line `GameEditor.client.vue`. |
| MCP | `server/routes/mcp.ts` | deck params in save/update + a CONTENT DECKS format-guide section | Agents author deck games too. |

**Two binding modes today:**
- **Mode 1 — field bind** (`bindings: { field ← deck.column }`): fill individual authored fields from columns; fields bound to the *same* deck in one draw share **one row** (cross-field correlation).
- **Mode 2 — typed pool** (`pool: { deck }` + `block.pool.fromRow`): build a round's whole content from one row, via the block's typed descriptor.

**Not yet built (the rest of this doc):** a durable reusable **library** (the `{ref}`
*target* — refs resolve, but there is nowhere to create/store/browse a reusable deck);
mode-2 `pool` descriptors on real blocks (only a test has one); a **column→array**
binding flavor (mode 3) for pool-shaped blocks like spotlight; **column-type filtering**
in the binding helper; and the **share/collect block + play-time variables**.

---

## 1. The `/decks` page — a durable, reusable deck library

This is the `{ref}` *target*. Decks today are **snapshot-only inside one game**; the
library makes them first-class, reusable artifacts with the **same lifecycle as games**.

### 1.1 Data + repo (mirror games-repo exactly)

A new durable table `deck` and a `decks-repo.ts` parallel to `games-repo.ts` (same
`useDb()` seam, same Zod-at-the-boundary, same ownership + visibility rules):

```
deck: id (lib_<8>), ownerId, name, description,
      kind ('quiz' | 'prompt' | 'card' | 'generic'),   -- the descriptor / "type"
      columns (json: DeckColumn[]), rows (json: Row[]),
      visibility ('private' | 'unlisted' | 'public'), remixable (bool),
      createdAt, updatedAt
```

- **Why a separate table + repo:** decks are reusable across many games, authored
  independently, browsable, remixable — a different lifecycle from a game's embedded
  snapshot. Keeping deck CRUD isolated from game CRUD is the SoC win.
- **Answer redaction does NOT live here.** A library deck has no round context, so no
  column is "an answer" until a *game* binds it to an answer field. Answer-hiding stays
  exactly where it is — the game serve path's `redactDecks`. Library decks store full
  data. (This keeps the library dumb and the security in one place.)

### 1.2 Snapshot vs reference (the user wants both)

- **Inline / snapshot** = a frozen copy embedded in the game (today's behavior). Edits to the library deck do **not** propagate.
- **Reference** (`{ref: 'lib_…'}`) = "use the current library deck." At **save** time we store only the id (no rows copied); at **serve/host-load** time we load the current rows and **inline** them, then per-game redaction applies. Edits propagate.
- The editor offers both, plus a one-click **"snapshot this reference"** (copy the rows in now) and **"promote to library"** (lift an inline deck into a reusable one).

### 1.3 Reference resolution — the one DB seam

Extend the existing host-load / `GET /g/[id]` path (which already calls `inlineDecks`)
with a `resolveDeckRefs(config)` that loads any `{ref}` from `decks-repo` and inlines
it **before** `redactDecks` + `resolveComposition` run. The pure resolver stays
reference-agnostic; only this serve layer (which has DB access) touches refs. A missing
/ private-to-someone-else ref resolves to an empty deck (round falls back to authored
values — the resolver is already missing-safe).

### 1.4 Pages + API + the deck editor

- `/decks` — browse **my decks + public decks** (discovery, mirrors the home rails).
- `/decks/new`, `/decks/[id]/edit` — a real **deck editor page**: a spreadsheet-like
  row grid (add/edit/delete rows + columns), CSV/TSV import via `parseSheet`, per-column
  type (text/image/number). **Image columns use the presigned-PUT path** (`useImageUpload`)
  — a library deck's images must persist (durable), unlike play-time shares.
- API `server/routes/decks/`: GET list, POST create, GET/PUT/DELETE `[id]`; auth gates
  saving only (browsing public is open), same as games.
- **Built as isolated components**, reusing `DeckManager`/`RoundBindings` primitives;
  not folded into the game editor monolith.

### 1.5 "arbitrary or by type"

The `kind` descriptor (**Quiz / Prompt / Card / Generic**) is a hint, not a constraint:
- **Generic** = arbitrary columns; always works via mode-1 field binding.
- **Typed** (Quiz/Prompt/Card) pre-seeds a known column shape and advertises which
  **mode-2 pools** it satisfies (a Quiz Deck → `guess`/`buzzer`; a Prompt Deck → the
  prompt-pool blocks; a Card Deck → the future card-game system). `new` offers these as
  templates. "Card Deck" reserves the name for the planned card-game system without
  colliding (a Card Deck is just a Generic deck with a card-shaped template today).

---

## 2. The share / collect block — collected media as a **play-time variable**

The deepest ask: a round where players **share an image** (everyone, or one person like
spotlight), **and** the collected image becomes a variable any later round can use —
"collect an image that can be used as a variable in any other arbitrary round."

### 2.1 The key realization

Decks are **author-time** data resolved *before* play. A collected image is **not known
until that round runs**. So "use a collected image in a later round" is **not** deck
resolution — it is a **runtime derive**, exactly the two-phase make→judge machinery we
already ship (quip→vote, fill→split, …), extended from text to **media**.

And the unifying insight: **a collected slot is a deck whose rows are produced at play
time.** One row per submission (`playerId`, `name`, `media`). Once the collect round
closes, the host materializes that slot into an **inline runtime deck** and re-resolves
the remaining rounds against it — the *same* binding resolver, sourced at runtime.

### 2.2 The model

- A new **`collect` block** (make-style; media input). Modes:
  - `everyone` — a gallery (every player submits an image), or
  - `directed` — one person submits, reusing Truth or Share's pick flow.
- It publishes inputs under a named **slot**: `collect: { slot: 'selfies' }`. Media
  rides the **relay** (downscaled on-device → ephemeral dataURL, TTL) — the exact path
  Truth or Share already uses; **no new transport, no Spaces, no DB**.
- A later round binds to a slot instead of a deck:
  `bindings: { image: { slot: 'selfies', pick: 'random' | 'byPlayer' | 'all' } }`.
- **When the collect round closes**, the host turns the slot into an inline runtime deck
  (columns `playerId | name | media`) and re-runs `resolveComposition` on the not-yet-played
  tail. From there it is ordinary deck binding.

### 2.3 Why this is the best way

It reuses **three** things we already have and adds a small surface:
1. **Ephemeral relay media** (Truth or Share's downscale→`/x/photo` path).
2. The **derive / two-phase** runtime content building (and its safety-net pattern).
3. The **deck/binding resolver** (pure, reference-agnostic, missing-safe).

New surface: one `collect` block + a `slot` binding source + host logic to inject a
closed slot as a runtime deck. No engine change.

### 2.4 What it unlocks

- **Standalone share rounds** via recipes: `collect → photovote` ("share a pet photo → vote best"; needs an image-vote judge — see §2.5, drawvote judges *strokes*, not bitmaps), `collect → rate`, `collect → poll`.
- **Directed share** = the spotlight "share" half, generalized and reusable.
- **Cross-round variables**: round 1 collects selfies (slot `faces`); round 5 a faker-style round shows each player's face; a results montage uses them. Any round binding `{ slot: 'faces' }` gets the collected media — the "variable in any other arbitrary round."
- This is also the honest answer to **"where is spotlight"**: spotlight is locked to Truth or Share's flow; `collect` is the **reusable** share primitive Custom games can actually use.

Largest piece — sequence it last; it leans on everything above.

### 2.5 Implementation notes (2026-06-04 audit — corrections + concrete shapes)

Two corrections from inspecting the existing blocks; these change the build, so they are
captured before coding:

1. **`collect → drawvote` does NOT work as written.** The `draw` block stores **vector
   strokes** (`DrawValue = { strokes }`) and `drawvote` renders/judges strokes — a
   collected photo is a **bitmap dataURL**, which drawvote cannot render. So a photo
   collect needs **its own image gallery host + an image-vote judge** (a small new
   `photovote` block, or a bitmap mode on the vote block that shows `<img>` options), not
   a reuse of drawvote. (A *sketch* collect that reuses the draw canvas could feed
   drawvote, but that is just the draw block.)
2. **"No engine change" is optimistic.** Slot binding resolves **mid-game** (after the
   collect round closes), not at host load, so it is not the load-time `resolveComposition`
   path. Resolve it **lazily**: when the host advances to a round with a slot binding,
   build the content from the collected inputs *then* (the two-phase `derive` path already
   fires per-round at advance time — slot resolution is a sibling of `derive`).

Concrete shapes to build to:
- **Block:** `blocks/collect/block.ts` — `CollectContent { prompt; mode: 'everyone'|'directed'; kind: 'photo'|'text'; timer }`; `CollectInput { media?: string; text?: string }`. Player view downscales a photo on-device (lift the helper out of Truth or Share's `Player.vue`) and submits the dataURL as the round input; host shows a live gallery; `aggregate` = the gallery. Unscored.
- **Slot publish:** the collect round just uses the normal block input channel; the slot name defaults to the round (or `collect: { slot }` to name it for later binding).
- **Runtime deck from a slot** (pure, testable now): `slotDeck(inputs, roster) → Deck` with columns `player | name | value`, one row per submission. Then later rounds bind with the EXISTING deck machinery against a reserved `@<slot>` deck id (`draw: N` + `bindings: { image: { deck: '@faces', column: 'value' } }`) — so slots reuse mode-1/mode-2 instead of a new `{ slot }` binding syntax.
- **Host wiring:** on collect-round close, stash `slotDeck(...)` in a runtime map; when advancing to a round referencing `@<slot>`, resolve that round's content from it (lazy, like `derive`).

Build order within 2c: (a) the standalone `collect` block + an image-vote judge + a `collect → photovote` recipe (usable on its own); (b) the slot→runtime-deck + lazy resolution for the cross-round-variable; (c) directed mode + editor support.

---

## 3. Decks × spotlight (and other pool-shaped blocks) — mode 3, column→array

Spotlight's content is **prompt pools** (string arrays: `truthsMild`, `sharesSpicy`, …).
A deck feeds those by aggregating a **whole column into an array field**, optionally
filtered by another column — a third binding flavor:

- **Mode 3 — column→array** (`lists: { truthsMild: { deck, column: 'prompt', where: { kind: 'truth', tier: 'mild' } } }`).

So a host drops in a community **Prompt Deck** of dares instead of typing them.

> **Audit finding (2026-06-04) — mode 3 is deferred, on purpose.** The only blocks with
> a string-array content field are `spotlight` and `cellar`, **both custom-flow** (Truth
> or Share, Quiz or Die). **No composable block has a string-array field**, so mode 3
> would be engine surface with no consumer it can reach through the generic editor +
> resolver (poll/rank options are `{ id, label }` objects, not strings — that is mode-2
> territory, not a string column→array). Mode 3 only pays off **bundled with** making a
> string-array surface deck-configurable: either teach Truth or Share to source its
> prompt pools from a linked Prompt Deck (its own custom flow, a deliberate feature), or
> add a generic **prompt-list block** (a string-array round) that mode 3 then fills.
> Until one of those exists, building mode 3 is premature. So **Phase 2b's shipped
> deliverable is the editor recipe-discoverability polish** (§4); the prompt-deck work
> moves to a future phase alongside its consumer.

---

## 4. "All blocks usable by users" — the finding + the fix

**Finding (verified):** the roster is **20** blocks. Custom composes all **17**
generic-renderer blocks; the editor surfaces them as **9 single blocks + 6 two-phase
recipes** (Write & Vote, Mad Lib & Vote, Would You Split, Lie Detector, Sketch & Vote,
Hidden Faker — which is where quip/fill/faker/vote/split/fibvote/drawvote/accuse live).
The 3 absent — **`bars` (Circuit Cypher), `spotlight` (Truth or Share), `cellar`
(Quiz or Die)** — are **custom-flow** blocks bound to their game's transport + turn
structure; they cannot run standalone in the generic renderer. So **no composable block
is missing**.

The real issues, and the fixes:
- **Discoverability** (the "so many missing things" feeling): the Add panel shows 9
  singles and hides the make/judge blocks inside recipes, so it *looks* sparse. **Fix:**
  group + label recipes clearly and name their constituent blocks, with a one-line note
  that bars/spotlight/cellar are part of their flagship game. Small, isolated editor polish.
- **The genuine new capability** ("where is spotlight"): the **`collect` block (§2)** is
  the reusable share/spotlight-style primitive Custom games can use. That is the answer.
- **Optional:** a `bars → vote` recipe ("Rap Verse → Vote") to surface bars standalone-ish.
  Marginal; flag, don't force.

---

## 5. MCP + docs — keep complete as each piece lands

- **MCP:** `list_my_decks` / `save_deck` / `update_deck` tools; reference-a-library-deck
  in a game config; the `collect` block + slot bindings + mode-3 column→array in the
  FORMAT_GUIDE; mode-2 pool docs. Hold the "it should be complete" bar.
- **Docs:** extend `content-decks-plan.md` (library + slots); new user-facing
  `docs/decks.md` (snapshot vs reference, kinds, the library); `authoring-a-game.md`
  (collect block + slot variables, mode-3); `CLAUDE.md` roster note (collect block;
  call out custom-flow exclusions); refresh `HANDOFF.md` / `BACKLOG.md`.

---

## 6. Recommended build order (each slice ships green, isolated)

1. **DONE — verification + this map.** Suite green, smokes green, MVP tied to invariant #3.
2. **DONE — Phase 2a — `/decks` library** (§1): table + repo + API + `/decks` browse + deck-editor page + ref-resolution at serve + editor "link a library deck" + MCP deck tools + docs. Shipped + deployed; verified by an authed end-to-end smoke.
3. **Phase 2b — discoverability (DONE) + prompt decks (DEFERRED, §3/§4):** the Add-panel recipe-discoverability polish (constituent-block tags + a custom-flow note) is shipped. Mode-3 column→array is **deferred** until it has a consumer (see the §3 audit note): bundle it with a deck-configurable Truth or Share or a new generic prompt-list block.
4. **Phase 2c — the `collect` block + play-time slots** (§2): collect block, slot→runtime-deck injection, collect→drawvote/rate recipes, directed mode. The next big build; reuses relay media + derive + resolver. Also the home for a prompt-list block that mode-3 could fill.
5. **Folded in where they fit:** mode-2 `pool` descriptors on guess/poll/ballpark; column-type filtering in the binding helper (image field → image columns only).

---

## 7. Deck-fed pools — shipped (the real generalization)

The pool-driven flagships are deck-feedable via a game-level `ContentPool` (not a block
`pool`): a saved game attaches a creator deck under the reserved `config.decks.pool` key,
and `HostRoom.resolveConfig` re-runs `buildConfig` over `poolRowsFor(contentPool, deck)`.

- **Phase 1 (DONE):** the 6 single-prompt-column games (quip-clash, open-mic, backronym,
  most-likely, hivemind, sketch-spot) + `remix_game` (csv) + `RemixWithDeck`.
- **Phase 2 (DONE):** the 6 typed-pool games (fib-finder, faker, ballpark,
  what-you-didnt-know, mad-libs, split-room). Per-game `fromRow` mappers in
  `runtime/decks.ts` map a creator deck row (multi-column where needed: options + correct
  index; templates with `{token}`-derived blanks). **Answer withholding:**
  `ContentPool.answerColumns` (mirrored in `catalog.pool`, sync-tested) lets
  `redactDecks(rounds, decks, pluginId)` null a typed pool deck's answer columns for
  non-owners, since the pool deck is not a bound deck. Typed remixes go save_deck → deckId.
- **Decks by Doot (DONE, growing):** `scripts/seed-decks.mjs` upserts public + remixable
  starter decks (`scripts/decks-by-doot.data.mjs`) for every pool game, idempotent by name
  under a stable Doot account. Add more themed decks by editing the data file and re-running.
- **Phase 3 (LATER):** the custom-flow multi-pool games (Truth or Share, Quiz or Die) need a
  multi-pool `ContentPool` variant (`fromRows(rows[]) => GameComposition`) since one deck
  feeds several arrays (tiers/kinds, questions + finale categories).

Leftover polish: clamp the lobby round-slider max to an attached deck's row count;
column-type filtering in `RoundBindings`; a Playwright smoke that hosts a remix; an editor
"Content" tab to attach or detach a pool deck.
