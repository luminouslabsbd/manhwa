#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# test-pipeline.sh — End-to-end pipeline health check
#
# Usage:
#   bash scripts/test-pipeline.sh           # use UI API (requires dev server on :3000)
#   bash scripts/test-pipeline.sh --direct  # test services directly (no Next.js needed)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

COMFYUI_HOST="${COMFYUI_HOST:-http://localhost:8188}"
TTS_HOST="${TTS_HOST:-}"
OLLAMA_HOST="${OLLAMA_HOST:-}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"
MODE="${1:-}"

PASS=0; FAIL=0

green="\033[32m"; red="\033[31m"; yellow="\033[33m"; reset="\033[0m"; bold="\033[1m"

pass() { echo -e "  ${green}✓${reset} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${red}✗${reset} $1"; FAIL=$((FAIL + 1)); }
skip() { echo -e "  ${yellow}○${reset} $1 (skipped)"; }
header() { echo -e "\n${bold}$1${reset}"; }

check() {
  local label="$1"; shift
  local out
  if out=$("$@" 2>&1); then
    pass "$label: $out"
  else
    fail "$label — $out"
  fi
}

# ── Via Next.js API (default) ──────────────────────────────────────────────
if [[ "$MODE" != "--direct" ]]; then
  header "Running via UI API (http://localhost:3000/api/test-pipeline)"
  echo "  (includes ComfyUI image generation — may take 30-90s)"
  echo ""

  result=$(curl -sf --max-time 120 http://localhost:3000/api/test-pipeline 2>&1) || {
    echo -e "  ${red}✗${reset} Could not reach http://localhost:3000 — is dev server running?"
    echo "  Run: npm run dev  (or use --direct mode)"
    exit 1
  }

  echo "$result" | python3 - << 'PYEOF'
import json, sys

data = json.load(sys.stdin)
s = data["summary"]
results = data["results"]

colors = {"ok": "\033[32m✓\033[0m", "fail": "\033[31m✗\033[0m"}

for r in results:
    icon = colors["ok"] if r["ok"] else colors["fail"]
    ms = r["ms"]
    detail = r.get("detail") or r.get("error") or ""
    print(f"  {icon} {r['name']:<28} {ms:>5}ms  {detail}")

print()
ok_color = "\033[32m" if s["failed"] == 0 else "\033[31m"
print(f"  {ok_color}{s['passed']}/{s['total']} passed\033[0m  ({s['totalMs']}ms total)")
PYEOF
  exit 0
fi

# ── Direct mode — test services without Next.js ────────────────────────────
header "ComfyUI ($COMFYUI_HOST)"

check "reachable" bash -c "curl -sf --max-time 8 '${COMFYUI_HOST}/system_stats' | \
  python3 -c \"import json,sys; d=json.load(sys.stdin); s=d.get('system',d); print('v' + s['comfyui_version'] + ' torch=' + s['pytorch_version'])\""

check "gpu" bash -c "curl -sf --max-time 8 '${COMFYUI_HOST}/system_stats' | \
  python3 -c \"
