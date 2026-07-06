#!/bin/bash
# One-time data-repo migration: copy root finance files under finance/.
# Run with COPY only first (safe, idempotent); pass --delete-originals when the
# new app is deployed and reading from finance/ to remove the root copies.
set -e
REPO="mayank-meragi/finance-data"

copy_file() { # $1 = source path, $2 = dest path
  content=$(gh api "repos/$REPO/contents/$1?ref=main" --jq '.content' 2>/dev/null) || { echo "skip $1 (missing)"; return; }
  existing_sha=$(gh api "repos/$REPO/contents/$2?ref=main" --jq '.sha' 2>/dev/null || echo "")
  if [ -n "$existing_sha" ]; then
    gh api -X PUT "repos/$REPO/contents/$2" -f message="Migrate: copy $1 -> $2" -f content="$content" -f branch=main -f sha="$existing_sha" >/dev/null
  else
    gh api -X PUT "repos/$REPO/contents/$2" -f message="Migrate: copy $1 -> $2" -f content="$content" -f branch=main >/dev/null
  fi
  echo "copied $1 -> $2"
}

delete_file() { # $1 = path
  sha=$(gh api "repos/$REPO/contents/$1?ref=main" --jq '.sha' 2>/dev/null) || { echo "skip $1 (missing)"; return; }
  gh api -X DELETE "repos/$REPO/contents/$1" -f message="Migrate: remove root copy $1" -f sha="$sha" -f branch=main >/dev/null
  echo "deleted $1"
}

for f in $(gh api "repos/$REPO/contents/transactions?ref=main" --jq '.[].name' 2>/dev/null); do
  copy_file "transactions/$f" "finance/transactions/$f"
done
for f in budgets.json categories.json accounts.json ai-memory.json; do
  copy_file "$f" "finance/$f"
done

if [ "$1" = "--delete-originals" ]; then
  for f in $(gh api "repos/$REPO/contents/transactions?ref=main" --jq '.[].name' 2>/dev/null); do
    delete_file "transactions/$f"
  done
  for f in budgets.json categories.json accounts.json ai-memory.json; do
    delete_file "$f"
  done
fi
