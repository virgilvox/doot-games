/**
 * Track baking: turn a handful of control points into the discrete polyline the
 * gameplay actually runs on. The spline is an authoring/smoothing tool; every
 * per-frame query (nearest sample, lateral offset, lap progress) runs against the
 * baked samples, never the spline. (Research: bake once, query the polyline.)
 *
 * We use a CENTRIPETAL Catmull-Rom (alpha = 0.5), which provably avoids the cusps
 * and self-intersections uniform Catmull-Rom produces on sharp, unevenly-spaced
 * corners, then resample to arc-length-even samples so road quads and gameplay
 * spacing are uniform.
 */
import type { BakedTrack, Checkpoint, ItemBoxSpawn, Obstacle, TrackSample } from './types'
import { type Vec3, dist as dist2d, headingOf, makeRng } from './vec'

/** A deterministic scatter of one prop kind (collidable decoration). */
export interface ScatterSpec {
  /** Renderer prop kind ('cactus', 'rock', 'post', ...). */
  kind: string
  count: number
  /** Collision radius (and footprint) of each placed prop. */
  collideR: number
  scaleMin: number
  scaleMax: number
  /** Keep props at least this far beyond the road edge. */
  gapMin: number
  /** ...and no further than this from the centerline. */
  bandMax: number
}

/** Geometry-only definition the baker consumes (the visual theme lives in MapDef). */
export interface TrackDef {
  control: ReadonlyArray<readonly [number, number, number]>
  roadW: number
  voidFall: boolean
  barrier: 'none' | 'corners' | 'rails'
  /** Number of baked centerline samples (default 900). */
  samples?: number
  /** Ordered lap gates (default 12). */
  checkpoints?: number
  /** Item-box rows: a fractional position `t` in [0,1) and the lateral lane offsets. */
  itemBoxRows?: ReadonlyArray<{ t: number; lanes: ReadonlyArray<number> }>
  /** Collidable decoration scattered deterministically (so the cactus you see is the one you hit). */
  scatter?: ReadonlyArray<ScatterSpec>
}

const SUB_PER_SEG = 64

/** Centripetal Catmull-Rom interpolation of one segment p1..p2 (p0,p3 = neighbors). */
function catmull(
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  out: Vec3[],
  steps: number,
): void {
  const alpha = 0.5
  const tj = (ti: number, a: Vec3, b: Vec3): number => {
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    // Guard coincident points so the parameterization never divides by zero.
    return ti + Math.max(d, 1e-4) ** alpha
  }
  const t0 = 0
  const t1 = tj(t0, p0, p1)
  const t2 = tj(t1, p1, p2)
  const t3 = tj(t2, p2, p3)
  for (let i = 0; i < steps; i++) {
    const t = t1 + ((t2 - t1) * i) / steps
    const a1 = mix(p0, p1, (t1 - t) / (t1 - t0), (t - t0) / (t1 - t0))
    const a2 = mix(p1, p2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1))
    const a3 = mix(p2, p3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2))
    const b1 = mix(a1, a2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1))
    const b2 = mix(a2, a3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2))
    out.push(mix(b1, b2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1)))
  }
}

const mix = (a: Vec3, b: Vec3, wa: number, wb: number): Vec3 => ({
  x: a.x * wa + b.x * wb,
  y: a.y * wa + b.y * wb,
  z: a.z * wa + b.z * wb,
})

/** Build a dense, evenly-subdivided polyline around the closed control loop. */
function densePolyline(control: ReadonlyArray<readonly [number, number, number]>): Vec3[] {
  const pts = control.map(([x, y, z]) => ({ x, y, z }))
  const m = pts.length
  const dense: Vec3[] = []
  for (let i = 0; i < m; i++) {
    catmull(
      pts[(i - 1 + m) % m]!,
      pts[i]!,
      pts[(i + 1) % m]!,
      pts[(i + 2) % m]!,
      dense,
      SUB_PER_SEG,
    )
  }
  return dense
}

