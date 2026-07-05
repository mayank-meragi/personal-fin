import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import CsvMapper from '../components/CsvMapper'
import { fileQueryKey, useAccounts, useCategories } from '../hooks/useData'
import { groupedCategories } from '../lib/categories'
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
  const { accounts } = useAccounts()
  const { saveAll } = useTransactionMutations()
  const queryClient = useQueryClient()

  const [raw, setRaw] = useState<RawCsv | null>(null)
  const [account, setAccount] = useState('')
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
        account: account || undefined,
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
      <h1 className="text-xl font-semibold tracking-tight">Import bank CSV</h1>

      <label className="block cursor-pointer rounded-xl border-2 border-dashed bg-background p-8 text-center text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground">
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

      {notice && <p className="rounded-lg border bg-muted/60 px-3 py-2 text-sm">{notice}</p>}

      {raw && mapping && !rows && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Map columns ({raw.rows.length} rows found)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {accounts.length > 0 && (
              <div className="max-w-xs space-y-1.5">
                <Label>Import into account</Label>
                <select
                  className={cn(
                    'h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs',
                    !account && 'border-red-300',
                  )}
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                >
                  <option value="">Select the statement's account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <CsvMapper raw={raw} mapping={mapping} onChange={setMapping} />
            <Button disabled={busy !== null || (accounts.length > 0 && !account)} onClick={() => void buildReview()}>
              {busy ?? 'Continue to review'}
            </Button>
          </CardContent>
        </Card>
      )}

      {rows && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Review — {selectedCount} of {rows.length} selected
              {rows.some((r) => r.duplicate) &&
                ` (${rows.filter((r) => r.duplicate).length} likely duplicates unchecked)`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {hasGeminiKey() && (
                <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void aiCategorize()}>
                  <Sparkles data-icon="inline-start" />
                  {busy ?? 'Categorize uncategorized with AI'}
                </Button>
              )}
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setRows(null)}>
                ← Back to mapping
              </Button>
            </div>
            <div className="max-h-96 overflow-y-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2" />
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Description</th>
                    <th className="px-2 py-2 font-medium">Category</th>
                    <th className="px-2 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-background">
                  {rows.map((row, i) => (
                    <tr key={i} className={cn(row.duplicate && !row.selected && 'bg-muted/40 text-muted-foreground')}>
                      <td className="px-2 py-1.5">
                        <Checkbox
                          checked={row.selected}
                          onCheckedChange={(checked) =>
                            setRows((prev) =>
                              prev ? prev.map((r, j) => (j === i ? { ...r, selected: checked === true } : r)) : prev,
                            )
                          }
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {row.date}
                        {row.duplicate && <span className="ml-1 text-xs">(dup)</span>}
                      </td>
                      <td className="max-w-64 truncate px-2 py-1.5">{row.description}</td>
                      <td className="px-2 py-1.5">
                        <select
                          className="h-7 rounded-md border border-input bg-background px-1.5 text-xs shadow-xs"
                          value={row.category}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev ? prev.map((r, j) => (j === i ? { ...r, category: e.target.value } : r)) : prev,
                            )
                          }
                        >
                          {groupedCategories(categories, row.type).map(({ parent, children }) =>
                            children.length > 0 ? (
                              <optgroup key={parent.id} label={parent.name}>
                                <option value={parent.id}>
                                  {parent.emoji} {parent.name}
                                </option>
                                {children.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.emoji} {c.name}
                                  </option>
                                ))}
                              </optgroup>
                            ) : (
                              <option key={parent.id} value={parent.id}>
                                {parent.emoji} {parent.name}
                              </option>
                            ),
                          )}
                        </select>
                      </td>
                      <td
                        className={cn(
                          'px-2 py-1.5 text-right tabular-nums',
                          row.type === 'income' && 'text-emerald-600',
                        )}
                      >
                        {row.type === 'income' ? '+' : '−'}
                        {formatINRExact(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button disabled={selectedCount === 0 || busy !== null} onClick={doImport}>
              Import {selectedCount} transactions
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
