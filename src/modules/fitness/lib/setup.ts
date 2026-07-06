import { AiError, chat, type ChatMessage, type ToolDef, type ToolResult } from '@/lib/llm'
import type { FitnessProfile } from './types'

export type { ChatMessage }

const EQUIPMENT_VALUES = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'kettlebells',
  'bands',
  'e-z curl bar',
  'medicine ball',
  'exercise ball',
]

const SAVE_PROFILE_TOOL: ToolDef = {
  name: 'save_profile',
  description:
    'Save the completed training profile. Call this ONCE, only after you have asked enough questions to fill every required field confidently.',
  parameters: {
    type: 'object',
    properties: {
      goal: { type: 'string', enum: ['build-muscle', 'strength', 'fat-loss', 'general-fitness'] },
      experience: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
      daysPerWeek: { type: 'number' },
      equipment: {
        type: 'array',
        items: { type: 'string', enum: EQUIPMENT_VALUES },
        description: 'what they can access; a full commercial gym = all values',
      },
      injuries: { type: 'string', description: 'injuries / movements to avoid, empty if none' },
      preferences: { type: 'string', description: 'likes/dislikes relevant to programming, empty if none' },
      coachNotes: {
        type: 'string',
        description:
          'Everything else learned worth remembering, as "- " bullets: age, weight/height, sport background, schedule constraints, motivation, sleep/stress — only what they actually shared.',
      },
    },
    required: ['goal', 'experience', 'daysPerWeek', 'equipment', 'coachNotes'],
  },
}

const SYSTEM = `You are a friendly personal trainer doing a first consultation inside a fitness app.
Interview the user to build their training profile, then call save_profile.

How to interview:
- Ask ONE short question at a time (one or two sentences, no lists of questions, no markdown, no emoji).
- Cover: their goal; training experience; how many days a week they can realistically train
  (and any schedule constraints); what equipment or gym they have access to; injuries or
  movements to avoid; and — only if they seem comfortable — age and body weight.
- Adapt to what they say; don't re-ask what they already told you. Accept vague answers and
  translate them ("I go to a normal gym" = full equipment).
- After 4-7 exchanges you should have enough — call save_profile, then give a one-or-two
  sentence wrap-up telling them their profile is saved and they can generate their first workout.
- Amounts like weight are in kg. Speak plainly, like a good coach, not a form.`

export interface SetupSaved {
  profile: FitnessProfile
  coachNotes: string
}

export interface SetupTurnResult {
  reply: string
  history: ChatMessage[]
  saved?: SetupSaved
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildProfile(args: Record<string, any>): SetupSaved {
  const goal = ['build-muscle', 'strength', 'fat-loss', 'general-fitness'].includes(args.goal)
    ? (args.goal as FitnessProfile['goal'])
    : 'general-fitness'
  const experience = ['beginner', 'intermediate', 'advanced'].includes(args.experience)
    ? (args.experience as FitnessProfile['experience'])
    : 'beginner'
  const equipment = Array.isArray(args.equipment)
    ? args.equipment.filter((e: unknown): e is string => typeof e === 'string' && EQUIPMENT_VALUES.includes(e))
    : []
  return {
    profile: {
      goal,
      experience,
      daysPerWeek: Math.min(7, Math.max(1, Math.round(Number(args.daysPerWeek) || 3))),
      equipment,
      injuries: typeof args.injuries === 'string' && args.injuries.trim() ? args.injuries.trim() : undefined,
      preferences: typeof args.preferences === 'string' && args.preferences.trim() ? args.preferences.trim() : undefined,
    },
    coachNotes: typeof args.coachNotes === 'string' ? args.coachNotes.trim() : '',
  }
}

/**
 * One turn of the intake interview. The model either asks the next question
 * (text reply) or calls save_profile — the caller persists `saved` when set.
 */
export async function runSetupTurn(userMessage: string, history: ChatMessage[]): Promise<SetupTurnResult> {
  const messages: ChatMessage[] = [...history, { role: 'user', text: userMessage }]
  let saved: SetupSaved | undefined

  for (let round = 0; round < 3; round++) {
    const response = await chat({
      system: SYSTEM,
      messages,
      tools: [SAVE_PROFILE_TOOL],
      temperature: 0.4,
      maxOutputTokens: 1024,
    })
    messages.push(response.message)

    if (response.toolCalls.length === 0) {
      const reply = response.text.trim()
      if (!reply) throw new AiError('The trainer went quiet — try again.')
      return { reply, history: messages, saved }
    }

    const results: ToolResult[] = response.toolCalls.map((call) => {
      if (call.name === 'save_profile') {
        saved = buildProfile(call.args)
        return { id: call.id, name: call.name, result: { ok: true, note: 'profile saved — wrap up now' } }
      }
      return { id: call.id, name: call.name, result: { error: 'unknown tool' } }
    })
    messages.push({ role: 'tool', results })
  }

  // Model kept calling tools — wrap up on its behalf
  if (saved) return { reply: 'All set — your profile is saved. Generate your first workout whenever you like.', history: messages, saved }
  throw new AiError('The setup took too many steps — try again.')
}
