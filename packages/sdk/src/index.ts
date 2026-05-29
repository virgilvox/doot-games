/**
 * @doot-games/sdk — the game plugin contract.
 *
 * A game author writes a manifest, a Zod config schema, a default config, a
 * function that turns config into rounds, a scoring function, and the view
 * components. The engine handles everything else.
 */
export { z } from 'zod'
export * from './manifest'
export * from './rounds'
export * from './results'
export * from './plugin'
