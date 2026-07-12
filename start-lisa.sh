#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.runtime/logs"
PIDS="$ROOT/.runtime/pids"
BOT_LOG="$LOGS/bot.log"
VOICE_LOG="$LOGS/voice.log"
BOT_PID="$PIDS/bot.pid"
VOICE_PID="$PIDS/voice.pid"
BOT_HOST="http://127.0.0.1:3320"
VOICE_HOST="http://127.0.0.1:3330"

mkdir -p "$LOGS" "$PIDS"
rm -f "$BOT_PID" "$VOICE_PID" "$BOT_LOG" "$VOICE_LOG"

cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo ""
    echo "[FAIL] Startup failed. Cleaning up..."
    for pf in "$BOT_PID" "$VOICE_PID"; do
      if [ -f "$pf" ]; then
        pid=$(cat "$pf" 2>/dev/null || true)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
          kill "$pid" 2>/dev/null || true
        fi
        rm -f "$pf"
      fi
    done
    echo "[FAIL] See $BOT_LOG or $VOICE_LOG for details."
  fi
  exit "$exit_code"
}
trap cleanup EXIT

echo "=== Lisa Startup ==="
echo ""

# --- Step 1: Voice sidecar ---
echo "[1/3] Starting voice sidecar..."
if lsof -ti :3330 > /dev/null 2>&1; then
  OLD_VPID=$(lsof -ti :3330 2>/dev/null || true)
  echo "  ⚠ Port 3330 is already in use (PID $OLD_VPID)."
  echo "  Run ./stop-lisa.sh first."
  exit 1
fi
if [ ! -f "$ROOT/voice-sidecar/.venv/bin/python" ]; then
  echo "  ✗ Voice sidecar venv not found."
  echo "  Run: cd voice-sidecar && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi
cd "$ROOT/voice-sidecar"
.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 3330 > "$VOICE_LOG" 2>&1 &
VOICE_PID_VAL=$!
echo "$VOICE_PID_VAL" > "$VOICE_PID"
for i in $(seq 1 15); do
  if curl -sf "$VOICE_HOST/api/health" > /dev/null 2>&1; then
    echo "  ✓ Voice sidecar is running on $VOICE_HOST (PID $VOICE_PID_VAL)"
    VOICE_OK=true
    break
  fi
  sleep 1
done
if [ "${VOICE_OK:-false}" != true ]; then
  echo "  ✗ Voice sidecar did not start within 15s. Check $VOICE_LOG"
  exit 1
fi

# --- Step 2: Port check bot ---
echo "[2/3] Checking port 3320..."
if lsof -ti :3320 > /dev/null 2>&1; then
  OLD_PID=$(lsof -ti :3320 2>/dev/null || true)
  echo "  ⚠ Port 3320 is already in use (PID $OLD_PID)."
  echo "  Run ./stop-lisa.sh first."
  exit 1
fi
echo "  ✓ Port 3320 is free"

# --- Step 3: Start bot ---
echo "[3/3] Starting Lisa bot..."
cd "$ROOT/standalone-bot"
node server.js > "$BOT_LOG" 2>&1 &
BOT_PID_VAL=$!
echo "$BOT_PID_VAL" > "$BOT_PID"

for i in $(seq 1 30); do
  if curl -sf "$BOT_HOST/api/settings" > /dev/null 2>&1; then
    echo "  ✓ Bot is running on $BOT_HOST (PID $BOT_PID_VAL)"
    BOT_OK=true
    break
  fi
  sleep 1
done

if [ "${BOT_OK:-false}" != true ]; then
  echo "  ✗ Bot did not start within 30s. Check $BOT_LOG"
  exit 1
fi

echo ""
echo "=== Startup complete ==="
echo "  Voice:  $VOICE_HOST (PID $VOICE_PID_VAL)"
echo "  Bot:    $BOT_HOST (PID $BOT_PID_VAL)"
echo "  Logs:   $LOGS/"
echo "  View:   ./logs-lisa.sh"
echo "  Stop:   ./stop-lisa.sh"
