# @doot-games/games

First-party blocks, games, the generic renderer, and the registry.

**Public surface**
- Blocks: `guessBlock`, `rateBlock`, `pollBlock`, `rankBlock`, `drawBlock`,
  `quipBlock`, `voteBlock`, `fillBlock`, `splitBlock`, plus pure scoring knobs
  (`blocks/scoring.ts`: `voteSharePoints`, `roundMultiplier`, `sweepBonus`,
  `pityPoints`, `closenessToHalf`, `splitPoints`, `speedDecay`).
- Games (10): `guess`, `rate`, `poll`, `rank`, `draw`, `voteBox`, `custom`, and the
  three flagships `quipClash`, `madLibs`, `splitRoom` (ready-to-play, content pools).
- Registry: `builtinPlugins`, `getPlugin`, `listPlugins`.
- Renderer: `GameHost`, `GamePlayer`, `GameResults` (generic) + `derive.ts`
  (`gameRounds`, `redactGameConfig`, `gameAnswerKeys`, `scoreGame`, `getBlock`,
  `distributionToBars`, and the two-phase factories `buildDeriveContent`,
  `buildRevealSummary`, `seededShuffle`).
- `parseMarkdownGame` - build a `GameComposition` from a markdown spec
  (see `docs/markdown-games.md`).
- `@doot-games/games/catalog` - a **server-safe** subpath (plain data, no `.vue`)
  with the game catalog, `isKnownPlugin`, and `REDACTION_RULES` for API-side
  answer withholding.

No game imports another. A new game composes blocks; a new round kind is one block.
