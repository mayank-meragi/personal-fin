import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { saveMeal } from '../lib/data'
import type { Meal, MealItem, MealType } from '../lib/types'

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner']

interface Props {
  meal: Meal | null
  onClose: () => void
}

export default function MealEditDialog({ meal, onClose }: Props) {
  const qc = useQueryClient()
  const [description, setDescription] = useState('')
  const [mealType, setMealType] = useState<MealType>('lunch')
  const [items, setItems] = useState<MealItem[]>([])

  useEffect(() => {
    if (!meal) return
    setDescription(meal.description)
    setMealType(meal.mealType ?? 'lunch')
    setItems(meal.items.map((i) => ({ ...i })))
  }, [meal])

  function editItem(index: number, patch: Partial<MealItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function save() {
    if (!meal) return
    const cleaned = items.filter((i) => i.name.trim())
    const sum = (pick: (i: MealItem) => number | undefined) => cleaned.reduce((s, i) => s + (pick(i) ?? 0), 0)
    saveMeal(qc, {
      ...meal,
      description: description.trim() || meal.description,
      mealType,
      items: cleaned,
      calories: sum((i) => i.calories),
      proteinG: sum((i) => i.proteinG),
      carbsG: sum((i) => i.carbsG) || undefined,
      fatG: sum((i) => i.fatG) || undefined,
    })
    onClose()
  }

  return (
    <Dialog open={meal !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85svh] gap-3 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left">Edit meal</DialogTitle>
        </DialogHeader>

        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />

        <div className="flex flex-wrap gap-1.5">
          {MEAL_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMealType(t)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium capitalize',
                mealType === t
                  ? 'bg-[var(--ink-900)] font-semibold text-white'
                  : 'bg-[var(--surface-sunken)] text-[var(--text-body)]',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="space-y-1.5 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-2.5">
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 flex-1 bg-white"
                  value={item.name}
                  onChange={(e) => editItem(i, { name: e.target.value })}
                />
                <button
                  type="button"
                  aria-label="Remove item"
                  className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-red-600"
                  onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Input
                    className="h-8 w-20 bg-white text-right tabular-nums"
                    type="number"
                    value={item.calories}
                    onChange={(e) => editItem(i, { calories: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                  />
                  kcal
                </label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Input
                    className="h-8 w-16 bg-white text-right tabular-nums"
                    type="number"
                    value={item.proteinG}
                    onChange={(e) => editItem(i, { proteinG: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                  />
                  g protein
                </label>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setItems((prev) => [...prev, { name: '', calories: 0, proteinG: 0 }])}
          >
            Add item
          </Button>
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="font-mono text-sm font-bold tabular-nums">
            {items.reduce((s, i) => s + (i.calories || 0), 0)} kcal · {items.reduce((s, i) => s + (i.proteinG || 0), 0)}g
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={items.filter((i) => i.name.trim()).length === 0}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
