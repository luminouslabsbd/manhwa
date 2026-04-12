# ComfyUI + Ollama + LLM Integration
# Multi-service image for AI animation pipeline
FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 \
    WORKSPACE=/workspace \
    COMFYUI_PORT=8188 \
    OLLAMA_PORT=11434

WORKDIR ${WORKSPACE}

# ═══════════════════════════════════════════════════════════
# 1. System Dependencies
# ═══════════════════════════════════════════════════════════
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    wget \
    git \
    ca-certificates \
    software-properties-common \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# ═══════════════════════════════════════════════════════════
# 2. Install Ollama
# ═══════════════════════════════════════════════════════════
RUN curl -fsSL https://ollama.ai/install.sh | sh

# ═══════════════════════════════════════════════════════════
# 3. Install & Setup ComfyUI
# ═══════════════════════════════════════════════════════════
RUN git clone https://github.com/comfyanonymous/ComfyUI.git ${WORKSPACE}/ComfyUI \
    && cd ${WORKSPACE}/ComfyUI \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir sqlalchemy pydantic

# ═══════════════════════════════════════════════════════════
# 3b. Install TTS and Audio Processing
# ═══════════════════════════════════════════════════════════
RUN pip install --no-cache-dir \
    TTS \
    librosa \
    soundfile \
    scipy

# Create necessary directories
RUN mkdir -p ${WORKSPACE}/ComfyUI/models/diffusion_models \
    && mkdir -p ${WORKSPACE}/ComfyUI/models/text_encoders \
    && mkdir -p ${WORKSPACE}/ComfyUI/models/clip_vision \
    && mkdir -p ${WORKSPACE}/ComfyUI/models/vae \
    && mkdir -p ${WORKSPACE}/output

# ═══════════════════════════════════════════════════════════
# 4. Create startup scripts
# ═══════════════════════════════════════════════════════════
RUN mkdir -p /root/scripts

# Main startup script that launches both services
COPY scripts/start-services.sh /root/scripts/start-services.sh
RUN chmod +x /root/scripts/start-services.sh

# Entrypoint script for container
COPY scripts/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# ═══════════════════════════════════════════════════════════
# 5. Expose Ports
# ═══════════════════════════════════════════════════════════
EXPOSE ${COMFYUI_PORT} ${OLLAMA_PORT}

# ═══════════════════════════════════════════════════════════
# 6. Health check
# ═══════════════════════════════════════════════════════════
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${COMFYUI_PORT}/system_stats || exit 1

# ═══════════════════════════════════════════════════════════
# 7. Start services
# ═══════════════════════════════════════════════════════════
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/root/scripts/start-services.sh"]
