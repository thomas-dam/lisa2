#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.runtime/logs"
PIDS="$ROOT/.runtime/pids"
BOT_LOG="$LOGS/bot.log"
VOICE_LOG="$LOGS/voice.log"
DIAG_LOG="$LOGS/diagnostics.log"
TUNNEL_LOG="$LOGS/tunnel.log"
BOT_PID="$PIDS/bot.pid"
OLLAMA_HOST="http://127.0.0.1:11434"
BOT_HOST="http://127.0.0.1:3320"
REQUIRED_MODEL="Lisa-The-Bot:latest"

mkdir -p "$LOGS" "$PIDS"
rm -f "$BOT_PID" "$BOT_LOG"

cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo ""
    echo "[FAIL] Startup failed. Cleaning up..."
    if [ -f "$BOT_PID" ]; then
      local pid
      pid=$(cat "$BOT_PID" 2>/dev/null || true)
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi
      rm -f "$BOT_PID"
    fi
    echo "[FAIL] See $BOT_LOG for details."
  fi
  exit "$exit_code"
}
trap cleanup EXIT

echo "=== Lisa Startup ==="
echo ""

# --- Step 1: Ollama check ---
echo "[1/4] Checking Ollama..."
if curl -sf "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
  echo "  ✓ Ollama is running on $OLLAMA_HOST"
else
  echo "  ⚠ Ollama is not running. Attempting to start..."
  if command -v ollama > /dev/null 2>&1; then
    ollama serve > /dev/null 2>&1 &
    echo "  Starting Ollama..."
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
    echo "    Install from https://ollama.com or start it manually."
    exit 1
  fi
fi

# --- Step 2: Model check ---
echo "[2/4] Checking model $REQUIRED_MODEL..."
if curl -sf "$OLLAMA_HOST/api/tags" | grep -q "$REQUIRED_MODEL"; then
  echo "  ✓ Model $REQUIRED_MODEL is available"
else
  echo "  ⚠ Model $REQUIRED_MODEL not found."
  curl -sf "$OLLAMA_HOST/api/tags" | python3 -c "
import sys,json
data = json.load(sys.stdin)
for m in data.get('models', []):
  print(f'    - {m[\"name\"]}')
" 2>/dev/null || true
  echo ""
  echo "  To create $REQUIRED_MODEL, run from standalone-bot/:"
  echo "    ollama create $REQUIRED_MODEL -f Modelfile"
  exit 1
fi

# --- Step 3: Port check ---
echo "[3/4] Checking port 3320..."
if lsof -ti :3320 > /dev/null 2>&1; then
  OLD_PID=$(lsof -ti :3320 2>/dev/null || true)
  echo "  ⚠ Port 3320 is already in use (PID $OLD_PID)."
  echo "  Run ./stop-lisa.sh first, or kill -9 $OLD_PID"
  exit 1
fi
echo "  ✓ Port 3320 is free"

# --- Step 4: Start bot ---
echo "[4/4] Starting standalone bot..."
cd "$ROOT/standalone-bot"
node server.js > "$BOT_LOG" 2>&1 &
BOT_PID_VAL=$!
echo "$BOT_PID_VAL" > "$BOT_PID"

for i in $(seq 1 30); do
  if curl -sf "$BOT_HOST/api/config" > /dev/null 2>&1; then
    echo "  ✓ Bot is running on $BOT_HOST (PID $BOT_PID_VAL)"
    echo ""
    echo "=== Startup complete ==="
    echo "  Ollama: $OLLAMA_HOST"
    echo "  Bot:    $BOT_HOST (PID $BOT_PID_VAL)"
    echo "  Logs:   $LOGS/"
    echo "  View:   ./logs-lisa.sh"
    echo "  Stop:   ./stop-lisa.sh"
    exit 0
  fi
  sleep 1
done

echo "  ✗ Bot did not start within 30s. Check $BOT_LOG"
exit 1