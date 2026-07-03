/**
 * Chart colors from the validated dataviz reference palette (light mode).
 * Categorical slots are assigned in fixed order and never cycled.
 */
export const palette = {
  series1: '#2a78d6', // blue — first categorical slot; also the sequential hue
  series2: '#1baf7a', // aqua — second categorical slot
  seqTrack: '#cde2fb', // blue-100 — meter track (lighter step of the same ramp)
  seqDeep: '#1c5cab', // blue-550
  critical: '#d03b3b', // status: overspent — reserved, never a series color
  warning: '#fab219', // status: near limit
  good: '#0ca30c',
  ink: '#0b0b0b',
  inkSecondary: '#52514e',
  muted: '#898781',
  gridline: '#e1e0d9',
  baseline: '#c3c2b7',
  surface: '#ffffff',
} as const
