import { addMonths, currentMonthKey, monthLabel } from '../lib/dates'

interface Props {
  month: string
  onChange: (month: string) => void
}

export default function MonthPicker({ month, onChange }: Props) {
  const isCurrent = month === currentMonthKey()
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(addMonths(month, -1))}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-100"
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className="w-24 text-center text-sm font-medium">{monthLabel(month)}</span>
      <button
        type="button"
        onClick={() => onChange(addMonths(month, 1))}
        disabled={isCurrent}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-40"
        aria-label="Next month"
      >
        ›
      </button>
      {!isCurrent && (
        <button
          type="button"
          onClick={() => onChange(currentMonthKey())}
          className="text-xs text-sky-600 underline"
        >
          today
        </button>
      )}
    </div>
  )
}
