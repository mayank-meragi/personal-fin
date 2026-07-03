# ₹ Tracker

Personal finance tracker that lives entirely on GitHub — no server anywhere.

- **App**: React + Vite SPA, hosted on GitHub Pages at https://mayank-meragi.github.io/personal-fin/
- **Data**: JSON files in the private [finance-data](https://github.com/mayank-meragi/finance-data) repo, read/written straight from the browser via GitHub's Contents API
- **AI quick entry**: type `2 tea of 5` and Gemini turns it into a ₹10 Food & Drink transaction

## Features

- Expense/income logging with categories (INR, lakh/crore formatting)
- Dashboard: monthly summary tiles, spend-by-category chart, 6-month income vs expense trend
- Monthly budgets per category with overspend warnings
- Bank statement CSV import with column mapping, duplicate detection, and optional AI categorization
- Local-first sync: writes hit localStorage instantly and push to GitHub in the background; conflicts merge by transaction id

## Setup

1. Create a **private** data repo (e.g. `finance-data`) with a README so `main` exists.
2. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new):
   - Repository access: *Only select repositories* → your data repo
   - Permissions: *Contents: Read and write*
3. (Optional) Get a free [Gemini API key](https://aistudio.google.com/apikey) for AI quick entry.
4. Open the app and paste both into the onboarding screen. They are stored only in your browser's localStorage.

## Development

```sh
npm install
npm run dev      # local dev server (talks to real GitHub/Gemini APIs)
npm test         # unit tests
npm run build    # typecheck + production build
```

Live sync integration test (uses a throwaway file path):

```sh
PF_TEST_TOKEN=$(gh auth token) PF_TEST_REPO=you/finance-data npx vitest run src/lib/__tests__/sync.integration.test.ts
```

Pushes to `main` deploy to GitHub Pages via Actions.

## Data layout (in the data repo)

```
transactions/2026-07.json   # one file per month
budgets.json                # monthly limits per category + per-month overrides
categories.json             # categories with keyword hints for AI/CSV classification
settings.json               # app prefs (never tokens)
```
