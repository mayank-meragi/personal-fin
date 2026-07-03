import { describe, expect, it } from 'vitest'
import { spentByCategory, totals } from '../stats'
import type { Transaction } from '../types'

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: crypto.randomUUID(),
    type: 'expense',
    amount: 100,
    date: '2026-07-01',
    category: 'other',
    note: '',
    source: 'manual',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

describe('totals', () => {
  it('excludes transfers from income and expense', () => {
    const result = totals([
      tx({ type: 'income', amount: 1000 }),
      tx({ type: 'expense', amount: 300 }),
      tx({ type: 'transfer', amount: 5000, account: 'a', toAccount: 'b' }),
    ])
    expect(result).toEqual({ income: 1000, expense: 300, net: 700 })
  })
})

describe('spentByCategory', () => {
  it('counts only expenses, never transfers', () => {
    const spent = spentByCategory([
      tx({ category: 'food-drink', amount: 200 }),
      tx({ type: 'transfer', category: 'transfer', amount: 9999 }),
      tx({ type: 'income', category: 'salary', amount: 5000 }),
    ])
    expect(spent).toEqual({ 'food-drink': 200 })
  })
})
