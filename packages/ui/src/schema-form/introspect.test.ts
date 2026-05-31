import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { type FieldNode, blankValue, describeSchema, humanizeName } from './introspect'

const field = (node: FieldNode, name: string): FieldNode | undefined => {
  if (node.kind !== 'object') throw new Error('expected object node')
  return node.fields.find((f) => f.name === name)?.node
}

describe('describeSchema', () => {
  it('reads object shape into ordered field entries', () => {
    const node = describeSchema(z.object({ a: z.string(), b: z.number() }))
    expect(node.kind).toBe('object')
    if (node.kind !== 'object') return
    expect(node.fields.map((f) => f.name)).toEqual(['a', 'b'])
    expect(node.fields[0]?.node.kind).toBe('string')
    expect(node.fields[1]?.node.kind).toBe('number')
  })

  it('peels a default wrapper and records its value', () => {
    const node = describeSchema(z.string().default('hi'))
    expect(node.kind).toBe('string')
    expect(node.hasDefault).toBe(true)
    expect(node.defaultValue).toBe('hi')
  })

  it('peels stacked nullable + default (the timer pattern)', () => {
    const node = describeSchema(z.number().int().nonnegative().nullable().default(20))
    expect(node.kind).toBe('number')
    expect(node.nullable).toBe(true)
    expect(node.hasDefault).toBe(true)
    expect(node.defaultValue).toBe(20)
  })

  it('captures .describe() help text, including through wrappers', () => {
    const node = describeSchema(
      z.object({
        a: z.string().describe('plain help'),
        t: z.number().nullable().default(30).describe('seconds; off = untimed'),
        plain: z.string(),
      }),
    )
    expect(field(node, 'a')?.description).toBe('plain help')
    expect(field(node, 't')?.description).toBe('seconds; off = untimed')
    expect(field(node, 'plain')?.description).toBeUndefined()
  })

  it('marks optional fields', () => {
    const node = field(describeSchema(z.object({ image: z.string().optional() })), 'image')
    expect(node?.kind).toBe('string')
    expect(node?.optional).toBe(true)
  })

  it('descends into arrays of objects', () => {
    const node = describeSchema(z.array(z.object({ label: z.string() })).min(2))
    expect(node.kind).toBe('array')
    if (node.kind !== 'array') return
    expect(node.element.kind).toBe('object')
  })

  it('reads a discriminated union into tagged variants', () => {
    const scale = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('numeric'), min: z.number(), max: z.number() }),
      z.object({ kind: z.literal('levels'), levels: z.array(z.object({ label: z.string() })) }),
    ])
    const node = describeSchema(scale)
    expect(node.kind).toBe('union')
    if (node.kind !== 'union') return
    expect(node.discriminator).toBe('kind')
    expect(node.variants.map((v) => v.tag)).toEqual(['numeric', 'levels'])
    // The discriminator field itself is dropped from each variant's fields.
    expect(node.variants[0]?.fields.map((f) => f.name)).toEqual(['min', 'max'])
    expect(node.variants[1]?.fields.map((f) => f.name)).toEqual(['levels'])
  })

  it('reads a literal value', () => {
    const node = describeSchema(z.literal('numeric'))
    expect(node.kind).toBe('literal')
    if (node.kind !== 'literal') return
    expect(node.value).toBe('numeric')
  })

  it('describes the full guess content schema end to end', () => {
    const guess = z.object({
      subject: z.string().default(''),
      prompt: z.string().default('Who is this?'),
      image: z.string().default(''),
      timer: z.number().int().nonnegative().nullable().default(20),
      options: z.array(z.object({ label: z.string().default(''), image: z.string().optional() })).min(2),
      correct: z.number().int().default(0),
    })
    const node = describeSchema(guess)
    expect(field(node, 'image')?.kind).toBe('string')
    expect(field(node, 'timer')?.nullable).toBe(true)
    const options = field(node, 'options')
    expect(options?.kind).toBe('array')
    if (options?.kind === 'array') expect(options.element.kind).toBe('object')
    expect(field(node, 'correct')?.kind).toBe('number')
  })
})

describe('blankValue', () => {
  it('prefers the schema default', () => {
    expect(blankValue(describeSchema(z.string().default('hi')))).toBe('hi')
    expect(blankValue(describeSchema(z.number().nullable().default(20)))).toBe(20)
  })

  it('returns null for a nullable field with no default', () => {
    expect(blankValue(describeSchema(z.number().nullable()))).toBe(null)
  })

  it('builds an object from its fields', () => {
    const node = describeSchema(z.object({ id: z.string(), n: z.number() }))
    expect(blankValue(node)).toEqual({ id: '', n: 0 })
  })

  it('seeds the first variant of a discriminated union', () => {
    const node = describeSchema(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('numeric'), min: z.number(), max: z.number() }),
        z.object({ kind: z.literal('levels'), levels: z.array(z.object({ label: z.string() })) }),
      ]),
    )
    expect(blankValue(node)).toEqual({ kind: 'numeric', min: 0, max: 0 })
  })
})

describe('humanizeName', () => {
  it('formats schema keys as labels', () => {
    expect(humanizeName('prompt')).toBe('Prompt')
    expect(humanizeName('maxScore')).toBe('Max score')
    expect(humanizeName('time_limit')).toBe('Time limit')
  })
})