import json,sys
d=json.load(sys.stdin)
gpus=[x for x in d.get('devices',[]) if x.get('type')=='cuda']
if not gpus: raise SystemExit('no CUDA device')
g=gpus[0]
gb=g.get('vram_total',0)/1024**3
print(f\\\"{g['name']} {gb:.1f}GB\\\")
\""

check "models" bash -c "curl -sf --max-time 8 '${COMFYUI_HOST}/object_info/CheckpointLoaderSimple' | \
  python3 -c \"
import json,sys
d=json.load(sys.stdin)
m=d.get('CheckpointLoaderSimple',{}).get('input',{}).get('required',{}).get('ckpt_name',[['error']])[0]
print(f'{len(m)} models: {m[0] if m else \\\"none\\\"}...')
\""

# ── Image generation test ──────────────────────────────────────────────────
header "ComfyUI image generation (256×256, 4 steps)"
echo "  Submitting test prompt..."
WF=$(python3 - << 'WFEOF'
import json, random
wf = {
  "1": {"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"animagineXL31.safetensors"}},
  "2": {"class_type":"CLIPTextEncode","inputs":{"text":"a red apple on a white table","clip":["1",1]}},
  "3": {"class_type":"CLIPTextEncode","inputs":{"text":"blurry, ugly","clip":["1",1]}},
  "4": {"class_type":"EmptyLatentImage","inputs":{"width":256,"height":256,"batch_size":1}},
  "5": {"class_type":"KSampler","inputs":{"model":["1",0],"positive":["2",0],"negative":["3",0],
        "latent_image":["4",0],"seed":random.randint(1,999999),"steps":4,"cfg":7.0,
        "sampler_name":"euler","scheduler":"normal","denoise":1.0}},
  "6": {"class_type":"VAEDecode","inputs":{"samples":["5",0],"vae":["1",2]}},
  "7": {"class_type":"SaveImage","inputs":{"images":["6",0],"filename_prefix":"test_pipeline"}},
}
print(json.dumps({"prompt": wf}))
WFEOF
)

PROMPT_ID=$(echo "$WF" | curl -sf --max-time 15 -X POST \
  -H "Content-Type: application/json" \
  -d @- "${COMFYUI_HOST}/prompt" | python3 -c "import json,sys; print(json.load(sys.stdin)['prompt_id'])" 2>/dev/null || echo "")

if [[ -z "$PROMPT_ID" ]]; then
  fail "generate — failed to queue prompt"
else
  echo "  prompt_id: $PROMPT_ID"
  echo "  Waiting for completion (up to 180s, incl. cold model load)..."
  T0=$SECONDS
  DONE=false
  for _ in $(seq 1 90); do
    sleep 2
    HIST=$(curl -sf --max-time 8 "${COMFYUI_HOST}/history/${PROMPT_ID}" 2>/dev/null || echo "{}")
    FNAME=$(echo "$HIST" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for k,v in d.items():
    for node,out in v.get('outputs',{}).items():
        imgs=out.get('images',[])
        if imgs: print(imgs[0]['filename']); exit(0)
" 2>/dev/null || echo "")
    if [[ -n "$FNAME" ]]; then
      ELAPSED=$((SECONDS - T0))
      pass "generate — ${FNAME} (${ELAPSED}s)"
      DONE=true
      break
    fi
  done
  [[ "$DONE" == "false" ]] && fail "generate — timed out after 180s"
fi

# ── TTS ──────────────────────────────────────────────────────────────────
if [[ -n "$TTS_HOST" ]]; then
  header "TTS ($TTS_HOST)"
  check "reachable" bash -c "curl -sf --max-time 8 '${TTS_HOST}/health' | python3 -c \"import json,sys; d=json.load(sys.stdin); print('engine=' + d.get('engine','?'))\""
  check "generate" bash -c "curl -sf --max-time 20 -X POST '${TTS_HOST}/api/tts/generate' \
    -H 'Content-Type: application/json' \
    -d '{\"text\":\"Pipeline test.\",\"voice\":\"default\"}' | \
    python3 -c \"import json,sys; d=json.load(sys.stdin); print(str(d.get('duration_ms','?')) + 'ms') if d.get('success') else exit(d.get('error','failed'))\""
else
  header "TTS"; skip "TTS_HOST not set"
fi

# ── Ollama ────────────────────────────────────────────────────────────────
if [[ -n "$OLLAMA_HOST" ]]; then
  header "Ollama ($OLLAMA_HOST)"
  check "reachable" bash -c "curl -sf --max-time 8 '${OLLAMA_HOST}/api/tags' | \
    python3 -c \"import json,sys; m=json.load(sys.stdin).get('models',[]); print(str(len(m)) + ' models')\""
  check "inference ($OLLAMA_MODEL)" bash -c "
    out=\$(curl -sf --max-time 60 -X POST '${OLLAMA_HOST}/api/generate' \
      -H 'Content-Type: application/json' \
      -d '{\"model\":\"${OLLAMA_MODEL}\",\"prompt\":\"Reply with one word: yes\",\"stream\":false}') || exit 1
    [[ -z \"\$out\" ]] && echo 'empty response' && exit 1
    echo \"\$out\" | python3 -c \"import json,sys; d=json.load(sys.stdin); print(str(d.get('eval_count',0)) + ' tokens: ' + repr(d.get('response','').strip()))\"
  "
else
  header "Ollama"; skip "OLLAMA_HOST not set"
fi

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
TOTAL=$((PASS + FAIL))
if [[ $FAIL -eq 0 ]]; then
  echo -e "${green}${bold}All $PASS/$TOTAL tests passed${reset}"
else
  echo -e "${red}${bold}$FAIL/$TOTAL tests FAILED${reset} ($PASS passed)"
  exit 1
fi
