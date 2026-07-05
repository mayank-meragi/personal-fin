import { getConfig } from './cache'
import { todayISO } from './dates'
import { parseBalanceDeclaration } from './quickParse'
import type { Account, Category, ParsedEntry, Transaction } from './types'

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

export interface ParseContext {
  /** Current balance per account id, shown to the model */
  balances?: Record<string, number>
  /** The stored AI memory about this user, injected for better classification */
  memory?: string
  /** A shared payment screenshot / receipt to extract the transaction from */
  image?: { mimeType: string; data: string }
}

function accountLine(a: Account, balances?: Record<string, number>): string {
  const balance = balances && a.id in balances ? ` — balance ₹${balances[a.id].toLocaleString('en-IN')}` : ''
  return `- ${a.id} — ${a.name} (${a.type})${balance}`
}

function buildSystemPrompt(categories: Category[], accounts: Account[], context: ParseContext): string {
  const categoryLines = categories
    .map((c) => `- ${c.id} — ${c.name} (${c.type})${c.hints.length ? ` — e.g. ${c.hints.slice(0, 6).join(', ')}` : ''}`)
    .join('\n')
  const accountLines = accounts.map((a) => accountLine(a, context.balances)).join('\n')
  return `You parse informal Indian-English expense notes into transactions. Amounts are INR.
Today is ${todayISO()} (IST). Rules:
- "N item of P" or "N item @ P" means quantity N at unit price P; totalAmount = N*P.
- "item P" or "P item" means a single entry with totalAmount = P (e.g. "5 tea" is one tea entry of ₹5).
- Multiple items may be joined by "and", ",", or newlines — return one object per item.
- Default type is "expense"; words like salary, received, refund, credited mean "income".
- Amounts may use Indian shorthand: "23k" = 23000, "1.5L" or "1.5 lakh" = 150000, "2cr" = 20000000.
- Money moving between the user's OWN accounts is a TRANSFER, not an expense: paying a credit
  card bill, moving money to savings, withdrawing cash. Set type "transfer", account = source
  id, toAccount = destination id (e.g. "paid credit card 3200" transfers from a bank account
  to the credit card; "withdrew 2000" transfers from a bank to cash). Omit either side you
  cannot infer. Transfers use category "transfer".
- A BALANCE DECLARATION states what is LEFT in an account ("23k left in hdfc",
  "balance 5000 in cash", "178457.72 left in axis after mutual fund deductions"). This is
  NOT a transfer — never set toAccount for one. Return ONE entry with: type "expense",
  totalAmount 0, statedBalance set to the stated amount (required — do not omit it), and
  account set to the account id (in the "account" field, never "toAccount"). If a cause is
  mentioned ("after mutual fund"), use it as the description and pick or invent a fitting
  category; otherwise description "balance adjustment" and category "other".
- Resolve relative dates (yesterday, last friday) to YYYY-MM-DD; omit the date field entirely if unstated.
- Prefer a category id from this list:
${categoryLines}
- If nothing in the list genuinely fits, invent a new category: set category to a short new
  kebab-case id, and also set categoryName (Title Case display name) and categoryEmoji
  (one fitting emoji). Do this sparingly — most everyday items fit an existing category.
${
  accounts.length > 0
    ? `- The user's accounts. If the note names or clearly implies one, set account to its id; otherwise OMIT the account field:
${accountLines}`
    : ''
}${
    context.memory
      ? `
- What you have learned about this user from past activity — use it to pick the right
  category and account:
${context.memory}`
      : ''
  }
- A payment-app screenshot or receipt image may be attached: extract merchant, amount, date,
  and (if visible) the paying account from it. The text note, when present, adds context.
- description: short lowercase noun phrase ("tea", "auto to office").
Return ONLY the JSON array.`
}

function buildResponseSchema(accounts: Account[]) {
  const accountEnum = accounts.length > 0 ? { type: 'STRING', enum: accounts.map((a) => a.id) } : null
  return {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', enum: ['expense', 'income', 'transfer'] },
        description: { type: 'STRING' },
        quantity: { type: 'NUMBER' },
        unitAmount: { type: 'NUMBER' },
        totalAmount: { type: 'NUMBER' },
        category: { type: 'STRING' },
        categoryName: { type: 'STRING' },
        categoryEmoji: { type: 'STRING' },
        ...(accountEnum ? { account: accountEnum, toAccount: accountEnum } : {}),
        statedBalance: { type: 'NUMBER' },
        date: { type: 'STRING' },
      },
      required: ['type', 'description', 'totalAmount', 'category'],
    },
  }
}

async function callGemini(body: object): Promise<string> {
  const key = getConfig('geminiKey')
  if (!key) throw new NoGeminiKeyError('No Gemini API key configured')
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      // A runaway generation otherwise leaves the UI in "Parsing…" forever
      signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new GeminiError('Gemini took too long — tried simple parsing instead.')
    }
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
  return text
}

