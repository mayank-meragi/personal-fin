import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CreditCard, Dumbbell, Moon, RefreshCw, Sparkles, UtensilsCrossed } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AiError, NoAiKeyError, hasAiKey } from '@/lib/ai'
import { cachedBriefing, generateBriefing, storeBriefing, type Briefing, type BriefingArea } from '@/lib/briefing'

const AREA_META: Record<BriefingArea, { icon: typeof CreditCard; to: string }> = {
  money: { icon: CreditCard, to: '/finance' },
  food: { icon: UtensilsCrossed, to: '/health' },
  workout: { icon: Dumbbell, to: '/fitness' },
  sleep: { icon: Moon, to: '/health/sleep' },
}

/** On-demand daily briefing: one AI call per daypart, cached for the day. */
export default function BriefingCard() {
  const qc = useQueryClient()
  const [briefing, setBriefing] = useState<Briefing | null>(cachedBriefing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await generateBriefing(qc)
      storeBriefing(next)
      setBriefing(next)
    } catch (e) {
      setError(
        e instanceof NoAiKeyError
          ? 'The briefing needs an AI key — add one in Settings.'
          : e instanceof AiError
            ? e.message
            : 'Could not build the briefing — try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!briefing) {
    return (
      <button
        type="button"
        disabled={busy || !hasAiKey()}
        onClick={() => void generate()}
        className="flex w-full items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--ink-900)] p-3.5 text-left text-white shadow-[var(--shadow-md)] transition-transform active:scale-[0.99] disabled:opacity-70"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15">
          <Sparkles className={cn('size-4', busy && 'animate-pulse')} />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">{busy ? 'Reading your day…' : "Today's briefing"}</span>
          <span className="block text-xs text-white/70">
            {busy ? 'money, food, training, sleep' : 'what happened, what to do next'}
          </span>
        </span>
        {error && <span className="max-w-40 text-right text-[10px] text-white/80">{error}</span>}
      </button>
    )
  }

  return (
    <Card className="border-none bg-[var(--ink-900)] text-white">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm leading-snug font-semibold">{briefing.headline}</p>
          <button
            type="button"
            aria-label="Regenerate briefing"
            disabled={busy}
            onClick={() => void generate()}
            className="shrink-0 rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
          </button>
        </div>

        <div className="space-y-2">
          {briefing.items.map((item, i) => {
            const meta = AREA_META[item.area]
            return (
              <Link key={i} to={meta.to} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/12">
                  <meta.icon className="size-3" />
                </span>
                <p className="text-xs leading-relaxed text-white/85">{item.text}</p>
              </Link>
            )
          })}
        </div>

        {briefing.nudge && (
          <p className="rounded-[var(--radius-md)] bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-[var(--ink-900)]">
            {briefing.nudge}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
