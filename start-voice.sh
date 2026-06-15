#!/usr/bin/env bash
# Internal: starts only the voice sidecar.
# Normally use ./start-lisa.sh from repo root (starts all services).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.runtime/logs"
PIDS="$ROOT/.runtime/pids"
VOICE_LOG="$LOGS/voice.log"
VOICE_PID="$PIDS/voice.pid"

echo "[start-voice.sh] This script is for internal use only."
echo "  Normally use ./start-lisa.sh from repo root."
echo ""

mkdir -p "$LOGS" "$PIDS"

cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    if [ -f "$VOICE_PID" ]; then
      pid=$(cat "$VOICE_PID" 2>/dev/null || true)
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi
      rm -f "$VOICE_PID"
    fi
  fi
  exit "$exit_code"
}
trap cleanup EXIT

echo "[VOICE] Checking port 3330..."
if lsof -ti :3330 > /dev/null 2>&1; then
  OLD_PID=$(lsof -ti :3330 2>/dev/null || true)
  echo "[VOICE] ⚠ Port 3330 is already in use (PID $OLD_PID)."
  echo "  Run ./stop-lisa.sh first, or kill -9 $OLD_PID"
  exit 1
fi

echo "[VOICE] Starting sidecar..."
cd "$ROOT/voice-sidecar"
.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 3330 > "$VOICE_LOG" 2>&1 &
VPID=$!
echo "$VPID" > "$VOICE_PID"

for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:3330/api/health > /dev/null 2>&1; then
    echo "[VOICE] ✓ Sidecar running on http://127.0.0.1:3330 (PID $VPID)"
    echo "[VOICE] Log: $VOICE_LOG"
    exit 0
  fi
  sleep 1
done

echo "[VOICE] ✗ Sidecar did not start within 15s. Check $VOICE_LOG"
exit 1