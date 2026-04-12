"""
RunPod Serverless Handler for ComfyUI
Supports: image generation (FLUX) and image-to-video (Wan2.2)
"""
import os, json, time, uuid, base64, requests, subprocess, signal, sys

COMFY_HOST = "http://127.0.0.1:8188"
COMFY_OUTPUT = "/ComfyUI/output"
MAX_WAIT = 600  # 10 min timeout

# ─── Start ComfyUI in background ────────────────────────────────────
comfy_proc = None

def start_comfyui():
    global comfy_proc
    if comfy_proc and comfy_proc.poll() is None:
        return
    comfy_proc = subprocess.Popen(
        [sys.executable, "main.py", "--listen", "0.0.0.0", "--port", "8188",
         "--disable-auto-launch", "--disable-metadata"],
        cwd="/ComfyUI",
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    # Wait until API is ready
    for _ in range(120):
        try:
            r = requests.get(f"{COMFY_HOST}/system_stats", timeout=2)
            if r.ok: return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("ComfyUI failed to start within 120s")


# ─── FLUX Image Generation Workflow ─────────────────────────────────
def build_flux_workflow(prompt: str, seed: int, width=1024, height=576, steps=8):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "flux1-schnell-fp8.safetensors", "weight_dtype": "fp8_e4m3fn"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": {
            "clip_name1": "t5xxl_fp8_e4m3fn.safetensors",
            "clip_name2": "clip_l.safetensors", "type": "flux"}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {
            "text": prompt, "clip": ["2", 0]}},
        "4": {"class_type": "EmptySD3LatentImage", "inputs": {
            "width": width, "height": height, "batch_size": 1}},
        "5": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "6": {"class_type": "BasicScheduler", "inputs": {
            "scheduler": "simple", "steps": steps, "denoise": 1.0, "model": ["1", 0]}},
        "7": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "8": {"class_type": "BasicGuider", "inputs": {
            "model": ["1", 0], "conditioning": ["3", 0]}},
        "9": {"class_type": "SamplerCustomAdvanced", "inputs": {
            "noise": ["5", 0], "guider": ["8", 0], "sampler": ["7", 0],
            "sigmas": ["6", 0], "latent_image": ["4", 0]}},
        "10": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "11": {"class_type": "VAEDecode", "inputs": {
            "samples": ["9", 0], "vae": ["10", 0]}},
        "12": {"class_type": "SaveImage", "inputs": {
            "filename_prefix": f"serverless/{uuid.uuid4().hex[:8]}",
            "images": ["11", 0]}},
    }


# ─── Wan2.2 Image-to-Video Workflow ─────────────────────────────────
def build_i2v_workflow(prompt: str, image_path: str, seed: int, num_frames=49):
    return {
        "1": {"class_type": "WanVideoModelLoader", "inputs": {
            "model_name": "WanVideo/2_2/wan2.2_ti2v_5B_fp16.safetensors",
            "quantization": "fp8_e4m3fn_fast"}},
        "2": {"class_type": "WanVideoBlockSwap", "inputs": {
            "model": ["1", 0], "blocks_to_swap": 28}},
        "3": {"class_type": "WanVideoTextEncode", "inputs": {
            "model": ["2", 0], "positive_prompt": prompt,
            "negative_prompt": "blurry, static, low quality, distorted"}},
        "4": {"class_type": "LoadImage", "inputs": {"image": image_path}},
        "5": {"class_type": "WanVideoImageEncode", "inputs": {
            "model": ["2", 0], "image": ["4", 0],
            "width": 832, "height": 480, "num_frames": num_frames}},
        "6": {"class_type": "WanVideoSampler", "inputs": {
            "model": ["2", 0], "positive": ["3", 0], "negative": ["3", 1],
            "embeds": ["5", 0], "steps": 20, "cfg": 5.0,
            "seed": seed, "sampler_name": "uni_pc_bh2"}},
        "7": {"class_type": "WanVideoDecode", "inputs": {
            "model": ["2", 0], "samples": ["6", 0],
            "enable_vae_tiling": True, "tile_size": 128}},
        "8": {"class_type": "VHS_VideoCombine", "inputs": {
            "images": ["7", 0], "frame_rate": 24,
            "filename_prefix": f"serverless/{uuid.uuid4().hex[:8]}",
            "format": "video/h264-mp4"}},
    }


# ─── Queue workflow and wait for result ──────────────────────────────
def queue_and_wait(workflow: dict) -> dict:
    r = requests.post(f"{COMFY_HOST}/prompt", json={"prompt": workflow})
    r.raise_for_status()
    prompt_id = r.json()["prompt_id"]

    start = time.time()
    while time.time() - start < MAX_WAIT:
        hist = requests.get(f"{COMFY_HOST}/history/{prompt_id}").json()
        if prompt_id in hist:
            outputs = hist[prompt_id].get("outputs", {})
            status = hist[prompt_id].get("status", {})
            if status.get("completed"):
                return {"outputs": outputs, "prompt_id": prompt_id}
            if status.get("status_str") == "error":
                msgs = status.get("messages", [])
                raise RuntimeError(f"ComfyUI error: {msgs}")
        time.sleep(2)
    raise TimeoutError(f"Generation timed out after {MAX_WAIT}s")


# ─── Extract output files ────────────────────────────────────────────
def get_output_files(outputs: dict) -> dict:
    result = {}
    for node_id, node_out in outputs.items():
        if "images" in node_out:
            for img in node_out["images"]:
                fpath = os.path.join(COMFY_OUTPUT, img["subfolder"], img["filename"])
                with open(fpath, "rb") as f:
                    result["image_base64"] = base64.b64encode(f.read()).decode()
                    result["image_filename"] = img["filename"]
        if "gifs" in node_out:
            for vid in node_out["gifs"]:
                fpath = os.path.join(COMFY_OUTPUT, vid["subfolder"], vid["filename"])
                with open(fpath, "rb") as f:
                    result["video_base64"] = base64.b64encode(f.read()).decode()
                    result["video_filename"] = vid["filename"]
    return result


# ─── RunPod Handler ──────────────────────────────────────────────────
def handler(job):
    """Main entry point for RunPod serverless."""
    job_input = job["input"]
    job_type = job_input.get("type", "image")
    prompt = job_input.get("prompt", "")
    seed = job_input.get("seed", 42)

    try:
        start_comfyui()

        if job_type == "image":
            width = job_input.get("width", 1024)
            height = job_input.get("height", 576)
            steps = job_input.get("steps", 8)
            workflow = build_flux_workflow(prompt, seed, width, height, steps)
        elif job_type == "video":
            # Save input image to disk
            img_b64 = job_input.get("image_base64", "")
            img_path = f"/ComfyUI/input/serverless_{uuid.uuid4().hex[:8]}.png"
            with open(img_path, "wb") as f:
                f.write(base64.b64decode(img_b64))
            num_frames = job_input.get("num_frames", 49)
            workflow = build_i2v_workflow(prompt, os.path.basename(img_path), seed, num_frames)
        else:
            return {"error": f"Unknown type: {job_type}"}

        result = queue_and_wait(workflow)
        files = get_output_files(result["outputs"])
        return {"status": "success", "seed": seed, **files}

    except Exception as e:
        return {"error": str(e)}


# ─── Entry Point ─────────────────────────────────────────────────────
if __name__ == "__main__":
    import runpod
    print("Starting RunPod serverless handler (self-contained, no network volume)")
    print("Pre-warming ComfyUI...")
    start_comfyui()
    print("ComfyUI ready. Waiting for jobs...")
    runpod.serverless.start({"handler": handler})
