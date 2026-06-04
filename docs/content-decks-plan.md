# Content decks & bindings — design plan

Status: **plan / research** (not yet built). A core-engine feature so creators build
big, replayable, data-driven games by feeding **decks** of content (a named-column
table of rows) instead of authoring every value by hand — with **spreadsheet import**
and two ways to use a deck:

1. **Draw whole rounds** from a typed deck ("play 10 of these 50 trivia questions").
2. **Bind any field** of any round to a deck column ("this round's image + prompt +
   answer all come from one row of this deck"), with the rest of the round authored
   normally.

Reusable decks live in a **library** (create from the editor, manage in their own
section, import from CSV). Everything is **type-driven** off the existing block
content schemas and **additive** — a game with no decks behaves exactly as today.

Pairs with [`authoring-a-game.md`](./authoring-a-game.md),
[`markdown-games.md`](./markdown-games.md), and the block contract in
`packages/sdk/src/block.ts`.

---

## 1. Why

Authoring is round-at-a-time (editor, markdown/MCP), and replayability is hardcoded:
the flagships draw from TypeScript pools in `buildConfig` (Quip Clash `PROMPT_POOL`,
Fib Finder `FACTS`, Faker `SECRETS`, …) — power that **only first-party code has**.

Creators want to: bulk-load content from a spreadsheet; reuse a "question deck"
across games; and **mix** a deck with hand-authored structure — e.g. author a `guess`
round's wrong answers by hand but pull the `prompt`, `image`, and `correct` value from
one row of a deck, **keeping them correlated** (the image matches the question matches
the answer). This plan makes decks + bindings a small, isolated engine primitive that
delivers all of that.

## 2. The model (one shape, two homes, two uses)

### 2.1 A Deck (one shape)

```ts
interface DeckColumn { key: string; label: string; type: 'text' | 'image' | 'number' }
interface Deck {
  columns: DeckColumn[]
  rows: Array<Record<string, string | number>>   // each row = one CORRELATED "card"
  /** Optional descriptor that also drives behavior: a TYPED deck shaped for a block
   *  (kind: 'guess' | 'quip' | …) unlocks whole-round draws (mode 2) + typed import
   *  validation; an untyped/generic deck (undefined) powers field bindings (mode 1).
   *  Surfaced in the UI as "Quiz Deck", "Prompt Deck", … and is the same primitive a
   *  future card game would use as a "Card Deck". */
  kind?: string
}
```

A deck is a stack of "cards" (rows) with named columns (card fields). A row is the
unit of correlation — when a round draws a row, every field bound to that deck reads
the **same** row, so the image, prompt, and answer stay together. The draw mechanic is
literally "shuffle the deck (seeded) and deal N." Decks import from a spreadsheet
(header → columns, rows → cards; `image` columns hold URLs). **Naming**: the visible
label is the typed descriptor — Quiz Deck (guess), Prompt Deck (quip/fill), etc.; a
generic one is just a Deck. The future card-game system is the same primitive (a Card
Deck), so this unifies rather than conflicts.

**Two homes for the same shape:**
- **Library** — a durable `decks` table, user-owned, reusable, editable, CSV-imported,
  shown in a `/decks` section. The authoring source.
- **In a game config** — `config.decks: Record<localId, DeckUse>` where each is EITHER
  a **snapshot** (inline `Deck`, frozen at use) OR a **reference** (`{ ref: deckId }`)
  to a library deck. Both are supported (owner choice in the editor): snapshot = stable
  + self-contained; reference = edits to the library deck propagate to every game using
  it. (A snapshot may record `sourceDeckId` for a manual "re-sync"; a reference may pin
  a version.)

```ts
type DeckUse = { inline: Deck } | { ref: string; version?: number }
```

**References resolve to inline at serve time — the key elegance.** The GET/host-load
step loads any referenced library deck and **inlines** it into the served config
(full rows for the owner; redacted for others) BEFORE the existing redaction runs. So
the **engine resolver only ever sees inline decks** — it is entirely reference-agnostic,
and a public game's decks ride the same `redactConfigForViewer` path. References add
exactly one async resolution step in `apps/web`; they touch neither the pure resolver
nor the redaction rules.

### 2.2 Two ways to use a deck (both draw rows; both default to a no-op when absent)

A `RoundInstance` gains two optional, mutually-exclusive fields plus a multiplier:

```ts
interface RoundInstance {
  block: string
  content: unknown
  from?: number[]
  // NEW (all optional):
  draw?: number                              // emit N instances, each a DISTINCT row (default 1)
  bindings?: Record<string, DeckRef>         // mode 1: scalar field path -> deck column
  pool?: { deck: string }                    // mode 2: whole content from block.pool.fromRow(row)
}
interface DeckRef { deck: string; column: string }   // deck = config-local id
```

- **Mode 1 — field bindings (the flexible star).** Map scalar content fields (incl.
  `image`) to deck columns. Unbound fields keep their authored value. All fields bound
  to the *same* deck in one round read one drawn row → cross-field correlation for free.
  Works for ANY block, no per-block code. Example: a `guess` round authored with three
  wrong options, plus `bindings: { prompt: deckA.q, image: deckA.pic, "options.0.label": deckA.right, correct: 0 }`.
- **Mode 2 — typed pool (for structured content).** Some blocks have array/nested
  content (`guess.options`, `fill.blanks`) that doesn't map to one column. Those blocks
  declare a `pool` descriptor (below); `pool: { deck }` assembles the whole content from
  a row via `block.pool.fromRow`. This is "import a typed question deck → rounds."
- **`draw: N`** turns either mode into a **template**: emit N round-instances, each a
  distinct row (seeded shuffle, no repeats within a game). `draw` defaults to 1, so a
  single bound round is just `draw: 1`. The host "how many" picker (`roundOptions`)
  drives N, exactly as for today's flagships.

### 2.3 The block `pool` descriptor (type-driven, only for mode 2 / typed import)

Additive on `defineBlock`; needed only for structured blocks + typed CSV validation.
Everything else (the deck editor, the binding column picker, mode-1 validation) derives
from the existing `contentSchema`.

```ts
interface BlockPool<Content> {
  /** Recommended columns for a typed import of this block (question, option1.., correct…). */
  columns: PoolColumnSpec
  /** Assemble full Content from one deck row + shared settings (handles options/blanks). */
  fromRow: (row: Record<string, string | number>, settings: Partial<Content>) => Content
  /** Which produced field is the answer key (so redaction knows the secret column). */
  answerField?: keyof Content
  sample?: Record<string, string>            // shown in the editor + MCP guide
}
```

## 3. Resolution (pure, host-time, isolated)

A pure `resolveComposition(plugin, config, seed, opts) → GameComposition` (in
`packages/games/src/runtime`, beside `derive.ts`). For each round: if it has `draw`/
`bindings`/`pool`, `seededShuffle(seed:roundId)` the referenced deck's rows, take N
distinct rows, and per row either fill bound fields (mode 1) or `block.pool.fromRow`
(mode 2); else pass the round through untouched. Concatenate, clamp to 50 rounds, carry
`roundOptions`. **No-op when `config.decks` is empty** — zero cost for existing games.

The host (`HostRoom`) calls this where it calls `buildConfig` today; the two-phase
`derive` machinery is unchanged (a resolved round is an ordinary round). The flagships
can migrate their TS pools to declared decks incrementally (dogfooding), or keep
`buildConfig` as an escape hatch.

## 4. Redaction (security-critical, binding-aware)

A deck can hold answers (a trivia deck's answer column, a faker word column). The
answer-withholding invariant (#3) must hold for decks exactly as for rounds, in **both**
existing paths — `redactGameConfig` (relay, `@doot-games/games`) and
`redactConfigForViewer` (API, `games-repo.ts`).

The binding tells redaction what is secret: a `config.decks` **column is secret** iff
some round binds it to an answer-bearing field — i.e. a field named in
`REDACTION_RULES[block]` (mode 1) or the block's `pool.answerField` (mode 2). Redaction
then **nulls those cells** in the served `config.decks` and applies the existing
per-round rules to resolved/inline content. A `catalog.test.ts` case asserts every
answer-bearing binding strips its deck column (mirroring the round-redaction test).

This reuses the *existing* host-vs-viewer model verified in code: the owner host gets
the full config (answers intact, withheld at reveal); a non-owner gets the redacted
config (answer columns blanked) — no new model, no new endpoint.

**Order with references**: the serve step first **resolves `{ ref }` → inline** (loading
the owner's library deck), then applies this binding-aware column redaction to all inline
decks (snapshot or resolved). So redaction logic is identical for both homes; only the
"fetch the rows" source differs.

## 5. Import (spreadsheet → deck)

Pure `parseSheet(text|file) → { columns, rows, errors[] }`, unit-tested.
- **Paste TSV** (Google Sheets / Excel copy is tab-delimited with a header) — lowest
  friction. **Paste/upload CSV** (RFC-4180 quoting). **Excel** = "Download as CSV"
  (avoids the heavy, CVE-prone SheetJS). **Published Google-Sheet CSV URL** (phase 2),
  fetched server-side through the existing SSRF guard (`server/utils/fetch-image.ts`).
- For a **generic deck**: header row → columns (type inferred: a column of URLs →
  `image`, all-numeric → `number`, else `text`; editable). For a **typed import**
  (mode 2): map columns to the block's `pool.columns`, validate each row through the
  content schema, surface per-row errors (`{ row, message }`) without failing the batch.
- CSV lib: hand-roll a ~50-line delimiter-aware parser for MVP; adopt **papaparse**
  (focused) only if real files break it. Keep-deps-small.

## 6. UI (optional, isolated, introspective)

- **Deck editor** (`@doot-games/ui`): a columns + rows grid with add/remove/reorder, a
  per-column type, and an **Import** button (paste/upload → preview → append). Reused by
  the library page and the in-editor deck panel.
- **Decks library** (`/decks`): list/create/edit/delete the user's decks; import CSV;
  "use in a game" deep-links to the editor. A durable, browsable section (the "separate
  thing").
- **Binding helper** (the key UX): a small, OPTIONAL decorator on a `SchemaField`. A
  field shows a "🔗 from a deck" affordance; clicking opens a picker that **introspects
  the game's decks and lists their columns** (filtered by type — only `image` columns
  for an image field), so the creator picks a column without typing. Bound fields render
  a chip ("prompt ← Trivia deck · Question") with a live sample. This is an additive
  field affordance, not a SchemaForm rewrite.
- **Editor integration** (`GameEditor.client.vue`): a collapsed **Decks** panel (manage
  the game's inline decks + import a library deck); per-round, the `draw` (reusing the
  `roundOptions` control) and bindings via the helper; the right-pane preview samples a
  row so the creator sees a real resolved round.
- **No new per-block UI**: item/settings forms are `SchemaForm`; the binding helper is
  one shared decorator; the deck editor is one shared grid.

## 7. Separation of concerns (the layering)

| Layer | Owns |
| --- | --- |
| `@doot-games/sdk` | Types: `Deck`, `DeckColumn`, `DeckRef`, the `RoundInstance` additions, the block `pool` descriptor. Pure contract, no logic. |
| `@doot-games/games` (`runtime/`) | The pure **resolver** (`resolveComposition`) + binding-aware **redaction** helper. Block-aware (uses `pool.fromRow`, `REDACTION_RULES`), framework-free, unit-tested. |
| `@doot-games/ui` | The **deck editor** grid + the **binding helper** decorator. Reusable, dumb components. |
| `apps/web` | Durable **decks** (table, `/decks` page, API + CSV-import endpoint), editor wiring, host resolve-at-load, the two redaction call sites, and MCP. |

Each layer is replaceable in isolation; the engine never imports the UI; the durable
library is purely an `apps/web` concern that produces the inline snapshots the pure
resolver consumes.

## 8. MCP & markdown

- **MCP**: `set_game_deck(gameId, name, csv|tsv|json, columns?)` imports/sets an inline
  deck (reusing `parseSheet`), and `bind_round_field` / a richer `update_game` markdown
  expresses `draw`/`bindings`/`pool`. `doot_format_guide` documents decks + bindings +
  per-block typed columns (from each `pool.sample`). Cover/visibility/etc. already shipped.
- **Markdown**: a `## deck <name>` block (a fenced CSV/TSV body → a deck) and round
  syntax for `draw:`, `bind: <field> = <deck>.<column>`, and `pool: <deck>` (typed).
  `parseMarkdownGame` emits `config.decks` + the round additions.
- Docs: `markdown-games.md`, `authoring-a-game.md`, and this file.

## 9. Persistence

- `gameInputSchema`: add `config.decks` (shape-validated; cells stay an open record)
  and the `RoundInstance` additions. Raise `MAX_CONFIG_BYTES` (512KB → ~2MB) and cap
  rows/deck (~1000) + decks/game (~20); text + URL decks stay small.
- New `decks` table (library): `{ id, ownerId, name, columns(JSON), rows(JSON),
  createdAt, updatedAt }` + owner-scoped CRUD + a CSV-import route (SSRF-guarded for the
  Sheets-URL path). Mirrors the `games` repo patterns (visibility can come later; decks
  are private-by-default authoring assets).

## 10. Why this stays elegant (not bloat)

- **One data shape** (Deck) with **two homes** (durable library + in-config as a
  snapshot *or* a reference) and **two uses** (bind / typed-pool) — no parallel systems.
  References resolve to inline at serve time, so the engine sees only one thing.
- **Fully additive + optional**: no `decks`, no `bindings`, no `pool` ⇒ byte-identical
  behavior to today; the resolver and redaction short-circuit.
- **Type-driven**: the existing `contentSchema` drives forms + validation; the binding
  picker introspects deck columns; only structured blocks need the `pool` descriptor.
- **Reuses the existing redaction + host-load model** via config-local snapshots — no
  new serving endpoint, no new trust path.
- Each concern lives in one layer; the engine resolver is pure and small.

## 11. Phasing

- **MVP**: inline `config.decks` + mode-1 **field bindings** + `draw` + the pure
  resolver + binding-aware redaction (both paths) + the in-editor deck panel & binding
  helper with **paste TSV/CSV** import + tests. (No library table yet; decks are
  game-local. Mode-1 covers the headline "bind any field, correlated by row.")
- **Phase 2**: the durable **`decks` library** (`/decks`, table, reuse across games) +
  mode-2 **typed pools** (`pool` descriptor on guess/poll/ballpark/quip + typed import) +
  flagship migration onto declared decks.
- **Phase 3**: published Google-Sheet CSV URL import, MCP `set_game_deck` + markdown
  `## deck`, two-phase pools (a make deck → judge), and deck sharing/visibility.

## 12. Naming (decided)

**Deck** — the row table (a stack of cards). **Binding** — a field→column link.
**Draw** — the seeded per-play deal. Decks carry a typed **descriptor** as their visible
label: **Quiz Deck** (guess), **Prompt Deck** (quip/fill), **Number Deck** (ballpark),
a generic **Deck** when untyped — and the future **Card Deck** is the same primitive, so
the planned card-game system *unifies* with this rather than colliding (one "shuffle &
deal" engine under both). The descriptor is also the type that gates typed-import +
whole-round draws.

## 13. Open decisions (owner)

Resolved: **snapshot AND reference** are both supported (reference resolves to inline at
serve time); **Deck** is the name (typed descriptors: Quiz/Prompt/Card Deck). Remaining:

1. **MVP scope**: ship mode-1 **field bindings + game-local snapshot decks + paste import**
   first (the flexible core, fully isolated), with the durable **library + references** and
   **typed pools** as phase 2? (Recommended — the `DeckUse` union + types land in the MVP so
   phase-2 references are purely additive, no rework.)
2. **Type inference** for imported columns (auto image/number/text + manual override) — OK?
3. **Caps**: rows/deck (~1000?), decks/game (~20?), new `MAX_CONFIG_BYTES` (~2MB?).
4. **First typed-pool blocks** (phase 2): guess/poll/ballpark/quip proposed.
5. **Reference staleness**: pin a deck `version` in the reference, or always resolve latest?

## 14. Rough effort

- **MVP** (mode-1 bindings, game-local decks, resolver, redaction, editor helper + paste
  import, tests): **[large]**, ~4 reviewable slices — (a) sdk types + pure resolver +
  tests, (b) redaction (binding-aware) + persistence, (c) deck panel + paste import,
  (d) the binding helper + preview. Each shippable on its own.
- **Phase 2** (library table + `/decks` + typed pools + flagship migration): another
  **[large]**.
- **Phase 3** (Sheets URL, MCP/markdown, two-phase pools, sharing): **[medium–large]**.
