#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# pod-setup.sh — AI Studio install on RunPod pod start
#
# Decoded from SETUP_SCRIPT env var → /workspace/setup.sh → run at container start.
# Image: nvidia/cuda:12.1.1-devel-ubuntu22.04 (no system cuDNN — avoids cuDNN 8 vs 9 conflict)
#
# CUDA is detected at runtime — correct torch wheel installed automatically.
# Everything persistent lives on /workspace (network volume, 150 GB).
# Container disk is ephemeral — only apt packages go there.
# On restart all steps are skipped (already on volume) → ~2 min start time.
#
# Volume layout:
#   /workspace/ComfyUI/          — ComfyUI git repo
#   /workspace/models/           — ALL models (checkpoints, vae, unet, etc.)
#   /workspace/venv/             — Python virtualenv + pip packages (persists)
#   /workspace/bin/ollama        — Ollama binary (persists)
#   /workspace/ollama_models/    — Ollama model files (persists)
#   /workspace/tts_output/       — TTS audio files
# ─────────────────────────────────────────────────────────────────────────────
set +e

HF_TOKEN="${HF_TOKEN:-}"
CIVITAI_TOKEN="${CIVITAI_TOKEN:-}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"

WORK="/workspace"
COMFY="$WORK/ComfyUI"
MODELS="$WORK/models"
VENV="$WORK/venv"
BIN="$WORK/bin"
LOG="$WORK/setup.log"

log() { echo "[$(date +%H:%M:%S)] $*"; }  # stdout → redirected to setup.log by DOCKER_CMD

