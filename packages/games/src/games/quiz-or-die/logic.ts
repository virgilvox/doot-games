/**
 * Pure, tested logic for QUIZ OR DIE, the Trivia-Murder-Party-style horror show.
 * The custom Host/Player drive the cinematic show over the relay; everything that
 * decides an OUTCOME (who is at risk, who dies in a minigame, how the finale race
 * moves, who escapes) lives here so it can be unit-tested away from the Vue layer.
 *
 * Two invariants this module guards:
 *  - `redactQuestionForPublish` strips the correct answer before a question is
 *    published, so a phone never learns the answer before the reveal.
 *  - Scoring is correct-only: a wrong OR missing answer earns nothing and (when
 *    alive) sends you to the Cellar.
 *
 * Randomness (which cup is poisoned, a wheel landing, a dice roll) is produced by
 * the seeded `makeRng` so it is deterministic and reconnect-stable; the survival
 * RULE for each outcome is a separate pure function, so the rule is tested without
 * the randomness.
 */

// ── Cast ─────────────────────────────────────────────────────────────────────

/** The burlap-doll shapes from the mockup, assigned round-robin to real players. */
export type DollShape = 'blob' | 'blobAngry' | 'octopus' | 'frog' | 'pillow' | 'shark'
export const DOLL_SHAPES: DollShape[] = ['blob', 'blobAngry', 'octopus', 'frog', 'pillow', 'shark']
/** Sin label + burlap colour per seat (cycled if more than six play). */
const SINS = ['Despair', 'Wrath', 'Gluttony', 'Envy', 'Sloth', 'Greed']
const COLORS = ['#d98aa0', '#b53a30', '#cf8a3c', '#5f8f4f', '#9a9a9a', '#3f5f8f']

export interface Contestant {
  id: string
  name: string
  shape: DollShape
  sin: string
  color: string
}

/**
 * Assign each real player a doll shape, sin, and colour by their position in the
 * frozen roster, so a given seat is stable across reconnects (the roster is frozen
 * at "Start the show"). Past the first six seats the cast cycles.
 */
export function assignCast(players: Array<{ id: string; name: string }>): Contestant[] {
  return players.map((p, i) => ({
    id: p.id,
    name: p.name,
    shape: DOLL_SHAPES[i % DOLL_SHAPES.length] as DollShape,
    sin: SINS[i % SINS.length] as string,
    color: COLORS[i % COLORS.length] as string,
  }))
}

// ── Seeded RNG ───────────────────────────────────────────────────────────────

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return h >>> 0
}

/** mulberry32: a tiny deterministic PRNG, so an outcome is reconnect-stable and
 *  reproducible in tests. Same as the engine's shuffle RNG. */
