import { AiError, generateJson } from '@/lib/llm'
import { todayISO } from '@/lib/dates'
import { daysSince, formatSet, volumeByMuscle } from './stats'
import { exerciseById } from './exerciseDb'
import type { Exercise, FitnessProfile, SessionExercise, SetEntry, WorkoutSession } from './types'

const GOAL_LABEL: Record<FitnessProfile['goal'], string> = {
  'build-muscle': 'build muscle (hypertrophy: mostly 8-12 reps, moderate rest)',
  strength: 'get stronger (strength: mostly 3-6 reps on compounds, long rest)',
  'fat-loss': 'lose fat (higher volume, shorter rest, keep compounds heavy)',
  'general-fitness': 'general fitness (balanced full-body work)',
}

/**
 * Pick a compact candidate list for the prompt: everything the user has done
 * before, plus library exercises matching their equipment — compounds and
 * lower difficulty first. The full 873 would drown the model.
 */
function candidateExercises(
  exercises: Exercise[],
  profile: FitnessProfile,
  history: WorkoutSession[],
  limit = 90,
): Exercise[] {
  const byId = exerciseById(exercises)
  const doneIds = new Set(history.flatMap((s) => s.exercises.map((e) => e.exerciseId)))
  const equipment = new Set([...profile.equipment, 'body only'])
  const picked = new Map<string, Exercise>()
  for (const id of doneIds) {
    const ex = byId.get(id)
    if (ex) picked.set(id, ex)
  }
  const rank = (e: Exercise) =>
    (e.mechanic === 'compound' ? 0 : 2) + (e.level === 'beginner' ? 0 : e.level === 'intermediate' ? 1 : 3)
  const usable = (e: Exercise) => (!e.equipment || equipment.has(e.equipment)) && !picked.has(e.id)
  const eligible = exercises.filter((e) => e.category === 'strength' && usable(e)).sort((a, b) => rank(a) - rank(b))
  // Spread across muscles so no group is starved out of the list
  const perMuscle = new Map<string, number>()
  for (const e of eligible) {
    if (picked.size >= limit) break
    const muscle = e.primaryMuscles[0] ?? 'other'
    const count = perMuscle.get(muscle) ?? 0
    if (count >= 8) continue
    perMuscle.set(muscle, count + 1)
    picked.set(e.id, e)
  }
  // Cardio + stretching so the model can program warm-ups, finishers, cool-downs
  for (const e of exercises.filter((e) => e.category === 'cardio' && usable(e)).sort((a, b) => rank(a) - rank(b)).slice(0, 10)) {
    picked.set(e.id, e)
  }
  for (const e of exercises.filter((e) => e.category === 'stretching' && usable(e)).sort((a, b) => rank(a) - rank(b)).slice(0, 8)) {
    picked.set(e.id, e)
  }
  return [...picked.values()]
}

function sessionLine(s: WorkoutSession, today: string): string {
  const exercises = s.exercises
    .map((ex) => {
      const doneSets = ex.sets.filter((x) => x.done)
      const skipped = ex.sets.length - doneSets.length
      const actual = doneSets.map(formatSet).join(',')
      return `${ex.name} [${actual || 'all skipped'}${skipped > 0 ? ` +${skipped} skipped` : ''}]`
    })
    .join('; ')
  return `- ${s.date} (${daysSince(s.date, today)}d ago) "${s.name}": ${exercises}`
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'short workout name like "Push day" or "Full body A"' },
    focus: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string', description: '1-3 sentences: why this workout today, referencing recency and history' },
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          exerciseId: { type: 'string' },
          restSeconds: { type: 'number' },
          sets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                targetReps: { type: 'number', description: 'for strength sets; omit for timed work' },
                targetWeight: { type: 'number', description: 'kg; omit for bodyweight' },
                targetDurationSec: {
                  type: 'number',
                  description: 'for cardio/stretching: duration in seconds (e.g. 900 = 15 min run, 30 = stretch hold); omit for rep-based sets',
                },
              },
            },
          },
        },
        required: ['exerciseId', 'sets'],
      },
    },
  },
  required: ['name', 'exercises', 'rationale'],
}

/**
 * Build the next workout, on demand. Deliberately generated at the moment of
 * use so the model sees adherence honestly — a long gap means easing back in,
 * not resuming a schedule the user didn't follow.
 */
