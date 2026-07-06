import { Flame } from 'lucide-react'
import { effectiveTodayISO } from '@/lib/dates'
import { useAllWorkouts, usePlan, useProfile } from '../lib/data'
import { currentStreak, daysSince, lastSessionDate, thisWeekCount } from '../lib/stats'

/** Live headline on the hub card. */
export default function FitnessCard() {
  const { profile } = useProfile()
  const { data: plan } = usePlan()
  const { sessions } = useAllWorkouts()
  const today = effectiveTodayISO()

  const doneToday = sessions.some((s) => s.date === today)
  const streak = currentStreak(sessions, today)
  const week = thisWeekCount(sessions, today)
  const last = lastSessionDate(sessions)

  const headline = doneToday
    ? 'Workout done today'
    : plan?.next
      ? `${plan.next.name} ready · ${plan.next.exercises.length} exercises`
      : !profile
        ? 'Set up your training profile'
        : last
          ? `Last workout ${daysSince(last, today)}d ago — generate the next one`
          : 'Generate your first workout'

  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="perfin-eyebrow text-[var(--text-subtle)]">Workouts</p>
        <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{headline}</p>
      </div>
      {(streak > 0 || week > 0) && (
        <p className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
          <Flame className="size-3.5 text-[var(--viz-3)]" />
          {streak > 0 ? `${streak}-day streak` : `${week} this week`}
        </p>
      )}
    </div>
  )
}
