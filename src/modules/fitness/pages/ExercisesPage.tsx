import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { facets, useExercises } from '../lib/exerciseDb'
import { useAllWorkouts } from '../lib/data'
import type { Exercise } from '../lib/types'
import { ExerciseThumb } from '../components/ExerciseImage'
import ExerciseDetail from '../components/ExerciseDetail'

const PAGE = 40

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
}) {
  return (
    <select
      className="h-8 max-w-36 rounded-full border-none bg-[var(--surface-sunken)] px-3 text-xs font-medium text-[var(--text-body)] outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

export default function ExercisesPage() {
  const { data: exercises, isLoading, isError } = useExercises()
  const { sessions } = useAllWorkouts()
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState('')
  const [equipment, setEquipment] = useState('')
  const [level, setLevel] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Exercise | null>(null)

  const { muscles, equipment: equipmentOptions, levels } = useMemo(
    () => facets(exercises ?? []),
    [exercises],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (exercises ?? []).filter(
      (e) =>
        (!q || e.name.toLowerCase().includes(q) || e.primaryMuscles.some((m) => m.includes(q))) &&
        (!muscle || e.primaryMuscles.includes(muscle)) &&
        (!equipment || e.equipment === equipment) &&
        (!level || e.level === level),
    )
  }, [exercises, search, muscle, equipment, level])

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Exercises</h1>

      <div className="flex items-center gap-2 rounded-full bg-[var(--surface-card)] py-1.5 pr-3 pl-4 ring-1 ring-[var(--border-subtle)]">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          className="h-8 border-none bg-transparent p-0 shadow-none focus-visible:ring-0"
          placeholder="Search 873 exercises…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setLimit(PAGE)
          }}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FilterSelect value={muscle} onChange={setMuscle} options={muscles} placeholder="All muscles" />
        <FilterSelect value={equipment} onChange={setEquipment} options={equipmentOptions} placeholder="All equipment" />
        <FilterSelect value={level} onChange={setLevel} options={levels} placeholder="Any level" />
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading the exercise library…</p>}
      {isError && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Could not load the exercise library — are you offline?
        </p>
      )}

      <div className="space-y-1.5">
        {filtered.slice(0, limit).map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setSelected(e)}
            className="flex w-full items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--surface-card)] p-2.5 text-left ring-1 ring-[var(--border-subtle)] transition-transform active:scale-[0.99]"
          >
            <ExerciseThumb exercise={e} className="size-14" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{e.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {e.primaryMuscles.join(', ')}
                {e.equipment ? ` · ${e.equipment}` : ''}
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0 capitalize">
              {e.level}
            </Badge>
          </button>
        ))}
      </div>

      {filtered.length > limit && (
        <Button variant="outline" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({filtered.length - limit} left)
        </Button>
      )}
      {!isLoading && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing matches those filters.</p>
      )}

      <ExerciseDetail exercise={selected} sessions={sessions} onClose={() => setSelected(null)} />
    </div>
  )
}
