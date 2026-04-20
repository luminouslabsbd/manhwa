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

# Component gates — default all-on for backward compat. The pod-create API sets
# these per user's wizard selection so we skip unused installs + downloads.
#   INSTALL_COMFYUI  — ComfyUI + torch + Python packages + custom nodes
#   INSTALL_TTS      — master switch for ALL TTS engines selected below
#   INSTALL_OLLAMA   — Ollama binary + model pull (port 11434)
#   INSTALL_SDXL     — SDXL checkpoints: animagine, juggernaut (~10 GB)
#   INSTALL_FLUX     — FLUX.1-schnell + CLIPs + AE VAE (~20 GB)
#   INSTALL_VIDEO    — LTX Video 13B 0.9.7 distilled + t5xxl fp16 (~37 GB)
#   TTS_ENGINES      — CSV of TTS backends to install side-by-side on this pod.
#                      Each engine binds a dedicated port so they coexist:
#                        edge-tts        → 5000  Microsoft Edge TTS (no GPU, no weights)
#                        xtts-v2         → 5001  Coqui XTTS v2 (~2 GB weights; torch)
#                        whisperspeech   → 5002  Collabora WhisperSpeech (torch)
#                        mms-tts-bengali → 5003  Meta MMS Bengali (torch + transformers)
#                      Back-compat: if TTS_ENGINES is empty but the legacy
#                      TTS_ENGINE (singular) is set, we treat it as a one-item list.
INSTALL_COMFYUI="${INSTALL_COMFYUI:-1}"
INSTALL_TTS="${INSTALL_TTS:-1}"
INSTALL_OLLAMA="${INSTALL_OLLAMA:-1}"
INSTALL_SDXL="${INSTALL_SDXL:-1}"
INSTALL_FLUX="${INSTALL_FLUX:-1}"
INSTALL_VIDEO="${INSTALL_VIDEO:-1}"
TTS_ENGINES="${TTS_ENGINES:-${TTS_ENGINE:-edge-tts}}"

# Helper: does the CSV contain a given engine?
tts_wants() { [[ ",$TTS_ENGINES," == *",$1,"* ]]; }

# XTTS, WhisperSpeech and MMS all need torch; edge-tts is CPU-only Flask.
TTS_NEEDS_TORCH=0
if [ "$INSTALL_TTS" = "1" ] && { tts_wants xtts-v2 || tts_wants mms-tts-bengali || tts_wants whisperspeech; }; then
  TTS_NEEDS_TORCH=1
fi

# Port assignments are stable so the app's TTS picker can construct the right
# URL from (pod id, engine) without consulting the pod itself.
tts_port() {
  case "$1" in
    edge-tts)        echo 5000;;
    xtts-v2)         echo 5001;;
    whisperspeech)   echo 5002;;
    mms-tts-bengali) echo 5003;;
    *)               echo "";;
  esac
}

# Derived: venv+torch+pip are needed if ComfyUI or TTS is installed
NEED_VENV=0
[[ "$INSTALL_COMFYUI" = "1" || "$INSTALL_TTS" = "1" ]] && NEED_VENV=1

WORK="/workspace"
COMFY="$WORK/ComfyUI"
MODELS="$WORK/models"
VENV="$WORK/venv"
BIN="$WORK/bin"
LOG="$WORK/setup.log"

log() { echo "[$(date +%H:%M:%S)] $*"; }  # stdout → redirected to setup.log by DOCKER_CMD

# ── torch wheel target — always cu128 ────────────────────────────────────────
# History (all bugs we've hit on prod; see commit log 2026-04-18/19):
#   • cu118 torch 2.7.1 bundles cuDNN 9.1.9 → CUDNN_STATUS_NOT_INITIALIZED on
#     driver 570+ (3090 with CUDA 12.9 driver). conv2d fails instantly.
#   • cu121 index stopped at torch 2.5.x — no 2.7.1 wheel.
#   • cu126 has torch 2.7.1 but also older cuDNN.
#   • cu128 has torch 2.7.1 WITH cuDNN 9.7.0.1 → initializes cleanly on 575+
#     drivers and is forward-compat onto all tested GPUs (3090, 4090, A100,
#     H100). Requires `pip install` WITH deps so nvidia-cusparselt-cu12 et al.
#     come along — don't use `--no-deps` on the first install.
detect_torch_cu() { echo "cu128"; }

# Pinned torch trio — all three MUST share the same +cuXXX local-version suffix
# or torchaudio fails to load libtorchaudio.so (CUDA mismatch), which in turn
# breaks any video custom node's import (previously ComfyUI-WanVideoWrapper,
# now ComfyUI-LTXVideo) and silently drops video generation back to plain
# SDXL img2img. We saw this in prod on 2026-04-18.
TORCH_VER="2.7.1"
TORCHVISION_VER="0.22.1"
TORCHAUDIO_VER="2.7.1"

log "=== AI Studio startup ==="
log "Components: comfyui=$INSTALL_COMFYUI tts=$INSTALL_TTS (engine=$TTS_ENGINE) ollama=$INSTALL_OLLAMA sdxl=$INSTALL_SDXL flux=$INSTALL_FLUX video=$INSTALL_VIDEO"
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
if [ "$NEED_VENV" = "1" ]; then
  if [ ! -f "$VENV/bin/python" ]; then
    log "Creating Python venv at $VENV..."
    python3 -m venv "$VENV"
  fi
  PY="$VENV/bin/python"
  PIP="$VENV/bin/pip"
