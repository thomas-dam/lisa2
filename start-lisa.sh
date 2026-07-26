#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.runtime/logs"
PIDS="$ROOT/.runtime/pids"
BOT_LOG="$LOGS/bot.log"
VOICE_LOG="$LOGS/voice.log"
TTS_LOG="$LOGS/tts.log"
BOT_PID="$PIDS/bot.pid"
VOICE_PID="$PIDS/voice.pid"
TTS_PID="$PIDS/tts.pid"
BOT_HOST="http://127.0.0.1:3320"
VOICE_HOST="http://127.0.0.1:3330"
TTS_HOST="http://127.0.0.1:8000"
TTS_ROOT="$ROOT/mlx-audio-service"

mkdir -p "$LOGS" "$PIDS"
BOT_STARTED=false
VOICE_STARTED=false
TTS_STARTED=false

cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    if [ "$BOT_STARTED" = true ] || [ "$VOICE_STARTED" = true ] || [ "$TTS_STARTED" = true ]; then
      echo ""
      echo "[FAIL] Startup failed. Cleaning up processes started by this command..."
    fi
    if [ "$BOT_STARTED" = true ]; then
      if [ -n "${BOT_PID_VAL:-}" ] && kill -0 "$BOT_PID_VAL" 2>/dev/null; then
        kill "$BOT_PID_VAL" 2>/dev/null || true
      fi
      rm -f "$BOT_PID"
    fi
    if [ "$VOICE_STARTED" = true ]; then
      if [ -n "${VOICE_PID_VAL:-}" ] && kill -0 "$VOICE_PID_VAL" 2>/dev/null; then
        kill "$VOICE_PID_VAL" 2>/dev/null || true
      fi
      rm -f "$VOICE_PID"
    fi
    if [ "$TTS_STARTED" = true ]; then
      if [ -n "${TTS_PID_VAL:-}" ] && kill -0 "$TTS_PID_VAL" 2>/dev/null; then
        kill "$TTS_PID_VAL" 2>/dev/null || true
      fi
      rm -f "$TTS_PID"
    fi
    if [ "$BOT_STARTED" = true ] || [ "$VOICE_STARTED" = true ] || [ "$TTS_STARTED" = true ]; then
      echo "[FAIL] See $BOT_LOG, $VOICE_LOG, or $TTS_LOG for details."
    fi
  fi
  exit "$exit_code"
}
trap cleanup EXIT

echo "=== Lisa Startup ==="
echo ""

if ! lsof -ti :8000 > /dev/null 2>&1; then
  if [ ! -f "$TTS_ROOT/server.py" ] || [ ! -x "$TTS_ROOT/.venv/bin/python" ]; then
    echo "[FAIL] MLX Audio virtual environment not found at $TTS_ROOT/.venv"
    echo "       Follow docs/local-deployment.md before starting Lisa."
    exit 1
  fi
  TTS_VOICE=$(node -e 'const c=require(process.argv[1]); process.stdout.write(c.tts?.voice || "rose")' "$ROOT/config/voice.json")
  if [ ! -f "$TTS_ROOT/voices/$TTS_VOICE/transcript.txt" ]; then
    echo "[FAIL] MLX Audio voice '$TTS_VOICE' is not installed under $TTS_ROOT/voices/"
    echo "       Save that voice in the MLX Audio GUI before starting Lisa."
    exit 1
  fi
fi

# --- Step 1: Local ASR sidecar ---
echo "[1/4] Starting local ASR sidecar..."
VOICE_OK=false
if [ -f "$VOICE_PID" ]; then
  VOICE_PID_VAL=$(cat "$VOICE_PID" 2>/dev/null || true)
  if [ -n "$VOICE_PID_VAL" ] && kill -0 "$VOICE_PID_VAL" 2>/dev/null; then
    if curl -sf "$VOICE_HOST/api/health" > /dev/null 2>&1; then
      echo "  ✓ Local ASR sidecar is already running on $VOICE_HOST (PID $VOICE_PID_VAL)"
      VOICE_OK=true
    else
      echo "  ✗ Managed ASR process $VOICE_PID_VAL is running but its health endpoint is not responding."
      exit 1
    fi
  else
    echo "  - Removing stale ASR PID file"
    rm -f "$VOICE_PID"
  fi
