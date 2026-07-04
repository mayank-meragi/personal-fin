import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
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
      tone: current.net < 0 ? 'text-red-600' : 'text-emerald-700',
    },
    {
      label: 'Spend vs last month',
      value: deltaPct === null ? '—' : `${delta >= 0 ? '+' : ''}${deltaPct}%`,
      tone: delta > 0 ? 'text-red-600' : 'text-emerald-700',
      sub: deltaPct === null ? 'no data for last month' : `${delta >= 0 ? '+' : '−'}${formatINR(Math.abs(delta))}`,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label} className="gap-1 p-4">
          <p className="text-xs text-muted-foreground">{tile.label}</p>
          <p className={cn('text-2xl font-semibold tracking-tight', tile.tone)}>{tile.value}</p>
          {tile.sub && <p className="text-xs text-muted-foreground">{tile.sub}</p>}
        </Card>
      ))}
    </div>
  )
}
