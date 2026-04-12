# AI Studio — RunPod Setup Guide

---

## Architecture overview

```
Your Mac (local)
├── Next.js UI        → http://localhost:3000
├── PostgreSQL        → localhost:5433
└── Redis / BullMQ   → localhost:6379

RunPod GPU pod (~$1.19/hr — A100 PCIe community)
├── ComfyUI           → https://<POD_ID>-8188.proxy.runpod.net
├── TTS server        → https://<POD_ID>-5000.proxy.runpod.net
└── Ollama            → https://<POD_ID>-11434.proxy.runpod.net
```

The UI runs locally and connects to a remote RunPod pod for all GPU work.

---

## Pod image

```
ghcr.io/ai-dock/comfyui:v2-cuda-12.1.1-base-22.04-v0.2.7
```

ComfyUI is pre-installed and managed by supervisor inside this image.
`pod-setup.sh` only adds Ollama, TTS, custom nodes, and model downloads.

---

## Prerequisites

```bash
brew install jq
```

`.env.local` must have:
```
RUNPOD_API_KEY=rpa_...
HF_TOKEN=hf_...
CIVITAI_TOKEN=...
PUBLIC_KEY=ssh-ed25519 ...
```

---

## Spin up a new pod

```bash
bash scripts/new-pod.sh
```

### What happens automatically

1. Reads credentials from `.env.local`
2. Queries RunPod API — prefers A100, falls back to RTX 4090 / RTX 3090
3. Creates pod with `ai-dock/comfyui` image (ComfyUI pre-installed)
4. Base64-encodes `scripts/pod-setup.sh` → runs in background on pod start
5. Waits for `RUNNING`
6. Updates `.env.local` with new pod URLs
7. Restarts local Next.js dev server

### Volume layout (all persists across restarts)

```
/workspace/                              ← RunPod volume (150 GB)
├── storage/stable_diffusion/models/     ← ALL ComfyUI models (ai-dock standard path)
│   ├── checkpoints/
│   ├── diffusion_models/
│   ├── text_encoders/
│   ├── vae/  unet/  clip/  loras/
├── comfyui/                             ← ComfyUI data (ai-dock managed)
│   └── custom_nodes/                   ← Custom nodes (VideoHelperSuite, WanVideoWrapper)
├── bin/ollama                           ← Ollama binary
├── ollama_models/                       ← Ollama model files
├── tts_server.py                        ← TTS server script
└── tts_output/                          ← TTS audio output
```

Container disk (20 GB, ephemeral): system apt packages only — reinstalled fast on restart.

### What `pod-setup.sh` installs on first run

- Custom nodes: `ComfyUI-VideoHelperSuite`, `ComfyUI-WanVideoWrapper`
- TTS server (edge-tts via Flask, port 5000)
- Ollama binary → `/workspace/bin/ollama`
- Models downloaded in parallel to `/workspace/storage/stable_diffusion/models/`:
  - Wan 2.1 T2V 1.3B fp16 (~3 GB)
  - Wan 2.1 I2V 14B 480p fp8 (~9 GB)
  - UMT5-XXL fp16 — Wan T5 encoder (~9 GB)
  - Wan 2.1 VAE
  - animagineXL 3.1 (~6 GB) — SDXL anime
  - JuggernautXL v9 (~6 GB) — SDXL photo
  - FLUX.1-schnell fp8 (~17 GB) + CLIP-L + T5 + VAE

**First run: ~30–60 min for all downloads. Subsequent restarts: ~2–3 min, all models already on volume.**

---

## Update env after a pod restart

Pod URLs change on every restart. Run:

```bash
bash scripts/update-pod-urls.sh <NEW_POD_ID>
```

Get the pod ID from the RunPod dashboard.

---

## Local UI

### First-time start

```bash
cd treasure-island-ui

# Start postgres + redis
docker compose up -d postgres redis

# Create tables
docker exec -i ai-studio-postgres psql -U ai_studio -d ai_studio \
  < prisma/migrations/0001_init/migration.sql

# Import existing data
DATABASE_URL=postgresql://ai_studio:ai_studio_pw@localhost:5433/ai_studio \
  PATH="/opt/homebrew/Cellar/node/25.8.2/bin:$PATH" \
  node_modules/.bin/tsx scripts/migrate-data.ts

# Start dev server
PATH="/opt/homebrew/Cellar/node/25.8.2/bin:$PATH" \
  node_modules/.bin/next dev --webpack
```

### Daily start

```bash
cd treasure-island-ui
docker compose up -d postgres redis
PATH="/opt/homebrew/Cellar/node/25.8.2/bin:$PATH" \
  node_modules/.bin/next dev --webpack
```

### Stop everything

```bash
kill $(lsof -ti:3000)
docker compose down
```

---

## Pod connection — quick reference

```bash
# Watch setup progress
ssh -p <PORT> root@<HOST> tail -f /workspace/setup.log

# Watch ComfyUI (ai-dock supervisor log)
ssh -p <PORT> root@<HOST> tail -f /var/log/supervisor/comfyui.log

# Check GPU
ssh -p <PORT> root@<HOST> nvidia-smi

# Check models on volume
ssh -p <PORT> root@<HOST> ls -lh /workspace/storage/stable_diffusion/models/checkpoints/
ssh -p <PORT> root@<HOST> ls -lh /workspace/storage/stable_diffusion/models/diffusion_models/
ssh -p <PORT> root@<HOST> du -sh /workspace/storage/

# Restart extra services (TTS + Ollama — ComfyUI restarted by supervisor)
ssh -p <PORT> root@<HOST> bash -c "
  pkill -f 'tts_server.py'; pkill -f 'ollama serve'
  sleep 1
  nohup python3 /workspace/tts_server.py > /workspace/tts.log 2>&1 &
  nohup /workspace/bin/ollama serve > /workspace/ollama.log 2>&1 &
  echo done
"

# Restart ComfyUI via supervisor
ssh -p <PORT> root@<HOST> supervisorctl restart comfyui
```

---

## Script files

| File | Purpose |
|---|---|
| `scripts/new-pod.sh` | Create new pod, auto-configure `.env.local`, restart UI |
| `scripts/update-pod-urls.sh` | Update env + restart UI for an existing pod ID |
| `scripts/pod-setup.sh` | Runs on pod — installs Ollama, TTS, nodes, downloads models |
| `scripts/migrate-data.ts` | One-time import of data.json into PostgreSQL |

---

## Cost

**~$1.19/hr** — A100 PCIe community cloud (selected automatically by `new-pod.sh`)

Stop the pod when not generating. The UI and database run locally at no cost.
Models on the volume persist — next start skips all downloads.
