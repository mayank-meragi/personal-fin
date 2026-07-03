import type { Category, ParsedEntry } from './types'

/**
 * Regex fallback for quick entry when no Gemini key is set or the API fails.
 * Handles: "2 tea of 5" (qty × unit), "tea 5" / "5 tea" (total), joined by
 * "and", commas, or newlines.
 */
export function quickParse(input: string, categories: Category[]): ParsedEntry[] {
  return input
    .split(/\s*(?:,|\band\b|\n|\+)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((segment) => parseSegment(segment, categories))
    .filter((e): e is ParsedEntry => e !== null)
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
