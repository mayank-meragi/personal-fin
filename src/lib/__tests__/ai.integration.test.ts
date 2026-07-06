/**
 * Live integration test of AI parsing (Gemini provider). Skipped unless a key is provided:
 *
 *   PF_TEST_GEMINI_KEY=... npx vitest run src/lib/__tests__/ai.integration.test.ts
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { defaultCategories } from '../../defaults/categories'
import type { Account } from '../types'

const KEY = process.env.PF_TEST_GEMINI_KEY

const accounts: Account[] = [
  { id: 'hdfc-savings', name: 'HDFC Savings', type: 'bank', startingBalance: 50000, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'icici-card', name: 'ICICI Card', type: 'credit-card', startingBalance: -4500, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cash', name: 'Cash', type: 'cash', startingBalance: 2000, createdAt: '2026-01-01T00:00:00Z' },
]

function makeLocalStorageShim(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  } as Storage
}

describe.skipIf(!KEY)('Gemini parsing against the live API', () => {
  beforeAll(async () => {
    globalThis.localStorage = makeLocalStorageShim()
    const { setConfig } = await import('../cache')
    setConfig('geminiKey', KEY!)
  })

  it('classifies "paid credit card 3200" as a transfer between accounts', async () => {
    const { parseWithAi } = await import('../ai')
    const [entry] = await parseWithAi('paid credit card 3200', defaultCategories.categories, accounts, {
      balances: { 'hdfc-savings': 50000, 'icici-card': -4500, cash: 2000 },
    })
    expect(entry.type).toBe('transfer')
    expect(entry.totalAmount).toBe(3200)
    expect(entry.toAccount).toBe('icici-card')
    expect(entry.category).toBe('transfer')
  }, 30_000)

  it('classifies cash withdrawal as bank → cash transfer', async () => {
    const { parseWithAi } = await import('../ai')
    const [entry] = await parseWithAi('withdrew 2000 from hdfc', defaultCategories.categories, accounts, {})
    expect(entry.type).toBe('transfer')
    expect(entry.account).toBe('hdfc-savings')
    expect(entry.toAccount).toBe('cash')
  }, 30_000)

  it('still parses plain expenses with an account hint from memory', async () => {
    const { parseWithAi } = await import('../ai')
    const [entry] = await parseWithAi('swiggy 340', defaultCategories.categories, accounts, {
      memory: '- swiggy and zomato orders always go on the ICICI Card (icici-card)',
    })
    expect(entry.type).toBe('expense')
    expect(entry.category).toBe('food-drink')
    expect(entry.account).toBe('icici-card')
  }, 30_000)

  it('generates a compact memory summary from transactions', async () => {
    const { generateMemorySummary } = await import('../ai')
    const summary = await generateMemorySummary(
      '',
      [
        {
          id: '1',
          type: 'expense',
          amount: 340,
          date: '2026-07-01',
          category: 'food-drink',
          account: 'icici-card',
          note: 'swiggy dinner',
          source: 'ai',
          createdAt: '2026-07-01T00:00:00Z',
          updatedAt: '2026-07-01T00:00:00Z',
        },
        {
          id: '2',
          type: 'income',
          amount: 304000,
          date: '2026-07-01',
          category: 'salary',
          account: 'hdfc-savings',
          note: 'salary',
          source: 'ai',
          createdAt: '2026-07-01T00:00:00Z',
          updatedAt: '2026-07-01T00:00:00Z',
        },
      ],
      defaultCategories.categories,
      accounts,
      { 'hdfc-savings': 353660, 'icici-card': -4840, cash: 2000 },
    )
    expect(summary.length).toBeGreaterThan(20)
    expect(summary.toLowerCase()).toContain('salary')
  }, 30_000)
})
