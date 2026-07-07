import { Card, CardContent } from '@/components/ui/card'
import { effectiveTodayISO } from '@/lib/dates'
import { useAllEntries } from '../lib/data'

function dayLabel(date: string, today: string): string {
  const days = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: date.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
  })
}

export default function HistoryPage() {
  const today = effectiveTodayISO()
  const { entries } = useAllEntries()

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">History</h1>

      {entries.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nothing yet — every day you write about lands here.
        </p>
      )}

      {entries.map((entry) => (
        <Card key={entry.date} className="p-4">
          <p className="text-sm font-semibold text-[var(--text-strong)]">{dayLabel(entry.date, today)}</p>
          <CardContent className="p-0">
            <p className="whitespace-pre-line text-sm leading-relaxed">{entry.text}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
