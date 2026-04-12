#!/bin/bash
# Downloads all models to /workspace/models (network volume)
# Only downloads missing files — safe to re-run
# Usage: bash /workspace/download_models.sh
set -e

HF_TOKEN="${HF_TOKEN:-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}"
VOL="/workspace/models"

mkdir -p "$VOL/unet" "$VOL/clip" "$VOL/vae/wanvideo" \
         "$VOL/diffusion_models/WanVideo/2_2" "$VOL/text_encoders"

dl() {
  local url="$1" dir="$2" name="$3"
  local path="$dir/$name"
  if [ -f "$path" ] && [ "$(stat -c%s "$path" 2>/dev/null || echo 0)" -gt 100000 ]; then
    echo "  SKIP $name (exists: $(du -h $path | cut -f1))"
    return 0
  fi
  echo "  GET  $name ..."
  local extra="${@:4}"
  aria2c -x 8 -s 8 -k 1M --file-allocation=none $extra "$url" -d "$dir" -o "$name"
  echo "  DONE $name ($(du -h $path | cut -f1))"
}

dlg() { dl "$1" "$2" "$3" --header="Authorization: Bearer $HF_TOKEN"; }

echo "================================================="
echo " Downloading models to $VOL"
echo " Runs in background — safe to close terminal"
echo "================================================="
START=$(date +%s)

echo ""
echo "[1/8] FLUX UNET fp8 (17GB)"
dl "https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors" \
   "$VOL/unet" "flux1-schnell-fp8.safetensors"

echo "[2/8] T5XXL fp8 (4.6GB)"
dl "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors" \
   "$VOL/clip" "t5xxl_fp8_e4m3fn.safetensors"

echo "[3/8] CLIP-L (235MB)"
dl "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors" \
   "$VOL/clip" "clip_l.safetensors"

echo "[4/8] FLUX VAE (320MB, gated)"
dlg "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors" \
    "$VOL/vae" "ae.safetensors"

echo "[5/8] Wan2.2 TI2V-5B (9.4GB)"
dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors" \
   "$VOL/diffusion_models/WanVideo/2_2" "wan2.2_ti2v_5B_fp16.safetensors"

echo "[6/8] Wan2.2 VAE (1.4GB)"
dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors" \
   "$VOL/vae/wanvideo" "Wan2_2_VAE_bf16.safetensors"

echo "[7/8] Wan2.2 text encoder umt5-xxl (11GB)"
dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors" \
   "$VOL/text_encoders" "umt5-xxl-enc-bf16.safetensors"

echo "[8/8] Wan2.2 CLIP vision (1.2GB)"
dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/open_clip_xlm_roberta_large_vit_huge_14.safetensors" \
   "$VOL/text_encoders" "open-clip-xlm-roberta-large-vit-huge-14_visual_fp16.safetensors"

echo ""
echo "================================================="
echo " All models downloaded in $(($(date +%s) - START))s"
du -sh "$VOL"
echo "================================================="
echo " Now run: bash /workspace/setup.sh"
