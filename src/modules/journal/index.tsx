import { History, ListChecks, NotebookPen, Sun } from 'lucide-react'
import { effectiveTodayISO } from '@/lib/dates'
import type { ModuleDef } from '../types'
import { openTasksFor, useEntry, useTasks } from './lib/data'
import TodayPage from './pages/TodayPage'
import TasksPage from './pages/TasksPage'
import HistoryPage from './pages/HistoryPage'

function JournalCard() {
  const today = effectiveTodayISO()
  const { tasks } = useTasks()
  const { entry } = useEntry(today)
  const open = openTasksFor(tasks, today).length
  return (
    <div>
      <p className="perfin-eyebrow text-[var(--text-subtle)]">Today</p>
      <p className="text-sm font-semibold text-[var(--text-strong)]">
        {open > 0 ? `${open} open task${open === 1 ? '' : 's'}` : 'All tasks done'}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {entry?.text ? entry.text.split('\n')[0] : 'no note yet today'}
      </p>
    </div>
  )
}

export const journalModule: ModuleDef = {
  id: 'journal',
  name: 'Journal',
  icon: NotebookPen,
  tagline: 'Daily notes & tasks',
  routes: [
    { path: '/journal', element: TodayPage },
    { path: '/journal/tasks', element: TasksPage },
    { path: '/journal/history', element: HistoryPage },
  ],
  navItems: [
    { to: '/journal', label: 'Today', icon: Sun, end: true },
    { to: '/journal/tasks', label: 'Tasks', icon: ListChecks },
    { to: '/journal/history', label: 'History', icon: History },
  ],
  card: JournalCard,
}
