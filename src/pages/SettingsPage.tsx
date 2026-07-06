import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ChevronRight, Tags } from 'lucide-react'
import { clearFileCache, getConfig, setConfig } from '@/lib/cache'
import { flush, resetAllData } from '@/lib/sync'
import { useSyncState } from '@/hooks/useSyncState'
import { makeAccountId, useAccounts, useCategories, useFileQuery } from '@/hooks/useData'
import { accountTypeEmoji, accountTypeLabel } from '@/lib/accounts'
import { AI_MEMORY_PATH, emptyAiMemory, type AiMemoryFile } from '@/lib/aiMemory'
import {
  activeProvider,
  DEFAULT_MODEL,
  keyConfigFor,
  modelConfigFor,
  PROVIDER_LABEL,
  PROVIDERS,
  type Provider,
} from '@/lib/llm'
import type { AccountType } from '@/lib/types'

const KEY_PLACEHOLDER: Record<Provider, string> = {
  gemini: 'AIza…',
  openai: 'sk-…',
  anthropic: 'sk-ant-…',
}

const KEY_URL: Record<Provider, { label: string; href: string }> = {
  gemini: { label: 'aistudio.google.com/apikey', href: 'https://aistudio.google.com/apikey' },
  openai: { label: 'platform.openai.com/api-keys', href: 'https://platform.openai.com/api-keys' },
  anthropic: { label: 'console.anthropic.com', href: 'https://console.anthropic.com/settings/keys' },
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const sync = useSyncState()
  const { accounts, addAccounts, updateAccount } = useAccounts()
  const [provider, setProvider] = useState<Provider>(activeProvider)
  const [aiKey, setAiKey] = useState(() => getConfig(keyConfigFor(activeProvider())) ?? '')
  const [aiModel, setAiModel] = useState(() => getConfig(modelConfigFor(activeProvider())) ?? '')
  const [saved, setSaved] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<AccountType>('bank')
  const [newBalance, setNewBalance] = useState('')
  const [resetting, setResetting] = useState(false)
  const { data: aiMemory } = useFileQuery<AiMemoryFile>(AI_MEMORY_PATH, emptyAiMemory)
  const { categories } = useCategories()

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

      <Link to="/categories" className="block">
        <Card className="flex-row items-center gap-3 p-4 transition-transform active:scale-[0.99]">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-sunken)] text-[var(--text-muted)]">
            <Tags className="size-[18px]" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-strong)]">Categories</p>
            <p className="truncate text-xs text-muted-foreground">
              {categories.length} categories · manage, mark savings, create with AI
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Card>
      </Link>

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
          <CardTitle className="text-sm">AI provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Powers quick entry, the assistant, category creation, and CSV categorization. The key
            stays in this browser and is sent only to the provider's API. Get a key at{' '}
            <a
              className="text-primary underline underline-offset-4"
              href={KEY_URL[provider].href}
              target="_blank"
              rel="noreferrer"
            >
              {KEY_URL[provider].label}
            </a>
            .
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setProvider(p)
                  setAiKey(getConfig(keyConfigFor(p)) ?? '')
                  setAiModel(getConfig(modelConfigFor(p)) ?? '')
                }}
                className={
                  p === provider
                    ? 'rounded-full bg-[var(--ink-900)] px-3.5 py-1.5 text-xs font-semibold text-white'
                    : 'rounded-full bg-[var(--surface-sunken)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-body)] hover:bg-[var(--ink-100)]'
                }
              >
                {PROVIDER_LABEL[p]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder={KEY_PLACEHOLDER[provider]}
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
            />
            <Input
              className="w-44 shrink-0"
              placeholder={DEFAULT_MODEL[provider]}
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
            />
          </div>
          <Button
            onClick={() => {
              setConfig('aiProvider', provider === 'gemini' ? null : provider)
              setConfig(keyConfigFor(provider), aiKey.trim() || null)
              setConfig(modelConfigFor(provider), aiModel.trim() || null)
              note(
                aiKey.trim()
                  ? `${PROVIDER_LABEL[provider]} is now the AI provider.`
                  : `${PROVIDER_LABEL[provider]} key removed.`,
              )
            }}
          >
            Save
          </Button>
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-sm text-red-600">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reset deletes every transaction, all accounts, budgets, and the AI memory from the
            data repo, and restores default categories. Your GitHub and AI keys stay. Old
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
