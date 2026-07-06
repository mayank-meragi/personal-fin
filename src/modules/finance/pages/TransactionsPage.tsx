import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import MonthPicker from '@/modules/finance/components/MonthPicker'
import TransactionForm from '@/modules/finance/components/TransactionForm'
import TransactionList from '@/modules/finance/components/TransactionList'
import { useTransactions, useTransactionMutations } from '@/hooks/useTransactions'
import { currentMonthKey } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import type { Transaction } from '@/lib/types'

export default function TransactionsPage() {
  const [month, setMonth] = useState(currentMonthKey())
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | undefined>()
  const { data: transactions = [] } = useTransactions(month)
  const { saveAll, update, remove } = useTransactionMutations()

  const spent = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
        <MonthPicker month={month} onChange={setMonth} />
        <span className="text-sm text-muted-foreground tabular-nums">spent {formatINR(spent)}</span>
        <Button
          className="ml-auto"
          onClick={() => {
            setEditing(undefined)
            setFormOpen(true)
          }}
        >
          <Plus data-icon="inline-start" />
          Add
        </Button>
      </div>
      <TransactionList
        transactions={transactions}
        onEdit={(tx) => {
          setEditing(tx)
          setFormOpen(true)
        }}
        onDelete={(tx) => {
          if (confirm(`Delete "${tx.note || tx.category}" of ${tx.amount}?`)) remove(tx)
        }}
      />
      {formOpen && (
        <TransactionForm
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSave={(tx) => {
            if (editing) update(editing, tx)
            else saveAll([tx])
          }}
        />
      )}
    </div>
  )
}
