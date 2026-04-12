#!/bin/bash
# Downloads models on cold start. Skips files that already exist (warm worker).
# HF_TOKEN env var must be set for gated repos (FLUX VAE).
set -e

dl() {
  # Usage: dl URL DEST_DIR FILENAME [MIN_SIZE_BYTES]
  local url="$1" dir="$2" name="$3" min_size="${4:-1000}"
  local path="$dir/$name"
  if [ -f "$path" ] && [ "$(stat -c%s "$path" 2>/dev/null || stat -f%z "$path" 2>/dev/null)" -gt "$min_size" ]; then
    echo "  SKIP $name (already exists)"
    return 0
  fi
  echo "  DOWNLOADING $name ..."
  mkdir -p "$dir"
  aria2c -x 8 -s 8 -k 1M --quiet=true "$url" -d "$dir" -o "$name" "${@:5}"
  echo "  DONE $name ($(du -h "$path" | cut -f1))"
}

dlg() {
  # Same as dl but adds auth header for gated HuggingFace repos
  dl "$1" "$2" "$3" "$4" --header="Authorization: Bearer $HF_TOKEN"
}

echo "=== Model Download (cold start) ==="
START=$(date +%s)

# ─── FLUX models ─────────────────────────────────────────────────────
echo "[1/7] FLUX UNET (fp8, 17GB)"
dl "https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors" \
   /ComfyUI/models/unet flux1-schnell-fp8.safetensors 1000000

echo "[2/7] T5XXL fp8 (4.6GB)"
dl "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors" \
   /ComfyUI/models/clip t5xxl_fp8_e4m3fn.safetensors 1000000

echo "[3/7] CLIP-L (235MB)"
dl "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors" \
   /ComfyUI/models/clip clip_l.safetensors 1000000

echo "[4/7] FLUX VAE (320MB, gated)"
dlg "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors" \
    /ComfyUI/models/vae ae.safetensors 1000000

# ─── Wan2.2 models ───────────────────────────────────────────────────
echo "[5/7] Wan2.2 TI2V-5B (9.4GB)"
dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors" \
   /ComfyUI/models/diffusion_models/WanVideo/2_2 wan2.2_ti2v_5B_fp16.safetensors 1000000

echo "[6/7] Wan2.2 VAE (1.4GB)"
dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors" \
   /ComfyUI/models/vae/wanvideo Wan2_2_VAE_bf16.safetensors 1000000

echo "[7/7] Wan2.2 Text Encoders (~12GB)"
dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors" \
   /ComfyUI/models/text_encoders umt5-xxl-enc-bf16.safetensors 1000000

dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/open_clip_xlm_roberta_large_vit_huge_14.safetensors" \
   /ComfyUI/models/text_encoders open-clip-xlm-roberta-large-vit-huge-14_visual_fp16.safetensors 1000000

END=$(date +%s)
echo ""
echo "=== All models ready in $((END - START))s ==="
du -sh /ComfyUI/models/ 2>/dev/null || true
