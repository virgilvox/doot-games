# Doot: Product Requirements and Architecture

A self-hostable platform for live, collaborative party games that run on the CLASP real-time relay. One host puts a game on a big screen, a crowd joins from their phones, and everyone plays together. Doot is the shell, the engine, and the plugin system. The games are plugins.

Domains in hand: `doot.games`, `doot.it.com`, `doot.click`. Product name: Doot.

Status: planning. This document is the build spec. It is detailed enough to implement from, and it is written for a human reader and for an implementing agent (Claude Code).

---

## 1. Vision

Doot turns any room into a game show. The audiences are wide on purpose:

- People running anime or comic convention panels who want the room to vote, guess characters, rate cosplay, or play along.
- Bar game nights where a host runs trivia, "rate this," or guessing rounds and the crowd answers from their phones.
- Friends at a house party who want something quick and funny on the TV.
- Professors and teachers running live polls, quizzes, and check-ins in a lecture hall.

The common shape across all four is the same: a host at the front, a crowd on phones, results on a shared screen, and host-controlled pacing. Doot makes that shape reusable and gives people a clean way to build new game types on top of it.

The product has three layers:

1. A real-time engine that wraps CLASP and handles all the generic machinery (rooms, roster, phases, rounds, late joiners, reconnects, scoring hooks, ephemeral media).
2. A game plugin contract so a new game type is a small, declarative package, not a fork of the whole app.
3. A shell application (web) for discovery, lobby, hosting, playing, editing, and publishing.

Anyone can host a public game and play with friends without an account. Signing in is optional and unlocks stat tracking and the ability to create, save, and publish games.

---

## 2. Landscape and user needs

This section grounds the design in what people already use and where those tools let them down. It exists so the goals in section 3 are answers to real pain, not guesses. Specific caps and prices shift over time and were current as of this writing; treat the structural patterns as durable and re-verify any number before quoting it.

### 2.1 The field

The "host screen plus crowd phones" shape is well established, and the leaders each leave a clear gap.

- **Jackbox Party Pack** is the closest reference for tone and join flow: the big screen shows a code, players open `jackbox.tv` in any browser with no app, and a large audience can watch and vote (up to 10,000 in Pack 3 and later). Its hard limit is the core player count, capped at about **8** in most games. Content is fixed per pack, sold as a **one-time purchase of roughly $20–30**, and re-bought each release.
- **Kahoot** owns classroom quizzing with PIN-code browser join and open authoring, but its **free tier caps participants at 10**, so a normal class or a party of a dozen hits the wall immediately, and paid tiers climb steeply with per-seat team licensing.
- **Mentimeter, Slido, and AhaSlides** are live-polling tools (word clouds, polls, quiz slides) with code-based browser join. They front-load small free caps (AhaSlides 50, Slido 100 with only a few polls, Mentimeter limited questions) and price per presenter.
- **Crowdpurr** targets large live trivia and events, scaling to 5,000, but its free tier is only 20 participants.
- **Gartic Phone (up to ~30)** and **Skribbl.io (~12 public, ~20 in custom rooms)** are free, browser-based, user-content drawing games; their weak point is unmoderated public rooms with open chat. **Among Us** is the social-deduction reference: 4–10 players, private 6-character codes, and dead players become ghost spectators, a clean built-in spectator model.
- **Houseparty** (video party games) is a cautionary tale: Epic shut it down in October 2021 after pandemic-era demand collapsed (installs had fallen roughly 83% year over year). Remote-only social is fragile; in-person and hybrid is the durable wedge.
- **Open-source attempts**, Mulberry, Hackbox, Free-Radish, Johnbox, BoxOpener, confirm latent demand for a self-hostable Jackbox-style platform, but most are hobby-scale, incomplete, and unpolished. A maintained, plugin-extensible platform is an open lane.

### 2.2 Recurring pain points

These complaints recur across reviews, forums, and support docs, not in isolation:

- **Player-count ceilings are the biggest open wound.** The Jackbox 8-player cap and the free-tier caps everywhere (Kahoot 10, Crowdpurr 20, AhaSlides 50) repeatedly frustrate real groups.
- **Cost and the per-pack / per-seat model.** Re-buying Jackbox content each release, and Kahoot's expensive annual, per-seat plans, generate steady gripes.
- **Room-code entry friction.** A single mistyped character yields "invalid room code"; codes expire when the host restarts, and rooms can be full or locked after start.
- **Remote-play latency.** When a host screen-shares over Zoom or Discord, the phone and the shared video run on different timelines, the TV shows time left while a player's input already closed. This second-screen desync is the top remote-play complaint, and the architecture, not a feature, is what fixes it.
- **Reconnection when a phone drops.** Players on weak Wi-Fi must re-enter the code and name to rejoin. The friction was real enough that Jackbox added easy host reconnect in Party Pack 9.
- **Moderation in public rooms.** Open drawing and social games with public lobbies and unfiltered chat invite trolling, and vote-kick fails when players are idle.
- **Repetitiveness.** Fixed content gets stale; both Kahoot and individual Jackbox games draw "played out" complaints once the novelty fades.
- **Accessibility gaps.** Timed pressure excludes slower readers and raises anxiety; color-only answers fail colorblind and low-vision players. Kahoot only later added shapes-not-just-color answers, high-contrast mode, read-aloud, 200% zoom, and an accuracy (de-timed) mode, effectively a list of what users had demanded.

### 2.3 What people actually want

The gripes invert cleanly into requirements, and they line up with Doot's thesis:

- Large active-player counts, not just a large passive audience.
- Free and self-hostable, escaping per-pack and per-seat fatigue.
- Custom content **and** a plugin system for new game *types*, which goes a step past the user-content-within-fixed-formats that competitors offer.
- Works in person and hybrid, with the in-person room as the primary target.
- QR-plus-browser join with no app install, and auto-reconnect by name after a drop.
- A true second-screen architecture so phones get state directly and never through shared video.
- A generous, low-cost spectator tier (the Quiplash 10,000-audience and Among Us ghost models are the bar).
- Host pacing controls: open, lock, reveal, skip, extend timers, advance.

### 2.4 Lessons per audience

