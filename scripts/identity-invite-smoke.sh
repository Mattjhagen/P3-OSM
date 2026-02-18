#!/usr/bin/env bash

set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $1" >&2
    exit 1
  fi
}

require_cmd netlify
require_cmd jq
require_cmd curl

STATUS_JSON="$(netlify status --json)"
SITE_ID="${SITE_ID:-$(echo "$STATUS_JSON" | jq -r '.siteData["site-id"] // empty')}"
SITE_URL="${SITE_URL:-$(echo "$STATUS_JSON" | jq -r '.siteData["site-url"] // empty')}"

if [[ -z "$SITE_ID" || -z "$SITE_URL" ]]; then
  echo "ERROR: unable to resolve SITE_ID/SITE_URL from netlify status."
  echo "Set env vars manually, e.g. SITE_ID=... SITE_URL=https://p3lending.space"
  exit 1
fi

echo "== Identity Invite Smoke Test =="
echo "SITE_ID:  $SITE_ID"
echo "SITE_URL: $SITE_URL"
echo

FAILURES=0
WARNINGS=0

IDENTITY_HEALTH_URL="${SITE_URL%/}/.netlify/identity/health"
HEALTH_TMP="$(mktemp)"
HEALTH_CODE="$(curl -sS -o "$HEALTH_TMP" -w "%{http_code}" "$IDENTITY_HEALTH_URL" || true)"

if [[ "$HEALTH_CODE" != "200" ]]; then
  echo "FAIL: Identity health endpoint returned HTTP $HEALTH_CODE"
  FAILURES=$((FAILURES + 1))
else
  HEALTH_NAME="$(jq -r '.name // empty' "$HEALTH_TMP" 2>/dev/null || true)"
  HEALTH_VERSION="$(jq -r '.version // empty' "$HEALTH_TMP" 2>/dev/null || true)"
  echo "PASS: Identity health endpoint is reachable (name=${HEALTH_NAME:-unknown}, version=${HEALTH_VERSION:-unknown})"
fi
rm -f "$HEALTH_TMP"

SITE_JSON="$(netlify api getSite --data "{\"site_id\":\"$SITE_ID\"}")"
IDENTITY_INSTANCE_ID="$(echo "$SITE_JSON" | jq -r '.identity_instance_id // empty')"
ACCOUNT_ID="$(echo "$SITE_JSON" | jq -r '.account_id // empty')"

if [[ -z "$IDENTITY_INSTANCE_ID" ]]; then
  echo "FAIL: Identity instance is not configured on this site."
  FAILURES=$((FAILURES + 1))
else
  echo "PASS: Identity instance detected ($IDENTITY_INSTANCE_ID)"
fi

if [[ -n "$IDENTITY_INSTANCE_ID" ]]; then
  SERVICE_JSON="$(netlify api showServiceInstance --data "{\"site_id\":\"$SITE_ID\",\"addon\":\"identity\",\"instance_id\":\"$IDENTITY_INSTANCE_ID\"}")"

  CONFIG_SITE_URL="$(echo "$SERVICE_JSON" | jq -r '.config.config.site_url // empty')"
  SMTP_HOST="$(echo "$SERVICE_JSON" | jq -r '.config.config.smtp.host // empty')"
  SMTP_PORT="$(echo "$SERVICE_JSON" | jq -r '.config.config.smtp.port // empty')"
  SMTP_USER="$(echo "$SERVICE_JSON" | jq -r '.config.config.smtp.user // empty')"
  DISABLE_SIGNUP="$(echo "$SERVICE_JSON" | jq -r '.config.config.disable_signup')"
  INVITE_TEMPLATE_PATH="$(echo "$SERVICE_JSON" | jq -r '.config.config.mailer.templates.invite // empty')"

  echo "Identity config summary:"
  echo "  site_url:      ${CONFIG_SITE_URL:-<unset>}"
  echo "  disable_signup:${DISABLE_SIGNUP:-<unset>}"
  echo "  smtp.host:     ${SMTP_HOST:-<unset>}"
  echo "  smtp.port:     ${SMTP_PORT:-<unset>}"
  echo "  smtp.user:     ${SMTP_USER:-<unset>}"
  echo "  invite tpl:    ${INVITE_TEMPLATE_PATH:-<unset>}"

  if [[ -z "$SMTP_HOST" ]]; then
    echo "FAIL: SMTP host is not configured for Identity invites."
    FAILURES=$((FAILURES + 1))
  fi

  if [[ "$CONFIG_SITE_URL" != "$SITE_URL" ]]; then
    echo "WARN: Identity site_url does not match project URL."
    WARNINGS=$((WARNINGS + 1))
  fi

  if [[ "$SMTP_HOST" == "127.0.0.1" || "$SMTP_HOST" == "localhost" ]]; then
    echo "FAIL: SMTP host points to local machine; Netlify cloud cannot reach it."
    FAILURES=$((FAILURES + 1))
  fi

  if [[ "$SMTP_HOST" == "smtp.protonmail.ch" || "$SMTP_HOST" == "smtp.proton.me" ]]; then
    echo "WARN: Proton SMTP detected. Verify Identity uses valid SMTP credentials/token and provider allows cloud relay."
    WARNINGS=$((WARNINGS + 1))
  fi

  if [[ -n "$INVITE_TEMPLATE_PATH" && "$INVITE_TEMPLATE_PATH" == /* ]]; then
    TEMPLATE_URL="${SITE_URL%/}${INVITE_TEMPLATE_PATH}"
    TEMPLATE_CODE="$(curl -sS -o /tmp/p3-invite-template.html -w "%{http_code}" "$TEMPLATE_URL" || true)"
    if [[ "$TEMPLATE_CODE" != "200" ]]; then
      echo "FAIL: Invite template URL is not reachable: $TEMPLATE_URL (HTTP $TEMPLATE_CODE)"
      FAILURES=$((FAILURES + 1))
    else
      if ! grep -Fq "{{ .Token }}" /tmp/p3-invite-template.html; then
        echo "WARN: Invite template does not contain '{{ .Token }}' placeholder."
        WARNINGS=$((WARNINGS + 1))
      fi
      echo "PASS: Invite template URL reachable ($TEMPLATE_URL)"
    fi
    rm -f /tmp/p3-invite-template.html
  fi
fi

if [[ -n "$ACCOUNT_ID" ]]; then
  EVENTS_JSON="$(netlify api listAccountAuditEvents --data "{\"account_id\":\"$ACCOUNT_ID\",\"page\":1,\"per_page\":100}")"
  IDENTITY_EVENT_COUNT="$(echo "$EVENTS_JSON" | jq '[ .[] | select((.payload.action // "") | test("identity|invite"; "i")) ] | length')"
  echo "Audit events (identity/invite keyword match in last 100): $IDENTITY_EVENT_COUNT"
fi

echo
if [[ "$FAILURES" -gt 0 ]]; then
  echo "RESULT: FAIL ($FAILURES failure(s), $WARNINGS warning(s))"
  exit 1
fi

echo "RESULT: PASS ($WARNINGS warning(s))"
echo "Next manual step: run an actual Netlify dashboard invite and confirm no 500."
