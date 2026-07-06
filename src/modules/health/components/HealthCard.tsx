import { Moon, Scale } from 'lucide-react'
import { effectiveTodayISO, monthKey } from '@/lib/dates'
import { useMealsMonth, useMetrics, useSleep, useTargets } from '../lib/data'

/** Live headline on the hub card. */
export default function HealthCard() {
  const today = effectiveTodayISO()
  const meals = useMealsMonth(monthKey(today))
  const targets = useTargets()
  const metrics = useMetrics()
  const sleep = useSleep()

  const todayMeals = meals.filter((m) => m.date === today)
  const calories = todayMeals.reduce((s, m) => s + m.calories, 0)
  const protein = todayMeals.reduce((s, m) => s + m.proteinG, 0)
  const latest = metrics[metrics.length - 1]
  const lastNight = sleep.find((s) => s.date === today)

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="perfin-eyebrow text-[var(--text-subtle)]">Today's food</p>
        <p className="font-mono text-sm font-bold tabular-nums text-[var(--text-strong)]">
          {calories}
          {targets ? `/${targets.calories}` : ''} kcal · {protein}
          {targets ? `/${targets.proteinG}` : ''}g
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Scale className="size-3.5" />
          {latest ? `${latest.weightKg} kg` : 'no weigh-in'}
        </span>
        <span className="flex items-center gap-1">
          <Moon className="size-3.5" />
          {lastNight ? `${lastNight.hours}h` : 'not logged'}
        </span>
      </div>
    </div>
  )
}