# ── Detect CUDA version → pick correct torch wheel ───────────────────────────
# Use nvidia-smi (driver capability) NOT the image toolkit version.
# Torch bundles its own CUDA runtime — host driver must support that version.
# e.g. driver reports CUDA 12.0 → can't run cu121 → fall back to cu118.
detect_torch_cu() {
  local ver major minor
  # Driver-reported max CUDA version (the real constraint)
  ver=$(nvidia-smi 2>/dev/null | grep -oP "CUDA Version: \K[0-9.]+")
  # Fallback: CUDA toolkit version from image
  [[ -z "$ver" ]] && ver=$(python3 -c "
import json, glob
for f in glob.glob('/usr/local/cuda*/version.json'):
    d = json.load(open(f))
    print(d.get('cuda', {}).get('version', ''))
    break
" 2>/dev/null | grep -oP '^[0-9]+\.[0-9]+')
  [[ -z "$ver" ]] && ver=$(nvcc --version 2>/dev/null | grep -oP 'release \K[0-9]+\.[0-9]+' | head -1)

  major="${ver%%.*}"
  minor="${ver#*.}"; minor="${minor%%.*}"

  if   [[ "$major" == "12" && "${minor:-0}" -ge 8 ]]; then echo "cu128"
  elif [[ "$major" == "12" && "${minor:-0}" -ge 1 ]]; then echo "cu121"
  # NOTE: cu124 deliberately skipped — torch cu124 bundles cuDNN 9.1.9 which fails to
  # initialize (CUDNN_STATUS_NOT_INITIALIZED) on pods with system cuDNN 8 or cu121.
  # cu121 bundles cuDNN 9.1.0 which works correctly on all tested A100/4090 pods.
  else                                                      echo "cu118"   # CUDA 12.0 or 11.x driver
  fi
}

log "=== AI Studio startup ==="
mkdir -p "$MODELS/"{checkpoints,loras,vae,text_encoders,diffusion_models,clip,unet} \
         "$BIN" "$WORK/ollama_models" "$WORK/tts_output"

# Detect CUDA once at startup — used for torch install and re-pin checks
TORCH_CU=$(detect_torch_cu)
log "CUDA driver → torch ${TORCH_CU}"

# ── 1. System deps ────────────────────────────────────────────────────────────
log "Installing system deps..."
apt-get update -qq
apt-get install -y -qq ffmpeg libsndfile1 git wget curl python3-venv zstd aria2 2>/dev/null
log "  ✓ System deps ready"

# ── 2. Python venv on volume ──────────────────────────────────────────────────
if [ ! -f "$VENV/bin/python" ]; then
  log "Creating Python venv at $VENV..."
  python3 -m venv "$VENV"
fi
PY="$VENV/bin/python"
PIP="$VENV/bin/pip"

# ── 3. Install torch into venv (CUDA version detected at runtime) ─────────────
# Must happen BEFORE any ComfyUI requirements install to avoid CUDA version conflicts.
if ! "$PY" -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
  log "Installing torch ${TORCH_CU} into venv..."
  "$PIP" install -q torch torchvision torchaudio \
    --index-url "https://download.pytorch.org/whl/${TORCH_CU}" 2>/dev/null
  "$PY" -c "import torch; print('  torch', torch.__version__, 'CUDA:', torch.cuda.get_device_name(0))" \
    2>/dev/null && log "  ✓ torch ${TORCH_CU} + CUDA OK" || log "  ✗ torch CUDA check failed"
else
  log "  ✓ torch already in venv with CUDA"
fi

# ── 4. ComfyUI ────────────────────────────────────────────────────────────────
if [ ! -d "$COMFY/.git" ]; then
  log "Cloning ComfyUI..."
  git clone -q https://github.com/comfyanonymous/ComfyUI "$COMFY"
else
  log "ComfyUI exists — pulling updates..."
  git -C "$COMFY" pull -q || true
fi

# Remove comfy-kitchen and comfy-aimdo from requirements BEFORE installing.
# These packages ship CUDA extensions that may conflict with the venv torch build.
sed -i '/comfy-kitchen/d' "$COMFY/requirements.txt" 2>/dev/null || true
log "  ✓ comfy-kitchen excluded from requirements (comfy-aimdo kept — needed by main.py)"

# ── 5. Python packages into venv ─────────────────────────────────────────────
if ! "$PY" -c "import aiohttp" 2>/dev/null; then
  log "Installing Python packages into venv..."
  # Strip torch/torchvision/torchaudio from requirements — already pinned above
  grep -vE '^torch(vision|audio)?($|[>=< !])' "$COMFY/requirements.txt" > /tmp/req_no_torch.txt
  "$PIP" install -q -r /tmp/req_no_torch.txt 2>/dev/null
  "$PIP" install -q \
    sqlalchemy alembic pydantic \
    flask flask-cors edge-tts pydub \
    av torchsde kornia spandrel \
    accelerate imageio imageio-ffmpeg tqdm \
    huggingface_hub hf_transfer \
    --ignore-installed blinker 2>/dev/null
  log "  ✓ Python packages installed"
else
  log "  ✓ Python packages already in venv"
fi

# Register torch's cuDNN path in ldconfig so it's found before any system cuDNN
# (LD_LIBRARY_PATH alone can be unreliable across exec/fork boundaries)
echo "$VENV/lib/python3.10/site-packages/nvidia/cudnn/lib" > /etc/ld.so.conf.d/0-torch-cudnn.conf
ldconfig 2>/dev/null || true

# Re-pin torch after all installs — requirements or custom nodes may have overwritten it
CURRENT_TORCH=$("$PY" -c "import torch; print(torch.__version__)" 2>/dev/null || echo "")
if [[ "$CURRENT_TORCH" != *"${TORCH_CU#cu}"* ]]; then
  log "Re-pinning torch ${TORCH_CU} (was: ${CURRENT_TORCH:-not installed})..."
  "$PIP" install -q torch torchvision torchaudio \
    --index-url "https://download.pytorch.org/whl/${TORCH_CU}" 2>/dev/null
  log "  ✓ torch re-pinned"
else
  log "  ✓ torch ${CURRENT_TORCH} still correct"
fi

# ── 6. Custom nodes ───────────────────────────────────────────────────────────
log "Installing custom nodes..."
mkdir -p "$COMFY/custom_nodes"
cd "$COMFY/custom_nodes"
install_node() {
  local repo="$1" name; name=$(basename "$repo")
  if [ ! -d "$name/.git" ]; then
    git clone -q "$repo" && log "  ✓ $name (cloned)"
    [ -f "$name/requirements.txt" ] && "$PIP" install -q -r "$name/requirements.txt" 2>/dev/null || true
  else
    git -C "$name" pull -q && log "  ↺ $name (updated)"
  fi
}
install_node "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite"
install_node "https://github.com/kijai/ComfyUI-WanVideoWrapper"

# ── 7. ComfyUI extra_model_paths.yaml → /workspace/models ────────────────────
cat > "$COMFY/extra_model_paths.yaml" << YAMLEOF
comfyui:
    base_path: $MODELS
    checkpoints: checkpoints/
    clip: clip/
    clip_vision: clip_vision/
    configs: configs/
    controlnet: controlnet/
    diffusion_models: diffusion_models/
    embeddings: embeddings/
    loras: loras/
    text_encoders: text_encoders/
    unet: unet/
    vae: vae/
    upscale_models: upscale_models/
YAMLEOF
log "  ✓ extra_model_paths.yaml → $MODELS"

# ── 8. TTS server ─────────────────────────────────────────────────────────────
cat > "$WORK/tts_server.py" << 'TTSEOF'
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os, uuid, asyncio

app = Flask(__name__)
CORS(app)
OUT = "/workspace/tts_output"
os.makedirs(OUT, exist_ok=True)

VOICE_MAP = {
    "default":  "en-US-JennyNeural",
    "female_1": "en-US-JennyNeural",
    "female_2": "en-GB-SoniaNeural",
    "male_1":   "en-US-GuyNeural",
    "male_2":   "en-GB-RyanNeural",
    "child":    "en-US-AnaNeural",
}

@app.route("/health")
def health():
    return jsonify({"status": "ok", "engine": "edge-tts"})

@app.route("/api/tts/status")
def status():
    return jsonify({"status": "ready", "engine": "edge-tts", "voices": list(VOICE_MAP.keys())})

@app.route("/api/tts/generate", methods=["POST"])
def generate():
    data = request.get_json() or {}
    text = data.get("text", "")
    voice_key = data.get("voice", "default")
    voice = VOICE_MAP.get(voice_key, VOICE_MAP["default"])
    gid = str(uuid.uuid4())[:8]
    mp3 = f"{OUT}/{gid}.mp3"; wav = f"{OUT}/{gid}.wav"
    try:
        import edge_tts
        from pydub import AudioSegment
        async def _synth():
            await edge_tts.Communicate(text, voice).save(mp3)
        asyncio.run(_synth())
        seg = AudioSegment.from_mp3(mp3); seg.export(wav, format="wav"); os.remove(mp3)
        return jsonify({"success": True, "audio_path": f"/api/tts/audio/{gid}.wav", "duration_ms": len(seg)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/tts/audio/<path:filename>")
def audio(filename):
    return send_file(f"{OUT}/{filename}")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
TTSEOF

# ── 9. Start services ─────────────────────────────────────────────────────────
pkill -9 -f 'main.py' 2>/dev/null || true
pkill -9 -f 'tts_server.py' 2>/dev/null || true
pkill -9 -f 'ollama serve' 2>/dev/null || true
fuser -k 8188/tcp 5000/tcp 11434/tcp 2>/dev/null || true
sleep 2

log "Starting ComfyUI..."
# Wrapper ensures LD_LIBRARY_PATH is always set — survives restarts.
# Prioritizes torch's bundled cuDNN 9 over system cuDNN 8 (in nvidia/cuda:*-cudnn8* images).
cat > "$WORK/start-comfyui.sh" << 'WRAPEOF'
#!/usr/bin/env bash
VENV=/workspace/venv
TORCH_NV="$VENV/lib/python3.10/site-packages/nvidia"
export LD_LIBRARY_PATH="${TORCH_NV}/cudnn/lib:${TORCH_NV}/cuda_runtime/lib:${TORCH_NV}/cublas/lib:${TORCH_NV}/cufft/lib:${LD_LIBRARY_PATH:-}"
cd /workspace/ComfyUI
exec "$VENV/bin/python" main.py \
  --listen 0.0.0.0 --port 8188 \
  --extra-model-paths-config extra_model_paths.yaml "$@"
WRAPEOF
chmod +x "$WORK/start-comfyui.sh"
nohup "$WORK/start-comfyui.sh" > "$WORK/comfyui.log" 2>&1 &
disown $!
log "  ✓ ComfyUI started"

log "Starting TTS server..."
nohup "$PY" "$WORK/tts_server.py" > "$WORK/tts.log" 2>&1 &
disown $!
log "  ✓ TTS started on :5000"

log "Starting Ollama..."
export PATH="$BIN:$PATH"
export OLLAMA_HOST=0.0.0.0
export OLLAMA_MODELS="$WORK/ollama_models"
if [ ! -f "$BIN/ollama" ]; then
  curl -fsSL https://ollama.com/install.sh | sh > /dev/null 2>&1 || true
  [ -f "/usr/local/bin/ollama" ] && cp /usr/local/bin/ollama "$BIN/ollama" || true
fi
nohup "$BIN/ollama" serve > "$WORK/ollama.log" 2>&1 &
disown $!
sleep 3
if "$BIN/ollama" list 2>/dev/null | grep -q "^${OLLAMA_MODEL}"; then
  log "  ✓ Ollama $OLLAMA_MODEL already on volume"
else
  nohup "$BIN/ollama" pull "$OLLAMA_MODEL" > "$WORK/ollama_pull.log" 2>&1 &
  log "  ↓ Ollama pulling $OLLAMA_MODEL..."
fi

# ── 10. Model downloads to /workspace/models (skip if already present) ────────
DL="$MODELS"

file_ok() { local s; s=$(stat -c%s "$1" 2>/dev/null || echo 0); [ "$s" -ge "$2" ]; }

# Fast HuggingFace download via hf_transfer (Rust-based, near-gigabit on RunPod)
# Uses /workspace/hf_tmp as staging — container disk (/tmp) too small for large models
HF_TMP="$WORK/hf_tmp"
mkdir -p "$HF_TMP"

hf_download() {
  local repo="$1" hf_path="$2" out="$3" min="${4:-100000000}"
  local name; name=$(basename "$out")
  file_ok "$out" "$min" && log "  ✓ SKIP $name ($(du -sh "$out" 2>/dev/null | cut -f1))" && return 0
  log "  ↓ $name..."
  local tmpdir; tmpdir=$(mktemp -d "${HF_TMP}/hf_XXXXXX")
  HF_HUB_ENABLE_HF_TRANSFER=1 HF_TOKEN="$HF_TOKEN" \
  "$PY" - <<PYEOF && log "  ✓ $name" || log "  ✗ $name FAILED"
import os, shutil
os.environ['HF_HUB_ENABLE_HF_TRANSFER'] = '1'
from huggingface_hub import hf_hub_download
p = hf_hub_download('${repo}', '${hf_path}',
    token=os.environ.get('HF_TOKEN') or None,
    local_dir='${tmpdir}')
shutil.move(p, '${out}')
PYEOF
  rm -rf "$tmpdir"
}

# Fast CivitAI download via aria2c with 16 parallel connections
civitai_download() {
  local vid="$1" out="$2" min="${3:-100000000}"
  local name; name=$(basename "$out")
  file_ok "$out" "$min" && log "  ✓ SKIP $name ($(du -sh "$out" 2>/dev/null | cut -f1))" && return 0
  log "  ↓ $name (CivitAI)..."
  aria2c -x 16 -s 16 -q --continue=true \
    --dir="$(dirname "$out")" --out="${name}.tmp" \
    "https://civitai.com/api/download/models/${vid}?token=${CIVITAI_TOKEN}" \
    && mv "$(dirname "$out")/${name}.tmp" "$out" && log "  ✓ $name" \
    || log "  ✗ $name FAILED"
}

log ""
log "╔══ Model inventory ($MODELS) ═══════════════════════════╗"
check_model() {
  local label="$1" path="$2" min="$3"
  if file_ok "$path" "$min"; then log "  ✓ $label  ($(du -sh "$path" 2>/dev/null | cut -f1))"
  elif [ -f "$path.tmp" ]; then log "  ↺ $label  (partial — will resume)"
  else log "  ✗ $label  (missing — will download)"; fi
}
check_model "wan2.1-t2v-1.3b"         "$DL/diffusion_models/wan2.1-t2v-1.3b-fp16.safetensors"    2000000000
check_model "wan2.1-i2v-14b-480p-fp8" "$DL/diffusion_models/wan2.1-i2v-14b-480p-fp8.safetensors" 8000000000
check_model "umt5-xxl-fp16"           "$DL/text_encoders/umt5-xxl-fp16.safetensors"               9000000000
check_model "wan_2.1_vae"             "$DL/vae/wan_2.1_vae.safetensors"                           200000000
check_model "animagineXL31"           "$DL/checkpoints/animagineXL31.safetensors"                 5000000000
check_model "juggernautXL_v9"         "$DL/checkpoints/juggernautXL_v9.safetensors"               5000000000
check_model "flux1-schnell-fp8"       "$DL/unet/flux1-schnell-fp8.safetensors"                   15000000000
check_model "clip_l"                  "$DL/clip/clip_l.safetensors"                               200000000
check_model "t5xxl_fp8"               "$DL/clip/t5xxl_fp8_e4m3fn.safetensors"                    4000000000
check_model "ae (FLUX VAE)"           "$DL/vae/ae.safetensors"                                    300000000
log "╚══════════════════════════════════════════════════════╝"
log ""
log "Starting model downloads in background..."

hf_download "Comfy-Org/Wan_2.1_ComfyUI_repackaged" \
  "split_files/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors" \
  "$DL/diffusion_models/wan2.1-t2v-1.3b-fp16.safetensors" 2000000000 &

hf_download "Comfy-Org/Wan_2.1_ComfyUI_repackaged" \
  "split_files/diffusion_models/wan2.1_i2v_480p_14B_fp8_e4m3fn.safetensors" \
  "$DL/diffusion_models/wan2.1-i2v-14b-480p-fp8.safetensors" 8000000000 &

hf_download "Comfy-Org/Wan_2.1_ComfyUI_repackaged" \
  "split_files/text_encoders/umt5_xxl_fp16.safetensors" \
  "$DL/text_encoders/umt5-xxl-fp16.safetensors" 9000000000 &

hf_download "Comfy-Org/Wan_2.1_ComfyUI_repackaged" \
  "split_files/vae/wan_2.1_vae.safetensors" \
  "$DL/vae/wan_2.1_vae.safetensors" 200000000 &

hf_download "cagliostrolab/animagine-xl-3.1" \
  "animagine-xl-3.1.safetensors" \
  "$DL/checkpoints/animagineXL31.safetensors" 5000000000 &

civitai_download "782002" "$DL/checkpoints/juggernautXL_v9.safetensors" 5000000000 &

hf_download "Comfy-Org/flux1-schnell" \
  "flux1-schnell-fp8.safetensors" \
  "$DL/unet/flux1-schnell-fp8.safetensors" 15000000000 &

hf_download "comfyanonymous/flux_text_encoders" \
  "clip_l.safetensors" \
  "$DL/clip/clip_l.safetensors" 200000000 &

hf_download "comfyanonymous/flux_text_encoders" \
  "t5xxl_fp8_e4m3fn.safetensors" \
  "$DL/clip/t5xxl_fp8_e4m3fn.safetensors" 4000000000 &

hf_download "black-forest-labs/FLUX.1-schnell" \
  "ae.safetensors" \
  "$DL/vae/ae.safetensors" 300000000 &

wait
log "=== All model downloads complete ==="
