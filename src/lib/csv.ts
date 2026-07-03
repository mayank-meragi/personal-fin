import Papa from 'papaparse'

export interface RawCsv {
  headers: string[]
  rows: string[][]
}

export type DateFormat = 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD'

export interface ColumnMapping {
  dateCol: number
  descCol: number
  /** 'debitCredit': separate withdrawal/deposit columns; 'single': one amount column, optionally with a Dr/Cr column */
  mode: 'single' | 'debitCredit'
  amountCol?: number
  drcrCol?: number
  debitCol?: number
  creditCol?: number
  dateFormat: DateFormat
}

export interface ImportedRow {
  date: string
  description: string
  amount: number
  type: 'expense' | 'income'
  importHash: string
  raw: string[]
}

const HEADER_KEYWORDS = {
  date: ['date', 'txn date', 'value date', 'transaction date', 'tran date', 'posting date'],
  desc: ['narration', 'description', 'particulars', 'remarks', 'details', 'transaction details'],
  debit: ['withdrawal', 'debit', 'dr amount', 'withdrawal amt', 'withdrawal amount', 'debit amount'],
  credit: ['deposit', 'credit', 'cr amount', 'deposit amt', 'deposit amount', 'credit amount'],
  amount: ['amount', 'transaction amount', 'amount (inr)'],
  drcr: ['dr/cr', 'dr / cr', 'cr/dr', 'type', 'dr|cr'],
}

function norm(cell: string): string {
  return cell.trim().toLowerCase().replace(/\s+/g, ' ')
}

function matchesAny(cell: string, keywords: string[]): boolean {
  const n = norm(cell)
  return keywords.some((k) => n === k || n.includes(k))
}

/**
 * Indian bank exports often start with preamble lines ("Account Statement
 * for…"). Find the real header row: the first row where at least two cells
 * match known header keywords, one of them being a date column.
 */
export function detectHeaderRow(rows: string[][]): number {
  const allKeywords = Object.values(HEADER_KEYWORDS).flat()
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i]
    const hits = row.filter((cell) => matchesAny(cell, allKeywords)).length
    const hasDate = row.some((cell) => matchesAny(cell, HEADER_KEYWORDS.date))
    if (hits >= 2 && hasDate) return i
  }
  return 0
}

/** Parse raw CSV text, skipping any preamble above the real header row. */
export function parseBankCsv(text: string): RawCsv {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' })
  const rows = (result.data as string[][]).filter((r) => r.some((c) => c && c.trim()))
  if (rows.length === 0) return { headers: [], rows: [] }
  const headerIdx = detectHeaderRow(rows)
  const headers = rows[headerIdx].map((h) => h.trim())
  const dataRows = rows.slice(headerIdx + 1).filter((r) => r.length > 1)
  return { headers, rows: dataRows }
}

/** Best-guess column mapping from headers; user can correct in the UI. */
export function guessMapping(headers: string[]): ColumnMapping {
  const find = (keywords: string[]) => headers.findIndex((h) => matchesAny(h, keywords))
  const dateCol = Math.max(0, find(HEADER_KEYWORDS.date))
  const descCol = Math.max(0, find(HEADER_KEYWORDS.desc))
  const debitCol = find(HEADER_KEYWORDS.debit)
  const creditCol = find(HEADER_KEYWORDS.credit)
  if (debitCol >= 0 && creditCol >= 0) {
    return { dateCol, descCol, mode: 'debitCredit', debitCol, creditCol, dateFormat: 'DD/MM/YYYY' }
  }
  const amountCol = find(HEADER_KEYWORDS.amount)
  const drcrCol = find(HEADER_KEYWORDS.drcr)
  return {
    dateCol,
    descCol,
    mode: 'single',
    amountCol: amountCol >= 0 ? amountCol : Math.max(0, headers.length - 1),
    drcrCol: drcrCol >= 0 ? drcrCol : undefined,
    dateFormat: 'DD/MM/YYYY',
  }
}

/**
 * "1,50,000.00 Cr" → { value: 150000, indicator: 'cr' }.
 * Returns null when the cell has no parseable number.
 */
export function sanitizeAmount(cell: string): { value: number; indicator?: 'dr' | 'cr' } | null {
  const s = cell.trim()
  if (!s) return null
  const indicatorMatch = s.match(/\b(dr|cr)\.?$/i)
  const indicator = indicatorMatch ? (indicatorMatch[1].toLowerCase() as 'dr' | 'cr') : undefined
  const cleaned = s
    .replace(/\b(dr|cr)\.?$/i, '')
    .replace(/[₹,\s]/g, '')
    .replace(/^\((.*)\)$/, '-$1')
  const value = Number(cleaned)
  if (!Number.isFinite(value) || cleaned === '') return null
  return { value: Math.abs(value), indicator: indicator ?? (value < 0 ? 'dr' : undefined) }
}

/** Parse a date cell in the chosen format (separators / - . all accepted) to ISO. */
export function parseDateCell(cell: string, format: DateFormat): string | null {
  const s = cell.trim().split(/\s+/)[0] // drop time portions
  const parts = s.split(/[/\-.]/)
  if (parts.length !== 3) return null
  let y: number, m: number, d: number
  if (format === 'YYYY-MM-DD') {
    ;[y, m, d] = parts.map(Number)
  } else {
    ;[d, m, y] = parts.map(Number)
  }
  if (y < 100) y += 2000
  if (!y || !m || !d || m > 12 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Lowercase, collapse whitespace, strip long reference-number runs. */
export function normalizeDesc(s: string): string {
  return s
    .toLowerCase()
    .replace(/\d{6,}/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function computeImportHash(date: string, amount: number, desc: string): string {
  return `${date}|${amount.toFixed(2)}|${normalizeDesc(desc)}`
}

/** Apply a mapping to the parsed rows, dropping rows that don't yield a valid transaction. */
export function extractRows(raw: RawCsv, mapping: ColumnMapping): ImportedRow[] {
  const out: ImportedRow[] = []
  for (const row of raw.rows) {
    const date = parseDateCell(row[mapping.dateCol] ?? '', mapping.dateFormat)
    if (!date) continue
    const description = (row[mapping.descCol] ?? '').trim()

    let amount: number | null = null
    let type: 'expense' | 'income' = 'expense'
    if (mapping.mode === 'debitCredit') {
      const debit = sanitizeAmount(row[mapping.debitCol ?? -1] ?? '')
      const credit = sanitizeAmount(row[mapping.creditCol ?? -1] ?? '')
      if (debit && debit.value > 0) {
        amount = debit.value
        type = 'expense'
      } else if (credit && credit.value > 0) {
        amount = credit.value
        type = 'income'
      }
    } else {
      const parsed = sanitizeAmount(row[mapping.amountCol ?? -1] ?? '')
      if (parsed && parsed.value > 0) {
        amount = parsed.value
        let indicator = parsed.indicator
        if (mapping.drcrCol !== undefined) {
          const cell = norm(row[mapping.drcrCol] ?? '')
          if (cell.startsWith('cr')) indicator = 'cr'
          else if (cell.startsWith('dr')) indicator = 'dr'
        }
        type = indicator === 'cr' ? 'income' : 'expense'
      }
    }
    if (amount === null) continue

    out.push({
      date,
      description,
      amount,
      type,
      importHash: computeImportHash(date, amount, description),
      raw: row,
    })
  }
  return out
}
