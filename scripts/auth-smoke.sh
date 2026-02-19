#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"

echo "Auth smoke checks for: ${BASE_URL}"
echo

check_route() {
  local route="$1"
  local url="${BASE_URL%/}${route}"
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" "${url}")"
  if [[ "${code}" =~ ^2|3 ]]; then
    echo "PASS ${route} -> HTTP ${code}"
  else
    echo "FAIL ${route} -> HTTP ${code}"
    return 1
  fi
}

check_route "/"
check_route "/auth/callback"
check_route "/auth/invite"
check_route "/dashboard"
check_route "/onboarding"

echo
echo "Manual flow checklist:"
echo "1) Magic link: request from login screen, click email, confirm /auth/callback then redirect."
echo "2) Google OAuth: click button, complete consent, confirm /auth/callback then redirect."
echo "3) Apple OAuth: click button, complete Apple sign-in, confirm /auth/callback then redirect."
echo "4) Verify first-time users go /onboarding and returning users go /dashboard."

