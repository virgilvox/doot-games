# @doot-games/games

First-party blocks, games, the generic renderer, and the registry.

**Public surface**
- Blocks: the standalone kinds `guessBlock`, `answerBlock`, `wagerBlock`, `rateBlock`,
  `pollBlock`, `rankBlock`, `drawBlock`, `hivemindBlock`, `mostLikelyBlock`,
  `ballparkBlock`, `buzzerBlock`, `categoriesBlock`, `surveyBlock`, `spectrumBlock`;
  the no-input display kinds `slideBlock`, `titleBlock`; the two-phase **make** kinds
  `quipBlock`, `fillBlock`, `fakerBlock` (plus the custom-flow `barsBlock`,
  `spotlightBlock`, `cellarBlock`); the two-phase **judge** kinds `voteBlock`,
  `splitBlock`, `fibBlock`, `drawVoteBlock`, `accuseBlock` (each derives its content
  from the round above it); and the per-player **chain/role** kinds `chainlineBlock`
  (Story Chain), `doodleBlock` (Doodle Chain), `wavelengthBlock` (Wavelength) - built
  on the P7 per-player-content foundation (`assignContent` reading prior rounds via
  `AssignContext.sources`). The custom-game-only `collect`/`photovote` blocks are not
  re-exported. Plus pure scoring knobs (`blocks/scoring.ts`: `voteSharePoints`,
  `roundMultiplier`, `sweepBonus`, `pityPoints`, `closenessToHalf`, `splitPoints`,
  `speedDecay`) and the capped-crowd helper (`runtime/crowd.ts`, P4B).
- Games (~33 + `custom`): the single-block `guess`, `rate`, `poll`, `rank`, `draw`,
  `buzzer`; `voteBox` (`[guess, rate]`); `custom` (composes every block); and the
  flagship "Games From Doot" (ready-to-play content pools / custom flows): `quipClash`,
  `madLibs`, `splitRoom`, `fibFinder`, `sketchSpot`, `circuitCypher`, `whatYouDidntKnow`,
  `backronym`, `openMic`, `hivemind`, `mostLikely`, `ballpark`, `faker`, `truthOrShare`,
  `quizOrDie`, `typeTheAnswer`, `wouldYouRather`, `tierList`, `overUnder`, `categories`,
  `survey`, `spectrum`, `wager`, `storyChain`, `doodleChain`, `wavelength`. The
  authoritative list is `gameCatalog` (`@doot-games/games/catalog`).
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
