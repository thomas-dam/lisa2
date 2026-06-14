#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

PORT="${PORT:-3320}"
PID_FILE="${PID_FILE:-.server.pid}"

wait_for_exit() {
  pid="$1"
  i=0
  while [ "$i" -lt 25 ]; do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.2
    i=$((i + 1))
  done
  echo "Process did not exit cleanly, force-killing."
  kill -9 "$pid" 2>/dev/null || true
}

stopped=0

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  rm -f "$PID_FILE"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    wait_for_exit "$PID"
    echo "Stopped standalone bot (pid $PID)."
    stopped=1
  else
    echo "Stale PID file removed."
  fi
fi

# Fallback: kill anything still holding the port
PORT_PID="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
if [ -n "$PORT_PID" ]; then
  kill "$PORT_PID" 2>/dev/null || true
  wait_for_exit "$PORT_PID"
  echo "Released port $PORT (pid $PORT_PID)."
  stopped=1
fi

if [ "$stopped" -eq 0 ]; then
  echo "Standalone bot is not running."
fi
