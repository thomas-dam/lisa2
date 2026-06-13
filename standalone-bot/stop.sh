#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

PID_FILE="${PID_FILE:-.server.pid}"

if [ ! -f "$PID_FILE" ]; then
  echo "Standalone bot is not running."
  exit 0
fi

PID="$(cat "$PID_FILE")"

if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "Stopped standalone bot."
else
  echo "Stale PID file removed."
fi

rm -f "$PID_FILE"
