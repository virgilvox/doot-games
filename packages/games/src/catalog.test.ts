import { describe, expect, it } from 'vitest'
import { REDACTION_RULES, gameCatalog, isKnownPlugin } from './catalog'
import { builtinPlugins } from './registry'

describe('game catalog', () => {
  it('stays in sync with the real plugin registry', () => {
    const registryIds = builtinPlugins.map((p) => p.manifest.id).sort()
    const catalogIds = gameCatalog.map((g) => g.id).sort()
    expect(catalogIds).toEqual(registryIds)
  })

  it('names, versions, and flagship flags match the registry manifests', () => {
    for (const entry of gameCatalog) {
      const plugin = builtinPlugins.find((p) => p.manifest.id === entry.id)
      expect(plugin?.manifest.name).toBe(entry.name)
      expect(plugin?.manifest.version).toBe(entry.version)
      // A flagship is a manifest opt-in AND must ship a content pool (buildConfig),
      // so a "Game From Doot" is always a real, replayable, host-now game.
      expect(entry.flagship).toBe(!!plugin?.manifest.flagship)
      if (entry.flagship) expect(typeof plugin?.buildConfig).toBe('function')
    }
  })

  it('recognises known plugin ids and rejects others', () => {
    expect(isKnownPlugin('votebox')).toBe(true)
    expect(isKnownPlugin('nope')).toBe(false)
  })

  it('has an API redaction rule for every answer-bearing block', () => {
    // A block with an `answerOf` carries a secret that must be stripped before
    // serving its config to a non-owner. This guards against a new answer block
    // leaking through /api/games/[id].
    const seen = new Set<string>()
    for (const plugin of builtinPlugins) {
      for (const block of plugin.blocks) {
        if (block.answerOf && !seen.has(block.kind)) {
          seen.add(block.kind)
          expect(REDACTION_RULES[block.kind], `${block.kind} needs a REDACTION_RULES entry`).toBeDefined()
        }
      }
    }
  })
})
