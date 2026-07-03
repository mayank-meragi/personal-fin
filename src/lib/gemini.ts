import { getConfig } from './cache'
import { todayISO } from './dates'
import type { Account, Category, ParsedEntry } from './types'

export class NoGeminiKeyError extends Error {}
export class GeminiError extends Error {}

// Stable alias — always points at the current flash model, so retired
// versions (like gemini-2.0-flash) don't break the app
const MODEL = 'gemini-flash-latest'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

export function hasGeminiKey(): boolean {
  return Boolean(getConfig('geminiKey'))
}

/** "Kids School Fees" → "kids-school-fees" */
export function toKebabId(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildSystemPrompt(categories: Category[], accounts: Account[]): string {
  const categoryLines = categories
    .map((c) => `- ${c.id} — ${c.name} (${c.type})${c.hints.length ? ` — e.g. ${c.hints.slice(0, 6).join(', ')}` : ''}`)
    .join('\n')
  const accountLines = accounts.map((a) => `- ${a.id} — ${a.name} (${a.type})`).join('\n')
  return `You parse informal Indian-English expense notes into transactions. Amounts are INR.
Today is ${todayISO()} (IST). Rules:
- "N item of P" or "N item @ P" means quantity N at unit price P; totalAmount = N*P.
- "item P" or "P item" means a single entry with totalAmount = P (e.g. "5 tea" is one tea entry of ₹5).
- Multiple items may be joined by "and", ",", or newlines — return one object per item.
- Default type is "expense"; words like salary, received, refund, credited mean "income".
- Resolve relative dates (yesterday, last friday) to YYYY-MM-DD; omit the date field entirely if unstated.
- Prefer a category id from this list:
${categoryLines}
- If nothing in the list genuinely fits, invent a new category: set category to a short new
  kebab-case id, and also set categoryName (Title Case display name) and categoryEmoji
  (one fitting emoji). Do this sparingly — most everyday items fit an existing category.
${
  accounts.length > 0
    ? `- If the note names or clearly implies one of the user's accounts, set account to its id; otherwise OMIT the account field:
${accountLines}`
    : ''
}
- description: short lowercase noun phrase ("tea", "auto to office").
Return ONLY the JSON array.`
}

function buildResponseSchema(accounts: Account[]) {
  return {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', enum: ['expense', 'income'] },
        description: { type: 'STRING' },
        quantity: { type: 'NUMBER' },
        unitAmount: { type: 'NUMBER' },
        totalAmount: { type: 'NUMBER' },
        category: { type: 'STRING' },
        categoryName: { type: 'STRING' },
        categoryEmoji: { type: 'STRING' },
        ...(accounts.length > 0 ? { account: { type: 'STRING', enum: accounts.map((a) => a.id) } } : {}),
        date: { type: 'STRING' },
      },
      required: ['type', 'description', 'totalAmount', 'category'],
    },
  }
}

/** Parse a quick-entry note into transactions via Gemini structured output. */
export async function parseWithGemini(
  input: string,
  categories: Category[],
  accounts: Account[] = [],
): Promise<ParsedEntry[]> {
  const key = getConfig('geminiKey')
  if (!key) throw new NoGeminiKeyError('No Gemini API key configured')

  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildSystemPrompt(categories, accounts) }] },
        contents: [{ parts: [{ text: input }] }],
        generationConfig: {
          temperature: 0,
          response_mime_type: 'application/json',
          response_schema: buildResponseSchema(accounts),
        },
      }),
    })
  } catch {
    throw new GeminiError('Gemini unreachable — are you offline?')
  }
  if (res.status === 400 || res.status === 403) {
    throw new GeminiError('Gemini rejected the API key. Check it in Settings.')
  }
  if (res.status === 429) {
    throw new GeminiError('Gemini rate limit hit — try again in a minute.')
  }
  if (!res.ok) throw new GeminiError(`Gemini returned ${res.status}`)

  const json = await res.json()
  const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new GeminiError('Gemini returned no content')

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new GeminiError('Gemini returned invalid JSON')
  }
  if (!Array.isArray(parsed)) throw new GeminiError('Gemini returned unexpected shape')

  const validCategoryIds = new Set(categories.map((c) => c.id))
  const validAccountIds = new Set(accounts.map((a) => a.id))
  return parsed
    .filter(
      (e): e is ParsedEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as ParsedEntry).totalAmount === 'number' &&
        (e as ParsedEntry).totalAmount > 0 &&
        typeof (e as ParsedEntry).description === 'string',
    )
    .map((e) => {
      const existing = validCategoryIds.has(e.category)
      const newId = existing ? e.category : toKebabId(e.category || '')
      return {
        ...e,
        type: e.type === 'income' ? 'income' : 'expense',
        category: existing ? e.category : newId || 'other',
        // Only carry new-category metadata when the id is genuinely new
        categoryName: existing || !newId ? undefined : (e.categoryName ?? titleCase(newId)),
        categoryEmoji: existing || !newId ? undefined : (e.categoryEmoji ?? '🏷️'),
        account: e.account && validAccountIds.has(e.account) ? e.account : undefined,
      } satisfies ParsedEntry
    })
}

function titleCase(kebab: string): string {
  return kebab
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const CHUNK_SIZE = 50

/**
 * Categorize bank-statement descriptions in bulk. Returns one category id per
 * input index; unresolved indices come back as "other".
 */
export async function categorizeWithGemini(descriptions: string[], categories: Category[]): Promise<string[]> {
  const key = getConfig('geminiKey')
  if (!key) throw new NoGeminiKeyError('No Gemini API key configured')
  const expenseIds = categories.map((c) => c.id)
  const result: string[] = descriptions.map(() => 'other')

  const categoryLines = categories
    .map((c) => `- ${c.id} — ${c.name}${c.hints.length ? ` — e.g. ${c.hints.slice(0, 6).join(', ')}` : ''}`)
    .join('\n')

  for (let start = 0; start < descriptions.length; start += CHUNK_SIZE) {
    const chunk = descriptions.slice(start, start + CHUNK_SIZE)
    const prompt = `Classify each Indian bank statement description into one category id from this list:
${categoryLines}
Return one object per input with its index (0-based, within this batch) and category id.

Descriptions:
${chunk.map((d, i) => `${i}: ${d}`).join('\n')}`

    let res: Response
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            response_mime_type: 'application/json',
            response_schema: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  index: { type: 'NUMBER' },
                  category: { type: 'STRING', enum: expenseIds },
                },
                required: ['index', 'category'],
              },
            },
          },
        }),
      })
    } catch {
      throw new GeminiError('Gemini unreachable — are you offline?')
    }
    if (!res.ok) throw new GeminiError(`Gemini returned ${res.status}`)
    const json = await res.json()
    const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) continue
    try {
      const items = JSON.parse(text) as { index: number; category: string }[]
      const validIds = new Set(expenseIds)
      for (const item of items) {
        if (Number.isInteger(item.index) && item.index >= 0 && item.index < chunk.length && validIds.has(item.category)) {
          result[start + item.index] = item.category
        }
      }
    } catch {
      // Malformed chunk — leave those rows as "other"
    }
  }
  return result
}
