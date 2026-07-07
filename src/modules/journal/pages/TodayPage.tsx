import { Card, CardContent } from '@/components/ui/card'
import { effectiveTodayISO } from '@/lib/dates'
import NoteEditor from '../components/NoteEditor'

export default function TodayPage() {
  const today = effectiveTodayISO()
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
      </div>

      <Card>
        <CardContent>
          <NoteEditor />
        </CardContent>
      </Card>
    </div>
  )
}
