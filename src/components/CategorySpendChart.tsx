import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useCategories } from '../hooks/useData'
import { formatINR, formatINRCompact } from '../lib/money'
import { palette } from '../lib/palette'
import { spentByCategory } from '../lib/stats'
import type { Transaction } from '../lib/types'

interface Props {
  transactions: Transaction[]
}

/**
 * Spend by category for one month. The job is magnitude comparison, so all
 * bars share the sequential hue — identity comes from the row label.
 */
export default function CategorySpendChart({ transactions }: Props) {
  const { categories } = useCategories()
  const spent = spentByCategory(transactions)
  const data = categories
    .filter((c) => spent[c.id])
    .map((c) => ({ name: `${c.emoji} ${c.name}`, amount: spent[c.id] }))
    .sort((a, b) => b.amount - a.amount)

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">No spending this month yet.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 40 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, left: 8, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={palette.gridline} strokeWidth={1} />
        <XAxis
          type="number"
          tickFormatter={formatINRCompact}
          tick={{ fill: palette.muted, fontSize: 11 }}
          axisLine={{ stroke: palette.baseline }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fill: palette.inkSecondary, fontSize: 12 }}
          axisLine={{ stroke: palette.baseline }}
          tickLine={false}
        />
        <Tooltip
          formatter={(value) => [formatINR(Number(value)), 'Spent']}
          cursor={{ fill: 'rgba(11,11,11,0.04)' }}
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: palette.gridline }}
        />
        <Bar dataKey="amount" fill={palette.series1} barSize={20} radius={[0, 4, 4, 0]}>
          <LabelList
            dataKey="amount"
            position="right"
            formatter={(v) => formatINRCompact(Number(v ?? 0))}
            style={{ fill: palette.inkSecondary, fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
