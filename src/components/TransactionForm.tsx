import { useState } from 'react'
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
  const [note, setNote] = useState(initial?.note ?? '')

  const typeCategories = categories.filter((c) => c.type === type)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    if (accounts.length > 0 && !account) return
    const catValid = typeCategories.some((c) => c.id === category)
    const cat = catValid ? category : (typeCategories[0]?.id ?? 'other')
    const acc = account || undefined
    if (initial) {
      onSave({
        ...initial,
        type,
        amount: parsed,
        date,
        category: cat,
        account: acc,
        note,
        updatedAt: new Date().toISOString(),
      })
    } else {
      onSave(makeTransaction({ type, amount: parsed, date, category: cat, account: acc, note, source: 'manual' }))
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-lg sm:pb-5"
      >
        <h2 className="text-lg font-semibold">{initial ? 'Edit transaction' : 'Add transaction'}</h2>
        <div className="flex gap-2">
          {(['expense', 'income'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 rounded-md border px-3 py-1.5 text-sm capitalize ${
                type === t ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <label className="block text-sm">
          <span className="font-medium">Amount (₹)</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            type="number"
            step="0.01"
            min="0"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Date</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Category</span>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {typeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>
        {accounts.length > 0 && (
          <label className="block text-sm">
            <span className="font-medium">Account</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={account}
              required
              onChange={(e) => setAccount(e.target.value)}
            >
              {!account && <option value="">Select an account…</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm">
          <span className="font-medium">Note</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="tea, auto to office…"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
