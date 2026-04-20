#!/usr/bin/env bash
# up.sh — bring up the BraiMD stack on a laptop (Podman or Docker).
#
# Modes:
#   (default) full stack: app + db via docker-compose.yml
#   --rootless-fallback : app-only container, DB provided by the host
#   --hybrid            : containerized DB only, run Node app on host
#                         (useful when rootless container build is restricted)
#
# Behavior:
#   * Auto-detects podman-compose, podman compose, or docker compose.
#   * In full mode, if the app container fails to come up (typically a
#     build-time networking failure inside sandboxes where /dev/net/tun
#     is not available) the script automatically falls back to hybrid
#     mode so the stack still ends up running.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="full"
NO_FALLBACK=0
for arg in "$@"; do
  case "$arg" in
    --rootless-fallback) MODE="rootless" ;;
    --hybrid) MODE="hybrid" ;;
    --no-fallback) NO_FALLBACK=1 ;;
    -h|--help)
      sed -n '2,18p' "$0"
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

pick_runtime() {
  if command -v podman >/dev/null 2>&1; then echo "podman"; return; fi
  if command -v docker >/dev/null 2>&1; then echo "docker"; return; fi
  echo ""
}

COMPOSE="$(pick_compose)"
RUNTIME="$(pick_runtime)"

wait_db_healthy() {
  local runtime="$1"
  echo "Waiting for MySQL to become healthy..."
  for _ in $(seq 1 24); do
    local status=""
    # Prefer container's built-in healthcheck; rootless Podman timers can
    # be unreliable so we also actively trigger it each loop.
    $runtime healthcheck run braimd-db >/dev/null 2>&1 || true
    status=$($runtime inspect --format '{{.State.Health.Status}}' braimd-db 2>/dev/null || echo "")
    if [[ "$status" == "healthy" ]]; then
      echo "  MySQL healthy."
      return 0
    fi
    # Fallback: direct mysqladmin ping inside the container.
    if $runtime exec braimd-db sh -c 'mysqladmin ping -h localhost -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" --silent' >/dev/null 2>&1; then
      echo "  MySQL responding to ping."
      return 0
    fi
    sleep 5
  done
  echo "  MySQL did not respond within timeout." >&2
  return 1
}

run_hybrid() {
  if [[ -z "$RUNTIME" ]]; then
    echo "ERROR: hybrid mode needs podman or docker." >&2
    exit 1
  fi
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
  wait_db_healthy "$RUNTIME" || true
  [[ -d node_modules ]] || npm install
  echo "Starting Node app on port 3000 (Ctrl+C to stop)."
  exec npm start
}

case "$MODE" in
  full)
    if [[ -z "$COMPOSE" ]]; then
      echo "ERROR: no compose runtime found (podman-compose / podman compose / docker compose)." >&2
      exit 1
    fi
    echo "Using: $COMPOSE"
    set +e
    $COMPOSE up -d
    compose_rc=$?
    set -e

    app_running=0
    if [[ -n "$RUNTIME" ]]; then
      if $RUNTIME ps --format '{{.Names}}' 2>/dev/null | grep -qx braimd-app; then
        app_running=1
      fi
    fi

    if [[ "$compose_rc" -eq 0 && "$app_running" -eq 1 ]]; then
      echo "Done. Full stack up."
      exit 0
    fi

    echo "WARN: full-stack bring-up did not produce a running braimd-app container." >&2
    if [[ "$NO_FALLBACK" -eq 1 ]]; then
      echo "       (--no-fallback set; leaving state as-is)" >&2
      exit 1
    fi

    echo "       Falling back to --hybrid mode (container DB + host Node app)."
    if [[ -n "$RUNTIME" ]] && $RUNTIME container exists braimd-app 2>/dev/null; then
      $RUNTIME rm -f braimd-app >/dev/null 2>&1 || true
    fi
    run_hybrid
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
    run_hybrid
    ;;
esac

echo "Done. Check status with: podman ps  (or docker ps)"
