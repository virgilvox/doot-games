/**
 * Resolve a (character, cart) pair into the effective stats + colours the sim and
 * renderer need, and the stat bars the selection screen shows. Pure.
 */
import { type CartDef, getCart } from './carts'
import { type CharacterDef, getCharacter } from './characters'
import { blendStats, clamp } from './logic'
import type { KartStats } from './sim/types'

export interface ResolvedKart {
  stats: KartStats
  paint: number
  accent: number
  /** engine/drivers.ts model id. */
  model: string
  /** engine/kart.ts body id. */
  body: string
  character: CharacterDef
  cart: CartDef
}

export function resolveKart(charId: string, cartId: string): ResolvedKart {
  const character = getCharacter(charId)
  const cart = getCart(cartId)
  return {
    stats: blendStats(character.bias, cart.bias),
    paint: character.paint,
    accent: cart.accent,
    model: character.model,
    body: cart.body,
    character,
    cart,
  }
}

/** Five headline stat bars (0..1) for the selection screen. */
export function statBars(stats: KartStats): Array<{ label: string; value: number }> {
  const norm = (v: number): number => clamp((v - 0.78) / 0.5, 0, 1)
  return [
    { label: 'SPEED', value: norm(stats.topSpeed) },
    { label: 'ACCEL', value: norm(stats.accel) },
    { label: 'GRIP', value: norm(stats.handling) },
    { label: 'TURBO', value: norm(stats.miniTurbo) },
    { label: 'WEIGHT', value: norm(stats.weight) },
  ]
}
