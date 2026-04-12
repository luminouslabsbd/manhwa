#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# pod-setup.sh — Extra services for ai-dock/comfyui pods
#
# ComfyUI is already managed by the ai-dock image's supervisor.
# This script only handles:
#   1. Ollama binary + model (persisted to /workspace/bin + /workspace/ollama_models)
#   2. TTS server (edge-tts via Flask, /workspace/tts_server.py)
#   3. Extra ComfyUI custom nodes (WanVideoWrapper, VideoHelperSuite)
#   4. Model downloads to /workspace/storage/stable_diffusion/models/
#      (ai-dock's standard volume path — ComfyUI reads from here by default)
#
# Runs in background at pod start. Safe to re-run — skips existing files.
# ─────────────────────────────────────────────────────────────────────────────
set +e

HF_TOKEN="${HF_TOKEN:-}"
CIVITAI_TOKEN="${CIVITAI_TOKEN:-}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"

WORK="/workspace"
LOG="$WORK/setup.log"

# ai-dock/comfyui standard volume paths
# ComfyUI reads models from these locations via its extra_model_paths config
MODELS="$WORK/storage/stable_diffusion/models"
COMFY_NODES="$WORK/comfyui/custom_nodes"
OLLAMA_BIN="$WORK/bin"
OLLAMA_MODELS="$WORK/ollama_models"

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

log "=== pod-setup.sh starting ==="
mkdir -p "$MODELS/"{checkpoints,loras,vae,text_encoders,diffusion_models,clip,unet} \
         "$COMFY_NODES" "$OLLAMA_BIN" "$OLLAMA_MODELS" "$WORK/tts_output" "$WORK/bin"

export PATH="$OLLAMA_BIN:$PATH"

# ── 1. Wait for ai-dock ComfyUI to fully start ────────────────────────────────
log "Waiting for ai-dock ComfyUI supervisor to initialize..."
sleep 15

# ── 2. Custom nodes (on volume — persist across restarts) ────────────────────
log "Installing custom nodes to $COMFY_NODES..."

install_node() {
  local repo="$1" name
  name=$(basename "$repo")
  if [ ! -d "$COMFY_NODES/$name/.git" ]; then
    git clone -q "$repo" "$COMFY_NODES/$name" && log "  ✓ $name (cloned)"
    [ -f "$COMFY_NODES/$name/requirements.txt" ] && \
      pip install -q -r "$COMFY_NODES/$name/requirements.txt" 2>/dev/null || true
  else
    git -C "$COMFY_NODES/$name" pull -q && log "  ↺ $name (updated)"
  fi
}

install_node "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite"
install_node "https://github.com/kijai/ComfyUI-WanVideoWrapper"

