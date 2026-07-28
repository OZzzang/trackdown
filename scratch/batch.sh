#!/usr/bin/env bash
# TrackDown Phase 0 — measure AudD's metadata error rate over a batch of clips.
#
#   AUDD_TOKEN must be set (set -a; source server/.env; set +a)
#   ./batch.sh ~/Downloads/known/*.webm
#
# Name each clip after the song you expect, e.g. "baby-bieber.webm", so the expected and
# returned values sit side by side and you can count the mismatches by eye.

set -uo pipefail   # deliberately NOT -e: one bad clip must not abort the run

: "${AUDD_TOKEN:?Set AUDD_TOKEN (set -a; source server/.env; set +a)}"
[ $# -gt 0 ] || { echo "Usage: ./batch.sh <clip.webm> [more.webm …]" >&2; exit 1; }

HERE="$(cd "$(dirname "$0")" && pwd)"

# Swap providers without touching the loop:  PROVIDER=acr ./batch.sh clips/*.webm
case "${PROVIDER:-audd}" in
  audd) IDENTIFY="$HERE/identify.sh";     PARSE="$HERE/parse.js" ;;
  acr)  IDENTIFY="$HERE/identify-acr.sh"; PARSE="$HERE/parse-acr.js" ;;
  *)    echo "PROVIDER must be 'audd' or 'acr'" >&2; exit 1 ;;
esac

total=0; found=0

printf '%-28s  %-28s  %s\n' "EXPECTED (filename)" "RETURNED TITLE" "ARTIST"
printf '%.0s-' {1..80}; printf '\n'

for clip in "$@"; do
  [ -f "$clip" ] || { echo "skip (missing): $clip" >&2; continue; }
  total=$((total + 1))

  # stderr is discarded here so one clean row prints per clip.
  json=$("$IDENTIFY" "$clip" 2>/dev/null | node "$PARSE" 2>/dev/null)

  if [ -z "$json" ]; then
    title="<request failed>"; artist="—"
  else
    title=$(printf '%s' "$json" | jq -r '.title // "<no match>"')
    artist=$(printf '%s' "$json" | jq -r '.artist // "—"')
    [ "$title" != "<no match>" ] && found=$((found + 1))
  fi

  printf '%-28.28s  %-28.28s  %s\n' "$(basename "$clip" .webm)" "$title" "$artist"
  sleep 1   # be polite to the free tier
done

printf '%.0s-' {1..80}; printf '\n'
echo "$found/$total returned a match. Now count how many are the RIGHT song —"
echo "that is the number the decision rule in docs/DECISIONS.md turns on."
