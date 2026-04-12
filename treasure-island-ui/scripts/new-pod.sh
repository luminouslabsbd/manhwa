#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# new-pod.sh  — Spin up a new RunPod GPU pod and wire it to the UI
#
# Uses ai-dock/comfyui Docker image — ComfyUI pre-installed, GPU-tested,
# /workspace volume-native. No torch/CUDA setup needed.
#
# What it does:
#   1. Reads credentials from .env.local
#   2. Creates pod with ai-dock/comfyui image targeting A100 GPU
#   3. Passes HF/CivitAI tokens + setup script for Ollama & TTS
#   4. Waits for RUNNING, patches .env.local with new pod URLs
#   5. Restarts local Next.js dev server
#
# Requirements:  jq (brew install jq)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Load .env.local ───────────────────────────────────────────────────────────
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

RUNPOD_API_KEY="${RUNPOD_API_KEY:-}"
HF_TOKEN="${HF_TOKEN:-}"
CIVITAI_TOKEN="${CIVITAI_TOKEN:-}"
PUBLIC_KEY="${PUBLIC_KEY:-}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"

if [[ -z "$RUNPOD_API_KEY" ]]; then
  echo "❌  RUNPOD_API_KEY not found in .env.local"
  exit 1
fi

GQL="https://api.runpod.io/graphql?api_key=${RUNPOD_API_KEY}"

# ── Config ────────────────────────────────────────────────────────────────────
CONTAINER_DISK=20
VOLUME_DISK=150      # GB — models + venv + ComfyUI data on volume

# ai-dock/comfyui: pre-built image with ComfyUI + supervisor + CUDA
# CUDA 12.1 variant works on pods with driver >= 525 (most RunPod A100 hosts)
IMAGE="ghcr.io/ai-dock/comfyui:v2-cuda-12.1.1-base-22.04-v0.2.7"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SETUP_SCRIPT_PATH="$SCRIPT_DIR/pod-setup.sh"
if [[ ! -f "$SETUP_SCRIPT_PATH" ]]; then
  echo "❌  scripts/pod-setup.sh not found"
  exit 1
fi

# ── Step 1: Find best GPU ─────────────────────────────────────────────────────
echo "🔍  Finding best GPU for video generation..."

GPU_DATA=$(curl -sf -X POST "$GQL" \
  -H "Content-Type: application/json" \
  -d '{"query":"query{gpuTypes{id displayName communityCloud lowestPrice(input:{gpuCount:1}){minimumBidPrice stockStatus}}}"}' \
  | jq '.data.gpuTypes')

