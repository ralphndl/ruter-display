#!/bin/sh
# Manage only the local server launched from this checkout by `make start`.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PID_FILE="$ROOT/.cache/server.pid"
LOG_FILE="$ROOT/.cache/server.log"
NODE=$(command -v node)

read_pid() {
  [ -f "$PID_FILE" ] || return 1
  PID=$(cat "$PID_FILE")
  case "$PID" in ''|*[!0-9]*) return 1 ;; esac
  [ "$PID" -gt 1 ] || return 1
  # A stale/reused PID must never cause an unrelated process to be stopped.
  COMMAND=$(ps -p "$PID" -o args= 2>/dev/null) || return 1
  [ "$COMMAND" = "$NODE $ROOT/server.js" ]
}

case "${1:-}" in
  start)
    if read_pid; then
      echo "Local server already running (PID $PID)."
      exit 0
    fi
    mkdir -p "$ROOT/.cache"
    rm -f "$PID_FILE"
    cd "$ROOT"
    PORT=$("$NODE" -p "require('./lib/config').loadServerConfig().port")
    export PORT
    nohup "$NODE" "$ROOT/server.js" > "$LOG_FILE" 2>&1 < /dev/null &
    PID=$!
    echo "$PID" > "$PID_FILE"
    sleep 1
    if ! read_pid; then
      rm -f "$PID_FILE"
      echo "Server could not start. Log: $LOG_FILE" >&2
      cat "$LOG_FILE" >&2
      exit 1
    fi
    echo "Local server started at http://localhost:${PORT:-3030} (PID $PID)."
    echo "Log: $LOG_FILE"
    ;;
  stop)
    if ! read_pid; then
      rm -f "$PID_FILE"
      echo "Local server is not running."
      exit 0
    fi
    kill "$PID"
    # Wait for the port to be released before a subsequent start/service command.
    ATTEMPTS=0
    while read_pid; do
      ATTEMPTS=$((ATTEMPTS + 1))
      if [ "$ATTEMPTS" -ge 10 ]; then
        echo "Server has not stopped yet (PID $PID); keeping the PID file." >&2
        exit 1
      fi
      sleep 1
    done
    rm -f "$PID_FILE"
    echo "Local server stopped."
    ;;
  *)
    echo "Usage: $0 start|stop" >&2
    exit 1
    ;;
esac
