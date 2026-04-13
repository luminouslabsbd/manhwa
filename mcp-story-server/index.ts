/**
 * AI Studio Story MCP Server
 *
 * Lets any LLM (Claude, GPT, etc.) create full Banglish / gram Bangla stories
 * — characters, episodes, shots — directly in your AI Studio instance.
 *
 * Env vars:
 *   STUDIO_URL      Base URL of AI Studio  (default: http://localhost:3000)
 *   STUDIO_EMAIL    Login email            (default: admin@studio.local)
 *   STUDIO_PASSWORD Login password         (default: ChangeMe123!)
 *
 * Usage with Claude Code:
 *   npx tsx index.ts
 *   — or after build —
 *   node dist/index.js
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const STUDIO_URL = process.env.STUDIO_URL ?? "http://localhost:3000";
const STUDIO_EMAIL = process.env.STUDIO_EMAIL ?? "admin@studio.local";
const STUDIO_PASSWORD = process.env.STUDIO_PASSWORD ?? "ChangeMe123!";

// ─────────────────────────────────────────────────────────────────────────────
// Session management (auto-login, cached cookie)
// ─────────────────────────────────────────────────────────────────────────────
let _sessionCookie: string | null = null;

async function getSession(): Promise<string> {
  if (_sessionCookie) return _sessionCookie;
  const res = await fetch(`${STUDIO_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: STUDIO_EMAIL, password: STUDIO_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/session=([^;]+)/);
  if (!match) throw new Error("No session cookie in login response");
  _sessionCookie = `session=${match[1]}`;
  return _sessionCookie;
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const cookie = await getSession();
  const res = await fetch(`${STUDIO_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    // Session expired — clear and retry once
    _sessionCookie = null;
    const cookie2 = await getSession();
    const res2 = await fetch(`${STUDIO_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie2 },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res2.ok) throw new Error(`API ${method} ${path} failed (${res2.status}): ${await res2.text()}`);
    return res2.json() as Promise<T>;
  }
  if (!res.ok) throw new Error(`API ${method} ${path} failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────────────
const TOOLS: Tool[] = [
  {
    name: "list_projects",
    description: "List all story projects in AI Studio.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_project",
    description: "Get full details of a project — characters, episodes, and shot counts.",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: {
        project_id: { type: "string", description: "UUID of the project" },
      },
    },
  },
  {
    name: "create_project",
    description: "Create a new story project. Returns the project ID you'll use in all subsequent calls.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Project / story title (Bengali, English, or mixed Banglish)" },
        description: { type: "string", description: "Short synopsis of the overall story" },
      },
    },
  },
  {
    name: "add_character",
    description: `Add a character to a project.

For 'appearance': write a detailed English ComfyUI image prompt describing the character's physical look, clothing, expression, and 2D manhwa style. This is used directly for image generation.

For 'reference_prompt': a shorter version of the appearance prompt — used when this character appears in shots.

Example appearance: "shy Bengali village girl age 14, downcast gentle eyes with long lashes, warm brown skin, dark hair in a loose side braid with small flowers, wearing soft lavender salwar kameez, clutching a worn notebook, 2D manhwa illustration, soft pastel colors"`,
    inputSchema: {
      type: "object",
      required: ["project_id", "name"],
      properties: {
        project_id: { type: "string", description: "UUID of the project" },
        name: { type: "string", description: "Character name (Bengali or English)" },
        role: { type: "string", description: "One-line role description e.g. 'নায়িকা — লজ্জাবতী গ্রামের মেয়ে'" },
        description: { type: "string", description: "Full character description with personality, backstory, and sample dialogue in Banglish" },
        appearance: { type: "string", description: "English ComfyUI prompt for image generation — describe physical look, clothing, style" },
        reference_prompt: { type: "string", description: "Shorter ComfyUI prompt used when character appears in episode shots" },
      },
    },
  },
  {
    name: "add_episode",
    description: "Add an episode to a project. Episodes are numbered sequentially.",
    inputSchema: {
      type: "object",
      required: ["project_id", "title", "episode_number"],
      properties: {
        project_id: { type: "string", description: "UUID of the project" },
        title: { type: "string", description: "Episode title (Bengali or Banglish)" },
        synopsis: { type: "string", description: "2-3 sentence synopsis of the episode's events" },
        episode_number: { type: "number", description: "Episode number starting from 1" },
      },
    },
  },
  {
    name: "add_shot",
    description: `Add a shot to an episode. Each shot is one scene/panel.

'shot_description' = Bengali/Banglish action description of what is happening in the scene.
'full_prompt' = English ComfyUI image generation prompt for this specific scene. Include character appearance, pose, emotion, setting, lighting, and always end with "2D manhwa illustration".
'dialogue' = Bengali/Banglish spoken dialogue or inner monologue for this shot.
'character' = must exactly match a character name you created with add_character.

Typical dimensions: portrait shots 832×1216, landscape/wide shots 1216×832.`,
    inputSchema: {
      type: "object",
      required: ["episode_id", "project_id", "shot_number", "character", "shot_description", "full_prompt"],
      properties: {
        episode_id: { type: "string", description: "UUID of the episode" },
        project_id: { type: "string", description: "UUID of the project" },
        shot_number: { type: "string", description: "Shot identifier e.g. 'S01', 'S02'" },
        character: { type: "string", description: "Character name — must match exactly a character added to this project" },
        dialogue: { type: "string", description: "Spoken dialogue or inner monologue (Banglish)" },
        action: { type: "string", description: "Action/stage direction (what the character is doing)" },
        shot_description: { type: "string", description: "Scene description in Bengali or Banglish" },
        full_prompt: { type: "string", description: "Full English ComfyUI prompt for image generation" },
        width: { type: "number", description: "Image width in pixels — 832 (portrait) or 1216 (landscape)", default: 832 },
        height: { type: "number", description: "Image height in pixels — 1216 (portrait) or 832 (landscape)", default: 1216 },
        steps: { type: "number", description: "Diffusion steps (20-40, default 30)", default: 30 },
      },
    },
  },
  {
    name: "generate_episode",
    description: "Queue image generation for all draft/failed shots in an episode. Shots without a character assigned will be skipped.",
    inputSchema: {
      type: "object",
      required: ["episode_id"],
      properties: {
        episode_id: { type: "string", description: "UUID of the episode" },
        regenerate_all: { type: "boolean", description: "If true, regenerate already-completed shots too (default: false)" },
      },
    },
  },
  {
    name: "generate_character_image",
    description: "Queue reference image generation for a character using their appearance prompt.",
    inputSchema: {
      type: "object",
      required: ["character_id"],
      properties: {
        character_id: { type: "string", description: "UUID of the character" },
        regenerate_all: { type: "boolean", description: "Also regenerate all shots that feature this character (default: false)" },
      },
    },
  },
  {
    name: "get_episode_shots",
    description: "List all shots in an episode with their status, character, and generation info.",
    inputSchema: {
      type: "object",
      required: ["episode_id"],
      properties: {
        episode_id: { type: "string", description: "UUID of the episode" },
      },
    },
  },
  {
    name: "get_generation_queue",
    description: "Check the current generation queue — how many jobs are waiting, running, or completed.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool handlers
// ─────────────────────────────────────────────────────────────────────────────
type Args = Record<string, unknown>;

async function handleTool(name: string, args: Args): Promise<unknown> {
  switch (name) {
    case "list_projects": {
      const projects = await api<{ id: string; name: string; created_at: string }[]>("GET", "/api/projects");
      if (!projects.length) return { message: "No projects yet. Use create_project to start." };
      return projects.map(p => ({ id: p.id, name: p.name, created_at: p.created_at }));
    }

    case "get_project": {
      const { project_id } = args as { project_id: string };
      const [project, characters, episodes] = await Promise.all([
        api<Record<string, unknown>>("GET", `/api/projects/${project_id}`),
        api<Record<string, unknown>[]>("GET", `/api/projects/${project_id}/characters`),
        api<Record<string, unknown>[]>("GET", `/api/projects/${project_id}/episodes`),
      ]);
      return {
        project,
        characters: characters.map(c => ({
          id: c.id, name: c.name, role: c.role,
          shot_count: c.shot_count, latest_model: c.latest_model,
        })),
        episodes: episodes.map(e => ({
          id: e.id, title: e.title, episode_number: e.episode_number,
        })),
      };
    }

    case "create_project": {
      const { name, description } = args as { name: string; description?: string };
      const project = await api<{ id: string; name: string }>("POST", "/api/projects", { name, description });
      return { ok: true, project_id: project.id, name: project.name, message: `Project "${name}" created. Now add characters, then episodes, then shots.` };
    }

    case "add_character": {
      const { project_id, name, role, description, appearance, reference_prompt } = args as {
        project_id: string; name: string; role?: string;
        description?: string; appearance?: string; reference_prompt?: string;
      };
      const char = await api<{ id: string; name: string }>("POST", `/api/projects/${project_id}/characters`, {
        name, role, description, appearance, reference_prompt,
        seed: Math.floor(Math.random() * 999999),
      });
      return { ok: true, character_id: char.id, name: char.name };
    }

    case "add_episode": {
      const { project_id, title, synopsis, episode_number } = args as {
        project_id: string; title: string; synopsis?: string; episode_number: number;
      };
      const ep = await api<{ id: string; title: string }>("POST", `/api/projects/${project_id}/episodes`, {
        title, synopsis, episode_number,
      });
      return { ok: true, episode_id: ep.id, title: ep.title };
    }

    case "add_shot": {
      const {
        episode_id, project_id, shot_number, character, dialogue,
        action, shot_description, full_prompt, width, height, steps,
      } = args as {
        episode_id: string; project_id: string; shot_number: string;
        character: string; dialogue?: string; action?: string;
        shot_description: string; full_prompt: string;
        width?: number; height?: number; steps?: number;
      };
      const shot = await api<{ id: string }>("POST", `/api/episodes/${episode_id}/shots`, {
        shot_number,
        character,
        dialogue: dialogue ?? "",
        action: action ?? shot_description,
        shot_description,
        full_prompt,
        width: width ?? 832,
        height: height ?? 1216,
        steps: steps ?? 30,
        status: "draft",
        project_id,
      });
      return { ok: true, shot_id: (shot as { id: string }).id, shot_number };
    }

    case "generate_episode": {
      const { episode_id, regenerate_all } = args as { episode_id: string; regenerate_all?: boolean };
      const result = await api<{ ok: boolean; queued: number; skippedNoChar?: number }>(
        "POST", `/api/episodes/${episode_id}/generate`,
        { regenerateAll: regenerate_all ?? false }
      );
      return {
        ok: result.ok,
        queued: result.queued,
        skipped_no_character: result.skippedNoChar ?? 0,
        message: result.queued > 0
          ? `Queued ${result.queued} shots for generation.${result.skippedNoChar ? ` Skipped ${result.skippedNoChar} shots with no character assigned.` : ""}`
          : "No shots queued. Make sure shots are in draft/failed status and have characters assigned.",
      };
    }

    case "generate_character_image": {
      const { character_id, regenerate_all } = args as { character_id: string; regenerate_all?: boolean };
      const result = await api<{ ok: boolean; queued: number; model: string }>(
        "POST", `/api/characters/${character_id}/generate-shots`,
        { regenerateAll: regenerate_all ?? false }
      );
      return result;
    }

    case "get_episode_shots": {
      const { episode_id } = args as { episode_id: string };
      const shots = await api<Record<string, unknown>[]>("GET", `/api/episodes/${episode_id}/shots`);
      return shots.map(s => ({
        id: s.id,
        shot_number: s.shot_number,
        character: s.character,
        status: s.status,
        dialogue: s.dialogue,
      }));
    }

    case "get_generation_queue": {
      const result = await api<Record<string, unknown>>("GET", "/api/queue/status");
      return result;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Server bootstrap
// ─────────────────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "ai-studio-story", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, (args ?? {}) as Args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
