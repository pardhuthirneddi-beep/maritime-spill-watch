#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MARIS CHECKPOINT RESTORE
# Restores the project to the latest saved checkpoint in backups/
# Usage: bash scripts/restore-maris-checkpoint.sh [checkpoint-file]
#        (omit the argument to use the newest one automatically)
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

LATEST="${1:-}"
if [ -z "$LATEST" ]; then
  LATEST=$(ls -1t backups/maris-checkpoint-*.tar.gz 2>/dev/null | head -1 || true)
fi
if [ -z "$LATEST" ] || [ ! -f "$LATEST" ]; then
  echo "ERROR: no checkpoint found in backups/ (looking for maris-checkpoint-*.tar.gz)"
  exit 1
fi
echo "Restoring from: $LATEST"

# Safety: keep the current (possibly broken) state so nothing is lost
STAMP=$(date +%Y%m%d-%H%M%S)
PRE="backups/pre-restore-state-$STAMP"
mkdir -p "$PRE"
echo "Saving current state to $PRE ..."
for f in src public scripts index.html package.json bun.lock vite.config.ts tsconfig*.json components.json postcss.config.cjs eslint.config.js main.ts; do
  [ -e "$f" ] && mv "$f" "$PRE/"
done

echo "Extracting checkpoint ..."
tar -xzf "$LATEST"

echo
echo "Done. Current broken state was kept in: $PRE"
echo "If everything looks good you can delete it later:"
echo "  rm -rf $PRE"
echo
echo "Next steps: bun install  (only if package.json/bun.lock changed), then reload the preview."
