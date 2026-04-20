#!/usr/bin/env bash
# run-tests.sh — run the Node test suite.
#
# Preference order:
#   1. inside the running braimd-app container (if present)
#   2. on the host via npm (installs deps if needed)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUNTIME=""
if command -v podman >/dev/null 2>&1; then RUNTIME=podman
elif command -v docker >/dev/null 2>&1; then RUNTIME=docker
fi

if [[ -n "$RUNTIME" ]] && $RUNTIME container exists braimd-app 2>/dev/null; then
  echo "Running tests inside braimd-app container ($RUNTIME exec)."
  exec $RUNTIME exec -w /app braimd-app npm test
fi

echo "Running tests on host."
[[ -d node_modules ]] || npm install
exec npm test
