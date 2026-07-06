import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { personalRecords } from '../lib/stats'
import type { Exercise, WorkoutSession } from '../lib/types'
import { ExerciseAnimation } from './ExerciseImage'

interface Props {
  exercise: Exercise | null
  sessions?: WorkoutSession[]
  onClose: () => void
}

export default function ExerciseDetail({ exercise, sessions = [], onClose }: Props) {
  const pr = exercise ? personalRecords(sessions).find((p) => p.exerciseId === exercise.id) : undefined
  return (
    <Dialog open={exercise !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85svh] gap-3 overflow-y-auto">
        {exercise && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6 text-left">{exercise.name}</DialogTitle>
            </DialogHeader>
            <ExerciseAnimation exercise={exercise} />
            <div className="flex flex-wrap gap-1.5">
              {exercise.primaryMuscles.map((m) => (
                <Badge key={m} className="bg-[var(--ink-900)] text-white">{m}</Badge>
              ))}
              {exercise.secondaryMuscles.map((m) => (
                <Badge key={m} variant="secondary">{m}</Badge>
              ))}
              <Badge variant="outline">{exercise.level}</Badge>
              {exercise.equipment && <Badge variant="outline">{exercise.equipment}</Badge>}
              {exercise.mechanic && <Badge variant="outline">{exercise.mechanic}</Badge>}
            </div>
            {pr && (
              <p className="rounded-[var(--radius-md)] bg-[var(--emerald-50)] px-3 py-2 text-sm text-[var(--emerald-700)]">
                Your best: {pr.weight}kg × {pr.reps} ({pr.date}) — est. 1RM {pr.e1rm}kg
              </p>
            )}
            {exercise.instructions.length > 0 && (
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[var(--text-body)]">
                {exercise.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
