#!/usr/bin/env python3
"""Queue all draft characters for generation on ComfyUI."""
import json, subprocess, uuid

HOST = "https://xh21a2fjn7e7b3-8188.proxy.runpod.net"
db = json.load(open("data.json"))
chars = [c for c in db.get("characters", []) if c["status"] in ("draft", "failed")]

print(f"Queuing {len(chars)} characters for generation...")

for c in chars:
    seed = c.get("seed") or hash(c["name"]) % 999999
    prompt = c["reference_prompt"]
    workflow = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "flux1-schnell-fp8.safetensors", "weight_dtype": "fp8_e4m3fn"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": {"clip_name1": "t5xxl_fp8_e4m3fn.safetensors", "clip_name2": "clip_l.safetensors", "type": "flux"}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "4": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 768, "height": 1024, "batch_size": 1}},
        "5": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "6": {"class_type": "BasicScheduler", "inputs": {"scheduler": "simple", "steps": 8, "denoise": 1.0, "model": ["1", 0]}},
        "7": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "8": {"class_type": "BasicGuider", "inputs": {"model": ["1", 0], "conditioning": ["3", 0]}},
        "9": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["5", 0], "guider": ["8", 0], "sampler": ["7", 0], "sigmas": ["6", 0], "latent_image": ["4", 0]}},
        "10": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "11": {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["10", 0]}},
        "12": {"class_type": "SaveImage", "inputs": {"filename_prefix": f"char_{c['name'].replace(' ', '_')}", "images": ["11", 0]}},
    }

    payload = json.dumps({"prompt": workflow})
    result = subprocess.run(
        ["curl", "-s", "--max-time", "10", "-X", "POST",
         "-H", "Content-Type: application/json",
         "-d", payload, f"{HOST}/prompt"],
        capture_output=True, text=True
    )

    try:
        resp = json.loads(result.stdout)
        prompt_id = resp.get("prompt_id", "???")
        print(f"  ✓ {c['name']}: queued (prompt_id={prompt_id[:8]}..., seed={seed})")

        # Save generation to data.json
        gen_id = str(uuid.uuid4())
        db["generations"].append({
            "id": gen_id, "shot_id": c["id"], "type": "image",
            "comfyui_prompt_id": prompt_id, "status": "running",
            "seed": seed, "image_path": None, "video_path": None,
            "error": None, "created_at": "2026-04-06T00:00:00.000Z",
            "completed_at": None,
        })
        c["status"] = "generating"
        c["seed"] = seed
    except Exception as e:
        print(f"  ✗ {c['name']}: FAILED — {e}")
        c["status"] = "failed"

with open("data.json", "w") as f:
    json.dump(db, f, indent=2)

print(f"\nAll {len(chars)} characters queued! ~20s each = ~3 minutes total.")
print("Use 'Check Results' button on the Characters page when done.")
