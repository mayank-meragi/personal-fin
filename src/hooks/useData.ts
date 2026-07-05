import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCachedFile, isConfigured } from '../lib/cache'
import { loadFile, updateFile } from '../lib/sync'
import { defaultCategories } from '../defaults/categories'
import type { Account, AccountsFile, BudgetsFile, CategoriesFile, Category, SettingsFile } from '../lib/types'

export function fileQueryKey(path: string) {
  return ['file', path] as const
}

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

  function addCategory(category: Category) {
    const next = updateFile<CategoriesFile>('categories.json', defaultCategories, (current) => {
      if (current.categories.some((c) => c.id === category.id)) return current
      return { ...current, categories: [...current.categories, category] }
    })
    queryClient.setQueryData(fileQueryKey('categories.json'), next)
  }

  function updateCategory(id: string, patch: Partial<Pick<Category, 'name' | 'emoji' | 'hints' | 'savings'>>) {
    const next = updateFile<CategoriesFile>('categories.json', defaultCategories, (current) => ({
      ...current,
      categories: current.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
    queryClient.setQueryData(fileQueryKey('categories.json'), next)
  }

  return { categories: (data ?? defaultCategories).categories, addCategory, updateCategory }
}

const emptyAccounts: AccountsFile = { accounts: [] }

export function useAccounts() {
  const queryClient = useQueryClient()
  const query = useFileQuery<AccountsFile>('accounts.json', emptyAccounts)

  function mutate(updater: (current: AccountsFile) => AccountsFile) {
    const next = updateFile<AccountsFile>('accounts.json', emptyAccounts, updater)
    queryClient.setQueryData(fileQueryKey('accounts.json'), next)
  }

  function addAccounts(accounts: Account[]) {
    mutate((current) => ({
      ...current,
      accounts: [...current.accounts, ...accounts.filter((a) => !current.accounts.some((c) => c.id === a.id))],
    }))
  }

  function updateAccount(id: string, patch: Partial<Pick<Account, 'name' | 'startingBalance' | 'type'>>) {
    mutate((current) => ({
      ...current,
      accounts: current.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }))
  }

  return {
    accounts: query.data?.accounts ?? [],
    /** True once the remote has actually been checked (not just cache/fallback) */
    isReady: query.isFetchedAfterMount,
    addAccounts,
    updateAccount,
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

  function setMonthlyLimit(categoryId: string, limit: number | null) {
    const next = updateFile<BudgetsFile>('budgets.json', emptyBudgets, (current) => {
      const monthlyLimits = { ...current.monthlyLimits }
      if (limit === null || limit <= 0) delete monthlyLimits[categoryId]
      else monthlyLimits[categoryId] = limit
      return { ...current, monthlyLimits }
    })
    queryClient.setQueryData(fileQueryKey('budgets.json'), next)
  }

  return { budgets: data ?? emptyBudgets, setMonthlyLimit }
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
