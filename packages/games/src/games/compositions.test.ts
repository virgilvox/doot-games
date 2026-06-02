import type { GameComposition, GamePlugin } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { getBlock } from '../runtime/derive'
import { backronym } from './backronym'
import { ballpark } from './ballpark'
import { faker } from './faker'
import { hivemind } from './hivemind'
import { mostLikely } from './mostlikely'
import { openMic } from './openmic'
import { builtinPlugins } from '../registry'

/**
 * A composition is only valid if every round names a block the game composes AND
 * its authored content parses against that block's schema. Typecheck can't catch
 * this (RoundInstance.content is `unknown`), so a wrong/missing field would only
 * surface at runtime. This validates both the static `defaultConfig` and every
 * `buildConfig` output across all first-party plugins.
 */
function expectValidComposition(plugin: GamePlugin, config: GameComposition, label: string) {
  expect(config.rounds.length, `${label}: has rounds`).toBeGreaterThan(0)
  config.rounds.forEach((inst, i) => {
    const block = getBlock(plugin, inst.block)
    expect(block, `${label}: round ${i} block "${inst.block}" is composed by the game`).toBeDefined()
    const result = block!.contentSchema.safeParse(inst.content)
    expect(
      result.success,
      `${label}: round ${i} (${inst.block}) content ${result.success ? '' : JSON.stringify(result.error?.issues)}`,
    ).toBe(true)
  })
}

describe('every plugin composition is internally valid', () => {
  for (const plugin of builtinPlugins) {
    it(`${plugin.manifest.id}: defaultConfig content parses against its blocks`, () => {
      expectValidComposition(plugin, plugin.defaultConfig, `${plugin.manifest.id} defaultConfig`)
    })

    if (plugin.buildConfig) {
      it(`${plugin.manifest.id}: buildConfig output content parses against its blocks`, () => {
        const seeded = plugin.buildConfig!('SEED')
        expectValidComposition(plugin, seeded, `${plugin.manifest.id} buildConfig`)
        // Reconnect-safety: the same room seed must yield an identical composition.
        expect(plugin.buildConfig!('SEED')).toEqual(seeded)
        // A different room differs (otherwise replayability/anti-spoiler is broken),
        // unless the pool is tiny; only assert when there's room to differ.
        if (plugin.roundOptions && plugin.roundOptions.max > plugin.roundOptions.default) {
          const a = JSON.stringify(plugin.buildConfig!('ROOM-A').rounds)
          const b = JSON.stringify(plugin.buildConfig!('ROOM-B').rounds)
          expect(a).not.toBe(b)
        }
      })
    }
  }
})

describe('cheap-wins batch shapes', () => {
  it('Backronym builds alternating quip -> vote pairs', () => {
    const rounds = backronym.buildConfig!('seed', { rounds: 3 }).rounds
    expect(rounds.map((r) => r.block)).toEqual(['quip', 'vote', 'quip', 'vote', 'quip', 'vote'])
    // The make prompt names a real initialism.
    expect((rounds[0]!.content as { prompt: string }).prompt).toMatch(/really stand for\?$/)
  })

  it('Open Mic builds quip -> vote pairs (the custom host performs the bits)', () => {
    const rounds = openMic.buildConfig!('seed', { rounds: 2 }).rounds
    expect(rounds.map((r) => r.block)).toEqual(['quip', 'vote', 'quip', 'vote'])
    // The custom OpenMicHost performs the bits, so the vote block's own `perform`
    // flag is left at its default (false).
    expect((rounds[1]!.content as { perform?: boolean }).perform ?? false).toBe(false)
  })

  for (const { game, kind } of [
    { game: hivemind, kind: 'hivemind' },
    { game: mostLikely, kind: 'mostlikely' },
    { game: ballpark, kind: 'ballpark' },
  ]) {
    it(`${game.manifest.id} builds N single-block ${kind} rounds`, () => {
      const rounds = game.buildConfig!('seed', { rounds: 4 }).rounds
      expect(rounds).toHaveLength(4)
      expect(rounds.every((r) => r.block === kind)).toBe(true)
    })
  }

  it('Faker builds faker -> accuse pairs and withholds the secret word', () => {
    const rounds = faker.buildConfig!('seed', { rounds: 2 }).rounds
    expect(rounds.map((r) => r.block)).toEqual(['faker', 'accuse', 'faker', 'accuse'])
    const block = getBlock(faker, 'faker')!
    const makeContent = rounds[0]!.content as { word: string }
    // The authored content carries the secret word...
    expect(makeContent.word.length).toBeGreaterThan(0)
    // ...but the redacted (published) content strips it.
    expect((block.redactContent!(makeContent) as { word: string }).word).toBe('')
  })

  it('Ballpark withholds the answer in published content but keeps it in the pool', () => {
    const round = ballpark.buildConfig!('seed', { rounds: 1 }).rounds[0]!
    const block = getBlock(ballpark, 'ballpark')!
    // The authored pool carries a real number...
    expect(typeof (round.content as { answer: number }).answer).toBe('number')
    // ...but the published (redacted) content nulls it so a spectator can't see it.
    expect((block.redactContent!(round.content) as { answer: number | null }).answer).toBeNull()
  })
})
