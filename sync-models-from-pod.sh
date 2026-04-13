#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# sync-models-from-pod.sh — Copy models from RunPod pod to local host ./models/
#
# Avoids re-downloading ~30GB of models — syncs from the pod instead.
# Models land in ./models/ (bind-mounted into Docker at /models).
# Models survive container crashes/rebuilds since they live on host filesystem.
#
# Usage:
#   bash sync-models-from-pod.sh
#
# Requires: RunPod pod must be RUNNING (SSH accessible)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")" && pwd)/treasure-island-ui/.env.local"
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

RUNPOD_API_KEY="${RUNPOD_API_KEY:-}"
RUNPOD_POD_ID="${RUNPOD_POD_ID:-}"

[[ -z "$RUNPOD_API_KEY" ]] && echo "❌  RUNPOD_API_KEY not set" && exit 1
[[ -z "$RUNPOD_POD_ID" ]] && echo "❌  RUNPOD_POD_ID not set" && exit 1

green="\033[32m"; reset="\033[0m"
log() { echo -e "${green}▶${reset} $*"; }

# ── Get SSH connection info from RunPod API ───────────────────────────────────
log "Getting SSH info for pod $RUNPOD_POD_ID..."
POD_JSON=$(curl -sf -X POST \
  "https://api.runpod.io/graphql?api_key=${RUNPOD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"query{pod(input:{podId:\\\"${RUNPOD_POD_ID}\\\"}){runtime{ports{ip privatePort publicPort type}}}}\"}")

SSH_IP=$(echo "$POD_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ports=d['data']['pod']['runtime']['ports']
p=[x for x in ports if x['privatePort']==22 and x['type']=='tcp']
print(p[0]['ip'] if p else '')
" 2>/dev/null)

SSH_PORT=$(echo "$POD_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ports=d['data']['pod']['runtime']['ports']
p=[x for x in ports if x['privatePort']==22 and x['type']=='tcp']
print(p[0]['publicPort'] if p else '')
" 2>/dev/null)

[[ -z "$SSH_IP" || -z "$SSH_PORT" ]] && echo "❌  Pod not running or SSH port not found" && exit 1
log "SSH: root@${SSH_IP}:${SSH_PORT}"

# ── Local models path (bind mount — lives on host filesystem) ─────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VOLUME_PATH="${SCRIPT_DIR}/models"
mkdir -p "$VOLUME_PATH"
log "Local models path: $VOLUME_PATH"

# ── Models to sync ────────────────────────────────────────────────────────────
# Format: "pod_path local_subdir min_size_bytes"
# Flux.1-schnell set — UNet + dual text encoders + VAE
MODELS=(
  "/workspace/models/unet/flux1-schnell-fp8.safetensors unet 7000000000"
  "/workspace/models/clip/clip_l.safetensors clip 200000000"
  "/workspace/models/clip/t5xxl_fp8_e4m3fn.safetensors clip 4000000000"
  "/workspace/models/vae/ae.safetensors vae 200000000"
)

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15 -P ${SSH_PORT}"
SSH_CMD_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15 -p ${SSH_PORT}"

sync_model() {
  local pod_path="$1" subdir="$2" min_size="$3"
  local name; name=$(basename "$pod_path")
  local local_path="${VOLUME_PATH}/${subdir}/${name}"

  mkdir -p "${VOLUME_PATH}/${subdir}"

  # Check local size
  local local_size; local_size=$(stat -f%z "$local_path" 2>/dev/null || echo 0)
  if [[ "$local_size" -ge "$min_size" ]]; then
    echo "  ✓ SKIP $name (already synced, $(du -sh "$local_path" | cut -f1))"
    return 0
  fi

  # Check pod size (use stat -c%s on Linux remote)
  local pod_size; pod_size=$(ssh $SSH_CMD_OPTS root@${SSH_IP} "stat -c%s '${pod_path}' 2>/dev/null || echo 0" 2>/dev/null || echo 0)
  if [[ "$pod_size" -lt "$min_size" ]]; then
    echo "  ○ SKIP $name (not on pod yet or too small: ${pod_size} bytes)"
    return 0
  fi

  echo "  ↓ $name ($(numfmt --to=iec-i --suffix=B "$pod_size"))..."
  # Use scp — RunPod pods don't have rsync installed
  scp $SSH_OPTS "root@${SSH_IP}:${pod_path}" "${local_path}.tmp" \
    && mv "${local_path}.tmp" "${local_path}" \
    && echo "  ✓ $name synced" \
    || { rm -f "${local_path}.tmp"; echo "  ✗ $name FAILED"; }
}

log "Syncing models from pod to Docker volume..."
echo "  (This may take a while depending on connection speed)"
echo ""

for entry in "${MODELS[@]}"; do
  read -r pod_path subdir min_size <<< "$entry"
  sync_model "$pod_path" "$subdir" "$min_size"
done

echo ""
log "Sync complete. Start local ComfyUI:"
echo "  docker compose -f docker-compose.local.yml up"
