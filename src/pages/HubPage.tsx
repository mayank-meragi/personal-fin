import { Link } from 'react-router-dom'
import { ChevronRight, Settings } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { modules } from '@/modules/registry'

function greeting(): string {
  const hourIST = Number(
    new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()),
  )
  if (hourIST < 5) return 'Up late'
  if (hourIST < 12) return 'Good morning'
  if (hourIST < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function HubPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 md:max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--ink-900)]">{greeting()}.</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
        {modules.map((m) => (
          <Link key={m.id} to={`/${m.id}`} className="block">
            <Card className="gap-3 p-4 transition-transform active:scale-[0.99]">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--ink-900)] text-white">
                  <m.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--text-strong)]">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.tagline}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </div>
              <CardContent className="p-0">
                <m.card />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Link to="/settings" className="block">
        <Card className="flex-row items-center gap-3 p-3.5 transition-transform active:scale-[0.99]">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-muted)]">
            <Settings className="size-4" />
          </span>
          <p className="flex-1 text-sm font-semibold text-[var(--text-strong)]">Settings</p>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Card>
      </Link>
    </div>
  )
}
