import type { QueryClient } from '@tanstack/react-query'
import { getCachedFile } from './cache'
import { effectiveTodayISO, monthKey } from './dates'
import { AiError, generateJson } from './llm'
import { FINANCE_PATHS, FITNESS_PATHS, HEALTH_PATHS } from './paths'
import { fileQueryKey } from './queryKeys'
import type { Transaction } from './types'
import type { FitnessProfile, PlanFile, WorkoutSession } from '@/modules/fitness/lib/types'
import { daysSince, thisWeekCount } from '@/modules/fitness/lib/stats'
import { inferMealType } from '@/modules/health/lib/nutrition'
import type { BodyMetric, Meal, NutritionTargets, SleepEntry } from '@/modules/health/lib/types'

export type BriefingArea = 'money' | 'food' | 'workout' | 'sleep'

export interface Briefing {
  headline: string
  items: { area: BriefingArea; text: string }[]
  nudge: string
  generatedAt: string
  /** the human day it was generated for (00:30 = yesterday) */
  day: string
  daypart: Daypart
}

type Daypart = 'morning' | 'afternoon' | 'evening'

function daypartNow(): Daypart {
  const hour = new Date().getHours()
  if (hour < 4) return 'evening' // past midnight = still the previous evening
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

function readFile<T>(qc: QueryClient, path: string, fallback: T): T {
  return qc.getQueryData<T>(fileQueryKey(path)) ?? getCachedFile<T>(path)?.content ?? fallback
}

/** Everything the model needs, computed deterministically — it coaches, we count. */
function buildContext(qc: QueryClient): string {
  // The human day: 00:30 still belongs to yesterday's evening
  const today = effectiveTodayISO()
  const month = monthKey(today)

  // Money
  const monthTx = readFile<Transaction[]>(qc, FINANCE_PATHS.transactions(month), [])
  const todayTx = monthTx.filter((t) => t.date === today && t.type !== 'transfer')
  const todaySpend = todayTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const monthSpend = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const txLines = todayTx.map((t) => `${t.type === 'income' ? '+' : '-'}₹${t.amount} ${t.note} (${t.category})`).join('; ')

  // Food
  const meals = readFile<Meal[]>(qc, HEALTH_PATHS.meals(month), []).filter((m) => m.date === today)
  const targets = readFile<NutritionTargets | null>(qc, HEALTH_PATHS.targets, null)
  const calories = meals.reduce((s, m) => s + m.calories, 0)
  const protein = meals.reduce((s, m) => s + m.proteinG, 0)
  // Their actual eating habits, so food suggestions are realistic
  const allMeals = readFile<Meal[]>(qc, HEALTH_PATHS.meals(month), [])
  const foodCounts = new Map<string, number>()
  for (const m of allMeals) for (const i of m.items) foodCounts.set(i.name, (foodCounts.get(i.name) ?? 0) + 1)
  const frequentFoods = [...foodCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name)

  // Workout
  const profile = readFile<FitnessProfile | null>(qc, FITNESS_PATHS.profile, null)
  const plan = readFile<PlanFile>(qc, FITNESS_PATHS.plan, { next: null })
  const workouts = readFile<WorkoutSession[]>(qc, FITNESS_PATHS.workouts(month), [])
  const doneToday = workouts.some((s) => s.date === today)
  const startedSets = plan.next?.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0) ?? 0
  const last = workouts[workouts.length - 1]

  // Sleep
  const sleep = readFile<SleepEntry[]>(qc, HEALTH_PATHS.sleep, [])
  const lastNight = sleep.find((s) => s.date === today)
  const last7 = sleep.slice(-7)
  const avgSleep = last7.length ? Math.round((last7.reduce((s, x) => s + x.hours, 0) / last7.length) * 10) / 10 : null
  const wakeTimes = last7.map((s) => s.wakeTime).filter(Boolean)

  const metrics = readFile<BodyMetric[]>(qc, HEALTH_PATHS.metrics, [])
  const weight = metrics[metrics.length - 1]

  const mealsLogged = [...new Set(meals.map((m) => m.mealType ?? inferMealType(new Date(m.createdAt))))]
  const hour = new Date().getHours()
  const isLate = hour >= 22 || hour < 4

  return `Date: ${today}, time now: ${new Date().toTimeString().slice(0, 5)} (${daypartNow()}${isLate ? ', LATE NIGHT' : ''}).

MONEY
- Today: spent ₹${Math.round(todaySpend)} over ${todayTx.length} transactions${txLines ? ` — ${txLines}` : ''}
- Month so far: ₹${Math.round(monthSpend)} spent

FOOD
- Today: ${calories} kcal${targets ? ` of ${targets.calories} target (${Math.max(targets.calories - calories, 0)} left)` : ''}, ${protein}g protein${targets ? ` of ${targets.proteinG} target (${Math.max(targets.proteinG - protein, 0)}g left)` : ''}
- Meals logged today: ${mealsLogged.join(', ') || 'none'}${mealsLogged.includes('dinner') ? ' — DINNER IS DONE, the eating day is over' : ''}
- Foods they actually eat often: ${frequentFoods.join(', ') || 'unknown yet'}

WORKOUT
- ${doneToday ? 'Already worked out today.' : plan.next ? `Planned: "${plan.next.name}" (${plan.next.exercises.length} exercises), ${startedSets > 0 ? `in progress (${startedSets} sets done)` : 'not started'}` : 'No workout planned.'}
- This week: ${thisWeekCount(workouts, today)} of ${profile?.daysPerWeek ?? '?'} intended; last workout ${last ? `${daysSince(last.date, today)}d ago` : 'never'}

SLEEP
- Last night: ${lastNight ? `${lastNight.hours}h` : 'not logged'}; 7-day average: ${avgSleep != null ? `${avgSleep}h` : 'no data'}
- Usual wake time: ${wakeTimes.join(', ') || 'unknown'}

BODY: ${weight ? `${weight.weightKg}kg (${weight.date})` : 'no weigh-ins'}`
}

