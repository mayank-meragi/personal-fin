import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatINR, formatINRCompact } from '../lib/money'
import { monthLabel } from '../lib/dates'
import { palette } from '../lib/palette'
import { totals } from '../lib/stats'
import type { Transaction } from '../lib/types'

interface Props {
  /** month key → transactions, in chronological order */
  byMonth: Record<string, Transaction[]>
  months: string[]
}

/** Income vs expense over recent months — two categorical series with a legend. */
export default function TrendChart({ byMonth, months }: Props) {
  const data = months.map((m) => {
    const t = totals(byMonth[m] ?? [])
    return { month: monthLabel(m), income: t.income, expense: t.expense }
  })

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={palette.gridline} strokeWidth={1} />
        <XAxis
          dataKey="month"
          tick={{ fill: palette.muted, fontSize: 11 }}
          axisLine={{ stroke: palette.baseline }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatINRCompact}
          tick={{ fill: palette.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <Tooltip
          formatter={(value, name) => [formatINR(Number(value)), name === 'expense' ? 'Expense' : 'Income']}
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: palette.gridline }}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: palette.inkSecondary, fontSize: 12 }}>
              {value === 'expense' ? 'Expense' : 'Income'}
            </span>
          )}
        />
        <Line
          type="monotone"
          dataKey="expense"
          stroke={palette.series1}
          strokeWidth={2}
          dot={{ r: 4, fill: palette.series1, stroke: palette.surface, strokeWidth: 2 }}
        />
        <Line
          type="monotone"
          dataKey="income"
          stroke={palette.series2}
          strokeWidth={2}
          dot={{ r: 4, fill: palette.series2, stroke: palette.surface, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
