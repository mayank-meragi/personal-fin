import { findExercise } from './planner'
import { setSummary } from './stats'
import type { Exercise, SetEntry, WorkoutSession } from './types'

export interface WorkoutEdit {
  action: 'remove' | 'swap' | 'add' | 'update_sets' | 'update_rest'
  /** name of the exercise in the current plan to target */
  exercise?: string
  /** library exercise (name or id) for swap/add */
  newExercise?: string
  sets?: number
  reps?: number
  weightKg?: number
  durationMinutes?: number
  restSeconds?: number
}

function findTargetIndex(workout: WorkoutSession, name: string | undefined): number {
  if (!name) return -1
  const q = name.trim().toLowerCase()
  let i = workout.exercises.findIndex((e) => e.name.toLowerCase() === q || e.exerciseId.toLowerCase() === q)
  if (i === -1) i = workout.exercises.findIndex((e) => e.name.toLowerCase().includes(q))
  return i
}

function resolveLibrary(name: string, library: Exercise[]): Exercise | undefined {
  return library.find((e) => e.id === name) ?? findExercise(name, library)
}

function buildSets(edit: WorkoutEdit, timed: boolean): SetEntry[] {
  if (timed) {
    const seconds = edit.durationMinutes && edit.durationMinutes > 0 ? Math.round(edit.durationMinutes * 60) : 600
    const count = Math.min(Math.max(edit.sets ?? 1, 1), 6)
    return Array.from({ length: count }, () => ({ targetReps: 0, targetDurationSec: seconds, done: false }))
  }
  const count = Math.min(Math.max(edit.sets ?? 3, 1), 6)
  return Array.from({ length: count }, () => ({
    targetReps: edit.reps && edit.reps > 0 ? Math.round(edit.reps) : 10,
    targetWeight: edit.weightKg && edit.weightKg > 0 ? edit.weightKg : undefined,
    done: false,
  }))
}

/**
 * Apply targeted edits to a planned workout — ONLY the named parts change.
 * Completed sets are never rewritten. Throws with a helpful message when a
 * target can't be found, so the agent can recover.
 */
export function applyWorkoutEdits(
  workout: WorkoutSession,
  edits: WorkoutEdit[],
  library: Exercise[],
): { workout: WorkoutSession; changes: string[] } {
  const next = structuredClone(workout)
  const changes: string[] = []
  const available = () => next.exercises.map((e) => e.name).join(', ')

  for (const edit of edits) {
    switch (edit.action) {
      case 'remove': {
        const i = findTargetIndex(next, edit.exercise)
        if (i === -1) throw new Error(`"${edit.exercise}" is not in the plan. It has: ${available()}`)
        changes.push(`removed ${next.exercises[i].name}`)
        next.exercises.splice(i, 1)
        break
      }

      case 'swap': {
        const i = findTargetIndex(next, edit.exercise)
        if (i === -1) throw new Error(`"${edit.exercise}" is not in the plan. It has: ${available()}`)
        if (!edit.newExercise) throw new Error('swap needs newExercise')
        const replacement = resolveLibrary(edit.newExercise, library)
        if (!replacement) throw new Error(`no exercise named "${edit.newExercise}" in the library`)
        const old = next.exercises[i]
        const timed = replacement.category === 'cardio' || replacement.category === 'stretching'
        const oldTimed = old.mode === 'duration' || old.sets.some((s) => s.targetDurationSec)
        // Same tracking mode → keep the old scheme (minus weights: different movement,
        // different load); explicit numbers in the edit always win.
        const keepScheme = timed === oldTimed && edit.sets == null && edit.reps == null && edit.durationMinutes == null
        const sets: SetEntry[] = keepScheme
          ? old.sets.map((s) => ({
              targetReps: s.targetReps,
              targetDurationSec: s.targetDurationSec,
              targetWeight: edit.weightKg && edit.weightKg > 0 ? edit.weightKg : undefined,
              done: false,
            }))
          : buildSets(edit, timed)
        next.exercises[i] = {
          exerciseId: replacement.id,
          name: replacement.name,
          mode: timed ? 'duration' : 'reps',
          restSeconds: edit.restSeconds ?? old.restSeconds,
          sets,
        }
        changes.push(`swapped ${old.name} → ${replacement.name} (${setSummary(sets)})`)
        break
      }

      case 'add': {
        if (!edit.newExercise) throw new Error('add needs newExercise')
        const ex = resolveLibrary(edit.newExercise, library)
        if (!ex) throw new Error(`no exercise named "${edit.newExercise}" in the library`)
        const timed = ex.category === 'cardio' || ex.category === 'stretching'
        const sets = buildSets(edit, timed)
        next.exercises.push({
          exerciseId: ex.id,
          name: ex.name,
          mode: timed ? 'duration' : 'reps',
          restSeconds: edit.restSeconds ?? (timed ? 30 : 90),
          sets,
        })
        changes.push(`added ${ex.name} (${setSummary(sets)})`)
        break
      }

      case 'update_sets': {
        const i = findTargetIndex(next, edit.exercise)
        if (i === -1) throw new Error(`"${edit.exercise}" is not in the plan. It has: ${available()}`)
        const target = next.exercises[i]
        const timed = target.mode === 'duration' || target.sets.some((s) => s.targetDurationSec)
        const doneSets = target.sets.filter((s) => s.done)
        const patchSet = (s: SetEntry): SetEntry =>
          timed
            ? {
                ...s,
                targetDurationSec:
                  edit.durationMinutes && edit.durationMinutes > 0 ? Math.round(edit.durationMinutes * 60) : s.targetDurationSec,
              }
            : {
                ...s,
                targetReps: edit.reps && edit.reps > 0 ? Math.round(edit.reps) : s.targetReps,
                targetWeight: edit.weightKg && edit.weightKg > 0 ? edit.weightKg : s.targetWeight,
              }
        // Completed sets are history — only the remaining work changes
        let remaining = target.sets.filter((s) => !s.done).map(patchSet)
        if (edit.sets && edit.sets > 0) {
          const want = Math.min(Math.max(Math.round(edit.sets) - doneSets.length, 0), 6)
          const template = remaining[0] ?? patchSet({ targetReps: 10, done: false })
          remaining =
            want <= remaining.length
              ? remaining.slice(0, want)
              : [...remaining, ...Array.from({ length: want - remaining.length }, () => ({ ...template, done: false }))]
        }
        target.sets = [...doneSets, ...remaining]
        if (edit.restSeconds && edit.restSeconds > 0) target.restSeconds = Math.min(edit.restSeconds, 300)
        changes.push(`updated ${target.name} → ${setSummary(target.sets)}`)
        break
      }

      case 'update_rest': {
        const i = findTargetIndex(next, edit.exercise)
        if (i === -1) throw new Error(`"${edit.exercise}" is not in the plan. It has: ${available()}`)
        if (!edit.restSeconds || edit.restSeconds <= 0) throw new Error('update_rest needs restSeconds')
        next.exercises[i].restSeconds = Math.min(edit.restSeconds, 300)
        changes.push(`rest for ${next.exercises[i].name} → ${next.exercises[i].restSeconds}s`)
        break
      }

      default:
        throw new Error(`unknown action "${edit.action}"`)
    }
  }
  if (next.exercises.length === 0) throw new Error('that would leave the workout empty — remove the plan instead')
  return { workout: next, changes }
}
