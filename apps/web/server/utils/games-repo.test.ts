import { describe, expect, it } from 'vitest'
import { gameInputSchema } from './games-repo'

// The save boundary validates with `gameInputSchema` and a plain Zod object STRIPS
// unknown keys, so any new round/config field must be in the schema or it is silently
// dropped on save. This pins that the authoring fields added for the polish batch
// (round name/section/results-visibility/standings + game groups/settings) survive.
describe('gameInputSchema preserves authoring fields', () => {
  const input = {
    pluginId: 'votebox',
    config: {
      title: 'T',
      rounds: [
        {
          block: 'guess',
          content: { prompt: 'x', options: [{ label: 'a' }, { label: 'b' }], correct: 0, revealImage: 'http://i/p.jpg', optionLayout: 'list', showLetters: false },
          name: 'Round one',
          group: 'g1',
          inResults: false,
          showStandings: false,
        },
        { block: 'rate', content: { prompt: 'rate', categories: [{ id: 'c', label: 'C' }], scale: { kind: 'numeric', min: 1, max: 10, step: 1 } }, group: 'g1' },
      ],
      groups: [{ id: 'g1', name: 'Section', combineRatings: true }],
      settings: {
        timers: false,
        autoAdvance: true,
        sfx: false,
        crowdVotes: true,
        contentFilter: 'strict',
        teams: 3,
        playerCap: 12,
        firstToJoinDrives: true,
        resultsOrder: ['awards', 'leaderboard'],
      },
    },
  }

  it('keeps round-level name/group/inResults/showStandings', () => {
    const r = gameInputSchema.parse(input).config.rounds[0]!
    expect(r.name).toBe('Round one')
    expect(r.group).toBe('g1')
    expect(r.inResults).toBe(false)
    expect(r.showStandings).toBe(false)
  })

  it('passes block content through verbatim (the new guess fields)', () => {
    const c = gameInputSchema.parse(input).config.rounds[0]!.content as Record<string, unknown>
    expect(c.revealImage).toBe('http://i/p.jpg')
    expect(c.optionLayout).toBe('list')
    expect(c.showLetters).toBe(false)
  })

  it('keeps config-level groups and settings (incl. resultsOrder)', () => {
    const cfg = gameInputSchema.parse(input).config
    expect(cfg.groups).toEqual([{ id: 'g1', name: 'Section', combineRatings: true }])
    expect(cfg.settings).toMatchObject({
      timers: false,
      autoAdvance: true,
      sfx: false,
      crowdVotes: true,
      contentFilter: 'strict',
      teams: 3,
      playerCap: 12,
      firstToJoinDrives: true,
      resultsOrder: ['awards', 'leaderboard'],
    })
  })

  it('still rejects a config with no rounds', () => {
    expect(() => gameInputSchema.parse({ pluginId: 'x', config: { title: 'T', rounds: [] } })).toThrow()
  })
})
