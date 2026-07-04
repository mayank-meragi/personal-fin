import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { fileQueryKey, useAccounts, useCategories, useFileQuery } from '../hooks/useData'
import { makeTransaction, useAllTransactions, useTransactionMutations } from '../hooks/useTransactions'
import { hasGeminiKey, parseWithGemini, GeminiError, NoGeminiKeyError } from '../lib/gemini'
import { quickParse } from '../lib/quickParse'
import { accountBalances, inferAccount } from '../lib/accounts'
import { AI_MEMORY_PATH, emptyAiMemory, maybeRefreshAiMemory, type AiMemoryFile } from '../lib/aiMemory'
import { todayISO } from '../lib/dates'
import { formatINRExact } from '../lib/money'
import type { ParsedEntry, TransactionType } from '../lib/types'

const TYPE_CYCLE: TransactionType[] = ['expense', 'income', 'transfer']

const typeStyles: Record<TransactionType, string> = {
  expense: 'bg-secondary text-secondary-foreground',
  income: 'bg-emerald-50 text-emerald-700',
  transfer: 'bg-sky-50 text-sky-700',
}

const fieldClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'

export default function QuickEntry() {
  const { categories, addCategory } = useCategories()
  const { accounts } = useAccounts()
  const { transactions: history } = useAllTransactions()
  const { saveAll } = useTransactionMutations()
  const { data: aiMemory } = useFileQuery<AiMemoryFile>(AI_MEMORY_PATH, emptyAiMemory)
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [entries, setEntries] = useState<ParsedEntry[]>([])
  const [parsing, setParsing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  function withInferredAccounts(parsed: ParsedEntry[]): ParsedEntry[] {
    return parsed.map((e) => {
      if (e.account) return e
      if (accounts.length === 1 && e.type !== 'transfer') return { ...e, account: accounts[0].id }
      return { ...e, account: e.type === 'transfer' ? undefined : inferAccount(e.description, history) }
    })
  }

  /**
   * "23k left in hdfc" → the entry's amount becomes the gap between the
   * account's computed balance and what the user says is actually there.
   * Overspend → expense; more than expected → income.
   */
  function resolveStatedBalance(entry: ParsedEntry): ParsedEntry {
    if (entry.statedBalance == null || !entry.account) return entry
    const balances = accountBalances(accounts, history)
    const delta = (balances[entry.account] ?? 0) - entry.statedBalance
    return {
      ...entry,
      type: delta >= 0 ? 'expense' : 'income',
      totalAmount: Math.abs(Math.round(delta * 100) / 100),
      category: entry.category === 'transfer' ? 'other' : entry.category,
    }
  }

  async function parse() {
    const input = text.trim()
    if (!input || parsing) return
    setParsing(true)
    setNotice(null)
    try {
      const result = withInferredAccounts(
        await parseWithGemini(input, categories, accounts, {
          balances: accountBalances(accounts, history),
          memory: aiMemory?.summary,
        }),
      ).map(resolveStatedBalance)
      const matched = result.filter((e) => e.statedBalance != null && e.account && e.totalAmount === 0)
      const remaining = result.filter((e) => !matched.includes(e))
      if (result.length === 0) {
        setNotice('Could not find any transactions in that — try "tea 10" or "2 tea of 5".')
      } else if (matched.length > 0 && remaining.length === 0) {
        setNotice('That balance already matches — nothing to record.')
      } else if (remaining.some((e) => !e.account || (e.type === 'transfer' && !e.toAccount))) {
        setNotice('Could not tell which account some items belong to — pick below.')
      }
      setEntries(remaining)
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
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== index) return e
        const next = { ...e, ...patch }
        // Re-derive the amount when the account changes under a balance declaration
        return patch.account !== undefined ? resolveStatedBalance(next) : next
      }),
    )
  }

  function cycleType(index: number) {
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== index) return e
        const next = TYPE_CYCLE[(TYPE_CYCLE.indexOf(e.type) + 1) % TYPE_CYCLE.length]
        return {
          ...e,
          type: next,
          category: next === 'transfer' ? 'transfer' : e.category === 'transfer' ? 'other' : e.category,
          toAccount: next === 'transfer' ? e.toAccount : undefined,
        }
      }),
    )
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }

  const knownCategoryIds = new Set(categories.map((c) => c.id))
  const missingAccount =
    accounts.length > 0 &&
    entries.some((e) => !e.account || (e.type === 'transfer' && (!e.toAccount || e.toAccount === e.account)))

  function saveEntries() {
    // Create any categories the AI invented before saving transactions that use them
    for (const e of entries) {
      if (e.type !== 'transfer' && !knownCategoryIds.has(e.category)) {
        addCategory({
          id: e.category,
          name: e.categoryName ?? e.category,
          emoji: e.categoryEmoji ?? '🏷️',
          type: e.type === 'income' ? 'income' : 'expense',
          hints: [e.description],
        })
      }
    }
    const txs = entries.map((e) =>
      makeTransaction({
        type: e.type,
        amount: e.totalAmount,
        date: e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : todayISO(),
        category: e.type === 'transfer' ? 'transfer' : e.category,
        account: e.account,
        toAccount: e.type === 'transfer' ? e.toAccount : undefined,
        note: e.description,
        quantity: e.quantity,
        source: 'ai',
      }),
    )
    saveAll(txs)
    setEntries([])
    setText('')
    setNotice(`Saved ${txs.length} transaction${txs.length > 1 ? 's' : ''}.`)
    // Update the AI's memory of this user in the background
    void maybeRefreshAiMemory([...history, ...txs], categories, accounts).then((next) => {
      if (next) queryClient.setQueryData(fileQueryKey(AI_MEMORY_PATH), next)
    })
  }

  return (
    <Card className="gap-3 p-4">
      <div className="flex gap-2">
        <Input
          placeholder={
            hasGeminiKey()
              ? '"2 tea of 5", "paid credit card 3200", "23k left in hdfc"…'
              : '"tea 10", "coffee 30 and auto 60"…'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void parse()
          }}
        />
        <Button onClick={() => void parse()} disabled={parsing || !text.trim()}>
          <Sparkles data-icon="inline-start" />
          {parsing ? 'Parsing…' : 'Add'}
        </Button>
      </div>
      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <button
                type="button"
                onClick={() => cycleType(i)}
                className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors', typeStyles[entry.type])}
                title="Toggle expense/income/transfer"
              >
                {entry.type}
              </button>
              <input
                className={cn(fieldClass, 'min-w-0 flex-1 basis-28')}
                value={entry.description}
                onChange={(e) => updateEntry(i, { description: e.target.value })}
              />
              <input
                className={cn(fieldClass, 'w-24 text-right tabular-nums')}
                type="number"
                step="0.01"
                min="0"
                value={entry.totalAmount}
                onChange={(e) => updateEntry(i, { totalAmount: Number(e.target.value) })}
              />
              {entry.type !== 'transfer' && (
                <select
                  className={cn(fieldClass, 'min-w-0 max-w-44')}
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
              )}
              {accounts.length > 0 && (
                <select
                  className={cn(fieldClass, 'min-w-0 max-w-40', !entry.account && 'border-red-300 text-red-600')}
                  value={entry.account ?? ''}
                  onChange={(e) => updateEntry(i, { account: e.target.value || undefined })}
                >
                  <option value="">{entry.type === 'transfer' ? 'From account…' : 'Account…'}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
              {entry.type === 'transfer' && accounts.length > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">→</span>
                  <select
                    className={cn(
                      fieldClass,
                      'min-w-0 max-w-40',
                      (!entry.toAccount || entry.toAccount === entry.account) && 'border-red-300 text-red-600',
                    )}
                    value={entry.toAccount ?? ''}
                    onChange={(e) => updateEntry(i, { toAccount: e.target.value || undefined })}
                  >
                    <option value="">To account…</option>
                    {accounts
                      .filter((a) => a.id !== entry.account)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </>
              )}
              <input
                className={fieldClass}
                type="date"
                value={entry.date ?? todayISO()}
                onChange={(e) => updateEntry(i, { date: e.target.value })}
              />
              {entry.quantity && entry.unitAmount ? (
                <span className="text-xs text-muted-foreground">
                  {entry.quantity} × {formatINRExact(entry.unitAmount)}
                </span>
              ) : null}
              {entry.statedBalance != null && entry.account ? (
                <span className="basis-full text-xs text-sky-700">
                  ↳ leaves {formatINRExact(entry.statedBalance)} in{' '}
                  {accounts.find((a) => a.id === entry.account)?.name ?? entry.account}
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto text-muted-foreground hover:text-destructive"
                onClick={() => removeEntry(i)}
                aria-label="Remove entry"
              >
                <X />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-end gap-2">
            {missingAccount && <span className="text-xs text-red-600">Pick accounts for the highlighted items</span>}
            <Button variant="ghost" size="sm" onClick={() => setEntries([])}>
              Discard
            </Button>
            <Button
              size="sm"
              onClick={saveEntries}
              disabled={missingAccount || entries.some((e) => !Number.isFinite(e.totalAmount) || e.totalAmount <= 0)}
            >
              Save all ({entries.length})
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
