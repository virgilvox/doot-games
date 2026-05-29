/**
 * @doot-games/games — first-party blocks, games, the generic renderer, and the
 * registry. Games are compositions of blocks; the renderer is shared.
 */
export * from './registry'
export * from './runtime'

// Blocks (the reusable round kinds)
export { guessBlock } from './blocks/guess/block'
export { rateBlock } from './blocks/rate/block'
export { pollBlock } from './blocks/poll/block'

// Games (block compositions)
export { guess } from './games/guess'
export { rate } from './games/rate'
export { poll } from './games/poll'
export { voteBox } from './games/votebox'
