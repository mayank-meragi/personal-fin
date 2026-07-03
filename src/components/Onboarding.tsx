import { useState } from 'react'
import { getConfig, setConfig } from '../lib/cache'
import { validateToken } from '../lib/github'
import { ensureSeedFiles } from '../lib/sync'

interface Props {
  expired?: boolean
  onDone: () => void
}

export default function Onboarding({ expired, onDone }: Props) {
  const [repo, setRepo] = useState(getConfig('dataRepo') ?? '')
  const [branch, setBranch] = useState(getConfig('dataBranch') ?? 'main')
  const [token, setToken] = useState('')
  const [geminiKey, setGeminiKey] = useState(getConfig('geminiKey') ?? '')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function connect() {
    setError(null)
    if (!repo.includes('/')) {
      setError('Repo must be in the form owner/name, e.g. mayank-meragi/personal-fin')
      return
    }
    setChecking(true)
    try {
      const check = await validateToken(repo.trim(), token.trim(), branch.trim())
      if (!check.ok) {
        setError(check.error ?? 'Connection failed')
        return
      }
      setConfig('dataRepo', repo.trim())
      setConfig('dataBranch', branch.trim())
      setConfig('githubToken', token.trim())
      setConfig('geminiKey', geminiKey.trim() || null)
      await ensureSeedFiles()
      onDone()
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">₹ Tracker setup</h1>
      {expired && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Your GitHub token was rejected — it has likely expired. Create a new one and paste it below.
        </p>
      )}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Create a fine-grained GitHub token</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Open{' '}
            <a
              className="break-all text-sky-600 underline"
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer"
            >
              github.com/settings/personal-access-tokens/new
            </a>
          </li>
          <li>Repository access → <b>Only select repositories</b> → pick your data repo</li>
          <li>Permissions → Repository permissions → <b>Contents: Read and write</b></li>
          <li>Set expiration (max 1 year), generate, and copy the token</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">
          The token is stored only in this browser's localStorage and sent only to api.github.com.
        </p>
      </div>
      <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm">
          <span className="font-medium">Data repo (owner/name)</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="you/finance-data"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Data branch</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">GitHub token</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            type="password"
            placeholder="github_pat_…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Gemini API key (optional — enables AI quick entry)</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            type="password"
            placeholder="AIza…"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Get one free at{' '}
            <a className="text-sky-600 underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              aistudio.google.com/apikey
            </a>
            . Without it, quick entry falls back to simple pattern matching.
          </span>
        </label>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          type="button"
          disabled={checking || !repo || !token}
          onClick={() => void connect()}
          className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Connect'}
        </button>
      </div>
    </div>
  )
}