- **Convention panels:** big, often dimly and unevenly lit rooms; high-contrast UI and large type are mandatory at projector distances. Audiences run to the hundreds, so the active-player versus large-spectator split is essential. Convention Wi-Fi and cellular are congested, design for lossy links, fast reconnection, and low per-client bandwidth.
- **Bars and trivia nights:** reliable shared Wi-Fi or cellular is the one hard requirement; QR join 15–20 minutes early lets teams settle; design for noise with a mic'd host, music, and clear reveal reactions. Timed answer windows double as anti-cheat against phone Googling. A 65-inch screen reads for about 40 people at ~20 feet; larger rooms need a projector or multiple displays.
- **House parties:** small, variable groups (4–20); casual and forgiving. Easy onboarding and tolerant reconnection matter most because people pick phones up and put them down.
- **Classrooms and lecture halls:** free-tier caps are a dealbreaker for a full class; offer an untimed accuracy mode so speed is not the only path; large text and high contrast for long sightlines and front glare; authoring, reuse, and pacing (pause to explain after a wrong answer) are core teacher needs.

### 2.5 Accessibility as a baseline

These are launch requirements, not later polish, and they directly widen the classroom and convention markets:

- Never encode meaning in color alone, pair color with shapes, icons, or labels (the Kahoot shapes-not-ABCD fix), and offer colorblind-safe palettes.
- High-contrast mode and scalable text (browser zoom to at least 200%) on both the big screen and the phone.
- Semantic HTML and ARIA so the phone client works with VoiceOver, TalkBack, NVDA, and JAWS; read-aloud for prompts and answers.
- Honor `prefers-reduced-motion` and offer a reduce-motion toggle; avoid flashing and harsh flicker (a photosensitivity safety issue as well as comfort).
- Pair audio cues with visual cues and vice versa, so neither sense is required alone, important in loud bars and conventions.
- Offer an untimed or accuracy-weighted mode so timed play is never the only way to participate.

These needs shape the engine (second-screen state, reconnect by name, generous spectator handling, host pacing), the theming system (contrast, color-plus-shape, reduced motion), the round primitives (an untimed option), and the plugin contract (community game types). The remainder of this document is the build that follows from them.

*Sources, abridged: Jackbox player and audience limits (support.jackboxgames.com, en.wikipedia.org/wiki/The_Jackbox_Party_Pack); Quiplash 10,000 audience (blog.playstation.com, 2015); Kahoot participant limits and pricing (support.kahoot.com, wooclap.com/en/blog/kahoot-pricing); Slido/AhaSlides/Crowdpurr caps (slido.com/pricing, ahaslides.com, crowdpurr.com/pricing); Gartic Phone and Skribbl.io (garticphone.com, skribbl.io); Among Us spectator model (en.wikipedia.org/wiki/Among_Us); Houseparty shutdown (variety.com, 2021); remote-play desync (steamcommunity.com app/1005300 discussions); room-code and reconnect friction (support.jackboxgames.com); public-room moderation (artbitrator.com/blog/skribbl-io-alternatives); accessibility (trust.kahoot.com/accessibility-settings, accessible.games AbleGamers Includification, caniplaythat.com). Re-verify any specific number against the vendor before quoting.*

---

## 3. Goals and non-goals

### Goals

- Run the same codebase locally and on a single DigitalOcean droplet, with a clear path to scale out later.
- Keep the database simple to use and simple to operate.
- Make the architecture modular, extensible, and documented, with shared components that games mix and match.
- Ship a small set of solid built-in games at launch, including an upgraded version of the guess-and-rate game already prototyped, plus a drawing game and a few others in the Jackbox vein.
- Support a plugin registry: drop a game folder into the repo, or register an external game by URL from the web UI without editing the main repo.
- Theming that applies to the lobby, gameplay, and results, with cute, cyber, professional, and playful packs out of the box.
- Persistent media (uploaded images, audio) on DigitalOcean Spaces. Ephemeral media (live drawings, photo answers) on CLASP state with TTL.
- Results pages that are animated and worth watching, not a static table.

### Non-goals for v1

- No payment, billing, or monetization.
- No native mobile apps. The phone client is the responsive web app.
- No realtime voice or video.
- No self-hosted relay. v1 uses the public relay at `wss://relay.clasp.to`. Self-hosting the relay is a later option.
- No heavy enterprise auth (no SSO, no SAML). Email auth only, and optional at that.
- No general-purpose CMS. Games are the only content type.

Keep the surface small. The flexibility comes from the plugin contract and the theming system, not from piling features into the shell.

---

## 4. Core concepts

A few terms are used precisely throughout this document.

A **Room** is one live session, identified by a short join code. All real-time state for a room lives under a single CLASP namespace prefix. Rooms are ephemeral and expire on their own.

A **Game** is a saved definition: which plugin it uses, its content (questions, options, prompts, categories), its theme, its music, its cover image, and its visibility. Games are durable and live in the database. A Game can be private, unlisted, or public.

A **Plugin** (also called a game type or template) is the code and contract for a kind of game. VoteBox is a plugin. A drawing game is a plugin. Plugins are either first-party (in the repo) or external (registered by URL).

A **Phase** is the top-level state of a room: lobby, active, or results.

A **Round** is one unit of play inside the active phase. A round moves through a standard state machine: ready, open, locked, reveal. The host drives every transition.

A **Host** runs the room on the shared screen (the viewer). A **Player** joins from a phone. A **Viewer** is the big-screen surface; usually the host owns it.

A **Theme** is a set of design tokens (colors, fonts, radii, shadows, optional textures and default music) that styles the lobby, gameplay, and results together.

Two kinds of state, kept strictly apart:

- **Durable state** lives in Postgres: accounts, game definitions, the plugin registry, and optional historical results for stats.
- **Ephemeral state** lives on the CLASP relay: phase, rounds, roster, inputs, live tallies, and ephemeral media with TTL. None of this is written to the database during play.

This split is the backbone of the architecture. The relay is the live nervous system. The database is the long-term memory. Because all live state is on the relay and not in app memory, the application tier holds no session state and scales horizontally without coordination.

---

## 5. Architecture overview

Three external systems and one application.

- **CLASP relay** (`wss://relay.clasp.to`): pub/sub for all real-time and ephemeral state. The relay knows nothing about Doot or games. It is plain publish and subscribe under a room prefix, with value persistence so late joiners receive a snapshot on subscribe, and TTL support for auto-expiring values.
- **PostgreSQL**: durable storage. In the single-droplet setup it runs in a container with its data directory on an attached DigitalOcean Volume (block storage). For scale, point at DigitalOcean Managed Postgres by changing one connection string.
- **DigitalOcean Spaces**: S3-compatible object storage for uploaded images and audio. Locally, MinIO stands in for Spaces using the same S3 API, so no cloud account is needed for development.
- **The Doot app**: a Nuxt application (Nuxt 4 line). Its Nitro server handles auth, the database, presigned uploads, and the games and plugins API. Its Vue 3 front end handles discovery, lobby, host, player, editor, and the plugin runtime.

