import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PiggyBank, Sparkles } from 'lucide-react'
import { clearFileCache, getConfig, setConfig } from '../lib/cache'
import { flush, resetAllData } from '../lib/sync'
import { useSyncState } from '../hooks/useSyncState'
import { makeAccountId, useAccounts, useCategories, useFileQuery } from '../hooks/useData'
import { accountTypeEmoji, accountTypeLabel } from '../lib/accounts'
import { AI_MEMORY_PATH, emptyAiMemory, type AiMemoryFile } from '../lib/aiMemory'
import { groupedCategories } from '../lib/categories'
import { categoryColor, categoryIcon } from '../lib/categoryIcon'
import { generateCategory, GeminiError, hasGeminiKey, NoGeminiKeyError } from '../lib/gemini'
import type { AccountType, Category } from '../lib/types'

/** Toggle chip for a category's spending/savings nature */
function cnSavings(savings?: boolean): string {
  return savings
    ? 'inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--positive-100)] px-2 py-1 text-[10px] font-bold text-[var(--positive-600)]'
    : 'inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-medium text-muted-foreground ring-1 ring-[var(--border-subtle)]'
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const sync = useSyncState()
  const { accounts, addAccounts, updateAccount } = useAccounts()
  const [geminiKey, setGeminiKey] = useState(getConfig('geminiKey') ?? '')
  const [saved, setSaved] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<AccountType>('bank')
  const [newBalance, setNewBalance] = useState('')
  const [resetting, setResetting] = useState(false)
  const { data: aiMemory } = useFileQuery<AiMemoryFile>(AI_MEMORY_PATH, emptyAiMemory)
  const { categories, addCategory, updateCategory } = useCategories()
  const [catDesc, setCatDesc] = useState('')
  const [catBusy, setCatBusy] = useState(false)
  const [catError, setCatError] = useState<string | null>(null)
  const [catPreview, setCatPreview] = useState<Category | null>(null)

  async function suggestCategory() {
    const desc = catDesc.trim()
    if (!desc || catBusy) return
    setCatBusy(true)
    setCatError(null)
    setCatPreview(null)
    try {
      setCatPreview(await generateCategory(desc, categories))
    } catch (e) {
      if (e instanceof NoGeminiKeyError) setCatError('Add a Gemini key below to create categories with AI.')
      else setCatError(e instanceof GeminiError ? e.message : 'Could not create a category from that.')
    } finally {
      setCatBusy(false)
    }
  }

  const repo = getConfig('dataRepo')
  const branch = getConfig('dataBranch') ?? 'main'

  function note(msg: string) {
    setSaved(msg)
    setTimeout(() => setSaved(null), 2500)
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Data store</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Data lives on the <code className="rounded bg-muted px-1 py-0.5 text-xs">{branch}</code> branch of{' '}
            <a
              className="text-primary underline underline-offset-4"
              href={`https://github.com/${repo}/tree/${branch}`}
              target="_blank"
              rel="noreferrer"
            >
              {repo}
            </a>
            . Sync status: {sync.status}
            {sync.pendingCount > 0 ? ` (${sync.pendingCount} pending)` : ''}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void flush()}>
              Sync now
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (sync.pendingCount > 0 && !confirm('There are unpushed changes that will be lost. Continue?')) return
                clearFileCache()
                void queryClient.invalidateQueries()
                note('Local cache cleared — refetching from GitHub.')
              }}
            >
              Force full re-sync
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => {
                if (!confirm('Sign out? The GitHub token will be removed from this browser.')) return
                setConfig('githubToken', null)
                location.reload()
              }}
            >
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="divide-y">
            {accounts.map((acc) => {
              const isCard = acc.type === 'credit-card'
              return (
                <div key={acc.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="text-lg">{accountTypeEmoji[acc.type]}</span>
                  <Input
                    className="h-8 min-w-0 flex-1"
                    value={acc.name}
                    onChange={(e) => updateAccount(acc.id, { name: e.target.value })}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {isCard ? 'owes ₹' : 'start ₹'}
                    <Input
                      className="h-8 w-28 text-right tabular-nums"
                      type="number"
                      step="0.01"
                      min={isCard ? '0' : undefined}
                      value={isCard ? Math.abs(acc.startingBalance) : acc.startingBalance}
                      onChange={(e) => {
                        const v = Number(e.target.value) || 0
                        updateAccount(acc.id, { startingBalance: isCard ? -Math.abs(v) : v })
                      }}
                    />
                  </label>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Input
              className="h-8 min-w-0 flex-1"
              placeholder="New account name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs"
              value={newType}
              onChange={(e) => setNewType(e.target.value as AccountType)}
            >
              {(Object.keys(accountTypeLabel) as AccountType[]).map((t) => (
                <option key={t} value={t}>
                  {accountTypeEmoji[t]} {accountTypeLabel[t]}
                </option>
              ))}
            </select>
            <Input
              className="h-8 w-28 text-right tabular-nums"
              type="number"
              step="0.01"
              min={newType === 'credit-card' ? '0' : undefined}
              placeholder={newType === 'credit-card' ? 'owe ₹' : 'balance ₹'}
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!newName.trim()}
              onClick={() => {
                let id = makeAccountId(newName)
                if (accounts.some((a) => a.id === id)) id = `${id}-${accounts.length + 1}`
                const magnitude = Number(newBalance) || 0
                addAccounts([
                  {
                    id,
                    name: newName.trim(),
                    type: newType,
                    startingBalance: newType === 'credit-card' ? -Math.abs(magnitude) : magnitude,
                    createdAt: new Date().toISOString(),
                  },
                ])
                setNewName('')
                setNewBalance('')
                note('Account added.')
              }}
            >
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {groupedCategories(categories, 'expense').map(({ parent, children }) => {
            const color = categoryColor(parent.id)
            const Icon = categoryIcon(parent)
            return (
              <div key={parent.id} className="rounded-2xl bg-[var(--surface-sunken)] p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
                    style={{ background: `color-mix(in oklch, ${color} 16%, white)`, color }}
                  >
                    <Icon className="size-[18px]" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--text-strong)]">{parent.name}</p>
                    {parent.hints.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground">
                        {parent.hints.slice(0, 4).join(', ')} etc.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateCategory(parent.id, { savings: !parent.savings || undefined })}
                    className={cnSavings(parent.savings)}
                    title="Savings outflow is reported as saved, not spent"
                  >
                    <PiggyBank className="size-3" />
                    {parent.savings ? 'Savings' : 'Spending'}
                  </button>
                </div>
                {children.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-5">
                    {children.map((c) => {
                      const cColor = categoryColor(c.id)
                      const CIcon = categoryIcon(c)
                      return (
                        <div key={c.id} className="flex flex-col items-center gap-1.5 text-center" title={c.hints.join(', ')}>
                          <span
                            className="flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-white"
                            style={{ color: cColor }}
                          >
                            <CIcon className="size-[18px]" strokeWidth={2} />
                          </span>
                          <span className="line-clamp-2 inline-flex items-center gap-0.5 text-[10px] font-medium leading-tight text-muted-foreground">
                            {c.name}
                            {c.savings && <PiggyBank className="size-3 shrink-0 text-[var(--positive-600)]" />}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {categories
              .filter((c) => c.type === 'income')
              .map((c) => {
                const color = categoryColor(c.id)
                const Icon = categoryIcon(c)
                return (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] py-1 pr-2.5 pl-1 text-xs font-medium"
                    title={c.hints.join(', ')}
                  >
                    <span
                      className="flex size-5 items-center justify-center rounded-full"
                      style={{ background: `color-mix(in oklch, ${color} 16%, white)`, color }}
                    >
                      <Icon className="size-3" strokeWidth={2} />
                    </span>
                    {c.name}
                  </span>
                )
              })}
          </div>
          <div className="flex gap-2 border-t pt-3">
            <Input
              className="h-9 min-w-0 flex-1"
              placeholder='Describe one — "vices: cigarettes, alcohol"…'
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void suggestCategory()
              }}
            />
            <Button size="sm" className="h-9" disabled={catBusy || !catDesc.trim() || !hasGeminiKey()} onClick={() => void suggestCategory()}>
              <Sparkles data-icon="inline-start" />
              {catBusy ? 'Thinking…' : 'Create with AI'}
            </Button>
          </div>
          {catError && <p className="text-xs text-[var(--negative-600)]">{catError}</p>}
          {catPreview && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--surface-sunken)] p-3">
              <span className="text-lg">{catPreview.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text-strong)]">
                  {catPreview.parent
                    ? `${categories.find((c) => c.id === catPreview.parent)?.name} › ${catPreview.name}`
                    : catPreview.name}{' '}
                  <span className="font-normal text-muted-foreground">({catPreview.type})</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">matches: {catPreview.hints.join(', ')}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCatPreview(null)}>
                Discard
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  addCategory(catPreview)
                  setCatPreview(null)
                  setCatDesc('')
                  note(`Category "${catPreview.name}" added.`)
                }}
              >
                Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">AI memory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            What the AI has learned about your spending, regenerated after quick-entry saves and
            fed into every parse to improve classification.
          </p>
          {aiMemory?.summary ? (
            <>
              <p className="whitespace-pre-line rounded-lg bg-muted/60 px-3 py-2 text-sm">{aiMemory.summary}</p>
              <p className="text-xs text-muted-foreground/70">
                Updated{' '}
                {new Date(aiMemory.updatedAt).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · based on {aiMemory.txCount} transactions
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground/70">
              Nothing yet — it builds up as you save transactions through quick entry.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Gemini API key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Powers AI quick entry and CSV categorization. Get one free at{' '}
            <a
              className="text-primary underline underline-offset-4"
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
            >
              aistudio.google.com/apikey
            </a>
            .
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="AIza…"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
            <Button
              onClick={() => {
                setConfig('geminiKey', geminiKey.trim() || null)
                note(geminiKey.trim() ? 'Gemini key saved.' : 'Gemini key removed.')
              }}
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-sm text-red-600">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reset deletes every transaction, all accounts, budgets, and the AI memory from the
            data repo, and restores default categories. Your GitHub and Gemini keys stay. Old
            data remains in the repo's git history until you delete the repo itself.
          </p>
          <Button
            variant="destructive"
            disabled={resetting}
            onClick={async () => {
              if (!confirm('Delete ALL data — every transaction, account, budget, and AI memory?')) return
              if (prompt('This cannot be undone from the app. Type DELETE to confirm:') !== 'DELETE') return
              setResetting(true)
              try {
                await resetAllData()
                queryClient.clear()
                location.reload()
              } catch (e) {
                note(`Reset failed: ${e instanceof Error ? e.message : e}`)
                setResetting(false)
              }
            }}
          >
            {resetting ? 'Resetting…' : 'Reset everything'}
          </Button>
        </CardContent>
      </Card>

      {saved && <p className="text-sm text-emerald-700">{saved}</p>}
    </div>
  )
}