export function makeRng(seed: string): () => number {
  let a = hashSeed(seed)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randInt(rng: () => number, lo: number, hi: number): number {
  return Math.floor(rng() * (hi - lo + 1)) + lo
}

// ── Trivia ───────────────────────────────────────────────────────────────────

/** An authored question. `c` is the index of the correct answer in `a`. */
export interface Question {
  cat: string
  q: string
  a: string[]
  c: number
}
/** A question safe to publish to phones: the correct index is gone. */
export interface PublicQuestion {
  qIndex: number
  cat: string
  q: string
  a: string[]
}

/**
 * Strip the correct answer before a question goes on the relay. This is the
 * answer-withholding guard: phones receive options but never the key until the
 * host reveals it. Call this on EVERY question publish.
 */
export function redactQuestionForPublish(q: Question, qIndex: number): PublicQuestion {
  return { qIndex, cat: q.cat, q: q.q, a: q.a }
}

/** Correct-only scoring: only the right index counts; null/missing is wrong. */
export function scoreQuestion(choice: number | null | undefined, correct: number): boolean {
  return choice != null && choice === correct
}

/**
 * Among the living, who goes to the Cellar after a question: anyone who answered
 * wrong OR did not answer in time (a no-answer is a wrong answer, per the spec).
 */
export function atRiskAfterQuestion(
  alive: Iterable<string>,
  answers: Map<string, number | null>,
  correct: number,
): string[] {
  const out: string[] = []
  for (const pid of alive) {
    if (!scoreQuestion(answers.get(pid) ?? null, correct)) out.push(pid)
  }
  return out
}

// ── Cellar: Poison Chalice ───────────────────────────────────────────────────

/** How many of `cups` chalices are poisoned (about 45%, at least one, never all). */
export function poisonCount(cups: number): number {
  return Math.min(cups - 1, Math.max(1, Math.round(cups * 0.45)))
}

/** Lay out the chalice round: how many cups, and which are poisoned (seeded). */
export function chaliceSetup(atRiskCount: number, seed: string): { cups: number; poison: number[] } {
  const cups = Math.max(4, atRiskCount + 1)
  const rng = makeRng(`${seed}:chalice`)
  const poison = new Set<number>()
  const want = poisonCount(cups)
  let guard = 0
  while (poison.size < want && guard++ < 1000) poison.add(randInt(rng, 0, cups - 1))
  return { cups, poison: [...poison].sort((a, b) => a - b) }
}

/** Who drank poison: any at-risk player whose chosen cup is in the poison set. */
export function resolveChalice(picks: Map<string, number>, poison: number[]): string[] {
  const bad = new Set(poison)
  const dying: string[] = []
  for (const [pid, cup] of picks) if (bad.has(cup)) dying.push(pid)
  return dying
}

// ── Cellar: Reaper's Wheel ───────────────────────────────────────────────────

/** Two halves of five DIE + one LIVE, so the wheel is five-in-six against you. */
export const WHEEL_SECTORS: Array<'D' | 'L'> = ['D', 'D', 'D', 'D', 'D', 'L', 'D', 'D', 'D', 'D', 'D', 'L']

/** One spin: a landing sector index and whether it is death. Seeded per spinner. */
export function spinResult(seed: string): { index: number; death: boolean } {
  const rng = makeRng(`${seed}:wheel`)
  const index = randInt(rng, 0, WHEEL_SECTORS.length - 1)
  return { index, death: WHEEL_SECTORS[index] === 'D' }
}

// ── Cellar: Bone Dice ────────────────────────────────────────────────────────

/** The house rolls three dice and demands you beat (or undercut) the total. */
export function diceSetup(seed: string): { house: [number, number, number]; target: number; higher: boolean } {
  const rng = makeRng(`${seed}:dice:house`)
  const house: [number, number, number] = [randInt(rng, 1, 6), randInt(rng, 1, 6), randInt(rng, 1, 6)]
  return { house, target: house[0] + house[1] + house[2], higher: rng() < 0.5 }
}

/** A player's three-dice roll. Seeded by spinner so a reconnect shows the same. */
export function rollResult(seed: string): { roll: [number, number, number]; sum: number } {
  const rng = makeRng(`${seed}:dice:roll`)
  const roll: [number, number, number] = [randInt(rng, 1, 6), randInt(rng, 1, 6), randInt(rng, 1, 6)]
  return { roll, sum: roll[0] + roll[1] + roll[2] }
}

/** The survival rule: strictly beat the target when higher, undercut when lower. */
export function diceSurvives(sum: number, target: number, higher: boolean): boolean {
  return higher ? sum > target : sum < target
}

// ── Cellar: Blood Money ──────────────────────────────────────────────────────

export interface BloodMoneyResult {
  dying: string[]
  /** Per-survivor payout to add to their money (only the takers, when some left). */
  payouts: Map<string, number>
}

/**
 * Take-or-leave: if everyone walks away, all live. If everyone grabs, everyone
 * pays (all die). Otherwise the walkers die and the takers split the pot. A
 * missing choice counts as walking away (the timid, cautious default).
 */
export function resolveBloodMoney(takeMap: Map<string, boolean>, atRisk: string[]): BloodMoneyResult {
  const took = atRisk.filter((p) => takeMap.get(p) === true)
  const left = atRisk.filter((p) => takeMap.get(p) !== true)
  const payouts = new Map<string, number>()
  if (took.length === 0) return { dying: [], payouts }
  if (left.length === 0) return { dying: atRisk.slice(), payouts }
  const cut = Math.round(2000 / took.length)
  for (const p of took) payouts.set(p, cut)
  return { dying: left, payouts }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Apply a round of casualties to the alive/dead sets, returning NEW sets (so the
 * transition is easy to test and never mutates caller state). Already-dead pids
 * in `casualties` are a no-op (idempotent); a casualty leaves `alive` and joins
 * `dead` as a ghost.
 */
export function applyDeaths(
  alive: Iterable<string>,
  dead: Iterable<string>,
  casualties: Iterable<string>,
): { alive: Set<string>; dead: Set<string> } {
  const nextAlive = new Set(alive)
  const nextDead = new Set(dead)
  for (const pid of casualties) {
    if (nextAlive.delete(pid)) nextDead.add(pid)
  }
  return { alive: nextAlive, dead: nextDead }
}

// ── The Escape (finale) ──────────────────────────────────────────────────────

/**
 * A runner in the finale. `x` is progress toward the exit in [0,1]; `ghost` runs
 * behind hoping to steal a living body; `out` means consumed by the dark (or a
 * stolen-from victim who has no body left). `carrying` is set on a ghost that has
 * taken a living body (it is then alive).
 */
export interface Racer {
  pid: string
  name: string
  x: number
  alive: boolean
  ghost: boolean
  out: boolean
  carrying: string | null
}

export const FINALE_STEP = 0.16 // progress per correct finale answer (a few rounds to the exit)
export const FINALE_STEAL_RANGE = 0.04 // how close a ghost must be to steal a living body

export function makeRacers(
  contestants: Array<{ id: string; name: string }>,
  alive: Set<string>,
): Racer[] {
  return contestants.map((c) => ({
    pid: c.id,
    name: c.name,
    // The living start a touch ahead; ghosts start at the back of the lane.
    x: alive.has(c.id) ? 0.12 : 0,
    alive: alive.has(c.id),
    ghost: !alive.has(c.id),
    out: false,
    carrying: null,
  }))
}

/**
 * Advance the race after a finale round: every racer (living AND ghost) moves
 * forward by `stepPer` for each finale option they got right, so a ghost chases by
 * answering well. Clamped at the exit; the consumed don't move. Pure.
 */
export function advanceByAnswers(racers: Racer[], correctByPid: Map<string, number>, stepPer = FINALE_STEP): Racer[] {
  return racers.map((r) =>
    r.out ? r : { ...r, x: Math.min(1, r.x + Math.max(0, correctByPid.get(r.pid) ?? 0) * stepPer) },
  )
}

/** The dark creeps forward by `rate` (clamped to 1). */
export function nextDarkness(darkness: number, rate: number): number {
  return Math.min(1, darkness + rate)
}

/**
 * Consume anyone the dark has caught (x at or behind the dark, and not yet at the
 * exit). Returns new racers + the pids consumed. Pure.
 */
export function applyDarkness(racers: Racer[], darkness: number): { racers: Racer[]; consumed: string[] } {
  const consumed: string[] = []
  const next = racers.map((r) => {
    if (r.out || r.x >= 1) return r
    if (r.x <= darkness) {
      consumed.push(r.pid)
      return { ...r, out: true }
    }
    return r
  })
  return { racers: next, consumed }
}

/**
 * Find the next legal body-steal: a ghost that has caught up to (drawn level with,
 * within range of) a living racer takes the most-advanced such victim. Returns the
 * [ghostPid, targetPid] pair, or null if no steal is available. The host applies it
 * with `resolveSteal` and may loop to resolve multiple. Pure.
 */
export function findSteal(racers: Racer[]): [string, string] | null {
  const living = racers.filter((r) => r.alive && !r.out).sort((a, b) => b.x - a.x)
  const ghosts = racers.filter((r) => r.ghost && !r.out && !r.alive)
  for (const victim of living) {
    const catcher = ghosts.find((g) => victim.x - g.x <= FINALE_STEAL_RANGE)
    if (catcher) return [catcher.pid, victim.pid]
  }
  return null
}

/**
 * A ghost steals a living body. Legal only when the ghost is in range BEHIND (or
 * level with) a specific living, non-out target. On success the ghost becomes
 * alive at the victim's position, and the victim becomes a ghost; returns null if
 * the steal is illegal (not adjacent, target already a ghost/out, self, etc.).
 */
export function resolveSteal(racers: Racer[], ghostPid: string, targetPid: string): Racer[] | null {
  if (ghostPid === targetPid) return null
  const ghost = racers.find((r) => r.pid === ghostPid)
  const target = racers.find((r) => r.pid === targetPid)
  if (!ghost || !target) return null
  if (!ghost.ghost || ghost.out || ghost.alive) return null
  if (!target.alive || target.out || target.ghost) return null
  if (target.x - ghost.x > FINALE_STEAL_RANGE) return null // ghost must have caught up
  return racers.map((r) => {
    if (r.pid === ghostPid) return { ...r, alive: true, ghost: false, x: target.x, carrying: targetPid }
    if (r.pid === targetPid) return { ...r, alive: false, ghost: true }
    return r
  })
}

/** Has anyone escaped, or did the dark take everyone? Survivors = reached exit. */
export function finaleOutcome(racers: Racer[]): { result: 'won' | 'wiped'; survivors: string[] } {
  const escaped = racers.filter((r) => r.alive && !r.out && r.x >= 1).map((r) => r.pid)
  if (escaped.length) return { result: 'won', survivors: escaped }
  const anyLiving = racers.some((r) => r.alive && !r.out)
  return anyLiving ? { result: 'won', survivors: [] } : { result: 'wiped', survivors: [] }
}

// ── Final standings ──────────────────────────────────────────────────────────

export interface StandingInput {
  id: string
  name: string
  money: number
  escaped: boolean
  alive: boolean
}
export interface StandingRow {
  id: string
  name: string
  score: number
  detail: string
}

/**
 * Final leaderboard: escapees first, then by money. `score` is money (the show's
 * currency); `detail` reads the fate (Escaped / Survived / a ghost).
 */
export function leaderboard(rows: StandingInput[]): StandingRow[] {
  return [...rows]
    .sort(
      (a, b) =>
        Number(b.escaped) - Number(a.escaped) || b.money - a.money || a.name.localeCompare(b.name),
    )
    .map((r) => ({
      id: r.id,
      name: r.name,
      score: r.money,
      detail: r.escaped ? 'Escaped' : r.alive ? 'Survived' : 'A ghost',
    }))
}
