#!/usr/bin/env bash
# smoke.sh — verify the BraiMD app is serving traffic.
#
# Checks:
#   1. GET /health            → {"status":"ok"}
#   2. GET /dashboard         → HTTP 200
#   3. GET /api/skills w/ key → HTTP 200 (if .env.apikey exists)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BRAIMD_BASE_URL:-http://127.0.0.1:3000}"
FAIL=0

check() {
  local name="$1" expected="$2" url="$3" ; shift 3
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$@" "$url" || echo "000")
  if [[ "$code" == "$expected" ]]; then
    printf "  OK   %-28s %s\n" "$name" "$code"
  else
    printf "  FAIL %-28s expected=%s got=%s\n" "$name" "$expected" "$code"
    FAIL=1
  fi
}

echo "Smoke testing ${BASE_URL}"

HEALTH_BODY=$(curl -sS "$BASE_URL/health" || echo "")
if [[ "$HEALTH_BODY" == *'"status":"ok"'* ]]; then
  printf "  OK   %-28s %s\n" "GET /health" "$HEALTH_BODY"
else
  printf "  FAIL %-28s body=%s\n" "GET /health" "$HEALTH_BODY"
  FAIL=1
fi

check "GET /dashboard"      "200" "$BASE_URL/dashboard"
check "GET /dashboard/help" "200" "$BASE_URL/dashboard/help"

if [[ -f .env.apikey ]]; then
  KEY="$(cat .env.apikey)"
  check "GET /api/skills (auth)"    "200" "$BASE_URL/api/skills"       -H "x-api-key: $KEY"
  check "GET /api/skills (no key)"  "401" "$BASE_URL/api/skills"
else
  echo "  SKIP /api/skills auth check (no .env.apikey found)"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "Smoke test FAILED"
  exit 1
fi
echo "Smoke test passed"
