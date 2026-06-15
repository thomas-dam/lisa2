#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.runtime/logs"
PIDS="$ROOT/.runtime/pids"
BOT_PID="$PIDS/bot.pid"
VOICE_PID="$PIDS/voice.pid"
OLLAMA_PID="$PIDS/ollama.pid"
OLLAMA_HOST="http://127.0.0.1:11434"
BOT_HOST="http://127.0.0.1:3320"
REQUIRED_MODEL="Lisa-The-Bot:latest"

echo "=== Lisa Status ==="
echo ""

# --- Ollama ---
echo "[Ollama]"
OLLAMA_MANAGED=false
if [ -f "$OLLAMA_PID" ]; then
  OPID=$(cat "$OLLAMA_PID" 2>/dev/null || true)
  if [ -n "$OPID" ] && kill -0 "$OPID" 2>/dev/null; then
    echo "  Status:  ✓ Running (PID $OPID, managed)"
    OLLAMA_MANAGED=true
  else
    echo "  Status:  ✗ PID file exists but process is dead (stale)"
    rm -f "$OLLAMA_PID"
  fi
fi
if [ "$OLLAMA_MANAGED" = false ]; then
  if curl -sf "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
    OLLAMA_PID=$(lsof -ti :11434 2>/dev/null || echo "?")
    echo "  Status:  ✓ Running on $OLLAMA_HOST (PID $OLLAMA_PID)"
  else
    echo "  Status:  ✗ Not reachable on $OLLAMA_HOST"
  fi
fi

# --- Model ---
echo ""
echo "[Model]"
if curl -sf "$OLLAMA_HOST/api/tags" | grep -q "$REQUIRED_MODEL"; then
  echo "  $REQUIRED_MODEL: ✓ Installed"
else
  echo "  $REQUIRED_MODEL: ✗ Not found"
fi

# --- Bot ---
echo ""
echo "[Bot]"
BOT_RUNNING=false
BOT_MANAGED=false
if [ -f "$BOT_PID" ]; then
  PID=$(cat "$BOT_PID" 2>/dev/null || true)
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "  Status:  ✓ Running (PID $PID, managed)"
    BOT_RUNNING=true
    BOT_MANAGED=true
  else
    echo "  Status:  ✗ PID file exists but process is dead (stale)"
    rm -f "$BOT_PID"
  fi
fi
if [ "$BOT_RUNNING" = false ]; then
  PORT_PID=$(lsof -ti :3320 2>/dev/null || true)
  if [ -n "$PORT_PID" ]; then
    CMD=$(ps -p "$PORT_PID" -o comm= 2>/dev/null || echo "?")
    echo "  Status:  ⚠ UNMANAGED PROCESS (PID $PORT_PID, $CMD) — restart with ./start-lisa.sh"
    BOT_RUNNING=true
  else
    echo "  Status:  ✗ Not running"
  fi
fi
if curl -sf "$BOT_HOST/api/config" > /dev/null 2>&1; then
  echo "  API:     ✓ Responding on $BOT_HOST"
else
  echo "  API:     ✗ Not responding"
fi

# --- Voice Sidecar ---
echo ""
echo "[Voice Sidecar]"
VOICE_RUNNING=false
VOICE_MANAGED=false
if [ -f "$VOICE_PID" ]; then
  VPID=$(cat "$VOICE_PID" 2>/dev/null || true)
  if [ -n "$VPID" ] && kill -0 "$VPID" 2>/dev/null; then
    echo "  Status:  ✓ Running (PID $VPID, managed)"
    VOICE_RUNNING=true
    VOICE_MANAGED=true
  else
    echo "  Status:  ✗ PID file exists but process is dead (stale)"
    rm -f "$VOICE_PID"
  fi
fi
if [ "$VOICE_RUNNING" = false ]; then
  VPORT_PID=$(lsof -ti :3330 2>/dev/null || true)
  if [ -n "$VPORT_PID" ]; then
    CMD=$(ps -p "$VPORT_PID" -o comm= 2>/dev/null || echo "?")
    echo "  Status:  ⚠ UNMANAGED PROCESS (PID $VPORT_PID, $CMD) — restart with ./start-lisa.sh"
    VOICE_RUNNING=true
  else
    echo "  Status:  ✗ Not running"
  fi
fi
if [ "$VOICE_RUNNING" = true ]; then
  if curl -sf http://127.0.0.1:3330/api/health > /dev/null 2>&1; then
    echo "  Health:  ✓ Responding"
  else
    echo "  Health:  ✗ Not responding"
  fi
fi

# --- Log Files ---
echo ""
echo "[Log Files]"
if [ -d "$LOGS" ]; then
  found=false
  for f in "$LOGS"/*.log; do
    if [ -f "$f" ]; then
      name=$(basename "$f")
      lines=$(wc -l < "$f")
      size=$(du -h "$f" | cut -f1)
      modified=$(date -r "$f" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || stat -f "%Sm" "$f" 2>/dev/null || echo "?")
      managed=""
      if [ "$name" = "bot.log" ] && [ "$BOT_MANAGED" = true ]; then managed=" (managed)"; fi
      if [ "$name" = "voice.log" ] && [ "$VOICE_MANAGED" = true ]; then managed=" (managed)"; fi
      echo "  $name  ($lines lines, $size, last: $modified)$managed"
      found=true
    fi
  done
  if [ "$found" = false ]; then
    if [ "$BOT_RUNNING" = true ] || [ "$VOICE_RUNNING" = true ]; then
      echo "  (no log files — services are running but were started outside these scripts)"
      echo "  Use ./start-lisa.sh for managed startup with logs"
    else
      echo "  (no services running)"
    fi
  fi
  echo "  Directory: $LOGS/"
else
  echo "  (no log directory)"
fi