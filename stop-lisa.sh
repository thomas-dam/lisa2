#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDS="$ROOT/.runtime/pids"
BOT_PID="$PIDS/bot.pid"
VOICE_PID="$PIDS/voice.pid"
TTS_PID="$PIDS/tts.pid"

echo "=== Lisa Shutdown ==="
echo ""

# --- Stop bot ---
echo "[1/3] Stopping Lisa bot..."
BOT_STOPPED=false

if [ -f "$BOT_PID" ]; then
  PID=$(cat "$BOT_PID" 2>/dev/null || true)
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    sleep 1
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null || true
    fi
    echo "  ✓ Bot (PID $PID) stopped"
    BOT_STOPPED=true
  else
    echo "  - PID file exists but process not running (stale)"
  fi
  rm -f "$BOT_PID"
else
  PORT_PID=$(lsof -ti :3320 2>/dev/null || true)
  if [ -n "$PORT_PID" ]; then
    kill "$PORT_PID" 2>/dev/null || true
    sleep 1
    if lsof -ti :3320 > /dev/null 2>&1; then
      kill -9 "$PORT_PID" 2>/dev/null || true
    fi
    echo "  ✓ Bot on port 3320 (PID $PORT_PID) stopped"
    BOT_STOPPED=true
  else
    echo "  - Bot is not running"
  fi
fi

# --- Stop voice sidecar ---
echo "[2/3] Stopping ASR sidecar..."
VOICE_STOPPED=false
if [ -f "$VOICE_PID" ]; then
  VPID=$(cat "$VOICE_PID" 2>/dev/null || true)
  if [ -n "$VPID" ] && kill -0 "$VPID" 2>/dev/null; then
    kill "$VPID" 2>/dev/null || true
    sleep 1
    if kill -0 "$VPID" 2>/dev/null; then
      kill -9 "$VPID" 2>/dev/null || true
    fi
    echo "  ✓ Voice sidecar (PID $VPID) stopped"
    VOICE_STOPPED=true
  else
    echo "  - Voice PID file exists but process not running (stale)"
  fi
  rm -f "$VOICE_PID"
else
  VPORT_PID=$(lsof -ti :3330 2>/dev/null || true)
  if [ -n "$VPORT_PID" ]; then
    kill "$VPORT_PID" 2>/dev/null || true
    sleep 1
    if lsof -ti :3330 > /dev/null 2>&1; then
      kill -9 "$VPORT_PID" 2>/dev/null || true
    fi
    echo "  ✓ Voice sidecar on port 3330 stopped"
    VOICE_STOPPED=true
  else
    echo "  - Voice sidecar is not running"
  fi
fi

# --- Stop MLX Audio TTS ---
echo "[3/3] Stopping MLX Audio TTS..."
if [ -f "$TTS_PID" ]; then
  TPID=$(cat "$TTS_PID" 2>/dev/null || true)
  if [ -n "$TPID" ] && kill -0 "$TPID" 2>/dev/null; then
    kill "$TPID" 2>/dev/null || true
    sleep 1
    if kill -0 "$TPID" 2>/dev/null; then
      kill -9 "$TPID" 2>/dev/null || true
    fi
    echo "  ✓ MLX Audio TTS (PID $TPID) stopped"
  else
    echo "  - TTS PID file exists but process not running (stale)"
  fi
  rm -f "$TTS_PID"
else
  TPORT_PID=$(lsof -ti :8000 2>/dev/null || true)
  if [ -n "$TPORT_PID" ]; then
    kill "$TPORT_PID" 2>/dev/null || true
    sleep 1
    if lsof -ti :8000 > /dev/null 2>&1; then
      kill -9 "$TPORT_PID" 2>/dev/null || true
    fi
    echo "  ✓ TTS service on port 8000 stopped"
  else
    echo "  - MLX Audio TTS is not running"
  fi
fi

# --- Verify ports free ---
echo ""
echo "=== Port status ==="
for port in 3320 3330 8000; do
  if lsof -ti :$port > /dev/null 2>&1; then
    echo "  ⚠ Port $port is still occupied"
    lsof -i :$port 2>/dev/null | head -2
  else
    echo "  ✓ Port $port is free"
  fi
done

# --- Clean stale files ---
rm -f "$PIDS"/*.pid 2>/dev/null || true

echo ""
if [ "$BOT_STOPPED" = true ]; then
  echo "=== Shutdown complete ==="
else
  echo "=== Shutdown complete (bot was not running) ==="
fi
