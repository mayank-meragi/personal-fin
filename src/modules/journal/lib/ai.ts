import { effectiveTodayISO, toISODate } from '@/lib/dates'
import { generateJson, hasAiKey } from '@/lib/llm'

export interface ParsedTask {
  text: string
  dueDate?: string
  dueTime?: string
}

/**
 * Models are unreliable at date arithmetic ("next monday" from an anchor
 * date). Give them the next two weeks verbatim so resolving a relative date
 * is a lookup, not a computation.
 */
export function relativeDateCalendar(today: string, days = 14): string {
  const base = new Date(`${today}T12:00:00`)
  const lines: string[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    const tag = i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : ''
    lines.push(`${d.toLocaleDateString('en-IN', { weekday: 'long' })} ${toISODate(d)}${tag}`)
  }
  return lines.join('\n')
}

/** Well-formed and not in the past — a wrong-year model slip becomes undated instead of silently wrong. */
export function validDueDate(dueDate: string | undefined, today: string): string | undefined {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return undefined
  return dueDate >= today ? dueDate : undefined
}

/** "9:00"/"11 am"/"23:5" → "HH:MM"; undefined when hopeless. */
function normTime(t?: string): string | undefined {
  if (typeof t !== 'string') return undefined
  let s = t.trim().toLowerCase()
  const ampm = /(am|pm)\.?$/.exec(s)?.[1]
  s = s.replace(/\s*(am|pm)\.?$/, '')
  if (/^\d{1,2}$/.test(s)) s = `${s}:00`
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(s)
  if (!m) return undefined
  let h = Number(m[1])
  const min = Number(m[2])
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return undefined
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/**
 * Turn one informal line into a task, resolving relative dates against
 * today ("sort hyderabad marketing monday 11am" → text + next Monday +
 * 11:00). AI-only by design: without a key (or on any failure) the raw
 * line becomes the task text, no due date.
 */
export async function parseTask(input: string): Promise<ParsedTask> {
  const raw = input.trim()
  if (!hasAiKey()) return { text: raw }

  const today = effectiveTodayISO()
  try {
    const out = await generateJson({
      system: `Extract one task from an informal line.
Calendar — resolve any relative due date by copying the date from the matching line, do not compute it yourself:
${relativeDateCalendar(today)}
- text: the task itself, cleaned up and capitalized, with due-date/time words removed
  ("sort hyderabad marketing monday" → "Sort hyderabad marketing").
- dueDate: YYYY-MM-DD only when the line implies one. A weekday name means the NEXT such
  day strictly after today — copy its date from the calendar. Only for dates beyond the
  calendar ("15 aug") compute the date. Omit when no date is implied — never invent one.
- dueTime: HH:MM 24-hour only when a time is stated ("11am" → "11:00"). Omit otherwise.`,
      text: raw,
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          dueDate: { type: 'string', description: 'YYYY-MM-DD; omit when none implied' },
          dueTime: { type: 'string', description: 'HH:MM 24h; omit when none stated' },
        },
        required: ['text'],
      },
      temperature: 0,
      maxOutputTokens: 200,
    })
    const parsed = JSON.parse(out) as ParsedTask
    const text = typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim() : raw
    let dueDate = validDueDate(parsed.dueDate, today)
    const dueTime = normTime(parsed.dueTime)
    // A bare time ("call bank 11am") means today
    if (dueTime && !dueDate) dueDate = today
    return { text, dueDate, dueTime }
  } catch {
    // Parse failures shouldn't block capture — keep the raw line
    return { text: raw }
  }
}
