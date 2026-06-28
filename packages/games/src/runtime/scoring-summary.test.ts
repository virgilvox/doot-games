import type { GameComposition, GamePlugin } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { scoringSummary } from './scoring-summary'

// Minimal block/plugin stubs: scoringSummary only reads `kind`, `scoring`, and
// the rounds' `block` keys.
const block = (kind: string, scoring?: string) => ({ kind, scoring }) as unknown as GamePlugin['blocks'][number]

function plugin(...blocks: GamePlugin['blocks']): GamePlugin {
  return { blocks } as unknown as GamePlugin
}
function config(...kinds: string[]): GameComposition {
  return { rounds: kinds.map((block) => ({ block, content: {} })) } as unknown as GameComposition
}

describe('scoringSummary', () => {
  it('lists distinct scoring blurbs in play order', () => {
    const p = plugin(
      block('guess', 'Each correct answer scores a point.'),
      block('rate'), // no blurb (scores nothing)
    )
    expect(scoringSummary(p, config('guess', 'rate', 'guess'))).toEqual([
      'Each correct answer scores a point.',
    ])
  })

  it('keeps multiple distinct lines in first-seen order', () => {
    const p = plugin(
      block('guess', 'Each correct answer scores a point.'),
      block('buzzer', 'Faster correct buzzes score more.'),
    )
    expect(scoringSummary(p, config('buzzer', 'guess', 'buzzer'))).toEqual([
      'Faster correct buzzes score more.',
      'Each correct answer scores a point.',
    ])
  })

  it('returns empty when no block scores (custom-flow / all make/display)', () => {
    const p = plugin(block('quip'), block('vote'))
    expect(scoringSummary(p, config('quip', 'vote'))).toEqual([])
  })

  it('is safe on a null config', () => {
    expect(scoringSummary(plugin(), null)).toEqual([])
  })
})
