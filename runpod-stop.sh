#!/bin/bash
# Stop all Manhwa Studio pods (save money)
# Reads pod IDs from .env.local

set -euo pipefail
ENV_FILE="treasure-island-ui/.env.local"
API_KEY=$(grep "^RUNPOD_API_KEY=" "$ENV_FILE" | cut -d= -f2)
GQL="https://api.runpod.io/graphql?api_key=${API_KEY}"

gql() { curl -s -X POST "$GQL" -H "Content-Type: application/json" -d "{\"query\":\"$1\"}"; }

echo "Stopping all Manhwa Studio pods..."

for VAR in RUNPOD_POD_ID_CONTENT RUNPOD_POD_ID_COMFYUI; do
  POD_ID=$(grep "^${VAR}=" "$ENV_FILE" | cut -d= -f2)
  if [ -n "$POD_ID" ]; then
    RESULT=$(gql "mutation{podStop(input:{podId:\"${POD_ID}\"}){id desiredStatus}}")
    echo "  ⏹  $VAR ($POD_ID) → stopped"
  fi
done

echo "✅ All pods stopped."
