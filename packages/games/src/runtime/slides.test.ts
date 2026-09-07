import { describe, expect, it } from 'vitest'
import {
  BARS_PER_PAGE,
  type Distribution,
  PODIUM_PER_PAGE,
  distSlides,
  distTitle,
  hasBars,
  isPodium,
  podiumEntries,
  podiumHasWinner,
} from './slides'

/** `n` podium bars, each carrying its own place (what rate/rank actually emit). */
const podium = (n: number, opts: { places?: boolean; title?: string } = {}): Distribution =>
  ({
    title: opts.title ?? 'How the room rated them',
    layout: 'podium',
    bars: Array.from({ length: n }, (_, i) => ({
      label: `Subject ${i + 1}`,
      count: 10 - i,
      max: 10,
      display: `${10 - i}.0`,
      note: '',
      ...(opts.places === false ? {} : { place: `#${i + 1}` }),
    })),
  }) as Distribution

const bars = (d: Distribution) => d.bars.map((b) => b.label)
const places = (d: Distribution) => d.bars.map((b) => b.place)

describe('a podium that fits is one slide', () => {
  it('does not page at or below the page size', () => {
    expect(distSlides(podium(PODIUM_PER_PAGE))).toHaveLength(1)
    expect(distSlides(podium(1))).toHaveLength(1)
  })

  it('crowns it when the top place is not shared', () => {
    expect(distSlides(podium(3))[0]!.crown).toBe(true)
  })

  it('does NOT crown a shared top place, which would invent a winner', () => {
    const tied = podium(3)
    tied.bars[1]!.place = '#1' // the room rated two things level
    expect(podiumHasWinner(tied)).toBe(false)
    expect(distSlides(tied)[0]!.crown).toBe(false)
  })
})

describe('a podium too tall to fit pages instead of clipping', () => {
  // The Z2CP shape: fourteen rated subjects rendered a hero, six rows, and a
  // seventh sliced in half, with seven subjects unreachable.
  const d = podium(14)
  const pages = distSlides(d)

  it('splits into enough pages to show every entry', () => {
    expect(pages).toHaveLength(Math.ceil(14 / PODIUM_PER_PAGE))
    expect(pages.flatMap((p) => bars((p as { dist: Distribution }).dist))).toHaveLength(14)
  })

  it('loses nothing and duplicates nothing', () => {
    const shown = pages.flatMap((p) => bars((p as { dist: Distribution }).dist))
    expect(shown).toEqual(bars(d))
    expect(new Set(shown).size).toBe(14)
  })

  it('crowns ONLY the first page: #8 is not a winner', () => {
    expect(pages.map((p) => (p as { crown: boolean }).crown)).toEqual([true, false, false])
  })

  it('labels the continuations so three sections do not claim one heading', () => {
    expect(pages.map((p) => p.label)).toEqual([
      'How the room rated them',
      'How the room rated them, continued',
      'How the room rated them, continued',
    ])
  })

  it('keeps places ABSOLUTE across pages', () => {
    expect(places((pages[1] as { dist: Distribution }).dist)).toEqual(['#7', '#8', '#9', '#10', '#11', '#12'])
    expect(places((pages[2] as { dist: Distribution }).dist)).toEqual(['#13', '#14'])
  })

  it('stamps absolute places for a block that supplies none, rather than restarting at #1', () => {
    // This is the bug the lift exists for: `podiumEntries` falls back to the row
    // index, which inside a chunk numbers every page from the top again.
    const noPlaces = distSlides(podium(14, { places: false }))
    expect(places((noPlaces[1] as { dist: Distribution }).dist)).toEqual(['#7', '#8', '#9', '#10', '#11', '#12'])
    const entries = podiumEntries((noPlaces[1] as { dist: Distribution }).dist)
    expect(entries.map((e) => e.place)).toEqual(['#7', '#8', '#9', '#10', '#11', '#12'])
  })

  it('does not mutate the distribution it was handed', () => {
    expect(places(d)).toEqual(Array.from({ length: 14 }, (_, i) => `#${i + 1}`))
  })
})

describe('a long BAR breakdown pages too, on its own tighter budget', () => {
  // A 20-player Quip Clash: one bar per answer, no hero, taller rows. Three fit.
  const gallery = { title: 'Who said it best?', bars: podium(20).bars } as Distribution

  it('is not a podium, and still gets paged', () => {
    expect(isPodium(gallery)).toBe(false)
    expect(distSlides(gallery)).toHaveLength(Math.ceil(20 / BARS_PER_PAGE))
  })

  it('shows every answer across the pages, in order, none lost', () => {
    const shown = distSlides(gallery).flatMap((p) => bars((p as { dist: Distribution }).dist))
    expect(shown).toEqual(bars(gallery))
  })

  it('fits on one slide when it is short enough', () => {
    const small = { title: 'Best snack', bars: podium(BARS_PER_PAGE).bars } as Distribution
    expect(distSlides(small)).toHaveLength(1)
  })

  it('never crowns a bar chart, which has no winner card', () => {
    expect(distSlides(gallery).every((p) => (p as { crown: boolean }).crown === false)).toBe(true)
  })
})

describe('titles and empties', () => {
  it('falls back when an author cleared the prompt', () => {
    expect(distTitle({ title: '   ', bars: [] } as never)).toBe('Breakdown')
    expect(distSlides({ title: '', layout: 'podium', bars: [] } as never)[0]!.label).toBe('Breakdown')
  })

  it('reports an empty breakdown rather than drawing an empty box', () => {
    const empty = { title: 'Nobody answered', bars: [] } as Distribution
    expect(hasBars(empty)).toBe(false)
    expect(distSlides(empty)).toHaveLength(1) // still one slide, which renders the notice
    expect(podiumHasWinner(empty)).toBe(false)
  })
})

describe('podiumEntries', () => {
  it('shows a place and a value when the bar carries both', () => {
    const [first] = podiumEntries(podium(2))
    expect(first).toMatchObject({ place: '#1', label: 'Subject 1', value: '10.0' })
  })

  it('drops a display that merely repeats the place (a rank round)', () => {
    const rank = podium(2)
    rank.bars[0]!.display = '#1'
    expect(podiumEntries(rank)[0]).not.toHaveProperty('value')
  })
})
