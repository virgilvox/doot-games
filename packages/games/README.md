# @doot-games/games

First-party blocks, games, the generic renderer, and the registry.

**Public surface**
- Blocks (19): the standalone kinds `guessBlock`, `rateBlock`, `pollBlock`,
  `rankBlock`, `drawBlock`, `hivemindBlock`, `mostLikelyBlock`, `ballparkBlock`,
  `buzzerBlock`; the two-phase **make** kinds `quipBlock`, `fillBlock`, `fakerBlock`
  (plus the custom-flow `barsBlock`, `spotlightBlock`); and the two-phase **judge**
  kinds `voteBlock`, `splitBlock`, `fibBlock`, `drawVoteBlock`, `accuseBlock` (each
  derives its content from the round above it). Plus pure scoring knobs
  (`blocks/scoring.ts`: `voteSharePoints`, `roundMultiplier`, `sweepBonus`,
  `pityPoints`, `closenessToHalf`, `splitPoints`, `speedDecay`).
- Games (21): the single-block `guess`, `rate`, `poll`, `rank`, `draw`; `voteBox`
  (`[guess, rate]`); `custom` (composes every block); and 14 flagship "Games From
  Doot", `quipClash`, `madLibs`, `splitRoom`, `fibFinder`, `sketchSpot`,
  `circuitCypher`, `whatYouDidntKnow`, `backronym`, `openMic`, `hivemind`,
  `mostLikely`, `ballpark`, `faker`, `truthOrShare` (ready-to-play, content pools).
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
