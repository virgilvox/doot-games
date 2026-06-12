/**
 * Map registry. Add a course by importing its file and listing it in `MAPS` -
 * nothing else changes. A Grand Prix cup draws 4 of these; the lobby lists them
 * all. `bakeMap` is the one-call bridge from map data to a runnable `BakedTrack`.
 */
import { bakeTrack } from '../sim/track'
import type { BakedTrack } from '../sim/types'
import { ember } from './ember'
import { kiln } from './kiln'
import { neon } from './neon'
import { prism } from './prism'
import { sprue } from './sprue'
import type { MapDef } from './types'

export type { MapDef, MapTheme, SkyDef } from './types'

export const MAPS: ReadonlyArray<MapDef> = [kiln, sprue, prism, neon, ember]

const BY_ID: Record<string, MapDef> = Object.fromEntries(MAPS.map((m) => [m.id, m]))

export function getMap(id: string): MapDef {
  return BY_ID[id] ?? MAPS[0]!
}

/** Bake a map's geometry into a runnable track. Deterministic given `seed`. */
export function bakeMap(id: string, seed: string): BakedTrack {
  return bakeTrack(getMap(id).track, `${id}:${seed}`)
}
