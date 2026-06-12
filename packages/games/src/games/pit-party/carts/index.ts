/**
 * Cart roster. Each kart is pure data: identity, a renderer body style, an accent
 * colour, and a partial stat bias (the "vehicle" in the driver+vehicle model). The
 * spread is intentionally varied so the selection screen is a real choice: a heavy
 * top-speed cruiser vs a nimble drift scooter, etc. Add one by appending here +
 * adding a matching body in engine/kart.ts.
 */
import type { KartStats } from '../sim/types'

export interface CartDef {
  id: string
  name: string
  blurb: string
  /** engine/kart.ts body style. */
  body: string
  /** Trim accent (the character paint still dominates). */
  accent: number
  bias: Partial<KartStats>
}

export const CARTS: ReadonlyArray<CartDef> = [
  {
    id: 'standard',
    name: 'PIT STANDARD',
    blurb: 'balanced all-rounder',
    body: 'standard',
    accent: 0x14121a,
    bias: {},
  },
  {
    id: 'cruiser',
    name: 'SLAG CRUISER',
    blurb: 'heavy, high top end',
    body: 'cruiser',
    accent: 0x2c2733,
    bias: { topSpeed: 1.1, weight: 1.12, accel: 0.9, handling: 0.92 },
  },
  {
    id: 'scooter',
    name: 'SPARK SCOOTER',
    blurb: 'quick off the line',
    body: 'scooter',
    accent: 0xffd23f,
    bias: { accel: 1.12, handling: 1.08, miniTurbo: 1.06, topSpeed: 0.92, weight: 0.86 },
  },
  {
    id: 'drifter',
    name: 'KERF DRIFTER',
    blurb: 'born to powerslide',
    body: 'drifter',
    accent: 0xff5d8f,
    bias: { miniTurbo: 1.14, handling: 1.06, topSpeed: 0.98, traction: 0.95 },
  },
  {
    id: 'hauler',
    name: 'FOUNDRY HAULER',
    blurb: 'a wall on wheels',
    body: 'hauler',
    accent: 0x4ec3e0,
    bias: { weight: 1.16, topSpeed: 1.04, accel: 0.88, handling: 0.9 },
  },
  {
    id: 'dart',
    name: 'NEON DART',
    blurb: 'top-speed missile',
    body: 'dart',
    accent: 0x5fe08a,
    bias: { topSpeed: 1.12, accel: 0.96, handling: 0.96, weight: 0.94 },
  },
]

const BY_ID: Record<string, CartDef> = Object.fromEntries(CARTS.map((c) => [c.id, c]))

export function getCart(id: string): CartDef {
  return BY_ID[id] ?? CARTS[0]!
}

export const CART_IDS: ReadonlyArray<string> = CARTS.map((c) => c.id)
