/**
 * The retained "show state" the QUIZ OR DIE host publishes on `/x/show`, plus the
 * per-player intent payloads phones send back. Shared by the Host (publisher) and
 * the Player (subscriber). This is the transport contract only; all outcome logic
 * lives in `quiz-or-die-logic.ts`.
 *
 * Withholding lives here by omission: a `QuestionView` carries the options but NOT
 * the correct index (added only in `reveal`), and a `FinaleView` carries the option
 * text but `ok` only at its own reveal. The host reads answers from its local full
 * config, never from the relay.
 */
import type { DollShape } from './logic'

export type ShowPhase = 'intro' | 'question' | 'reveal' | 'cellar' | 'death' | 'finale' | 'ending'
export type CellarGame = 'chalice' | 'wheel' | 'dice' | 'money'

/** A contestant as the phones see them (no secrets). */
export interface CastView {
  pid: string
  name: string
  shape: DollShape
  color: string
  alive: boolean
  atRisk: boolean
  money: number
}

/** A trivia question safe for phones: options, but never the key. */
export interface QuestionView {
  qIndex: number
  cat: string
  q: string
  a: string[]
  /** Absolute epoch-ms deadline for the answer clock. */
  deadline: number
}

export interface CellarView {
  game: CellarGame
  /** The Cellar-visit counter, so phones key their intents to the right round. */
  floor: number
  atRisk: string[]
  /** 'intro' before a minigame is chosen, 'choose' while inputs are open, 'reveal'
   *  while the outcome plays out. */
  step: 'intro' | 'choose' | 'reveal'
  /** Poison chalice: how many cups, and (at reveal only) which are poisoned. */
  cups?: number
  poison?: number[]
  /** Reaper's Wheel / Bone Dice run one at-risk player at a time. */
  queue?: string[]
  activePid?: string
  /** Reaper's Wheel: the absolute rotation (deg) to spin to, so the landed sector
   *  matches the computed outcome. */
  wheelDeg?: number
  /** Bone dice: the house roll the at-risk must beat / undercut. */
  house?: number[]
  target?: number
  higher?: boolean
  /** Absolute epoch-ms deadline for a timed sub-step. */
  deadline?: number
}

/** A runner in the finale lane, as phones see them. */
export interface RacerView {
  pid: string
  name: string
  shape: DollShape
  color: string
  x: number
  alive: boolean
  ghost: boolean
  out: boolean
}

export interface FinaleView {
  racers: RacerView[]
  darkness: number
  round: number
  cat: string
  /** Options to tap; the `ok` flags arrive only at reveal. */
  opts: Array<{ t: string }>
  reveal?: boolean
  ok?: boolean[]
  deadline: number
}

export interface ShowState {
  phase: ShowPhase
  cast: CastView[]
  question?: QuestionView | null
  reveal?: { correct: number; atRisk: string[] } | null
  cellar?: CellarView | null
  death?: { pid: string; name: string; you: string } | null
  finale?: FinaleView | null
  ending?: { result: 'won' | 'wiped'; survivors: string[] } | null
}

// ── Phone -> host intent payloads ─────────────────────────────────────────────
export interface AnswerIntent {
  choice: number
}
export interface CupIntent {
  pick: number
}
export interface SpinRollIntent {
  nonce: number
}
export interface MoneyIntent {
  take: boolean
}
export interface FinaleIntent {
  picks: number[]
}