const BRIEFING_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'one warm, specific sentence for right now' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string', enum: ['money', 'food', 'workout', 'sleep'] },
          text: { type: 'string', description: 'one concrete, forward-looking sentence with numbers' },
        },
        required: ['area', 'text'],
      },
    },
    nudge: { type: 'string', description: 'THE single most valuable action to take right now' },
  },
  required: ['headline', 'items', 'nudge'],
}

export async function generateBriefing(qc: QueryClient): Promise<Briefing> {
  const text = await generateJson({
    system: `You are the daily briefing inside the user's Life OS app (finances, workouts, food,
sleep all tracked here). Coach, don't report: say what to DO with the rest of today, using the
numbers given. Rules:
- At most one item per area; SKIP areas with nothing useful to say. 2-4 items total.
- Food: if meals remain in the day and protein/calories are short, suggest a realistic next
  meal from foods they actually eat (list provided) with rough quantities that close the gap.
- BUT if dinner is already logged or it's LATE NIGHT: the eating day is OVER. Never suggest
  eating now — state the shortfall as a fact and what to change tomorrow ("ended 107g short;
  front-load protein at lunch tomorrow"), and make winding down for sleep the priority.
- Sleep: recommend tonight's bedtime from their usual wake time and 7.5h target, especially if
  the recent average is short. LATE NIGHT means the bedtime is "now".
- Workout: nudge to start/finish if one is planned and the day allows; respect rest days.
  Never suggest starting a workout LATE NIGHT — say when to do it tomorrow instead.
- Money: only mention if today was unusual (big spend, vices) — no generic budget talk.
- The nudge is one short imperative sentence — the single best action right now.
- Plain warm language, INR, no emoji, no markdown. Numbers over adjectives.`,
    text: buildContext(qc),
    schema: BRIEFING_SCHEMA,
    temperature: 0.4,
    maxOutputTokens: 1024,
  })

  let raw: { headline?: string; items?: { area?: string; text?: string }[]; nudge?: string }
  try {
    raw = JSON.parse(text)
  } catch {
    throw new AiError('The briefing came back garbled — try again.')
  }
  const items = (raw.items ?? [])
    .filter(
      (i): i is { area: BriefingArea; text: string } =>
        typeof i.text === 'string' && ['money', 'food', 'workout', 'sleep'].includes(i.area ?? ''),
    )
    .slice(0, 4)
  if (!raw.headline || items.length === 0) throw new AiError('The briefing came back empty — try again.')
  return {
    headline: raw.headline.trim(),
    items,
    nudge: (raw.nudge ?? '').trim(),
    generatedAt: new Date().toISOString(),
    day: effectiveTodayISO(),
    daypart: daypartNow(),
  }
}

const CACHE_KEY = 'pf.briefing'

/** One briefing per daypart per day — reopening the app reuses it. */
export function cachedBriefing(): Briefing | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const briefing = JSON.parse(raw) as Briefing
    if (briefing.day !== effectiveTodayISO() || briefing.daypart !== daypartNow()) return null
    return briefing
  } catch {
    return null
  }
}

export function storeBriefing(briefing: Briefing): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(briefing))
}
