import { useState } from 'react'
import BudgetCard from '../components/BudgetCard'
import MonthPicker from '../components/MonthPicker'
import { categoryDisplayName } from '../lib/categories'
import { effectiveLimit, useBudgets, useCategories } from '../hooks/useData'
import { useTransactions } from '../hooks/useTransactions'
import { currentMonthKey } from '../lib/dates'
import { spentByCategory } from '../lib/stats'

export default function BudgetsPage() {
  const [month, setMonth] = useState(currentMonthKey())
  const { categories } = useCategories()
  const { budgets, setMonthlyLimit } = useBudgets()
  const { data: transactions = [] } = useTransactions(month)
  const spent = spentByCategory(transactions)

  const expenseCategories = categories.filter((c) => c.type === 'expense')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Budgets</h1>
        <MonthPicker month={month} onChange={setMonth} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {expenseCategories.map((category) => (
          <BudgetCard
            key={category.id}
            category={category}
            displayName={categoryDisplayName(category, categories)}
            spent={spent[category.id] ?? 0}
            limit={effectiveLimit(budgets, month, category.id)}
            onLimitChange={(limit) => setMonthlyLimit(category.id, limit)}
          />
        ))}
      </div>
    </div>
  )
}
