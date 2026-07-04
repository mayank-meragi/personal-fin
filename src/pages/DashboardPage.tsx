import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      <QuickEntry />

      <SummaryCards current={totals(current)} previousExpense={totals(previous).expense} />

      {accounts.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          <Card className="min-w-36 shrink-0 gap-1 border-primary bg-primary p-4 text-primary-foreground">
            <p className="text-xs text-primary-foreground/70">Total balance</p>
            <p className="text-lg font-semibold tabular-nums tracking-tight">
              {formatINR(accounts.reduce((sum, acc) => sum + (balances[acc.id] ?? 0), 0))}
            </p>
          </Card>
          {accounts.map((acc) => (
            <Card key={acc.id} className="min-w-36 shrink-0 gap-1 p-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span aria-hidden>{accountTypeEmoji[acc.type]}</span>
                {acc.name}
              </p>
              <p
                className={cn(
                  'text-lg font-semibold tabular-nums tracking-tight',
                  (balances[acc.id] ?? 0) < 0 && 'text-red-600',
                )}
              >
                {formatINR(balances[acc.id] ?? 0)}
              </p>
            </Card>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-1.5">
          {warnings.map((w) => (
            <Link
              key={w.category.id}
              to="/budgets"
              className={cn(
                'block rounded-lg border px-3 py-2 text-sm',
                w.ratio > 1
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800',
              )}
            >
              ⚠ {w.category.emoji} {w.category.name}: {formatINR(w.spent)} of {formatINR(w.limit)}{' '}
              {w.ratio > 1 ? `— over by ${formatINR(w.spent - w.limit)}` : '— nearing limit'}
            </Link>
          ))}
        </div>
      )}

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Spend by category</CardTitle>
        </CardHeader>
        <CardContent>
          <CategorySpendChart transactions={current} />
        </CardContent>
      </Card>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Income vs expense — last 6 months</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart byMonth={byMonth} months={months} />
        </CardContent>
      </Card>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Recent transactions</h2>
          <Link to="/transactions" className="text-xs text-primary underline-offset-4 hover:underline">
            view all
          </Link>
        </div>
        <TransactionList transactions={recent} />
      </div>
    </div>
  )
}
