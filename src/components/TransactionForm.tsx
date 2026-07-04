import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useAccounts, useCategories } from '../hooks/useData'
import { makeTransaction } from '../hooks/useTransactions'
import { todayISO } from '../lib/dates'
import type { Transaction, TransactionType } from '../lib/types'

interface Props {
  /** When set, the form edits this transaction instead of creating one */
  initial?: Transaction
  onSave: (tx: Transaction) => void
  onClose: () => void
}

export default function TransactionForm({ initial, onSave, onClose }: Props) {
  const { categories } = useCategories()
  const { accounts } = useAccounts()
  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [category, setCategory] = useState(initial?.category ?? 'other')
  const [account, setAccount] = useState(initial?.account ?? accounts[0]?.id ?? '')
  const [toAccount, setToAccount] = useState(initial?.toAccount ?? '')
  const [note, setNote] = useState(initial?.note ?? '')

  const isTransfer = type === 'transfer'
  const typeCategories = categories.filter((c) => c.type === type)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    if (accounts.length > 0 && !account) return
    if (isTransfer && (!toAccount || toAccount === account)) return
    const catValid = typeCategories.some((c) => c.id === category)
    const cat = isTransfer ? 'transfer' : catValid ? category : (typeCategories[0]?.id ?? 'other')
    const acc = account || undefined
    const toAcc = isTransfer ? toAccount : undefined
    if (initial) {
      onSave({
        ...initial,
        type,
        amount: parsed,
        date,
        category: cat,
        account: acc,
        toAccount: toAcc,
        note,
        updatedAt: new Date().toISOString(),
      })
    } else {
      onSave(
        makeTransaction({
          type,
          amount: parsed,
          date,
          category: cat,
          account: acc,
          toAccount: toAcc,
          note,
          source: 'manual',
        }),
      )
    }
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="top-auto bottom-0 max-h-[90vh] w-full max-w-full translate-y-0 overflow-y-auto rounded-b-none rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:top-1/2 sm:bottom-auto sm:max-w-md sm:-translate-y-1/2 sm:rounded-2xl sm:pb-6">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit transaction' : 'Add transaction'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(['expense', 'income', 'transfer'] as const).map((t) => (
              <Button
                key={t}
                type="button"
                variant={type === t ? 'default' : 'outline'}
                className={cn('capitalize')}
                onClick={() => setType(t)}
              >
                {t}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tx-amount">Amount (₹)</Label>
            <Input
              id="tx-amount"
              type="number"
              step="0.01"
              min="0"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tx-date">Date</Label>
            <Input id="tx-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {!isTransfer && (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {typeCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {accounts.length > 0 && (
            <div className="space-y-1.5">
              <Label>{isTransfer ? 'From account' : 'Account'}</Label>
              <Select value={account || undefined} onValueChange={setAccount}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isTransfer && accounts.length > 0 && (
            <div className="space-y-1.5">
              <Label>To account</Label>
              <Select value={toAccount || undefined} onValueChange={setToAccount}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a) => a.id !== account)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="tx-note">Note</Label>
            <Input
              id="tx-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="tea, auto to office…"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
