#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.runtime/logs"
PIDS="$ROOT/.runtime/pids"
BOT_PID="$PIDS/bot.pid"
OLLAMA_HOST="http://127.0.0.1:11434"
BOT_HOST="http://127.0.0.1:3320"
REQUIRED_MODEL="Lisa-The-Bot:latest"

echo "=== Lisa Status ==="
echo ""

# --- Ollama ---
echo "[Ollama]"
if curl -sf "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
  echo "  Status:  ✓ Running on $OLLAMA_HOST"
  OLLAMA_PID=$(lsof -ti :11434 2>/dev/null || echo "?")
  echo "  PID:     $OLLAMA_PID"
else
  echo "  Status:  ✗ Not reachable on $OLLAMA_HOST"
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
if [ -f "$BOT_PID" ]; then
  PID=$(cat "$BOT_PID" 2>/dev/null || true)
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "  Status:  ✓ Running (PID $PID)"
    BOT_RUNNING=true
  else
    echo "  Status:  ✗ PID file exists but process is dead (stale)"
    rm -f "$BOT_PID"
  fi
fi

if [ "$BOT_RUNNING" = false ]; then
  PORT_PID=$(lsof -ti :3320 2>/dev/null || true)
  if [ -n "$PORT_PID" ]; then
    echo "  Status:  ⚠ Port 3320 occupied by PID $PORT_PID (not managed by these scripts)"
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

# --- Port ---
echo ""
echo "[Port 3320]"
if lsof -ti :3320 > /dev/null 2>&1; then
  echo "  Occupied: Yes"
  lsof -i :3320 2>/dev/null | head -2 | tail -1 | awk '{print "  Process:  " $1 " (PID " $2 ")"}'
else
  echo "  Occupied: No (free)"
fi

# --- Logs ---
echo ""
echo "[Log Files]"
LOG_DIR="$LOGS"
if [ -d "$LOG_DIR" ]; then
  found=false
  for f in "$LOG_DIR"/*.log; do
    if [ -f "$f" ]; then
      name=$(basename "$f")
      lines=$(wc -l < "$f")
      size=$(du -h "$f" | cut -f1)
      modified=$(date -r "$f" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || stat -f "%Sm" "$f" 2>/dev/null || echo "?")
      echo "  $name  ($lines lines, $size, last: $modified)"
      found=true
    fi
  done
  if [ "$found" = false ]; then
    echo "  (no log files yet)"
  fi
  echo "  Directory: $LOG_DIR/"
else
  echo "  (no log directory)"
fi