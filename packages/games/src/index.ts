/**
 * @doot-games/games, first-party blocks, games, the generic renderer, and the
 * registry. Games are compositions of blocks; the renderer is shared.
 */
export * from './registry'
export * from './runtime'
export { type ParsedGame, parseMarkdownGame } from './markdown'

// Blocks (the reusable round kinds)
export { guessBlock } from './blocks/guess/block'
export { rateBlock } from './blocks/rate/block'
export { pollBlock } from './blocks/poll/block'
export { rankBlock } from './blocks/rank/block'
export { drawBlock } from './blocks/draw/block'
export { quipBlock } from './blocks/quip/block'
export { voteBlock } from './blocks/vote/block'
export { fillBlock } from './blocks/fill/block'
export * from './blocks/scoring'

// Games (block compositions)
export { guess } from './games/guess'
export { rate } from './games/rate'
export { poll } from './games/poll'
export { rank } from './games/rank'
export { draw } from './games/draw'
export { voteBox } from './games/votebox'
export { quipClash } from './games/quipclash'
export { madLibs } from './games/madlibs'
export { custom } from './games/custom'
