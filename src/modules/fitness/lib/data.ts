import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getCachedFile, isConfigured } from '@/lib/cache'
import { monthKey } from '@/lib/dates'
import { listDir } from '@/lib/github'
import { FITNESS_PATHS } from '@/lib/paths'
import { fileQueryKey } from '@/lib/queryKeys'
import { loadFile, updateFile } from '@/lib/sync'
import { useFileQuery } from '@/hooks/useData'
import type { FitnessProfile, PlanFile, WorkoutSession } from './types'

const emptySessions: WorkoutSession[] = []
const emptyPlan: PlanFile = { next: null }

// ---- Actions (shared by hooks and the assistant's tools) ----

export function saveSession(qc: QueryClient, session: WorkoutSession): void {
  const path = FITNESS_PATHS.workouts(monthKey(session.date))
  const next = updateFile<WorkoutSession[]>(path, emptySessions, (current) => {
    const rest = current.filter((s) => s.id !== session.id)
    return [...rest, session].sort((a, b) => (a.date < b.date ? -1 : 1))
  })
  qc.setQueryData(fileQueryKey(path), next)
  qc.invalidateQueries({ queryKey: ['workout-months'] })
}

export function deleteSession(qc: QueryClient, session: WorkoutSession): void {
  const path = FITNESS_PATHS.workouts(monthKey(session.date))
  const next = updateFile<WorkoutSession[]>(path, emptySessions, (current) =>
    current.filter((s) => s.id !== session.id),
  )
  qc.setQueryData(fileQueryKey(path), next)
}

export function savePlan(qc: QueryClient, plan: PlanFile): void {
  const next = updateFile<PlanFile>(FITNESS_PATHS.plan, emptyPlan, () => plan)
  qc.setQueryData(fileQueryKey(FITNESS_PATHS.plan), next)
}

export function saveProfile(qc: QueryClient, profile: FitnessProfile): void {
  const next = updateFile<FitnessProfile | null>(FITNESS_PATHS.profile, null, () => profile)
  qc.setQueryData(fileQueryKey(FITNESS_PATHS.profile), next)
}

// ---- Hooks ----

export function usePlan() {
  return useFileQuery<PlanFile>(FITNESS_PATHS.plan, emptyPlan)
}

export function useProfile() {
  const query = useFileQuery<FitnessProfile | null>(FITNESS_PATHS.profile, null)
  return { profile: query.data ?? null, isReady: query.isFetchedAfterMount }
}

/** Every logged session across all months, newest date last. */
export function useAllWorkouts(): { sessions: WorkoutSession[]; isReady: boolean } {
  const monthsQuery = useQuery({
    queryKey: ['workout-months'],
    queryFn: async () => {
      const files = await listDir(FITNESS_PATHS.workoutsDir)
      return files
        .map((f) => f.name.replace(/\.json$/, ''))
        .filter((name) => /^\d{4}-\d{2}$/.test(name))
    },
    enabled: isConfigured(),
    staleTime: 5 * 60_000,
    placeholderData: [monthKey(new Date().toISOString())],
  })
  const months = monthsQuery.data ?? []
  const results = useQueries({
    queries: months.map((month) => {
      const path = FITNESS_PATHS.workouts(month)
      return {
        queryKey: fileQueryKey(path),
        queryFn: () => loadFile<WorkoutSession[]>(path, emptySessions),
        enabled: isConfigured(),
        initialData: () => getCachedFile<WorkoutSession[]>(path)?.content ?? emptySessions,
        initialDataUpdatedAt: 0,
      }
    }),
  })
  const sessions = months
    .flatMap((_, i) => results[i].data ?? emptySessions)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  return { sessions, isReady: monthsQuery.isFetchedAfterMount }
}

export function useWorkoutMutations() {
  const qc = useQueryClient()
  return {
    save: (session: WorkoutSession) => saveSession(qc, session),
    remove: (session: WorkoutSession) => deleteSession(qc, session),
    setPlan: (plan: PlanFile) => savePlan(qc, plan),
    setProfile: (profile: FitnessProfile) => saveProfile(qc, profile),
  }
}