export async function generateNextWorkout(opts: {
  profile: FitnessProfile
  history: WorkoutSession[]
  exercises: Exercise[]
  memory?: string
  /** A one-off ask for this workout ("make it a leg day", "something short") */
  request?: string
  /** From the health module, when available */
  body?: { weightKg?: number; lastNightSleepHours?: number }
}): Promise<WorkoutSession> {
  const { profile, history, exercises } = opts
  const today = todayISO()
  const recent = history.slice(-10)
  const byId = exerciseById(exercises)
  const candidates = candidateExercises(exercises, profile, recent)
  const last = recent[recent.length - 1]
  const gap = last ? daysSince(last.date, today) : null
  const muscleLoad = volumeByMuscle(
    recent.filter((s) => daysSince(s.date, today) <= 7),
    byId,
  )

  const prompt = `You are a personal trainer programming ONE workout for today (${today}).
${opts.request ? `\nThe user specifically asked: "${opts.request}" — honor this within safe programming.\n` : ''}
User profile:
- Goal: ${GOAL_LABEL[profile.goal]}
- Experience: ${profile.experience}; intends ${profile.daysPerWeek} sessions/week
- Equipment available: ${profile.equipment.join(', ') || 'body only'}
${profile.injuries ? `- Injuries/limitations (NEVER program around these carelessly): ${profile.injuries}` : ''}
${profile.preferences ? `- Preferences: ${profile.preferences}` : ''}
${opts.body?.weightKg ? `- Current body weight: ${opts.body.weightKg} kg` : ''}
${
  opts.body?.lastNightSleepHours != null && opts.body.lastNightSleepHours < 6
    ? `- They slept only ${opts.body.lastNightSleepHours}h last night — recovery is compromised, keep intensity moderate today.`
    : ''
}
${opts.memory ? `- Coach's notes from past sessions:\n${opts.memory}` : ''}

Adherence — weigh this heavily:
${gap === null ? '- This is their FIRST session ever. Start conservative: a simple full-body workout, low volume, teach the movements.' : `- Last session was ${gap} day(s) ago.`}
${gap !== null && gap >= 7 ? '- That is a LONG gap. Do NOT continue the previous split as if nothing happened: ease back in with reduced weights (~85-90% of last used) and moderate volume, favor full-body.' : ''}
${gap !== null && gap <= 1 ? '- They trained very recently: pick muscle groups that are recovered (48-72h rule), keep volume sensible.' : ''}
- Sessions completed in the last 7 days: ${recent.filter((s) => daysSince(s.date, today) < 7).length} of ~${profile.daysPerWeek} intended.

Recent sessions (oldest first, [actual reps@kg per completed set]):
${recent.map((s) => sessionLine(s, today)).join('\n') || '(none)'}

Muscle-group sets completed in the last 7 days: ${muscleLoad.map((m) => `${m.muscle} ${m.sets}`).join(', ') || 'none'}

Programming rules:
- Progressive overload: if the user completed all sets of an exercise last time, nudge it up (+2.5kg or +1 rep). If they skipped/failed sets, hold or reduce.
- Respect 48-72h recovery per muscle group based on the sessions above.
- 4-6 exercises: compounds first, isolation after. 2-4 sets each. Rest 60-90s (isolation) to 120-180s (heavy compounds), as restSeconds per exercise.
- Weights in kg. For a brand-new exercise pick a conservative starting weight for their experience level, or omit targetWeight for bodyweight movements.
- CARDIO and STRETCHING are timed, never reps: give those sets targetDurationSec only
  (cardio usually ONE set of 600-1800s; stretch holds 20-45s), and set restSeconds low.
  Use them where they serve the goal — a cardio finisher for fat-loss, a short stretch
  cool-down after heavy leg work. Strength sets get targetReps and never targetDurationSec.
- Use ONLY exerciseId values from this list:
${candidates.map((e) => `${e.id} | ${e.name} | ${e.primaryMuscles.join('/')} | ${e.equipment ?? 'body only'}${e.mechanic ? ` | ${e.mechanic}` : ''}`).join('\n')}`

  const text = await generateJson({
    text: prompt,
    schema: PLAN_SCHEMA,
    temperature: 0.4,
    maxOutputTokens: 4096,
  })

  let raw: {
    name?: string
    focus?: string[]
    rationale?: string
    exercises?: { exerciseId?: string; restSeconds?: number; sets?: { targetReps?: number; targetWeight?: number }[] }[]
  }
  try {
    raw = JSON.parse(text)
  } catch {
    throw new AiError('The AI returned an invalid workout')
  }

  const nameIndex = new Map(exercises.map((e) => [e.name.toLowerCase(), e]))
  const sessionExercises: SessionExercise[] = []
  for (const item of raw.exercises ?? []) {
    if (!item.exerciseId || !Array.isArray(item.sets) || item.sets.length === 0) continue
    // Validate against the library; salvage near-miss ids by name
    const ex =
      byId.get(item.exerciseId) ??
      nameIndex.get(item.exerciseId.replace(/[_-]/g, ' ').toLowerCase()) ??
      exercises.find((e) => e.id.toLowerCase() === item.exerciseId!.toLowerCase())
    if (!ex) continue
    const timedExercise = ex.category === 'cardio' || ex.category === 'stretching'
    const sets: SetEntry[] = item.sets
      .filter(
        (s: { targetReps?: number; targetDurationSec?: number }) =>
          (Number.isFinite(s.targetReps) && (s.targetReps ?? 0) > 0) ||
          (Number.isFinite(s.targetDurationSec) && (s.targetDurationSec ?? 0) > 0),
      )
      .slice(0, 6)
      .map((s: { targetReps?: number; targetWeight?: number; targetDurationSec?: number }) => {
        const duration =
          Number.isFinite(s.targetDurationSec) && s.targetDurationSec! > 0
            ? Math.min(Math.round(s.targetDurationSec!), 3600)
            : undefined
        // A timed exercise mislabeled with reps: treat the number as minutes-ish? No —
        // fall back to a sane default hold/run instead of pretending reps make sense.
        if (timedExercise && !duration) {
          return { targetReps: 0, targetDurationSec: ex.category === 'cardio' ? 600 : 30, done: false }
        }
        if (duration && (!s.targetReps || timedExercise)) {
          return { targetReps: 0, targetDurationSec: duration, done: false }
        }
        return {
          targetReps: Math.round(s.targetReps!),
          targetWeight: Number.isFinite(s.targetWeight) && s.targetWeight! > 0 ? s.targetWeight : undefined,
          done: false,
        }
      })
    if (sets.length === 0) continue
    sessionExercises.push({
      exerciseId: ex.id,
      name: ex.name,
      mode: timedExercise || sets.every((s) => s.targetDurationSec) ? 'duration' : 'reps',
      restSeconds: Number.isFinite(item.restSeconds) ? Math.min(Math.max(item.restSeconds!, 15), 300) : 90,
      sets,
    })
  }
  if (sessionExercises.length === 0) throw new AiError('The AI returned no usable exercises')

  return {
    id: crypto.randomUUID(),
    date: today,
    name: raw.name?.trim() || 'Workout',
    focus: Array.isArray(raw.focus) ? raw.focus.filter((f) => typeof f === 'string').slice(0, 4) : undefined,
    source: 'ai',
    rationale: raw.rationale?.trim() || undefined,
    exercises: sessionExercises,
  }
}

const QUICK_LOG_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          exercise: { type: 'string', description: 'exercise name as the user wrote it' },
          sets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                reps: { type: 'number', description: 'omit for timed work' },
                weight: { type: 'number', description: 'kg; omit if bodyweight' },
                minutes: { type: 'number', description: 'duration for cardio/stretch entries ("ran 20 min" = one set, minutes 20)' },
              },
            },
          },
        },
        required: ['exercise', 'sets'],
      },
    },
  },
  required: ['exercises'],
}

/** Parse "bench 3x8 60kg, squats 5x5 80" into a completed session for today. */
export async function parseQuickLog(input: string, exercises: Exercise[]): Promise<WorkoutSession> {
  const text = await generateJson({
    system: `You parse informal gym-log notes into structured sets. "3x8 60" means 3 sets of 8 reps at 60kg.
"3x8,8,6" means three sets with different reps. A bare weight applies to all sets. Weights are kg unless stated.
Timed work uses minutes instead of reps: "ran 20 min" or "20 min treadmill" = one set with minutes 20;
"plank 3x1min" = three sets with minutes 1.`,
    text: input,
    schema: QUICK_LOG_SCHEMA,
    temperature: 0,
    maxOutputTokens: 2048,
  })
  let raw: {
    name?: string
    exercises?: { exercise?: string; sets?: { reps?: number; weight?: number; minutes?: number }[] }[]
  }
  try {
    raw = JSON.parse(text)
  } catch {
    throw new AiError('Could not parse that log')
  }

  const sessionExercises: SessionExercise[] = []
  for (const item of raw.exercises ?? []) {
    if (!item.exercise || !Array.isArray(item.sets) || item.sets.length === 0) continue
    const match = findExercise(item.exercise, exercises)
    const sets: SetEntry[] = item.sets
      .filter((s) => (Number.isFinite(s.reps) && (s.reps ?? 0) > 0) || (Number.isFinite(s.minutes) && (s.minutes ?? 0) > 0))
      .map((s) => {
        if (s.minutes && (!s.reps || s.reps <= 0)) {
          const durationSec = Math.min(Math.round(s.minutes * 60), 3 * 3600)
          return { targetReps: 0, targetDurationSec: durationSec, durationSec, done: true }
        }
        return {
          targetReps: Math.round(s.reps!),
          targetWeight: Number.isFinite(s.weight) && s.weight! > 0 ? s.weight : undefined,
          reps: Math.round(s.reps!),
          weight: Number.isFinite(s.weight) && s.weight! > 0 ? s.weight : undefined,
          done: true,
        }
      })
    if (sets.length === 0) continue
    sessionExercises.push({
      exerciseId: match?.id ?? item.exercise.toLowerCase().replace(/\s+/g, '-'),
      name: match?.name ?? item.exercise,
      mode: sets.every((s) => s.targetDurationSec) ? 'duration' : 'reps',
      sets,
    })
  }
  if (sessionExercises.length === 0) throw new AiError('Could not find any sets in that')

  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    date: todayISO(),
    name: raw.name?.trim() || 'Logged workout',
    source: 'manual',
    startedAt: now,
    endedAt: now,
    exercises: sessionExercises,
  }
}

/** Fuzzy-match a user-written exercise name against the library. */
export function findExercise(name: string, exercises: Exercise[]): Exercise | undefined {
  const q = name.trim().toLowerCase()
  if (!q) return undefined
  const ALIASES: Record<string, string> = {
    run: 'running, treadmill',
    ran: 'running, treadmill',
    running: 'running, treadmill',
    treadmill: 'running, treadmill',
    cycling: 'bicycling',
    cycle: 'bicycling',
    bench: 'barbell bench press - medium grip',
    'bench press': 'barbell bench press - medium grip',
    squat: 'barbell squat',
    squats: 'barbell squat',
    deadlift: 'barbell deadlift',
    deadlifts: 'barbell deadlift',
    ohp: 'standing military press',
    'overhead press': 'standing military press',
    'pull up': 'pullups',
    'pull ups': 'pullups',
    pullup: 'pullups',
    'push up': 'pushups',
    'push ups': 'pushups',
    pushup: 'pushups',
  }
  const target = ALIASES[q] ?? q
  return (
    exercises.find((e) => e.name.toLowerCase() === target) ??
    exercises.find((e) => e.name.toLowerCase().startsWith(target)) ??
    exercises.find((e) => e.name.toLowerCase().includes(target))
  )
}

/** Rewrite the fitness coach-memory after a session (fed into future plans). */
export async function generateFitnessMemory(previous: string, recent: WorkoutSession[]): Promise<string> {
  const today = todayISO()
  const text = await generateJson({
    text: `You keep a personal trainer's compact notes about a client, injected into future workout
programming. Rewrite them to include the newest sessions. Under 150 words, plain "- " bullets.
Keep durable knowledge: working weights on key lifts, exercises they skip or struggle with,
pace of progression, schedule patterns. PERMANENT client facts already in the notes (age, body
weight, injuries, sport background, goals) must survive every rewrite — never drop them.
Never invent facts.

Previous notes:
${previous || '(none)'}

Recent sessions:
${recent
  .slice(-6)
  .map((s) => sessionLine(s, today))
  .join('\n')}`,
    schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] },
    temperature: 0,
    maxOutputTokens: 1024,
  })
  try {
    return ((JSON.parse(text) as { summary?: string }).summary ?? '').trim()
  } catch {
    throw new AiError('The AI returned invalid notes')
  }
}
