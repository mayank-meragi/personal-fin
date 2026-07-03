import type { Transaction } from './types'

export interface MonthTotals {
  income: number
  expense: number
  net: number
}

export function totals(txs: Transaction[]): MonthTotals {
  let income = 0
  let expense = 0
  for (const t of txs) {
    // Transfers move money between own accounts — neither income nor expense
    if (t.type === 'income') income += t.amount
    else if (t.type === 'expense') expense += t.amount
  }
  return { income, expense, net: income - expense }
}

/** Expense totals per category id */
export function spentByCategory(txs: Transaction[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of txs) {
    if (t.type !== 'expense') continue
    out[t.category] = (out[t.category] ?? 0) + t.amount
  }
  return out
}