The codebase is a small monorepo of focused packages:

- `@doot-games/engine`: the CLASP wrapper and room runtime. Framework-agnostic core plus Vue composables. All the generic machinery.
- `@doot-games/sdk`: the game plugin contract, types, schemas, round primitives, and the plugin bridge used by sandboxed external plugins.
- `@doot-games/ui`: the shared, theme-aware Vue component library. Inputs, displays, results widgets, and editor pieces.
- `@doot-games/themes`: theme token packs and the theme registry.
- `@doot-games/games`: the first-party game plugins (VoteBox, drawing, prompt-vote, poll, and more).
- `apps/web`: the Nuxt shell.
- `packages/plugin-template`: a starter an author copies to build an external game.

The npm scope for every published package is `@doot-games` (the organization created for the project). Internal references in this document use that scope throughout.

The dependency direction is one-way and clean: games depend on the sdk and ui; the sdk depends on the engine; the shell depends on everything. The engine never imports a game. The sdk never imports the shell. This is what keeps games and the platform independent.

---

## 6. Tech stack and rationale

TypeScript everywhere, strict mode on.

**Framework: Nuxt (Vue 3).** Chosen over SvelteKit and plain Vue for three reasons. It matches the existing Vue and Pixi direction already in play, which lowers the cost of building and reading the code. Its Nitro server gives server routes, auth, database access, and presigned uploads in the same project, so there is no separate backend service to run, which suits a single droplet. And Vue components are the natural unit for plugin views, so the plugin contract and the shell speak the same component model. Nuxt also gives server-side rendering for the public discovery and game pages, which helps those pages get found. Build against the current Nuxt 4 line (Vue 3.5+); pin the exact versions in the lockfile and confirm them at install time rather than from this document.

**Animation strategy: CSS first, Pixi 8 (via `vue3-pixi`) where it earns its place.** The default tool for motion is plain CSS, transitions, keyframe animations, transforms, and the Web Animations API. The VoteBox prototype already proves the bar fills, countdown rings, "locked in" stamps, lobby pops, and waiting dots are all clean, cheap, and theme-aware in pure CSS, and most of the lobby, gameplay, and results motion across the platform should stay there. CSS animation is lighter, accessible by default (it honors `prefers-reduced-motion` with one media query), needs no canvas teardown, and renders identically on every phone. Reach for Pixi only where CSS genuinely cannot do the job well: the drawing surface (`DrawCanvas`), any pixel-level mini-games a plugin ships, and the heavy, particle-driven moments of the results experience (confetti bursts, bar races with hundreds of moving elements, podium celebrations). The rule of thumb: if a `<div>` and a stylesheet get you a good result, use them; bring in Pixi when you need a real scene graph, many sprites, custom shaders, or per-frame control over a canvas.

Pixi is available throughout but is a dependency a view opts into, not a baseline cost every screen pays. When a view does need it, integrate through **`vue3-pixi`** (the `vue3-pixi` npm package, maintained by hairyf), which is the chosen Pixi binding. It is a Vue 3 renderer for Pixi: a plugin author writes Pixi scenes as Vue components (`<Container>`, `<Sprite>`, `<Graphics>`, `<Text>`, filters, and so on) with normal Vue reactivity and events, instead of imperatively mounting and tearing down a Pixi `Application` by hand. This keeps Pixi scenes in the same component model as the rest of the UI, so the plugin contract and the shell speak one language. `vue3-pixi` tracks Pixi 8 (its current `1.x` release declares a peer dependency on `pixi.js@8`); install `vue3-pixi`, `pixi.js`, and `pixi-filters` together and confirm the resolved versions at build time, since both move. Pixi scenes read the same theme CSS custom properties as the DOM (the engine exposes resolved tokens to the canvas), so a confetti burst or bar race matches a cute game or a cyber game without extra work.

**Database: PostgreSQL with Drizzle ORM.** Postgres is the standard, operates well on a block-storage volume, and scales by swapping to managed Postgres later. Drizzle is the access layer: it is light, SQL-first, fully typed, and far less magic than the heavier ORMs, which keeps day-to-day use simple. Drizzle also supports SQLite, so a minimal personal deploy can run on a single SQLite file on the volume with the same query code. Postgres is the default; SQLite is the minimal-mode option.

**Auth: nuxt-auth-utils with argon2id.** Sealed, httpOnly session cookies with no server session store needed, plus argon2id password hashing. This is small, current, and avoids pulling in a heavy auth platform. Email and password is the baseline because it needs no external services. Magic-link sign-in is an optional upgrade when SMTP is configured. Auth is optional for playing, hosting, and joining; it only gates create, publish, and stats.

**Validation and schemas: Zod.** One schema language for API validation and for game config. Because a plugin declares its config as a Zod schema, the editor can auto-generate a form when a plugin ships no custom editor. `drizzle-zod` bridges database rows and Zod where useful.

**Object storage client: aws4fetch for presigning.** A tiny library that signs S3 requests against any S3-compatible endpoint (Spaces and MinIO both). The server route issues a presigned PUT and the browser uploads directly. This avoids pulling in the full cloud SDK for what is a small job. If full SDK features are needed later, the AWS S3 v3 client is the fallback.

**Local object storage: MinIO.** S3-compatible, runs in a container, stands in for Spaces in development so the same upload code path works locally and in the cloud.

**Containerization: Docker and docker compose.** One compose file for local (app, Postgres, MinIO). One compose file for production (app, Postgres on the volume, reverse proxy). The same application image runs in both; only environment variables differ.

**Reverse proxy and TLS: Caddy.** Automatic HTTPS with a tiny configuration. Sits in front of the app container on the droplet.

**Tooling: pnpm workspaces, Biome (or ESLint plus Prettier), Vitest.** pnpm for the monorepo. Biome for fast lint and format in one tool, or ESLint plus Prettier if preferred. Vitest for unit tests, focused on the engine state machine and the scoring functions, since those are the parts most worth testing.

Everything above is open source. The bias is toward small, current libraries that make a specific job easy, and away from large frameworks that do many things you did not ask for.

---

## 7. The CLASP engine (`@doot-games/engine`)

This package is the heart of the platform. It wraps CLASP so that no game ever touches the relay directly. A game declares the shape of its state and renders views; the engine maps that onto CLASP addresses and runs all the generic room logic.

### 7.1 What the engine owns

