import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addMonths, currentMonthKey, monthLabel } from '@/lib/dates'

interface Props {
  month: string
  onChange: (month: string) => void
}

export default function MonthPicker({ month, onChange }: Props) {
  const isCurrent = month === currentMonthKey()
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon-sm" onClick={() => onChange(addMonths(month, -1))} aria-label="Previous month">
        <ChevronLeft />
      </Button>
      <span className="w-20 text-center text-sm font-medium">{monthLabel(month)}</span>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => onChange(addMonths(month, 1))}
        disabled={isCurrent}
        aria-label="Next month"
      >
        <ChevronRight />
      </Button>
      {!isCurrent && (
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => onChange(currentMonthKey())}>
          today
        </Button>
      )}
    </div>
  )
}
