import type { Account, Category, ParsedEntry } from './types'

/**
 * Regex fallback for quick entry when no Gemini key is set or the API fails.
 * Handles: "2 tea of 5" (qty × unit), "tea 5" / "5 tea" (total), balance
 * declarations ("23k left in hdfc"), joined by "and", commas, or newlines.
 */
export function quickParse(input: string, categories: Category[], accounts: Account[] = []): ParsedEntry[] {
  return input
    .split(/\s*(?:,|\band\b|\n|\+)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((segment) => parseBalanceDeclaration(segment, accounts, categories) ?? parseSegment(segment, categories))
    .filter((e): e is ParsedEntry => e !== null)
}

/** "23k" → 23000, "1.5l"/"1.5 lakh" → 150000, "2cr" → 20000000 */
function parseAmountToken(num: string, suffix?: string): number {
  const n = parseFloat(num.replace(/,/g, ''))
  const mult = suffix ? ({ k: 1e3, l: 1e5, lakh: 1e5, lac: 1e5, cr: 1e7 } as const)[suffix.toLowerCase()] ?? 1 : 1
  return n * mult
}

// "178457.72 left in axis after mutual fund deductions" / "23k remaining in hdfc"
const AMOUNT_LEFT_IN =
  /(?:^|\b)₹?\s*([\d,]+(?:\.\d+)?)\s*(k|l|lakh|lac|cr)?\s+(?:left|remaining|balance)\s+in\s+([a-z0-9 &._-]+?)(?:\s+after\s+(.+))?$/i
// "balance 5000 in cash" / "balance of 1.5l in axis"
const BALANCE_AMOUNT_IN =
  /^balance\s+(?:of\s+)?₹?\s*([\d,]+(?:\.\d+)?)\s*(k|l|lakh|lac|cr)?\s+in\s+([a-z0-9 &._-]+?)(?:\s+after\s+(.+))?$/i

/**
 * Deterministic parser for balance declarations — "178457.72 left in axis
 * after mutual fund deductions". Used directly by the offline fallback AND to
 * repair Gemini output when the model forgets to emit statedBalance (observed
 * failure mode). Returns null when the text isn't a balance declaration.
 */
export function parseBalanceDeclaration(
  segment: string,
  accounts: Account[],
  categories: Category[],
): ParsedEntry | null {
  const trimmed = segment.trim()
  const m = trimmed.match(AMOUNT_LEFT_IN) ?? trimmed.match(BALANCE_AMOUNT_IN)
  if (!m) return null
  const statedBalance = parseAmountToken(m[1], m[2])
  if (!Number.isFinite(statedBalance) || statedBalance < 0) return null

  const accountText = m[3].trim().toLowerCase()
  const account = accounts.find((a) => {
    const name = a.name.toLowerCase()
    return a.id === accountText || name === accountText || name.includes(accountText) || accountText.includes(name)
  })

  const description = (m[4] ?? '').trim().toLowerCase() || 'balance adjustment'
  const category = m[4] ? categorize(description, categories) : null
  return {
    type: 'expense',
    description,
    totalAmount: 0,
    category: category?.id ?? 'other',
    account: account?.id,
    statedBalance,
  }
}

const QTY_OF_UNIT = /^(\d+)\s+(.+?)\s+(?:of|@|at)\s+₹?\s*(\d+(?:\.\d+)?)$/i
const DESC_AMOUNT = /^(.+?)\s+₹?\s*(\d+(?:\.\d+)?)$/
const AMOUNT_DESC = /^₹?\s*(\d+(?:\.\d+)?)\s+(.+)$/

function parseSegment(segment: string, categories: Category[]): ParsedEntry | null {
  let m = segment.match(QTY_OF_UNIT)
  if (m) {
    const quantity = Number(m[1])
    const unitAmount = Number(m[3])
    return build(m[2], quantity * unitAmount, categories, { quantity, unitAmount })
  }
  m = segment.match(DESC_AMOUNT)
  if (m) return build(m[1], Number(m[2]), categories)
  m = segment.match(AMOUNT_DESC)
  if (m) return build(m[2], Number(m[1]), categories)
  return null
}

function build(
  desc: string,
  totalAmount: number,
  categories: Category[],
  extra: Partial<ParsedEntry> = {},
): ParsedEntry | null {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return null
  const description = desc.trim().toLowerCase()
  const category = categorize(description, categories)
  return {
    type: category.type,
    description,
    totalAmount,
    category: category.id,
    ...extra,
  }
}

/** First category whose hint keyword appears in the description; else "other". */
export function categorize(description: string, categories: Category[]): Category {
  const words = description.toLowerCase()
  for (const cat of categories) {
    if (cat.hints.some((hint) => words.includes(hint.toLowerCase()))) return cat
  }
  const other = categories.find((c) => c.id === 'other')
  return other ?? categories[categories.length - 1]
}
