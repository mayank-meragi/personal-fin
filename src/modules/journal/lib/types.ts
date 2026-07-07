/** One free-text note per calendar date. */
export interface JournalEntry {
  date: string // YYYY-MM-DD
  text: string
  updatedAt: string
}

/**
 * A task is a flat list item, not owned by a day: "today's tasks" is a
 * filter (open + due on or before today), so unfinished tasks roll forward
 * with no data mutation.
 */
export interface Task {
  id: string
  text: string
  dueDate?: string // YYYY-MM-DD
  dueTime?: string // HH:MM 24h
  createdAt: string
  completedAt?: string
}
