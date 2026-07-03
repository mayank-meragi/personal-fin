import { useSyncState } from '../hooks/useSyncState'
import { flush } from '../lib/sync'

const styles: Record<string, { label: string; className: string }> = {
  idle: { label: 'Synced', className: 'bg-emerald-100 text-emerald-700' },
  pending: { label: 'Unsaved', className: 'bg-amber-100 text-amber-700' },
  syncing: { label: 'Syncing…', className: 'bg-sky-100 text-sky-700' },
  offline: { label: 'Offline', className: 'bg-slate-200 text-slate-600' },
  'auth-error': { label: 'Token expired', className: 'bg-red-100 text-red-700' },
  error: { label: 'Sync error', className: 'bg-red-100 text-red-700' },
}

export default function SyncStatus() {
  const state = useSyncState()
  const style = styles[state.status] ?? styles.idle
  const suffix = state.pendingCount > 0 && state.status !== 'syncing' ? ` (${state.pendingCount})` : ''
  return (
    <button
      type="button"
      onClick={() => void flush()}
      title={state.error ?? 'Click to sync now'}
      className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${style.className}`}
    >
      {style.label}
      {suffix}
    </button>
  )
}
