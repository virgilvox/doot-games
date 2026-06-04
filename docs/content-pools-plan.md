# Content pools — design plan

Status: **plan / research** (not yet built). A core-engine feature so creators can
build a big, replayable game by feeding a **pool** of content (questions, prompts,
facts, dilemmas, …) instead of authoring rounds one at a time — including a
**spreadsheet import** (CSV / TSV-from-Sheets / Excel-via-CSV) that auto-populates a
collapsible pool. Type-driven off each block's existing content schema.

Pairs with [`docs/authoring-a-game.md`](./authoring-a-game.md),
[`docs/markdown-games.md`](./markdown-games.md), and the block contract in
`packages/sdk/src/block.ts`.

---

## 1. Why

Two authoring paths exist today and both are round-at-a-time:

- The **editor** (three-pane) and **markdown/MCP** add one `{ block, content }` round
  at a time. Building a 40-question trivia night means 40 hand-authored rounds.
- The **flagships** get replayability by hardcoding a pool in TypeScript and drawing
  from it in `buildConfig` (Quip Clash `PROMPT_POOL`, Mad Libs `STORY_POOL`, Fib
  Finder `FACTS`, Faker `SECRETS`, …). Great UX (a fresh set each play, a host
  "how many" picker via `roundOptions`) — but **only first-party code can do it**.

The gap: **a creator cannot author a big replayable pool**, and cannot bulk-import
one from a spreadsheet. This plan lifts the flagship pool pattern into the engine as
a declarative, type-driven, user-authorable structure, and adds spreadsheet import.

## 2. Goals / non-goals

**Goals**
- A first-class **pool** in a game config: "draw N of these M items each play," for
  any poolable block (guess/poll/rank/rate/ballpark/buzzer/hivemind/quip/fill/faker…).
- **Type-driven**: the block's Zod content schema is the single source of truth for
  the item form, the import columns, and validation. No per-block UI.
- **Spreadsheet import**: paste TSV (Google Sheets / Excel copy), upload/paste CSV,
  (phase 2) fetch a published Google-Sheet CSV URL. Per-row validation with clear
  errors; auto-populates a **collapsible** pool in the editor.
- **Two-phase pools**: a pool of make items (quip/fill/faker) that each expand into a
  make+judge pair (so a "prompt pool" drives Write&Vote, a "secret pool" drives Faker).
- **Answer-safe**: pools that carry answers (guess/ballpark/buzzer/fibvote/faker) must
  be redacted exactly like rounds — the invariant #3 hard requirement, both paths.
- **Back-compatible**: fixed-round games are unchanged; pools are additive; the
  flagships migrate to declared pools incrementally (dogfooding the feature).

