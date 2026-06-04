# Content banks & bindings — design plan

Status: **plan / research** (not yet built). A core-engine feature so creators build
big, replayable, data-driven games by feeding **banks** of content (a named-column
table of rows) instead of authoring every value by hand — with **spreadsheet import**
and two ways to use a bank:

1. **Draw whole rounds** from a typed bank ("play 10 of these 50 trivia questions").
2. **Bind any field** of any round to a bank column ("this round's image + prompt +
   answer all come from one row of this bank"), with the rest of the round authored
   normally.

Reusable banks live in a **library** (create from the editor, manage in their own
section, import from CSV). Everything is **type-driven** off the existing block
content schemas and **additive** — a game with no banks behaves exactly as today.

Pairs with [`authoring-a-game.md`](./authoring-a-game.md),
[`markdown-games.md`](./markdown-games.md), and the block contract in
`packages/sdk/src/block.ts`.

---

## 1. Why

Authoring is round-at-a-time (editor, markdown/MCP), and replayability is hardcoded:
the flagships draw from TypeScript pools in `buildConfig` (Quip Clash `PROMPT_POOL`,
Fib Finder `FACTS`, Faker `SECRETS`, …) — power that **only first-party code has**.

Creators want to: bulk-load content from a spreadsheet; reuse a "question bank"
across games; and **mix** a bank with hand-authored structure — e.g. author a `guess`
round's wrong answers by hand but pull the `prompt`, `image`, and `correct` value from
one row of a bank, **keeping them correlated** (the image matches the question matches
the answer). This plan makes banks + bindings a small, isolated engine primitive that
delivers all of that.

## 2. The model (one shape, two homes, two uses)

### 2.1 A Bank (one shape)

```ts
interface BankColumn { key: string; label: string; type: 'text' | 'image' | 'number' }
interface Bank {
  columns: BankColumn[]
  rows: Array<Record<string, string | number>>   // each row = one CORRELATED set
}
```

A bank is generic: named, loosely-typed columns and rows. A row is the unit of
correlation — when a round draws a row, every field bound to that bank reads from the
**same** row, so the image, prompt, and answer stay together. Banks import from a
spreadsheet (header → columns, rows → rows; `image` columns hold URLs).

**Two homes for the same shape:**
- **Library** — a durable `banks` table, user-owned, reusable, editable, CSV-imported,
  shown in a `/banks` section. The authoring source.
- **Inline in a game config** — `config.banks: Record<localId, Bank>`. When a creator
  uses a library bank in a game, the editor **snapshots** it inline (optionally
  recording `sourceBankId` for a manual "re-sync"). The game is self-contained, so the
  **existing config redaction + host-load path needs no new cross-entity serving** (the
  elegance unlock: a public game's banks ride the same `redactConfigForViewer` path).

### 2.2 Two ways to use a bank (both draw rows; both default to a no-op when absent)

A `RoundInstance` gains two optional, mutually-exclusive fields plus a multiplier:

```ts
interface RoundInstance {
  block: string
  content: unknown
  from?: number[]
  // NEW (all optional):
  draw?: number                              // emit N instances, each a DISTINCT row (default 1)
  bindings?: Record<string, BankRef>         // mode 1: scalar field path -> bank column
  pool?: { bank: string }                    // mode 2: whole content from block.pool.fromRow(row)
}
interface BankRef { bank: string; column: string }   // bank = config-local id
```

- **Mode 1 — field bindings (the flexible star).** Map scalar content fields (incl.
  `image`) to bank columns. Unbound fields keep their authored value. All fields bound
  to the *same* bank in one round read one drawn row → cross-field correlation for free.
  Works for ANY block, no per-block code. Example: a `guess` round authored with three
  wrong options, plus `bindings: { prompt: bankA.q, image: bankA.pic, "options.0.label": bankA.right, correct: 0 }`.
- **Mode 2 — typed pool (for structured content).** Some blocks have array/nested
  content (`guess.options`, `fill.blanks`) that doesn't map to one column. Those blocks
  declare a `pool` descriptor (below); `pool: { bank }` assembles the whole content from
  a row via `block.pool.fromRow`. This is "import a typed question bank → rounds."
- **`draw: N`** turns either mode into a **template**: emit N round-instances, each a
  distinct row (seeded shuffle, no repeats within a game). `draw` defaults to 1, so a
  single bound round is just `draw: 1`. The host "how many" picker (`roundOptions`)
  drives N, exactly as for today's flagships.

### 2.3 The block `pool` descriptor (type-driven, only for mode 2 / typed import)

Additive on `defineBlock`; needed only for structured blocks + typed CSV validation.
Everything else (the bank editor, the binding column picker, mode-1 validation) derives
from the existing `contentSchema`.

```ts
interface BlockPool<Content> {
  /** Recommended columns for a typed import of this block (question, option1.., correct…). */
  columns: PoolColumnSpec
  /** Assemble full Content from one bank row + shared settings (handles options/blanks). */
  fromRow: (row: Record<string, string | number>, settings: Partial<Content>) => Content
  /** Which produced field is the answer key (so redaction knows the secret column). */
  answerField?: keyof Content
  sample?: Record<string, string>            // shown in the editor + MCP guide
}
```

## 3. Resolution (pure, host-time, isolated)

A pure `resolveComposition(plugin, config, seed, opts) → GameComposition` (in
`packages/games/src/runtime`, beside `derive.ts`). For each round: if it has `draw`/
`bindings`/`pool`, `seededShuffle(seed:roundId)` the referenced bank's rows, take N
distinct rows, and per row either fill bound fields (mode 1) or `block.pool.fromRow`
(mode 2); else pass the round through untouched. Concatenate, clamp to 50 rounds, carry
`roundOptions`. **No-op when `config.banks` is empty** — zero cost for existing games.

The host (`HostRoom`) calls this where it calls `buildConfig` today; the two-phase
`derive` machinery is unchanged (a resolved round is an ordinary round). The flagships
can migrate their TS pools to declared banks incrementally (dogfooding), or keep
`buildConfig` as an escape hatch.

## 4. Redaction (security-critical, binding-aware)

A bank can hold answers (a trivia bank's answer column, a faker word column). The
answer-withholding invariant (#3) must hold for banks exactly as for rounds, in **both**
existing paths — `redactGameConfig` (relay, `@doot-games/games`) and
`redactConfigForViewer` (API, `games-repo.ts`).

The binding tells redaction what is secret: a `config.banks` **column is secret** iff
some round binds it to an answer-bearing field — i.e. a field named in
`REDACTION_RULES[block]` (mode 1) or the block's `pool.answerField` (mode 2). Redaction
then **nulls those cells** in the served `config.banks` and applies the existing
per-round rules to resolved/inline content. A `catalog.test.ts` case asserts every
answer-bearing binding strips its bank column (mirroring the round-redaction test).

This reuses the *existing* host-vs-viewer model verified in code: the owner host gets
the full config (answers intact, withheld at reveal); a non-owner gets the redacted
config (answer columns blanked) — no new model, no new endpoint.

## 5. Import (spreadsheet → bank)

Pure `parseSheet(text|file) → { columns, rows, errors[] }`, unit-tested.
- **Paste TSV** (Google Sheets / Excel copy is tab-delimited with a header) — lowest
  friction. **Paste/upload CSV** (RFC-4180 quoting). **Excel** = "Download as CSV"
  (avoids the heavy, CVE-prone SheetJS). **Published Google-Sheet CSV URL** (phase 2),
  fetched server-side through the existing SSRF guard (`server/utils/fetch-image.ts`).
- For a **generic bank**: header row → columns (type inferred: a column of URLs →
  `image`, all-numeric → `number`, else `text`; editable). For a **typed import**
  (mode 2): map columns to the block's `pool.columns`, validate each row through the
  content schema, surface per-row errors (`{ row, message }`) without failing the batch.
- CSV lib: hand-roll a ~50-line delimiter-aware parser for MVP; adopt **papaparse**
  (focused) only if real files break it. Keep-deps-small.

## 6. UI (optional, isolated, introspective)

- **Bank editor** (`@doot-games/ui`): a columns + rows grid with add/remove/reorder, a
  per-column type, and an **Import** button (paste/upload → preview → append). Reused by
  the library page and the in-editor bank panel.
- **Banks library** (`/banks`): list/create/edit/delete the user's banks; import CSV;
  "use in a game" deep-links to the editor. A durable, browsable section (the "separate
  thing").
- **Binding helper** (the key UX): a small, OPTIONAL decorator on a `SchemaField`. A
  field shows a "🔗 from a bank" affordance; clicking opens a picker that **introspects
  the game's banks and lists their columns** (filtered by type — only `image` columns
  for an image field), so the creator picks a column without typing. Bound fields render
  a chip ("prompt ← Trivia bank · Question") with a live sample. This is an additive
  field affordance, not a SchemaForm rewrite.
- **Editor integration** (`GameEditor.client.vue`): a collapsed **Banks** panel (manage
  the game's inline banks + import a library bank); per-round, the `draw` (reusing the
  `roundOptions` control) and bindings via the helper; the right-pane preview samples a
  row so the creator sees a real resolved round.
- **No new per-block UI**: item/settings forms are `SchemaForm`; the binding helper is
  one shared decorator; the bank editor is one shared grid.

## 7. Separation of concerns (the layering)

| Layer | Owns |
| --- | --- |
| `@doot-games/sdk` | Types: `Bank`, `BankColumn`, `BankRef`, the `RoundInstance` additions, the block `pool` descriptor. Pure contract, no logic. |
| `@doot-games/games` (`runtime/`) | The pure **resolver** (`resolveComposition`) + binding-aware **redaction** helper. Block-aware (uses `pool.fromRow`, `REDACTION_RULES`), framework-free, unit-tested. |
| `@doot-games/ui` | The **bank editor** grid + the **binding helper** decorator. Reusable, dumb components. |
| `apps/web` | Durable **banks** (table, `/banks` page, API + CSV-import endpoint), editor wiring, host resolve-at-load, the two redaction call sites, and MCP. |

Each layer is replaceable in isolation; the engine never imports the UI; the durable
library is purely an `apps/web` concern that produces the inline snapshots the pure
resolver consumes.

## 8. MCP & markdown

- **MCP**: `set_game_bank(gameId, name, csv|tsv|json, columns?)` imports/sets an inline
  bank (reusing `parseSheet`), and `bind_round_field` / a richer `update_game` markdown
  expresses `draw`/`bindings`/`pool`. `doot_format_guide` documents banks + bindings +
  per-block typed columns (from each `pool.sample`). Cover/visibility/etc. already shipped.
- **Markdown**: a `## bank <name>` block (a fenced CSV/TSV body → a bank) and round
  syntax for `draw:`, `bind: <field> = <bank>.<column>`, and `pool: <bank>` (typed).
  `parseMarkdownGame` emits `config.banks` + the round additions.
- Docs: `markdown-games.md`, `authoring-a-game.md`, and this file.

## 9. Persistence

- `gameInputSchema`: add `config.banks` (shape-validated; cells stay an open record)
  and the `RoundInstance` additions. Raise `MAX_CONFIG_BYTES` (512KB → ~2MB) and cap
  rows/bank (~1000) + banks/game (~20); text + URL banks stay small.
- New `banks` table (library): `{ id, ownerId, name, columns(JSON), rows(JSON),
  createdAt, updatedAt }` + owner-scoped CRUD + a CSV-import route (SSRF-guarded for the
  Sheets-URL path). Mirrors the `games` repo patterns (visibility can come later; banks
  are private-by-default authoring assets).

## 10. Why this stays elegant (not bloat)

- **One data shape** (Bank) with **two homes** (library row + inline snapshot) and
  **two uses** (bind / typed-pool) — no parallel systems.
- **Fully additive + optional**: no `banks`, no `bindings`, no `pool` ⇒ byte-identical
  behavior to today; the resolver and redaction short-circuit.
- **Type-driven**: the existing `contentSchema` drives forms + validation; the binding
  picker introspects bank columns; only structured blocks need the `pool` descriptor.
- **Reuses the existing redaction + host-load model** via config-local snapshots — no
  new serving endpoint, no new trust path.
- Each concern lives in one layer; the engine resolver is pure and small.

## 11. Phasing

- **MVP**: inline `config.banks` + mode-1 **field bindings** + `draw` + the pure
  resolver + binding-aware redaction (both paths) + the in-editor bank panel & binding
  helper with **paste TSV/CSV** import + tests. (No library table yet; banks are
  game-local. Mode-1 covers the headline "bind any field, correlated by row.")
- **Phase 2**: the durable **`banks` library** (`/banks`, table, reuse across games) +
  mode-2 **typed pools** (`pool` descriptor on guess/poll/ballpark/quip + typed import) +
  flagship migration onto declared banks.
- **Phase 3**: published Google-Sheet CSV URL import, MCP `set_game_bank` + markdown
  `## bank`, two-phase pools (a make bank → judge), and bank sharing/visibility.

## 12. Naming

Proposed: **Bank** for the durable/inline row table (reads well: "question bank",
"prompt bank", "image bank"), **binding** for a field→column link, **draw** for the
per-play sampling. ("Pool" stays an internal synonym; the file keeps its name for now.)
Open to "Deck" / "Set" if preferred.

## 13. Open decisions (owner)

1. **Snapshot vs. live reference** for library banks in a game. (Plan recommends
   snapshot-into-config — far simpler redaction/serving; "re-sync" is a manual editor
   action. Live references are a phase-3 option.)
2. **Naming**: Bank vs. Pool vs. Deck.
3. **MVP scope**: mode-1 bindings only (game-local banks), deferring the library table +
   typed pools to phase 2? (Recommended — ships the flexible core fastest, isolated.)
4. **Type inference** for imported columns (auto image/number/text + manual override) —
   acceptable heuristics?
5. **Caps**: rows/bank, banks/game, new `MAX_CONFIG_BYTES`.
6. **Which blocks get the typed `pool` descriptor first** (phase 2): guess/poll/ballpark/quip proposed.

## 14. Rough effort

- **MVP** (mode-1 bindings, game-local banks, resolver, redaction, editor helper + paste
  import, tests): **[large]**, ~4 reviewable slices — (a) sdk types + pure resolver +
  tests, (b) redaction (binding-aware) + persistence, (c) bank panel + paste import,
  (d) the binding helper + preview. Each shippable on its own.
- **Phase 2** (library table + `/banks` + typed pools + flagship migration): another
  **[large]**.
- **Phase 3** (Sheets URL, MCP/markdown, two-phase pools, sharing): **[medium–large]**.
