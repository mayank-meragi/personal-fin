import { AiError, generateJson, type ImageAttachment } from '@/lib/llm'
import { todayISO } from '@/lib/dates'
import type { FitnessProfile } from '@/modules/fitness/lib/types'
import type { Meal, MealItem, MealType, NutritionTargets } from './types'

/** When the user didn't name the meal, the clock does: 1:30 PM is lunch. */
export function inferMealType(when: Date = new Date()): MealType {
  const hour = when.getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 18) return 'snack'
  return 'dinner'
}

const MEAL_SCHEMA = {
  type: 'object',
  properties: {
    mealType: {
      type: 'string',
      enum: ['breakfast', 'lunch', 'snack', 'dinner'],
      description: 'ONLY when the user names it ("lunch...", "for breakfast"); omit otherwise',
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'short dish name with quantity, e.g. "2 rotis", "dal (1 katori)"' },
          calories: { type: 'number', description: 'kcal for the stated quantity' },
          proteinG: { type: 'number' },
          carbsG: { type: 'number' },
          fatG: { type: 'number' },
        },
        required: ['name', 'calories', 'proteinG'],
      },
    },
  },
  required: ['items'],
}

/**
 * "2 rotis and dal, 100g paneer" (or a food photo) → meal items with
 * estimated calories and macros. Indian-food aware via the model.
 */
export async function parseMeal(input: string, image?: ImageAttachment): Promise<Meal> {
  const text = await generateJson({
    system: `You estimate nutrition for informal Indian-English food logs (text or a food photo).
Rules:
- One item per distinct food, keeping the user's stated quantity ("2 rotis" = one item covering both).
- Use realistic Indian home-cooking portions when unstated: 1 roti ~100 kcal, 1 katori dal ~150 kcal,
  1 plate rice ~250 kcal, 100g paneer ~290 kcal. A photo shows the actual portion — estimate from it.
- calories and proteinG are for the TOTAL stated quantity, not per unit. Round sensibly.
- Be realistic, not optimistic; restaurant/fried versions have more oil.
- Set mealType only when the user names it ("lunch…", "for breakfast", "evening snack").`,
    text: input || 'Estimate the nutrition in the attached food photo.',
    image,
    schema: MEAL_SCHEMA,
    temperature: 0,
    maxOutputTokens: 2048,
  })

  let raw: { mealType?: MealType; items?: Partial<MealItem>[] }
  try {
    raw = JSON.parse(text)
  } catch {
    throw new AiError('Could not read that meal')
  }
  const items: MealItem[] = (raw.items ?? [])
    .filter((i) => typeof i.name === 'string' && Number.isFinite(i.calories) && (i.calories ?? 0) >= 0)
    .map((i) => ({
      name: i.name!.trim(),
      calories: Math.round(i.calories!),
      proteinG: Math.round(Number(i.proteinG) || 0),
      carbsG: Number.isFinite(i.carbsG) ? Math.round(i.carbsG!) : undefined,
      fatG: Number.isFinite(i.fatG) ? Math.round(i.fatG!) : undefined,
    }))
  if (items.length === 0) throw new AiError('Could not find any food in that')

  const sum = (pick: (i: MealItem) => number | undefined) => items.reduce((s, i) => s + (pick(i) ?? 0), 0)
  return {
    id: crypto.randomUUID(),
    date: todayISO(),
    createdAt: new Date().toISOString(),
    mealType: ['breakfast', 'lunch', 'snack', 'dinner'].includes(raw.mealType ?? '') ? raw.mealType : inferMealType(),
    description: input || 'photo meal',
    items,
    calories: sum((i) => i.calories),
    proteinG: sum((i) => i.proteinG),
    carbsG: sum((i) => i.carbsG) || undefined,
    fatG: sum((i) => i.fatG) || undefined,
    source: 'ai',
  }
}

/** Suggest daily calorie/protein targets from the training profile + body data. */
export async function suggestTargets(opts: {
  profile: FitnessProfile | null
  latestWeightKg?: number
  coachNotes?: string
}): Promise<NutritionTargets> {
  const text = await generateJson({
    text: `Suggest daily nutrition targets for this person. Be evidence-based and realistic
(protein 1.6-2.2 g/kg for muscle gain, sensible deficit ~20% for fat loss, maintenance otherwise).

Training goal: ${opts.profile ? `${opts.profile.goal}, ${opts.profile.experience}, trains ${opts.profile.daysPerWeek}×/week` : 'unknown — assume general fitness'}
Body weight: ${opts.latestWeightKg ? `${opts.latestWeightKg} kg` : 'unknown — assume 70 kg adult male in India'}
${opts.coachNotes ? `Coach notes: ${opts.coachNotes}` : ''}

Return calories (kcal/day), proteinG (g/day), and a one-sentence rationale.`,
    schema: {
      type: 'object',
      properties: {
        calories: { type: 'number' },
        proteinG: { type: 'number' },
        rationale: { type: 'string' },
      },
      required: ['calories', 'proteinG', 'rationale'],
    },
    temperature: 0,
    maxOutputTokens: 512,
  })
  let raw: { calories?: number; proteinG?: number; rationale?: string }
  try {
    raw = JSON.parse(text)
  } catch {
    throw new AiError('Could not suggest targets')
  }
  const calories = Math.round(Number(raw.calories))
  const proteinG = Math.round(Number(raw.proteinG))
  if (!Number.isFinite(calories) || calories < 800 || calories > 6000 || !Number.isFinite(proteinG) || proteinG < 30)
    throw new AiError('Got unrealistic targets — try again')
  return { calories, proteinG, rationale: raw.rationale?.trim() }
}
