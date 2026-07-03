import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import CsvMapper from '../components/CsvMapper'
import { fileQueryKey, useCategories } from '../hooks/useData'
import { makeTransaction, useTransactionMutations } from '../hooks/useTransactions'
import { extractRows, guessMapping, parseBankCsv, computeImportHash, type ColumnMapping, type ImportedRow, type RawCsv } from '../lib/csv'
import { categorizeWithGemini, hasGeminiKey, GeminiError } from '../lib/gemini'
import { categorize } from '../lib/quickParse'
import { loadFile } from '../lib/sync'
import { monthKey, transactionsPath } from '../lib/dates'
import { formatINRExact } from '../lib/money'
import type { Transaction } from '../lib/types'

interface ReviewRow extends ImportedRow {
  category: string
  selected: boolean
  duplicate: boolean
}

export default function ImportPage() {
  const { categories } = useCategories()
  const { saveAll } = useTransactionMutations()
  const queryClient = useQueryClient()

  const [raw, setRaw] = useState<RawCsv | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onFile(file: File) {
    setNotice(null)
    setRows(null)
    const text = await file.text()
    const parsed = parseBankCsv(text)
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setNotice('Could not find any rows in that file.')
      return
    }
    setRaw(parsed)
    setMapping(guessMapping(parsed.headers))
  }

  async function buildReview() {
    if (!raw || !mapping) return
    setBusy('Checking for duplicates…')
    try {
      const extracted = extractRows(raw, mapping)
      if (extracted.length === 0) {
        setNotice('The mapping produced no valid rows — adjust the columns above.')
        return
      }
      const months = [...new Set(extracted.map((r) => monthKey(r.date)))]
      const existingHashes = new Set<string>()
      for (const month of months) {
        const path = transactionsPath(month)
        const existing = await queryClient.fetchQuery({
          queryKey: fileQueryKey(path),
          queryFn: () => loadFile<Transaction[]>(path, []),
        })
        for (const tx of existing) {
          if (tx.importHash) existingHashes.add(tx.importHash)
          existingHashes.add(computeImportHash(tx.date, tx.amount, tx.note))
        }
      }
      const seen = new Set<string>()
      setRows(
        extracted.map((row) => {
          const duplicate = existingHashes.has(row.importHash) || seen.has(row.importHash)
          seen.add(row.importHash)
          const cat = categorize(row.description, categories)
          const category = row.type === 'income'
            ? (cat.type === 'income' ? cat.id : 'other-income')
            : (cat.type === 'expense' ? cat.id : 'other')
          return { ...row, category, selected: !duplicate, duplicate }
        }),
      )
    } finally {
      setBusy(null)
    }
  }

  async function aiCategorize() {
    if (!rows) return
    const targets = rows
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => row.selected && (row.category === 'other' || row.category === 'other-income'))
    if (targets.length === 0) {
      setNotice('Nothing uncategorized to classify.')
      return
    }
    setBusy(`Categorizing ${targets.length} rows with AI…`)
    try {
      const ids = await categorizeWithGemini(
        targets.map(({ row }) => row.description),
        categories,
      )
      setRows((prev) =>
        prev
          ? prev.map((row, i) => {
              const t = targets.findIndex((x) => x.i === i)
              return t >= 0 ? { ...row, category: ids[t] } : row
            })
          : prev,
      )
    } catch (e) {
      setNotice(e instanceof GeminiError ? e.message : 'AI categorization failed.')
    } finally {
      setBusy(null)
    }
  }

  function doImport() {
    if (!rows) return
    const chosen = rows.filter((r) => r.selected)
    const txs = chosen.map((r) =>
      makeTransaction({
        type: r.type,
        amount: r.amount,
        date: r.date,
        category: r.category,
        note: r.description,
        source: 'csv',
        importHash: r.importHash,
      }),
    )
    saveAll(txs)
    setNotice(`Imported ${txs.length} transactions.`)
    setRaw(null)
    setMapping(null)
    setRows(null)
  }

  const selectedCount = rows?.filter((r) => r.selected).length ?? 0

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Import bank CSV</h1>

      <label className="block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 hover:border-slate-400">
        Drop or click to choose a bank statement CSV
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
            e.target.value = ''
          }}
        />
      </label>

      {notice && <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</p>}

      {raw && mapping && !rows && (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Map columns ({raw.rows.length} rows found)</h2>
          <CsvMapper raw={raw} mapping={mapping} onChange={setMapping} />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void buildReview()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ?? 'Continue to review'}
          </button>
        </div>
      )}

      {rows && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold">
              Review — {selectedCount} of {rows.length} selected
              {rows.some((r) => r.duplicate) &&
                ` (${rows.filter((r) => r.duplicate).length} likely duplicates unchecked)`}
            </h2>
            {hasGeminiKey() && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void aiCategorize()}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-50"
              >
                {busy ?? '✨ Categorize uncategorized with AI'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setRows(null)}
              className="ml-auto rounded-md px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
            >
              ← Back to mapping
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-2 py-1.5" />
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5">Description</th>
                  <th className="px-2 py-1.5">Category</th>
                  <th className="px-2 py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => (
                  <tr key={i} className={row.duplicate && !row.selected ? 'bg-slate-50 text-slate-400' : ''}>
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev ? prev.map((r, j) => (j === i ? { ...r, selected: e.target.checked } : r)) : prev,
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {row.date}
                      {row.duplicate && <span className="ml-1 text-xs">(dup)</span>}
                    </td>
                    <td className="max-w-64 truncate px-2 py-1.5">{row.description}</td>
                    <td className="px-2 py-1.5">
                      <select
                        className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
                        value={row.category}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev ? prev.map((r, j) => (j === i ? { ...r, category: e.target.value } : r)) : prev,
                          )
                        }
                      >
                        {categories
                          .filter((c) => c.type === row.type)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.emoji} {c.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className={`px-2 py-1.5 text-right ${row.type === 'income' ? 'text-emerald-600' : ''}`}>
                      {row.type === 'income' ? '+' : '−'}
                      {formatINRExact(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={selectedCount === 0 || busy !== null}
            onClick={doImport}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Import {selectedCount} transactions
          </button>
        </div>
      )}
    </div>
  )
}
