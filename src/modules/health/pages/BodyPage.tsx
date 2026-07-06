import { useState } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { todayISO } from '@/lib/dates'
import { useHealthMutations, useMetrics } from '../lib/data'
import type { BodyMetric } from '../lib/types'

/** Simple 30-day weight sparkline (SVG, no chart lib). */
function WeightSpark({ points }: { points: { date: string; weightKg: number }[] }) {
  if (points.length < 2) return null
  const values = points.map((p) => p.weightKg)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const W = 300
  const H = 56
  const path = points
    .map((p, i) => `${(i / (points.length - 1)) * W},${H - 6 - ((p.weightKg - min) / range) * (H - 12)}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
      <polyline points={path} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function BodyPage() {
  const metrics = useMetrics()
  const { addMetric, removeMetric } = useHealthMutations()
  const [weight, setWeight] = useState('')
  const [waist, setWaist] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editWeight, setEditWeight] = useState('')
  const [editWaist, setEditWaist] = useState('')

  function startEdit(m: BodyMetric) {
    setEditingId(m.id)
    setEditWeight(String(m.weightKg))
    setEditWaist(m.waistCm != null ? String(m.waistCm) : '')
  }

  function commitEdit(m: BodyMetric) {
    const w = Number(editWeight)
    if (!Number.isFinite(w) || w <= 0) return
    addMetric({
      ...m,
      weightKg: Math.round(w * 10) / 10,
      waistCm: Number(editWaist) > 0 ? Math.round(Number(editWaist) * 10) / 10 : undefined,
    })
    setEditingId(null)
  }

  const latest = metrics[metrics.length - 1]
  const previous = metrics[metrics.length - 2]
  const delta = latest && previous ? latest.weightKg - previous.weightKg : null
  const last30 = metrics.slice(-30)

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Body</h1>

      <Card>
        <CardContent className="space-y-2 py-3.5">
          <div className="flex items-end justify-between">
            <div>
              <p className="perfin-eyebrow text-[var(--text-subtle)]">Current weight</p>
              <p className="font-mono text-2xl font-bold tabular-nums text-[var(--text-strong)]">
                {latest ? `${latest.weightKg} kg` : '—'}
              </p>
            </div>
            {delta !== null && delta !== 0 && (
              <p
                className="text-xs font-semibold"
                style={{ color: delta < 0 ? 'var(--money-in)' : 'var(--money-out)' }}
              >
                {delta > 0 ? '+' : ''}
                {Math.round(delta * 10) / 10} kg since last
              </p>
            )}
          </div>
          <WeightSpark points={last30} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Log today</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-28"
              type="number"
              step="0.1"
              inputMode="decimal"
              placeholder="weight kg"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <Input
              className="w-28"
              type="number"
              step="0.5"
              inputMode="decimal"
              placeholder="waist cm"
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!Number(weight)}
              onClick={() => {
                addMetric({
                  id: crypto.randomUUID(),
                  date: todayISO(),
                  weightKg: Math.round(Number(weight) * 10) / 10,
                  waistCm: Number(waist) > 0 ? Math.round(Number(waist) * 10) / 10 : undefined,
                })
                setWeight('')
                setWaist('')
                setNotice('Logged.')
                setTimeout(() => setNotice(null), 2000)
              }}
            >
              Log
            </Button>
            {notice && <span className="text-xs text-emerald-700">{notice}</span>}
          </div>
          <p className="text-xs text-muted-foreground">Weigh in at the same time of day for a clean trend — mornings work best.</p>
        </CardContent>
      </Card>

      <div className="space-y-1">
        {metrics
          .slice()
          .reverse()
          .slice(0, 30)
          .map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-[var(--radius-md)] px-1 py-2">
              <p className="w-20 shrink-0 text-xs text-muted-foreground">
                {new Date(m.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </p>
              {editingId === m.id ? (
                <>
                  <Input
                    className="h-8 w-24 text-right tabular-nums"
                    type="number"
                    step="0.1"
                    value={editWeight}
                    autoFocus
                    onChange={(e) => setEditWeight(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(m)
                    }}
                  />
                  <Input
                    className="h-8 w-20 text-right tabular-nums"
                    type="number"
                    step="0.5"
                    placeholder="waist"
                    value={editWaist}
                    onChange={(e) => setEditWaist(e.target.value)}
                  />
                  <span className="flex-1" />
                  <button
                    type="button"
                    aria-label="Save"
                    className="rounded-full bg-[var(--emerald-600)] p-1.5 text-white"
                    onClick={() => commitEdit(m)}
                  >
                    <Check className="size-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <p className="flex-1 font-mono text-sm font-bold tabular-nums">{m.weightKg} kg</p>
                  {m.waistCm && <p className="text-xs text-muted-foreground">waist {m.waistCm} cm</p>}
                  <button
                    type="button"
                    aria-label="Edit entry"
                    className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => startEdit(m)}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete entry"
                    className="rounded-full p-1 text-muted-foreground hover:text-red-600"
                    onClick={() => removeMetric(m.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        {metrics.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No entries yet — log your first weigh-in above.</p>
        )}
      </div>
    </div>
  )
}
