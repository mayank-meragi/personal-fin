import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Dumbbell } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AiError, NoAiKeyError } from '@/lib/ai'
import { FITNESS_PATHS } from '@/lib/paths'
import { updateFile } from '@/lib/sync'
import { fileQueryKey } from '@/lib/queryKeys'
import { saveProfile } from '../lib/data'
import { runSetupTurn, type ChatMessage } from '../lib/setup'
import type { FitnessMemoryFile } from '../lib/types'

interface Bubble {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface Props {
  onDone: () => void
}

/** One-time AI intake: the trainer interviews the user, then saves profile + coach notes. */
export default function SetupChat({ onDone }: Props) {
  const qc = useQueryClient()
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [bubbles, busy])

  async function turn(message: string, show: boolean) {
    setBusy(true)
    if (show) setBubbles((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: message }])
    try {
      const result = await runSetupTurn(message, history)
      setHistory(result.history)
      setBubbles((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: result.reply }])
      if (result.saved) {
        saveProfile(qc, result.saved.profile)
        if (result.saved.coachNotes) {
          const next = updateFile<FitnessMemoryFile>(
            FITNESS_PATHS.memory,
            { summary: '', updatedAt: '', sessionCount: 0 },
            (current) => ({
              summary: [result.saved!.coachNotes, current.summary].filter(Boolean).join('\n'),
              updatedAt: new Date().toISOString(),
              sessionCount: current.sessionCount,
            }),
          )
          qc.setQueryData(fileQueryKey(FITNESS_PATHS.memory), next)
        }
        setFinished(true)
        setTimeout(onDone, 1600)
      }
    } catch (e) {
      const text =
        e instanceof NoAiKeyError
          ? 'Setup needs an AI key — add one in Settings, or fill the form manually below.'
          : e instanceof AiError
            ? e.message
            : 'Something went wrong — try again.'
      setBubbles((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text }])
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void turn('Hi — set up my training profile.', false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function send() {
    const text = input.trim()
    if (!text || busy || finished) return
    setInput('')
    void turn(text, true)
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-[var(--ink-900)] text-white">
            <Dumbbell className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--text-strong)]">Your trainer</p>
            <p className="text-[10px] text-muted-foreground">a few quick questions, once</p>
          </div>
        </div>

        <div ref={scrollRef} className="max-h-[45svh] space-y-2 overflow-y-auto">
          {bubbles.map((b) => (
            <div
              key={b.id}
              className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap',
                b.role === 'user'
                  ? 'ml-auto rounded-br-md bg-[var(--ink-900)] text-white'
                  : 'mr-auto rounded-bl-md bg-[var(--surface-sunken)] text-[var(--text-body)]',
              )}
            >
              {b.text}
            </div>
          ))}
          {busy && (
            <div className="mr-auto flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-[var(--surface-sunken)] px-3.5 py-2.5">
              <span className="size-1.5 animate-bounce rounded-full bg-[var(--ink-400)] [animation-delay:0ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-[var(--ink-400)] [animation-delay:120ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-[var(--ink-400)] [animation-delay:240ms]" />
            </div>
          )}
        </div>

        {!finished && (
          <div className="flex items-center gap-2 rounded-full bg-[var(--surface-sunken)] py-1.5 pr-1.5 pl-4">
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--text-subtle)]"
              placeholder="Type your answer…"
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send()
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink-900)] text-white transition-transform active:scale-90 disabled:opacity-40"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
