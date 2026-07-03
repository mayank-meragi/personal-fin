import { useState } from 'react'
import MonthPicker from '../components/MonthPicker'
import TransactionForm from '../components/TransactionForm'
import TransactionList from '../components/TransactionList'
import { useTransactions, useTransactionMutations } from '../hooks/useTransactions'
import { currentMonthKey } from '../lib/dates'
import { formatINR } from '../lib/money'
import type { Transaction } from '../lib/types'

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
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <MonthPicker month={month} onChange={setMonth} />
        <span className="text-sm text-slate-500">spent {formatINR(spent)}</span>
        <button
          type="button"
          onClick={() => {
            setEditing(undefined)
            setFormOpen(true)
          }}
          className="ml-auto rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          + Add
        </button>
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
