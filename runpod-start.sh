#!/bin/bash
# Start all Manhwa Studio pods
# Reads pod IDs from .env.local

set -euo pipefail
ENV_FILE="treasure-island-ui/.env.local"
API_KEY=$(grep "^RUNPOD_API_KEY=" "$ENV_FILE" | cut -d= -f2)
GQL="https://api.runpod.io/graphql?api_key=${API_KEY}"

gql() { curl -s -X POST "$GQL" -H "Content-Type: application/json" -d "{\"query\":\"$1\"}"; }

echo "Starting all Manhwa Studio pods..."

for VAR in RUNPOD_POD_ID_CONTENT RUNPOD_POD_ID_COMFYUI; do
  POD_ID=$(grep "^${VAR}=" "$ENV_FILE" | cut -d= -f2)
  if [ -n "$POD_ID" ]; then
    RESULT=$(gql "mutation{podResume(input:{podId:\"${POD_ID}\",gpuCount:1}){id desiredStatus}}")
    echo "  ▶  $VAR ($POD_ID) → starting"
  fi
done

echo ""
echo "✅ All pods starting. Wait 2-5 min then access:"
C=$(grep "^RUNPOD_POD_ID_CONTENT=" "$ENV_FILE" | cut -d= -f2)
UI=$(grep "^RUNPOD_POD_ID_COMFYUI=" "$ENV_FILE" | cut -d= -f2)
echo "  Content (Ollama): https://${C}-11434.proxy.runpod.net"
echo "  ComfyUI (Image+Video): https://${UI}-8188.proxy.runpod.net"
