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

if [ ${#LOG_FILES[@]} -eq 0 ]; then
  echo "[logs-lisa] No log files found in $LOGS/"
  echo "[logs-lisa] Start Lisa first: ./start-lisa.sh"
  exit 0
fi

echo "[logs-lisa] Tailing ${#LOG_FILES[@]} log files in $LOGS/"
echo "[logs-lisa] Press Ctrl-C to stop"
echo ""

# Show recent history for each log
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

# Build tail command
TAIL_ARGS=()
for f in "${LOG_FILES[@]}"; do
  TAIL_ARGS+=("--follow" "--retry" "--verbose" "$f")
done

# Run tail, prefixing each line with the log source name
"${TAIL_ARGS[@]}" 2>/dev/null || tail -f "${LOG_FILES[@]}" 2>/dev/null || {
  # Fallback: prefix each file's output with its name
  for f in "${LOG_FILES[@]}"; do
    name=$(basename "$f" .log | tr '[:lower:]' '[:upper:]')
    (tail -f "$f" 2>/dev/null | sed "s/^/[$name] /") &
  done
  wait
}