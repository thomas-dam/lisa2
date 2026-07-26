#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.runtime/logs"

SHOW_LAST=0
if [ "${1:-}" = "--last" ] && [ -n "${2:-}" ]; then
  SHOW_LAST="$2"
fi

# Collect all existing log files
LOG_FILES=()
for f in "$LOGS"/*.log; do
  [ -f "$f" ] && LOG_FILES+=("$f")
done

# Check if services are running even without logs
BOT_RUNNING=false
VOICE_RUNNING=false
TTS_RUNNING=false
lsof -ti :3320 > /dev/null 2>&1 && BOT_RUNNING=true || true
lsof -ti :3330 > /dev/null 2>&1 && VOICE_RUNNING=true || true
lsof -ti :8000 > /dev/null 2>&1 && TTS_RUNNING=true || true

if [ ${#LOG_FILES[@]} -eq 0 ]; then
  echo "[logs-lisa] No log files found in $LOGS/"
  if [ "$BOT_RUNNING" = true ] || [ "$VOICE_RUNNING" = true ] || [ "$TTS_RUNNING" = true ]; then
    echo "[logs-lisa] ⚠ Services are running but NOT managed by these scripts."
    echo "[logs-lisa]    Run ./status-lisa.sh for process details."
    echo "[logs-lisa]    To fix: ./stop-lisa.sh && ./start-lisa.sh"
  else
    echo "[logs-lisa] Start Lisa first: ./start-lisa.sh"
  fi
  exit 0
fi

SERVICES=""
for f in "${LOG_FILES[@]}"; do
  SERVICES+=" $(basename "$f" .log)"
done
echo "[logs-lisa] Tailing ${#LOG_FILES[@]} log file(s):$SERVICES"
echo "[logs-lisa] Press Ctrl-C to stop"
echo ""

if [ "$SHOW_LAST" -gt 0 ]; then
  echo "=== Last $SHOW_LAST lines per file ==="
  echo ""
  for f in "${LOG_FILES[@]}"; do
    name=$(basename "$f")
    echo "--- $name ---"
    tail -"$SHOW_LAST" "$f"
    echo ""
  done
  echo "=== Now following new entries ==="
  echo ""
fi

# Prefix each log line with source tag
for f in "${LOG_FILES[@]}"; do
  name=$(basename "$f" .log)
  tag=$(echo "$name" | tr '[:lower:]' '[:upper:]')
  (tail -f "$f" 2>/dev/null | sed "s/^/[$tag] /") &
done
wait
