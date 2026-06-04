/**
 * Invariants for two-phase "judge" blocks: any block that builds its content at
 * runtime (`derive`) must tell the editor which fields it fills in
 * (`derivedFields`), and those fields must be optional/defaulted so that hiding
 * them in the editor still produces content the schema accepts.
 */
import { describe, expect, it } from 'vitest'
import type { AnyBlock } from '@doot-games/sdk'
import { builtinPlugins } from '../registry'

const blocks = new Map<string, AnyBlock>()
for (const plugin of builtinPlugins) {
  for (const block of plugin.blocks) blocks.set(block.kind, block)
}
const derivedBlocks = [...blocks.values()].filter((b) => b.derive)

describe('derived (two-phase) blocks', () => {
  it('there is at least one (accuse/vote/split/fibvote/drawvote/photovote)', () => {
    expect(derivedBlocks.map((b) => b.kind).sort()).toEqual(['accuse', 'drawvote', 'fibvote', 'photovote', 'split', 'vote'])
  })

  for (const block of derivedBlocks) {
    describe(block.kind, () => {
      it('declares the fields its derive fills in', () => {
        expect(block.derivedFields && block.derivedFields.length).toBeTruthy()
      })

      it('still validates with the derived fields omitted (so the editor can hide them)', () => {
        const content = block.defaultContent() as Record<string, unknown>
        for (const key of block.derivedFields ?? []) delete content[key]
        expect(block.contentSchema.safeParse(content).success).toBe(true)
      })
    })
  }
})