- The CLASP connection, lifecycle, and reconnect.
- The room namespace and address scheme.
- The phase and round state machine.
- The player roster, heartbeats, and presence.
- Late-joiner eligibility (who can act on which round).
- Reconnect-by-name identity so a dropped phone reclaims its inputs.
- Host authority for transitions and the countdown auto-lock.
- The ephemeral media store (drawings, photos) with TTL.
- A reactive runtime surface (Vue composables) that views consume.

### 7.2 Room namespace

All real-time state for a room sits under one prefix: `/doot/<ROOM>/...`. The room code is four characters from an unambiguous alphabet (no I, O, 0, 1). Every published value uses an absolute TTL (default eight hours) so the public relay stays tidy.

| Address | Owner | Meaning |
| --- | --- | --- |
| `/meta` | host | plugin id and version, title, theme id, theme overrides, music url |
| `/config` | host | the game definition for this room, with answer keys withheld |
| `/phase` | host | lobby, active, or results |
| `/round/index` | host | current round index |
| `/round/state` | host | ready, open, locked, or reveal |
| `/round/deadline` | host | epoch ms when voting auto-locks, or null |
| `/round/<i>/answer` | host | the answer key for round i, published only at reveal |
| `/results/summary` | host | final results payload |
| `/player/<pid>/profile` | that player | display name, joinedAtIndex |
| `/player/<pid>/ping` | that player | heartbeat timestamp |
| `/input/<i>/<pid>` | that player | that player's submission for round i |
| `/media/<key>` | publisher | ephemeral image or drawing, TTL-scoped |

Withholding answers matters. The host publishes the game config with the `correct` fields stripped, then publishes each round's answer key to `/round/<i>/answer` at the reveal step. A spectator reading the relay cannot see answers before they are revealed. This closes the obvious cheating path and is a hard requirement, not an option.

### 7.3 The standard state machine

Every game uses the same top-level flow, so the engine owns it and games never reimplement it:

```
lobby
  -> active
       for each round:
         ready  -> open -> locked -> reveal
  -> results
```

The host triggers each transition. When a round has a timer, the engine runs a 250 ms loop that drives the countdown display and auto-locks when the deadline passes. Players read the deadline reactively and render their own countdown from the same value. The auto-lock only runs on the host client.

A plugin may declare that a given round skips a state (for example, a poll with no correct answer can treat reveal as "show the distribution"), but the state names stay constant so the UI and the engine stay predictable.

### 7.4 Identity and reconnect

A player's id is derived from the room code plus their chosen name: `p_<hash(room + name)>`. Re-entering the same name in the same room reclaims the same identity, which restores that player's inputs and score from the relay snapshot. No login and no local storage are required for this to work. Local storage, when available, is used only to prefill the name field, never as the source of truth, because the play surface must work where storage is blocked (such as inside an embedded frame).

### 7.5 Late-joiner eligibility

When a player publishes their profile for the first time, the engine computes `joinedAtIndex` from the current phase and round state. A player joined during the lobby is eligible from round zero. A player joined mid-game is eligible from the current or next round, and earlier rounds stay locked for them. Scoring only counts rounds a player was present for.

### 7.6 Ephemeral media store

