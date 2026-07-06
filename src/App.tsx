import { useEffect, useState } from 'react'
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { House, Settings } from 'lucide-react'
import HubPage from '@/pages/HubPage'
import SettingsPage from '@/pages/SettingsPage'
import Assistant from '@/components/Assistant'
import Onboarding from '@/components/Onboarding'
import AccountSetup from '@/modules/finance/components/AccountSetup'
import SyncStatus from '@/components/SyncStatus'
import { isConfigured } from '@/lib/cache'
import { initSync, flush } from '@/lib/sync'
import { useSyncState } from '@/hooks/useSyncState'
import { useAccounts } from '@/hooks/useData'
import { moduleForPath, modules } from '@/modules/registry'
import type { ModuleNavItem } from '@/modules/types'
import { cn } from '@/lib/utils'

/** Old finance routes lived at the root — keep bookmarks and muscle memory working. */
const REDIRECTS: Record<string, string> = {
  '/transactions': '/finance/transactions',
  '/budgets': '/finance/budgets',
  '/categories': '/finance/categories',
  '/import': '/finance/import',
}

function navItemsFor(pathname: string): ModuleNavItem[] {
  const module = moduleForPath(pathname)
  const home: ModuleNavItem = { to: '/', label: 'Home', icon: House, end: true }
  if (module) return [home, ...module.navItems]
  return [
    home,
    ...modules.map((m) => ({ to: `/${m.id}`, label: m.name, icon: m.icon })),
    { to: '/settings', label: 'Settings', icon: Settings },
  ]
}

function Shell() {
  const location = useLocation()
  const { accounts, isReady: accountsReady } = useAccounts()
  const items = navItemsFor(location.pathname)
  const inFinance = location.pathname.startsWith('/finance')

  // Finance can't work without accounts — gate only that module
  if (inFinance && accountsReady && accounts.length === 0) {
    return (
      <div className="min-h-screen bg-muted/40 text-foreground">
        <AccountSetup />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <NavLink to="/" className="font-display text-base font-bold tracking-tight text-[var(--ink-900)]">
            Life OS<span className="text-[var(--brand)]">.</span>
          </NavLink>
          <nav className="hidden gap-1 md:flex">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-[var(--ink-900)] text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <SyncStatus />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-3 pb-28 md:py-6 md:pb-10">
        <Routes>
          <Route path="/" element={<HubPage />} />
          {modules.flatMap((m) =>
            m.routes.map((r) => <Route key={r.path} path={r.path} element={<r.element />} />),
          )}
          <Route path="/settings" element={<SettingsPage />} />
          {Object.entries(REDIRECTS).map(([from, to]) => (
            <Route key={from} path={from} element={<Navigate to={to} replace />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Assistant />
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-8 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:hidden">
        <div className="pointer-events-auto mx-auto flex max-w-xs items-center justify-between rounded-full bg-card p-1.5 shadow-[0_8px_30px_-8px_oklch(0.3_0.055_279/0.35)] ring-1 ring-foreground/[0.06]">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  'flex size-11 items-center justify-center rounded-full transition-colors',
                  isActive ? 'bg-[var(--ink-900)] text-white' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <item.icon className="size-5" aria-hidden />
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default function App() {
  const [configured, setConfigured] = useState(isConfigured)
  const sync = useSyncState()
  const queryClient = useQueryClient()

  useEffect(() => {
    initSync()
  }, [])

  if (!configured || sync.status === 'auth-error') {
    return (
      <div className="min-h-screen bg-muted/40 text-foreground">
        <Onboarding
          expired={sync.status === 'auth-error'}
          onDone={() => {
            setConfigured(true)
            void queryClient.invalidateQueries()
            void flush()
          }}
        />
      </div>
    )
  }

  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
