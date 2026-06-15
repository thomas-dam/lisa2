#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDS="$ROOT/.runtime/pids"
BOT_PID="$PIDS/bot.pid"
VOICE_PID="$PIDS/voice.pid"

STOP_OLLAMA=false
for arg in "$@"; do
  if [ "$arg" = "--with-ollama" ]; then
    STOP_OLLAMA=true
  fi
done

echo "=== Lisa Shutdown ==="
echo ""

# --- Stop bot ---
echo "[1/3] Stopping standalone bot..."
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
echo "[2/3] Stopping voice sidecar..."
if [ -f "$VOICE_PID" ]; then
  VPID=$(cat "$VOICE_PID" 2>/dev/null || true)
  if [ -n "$VPID" ] && kill -0 "$VPID" 2>/dev/null; then
    kill "$VPID" 2>/dev/null || true
    echo "  ✓ Voice sidecar (PID $VPID) stopped"
  else
    echo "  - Voice PID file exists but process not running (stale)"
  fi
  rm -f "$VOICE_PID"
else
  VPORT_PID=$(lsof -ti :3330 2>/dev/null || true)
  if [ -n "$VPORT_PID" ]; then
    kill "$VPORT_PID" 2>/dev/null || true
    echo "  ✓ Voice sidecar on port 3330 stopped"
  else
    echo "  - Voice sidecar is not running"
  fi
fi

# --- Stop Ollama (opt-in) ---
echo "[3/3] Checking remaining services..."
if [ "$STOP_OLLAMA" = true ]; then
  OLLAMA_PIDS=$(lsof -ti :11434 2>/dev/null || true)
  if [ -n "$OLLAMA_PIDS" ]; then
    for OPID in $OLLAMA_PIDS; do
      kill "$OPID" 2>/dev/null || true
    done
    echo "  ✓ Ollama stopped"
  else
    echo "  - Ollama is not running"
  fi
else
  if lsof -ti :11434 > /dev/null 2>&1; then
    echo "  - Ollama is still running (pass --with-ollama to stop it)"
  else
    echo "  - Ollama is not running"
  fi
fi

# --- Verify ports free ---
echo ""
echo "=== Port status ==="
for port in 3320 3330; do
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