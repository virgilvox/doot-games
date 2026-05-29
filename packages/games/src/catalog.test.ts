import { describe, expect, it } from 'vitest'
import { gameCatalog, isKnownPlugin } from './catalog'
import { builtinPlugins } from './registry'

describe('game catalog', () => {
  it('stays in sync with the real plugin registry', () => {
    const registryIds = builtinPlugins.map((p) => p.manifest.id).sort()
    const catalogIds = gameCatalog.map((g) => g.id).sort()
    expect(catalogIds).toEqual(registryIds)
  })

  it('names match the registry manifests', () => {
    for (const entry of gameCatalog) {
      const plugin = builtinPlugins.find((p) => p.manifest.id === entry.id)
      expect(plugin?.manifest.name).toBe(entry.name)
    }
  })

  it('recognises known plugin ids and rejects others', () => {
    expect(isKnownPlugin('votebox')).toBe(true)
    expect(isKnownPlugin('nope')).toBe(false)
  })
})
