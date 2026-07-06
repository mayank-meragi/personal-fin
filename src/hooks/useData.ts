import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCachedFile, isConfigured } from '../lib/cache'
import { loadFile } from '../lib/sync'
import * as actions from '../lib/actions'
import { defaultCategories } from '../defaults/categories'
import type { Account, AccountsFile, BudgetsFile, CategoriesFile, Category, SettingsFile } from '../lib/types'

export { fileQueryKey } from '../lib/queryKeys'
import { fileQueryKey } from '../lib/queryKeys'

/** Query a data file: cached copy shows instantly, remote revalidates in background. */
export function useFileQuery<T>(path: string, fallback: T) {
  return useQuery({
    queryKey: fileQueryKey(path),
    queryFn: () => loadFile<T>(path, fallback),
    // Don't fire before onboarding has stored a token
    enabled: isConfigured(),
    // Cached copy renders instantly; updatedAt 0 marks it stale so the remote refetch still runs
    initialData: () => getCachedFile<T>(path)?.content ?? fallback,
    initialDataUpdatedAt: 0,
  })
}

export function useCategories() {
  const queryClient = useQueryClient()
  const { data } = useFileQuery<CategoriesFile>('categories.json', defaultCategories)
  return {
    categories: (data ?? defaultCategories).categories,
    addCategory: (category: Category) => actions.addCategory(queryClient, category),
    updateCategory: (id: string, patch: Partial<Pick<Category, 'name' | 'emoji' | 'hints' | 'savings'>>) =>
      actions.updateCategory(queryClient, id, patch),
  }
}

const emptyAccounts: AccountsFile = { accounts: [] }

export function useAccounts() {
  const queryClient = useQueryClient()
  const query = useFileQuery<AccountsFile>('accounts.json', emptyAccounts)
  return {
    accounts: query.data?.accounts ?? [],
    /** True once the remote has actually been checked (not just cache/fallback) */
    isReady: query.isFetchedAfterMount,
    addAccounts: (accounts: Account[]) => actions.addAccounts(queryClient, accounts),
    updateAccount: (id: string, patch: Partial<Pick<Account, 'name' | 'startingBalance' | 'type'>>) =>
      actions.updateAccount(queryClient, id, patch),
  }
}

export function makeAccountId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'account'
  )
}

const emptyBudgets: BudgetsFile = { monthlyLimits: {}, overrides: {} }

export function useBudgets() {
  const queryClient = useQueryClient()
  const { data } = useFileQuery<BudgetsFile>('budgets.json', emptyBudgets)
  return {
    budgets: data ?? emptyBudgets,
    setMonthlyLimit: (categoryId: string, limit: number | null) =>
      actions.setBudgetLimit(queryClient, categoryId, limit),
  }
}

/** Effective limit for a category in a month, honoring per-month overrides. */
export function effectiveLimit(budgets: BudgetsFile, month: string, categoryId: string): number | undefined {
  return budgets.overrides[month]?.[categoryId] ?? budgets.monthlyLimits[categoryId]
}

const fallbackSettings: SettingsFile = { schemaVersion: 1, currency: 'INR', startOfMonth: 1 }

export function useSettings(): SettingsFile {
  const { data } = useFileQuery<SettingsFile>('settings.json', fallbackSettings)
  return data ?? fallbackSettings
}
