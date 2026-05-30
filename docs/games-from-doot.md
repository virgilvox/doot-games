# Games From Doot, the catalog IA, and the official-games roadmap

How Doot surfaces games, what shipped, and the plan for first-party official
games, versioning, and an admin/staff publishing pipeline. Pairs with
[`docs/flagship-games.md`](./flagship-games.md).

## Information architecture (shipped)

Four surfaces, each with a clear job:

| Surface | Shows | CTA |
| --- | --- | --- |
| **Home** (`/`) | Hero · **Games From Doot** rail · Trending (gated) · Browse-by-vibe · Fresh-from-creators (gated) · How-it-works | Host now / build |
| **Explore** (`/explore`) | **Games From Doot** (ready to play) + **public community games**. **No templates.** | Host now / View & host |
| **Create** (`/create`) | Every game **type as an authorable template**, with a colored per-type icon | Use this (open editor) |
| **Your Games** (`/mine`, nav-gated to logged-in) | The caller's saved games, with a **visibility filter** (All/Private/Unlisted/Public) | Manage & host |

- **Trending** and **Fresh from creators** only render once there are **≥5 public
  games** (`MIN_RAIL` in `index.vue`), so the home page never shows a thin/empty rail.
- **Templates moved off Explore** entirely; they live on Create. Explore is purely
  things you can play right now (first-party Games From Doot + community games).

## "Games From Doot" = a manifest flag (shipped)

A **flagship** is a first-party, ready-to-play, deeply replayable game (it ships a
content pool via `buildConfig`, so hosting `/host/<id>` runs a full, fresh game).

- `GameManifest.flagship?: boolean` (`packages/sdk/src/manifest.ts`); set `true` on
  the plugin (currently only **Quip Clash**).
- Mirrored into the server-safe catalog (`GameCatalogEntry.flagship` + `version`),
  with `flagshipGames` / `templateGames` helpers. A catalog test asserts
  `flagship` ⟺ the plugin actually has a `buildConfig` (so a "Game From Doot" is
  always a real replayable game, never an empty template) and that `version`
  matches the manifest.
- Explore/Home render flagships as **Host-now** cover cards; everything else is a
  Create template.

**The pipeline to add more (today):** add a `defineGame` with a content pool +
`buildConfig` (Quip Clash is the worked example), set `manifest.flagship: true`,
register it in `registry.ts`, add the catalog entry (the sync test enforces it).
No DB or auth change. The next flagships (Mad Libs, Split the Room, Robot Rap
Battle) land this way and appear under Games From Doot automatically.

## Covers & icons = one visual map (shipped)

`packages/ui/src/visuals.ts` is the single source of truth: `gameVisual(type) →
{ color, icon }` keyed by game-type id and block kind. It feeds:
- **`GameCover`** (gradient cover + per-type line motif + faded initial) — used on
  every game card.
- **`GameTypeIcon`** (colored rounded-square icon) — Create typecards + **editor
  round headers**, where rounds are now **color-coded by block type** (a Guess
  round reads blue, a Rate round pink) with a colored left border, so a multi-block
  game is legible at a glance. (Editor settings — Theme/Visibility/Details/Import —
  are also grouped into one boxed cluster, separate from Save/Host, so they're no
  longer easy to miss.)

## Versioning (partially shipped; roadmap below)

- **Shipped:** `manifest.version` (already required, was dead metadata) is now
  surfaced on cards and Create ("v0.2.0"). For an in-repo flagship, "latest" is
  simply "what's deployed" — bump the version when you expand a pool.
- **Roadmap (when official games can ship without a code deploy):**
  - Stamp `pluginVersion` onto saved-game rows at create/host time (a nullable
    `games` column via the additive-migration pattern in `server/utils/db.ts`) for
    historical records.
  - A `releases` notion (changelog + optional multiple concurrently-playable
    versions) only if we ever need to keep an older version hostable. For pooled
    flagships, a version bump + a one-line "what's new" is enough; full release
    history is deferred until there's demand.

## Official-games pipeline & admin/staff (roadmap — needs a decision)

The data model has **no** `official`/`category`/`role` fields today (confirmed by
audit). Two paths, in order of cost:

1. **In-repo (current, recommended near-term).** Official games are curated
   compositions in the repo. Publishing = a code deploy. Zero schema/auth work,
   matches the plugin architecture. Good while the Doot team writes the games.
2. **DB-backed + admin/staff (future).** When non-engineers should publish official
   games without a deploy:
   - Add a `role` to the better-auth user via `additionalFields` (`auth.ts`),
     `input:false` so it's not self-assignable; surface it in `sessionUser`
     (`session.ts`) and add a `requireAdmin(event)` helper. Promote the first
     admin by a direct DB update.
   - Add `isOfficial` (+ optional `category`, `version`) columns to `games` (the
     additive-migration pattern). A system "Doot" account owns official rows;
     `requireAdmin` routes set the official flag and cut versions.
   - Explore's "Games From Doot" shelf then unions in-repo flagships **and**
     `isOfficial` DB games. An admin UI (gated by `requireAdmin`) lets staff
     publish/curate and tag releases.

**Recommendation:** stay on path 1 until there's a real need for non-deploy
publishing; the IA + flagship flag already make path 2 a purely additive change
(new columns + a role + an admin route), with no rework of what shipped.
</content>
