import { useState } from 'react'
import { useCategories } from '../hooks/useData'
import { makeTransaction, useTransactionMutations } from '../hooks/useTransactions'
import { hasGeminiKey, parseWithGemini, GeminiError, NoGeminiKeyError } from '../lib/gemini'
import { quickParse } from '../lib/quickParse'
import { todayISO } from '../lib/dates'
import { formatINRExact } from '../lib/money'
import type { ParsedEntry } from '../lib/types'

export default function QuickEntry() {
  const { categories } = useCategories()
  const { saveAll } = useTransactionMutations()
  const [text, setText] = useState('')
  const [entries, setEntries] = useState<ParsedEntry[]>([])
  const [parsing, setParsing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function parse() {
    const input = text.trim()
    if (!input || parsing) return
    setParsing(true)
    setNotice(null)
    try {
      const result = await parseWithGemini(input, categories)
      if (result.length === 0) {
        setNotice('Could not find any transactions in that — try "tea 10" or "2 tea of 5".')
      }
      setEntries(result)
    } catch (e) {
      const fallback = quickParse(input, categories)
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

  function saveEntries() {
    const txs = entries.map((e) =>
      makeTransaction({
        type: e.type,
        amount: e.totalAmount,
        date: e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : todayISO(),
        category: e.category,
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
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                {categories
                  .filter((c) => c.type === entry.type)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
              </select>
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
          <div className="flex justify-end gap-2">
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
              disabled={entries.some((e) => !Number.isFinite(e.totalAmount) || e.totalAmount <= 0)}
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
