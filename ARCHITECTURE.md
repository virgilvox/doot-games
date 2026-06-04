# Doot Architecture

The whole system on one page: what every part is, where it lives, and how it all
connects. This is the canonical map. For the product rationale see
[`Doot-PRD.md`](./Doot-PRD.md); for working conventions see [`CLAUDE.md`](./CLAUDE.md);
focused deep-dives live in [`docs/`](./docs). When this doc and the code disagree, the
code wins, and fix this doc.

Doot is a self-hostable platform for live, collaborative party games. One host puts a
game on a big screen; a crowd joins from their phones with a 4-character code or QR; and
everyone plays together in real time over the CLASP pub/sub relay. Doot is the shell, the
engine, and the plugin system. **The games are plugins.** Live at https://doot.games.

---

## 1. The big picture

```
   BIG SCREEN (host)                 PHONES (players)              your browser/Claude
   ┌──────────────┐                 ┌────┐ ┌────┐ ┌────┐          ┌──────────────────┐
   │ HostRoom +   │                 │Play│ │Play│ │Play│          │ editor / MCP     │
   │ GameHost.vue │                 │Room│ │Room│ │Room│          │ (build a game)   │
   └──────┬───────┘                 └─┬──┘ └─┬──┘ └─┬──┘          └────────┬─────────┘
          │ publish/subscribe          │     │      │                      │ HTTP
          │  (no game state in DB)      \    │     /                       │
          ▼                              ▼   ▼    ▼                         ▼
   ╔═══════════════════════════════════════════════╗          ┌──────────────────────┐
   ║   CLASP RELAY   wss://relay.clasp.to           ║          │   APP TIER (Nuxt)    │
   ║   namespace: /doot/<ROOM>/...                  ║          │  apps/web  (Nitro)   │
   ║   phase, rounds, roster, inputs, tallies,      ║          │  stateless, scales   │
   ║   answers (at reveal only), ephemeral media    ║          │  horizontally        │
   ╚═══════════════════════════════════════════════╝          └─────────┬────────────┘
        EPHEMERAL  (TTL, default 8h, nothing durable)            DURABLE │
                                                                         ▼
                                            ┌──────────────────────────────────────────┐
                                            │ libSQL/SQLite (Drizzle): accounts, saved   │
                                            │ games, deck library, bookmarks             │
                                            │ Spaces/MinIO: uploaded images (presigned)  │
                                            └──────────────────────────────────────────┘
```

**The one invariant that shapes everything: two kinds of state, kept strictly apart.**

- **Ephemeral** (the CLASP relay): everything about an in-progress room. Phase, round
  state, roster, per-player inputs, live tallies, ephemeral media. All under
  `/doot/<ROOM>/...`, all with an absolute TTL (default 8h). **Nothing about a live room is
  ever written to the database.** The app tier holds no session state, which is what lets it
  scale horizontally.
- **Durable** (libSQL/SQLite via Drizzle): accounts, saved game definitions, the reusable
  content-deck library, bookmarks. Created/edited over HTTP, never during play.

Two more load-bearing rules:

- **Second screen, never shared-video.** Phones get game state directly from the relay.
  Gameplay is never routed through the host's screen share. Latency is an architecture
  decision.
- **Answers are withheld.** The host holds the full config (with answers) locally and
  publishes a redacted config to the relay; answer keys reach `/doot/<room>/round/<i>/answer`
  only at the reveal step. The engine enforces this so a plugin cannot leak answers early
  (see section 3.4).

---

## 2. Monorepo layout

pnpm workspaces. Published npm scope is **`@doot-games`**.

