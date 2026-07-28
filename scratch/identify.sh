#!/usr/bin/env bash
# TrackDown Phase 0 — curl a clip at AudD and time the round trip.
#   AUDD_TOKEN=xxx ./identify.sh clip-tab-8s-....webm
# Throwaway spike; scratch/ is gitignored.

set -euo pipefail

: "${AUDD_TOKEN:?Set AUDD_TOKEN (see .env.example / https://audd.io)}"

FILE="${1:?Usage: ./identify.sh <clip.webm>}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }

# stderr, not stdout — stdout must stay pure JSON so it can pipe into parse.js
echo "→ $FILE ($(du -h "$FILE" | cut -f1))" >&2

# -w prints the answer to PLAN.md Q4: does the UI need a progress state?
RESPONSE=$(curl -sS \
  -w '\n{"_http":%{http_code},"_seconds":%{time_total}}' \
  https://api.audd.io/ \
  -F "api_token=$AUDD_TOKEN" \
  -F "file=@$FILE" \
  -F "return=apple_music,spotify")

# Falls back to raw output when the body isn't JSON — an HTML error page is itself a finding.
if command -v jq >/dev/null 2>&1 && echo "$RESPONSE" | jq -se '.[0] * .[1]' 2>/dev/null; then
  :
else
  echo "$RESPONSE"
fi