fi

if [ "$VOICE_OK" = false ]; then
  OLD_VPID=$(lsof -ti :3330 2>/dev/null | head -n 1 || true)
  if [ -n "$OLD_VPID" ]; then
    if curl -sf "$VOICE_HOST/api/health" > /dev/null 2>&1; then
      VOICE_PID_VAL="$OLD_VPID"
      echo "$VOICE_PID_VAL" > "$VOICE_PID"
      echo "  ✓ Adopted healthy local ASR sidecar on $VOICE_HOST (PID $VOICE_PID_VAL)"
      VOICE_OK=true
    else
      echo "  ✗ Port 3330 is occupied by PID $OLD_VPID, but it is not a healthy Lisa ASR sidecar."
      exit 1
    fi
  fi
fi

if [ "$VOICE_OK" = false ]; then
  if [ ! -f "$ROOT/voice-sidecar/.venv/bin/python" ]; then
    echo "  ✗ Local ASR sidecar venv not found."
    echo "  Run: cd voice-sidecar && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
    exit 1
  fi
  cd "$ROOT/voice-sidecar"
  .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 3330 > "$VOICE_LOG" 2>&1 &
  VOICE_PID_VAL=$!
  VOICE_STARTED=true
  echo "$VOICE_PID_VAL" > "$VOICE_PID"
  for i in $(seq 1 15); do
    if curl -sf "$VOICE_HOST/api/health" > /dev/null 2>&1; then
      echo "  ✓ Local ASR sidecar started on $VOICE_HOST (PID $VOICE_PID_VAL)"
      VOICE_OK=true
      break
    fi
    sleep 1
  done
  if [ "$VOICE_OK" != true ]; then
    echo "  ✗ Local ASR sidecar did not start within 15s. Check $VOICE_LOG"
    exit 1
  fi
fi

# --- Step 2: MLX Audio TTS ---
echo "[2/4] Starting MLX Audio TTS..."
TTS_OK=false
if [ -f "$TTS_PID" ]; then
  TTS_PID_VAL=$(cat "$TTS_PID" 2>/dev/null || true)
  if [ -n "$TTS_PID_VAL" ] && kill -0 "$TTS_PID_VAL" 2>/dev/null; then
    if curl -sf "$TTS_HOST/health" > /dev/null 2>&1; then
      echo "  ✓ MLX Audio TTS is already running on $TTS_HOST (PID $TTS_PID_VAL)"
      TTS_OK=true
    else
      echo "  ✗ Managed TTS process $TTS_PID_VAL is running but its API is not responding."
      exit 1
    fi
  else
    echo "  - Removing stale TTS PID file"
    rm -f "$TTS_PID"
  fi
fi

if [ "$TTS_OK" = false ]; then
  OLD_TTS_PID=$(lsof -ti :8000 2>/dev/null | head -n 1 || true)
  if [ -n "$OLD_TTS_PID" ]; then
    if curl -sf "$TTS_HOST/health" > /dev/null 2>&1; then
      TTS_PID_VAL="$OLD_TTS_PID"
      echo "$TTS_PID_VAL" > "$TTS_PID"
      echo "  ✓ Adopted healthy MLX Audio TTS on $TTS_HOST (PID $TTS_PID_VAL)"
      TTS_OK=true
    else
      echo "  ✗ Port 8000 is occupied by PID $OLD_TTS_PID, but it is not a healthy FastAPI service."
      exit 1
    fi
  fi
fi

