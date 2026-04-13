#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# new-pod.sh  — Spin up a new RunPod GPU pod and wire it to the UI
#
# Image: nvidia/cuda:12.1.1-devel-ubuntu22.04 (no system cuDNN — avoids cuDNN 8 vs 9 conflict)
#   Works on all community A100/4090 pods (driver >= 525).
#   pod-setup.sh detects CUDA at runtime and installs matching torch.
#   Uses hf_transfer + aria2c — first-time setup ~10-15 min.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
if [[ -f "$ENV_FILE" ]]; then set -a; source "$ENV_FILE"; set +a; fi

RUNPOD_API_KEY="${RUNPOD_API_KEY:-}"
HF_TOKEN="${HF_TOKEN:-}"
CIVITAI_TOKEN="${CIVITAI_TOKEN:-}"
PUBLIC_KEY="${PUBLIC_KEY:-}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"

[[ -z "$RUNPOD_API_KEY" ]] && echo "❌  RUNPOD_API_KEY not in .env.local" && exit 1

GQL="https://api.runpod.io/graphql?api_key=${RUNPOD_API_KEY}"

# ── Config ────────────────────────────────────────────────────────────────────
CONTAINER_DISK=30
VOLUME_DISK=150
# nvidia/cuda:12.1.1 — works on any community pod (driver >= 525, all A100/4090)
# pod-setup.sh detects CUDA at runtime and installs the right torch wheel
IMAGE="nvidia/cuda:12.1.1-devel-ubuntu22.04"

# ── Encode setup script as base64 → SETUP_SCRIPT env var ─────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SETUP_SCRIPT_PATH="$SCRIPT_DIR/pod-setup.sh"
[[ ! -f "$SETUP_SCRIPT_PATH" ]] && echo "❌  scripts/pod-setup.sh not found" && exit 1

SETUP_B64=$(base64 -i "$SETUP_SCRIPT_PATH" | tr -d '\n')
echo "📦  Setup script encoded ($(echo -n "$SETUP_B64" | wc -c | tr -d ' ') chars)"

update_env() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i '' "s|^${k}=.*|${k}=${v}|" "$ENV_FILE"
  else
    echo "${k}=${v}" >> "$ENV_FILE"
  fi
}

# ── Find best GPU (global — no region lock) ───────────────────────────────────
echo "🔍  Finding best GPU..."
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
  )] | sort_by(.lowestPrice.minimumBidPrice) | first | .id // empty')

# Tier 2: RTX 4090 community under $0.80/hr
if [[ -z "$BEST_GPU" ]]; then
  BEST_GPU=$(echo "$GPU_DATA" | jq -r '
    [.[] | select(
      .communityCloud == true and
      .lowestPrice.stockStatus != "unavailable" and
      .lowestPrice.minimumBidPrice > 0.10 and
      .lowestPrice.minimumBidPrice < 0.80 and
      (.displayName | test("4090"; "i"))
    )] | sort_by(.lowestPrice.minimumBidPrice) | first | .id // empty')
fi

# Tier 3: Any 3090/4090 community under $0.80/hr
if [[ -z "$BEST_GPU" ]]; then
  BEST_GPU=$(echo "$GPU_DATA" | jq -r '
    [.[] | select(
      .communityCloud == true and
      .lowestPrice.stockStatus != "unavailable" and
      .lowestPrice.minimumBidPrice > 0.05 and
      .lowestPrice.minimumBidPrice < 0.80 and
      (.displayName | test("3090|4090"; "i"))
    )] | sort_by(.lowestPrice.minimumBidPrice) | first | .id // empty')
fi

[[ -z "$BEST_GPU" ]] && echo "❌  No GPU available. Try a different datacenter: RUNPOD_DATACENTER=US-CA-1 bash scripts/new-pod.sh" && exit 1
GPU_PRICE=$(echo "$GPU_DATA" | jq -r --arg id "$BEST_GPU" '.[] | select(.id==$id) | .lowestPrice.minimumBidPrice')
GPU_NAME=$(echo "$GPU_DATA"  | jq -r --arg id "$BEST_GPU" '.[] | select(.id==$id) | .displayName')
echo "   ✅  $GPU_NAME @ \$${GPU_PRICE}/hr"

# ── Build env array ───────────────────────────────────────────────────────────
build_env_json() {
  local arr="[]"
  add() { arr=$(echo "$arr" | jq --arg k "$1" --arg v "$2" '. += [{key:$k,value:$v}]'); }
  add "SETUP_SCRIPT"   "$SETUP_B64"
  [[ -n "$HF_TOKEN"      ]] && add "HF_TOKEN"       "$HF_TOKEN"
  [[ -n "$CIVITAI_TOKEN" ]] && add "CIVITAI_TOKEN"  "$CIVITAI_TOKEN"
  [[ -n "$PUBLIC_KEY"    ]] && add "PUBLIC_KEY"      "$PUBLIC_KEY"
  add "OLLAMA_MODEL"   "$OLLAMA_MODEL"
  add "OLLAMA_MODELS"  "/workspace/ollama_models"
  add "OLLAMA_HOST"    "0.0.0.0"
  echo "$arr"
}
ENV_JSON=$(build_env_json)

# ── dockerStartCmd ────────────────────────────────────────────────────────────
# 1. Install + start sshd synchronously (nvidia/cuda has no sshd)
# 2. Decode SETUP_SCRIPT → run in background
# 3. sleep infinity keeps container alive
DOCKER_CMD='bash -c "apt-get update -qq; apt-get install -y -qq openssh-server 2>/dev/null; mkdir -p /root/.ssh /run/sshd /workspace; echo \"${PUBLIC_KEY:-}\" > /root/.ssh/authorized_keys; chmod 700 /root/.ssh; chmod 600 /root/.ssh/authorized_keys; echo PermitRootLogin yes >> /etc/ssh/sshd_config; /usr/sbin/sshd 2>/dev/null; echo \$SETUP_SCRIPT | base64 -d > /workspace/setup.sh; chmod +x /workspace/setup.sh; bash /workspace/setup.sh >> /workspace/setup.log 2>&1 & sleep infinity"'

# ── Create pod ────────────────────────────────────────────────────────────────
echo "🚀  Creating pod..."
CREATE_BODY=$(jq -n \
  --arg name   "ai-studio" \
  --arg image  "$IMAGE" \
  --arg gpuId  "$BEST_GPU" \
  --argjson vol   "$VOLUME_DISK" \
  --argjson cdisk "$CONTAINER_DISK" \
  --arg cmd    "$DOCKER_CMD" \
  --argjson env   "$ENV_JSON" \
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
      dockerArgs: $cmd,
      env: $env
    }}}')

