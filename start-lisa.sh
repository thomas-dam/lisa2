#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.runtime/logs"
PIDS="$ROOT/.runtime/pids"
BOT_LOG="$LOGS/bot.log"
VOICE_LOG="$LOGS/voice.log"
BOT_PID="$PIDS/bot.pid"
VOICE_PID="$PIDS/voice.pid"
OLLAMA_PID="$PIDS/ollama.pid"
OLLAMA_HOST="http://127.0.0.1:11434"
BOT_HOST="http://127.0.0.1:3320"
VOICE_HOST="http://127.0.0.1:3330"
REQUIRED_MODEL="Lisa-The-Bot:latest"

mkdir -p "$LOGS" "$PIDS"
rm -f "$BOT_PID" "$VOICE_PID" "$BOT_LOG" "$VOICE_LOG"

cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo ""
    echo "[FAIL] Startup failed. Cleaning up..."
    for pf in "$BOT_PID" "$VOICE_PID" "$OLLAMA_PID"; do
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

# --- Step 1: Ollama check ---
echo "[1/5] Checking Ollama..."
if curl -sf "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
  echo "  ✓ Ollama is running on $OLLAMA_HOST"
else
  echo "  ⚠ Ollama is not running. Attempting to start..."
  if command -v ollama > /dev/null 2>&1; then
    ollama serve > /dev/null 2>&1 &
    OLLAMA_SERVE_PID=$!
    echo "$OLLAMA_SERVE_PID" > "$OLLAMA_PID"
    echo "  Starting Ollama (PID $OLLAMA_SERVE_PID)..."
    for i in $(seq 1 30); do
      if curl -sf "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
        echo "  ✓ Ollama started"
        break
      fi
      sleep 1
    done
    if ! curl -sf "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
      echo "  ✗ Could not start Ollama. Start it manually: ollama serve"
      exit 1
    fi
  else
    echo "  ✗ Ollama is not installed or not in PATH."
    exit 1
  fi
fi

# --- Step 2: Model check ---
echo "[2/5] Checking model $REQUIRED_MODEL..."
if curl -sf "$OLLAMA_HOST/api/tags" | grep -q "$REQUIRED_MODEL"; then
  echo "  ✓ Model $REQUIRED_MODEL is available"
else
  echo "  ✗ Model $REQUIRED_MODEL not found."
  echo "  Run from standalone-bot/: ollama create $REQUIRED_MODEL -f Modelfile"
  exit 1
fi

# --- Step 3: Voice sidecar ---
echo "[3/5] Starting voice sidecar..."
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

# --- Step 4: Port check bot ---
echo "[4/5] Checking port 3320..."
if lsof -ti :3320 > /dev/null 2>&1; then
  OLD_PID=$(lsof -ti :3320 2>/dev/null || true)
  echo "  ⚠ Port 3320 is already in use (PID $OLD_PID)."
  echo "  Run ./stop-lisa.sh first."
  exit 1
fi
echo "  ✓ Port 3320 is free"

# --- Step 5: Start bot ---
echo "[5/5] Starting standalone bot..."
cd "$ROOT/standalone-bot"
node server.js > "$BOT_LOG" 2>&1 &
BOT_PID_VAL=$!
echo "$BOT_PID_VAL" > "$BOT_PID"

for i in $(seq 1 30); do
  if curl -sf "$BOT_HOST/api/config" > /dev/null 2>&1; then
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
echo "  Ollama: $OLLAMA_HOST"
echo "  Voice:  $VOICE_HOST (PID $VOICE_PID_VAL)"
echo "  Bot:    $BOT_HOST (PID $BOT_PID_VAL)"
echo "  Logs:   $LOGS/"
echo "  View:   ./logs-lisa.sh"
echo "  Stop:   ./stop-lisa.sh"