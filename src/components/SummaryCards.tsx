import { formatINR } from '../lib/money'
import type { MonthTotals } from '../lib/stats'

interface Props {
  current: MonthTotals
  previousExpense: number
}

export default function SummaryCards({ current, previousExpense }: Props) {
  const delta = current.expense - previousExpense
  const deltaPct = previousExpense > 0 ? Math.round((delta / previousExpense) * 100) : null

  const tiles = [
    { label: 'Income', value: formatINR(current.income) },
    { label: 'Spent', value: formatINR(current.expense) },
    {
      label: 'Net',
      value: formatINR(current.net),
      tone: current.net < 0 ? 'text-red-700' : 'text-emerald-700',
    },
    {
      label: 'Spend vs last month',
      value: deltaPct === null ? '—' : `${delta >= 0 ? '+' : ''}${deltaPct}%`,
      tone: delta > 0 ? 'text-red-700' : 'text-emerald-700',
      sub: deltaPct === null ? 'no data for last month' : `${delta >= 0 ? '+' : '−'}${formatINR(Math.abs(delta))}`,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">{tile.label}</p>
          <p className={`mt-1 text-2xl font-semibold ${tile.tone ?? 'text-slate-900'}`}>{tile.value}</p>
          {tile.sub && <p className="mt-0.5 text-xs text-slate-500">{tile.sub}</p>}
        </div>
      ))}
    </div>
  )
}
