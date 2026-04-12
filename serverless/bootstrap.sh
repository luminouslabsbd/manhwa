#!/bin/bash
# ─── RunPod Serverless Bootstrap ─────────────────────────────────────
# Single script that sets up everything on a fresh worker.
# Set as Docker CMD in RunPod serverless endpoint config.
#
# Required ENV vars (set in RunPod endpoint config):
#   HF_TOKEN  — HuggingFace token for gated FLUX VAE download
#
# Usage in RunPod Serverless Endpoint:
#   Container Image: hearmeman/comfyui-wanvideo:v9
#   Docker Command:  bash -c "curl -sL https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/serverless/bootstrap.sh | bash"
#   Environment:     HF_TOKEN=hf_xxx
# ─────────────────────────────────────────────────────────────────────
set -e

echo "=== [1/4] Installing dependencies ==="
pip install --quiet runpod 2>/dev/null
apt-get update -qq && apt-get install -y -qq aria2 > /dev/null 2>&1 || true

echo "=== [2/4] Creating directories ==="
mkdir -p /ComfyUI/models/unet /ComfyUI/models/clip /ComfyUI/models/vae \
    /ComfyUI/models/vae/wanvideo /ComfyUI/models/diffusion_models/WanVideo/2_2 \
    /ComfyUI/input /ComfyUI/output/serverless

# ─── Model download (skips existing) ────────────────────────────────
dl() {
  local url="$1" dir="$2" name="$3"
  local path="$dir/$name"
  if [ -f "$path" ] && [ "$(stat -c%s "$path" 2>/dev/null || echo 0)" -gt 1000 ]; then
    echo "  SKIP $name"; return 0
  fi
  echo "  GET  $name ..."
  aria2c -x 8 -s 8 -k 1M --quiet=true "$url" -d "$dir" -o "$name" "${@:4}"
}

echo "=== [3/4] Downloading models ==="
T0=$(date +%s)

dl "https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors" \
   /ComfyUI/models/unet flux1-schnell-fp8.safetensors

dl "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors" \
   /ComfyUI/models/clip t5xxl_fp8_e4m3fn.safetensors

dl "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors" \
   /ComfyUI/models/clip clip_l.safetensors

dl "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors" \
   /ComfyUI/models/vae ae.safetensors --header="Authorization: Bearer $HF_TOKEN"

dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors" \
   /ComfyUI/models/diffusion_models/WanVideo/2_2 wan2.2_ti2v_5B_fp16.safetensors

dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors" \
   /ComfyUI/models/vae/wanvideo Wan2_2_VAE_bf16.safetensors

dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors" \
   /ComfyUI/models/text_encoders umt5-xxl-enc-bf16.safetensors

dl "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/open_clip_xlm_roberta_large_vit_huge_14.safetensors" \
   /ComfyUI/models/text_encoders open-clip-xlm-roberta-large-vit-huge-14_visual_fp16.safetensors

echo "  Models ready in $(($(date +%s) - T0))s"

# ─── Write handler inline ───────────────────────────────────────────
echo "=== [4/4] Starting handler ==="

python3 -u - << 'HANDLER_EOF'
import os, json, time, uuid, base64, requests, subprocess, sys

COMFY = "http://127.0.0.1:8188"
OUTPUT = "/ComfyUI/output"

