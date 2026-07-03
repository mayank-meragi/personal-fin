import { useState } from 'react'
import { Link } from 'react-router-dom'
import CategorySpendChart from '../components/CategorySpendChart'
import MonthPicker from '../components/MonthPicker'
import QuickEntry from '../components/QuickEntry'
import SummaryCards from '../components/SummaryCards'
import TransactionList from '../components/TransactionList'
import TrendChart from '../components/TrendChart'
import { effectiveLimit, useAccounts, useBudgets, useCategories } from '../hooks/useData'
import { useAllTransactions, useMonthsTransactions } from '../hooks/useTransactions'
import { accountBalances, accountTypeEmoji } from '../lib/accounts'
import { currentMonthKey, lastNMonthKeys } from '../lib/dates'
import { formatINR } from '../lib/money'
import { spentByCategory, totals } from '../lib/stats'

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonthKey())
  const months = lastNMonthKeys(6, month)
  const byMonth = useMonthsTransactions(months)
  const { categories } = useCategories()
  const { budgets } = useBudgets()
  const { accounts } = useAccounts()
  const { transactions: allTransactions } = useAllTransactions()

  const current = byMonth[month] ?? []
  const previous = byMonth[months[months.length - 2]] ?? []
  const spent = spentByCategory(current)

  const balances = accountBalances(accounts, allTransactions)
  const recent = [...allTransactions]
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
    .slice(0, 10)

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

      <QuickEntry />

      <SummaryCards current={totals(current)} previousExpense={totals(previous).expense} />

      {accounts.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          <div className="min-w-36 shrink-0 rounded-lg bg-slate-900 px-4 py-3 text-white">
            <p className="text-xs text-slate-300">Total balance</p>
            <p className="mt-1 text-lg font-semibold">
              {formatINR(accounts.reduce((sum, acc) => sum + (balances[acc.id] ?? 0), 0))}
            </p>
          </div>
          {accounts.map((acc) => (
            <div key={acc.id} className="min-w-36 shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <span aria-hidden>{accountTypeEmoji[acc.type]}</span>
                {acc.name}
              </p>
              <p
                className={`mt-1 text-lg font-semibold ${
                  (balances[acc.id] ?? 0) < 0 ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                {formatINR(balances[acc.id] ?? 0)}
              </p>
            </div>
          ))}
        </div>
      )}

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

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-slate-700">Recent transactions</h2>
          <Link to="/transactions" className="text-xs text-sky-600 underline">
            view all
          </Link>
        </div>
        <TransactionList transactions={recent} />
      </div>
    </div>
  )
}
