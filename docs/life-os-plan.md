# Life OS — Modular App + Fitness Module Plan

## Goal

Evolve ₹ Tracker from a finance app into a **Life OS**: one PWA, one data repo, one
assistant — with pluggable modules. Finance becomes the first module; **Fitness (gym +
workout tracking)** is the second. Future modules (sleep, habits, journal…) drop in
without another restructure.

Fitness v1 = the full loop: a proper exercise library with images → AI builds the next
day's workout from your history → you track it set-by-set in the gym → the log feeds the
next generation.

## Part 1 — The module framework (the "OS")

### Shell & navigation

- **Hub home (`/`)**: greeting + one card per module with its live headline —
  Finance: net worth + month spend; Fitness: today's workout & streak. Tap to enter.
- **Module-scoped bottom nav**: inside a module the pill nav shows that module's tabs
  (Finance: Dashboard/Activity/Budgets/Import/Settings → unchanged; Fitness: Today/
  Exercises/History/Plan) plus a Home button back to the hub. Desktop: same idea in the
  top bar with a module switcher.
- **Routes namespaced**: `/finance/*` (old paths redirect), `/fitness/*`. Settings stays
  global (data store, AI provider, danger zone) with per-module sections.

### Code structure

```
src/modules/registry.ts        # ModuleDef: id, name, icon, routes, navItems,
                               # dashboardCard(), assistantTools, buildOverview()
src/modules/finance/…          # existing pages/components move here (no behavior change)
src/modules/fitness/…          # new
```

The app shell, sync layer, LLM layer, and assistant stay global. The **assistant
becomes the OS-level control plane**: its tool list and system-prompt overview are
merged from every module's registry entry — "add tea 20" and "log bench 3x8 at 60"
both work from the same chat.

### Data repo layout

Modules get folders in `finance-data`:

```
finance/  transactions/… budgets.json categories.json accounts.json memory.json
fitness/  profile.json  workouts/2026-07.json  plan.json  memory.json
```

Finance files currently live at the repo root — a one-time migration moves them under
`finance/` (I script it via the Contents API; git history keeps the old copies). The
sync layer is already path-based, so it needs zero changes either way.

## Part 2 — Fitness module

### Exercise library (the open data source)

**free-exercise-db** — Public Domain dataset, verified working:
- 873 exercises, **every one with 2 step images** (start/end position — the detail view
  alternates them for a simple animation), instructions, primary/secondary muscles,
  level, equipment (barbell/dumbbell/machine/cable/body-only/kettlebell/bands…),
  category (strength/stretching/cardio…).
- Served as one static ~1 MB JSON + images from a CDN (jsDelivr/GitHub) — **no API key,
  no rate limits, works offline once cached**. Fits this app's no-backend, free-tier
  ethos exactly. (Alternative considered: wger.de REST API — live but thinner image
  coverage and needs many calls; ExerciseDB has GIFs but sits behind a paid RapidAPI key.)
- Cached via the Cache API on first use; the Exercises tab works offline after that.

**Exercises tab**: search + filter by muscle group / equipment / level; detail sheet
with animated image pair, muscle chips, step-by-step instructions, and your history on
that exercise (last weights, PR).

### Tracking mechanism

Data model (`fitness/workouts/YYYY-MM.json`):

```
Session { id, date, name ("Push day"), source: ai|manual,
          startedAt?, endedAt?,
          exercises: [{ exerciseId, name, sets: [{ targetReps, targetWeight,
                        reps?, weight?, done, rpe? }], notes? }] }
```

**Today tab** — the in-gym screen, built for one thumb:
- Today's planned workout as a checklist: exercise rows with image thumbnails; each set
  a row showing target reps × weight; tap to mark done (logs the targets), long-press /
  edit to record what you actually did.
- **Rest timer** starts automatically when a set is checked (per-exercise rest from the
  plan; skippable).
- Swap or add an exercise mid-workout (picker filtered to same muscle group).
- Finish → session saved with duration; missed sets recorded as skipped.
- **Quick log** for ad-hoc entries, same pattern as finance quick entry: "bench 3x8 60kg,
  squats 5x5 80" → AI parses into a session.

**History tab**: session list + calendar strip, weekly volume per muscle group chart,
PR list (best estimated 1RM per exercise), current streak.

### AI workout generation

`generateNextWorkout()` through the existing provider-neutral LLM layer (`generateJson`
with a session schema — all the token-cap/timeout/salvage guards apply):

- **Inputs**: profile (`fitness/profile.json`: goal, experience, days per week,
  available equipment, injuries/exclusions), the last ~10 sessions (per-muscle volume,
  completed vs planned, weights, RPE), fitness AI memory, and a **candidate exercise
  list** filtered from the library by equipment + due muscle groups (the full 873 would
  blow the prompt; ~100 candidates keeps it sharp).
- **Programming rules in the prompt**: progressive overload (all sets completed last
  time → +2.5 kg or +1 rep), 48–72 h muscle recovery, rotate splits per the profile,
  respect skipped/failed sets by holding or deloading, periodic deload weeks.
- **Output**: a full Session (planned sets/reps/weights + rest seconds), validated
  against the library (unknown exercise ids fuzzy-matched or dropped), written to
  `fitness/plan.json` — fully editable before and during the workout.
- **Fitness memory** (like finance's): rewritten after each session — preferences
  ("hates burpees"), constraints ("left shoulder impingement — no overhead pressing"),
  observed working weights.
- Onboarding: first visit to Fitness = short profile setup, then "Generate my first
  workout".

### Assistant tools (fitness)

`get_workout_history`, `log_sets`, `generate_next_workout`, `swap_exercise`,
`update_fitness_profile` — so "what did I bench last week?", "log 3 sets of squats at
80", and "make tomorrow a leg day" all work from the global chat.

## Phases

1. **Shell** — module registry, hub home, namespaced routes + redirects, module-scoped
   nav; finance code moves under `src/modules/finance/` with zero behavior change;
   assistant tools become a merged registry. *(The risky refactor, done first and alone.)*
2. **Data migration** — finance files → `finance/` in the data repo (scripted, verified,
   reversible via git history).
3. **Exercise library** — fetch + cache free-exercise-db, Exercises tab with search,
   filters, animated detail view.
4. **Tracking** — session model, Today checklist with rest timer, quick log, History
   with volume/PRs/streak.
5. **AI planner** — profile setup, `generateNextWorkout`, Plan tab, fitness memory,
   assistant tools.

Each phase builds, screenshots, and works standalone; push whenever you say.

## Decisions (confirmed 2026-07-06)

- Shell: **hub home + module-scoped nav** — Life OS home with live module cards.
- Data: **migrate finance files under `finance/`** (scripted one-time move, verified).
- Planner: **on-demand generation** — deliberately, per the user: generating at the
  moment of use lets the AI see inconsistency (days since the last session, missed
  workouts) and tweak accordingly — ease back in after a gap rather than blindly
  continuing a schedule. The prompt must therefore weight "time since last session"
  and adherence, not just progression.
- Status: **implemented locally** (all 5 phases). Verified: build + full test suite green,
  live Gemini runs (first-workout generation honoring an injury, 12-day-gap comeback at
  ~85% load with full-body fallback, quick-log parse, agent log_workout), screenshots of
  hub/fitness/finance against live data. **Deployed 2026-07-06**; data migration
  finalized — root finance files re-synced to `finance/` and deleted
  (`scripts/migrate-finance-data.sh --delete-originals`); repo root is now just
  `finance/`, `fitness/`, `settings.json`.
