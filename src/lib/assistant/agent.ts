import type { QueryClient } from '@tanstack/react-query'
import { getCachedFile } from '../cache'
import { callGeminiParts, GeminiError, type GeminiPart } from '../gemini'
import { AI_MEMORY_PATH, type AiMemoryFile } from '../aiMemory'
import { buildOverview, executeTool, functionDeclarations, type ToolContext } from './tools'

export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

const MAX_ROUNDS = 6
const MAX_TOOL_CALLS = 12

function buildSystemPrompt(qc: QueryClient): string {
  const memory = getCachedFile<AiMemoryFile>(AI_MEMORY_PATH)?.content.summary
  return `You are the assistant inside ₹ Tracker, the user's personal finance app. You can
control the whole app through your tools: record and edit transactions, manage categories
and budgets and accounts, look up their money questions, and navigate the UI.

Current state:
${buildOverview(qc)}
${memory ? `\nWhat you know about this user:\n${memory}\n` : ''}
Rules:
- Use tools to act; never claim you did something without the tool call succeeding.
- Amounts are INR; shorthand like "23k" = 23000, "1.5L" = 150000.
- Use existing category/account ids from the state above. If you genuinely can't tell
  which account or category the user means, ask — one short question.
- Writes apply immediately and the user can undo them, so act without asking for
  permission on ordinary adds and edits. Deletions prompt the user automatically.
- Answer money questions from the state above or via list_transactions; be concrete
  with numbers.
- Keep replies short and plain — one or two sentences. No markdown headers, no emoji.`
}

export interface AgentDeps extends Omit<ToolContext, 'qc'> {
  qc: QueryClient
}

export interface AgentResult {
  reply: string
  /** Updated conversation to carry into the next turn. */
  history: GeminiContent[]
}

/**
 * One user turn of the agent: call Gemini with tools, execute any function
 * calls against the app, feed results back, and loop until it answers in text.
 */
export async function runAgentTurn(
  userMessage: string,
  history: GeminiContent[],
  deps: AgentDeps,
): Promise<AgentResult> {
  const contents: GeminiContent[] = [...history, { role: 'user', parts: [{ text: userMessage }] }]
  const ctx: ToolContext = deps
  let toolCalls = 0

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const parts = await callGeminiParts({
      system_instruction: { parts: [{ text: buildSystemPrompt(deps.qc) }] },
      contents,
      tools: [{ function_declarations: functionDeclarations }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    })

    const calls = parts.filter((p) => p.functionCall)
    if (calls.length === 0) {
      const reply = parts
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('')
        .trim()
      if (!reply) throw new GeminiError('The assistant returned an empty reply.')
      contents.push({ role: 'model', parts })
      return { reply, history: contents }
    }

    contents.push({ role: 'model', parts })
    const responses: GeminiPart[] = []
    for (const call of calls) {
      toolCalls++
      if (toolCalls > MAX_TOOL_CALLS) {
        responses.push({
          functionResponse: {
            name: call.functionCall.name,
            response: { error: 'tool budget exhausted — summarize what was done' },
          },
        })
        continue
      }
      let result: object
      try {
        result = await executeTool(call.functionCall.name, call.functionCall.args ?? {}, ctx)
      } catch (e) {
        result = { error: e instanceof Error ? e.message : 'tool failed' }
      }
      responses.push({ functionResponse: { name: call.functionCall.name, response: result } })
    }
    contents.push({ role: 'user', parts: responses })
  }

  throw new GeminiError('The assistant took too many steps — try a simpler request.')
}
