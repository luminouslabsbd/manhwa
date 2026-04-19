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
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try { controller.enqueue(chunk); } catch { closed = true; }
      };
      const send = (data: Record<string, unknown>) =>
        safeEnqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      // Retry loop: if setup.log doesn't exist yet, poll until it appears,
      // then `stdbuf -oL tail -f` so every line flushes immediately.
      const remoteCmd =
        `until [ -f /workspace/setup.log ]; do echo '[waiting for setup.log…]'; sleep 2; done; ` +
        `exec stdbuf -oL tail -n 500 -F /workspace/setup.log`;

      const args = [
        "-tt", // force PTY so remote stdout is line-buffered, not block-buffered
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=15",
        "-o", "ServerAliveInterval=15",
        "-o", "ServerAliveCountMax=3",
        "-p", String(ssh.port),
        ...(keyPath ? ["-i", keyPath] : []),
        `root@${ssh.ip}`,
        remoteCmd,
      ];

      const proc = spawn("ssh", args);

      // Line reassembly — SSH chunks may split mid-line.
      let lineBuf = "";
      proc.stdout.on("data", (chunk: Buffer) => {
        lineBuf += chunk.toString();
        const parts = lineBuf.split(/\r?\n/);
        lineBuf = parts.pop() ?? "";
        for (const line of parts) {
          const clean = line.replace(/\r$/, "");
          if (clean.trim()) send({ line: clean, ts: Date.now() });
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text && !text.includes("Warning:")) send({ line: `[ssh] ${text}`, ts: Date.now(), level: "warn" });
      });

      // SSE keepalive comment every 15s so idle proxies don't close the stream.
      const keepalive = setInterval(() => safeEnqueue(encoder.encode(`: ping\n\n`)), 15000);

      proc.on("close", (code) => {
        clearInterval(keepalive);
        if (lineBuf.trim()) send({ line: lineBuf, ts: Date.now() });
        send({ done: true, code, ts: Date.now() });
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      });

      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        proc.kill("SIGTERM");
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Content-Encoding": "identity",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
