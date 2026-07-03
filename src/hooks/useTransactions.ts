import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { getCachedFile, isConfigured } from '../lib/cache'
import { listDir } from '../lib/github'
import { loadFile, updateFile } from '../lib/sync'
import { currentMonthKey, monthKey, transactionsPath } from '../lib/dates'
import type { Transaction } from '../lib/types'
import { fileQueryKey, useFileQuery } from './useData'

const empty: Transaction[] = []

export function useTransactions(month: string) {
  return useFileQuery<Transaction[]>(transactionsPath(month), empty)
}

/**
 * Every transaction across all months, discovered by listing the transactions
 * directory. Used for account balances, recent activity, and account
 * inference. Fine at personal scale — a year is only ~12 small files.
 */
export function useAllTransactions(): { transactions: Transaction[]; isReady: boolean } {
  const monthsQuery = useQuery({
    queryKey: ['transaction-months'],
    queryFn: async () => {
      const files = await listDir('transactions')
      return files
        .map((f) => f.name.replace(/\.json$/, ''))
        .filter((name) => /^\d{4}-\d{2}$/.test(name))
    },
    enabled: isConfigured(),
    // The directory listing rarely changes; the month files themselves revalidate
    staleTime: 5 * 60_000,
    placeholderData: [currentMonthKey()],
  })
  const months = monthsQuery.data ?? []
  const byMonth = useMonthsTransactions(months)
  return {
    transactions: months.flatMap((m) => byMonth[m] ?? []),
    isReady: monthsQuery.isFetchedAfterMount,
  }
}

/** Transactions for several months at once, keyed by month. */
export function useMonthsTransactions(months: string[]): Record<string, Transaction[]> {
  const results = useQueries({
    queries: months.map((month) => {
      const path = transactionsPath(month)
      return {
        queryKey: fileQueryKey(path),
        queryFn: () => loadFile<Transaction[]>(path, empty),
        enabled: isConfigured(),
        initialData: () => getCachedFile<Transaction[]>(path)?.content ?? empty,
        initialDataUpdatedAt: 0,
      }
    }),
  })
  const byMonth: Record<string, Transaction[]> = {}
  months.forEach((month, i) => {
    byMonth[month] = results[i].data ?? empty
  })
  return byMonth
}

function sortByDate(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export function useTransactionMutations() {
  const queryClient = useQueryClient()

  function applyToMonth(month: string, mutate: (current: Transaction[]) => Transaction[]) {
    const path = transactionsPath(month)
    const next = updateFile<Transaction[]>(path, empty, mutate)
    queryClient.setQueryData(fileQueryKey(path), next)
  }

  /** Insert or replace transactions, sharded into their month files. */
  function saveAll(txs: Transaction[]) {
    const byMonth = new Map<string, Transaction[]>()
    for (const tx of txs) {
      const m = monthKey(tx.date)
      byMonth.set(m, [...(byMonth.get(m) ?? []), tx])
    }
    for (const [month, monthTxs] of byMonth) {
      applyToMonth(month, (current) => {
        const ids = new Set(monthTxs.map((t) => t.id))
        return sortByDate([...current.filter((t) => !ids.has(t.id)), ...monthTxs])
      })
    }
  }

  /** Update an existing transaction; handles the date moving to another month. */
  function update(previous: Transaction, next: Transaction) {
    const prevMonth = monthKey(previous.date)
    const nextMonth = monthKey(next.date)
    if (prevMonth !== nextMonth) {
      applyToMonth(prevMonth, (current) => current.filter((t) => t.id !== previous.id))
    }
    saveAll([next])
  }

  function remove(tx: Transaction) {
    applyToMonth(monthKey(tx.date), (current) => current.filter((t) => t.id !== tx.id))
  }

  return { saveAll, update, remove }
}

export function makeTransaction(
  fields: Pick<Transaction, 'type' | 'amount' | 'date' | 'category' | 'note' | 'source'> &
    Partial<Pick<Transaction, 'account' | 'toAccount' | 'quantity' | 'importHash'>>,
): Transaction {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    quantity: fields.quantity,
    importHash: fields.importHash ?? null,
    createdAt: now,
    updatedAt: now,
    ...fields,
  }
}
