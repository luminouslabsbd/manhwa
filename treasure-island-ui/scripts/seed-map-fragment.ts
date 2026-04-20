/**
 * Seed: The Map Fragment — pipeline quality test
 * 24-second pirate scene built to stress-test consistency, motion,
 * anachronism guards, and pacing.
 * 2 characters · 1 episode · 9 shots
 * Run: npx tsx scripts/seed-map-fragment.ts
 */

const BASE = "http://localhost:3000";

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@studio.local", password: "ChangeMe123!" }),
  });
  if (!res.ok) throw new Error(`Login failed: ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/session=([^;]+)/);
  if (!match) throw new Error("No session cookie");
  return `session=${match[1]}`;
}

async function post<T>(cookie: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<T>;
}

const PROJECT_NAME = "The Map Fragment — Pipeline Test";

const NEGATIVE = "modern, asphalt, car, power line, contemporary clothing, neon, plastic, signage, watch, sneakers, glasses, modern haircut, photo-real, distorted hands, extra fingers, blurry, low detail, text, watermark";

const WORLD = "1720s Caribbean, wooden pirate ship interior, oil lantern light, hand-carved oak beams, brass fittings, painterly manhwa style, cinematic lighting, period-accurate";

const CHARACTERS = [
  {
    name: "Finn",
    role: "Cabin boy — protagonist",
    description: "Age 14. Orphan cabin boy on a pirate galleon. Quick fingers, quicker fear. Curious enough to steal a map he shouldn't have touched.",
    appearance: "young boy age 14, lean build, freckled face, messy auburn hair falling over forehead, oversized off-white linen shirt, rope belt at waist, rough brown breeches, bare feet, anxious wide bright green eyes, painterly manhwa illustration, warm cinematic lighting",
    reference_prompt: "young cabin boy age 14, lean, freckles, messy auburn hair, oversized linen shirt, rope belt, bare feet, anxious wide green eyes, 1720s Caribbean pirate setting, painterly manhwa style",
  },
  {
    name: "Captain Vance",
    role: "Pirate captain — antagonist",
    description: "Age 50s. Weathered pirate captain who keeps the torn map locked in his cabin. Slow to anger, terrifying when he gets there.",
    appearance: "weathered pirate captain age 50s, broad shoulders, black beard streaked with grey, deep-set dark eyes, scarred left brow, gold hoop earring, black tricorn hat, long crimson red coat with brass buttons, white linen shirt beneath, leather baldric and cutlass at hip, painterly manhwa illustration, cinematic moody lighting",
    reference_prompt: "weathered pirate captain age 50s, black beard streaked grey, scarred left brow, gold earring, black tricorn hat, long red coat with brass buttons, cutlass at hip, 1720s Caribbean, painterly manhwa style",
  },
];

const SHOTS = [
  {
    shot_number: "S01",
    character: "",
    dialogue: "They said the map was burned.",
    action: "Wide establishing shot of pirate galleon at dusk, storm clouds rolling fast, sails snapping in wind, camera slowly pushes in toward stern window glowing amber",
    full_prompt: `wide establishing shot of a 1720s Caribbean pirate galleon at dusk on open sea, storm clouds rolling fast across sky, sails snapping in heavy wind, camera slowly pushing in toward the stern window glowing warm amber from oil lanterns inside, dramatic moody sky, painterly manhwa illustration, cinematic atmospheric lighting, period-accurate`,
    width: 1216, height: 832, steps: 30,
  },
  {
    shot_number: "S02",
    character: "Finn",
    dialogue: "",
    action: "Finn crouched in shadowed corridor, head whips left then right, hair shifts, chest rising fast with breath",
    full_prompt: `young cabin boy Finn crouched in shadowed wooden ship corridor below deck, head whipping left then right scanning for danger, auburn hair shifting with movement, chest rising fast with rapid breaths, oil lantern flicker casting long shadows, ${WORLD}`,
    width: 832, height: 1216, steps: 30,
  },
  {
    shot_number: "S03",
    character: "Finn",
    dialogue: "They lied.",
    action: "Finn tiptoes into captain's cabin, camera tracks beside him, lantern flame flickers, shadow stretches across map-strewn table",
    full_prompt: `young cabin boy Finn tiptoeing barefoot into the captain's cabin, camera tracking laterally beside him at his height, oil lantern flame flickering on the wall, his long shadow stretching across an oak table strewn with rolled maps, charts and a brass compass, tense quiet movement, ${WORLD}`,
    width: 1216, height: 832, steps: 30,
  },
  {
    shot_number: "S04",
    character: "",
    dialogue: "",
    action: "Close-up of torn map fragment on oak desk, candle wax drips, parchment edge curls in draft, dust motes drift in lamp beam",
    full_prompt: `extreme close-up of a torn weathered parchment map fragment lying on a dark oak desk, hand-inked coastline visible, red wax seal broken on the edge, a candle dripping wax beside it, parchment edge curling slightly in a draft, dust motes drifting in a slanted oil-lamp beam, intricate detail, ${WORLD}`,
    width: 1216, height: 832, steps: 30,
  },
  {
    shot_number: "S05",
    character: "Finn",
    dialogue: "",
    action: "Finn's hand snatches the map, fingers close fast, fabric of sleeve ripples, paper crinkles",
    full_prompt: `tight shot of young cabin boy Finn's freckled hand snatching the torn parchment map fragment from the oak desk, fingers closing fast, oversized linen sleeve rippling with the quick motion, paper crinkling visibly, candle flame leaning from the disturbed air, ${WORLD}`,
    width: 832, height: 1216, steps: 30,
  },
  {
    shot_number: "S06",
    character: "Captain Vance",
    dialogue: "",
    action: "Door bursts open behind him, Captain Vance silhouetted in doorway, red coat billowing, lantern swings violently overhead casting wild shadows",
    full_prompt: `cabin door bursting open with force, weathered pirate Captain Vance standing silhouetted in the doorway, his long crimson red coat billowing dramatically from the rush of air, black tricorn hat low over his eyes, an iron oil lantern swinging violently from a chain overhead casting wild lurching shadows across the cabin walls, dramatic backlight, ${WORLD}`,
    width: 1216, height: 832, steps: 30,
  },
  {
    shot_number: "S07",
    character: "Finn",
    dialogue: "",
    action: "Finn spins to face the captain, eyes blow wide, map clutched to chest, mouth opens in silent gasp",
    full_prompt: `young cabin boy Finn spinning around in shock, his bright green eyes blown wide with terror, the torn parchment map clutched tight against his chest with both hands, mouth open in a silent gasp, auburn hair flying with the spin, oil lantern light catching his freckled face, ${WORLD}`,
    width: 832, height: 1216, steps: 30,
  },
  {
    shot_number: "S08",
    character: "Captain Vance",
    dialogue: "",
    action: "Captain Vance strides forward, boots thunder on planks, hand drops to cutlass hilt, low angle, camera shakes slightly",
    full_prompt: `low-angle shot of weathered pirate Captain Vance striding forward across the cabin planks, heavy black leather boots thundering on the wood, his right hand dropping to the brass cutlass hilt at his hip, long red coat sweeping behind, scarred left brow furrowed, camera shakes slightly with each footfall, intimidating dominant framing, ${WORLD}`,
    width: 832, height: 1216, steps: 30,
  },
  {
    shot_number: "S09",
    character: "Captain Vance",
    dialogue: "Run, boy.",
    action: "Extreme close-up Captain Vance's scarred eye, pupil narrows, slow zoom, lantern glint flares — cut to black",
    full_prompt: `extreme close-up of weathered pirate Captain Vance's scarred left eye, dark iris with pupil slowly narrowing, the deep scar through his eyebrow visible in detail, a single sharp lantern glint flaring across the wet surface of the eye, slow camera zoom in, dramatic chiaroscuro lighting, painterly manhwa style, cinematic intensity`,
    width: 1216, height: 832, steps: 30,
  },
];

