import type { QueryClient } from '@tanstack/react-query'
import { updateFile } from './sync'
import { fileQueryKey } from './queryKeys'
import { monthKey, transactionsPath } from './dates'
import { defaultCategories } from '../defaults/categories'
import type { Account, AccountsFile, BudgetsFile, CategoriesFile, Category, Transaction } from './types'

/**
 * The app's single mutation layer. Every write — whether triggered by a UI
 * hook or by the AI assistant's tools — goes through these plain functions:
 * local-first via updateFile (synced to GitHub in the background) plus a
 * query-cache update so the UI reflects it instantly.
 */

const emptyTx: Transaction[] = []
const emptyBudgets: BudgetsFile = { monthlyLimits: {}, overrides: {} }
const emptyAccounts: AccountsFile = { accounts: [] }

function sortByDate(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

function applyToMonth(qc: QueryClient, month: string, mutate: (current: Transaction[]) => Transaction[]) {
  const path = transactionsPath(month)
  const next = updateFile<Transaction[]>(path, emptyTx, mutate)
  qc.setQueryData(fileQueryKey(path), next)
}

/** Insert or replace transactions, sharded into their month files. */
export function saveTransactions(qc: QueryClient, txs: Transaction[]) {
  const byMonth = new Map<string, Transaction[]>()
  for (const tx of txs) {
    const m = monthKey(tx.date)
    byMonth.set(m, [...(byMonth.get(m) ?? []), tx])
  }
  for (const [month, monthTxs] of byMonth) {
    applyToMonth(qc, month, (current) => {
      const ids = new Set(monthTxs.map((t) => t.id))
      return sortByDate([...current.filter((t) => !ids.has(t.id)), ...monthTxs])
    })
  }
}

/** Update an existing transaction; handles the date moving to another month. */
export function updateTransaction(qc: QueryClient, previous: Transaction, next: Transaction) {
  const prevMonth = monthKey(previous.date)
  const nextMonth = monthKey(next.date)
  if (prevMonth !== nextMonth) {
    applyToMonth(qc, prevMonth, (current) => current.filter((t) => t.id !== previous.id))
  }
  saveTransactions(qc, [next])
}

export function deleteTransaction(qc: QueryClient, tx: Transaction) {
  applyToMonth(qc, monthKey(tx.date), (current) => current.filter((t) => t.id !== tx.id))
}

export function addCategory(qc: QueryClient, category: Category) {
  const next = updateFile<CategoriesFile>('categories.json', defaultCategories, (current) => {
    if (current.categories.some((c) => c.id === category.id)) return current
    return { ...current, categories: [...current.categories, category] }
  })
  qc.setQueryData(fileQueryKey('categories.json'), next)
}

export function updateCategory(
  qc: QueryClient,
  id: string,
  patch: Partial<Pick<Category, 'name' | 'emoji' | 'hints' | 'savings'>>,
) {
  const next = updateFile<CategoriesFile>('categories.json', defaultCategories, (current) => ({
    ...current,
    categories: current.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  }))
  qc.setQueryData(fileQueryKey('categories.json'), next)
}

/** Removes a category (and orphans its children to top level). Used for undo. */
export function removeCategory(qc: QueryClient, id: string) {
  const next = updateFile<CategoriesFile>('categories.json', defaultCategories, (current) => ({
    ...current,
    categories: current.categories
      .filter((c) => c.id !== id)
      .map((c) => (c.parent === id ? { ...c, parent: undefined } : c)),
  }))
  qc.setQueryData(fileQueryKey('categories.json'), next)
}

/**
 * Set (or clear, with null) a category's budget. With a month, sets a
 * per-month override; otherwise the default monthly limit.
 * Returns the previous value for undo.
 */
export function setBudgetLimit(
  qc: QueryClient,
  categoryId: string,
  limit: number | null,
  month?: string,
): number | null {
  let previous: number | null = null
  const next = updateFile<BudgetsFile>('budgets.json', emptyBudgets, (current) => {
    if (month) {
      previous = current.overrides[month]?.[categoryId] ?? null
      const monthOverrides = { ...(current.overrides[month] ?? {}) }
      if (limit === null || limit <= 0) delete monthOverrides[categoryId]
      else monthOverrides[categoryId] = limit
      return { ...current, overrides: { ...current.overrides, [month]: monthOverrides } }
    }
    previous = current.monthlyLimits[categoryId] ?? null
    const monthlyLimits = { ...current.monthlyLimits }
    if (limit === null || limit <= 0) delete monthlyLimits[categoryId]
    else monthlyLimits[categoryId] = limit
    return { ...current, monthlyLimits }
  })
  qc.setQueryData(fileQueryKey('budgets.json'), next)
  return previous
}

export function addAccounts(qc: QueryClient, accounts: Account[]) {
  const next = updateFile<AccountsFile>('accounts.json', emptyAccounts, (current) => ({
    ...current,
    accounts: [...current.accounts, ...accounts.filter((a) => !current.accounts.some((c) => c.id === a.id))],
  }))
  qc.setQueryData(fileQueryKey('accounts.json'), next)
}

export function updateAccount(
  qc: QueryClient,
  id: string,
  patch: Partial<Pick<Account, 'name' | 'startingBalance' | 'type'>>,
) {
  const next = updateFile<AccountsFile>('accounts.json', emptyAccounts, (current) => ({
    ...current,
    accounts: current.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  }))
  qc.setQueryData(fileQueryKey('accounts.json'), next)
}

/** Removes an account (transactions keep their account id). Used for undo. */
export function removeAccount(qc: QueryClient, id: string) {
  const next = updateFile<AccountsFile>('accounts.json', emptyAccounts, (current) => ({
    ...current,
    accounts: current.accounts.filter((a) => a.id !== id),
  }))
  qc.setQueryData(fileQueryKey('accounts.json'), next)
}
