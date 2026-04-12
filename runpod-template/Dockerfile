# ─── Custom RunPod Template: ComfyUI + FLUX + Wan2.2 + Ollama ────────
# Everything pre-installed. Just attach a volume and go.
#
# Image:  ghcr.io/shojol80/manhwa-studio:v1
# Built automatically by GitHub Actions
# ─────────────────────────────────────────────────────────────────────
FROM hearmeman/comfyui-wan-template:v11

ENV PYTHONUNBUFFERED=1 \
    OLLAMA_HOST=0.0.0.0:11434 \
    OLLAMA_MODELS=/workspace/ollama/models

# ──── System packages ────
RUN apt-get update && apt-get install -y --no-install-recommends \
    aria2 zstd curl nginx && \
    rm -rf /var/lib/apt/lists/*

# ──── Install Ollama ────
RUN curl -fsSL https://ollama.com/install.sh | sh

# ──── Nginx config (proxy ComfyUI:8190 + Ollama:11434 through port 8188 as fallback) ────
# Not needed if you expose port 11434 in template settings.
# Kept here as optional backup.

# ──── Pre-download Ollama model into image ────
RUN mkdir -p /workspace/ollama/models && \
    nohup bash -c "OLLAMA_MODELS=/opt/ollama/models ollama serve &" && \
    sleep 5 && \
    OLLAMA_MODELS=/opt/ollama/models ollama pull qwen2.5:3b && \
    pkill ollama || true

# ──── Model download script ────
COPY download_models.sh /download_models.sh
RUN chmod +x /download_models.sh

# ──── Startup script ────
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8188 11434 22

CMD ["/start.sh"]