| Path | Package | Role |
| --- | --- | --- |
| `packages/engine` | `@doot-games/engine` | CLASP relay wrapper, room runtime + state machine, the `useDootRoom` Vue composable. Framework core; **imports no game.** |
| `packages/sdk` | `@doot-games/sdk` | The authoring contract: blocks + compositions (`defineBlock`/`defineGame`), Zod schemas, content-pool + deck types. |
| `packages/themes` | `@doot-games/themes` | 5 theme token packs + CSS generation (the design system). |
| `packages/ui` | `@doot-games/ui` | Theme-aware Vue components (buttons, QR, draw canvas, 3D stages, speech, confetti) + the stylesheet. |
| `packages/games` | `@doot-games/games` | The 20 blocks, the 23 first-party game types, the generic renderer, the catalog/registry, the deck runtime, markdown import. |
| `packages/plugin-bridge` | `@doot-games/plugin-bridge` | Typed postMessage RPC for sandboxed external plugins. Foundation built; external hosting is future work (PRD section 9). |
| `apps/web` | `@doot-games/web` | The Nuxt 4 shell: discovery, editor, host, player, decks, auth, API routes, MCP server. |

**Dependency direction is one-way (no cycles):**

```
apps/web ──────────────► everything
games ─────────────────► engine, sdk, themes, ui
sdk ───────────────────► engine, themes
ui ────────────────────► engine, themes
engine ────────────────► @clasp-to/core   (and nothing else in-repo)
plugin-bridge ─────────► zod   (standalone)
```

The engine never imports a game. The sdk never imports the shell. This keeps platform and
games independent and testable.

---

## 3. The engine (`packages/engine/src/`)

Framework-agnostic. Games hand it a plain `LoadedGame` object at runtime; it orchestrates
**when** to call the game's callbacks and **what** to publish, never inspecting payloads.

| File | Responsibility |
| --- | --- |
| `types.ts` | `Phase`, `RoundState`, `RoomState`, `Player`, `Identity`, `RoomMeta`, `Role`. |
| `relay.ts` | `createClaspRelay(url)` wraps `@clasp-to/core`; the `RelayClient` interface (`connect`, `on`, `set`, `cached`, `get`, lifecycle hooks). `DEFAULT_RELAY_URL = 'wss://relay.clasp.to'`. |
| `addresses.ts` | The relay address scheme: `addr.*` builders, `patterns.*` subscriptions, and parsers. |
| `state-machine.ts` | Pure `reduce()` / `canTransition()` / `shouldAutoLock()` over `RoomState`. |
| `identity.ts` | `playerId(room, name)`, `makeRoomCode()`, the unambiguous alphabet. |
| `eligibility.ts` | Late-joiner rules: who may act on which round. |
| `room.ts` | `RoomRuntime`: the workhorse. Subscriptions, host/player/viewer actions, answer withholding, reconnect-by-name. |
| `vue/index.ts` | `useDootRoom()`: wraps `RoomRuntime` in reactive refs + a tick loop. |

### 3.1 The relay address scheme (`addresses.ts`)

Everything for a room lives under `/doot/<ROOM>/`. Games never build these by hand; they go
through the engine.

```
/doot/<room>/meta                       RoomMeta (game id, title, theme, player cap)
/doot/<room>/config                      the REDACTED config (answers stripped)
/doot/<room>/phase                       'lobby' | 'active' | 'results'
/doot/<room>/round/index                 current round (0-based)
/doot/<room>/round/state                 'ready' | 'open' | 'locked' | 'reveal'
/doot/<room>/round/deadline              epoch ms (timed round) or null
/doot/<room>/host/ping                   host liveness heartbeat
/doot/<room>/control/driver              delegated co-host/MC pid ('' = none)
/doot/<room>/control/command             a drive intent from the delegated player
/doot/<room>/round/<i>/content           runtime-derived content (two-phase; overrides authored)
/doot/<room>/round/<i>/content/<pid>     SECRET per-player content (hidden-role games)
/doot/<room>/round/<i>/answer            answer key, published ONLY at reveal
/doot/<room>/round/<i>/reveal            public reveal summary (tallies, winner)
/doot/<room>/results/summary             final results payload
/doot/<room>/player/<pid>/profile        roster entry { name, joinedAtIndex } (everyone subscribes)
/doot/<room>/player/<pid>/ping           player heartbeat
/doot/<room>/input/<i>/<pid>             a player's submission for round i
/doot/<room>/media/<key>                 ephemeral image/drawing (TTL-scoped)
/doot/<room>/x/<key>                     custom-flow game channel (e.g. Circuit Cypher battle state)
```

