import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { getCachedFile, isConfigured } from '@/lib/cache'
import { listDir } from '@/lib/github'
import { FINANCE_PATHS } from '@/lib/paths'
import { loadFile } from '@/lib/sync'
import * as actions from '@/lib/actions'
import { currentMonthKey, transactionsPath } from '@/lib/dates'
import type { Transaction } from '@/lib/types'
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
      const files = await listDir(FINANCE_PATHS.transactionsDir)
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

export function useTransactionMutations() {
  const queryClient = useQueryClient()
  return {
    saveAll: (txs: Transaction[]) => actions.saveTransactions(queryClient, txs),
    update: (previous: Transaction, next: Transaction) => actions.updateTransaction(queryClient, previous, next),
    remove: (tx: Transaction) => actions.deleteTransaction(queryClient, tx),
  }
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
