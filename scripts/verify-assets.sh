#!/usr/bin/env bash
# Post-deploy check: ensure /assets/*.js is served as JS, not as index.html.
# Usage: ./scripts/verify-assets.sh [BASE_URL]
# Example: ./scripts/verify-assets.sh https://p3lending.space
set -euo pipefail

BASE_URL="${1:-https://p3lending.space}"
BASE_URL="${BASE_URL%/}"

echo "Checking static assets for: ${BASE_URL}"
echo

# Discover main JS from index.html (script src under /assets/)
HTML="$(curl -sL "${BASE_URL}/")"
ASSET_PATH="$(echo "$HTML" | grep -oE '/assets/[^"]+\.js' | head -1)"

if [[ -z "${ASSET_PATH}" ]]; then
  echo "Could not find /assets/*.js in ${BASE_URL}/"
  exit 1
fi

URL="${BASE_URL}${ASSET_PATH}"
CT="$(curl -sI "$URL" | sed -n 's/^[Cc]ontent-[Tt]ype:\s*//p' | tr -d '\r')"

echo "Asset URL: ${URL}"
echo "Content-Type: ${CT:-<none>}"
echo

if [[ "$CT" == *"text/html"* ]]; then
  echo "FAIL: Asset is being served as HTML (SPA rewrite catching /assets/*)."
  echo "Fix: In netlify.toml, add /assets/* passthrough before the /* -> /index.html rule."
  exit 1
fi

if [[ "$CT" == *"javascript"* ]]; then
  echo "PASS: Asset is served as JavaScript."
  exit 0
fi

echo "WARN: Unexpected Content-Type (expected application/javascript)."
exit 0