The split between `patterns.allInputs` (host/viewer, `input/*/*`) and
`patterns.inputsForPlayer` (a player, `input/*/<pid>`) is how the relay keeps one player
from reading another's answers: a player only ever subscribes to its own input addresses.

### 3.2 The room state machine (`state-machine.ts`)

Every game uses the same top-level flow; the engine owns it.

```
lobby ──start──► active ──finish──► results
                   │
                   └─ per round:  ready ──open──► open ──lock──► locked ──reveal──► reveal ──next──► (next round) ready
```

`HostAction` is `start | open | lock | reveal | next | finish`. `reduce()` is pure (it
throws `RangeError` on an illegal transition); deadlines are passed in, never read from a
clock, so the machine is fully deterministic and unit-tested. `shouldAutoLock(state, now)`
lets the host auto-lock an open, timed round when its deadline passes.

### 3.3 Identity and reconnect (`identity.ts`)

A player id is derived, not assigned: `playerId(room, name)` is `p_<fnv1a(room|name)><fnv1a(\x01room|name)>`
(two FNV-1a hashes for ~64 bits). Re-entering the **same name in the same room** reclaims
the same id, which reclaims that player's inputs and `joinedAtIndex` from the relay snapshot.
No login, no dependence on local storage (the play surface must work where storage is blocked,
e.g. embedded frames). Room codes are 4 characters from an alphabet with no `I O 0 1`.

`eligibility.ts` decides who scores: a player who joined in the lobby plays from round 0; a
mid-game joiner plays from the current round if voting is still open, else from the next one.
`RoomRuntime.submit()` refuses inputs for rounds before a player's `joinedAtIndex`.

### 3.4 Answer withholding (the invariant, enforced)

The host keeps `game.config` (with answers) **local**, and publishes `game.publishConfig`
(redacted) to `/doot/<room>/config`. Answer keys are published **only** by `RoomRuntime.reveal()`,
to `/doot/<room>/round/<i>/answer`. Before reveal, that address has no value, so a spectator
reading the relay sees nothing. Runtime-derived answers (two-phase) and assigned hidden-role
answers are held host-side in `derivedAnswers` until their reveal. Plugins only ever return
opaque objects from `deriveContent`/`assignContent`; the engine controls publication timing,
so a plugin has no way to leak early.

> **Soft-secrecy caveat (accepted).** Per-player secret content lives at a derivable address
> (`round/<i>/content/<pid>`), and two-phase make-round anonymity is similarly soft: a
> determined relay reader could subscribe to others'. This is a deliberate trade-off for
> casual play, documented in `addresses.ts`.

### 3.5 `useDootRoom()` (`vue/index.ts`)

The single composable host and player surfaces use. Given `{ relay, room, role, name? }`
it returns reactive refs (`phase`, `round`, `players`, `me`, `config`, `meta`, `results`,
`connected`, `isHost`, `isDriver`, ...), read helpers (`inputsFor`, `runtimeContentFor`,
`perPlayerContentFor`, `roundRevealFor`, `answerKeyFor`), player actions (`submit`,
`sendControl`), custom channels (`publishExtra`/`onExtra`), and a `host.*` namespace
(`loadGame`, `start`, `openVoting`, `lock`, `reveal`, `next`, `finish`, `setDriver`).

---

## 4. The authoring contract (`packages/sdk/src/block.ts`)

Two concepts, and almost every game is built from them.

- **A block** is a standalone round kind (a `RoundBlock`): a Zod `contentSchema`, a phone
  `PlayerInput` view, a big-screen `HostDisplay` view, an `aggregate` (results), and optional
  answer-withholding (`redactContent`/`answerOf`) and two-phase hooks
  (`derive`/`assignContent`/`toVoteText`/`revealSummary`).
- **A game** is a `GamePlugin`: a manifest + a `defaultConfig` (a `GameComposition` =
  `{ title, rounds: RoundInstance[], decks? }`). The generic renderer mounts the right block
  per round and merges results, so most games are about 20 lines and ship no components.
  A game may instead override `components` for a fully custom flow.

