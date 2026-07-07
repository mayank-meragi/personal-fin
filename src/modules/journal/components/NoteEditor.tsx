import { useEffect, useRef, useState } from 'react'
import { effectiveTodayISO } from '@/lib/dates'
import { useEntry } from '../lib/data'

export default function NoteEditor({ rows = 8 }: { rows?: number }) {
  const today = effectiveTodayISO()
  const { entry, saveText } = useEntry(today)
  // Local state is master once the user types; entry only seeds the initial view
  const [text, setText] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const value = text ?? entry?.text ?? ''
  return (
    <textarea
      className="w-full resize-none rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/40"
      rows={rows}
      placeholder="Write about today — what happened, how it felt, what is on your mind…"
      value={value}
      onChange={(e) => {
        setText(e.target.value)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => saveText(e.target.value), 800)
      }}
      onBlur={() => {
        if (text !== null) saveText(text)
      }}
    />
  )
}