# ── 3. TTS server ─────────────────────────────────────────────────────────────
if [ ! -f "$WORK/tts_server.py" ]; then
  log "Writing TTS server..."
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
    mp3 = f"{OUT}/{gid}.mp3"
    wav = f"{OUT}/{gid}.wav"
    try:
        import edge_tts
        from pydub import AudioSegment
        async def _synth():
            tts = edge_tts.Communicate(text, voice)
            await tts.save(mp3)
        asyncio.run(_synth())
        seg = AudioSegment.from_mp3(mp3)
        seg.export(wav, format="wav")
        os.remove(mp3)
        return jsonify({"success": True, "audio_path": f"/api/tts/audio/{gid}.wav", "duration_ms": len(seg)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/tts/audio/<path:filename>")
def audio(filename):
    return send_file(f"{OUT}/{filename}")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
TTSEOF
fi

pip install -q flask flask-cors edge-tts pydub 2>/dev/null
pkill -f 'tts_server.py' 2>/dev/null || true
nohup python3 "$WORK/tts_server.py" > "$WORK/tts.log" 2>&1 &
disown $!
log "  ✓ TTS server started on :5000"

# ── 4. Ollama on volume ───────────────────────────────────────────────────────
if [ ! -f "$OLLAMA_BIN/ollama" ]; then
  log "Installing Ollama to $OLLAMA_BIN (volume)..."
  curl -fsSL https://ollama.com/install.sh | sh > /dev/null 2>&1 || true
  [ -f "/usr/local/bin/ollama" ] && cp /usr/local/bin/ollama "$OLLAMA_BIN/ollama" || true
  log "  ✓ Ollama installed"
else
  log "  ✓ Ollama already on volume"
fi

export OLLAMA_HOST=0.0.0.0
export OLLAMA_MODELS="$OLLAMA_MODELS"
pkill -f 'ollama serve' 2>/dev/null || true
sleep 1
nohup "$OLLAMA_BIN/ollama" serve > "$WORK/ollama.log" 2>&1 &
disown $!
sleep 3
if "$OLLAMA_BIN/ollama" list 2>/dev/null | grep -q "^${OLLAMA_MODEL}"; then
  log "  ✓ Ollama $OLLAMA_MODEL already on volume — skip pull"
else
  nohup "$OLLAMA_BIN/ollama" pull "$OLLAMA_MODEL" > "$WORK/ollama_pull.log" 2>&1 &
  log "  ↓ Ollama pulling $OLLAMA_MODEL in background..."
fi

# ── 5. Model downloads to ai-dock volume path ─────────────────────────────────
DL="$MODELS"

file_ok() {
  local size; size=$(stat -c%s "$1" 2>/dev/null || echo 0)
  [ "$size" -ge "$2" ]
}

hf_download() {
  local url="$1" out="$2" min="${3:-100000000}"
  local name; name=$(basename "$out")
  if file_ok "$out" "$min"; then
    log "  ✓ SKIP $name ($(du -sh "$out" 2>/dev/null | cut -f1))"
    return 0
  fi
  local resume_flag=""
  [ -f "$out.tmp" ] && resume_flag="-c" && log "  ↺ RESUME $name..." || log "  ↓ DL $name..."
  wget -q $resume_flag --header="Authorization: Bearer $HF_TOKEN" -O "$out.tmp" "$url" && \
    mv "$out.tmp" "$out" && log "  ✓ $name done" || { log "  ✗ $name FAILED"; rm -f "$out.tmp"; }
}

civitai_download() {
  local version_id="$1" out="$2" min="${3:-100000000}"
  local name; name=$(basename "$out")
  if file_ok "$out" "$min"; then
    log "  ✓ SKIP $name ($(du -sh "$out" 2>/dev/null | cut -f1))"
    return 0
  fi
  local resume_flag=""
  [ -f "$out.tmp" ] && resume_flag="-c" && log "  ↺ RESUME $name..." || log "  ↓ DL $name (CivitAI)..."
  wget -q $resume_flag "https://civitai.com/api/download/models/$version_id?token=$CIVITAI_TOKEN" \
    -O "$out.tmp" && mv "$out.tmp" "$out" && log "  ✓ $name done" || { log "  ✗ $name FAILED"; rm -f "$out.tmp"; }
}

log ""
log "╔══ Model inventory ($MODELS) ══════════════════╗"
check_model() {
  local label="$1" path="$2" min="$3"
  if file_ok "$path" "$min"; then
    log "  ✓ $label  ($(du -sh "$path" 2>/dev/null | cut -f1))"
  elif [ -f "$path.tmp" ]; then
    log "  ↺ $label  (partial)"
  else
    log "  ✗ $label  (missing)"
  fi
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
log "╚═══════════════════════════════════════════════╝"
log ""

log "Downloading missing models to $MODELS (background)..."

hf_download \
  "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors" \
  "$DL/diffusion_models/wan2.1-t2v-1.3b-fp16.safetensors" 2000000000 &

hf_download \
  "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_i2v_480p_14B_fp8_e4m3fn.safetensors" \
  "$DL/diffusion_models/wan2.1-i2v-14b-480p-fp8.safetensors" 8000000000 &

hf_download \
  "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors" \
  "$DL/text_encoders/umt5-xxl-fp16.safetensors" 9000000000 &

hf_download \
  "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors" \
  "$DL/vae/wan_2.1_vae.safetensors" 200000000 &

hf_download \
  "https://huggingface.co/cagliostrolab/animagine-xl-3.1/resolve/main/animagine-xl-3.1.safetensors" \
  "$DL/checkpoints/animagineXL31.safetensors" 5000000000 &

civitai_download "782002" "$DL/checkpoints/juggernautXL_v9.safetensors" 5000000000 &

hf_download \
  "https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors" \
  "$DL/unet/flux1-schnell-fp8.safetensors" 15000000000 &

hf_download \
  "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors" \
  "$DL/clip/clip_l.safetensors" 200000000 &

hf_download \
  "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors" \
  "$DL/clip/t5xxl_fp8_e4m3fn.safetensors" 4000000000 &

hf_download \
  "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors" \
  "$DL/vae/ae.safetensors" 300000000 &

wait
log "=== All model downloads complete ==="
log "Setup done. Volume layout:"
log "  ComfyUI:       managed by ai-dock supervisor"
log "  Models:        $MODELS"
log "  Custom nodes:  $COMFY_NODES"
log "  Ollama:        $OLLAMA_BIN/ollama  models: $OLLAMA_MODELS"
log "  TTS:           /workspace/tts_server.py  :5000"