The two-phase pattern composes a **make** block (quip/fill/faker) with a **judge** block
(vote/split/fibvote/drawvote/accuse): the judge round's content is derived at runtime from the
prior round's anonymized inputs.

**Content pools and decks** (the data-driven layer) also live in the SDK:

- `Deck` / `DeckColumn` / `DeckUse` (`{ inline }` snapshot or `{ ref }` library link) /
  `DeckKind` (`generic | quiz | prompt | card`). A `RoundInstance` can `draw` N rows and
  bind fields to columns.
- `ContentPool` on a `GamePlugin`: declares a pool game is deck-feedable. It carries
  `defaultRows` (the built-in pool as rows), `deckKind`, a `fromRow` mapper, `answerColumns`
  (which deck columns are secret), and `requires` (column groups a deck must have to feed
  this game). `buildConfig(seed, { rounds, rows })` builds a play over `rows ?? defaultRows`.

---

## 5. The games package (`packages/games/src/`)

| Area | Where | What |
| --- | --- | --- |
| Blocks | `blocks/<kind>/block.ts` | The 20 round kinds: guess, rate, poll, rank, draw, quip, vote, fill, split, bars, buzzer, fibvote, drawvote, hivemind, mostlikely, ballpark, faker, accuse, spotlight, cellar. |
| Games | `games/<id>/index.ts` | Each game's folder; `index.ts` exports the `defineGame(...)` result. Simple games are just `index.ts`; custom-flow games add `Host.vue`/`Player.vue`, pure rules in `logic.ts`, and a `use<Game>Show.ts` composable. |
| Generic renderer | `runtime/GameHost.vue`, `GamePlayer.vue`, `GameResults.vue` | The screen, phone, and results surfaces for any block-composed game. |
| Catalog (server-safe) | `catalog.ts` | Plain data: the 23 game types, `REDACTION_RULES`, `redactDecks`, the deck-fed `pool` entries. No Vue imports, so the Nitro server can use it. A test keeps it in sync with the registry. |
| Registry (client) | `registry.ts` | The real plugins (with Vue views), `getPlugin`, `builtinPlugins`. |
| Deck runtime | `runtime/decks.ts` | `resolveComposition` (expand deck-backed rounds to plain rounds), `poolRowsFor`, the `fromRow` mappers (`promptFromRow`/`factFromRow`/`ballparkFromRow`/`choiceFromRow`/`storyFromRow`/`secretFromRow`/`cellarQuestionFromRow`/`frameFromRow`), `poolStarter` (remix warm-start), `deckMatchesPool` (picker compatibility). |
| Markdown import | `markdown.ts`, `runtime/sheet.ts` | Parse a whole game (and `## deck` blocks / CSV) from a markdown spec. |

### Composed vs custom-flow games

- **Composed** (most): an ordered list of `{ block, content }`. The generic renderer looks up
  each block via `getBlock(plugin, instance.block)` and mounts its `HostDisplay` / `PlayerInput`,
  overlaying runtime content (`room.runtimeContentFor(i)`) when a round was derived. Single-type
  games (Guess/Rate/Poll/Rank/Draw); VoteBox = `[guess, rate]`; the two-phase flagships pair a
  make + judge block.
- **Custom-flow** (Circuit Cypher, Truth or Share, Quiz or Die, and the comedy/quiz shows):
  the plugin sets `components: { Host, Player }`. `HostRoom`/`PlayerRoom` mount those instead of
  the generic renderer; they drive the whole cinematic show over the relay's `/x/` channels,
  with a parked block (bars/spotlight/cellar) giving the engine a round to sit on. Pure outcome
  logic lives in tested `logic.ts`.

### The 23 first-party game types (catalog)

Building blocks (`guess`, `rate`, `poll`, `rank`, `draw`, `buzzer`, `votebox`, `custom`) plus
the flagship "Games From Doot" (`quip-clash`, `mad-libs`, `split-room`, `fib-finder`,
`sketch-spot`, `circuit-cypher`, `what-you-didnt-know`, `backronym`, `open-mic`, `hivemind`,
`most-likely`, `ballpark`, `faker`, `truth-or-share`, `quiz-or-die`). 13 of these are
deck-feedable (declare a `contentPool`).