else
  log "  (skip venv — no ComfyUI/TTS selected)"
  PY="python3"
  PIP="pip3"
fi

# ── 3. Install torch into venv (CUDA version detected at runtime) ─────────────
# Must happen BEFORE any ComfyUI requirements install to avoid CUDA version conflicts.
#
# CRITICAL: torch + torchvision + torchaudio must ALL share the same +cuXXX
# local-version suffix. If torchaudio ends up on a different cu than torch,
# libtorchaudio.so fails to load → video custom node import dies → video
# silently falls back to SDXL img2img. `--force-reinstall --no-deps` guarantees
# the trio stays in sync even if a later step (custom-node requirements) tries
# to "upgrade" torch.
torch_trio_ok() {
  "$PY" - <<'PYEOF' 2>/dev/null
import sys
try:
    import torch, torchvision, torchaudio
except Exception:
    sys.exit(1)
# Confirm all three share the same +cuXXX suffix
def cu(v): return v.split("+")[1] if "+" in v else ""
if not (cu(torch.__version__) == cu(torchvision.__version__) == cu(torchaudio.__version__)):
    sys.exit(2)
if not torch.cuda.is_available():
    sys.exit(3)
PYEOF
}
if [ "$INSTALL_COMFYUI" = "1" ]; then
  # torch_trio_ok checks suffix match, so a stale cu118 install from an older
  # pod will fail this and force a reinstall to cu128. Good.
  if torch_trio_ok && "$PY" -c "import torch; import sys; sys.exit(0 if '${TORCH_CU#cu}' in torch.__version__ else 1)" 2>/dev/null; then
    log "  ✓ torch trio already installed and matches ${TORCH_CU} ($("$PY" -c 'import torch;print(torch.__version__)'))"
  else
    log "Installing pinned torch trio ${TORCH_VER}/${TORCHVISION_VER}/${TORCHAUDIO_VER} (${TORCH_CU})..."
    # IMPORTANT: install WITH deps so nvidia-cudnn-cu12, nvidia-cusparselt-cu12,
    # nvidia-cublas-cu12, etc. get pulled in. cu128 torch dlopens libcusparseLt.so.0
    # at import time — without those sub-packages ComfyUI crashes immediately.
    "$PIP" install -q --force-reinstall \
      "torch==${TORCH_VER}" "torchvision==${TORCHVISION_VER}" "torchaudio==${TORCHAUDIO_VER}" \
      --index-url "https://download.pytorch.org/whl/${TORCH_CU}" 2>/dev/null
    if torch_trio_ok; then
      log "  ✓ torch trio installed: $("$PY" -c 'import torch,torchvision,torchaudio;print(torch.__version__,torchvision.__version__,torchaudio.__version__)')"
    else
      log "  ✗ torch trio mismatch after install — retrying with cu118 fallback"
      "$PIP" install -q --force-reinstall \
        "torch==${TORCH_VER}" "torchvision==${TORCHVISION_VER}" "torchaudio==${TORCHAUDIO_VER}" \
        --index-url "https://download.pytorch.org/whl/cu118" 2>/dev/null
      torch_trio_ok && log "  ✓ torch trio installed (cu118 fallback)" \
        || log "  ✗ torch trio STILL broken — video generation will fail"
    fi
  fi

  # Write a pip constraints file pinning torch* so downstream installs can't
  # drift it. Without this, packages like kornia / accelerate / torchsde pull
  # the latest torch from PyPI (often nightly) — that's what broke video gen
  # on the 2026-04-18 3090 pod. Used via `-c $TORCH_PINS` on every later pip
  # install in this script.
  TORCH_PINS=/tmp/torch_pins.txt
  cat > "$TORCH_PINS" <<PINS
torch==${TORCH_VER}
torchvision==${TORCHVISION_VER}
torchaudio==${TORCHAUDIO_VER}
PINS
fi

# ── 4. ComfyUI ────────────────────────────────────────────────────────────────
if [ "$INSTALL_COMFYUI" = "1" ]; then
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
fi

