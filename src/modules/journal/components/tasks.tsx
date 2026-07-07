import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { effectiveTodayISO } from '@/lib/dates'
import { parseTask } from '../lib/ai'
import { openTasksFor, useTasks } from '../lib/data'
import type { Task } from '../lib/types'

/** "today" / "tomorrow" / "in 3 days" nearby, "15 Jul" beyond; overdue reads red. */
function dueLabel(dueDate: string, today: string): { text: string; overdue: boolean } {
  const days = Math.round((Date.parse(dueDate) - Date.parse(today)) / 86_400_000)
  const short = new Date(`${dueDate}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  if (days < 0) return { text: short, overdue: true }
  if (days === 0) return { text: 'today', overdue: false }
  if (days === 1) return { text: 'tomorrow', overdue: false }
  if (days <= 6) return { text: `in ${days} days`, overdue: false }
  return { text: short, overdue: false }
}

/**
 * One editable task row: toggle, inline text edit, delete; the due date sits
 * on a second line as a small relative label with an invisible native date
 * input overlaid, so tapping it still opens the picker. Saves flow straight
 * through the sync layer (which already debounces the push), same as the
 * accounts editor.
 */
export function TaskRow({ task, today }: { task: Task; today: string }) {
  const { saveTask, setTaskDone, deleteTask } = useTasks()
  const due = task.dueDate ? dueLabel(task.dueDate, task.completedAt ? task.dueDate : today) : null
  return (
    <div className="py-1">
      <div className="flex items-center gap-2.5">
        <Checkbox
          checked={!!task.completedAt}
          onCheckedChange={(v) => setTaskDone(task.id, v === true)}
          aria-label={`Mark "${task.text}" ${task.completedAt ? 'not done' : 'done'}`}
        />
        <input
          className={`h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 ${
            task.completedAt ? 'text-muted-foreground line-through' : ''
          }`}
          value={task.text}
          onChange={(e) => saveTask({ ...task, text: e.target.value })}
          aria-label="Task text"
        />
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground/50 hover:text-destructive"
          aria-label={`Delete ${task.text}`}
          onClick={() => deleteTask(task.id)}
        >
          <X />
        </Button>
      </div>
      {!task.completedAt && (
        <div className="flex items-center pl-[26px]">
          <span
            className={`relative inline-flex items-center gap-1 text-[11px] font-medium ${
              due?.overdue ? 'text-[var(--negative-600)]' : 'text-muted-foreground/80'
            }`}
          >
            {due ? (
              <>
                {due.text}
                {task.dueTime ? ` · ${task.dueTime}` : ''}
              </>
            ) : (
              <CalendarPlus className="size-3.5 text-muted-foreground/40" aria-hidden />
            )}
            <input
              type="date"
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              value={task.dueDate ?? ''}
              onChange={(e) => {
                const dueDate = e.target.value || undefined
                saveTask({ ...task, dueDate, dueTime: dueDate ? task.dueTime : undefined })
              }}
              aria-label="Due date"
            />
          </span>
        </div>
      )}
    </div>
  )
}

export function TaskAdd() {
  const { saveTask } = useTasks()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    const raw = text.trim()
    if (!raw || busy) return
    setBusy(true)
    try {
      const parsed = await parseTask(raw)
      saveTask({
        id: crypto.randomUUID(),
        text: parsed.text,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
        createdAt: new Date().toISOString(),
      })
      setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        className="h-9 min-w-0 flex-1"
        placeholder='Add a task — "sort hyderabad marketing monday 11am"'
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void add()
        }}
      />
      <Button size="icon-sm" className="h-9 w-9 shrink-0" disabled={busy || !text.trim()} onClick={() => void add()} aria-label="Add task">
        <Plus className={busy ? 'animate-pulse' : ''} />
      </Button>
    </div>
  )
}

/** The hub's task list: today's open tasks (undated, due, overdue), capped. */
export function TodayTasks({ max = 6 }: { max?: number }) {
  const today = effectiveTodayISO()
  const { tasks } = useTasks()
  const open = openTasksFor(tasks, today)
  const shown = open.slice(0, max)
  const hidden = open.length - shown.length

  if (open.length === 0) {
    return <p className="py-1 text-sm text-muted-foreground/70">Nothing on the list — add one above.</p>
  }
  return (
    <div>
      <div className="divide-y divide-[var(--border-subtle)]/60">
        {shown.map((t) => (
          <TaskRow key={t.id} task={t} today={today} />
        ))}
      </div>
      {hidden > 0 && (
        <Link to="/journal/tasks" className="mt-1 block text-xs font-semibold text-[var(--brand)]">
          +{hidden} more task{hidden === 1 ? '' : 's'}
        </Link>
      )}
    </div>
  )
}
