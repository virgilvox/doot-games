/**
 * Tiny, dependency-free vector + scalar math for the Pit Party simulation.
 *
 * The sim is deliberately Three.js-free so it stays pure and unit-testable (and,
 * later, runnable headless for authoritative netcode). The renderer reads sim
 * state and mirrors it into Three meshes; the sim never imports Three.
 *
 * Convention (shared with the renderer + controller): the world is the XZ plane
 * with Y up. A heading angle `h` points "forward" along `(sin h, cos h)` in XZ,
 * matching `atan2(dir.x, dir.z)`. This is the convention the KERF prototype used.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v)

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Wrap an angle to (-PI, PI]. */
export const wrapAngle = (a: number): number => {
  let x = a
  while (x > Math.PI) x -= Math.PI * 2
  while (x < -Math.PI) x += Math.PI * 2
  return x
}

/** Squared planar distance between two XZ points (cheap; skips the sqrt). */
export const dist2 = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx
  const dz = az - bz
  return dx * dx + dz * dz
}

export const dist = (ax: number, az: number, bx: number, bz: number): number =>
  Math.sqrt(dist2(ax, az, bx, bz))

/** Heading (radians) of a forward direction, per the engine convention. */
export const headingOf = (dx: number, dz: number): number => Math.atan2(dx, dz)

/**
 * A small, seeded, deterministic PRNG (mulberry32) so anything random in the sim
 * (AI jitter, item rolls, grid order) is reconnect-stable when seeded by the room
 * code. Returns a function yielding floats in [0, 1).
 */
export function makeRng(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
