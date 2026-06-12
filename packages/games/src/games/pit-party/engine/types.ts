/**
 * Shared engine types. The renderer lazy-imports `three` at mount (client-only),
 * so we type the runtime module as `Three` and thread it through the builders. Type
 * imports are erased, so nothing here pulls Three into the SSR/module-eval path.
 */
import type { Group, Mesh, Object3D } from 'three'

/** The runtime `three` module, as returned by `await import('three')`. */
export type Three = typeof import('three')

/** The mutable visual rig for one kart, updated each frame from sim state. */
export interface KartVisual {
  root: Group
  rig: Group
  wheels: Object3D[]
  fronts: Object3D[]
  driver: Group
  flame: Mesh
  flameCore: Mesh
  bubble: Mesh
}
