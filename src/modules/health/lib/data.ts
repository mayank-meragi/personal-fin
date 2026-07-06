import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { monthKey } from '@/lib/dates'
import { HEALTH_PATHS } from '@/lib/paths'
import { fileQueryKey } from '@/lib/queryKeys'
import { updateFile } from '@/lib/sync'
import { useFileQuery } from '@/hooks/useData'
import type { BodyMetric, Meal, NutritionTargets, SleepEntry } from './types'

const emptyMetrics: BodyMetric[] = []
const emptyMeals: Meal[] = []
const emptySleep: SleepEntry[] = []

// ---- Actions (shared by hooks and assistant tools) ----

function upsertSorted<T extends { id: string; date: string }>(list: T[], entry: T): T[] {
  return [...list.filter((x) => x.id !== entry.id), entry].sort((a, b) => (a.date < b.date ? -1 : 1))
}

export function saveMetric(qc: QueryClient, metric: BodyMetric): void {
  const next = updateFile<BodyMetric[]>(HEALTH_PATHS.metrics, emptyMetrics, (current) => upsertSorted(current, metric))
  qc.setQueryData(fileQueryKey(HEALTH_PATHS.metrics), next)
}

export function deleteMetric(qc: QueryClient, id: string): void {
  const next = updateFile<BodyMetric[]>(HEALTH_PATHS.metrics, emptyMetrics, (current) => current.filter((m) => m.id !== id))
  qc.setQueryData(fileQueryKey(HEALTH_PATHS.metrics), next)
}

export function saveMeal(qc: QueryClient, meal: Meal): void {
  const path = HEALTH_PATHS.meals(monthKey(meal.date))
  const next = updateFile<Meal[]>(path, emptyMeals, (current) => upsertSorted(current, meal))
  qc.setQueryData(fileQueryKey(path), next)
}

export function deleteMeal(qc: QueryClient, meal: Meal): void {
  const path = HEALTH_PATHS.meals(monthKey(meal.date))
  const next = updateFile<Meal[]>(path, emptyMeals, (current) => current.filter((m) => m.id !== meal.id))
  qc.setQueryData(fileQueryKey(path), next)
}

export function saveSleep(qc: QueryClient, entry: SleepEntry): void {
  const next = updateFile<SleepEntry[]>(HEALTH_PATHS.sleep, emptySleep, (current) => {
    // One entry per wake date — logging again replaces it
    const rest = current.filter((s) => s.id !== entry.id && s.date !== entry.date)
    return [...rest, entry].sort((a, b) => (a.date < b.date ? -1 : 1))
  })
  qc.setQueryData(fileQueryKey(HEALTH_PATHS.sleep), next)
}

export function deleteSleep(qc: QueryClient, id: string): void {
  const next = updateFile<SleepEntry[]>(HEALTH_PATHS.sleep, emptySleep, (current) => current.filter((s) => s.id !== id))
  qc.setQueryData(fileQueryKey(HEALTH_PATHS.sleep), next)
}

export function saveTargets(qc: QueryClient, targets: NutritionTargets): void {
  const next = updateFile<NutritionTargets | null>(HEALTH_PATHS.targets, null, () => targets)
  qc.setQueryData(fileQueryKey(HEALTH_PATHS.targets), next)
}

// ---- Hooks ----

export function useMetrics() {
  const { data } = useFileQuery<BodyMetric[]>(HEALTH_PATHS.metrics, emptyMetrics)
  return data ?? emptyMetrics
}

export function useMealsMonth(month: string) {
  const { data } = useFileQuery<Meal[]>(HEALTH_PATHS.meals(month), emptyMeals)
  return data ?? emptyMeals
}

export function useSleep() {
  const { data } = useFileQuery<SleepEntry[]>(HEALTH_PATHS.sleep, emptySleep)
  return data ?? emptySleep
}

export function useTargets() {
  const { data } = useFileQuery<NutritionTargets | null>(HEALTH_PATHS.targets, null)
  return data ?? null
}

export function useHealthMutations() {
  const qc = useQueryClient()
  return {
    addMetric: (m: BodyMetric) => saveMetric(qc, m),
    removeMetric: (id: string) => deleteMetric(qc, id),
    addMeal: (m: Meal) => saveMeal(qc, m),
    removeMeal: (m: Meal) => deleteMeal(qc, m),
    addSleep: (s: SleepEntry) => saveSleep(qc, s),
    removeSleep: (id: string) => deleteSleep(qc, id),
    setTargets: (t: NutritionTargets) => saveTargets(qc, t),
  }
}
