#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3320}"
LOG_FILE="${LOG_FILE:-server.log}"
PID_FILE="${PID_FILE:-.server.pid}"
URL="http://$HOST:$PORT/api/settings"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Standalone bot already running at http://$HOST:$PORT"
  exit 0
fi

HOST="$HOST" PORT="$PORT" nohup node server.js >"$LOG_FILE" 2>&1 &
echo "$!" >"$PID_FILE"

i=0
while [ "$i" -lt 30 ]; do
  if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "Standalone bot failed to start. See $LOG_FILE."
    exit 1
  fi

  if command -v curl >/dev/null 2>&1 && curl --silent --fail "$URL" >/dev/null 2>&1; then
    echo "Standalone bot started at http://$HOST:$PORT"
    echo "Log: $LOG_FILE"
    exit 0
  fi

  i=$((i + 1))
  sleep 0.2
done

rm -f "$PID_FILE"
echo "Standalone bot did not become reachable at http://$HOST:$PORT. See $LOG_FILE."
exit 1
