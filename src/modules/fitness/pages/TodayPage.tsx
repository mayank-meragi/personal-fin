import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ClipboardList, Flag, Plus, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { todayISO } from '@/lib/dates'
import { AiError, NoAiKeyError } from '@/lib/ai'
import { FITNESS_PATHS } from '@/lib/paths'
import { getCachedFile } from '@/lib/cache'
import { updateFile } from '@/lib/sync'
import { exerciseById, useExercises } from '../lib/exerciseDb'
import { saveSession, savePlan, useAllWorkouts, usePlan } from '../lib/data'
import { generateFitnessMemory, parseQuickLog } from '../lib/planner'
import { sessionVolume, setSummary } from '../lib/stats'
import type { Exercise, FitnessMemoryFile, SessionExercise, WorkoutSession } from '../lib/types'
import { ExerciseThumb } from '../components/ExerciseImage'
import ExerciseDetail from '../components/ExerciseDetail'
import ExercisePicker from '../components/ExercisePicker'
import RestTimer from '../components/RestTimer'

/** Persist coach notes in the background after a session — best-effort. */
function refreshMemory(sessions: WorkoutSession[]) {
  const previous = getCachedFile<FitnessMemoryFile>(FITNESS_PATHS.memory)?.content.summary ?? ''
  void generateFitnessMemory(previous, sessions)
    .then((summary) => {
      updateFile<FitnessMemoryFile>(FITNESS_PATHS.memory, { summary: '', updatedAt: '', sessionCount: 0 }, () => ({
        summary,
        updatedAt: new Date().toISOString(),
        sessionCount: sessions.length,
      }))
    })
    .catch(() => {})
}

