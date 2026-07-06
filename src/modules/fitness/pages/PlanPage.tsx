import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Dumbbell, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { effectiveTodayISO } from '@/lib/dates'
import { AiError, NoAiKeyError, hasAiKey } from '@/lib/ai'
import { FITNESS_PATHS, HEALTH_PATHS } from '@/lib/paths'
import { getCachedFile } from '@/lib/cache'
import type { BodyMetric, SleepEntry } from '@/modules/health/lib/types'
import { useExercises } from '../lib/exerciseDb'
import { savePlan, saveProfile, useAllWorkouts, usePlan, useProfile } from '../lib/data'
import { generateNextWorkout } from '../lib/planner'
import { daysSince, lastSessionDate, setSummary } from '../lib/stats'
import type { FitnessMemoryFile, FitnessProfile } from '../lib/types'
import SetupChat from '../components/SetupChat'

const GOALS: { id: FitnessProfile['goal']; label: string }[] = [
  { id: 'build-muscle', label: 'Build muscle' },
  { id: 'strength', label: 'Get stronger' },
  { id: 'fat-loss', label: 'Lose fat' },
  { id: 'general-fitness', label: 'General fitness' },
]

const EXPERIENCE: FitnessProfile['experience'][] = ['beginner', 'intermediate', 'advanced']

const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebells', 'bands', 'e-z curl bar', 'medicine ball', 'exercise ball']

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-[var(--ink-900)] font-semibold text-white' : 'bg-[var(--surface-sunken)] text-[var(--text-body)] hover:bg-[var(--ink-100)]',
      )}
    >
      {children}
    </button>
  )
}

