# Multi-Provider AI — Architecture Plan

## Goal

Let the user pick which AI powers the app: Gemini (current), OpenAI, Anthropic — and
anything OpenAI-compatible (OpenRouter, Groq, local Ollama) via a custom base URL.
Everything AI-driven keeps working identically: quick-entry parsing (text + screenshots),
the agentic assistant, category generation, AI memory, CSV categorization.

## The constraint that shapes everything

This app has **no backend** — the browser calls the AI API directly. So a provider is
only viable if its API allows CORS from a web page:

| Provider | Browser-callable? | How |
|---|---|---|
| Gemini | ✅ | `x-goog-api-key` header (what we do today) |
| OpenAI | ✅ | `Authorization: Bearer` — CORS open |
| Anthropic | ✅ | needs `anthropic-dangerous-direct-browser-access: true` header |
| OpenAI-compatible (OpenRouter, Groq, Ollama) | ✅ mostly | same wire format as OpenAI, different base URL |

Keys stay in localStorage only, same as the Gemini key today.

## Current coupling (what has to change)

`src/lib/gemini.ts` mixes two things that must be split:

1. **Domain logic** — prompts, response schemas, the balance-declaration repair/salvage
   passes, category validation. Provider-agnostic; stays as-is.
2. **Transport** — Gemini request shape (`contents`/`parts`, UPPERCASE schema types,
   `inline_data` images, `functionCall`/`functionResponse`). This becomes one adapter
   among several.

Five call surfaces use it: `parseWithGemini` (structured JSON + vision),
`generateCategories`, `generateMemorySummary`, `categorizeWithGemini` (all structured
JSON), and `callGeminiParts` (the assistant's function-calling loop). The assistant's
`agent.ts` also speaks raw Gemini parts today.

## New architecture

```
src/lib/llm/
  types.ts       # neutral vocabulary: LlmMessage (user/assistant/tool), ImagePart,
                 # ToolDef (plain JSON Schema), ToolCall {id, name, args}
  index.ts       # activeProvider() from settings; two entry points the app uses:
                 #   generateJson({system, messages, schema, maxTokens}) → parsed value
                 #   chat({system, messages, tools, maxTokens}) → {text?, toolCalls?}
  gemini.ts      # today's transport, moved: uppercases schemas, inline_data images,
                 # functionCall parts → neutral ToolCalls
  openai.ts      # /chat/completions: response_format json_schema, tools, image_url
                 # data-URLs; base URL configurable → covers OpenRouter/Groq/Ollama
  anthropic.ts   # /v1/messages: tool_use blocks; structured JSON via a forced
                 # "emit" tool whose input schema IS the response schema
```

- `lib/gemini.ts` → renamed `lib/ai.ts`: keeps every prompt, schema, repair pass, and
  validator, but calls `llm.generateJson` / `llm.chat` instead of fetch.
- `assistant/agent.ts` loop rewritten in neutral messages/ToolCalls — same 6-round /
  12-call / 30s / token-cap guards, now provider-independent. `tools.ts` declarations
  become plain JSON Schema (each adapter converts).
- Errors: `GeminiError`/`NoGeminiKeyError` → `AiError`/`NoAiKeyError`, messages name
  the active provider ("OpenAI rejected the API key…").
- All schemas authored once in standard JSON Schema; the Gemini adapter uppercases
  types, the Anthropic adapter wraps them in a tool, OpenAI takes them nearly verbatim.

## Guards carry over per adapter

Every adapter keeps the hard-won safety net: `AbortSignal.timeout(30s)`, mandatory
max-output-token caps (mapped to each API's field), typed error mapping (401/403 → bad
key, 429 → rate limit, network → offline). The JSON repair/salvage passes live above
the adapters, so they protect every provider automatically.

## Settings & storage

New "AI provider" card in Settings (replacing the bare Gemini key field):

- **Provider**: Gemini · OpenAI · Anthropic · Custom (OpenAI-compatible)
- **API key** — stored per provider (`pf.geminiKey` kept as-is, `pf.openaiKey`,
  `pf.anthropicKey`, `pf.customKey`) so switching never loses a key
- **Model** — text field with a per-provider default (`gemini-flash-latest`,
  `gpt-5-mini`, `claude-haiku-4-5`), editable for power use
- **Base URL** — only shown for Custom (e.g. `https://openrouter.ai/api/v1`,
  `http://localhost:11434/v1`)

**Migration: zero-touch.** Provider defaults to Gemini and the existing `pf.geminiKey`
keeps working — nothing to re-enter after deploy. Onboarding likewise gains the
provider choice with Gemini preselected.

## What might differ between providers (known risks)

- **Vision**: all three handle base64 images; Ollama/Groq models may not — fail with a
  clear message, not silently.
- **Structured output strictness**: OpenAI strict mode demands every field `required` +
  `additionalProperties: false`; we run non-strict + the existing validation layer,
  which already tolerates sloppy models (it was built for Gemini's omissions).
- **Parallel tool calls**: OpenAI/Anthropic can return several tool calls per turn like
  Gemini; the neutral loop already handles a list.
- **Latency/cost**: provider choice is the user's dial; defaults are each vendor's
  cheap-fast tier.

## Phases

1. **Refactor (no behavior change)** — create `lib/llm/` with the Gemini adapter,
   rewrite `agent.ts`/`ai.ts` onto neutral types. Verify parsing, assistant, categories
   all still work live with Gemini.
2. **New adapters** — OpenAI (+ custom base URL) and Anthropic. Scratch harness to
   smoke-test each surface (parse, vision, categories, agent loop) the moment a key is
   pasted.
3. **Settings UI** — provider card, per-provider keys/models, onboarding tweak,
   generalized error copy.
4. **Verify & ship** — full live pass on Gemini (key on hand); OpenAI/Anthropic passes
   need keys from the user; build + screenshots; push on approval.

## Decisions (confirmed 2026-07-06)

- Scope: **Gemini + OpenAI + Anthropic** only — no custom base URL in v1 (the OpenAI
  adapter is still written with a base-URL constant so adding it later is trivial).
- Granularity: **one global provider** for every AI feature; per-feature override is a
  possible later addition, no rework needed.
- Status: planned, not yet implemented.
