/**
 * @doot-games/sdk — the game authoring contract.
 *
 * The easy path: compose **blocks** (round kinds) into a game (`block.ts`).
 * The powerful path: override the rendered components for a fully custom game.
 * Either way you write a manifest, content schemas, and small views; the engine
 * handles all the real-time machinery.
 */
export { z } from 'zod'
export * from './manifest'
export * from './rounds'
export * from './results'
export * from './plugin'
export * from './block'
