#!/usr/bin/env python3
"""Fetch history from ComfyUI pod, extract shot data + download images, build data.json"""
import json, os, sys, uuid
from pathlib import Path

HOST = "https://xh21a2fjn7e7b3-8188.proxy.runpod.net"
PROJECT_NAME = "Treasure Island"
OUT_DIR = Path("public/generated")

import subprocess, urllib.parse

def fetch_json(url):
    r = subprocess.run(["curl", "-s", "--max-time", "30", url], capture_output=True, text=True)
    return json.loads(r.stdout)

def download_image(filename, subfolder, dest_path):
    url = f"{HOST}/view?filename={urllib.parse.quote(filename)}&subfolder={urllib.parse.quote(subfolder)}&type=output"
    subprocess.run(["curl", "-s", "--max-time", "30", "-o", str(dest_path), url], check=True)

print("Fetching history from pod...")
history = fetch_json(f"{HOST}/history")
print(f"Got {len(history)} history entries")

# Parse all completed shots
shots_map = {}  # key: "EP01_S01" -> {prompt, seed, filename, subfolder, prompt_id}
for pid, entry in history.items():
    outputs = entry.get("outputs", {})
    prompt_nodes = entry.get("prompt", [None]*4)
    wf = prompt_nodes[2] if isinstance(prompt_nodes, list) and len(prompt_nodes) > 2 else {}
    text_prompt = ""
    seed = 0
    for nid, node in (wf or {}).items():
        cls = node.get("class_type", "")
        inputs = node.get("inputs", {})
        if cls == "CLIPTextEncode" and "text" in inputs:
            text_prompt = inputs["text"]
        if cls == "RandomNoise" and "noise_seed" in inputs:
            seed = inputs["noise_seed"]
    for nid, nout in outputs.items():
        for img in nout.get("images", []):
            fn = img.get("filename", "")
            parts = fn.split("_")
            if len(parts) >= 3:
                ep, sn = parts[0], parts[1]
                key = f"{ep}_{sn}"
                # Keep latest (overwrite)
                shots_map[key] = dict(ep=ep, shot=sn, filename=fn, subfolder=img.get("subfolder",""), prompt=text_prompt, seed=seed, prompt_id=pid)

print(f"Found {len(shots_map)} unique shots")

# Group by episode
episodes = {}
for key in sorted(shots_map):
    s = shots_map[key]
    ep = s["ep"]
    if ep not in episodes:
        episodes[ep] = []
    episodes[ep].append(s)

# Build data.json
project_id = str(uuid.uuid4())
db = {"projects": [], "episodes": [], "shots": [], "generations": []}

db["projects"].append({
    "id": project_id, "name": PROJECT_NAME, "style_guide": None,
    "style_guide_filename": None, "storyboard_filename": "260401 TREASURE ISLAND text storyboard v4.docx",
    "status": "active", "created_at": "2026-04-06T00:00:00.000Z"
})

img_dir = OUT_DIR / project_id
img_dir.mkdir(parents=True, exist_ok=True)

total_downloaded = 0
for ep_key in sorted(episodes):
    ep_num = int(ep_key.replace("EP", ""))
    ep_id = str(uuid.uuid4())
    ep_shots = episodes[ep_key]
    db["episodes"].append({
        "id": ep_id, "project_id": project_id, "number": ep_num,
        "title": f"Episode {ep_num}", "summary": None,
        "created_at": "2026-04-06T00:00:00.000Z"
    })
    for s in ep_shots:
        shot_num = int(s["shot"].replace("S", ""))
        shot_id = str(uuid.uuid4())
        gen_id = str(uuid.uuid4())
        img_filename = f"{gen_id}.png"
        img_rel = f"/generated/{project_id}/{img_filename}"
        img_abs = img_dir / img_filename

        # Download image from pod
        print(f"  Downloading {s['ep']}_{s['shot']}...", end=" ", flush=True)
        try:
            download_image(s["filename"], s["subfolder"], str(img_abs))
            print("OK")
            total_downloaded += 1
            gen_status = "completed"
        except Exception as e:
            print(f"FAIL: {e}")
            gen_status = "failed"
            img_rel = None

        db["shots"].append({
            "id": shot_id, "episode_id": ep_id, "project_id": project_id,
            "shot_number": shot_num, "character": None,
            "shot_description": s["prompt"][:200] if s["prompt"] else f"Shot {shot_num}",
            "environment": "various", "lighting": "dramatic", "camera_angle": "medium shot",
            "full_prompt": s["prompt"], "negative_prompt": "blurry, low quality, distorted, watermark",
            "seed": s["seed"], "width": 1024, "height": 576, "steps": 8,
            "status": "done" if gen_status == "completed" else "failed",
            "approved_image_id": gen_id if gen_status == "completed" else None,
            "approved_video_id": None,
            "created_at": "2026-04-06T00:00:00.000Z"
        })
        db["generations"].append({
            "id": gen_id, "shot_id": shot_id, "type": "image",
            "comfyui_prompt_id": s["prompt_id"], "status": gen_status,
            "seed": s["seed"], "image_path": img_rel, "video_path": None,
            "error": None, "created_at": "2026-04-06T00:00:00.000Z",
            "completed_at": "2026-04-06T00:00:00.000Z" if gen_status == "completed" else None
        })

with open("data.json", "w") as f:
    json.dump(db, f, indent=2)

print(f"\nDone! {total_downloaded} images downloaded")
print(f"Episodes: {len(db['episodes'])}, Shots: {len(db['shots'])}, Generations: {len(db['generations'])}")
print(f"data.json written, images in {img_dir}")
