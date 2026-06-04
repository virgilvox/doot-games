/**
 * Parse pasted/uploaded spreadsheet text (CSV, or TSV from a Google Sheets / Excel
 * copy) into deck columns + rows. Pure + unit-tested. The delimiter is auto-detected
 * (a tab anywhere => TSV, else CSV), the first row is the header, and each column's
 * type is inferred (image-URL / number / text) with a manual override left to the UI.
 *
 * MVP scope: cells may not span newlines (a quoted multi-line CSV cell is rare for
 * game content); everything else (quoted commas, escaped quotes) is handled.
 */
import type { DeckColumn } from '@doot-games/sdk'

export interface ParsedSheet {
  columns: DeckColumn[]
  rows: Array<Record<string, string | number>>
  errors: string[]
}

/** Split one delimited line into cells. TSV is a plain split; CSV honors quoting. */
function splitLine(line: string, delim: '\t' | ','): string[] {
  if (delim === '\t') return line.split('\t')
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuotes = false
      } else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/** Slugify a header into a stable column key (lowercase, a-z0-9_), deduped. */
function columnKey(header: string, taken: Set<string>, index: number): string {
  let base = header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (!base) base = `col${index + 1}`
  let key = base
  let n = 2
  while (taken.has(key)) key = `${base}_${n++}`
  taken.add(key)
  return key
}

const IMAGE_URL = /^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i
const IMAGEY_HEADER = /\b(image|img|pic|picture|photo|cover|art)\b/i

function inferType(header: string, cells: string[]): DeckColumn['type'] {
  const nonEmpty = cells.map((c) => c.trim()).filter(Boolean)
  if (!nonEmpty.length) return 'text'
  if (nonEmpty.every((c) => IMAGE_URL.test(c))) return 'image'
  if (IMAGEY_HEADER.test(header) && nonEmpty.every((c) => /^https?:\/\//i.test(c))) return 'image'
  if (nonEmpty.every((c) => c !== '' && Number.isFinite(Number(c)))) return 'number'
  return 'text'
}

export function parseSheet(text: string): ParsedSheet {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '')
  if (lines.length < 2) {
    return { columns: [], rows: [], errors: ['Need a header row and at least one data row.'] }
  }
  const delim: '\t' | ',' = lines.some((l) => l.includes('\t')) ? '\t' : ','
  const header = splitLine(lines[0]!, delim).map((h) => h.trim())
  const taken = new Set<string>()
  const keys = header.map((h, i) => columnKey(h, taken, i))

  const errors: string[] = []
  // Raw cells per row, padded/truncated to the header width (a ragged row warns).
  const rawRows = lines.slice(1).map((line, ri) => {
    const cells = splitLine(line, delim).map((c) => c.trim())
    if (cells.length !== header.length) {
      errors.push(`Row ${ri + 1} has ${cells.length} cells, expected ${header.length}.`)
    }
    return keys.map((_, ci) => cells[ci] ?? '')
  })

  const columns: DeckColumn[] = keys.map((key, ci) => ({
    key,
    label: header[ci] || key,
    type: inferType(header[ci] ?? '', rawRows.map((r) => r[ci] ?? '')),
  }))

  const rows = rawRows.map((cells) => {
    const row: Record<string, string | number> = {}
    columns.forEach((col, ci) => {
      const raw = cells[ci] ?? ''
      row[col.key] = col.type === 'number' && raw !== '' ? Number(raw) : raw
    })
    return row
  })

  return { columns, rows, errors }
}
