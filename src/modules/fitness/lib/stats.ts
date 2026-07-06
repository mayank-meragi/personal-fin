import type { Exercise, WorkoutSession } from './types'

/** Estimated one-rep max (Epley). */
export function e1rm(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30))
}

export function sessionVolume(session: WorkoutSession): number {
  return session.exercises.reduce(
    (sum, ex) =>
      sum + ex.sets.reduce((s, set) => (set.done ? s + (set.reps ?? set.targetReps) * (set.weight ?? set.targetWeight ?? 0) : s), 0),
    0,
  )
}

export function daysSince(dateISO: string, today: string): number {
  return Math.round((Date.parse(today) - Date.parse(dateISO)) / 86_400_000)
}

export function lastSessionDate(sessions: WorkoutSession[]): string | null {
  return sessions.length > 0 ? sessions[sessions.length - 1].date : null
}

/** Sessions in the 7 days ending today (inclusive). */
export function thisWeekCount(sessions: WorkoutSession[], today: string): number {
  return sessions.filter((s) => daysSince(s.date, today) >= 0 && daysSince(s.date, today) < 7).length
}

/**
 * Workout streak in days of "kept showing up": consecutive sessions walking
 * back from the most recent, allowing up to 2 rest days between them. Streak
 * is 0 when the last session is more than 2 days ago.
 */
export function currentStreak(sessions: WorkoutSession[], today: string): number {
  const dates = [...new Set(sessions.map((s) => s.date))].sort().reverse()
  if (dates.length === 0 || daysSince(dates[0], today) > 2) return 0
  let streak = 1
  for (let i = 1; i < dates.length; i++) {
    if (daysSince(dates[i], dates[i - 1]) <= 3) streak++
    else break
  }
  return streak
}

export interface PersonalRecord {
  exerciseId: string
  name: string
  weight: number
  reps: number
  e1rm: number
  date: string
}

/** Best estimated 1RM per exercise across all sessions (weighted sets only). */
export function personalRecords(sessions: WorkoutSession[]): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>()
  for (const session of sessions) {
    for (const ex of session.exercises) {
      for (const set of ex.sets) {
        if (!set.done) continue
        const weight = set.weight ?? set.targetWeight ?? 0
        const reps = set.reps ?? set.targetReps
        if (weight <= 0 || reps <= 0) continue
        const score = e1rm(weight, reps)
        const current = best.get(ex.exerciseId)
        if (!current || score > current.e1rm) {
          best.set(ex.exerciseId, { exerciseId: ex.exerciseId, name: ex.name, weight, reps, e1rm: score, date: session.date })
        }
      }
    }
  }
  return [...best.values()].sort((a, b) => b.e1rm - a.e1rm)
}

/**
 * Did this session set a new best e1RM on any exercise the user had done
 * before? (First-ever exposure to an exercise doesn't count as a PR.)
 */
export function isSessionPR(session: WorkoutSession, all: WorkoutSession[]): boolean {
  const earlier = all.filter((s) => s.date < session.date)
  if (earlier.length === 0) return false
  const priorBest = new Map<string, number>()
  for (const s of earlier) {
    for (const ex of s.exercises) {
      for (const set of ex.sets) {
        if (!set.done) continue
        const weight = set.weight ?? set.targetWeight ?? 0
        const reps = set.reps ?? set.targetReps
        if (weight <= 0 || reps <= 0) continue
        const score = e1rm(weight, reps)
        if (score > (priorBest.get(ex.exerciseId) ?? 0)) priorBest.set(ex.exerciseId, score)
      }
    }
  }
  for (const ex of session.exercises) {
    const best = priorBest.get(ex.exerciseId)
    if (best === undefined) continue
    for (const set of ex.sets) {
      if (!set.done) continue
      const weight = set.weight ?? set.targetWeight ?? 0
      const reps = set.reps ?? set.targetReps
      if (weight > 0 && reps > 0 && e1rm(weight, reps) > best) return true
    }
  }
  return false
}

/** Completed-set volume per primary muscle over the given sessions. */
export function volumeByMuscle(
  sessions: WorkoutSession[],
  byId: Map<string, Exercise>,
): { muscle: string; volume: number; sets: number }[] {
  const acc = new Map<string, { volume: number; sets: number }>()
  for (const session of sessions) {
    for (const ex of session.exercises) {
      const muscles = byId.get(ex.exerciseId)?.primaryMuscles ?? ['other']
      for (const set of ex.sets) {
        if (!set.done) continue
        const volume = (set.reps ?? set.targetReps) * (set.weight ?? set.targetWeight ?? 0)
        for (const muscle of muscles) {
          const entry = acc.get(muscle) ?? { volume: 0, sets: 0 }
          entry.volume += volume
          entry.sets += 1
          acc.set(muscle, entry)
        }
      }
    }
  }
  return [...acc.entries()]
    .map(([muscle, v]) => ({ muscle, ...v }))
    .sort((a, b) => b.sets - a.sets)
}

/** "3×8@60kg" style summary of an exercise's set scheme. */
export function setSummary(sets: { targetReps: number; targetWeight?: number }[]): string {
  if (sets.length === 0) return ''
  const first = sets[0]
  const uniform = sets.every((s) => s.targetReps === first.targetReps && s.targetWeight === first.targetWeight)
  const weight = first.targetWeight ? `@${first.targetWeight}kg` : ''
  if (uniform) return `${sets.length}×${first.targetReps}${weight}`
  return sets.map((s) => `${s.targetReps}${s.targetWeight ? `@${s.targetWeight}` : ''}`).join(', ')
}