export default function TodayPage() {
  const qc = useQueryClient()
  const { data: plan } = usePlan()
  const { sessions } = useAllWorkouts()
  const { data: exercises } = useExercises()
  const byId = exerciseById(exercises ?? [])
  const today = todayISO()
  const doneToday = sessions.filter((s) => s.date === today)

  const [timer, setTimer] = useState<{ startedAt: number; seconds: number } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [detail, setDetail] = useState<Exercise | null>(null)
  const [quickLog, setQuickLog] = useState('')
  const [logging, setLogging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const workout = plan?.next ?? null

  function updateWorkout(mutate: (w: WorkoutSession) => WorkoutSession) {
    if (!workout) return
    savePlan(qc, { next: mutate(structuredClone(workout)), generatedAt: plan?.generatedAt })
  }

  function toggleSet(exIndex: number, setIndex: number) {
    if (!workout) return
    const set = workout.exercises[exIndex].sets[setIndex]
    const turningOn = !set.done
    updateWorkout((w) => {
      const target = w.exercises[exIndex].sets[setIndex]
      target.done = !target.done
      if (target.done) {
        target.reps = target.reps ?? target.targetReps
        target.weight = target.weight ?? target.targetWeight
      }
      if (!w.startedAt) w.startedAt = new Date().toISOString()
      return w
    })
    if (turningOn) {
      setTimer({ startedAt: Date.now(), seconds: workout.exercises[exIndex].restSeconds ?? 90 })
    }
  }

  function editSet(exIndex: number, setIndex: number, field: 'reps' | 'weight', value: string) {
    updateWorkout((w) => {
      const target = w.exercises[exIndex].sets[setIndex]
      const n = Number(value)
      target[field] = Number.isFinite(n) && n > 0 ? n : undefined
      return w
    })
  }

  function finish() {
    if (!workout) return
    const session: WorkoutSession = {
      ...workout,
      date: today,
      endedAt: new Date().toISOString(),
      startedAt: workout.startedAt ?? new Date().toISOString(),
    }
    saveSession(qc, session)
    savePlan(qc, { next: null })
    setTimer(null)
    refreshMemory([...sessions, session])
  }

  async function submitQuickLog() {
    const input = quickLog.trim()
    if (!input || logging) return
    setLogging(true)
    setNotice(null)
    try {
      const session = await parseQuickLog(input, exercises ?? [])
      saveSession(qc, session)
      setQuickLog('')
      setNotice(`Logged ${session.exercises.length} exercise${session.exercises.length > 1 ? 's' : ''}.`)
      refreshMemory([...sessions, session])
    } catch (e) {
      setNotice(
        e instanceof NoAiKeyError
          ? 'Quick log needs an AI key — add one in Settings.'
          : e instanceof AiError
            ? e.message
            : 'Could not log that.',
      )
    } finally {
      setLogging(false)
    }
  }

  const completedSets = workout?.exercises.reduce((n, ex) => n + ex.sets.filter((s) => s.done).length, 0) ?? 0
  const totalSets = workout?.exercises.reduce((n, ex) => n + ex.sets.length, 0) ?? 0

  return (
    <div className="space-y-3 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Today</h1>
        {workout && totalSets > 0 && (
          <p className="text-xs font-semibold text-muted-foreground">
            {completedSets}/{totalSets} sets
          </p>
        )}
      </div>

      {/* Completed sessions today */}
      {doneToday.map((s) => (
        <Card key={s.id} className="border-none bg-[var(--emerald-50)]">
          <CardContent className="flex items-center gap-3 py-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-[var(--emerald-600)] text-white">
              <Check className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--emerald-700)]">{s.name} — done</p>
              <p className="text-xs text-[var(--emerald-700)]/80">
                {s.exercises.length} exercises · volume {Math.round(sessionVolume(s)).toLocaleString('en-IN')}kg
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Active workout checklist */}
      {workout ? (
        <>
          <Card>
            <CardContent className="space-y-1 py-3">
              <p className="text-base font-bold text-[var(--text-strong)]">{workout.name}</p>
              {workout.focus && workout.focus.length > 0 && (
                <p className="text-xs text-muted-foreground capitalize">{workout.focus.join(' · ')}</p>
              )}
              {workout.rationale && <p className="text-xs text-muted-foreground">{workout.rationale}</p>}
            </CardContent>
          </Card>

          {workout.exercises.map((ex, exIndex) => (
            <Card key={`${ex.exerciseId}-${exIndex}`}>
              <CardContent className="space-y-2 py-3">
                <div className="flex items-center gap-2.5">
                  <button type="button" onClick={() => setDetail(byId.get(ex.exerciseId) ?? null)}>
                    <ExerciseThumb exercise={byId.get(ex.exerciseId)} className="size-12" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{ex.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {setSummary(ex.sets)} · rest {ex.restSeconds ?? 90}s
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${ex.name}`}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-[var(--surface-sunken)]"
                    onClick={() => updateWorkout((w) => ({ ...w, exercises: w.exercises.filter((_, i) => i !== exIndex) }))}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="space-y-1">
                  {ex.sets.map((set, setIndex) => (
                    <div
                      key={setIndex}
                      className={cn(
                        'flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5',
                        set.done ? 'bg-[var(--emerald-50)]' : 'bg-[var(--surface-sunken)]',
                      )}
                    >
                      <span className="w-5 text-center text-xs font-bold text-muted-foreground">{setIndex + 1}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="w-14 rounded-md bg-white/70 px-1.5 py-1 text-center font-mono text-sm tabular-nums outline-none"
                        value={set.done ? (set.reps ?? '') : (set.reps ?? set.targetReps)}
                        onChange={(e) => editSet(exIndex, setIndex, 'reps', e.target.value)}
                        aria-label="reps"
                      />
                      <span className="text-xs text-muted-foreground">reps</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        className="w-16 rounded-md bg-white/70 px-1.5 py-1 text-center font-mono text-sm tabular-nums outline-none"
                        value={set.done ? (set.weight ?? '') : (set.weight ?? set.targetWeight ?? '')}
                        placeholder="bw"
                        onChange={(e) => editSet(exIndex, setIndex, 'weight', e.target.value)}
                        aria-label="weight"
                      />
                      <span className="flex-1 text-xs text-muted-foreground">kg</span>
                      <button
                        type="button"
                        aria-label={set.done ? 'Mark set not done' : 'Mark set done'}
                        onClick={() => toggleSet(exIndex, setIndex)}
                        className={cn(
                          'flex size-8 items-center justify-center rounded-full transition-colors',
                          set.done
                            ? 'bg-[var(--emerald-600)] text-white'
                            : 'bg-white text-muted-foreground ring-1 ring-[var(--border-default)]',
                        )}
                      >
                        <Check className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPickerOpen(true)}>
              <Plus /> Add exercise
            </Button>
            <Button className="flex-1 bg-[var(--ink-900)]" disabled={completedSets === 0} onClick={finish}>
              <Flag /> Finish workout
            </Button>
          </div>
        </>
      ) : (
        doneToday.length === 0 && (
          <Card>
            <CardContent className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">No workout planned.</p>
              <Button asChild className="bg-[var(--ink-900)]">
                <Link to="/fitness/plan">
                  <Sparkles /> Generate today's workout
                </Link>
              </Button>
            </CardContent>
          </Card>
        )
      )}

      {doneToday.length > 0 && !workout && (
        <Button asChild variant="outline" className="w-full">
          <Link to="/fitness/plan">
            <ClipboardList /> Plan the next one
          </Link>
        </Button>
      )}

      {/* Quick log */}
      <Card>
        <CardContent className="space-y-2 py-3">
          <p className="text-xs font-semibold text-muted-foreground">Quick log (already trained?)</p>
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-full bg-[var(--surface-sunken)] px-4 py-2 text-sm outline-none"
              placeholder='"bench 3x8 60kg, squats 5x5 80"'
              value={quickLog}
              disabled={logging}
              onChange={(e) => setQuickLog(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitQuickLog()
              }}
            />
            <Button size="sm" className="rounded-full" disabled={logging || !quickLog.trim()} onClick={() => void submitQuickLog()}>
              {logging ? '…' : 'Log'}
            </Button>
          </div>
          {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
        </CardContent>
      </Card>

      <RestTimer timer={timer} onDone={() => setTimer(null)} />
      <ExercisePicker
        open={pickerOpen}
        muscles={workout?.focus}
        onPick={(e) => {
          setPickerOpen(false)
          const entry: SessionExercise = {
            exerciseId: e.id,
            name: e.name,
            restSeconds: 90,
            sets: [
              { targetReps: 10, done: false },
              { targetReps: 10, done: false },
              { targetReps: 10, done: false },
            ],
          }
          updateWorkout((w) => ({ ...w, exercises: [...w.exercises, entry] }))
        }}
        onClose={() => setPickerOpen(false)}
      />
      <ExerciseDetail exercise={detail} sessions={sessions} onClose={() => setDetail(null)} />
    </div>
  )
}
