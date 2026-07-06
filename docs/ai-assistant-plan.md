# Omnipresent AI Assistant — Architecture Plan

## Goal

One AI that can control the entire app: log/edit/delete transactions, manage accounts,
categories, budgets, navigate, answer questions about your money, and change settings —
available from every screen. The existing Quick Add stays as the fast lane for logging;
the assistant is the general control plane.

## Why this app is ready for it

Every mutation already goes through one local-first layer (`lib/sync.ts` → GitHub), and
every read is cached locally. An agent doesn't need a backend — it needs a **tool surface**
over functions the app already has.

## Core mechanism: Gemini function calling, in the browser

`gemini-flash-latest` supports tool use. The agent loop lives client-side:

1. Build context: today's date, accounts + live balances, categories (with savings/parents),
   budgets, AI memory, current month totals, current page.
2. Call `generateContent` with `tools: [{ functionDeclarations }]` + conversation history.
3. Model replies with either text (done) or `functionCall` parts.
4. Execute each call against the action layer, append `functionResponse` parts, loop
   (max ~6 iterations, 30s timeout per call, output-token caps — same guards as parsing).

## Tool surface (v1)

Read:
- `get_overview()` — balances, month totals, budget status (also injected upfront)
- `list_transactions({ month?, category?, account?, text?, limit? })`

Write (validated; all local-first, synced to GitHub like any UI action):
- `add_transactions(entries[])` — same shape quick entry produces
- `update_transaction(id, patch)` / `delete_transaction(id)` ⚠ confirm
- `add_categories(batch)` / `update_category(id, patch)` — reuses batch generator semantics
- `set_budget(categoryId, monthlyLimit, month?)`
- `add_account(...)` / `update_account(id, patch)`
- `navigate(page)` — dashboard | activity | budgets | categories | import | settings

Explicitly NOT tools: reset-everything, sign-out, key management (stay human-only).

## New architecture pieces

```
src/lib/actions.ts            # non-hook action layer: every mutation as a plain function
                              # (updateFile + queryClient.setQueryData). Hooks AND the
                              # agent both call these — one source of truth.
src/lib/assistant/tools.ts    # Gemini functionDeclarations + validator + executor map
src/lib/assistant/agent.ts    # the loop: context builder, iteration, guards
src/components/Assistant.tsx  # floating ✦ button (every page) → chat sheet
```

Refactor cost: `useTransactions`/`useData` mutations move their bodies into `actions.ts`
and become thin wrappers. No behavior change.

## UX

- Floating assistant button, bottom-right above the pill nav, on every page.
- Opens a bottom-sheet chat (Perfin styling: sheet radius 28px, mono numbers).
- Tool executions render as **action cards** in the thread ("＋ Added 3 transactions ·
  ₹1,240", "🎯 Budget set: Food & Drink ₹6,000/mo") — tappable to jump to the page.
- **Apply-then-undo** for additive/edit actions (snackbar-style Undo per action card,
  powered by inverse ops); **explicit in-chat confirm button** before any delete.
- Conversation kept for the session (localStorage), cleared manually.
- Quick entry untouched; later the assistant may absorb it.

## Safety rails

- Whitelisted tools only; every arg validated (existing category/account ids, amount > 0).
- Deletes require a user tap on a confirm chip inside the chat.
- Same degeneration guards as parsing: token caps, 30s timeout, max 6 loop iterations.
- Every mutation is a git commit in finance-data — full audit trail comes free.

## Phases

1. **Agent core** — actions.ts refactor, tools, loop, chat sheet with action cards,
   transactions/categories/budgets/accounts/navigate tools. ← the bulk
2. **Awareness & undo** — current-page context, per-action undo, richer queries
   ("how much on food in May?" across months).
3. **Proactive** — monthly digest message, anomaly notes, voice input.

## Decisions (confirmed 2026-07-06)

- Placement: **floating button + chat sheet** on every screen; Quick Add unchanged
- Write policy: **apply immediately + Undo** per action; deletes need an in-chat confirm tap
- Status: plan under review — Phase 1 build not started yet
