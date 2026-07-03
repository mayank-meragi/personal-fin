import { useState } from 'react'
import { Link } from 'react-router-dom'
import CategorySpendChart from '../components/CategorySpendChart'
import MonthPicker from '../components/MonthPicker'
import SummaryCards from '../components/SummaryCards'
import TrendChart from '../components/TrendChart'
import { effectiveLimit, useBudgets, useCategories } from '../hooks/useData'
import { useMonthsTransactions } from '../hooks/useTransactions'
import { currentMonthKey, lastNMonthKeys } from '../lib/dates'
import { formatINR } from '../lib/money'
import { spentByCategory, totals } from '../lib/stats'

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonthKey())
  const months = lastNMonthKeys(6, month)
  const byMonth = useMonthsTransactions(months)
  const { categories } = useCategories()
  const { budgets } = useBudgets()

  const current = byMonth[month] ?? []
  const previous = byMonth[months[months.length - 2]] ?? []
  const spent = spentByCategory(current)

  const warnings = categories
    .filter((c) => c.type === 'expense')
    .map((c) => {
      const limit = effectiveLimit(budgets, month, c.id)
      const s = spent[c.id] ?? 0
      return limit && limit > 0 ? { category: c, spent: s, limit, ratio: s / limit } : null
    })
    .filter((w): w is NonNullable<typeof w> => w !== null && w.ratio >= 0.85)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      <SummaryCards current={totals(current)} previousExpense={totals(previous).expense} />

      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w) => (
            <Link
              key={w.category.id}
              to="/budgets"
              className={`block rounded-md px-3 py-2 text-sm ${
                w.ratio > 1 ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'
              }`}
            >
              ⚠ {w.category.emoji} {w.category.name}: {formatINR(w.spent)} of {formatINR(w.limit)}{' '}
              {w.ratio > 1 ? `— over by ${formatINR(w.spent - w.limit)}` : '— nearing limit'}
            </Link>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-medium text-slate-700">Spend by category</h2>
        <CategorySpendChart transactions={current} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-medium text-slate-700">Income vs expense — last 6 months</h2>
        <TrendChart byMonth={byMonth} months={months} />
      </div>
    </div>
  )
}
