/**
 * Round primitives. Most games do not need custom round components — they
 * assemble a sequence from these specs declaratively (the simple path); custom
 * components are the powerful path, and the two coexist. A plugin's
 * `rounds(config)` returns a list of these. See PRD section 8.2.
 *
 * The discriminator is `kind` (not `type`, which is reserved for game/content
 * typing). Every round carries `timer` so the engine can compute deadlines.
 */

export interface RoundBase {
  /** Stable id, useful for keys and restore. */
  id?: string
  /** Short label shown as a tag (e.g. the character or subject). */
  subject?: string
  /** The question or instruction. */
  prompt?: string
  /** Optional image URL shown on the host surface. */
  image?: string
  /** Seconds before voting auto-locks, or null for no timer. */
  timer: number | null
}

export interface ChoiceOption {
  label: string
  image?: string
}

/** N options, optionally one correct, optional per-option image. The guess round. */
export interface MultipleChoiceRound extends RoundBase {
  kind: 'multiple-choice'
  options: ChoiceOption[]
  /** Index of the correct option; omitted/undefined for opinion choices. */
  correct?: number
}

export interface RatingCategory {
  id: string
  label: string
}

export interface RatingScale {
  min: number
  max: number
  step: number
}

/** M categories rated on a configurable scale. The rate round. */
export interface RatingRound extends RoundBase {
  kind: 'rating'
  categories: RatingCategory[]
  scale: RatingScale
}

/** Players type a response, with an optional follow-on vote. The prompt round. */
export interface FreeTextRound extends RoundBase {
  kind: 'free-text'
  maxLength?: number
  vote?: boolean
}

/** Players draw on a canvas; drawings show on the big screen and may be voted on. */
export interface DrawRound extends RoundBase {
  kind: 'draw'
  vote?: boolean
}

/** An opinion round with no correct answer; reveal shows the distribution. */
export interface PollRound extends RoundBase {
  kind: 'poll'
  options: ChoiceOption[]
}

/** A speed or buzzer round; first correct or fastest scores. */
export interface ReactionRound extends RoundBase {
  kind: 'reaction'
  options: ChoiceOption[]
  correct?: number
}

export interface RankItem {
  id: string
  label: string
}

/** Players order a set of items; scoring compares to a key or aggregates consensus. */
export interface RankRound extends RoundBase {
  kind: 'rank'
  items: RankItem[]
  /** Optional correct ordering, as item ids. */
  key?: string[]
}

export type RoundSpec =
  | MultipleChoiceRound
  | RatingRound
  | FreeTextRound
  | DrawRound
  | PollRound
  | ReactionRound
  | RankRound

export type RoundKind = RoundSpec['kind']

/** Reduce a round sequence to the minimal timing the engine needs. */
export function roundTimings(rounds: RoundSpec[]): Array<{ timer: number | null }> {
  return rounds.map((r) => ({ timer: r.timer }))
}

/** True if any round declares a correct answer that must be withheld until reveal. */
export function hasWithheldAnswers(rounds: RoundSpec[]): boolean {
  return rounds.some(
    (r) =>
      (r.kind === 'multiple-choice' || r.kind === 'reaction') && typeof r.correct === 'number',
  )
}
