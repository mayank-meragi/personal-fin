import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/**
 * Perfin AmountText, ported — the canonical way to render money in this app.
 * Tabular JetBrains Mono figures, auto sign + color (green in / red out),
 * Indian digit grouping. "Numbers are the interface": use this everywhere
 * a money value appears, rather than a plain string.
 */

const SIZE: Record<NonNullable<AmountProps['size']>, string> = {
  sm: 'var(--text-sm)',
  md: 'var(--text-md)',
  lg: 'var(--text-xl)',
  xl: 'var(--text-3xl)',
  display: 'var(--text-5xl)',
}

const WEIGHT: Record<NonNullable<AmountProps['weight']>, string> = {
  medium: 'var(--fw-medium)',
  semibold: 'var(--fw-semibold)',
  bold: 'var(--fw-bold)',
}

export interface AmountProps {
  value: number
  /** Force color/sign; 'neutral' derives from the value's sign when signed. @default 'neutral' */
  direction?: 'in' | 'out' | 'neutral'
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'display'
  /** Show +/− sign and color. @default true */
  signed?: boolean
  /** @default 'bold' */
  weight?: 'medium' | 'semibold' | 'bold'
  className?: string
  style?: CSSProperties
}

export function Amount({ value, direction = 'neutral', size = 'md', signed = true, weight = 'bold', className, style }: AmountProps) {
  const dir = direction === 'neutral' && signed ? (value < 0 ? 'out' : value > 0 ? 'in' : 'neutral') : direction
  const color = dir === 'in' ? 'var(--money-in)' : dir === 'out' ? 'var(--money-out)' : 'var(--text-strong)'
  const sign = !signed ? '' : dir === 'in' ? '+' : dir === 'out' ? '−' : ''
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(abs) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(abs) ? 0 : 2,
  })

  return (
    <span
      className={cn('whitespace-nowrap tabular-nums', className)}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: SIZE[size],
        fontWeight: WEIGHT[weight],
        color,
        letterSpacing: 'var(--tracking-snug)',
        fontFeatureSettings: 'var(--figure-features)',
        ...style,
      }}
    >
      {sign}₹{formatted}
    </span>
  )
}
