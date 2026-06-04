import { describe, expect, it } from 'vitest'
import { parseSheet } from './sheet'

describe('parseSheet', () => {
  it('parses CSV with a header, slugified keys, and labels', () => {
    const out = parseSheet('Question, Answer\nCapital of France?, Paris\n2 + 2?, 4')
    expect(out.columns.map((c) => c.key)).toEqual(['question', 'answer'])
    expect(out.columns.map((c) => c.label)).toEqual(['Question', 'Answer'])
    expect(out.rows).toEqual([
      { question: 'Capital of France?', answer: 'Paris' },
      { question: '2 + 2?', answer: '4' },
    ])
    expect(out.errors).toEqual([])
  })

  it('detects TSV (a Google Sheets / Excel paste)', () => {
    const out = parseSheet('q\tans\nfoo\tbar')
    expect(out.columns.map((c) => c.key)).toEqual(['q', 'ans'])
    expect(out.rows).toEqual([{ q: 'foo', ans: 'bar' }])
  })

  it('honors CSV quoting (embedded commas + escaped quotes)', () => {
    const out = parseSheet('text\n"Hello, world"\n"She said ""hi"""')
    expect(out.rows).toEqual([{ text: 'Hello, world' }, { text: 'She said "hi"' }])
  })

  it('infers an image column (all image URLs) and stores them as text', () => {
    const out = parseSheet('q,pic\nWho?,https://img.example/a.png\nWhat?,https://img.example/b.jpg')
    expect(out.columns.find((c) => c.key === 'pic')?.type).toBe('image')
  })

  it('infers a number column and converts cells to numbers', () => {
    const out = parseSheet('prompt,answer\nHow many moons?,1\nDays in a week?,7')
    expect(out.columns.find((c) => c.key === 'answer')?.type).toBe('number')
    expect(out.rows[0]!.answer).toBe(1)
    expect(typeof out.rows[1]!.answer).toBe('number')
  })

  it('dedupes repeated headers into distinct keys', () => {
    const out = parseSheet('opt,opt,opt\na,b,c')
    expect(out.columns.map((c) => c.key)).toEqual(['opt', 'opt_2', 'opt_3'])
  })

  it('pads a ragged row and reports it as an error (without dropping it)', () => {
    const out = parseSheet('a,b,c\nx,y')
    expect(out.rows).toEqual([{ a: 'x', b: 'y', c: '' }])
    expect(out.errors[0]).toMatch(/Row 1 has 2 cells, expected 3/)
  })

  it('errors when there is no data row', () => {
    expect(parseSheet('just a header').errors[0]).toMatch(/header row and at least one data row/)
  })
})
