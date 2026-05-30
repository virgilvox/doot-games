# @doot-games/games

First-party blocks, games, the generic renderer, and the registry.

**Public surface**
- Blocks: `guessBlock`, `rateBlock`, `pollBlock`, `rankBlock`, `drawBlock`.
- Games: `guess`, `rate`, `poll`, `rank`, `draw`, `voteBox`, `custom` (all blocks).
- Registry: `builtinPlugins`, `getPlugin`, `listPlugins`.
- Renderer: `GameHost`, `GamePlayer`, `GameResults` (generic) + `derive.ts`
  (`gameRounds`, `redactGameConfig`, `gameAnswerKeys`, `scoreGame`, `getBlock`,
  `distributionToBars`).
- `parseMarkdownGame` — build a `GameComposition` from a markdown spec
  (see `docs/markdown-games.md`).
- `@doot-games/games/catalog` — a **server-safe** subpath (plain data, no `.vue`)
  with the game catalog, `isKnownPlugin`, and `REDACTION_RULES` for API-side
  answer withholding.

No game imports another. A new game composes blocks; a new round kind is one block.
