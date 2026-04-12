#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# update-pod-urls.sh — Update .env.local with new pod URLs and restart UI
#
# Usage:
#   bash scripts/update-pod-urls.sh <POD_ID>
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

POD_ID="${1:-}"
[[ -z "$POD_ID" ]] && echo "Usage: $0 <POD_ID>" && exit 1

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"

update_env() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i '' "s|^${k}=.*|${k}=${v}|" "$ENV_FILE"
  else
    echo "${k}=${v}" >> "$ENV_FILE"
  fi
}

echo "📝  Updating .env.local for pod $POD_ID..."
update_env "RUNPOD_POD_ID" "$POD_ID"
update_env "COMFYUI_HOST"  "https://${POD_ID}-8188.proxy.runpod.net"
update_env "TTS_HOST"      "https://${POD_ID}-5000.proxy.runpod.net"
update_env "OLLAMA_HOST"   "https://${POD_ID}-11434.proxy.runpod.net"
echo "   ✅  .env.local updated"

# Restart dev server
OLD_PID=$(lsof -ti:3000 2>/dev/null || true)
if [[ -n "$OLD_PID" ]]; then
  kill "$OLD_PID" 2>/dev/null || true; sleep 2
fi
PATH="/opt/homebrew/Cellar/node/25.8.2/bin:$PATH" \
  "$(dirname "$0")/../node_modules/.bin/next" dev --webpack > /tmp/nextjs.log 2>&1 &
echo "🔄  Dev server restarted at http://localhost:3000"
echo ""
printf "  ComfyUI:  https://%s-8188.proxy.runpod.net\n" "$POD_ID"
printf "  TTS:      https://%s-5000.proxy.runpod.net\n" "$POD_ID"
printf "  Ollama:   https://%s-11434.proxy.runpod.net\n" "$POD_ID"
