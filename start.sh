#!/usr/bin/env bash
# ============================================
# LifeSync launcher (macOS / Linux)
# ============================================
# First time? Run:  npm run setup
# Then start everything with:  ./start.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it from https://nodejs.org then try again."
  exit 1
fi
exec node scripts/launch.mjs
