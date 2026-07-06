import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Beef,
  ChevronDown,
  ChevronUp,
  Cookie,
  Flame,
  ImagePlus,
  Moon,
  Pencil,
  Soup,
  Sparkles,
  Sunrise,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { AiError, NoAiKeyError, hasAiKey } from '@/lib/ai'
import { effectiveTodayISO, monthKey } from '@/lib/dates'
import { getCachedFile } from '@/lib/cache'
import { FITNESS_PATHS } from '@/lib/paths'
import type { FitnessMemoryFile, FitnessProfile } from '@/modules/fitness/lib/types'
import { saveMeal, useMealsMonth, useMetrics, useTargets } from '../lib/data'
import { inferMealType, parseMeal, suggestTargets } from '../lib/nutrition'
import type { Meal, MealType } from '../lib/types'
import { useHealthMutations } from '../lib/data'
import MealEditDialog from '../components/MealEditDialog'

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner']
const MEAL_META: Record<MealType, { label: string; icon: typeof Sunrise }> = {
  breakfast: { label: 'Breakfast', icon: Sunrise },
  lunch: { label: 'Lunch', icon: Soup },
  snack: { label: 'Snacks', icon: Cookie },
  dinner: { label: 'Dinner', icon: Moon },
}

/** Older meals predate mealType — infer from when they were logged. */
function mealTypeOf(meal: Meal): MealType {
  return meal.mealType ?? inferMealType(new Date(meal.createdAt))
}

