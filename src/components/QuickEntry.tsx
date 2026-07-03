import { useState } from 'react'
import { useAccounts, useCategories } from '../hooks/useData'
import { makeTransaction, useAllTransactions, useTransactionMutations } from '../hooks/useTransactions'
import { hasGeminiKey, parseWithGemini, GeminiError, NoGeminiKeyError } from '../lib/gemini'
import { quickParse } from '../lib/quickParse'
import { inferAccount } from '../lib/accounts'
import { todayISO } from '../lib/dates'
import { formatINRExact } from '../lib/money'
import type { ParsedEntry } from '../lib/types'

export default function QuickEntry() {
  const { categories, addCategory } = useCategories()
  const { accounts } = useAccounts()
  const { transactions: history } = useAllTransactions()
  const { saveAll } = useTransactionMutations()
  const [text, setText] = useState('')
  const [entries, setEntries] = useState<ParsedEntry[]>([])
  const [parsing, setParsing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  function withInferredAccounts(parsed: ParsedEntry[]): ParsedEntry[] {
    return parsed.map((e) => {
      if (e.account) return e
      if (accounts.length === 1) return { ...e, account: accounts[0].id }
      return { ...e, account: inferAccount(e.description, history) }
    })
  }

  async function parse() {
    const input = text.trim()
    if (!input || parsing) return
    setParsing(true)
    setNotice(null)
    try {
      const result = withInferredAccounts(await parseWithGemini(input, categories, accounts))
      if (result.length === 0) {
        setNotice('Could not find any transactions in that — try "tea 10" or "2 tea of 5".')
      } else if (result.some((e) => !e.account)) {
        setNotice('Could not tell which account some items belong to — pick one below.')
      }
      setEntries(result)
    } catch (e) {
      const fallback = withInferredAccounts(quickParse(input, categories))
      setEntries(fallback)
      if (e instanceof NoGeminiKeyError) {
        if (fallback.length === 0) {
          setNotice('Could not parse that. Add a Gemini key in Settings for smarter parsing.')
        }
      } else if (e instanceof GeminiError) {
        setNotice(`${e.message}${fallback.length > 0 ? ' — used simple parsing instead.' : ''}`)
      } else {
        setNotice('Parsing failed unexpectedly.')
      }
    } finally {
      setParsing(false)
    }
  }

  function updateEntry(index: number, patch: Partial<ParsedEntry>) {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)))
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }

  const knownCategoryIds = new Set(categories.map((c) => c.id))
  const missingAccount = accounts.length > 0 && entries.some((e) => !e.account)

  function saveEntries() {
    // Create any categories the AI invented before saving transactions that use them
    for (const e of entries) {
      if (!knownCategoryIds.has(e.category)) {
        addCategory({
          id: e.category,
          name: e.categoryName ?? e.category,
          emoji: e.categoryEmoji ?? '🏷️',
          type: e.type,
          hints: [e.description],
        })
      }
    }
    const txs = entries.map((e) =>
      makeTransaction({
        type: e.type,
        amount: e.totalAmount,
        date: e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : todayISO(),
        category: e.category,
        account: e.account,
        note: e.description,
        quantity: e.quantity,
        source: 'ai',
      }),
    )
    saveAll(txs)
    setEntries([])
    setText('')
    setNotice(`Saved ${txs.length} transaction${txs.length > 1 ? 's' : ''}.`)
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder={
            hasGeminiKey()
              ? 'Quick add: "2 tea of 5", "coffee 30 and auto 60", "salary 90000 yesterday"…'
              : 'Quick add: "tea 10", "coffee 30 and auto 60"…'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void parse()
          }}
        />
        <button
          type="button"
          onClick={() => void parse()}
          disabled={parsing || !text.trim()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {parsing ? 'Parsing…' : 'Parse'}
        </button>
      </div>
      {notice && <p className="mt-2 text-xs text-slate-500">{notice}</p>}
      {entries.length > 0 && (
        <div className="mt-3 space-y-2">
          {entries.map((entry, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <button
                type="button"
                onClick={() => updateEntry(i, { type: entry.type === 'expense' ? 'income' : 'expense' })}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  entry.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                }`}
                title="Toggle expense/income"
              >
                {entry.type}
              </button>
              <input
                className="min-w-0 flex-1 basis-28 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                value={entry.description}
                onChange={(e) => updateEntry(i, { description: e.target.value })}
              />
              <input
                className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm"
                type="number"
                step="0.01"
                min="0"
                value={entry.totalAmount}
                onChange={(e) => updateEntry(i, { totalAmount: Number(e.target.value) })}
              />
              <select
                className="min-w-0 max-w-44 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                value={entry.category}
                onChange={(e) => updateEntry(i, { category: e.target.value })}
              >
                {!knownCategoryIds.has(entry.category) && (
                  <option value={entry.category}>
                    {entry.categoryEmoji ?? '🏷️'} {entry.categoryName ?? entry.category} (new)
                  </option>
                )}
                {categories
                  .filter((c) => c.type === entry.type)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
              </select>
              {accounts.length > 0 && (
                <select
                  className={`min-w-0 max-w-40 rounded border bg-white px-2 py-1 text-sm ${
                    entry.account ? 'border-slate-300' : 'border-red-400 text-red-600'
                  }`}
                  value={entry.account ?? ''}
                  onChange={(e) => updateEntry(i, { account: e.target.value || undefined })}
                >
                  <option value="">Account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
              <input
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                type="date"
                value={entry.date ?? todayISO()}
                onChange={(e) => updateEntry(i, { date: e.target.value })}
              />
              {entry.quantity && entry.unitAmount ? (
                <span className="text-xs text-slate-500">
                  {entry.quantity} × {formatINRExact(entry.unitAmount)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => removeEntry(i)}
                className="ml-auto rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex items-center justify-end gap-2">
            {missingAccount && <span className="text-xs text-red-600">Pick an account for the highlighted items</span>}
            <button
              type="button"
              onClick={() => setEntries([])}
              className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={saveEntries}
              disabled={missingAccount || entries.some((e) => !Number.isFinite(e.totalAmount) || e.totalAmount <= 0)}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Save all ({entries.length})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
