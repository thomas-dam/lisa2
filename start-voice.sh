#!/usr/bin/env bash
# Internal: starts only the local sidecar used for ASR.
# The repository-owned TTS service is intentionally not started by this ASR-only helper.
# Normally use ./start-lisa.sh from repo root (starts all services).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.runtime/logs"
PIDS="$ROOT/.runtime/pids"
VOICE_LOG="$LOGS/voice.log"
VOICE_PID="$PIDS/voice.pid"

echo "[start-voice.sh] This script starts only the local ASR sidecar."
echo "  TTS and voice cloning live in mlx-audio-service/."
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

echo "[ASR] Checking port 3330..."
if lsof -ti :3330 > /dev/null 2>&1; then
  OLD_PID=$(lsof -ti :3330 2>/dev/null | head -n 1 || true)
  if curl -sf http://127.0.0.1:3330/api/health > /dev/null 2>&1; then
    echo "$OLD_PID" > "$VOICE_PID"
    echo "[ASR] ✓ Healthy sidecar already running on http://127.0.0.1:3330 (PID $OLD_PID)"
    exit 0
  fi
  echo "[ASR] ✗ Port 3330 is occupied by PID $OLD_PID, but it is not a healthy Lisa ASR sidecar."
  exit 1
fi

echo "[ASR] Starting local sidecar..."
cd "$ROOT/voice-sidecar"
.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 3330 > "$VOICE_LOG" 2>&1 &
VPID=$!
echo "$VPID" > "$VOICE_PID"

for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:3330/api/health > /dev/null 2>&1; then
    echo "[ASR] ✓ Sidecar running on http://127.0.0.1:3330 (PID $VPID)"
    echo "[ASR] Log: $VOICE_LOG"
    exit 0
  fi
  sleep 1
done

echo "[ASR] ✗ Sidecar did not start within 15s. Check $VOICE_LOG"
exit 1