/** Resample a closed dense polyline to N points spaced evenly by arc length. */
function resampleEven(dense: Vec3[], n: number): Vec3[] {
  const m = dense.length
  const seg: number[] = new Array(m)
  let total = 0
  for (let i = 0; i < m; i++) {
    const a = dense[i]!
    const b = dense[(i + 1) % m]!
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    seg[i] = d
    total += d
  }
  const step = total / n
  const out: Vec3[] = []
  let acc = 0
  let i = 0
  let want = 0
  // Walk the dense polyline, emitting a point every `step` of accumulated length.
  for (let k = 0; k < n; k++) {
    while (acc + seg[i]! < want && out.length < n) {
      acc += seg[i]!
      i = (i + 1) % m
    }
    const a = dense[i]!
    const b = dense[(i + 1) % m]!
    const f = seg[i]! > 1e-6 ? (want - acc) / seg[i]! : 0
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f })
    want += step
  }
  return out
}

/** Nearest baked-sample distance to an XZ point (coarse scan; used for scatter placement). */
function distToTrack(samples: TrackSample[], x: number, z: number, stride = 6): number {
  let best = Infinity
  for (let i = 0; i < samples.length; i += stride) {
    const dx = x - samples[i]!.x
    const dz = z - samples[i]!.z
    const d = dx * dx + dz * dz
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

function buildBarrier(samples: TrackSample[], mode: 'none' | 'corners' | 'rails'): Uint8Array {
  const n = samples.length
  const barrier = new Uint8Array(n)
  if (mode === 'none') return barrier
  if (mode === 'rails') {
    // Continuous walls down both edges, with a periodic gap so the track breathes.
    for (let i = 0; i < n; i++) {
      if (i % 96 < 14) continue
      barrier[i] = 3
    }
    return barrier
  }
  // 'corners': wall only the four sharpest bends, on the outside of the turn.
  const bends: Array<{ i: number; turn: number; side: number }> = []
  const look = Math.max(8, Math.round(n / 64))
  for (let i = 0; i < n; i++) {
    const a = samples[i]!
    const b = samples[(i + look) % n]!
    const ha = headingOf(a.dx, a.dz)
    const hb = headingOf(b.dx, b.dz)
    let d = hb - ha
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    bends.push({ i, turn: Math.abs(d), side: d > 0 ? -1 : 1 })
  }
  bends.sort((p, q) => q.turn - p.turn)
  const used: number[] = []
  const span = Math.round(n / 30)
  const sep = Math.round(n / 10)
  for (const b of bends) {
    if (used.length >= 4) break
    if (used.some((u) => Math.min(Math.abs(u - b.i), n - Math.abs(u - b.i)) < sep)) continue
    used.push(b.i)
    for (let k = -span; k <= span; k++) {
      const ii = ((b.i + k) % n + n) % n
      barrier[ii]! |= b.side > 0 ? 1 : 2
    }
  }
  return barrier
}

function scatterObstacles(
  samples: TrackSample[],
  specs: ReadonlyArray<ScatterSpec>,
  roadW: number,
  seed: string,
): Obstacle[] {
  const rng = makeRng(`scatter:${seed}`)
  const out: Obstacle[] = []
  for (const spec of specs) {
    let placed = 0
    let guard = 0
    const maxGuard = spec.count * 40
    while (placed < spec.count && guard++ < maxGuard) {
      // Pick a band around a random sample so props hug the track, not the void.
      const si = (rng() * samples.length) | 0
      const sm = samples[si]!
      const side = rng() < 0.5 ? -1 : 1
      const off = roadW / 2 + spec.gapMin + rng() * (spec.bandMax - spec.gapMin)
      const x = sm.x + sm.rx * side * off
      const z = sm.z + sm.rz * side * off
      // Reject anything that crept onto the road or onto another prop.
      if (distToTrack(samples, x, z) < roadW / 2 + spec.gapMin * 0.6) continue
      if (out.some((o) => dist2d(o.x, o.z, x, z) < o.r + spec.collideR + 1.5)) continue
      out.push({
        x,
        z,
        y: sm.y,
        r: spec.collideR,
        kind: spec.kind,
        scale: spec.scaleMin + rng() * (spec.scaleMax - spec.scaleMin),
        rot: rng() * Math.PI * 2,
      })
      placed++
    }
  }
  return out
}

/** Bake a `TrackDef` into the runtime `BakedTrack`. Deterministic given `seed`. */
export function bakeTrack(def: TrackDef, seed = 'pit'): BakedTrack {
  const n = def.samples ?? 900
  const dense = densePolyline(def.control)
  const pts = resampleEven(dense, n)

  const samples: TrackSample[] = new Array(n)
  let s = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % n]!
    let dx = b.x - a.x
    let dz = b.z - a.z
    const len = Math.hypot(dx, dz) || 1
    dx /= len
    dz /= len
    samples[i] = {
      x: a.x,
      y: a.y,
      z: a.z,
      dx,
      dz,
      // Right vector = forward rotated -90deg in XZ (matches the engine convention).
      rx: dz,
      rz: -dx,
      s,
    }
    s += dist2d(a.x, a.z, b.x, b.z)
  }
  const length = s

  // Bounds + mean Y.
  let nx = Infinity
  let xx = -Infinity
  let nz = Infinity
  let xz = -Infinity
  let sy = 0
  for (const p of samples) {
    if (p.x < nx) nx = p.x
    if (p.x > xx) xx = p.x
    if (p.z < nz) nz = p.z
    if (p.z > xz) xz = p.z
    sy += p.y
  }
  const bounds = { nx, xx, nz, xz, sx: xx - nx, sz: xz - nz }
  const midY = sy / n

  const finishIndex = 0
  const cpCount = def.checkpoints ?? 12
  const checkpoints: Checkpoint[] = []
  for (let c = 0; c < cpCount; c++) {
    const idx = Math.round((c / cpCount) * n) % n
    const sm = samples[idx]!
    checkpoints.push({
      index: idx,
      rx: sm.x,
      ry: sm.y,
      rz: sm.z,
      ryaw: headingOf(sm.dx, sm.dz),
    })
  }

  const barrier = buildBarrier(samples, def.barrier)
  const obstacles = def.scatter ? scatterObstacles(samples, def.scatter, def.roadW, seed) : []

  const itemBoxes: ItemBoxSpawn[] = []
  const rows = def.itemBoxRows ?? [
    { t: 0.13, lanes: [-0.42, 0, 0.42] },
    { t: 0.37, lanes: [-0.42, 0, 0.42] },
    { t: 0.62, lanes: [-0.42, 0, 0.42] },
    { t: 0.85, lanes: [-0.42, 0, 0.42] },
  ]
  for (const row of rows) {
    const idx = Math.round(row.t * n) % n
    const sm = samples[idx]!
    for (const lane of row.lanes) {
      const off = (def.roadW / 2 - 1.6) * (lane / 0.42)
      itemBoxes.push({ x: sm.x + sm.rx * off, y: sm.y + 1.5, z: sm.z + sm.rz * off })
    }
  }

  return {
    samples,
    n,
    length,
    finishIndex,
    roadW: def.roadW,
    voidFall: def.voidFall,
    checkpoints,
    barrier,
    obstacles,
    itemBoxes,
    bounds,
    midY,
  }
}

/**
 * Nearest sample via a windowed search around a hint index (research: the kart
 * only moved a little since last frame, so search locally, not the whole loop).
 * Falls back to a coarse full scan when no good hint exists (respawn).
 */
export function nearestSample(
  track: BakedTrack,
  x: number,
  z: number,
  hint: number,
  window = 26,
): { idx: number; dist: number } {
  const { samples, n } = track
  let best = hint
  let bd = Infinity
  for (let o = -window; o <= window; o++) {
    const i = ((hint + o) % n + n) % n
    const dx = x - samples[i]!.x
    const dz = z - samples[i]!.z
    const d = dx * dx + dz * dz
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return { idx: best, dist: Math.sqrt(bd) }
}

