import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { clearFileCache, getConfig, setConfig } from '../lib/cache'
import { flush } from '../lib/sync'
import { useSyncState } from '../hooks/useSyncState'
import { makeAccountId, useAccounts } from '../hooks/useData'
import { accountTypeEmoji, accountTypeLabel } from '../lib/accounts'
import type { AccountType } from '../lib/types'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const sync = useSyncState()
  const { accounts, addAccounts, updateAccount } = useAccounts()
  const [geminiKey, setGeminiKey] = useState(getConfig('geminiKey') ?? '')
  const [saved, setSaved] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<AccountType>('bank')
  const [newBalance, setNewBalance] = useState('')

  const repo = getConfig('dataRepo')
  const branch = getConfig('dataBranch') ?? 'data'

  function note(msg: string) {
    setSaved(msg)
    setTimeout(() => setSaved(null), 2500)
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Data store</h2>
        <p className="text-sm text-slate-600">
          Data lives on the <code className="rounded bg-slate-100 px-1">{branch}</code> branch of{' '}
          <a
            className="text-sky-600 underline"
            href={`https://github.com/${repo}/tree/${branch}`}
            target="_blank"
            rel="noreferrer"
          >
            {repo}
          </a>
          . Sync status: {sync.status}
          {sync.pendingCount > 0 ? ` (${sync.pendingCount} pending)` : ''}.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void flush()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            Sync now
          </button>
          <button
            type="button"
            onClick={() => {
              if (sync.pendingCount > 0 && !confirm('There are unpushed changes that will be lost. Continue?')) return
              clearFileCache()
              void queryClient.invalidateQueries()
              note('Local cache cleared — refetching from GitHub.')
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            Force full re-sync
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm('Sign out? The GitHub token will be removed from this browser.')) return
              setConfig('githubToken', null)
              location.reload()
            }}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Sign out
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Accounts</h2>
        <ul className="divide-y divide-slate-100">
          {accounts.map((acc) => (
            <li key={acc.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="text-lg">{accountTypeEmoji[acc.type]}</span>
              <input
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={acc.name}
                onChange={(e) => updateAccount(acc.id, { name: e.target.value })}
              />
              <label className="flex items-center gap-1 text-xs text-slate-500">
                start ₹
                <input
                  className="w-28 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                  type="number"
                  step="0.01"
                  value={acc.startingBalance}
                  onChange={(e) => updateAccount(acc.id, { startingBalance: Number(e.target.value) || 0 })}
                />
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <input
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="New account name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <select
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={newType}
            onChange={(e) => setNewType(e.target.value as AccountType)}
          >
            {(Object.keys(accountTypeLabel) as AccountType[]).map((t) => (
              <option key={t} value={t}>
                {accountTypeEmoji[t]} {accountTypeLabel[t]}
              </option>
            ))}
          </select>
          <input
            className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm"
            type="number"
            step="0.01"
            placeholder="balance ₹"
            value={newBalance}
            onChange={(e) => setNewBalance(e.target.value)}
          />
          <button
            type="button"
            disabled={!newName.trim()}
            onClick={() => {
              let id = makeAccountId(newName)
              if (accounts.some((a) => a.id === id)) id = `${id}-${accounts.length + 1}`
              addAccounts([
                {
                  id,
                  name: newName.trim(),
                  type: newType,
                  startingBalance: Number(newBalance) || 0,
                  createdAt: new Date().toISOString(),
                },
              ])
              setNewName('')
              setNewBalance('')
              note('Account added.')
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Gemini API key</h2>
        <p className="text-sm text-slate-600">
          Powers AI quick entry and CSV categorization. Get one free at{' '}
          <a className="text-sky-600 underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>
          .
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="password"
            placeholder="AIza…"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              setConfig('geminiKey', geminiKey.trim() || null)
              note(geminiKey.trim() ? 'Gemini key saved.' : 'Gemini key removed.')
            }}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Save
          </button>
        </div>
      </section>

      {saved && <p className="text-sm text-emerald-700">{saved}</p>}
    </div>
  )
}
