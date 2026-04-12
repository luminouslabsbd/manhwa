# ─── RunPod Serverless Worker: ComfyUI + FLUX + Wan2.2 ──────────────
# Lightweight — uses existing ComfyUI image, downloads models on cold start.
# Models persist while worker is warm (no re-download between jobs).
#
# Build:  docker build -t yourdockerhub/comfyui-serverless .
# Push:   docker push yourdockerhub/comfyui-serverless
# ─────────────────────────────────────────────────────────────────────
FROM hearmeman/comfyui-wanvideo:v9

ENV PYTHONUNBUFFERED=1

# RunPod SDK + aria2 for fast parallel downloads
RUN pip install --no-cache-dir runpod && \
    apt-get update && apt-get install -y --no-install-recommends aria2 && \
    rm -rf /var/lib/apt/lists/*

# Ensure directories exist
RUN mkdir -p /ComfyUI/models/unet /ComfyUI/models/clip /ComfyUI/models/vae \
    /ComfyUI/models/vae/wanvideo \
    /ComfyUI/models/diffusion_models/WanVideo/2_2 \
    /ComfyUI/input /ComfyUI/output/serverless

# Copy handler + model downloader
COPY handler.py /handler.py
COPY download_models.sh /download_models.sh
RUN chmod +x /download_models.sh

CMD ["/bin/bash", "-c", "/download_models.sh && python3 /handler.py"]
