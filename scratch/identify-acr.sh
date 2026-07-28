#!/usr/bin/env bash
# TrackDown Phase 0 — same job as identify.sh, but against ACRCloud.
#
#   set -a; source server/.env; set +a
#   ./identify-acr.sh clip.webm
#
# ACRCloud signs each request with HMAC-SHA1 rather than taking a bearer token, which is
# the extra complexity DECISIONS.md weighed when picking AudD for v1.

set -euo pipefail

: "${ACR_HOST:?Set ACR_HOST (e.g. identify-eu-west-1.acrcloud.com)}"
: "${ACR_ACCESS_KEY:?Set ACR_ACCESS_KEY}"
: "${ACR_ACCESS_SECRET:?Set ACR_ACCESS_SECRET}"

FILE="${1:?Usage: ./identify-acr.sh <clip.webm>}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }

echo "→ $FILE ($(du -h "$FILE" | cut -f1))" >&2

TIMESTAMP=$(date +%s)
URI="/v1/identify"

# The signed string is six newline-separated fields, in this exact order, with no
# trailing newline. Any deviation returns a 3003 signature error.
STRING_TO_SIGN=$(printf '%s\n%s\n%s\n%s\n%s\n%s' \
  "POST" "$URI" "$ACR_ACCESS_KEY" "audio" "1" "$TIMESTAMP")

SIGNATURE=$(printf '%s' "$STRING_TO_SIGN" \
  | openssl dgst -sha1 -hmac "$ACR_ACCESS_SECRET" -binary \
  | base64)

RESPONSE=$(curl -sS -X POST "https://${ACR_HOST}${URI}" \
  -w '\n{"_http":%{http_code},"_seconds":%{time_total}}' \
  -F "sample=@${FILE}" \
  -F "sample_bytes=$(stat -f%z "$FILE")" \
  -F "access_key=${ACR_ACCESS_KEY}" \
  -F "data_type=audio" \
  -F "signature_version=1" \
  -F "signature=${SIGNATURE}" \
  -F "timestamp=${TIMESTAMP}")

if command -v jq >/dev/null 2>&1 && echo "$RESPONSE" | jq -se '.[0] * .[1]' 2>/dev/null; then
  :
else
  echo "$RESPONSE"
fi
