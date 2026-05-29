/**
 * The drawing data format shared by the Pixi `DrawCanvas` (authoring) and the
 * SVG `DrawThumb` (display). Coordinates are normalized to 0..1 in both axes and
 * brush `size` is a fraction of width, so a stroke renders identically at any
 * pixel size and travels small over the relay. Pure types/helpers — no Pixi.
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

/** Build an SVG path `d` for one stroke (points already normalized to 0..1). */
export function strokePath(stroke: DrawStroke): string {
  const p = stroke.points
  if (p.length < 2) return ''
  let d = `M ${p[0]} ${p[1]}`
  for (let i = 2; i < p.length; i += 2) d += ` L ${p[i]} ${p[i + 1]}`
  return d
}
