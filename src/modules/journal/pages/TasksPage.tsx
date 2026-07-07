import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { effectiveTodayISO, toISODate } from '@/lib/dates'
import { TaskAdd, TaskRow } from '../components/tasks'
import { openTasksFor, upcomingTasks, useTasks } from '../lib/data'

export default function TasksPage() {
  const today = effectiveTodayISO()
  const { tasks } = useTasks()
  const open = openTasksFor(tasks, today)
  const upcoming = upcomingTasks(tasks, today)
  const done = tasks
    .filter((t) => t.completedAt)
    .sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1))
    .slice(0, 20)

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Tasks</h1>

      <Card>
        <CardContent className="space-y-3">
          <TaskAdd />
          {open.length > 0 ? (
            <div className="divide-y divide-[var(--border-subtle)]/60">
              {open.map((t) => (
                <TaskRow key={t.id} task={t} today={today} />
              ))}
            </div>
          ) : (
            <p className="py-1 text-sm text-muted-foreground/70">Nothing open — enjoy it.</p>
          )}
        </CardContent>
      </Card>

      {upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Upcoming</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-[var(--border-subtle)]/60">
              {upcoming.map((t) => (
                <TaskRow key={t.id} task={t} today={today} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {done.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-[var(--border-subtle)]/60">
              {done.map((t) => (
                <TaskRow key={t.id} task={t} today={today} />
              ))}
            </div>
            <p className="pt-2 text-xs text-muted-foreground/70">
              Last {done.length} · completed {done[0]?.completedAt ? toISODate(new Date(done[0].completedAt)) : ''} and earlier
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
