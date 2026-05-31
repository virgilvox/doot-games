import { describe, expect, it } from 'vitest'
import { type BarsContent, barsBlock, renderVerse } from './block'

const content: BarsContent = {
  subject: '',
  prompt: 'Drop your bars',
  couplets: [
    { lead: "I'm a top-tier bot and my circuits run hot,", rhymeWith: 'hot' },
    { lead: 'They plugged me in and I started to spit,', rhymeWith: 'spit' },
  ],
  maxLength: 70,
  timer: 90,
}

describe('bars block', () => {
  it('seeds one empty line per couplet', () => {
    expect(barsBlock.emptyInput(content)).toEqual({ lines: ['', ''] })
  })

  it('is complete only when every couplet has a written line', () => {
    expect(barsBlock.isComplete!(content, { lines: ['', ''] })).toBe(false)
    expect(barsBlock.isComplete!(content, { lines: ['so my haters stay mad', ''] })).toBe(false)
    expect(barsBlock.isComplete!(content, { lines: ['line one', 'line two'] })).toBe(true)
  })

  it('renders the verse as alternating robot lead / player line', () => {
    const verse = renderVerse(content, { lines: ['and your wack flow is not,', 'now everyone submit'] })
    expect(verse).toBe(
      [
        "I'm a top-tier bot and my circuits run hot,",
        'and your wack flow is not,',
        'They plugged me in and I started to spit,',
        'now everyone submit',
      ].join('\n'),
    )
  })

  it('toVoteText (what the vote round performs) drops empty player lines', () => {
    const text = barsBlock.toVoteText!(content, { lines: ['my rhyme', ''] })
    expect(text).toBe(
      ["I'm a top-tier bot and my circuits run hot,", 'my rhyme', 'They plugged me in and I started to spit,'].join('\n'),
    )
  })
})