---

## 6. The web app (`apps/web/`)

Nuxt 4 + Vue 3, with a Nitro server. The `app/` tree is the client; `server/` is the backend.

### 6.1 Pages (`app/pages/`)

| Route | Page | Purpose |
| --- | --- | --- |
| `/` | `index.vue` | Home: hero, flagship rail, fresh-from-creators rail, join box. |
| `/explore` | `explore.vue` | Discovery: filter by type/theme, search, community grid. |
| `/create` | `create.vue` | Two on-ramps: remix a ready-made game, or build from blocks. |
| `/game/[id]` | `game/[id].vue` | A catalog game's landing page: Host now, Remix, Customize. |
| `/g/[id]` | `g/[id].vue` | A saved (community) game's shareable page: fork/save/edit/host. |
| `/host/[plugin]` | `host/[plugin].vue` | Host a catalog game (mounts `HostRoom` with a plugin id). |
| `/host/g/[id]` | `host/g/[id].vue` | Host a saved game (fetches `?for=play`, mounts `HostRoom` with config). |
| `/play/[room]` | `play/[room].vue` | Player join gate + `PlayerRoom` (no auth, no storage). |
| `/editor/[plugin]`, `/editor/g/[id]` | `editor/...` | The schema-driven game editor (new / edit). |
| `/decks`, `/decks/new`, `/decks/[id]`, `/decks/[id]/edit` | `decks/...` | The reusable deck library + editor. |
| `/login`, `/account`, `/u/[handle]` | auth + profiles | Sign in/up; edit your profile; a public creator page. |
| `/mine`, `/saved` | library | Your games (any visibility); bookmarked games. |
| `/connect`, `/oauth/consent` | MCP | Connect-with-Claude docs + the OAuth consent screen. |

### 6.2 Components (`app/components/`)

| Component | Role |
| --- | --- |
| `HostRoom.client.vue` | The host's live room. Resolves config (explicit > draft > pool deck > fresh sample > default), expands decks (`resolveComposition`), opens the relay via `useDootRoom`, and mounts the plugin's custom `Host` or the generic `GameHost`. |
| `PlayerRoom.client.vue` | The player's live room. Joins the relay, learns the plugin from host `meta`, adopts the host theme, mounts the custom `Player` or generic `GamePlayer`. |
| `GameEditor.client.vue` | The schema-driven editor: auto-forms per round from each block's `contentSchema`, live phone/host previews, save (POST/PUT) or "Host now" (stashed in `useGameDraft`). |
| `DeckManager.vue` / `RoundBindings.vue` | Attach inline or library decks to a game; bind round fields to deck columns (type-aware: image fields only offer image columns). |
| `DeckEditor.vue` | The library deck editor: spreadsheet grid, CSV/TSV paste, per-column type, image-cell upload. |
| `RemixWithDeck.vue` | The remix flow: an inline warm-start editor (pre-filled with a subset of the official pool) for prompt games, or a compatibility-filtered deck picker (official Doot decks badged) for typed games. |
| `HostPreview` / `PlayerPreview` | Mock-room wrappers so the editor can preview a block exactly as the room renders it. |

### 6.3 Server (`apps/web/server/`)

API routes (Nitro). Auth gating: writes need a session; public reads enforce visibility.

```
GET    /api/health                      liveness probe (container healthcheck)
*      /api/auth/*                       better-auth (sign-up/in/out, session, OAuth for MCP)
GET    /api/games        ?scope=mine     list public games, or your own
POST   /api/games                        save a game
GET    /api/games/[id]   ?for=play       fetch a game (visibility + answer redaction enforced)
PUT|PATCH|DELETE /api/games/[id]         full edit / metadata toggle / delete (owner)
POST   /api/games/[id]/clone             fork (snapshots referenced decks the forker can read)
POST|DELETE /api/games/[id]/bookmark     bookmark toggle
GET    /api/me/bookmarks                 your bookmarked games
GET    /api/decks        ?scope=mine     list public decks, or your own
POST   /api/decks                        save a deck
GET    /api/decks/[id]                   fetch a deck (visibility enforced)
PUT|DELETE /api/decks/[id]               edit / delete (owner)
POST   /api/decks/[id]/clone             copy a remixable deck into your library
GET    /api/uploads/config               is upload configured + are you signed in
POST   /api/uploads/presign              sign a direct browser PUT to Spaces/MinIO
GET    /api/users/[handle]               a public profile + that user's public games
POST   /mcp                              the MCP server (OAuth bearer; JSON-RPC 2.0)
GET    /.well-known/oauth-*               OAuth discovery for MCP clients
```

