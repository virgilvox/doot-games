/**
 * Map definition contract. A map is pure DATA: the geometry the sim bakes
 * (`track`) plus the visual theme the renderer reads (`theme`, `backdrop`).
 *
 * Adding a new course is just adding one file under `maps/` and listing it in
 * `maps/index.ts` - no engine or sim changes. Collidable decoration (cacti, rocks,
 * posts) is declared on `track.scatter`, so the prop you SEE is the one you HIT;
 * `backdrop` is the renderer-only distant scenery (mesas, foundry stacks, crystals).
 */
import type { TrackDef } from '../sim/track'

/** A sky as gradient stops, or the procedural starfield. */
export type SkyDef = 'stars' | { stops: ReadonlyArray<readonly [number, string]> }

export interface MapTheme {
  sky: SkyDef
  fog: { color: number; near: number; far: number } | null
  /** Hemisphere light: [skyColor, groundColor, intensity]. */
  hemi: readonly [number, number, number]
  /** Sun: [color, intensity, [x, y, z]]. */
  sun: readonly [number, number, readonly [number, number, number]]
  /** Which road surface texture to bake. */
  road: 'kiln' | 'sprue' | 'prism' | 'neon' | 'ember'
  /** Lit (Lambert) vs unlit (Basic) road material. */
  roadLit: boolean
  /** Audio ambient id (engine/audio.ts). */
  ambient: string
  /** CSS gradient string for the lobby course chip. */
  swatch: string
}

export interface MapDef {
  id: string
  name: string
  blurb: string
  track: TrackDef
  theme: MapTheme
  /** Renderer-only backdrop scene id. */
  backdrop: 'kiln' | 'sprue' | 'prism' | 'neon' | 'ember'
}
