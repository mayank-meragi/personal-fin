/**
 * Chart colors, adopted from the Perfin Design System tokens.
 * Money semantics are load-bearing: income = money-in (green), expense =
 * money-out (red) — the same two colors used everywhere money appears.
 */
export const palette = {
  series1: 'var(--money-out)', // expense
  series2: 'var(--money-in)', // income
  seqTrack: 'var(--emerald-100)',
  seqDeep: 'var(--emerald-700)',
  critical: 'var(--negative-500)',
  warning: 'var(--warning-500)',
  good: 'var(--positive-500)',
  ink: 'var(--ink-900)',
  inkSecondary: 'var(--text-muted)',
  muted: 'var(--text-subtle)',
  gridline: 'var(--border-subtle)',
  baseline: 'var(--border-default)',
  surface: '#ffffff',
} as const