function ProfileForm({ initial, onSave }: { initial: FitnessProfile | null; onSave: (p: FitnessProfile) => void }) {
  const [goal, setGoal] = useState<FitnessProfile['goal']>(initial?.goal ?? 'build-muscle')
  const [experience, setExperience] = useState<FitnessProfile['experience']>(initial?.experience ?? 'beginner')
  const [daysPerWeek, setDaysPerWeek] = useState(initial?.daysPerWeek ?? 3)
  const [equipment, setEquipment] = useState<string[]>(initial?.equipment ?? ['barbell', 'dumbbell', 'machine', 'cable'])
  const [injuries, setInjuries] = useState(initial?.injuries ?? '')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{initial ? 'Training profile' : 'Set up your training profile'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Goal</Label>
          <div className="flex flex-wrap gap-1.5">
            {GOALS.map((g) => (
              <Chip key={g.id} active={goal === g.id} onClick={() => setGoal(g.id)}>
                {g.label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Experience</Label>
          <div className="flex flex-wrap gap-1.5">
            {EXPERIENCE.map((e) => (
              <Chip key={e} active={experience === e} onClick={() => setExperience(e)}>
                <span className="capitalize">{e}</span>
              </Chip>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="days">Sessions per week</Label>
          <Input
            id="days"
            type="number"
            min={1}
            max={7}
            className="w-24"
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Math.min(7, Math.max(1, Number(e.target.value) || 3)))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Equipment you can use (bodyweight is always included)</Label>
          <div className="flex flex-wrap gap-1.5">
            {EQUIPMENT.map((eq) => (
              <Chip
                key={eq}
                active={equipment.includes(eq)}
                onClick={() =>
                  setEquipment((prev) => (prev.includes(eq) ? prev.filter((x) => x !== eq) : [...prev, eq]))
                }
              >
                {eq}
              </Chip>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="injuries">Injuries or movements to avoid (optional)</Label>
          <Input
            id="injuries"
            placeholder="e.g. lower back — no heavy deadlifts"
            value={injuries}
            onChange={(e) => setInjuries(e.target.value)}
          />
        </div>
        <Button
          className="w-full bg-[var(--ink-900)]"
          onClick={() => onSave({ goal, experience, daysPerWeek, equipment, injuries: injuries.trim() || undefined })}
        >
          Save profile
        </Button>
      </CardContent>
    </Card>
  )
}

export default function PlanPage() {
  const qc = useQueryClient()
  const { profile, isReady } = useProfile()
  const { data: plan } = usePlan()
  const { sessions } = useAllWorkouts()
  const { data: exercises } = useExercises()
  const [editing, setEditing] = useState(false)
  const [manualSetup, setManualSetup] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const last = lastSessionDate(sessions)
  const gap = last ? daysSince(last, effectiveTodayISO()) : null

  async function generate() {
    if (!profile || !exercises || generating) return
    setGenerating(true)
    setError(null)
    try {
      const memory = getCachedFile<FitnessMemoryFile>(FITNESS_PATHS.memory)?.content.summary
      const metrics = getCachedFile<BodyMetric[]>(HEALTH_PATHS.metrics)?.content ?? []
      const sleep = getCachedFile<SleepEntry[]>(HEALTH_PATHS.sleep)?.content ?? []
      const workout = await generateNextWorkout({
        profile,
        history: sessions,
        exercises,
        memory,
        body: {
          weightKg: metrics[metrics.length - 1]?.weightKg,
          lastNightSleepHours: sleep.find((s) => s.date === effectiveTodayISO())?.hours,
        },
      })
      savePlan(qc, { next: workout, generatedAt: new Date().toISOString() })
    } catch (e) {
      setError(
        e instanceof NoAiKeyError
          ? 'Generating workouts needs an AI key — add one in Settings.'
          : e instanceof AiError
            ? e.message
            : 'Could not generate a workout — try again.',
      )
    } finally {
      setGenerating(false)
    }
  }

  if (!isReady && !profile) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
  }

  // First run: the AI trainer interviews you once; manual form as fallback/edit path
  if (!profile && !manualSetup && hasAiKey()) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight">Plan</h1>
        <SetupChat onDone={() => setManualSetup(false)} />
        <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground underline underline-offset-4"
          onClick={() => setManualSetup(true)}
        >
          Fill the form manually instead
        </button>
      </div>
    )
  }

  if (!profile || editing) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight">Plan</h1>
        <ProfileForm
          initial={profile}
          onSave={(p) => {
            saveProfile(qc, p)
            setEditing(false)
            setManualSetup(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Plan</h1>

      <Card>
        <CardContent className="flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-strong)]">
            {GOALS.find((g) => g.id === profile.goal)?.label} · <span className="capitalize">{profile.experience}</span> ·{' '}
            {profile.daysPerWeek}×/week
          </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile.equipment.join(', ') || 'bodyweight only'}
              {profile.injuries ? ` · avoid: ${profile.injuries}` : ''}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {last
          ? `Last workout ${gap === 0 ? 'today' : gap === 1 ? 'yesterday' : `${gap} days ago`} — the plan adapts to your actual consistency.`
          : 'No workouts yet — your first one will start easy.'}
      </p>

      {plan?.next ? (
        <Card className="ring-2 ring-[var(--ink-900)]/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Dumbbell className="size-4" /> Next: {plan.next.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {plan.next.rationale && <p className="text-xs text-muted-foreground">{plan.next.rationale}</p>}
            <div className="space-y-1">
              {plan.next.exercises.map((ex, i) => (
                <p key={i} className="flex justify-between gap-2 text-sm">
                  <span className="truncate text-[var(--text-body)]">{ex.name}</span>
                  <span className="shrink-0 font-mono text-xs font-bold tabular-nums">{setSummary(ex.sets)}</span>
                </p>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button asChild className="flex-1 bg-[var(--ink-900)]">
                <Link to="/fitness">Start workout</Link>
              </Button>
              <Button variant="outline" disabled={generating} onClick={() => void generate()}>
                <RefreshCw className={cn(generating && 'animate-spin')} /> Regenerate
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button className="w-full bg-[var(--ink-900)]" disabled={generating || !hasAiKey()} onClick={() => void generate()}>
          <Sparkles className={cn(generating && 'animate-pulse')} />
          {generating ? 'Building your workout…' : 'Generate next workout'}
        </Button>
      )}

      {!hasAiKey() && (
        <p className="text-center text-xs text-muted-foreground">Add an AI key in Settings to generate workouts.</p>
      )}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}