Server utilities (`server/utils/`):

- `db.ts` Drizzle over libSQL/SQLite (`.data/doot.sqlite` in dev; `DATABASE_URL` in prod).
  Tables: `games`, `decks`, `bookmarks`; `ensureSchema()` creates them + indexes on startup.
  better-auth owns `user`/`session`/`account`/`verification` + OIDC tables (migrated by
  `server/plugins/auth-migrate.ts`).
- `auth.ts` better-auth + argon2id sealed-cookie sessions; the `username` plugin (`@handle`,
  with reserved names) and the `mcp` plugin (OAuth provider for Claude).
- `games-repo.ts` game CRUD + the two security seams: `redactConfigForViewer(config, pluginId)`
  (strip round answer fields via `REDACTION_RULES`, bound-column answers + typed pool-deck
  `answerColumns` via `redactDecks`) and `resolveDeckRefs(config, ownerId)` (inline library
  `{ref}` decks at `?for=play`, respecting visibility). `cloneGame` snapshots referenced decks
  so a fork is self-contained.
- `decks-repo.ts` deck CRUD; the summary now exposes `columns` (keys) so the remix picker can
  check compatibility. Library decks store full data; answer-hiding is a game-level concern.
- `storage.ts` / `fetch-image.ts` aws4fetch presigning to Spaces/MinIO; SSRF-guarded image
  re-hosting for the MCP `upload_image` tool.
- `routes/mcp.ts` the MCP server: ~12 tools (`list_game_types`, `doot_format_guide`,
  `validate_doot_game`, `save_game`/`update_game`/`set_game_meta`, `list_my_games`,
  `list_my_decks`/`save_deck`/`update_deck`, `remix_game`, `upload_image`), per-user write
  throttling.

---

## 7. The design system (`packages/themes`, `packages/ui`)

- **5 themes**: `doot` (default), `cutesie`, `cyber`, `professional`, `playful`. A theme is a
  set of ~21 CSS custom-property tokens (colors, radii, borders, shadows, grain, glow) plus
  shared fonts. `themes/src/css.ts` generates one `[data-theme="id"] { ... }` rule per theme;
  `nuxt.config.ts` injects `allThemesCss()` into `<head>` so there is no flash, and switching
  is just changing the `data-theme` attribute (no rebuild). Pixi/Three scenes read the same
  tokens, so canvas effects match the active theme.
- **`packages/ui`** ships the theme-aware components: buttons, `QrCode`, `RoomTicket`,
  `JoinForm`, `CountdownRing`, `VoteBars`, `Leaderboard`, the schema-form renderer, and the
  heavier widgets that earn their cost: `DrawCanvas` (Pixi 8, lazy, client-only), `ConfettiBurst`
  (Pixi), `RapBattleStage`/`ComedyStage` (Three.js, lazy), plus speech synthesis
  (`audio/speech.ts`) and `compressPhoto` (on-device photo downscale for relay-carried images).
  **Animation rule: CSS first; Pixi/Three only where canvas-heavy work earns it.**

---

## 8. Content decks, end to end (the feature that touches every layer)

A **deck** is a named-column table of rows. It is the clearest example of how the layers
interconnect, so it is worth tracing in full.

1. **Author** a deck in `/decks` (or via MCP `save_deck`, or a `## deck` markdown block). It
   lands in the `decks` table with `kind`, `columns`, `rows`, `visibility`, `remixable`.
