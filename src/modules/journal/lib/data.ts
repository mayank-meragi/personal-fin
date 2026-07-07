import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getCachedFile, isConfigured } from '@/lib/cache'
import { monthKey, toISODate } from '@/lib/dates'
import { listDir } from '@/lib/github'
import { JOURNAL_PATHS } from '@/lib/paths'
import { fileQueryKey } from '@/lib/queryKeys'
import { loadFile, updateFile } from '@/lib/sync'
import { useFileQuery } from '@/hooks/useData'
import type { JournalEntry, Task } from './types'

const emptyTasks: Task[] = []
const emptyEntries: JournalEntry[] = []

// ---- Actions (shared by hooks and the assistant's tools) ----

export function saveTask(qc: QueryClient, task: Task): void {
  const next = updateFile<Task[]>(JOURNAL_PATHS.tasks, emptyTasks, (current) => [
    ...current.filter((t) => t.id !== task.id),
    task,
  ])
  qc.setQueryData(fileQueryKey(JOURNAL_PATHS.tasks), next)
}

export function setTaskDone(qc: QueryClient, id: string, done: boolean): void {
  const next = updateFile<Task[]>(JOURNAL_PATHS.tasks, emptyTasks, (current) =>
    current.map((t) => (t.id === id ? { ...t, completedAt: done ? new Date().toISOString() : undefined } : t)),
  )
  qc.setQueryData(fileQueryKey(JOURNAL_PATHS.tasks), next)
}

export function deleteTask(qc: QueryClient, id: string): void {
  const next = updateFile<Task[]>(JOURNAL_PATHS.tasks, emptyTasks, (current) => current.filter((t) => t.id !== id))
  qc.setQueryData(fileQueryKey(JOURNAL_PATHS.tasks), next)
}

export function saveEntryText(qc: QueryClient, date: string, text: string): void {
  const path = JOURNAL_PATHS.entries(monthKey(date))
  const next = updateFile<JournalEntry[]>(path, emptyEntries, (current) => {
    const rest = current.filter((e) => e.date !== date)
    if (!text.trim()) return rest
    return [...rest, { date, text, updatedAt: new Date().toISOString() }].sort((a, b) => (a.date < b.date ? -1 : 1))
  })
  qc.setQueryData(fileQueryKey(path), next)
}

// ---- Hooks ----

export function useTasks() {
  const queryClient = useQueryClient()
  const { data } = useFileQuery<Task[]>(JOURNAL_PATHS.tasks, emptyTasks)
  return {
    tasks: data ?? emptyTasks,
    saveTask: (task: Task) => saveTask(queryClient, task),
    setTaskDone: (id: string, done: boolean) => setTaskDone(queryClient, id, done),
    deleteTask: (id: string) => deleteTask(queryClient, id),
  }
}

export function useEntry(date: string) {
  const queryClient = useQueryClient()
  const { data } = useFileQuery<JournalEntry[]>(JOURNAL_PATHS.entries(monthKey(date)), emptyEntries)
  return {
    entry: (data ?? emptyEntries).find((e) => e.date === date),
    saveText: (text: string) => saveEntryText(queryClient, date, text),
  }
}

export function useAllEntries(): { entries: JournalEntry[]; isReady: boolean } {
  const monthsQuery = useQuery({
    queryKey: ['journal-months'],
    queryFn: async () => {
      try {
        const files = await listDir(JOURNAL_PATHS.entriesDir)
        return files.map((f) => f.name.replace(/\.json$/, '')).filter((name) => /^\d{4}-\d{2}$/.test(name))
      } catch {
        // Offline (or dir doesn't exist yet) — at least the current month's
        // cached entries stay visible
        return [monthKey(new Date().toISOString())]
      }
    },
    enabled: isConfigured(),
    staleTime: 5 * 60_000,
    placeholderData: [monthKey(new Date().toISOString())],
  })
  const months = monthsQuery.data ?? []
  const results = useQueries({
    queries: months.map((month) => {
      const path = JOURNAL_PATHS.entries(month)
      return {
        queryKey: fileQueryKey(path),
        queryFn: () => loadFile<JournalEntry[]>(path, emptyEntries),
        enabled: isConfigured(),
        initialData: () => getCachedFile<JournalEntry[]>(path)?.content ?? emptyEntries,
        initialDataUpdatedAt: 0,
      }
    }),
  })
  return {
    entries: results
      .flatMap((r) => r.data ?? [])
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    isReady: monthsQuery.isFetched && results.every((r) => r.isFetchedAfterMount),
  }
}

// ---- Filters ----

function byDue(a: Task, b: Task): number {
  const ka = `${a.dueDate ?? '9999'}|${a.dueTime ?? '99'}|${a.createdAt}`
  const kb = `${b.dueDate ?? '9999'}|${b.dueTime ?? '99'}|${b.createdAt}`
  return ka < kb ? -1 : 1
}

/** Open tasks that belong on today's page: undated, due today, or overdue. */
export function openTasksFor(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => !t.completedAt && (!t.dueDate || t.dueDate <= today)).sort(byDue)
}

/** Open tasks with a future due date — invisible on today, listed under Upcoming. */
export function upcomingTasks(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => !t.completedAt && !!t.dueDate && t.dueDate > today).sort(byDue)
}

export function tasksCompletedOn(tasks: Task[], date: string): Task[] {
  return tasks
    // completedAt is UTC; compare on the local calendar date
    .filter((t) => t.completedAt && toISODate(new Date(t.completedAt)) === date)
    .sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? -1 : 1))
}
