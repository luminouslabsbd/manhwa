#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# local-comfyui-setup.sh — Install ComfyUI locally on Apple Silicon (M1/M2/M3/M4)
#
# What this does:
#   1. Installs ComfyUI + dependencies into ~/comfyui-local
#   2. Installs WanVideoWrapper custom node (for when you eventually want video)
#   3. Downloads SDXL image models (~12GB total)
#   4. Creates a launcher script: ~/comfyui-local/start.sh
#
# Requirements:
#   - Python 3.10+ (brew install python@3.10  OR  pyenv)
#   - git, wget (brew install git wget)
#   - ~20GB free disk space
#   - HF_TOKEN in .env.local (for gated models)
#
# Usage:
#   bash scripts/local-comfyui-setup.sh
#   Then: bash ~/comfyui-local/start.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

INSTALL_DIR="${COMFYUI_LOCAL_DIR:-$HOME/comfyui-local}"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

HF_TOKEN="${HF_TOKEN:-}"
CIVITAI_TOKEN="${CIVITAI_TOKEN:-}"

green="\033[32m"; reset="\033[0m"; bold="\033[1m"
log() { echo -e "${green}▶${reset} $*"; }
header() { echo -e "\n${bold}$1${reset}"; }

header "ComfyUI Local Setup — Apple Silicon"
echo "  Install dir : $INSTALL_DIR"
echo "  Python      : $(python3 --version 2>/dev/null || echo 'not found!')"
echo ""

# ── Check python ──────────────────────────────────────────────────────────────
if ! python3 -c "import sys; assert sys.version_info >= (3,10)" 2>/dev/null; then
  echo "❌  Python 3.10+ required. Install via: brew install python@3.10"
  exit 1
fi
PY=$(python3 -c "import sys; print(sys.executable)")
log "Using Python: $PY"

# ── 1. Clone / update ComfyUI ─────────────────────────────────────────────────
header "1. ComfyUI"
COMFY="$INSTALL_DIR/ComfyUI"
if [ ! -d "$COMFY/.git" ]; then
  log "Cloning ComfyUI..."
  git clone -q https://github.com/comfyanonymous/ComfyUI "$COMFY"
else
  log "Updating ComfyUI..."
  git -C "$COMFY" pull -q || true
fi

# ── 2. Python venv ────────────────────────────────────────────────────────────
header "2. Python venv + torch (MPS)"
VENV="$INSTALL_DIR/venv"
if [ ! -f "$VENV/bin/python" ]; then
  log "Creating venv at $VENV..."
  "$PY" -m venv "$VENV"
fi
PY="$VENV/bin/python"
PIP="$VENV/bin/pip"

# Install torch with MPS support (nightly for M4, stable for M1/M2/M3)
TORCH_VER=$("$PY" -c "import torch; print(torch.__version__)" 2>/dev/null || echo "")
if [[ -z "$TORCH_VER" ]]; then
  log "Installing torch (MPS)..."
  # torch 2.x stable has MPS support built in
  "$PIP" install -q torch torchvision torchaudio
fi
"$PY" -c "import torch; print('  torch', torch.__version__, '| MPS:', torch.backends.mps.is_available())"

# ComfyUI requirements (strip torch lines — already installed)
log "Installing ComfyUI requirements..."
grep -vE '^torch(vision|audio)?($|[>=< !])' "$COMFY/requirements.txt" > /tmp/req_no_torch.txt
"$PIP" install -q -r /tmp/req_no_torch.txt 2>/dev/null

# Extra packages
"$PIP" install -q \
  huggingface_hub hf_transfer \
  sqlalchemy alembic pydantic \
  av torchsde kornia spandrel \
  accelerate imageio imageio-ffmpeg \
  2>/dev/null
log "  ✓ Python packages"

# ── 3. Custom nodes ───────────────────────────────────────────────────────────
header "3. Custom nodes"
cd "$COMFY/custom_nodes"
clone_node() {
  local repo="$1"; local name; name=$(basename "$repo")
  if [ ! -d "$name/.git" ]; then
    git clone -q "$repo" && log "  ✓ $name"
    [ -f "$name/requirements.txt" ] && "$PIP" install -q -r "$name/requirements.txt" 2>/dev/null || true
  else
    git -C "$name" pull -q && log "  ↺ $name (updated)"
  fi
}
clone_node "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite"
# WanVideoWrapper only needed for video — skip for image-only setup
# clone_node "https://github.com/kijai/ComfyUI-WanVideoWrapper"

