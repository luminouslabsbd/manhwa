#!/bin/bash
# Run on ANY new pod to restore all models and start ComfyUI
# bash /workspace/setup.sh
set -e

COMFY="/workspace/ComfyUI"
VOL="/workspace/models"

echo "=== Symlinking models from $VOL ==="

symlink() {
  local src="$1" dst="$2"
  if [ -f "$src" ]; then
    ln -sf "$src" "$dst" && echo "  OK  $(basename $dst)"
  else
    echo "  SKIP $(basename $src) (not downloaded yet)"
  fi
}

# FLUX models
symlink "$VOL/unet/flux1-schnell-fp8.safetensors"    "$COMFY/models/unet/flux1-schnell-fp8.safetensors"
symlink "$VOL/clip/t5xxl_fp8_e4m3fn.safetensors"     "$COMFY/models/clip/t5xxl_fp8_e4m3fn.safetensors"
symlink "$VOL/clip/clip_l.safetensors"               "$COMFY/models/clip/clip_l.safetensors"
symlink "$VOL/vae/ae.safetensors"                    "$COMFY/models/vae/ae.safetensors"

# Wan2.2 models
symlink "$VOL/diffusion_models/WanVideo/2_2/wan2.2_ti2v_5B_fp16.safetensors" \
        "$COMFY/models/diffusion_models/WanVideo/2_2/wan2.2_ti2v_5B_fp16.safetensors"
symlink "$VOL/vae/wanvideo/Wan2_2_VAE_bf16.safetensors" \
        "$COMFY/models/vae/wanvideo/Wan2_2_VAE_bf16.safetensors"
symlink "$VOL/text_encoders/umt5-xxl-enc-bf16.safetensors" \
        "$COMFY/models/text_encoders/umt5-xxl-enc-bf16.safetensors"
symlink "$VOL/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors" \
        "$COMFY/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors"
symlink "$VOL/text_encoders/open-clip-xlm-roberta-large-vit-huge-14_visual_fp16.safetensors" \
        "$COMFY/models/text_encoders/open-clip-xlm-roberta-large-vit-huge-14_visual_fp16.safetensors"

echo ""
echo "=== Model status ==="
ls -lh "$COMFY/models/unet/" "$COMFY/models/clip/" "$COMFY/models/vae/" 2>/dev/null

echo ""
echo "=== Starting ComfyUI ==="
pkill -f "main.py" 2>/dev/null || true
sleep 1
cd "$COMFY"
nohup python main.py --listen 0.0.0.0 --port 8188 --disable-auto-launch > /workspace/comfyui.log 2>&1 &
sleep 3
curl -s http://127.0.0.1:8188/system_stats > /dev/null && echo "ComfyUI is UP" || echo "ComfyUI starting (check /workspace/comfyui.log)"
