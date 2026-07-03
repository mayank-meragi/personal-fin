import { describe, expect, it } from 'vitest'
import { accountBalances, inferAccount } from '../accounts'
import type { Account, Transaction } from '../types'

function acc(id: string, startingBalance = 0): Account {
  return { id, name: id, type: 'bank', startingBalance, createdAt: '2026-01-01T00:00:00Z' }
}

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

describe('accountBalances', () => {
  it('applies income and expense to the starting balance', () => {
    const balances = accountBalances(
      [acc('hdfc', 10000)],
      [
        tx({ account: 'hdfc', type: 'income', amount: 5000 }),
        tx({ account: 'hdfc', type: 'expense', amount: 1200 }),
      ],
    )
    expect(balances.hdfc).toBe(13800)
  })

  it('ignores transactions without an account or with unknown accounts', () => {
    const balances = accountBalances([acc('hdfc', 500)], [tx({ amount: 100 }), tx({ account: 'gone', amount: 50 })])
    expect(balances.hdfc).toBe(500)
  })

  it('lets credit-card balances go negative', () => {
    const balances = accountBalances([acc('card', 0)], [tx({ account: 'card', amount: 2500 })])
    expect(balances.card).toBe(-2500)
  })
})

describe('inferAccount', () => {
  const history = [
    tx({ account: 'hdfc', note: 'tea at office' }),
    tx({ account: 'hdfc', note: 'tea' }),
    tx({ account: 'card', note: 'amazon order' }),
    tx({ account: 'cash', note: 'tea stall', date: '2026-07-02' }),
  ]

  it('picks the account most often used for similar notes', () => {
    expect(inferAccount('tea', history)).toBe('hdfc')
  })

  it('matches other tokens too', () => {
    expect(inferAccount('amazon delivery', history)).toBe('card')
  })

  it('returns undefined when there is no signal', () => {
    expect(inferAccount('parachute', history)).toBeUndefined()
    expect(inferAccount('tea', [])).toBeUndefined()
  })

  it('ignores short stop-word tokens', () => {
    expect(inferAccount('at', history)).toBeUndefined()
  })
})
