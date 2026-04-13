#!/usr/bin/env bash
# ComfyUI entrypoint — models are bind-mounted from host at /models
# Download models to host first: bash sync-models-from-pod.sh
set -euo pipefail

log() { echo "[$(date +%H:%M:%S)] $*"; }

log "=== Models on host ==="
for dir in checkpoints vae clip unet text_encoders; do
  count=$(find /models/$dir -maxdepth 1 -name '*.safetensors' 2>/dev/null | wc -l | tr -d ' ')
  [ "$count" -gt 0 ] && log "  $dir: $count model(s)" || true
done

CHECKPOINT_COUNT=$(find /models/checkpoints -maxdepth 1 -name '*.safetensors' 2>/dev/null | wc -l | tr -d ' ')
if [ "$CHECKPOINT_COUNT" -eq 0 ]; then
  log ""
  log "⚠️  No checkpoints in /models/checkpoints/"
  log "   Run: bash sync-models-from-pod.sh   (copy from RunPod)"
  log "   Then restart: docker compose -f docker-compose.local.yml restart"
  log ""
fi

log "Starting ComfyUI :8188 (CPU — Apple Silicon)..."
exec python main.py \
  --listen 0.0.0.0 \
  --port 8188 \
  --cpu \
  --extra-model-paths-config extra_model_paths.yaml