**Non-goals (now)**
- A shared cross-game **pool library** with its own DB table (phase 3 idea below).
- Native **.xlsx** parsing (use "export to CSV"; SheetJS is heavy + has had CVEs).
- Live Google Sheets **API/OAuth** sync (paste or a public CSV export URL instead).
- AI generation of pool items (that's the MCP/Claude side, already possible).

## 3. Core model (type-driven)

### 3.1 The block `pool` descriptor (SDK)

`defineBlock` gains one optional, additive field. It declares which slice of a
block's content is **per-item** vs. **shared settings**, and how a spreadsheet row
maps to an item. Everything else (the item form, validation) is derived from the
existing `contentSchema`.

```ts
interface BlockPool<Content, Item> {
  /** The per-item content (a sub-shape of Content): what varies row to row. */
  itemSchema: z.ZodType<Item>
  /** Merge one pool item + the shared settings into a full round Content. */
  toContent: (item: Item, settings: Partial<Content>) => Content
  /** Spreadsheet column spec for import. Each maps a column header to how it fills
   *  the item; `parse` turns the raw cell(s) into the item field(s). Wildcard
   *  columns (e.g. "option1..optionN", "blank:<id>") handle array/nested shapes. */
  columns: PoolColumnSpec
  /** Optional: a short sample row, surfaced in the editor + MCP guide. */
  sample?: Record<string, string>
}
// RoundBlock<Content, Input> gains:  pool?: BlockPool<Content, unknown>
```

Examples (sketch):
- `guess`: item `{ prompt, options: {label}[], correct }`; columns
  `question, option1..optionN, correct` (correct = the 1-based option # or its text);
  settings `{ timer, subject }`. `toContent` assembles options + correct index.
- `quip`: item `{ prompt }`; column `prompt`; settings `{ timer, maxLength, safetyAnswers }`.
- `ballpark`: item `{ prompt, answer, unit }`; columns `prompt, answer, unit`; settings `{ timer }`.
- `poll`: item `{ prompt, options }`; columns `question, option1..optionN`.
- `rate`: item `{ subject }` (or `{ prompt }`); settings `{ categories, scale, timer }`.
- `fill`: item `{ template, blanks }`; columns `template` + `blank:<id>` hint columns.
- `faker`: item `{ category, word }`; columns `category, word`; settings `{ timer }`.

Why `itemSchema` + `toContent` instead of inferring: blocks with array/nested fields
(guess options, fill blanks) don't map 1:1 to flat content; the block owns the
assembly. But the **form** for editing an item is still `SchemaForm` over
`itemSchema` (no new UI), and **validation** is `contentSchema.safeParse(toContent(...))`.

### 3.2 Config shape (engine)

`GameComposition` gains an optional `pools`, expanded at host/build time into rounds:

```ts
interface PoolGroup {
  id: string
  block: string                  // a poolable block kind
  label?: string                 // editor display ("Trivia questions")
  settings: Record<string, unknown>   // shared content (timer, scale, …)
  items: unknown[]               // validated against block.pool.itemSchema
  draw?: number | 'all'          // how many to play per game (default 'all')
  /** Optional two-phase: each drawn item expands to make + this judge round. */
  judge?: { block: string; settings: Record<string, unknown> }
}
interface GameComposition { title: string; rounds: RoundInstance[]; pools?: PoolGroup[] }
```

A game can mix fixed `rounds` and `pools`. Ordering: TBD decision (interleave by an
explicit order field, or pools after fixed rounds). MVP: pools render after fixed
rounds, each group contiguous.

## 4. Runtime expansion

A pure `expandPools(plugin, config, seed, opts)` → `GameComposition` with `pools`
resolved to `rounds`. It IS the generalized `buildConfig`:

1. For each `PoolGroup`: `seededShuffle(seed:groupId)(items)`, take `draw` (clamped),
   `block.pool.toContent(item, settings)` per item → a round; if `judge` set, append
   the derived judge round (the existing `derive` machinery handles the rest).
2. Concatenate with fixed rounds; clamp to the 50-round cap; carry `roundOptions`
   (per group, or a game-level draw) so the host "how many" picker still works.

Then:
- **Flagships migrate**: re-express `PROMPT_POOL`/`STORY_POOL`/… as declared `pools`
  (or keep `buildConfig` calling `expandPools`). Removes the hand-rolled `pair()`
  duplication; dogfoods the feature; the `safetyAnswers` work already fits as a setting.
- The host path (`HostRoom`) calls `expandPools` where it calls `buildConfig` today.
- `defineGame` can keep `buildConfig` as the escape hatch; `pools` is the declarative norm.

## 5. Import pipeline

`parseSheet(text|file, columns) → { items, errors[] }`, pure + unit-tested.

- **TSV (paste from Google Sheets / Excel)**: a Sheets/Excel copy is tab-delimited
  with a header row — the lowest-friction path. Detect delimiter (tab vs comma).
- **CSV (paste or .csv upload)**: RFC-4180-ish (quoted fields, embedded commas/newlines).
- **Google Sheet URL (phase 2)**: a *published* sheet's `…/export?format=csv&gid=…`,
  fetched **server-side through the existing SSRF guard** (`server/utils/fetch-image.ts`
  pattern: https-only, size-capped, no private IPs), then parsed.
- **.xlsx**: not parsed natively — the UI tells the user "Download as CSV" (one click
  in Sheets/Excel). Avoids SheetJS (large + CVE history). Revisit only on demand.

Parsing detail: header row → map to `pool.columns`; wildcard columns
(`option1, option2, …` / `blank:noun`) collected into arrays; `pool.columns[*].parse`
builds each item; `block.pool.itemSchema.safeParse` validates; bad rows return a
`{ row, message }` error (shown inline) rather than failing the whole import.

**CSV lib decision**: hand-roll a ~50-line delimiter-aware parser for MVP (no dep,
covers paste + simple files); adopt **papaparse** (focused, robust quoting) only if
real-world files break the hand-roll. (Keep-deps-small ethos.)

## 6. Editor UX

A **collapsible Pool panel** in the editor (`GameEditor.client.vue`), alongside the
rounds rail:

- "Add a pool" → pick a poolable block → a panel with: shared **settings** (a
  `SchemaForm` over the non-item content), an **items list** (collapsed; each row an
  item summary, expandable to a `SchemaForm` over `itemSchema`), add/remove/reorder,
  a **draw-N** control (reusing the `roundOptions` UI), and an **Import** button.
- **Import flow**: paste TSV/CSV or upload .csv (phase 2: a Sheets URL field) →
  a **column-mapping preview** (auto-matched by header, editable) → per-row validation
  with a count of "42 added, 3 skipped (see errors)" → items appended to the pool.
- The right-pane **preview** renders a sampled item through the block's Host/Player
  views (reusing `HostPreview`/`PlayerPreview`), so the creator sees a real round.
- Two-phase: a pool of quip/fill/faker offers the matching judge as a one-click
  pairing (reusing the existing "recipe" concept), so a "prompt pool" → Write & Vote.

No new per-block UI: the item form and settings form are both `SchemaForm`, driven by
`itemSchema` / the content schema (the introspector already powers this).

## 7. Persistence & redaction (security-critical)

- `gameInputSchema` (server) gains `config.pools` (validated shape; deep item content
  stays an open record like rounds, validated client-side + by `expandPools`).
- `serializeConfig`'s `MAX_CONFIG_BYTES` cap now must hold a pool (dozens–hundreds of
  items). Raise thoughtfully (e.g. 512KB → 1–2MB) and/or cap items-per-pool (e.g. 500)
  and pools-per-game. A pool of text is still small; images are URLs.
- **Redaction must cover pools, both paths.** Today `redactGameConfig` (relay, in
  `@doot-games/games`) and `redactConfigForViewer` (API, `games-repo.ts`) map over
  `config.rounds` applying `REDACTION_RULES[block]`. They MUST also map over
  `config.pools[*].items` (and `judge`), stripping the same answer fields from every
  item, or a saved public trivia/ballpark/faker **pool would leak answers** — a hard
  invariant #3 violation. Add a `catalog.test.ts` case asserting pool redaction for
  every answer-bearing block, mirroring the existing round redaction test.
  - Note: a faker pool's `word` is per-item secret; ballpark `answer`; guess/buzzer
    `correct`; fibvote `truth`. The existing `REDACTION_RULES` map already names these
    fields — reuse it against item shapes.
- The host derives answers from the **stored** (unredacted) config at play time, never
  the server, exactly as today; `expandPools` runs host-side with full data.

## 8. MCP & markdown

- **Markdown**: a `## pool <block>` heading whose `- item` lines (or a fenced CSV
  block) become pool items, plus the usual settings + a `draw:` field. Parser extends
  `parseMarkdownGame` to emit a `PoolGroup`. The two-phase variants (`pool quip`, etc.)
  expand like the single-heading recipes do.
- **MCP**: a new `set_game_pool` tool (gameId, block, settings, and items as
  CSV/TSV/JSON), reusing `parseSheet` + per-row validation, returning added/skipped
  counts — so Claude can bulk-load a pool it generated or the user pasted. `save_game`/
  `update_game` already round-trip the full markdown; `doot_format_guide` documents the
  `## pool` syntax + columns per block (derived from each `pool.sample`).
- Docs: `markdown-games.md` (the `## pool` syntax + per-block columns),
  `authoring-a-game.md` (the editor pool panel + import), and this file.

## 9. Validation & testing

- Pure, unit-tested: `parseSheet` (delimiter detection, quoting, wildcard columns,
  bad-row errors), each block's `pool.toContent` + `itemSchema`, `expandPools`
  (seeded draw is deterministic; draw-N clamps; two-phase pairing; 50-round cap),
  and **pool redaction** (catalog test: every answer-bearing block strips its key
  from pool items in both redaction paths).
- A browser smoke: import a CSV into a guess pool, host, confirm rounds play and the
  answer never reaches the relay before reveal.

## 10. Phasing

- **MVP**: `pool` descriptor on guess/poll/quip/ballpark (the common cases) +
  `PoolGroup` in the config + `expandPools` + editor pool panel with **paste TSV/CSV**
  import + redaction (both paths) + tests. Single-block pools only.
- **Phase 2**: two-phase pools (quip/fill/faker → judge); `.csv` upload + a published
  Google-Sheet CSV URL (SSRF-guarded); the MCP `set_game_pool` tool + markdown `## pool`;
  migrate the flagships onto declared pools.
- **Phase 3**: a reusable **pool library** (a `pools` DB table owned by a user, shared
  across games, with versioning) — turns pools into durable, remixable assets.

## 11. Back-compat / migration

- Fixed-round games and existing `buildConfig` games are untouched (`pools` is optional;
  `expandPools` is a no-op when absent).
- Flagships migrate one at a time; each migration is a pure refactor verified by its
  existing scoring/integration tests + the catalog redaction test.

## 12. Open decisions (for the owner)

1. **Pool ↔ rounds ordering**: interleave (an order field per group) or pools-after-rounds? (MVP leans pools-after.)
2. **Draw semantics**: per-pool `draw` vs. one game-level `roundOptions`? (Lean per-pool, with a sane default = all.)
3. **Item/size caps**: max items per pool (500?), pools per game (10?), and the new `MAX_CONFIG_BYTES`.
4. **CSV lib**: hand-roll vs. papaparse (lean hand-roll for MVP).
5. **Pool library (phase 3)**: build the shared `pools` table now-ish, or keep pools inline in the game config until there's demand?
6. **Which blocks are poolable first** (MVP set): guess/poll/quip/ballpark proposed.

## 13. Rough effort

- MVP: SDK `pool` descriptor + 4 blocks (~M), `PoolGroup`+`expandPools`+host wiring
  (~M), editor pool panel + paste import (~L), redaction + persistence + tests (~M).
  A solid **[large]**, landable in 3–4 reviewable slices (model+expand → one block
  end-to-end → editor import → redaction/tests), each shippable.
- Phase 2 (two-phase pools, MCP/markdown, Sheets URL, flagship migration): another **[large]**.
