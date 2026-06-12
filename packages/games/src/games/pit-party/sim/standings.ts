/**
 * Grand Prix scoring: the Mario Kart 8 Deluxe points table and cumulative cup
 * standings across a multi-race cup. Pure and tested.
 */

/** MK8DX points by finishing place (1st..12th). Every finisher scores >= 1. */
export const POINTS_TABLE = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const

/** Points awarded for a finishing place (1-based). 0 beyond the table. */
export function pointsForPlace(place: number): number {
  return POINTS_TABLE[place - 1] ?? 0
}

/** One racer's running cup total. */
export interface CupStanding {
  id: string
  name: string
  charId: string
  cartId: string
  paint: number
  points: number
  /** Place in the most recent race (tiebreaker). */
  lastPlace: number
  /** Best single-race place so far (secondary tiebreaker). */
  bestPlace: number
  /** Per-race finishing places, in order. */
  places: number[]
}

/** One race's finishing line, as fed into the cup tally. */
export interface RaceFinish {
  id: string
  name: string
  charId: string
  cartId: string
  paint: number
  place: number
}

/** Fold a race result into the running cup standings and re-sort. */
export function tallyCup(prev: CupStanding[], race: RaceFinish[]): CupStanding[] {
  const byId = new Map(prev.map((s) => [s.id, { ...s, places: [...s.places] }]))
  for (const r of race) {
    const cur =
      byId.get(r.id) ??
      {
        id: r.id,
        name: r.name,
        charId: r.charId,
        cartId: r.cartId,
        paint: r.paint,
        points: 0,
        lastPlace: r.place,
        bestPlace: r.place,
        places: [],
      }
    cur.name = r.name
    cur.charId = r.charId
    cur.cartId = r.cartId
    cur.paint = r.paint
    cur.points += pointsForPlace(r.place)
    cur.lastPlace = r.place
    cur.bestPlace = Math.min(cur.bestPlace, r.place)
    cur.places.push(r.place)
    byId.set(r.id, cur)
  }
  return sortCup([...byId.values()])
}

/** Sort cup standings: points desc, then better last-race place, then best place. */
export function sortCup(rows: CupStanding[]): CupStanding[] {
  return rows
    .slice()
    .sort(
      (a, b) =>
        b.points - a.points ||
        a.lastPlace - b.lastPlace ||
        a.bestPlace - b.bestPlace ||
        a.name.localeCompare(b.name),
    )
}