if [ "$TTS_OK" = false ]; then
  if [ ! -f "$TTS_ROOT/server.py" ] || [ ! -x "$TTS_ROOT/.venv/bin/python" ]; then
    echo "  ✗ MLX Audio virtual environment not found at $TTS_ROOT/.venv"
    exit 1
  fi
  cd "$TTS_ROOT"
  .venv/bin/python server.py > "$TTS_LOG" 2>&1 &
  TTS_PID_VAL=$!
  TTS_STARTED=true
  echo "$TTS_PID_VAL" > "$TTS_PID"
  for i in $(seq 1 120); do
    if curl -sf "$TTS_HOST/health" > /dev/null 2>&1; then
      echo "  ✓ MLX Audio TTS started on $TTS_HOST (PID $TTS_PID_VAL)"
      TTS_OK=true
      break
    fi
    if ! kill -0 "$TTS_PID_VAL" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  if [ "$TTS_OK" != true ]; then
    echo "  ✗ MLX Audio TTS did not start within 120s. Check $TTS_LOG"
    exit 1
  fi
fi

# --- Step 3: Port check bot ---
echo "[3/4] Checking port 3320..."
BOT_OK=false
if [ -f "$BOT_PID" ]; then
  BOT_PID_VAL=$(cat "$BOT_PID" 2>/dev/null || true)
  if [ -n "$BOT_PID_VAL" ] && kill -0 "$BOT_PID_VAL" 2>/dev/null; then
    if curl -sf "$BOT_HOST/api/settings" > /dev/null 2>&1; then
      echo "  ✓ Lisa bot is already running on $BOT_HOST (PID $BOT_PID_VAL)"
      BOT_OK=true
    else
      echo "  ✗ Managed bot process $BOT_PID_VAL is running but its API is not responding."
      exit 1
    fi
  else
    echo "  - Removing stale bot PID file"
    rm -f "$BOT_PID"
  fi
fi

if [ "$BOT_OK" = false ]; then
  OLD_PID=$(lsof -ti :3320 2>/dev/null | head -n 1 || true)
  if [ -n "$OLD_PID" ]; then
    if curl -sf "$BOT_HOST/api/settings" > /dev/null 2>&1; then
      BOT_PID_VAL="$OLD_PID"
      echo "$BOT_PID_VAL" > "$BOT_PID"
      echo "  ✓ Adopted healthy Lisa bot on $BOT_HOST (PID $BOT_PID_VAL)"
      BOT_OK=true
    else
      echo "  ✗ Port 3320 is occupied by PID $OLD_PID, but it is not a healthy Lisa bot."
      exit 1
    fi
  else
    echo "  ✓ Port 3320 is free"
  fi
fi

# --- Step 4: Start bot ---
if [ "$BOT_OK" = true ]; then
  echo "[4/4] Lisa bot is ready; no restart needed."
else
  echo "[4/4] Starting Lisa bot..."
  cd "$ROOT/standalone-bot"
  node server.js > "$BOT_LOG" 2>&1 &
  BOT_PID_VAL=$!
  BOT_STARTED=true
  echo "$BOT_PID_VAL" > "$BOT_PID"

  for i in $(seq 1 30); do
    if curl -sf "$BOT_HOST/api/settings" > /dev/null 2>&1; then
      echo "  ✓ Bot started on $BOT_HOST (PID $BOT_PID_VAL)"
      BOT_OK=true
      break
    fi
    sleep 1
  done

  if [ "$BOT_OK" != true ]; then
    echo "  ✗ Bot did not start within 30s. Check $BOT_LOG"
    exit 1
  fi
fi

echo ""
echo "=== Startup complete ==="
echo "  ASR:    $VOICE_HOST (PID $VOICE_PID_VAL, managed here)"
echo "  TTS:    $TTS_HOST (PID $TTS_PID_VAL, MLX Audio)"
echo "  Bot:    $BOT_HOST (PID $BOT_PID_VAL)"
echo "  Logs:   $LOGS/"
echo "  View:   ./logs-lisa.sh"
echo "  Stop:   ./stop-lisa.sh"
