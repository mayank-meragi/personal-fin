import { getConfig } from './cache'
import { todayISO } from './dates'
import type { Category, ParsedEntry } from './types'

export class NoGeminiKeyError extends Error {}
export class GeminiError extends Error {}

const MODEL = 'gemini-2.0-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

export function hasGeminiKey(): boolean {
  return Boolean(getConfig('geminiKey'))
}

function buildSystemPrompt(categories: Category[]): string {
  const categoryLines = categories
    .map((c) => `- ${c.id} — ${c.name} (${c.type})${c.hints.length ? ` — e.g. ${c.hints.slice(0, 6).join(', ')}` : ''}`)
    .join('\n')
  return `You parse informal Indian-English expense notes into transactions. Amounts are INR.
Today is ${todayISO()} (IST). Rules:
- "N item of P" or "N item @ P" means quantity N at unit price P; totalAmount = N*P.
- "item P" or "P item" means a single entry with totalAmount = P (e.g. "5 tea" is one tea entry of ₹5).
- Multiple items may be joined by "and", ",", or newlines — return one object per item.
- Default type is "expense"; words like salary, received, refund, credited mean "income".
- Resolve relative dates (yesterday, last friday) to YYYY-MM-DD; omit the date field entirely if unstated.
- Pick category from this list (use the id):
${categoryLines}
- description: short lowercase noun phrase ("tea", "auto to office").
Return ONLY the JSON array.`
}

function buildResponseSchema(categories: Category[]) {
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
        category: { type: 'STRING', enum: categories.map((c) => c.id) },
        date: { type: 'STRING' },
      },
      required: ['type', 'description', 'totalAmount', 'category'],
    },
  }
}

/** Parse a quick-entry note into transactions via Gemini structured output. */
export async function parseWithGemini(input: string, categories: Category[]): Promise<ParsedEntry[]> {
  const key = getConfig('geminiKey')
  if (!key) throw new NoGeminiKeyError('No Gemini API key configured')

  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildSystemPrompt(categories) }] },
        contents: [{ parts: [{ text: input }] }],
        generationConfig: {
          temperature: 0,
          response_mime_type: 'application/json',
          response_schema: buildResponseSchema(categories),
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

  const validIds = new Set(categories.map((c) => c.id))
  return parsed
    .filter(
      (e): e is ParsedEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as ParsedEntry).totalAmount === 'number' &&
        (e as ParsedEntry).totalAmount > 0 &&
        typeof (e as ParsedEntry).description === 'string',
    )
    .map((e) => ({
      ...e,
      type: e.type === 'income' ? 'income' : 'expense',
      category: validIds.has(e.category) ? e.category : 'other',
    }))
}