proc = None
def start_comfyui():
    global proc
    if proc and proc.poll() is None: return
    proc = subprocess.Popen(
        [sys.executable, "main.py", "--listen", "0.0.0.0", "--port", "8188",
         "--disable-auto-launch", "--disable-metadata"],
        cwd="/ComfyUI", stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    for _ in range(120):
        try:
            if requests.get(f"{COMFY}/system_stats", timeout=2).ok: return
        except: pass
        time.sleep(1)
    raise RuntimeError("ComfyUI did not start")

def flux_workflow(prompt, seed, w=1024, h=576, steps=8):
    return {
        "1":{"class_type":"UNETLoader","inputs":{"unet_name":"flux1-schnell-fp8.safetensors","weight_dtype":"fp8_e4m3fn"}},
        "2":{"class_type":"DualCLIPLoader","inputs":{"clip_name1":"t5xxl_fp8_e4m3fn.safetensors","clip_name2":"clip_l.safetensors","type":"flux"}},
        "3":{"class_type":"CLIPTextEncode","inputs":{"text":prompt,"clip":["2",0]}},
        "4":{"class_type":"EmptySD3LatentImage","inputs":{"width":w,"height":h,"batch_size":1}},
        "5":{"class_type":"RandomNoise","inputs":{"noise_seed":seed}},
        "6":{"class_type":"BasicScheduler","inputs":{"scheduler":"simple","steps":steps,"denoise":1.0,"model":["1",0]}},
        "7":{"class_type":"KSamplerSelect","inputs":{"sampler_name":"euler"}},
        "8":{"class_type":"BasicGuider","inputs":{"model":["1",0],"conditioning":["3",0]}},
        "9":{"class_type":"SamplerCustomAdvanced","inputs":{"noise":["5",0],"guider":["8",0],"sampler":["7",0],"sigmas":["6",0],"latent_image":["4",0]}},
        "10":{"class_type":"VAELoader","inputs":{"vae_name":"ae.safetensors"}},
        "11":{"class_type":"VAEDecode","inputs":{"samples":["9",0],"vae":["10",0]}},
        "12":{"class_type":"SaveImage","inputs":{"filename_prefix":f"sl/{uuid.uuid4().hex[:8]}","images":["11",0]}},
    }

def i2v_workflow(prompt, img_name, seed, frames=49):
    return {
        "1":{"class_type":"WanVideoModelLoader","inputs":{"model_name":"WanVideo/2_2/wan2.2_ti2v_5B_fp16.safetensors","quantization":"fp8_e4m3fn_fast"}},
        "2":{"class_type":"WanVideoBlockSwap","inputs":{"model":["1",0],"blocks_to_swap":28}},
        "3":{"class_type":"WanVideoTextEncode","inputs":{"model":["2",0],"positive_prompt":prompt,"negative_prompt":"blurry, static, low quality"}},
        "4":{"class_type":"LoadImage","inputs":{"image":img_name}},
        "5":{"class_type":"WanVideoImageEncode","inputs":{"model":["2",0],"image":["4",0],"width":832,"height":480,"num_frames":frames}},
        "6":{"class_type":"WanVideoSampler","inputs":{"model":["2",0],"positive":["3",0],"negative":["3",1],"embeds":["5",0],"steps":20,"cfg":5.0,"seed":seed,"sampler_name":"uni_pc_bh2"}},
        "7":{"class_type":"WanVideoDecode","inputs":{"model":["2",0],"samples":["6",0],"enable_vae_tiling":True,"tile_size":128}},
        "8":{"class_type":"VHS_VideoCombine","inputs":{"images":["7",0],"frame_rate":24,"filename_prefix":f"sl/{uuid.uuid4().hex[:8]}","format":"video/h264-mp4"}},
    }

def run_workflow(wf):
    r = requests.post(f"{COMFY}/prompt", json={"prompt": wf})
    r.raise_for_status()
    pid = r.json()["prompt_id"]
    for _ in range(300):
        h = requests.get(f"{COMFY}/history/{pid}").json()
        if pid in h:
            st = h[pid].get("status", {})
            if st.get("completed") or st.get("status_str") == "success":
                out = {}
                for nid, nout in h[pid].get("outputs", {}).items():
                    for img in nout.get("images", []):
                        p = os.path.join(OUTPUT, img.get("subfolder",""), img["filename"])
                        with open(p,"rb") as f: out["image_base64"] = base64.b64encode(f.read()).decode()
                        out["filename"] = img["filename"]
                    for vid in nout.get("gifs", []):
                        p = os.path.join(OUTPUT, vid.get("subfolder",""), vid["filename"])
                        with open(p,"rb") as f: out["video_base64"] = base64.b64encode(f.read()).decode()
                        out["video_filename"] = vid["filename"]
                return out
            if st.get("status_str") == "error":
                raise RuntimeError(f"ComfyUI error: {st.get('messages','?')}")
        time.sleep(2)
    raise TimeoutError("Timed out")

def handler(job):
    inp = job["input"]
    try:
        start_comfyui()
        t = inp.get("type", "image")
        if t == "image":
            wf = flux_workflow(inp["prompt"], inp.get("seed",42), inp.get("width",1024), inp.get("height",576), inp.get("steps",8))
        elif t == "video":
            img_b64 = inp["image_base64"]
            fname = f"input_{uuid.uuid4().hex[:8]}.png"
            with open(f"/ComfyUI/input/{fname}","wb") as f: f.write(base64.b64decode(img_b64))
            wf = i2v_workflow(inp["prompt"], fname, inp.get("seed",42), inp.get("num_frames",49))
        else:
            return {"error": f"Unknown type: {t}"}
        result = run_workflow(wf)
        return {"status": "success", "seed": inp.get("seed",42), **result}
    except Exception as e:
        return {"error": str(e)}

import runpod
print("Starting ComfyUI...")
start_comfyui()
print("Ready for jobs.")
runpod.serverless.start({"handler": handler})
HANDLER_EOF
