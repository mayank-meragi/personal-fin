import { useAccounts, useCategories } from '../hooks/useData'
import { formatINRExact } from '../lib/money'
import type { Transaction } from '../lib/types'

interface Props {
  transactions: Transaction[]
  onEdit?: (tx: Transaction) => void
  onDelete?: (tx: Transaction) => void
}

export default function TransactionList({ transactions, onEdit, onDelete }: Props) {
  const { categories } = useCategories()
  const { accounts } = useAccounts()
  const catById = new Map(categories.map((c) => [c.id, c]))
  const accById = new Map(accounts.map((a) => [a.id, a]))

  if (transactions.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">No transactions this month yet.</p>
  }

  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {sorted.map((tx) => {
        const isTransfer = tx.type === 'transfer'
        const cat = catById.get(tx.category)
        const accName = tx.account ? accById.get(tx.account)?.name : undefined
        const toAccName = tx.toAccount ? accById.get(tx.toAccount)?.name : undefined
        return (
          <li key={tx.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-xl" title={isTransfer ? 'Transfer' : cat?.name}>
              {isTransfer ? '🔁' : (cat?.emoji ?? '📦')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {tx.note || (isTransfer ? 'Transfer' : cat?.name || tx.category)}
                {tx.quantity && tx.quantity > 1 ? ` ×${tx.quantity}` : ''}
              </p>
              <p className="text-xs text-slate-500">
                {new Date(tx.date + 'T00:00:00').toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
                {' · '}
                {isTransfer
                  ? `${accName ?? '?'} → ${toAccName ?? '?'}`
                  : `${cat?.name ?? tx.category}${accName ? ` · ${accName}` : ''}`}
                {tx.source !== 'manual' ? ` · ${tx.source}` : ''}
              </p>
            </div>
            <span
              className={`text-sm font-semibold ${
                tx.type === 'income' ? 'text-emerald-600' : isTransfer ? 'text-slate-500' : 'text-slate-900'
              }`}
            >
              {tx.type === 'income' ? '+' : isTransfer ? '' : '−'}
              {formatINRExact(tx.amount)}
            </span>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(tx)}
                className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                Edit
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(tx)}
                className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
