import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { AiError, NoAiKeyError, hasAiKey } from '@/lib/ai'
import { currentMonthKey, todayISO } from '@/lib/dates'
import { getCachedFile } from '@/lib/cache'
import { FITNESS_PATHS } from '@/lib/paths'
import type { FitnessMemoryFile, FitnessProfile } from '@/modules/fitness/lib/types'
import { saveMeal, useMealsMonth, useMetrics, useTargets } from '../lib/data'
import { inferMealType, parseMeal, suggestTargets } from '../lib/nutrition'
import type { Meal, MealType } from '../lib/types'
import { useHealthMutations } from '../lib/data'
import MealEditDialog from '../components/MealEditDialog'

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner']
const MEAL_LABEL: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snacks', dinner: 'Dinner' }

/** Older meals predate mealType — infer from when they were logged. */
function mealTypeOf(meal: Meal): MealType {
  return meal.mealType ?? inferMealType(new Date(meal.createdAt))
}

function MacroBar({ label, value, target, unit }: { label: string; value: number; target?: number; unit: string }) {
  const pct = target ? Math.min((value / target) * 100, 100) : 0
  const over = target ? value > target : false
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-strong)]">
          {Math.round(value)}
          {target ? <span className="text-xs font-medium text-muted-foreground"> / {target}{unit}</span> : unit}
        </span>
      </div>
      {target ? (
        <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
          <div
            className={cn('h-full rounded-full', over ? 'bg-[var(--negative-500,#e5484d)]' : 'bg-[var(--brand)]')}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}

export default function FoodPage() {
  const qc = useQueryClient()
  const today = todayISO()
  const meals = useMealsMonth(currentMonthKey())
  const targets = useTargets()
  const metrics = useMetrics()
  const { removeMeal, setTargets } = useHealthMutations()

  const [text, setText] = useState('')
  const [image, setImage] = useState<{ mimeType: string; data: string; previewUrl: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingTargets, setEditingTargets] = useState(false)
  const [calInput, setCalInput] = useState('')
  const [proteinInput, setProteinInput] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [editing, setEditing] = useState<Meal | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const todayMeals = meals.filter((m) => m.date === today)
  const calories = todayMeals.reduce((s, m) => s + m.calories, 0)
  const protein = todayMeals.reduce((s, m) => s + m.proteinG, 0)

  function attachImage(blob: Blob) {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setImage({ mimeType: blob.type || 'image/png', data: base64, previewUrl: URL.createObjectURL(blob) })
    }
    reader.readAsDataURL(blob)
  }

  async function log() {
    const input = text.trim()
    if ((!input && !image) || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const meal = await parseMeal(input, image ? { mimeType: image.mimeType, data: image.data } : undefined)
      saveMeal(qc, meal)
      setText('')
      if (image) URL.revokeObjectURL(image.previewUrl)
      setImage(null)
      setNotice(`Logged ${meal.calories} kcal · ${meal.proteinG}g protein.`)
    } catch (e) {
      setNotice(
        e instanceof NoAiKeyError
          ? 'Logging food needs an AI key — add one in Settings.'
          : e instanceof AiError
            ? e.message
            : 'Could not log that.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function suggest() {
    if (suggesting) return
    setSuggesting(true)
    setNotice(null)
    try {
      const profile = getCachedFile<FitnessProfile | null>(FITNESS_PATHS.profile)?.content ?? null
      const coachNotes = getCachedFile<FitnessMemoryFile>(FITNESS_PATHS.memory)?.content.summary
      const latest = metrics[metrics.length - 1]
      const suggested = await suggestTargets({ profile, latestWeightKg: latest?.weightKg, coachNotes })
      setTargets(suggested)
      setCalInput(String(suggested.calories))
      setProteinInput(String(suggested.proteinG))
      setNotice(suggested.rationale ?? 'Targets set.')
      setEditingTargets(false)
    } catch (e) {
      setNotice(e instanceof AiError ? e.message : 'Could not suggest targets.')
    } finally {
      setSuggesting(false)
    }
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Food</h1>

      <Card>
        <CardContent className="space-y-3 py-3.5">
          <MacroBar label="Calories" value={calories} target={targets?.calories} unit=" kcal" />
          <MacroBar label="Protein" value={protein} target={targets?.proteinG} unit="g" />
          {!targets && (
            <p className="text-xs text-muted-foreground">
              No daily targets yet —{' '}
              <button type="button" className="underline underline-offset-4" onClick={() => setEditingTargets(true)}>
                set them
              </button>{' '}
              or{' '}
              <button type="button" className="underline underline-offset-4" disabled={suggesting || !hasAiKey()} onClick={() => void suggest()}>
                {suggesting ? 'thinking…' : 'let AI suggest'}
              </button>
              .
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quick log */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-card)] py-2 pr-2 pl-2 shadow-[var(--shadow-sm)] ring-1 ring-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => void log()}
            disabled={busy || (!text.trim() && !image)}
            aria-label="Log meal"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--ink-900)] text-white transition-transform active:scale-90 disabled:opacity-50"
          >
            <Sparkles className={cn('size-4', busy && 'animate-pulse')} />
          </button>
          <input
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--text-strong)] outline-none placeholder:text-[var(--text-subtle)]"
            placeholder='What did you eat — "2 rotis and dal, 100g paneer"'
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void log()
            }}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-label="Attach a food photo"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) attachImage(f)
              e.target.value = ''
            }}
          />
        </div>
        {image && (
          <div className="flex items-center gap-2">
            <img src={image.previewUrl} alt="Food" className="h-12 w-12 rounded-lg object-cover ring-1 ring-border" />
            <span className="text-xs text-muted-foreground">Photo attached</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Remove photo"
              onClick={() => {
                URL.revokeObjectURL(image.previewUrl)
                setImage(null)
              }}
            >
              <X />
            </Button>
          </div>
        )}
        {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      </div>

      {/* Today's meals, grouped by meal of day */}
      <div className="space-y-3">
        {MEAL_ORDER.map((type) => {
          const group = todayMeals.filter((m) => mealTypeOf(m) === type)
          if (group.length === 0) return null
          const groupCalories = group.reduce((s, m) => s + m.calories, 0)
          return (
            <section key={type} className="space-y-1.5">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{MEAL_LABEL[type]}</h2>
                <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">{groupCalories} kcal</span>
              </div>
              {group.map((meal: Meal) => (
                <Card key={meal.id}>
                  <CardContent className="flex items-start gap-3 py-3">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(meal)}>
                      <p className="text-sm font-semibold text-[var(--text-strong)]">{meal.description}</p>
                      <p className="text-xs text-muted-foreground">{meal.items.map((i) => i.name).join(' · ')}</p>
                    </button>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-bold tabular-nums">{meal.calories} kcal</p>
                      <p className="text-xs text-muted-foreground">{meal.proteinG}g protein</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Delete meal"
                      className="mt-0.5 shrink-0 rounded-full p-1 text-muted-foreground hover:text-red-600"
                      onClick={() => removeMeal(meal)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </CardContent>
                </Card>
              ))}
            </section>
          )
        })}
        {todayMeals.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing logged today — type what you ate above.</p>
        )}
      </div>

      <MealEditDialog meal={editing} onClose={() => setEditing(null)} />

      {/* Targets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Daily targets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {editingTargets || !targets ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="w-28"
                type="number"
                placeholder="kcal"
                value={calInput}
                onChange={(e) => setCalInput(e.target.value)}
              />
              <Input
                className="w-28"
                type="number"
                placeholder="protein g"
                value={proteinInput}
                onChange={(e) => setProteinInput(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!Number(calInput) || !Number(proteinInput)}
                onClick={() => {
                  setTargets({ calories: Math.round(Number(calInput)), proteinG: Math.round(Number(proteinInput)) })
                  setEditingTargets(false)
                  setNotice('Targets saved.')
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="outline" disabled={suggesting || !hasAiKey()} onClick={() => void suggest()}>
                {suggesting ? 'Thinking…' : 'Suggest with AI'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {targets.calories} kcal · {targets.proteinG}g protein
                {targets.rationale ? <span className="block text-xs">{targets.rationale}</span> : null}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCalInput(String(targets.calories))
                  setProteinInput(String(targets.proteinG))
                  setEditingTargets(true)
                }}
              >
                Edit
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
