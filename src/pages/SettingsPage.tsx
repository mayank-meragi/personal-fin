import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { clearFileCache, getConfig, setConfig } from '../lib/cache'
import { flush } from '../lib/sync'
import { useSyncState } from '../hooks/useSyncState'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const sync = useSyncState()
  const [geminiKey, setGeminiKey] = useState(getConfig('geminiKey') ?? '')
  const [saved, setSaved] = useState<string | null>(null)

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