CREATE_RESULT=$(curl -sf -X POST "$GQL" -H "Content-Type: application/json" -d "$CREATE_BODY")

if echo "$CREATE_RESULT" | jq -e '.errors' > /dev/null 2>&1; then
  echo "❌  Pod creation failed:"; echo "$CREATE_RESULT" | jq '.errors'; exit 1
fi

POD_ID=$(echo "$CREATE_RESULT" | jq -r '.data.podFindAndDeployOnDemand.id')
[[ -z "$POD_ID" || "$POD_ID" == "null" ]] && echo "❌  No pod ID" && echo "$CREATE_RESULT" | jq . && exit 1
echo "   Pod ID: $POD_ID"

# ── Wait for RUNNING ──────────────────────────────────────────────────────────
echo "⏳  Waiting for pod to start..."
MAX_WAIT=180; WAITED=0
while true; do
  STATUS=$(curl -sf -X POST "$GQL" -H "Content-Type: application/json" \
    -d "{\"query\":\"query{pod(input:{podId:\\\"${POD_ID}\\\"}){desiredStatus}}\"}" \
    2>/dev/null | jq -r '.data.pod.desiredStatus // "UNKNOWN"')
  printf "\r   Status: %-12s (%ds)" "$STATUS" "$WAITED"
  [[ "$STATUS" == "RUNNING" ]] && echo "" && echo "   ✅  Running" && break
  [[ $WAITED -ge $MAX_WAIT  ]] && echo "" && echo "⚠️  Timed out — pod: $POD_ID" && break
  sleep 5; WAITED=$((WAITED+5))
done

# ── Get connection details ────────────────────────────────────────────────────
sleep 3
CONN=$(curl -sf -X POST "$GQL" -H "Content-Type: application/json" \
  -d "{\"query\":\"query{pod(input:{podId:\\\"${POD_ID}\\\"}){costPerHr runtime{ports{ip privatePort publicPort type}}}}\"}")

SSH_PORT=$(echo "$CONN" | jq -r '.data.pod.runtime.ports[]? | select(.privatePort==22 and .type=="tcp") | .publicPort' | head -1)
SSH_IP=$(echo "$CONN"   | jq -r '.data.pod.runtime.ports[]? | select(.privatePort==22 and .type=="tcp") | .ip'         | head -1)
COST=$(echo "$CONN"     | jq -r '.data.pod.costPerHr // ""')

# ── Patch .env.local ──────────────────────────────────────────────────────────
echo "📝  Updating .env.local..."
update_env "RUNPOD_POD_ID" "$POD_ID"
update_env "COMFYUI_HOST"  "https://${POD_ID}-8188.proxy.runpod.net"
update_env "TTS_HOST"      "https://${POD_ID}-5000.proxy.runpod.net"
update_env "OLLAMA_HOST"   "https://${POD_ID}-11434.proxy.runpod.net"
echo "   ✅  .env.local updated"

# ── Restart dev server ────────────────────────────────────────────────────────
OLD_PID=$(lsof -ti:3000 2>/dev/null || true)
[[ -n "$OLD_PID" ]] && kill "$OLD_PID" 2>/dev/null || true && sleep 2
PATH="/opt/homebrew/Cellar/node/25.8.2/bin:$PATH" \
  "$(dirname "$0")/../node_modules/.bin/next" dev --webpack > /tmp/nextjs.log 2>&1 &
echo "🔄  Dev server restarting at http://localhost:3000"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "  ✅  Pod is ready!"
echo ""
printf "  Pod ID:   %s\n" "$POD_ID"
printf "  GPU:      %s\n" "$GPU_NAME"
[[ -n "$COST" ]] && printf "  Cost:     \$%s/hr\n" "$COST"
echo ""
printf "  ComfyUI:  https://%s-8188.proxy.runpod.net\n" "$POD_ID"
printf "  TTS:      https://%s-5000.proxy.runpod.net\n" "$POD_ID"
printf "  Ollama:   https://%s-11434.proxy.runpod.net\n" "$POD_ID"
[[ -n "$SSH_IP" ]] && printf "  SSH:      ssh -p %s root@%s\n" "$SSH_PORT" "$SSH_IP"
echo ""
echo "  First run: ~10-15 min (hf_transfer fast download). Restart same pod: ~2 min."
[[ -n "$SSH_IP" ]] && echo "  Watch:    ssh -p $SSH_PORT root@$SSH_IP tail -f /workspace/setup.log"
echo ""
echo "  UI: http://localhost:3000"
echo "╚══════════════════════════════════════════════════════════╝"
