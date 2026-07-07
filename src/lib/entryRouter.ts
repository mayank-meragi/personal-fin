import { generateJson, type ImageAttachment } from './llm'
import { effectiveTodayISO } from './dates'
import { fetchExercises } from '@/modules/fitness/lib/exerciseDb'
import { parseQuickLog } from '@/modules/fitness/lib/planner'
import type { WorkoutSession } from '@/modules/fitness/lib/types'
import { parseMeal } from '@/modules/health/lib/nutrition'
import type { BodyMetric, Meal, SleepEntry } from '@/modules/health/lib/types'
import { parseTask } from '@/modules/journal/lib/ai'
import type { Task } from '@/modules/journal/lib/types'

export type RoutedEntry =
  | { kind: 'money' }
  | { kind: 'food'; meal: Meal }
  | { kind: 'workout'; session: WorkoutSession }
  | { kind: 'sleep'; entry: SleepEntry }
  | { kind: 'weight'; metric: BodyMetric }
  | { kind: 'task'; task: Task }

interface Classification {
  kind: 'money' | 'food' | 'workout' | 'sleep' | 'weight' | 'task'
  // Extraction fields arrive as strings: number-typed optional fields tempt the
  // model into degenerate literals (weightKg: 0.000000… until the token cap)
  hours?: string | number
  bedTime?: string
  wakeTime?: string
  quality?: string | number
  weightKg?: string | number
  waistCm?: string | number
}

