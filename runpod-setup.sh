#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Manhwa Studio — RunPod 2-Pod Environment Setup
# ═══════════════════════════════════════════════════════════════
# Creates 2 pods + shared storage:
#   1. Content Pod  — Ollama LLM for story/prompt generation
#   2. ComfyUI Pod  — ComfyUI for image + video (different workflows)
# Both share one Network Volume for models & outputs.
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration (edit these) ──────────────────────────────────
API_KEY="${RUNPOD_API_KEY:?RUNPOD_API_KEY is required}"
DATACENTER="${RUNPOD_DATACENTER:-EUR-IS-1}"
VOLUME_SIZE=100  # GB — shared across both pods

# GPU choices (cheapest available)
CONTENT_GPU="NVIDIA RTX 4000 Ada Generation"   # 20GB — enough for 7B LLM
COMFYUI_GPU="NVIDIA RTX 4000 Ada Generation"   # 20GB — enough for FLUX/SDXL/Wan2.1

# Existing proven templates (from RunPod community)
# ComfyUI: hearmeman/comfyui-wan-template:v11 (ComfyUI + models pre-installed)
COMFYUI_TEMPLATE="758dsjwiqz"
# Content: Ollama official image
CONTENT_IMAGE="ollama/ollama:latest"

# ── Helpers ─────────────────────────────────────────────────────
GQL="https://api.runpod.io/graphql?api_key=${API_KEY}"

gql() {
  curl -s -X POST "$GQL" -H "Content-Type: application/json" -d "{\"query\":\"$1\"}"
}

echo "═══════════════════════════════════════════════════"
echo " Manhwa Studio — Environment Setup"
echo "═══════════════════════════════════════════════════"
echo " Datacenter: $DATACENTER"
echo " Volume:     ${VOLUME_SIZE}GB shared"
echo ""

# ── Step 1: Create Network Volume ──────────────────────────────
echo "[1/3] Creating shared network volume..."
VOL_RESULT=$(gql "mutation{createNetworkVolume(input:{name:\"manhwa-studio-vol\",size:${VOLUME_SIZE},dataCenterId:\"${DATACENTER}\"}){id name size dataCenterId}}")
VOL_ID=$(echo "$VOL_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['createNetworkVolume']['id'])" 2>/dev/null)

if [ -z "$VOL_ID" ]; then
  echo "  ⚠️  Volume creation failed. Response: $VOL_RESULT"
  echo "  Trying to find existing volume..."
  VOL_ID=$(gql "query{myself{networkVolumes{id name}}}" | python3 -c "
import sys,json
vols=json.load(sys.stdin)['data']['myself']['networkVolumes']
for v in vols:
  if 'manhwa' in v['name'].lower():
    print(v['id']); break
" 2>/dev/null)
fi

if [ -z "$VOL_ID" ]; then
  echo "  ❌ No volume found. Exiting."
  exit 1
fi
echo "  ✅ Volume: $VOL_ID"

# ── Step 2: Deploy Content Pod (Ollama) ────────────────────────
echo ""
echo "[2/3] Deploying Content Pod (Ollama)..."
C_RESULT=$(gql "mutation{podFindAndDeployOnDemand(input:{name:\"MS-Content\",imageName:\"${CONTENT_IMAGE}\",gpuTypeId:\"${CONTENT_GPU}\",cloudType:ALL,gpuCount:1,volumeInGb:0,containerDiskInGb:20,networkVolumeId:\"${VOL_ID}\",ports:\"11434/http,22/tcp\",volumeMountPath:\"/workspace\",env:[{key:\"OLLAMA_HOST\",value:\"0.0.0.0:11434\"},{key:\"OLLAMA_MODELS\",value:\"/workspace/content/models\"}],dockerArgs:\"bash -c 'mkdir -p /workspace/content/models && ollama serve'\"}){id name desiredStatus costPerHr}}")
C_ID=$(echo "$C_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['podFindAndDeployOnDemand']['id'])" 2>/dev/null || echo "")
echo "  Result: $C_RESULT"
echo "  ✅ Content Pod: ${C_ID:-FAILED}"

# ── Step 3: Deploy ComfyUI Pod (Image + Video) ───────────────────
echo ""
echo "[3/3] Deploying ComfyUI Pod (Image + Video workflows)..."
U_RESULT=$(gql "mutation{podFindAndDeployOnDemand(input:{name:\"MS-ComfyUI\",templateId:\"${COMFYUI_TEMPLATE}\",gpuTypeId:\"${COMFYUI_GPU}\",cloudType:ALL,gpuCount:1,containerDiskInGb:450,networkVolumeId:\"${VOL_ID}\",env:[{key:\"HF_TOKEN\",value:\"{{ RUNPOD_SECRET_HF_TOKEN }}\"}]}){id name desiredStatus costPerHr}}")
U_ID=$(echo "$U_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['podFindAndDeployOnDemand']['id'])" 2>/dev/null || echo "")
echo "  Result: $U_RESULT"
echo "  ✅ ComfyUI Pod: ${U_ID:-FAILED}"

# ── Output .env.local ──────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo " ENVIRONMENT READY"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Pod IDs:"
echo "  Content: $C_ID"
echo "  ComfyUI: $U_ID"
echo ""
echo "Copy this to treasure-island-ui/.env.local:"
echo "───────────────────────────────────────────"
cat <<EOF
RUNPOD_API_KEY=${API_KEY}
RUNPOD_POD_ID_CONTENT=${C_ID}
RUNPOD_POD_ID_COMFYUI=${U_ID}
COMFYUI_HOST=https://${U_ID}-8188.proxy.runpod.net
OLLAMA_HOST=https://${C_ID}-11434.proxy.runpod.net
NETWORK_VOLUME_ID=${VOL_ID}
EOF
echo "───────────────────────────────────────────"

# Save to file
ENV_FILE="treasure-island-ui/.env.local"
if [ -f "$ENV_FILE" ]; then
  # Preserve non-RunPod vars
  grep -v "^RUNPOD_\|^COMFYUI_\|^OLLAMA_\|^NETWORK_" "$ENV_FILE" > "${ENV_FILE}.bak" 2>/dev/null || true
fi
cat > "$ENV_FILE" <<EOF
RUNPOD_API_KEY=${API_KEY}
RUNPOD_POD_ID_CONTENT=${C_ID}
RUNPOD_POD_ID_COMFYUI=${U_ID}
COMFYUI_HOST=https://${U_ID}-8188.proxy.runpod.net
OLLAMA_HOST=https://${C_ID}-11434.proxy.runpod.net
NETWORK_VOLUME_ID=${VOL_ID}
EOF
# Append preserved vars
[ -f "${ENV_FILE}.bak" ] && cat "${ENV_FILE}.bak" >> "$ENV_FILE" && rm "${ENV_FILE}.bak"
echo ""
echo "✅ Saved to $ENV_FILE"
echo ""
echo "Wait 2-5 minutes for pods to boot, then access:"
echo "  Content (Ollama):       https://${C_ID}-11434.proxy.runpod.net"
echo "  ComfyUI (Image+Video):  https://${U_ID}-8188.proxy.runpod.net"