2. **Attach** it to a game two ways. **Field binding** (mode 1): a round's fields bind to deck
   columns (`RoundBindings`), correlated per drawn row. **Pool feeding**: a deck-feedable
   flagship references a deck under the reserved `config.decks.pool` key; the game's
   `contentPool.fromRow` maps each deck row to the game's pool shape.
3. **Serve.** On the play read (`GET /api/games/[id]?for=play`): `resolveDeckRefs` inlines any
   library `{ref}` (respecting visibility), then `redactConfigForViewer` nulls answer fields and
   answer-bearing deck columns for non-owners (`redactDecks` + `ContentPool.answerColumns`). The
   owner keeps the full data so they can host and reveal.
4. **Host.** `HostRoom.resolveConfig()` sees the inline pool deck and re-runs `buildConfig` over
   `poolRowsFor(contentPool, deck)` (so the host still shuffles and picks how many to play);
   `resolveComposition` expands any field-bound/draw rounds to plain rounds. The engine only
   ever sees plain rounds.
5. **Play** proceeds exactly as a hand-authored game. The relay never knows decks exist.

"Decks by Doot" (`scripts/decks-by-doot.data.mjs` + the idempotent `scripts/seed-decks.mjs`)
seeds public, remixable starter decks for every pool game under a stable Doot account. The
remix UI (`RemixWithDeck`) starts a creator from a small editable subset of the official pool
(prompt games) or a compatibility-filtered picker of official + personal decks (typed games).

---

## 9. A full game, end to end (control + data flow)

1. **Build.** A creator uses the editor (`/editor/[plugin]`) or MCP. A saved game is a row in
   `games` (`pluginId`, `config = { title, rounds, decks }`, visibility). A flagship needs no
   saving: it ships a `buildConfig`.
2. **Host.** The host opens `/host/[plugin]` (fresh) or `/host/g/[id]` (saved). `HostRoom`
   resolves the config, expands decks, mints a 4-char room code, opens the relay, and calls
   `room.host.loadGame({ meta, config, publishConfig, rounds, ... })`. The redacted config +
   meta go to the relay; the full config stays host-side.
3. **Join.** Players scan the QR or type the code at `/play/[room]`. `JoinForm` probes the relay
   for the player cap + a name collision, then `PlayerRoom` connects with `role: 'player'`.
   Identity is `playerId(room, name)`; a reconnect under the same name reclaims state.
4. **Round loop.** The host drives `ready -> open -> locked -> reveal -> next` (or delegates to
   an MC via `control/driver`). Players `submit()` to `/doot/<room>/input/<i>/<pid>`. For a
   two-phase round, the host's `deriveContent` reads the make round's inputs and publishes the
   anonymized, shuffled judge content to `round/<i>/content`. At `reveal`, the answer key and the
   reveal summary (tallies/winner) are published; phones show personal feedback.
5. **Results.** `finish` publishes `results/summary`; `GameResults.vue` renders the leaderboard,
   awards, and per-round breakdowns merged from each block's `aggregate`.

Throughout, the app tier is uninvolved: steps 2 to 5 are entirely host + relay + phones. The
database is touched only to build (step 1) and to fetch a saved config at host time.

---

## 10. Security invariants (where they are enforced)

- **Withhold answers (relay).** Only `RoomRuntime.reveal()` publishes `round/<i>/answer`; the
  published config is redacted (section 3.4).
- **Withhold answers (API).** Non-owner reads go through `redactConfigForViewer`, which strips
  round answer fields (`REDACTION_RULES`), bound answer columns, and typed pool-deck answer
  columns (`ContentPool.answerColumns`). The only config-serving endpoint is
  `GET /api/games/[id]`; list endpoints return summaries with no config.
- **Deck references.** `resolveDeckRefs` inlines a `{ref}` only for decks the game owner may
  read; a stranger's private deck or a deleted ref drops out (missing-safe). Keep answer-bearing
  decks private (a public deck is readable at `/api/decks/[id]`).
- **Identity.** Derived from `(room, name)`; no account needed to host or play. Accounts gate
  only saving.
