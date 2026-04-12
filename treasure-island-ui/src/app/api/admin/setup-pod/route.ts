import { execFile } from "child_process";
import { promisify } from "util";
import { homedir } from "os";
import path from "path";

const execAsync = promisify(execFile);

// Script is base64-encoded before sending to avoid all quoting/escaping issues over SSH
// NOTE: bash $VAR and $(cmd) must be escaped as \${VAR} and \$(cmd) inside JS template literals
const INSTALL_SCRIPT = `#!/usr/bin/env bash
set +e
NODE_DIR=/workspace/ComfyUI/custom_nodes
mkdir -p "\$NODE_DIR"
cd "\$NODE_DIR"

install_node() {
  local repo="\$1"
  local name=\$(basename "\$repo")
  if [ ! -d "\$name/.git" ]; then
    git clone -q "\$repo" && echo "INSTALLED:\$name"
    [ -f "\$name/requirements.txt" ] && pip install -q -r "\$name/requirements.txt" 2>/dev/null
  else
    git -C "\$name" pull -q && echo "UPDATED:\$name"
    [ -f "\$name/requirements.txt" ] && pip install -q -r "\$name/requirements.txt" 2>/dev/null
  fi
}

install_node https://github.com/kijai/ComfyUI-WanVideoWrapper
install_node https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite

# Fix torchaudio ABI mismatch — WanVideoWrapper imports it at load time
TORCH_VER=\$(python3 -c "import torch; print(torch.__version__.split('+')[0])" 2>/dev/null)
CUDA_TAG=\$(python3 -c "import torch; v=torch.__version__; print(v.split('+')[1] if '+' in v else 'cpu')" 2>/dev/null)
if [ -n "\$TORCH_VER" ]; then
  pip install -q --upgrade --force-reinstall --no-cache-dir "torchaudio==\${TORCH_VER}" \\
    --index-url "https://download.pytorch.org/whl/\${CUDA_TAG}" 2>/dev/null
  echo "FIXED:torchaudio:\${TORCH_VER}+\${CUDA_TAG}"
fi

# Restart ComfyUI — kill only ComfyUI process, not the container entrypoint
COMFY_PID=\$(pgrep -f "ComfyUI/main.py" | head -1)
if [ -n "\$COMFY_PID" ]; then
  kill -9 "\$COMFY_PID" 2>/dev/null || true
  sleep 3
fi
nohup python3 /workspace/ComfyUI/main.py --listen 0.0.0.0 --port 8188 > /workspace/comfyui.log 2>&1 &
CPID=\$!
disown \$CPID
echo "RESTARTED:ComfyUI:PID=\$CPID"
`;

async function getPodSSH(podId: string, apiKey: string): Promise<{ ip: string; port: number } | null> {
  const res = await fetch(`https://api.runpod.io/graphql?api_key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query { pod(input: { podId: "${podId}" }) { runtime { ports { ip privatePort publicPort type } } } }`,
    }),
  });
  const data = await res.json();
  const ports: { ip: string; privatePort: number; publicPort: number; type: string }[] =
    data?.data?.pod?.runtime?.ports ?? [];
  const sshPort = ports.find((p) => p.privatePort === 22 && p.type === "tcp");
  return sshPort ? { ip: sshPort.ip, port: sshPort.publicPort } : null;
}

export async function POST() {
  const apiKey = process.env.RUNPOD_API_KEY;
  const podId = process.env.RUNPOD_POD_ID;

  if (!apiKey || !podId) {
    return Response.json({ error: "RUNPOD_API_KEY or RUNPOD_POD_ID not set in .env.local" }, { status: 400 });
  }

  // Get SSH connection details from RunPod API
  let ssh: { ip: string; port: number } | null = null;
  try {
    ssh = await getPodSSH(podId, apiKey);
  } catch (e) {
    return Response.json({ error: `RunPod API error: ${e}` }, { status: 500 });
  }
  if (!ssh) {
    return Response.json({ error: "Pod not running or SSH port not found. Start the pod first." }, { status: 503 });
  }

  // Try common SSH key paths
  const keyPaths = [
    path.join(homedir(), ".ssh", "id_ed25519"),
    path.join(homedir(), ".ssh", "id_rsa"),
    path.join(homedir(), ".ssh", "runpod"),
  ];
  const keyPath = keyPaths.find((p) => {
    try { require("fs").accessSync(p); return true; } catch { return false; }
  });

  const encoded = Buffer.from(INSTALL_SCRIPT).toString("base64");
  const sshArgs = [
    "-p", String(ssh.port),
    "-o", "StrictHostKeyChecking=no",
    "-o", "ConnectTimeout=20",
    "-o", "BatchMode=yes",
    ...(keyPath ? ["-i", keyPath] : []),
    `root@${ssh.ip}`,
    `bash -c "echo ${encoded} | base64 -d | bash"`,
  ];

  try {
    const { stdout, stderr } = await execAsync("ssh", sshArgs, { timeout: 120_000 });
    const lines = (stdout + stderr).split("\n").filter(Boolean);
    const installed = lines.filter((l) => l.startsWith("INSTALLED:") || l.startsWith("UPDATED:") || l.startsWith("RESTARTED:"));
    return Response.json({
      ok: true,
      pod: podId,
      ssh: `${ssh.ip}:${ssh.port}`,
      actions: installed,
      raw: lines,
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return Response.json({
      error: "SSH command failed",
      detail: e.stderr || e.message,
      stdout: e.stdout,
    }, { status: 500 });
  }
}
