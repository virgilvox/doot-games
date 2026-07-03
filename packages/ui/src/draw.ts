/**
 * The drawing data format shared by the Pixi `DrawCanvas` (authoring) and the
 * SVG `DrawThumb` (display). Coordinates are normalized to 0..1 in both axes and
 * brush `size` is a fraction of width, so a stroke renders identically at any
 * pixel size and travels small over the relay. Pure types/helpers, no Pixi.
 */
export interface DrawStroke {
  /** CSS color string. */
  color: string
  /** Brush width as a fraction of canvas width (e.g. 0.012). */
  size: number
  /** Flattened, normalized points: [x0, y0, x1, y1, …], each 0..1. */
  points: number[]
}

export interface DrawValue {
  strokes: DrawStroke[]
}

/** An empty drawing. */
export function emptyDrawing(): DrawValue {
  return { strokes: [] }
}

/**
 * Build an SVG path `d` for one stroke. Points are normalized 0..1 in BOTH axes,
 * but the display viewBox is `1 x aspect` (the canvas shape), so the y coordinate
 * must be scaled by `yScale` (= aspect) to land inside the box. Without it, anything
 * the player drew below y=aspect (the lower part of a landscape canvas) falls outside
 * the viewBox and is cropped. The scale is uniform with x at render time, so stroke
 * width and round caps are not distorted.
 */
export function strokePath(stroke: DrawStroke, yScale = 1): string {
  const p = stroke.points
  if (p.length < 2) return ''
  let d = `M ${p[0]} ${p[1]! * yScale}`
  for (let i = 2; i < p.length; i += 2) d += ` L ${p[i]} ${p[i + 1]! * yScale}`
  return d
}
