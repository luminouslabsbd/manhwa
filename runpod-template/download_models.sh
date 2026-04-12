#!/bin/bash
# Downloads all models to /workspace/models. Skips existing files.
set -e

HF_TOKEN="${HF_TOKEN:-}"
VOL="/workspace/models"

mkdir -p "$VOL/unet" "$VOL/clip" "$VOL/vae/wanvideo" \
         "$VOL/diffusion_models/WanVideo/2_2" "$VOL/text_encoders"

dl() {
  local url="$1" dir="$2" name="$3" min_size="${4:-100000}"
  local path="$dir/$name"
  if [ -f "$path" ] && [ "$(stat -c%s "$path" 2>/dev/null || stat -f%z "$path" 2>/dev/null)" -gt "$min_size" ]; then
    echo "  SKIP $name (exists)"
    return 0
  fi
  echo "  GET  $name ..."
  aria2c -x 8 -s 8 -k 1M --file-allocation=none --quiet=true "$url" -d "$dir" -o "$name" "${@:5}"
  echo "  DONE $name ($(du -h "$path" | cut -f1))"
}

dlg() { dl "$1" "$2" "$3" "$4" --header="Authorization: Bearer $HF_TOKEN"; }

echo "=== Checking/downloading models ==="

echo "[1/8] FLUX UNET fp8 (17GB)"
dl "https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors" \
   "$VOL/unet" "flux1-schnell-fp8.safetensors"

echo "[2/8] T5XXL fp8 (4.6GB)"
dl "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors" \
   "$VOL/clip" "t5xxl_fp8_e4m3fn.safetensors"

echo "[3/8] CLIP-L (235MB)"
dl "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors" \
   "$VOL/clip" "clip_l.safetensors"

echo "[4/8] FLUX VAE (320MB)"
dlg "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors" \
    "$VOL/vae" "ae.safetensors"

echo "[5/8] Wan2.2 TI2V-5B (9.4GB)"
dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors" \
   "$VOL/diffusion_models/WanVideo/2_2" "wan2.2_ti2v_5B_fp16.safetensors"

echo "[6/8] Wan2.2 VAE (1.4GB)"
dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors" \
   "$VOL/vae/wanvideo" "Wan2_2_VAE_bf16.safetensors"

echo "[7/8] Wan2.2 UMT5-XXL (11GB)"
dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors" \
   "$VOL/text_encoders" "umt5-xxl-enc-bf16.safetensors"

echo "[8/8] Wan2.2 CLIP vision (1.2GB)"
dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/open_clip_xlm_roberta_large_vit_huge_14.safetensors" \
   "$VOL/text_encoders" "open-clip-xlm-roberta-large-vit-huge-14_visual_fp16.safetensors"

echo "=== Models ready ==="