/** "7" → "07:00", "11:30 pm" → "23:30"; undefined when hopeless. */
function normTime(t?: string): string | undefined {
  if (typeof t !== 'string') return undefined
  let s = t.trim().toLowerCase()
  const ampm = /(am|pm)\.?$/.exec(s)?.[1]
  s = s.replace(/\s*(am|pm)\.?$/, '')
  if (/^\d{1,2}$/.test(s)) s = `${s}:00`
  if (!/^\d{1,2}:\d{2}$/.test(s)) return undefined
  let [h, m] = s.split(':').map(Number)
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  if (h > 23 || m > 59) return undefined
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function computeHours(bedTime: string, wakeTime: string): number {
  const [bh, bm] = bedTime.split(':').map(Number)
  const [wh, wm] = wakeTime.split(':').map(Number)
  let minutes = wh * 60 + wm - (bh * 60 + bm)
  if (minutes <= 0) minutes += 24 * 60
  let hours = minutes / 60
  // "slept 11:30 to 7" without am/pm: 11:30 read as morning gives 19.5h —
  // implausible; the bed time was almost certainly PM
  if (hours > 16 && bh < 12) hours -= 12
  return Math.round(hours * 10) / 10
}

/**
 * The hub's "add anything" front door: classify one informal line (or photo)
 * into the module it belongs to, extracting the trivial kinds (sleep, weight)
 * in the same call. Money returns unparsed — the caller runs the full finance
 * flow with its preview cards.
 */
export async function routeEntry(text: string, image?: ImageAttachment): Promise<RoutedEntry> {
  const raw = await generateJson({
    system: `Classify one informal life-log entry into exactly one kind:
- money: expenses, income, transfers, balances — anything with rupees/prices/accounts
  ("auto 85", "23k left in hdfc", "salary credited", "paid credit card 3200"). Payment
  screenshots and receipts are money.
- food: something eaten or drunk as food ("2 rotis and dal", "had a dosa", "protein shake").
  Photos of meals are food. NOTE: "tea 20" (item + price) is MONEY — a purchase; "had tea
  with 2 biscuits" (no price) is food.
- workout: exercise performed ("bench 3x8 60kg", "ran 20 min", "did legs today").
- sleep: sleep times or duration ("slept 11 to 7", "got 6 hours", "woke at 8, slept at 1").
  Also extract: hours (or bedTime/wakeTime as HH:MM 24h), and quality 1-5 when a feeling is
  stated — "felt great/amazing"=5, "slept well"=4, "ok"=3, "poorly/restless"=2, "terrible/rough"=1.
- weight: body weight ("weight 72.4", "72.4kg today", "waist 84"). Extract weightKg/waistCm.
- task: a to-do — an intention to do something later, not a record of something that
  happened ("call the bank tomorrow", "sort hyderabad marketing monday 11am", "buy a
  gift for mom").
When genuinely torn between money and food, prices win: money.`,
    text: text || 'Classify the attached image.',
    image,
    schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['money', 'food', 'workout', 'sleep', 'weight', 'task'] },
        hours: { type: 'string', description: 'number as text, e.g. "7.5"; omit unless sleep' },
        bedTime: { type: 'string' },
        wakeTime: { type: 'string' },
        quality: { type: 'string', description: '1-5 as text; omit unless stated' },
        weightKg: { type: 'string', description: 'number as text; omit unless weight' },
        waistCm: { type: 'string', description: 'number as text; omit unless stated' },
      },
      required: ['kind'],
    },
    temperature: 0,
    maxOutputTokens: 256,
  })

  let c: Classification
  try {
    c = JSON.parse(raw) as Classification
  } catch {
    // Truncated/degenerate JSON — salvage field-by-field before giving up
    const grab = (key: string) => new RegExp(`"${key}"\\s*:\\s*"?([0-9A-Za-z:.]+)"?`).exec(raw)?.[1]
    const kind = grab('kind') as Classification['kind'] | undefined
    if (!kind || !['money', 'food', 'workout', 'sleep', 'weight', 'task'].includes(kind)) return { kind: 'money' }
    c = {
      kind,
      hours: grab('hours'),
      bedTime: grab('bedTime'),
      wakeTime: grab('wakeTime'),
      quality: grab('quality'),
      weightKg: grab('weightKg'),
      waistCm: grab('waistCm'),
    }
  }

  switch (c.kind) {
    case 'food':
      return { kind: 'food', meal: await parseMeal(text, image) }

    case 'workout': {
      const exercises = await fetchExercises()
      return { kind: 'workout', session: await parseQuickLog(text, exercises) }
    }

    case 'sleep': {
      let hours = Number(c.hours)
      const bedTime = normTime(c.bedTime)
      const wakeTime = normTime(c.wakeTime)
      if ((!Number.isFinite(hours) || hours <= 0) && bedTime && wakeTime) hours = computeHours(bedTime, wakeTime)
      if (!Number.isFinite(hours) || hours <= 0 || hours > 20) return { kind: 'money' }
      return {
        kind: 'sleep',
        entry: {
          id: crypto.randomUUID(),
          date: effectiveTodayISO(),
          hours: Math.round(hours * 10) / 10,
          bedTime,
          wakeTime,
          quality: Number(c.quality) >= 1 && Number(c.quality) <= 5 ? Math.round(Number(c.quality)) : undefined,
        },
      }
    }

    case 'task': {
      // Delegate to the focused parser (same pattern as food/workout) — the
      // multi-kind schema above makes flash drop/garble the date fields
      const parsed = await parseTask(text)
      if (!parsed.text) return { kind: 'money' }
      return {
        kind: 'task',
        task: {
          id: crypto.randomUUID(),
          text: parsed.text,
          dueDate: parsed.dueDate,
          dueTime: parsed.dueTime,
          createdAt: new Date().toISOString(),
        },
      }
    }

    case 'weight': {
      const weightKg = Number(c.weightKg)
      if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 300) return { kind: 'money' }
      return {
        kind: 'weight',
        metric: {
          id: crypto.randomUUID(),
          date: effectiveTodayISO(),
          weightKg: Math.round(weightKg * 10) / 10,
          waistCm: Number(c.waistCm) > 0 ? Math.round(Number(c.waistCm) * 10) / 10 : undefined,
        },
      }
    }

    default:
      return { kind: 'money' }
  }
}