# ── 5. Python packages into venv ─────────────────────────────────────────────
if [ "$INSTALL_COMFYUI" = "1" ]; then
  if ! "$PY" -c "import aiohttp" 2>/dev/null; then
    log "Installing Python packages into venv..."
    # Strip torch/torchvision/torchaudio from requirements — already pinned above.
    # `-c $TORCH_PINS` additionally guarantees transitive deps (kornia,
    # torchsde, accelerate, spandrel …) can't upgrade torch to nightly.
    grep -vE '^torch(vision|audio)?($|[>=< !])' "$COMFY/requirements.txt" > /tmp/req_no_torch.txt
    "$PIP" install -q -c "$TORCH_PINS" -r /tmp/req_no_torch.txt 2>/dev/null
    "$PIP" install -q -c "$TORCH_PINS" \
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

  # Re-pin the full torch trio if requirements or custom nodes have touched it.
  # Test BOTH: the +cuXXX suffix matches AND all three libs agree (else
  # libtorchaudio.so would fail to load and break the video custom node).
  # WITH deps: ensures nvidia-cudnn/cusparselt/etc. match if they were replaced.
  if ! torch_trio_ok || ! "$PY" -c "import torch; import sys; sys.exit(0 if '${TORCH_CU#cu}' in torch.__version__ else 1)" 2>/dev/null; then
    CURRENT_TORCH=$("$PY" -c "import torch; print(torch.__version__)" 2>/dev/null || echo "none")
    log "Re-pinning torch trio (was: ${CURRENT_TORCH})..."
    "$PIP" install -q --force-reinstall \
      "torch==${TORCH_VER}" "torchvision==${TORCHVISION_VER}" "torchaudio==${TORCHAUDIO_VER}" \
      --index-url "https://download.pytorch.org/whl/${TORCH_CU}" 2>/dev/null
    torch_trio_ok && log "  ✓ torch trio re-pinned" || log "  ✗ trio re-pin failed"
  else
    log "  ✓ torch trio still in sync"
  fi

  # Sanity-gate: cuDNN must actually initialize, not just be loadable. We've
  # shipped broken pods where torch imported fine but conv2d failed with
  # CUDNN_STATUS_NOT_INITIALIZED because the bundled cuDNN didn't match the
  # host driver. Fail loudly at setup time so the pod page shows it RED,
  # instead of the user discovering it on their first generation.
  if ! "$PY" -c "import torch; x=torch.randn(1,3,4,4).cuda(); torch.nn.Conv2d(3,3,3).cuda()(x)" 2>/dev/null; then
    log "  ✗ WARNING: conv2d test failed (cuDNN may not initialize on this driver)"
    log "  ✗ This pod will fail image/video generation. Rebuild with a different GPU or torch wheel."
  else
    log "  ✓ cuDNN conv2d smoke test passed"
  fi
fi