function CalorieRing({ value, target }: { value: number; target?: number }) {
  const R = 52
  const C = 2 * Math.PI * R
  const progress = target ? Math.min(value / target, 1) : 0
  return (
    <div className="relative flex size-32 shrink-0 items-center justify-center">
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--surface-sunken)" strokeWidth="9" />
        {target ? (
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={value > target ? 'var(--money-out)' : 'var(--brand)'}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${progress * C} ${C}`}
          />
        ) : null}
      </svg>
      <div className="text-center">
        <p className="font-mono text-2xl font-bold tabular-nums text-[var(--text-strong)]">{Math.round(value)}</p>
        <p className="text-[10px] leading-tight text-muted-foreground">
          kcal{target ? <span className="block">of {target} kcal</span> : null}
        </p>
      </div>
    </div>
  )
}

function MacroRow({
  icon: Icon,
  label,
  value,
  target,
  unit,
}: {
  icon: typeof Flame
  label: string
  value: number
  target?: number
  unit: string
}) {
  const pct = target ? Math.round((value / target) * 100) : null
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--emerald-100)] text-[var(--emerald-700)]">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-[var(--text-strong)]">{label}</span>
          <span className="font-mono text-sm font-bold whitespace-nowrap tabular-nums">
            {Math.round(value)}
            {target ? <span className="text-xs font-medium text-muted-foreground"> / {target}{unit}</span> : unit}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className={cn('h-full rounded-full', pct !== null && pct > 100 ? 'bg-[var(--money-out)]' : 'bg-[var(--brand)]')}
              style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
            />
          </div>
          {pct !== null && <span className="w-9 shrink-0 text-right text-[10px] font-bold text-[var(--emerald-700)]">{pct}%</span>}
        </div>
      </div>
    </div>
  )
}

export default function FoodPage() {
  const qc = useQueryClient()
  const today = effectiveTodayISO()
  const meals = useMealsMonth(monthKey(today))
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
  const [moreNutrients, setMoreNutrients] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<MealType>>(new Set(MEAL_ORDER))
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const todayMeals = meals.filter((m) => m.date === today)
  const calories = todayMeals.reduce((s, m) => s + m.calories, 0)
  const protein = todayMeals.reduce((s, m) => s + m.proteinG, 0)
  const carbs = todayMeals.reduce((s, m) => s + (m.carbsG ?? 0), 0)
  const fat = todayMeals.reduce((s, m) => s + (m.fatG ?? 0), 0)

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

      {/* Nutrition summary */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--text-strong)]">Nutrition summary</h2>
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
              onClick={() => {
                setCalInput(targets ? String(targets.calories) : '')
                setProteinInput(targets ? String(targets.proteinG) : '')
                setEditingTargets((v) => !v)
              }}
            >
              <Pencil className="size-3" /> Edit goals
            </button>
          </div>

          {editingTargets ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-24" type="number" placeholder="kcal" value={calInput} onChange={(e) => setCalInput(e.target.value)} />
              <Input className="w-24" type="number" placeholder="protein g" value={proteinInput} onChange={(e) => setProteinInput(e.target.value)} />
              <Button
                size="sm"
                disabled={!Number(calInput) || !Number(proteinInput)}
                onClick={() => {
                  setTargets({ calories: Math.round(Number(calInput)), proteinG: Math.round(Number(proteinInput)) })
                  setEditingTargets(false)
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="outline" disabled={suggesting || !hasAiKey()} onClick={() => void suggest()}>
                {suggesting ? 'Thinking…' : 'Suggest with AI'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <CalorieRing value={calories} target={targets?.calories} />
              <div className="min-w-0 flex-1 space-y-3">
                <MacroRow icon={Flame} label="Calories" value={calories} target={targets?.calories} unit=" kcal" />
                <MacroRow icon={Beef} label="Protein" value={protein} target={targets?.proteinG} unit="g" />
              </div>
            </div>
          )}

          {!targets && !editingTargets && (
            <p className="text-xs text-muted-foreground">
              No goals yet —{' '}
              <button type="button" className="underline underline-offset-4" onClick={() => setEditingTargets(true)}>
                set them
              </button>{' '}
              or{' '}
              <button
                type="button"
                className="underline underline-offset-4"
                disabled={suggesting || !hasAiKey()}
                onClick={() => void suggest()}
              >
                {suggesting ? 'thinking…' : 'let AI suggest'}
              </button>
              .
            </p>
          )}

          {moreNutrients && (
            <div className="flex gap-6 border-t border-[var(--border-subtle)] pt-3">
              <p className="text-sm text-muted-foreground">
                Carbs <span className="font-mono font-bold text-[var(--text-strong)] tabular-nums">{Math.round(carbs)}g</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Fat <span className="font-mono font-bold text-[var(--text-strong)] tabular-nums">{Math.round(fat)}g</span>
              </p>
            </div>
          )}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            onClick={() => setMoreNutrients((v) => !v)}
          >
            {moreNutrients ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {moreNutrients ? 'Fewer nutrients' : 'View more nutrients'}
          </button>
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
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--text-strong)] outline-none placeholder:text-[var(--text-subtle)]"
            placeholder='What did you eat — "2 rotis and dal, 100g chicken"'
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

      {/* Meal sections */}
      {MEAL_ORDER.map((type) => {
        const meta = MEAL_META[type]
        const group = todayMeals.filter((m) => mealTypeOf(m) === type)
        const groupCalories = group.reduce((s, m) => s + m.calories, 0)
        const isCollapsed = collapsed.has(type)
        return (
          <section key={type} className="space-y-1.5">
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-1"
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev)
                  if (next.has(type)) next.delete(type)
                  else next.add(type)
                  return next
                })
              }
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--emerald-100)] text-[var(--emerald-700)]">
                <meta.icon className="size-4" />
              </span>
              <span className="flex-1 text-left text-sm font-bold text-[var(--text-strong)]">{meta.label}</span>
              {groupCalories > 0 && (
                <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-strong)]">{groupCalories} kcal</span>
              )}
              {isCollapsed ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronUp className="size-4 text-muted-foreground" />
              )}
            </button>

            {!isCollapsed && (
              <>
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
              </>
            )}
          </section>
        )
      })}

      <MealEditDialog meal={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