Live media (a player's drawing, a snapped photo answer) is published as a CLASP value under `/media/<key>` with a TTL scoped to the round (round length plus a small buffer). Late joiners receive the current media via snapshot; expired media drops on its own. The engine exposes helpers for this and handles the size and encoding concerns described in the media section. The database is never involved in live media.

### 7.7 The runtime surface

Views consume a single composable rather than touching CLASP. The shape:

```ts
const room = useDootRoom()

// reactive reads
room.phase            // 'lobby' | 'active' | 'results'
room.round            // { index, state, deadline }
room.players          // live roster (present players)
room.me               // this client's identity and role
room.config           // the game definition (answers withheld until reveal)
room.theme            // resolved theme tokens
room.isHost           // boolean

// player actions
room.submit(input)            // publish this player's input for the current round
room.inputFor(roundIndex)     // this player's own submission (for restore)

// host actions
room.host.start()
room.host.openVoting()
room.host.lock()
room.host.reveal()
room.host.next()
room.host.finish()

// aggregation input for host-side tallies and scoring
room.inputsFor(roundIndex)    // all submissions for a round (host only)

// ephemeral media
room.media.set(key, data, { ttlMs })
room.media.get(key)           // reactive
```

A first-party game imports this composable directly. A sandboxed external game receives the same logical surface over a message bridge (see the plugin registry section). Same contract, two transports.

---

## 8. The game plugin contract (`@doot-games/sdk`)

A game type is a small package that satisfies one interface. The contract is the single most important design decision in Doot, because it is what lets new games appear without touching the platform.

> **Implementation note (current):** the contract evolved into a **block + composition** model that realizes this section's "round primitives are the simple path" intent more directly. A *block* is a standalone round kind (Guess, Rate, Poll) declaring a content schema, a Player view, a Host view, an `aggregate`, and optional answer-withholding; a *game* is a manifest plus an ordered list of `{ block, content }` rendered by a generic engine. So a game is usually a few lines of composition and needs no components, while a full-custom game can still override the views. The single-type/composite/remix/full-custom tiers map onto this. See `docs/authoring-a-game.md` and `packages/sdk/src/block.ts`; the interface below is the conceptual ancestor.

### 8.1 The plugin interface

```ts
interface GamePlugin {
  manifest: GameManifest
  configSchema: ZodSchema          // shape of the game definition the editor produces
  defaultConfig: GameConfig        // seed content shown for a new game of this type
  rounds: (config: GameConfig) => RoundSpec[]   // derive the round sequence from config
  score: (ctx: ScoreContext) => Results          // aggregate inputs into results
  components: {
    Host: Component                // big screen, switches on round state
    Player: Component              // phone input surface
    Results: Component             // the animated results page
    Editor?: Component             // optional; auto-generated from configSchema if omitted
    Lobby?: Component              // optional lobby customization
  }
  themeDefaults?: Partial<ThemeTokens>
}

interface GameManifest {
  id: string                       // reverse-dns or short slug, globally unique
  name: string
  version: string                  // semver
  description: string
  author: string
  icon?: string                    // url or packaged asset
  capabilities: Capability[]       // e.g. ['timer','images','music','drawing','teams']
  minPlayers?: number
  maxPlayers?: number
}
```

A game author writes a manifest, a Zod config schema, a default config, a function that turns config into a list of rounds, a scoring function, and the view components. That is the whole job. The engine handles everything else.

### 8.2 Round primitives

Most games do not need custom round components. The sdk ships a set of round primitives that a game assembles declaratively. This is the simple path; custom components are the powerful path. The two coexist.

- `multiple-choice`: N options, optionally one correct, optional per-option image, optional timer. The guess round.
- `rating`: M categories rated on a configurable scale (the scale minimum, maximum, and step are part of the round config, so a game can use 1 to 5 stars or 1 to 10 or any range), optional timer. The rate round.
- `free-text`: players type a response, with an optional follow-on vote on the submissions. The prompt round.
- `draw`: players draw on a canvas; drawings are shown on the big screen and optionally voted on. Uses the ephemeral media store with TTL.
- `poll`: an opinion round with no correct answer; reveal shows the distribution.
- `reaction`: a speed or buzzer round; first correct or fastest taps score.
- `rank`: players order a set of items; scoring compares against a key or aggregates a group ranking.

A plugin's `rounds(config)` returns a list of these specs (or references to custom components). The VoteBox plugin, for example, returns an alternating list of `multiple-choice` and `rating` specs derived from its character list. A drawing game returns a list of `draw` specs.

### 8.3 Scoring

The scoring function receives the config, the collected inputs per round, and the eligible players, and returns a results payload. The engine calls it on the host when the game finishes. The results payload is structured so the results page can render leaderboards, per-category awards, crowd favorites, and distributions. Scoring is pure and testable, which is why it is a function and not scattered through components.

### 8.4 Editor

If a plugin ships an Editor component, the shell uses it. If it does not, the shell auto-generates an editor form from the Zod config schema, including image upload fields with preview, scale pickers for rating rounds, option lists for choice rounds, and category management. This means a simple game type can ship with no editor code at all, and a complex one can ship a fully custom editor. Both produce a config that validates against the same schema.

### 8.5 Authoring summary

To build a game type:

1. Copy `packages/plugin-template`.
2. Write the manifest and the Zod config schema.
3. Provide a default config (the seed content a creator starts from).
4. Implement `rounds(config)`, usually a short mapping to round primitives.
5. Implement `score(ctx)`.
6. Build the Host, Player, and Results components using `@doot-games/ui` pieces and the `useDootRoom` runtime. Optionally add an Editor and a Lobby.
7. Set theme defaults if the game looks best with a particular palette.

Documentation for this lives in the package readme and in a dedicated authoring guide, with the VoteBox plugin serving as the worked reference example.

---

## 9. Plugin registry and external plugins

Two tiers of plugins, with the same contract and two loaders.

### 9.1 First-party plugins

First-party game plugins live in `@doot-games/games`, one folder per game. A build-time registry discovers them with a Vite glob import. They load as native dynamic imports, run in the main app context, and are fully trusted because they ship in the repo. This is the MVP path and the path for any game the maintainer vets and merges.

### 9.2 External plugins

This is the capability that lets the community add games without anyone editing the main repo. An author hosts their plugin themselves (their repo's pages, a release artifact, a CDN that serves from the repo, or their own Spaces bucket) as a built ES module plus a manifest JSON. From the Doot web UI, a user pastes a manifest URL. The shell fetches the manifest, validates it against the manifest schema with Zod, shows a preview, and registers it. The game then appears as a type you can create, play, and publish, with no change to the platform repo.

### 9.3 Trust model

Running arbitrary remote code in the main page would expose session cookies, the database routes, and the relay connection. External plugins therefore run inside a sandboxed iframe and talk to the shell over a typed postMessage bridge, the Plugin SDK. The shell holds the single CLASP connection and the auth context. The iframe never sees credentials or the raw relay. It declares its state shapes and renders its views; it sends intents (publish my input, or for the host, advance the round) and receives state snapshots. The same `useDootRoom` surface is provided to the iframe over the bridge, so a plugin written against the first-party API runs unchanged when sandboxed.

First-party plugins skip the iframe and use the runtime directly. External plugins are sandboxed. One contract, two transports, with the security boundary exactly where untrusted code is.

### 9.4 Publishing flow

A signed-in author can mark a registered external plugin as published, which lists it in discovery as a game type others can adopt. Publishing records the manifest URL and version in the `plugins` table. Versions are semver; the shell can pin a game to a plugin version so a published game keeps working when the author ships a new major version.

### 9.5 Phasing

The folder registry and the contract ship in the MVP. The external-plugin loader, the sandbox bridge, and the publishing flow ship in phase two. Because the contract is identical across both, building the MVP does not create rework for the external system; only the loader and the bridge are added.

---

## 10. Shared UI library (`@doot-games/ui`)

A catalog of theme-aware Vue components that games and the shell compose. Every component reads its colors, fonts, radii, and shadows from CSS custom properties set by the active theme, so the same component looks correct in any theme. This is the mix-and-match layer.

Layout: `Stage` (the host surface frame), `PhoneShell` (the player frame), `Panel`, `TopBar`, `ControlBar`, `RoomTicket` (join code plus QR code).

Inputs: `OptionGrid` (choice buttons with optional images), `RatingStrip` (configurable scale), `TextEntry`, `DrawCanvas` (Pixi-backed via `vue3-pixi`), `ColorPicker`, `RankList`.

Display: `VoteBars`, `AverageMeters`, `CountdownRing`, `ProgressDots`, `RosterChips`, `Avatar`, `ConnChip`, `ReconnectBanner`.

Results: `Leaderboard`, `Podium`, `AwardCard`, `StatStrip`, `VoteBars`, `DrawingGallery`, `BarRace`, `ConfettiBurst`. These are covered in the results section.

System: `JoinForm`, `ThemeProvider`, `QrCode`.

Editor: `SchemaForm` (renders a form from a Zod schema), `SlideList` (add, reorder, delete, with focus-stable updates), `ImageUploader` (presigned upload with live preview), `ScalePicker`, `ThemePicker`, `MusicPicker`, `CategoryTags`.

The library has a stories or demo route during development so each component can be viewed in isolation across themes.

---

## 11. Theming (`@doot-games/themes`)

A theme is a set of design tokens expressed as CSS custom properties. A theme applies to the lobby, the gameplay surface, and the results together, so a game feels like one coherent thing from join to final score.

### 11.1 Token set

A theme defines: background and surface colors, ink and muted text colors, a small accent palette, display and body fonts, border radii, shadow styles, optional paper or texture overlays, and an optional default music track. Tokens are applied by `ThemeProvider`, which sets CSS variables on a wrapper element. Both DOM components and Pixi scenes read the same variables, so animated results match the rest of the UI.

### 11.2 Starter packs

Four packs ship at launch:

- Cutesie: soft pastels, rounded shapes, a friendly display face, gentle motion. For the kawaii and convention crowd.
- Cyber: dark base, neon accents, monospace display, sharp edges, glow. For game nights and a techy look.
- Professional: restrained palette, clean sans fonts, subtle motion, no texture. For classrooms and work settings.
- Playful: bright primaries, chunky shapes, bouncy motion, hard offset shadows. A general party look.

### 11.3 Per-game customization

A creator picks a theme per game. They can override the room title (the label shown in the lobby and on the big screen) and the accent color without building a full theme. A game can also ship its own theme defaults through the plugin, which the creator can keep or replace. Themes are a registry like plugins: drop a token file into `@doot-games/themes` to add one, with room to support external theme packs later.

---

## 12. Results experience

Results are a first-class, animated, theme-aware part of the product, not a static table. The goal is a payoff the room reacts to. Most of the motion is CSS, counts that tick up, bars that fill, cards that flip and slide, standings that settle, because CSS does these well, cheaply, and accessibly. The widgets that are genuinely particle- or scene-heavy (`ConfettiBurst`, `BarRace` with many moving elements, podium celebrations, `DrawingGallery` playback of stroke lists) are the place Pixi 8 earns its keep, mounted through `vue3-pixi`. A widget should default to CSS and graduate to a Pixi scene only when the effect demands a real scene graph or hundreds of sprites.

The results page composes reusable result widgets based on what the game produced:

- `Leaderboard`: standings that count up and settle, with the winner emphasized.
- `Podium`: top three with a confetti burst on reveal.
- `AwardCard`: per-category awards that flip or slide in, such as a top-rated result for each rating category.
- `VoteBars`: animated distribution bars for poll and choice rounds.
- `DrawingGallery`: a gallery of player drawings for drawing games, with the crowd favorite highlighted.
- `BarRace`: an animated race for score progression across rounds.
- `StatStrip`: quick stats (players, rounds, top score, total votes) that animate in.
- `ConfettiBurst`: a particle celebration keyed to the theme palette.

A plugin's Results component selects and arranges these widgets from its results payload. Because the widgets read theme tokens, the celebration matches a cute game or a cyber game without extra work. The host screen is the canvas for this; players see a compact version of the same results on their phones.

---

## 13. Image and media handling

Two distinct paths, chosen by lifetime.

### 13.1 Persistent media

Images and audio that belong to a game definition (option images, backgrounds, cover art, music) are uploaded through a presigned PUT to DigitalOcean Spaces. The flow: the editor requests a presigned URL from a server route, the browser uploads the file directly to Spaces, and the resulting object URL is stored in the game config in Postgres. The editor shows a live preview after upload. Locally, the same path targets MinIO. Allowed types and a size cap are enforced on the server route that issues the presign.

### 13.2 Ephemeral media

Live media created during play (player drawings, photo answers) goes to CLASP state with a TTL, never to the database. This is a hard preference for the platform, because live media is throwaway and the relay already handles snapshots and expiry.

Drawings are handled with size in mind. A drawing is serialized primarily as a compact stroke list (an ordered set of strokes with color, width, and points), which is small, replayable, and animatable, and published under `/media/<roundIndex>/<pid>` with a TTL of the round length plus a buffer. A rasterized bitmap fallback (downscaled, compressed to WebP or PNG) is supported for cases where a stroke list is not appropriate, with downscaling and compression applied before publish to respect relay value size limits. The engine exposes helpers for both. Late joiners receive current drawings via snapshot; everything expires on its own when the round ends.

### 13.3 Music

A game can carry an optional music track that plays only on the host or viewer surface, never on players' phones. The track url is part of the game config (uploaded to Spaces or linked). The Host view owns the audio element and the lifecycle: loop in the lobby and during play, and duck or stop on reveal. A theme can provide a default track that a game uses unless the creator sets their own.

---

## 14. Auth and accounts

Auth is optional and light, and it never blocks play.

Anonymous by default: opening a public or unlisted game from discovery and hosting it requires no account, and joining a room requires no account. The play path runs on CLASP plus the game config fetched from the public games API.

Signing in unlocks creating, saving, and publishing games, and tracking your stats across sessions. The baseline is email and password, using `nuxt-auth-utils` for sealed httpOnly session cookies and argon2id for password hashing, which needs no external services. Magic-link sign-in is an optional upgrade once SMTP is configured, which removes password handling entirely for instances that prefer it.

Stats are recorded only when a player or host is signed in. A signed-in player accumulates games played, scores, placements, and per-game-type history. Anonymous players are counted in a room's results for that session but are not persisted to an account.

---

## 15. Data model

Durable state only. All of the following lives in Postgres (or SQLite in minimal mode) through Drizzle. Live state stays on the relay.

- `users`: id, email (unique), password_hash, display_name, created_at.
- `games`: id, slug, owner_id (nullable for anonymous-authored local drafts), plugin_id, plugin_version, title, description, config (jsonb), theme_id, theme_overrides (jsonb), music_url, cover_url, visibility (private, unlisted, public), fork_of (nullable), created_at, updated_at.
- `plugins`: id, slug, name, version, author_id (nullable), manifest (jsonb), source_type (builtin or url), source_url (nullable), status (pending, approved), created_at.
- `play_sessions`: id, game_id, room_code, host_user_id (nullable), started_at, ended_at, summary (jsonb). Recorded only when stats apply.
- `play_results`: id, play_session_id, user_id (nullable for anonymous players), score, placement, payload (jsonb).

Sessions for auth use sealed cookies and need no table. If revocation is wanted later, a minimal `sessions` table can be added without disturbing the rest.

The boundary restated: the database holds accounts, game definitions, the plugin registry, and optional historical results. The relay holds everything that is live. Nothing about an in-progress room is written to the database during play.

---

## 16. API surface (Nitro server routes)

Routes are split into public (no auth) and authed. Public routes serve the play path; authed routes serve creation and stats.

Public:

- `GET /api/games/:slug`: fetch a public or unlisted game definition for hosting or joining. No auth.
- `GET /api/discover`: list and search public games, with filters by plugin type and theme.
- `GET /api/plugins`: list approved plugins (built-in and published external), including manifest URLs.
- `POST /api/results`: ingest a finished room's results. Accepts anonymous entries; associates signed-in entries with accounts.

Authed:

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, and the optional magic-link routes.
- `GET /api/me`, `GET /api/me/stats`, `GET /api/me/games`.
- `POST /api/games`, `PATCH /api/games/:id`, `DELETE /api/games/:id`: create and manage games.
- `POST /api/games/:id/publish`: set visibility to public.
- `POST /api/uploads/presign`: issue a presigned PUT for Spaces or MinIO. Validates type and size.
- `POST /api/plugins/register`: register an external plugin by manifest URL after validation.
- `POST /api/plugins/:id/publish`: list a registered external plugin in discovery.

All inputs validate with Zod. Public routes never expose answer keys; answers live only in the relay at reveal time.

---

## 17. Repository structure

A pnpm workspace monorepo, kept lean. The package split exists to enforce the separation of concerns, not to multiply files.

```
doot/
  apps/
    web/                  # Nuxt shell: discovery, lobby, host, player, editor,
                          # auth, API routes, plugin loader
  packages/
    engine/               # @doot-games/engine: CLASP wrapper, room runtime, Vue composables
    sdk/                  # @doot-games/sdk: plugin contract, types, Zod schemas, round
                          # primitives, the sandbox bridge (Plugin SDK)
    ui/                   # @doot-games/ui: shared theme-aware Vue components
    themes/               # @doot-games/themes: token packs and theme registry
    games/                # @doot-games/games: first-party plugins (votebox, draw, quip, poll...)
    plugin-template/      # starter an author copies to build an external game
  docker/
    Dockerfile
    docker-compose.yml         # local: app + postgres + minio
    docker-compose.prod.yml    # droplet: app + postgres-on-volume + caddy
    Caddyfile
  docs/
    architecture.md
    authoring-a-game.md
    clasp-primer.md
    deploy.md
  .env.example
  .gitignore
  pnpm-workspace.yaml
  README.md
```

Dependency direction: `games` depend on `sdk` and `ui`; `sdk` depends on `engine`; `ui` depends on `themes`; `apps/web` depends on all packages. The engine never imports a game. The sdk never imports the shell.

---

## 18. Configuration and secrets

All configuration is environment-driven so the same image runs locally and in the cloud with no code change.

A `.env` file holds secrets and is gitignored. A committed `.env.example` documents every variable. A local copy of the working credentials is kept on disk for convenience and is covered by gitignore, so it never enters version control.

Variables include:

- `DATABASE_URL`: Postgres connection string, or a SQLite file path in minimal mode.
- `SESSION_PASSWORD`: secret for sealing session cookies.
- `SPACES_ENDPOINT`, `SPACES_REGION`, `SPACES_BUCKET`, `SPACES_KEY`, `SPACES_SECRET`: object storage; point at MinIO locally and at Spaces in the cloud.
- `PUBLIC_BASE_URL`: the site origin, used for join links and QR codes.
- `CLASP_RELAY_URL`: defaults to `wss://relay.clasp.to`.
- `SMTP_*`: optional, only for magic-link sign-in.

`.gitignore` covers `.env`, `.env.*` except `.env.example`, any local credentials directory, build output, and dependency directories.

Run-local versus run-cloud is a matter of which values these variables hold. Local points the database at a containerized Postgres (or a SQLite file) and storage at MinIO. Cloud points the database at Postgres on the attached volume (or managed Postgres) and storage at Spaces.

---

## 19. Deployment

### 19.1 Local

`docker-compose.yml` brings up three services: the Nuxt app, Postgres with its data in a named volume, and MinIO for S3-compatible storage. One command starts the full stack. Database migrations run on startup with Drizzle. The app is reachable on localhost. This setup needs no cloud account.

### 19.2 Single droplet

On a DigitalOcean droplet, `docker-compose.prod.yml` runs the Nuxt app, Postgres with its data directory on an attached DigitalOcean Volume (block storage, mounted at a path such as `/mnt/doot-data/pg`), and Caddy as the reverse proxy with automatic HTTPS. Object storage is DigitalOcean Spaces, reached with the S3 client through the Spaces endpoint. The relay is the public `wss://relay.clasp.to`, so the app holds no live state and the droplet only needs to serve the shell and the API.

### 19.3 Backups

A scheduled `pg_dump` writes a compressed snapshot to a Spaces bucket on a timer. Because the database holds only durable state (accounts, games, plugin registry, stats), backups are small and restoring is quick.

### 19.4 Scaling later

The scale path is deliberately undramatic, because the architecture front-loaded it:

- Move the database to DigitalOcean Managed Postgres by changing `DATABASE_URL`.
- Run several app containers behind the proxy or a DigitalOcean Load Balancer. The app tier is stateless because all live state is on the relay, so this needs no session affinity or shared cache.
- Spaces is already external and scales on its own.
- If the public relay becomes a limit (room-code collisions on a four-character namespace, or rate limits), stand up a self-hosted relay and point `CLASP_RELAY_URL` at it, and widen the room-code length.

---

## 20. Built-in games for v1

A small set that proves the engine and the round primitives across the target audiences.

**Game types are the round primitives.** The discrete types a creator picks from, Guess, Rate, Draw, Poll, Rank, Buzz, Quip, each map to one round primitive (`multiple-choice`, `rating`, `draw`, `poll`, `rank`, `reaction`, `free-text`). A first-party plugin is usually *single-type* (built on one primitive); a few are *composites* that combine types. This is how discovery and the create flow present games, and it keeps each plugin thin. The mockup's Explore and Create screens are organized around exactly these types.

Guess (single-type, `multiple-choice`): show a prompt or image, give options, one is correct. The classic guess-the-character or who-said-it round.

Rate (single-type, `rating`): rate each subject on creator-defined categories on any scale; the room crowns a top pick per category.

VoteBox (composite of Guess + Rate): alternating guess and rate rounds, the upgraded version of the prototype, and the case where combining two types into one game earns its place. Results show a leaderboard, a top-rated award per category, and a crowd favorite. Guess, Rate, and VoteBox share one deck engine and one set of Host/Player/Results views, so the single-type plugins and the composite stay in sync. VoteBox remains the worked example in the authoring guide.

Sketch (drawing game): players are given a prompt and draw it on the phone; drawings appear on the big screen and the room votes on a favorite. Uses the `draw` primitive and the ephemeral media store with TTL, and the `DrawingGallery` result widget. This exercises the live-media path end to end.

Quip (prompt and vote): players answer a prompt with text, then everyone votes on the funniest answer. Uses `free-text` with a follow-on vote. Good for parties and panels.

Pulse (poll and opinion): the host asks opinion questions with no right answer; reveal shows the live distribution. Uses `poll`. Strong fit for classrooms and audience check-ins.

Rank (ordering): players order a set of items; scoring compares against a key or aggregates a group consensus. Uses `rank`. Works for debates and panels ("rank these from best to worst").

Buzz (reaction round): a fast buzzer or first-correct round for quick trivia bursts at a bar. Uses `reaction`.

Each of these is a thin plugin: a manifest, a config schema, a default config, a `rounds` mapping to primitives, a `score` function, and small Host, Player, and Results components built from `@doot-games/ui`.

---

## 21. CLASP primer for the implementing agent

This section is written for Claude Code. Read it before building `@doot-games/engine`.

### 21.1 How to learn CLASP

Before writing engine code, read the CLASP skill and the source:

- The CLASP skill at `/mnt/skills/user/clasp/SKILL.md` and its reference files (the browser CDN guide and the recipes), which describe the API, the signal types, wildcards, late-joiner snapshots, and bridges.
- The repository at `https://github.com/lumencanvas/clasp`, especially the README and the core package types, to confirm the current API surface and version.

Confirm the API against the installed package version rather than assuming, since the package evolves.

### 21.2 Verified core surface

The engine uses the core package (the IIFE or ESM build of `@clasp-to/core`), not the higher-level SDK, because Doot only needs publish and subscribe with persistence and TTL. The relevant surface:

- Construct: `new Clasp(url, { name, reconnect })`.
- Connect: `connect()` returns a promise.
- Subscribe: `on(pattern, callback, options)` returns an unsubscribe function. The callback receives the value, the address, and metadata. Patterns support wildcards.
- Publish: `set(address, value, { ttl, absolute })`. Values can be objects and arrays. Published values persist on the relay, so a new subscriber receives a snapshot of the current value on subscribe.
- Read cache: `cached(address)` returns the current cached value synchronously. `get(address)` returns a promise.
- Lifecycle: `onConnect`, `onDisconnect`, `onReconnect`, `onError`.
- Close: `close()`.

The public relay is `wss://relay.clasp.to`. The relay stores nothing about games; it is plain pub/sub under whatever addresses Doot chooses.

### 21.3 Conventions the engine must follow

- Namespace every room under `/doot/<ROOM>/...` using the address scheme in section 7.2.
- Use an absolute TTL on every published value (default eight hours) so the public relay does not accumulate dead rooms.
- Withhold answer keys from the published config; publish each round's answer only at reveal under `/round/<i>/answer`.
- Derive player identity from room plus name so reconnect restores inputs without local storage.
- Treat the host as the only writer of game, round, and results addresses, and each player as the only writer of their own profile, ping, and inputs.
- Use the ephemeral media store under `/media/...` with round-scoped TTL for drawings and photo answers, with stroke-list serialization preferred and compressed bitmaps as a fallback, mindful of relay value size limits.

The prototype that this platform generalizes already implements this model for a single game. The engine lifts that machinery out of the game and exposes it as the reusable runtime described in section 7.

---

## 22. Engineering conventions

- TypeScript strict across all packages. No implicit any.
- Lint and format with Biome, or ESLint plus Prettier if preferred. One choice, applied repo-wide.
- Validate every external input (API bodies, plugin manifests, game configs) with Zod.
- Unit tests with Vitest focused on the engine state machine and the scoring functions, since those carry the logic most worth protecting. End-to-end coverage with Playwright is optional and can come later.
- Document as you build: each package has a readme describing its purpose and public surface, and the `docs/` guides stay current with the code.
- Treat the accessibility baseline in section 2.5 as a build requirement: semantic HTML and ARIA on interactive surfaces, color paired with shape or label (never color alone), `prefers-reduced-motion` honored by every animation (CSS and Pixi), high-contrast-safe theme tokens, and an untimed option on timed rounds.
- Commit messages describe the change plainly and contain no AI attribution. No "generated with" lines, no AI co-author trailers, no tool credits in commit metadata.
- Keep dependencies small and current. Prefer a focused library that does one job over a framework that does many.

---

## 23. Roadmap and phasing

Phase one, the MVP:

- The engine with the full room runtime and the standard state machine.
- The plugin contract and the round primitives.
- The first-party plugin registry (folder plus glob discovery).
- VoteBox and Sketch as the first two games, proving the choice, rating, and drawing paths.
- Email and password auth, optional and non-blocking.
- The shared UI library and the four theme packs.
- Animated results with the core result widgets.
- Persistent uploads to Spaces (MinIO locally) and ephemeral media on the relay.
- Local docker compose and single-droplet deploy with Postgres on a volume and Caddy.

Phase two, community and depth:

- External plugins: manifest-URL registration, the sandboxed iframe runtime, the Plugin SDK bridge, and the publishing flow.
- More built-in games (Quip, Pulse, Rank, Buzz).
- Richer results animations and more result widgets.
- The auto-generated editor from config schemas, refined.

Phase three, scale and polish:

- Managed Postgres and multiple app instances behind a load balancer.
- Optional self-hosted relay and longer room codes, with encrypted rooms through the CLASP SDK if private rooms are wanted.
- Phone client polish and accessibility passes.

---

## 24. Open questions and risks

- Relay value size limits constrain ephemeral media. Drawings must be serialized compactly (stroke lists first, compressed bitmaps as fallback). Confirm the limit against the relay and set encoding budgets accordingly.
- The public relay uses a four-character room code, which can collide at scale. A collision check on room creation reduces the risk, and a self-hosted relay with longer codes removes it.
- External plugins run third-party code. The sandboxed iframe plus the message bridge is the security boundary; the surface of that bridge must stay small and reviewed.
- Pixi 8 integration with Vue is through `vue3-pixi`, which currently tracks Pixi 8 but is a pre-1.0/early-1.x community library that can lag a Pixi release. Mitigations: keep Pixi confined to the few canvas-heavy views (most of the product is CSS, so a Pixi regression cannot break the lobby, gameplay, or simple results), pin `vue3-pixi`, `pixi.js`, and `pixi-filters` to known-good versions in the lockfile, and confirm the resolved versions at build time. If `vue3-pixi` ever falls behind a required Pixi feature, a thin Vue composable that mounts a Pixi `Application` into a canvas ref is the documented fallback for the affected widget, with no change to the rest of the system.
- Magic-link sign-in depends on SMTP. The email-and-password baseline avoids that dependency, so magic link stays optional.
- Withholding answers depends on the host publishing a stripped config and revealing keys per round. The engine must enforce this so a plugin cannot accidentally leak answers in the published config.

---

This document is the plan. The build order in the roadmap is the suggested path. The architecture exists to keep two things independent: the platform and the games. Hold that line and the rest stays simple.