# ── TTS engine installs (multi) ──────────────────────────────────────────────
# Each engine in TTS_ENGINES gets its deps installed independently. The torch
# stack is already in place if INSTALL_COMFYUI=1, and we lazy-install it in
# the first torch-needing branch below otherwise.
if [ "$INSTALL_TTS" = "1" ]; then
  log "TTS engines requested: $TTS_ENGINES"

  # torch for the torch-needing engines (once, regardless of which one triggered).
  if [ "$TTS_NEEDS_TORCH" = "1" ] && [ "$INSTALL_COMFYUI" != "1" ]; then
    if ! "$PY" -c "import torch" 2>/dev/null; then
      log "Installing torch for TTS (one-time)..."
      "$PIP" install -q torch torchaudio --index-url https://download.pytorch.org/whl/cu121 2>/dev/null
      log "  ✓ torch installed"
    fi
  fi

  if tts_wants edge-tts; then
    if ! "$PY" -c "import flask, edge_tts" 2>/dev/null; then
      log "Installing edge-tts..."
      "$PIP" install -q flask flask-cors edge-tts pydub --ignore-installed blinker 2>/dev/null
      log "  ✓ edge-tts deps installed"
    else
      log "  ✓ edge-tts already in venv"
    fi
  fi

  if tts_wants xtts-v2; then
    log "Installing Coqui XTTS v2 (~5 min + ~4 GB)..."
    # Pin to coqui-tts 0.24.3 + its dep tree. Key pins:
    #   transformers==4.45.2 — only release with both `isin_mps_friendly`
    #     (removed in 4.46) and `is_torch_greater_or_equal` (added later).
    #   numpy<2.0 — coqui-tts was built against 1.x; some transitive deps
    #     (thinc, scipy special.sph_legendre_p) raise "All ufuncs must have
    #     type numpy.ufunc. Received …" when numpy 2.x gets pulled in.
    # Critically we install coqui-tts with `--no-deps` so pip doesn't clobber
    # our pinned torch (cu128 2.7.1) with a newer torch that wants a driver
    # this host doesn't have. Hit this on pod mx6aj605jt9b0y (RTX 5090 w/
    # driver 570) where coqui-tts pulled torch 2.11.0+cu130 and CUDA init
    # failed with "NVIDIA driver too old (found 12080)".
    if ! "$PY" -c "from TTS.api import TTS" 2>/dev/null; then
      "$PIP" install -q --no-deps 'coqui-tts==0.24.3' 2>/dev/null
      # Install only the deps coqui-tts needs that AREN'T torch-family. The
      # grep strips torch/torchaudio/torchvision lines so our cu128 pin stays.
      TMPREQ=$(mktemp)
      "$PIP" show coqui-tts 2>/dev/null | awk -F': ' '/^Requires:/ {gsub(", ", "\n", $2); print $2}' \
        | grep -vE '^(torch|torchvision|torchaudio)$' > "$TMPREQ"
      # Include our top-level server deps + numpy pin.
      {
        cat "$TMPREQ"
        echo "flask"
        echo "flask-cors"
        echo "pydub"
        echo "numpy<2.0,>=1.25.2"
      } | "$PIP" install -q -r /dev/stdin --ignore-installed blinker 2>/dev/null
      rm -f "$TMPREQ"
    fi
    # Lock transformers trio to what 4.45.2 requires. Force-reinstall because
    # accelerate / other coqui-tts deps may have pulled a newer transformers
    # in before we pinned. If that install ended up half-done (no metadata),
    # wipe the transformers/tokenizers/huggingface_hub site-packages dirs
    # first so pip resolves cleanly from scratch.
    SP="$VENV/lib/python3.10/site-packages"
    if [ -d "$SP/transformers" ] && ! "$PY" -c "import transformers" 2>/dev/null; then
      log "  ↺ clobbering broken transformers install..."
      rm -rf "$SP"/transformers* "$SP"/tokenizers* "$SP"/huggingface_hub* 2>/dev/null
    fi
    "$PIP" install -q 'transformers==4.45.2' 'numpy<2.0,>=1.25.2' 2>/dev/null
    export COQUI_TOS_AGREED=1
    log "  ✓ XTTS v2 deps installed"
  fi

  if tts_wants whisperspeech; then
    log "Installing WhisperSpeech..."
    # Undeclared runtime deps of whisperspeech.pipeline — all three surfaced
    # on live pods and needed manual patches before pinning them here:
    #   ipython     — Pipeline uses IPython display helpers.
    #   webdataset  — Pipeline pulls dataset loaders from webdataset.
    #   soundfile   — our server writes wav with sf.write to dodge torchcodec.
    "$PIP" install -q flask flask-cors whisperspeech ipython webdataset soundfile pydub \
      --ignore-installed blinker 2>/dev/null
    log "  ✓ WhisperSpeech deps installed"
  fi

  if tts_wants mms-tts-bengali; then
    log "Installing MMS Bengali..."
    "$PIP" install -q flask flask-cors transformers scipy pydub --ignore-installed blinker 2>/dev/null
    log "  ✓ MMS deps installed"
  fi

  # torchaudio cleanup — after all the deps land, multiple torchaudio copies
  # coexist (cu121 from our initial install + whatever coqui-tts pulled in),
  # and torchaudio's loader grabs paths[0] which is the stale pre-abi3 .so.
  # Delete the old-format files so only the ABI3 ones remain. If there are
  # no ABI3 files at all (pure cu121 install), this is a no-op.
  TA_LIB="$VENV/lib/python3.10/site-packages/torchaudio/lib"
  if [ -d "$TA_LIB" ] && ls "$TA_LIB"/*.abi3.so >/dev/null 2>&1; then
    log "Cleaning stale pre-ABI3 torchaudio .so files..."
    rm -f "$TA_LIB"/_torchaudio.so "$TA_LIB"/_torchaudio_sox.so \
          "$TA_LIB"/libtorchaudio.so "$TA_LIB"/libtorchaudio_sox.so \
          "$TA_LIB"/libctc_prefix_decoder.so "$TA_LIB"/pybind11_prefixctc.so 2>/dev/null || true
    if "$PY" -c "import torchaudio" 2>/dev/null; then
      log "  ✓ torchaudio imports cleanly"
    else
      log "  ✗ torchaudio still not importable after cleanup — pod may have GPU/cuDNN mismatch"
    fi
  fi
fi

# ── 6. Custom nodes ───────────────────────────────────────────────────────────
if [ "$INSTALL_COMFYUI" = "1" ]; then
  log "Installing custom nodes..."
  mkdir -p "$COMFY/custom_nodes"
  cd "$COMFY/custom_nodes"
  install_node() {
    local repo="$1" name; name=$(basename "$repo")
    if [ ! -d "$name/.git" ]; then
      git clone -q "$repo" && log "  ✓ $name (cloned)"
    else
      git -C "$name" pull -q && log "  ↺ $name (updated)"
    fi
    # Install Python deps. Two guards: strip torch* lines from requirements,
    # and apply the $TORCH_PINS constraints file so transitive deps can't
    # upgrade torch either.
    if [ -f "$name/requirements.txt" ]; then
      grep -vE '^(torch|torchvision|torchaudio)($|[>=< !])' "$name/requirements.txt" > /tmp/req_${name}.txt
      if "$PIP" install -q -c "$TORCH_PINS" -r /tmp/req_${name}.txt 2>/tmp/pip_err_${name}.log; then
        log "    ✓ $name requirements installed"
      else
        log "    ✗ $name requirements install FAILED (see /tmp/pip_err_${name}.log)"
      fi
    fi
  }
  # VideoHelperSuite always; LTX-Video custom node only when video selected
  install_node "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite"
  [ "$INSTALL_VIDEO" = "1" ] && install_node "https://github.com/Lightricks/ComfyUI-LTXVideo"
fi

# ── 7. ComfyUI extra_model_paths.yaml → /workspace/models ────────────────────
if [ "$INSTALL_COMFYUI" = "1" ]; then
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
fi

# ── 8. TTS server ─────────────────────────────────────────────────────────────
# Writes tts_server.py matching the selected engine. All engines expose the
# same HTTP contract so the app's src/lib/tts.ts doesn't need to know which
# is running:
#   GET  /health                     → {engine, status}
#   GET  /api/tts/status             → {engine, voices, status: "ready"}
#   POST /api/tts/generate {text, voice} → {audio_path, duration_ms, success}
#   GET  /api/tts/audio/<file>       → wav bytes
if [ "$INSTALL_TTS" = "1" ] && tts_wants edge-tts; then
cat > "$WORK/tts_edge.py" << 'TTSEOF'
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
fi

if [ "$INSTALL_TTS" = "1" ] && tts_wants xtts-v2; then
# Coqui XTTS v2 on :5001. Zero-shot multilingual TTS with 58 built-in speakers.
# First request loads the ~2 GB model into VRAM; subsequent requests are fast.
# We map the edge-tts voice keys to XTTS built-in speakers so the app's
# existing voice picker keeps working unchanged.
cat > "$WORK/tts_xtts.py" << 'TTSEOF'
import os, uuid, threading
os.environ.setdefault("COQUI_TOS_AGREED", "1")

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import torch

app = Flask(__name__)
CORS(app)
OUT = "/workspace/tts_output"
os.makedirs(OUT, exist_ok=True)

# Map the app's voice keys to XTTS v2 built-in speaker names. XTTS ships
# ~58 speakers; we pick a representative set by gender/register.
VOICE_MAP = {
    "default":  "Claribel Dervla",
    "female_1": "Claribel Dervla",
    "female_2": "Sofia Hellen",
    "male_1":   "Viktor Menelaos",
    "male_2":   "Craig Gutsy",
    "child":    "Tammie Ema",
}

_tts = None
_tts_lock = threading.Lock()
_tts_status = {"loading": True, "error": None}

def _load_tts():
    global _tts
    try:
        from TTS.api import TTS
        device = "cuda" if torch.cuda.is_available() else "cpu"
        t = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2").to(device)
        _tts = t
        _tts_status["loading"] = False
    except Exception as e:
        _tts_status["error"] = str(e)
        _tts_status["loading"] = False

# Load in a background thread so the HTTP server answers /health immediately;
# /api/tts/generate waits on the lock until the model is ready.
threading.Thread(target=_load_tts, daemon=True).start()

@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "engine": "xtts-v2",
        "loading": _tts_status["loading"],
        "error": _tts_status["error"],
    })

@app.route("/api/tts/status")
def status():
    return jsonify({
        "status": "ready" if _tts is not None else "loading",
        "engine": "xtts-v2",
        "voices": list(VOICE_MAP.keys()),
        "loading": _tts_status["loading"],
        "error": _tts_status["error"],
    })

@app.route("/api/tts/generate", methods=["POST"])
def generate():
    if _tts_status["error"]:
        return jsonify({"success": False, "error": f"model load failed: {_tts_status['error']}"}), 503
    # Wait up to 5 min for the model to finish its first load.
    if _tts is None:
        for _ in range(300):
            if _tts is not None: break
            threading.Event().wait(1.0)
    if _tts is None:
        return jsonify({"success": False, "error": "model still loading"}), 503

    data = request.get_json() or {}
    text = (data.get("text") or "").strip()
    lang = data.get("language") or "en"
    voice_key = data.get("voice", "default")
    speaker = VOICE_MAP.get(voice_key, VOICE_MAP["default"])
    if not text:
        return jsonify({"success": False, "error": "text is required"}), 400

    gid = str(uuid.uuid4())[:8]
    wav = f"{OUT}/{gid}.wav"
    try:
        with _tts_lock:
            _tts.tts_to_file(text=text, file_path=wav, speaker=speaker, language=lang)
        from pydub import AudioSegment
        seg = AudioSegment.from_wav(wav)
        return jsonify({"success": True, "audio_path": f"/api/tts/audio/{gid}.wav", "duration_ms": len(seg)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/tts/audio/<path:filename>")
def audio(filename):
    return send_file(f"{OUT}/{filename}")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
TTSEOF
fi

if [ "$INSTALL_TTS" = "1" ] && tts_wants mms-tts-bengali; then
# Meta MMS Bengali on :5003 — single-voice, single-language.
cat > "$WORK/tts_mms.py" << 'TTSEOF'
import os, uuid, threading, io
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import torch
import scipy.io.wavfile as wavfile

app = Flask(__name__)
CORS(app)
OUT = "/workspace/tts_output"
os.makedirs(OUT, exist_ok=True)

_model = None
_tok = None
_lock = threading.Lock()
_status = {"loading": True, "error": None}

def _load():
    global _model, _tok
    try:
        from transformers import VitsModel, AutoTokenizer
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _tok = AutoTokenizer.from_pretrained("facebook/mms-tts-ben")
        _model = VitsModel.from_pretrained("facebook/mms-tts-ben").to(device)
        _status["loading"] = False
    except Exception as e:
        _status["error"] = str(e)
        _status["loading"] = False

threading.Thread(target=_load, daemon=True).start()

@app.route("/health")
def health():
    return jsonify({"status": "ok", "engine": "mms-tts-bengali", "loading": _status["loading"], "error": _status["error"]})

@app.route("/api/tts/status")
def status():
    return jsonify({
        "status": "ready" if _model is not None else "loading",
        "engine": "mms-tts-bengali",
        "voices": ["default"],
        "language": "ben",
        "loading": _status["loading"],
        "error": _status["error"],
    })

@app.route("/api/tts/generate", methods=["POST"])
def generate():
    if _status["error"]:
        return jsonify({"success": False, "error": _status["error"]}), 503
    if _model is None:
        for _ in range(300):
            if _model is not None: break
            threading.Event().wait(1.0)
    if _model is None:
        return jsonify({"success": False, "error": "model still loading"}), 503

    data = request.get_json() or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"success": False, "error": "text is required"}), 400
    gid = str(uuid.uuid4())[:8]
    wav = f"{OUT}/{gid}.wav"
    try:
        with _lock:
            inputs = _tok(text, return_tensors="pt").to(_model.device)
            with torch.no_grad():
                out = _model(**inputs).waveform
            audio = out.squeeze().cpu().numpy()
            sr = _model.config.sampling_rate
            wavfile.write(wav, sr, audio)
        from pydub import AudioSegment
        seg = AudioSegment.from_wav(wav)
        return jsonify({"success": True, "audio_path": f"/api/tts/audio/{gid}.wav", "duration_ms": len(seg)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/tts/audio/<path:filename>")
def audio(filename):
    return send_file(f"{OUT}/{filename}")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5003)
TTSEOF
fi

if [ "$INSTALL_TTS" = "1" ] && tts_wants whisperspeech; then
# Collabora WhisperSpeech on :5002. Multilingual (en, pl + community langs),
# built on top of Whisper's encoder. Lazy-loads the pipeline on first request
# to keep /health responsive during boot.
cat > "$WORK/tts_whisperspeech.py" << 'TTSEOF'
import os, uuid, threading
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import torch

app = Flask(__name__)
CORS(app)
OUT = "/workspace/tts_output"
os.makedirs(OUT, exist_ok=True)

# WhisperSpeech exposes multiple language models via its Pipeline class.
# Voice keys map to (s2a_ref, lang) pairs. The app's stock voice set
# (default / female_1 / male_1 / …) is flattened onto these since WS doesn't
# have a comparable voice concept — the "voice" string mostly picks the
# language bundle.
VOICE_MAP = {
    "default":  ("collabora/whisperspeech:s2a-q4-tiny-en+pl.model", "en"),
    "female_1": ("collabora/whisperspeech:s2a-q4-tiny-en+pl.model", "en"),
    "female_2": ("collabora/whisperspeech:s2a-q4-tiny-en+pl.model", "pl"),
    "male_1":   ("collabora/whisperspeech:s2a-q4-tiny-en+pl.model", "en"),
    "male_2":   ("collabora/whisperspeech:s2a-q4-tiny-en+pl.model", "pl"),
    "child":    ("collabora/whisperspeech:s2a-q4-tiny-en+pl.model", "en"),
}

_pipe = None
_pipe_lock = threading.Lock()
_status = {"loading": True, "error": None}

def _load():
    global _pipe
    try:
        from whisperspeech.pipeline import Pipeline
        _pipe = Pipeline(s2a_ref=VOICE_MAP["default"][0])
        _status["loading"] = False
    except Exception as e:
        _status["error"] = str(e)
        _status["loading"] = False

threading.Thread(target=_load, daemon=True).start()

@app.route("/health")
def health():
    return jsonify({"status": "ok", "engine": "whisperspeech", "loading": _status["loading"], "error": _status["error"]})

@app.route("/api/tts/status")
def status():
    return jsonify({
        "status": "ready" if _pipe is not None else "loading",
        "engine": "whisperspeech",
        "voices": list(VOICE_MAP.keys()),
        "loading": _status["loading"],
        "error": _status["error"],
    })

@app.route("/api/tts/generate", methods=["POST"])
def generate():
    if _status["error"]:
        return jsonify({"success": False, "error": _status["error"]}), 503
    if _pipe is None:
        for _ in range(300):
            if _pipe is not None: break
            threading.Event().wait(1.0)
    if _pipe is None:
        return jsonify({"success": False, "error": "model still loading"}), 503

    data = request.get_json() or {}
    text = (data.get("text") or "").strip()
    voice_key = data.get("voice", "default")
    _, lang = VOICE_MAP.get(voice_key, VOICE_MAP["default"])
    if not text:
        return jsonify({"success": False, "error": "text is required"}), 400
    gid = str(uuid.uuid4())[:8]
    wav = f"{OUT}/{gid}.wav"
    try:
        with _pipe_lock:
            # WhisperSpeech's generate_to_file routes through torchaudio.save,
            # which on newer torchaudio hits torchcodec → ffmpeg ABI wall
            # (libavutil.so.57+ not present on Ubuntu 22.04). Bypass by
            # calling generate() directly (returns a 24 kHz waveform tensor)
            # and writing via soundfile. Verified on pod b9ged93bmtkbko.
            wav_tensor = _pipe.generate(text, lang=lang)
        import soundfile as sf
        audio = wav_tensor.cpu().numpy().squeeze()
        sf.write(wav, audio, 24000, subtype="PCM_16")
        from pydub import AudioSegment
        seg = AudioSegment.from_wav(wav)
        return jsonify({"success": True, "audio_path": f"/api/tts/audio/{gid}.wav", "duration_ms": len(seg)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/tts/audio/<path:filename>")
def audio(filename):
    return send_file(f"{OUT}/{filename}")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002)
TTSEOF
fi

# ── 9. Start services ─────────────────────────────────────────────────────────
pkill -9 -f 'main.py' 2>/dev/null || true
pkill -9 -f 'tts_edge.py\|tts_xtts.py\|tts_whisperspeech.py\|tts_mms.py\|tts_server.py' 2>/dev/null || true
pkill -9 -f 'ollama serve' 2>/dev/null || true
fuser -k 8188/tcp 5000/tcp 5001/tcp 5002/tcp 5003/tcp 11434/tcp 2>/dev/null || true
sleep 2

if [ "$INSTALL_COMFYUI" = "1" ]; then
  log "Starting ComfyUI..."
  # Wrapper ensures LD_LIBRARY_PATH is always set — survives restarts.
  # Prioritizes torch's bundled cuDNN 9 over system cuDNN 8 (in nvidia/cuda:*-cudnn8* images).
  cat > "$WORK/start-comfyui.sh" << 'WRAPEOF'
#!/usr/bin/env bash
VENV=/workspace/venv
TORCH_NV="$VENV/lib/python3.10/site-packages/nvidia"
TORCH_LIB="$VENV/lib/python3.10/site-packages/torch/lib"
# Full set of bundled lib dirs. Torch's C extensions dlopen these by plain
# name (libcusparseLt.so.0, libcublas.so, libcudart.so, …). Missing any one
# makes ComfyUI's `import torch` die with a generic ImportError. We saw this
# on 2026-04-18 when a stale install left cusparselt missing from the path.
export LD_LIBRARY_PATH="${TORCH_LIB}:${TORCH_NV}/cudnn/lib:${TORCH_NV}/cuda_runtime/lib:${TORCH_NV}/cublas/lib:${TORCH_NV}/cufft/lib:${TORCH_NV}/cusparselt/lib:${TORCH_NV}/cusparse/lib:${TORCH_NV}/curand/lib:${TORCH_NV}/cusolver/lib:${TORCH_NV}/nccl/lib:${TORCH_NV}/nvtx/lib:${LD_LIBRARY_PATH:-}"
cd /workspace/ComfyUI
exec "$VENV/bin/python" main.py \
  --listen 0.0.0.0 --port 8188 \
  --extra-model-paths-config extra_model_paths.yaml "$@"
WRAPEOF
  chmod +x "$WORK/start-comfyui.sh"
  nohup "$WORK/start-comfyui.sh" > "$WORK/comfyui.log" 2>&1 &
  disown $!
  log "  ✓ ComfyUI started"
fi

if [ "$INSTALL_TTS" = "1" ]; then
  log "Starting TTS servers: $TTS_ENGINES"
  # Pre-accept Coqui XTTS license so the auto-downloader doesn't hang on an
  # interactive prompt. Harmless for engines that don't read it.
  export COQUI_TOS_AGREED=1

  # Wrapper sets LD_LIBRARY_PATH to torch's bundled CUDA libs so torchaudio's
  # native _torchaudio.so can dlopen libcudart / libcudnn / libsox cleanly —
  # without this, XTTS and WhisperSpeech crash on import with:
  #   Could not load this library: .../torchaudio/lib/_torchaudio.so
  # Symptom was visible on pod b9ged93bmtkbko 2026-04-19. start-comfyui.sh
  # already does this for ComfyUI; we need the same for TTS-only pods.
  cat > "$WORK/start-tts.sh" << 'WRAPEOF'
#!/usr/bin/env bash
VENV=/workspace/venv
TORCH_NV="$VENV/lib/python3.10/site-packages/nvidia"
TORCH_LIB="$VENV/lib/python3.10/site-packages/torch/lib"
export LD_LIBRARY_PATH="${TORCH_LIB}:${TORCH_NV}/cudnn/lib:${TORCH_NV}/cuda_runtime/lib:${TORCH_NV}/cublas/lib:${TORCH_NV}/cufft/lib:${TORCH_NV}/cusparselt/lib:${TORCH_NV}/cusparse/lib:${TORCH_NV}/curand/lib:${TORCH_NV}/cusolver/lib:${TORCH_NV}/nccl/lib:${TORCH_NV}/nvtx/lib:${LD_LIBRARY_PATH:-}"
export COQUI_TOS_AGREED=1
exec "$VENV/bin/python" "$@"
WRAPEOF
  chmod +x "$WORK/start-tts.sh"

  # Start each requested engine on its own port. Each has its own logfile so
  # crashes in one don't contaminate the other logs.
  start_tts() {
    local engine="$1" file="$2" port="$3"
    if tts_wants "$engine"; then
      if [ -f "$WORK/$file" ]; then
        nohup "$WORK/start-tts.sh" "$WORK/$file" > "$WORK/tts_${engine}.log" 2>&1 &
        disown $!
        log "  ✓ $engine on :$port"
      else
        log "  ✗ $engine selected but $file was not written — skipped"
      fi
    fi
  }
  start_tts edge-tts        tts_edge.py          5000
  start_tts xtts-v2         tts_xtts.py          5001
  start_tts whisperspeech   tts_whisperspeech.py 5002
  start_tts mms-tts-bengali tts_mms.py           5003
fi

if [ "$INSTALL_OLLAMA" = "1" ]; then
  log "Starting Ollama..."
  # IMPORTANT: run ollama from /usr/local/bin — that path lets it find its own
  # CUDA backend libs at /usr/local/lib/ollama/cuda_v13/. If we copy the
  # binary to /workspace/bin/ (old behavior), ollama's `../lib/ollama/` lookup
  # fails and it silently falls back to 100% CPU. We saw this in prod
  # 2026-04-18 on pod 99gn7wqgvmmb9a — qwen2.5:7b generation took 2+ min on
  # CPU vs. ~15s on GPU.
  export OLLAMA_HOST=0.0.0.0
  export OLLAMA_MODELS="$WORK/ollama_models"
  if [ ! -x "/usr/local/bin/ollama" ]; then
    # Installer runs per-pod-start (fast, ~10s) since /usr/local is ephemeral.
    # Models themselves live on the volume via OLLAMA_MODELS.
    curl -fsSL https://ollama.com/install.sh | sh > /dev/null 2>&1 || true
  fi
  nohup /usr/local/bin/ollama serve > "$WORK/ollama.log" 2>&1 &
  disown $!
  sleep 3
  if /usr/local/bin/ollama list 2>/dev/null | grep -q "^${OLLAMA_MODEL}"; then
    log "  ✓ Ollama $OLLAMA_MODEL already on volume"
  else
    nohup /usr/local/bin/ollama pull "$OLLAMA_MODEL" > "$WORK/ollama_pull.log" 2>&1 &
    log "  ↓ Ollama pulling $OLLAMA_MODEL..."
  fi

  # Sanity check — wait 5s for GPU detection, fail loudly if still CPU-only.
  # This matches the conv2d smoke test pattern from the comfyui block.
  sleep 5
  OLLAMA_LIB=$(grep -oE 'library=[A-Za-z0-9_]+' "$WORK/ollama.log" | tail -1)
  if [ "$OLLAMA_LIB" = "library=CUDA" ]; then
    log "  ✓ Ollama detected GPU (${OLLAMA_LIB})"
  else
    log "  ✗ WARNING: Ollama didn't detect GPU (${OLLAMA_LIB:-library=unknown})"
    log "  ✗ LLM calls will be slow. Check /workspace/ollama.log for 'inference compute' line."
  fi
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
if [ "$INSTALL_VIDEO" = "1" ]; then
  check_model "ltxv-13b-0.9.7-distilled" "$DL/checkpoints/ltxv-13b-0.9.7-distilled.safetensors"     20000000000
  check_model "t5xxl_fp16"               "$DL/text_encoders/t5xxl_fp16.safetensors"                  9000000000
fi
if [ "$INSTALL_SDXL" = "1" ]; then
  check_model "animagineXL31"           "$DL/checkpoints/animagineXL31.safetensors"                 5000000000
  check_model "juggernautXL_v9"         "$DL/checkpoints/juggernautXL_v9.safetensors"               5000000000
fi
if [ "$INSTALL_FLUX" = "1" ]; then
  check_model "flux1-schnell-fp8"       "$DL/unet/flux1-schnell-fp8.safetensors"                   15000000000
  check_model "clip_l"                  "$DL/clip/clip_l.safetensors"                               200000000
  check_model "t5xxl_fp8"               "$DL/clip/t5xxl_fp8_e4m3fn.safetensors"                    4000000000
  check_model "ae (FLUX VAE)"           "$DL/vae/ae.safetensors"                                    300000000
fi
log "╚══════════════════════════════════════════════════════╝"
log ""

if [ "$INSTALL_VIDEO" = "1" ] || [ "$INSTALL_SDXL" = "1" ] || [ "$INSTALL_FLUX" = "1" ]; then
  log "Starting model downloads in background..."

  if [ "$INSTALL_VIDEO" = "1" ]; then
    # LTX Video 13B 0.9.7 distilled — single-file checkpoint (includes VAE).
    # Loaded via CheckpointLoaderSimple from checkpoints/.
    hf_download "Lightricks/LTX-Video" \
      "ltxv-13b-0.9.7-distilled.safetensors" \
      "$DL/checkpoints/ltxv-13b-0.9.7-distilled.safetensors" 20000000000 &

    # T5-XXL fp16 text encoder (shared with FLUX; downloaded here when only VIDEO is on)
    hf_download "comfyanonymous/flux_text_encoders" \
      "t5xxl_fp16.safetensors" \
      "$DL/text_encoders/t5xxl_fp16.safetensors" 9000000000 &
  fi

  if [ "$INSTALL_SDXL" = "1" ]; then
    hf_download "cagliostrolab/animagine-xl-3.1" \
      "animagine-xl-3.1.safetensors" \
      "$DL/checkpoints/animagineXL31.safetensors" 5000000000 &

    civitai_download "782002" "$DL/checkpoints/juggernautXL_v9.safetensors" 5000000000 &
  fi

  if [ "$INSTALL_FLUX" = "1" ]; then
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
  fi

  wait
  log "=== All model downloads complete ==="
else
  log "=== No model downloads selected — setup complete ==="
fi

# ── Catalog-driven custom installers ─────────────────────────────────────────
# When the pod-create wizard includes models that aren't part of the canonical
# SDXL/FLUX/VIDEO presets, their `install_script` strings are concatenated and
# passed in as a base64-encoded EXTRA_INSTALL_SCRIPT env var. We decode, write
# to disk, and run it here so admin-added catalog rows can ship installers
# without editing this file.
if [ -n "${EXTRA_INSTALL_SCRIPT:-}" ]; then
  log "=== Running EXTRA_INSTALL_SCRIPT (catalog-supplied) ==="
  printf '%s' "$EXTRA_INSTALL_SCRIPT" | base64 -d > /workspace/extra-install.sh
  chmod +x /workspace/extra-install.sh
  # Export the helper functions + common paths so catalog install_scripts can
  # reuse hf_download / civitai_download / file_ok without duplicating them.
  # Each catalog row's install_script runs in a fresh bash subshell; without
  # this export, functions defined above would be invisible to it.
  export -f hf_download civitai_download file_ok log
  export HF_TMP WORK COMFY MODELS DL VENV PY PIP HF_TOKEN CIVITAI_TOKEN
  bash /workspace/extra-install.sh 2>&1 | tee -a /workspace/setup.log
  log "=== EXTRA_INSTALL_SCRIPT complete ==="
fi
