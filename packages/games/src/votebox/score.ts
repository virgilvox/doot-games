/**
 * VoteBox scoring. Pure aggregation from collected inputs to a results payload:
 * a leaderboard of correct guesses, a top-rated award per rating category, the
 * crowd favorite overall, and headline stats. Scoring only counts rounds a
 * player was present for. This is the worked reference for PRD section 8.3.
 */
import { isEligible } from '@doot-games/engine'
import type {
  AwardCard,
  LeaderboardEntry,
  ScoreContext,
  StandardResults,
  StatItem,
} from '@doot-games/sdk'
import { type VoteBoxConfig, type VoteBoxInput, isGuessInput, isRateInput } from './config'

export interface VoteBoxResults extends StandardResults {
  leaderboard: LeaderboardEntry[]
  awards: AwardCard[]
  stats: StatItem[]
  favorite: { subject: string; average: number } | null
  totals: { players: number; guessRounds: number; ratingsCast: number }
}

interface Tally {
  id: string
  name: string
  correct: number
  answered: number
  eligible: number
}

export function voteBoxScore(ctx: ScoreContext<VoteBoxConfig, VoteBoxInput>): VoteBoxResults {
  const { config, players, inputsFor, answerKeys } = ctx
  const slides = config.slides

  const tallies: Tally[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    correct: 0,
    answered: 0,
    eligible: 0,
  }))
  const tallyById = new Map(tallies.map((t, i) => [t.id, { tally: t, player: players[i]! }]))

  // Guess rounds -> correctness.
  slides.forEach((slide, index) => {
    if (slide.type !== 'guess') return
    const correctIndex = (answerKeys[index] as { correct?: number } | undefined)?.correct
    const inputs = inputsFor(index)
    for (const { tally, player } of tallyById.values()) {
      if (!isEligible(player.joinedAtIndex, index)) continue
      tally.eligible++
      const input = inputs.get(player.id)
      if (isGuessInput(input) && input.choice != null) {
        tally.answered++
        if (input.choice === correctIndex) tally.correct++
      }
    }
  })

  tallies.sort(
    (a, b) => b.correct - a.correct || b.answered - a.answered || a.name.localeCompare(b.name),
  )

  // Rate rounds -> top-rated per category and overall favorite.
  const awards: AwardCard[] = []
  for (const category of config.categories) {
    let best: { subject: string; average: number } | null = null
    slides.forEach((slide, index) => {
      if (slide.type !== 'rate' || !slide.categories.includes(category.id)) return
      const { sum, n } = sumRatings(inputsFor(index), category.id)
      if (n > 0) {
        const average = sum / n
        if (!best || average > best.average) {
          best = { subject: slide.subject || `Slide ${index + 1}`, average }
        }
      }
    })
    if (best) {
      awards.push({
        label: `Top rated ${category.label}`,
        subject: (best as { subject: string }).subject,
        value: (best as { average: number }).average.toFixed(1),
      })
    }
  }

  let favorite: { subject: string; average: number } | null = null
  let ratingsCast = 0
  slides.forEach((slide, index) => {
    if (slide.type !== 'rate') return
    let sum = 0
    let n = 0
    for (const cid of slide.categories) {
      const r = sumRatings(inputsFor(index), cid)
      sum += r.sum
      n += r.n
    }
    ratingsCast += n
    if (n > 0) {
      const average = sum / n
      if (!favorite || average > favorite.average) {
        favorite = { subject: slide.subject || `Slide ${index + 1}`, average }
      }
    }
  })

  const guessRounds = slides.filter((s) => s.type === 'guess').length
  const topScore = tallies[0]?.correct ?? 0

  const leaderboard: LeaderboardEntry[] = tallies.map((t) => ({
    id: t.id,
    name: t.name,
    score: t.correct,
    detail: `${t.correct} / ${t.eligible}`,
  }))

  const stats: StatItem[] = [
    { label: 'Players', value: players.length },
    { label: 'Guess rounds', value: guessRounds },
    { label: 'Top score', value: topScore },
    { label: 'Ratings cast', value: ratingsCast },
  ]

  return {
    headline: leaderboard[0] ? `${leaderboard[0].name} wins` : 'The results are in',
    leaderboard,
    awards,
    stats,
    favorite,
    totals: { players: players.length, guessRounds, ratingsCast },
  }
}

function sumRatings(inputs: Map<string, VoteBoxInput>, categoryId: string): {
  sum: number
  n: number
} {
  let sum = 0
  let n = 0
  for (const input of inputs.values()) {
    if (isRateInput(input)) {
      const value = input.ratings[categoryId]
      if (typeof value === 'number') {
        sum += value
        n++
      }
    }
  }
  return { sum, n }
}
