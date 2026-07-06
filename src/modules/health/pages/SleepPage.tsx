import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { todayISO } from '@/lib/dates'
import { useHealthMutations, useSleep } from '../lib/data'

export function computeHours(bedTime: string, wakeTime: string): number {
  const [bh, bm] = bedTime.split(':').map(Number)
  const [wh, wm] = wakeTime.split(':').map(Number)
  let minutes = wh * 60 + wm - (bh * 60 + bm)
  if (minutes <= 0) minutes += 24 * 60
  return Math.round((minutes / 60) * 10) / 10
}

function fmtHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const QUALITY = ['rough', 'meh', 'ok', 'good', 'great']

export default function SleepPage() {
  const sleep = useSleep()
  const { addSleep, removeSleep } = useHealthMutations()
  const today = todayISO()
  const [bedTime, setBedTime] = useState('23:00')
  const [wakeTime, setWakeTime] = useState('07:00')
  const [quality, setQuality] = useState<number | undefined>()

  const lastNight = sleep.find((s) => s.date === today)
  const last7 = sleep.slice(-7)
  const avg = last7.length > 0 ? last7.reduce((s, x) => s + x.hours, 0) / last7.length : null
  const maxHours = Math.max(9, ...last7.map((s) => s.hours))

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Sleep</h1>

      <Card>
        <CardContent className="flex items-end justify-between py-3.5">
          <div>
            <p className="perfin-eyebrow text-[var(--text-subtle)]">Last night</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-[var(--text-strong)]">
              {lastNight ? fmtHours(lastNight.hours) : '—'}
            </p>
            {lastNight?.quality && <p className="text-xs text-muted-foreground">felt {QUALITY[lastNight.quality - 1]}</p>}
          </div>
          {avg !== null && (
            <p className="text-xs font-semibold text-muted-foreground">7-day avg {fmtHours(Math.round(avg * 10) / 10)}</p>
          )}
        </CardContent>
      </Card>

      {/* 7-day bars */}
      {last7.length > 1 && (
        <Card>
          <CardContent className="flex items-end justify-between gap-2 py-3.5">
            {last7.map((s) => (
              <div key={s.id} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-20 w-full items-end">
                  <div
                    className={cn('w-full rounded-t-md', s.hours < 6 ? 'bg-[var(--viz-3)]' : 'bg-[var(--brand)]')}
                    style={{ height: `${(s.hours / maxHours) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(s.date).toLocaleDateString('en-IN', { weekday: 'narrow' })}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{lastNight ? 'Update last night' : 'Log last night'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              bed
              <input
                type="time"
                className="rounded-md bg-[var(--surface-sunken)] px-2 py-1.5 font-mono text-sm outline-none"
                value={bedTime}
                onChange={(e) => setBedTime(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              woke
              <input
                type="time"
                className="rounded-md bg-[var(--surface-sunken)] px-2 py-1.5 font-mono text-sm outline-none"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
              />
            </label>
            <span className="font-mono text-sm font-bold tabular-nums">{fmtHours(computeHours(bedTime, wakeTime))}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUALITY.map((q, i) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuality(quality === i + 1 ? undefined : i + 1)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium',
                  quality === i + 1
                    ? 'bg-[var(--ink-900)] font-semibold text-white'
                    : 'bg-[var(--surface-sunken)] text-[var(--text-body)]',
                )}
              >
                {q}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() => {
              addSleep({
                id: crypto.randomUUID(),
                date: today,
                hours: computeHours(bedTime, wakeTime),
                bedTime,
                wakeTime,
                quality,
              })
              setQuality(undefined)
            }}
          >
            {lastNight ? 'Update' : 'Log sleep'}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-1">
        {sleep
          .slice()
          .reverse()
          .slice(0, 21)
          .map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-[var(--radius-md)] px-1 py-2">
              <p className="w-20 shrink-0 text-xs text-muted-foreground">
                {new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </p>
              <p className="flex-1 font-mono text-sm font-bold tabular-nums">{fmtHours(s.hours)}</p>
              {s.bedTime && s.wakeTime && (
                <p className="text-xs text-muted-foreground">
                  {s.bedTime}–{s.wakeTime}
                </p>
              )}
              {s.quality && <p className="text-xs text-muted-foreground">{QUALITY[s.quality - 1]}</p>}
              <button
                type="button"
                aria-label="Delete entry"
                className="rounded-full p-1 text-muted-foreground hover:text-red-600"
                onClick={() => removeSleep(s.id)}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
      </div>
    </div>
  )
}
