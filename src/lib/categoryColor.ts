// Deterministic pastel avatar color per category id — same category always
// gets the same tint, so items are visually groupable without per-item icons.
const palette = [
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-rose-100 text-rose-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-lime-100 text-lime-700',
]

export function categoryAvatarClass(categoryId: string): string {
  let hash = 0
  for (let i = 0; i < categoryId.length; i++) hash = (hash * 31 + categoryId.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}