/** Parse a quick-entry note into transactions via Gemini structured output. */
export async function parseWithGemini(
  input: string,
  categories: Category[],
  accounts: Account[] = [],
  context: ParseContext = {},
): Promise<ParsedEntry[]> {
  const parts: object[] = []
  if (context.image) {
    parts.push({ inline_data: { mime_type: context.image.mimeType, data: context.image.data } })
  }
  parts.push({ text: input || 'Extract the transaction(s) from the attached image.' })

  const text = await callGemini({
    system_instruction: { parts: [{ text: buildSystemPrompt(categories, accounts, context) }] },
    contents: [{ parts }],
    generationConfig: {
      temperature: 0,
      // Hard cap: a quick-entry parse is a handful of small objects. Without
      // this, a degenerate generation loops until the model's own huge limit.
      maxOutputTokens: 2048,
      response_mime_type: 'application/json',
      response_schema: buildResponseSchema(accounts),
    },
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // Known degeneration: the model can spiral into infinite trailing zeros
    // when emitting a long decimal (e.g. statedBalance 178457.72000000…),
    // getting truncated at the token cap as invalid JSON. If the input is a
    // balance declaration we can recover it exactly, deterministically.
    const salvage = parseBalanceDeclaration(input, accounts, categories)
    if (!salvage) throw new GeminiError('Gemini returned invalid JSON')
    parsed = [salvage]
  }
  if (!Array.isArray(parsed)) throw new GeminiError('Gemini returned unexpected shape')

  const validCategoryIds = new Set(categories.map((c) => c.id))
  const validAccountIds = new Set(accounts.map((a) => a.id))

  // Repair pass: the model sometimes recognizes a balance declaration (emits a
  // ₹0 entry with the right description) but forgets the statedBalance field,
  // which would get the entry filtered out below and the user a "could not
  // find any transactions" dead end. Re-derive it deterministically from the
  // input text and patch the broken entry — or synthesize one if the model
  // returned nothing usable at all.
  const declaration = parseBalanceDeclaration(input, accounts, categories)
  if (declaration) {
    const entries = parsed as Partial<ParsedEntry>[]
    const alreadyHandled = entries.some((e) => e && typeof e.statedBalance === 'number')
    if (!alreadyHandled) {
      const broken = entries.find(
        (e) => e && typeof e === 'object' && e.statedBalance == null && (!e.totalAmount || e.totalAmount === 0),
      )
      if (broken) {
        broken.statedBalance = declaration.statedBalance
        broken.totalAmount = 0
        if (!broken.account || !validAccountIds.has(broken.account)) broken.account = declaration.account
        broken.toAccount = undefined
      } else if (entries.length === 0) {
        entries.push(declaration)
      }
    }
  }

  return parsed
    .filter((e): e is ParsedEntry => {
      if (typeof e !== 'object' || e === null) return false
      const entry = e as ParsedEntry
      if (typeof entry.description !== 'string') return false
      // Balance declarations carry totalAmount 0 — the app computes the difference
      if (typeof entry.statedBalance === 'number' && entry.statedBalance >= 0) return true
      return typeof entry.totalAmount === 'number' && entry.totalAmount > 0
    })
    .map((e) => {
      const account = e.account && validAccountIds.has(e.account) ? e.account : undefined
      if (e.type === 'transfer') {
        return {
          ...e,
          type: 'transfer' as const,
          category: 'transfer',
          categoryName: undefined,
          categoryEmoji: undefined,
          account,
          toAccount: e.toAccount && validAccountIds.has(e.toAccount) ? e.toAccount : undefined,
        } satisfies ParsedEntry
      }
      const existing = validCategoryIds.has(e.category)
      const newId = existing ? e.category : toKebabId(e.category || '')
      // Only transfers should ever carry toAccount — if the model misplaced the
      // account there instead of `account` (seen with balance declarations),
      // recover it rather than silently dropping the account.
      const recoveredAccount =
        account ?? (e.toAccount && validAccountIds.has(e.toAccount) ? e.toAccount : undefined)
      return {
        ...e,
        type: e.type === 'income' ? 'income' : 'expense',
        category: existing ? e.category : newId || 'other',
        // Only carry new-category metadata when the id is genuinely new
        categoryName: existing || !newId ? undefined : (e.categoryName ?? titleCase(newId)),
        categoryEmoji: existing || !newId ? undefined : (e.categoryEmoji ?? '🏷️'),
        account: recoveredAccount,
        toAccount: undefined,
      } satisfies ParsedEntry
    })
}

function titleCase(kebab: string): string {
  return kebab
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Rewrite the stored user-finance memory to incorporate recent transactions.
 * The result is injected into every future parse to improve classification.
 */
export async function generateMemorySummary(
  previousMemory: string,
  recentTransactions: Transaction[],
  categories: Category[],
  accounts: Account[],
  balances: Record<string, number>,
): Promise<string> {
  const txLines = recentTransactions
    .map(
      (t) =>
        `${t.date} ${t.type} ₹${t.amount} ${t.category}${t.account ? ` [${t.account}${t.toAccount ? `→${t.toAccount}` : ''}]` : ''} "${t.note}"`,
    )
    .join('\n')
  const prompt = `You maintain a compact memory about a user's personal finances. It is injected
into future parsing requests to help classify informal notes into the right category and
account. Rewrite the memory to incorporate the new information. Keep it under 180 words as
plain "- " bullet lines. Focus on durable, reusable knowledge:
- keyword/merchant → category and account mappings you observe
- which account the user uses for what (daily spends, online orders, bills, cash)
- recurring items (salary amount and date, rent, subscriptions) and typical amounts
Merge with the previous memory, drop stale or one-off details, never invent facts.

Previous memory:
${previousMemory || '(empty)'}

Accounts:
${accounts.map((a) => accountLine(a, balances)).join('\n') || '(none)'}

Categories: ${categories.map((c) => c.id).join(', ')}

Recent transactions (newest last):
${txLines || '(none)'}`

  const text = await callGemini({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1024,
      response_mime_type: 'application/json',
      response_schema: {
        type: 'OBJECT',
        properties: { summary: { type: 'STRING' } },
        required: ['summary'],
      },
    },
  })
  try {
    const parsed = JSON.parse(text) as { summary?: string }
    return (parsed.summary ?? '').trim()
  } catch {
    throw new GeminiError('Gemini returned invalid memory JSON')
  }
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
