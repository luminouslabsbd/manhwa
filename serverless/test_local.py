"""
Test the handler locally against a running ComfyUI instance.
Usage: python test_local.py [image|video]
"""
import json, sys, base64
sys.path.insert(0, ".")
from handler import handler, start_comfyui

# Test image generation
def test_image():
    job = {
        "id": "test-img-001",
        "input": {
            "type": "image",
            "prompt": (
                "middle-aged rugged man, weathered face, visible scar across cheek, "
                "unshaven beard, long messy hair, pirate-style worn clothes, heavy build, "
                "intense gaze, dark figure walking toward a seaside inn through a storm, "
                "manhwa style, detailed linework, semi-realistic characters, "
                "dramatic lighting, high contrast shadows, cinematic composition, "
                "low key lighting, deep shadows, strong contrast, moody atmosphere"
            ),
            "seed": 1000,
            "width": 1024,
            "height": 576,
            "steps": 8,
        }
    }
    result = handler(job)
    print(json.dumps({k: v[:50] + "..." if isinstance(v, str) and len(v) > 50 else v
                       for k, v in result.items()}, indent=2))
    if "image_base64" in result:
        with open("/tmp/test_output.png", "wb") as f:
            f.write(base64.b64decode(result["image_base64"]))
        print("Saved to /tmp/test_output.png")

# Test video generation
def test_video():
    # First generate an image, then use it for video
    print("Generating source image first...")
    img_result = handler({
        "id": "test-vid-src",
        "input": {
            "type": "image",
            "prompt": "young teenage boy, slim build, short dark hair, standing in a dark inn, manhwa style, cinematic lighting",
            "seed": 100,
        }
    })
    if "error" in img_result:
        print(f"Image failed: {img_result['error']}")
        return

    print("Now generating video from image...")
    vid_result = handler({
        "id": "test-vid-001",
        "input": {
            "type": "video",
            "prompt": "young teenage boy looking around nervously in a dark inn, subtle movement, cinematic",
            "image_base64": img_result["image_base64"],
            "seed": 100,
            "num_frames": 49,
        }
    })
    print(json.dumps({k: v[:50] + "..." if isinstance(v, str) and len(v) > 50 else v
                       for k, v in vid_result.items()}, indent=2))

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "image"
    if mode == "image":
        test_image()
    elif mode == "video":
        test_video()
    else:
        print(f"Usage: python test_local.py [image|video]")
