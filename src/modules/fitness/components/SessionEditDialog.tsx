import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { saveSession } from '../lib/data'
import { exerciseMode } from '../lib/stats'
import type { WorkoutSession } from '../lib/types'

interface Props {
  session: WorkoutSession | null
  onClose: () => void
}

/** Fix up a logged session after the fact — set values, name, nothing structural. */
export default function SessionEditDialog({ session, onClose }: Props) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<WorkoutSession | null>(null)

  useEffect(() => {
    setDraft(session ? structuredClone(session) : null)
  }, [session])

  function editSet(exIndex: number, setIndex: number, field: 'reps' | 'weight' | 'durationSec', value: number | undefined) {
    setDraft((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      const set = next.exercises[exIndex].sets[setIndex]
      set[field] = value
      // Editing values on a skipped set implies it actually happened
      if (value !== undefined) set.done = true
      return next
    })
  }

  return (
    <Dialog open={session !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85svh] gap-3 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left">Edit session</DialogTitle>
        </DialogHeader>
        {draft && (
          <>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            {draft.exercises.map((ex, exIndex) => {
              const timed = exerciseMode(ex) === 'duration'
              return (
                <div key={exIndex} className="space-y-1.5 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-2.5">
                  <p className="text-sm font-semibold text-[var(--text-strong)]">{ex.name}</p>
                  {ex.sets.map((set, setIndex) => (
                    <div key={setIndex} className="flex items-center gap-2">
                      <span className="w-5 text-center text-xs font-bold text-muted-foreground">{setIndex + 1}</span>
                      {timed ? (
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Input
                            className="h-8 w-20 bg-white text-right tabular-nums"
                            type="number"
                            step="0.5"
                            value={set.durationSec != null ? Math.round((set.durationSec / 60) * 10) / 10 : ''}
                            placeholder={set.targetDurationSec ? String(Math.round(set.targetDurationSec / 60)) : ''}
                            onChange={(e) => {
                              const n = Number(e.target.value)
                              editSet(exIndex, setIndex, 'durationSec', Number.isFinite(n) && n > 0 ? Math.round(n * 60) : undefined)
                            }}
                          />
                          min
                        </label>
                      ) : (
                        <>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Input
                              className="h-8 w-16 bg-white text-right tabular-nums"
                              type="number"
                              value={set.reps ?? ''}
                              placeholder={String(set.targetReps)}
                              onChange={(e) => {
                                const n = Number(e.target.value)
                                editSet(exIndex, setIndex, 'reps', Number.isFinite(n) && n > 0 ? Math.round(n) : undefined)
                              }}
                            />
                            reps
                          </label>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Input
                              className="h-8 w-20 bg-white text-right tabular-nums"
                              type="number"
                              step="0.5"
                              value={set.weight ?? ''}
                              placeholder={set.targetWeight ? String(set.targetWeight) : 'bw'}
                              onChange={(e) => {
                                const n = Number(e.target.value)
                                editSet(exIndex, setIndex, 'weight', Number.isFinite(n) && n > 0 ? n : undefined)
                              }}
                            />
                            kg
                          </label>
                        </>
                      )}
                      {!set.done && <span className="text-[10px] text-muted-foreground">skipped</span>}
                    </div>
                  ))}
                </div>
              )
            })}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  saveSession(qc, draft)
                  onClose()
                }}
              >
                Save
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
