/**
 * Zod-schema introspection for the auto-generated editor.
 *
 * A block declares its round content as a Zod schema; the editor renders a form
 * from it with no per-block code. This module walks a schema and produces a
 * plain `FieldNode` tree the form components render from, so the Vue layer
 * never touches Zod internals, and the walk is pure and unit-testable.
 *
 * It reads Zod 4 internals (`schema._def`): `def.type` is the discriminant
 * (`'object' | 'array' | 'string' | 'number' | 'boolean' | 'literal' |
 * 'enum' | 'default' | 'nullable' | 'optional' | 'union'`), with `def.shape`,
 * `def.element`, `def.innerType`, `def.defaultValue`, `def.discriminator`, and
 * `def.options`. The input is typed `unknown` so this package needs no runtime
 * dependency on Zod.
 */

/** Wrapper metadata collected from default/nullable/optional layers. */
export interface FieldMeta {
  optional?: boolean
  nullable?: boolean
  hasDefault?: boolean
  defaultValue?: unknown
  /** A `.describe()` hint from the schema, shown as help text under the field. */
  description?: string
}

export type FieldNode = FieldMeta &
  (
    | { kind: 'string' }
    | { kind: 'number' }
    | { kind: 'boolean' }
    | { kind: 'literal'; value: unknown }
    | { kind: 'enum'; values: string[] }
    | { kind: 'object'; fields: FieldEntry[] }
    | { kind: 'array'; element: FieldNode }
    | { kind: 'union'; discriminator: string; variants: UnionVariant[] }
    | { kind: 'unknown' }
  )

export interface FieldEntry {
  name: string
  node: FieldNode
}

/** One arm of a discriminated union: its tag value and its non-tag fields. */
export interface UnionVariant {
  tag: string
  fields: FieldEntry[]
}

interface ZodLike {
  _def?: ZodDef
}
interface ZodDef {
  type?: string
  innerType?: ZodLike
  defaultValue?: unknown
  element?: ZodLike
  shape?: Record<string, ZodLike>
  values?: unknown[]
  entries?: Record<string, unknown>
  discriminator?: string
  options?: ZodLike[]
}

/**
 * A sensible empty value for a field, the schema default if present, else the
 * zero value for its kind. Used to seed new array items and to switch a
 * discriminated-union variant without leaving stale keys behind.
 */
export function blankValue(node: FieldNode): unknown {
  if (node.hasDefault) return structuredClone(node.defaultValue)
  if (node.nullable) return null
  switch (node.kind) {
    case 'string':
      return ''
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'literal':
      return node.value
    case 'enum':
      return node.values[0] ?? ''
    case 'array':
      return []
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const f of node.fields) out[f.name] = blankValue(f.node)
      return out
    }
    case 'union': {
      const variant = node.variants[0]
      if (!variant) return null
      const out: Record<string, unknown> = { [node.discriminator]: variant.tag }
      for (const f of variant.fields) out[f.name] = blankValue(f.node)
      return out
    }
    default:
      return null
  }
}

/** Turn a schema key into a form label: `prompt` → "Prompt", `maxScore` → "Max score". */
export function humanizeName(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return spaced ? spaced[0]!.toUpperCase() + spaced.slice(1) : name
}

function defOf(schema: unknown): ZodDef | undefined {
  return (schema as ZodLike | null | undefined)?._def
}

function shapeEntries(def: ZodDef): FieldEntry[] {
  const shape = def.shape ?? {}
  return Object.entries(shape).map(([name, sub]) => ({ name, node: describeSchema(sub) }))
}

/** Walk a Zod schema into a render-ready `FieldNode`. */
export function describeSchema(schema: unknown): FieldNode {
  const meta: FieldMeta = {}
  // Zod exposes `.describe()` text on the schema's `.description` getter (it is
  // set on the outermost wrapper, so read it before peeling). Reading a plain
  // property keeps this module free of any runtime dependency on Zod.
  const description = (schema as { description?: string } | null | undefined)?.description
  if (typeof description === 'string' && description) meta.description = description
  let def = defOf(schema)

  // Peel wrapper layers, accumulating their metadata onto the inner field.
  while (def && (def.type === 'default' || def.type === 'nullable' || def.type === 'optional')) {
    if (def.type === 'default') {
      meta.hasDefault = true
      meta.defaultValue = def.defaultValue
    } else if (def.type === 'nullable') {
      meta.nullable = true
    } else {
      meta.optional = true
    }
    def = defOf(def.innerType)
  }

  if (!def) return { kind: 'unknown', ...meta }

  switch (def.type) {
    case 'string':
      return { kind: 'string', ...meta }
    case 'number':
      return { kind: 'number', ...meta }
    case 'boolean':
      return { kind: 'boolean', ...meta }
    case 'literal':
      return { kind: 'literal', value: def.values?.[0], ...meta }
    case 'enum':
      return { kind: 'enum', values: Object.values(def.entries ?? {}).map(String), ...meta }
    case 'object':
      return { kind: 'object', fields: shapeEntries(def), ...meta }
    case 'array':
      return { kind: 'array', element: describeSchema(def.element), ...meta }
    case 'union':
      return {
        kind: 'union',
        discriminator: def.discriminator ?? '',
        variants: (def.options ?? []).map((variant) => {
          const vdef = defOf(variant)
          const fields = vdef ? shapeEntries(vdef) : []
          const tagEntry = fields.find((f) => f.name === def.discriminator)
          const tagNode = tagEntry?.node
          const tag = tagNode && tagNode.kind === 'literal' ? String(tagNode.value) : ''
          return {
            tag,
            fields: fields.filter((f) => f.name !== def.discriminator),
          }
        }),
        ...meta,
      }
    default:
      return { kind: 'unknown', ...meta }
  }
}
