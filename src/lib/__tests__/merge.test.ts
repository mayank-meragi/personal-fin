import { describe, expect, it } from 'vitest'
import { mergeFile, mergeTransactions } from '../merge'
import type { Transaction } from '../types'

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
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

describe('mergeTransactions', () => {
  it('unions local-only and remote-only transactions', () => {
    const merged = mergeTransactions([tx('a')], [tx('b')])
    expect(merged.map((t) => t.id).sort()).toEqual(['a', 'b'])
  })

  it('keeps the newer copy when the same id exists in both', () => {
    const older = tx('a', { amount: 100, updatedAt: '2026-07-01T00:00:00Z' })
    const newer = tx('a', { amount: 250, updatedAt: '2026-07-02T00:00:00Z' })
    expect(mergeTransactions([newer], [older])[0].amount).toBe(250)
    expect(mergeTransactions([older], [newer])[0].amount).toBe(250)
  })

  it('prefers local on equal timestamps', () => {
    const remote = tx('a', { amount: 100 })
    const local = tx('a', { amount: 200 })
    expect(mergeTransactions([local], [remote])[0].amount).toBe(200)
  })

  it('sorts output by date', () => {
    const merged = mergeTransactions(
      [tx('late', { date: '2026-07-20' })],
      [tx('early', { date: '2026-07-05' })],
    )
    expect(merged.map((t) => t.id)).toEqual(['early', 'late'])
  })
})

describe('mergeFile', () => {
  it('routes transaction paths to transaction merge', () => {
    const merged = mergeFile('transactions/2026-07.json', [tx('a')], [tx('b')]) as Transaction[]
    expect(merged).toHaveLength(2)
  })

  it('shallow-merges objects with local winning', () => {
    const merged = mergeFile(
      'budgets.json',
      { monthlyLimits: { food: 5000 } },
      { monthlyLimits: { food: 3000 }, overrides: {} },
    )
    expect(merged).toEqual({ monthlyLimits: { food: 5000 }, overrides: {} })
  })

  it('returns local when remote file was deleted', () => {
    expect(mergeFile('budgets.json', { a: 1 }, null)).toEqual({ a: 1 })
  })
})
