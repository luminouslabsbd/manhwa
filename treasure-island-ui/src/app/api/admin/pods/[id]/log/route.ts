import { spawn } from "child_process";
import { join } from "path";
import { homedir } from "os";
import { accessSync } from "fs";
import { getPodSshInfo } from "@/lib/runpod";
import { verifyAdmin } from "@/lib/dal";

// GET /api/admin/pods/[id]/log  — SSE stream of /workspace/setup.log
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await verifyAdmin();
  const { id } = await params;

  const ssh = await getPodSshInfo(id).catch(() => null);
  if (!ssh) {
    return new Response(`data: ${JSON.stringify({ line: "Pod not running or SSH not ready yet..." })}\n\n`, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  // Find SSH key
  const keyPaths = [
    join(homedir(), ".ssh", "id_ed25519"),
    join(homedir(), ".ssh", "id_rsa"),
    join(homedir(), ".ssh", "runpod"),
  ];
  const keyPath = keyPaths.find((p) => { try { accessSync(p); return true; } catch { return false; } });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const args = [
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=15",
        "-o", "ServerAliveInterval=10",
        "-p", String(ssh.port),
        ...(keyPath ? ["-i", keyPath] : []),
        `root@${ssh.ip}`,
        "tail -f -n 200 /workspace/setup.log 2>/dev/null || (sleep 3; tail -f -n 200 /workspace/setup.log 2>/dev/null) || echo '[waiting for setup to start...]'",
      ];

      const proc = spawn("ssh", args);

      const send = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        for (const line of text.split("\n")) {
          if (line.trim()) send({ line, ts: Date.now() });
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text && !text.includes("Warning:")) send({ line: `[ssh] ${text}`, ts: Date.now(), level: "warn" });
      });

      proc.on("close", (code) => {
        send({ done: true, code, ts: Date.now() });
        try { controller.close(); } catch { /* already closed */ }
      });

      req.signal.addEventListener("abort", () => {
        proc.kill();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
