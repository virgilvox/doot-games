import { describe, expect, it } from 'vitest'
import { doodleBlock } from '../blocks/doodle/block'
import { guessBlock } from '../blocks/guess/block'
import { wavelengthBlock } from '../blocks/wavelength/block'
import { canSubmitInput, inputNeedsRebuild } from './submit'

describe('canSubmitInput', () => {
  const content = { ...guessBlock.defaultContent(), options: [{ label: 'A' }, { label: 'B' }] }

  it('is false until the player has actually picked something', () => {
    expect(canSubmitInput(guessBlock, content, { choice: null })).toBe(false)
    expect(canSubmitInput(guessBlock, content, { choice: 1 })).toBe(true)
  })

  it('is false before the round content has arrived', () => {
    expect(canSubmitInput(guessBlock, null, { choice: 1 })).toBe(false)
    expect(canSubmitInput(undefined, content, { choice: 1 })).toBe(false)
  })

  it('does NOT consider host presence: that is the Z2CP regression', () => {
    // There is deliberately no host-presence parameter. A player with a complete
    // pick can always lock it in; the relay retains it for whenever the host looks.
    expect(canSubmitInput.length).toBe(3)
    expect(canSubmitInput(guessBlock, content, { choice: 0 })).toBe(true)
  })

  it('treats a block with no isComplete as always ready', () => {
    expect(canSubmitInput({ emptyInput: () => ({}) }, { any: 1 }, {})).toBe(true)
  })

  it('does not wedge shut when isComplete throws on a mismatched input shape', () => {
    const brittle = {
      emptyInput: () => ({ strokes: [] }),
      isComplete: (_c: never, v: never) => (v as { strokes: unknown[] }).strokes.length > 0,
    }
    // `{ text: '' }` has no `strokes`, so the block's own rule throws.
    expect(() => canSubmitInput(brittle, { mode: 'draw' }, { text: '' })).not.toThrow()
    expect(canSubmitInput(brittle, { mode: 'draw' }, { text: '' })).toBe(false)
  })
})

describe('inputNeedsRebuild', () => {
  it('spots an input built for the other branch of a mode-switching block', () => {
    // Doodle Chain: the shared content says "write", the player's SECRET content
    // says "draw". The secret one arrives second, on its own address.
    const writeInput = doodleBlock.emptyInput({ mode: 'write' } as never)
    expect(inputNeedsRebuild(doodleBlock, { mode: 'write' }, writeInput)).toBe(false)
    expect(inputNeedsRebuild(doodleBlock, { mode: 'draw' }, writeInput)).toBe(true)
  })

  it('spots the same thing on wavelength, which branches on phase', () => {
    const clueInput = wavelengthBlock.emptyInput({ phase: 'clue' } as never)
    expect(inputNeedsRebuild(wavelengthBlock, { phase: 'clue' }, clueInput)).toBe(false)
    expect(inputNeedsRebuild(wavelengthBlock, { phase: 'guess' }, clueInput)).toBe(true)
  })

  it('leaves a half-finished answer alone when the shape is unchanged', () => {
    // The relay redelivering a value must not wipe a drawing in progress.
    const inProgress = { strokes: [{ pts: [1, 2, 3] }] }
    expect(inputNeedsRebuild(doodleBlock, { mode: 'draw' }, inProgress)).toBe(false)
  })

  it('rebuilds when there is no input yet', () => {
    expect(inputNeedsRebuild(guessBlock, guessBlock.defaultContent(), null)).toBe(true)
  })

  it('is a no-op with no block or no content', () => {
    expect(inputNeedsRebuild(undefined, { a: 1 }, {})).toBe(false)
    expect(inputNeedsRebuild(guessBlock, null, {})).toBe(false)
  })
})
