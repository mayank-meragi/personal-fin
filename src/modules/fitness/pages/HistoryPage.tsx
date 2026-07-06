import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { todayISO } from '@/lib/dates'
import { exerciseById, useExercises } from '../lib/exerciseDb'
import { deleteSession, useAllWorkouts } from '../lib/data'
import { currentStreak, daysSince, formatSet, personalRecords, sessionVolume, setSummary, thisWeekCount, volumeByMuscle } from '../lib/stats'
import type { WorkoutSession } from '../lib/types'
import SessionEditDialog from '../components/SessionEditDialog'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-[var(--radius-lg)] bg-[var(--surface-card)] p-3 ring-1 ring-[var(--border-subtle)]">
      <p className="font-mono text-lg font-bold text-[var(--text-strong)] tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function SessionCard({ session, onEdit, onDelete }: { session: WorkoutSession; onEdit: () => void; onDelete: () => void }) {
  const volume = Math.round(sessionVolume(session))
  const duration =
    session.startedAt && session.endedAt
      ? Math.max(1, Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 60_000))
      : null
  return (
    <Card>
      <CardContent className="space-y-1.5 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--text-strong)]">{session.name}</p>
          <p className="shrink-0 text-xs text-muted-foreground">
            {new Date(session.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            {duration ? ` · ${duration}m` : ''}
          </p>
        </div>
        <div className="space-y-0.5">
          {session.exercises.map((ex, i) => {
            const done = ex.sets.filter((s) => s.done)
            return (
              <p key={i} className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{ex.name}</span>
                <span className="shrink-0 font-mono tabular-nums">
                  {done.length > 0 ? done.map(formatSet).join(' ') : `skipped ${setSummary(ex.sets)}`}
                </span>
              </p>
            )
          })}
        </div>
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs font-semibold text-muted-foreground">
            volume {volume.toLocaleString('en-IN')}kg
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Edit session"
              onClick={onEdit}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-[var(--surface-sunken)] hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete session"
              onClick={onDelete}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-[var(--surface-sunken)] hover:text-red-600"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function HistoryPage() {
  const qc = useQueryClient()
  const { sessions } = useAllWorkouts()
  const { data: exercises } = useExercises()
  const [showAllPrs, setShowAllPrs] = useState(false)
  const [editing, setEditing] = useState<WorkoutSession | null>(null)
  const today = todayISO()
  const newest = [...sessions].reverse()
  const prs = personalRecords(sessions)
  const weekSessions = sessions.filter((s) => daysSince(s.date, today) < 7)
  const muscles = volumeByMuscle(weekSessions, exerciseById(exercises ?? []))
  const maxSets = muscles[0]?.sets ?? 0

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">History</h1>

      <div className="flex gap-2">
        <Stat label="this week" value={String(thisWeekCount(sessions, today))} />
        <Stat label="streak" value={String(currentStreak(sessions, today))} />
        <Stat
          label="week volume"
          value={`${Math.round(weekSessions.reduce((s, x) => s + sessionVolume(x), 0) / 1000)}t`}
        />
      </div>

      {muscles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sets this week by muscle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {muscles.slice(0, 8).map((m) => (
              <div key={m.muscle} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-xs text-muted-foreground capitalize">{m.muscle}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  <div
                    className="h-full rounded-full bg-[var(--viz-1)]"
                    style={{ width: `${(m.sets / maxSets) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right font-mono text-xs font-bold tabular-nums">{m.sets}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {prs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Trophy className="size-4 text-[var(--viz-3)]" /> Personal records
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {(showAllPrs ? prs : prs.slice(0, 5)).map((pr) => (
              <p key={pr.exerciseId} className="flex justify-between gap-2 text-sm">
                <span className="truncate text-[var(--text-body)]">{pr.name}</span>
                <span className="shrink-0 font-mono text-xs font-bold tabular-nums">
                  {pr.weight}kg × {pr.reps} <span className="text-muted-foreground">(e1RM {pr.e1rm})</span>
                </span>
              </p>
            ))}
            {prs.length > 5 && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAllPrs((v) => !v)}>
                {showAllPrs ? 'Show less' : `Show all ${prs.length}`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {newest.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            onEdit={() => setEditing(s)}
            onDelete={() => {
              if (confirm(`Delete "${s.name}" from ${s.date}?`)) deleteSession(qc, s)
            }}
          />
        ))}
        {sessions.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No workouts logged yet — your history builds here.
          </p>
        )}
      </div>

      <SessionEditDialog session={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
