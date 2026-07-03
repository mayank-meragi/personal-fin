import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCachedFile } from '../lib/cache'
import { loadFile, updateFile } from '../lib/sync'
import { defaultCategories } from '../defaults/categories'
import type { BudgetsFile, CategoriesFile, SettingsFile } from '../lib/types'

export function fileQueryKey(path: string) {
  return ['file', path] as const
}

/** Query a data file: cached copy shows instantly, remote revalidates in background. */
export function useFileQuery<T>(path: string, fallback: T) {
  return useQuery({
    queryKey: fileQueryKey(path),
    queryFn: () => loadFile<T>(path, fallback),
    // Cached copy renders instantly; updatedAt 0 marks it stale so the remote refetch still runs
    initialData: () => getCachedFile<T>(path)?.content ?? fallback,
    initialDataUpdatedAt: 0,
  })
}

export function useCategories(): CategoriesFile {
  const { data } = useFileQuery<CategoriesFile>('categories.json', defaultCategories)
  return data ?? defaultCategories
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