# ── 4. Model directories ──────────────────────────────────────────────────────
header "4. Model directories"
MODELS="$INSTALL_DIR/models"
mkdir -p "$MODELS"/{checkpoints,loras,vae,text_encoders,diffusion_models,clip,unet,upscale_models}

# extra_model_paths.yaml so ComfyUI finds models in our unified location
cat > "$COMFY/extra_model_paths.yaml" << YAMLEOF
comfyui:
    base_path: $MODELS
    checkpoints: checkpoints/
    clip: clip/
    clip_vision: clip_vision/
    configs: configs/
    diffusion_models: diffusion_models/
    embeddings: embeddings/
    loras: loras/
    text_encoders: text_encoders/
    unet: unet/
    vae: vae/
    upscale_models: upscale_models/
YAMLEOF
log "  ✓ extra_model_paths.yaml → $MODELS"

# ── 5. Download image models ──────────────────────────────────────────────────
header "5. Image models"

file_ok() { local s; s=$(stat -f%z "$1" 2>/dev/null || echo 0); [ "$s" -ge "$2" ]; }

hf_download() {
  local repo="$1" hf_path="$2" out="$3" min="${4:-100000000}"
  local name; name=$(basename "$out")
  file_ok "$out" "$min" && log "  ✓ SKIP $name" && return 0
  log "  ↓ $name..."
  HF_HUB_ENABLE_HF_TRANSFER=1 HF_TOKEN="$HF_TOKEN" \
  "$PY" -c "
import os, shutil, tempfile
os.environ['HF_HUB_ENABLE_HF_TRANSFER'] = '1'
from huggingface_hub import hf_hub_download
p = hf_hub_download('${repo}', '${hf_path}',
    token=os.environ.get('HF_TOKEN') or None,
    local_dir=tempfile.mkdtemp())
shutil.move(p, '${out}')
" && log "  ✓ $name" || log "  ✗ $name FAILED"
}

civitai_download() {
  local vid="$1" out="$2" min="${3:-100000000}"
  local name; name=$(basename "$out")
  file_ok "$out" "$min" && log "  ✓ SKIP $name" && return 0
  [[ -z "$CIVITAI_TOKEN" ]] && log "  ○ SKIP $name (no CIVITAI_TOKEN)" && return 0
  log "  ↓ $name (CivitAI)..."
  curl -L -# --output "$out.tmp" \
    "https://civitai.com/api/download/models/${vid}?token=${CIVITAI_TOKEN}" \
    && mv "$out.tmp" "$out" && log "  ✓ $name" || log "  ✗ $name FAILED"
}

echo "  Downloading SDXL checkpoints for image generation..."
echo "  (Skip any you already have — re-run is safe)"
echo ""

# Animagine XL 3.1 — anime/manhwa style (HuggingFace, free)
hf_download "cagliostrolab/animagine-xl-3.1" \
  "animagine-xl-3.1.safetensors" \
  "$MODELS/checkpoints/animagineXL31.safetensors" 5000000000 &

# Juggernaut XL v9 — realistic/photographic (CivitAI, needs token)
civitai_download "782002" \
  "$MODELS/checkpoints/juggernautXL_v9.safetensors" 5000000000 &

wait
log "  ✓ Model downloads complete"

# ── 6. Create launcher ────────────────────────────────────────────────────────
header "6. Creating launcher"
cat > "$INSTALL_DIR/start.sh" << STARTEOF
#!/usr/bin/env bash
# Start ComfyUI locally (Apple Silicon MPS)
cd "$(cd "$(dirname "$0")" && pwd)/ComfyUI"
exec "$VENV/bin/python" main.py \
  --listen 0.0.0.0 \
  --port 8188 \
  --extra-model-paths-config extra_model_paths.yaml \
  "\$@"
STARTEOF
chmod +x "$INSTALL_DIR/start.sh"
log "  ✓ Launcher: $INSTALL_DIR/start.sh"

# ── 7. Update .env.local to use local ComfyUI ─────────────────────────────────
header "7. .env.local update"
echo ""
echo "  To use local ComfyUI, update .env.local:"
echo ""
echo "    COMFYUI_HOST=http://localhost:8188"
echo ""
echo "  Or set via Pod Manager → active host"

# ── Done ──────────────────────────────────────────────────────────────────────
header "Done!"
echo ""
echo "  Start ComfyUI:  bash $INSTALL_DIR/start.sh"
echo "  Models at:      $MODELS"
echo ""
echo "  Then set COMFYUI_HOST=http://localhost:8188 in .env.local"
echo "  and generate images through your Next.js app as normal."
