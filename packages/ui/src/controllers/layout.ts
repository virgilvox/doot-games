/**
 * The controller-layout schema: a console/target-agnostic description of a pad.
 * This is the generic, reusable version of an emulator's per-console table, but
 * it carries LOGICAL ids only (`'a'`, `'start'`, `'cUp'`, ...), never a concrete
 * target like an EmulatorJS input index or a keyboard key. The consumer maps a
 * logical id to its target, so the same layout drives a touch pad, a remapped
 * gamepad, the editor's custom-controller builder, or a future use we have not
 * thought of, with no change here.
 */
import type { LogicalButtonId } from './logical-input'

/** A theme accent token a button is tinted with (or none for the neutral surface). */
export type ClusterHue = 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'primary' | 'none'

/** How a face cluster arranges its buttons. */
export type ClusterLayout = 'row' | 'diamond' | 'six' | 'abdiag' | 'cbuttons'

/** A single button in a layout, identified only by its logical id. */
export interface LayoutButton {
  id: LogicalButtonId
  /** Display glyph/text, e.g. `'A'`, `'B'`, `'Start'`, an arrow. */
  label: string
  hue?: ClusterHue
  /** Compass placement for `diamond` / `cbuttons` clusters. */
  pos?: 'n' | 's' | 'e' | 'w'
}

/** A group of controls on the pad. */
export interface LayoutCluster {
  kind: 'dpad' | 'face' | 'system' | 'shoulders'
  /** Arrangement for `face` clusters; ignored by the others. */
  layout?: ClusterLayout
  /** For `dpad`: the four directional ids; for others: the cluster's buttons. */
  buttons: LayoutButton[]
}

/** A complete, target-agnostic controller layout. */
export interface ControllerLayout {
  id: string
  label: string
  maxPlayers: number
  hasStick: boolean
  hasStickRight: boolean
  /** dpad / face / system / shoulders clusters, in author order. */
  clusters: LayoutCluster[]
}

/**
 * Identity helper for authoring a layout (mirrors the `define*` ergonomics used
 * elsewhere in Doot). Pure: returns its frozen input so a layout can be treated
 * as immutable data. A validation hook can grow here later without callers
 * changing.
 */
export function defineLayout(layout: ControllerLayout): ControllerLayout {
  return Object.freeze(layout)
}

const registry = new Map<string, ControllerLayout>()

/** Register a layout so a host can look it up by id and enumerate the set. */
export function registerLayout(layout: ControllerLayout): ControllerLayout {
  registry.set(layout.id, layout)
  return layout
}

/** Resolve a registered layout by id. */
export function getLayout(id: string): ControllerLayout | undefined {
  return registry.get(id)
}

/** Every registered layout, in registration order. */
export function listLayouts(): ControllerLayout[] {
  return [...registry.values()]
}

/**
 * Maps the classic console button color-names (as the prototypes used them) to
 * theme accent tokens, so a layout stays theme-agnostic: it says "red" and the
 * active theme decides the actual hue.
 */
export const HUE_BY_NAME: Record<
  'red' | 'blue' | 'green' | 'yellow' | 'pink' | 'purple' | 'dark',
  ClusterHue
> = {
  red: 'primary',
  blue: 'c4',
  green: 'c5',
  yellow: 'c1',
  pink: 'c3',
  purple: 'c2',
  dark: 'none',
}
