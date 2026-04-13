#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# idle-monitor.sh — Auto-stop pod when idle
#
# Calls /api/admin/pods/idle/check every CHECK_INTERVAL minutes.
# The server-side route checks ComfyUI queue and stops the pod if
# idle time exceeds the configured threshold (default 60 min).
#
# Usage:
#   bash scripts/idle-monitor.sh              # default: check every 5 min
#   bash scripts/idle-monitor.sh 10           # check every 10 min
#   bash scripts/idle-monitor.sh 5 http://localhost:4000  # custom app URL
#
# Run in background:
#   nohup bash scripts/idle-monitor.sh >> /tmp/idle-monitor.log 2>&1 &
#   echo $! > /tmp/idle-monitor.pid
#
# Stop:
#   kill $(cat /tmp/idle-monitor.pid) 2>/dev/null
# ─────────────────────────────────────────────────────────────────────────────
CHECK_INTERVAL="${1:-5}"    # minutes between checks
APP_URL="${2:-http://localhost:3000}"
CHECK_URL="${APP_URL}/api/admin/pods/idle/check"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "=== Idle monitor started ==="
log "  Check interval : ${CHECK_INTERVAL} min"
log "  Endpoint       : ${CHECK_URL}"
log "  PID            : $$"

while true; do
  log "Checking idle status..."
  RESULT=$(curl -sf --max-time 15 -X POST "$CHECK_URL" 2>/dev/null || echo '{"error":"request failed"}')

  ACTION=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('action','?'))" 2>/dev/null || echo "?")

  case "$ACTION" in
    "stopped")
      POD=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('podId','?'))" 2>/dev/null)
      IDLE=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('idleMinutes','?'))" 2>/dev/null)
      log "🛑 Pod ${POD} stopped after ${IDLE} min idle"
      ;;
    "none")
      REASON=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('reason','') or f\"{d.get('idleMinutes','?')}/{d.get('threshold','?')} min idle\")" 2>/dev/null || echo "")
      log "  ✓ No action — ${REASON}"
      ;;
    "?")
      log "  ⚠ Check failed: $RESULT"
      ;;
    *)
      log "  → Action: ${ACTION} — ${RESULT}"
      ;;
  esac

  sleep $((CHECK_INTERVAL * 60))
done