async function main() {
  console.log("Seeding 'The Map Fragment' pipeline test\n");

  console.log("Logging in...");
  const cookie = await login();
  console.log("  authenticated\n");

  console.log(`Creating project: ${PROJECT_NAME}`);
  const project = await post<{ id: string }>(cookie, "/api/projects", { name: PROJECT_NAME });
  console.log(`  project id: ${project.id}\n`);

  console.log(`Creating ${CHARACTERS.length} characters...`);
  for (const c of CHARACTERS) {
    const char = await post<{ id: string }>(cookie, `/api/projects/${project.id}/characters`, c);
    console.log(`  ${c.name} -> ${char.id}`);
  }

  console.log(`\nCreating episode...`);
  const ep = await post<{ id: string }>(cookie, `/api/projects/${project.id}/episodes`, {
    title: "The Map Fragment",
    synopsis: "Cabin boy Finn steals a torn map from the captain's quarters; gets caught.",
    episode_number: 1,
  });
  console.log(`  episode id: ${ep.id}\n`);

  console.log(`Creating ${SHOTS.length} shots...`);
  for (let i = 0; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    await post(cookie, `/api/episodes/${ep.id}/shots`, {
      shot_number: s.shot_number,
      character: s.character,
      dialogue: s.dialogue,
      action: s.action,
      shot_description: s.action,
      full_prompt: s.full_prompt,
      negative_prompt: NEGATIVE,
      width: s.width,
      height: s.height,
      steps: s.steps,
      status: "draft",
      project_id: project.id,
    });
    console.log(`  ${s.shot_number} (${i + 1}/${SHOTS.length})`);
  }

  console.log(`
Done.

  Project   : ${PROJECT_NAME}
  Characters: ${CHARACTERS.length}
  Episodes  : 1
  Shots     : ${SHOTS.length}

  Open: http://localhost:3000/projects/${project.id}
`);
}

main().catch(e => { console.error(e); process.exit(1); });