- **Uploads.** Browser PUTs are presigned (no AWS creds client-side); MCP image re-hosting is
  SSRF-guarded (https only, private IPs blocked, every redirect hop checked, 5 MB cap).
- **Sandbox (future).** External URL-registered plugins run in a null-origin iframe behind the
  typed `plugin-bridge` postMessage RPC; they never see cookies, DB routes, or the raw relay.
  Cookies are host-only, so the `plugins.doot.games` origin is isolated.

---

## 11. Build, test, deploy

- **Tooling.** pnpm workspaces, Biome, Vitest. Node >= 20.11, pnpm 10.x.
- **Gates (green before every commit):** `pnpm test` (Vitest over `packages/**`),
  `pnpm typecheck` (`tsc` + `nuxi typecheck`), `pnpm --filter web build`.
- **CI/CD (`.github/workflows/`).** A push to `main` runs tests + typecheck, builds a Docker
  image to GHCR, then SSHes to the droplet and `docker compose pull && up -d` (Caddy reloaded
  gracefully). There is no staging; `main` is production.
- **Containers + proxy (`docker/`).** A multi-stage `Dockerfile` (digest-pinned `node` base)
  produces the Nitro `.output`; `docker-compose.deploy.yml` runs the app + GoatCounter + Caddy.
  Caddy terminates TLS (ACME) and reverse-proxies `doot.games`; `plugins.doot.games` is a
  CSP-locked static origin for future sandboxed plugins.
- **Prod data.** SQLite on a mounted volume (`/opt/doot/data`); images in DigitalOcean Spaces.
  Analytics: GoatCounter at `stats.doot.games`. See [`docs/deploy.md`](./docs/deploy.md).
- **Key env vars.** `DATABASE_URL`, `SESSION_PASSWORD` (or `NUXT_SESSION_PASSWORD`),
  `PUBLIC_BASE_URL`, `CLASP_RELAY_URL` (default `wss://relay.clasp.to`), `SPACES_*`,
  `NUXT_PUBLIC_GOATCOUNTER_URL`.

---

## 12. Where to find things (quick reference)

| I want to... | Look at |
| --- | --- |
| Understand the relay protocol | `packages/engine/src/addresses.ts`, `state-machine.ts`, `room.ts` |
| Add or change a round kind (block) | `packages/games/src/blocks/<kind>/block.ts` |
| Add or change a game | `packages/games/src/games/<id>/index.ts` (+ `catalog.ts` + `registry.ts`) |
| Change how a game is rendered | `packages/games/src/runtime/GameHost.vue` / `GamePlayer.vue` / `GameResults.vue` |
| Touch the deck system | `packages/sdk/src/block.ts` (types), `packages/games/src/runtime/decks.ts` (logic), `apps/web/server/utils/{games,decks}-repo.ts` (serve) |
| Add an API route | `apps/web/server/api/...` or `apps/web/server/routes/...` |
| Change auth, DB, or storage | `apps/web/server/utils/{auth,db,storage}.ts` |
| Touch the MCP tools | `apps/web/server/routes/mcp.ts` |
| Change a theme or shared component | `packages/themes/src/`, `packages/ui/src/` |
| Edit the host/player/editor pages | `apps/web/app/components/{HostRoom,PlayerRoom,GameEditor}.client.vue` |
| Deploy / ops | `docker/`, `.github/workflows/`, `docs/deploy.md` |

## 13. Related docs

- [`Doot-PRD.md`](./Doot-PRD.md) the product spec (the source of truth).
- [`CLAUDE.md`](./CLAUDE.md) conventions and invariants for contributors/agents.
- [`docs/authoring-a-game.md`](./docs/authoring-a-game.md) how to write a block or game.
- [`docs/decks.md`](./docs/decks.md) the content-deck feature (user-facing).
- [`docs/clasp-primer.md`](./docs/clasp-primer.md) the relay model.
- [`docs/flagship-games.md`](./docs/flagship-games.md) the custom-flow flagships.
- [`docs/deploy.md`](./docs/deploy.md) deployment and operations.
- [`HANDOFF.md`](./HANDOFF.md) the running log of what shipped.
