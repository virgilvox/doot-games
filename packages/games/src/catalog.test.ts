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

  it("a catalog `pool` entry matches the plugin's contentPool + make block, and covers every deck-fed game", () => {
    for (const plugin of builtinPlugins) {
      const entry = gameCatalog.find((g) => g.id === plugin.manifest.id)!
      if (plugin.contentPool) {
        // Every deck-feedable plugin is advertised in the catalog (so MCP can find it).
        expect(entry.pool).toBeDefined()
        expect(entry.pool!.deckKind).toBe(plugin.contentPool.deckKind)
        // The placeholder block is the game's make block (its first default round).
        expect(entry.pool!.placeholderBlock).toBe(plugin.defaultConfig.rounds[0]!.block)
        // The answer columns the serve path withholds match the plugin's declaration, so
        // a typed pool deck can't leak answers (invariant #3).
        expect(entry.pool!.answerColumns).toEqual(plugin.contentPool.answerColumns)
      } else {
        expect(entry.pool).toBeUndefined()
      }
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

  // A typed-pool game (e.g. Fib Finder) attaches its answer-bearing deck under the
  // reserved `pool` key, NOT via round bindings, so the binding-driven path leaves it
  // untouched. Passing the pluginId withholds the columns the game's contentPool declares.
  it('nulls a pool deck\'s answer columns for the right plugin (and only then)', () => {
    const poolDeck = () => ({
      pool: {
        inline: {
          columns: [
            { key: 'question', label: 'Q', type: 'text' },
            { key: 'truth', label: 'Truth', type: 'text' },
          ],
          rows: [
            { question: 'A group of owls is a ___', truth: 'parliament' },
            { question: 'Carrots were originally ___', truth: 'purple' },
          ],
        },
      },
    })
    // No pluginId: the reserved pool deck is NOT redacted (the bindings path can't see it).
    expect(redactDecks([], poolDeck())).toEqual(poolDeck())
    // With the plugin id, `truth` (Fib Finder's answer column) is nulled; the question survives.
    const out = redactDecks([], poolDeck(), 'fib-finder') as Record<string, { inline: { rows: Array<Record<string, unknown>> } }>
    expect(out.pool.inline.rows).toEqual([
      { question: 'A group of owls is a ___', truth: null },
      { question: 'Carrots were originally ___', truth: null },
    ])
  })
})
