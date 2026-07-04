import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Pencil, Trash2 } from 'lucide-react'
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
    return <p className="py-8 text-center text-sm text-muted-foreground">Nothing here yet.</p>
  }

  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return (
    <Card className="gap-0 divide-y overflow-hidden p-0">
      {sorted.map((tx) => {
        const isTransfer = tx.type === 'transfer'
        const cat = catById.get(tx.category)
        const accName = tx.account ? accById.get(tx.account)?.name : undefined
        const toAccName = tx.toAccount ? accById.get(tx.toAccount)?.name : undefined
        return (
          <div key={tx.id} className="group flex items-center gap-3 px-4 py-2.5">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-base"
              title={isTransfer ? 'Transfer' : cat?.name}
            >
              {isTransfer ? '🔁' : (cat?.emoji ?? '📦')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {tx.note || (isTransfer ? 'Transfer' : cat?.name || tx.category)}
                {tx.quantity && tx.quantity > 1 ? ` ×${tx.quantity}` : ''}
              </p>
              <p className="truncate text-xs text-muted-foreground">
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
              className={cn(
                'text-sm font-semibold tabular-nums',
                tx.type === 'income' ? 'text-emerald-600' : isTransfer ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {tx.type === 'income' ? '+' : isTransfer ? '' : '−'}
              {formatINRExact(tx.amount)}
            </span>
            {(onEdit || onDelete) && (
              <div className="flex gap-0.5">
                {onEdit && (
                  <Button variant="ghost" size="icon-xs" onClick={() => onEdit(tx)} aria-label="Edit">
                    <Pencil />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(tx)}
                    aria-label="Delete"
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </Card>
  )
}
