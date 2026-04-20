#!/usr/bin/env bash
# up.sh — bring up the BraiMD stack on a laptop (Podman or Docker).
#
# Modes:
#   (default) full stack: app + db via docker-compose.yml
#   --rootless-fallback : app-only container, DB provided by the host
#   --hybrid            : containerized DB only, run Node app on host
#                         (useful when rootless container build is restricted)
#
# The script auto-detects podman-compose, podman compose, or docker compose.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="full"
for arg in "$@"; do
  case "$arg" in
    --rootless-fallback) MODE="rootless" ;;
    --hybrid) MODE="hybrid" ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [[ ! -f .env ]]; then
  echo ".env missing — running scripts/bootstrap-env.sh first."
  "$ROOT_DIR/scripts/bootstrap-env.sh"
fi

pick_compose() {
  if command -v podman-compose >/dev/null 2>&1; then
    echo "podman-compose"; return
  fi
  if command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
    echo "podman compose"; return
  fi
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "docker compose"; return
  fi
  echo ""
}

COMPOSE="$(pick_compose)"

case "$MODE" in
  full)
    if [[ -z "$COMPOSE" ]]; then
      echo "ERROR: no compose runtime found (podman-compose / podman compose / docker compose)." >&2
      exit 1
    fi
    echo "Using: $COMPOSE"
    $COMPOSE up -d
    ;;
  rootless)
    if [[ -z "$COMPOSE" ]]; then
      echo "ERROR: no compose runtime found." >&2
      exit 1
    fi
    echo "Using: $COMPOSE (rootless fallback — app only)"
    $COMPOSE -f docker-compose.rootless-fallback.yml up -d
    ;;
  hybrid)
    if ! command -v podman >/dev/null 2>&1 && ! command -v docker >/dev/null 2>&1; then
      echo "ERROR: hybrid mode needs podman or docker to run the MySQL container." >&2
      exit 1
    fi
    RUNTIME="$(command -v podman || command -v docker)"
    echo "Using container runtime: $RUNTIME (DB container + host Node app)"
    # shellcheck source=/dev/null
    set -a; . ./.env; set +a
    if ! $RUNTIME container exists braimd-db 2>/dev/null; then
      $RUNTIME run -d --name braimd-db \
        --network host \
        -e MYSQL_ROOT_PASSWORD="$DB_ROOT_PASSWORD" \
        -e MYSQL_DATABASE="$DB_NAME" \
        -e MYSQL_USER="$DB_USER" \
        -e MYSQL_PASSWORD="$DB_PASSWORD" \
        -v "$ROOT_DIR/src/db/schema.sql:/docker-entrypoint-initdb.d/schema.sql:Z" \
        docker.io/library/mysql:8.0
    else
      $RUNTIME start braimd-db >/dev/null
    fi
    echo "Waiting for MySQL to become healthy..."
    for _ in $(seq 1 24); do
      STATUS=$($RUNTIME inspect --format '{{.State.Health.Status}}' braimd-db 2>/dev/null || echo "")
      if [[ "$STATUS" == "healthy" ]]; then
        echo "  MySQL healthy."
        break
      fi
      sleep 5
    done
    [[ -d node_modules ]] || npm install
    echo "Starting Node app on port 3000 (Ctrl+C to stop)."
    exec npm start
    ;;
esac

echo "Done. Check status with: podman ps  (or docker ps)"
