const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inrExact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** ₹1,50,000 — whole rupees for charts and summaries */
export function formatINR(amount: number): string {
  return inrWhole.format(amount)
}

/** ₹1,50,000.50 — exact amounts for transaction rows with paise */
export function formatINRExact(amount: number): string {
  return Number.isInteger(amount) ? inrWhole.format(amount) : inrExact.format(amount)
}
