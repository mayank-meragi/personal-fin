import { useState } from 'react'
import { makeAccountId, useAccounts } from '../hooks/useData'
import { accountTypeEmoji, accountTypeLabel } from '../lib/accounts'
import { formatINRExact } from '../lib/money'
import type { Account, AccountType } from '../lib/types'

/**
 * First-run screen after connecting: add at least one account (bank, credit
 * card, or cash) with its current balance. The app gate closes once saved.
 */
export default function AccountSetup() {
  const { addAccounts } = useAccounts()
  const [drafts, setDrafts] = useState<Account[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('bank')
  const [balance, setBalance] = useState('')

  function addDraft() {
    const trimmed = name.trim()
    if (!trimmed) return
    let id = makeAccountId(trimmed)
    if (drafts.some((d) => d.id === id)) id = `${id}-${drafts.length + 1}`
    setDrafts([
      ...drafts,
      {
        id,
        name: trimmed,
        type,
        startingBalance: Number(balance) || 0,
        createdAt: new Date().toISOString(),
      },
    ])
    setName('')
    setBalance('')
    setType('bank')
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Add your accounts</h1>
      <p className="mt-2 text-sm text-slate-600">
        Every expense and income is tied to an account. Add each bank, credit card, or cash
        stash you use, with what it holds right now. For a credit card, enter the amount you
        currently owe as a negative number.
      </p>

      {drafts.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {drafts.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-xl">{accountTypeEmoji[d.type]}</span>
              <div className="flex-1">
                <p className="text-sm font-medium">{d.name}</p>
                <p className="text-xs text-slate-500">{accountTypeLabel[d.type]}</p>
              </div>
              <span className="text-sm font-semibold">{formatINRExact(d.startingBalance)}</span>
              <button
                type="button"
                onClick={() => setDrafts(drafts.filter((x) => x.id !== d.id))}
                className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm">
          <span className="font-medium">Account name</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="HDFC Savings, ICICI Amazon Card, Cash…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="flex gap-2">
          {(Object.keys(accountTypeLabel) as AccountType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 rounded-md border px-2 py-1.5 text-sm ${
                type === t ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'
              }`}
            >
              {accountTypeEmoji[t]} {accountTypeLabel[t]}
            </button>
          ))}
        </div>
        <label className="block text-sm">
          <span className="font-medium">Current balance (₹)</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            type="number"
            step="0.01"
            placeholder="0"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={addDraft}
          disabled={!name.trim()}
          className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
        >
          + Add account
        </button>
      </div>

      <button
        type="button"
        disabled={drafts.length === 0}
        onClick={() => addAccounts(drafts)}
        className="mt-4 w-full rounded-md bg-slate-900 px-4 py-2.5 font-medium text-white disabled:opacity-50"
      >
        Finish setup ({drafts.length} account{drafts.length === 1 ? '' : 's'})
      </button>
    </div>
  )
}
