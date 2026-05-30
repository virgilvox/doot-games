# @doot-games/sdk

The authoring contract. Games are **blocks** + **compositions**.

**Public surface**
- `defineBlock` + `RoundBlock` - a standalone round kind: `contentSchema` (Zod),
  `PlayerInput`/`HostDisplay` views, `emptyInput`/`isComplete`, a pure `aggregate`,
  and optional `redactContent`/`answerOf` (answer withholding).
  Two-phase (make→judge) extras: `derive` (build a round's content from earlier
  rounds' inputs), `revealSummary` + `PlayerReveal` (per-round phone feedback),
  and `toVoteText` (render a make-submission to votable text).
- `defineGame` + `GamePlugin` - a manifest + an ordered `{ block, content }` list,
  with an optional full-custom `components` override and an optional
  `buildConfig(seed)` content-pool sampler (replayable games).
- Two-phase types: `DeriveContext`, `DeriveSource`, `DerivedContent`,
  `RevealContext`; `RoundInstance.from` selects a derived round's source rounds.
- `gameManifestSchema` / `GameManifest` (incl. `flagship?`), results types
  (`StandardResults`, `LeaderboardEntry`, `Distribution`, `StatItem`), and `z`.

The sdk imports `@doot-games/engine` and `@doot-games/themes` (types only). It never
imports the app shell.
