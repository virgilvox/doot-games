# @doot-games/sdk

The authoring contract. Games are **blocks** + **compositions**.

**Public surface**
- `defineBlock` + `RoundBlock` — a standalone round kind: `contentSchema` (Zod),
  `PlayerInput`/`HostDisplay` views, `emptyInput`/`isComplete`, a pure `aggregate`,
  and optional `redactContent`/`answerOf` (answer withholding).
- `defineGame` + `GamePlugin` — a manifest + an ordered `{ block, content }` list,
  with an optional full-custom `components` override.
- `gameManifestSchema` / `GameManifest`, results types (`StandardResults`,
  `LeaderboardEntry`, `Distribution`, `StatItem`), and `z` (re-exported Zod).

The sdk imports `@doot-games/engine` and `@doot-games/themes` (types only). It never
imports the app shell.
