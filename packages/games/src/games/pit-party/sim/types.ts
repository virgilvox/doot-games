/**
 * Shared types for the Pit Party simulation. Pure data; no Three.js, no Vue.
 */

/** The five item kinds. Each item box hands one out, weighted by race position. */
export type ItemKind = 'boost' | 'wrench' | 'slick' | 'volt' | 'triple'

/**
 * Combined, normalized driving stats. Each is a multiplier applied to the base
 * physics constant (1.0 = baseline). A kart's effective stats are the blend of
 * its character bias and its cart bias (see carts/characters data).
 */
export interface KartStats {
  /** Top speed multiplier. */
  topSpeed: number
  /** Acceleration multiplier. */
  accel: number
  /** Turn-rate multiplier (cornering). */
  handling: number
  /** Off-road grip + grip recovery (1 = normal; higher = less off-road penalty). */
  traction: number
  /** Mass: resists shoves + knockback, but slightly slower to spin up. */
  weight: number
  /** Drift charge rate + mini-turbo boost length multiplier. */
  miniTurbo: number
}

/** One baked centerline sample: position, unit tangent + right (XZ), arc length. */
export interface TrackSample {
  x: number
  y: number
  z: number
  /** Unit forward tangent in XZ. */
  dx: number
  dz: number
  /** Unit right vector in XZ (90deg clockwise of forward). */
  rx: number
  rz: number
  /** Cumulative arc length from the finish line. */
  s: number
}

/** An ordered lap gate with its authored respawn pose (research: respawn tied to last gate). */
export interface Checkpoint {
  /** Sample index where the gate sits. */
  index: number
  /** Respawn pose: drop here facing down-track after a fall / out-of-bounds. */
  rx: number
  ry: number
  rz: number
  ryaw: number
}

/** A solid collidable cylinder (cactus, rock, post). Karts are pushed out + slowed. */
export interface Obstacle {
  x: number
  z: number
  /** Ground height at the prop. */
  y: number
  /** Collision radius (footprint). */
  r: number
  /** Renderer prop kind ('cactus', 'rock', 'cone', 'barrel', ...). */
  kind: string
  /** Visual scale. */
  scale: number
  /** Y rotation (radians). */
  rot: number
}

/** A spawn position for an item box. */
export interface ItemBoxSpawn {
  x: number
  y: number
  z: number
}

/** Axis-aligned XZ bounds of the track, for the minimap. */
export interface TrackBounds {
  nx: number
  xx: number
  nz: number
  xz: number
  sx: number
  sz: number
}

/** Everything the sim needs to run a course, baked once at load. */
export interface BakedTrack {
  samples: TrackSample[]
  /** Sample count. */
  n: number
  /** Total loop arc length. */
  length: number
  /** Sample index of the finish line (== checkpoint 0). */
  finishIndex: number
  roadW: number
  /** Falling off the edge respawns you (no outer barrier). */
  voidFall: boolean
  checkpoints: Checkpoint[]
  /** Per-sample wall bits: 1 = wall on the right, 2 = wall on the left. */
  barrier: Uint8Array
  obstacles: Obstacle[]
  itemBoxes: ItemBoxSpawn[]
  bounds: TrackBounds
  /** Mean centerline Y, for the cinematic camera. */
  midY: number
}

/** Per-kart control input (from a phone, gamepad, keyboard, or AI). */
export interface KartInput {
  /** -1 (full left) .. +1 (full right). */
  steer: number
  /** Throttle 0/1. */
  gas: number
  /** Brake / reverse 0/1. */
  brake: number
  /** Hold-to-drift 0/1. */
  drift: number
  /** One-shot: fire the held item. Cleared by the sim once consumed. */
  itemQueued: boolean
}

export function emptyInput(): KartInput {
  return { steer: 0, gas: 0, brake: 0, drift: 0, itemQueued: false }
}

/** Lightweight AI brain state (pure-pursuit + rubber-band). */
export interface AiState {
  /** Lateral lane offset the AI currently aims for. */
  lane: number
  /** Seconds until the AI re-chooses a lane. */
  laneT: number
  /** Cornering competence 0.7..1.05. */
  skill: number
  /** Seconds until the AI considers using its item. */
  itemT: number
  /** Rubber-band target finishing place (patent model). */
  targetPlace: number
  /** Cached rubber-band top-speed multiplier (recomputed each tick). */
  topMul: number
}

/** A racing kart: pose, progress, drift/boost, status effects, item, results. */
export interface Kart {
  id: string
  charId: string
  cartId: string
  name: string
  human: boolean
  stats: KartStats
  paint: number

  // pose (XZ plane, Y from track)
  x: number
  y: number
  z: number
  heading: number
  speed: number

  // progress + ranking
  idx: number
  lap: number
  /** Next expected checkpoint (ordered-gate lap counting). */
  nextCp: number
  /** Monotonic progress = lap*length + s along track. Drives ranking. */
  progress: number
  rank: number
  offroad: boolean
  /** Seconds spent driving the wrong way (for the WRONG WAY banner). */
  wrongT: number

  // drift + boost
  drifting: boolean
  driftDir: number
  driftCharge: number
  driftTier: number
  boostT: number

  // status effects
  spinT: number
  spinDir: number
  shockT: number
  invulnT: number
  slickCd: number
  wallCd: number
  bumpCd: number

  // fall / respawn
  falling: boolean
  fallT: number
  fallVy: number
  /** Last checkpoint legally passed (respawn anchor). */
  lastCp: number

  // item
  item: ItemKind | null
  /** Extra boosts queued by a Triple item. */
  itemCharges: number

  // finish
  finished: boolean
  place: number
  finishTime: number
  lastLapAt: number

  // visual smoothing (written by sim, read by renderer)
  steerVis: number
  wheelSpin: number

  // event counters (rising-edge signals for SFX / controller haptics)
  evHit: number
  evPick: number
  evBoost: number

  ai: AiState | null
  input: KartInput
}

/** A discrete one-frame event the renderer/audio layer can react to. */
export type RaceEventKind =
  | 'pick'
  | 'boost'
  | 'hit'
  | 'bump'
  | 'wall'
  | 'fall'
  | 'respawn'
  | 'throw'
  | 'zap'
  | 'lap'
  | 'finalLap'
  | 'finish'

export interface RaceEvent {
  kind: RaceEventKind
  /** The kart this happened to / for. */
  kartId: string
  /** World position, when relevant (sparks, throws). */
  x?: number
  y?: number
  z?: number
  /** Finishing place, for 'finish'. */
  place?: number
}