# Tier 1: A100 community under $2.00/hr
BEST_GPU=$(echo "$GPU_DATA" | jq -r '
  [.[] | select(
    .communityCloud == true and
    .lowestPrice.stockStatus != "unavailable" and
    .lowestPrice.minimumBidPrice > 0.10 and
    .lowestPrice.minimumBidPrice < 2.00 and
    (.displayName | test("A100"; "i"))
  )] | sort_by(.lowestPrice.minimumBidPrice) | first | .id // empty
')

# Tier 2: RTX 4090 community under $0.60/hr
if [[ -z "$BEST_GPU" ]]; then
  BEST_GPU=$(echo "$GPU_DATA" | jq -r '
    [.[] | select(
      .communityCloud == true and
      .lowestPrice.stockStatus != "unavailable" and
      .lowestPrice.minimumBidPrice > 0.10 and
      .lowestPrice.minimumBidPrice < 0.60 and
      (.displayName | test("4090"; "i"))
    )] | sort_by(.lowestPrice.minimumBidPrice) | first | .id // empty
  ')
fi

# Tier 3: RTX 3090/4090 community under $0.60/hr
if [[ -z "$BEST_GPU" ]]; then
  BEST_GPU=$(echo "$GPU_DATA" | jq -r '
    [.[] | select(
      .communityCloud == true and
      .lowestPrice.stockStatus != "unavailable" and
      .lowestPrice.minimumBidPrice > 0.05 and
      .lowestPrice.minimumBidPrice < 0.60 and
      (.displayName | test("3090|4090"; "i"))
    )] | sort_by(.lowestPrice.minimumBidPrice) | first | .id // empty
  ')
fi

[[ -z "$BEST_GPU" ]] && echo "❌  No GPU in budget." && exit 1

GPU_PRICE=$(echo "$GPU_DATA" | jq -r --arg id "$BEST_GPU" '.[] | select(.id==$id) | .lowestPrice.minimumBidPrice')
GPU_NAME=$(echo "$GPU_DATA"  | jq -r --arg id "$BEST_GPU" '.[] | select(.id==$id) | .displayName')
echo "   ✅  $GPU_NAME @ \$${GPU_PRICE}/hr"

# ── Step 2: Build env array ───────────────────────────────────────────────────
build_env_json() {
  local arr="[]"
  add() { arr=$(echo "$arr" | jq --arg k "$1" --arg v "$2" '. += [{key:$k,value:$v}]'); }

  # ai-dock/comfyui env vars — do NOT override dockerArgs, let the image start normally
  add "WORKSPACE"         "/workspace"
  add "AUTO_UPDATE"       "false"

  [[ -n "$HF_TOKEN"      ]] && add "HF_TOKEN"       "$HF_TOKEN"
  [[ -n "$CIVITAI_TOKEN" ]] && add "CIVITAI_TOKEN"  "$CIVITAI_TOKEN"
  [[ -n "$PUBLIC_KEY"    ]] && add "PUBLIC_KEY"      "$PUBLIC_KEY"
  add "OLLAMA_MODEL"   "$OLLAMA_MODEL"
  add "OLLAMA_MODELS"  "/workspace/ollama_models"

  echo "$arr"
}

ENV_JSON=$(build_env_json)

# ── Step 3: Create the pod ────────────────────────────────────────────────────
echo "🚀  Creating pod with ai-dock/comfyui image..."

CREATE_BODY=$(jq -n \
  --arg name       "ai-studio" \
  --arg image      "$IMAGE" \
  --arg gpuId      "$BEST_GPU" \
  --argjson vol    "$VOLUME_DISK" \
  --argjson cdisk  "$CONTAINER_DISK" \
  --argjson env    "$ENV_JSON" \
  '{query: "mutation($input:PodFindAndDeployOnDemandInput!){podFindAndDeployOnDemand(input:$input){id name desiredStatus}}",
    variables: {input: {
      name: $name,
      imageName: $image,
      gpuTypeId: $gpuId,
      cloudType: "COMMUNITY",
      gpuCount: 1,
      volumeInGb: $vol,
      containerDiskInGb: $cdisk,
      minVcpuCount: 8,
      minMemoryInGb: 32,
      ports: "8188/http,5000/http,11434/http,22/tcp",
      volumeMountPath: "/workspace",
      env: $env
    }}}')

CREATE_RESULT=$(curl -sf -X POST "$GQL" \
  -H "Content-Type: application/json" \
  -d "$CREATE_BODY")

if echo "$CREATE_RESULT" | jq -e '.errors' > /dev/null 2>&1; then
  echo "❌  Pod creation failed:"
  echo "$CREATE_RESULT" | jq '.errors'
  exit 1
fi

POD_ID=$(echo "$CREATE_RESULT" | jq -r '.data.podFindAndDeployOnDemand.id')
[[ -z "$POD_ID" || "$POD_ID" == "null" ]] && echo "❌  No pod ID" && echo "$CREATE_RESULT" | jq . && exit 1
echo "   Pod ID: $POD_ID"

# ── Step 4: Wait for RUNNING ─────────────────────────────────────────────────
echo "⏳  Waiting for pod to start..."
MAX_WAIT=180; WAITED=0
while true; do
  STATUS=$(curl -sf -X POST "$GQL" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"query{pod(input:{podId:\\\"${POD_ID}\\\"}){desiredStatus}}\"}" \
    2>/dev/null | jq -r '.data.pod.desiredStatus // "UNKNOWN"')
  printf "\r   Status: %-12s (%ds)" "$STATUS" "$WAITED"
  [[ "$STATUS" == "RUNNING" ]] && echo "" && echo "   ✅  Running" && break
  [[ $WAITED -ge $MAX_WAIT  ]] && echo "" && echo "⚠️  Timed out — check RunPod dashboard. Pod: $POD_ID" && break
  sleep 5; WAITED=$((WAITED+5))
done

# ── Step 5: Get SSH details (wait for container to fully start) ──────────────
echo "⏳  Waiting for SSH to become available..."
MAX_SSH=300; SSH_WAITED=0
SSH_PORT=""; SSH_IP=""
while true; do
  CONN=$(curl -sf -X POST "$GQL" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"query{pod(input:{podId:\\\"${POD_ID}\\\"}){costPerHr runtime{uptimeInSeconds ports{ip privatePort publicPort type}}}}\"}")
  UPTIME=$(echo "$CONN" | jq -r '.data.pod.runtime.uptimeInSeconds // 0')
  SSH_PORT=$(echo "$CONN" | jq -r '.data.pod.runtime.ports[]? | select(.privatePort==22 and .type=="tcp") | .publicPort' | head -1)
  SSH_IP=$(echo "$CONN"   | jq -r '.data.pod.runtime.ports[]? | select(.privatePort==22 and .type=="tcp") | .ip'         | head -1)
  printf "\r   Uptime: %ds  SSH port: %s" "$UPTIME" "${SSH_PORT:-waiting...}"
  [[ -n "$SSH_PORT" && "$UPTIME" -gt 0 ]] && echo "" && echo "   ✅  Container up" && break
  [[ $SSH_WAITED -ge $MAX_SSH ]] && echo "" && echo "⚠️  SSH timeout — pod may still be pulling image" && break
  sleep 5; SSH_WAITED=$((SSH_WAITED+5))
done
COST=$(echo "$CONN" | jq -r '.data.pod.costPerHr // ""')

# ── Step 5b: Push and run pod-setup.sh via SSH ───────────────────────────────
if [[ -n "$SSH_PORT" && -n "$SSH_IP" ]]; then
  echo "📤  Uploading pod-setup.sh and running in background..."
  SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15 -o BatchMode=yes -p $SSH_PORT"
  # Wait for SSH to accept connections
  for i in {1..12}; do
    ssh $SSH_OPTS root@"$SSH_IP" "echo ok" 2>/dev/null && break
    sleep 5
  done
  scp -o StrictHostKeyChecking=no -o ConnectTimeout=15 -P "$SSH_PORT" \
    "$SETUP_SCRIPT_PATH" root@"$SSH_IP":/workspace/pod-setup.sh 2>/dev/null && \
  ssh $SSH_OPTS root@"$SSH_IP" \
    "HF_TOKEN=${HF_TOKEN} CIVITAI_TOKEN=${CIVITAI_TOKEN} OLLAMA_MODEL=${OLLAMA_MODEL} \
     nohup bash /workspace/pod-setup.sh > /workspace/setup.log 2>&1 &" 2>/dev/null && \
  echo "   ✅  pod-setup.sh running in background" || \
  echo "   ⚠️  SSH upload failed — run manually: scp -P $SSH_PORT scripts/pod-setup.sh root@$SSH_IP:/workspace/ && ssh -p $SSH_PORT root@$SSH_IP 'bash /workspace/pod-setup.sh &'"
else
  echo "   ⚠️  No SSH yet — run setup manually once pod is ready:"
  echo "   scp -P <PORT> scripts/pod-setup.sh root@<HOST>:/workspace/"
  echo "   ssh -p <PORT> root@<HOST> 'bash /workspace/pod-setup.sh &'"
fi

# ── Step 6: Patch .env.local ─────────────────────────────────────────────────
echo "📝  Updating .env.local..."
update_env() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i '' "s|^${k}=.*|${k}=${v}|" "$ENV_FILE"
  else
    echo "${k}=${v}" >> "$ENV_FILE"
  fi
}

update_env "RUNPOD_POD_ID" "$POD_ID"
update_env "COMFYUI_HOST"  "https://${POD_ID}-8188.proxy.runpod.net"
update_env "TTS_HOST"      "https://${POD_ID}-5000.proxy.runpod.net"
update_env "OLLAMA_HOST"   "https://${POD_ID}-11434.proxy.runpod.net"
echo "   ✅  .env.local updated"

# ── Step 7: Restart dev server ────────────────────────────────────────────────
OLD_PID=$(lsof -ti:3000 2>/dev/null || true)
if [[ -n "$OLD_PID" ]]; then kill "$OLD_PID" 2>/dev/null || true; sleep 2; fi
PATH="/opt/homebrew/Cellar/node/25.8.2/bin:$PATH" \
  "$(dirname "$0")/../node_modules/.bin/next" dev --webpack > /tmp/nextjs.log 2>&1 &
echo "🔄  Dev server restarting at http://localhost:3000"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "  ✅  Pod ready — ai-dock/comfyui image"
echo ""
printf "  Pod ID:   %s\n" "$POD_ID"
printf "  GPU:      %s\n" "$GPU_NAME"
[[ -n "$COST"   ]] && printf "  Cost:     \$%s/hr\n" "$COST"
echo ""
printf "  ComfyUI:  https://%s-8188.proxy.runpod.net\n" "$POD_ID"
printf "  TTS:      https://%s-5000.proxy.runpod.net\n" "$POD_ID"
printf "  Ollama:   https://%s-11434.proxy.runpod.net\n" "$POD_ID"
[[ -n "$SSH_IP" ]] && printf "  SSH:      ssh -p %s root@%s\n" "$SSH_PORT" "$SSH_IP"
echo ""
echo "  ComfyUI starting via ai-dock supervisor (~2-3 min)."
echo "  Ollama + TTS + models installing in background."
[[ -n "$SSH_IP" ]] && echo "  Watch:    ssh -p $SSH_PORT root@$SSH_IP tail -f /var/log/supervisor/comfyui.log"
echo ""
echo "  UI: http://localhost:3000"
echo "╚══════════════════════════════════════════════════════════╝"
