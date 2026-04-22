#!/usr/bin/env bash
# bootstrap-env.sh — generate a fresh .env from .env.example for local dev/testing.
#
# Behavior:
#   * Refuses to clobber an existing .env unless --force is given.
#   * Generates a random API key, stores its SHA-256 hash in .env,
#     and writes the RAW key to .env.apikey (chmod 600) for your use in x-api-key.
#   * Fills DB_PASSWORD and DB_ROOT_PASSWORD with random values if not already set.
#
# Usage:
#   scripts/bootstrap-env.sh              # create .env if missing
#   scripts/bootstrap-env.sh --force      # overwrite existing .env
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [[ -f .env && "$FORCE" -eq 0 ]]; then
  echo ".env already exists (use --force to overwrite)."
  exit 0
fi

if [[ ! -f .env.example ]]; then
  echo "ERROR: .env.example is missing; cannot bootstrap." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: openssl is required to generate secrets." >&2
  exit 1
fi

RAW_KEY="$(openssl rand -hex 32)"
API_HASH="$(printf '%s' "$RAW_KEY" | sha256sum | awk '{print $1}')"
DB_PASS="$(openssl rand -hex 16)"
DB_ROOT_PASS="$(openssl rand -hex 16)"

cp .env.example .env
chmod 600 .env

sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PASS}|" .env
sed -i "s|^DB_ROOT_PASSWORD=.*|DB_ROOT_PASSWORD=${DB_ROOT_PASS}|" .env
sed -i "s|^API_KEY_HASH=.*|API_KEY_HASH=${API_HASH}|" .env

umask 077
printf '%s\n' "$RAW_KEY" > .env.apikey
chmod 600 .env.apikey

cat <<EOF
.env generated.
  DB_PASSWORD, DB_ROOT_PASSWORD: random
  API_KEY_HASH: written to .env
  API key (raw): saved to .env.apikey (chmod 600)

Use the raw key in agent requests:
  curl -H "x-api-key: \$(cat .env.apikey)" http://localhost:3000/api/skills
EOF
