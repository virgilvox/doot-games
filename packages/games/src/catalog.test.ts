import { describe, expect, it } from 'vitest'
import { REDACTION_RULES, gameCatalog, isKnownPlugin, redactDecks } from './catalog'
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

  it('has an API redaction rule for every block that withholds content', () => {
    // A block that strips content before publishing (`answerOf` for a static
    // answer key, or `redactContent` for a derived secret like Fib Finder's
    // truth) carries something that must also be stripped before serving its
    // config to a non-owner. This guards against a new withholding block leaking
    // through /api/games/[id].
    const seen = new Set<string>()
    for (const plugin of builtinPlugins) {
      for (const block of plugin.blocks) {
        if ((block.answerOf || block.redactContent) && !seen.has(block.kind)) {
          seen.add(block.kind)
          expect(REDACTION_RULES[block.kind], `${block.kind} needs a REDACTION_RULES entry`).toBeDefined()
        }
      }
    }
  })
})

describe('redactDecks (deck answer-withholding)', () => {
  const deck = () => ({
    a: {
      inline: {
        columns: [
          { key: 'q', label: 'Q', type: 'text' },
          { key: 'ans', label: 'Answer', type: 'number' },
        ],
        rows: [
          { q: 'Capital of France?', ans: 0 },
          { q: '2 + 2?', ans: 1 },
        ],
      },
    },
  })

  it('nulls a column bound to an answer field (correct) but keeps the rest', () => {
    const rounds = [{ block: 'guess', content: {}, bindings: { prompt: { deck: 'a', column: 'q' }, correct: { deck: 'a', column: 'ans' } } }]
    const out = redactDecks(rounds, deck()) as Record<string, { inline: { rows: Array<Record<string, unknown>> } }>
    expect(out.a.inline.rows).toEqual([
      { q: 'Capital of France?', ans: null },
      { q: '2 + 2?', ans: null },
    ])
  })

  it('leaves a deck untouched when no binding targets an answer field', () => {
    const rounds = [{ block: 'poll', content: {}, bindings: { prompt: { deck: 'a', column: 'q' } } }]
    const out = redactDecks(rounds, deck())
    expect(out).toEqual(deck()) // poll has no answer rule; nothing stripped
  })

  it('leaves a referenced deck alone (resolved + redacted upstream in phase 2)', () => {
    const decks = { a: { ref: 'lib_1' } }
    const rounds = [{ block: 'guess', content: {}, bindings: { correct: { deck: 'a', column: 'ans' } } }]
    expect(redactDecks(rounds, decks)).toEqual(decks)
  })

  it('returns undefined decks unchanged', () => {
    expect(redactDecks([{ block: 'guess', content: {} }], undefined)).toBeUndefined()
  })
})
