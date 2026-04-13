/**
 * Seed: মেহের জাহান — The Shy Village Girl
 * A Banglish-style gram Bangla story about finding your voice
 * 7 characters · 6 episodes · 54 shots
 * Run: npx tsx scripts/seed-meher-jahan.ts
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
  if (!res.ok) throw new Error(`❌ POST ${path} failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────
// PROJECT
// ─────────────────────────────────────────────────────────────
const PROJECT_NAME = "মেহের জাহান";

// ─────────────────────────────────────────────────────────────
// CHARACTERS
// ─────────────────────────────────────────────────────────────
const CHARACTERS = [
  {
    name: "মেহের জাহান",
    role: "নায়িকা — লজ্জাবতী গ্রামের মেয়ে",
    description: "বয়স ১৪। চোখ নামানো, কথা কম, মন গভীর। গ্রামের সবচেয়ে শান্ত মেয়ে। সে কবিতা লেখে কিন্তু কাউকে দেখায় না। বলে খুব কম — 'Ami... ami jani na' — কিন্তু ভেতরে ভেতরে সে একটা আগুন লুকিয়ে রেখেছে।",
    appearance: "shy Bengali village girl age 14, downcast gentle eyes with long lashes, warm brown skin, dark hair in a loose side braid with small flowers tucked in, wearing soft lavender and white salwar kameez, clutching a worn notebook to her chest, slightly hunched shy posture, bare feet, 2D manhwa illustration, soft pastel colors",
    reference_prompt: "shy gentle Bengali village girl age 14, downcast eyes long lashes, loose side braid with flowers, lavender salwar, clutching notebook, soft humble expression, 2D manhwa cartoon style",
  },
  {
    name: "আম্মু",
    role: "মেহেরের মা — ভালোবাসার আঁচল",
    description: "বয়স ৩৮। মেহেরের মা, সংসারের সব কাজ করেন একা। বুঝদার, মায়াবী। বলেন — 'মা, তুমি চুপ থাকলেই মানুষ ভাববে তুমি কিছু জানো না। কিন্তু আমি জানি তোমার ভেতরে কত কথা।'",
    appearance: "Bengali village mother age 38, gentle tired but warm face, hair in neat bun with loose strands, wearing faded pink cotton saree with green border, cooking or working, loving exhausted expression, warm kitchen or courtyard setting, 2D manhwa illustration",
    reference_prompt: "loving Bengali village mother age 38, bun hair loose strands, faded pink saree, warm gentle tired face, working in courtyard, 2D manhwa cartoon style",
  },
  {
    name: "নাসরিন",
    role: "বেস্ট ফ্রেন্ড — সাহসী মুখরা",
    description: "বয়স ১৪। মেহেরের একদম উল্টো — সাহসী, মুখর, সরাসরি। বলে — 'Meher, tumi eto chup thako keno? Tomar moton sundor likhte parle ami hoyto celebrity hoye jaitam!' তার হাসি পুরো গ্রাম শুনতে পায়।",
    appearance: "bold energetic Bengali village girl age 14, bright mischievous eyes, short curly hair, dark skin, wearing bright orange kurta and churidar, hands always gesturing expressively, big confident smile, standing tall, 2D manhwa illustration, warm vibrant colors",
    reference_prompt: "bold energetic Bengali village girl age 14, short curly hair, bright orange kurta, mischievous bright eyes, confident big smile, expressive gestures, 2D manhwa cartoon style",
  },
  {
    name: "সালেহা আপা",
    role: "শিক্ষিকা — মেহেরের আলো",
    description: "বয়স ৩২। গ্রামের নতুন school teacher, Dhaka থেকে এসেছেন। তিনিই প্রথম মেহেরের notebook পড়েন। বলেন — 'Meher, ei kobita tumi likhso? Ei shob tomar bhitor theke aashchhe — ei shob manusher katha শোনা dorkar।' তাঁর কথায় মেহেরের জীবন বদলে যায়।",
    appearance: "young Bengali female teacher age 32, elegant simple look, hair in low ponytail, wearing white and teal salwar kameez, holding student notebook with amazed expression, round silver glasses, warm encouraging smile, village school setting, 2D manhwa illustration",
    reference_prompt: "young elegant Bengali female teacher age 32, ponytail hair, round silver glasses, white teal salwar, holding notebook with amazed expression, warm smile, 2D manhwa cartoon style",
  },
  {
    name: "রফিক ভাই",
    role: "বড় ভাই — রক্ষক কিন্তু বন্ধু",
    description: "বয়স ১৮। মেহেরের বড় ভাই, মাঠে কাজ করে। রোদে পোড়া মুখ, হাসলে দাঁত দেখা যায়। বলে — 'Meher, tumi ki boro hoye teacher hobe? Ami tomar jonno pothi poro.' মেহেরকে সবচেয়ে বেশি বোঝে।",
    appearance: "Bengali young man age 18, sun-tanned rough hands, white undershirt with lunghi, short messy hair, big warm smile showing teeth, strong farm worker build, protective gentle expression, rural field background, 2D manhwa illustration",
    reference_prompt: "Bengali young farmer brother age 18, sun-tanned face, white undershirt lunghi, messy hair, big warm smile, strong gentle build, 2D manhwa cartoon style",
  },
  {
    name: "মিঠু",
    role: "ছোট বোন — মেহেরের আনন্দ",
    description: "বয়স ৮। মেহেরের ছোট বোন, দুষ্টু আর চঞ্চল। সবসময় মেহেরের পিছে পিছে থাকে। বলে — 'Apu! Apu! Tomar notebuk-e ki likhso? Amare poro na! Pliiiiz!' তার হাসিতে ঘর ভরে যায়।",
    appearance: "tiny mischievous Bengali village girl age 8, two small pigtails with colorful rubber bands, round chubby face with big eyes, gap-toothed smile, bright yellow frock with flowers, barefoot always running, 2D manhwa illustration, cute chibi-style with bright colors",
    reference_prompt: "tiny mischievous Bengali village girl age 8, pigtails with colorful bands, chubby round face gap-toothed smile, yellow flower frock, barefoot running, 2D manhwa chibi style",
  },
  {
    name: "জলিল চাচা",
    role: "গ্রামের গল্পকার — বটগাছের মতো",
    description: "বয়স ৬৫। গ্রামের নাপিত, কিন্তু সবার বিশ্বস্ত বন্ধু। গল্প জানেন হাজারটা। বলেন — 'মেহের মা, লজ্জা মানে দুর্বলতা না। লজ্জা মানে সম্মান। কিন্তু কথা না বললে মন মরে যায়।'",
    appearance: "wise elderly Bengali village barber age 65, thin wiry build, salt and pepper beard, wearing simple lungi and cotton vest, always with a small comb tucked behind ear, sitting under large tree, storytelling expression, warm crinkled eyes, 2D manhwa illustration",
    reference_prompt: "wise elderly Bengali village barber age 65, salt pepper beard, lungi cotton vest, comb behind ear, sitting under tree, storytelling wise expression, 2D manhwa cartoon style",
  },
];

// ─────────────────────────────────────────────────────────────
// EPISODES
// ─────────────────────────────────────────────────────────────
type ShotDef = {
  shot_number: number; character: string; shot_description: string;
  environment: string; lighting: string; camera_angle: string;
  story_line: string; dialogue: string; full_prompt: string;
  negative_prompt: string; width: number; height: number; steps: number; seed: number; status: string;
};
type EpDef = { title: string; description: string; shots: ShotDef[] };

const NEG = "ugly, deformed, bad anatomy, blurry, watermark, text, nsfw, adult content, extra limbs";

const EPISODES: EpDef[] = [

  // ═══════════════════════════════════════════════════════════
  // EP 1 — লজ্জাবতী মেহের
  // ═══════════════════════════════════════════════════════════
  {
    title: "লজ্জাবতী মেহের",
    description: "মেহের জাহানের পরিচয়। গ্রামের শান্ত মেয়ে, মুখে কথা নেই কিন্তু notebook ভরা কবিতায়। তার ভেতরের জগৎটা বাইরে থেকে কেউ দেখে না।",
    shots: [
      {
        shot_number: 1, character: "মেহের জাহান",
        shot_description: "ভোরবেলা মেহের উঠানের কোণে একা বসে আছে — হাঁটুতে পুরানো notebook, কলম হাতে। সে কবিতা লিখছে, ঠোঁটে অর্ধেক হাসি।",
        environment: "মাটির উঠান, কোণের গাছের ছায়া, ভোরের শিশির",
        lighting: "নরম ভোরের আলো, পাতার মাঝে রোদ",
        camera_angle: "ক্লোজ শট, নিচু অ্যাঙ্গেল",
        story_line: "মেহের লেখে কিন্তু কাউকে দেখায় না। এই notebook-ই তার একমাত্র বন্ধু।",
        dialogue: "(মনে মনে লিখছে) 'নদীও কথা বলে না, তবু তার গল্প আছে...'",
        full_prompt: "shy Bengali village girl age 14 sitting alone in corner of earthen courtyard at dawn, writing in worn notebook on her knees, half smile of concentration, soft morning light through leaves, dew drops on grass, private intimate moment, flowers tucked in side braid, 2D manhwa illustration, soft pastel morning colors",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 101001, status: "draft",
      },
      {
        shot_number: 2, character: "মিঠু",
        shot_description: "মিঠু দৌড়ে এসে মেহেরের notebook ছুঁতে যাচ্ছে — মেহের দ্রুত বুকের কাছে লুকিয়ে নিচ্ছে, মুখে ভয়।",
        environment: "উঠান, সকাল",
        lighting: "সকালের উজ্জ্বল আলো",
        camera_angle: "অ্যাকশন মিড শট",
        story_line: "মিঠু সবসময় কৌতূহলী। মেহের notebook লুকিয়ে রাখে — এটাই তার সবচেয়ে গোপন জিনিস।",
        dialogue: "মিঠু: 'Apu! Oi notebuk-e ki likhso dekhi!' মেহের: (আঁকড়ে ধরে) 'না... এটা... এটা কিছু না।'",
        full_prompt: "tiny mischievous Bengali village girl age 8 running to grab shy older sister's notebook, older girl clutching notebook protectively to chest with alarmed expression, morning courtyard, energetic playful little sister vs protective older sister, 2D manhwa illustration, warm morning colors",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 101002, status: "draft",
      },
      {
        shot_number: 3, character: "আম্মু",
        shot_description: "আম্মু রান্না করতে করতে মেহেরকে ডাকছেন — মেহের মাথা নিচু করে রান্নাঘরে ঢুকছে।",
        environment: "মাটির রান্নাঘর, চুলার আগুন",
        lighting: "চুলার উষ্ণ কমলা আলো",
        camera_angle: "মিড শট",
        story_line: "রোজকার সংসার। মেহের চুপচাপ, কিন্তু মা সব বোঝেন।",
        dialogue: "আম্মু: 'মা, আজকে স্কুলে কী পড়াইল?' মেহের: (চুপ থেকে) '...বাংলা।' আম্মু: 'এইটুকুই?'",
        full_prompt: "loving Bengali village mother cooking at clay stove in simple kitchen, calling to shy daughter who enters with head bowed, warm orange firelight, steam from cooking pot, intimate mother daughter daily life scene, 2D manhwa illustration, warm earthy kitchen colors",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 101003, status: "draft",
      },
      {
        shot_number: 4, character: "নাসরিন",
        shot_description: "নাসরিন স্কুলের মাঠে মেহেরকে টেনে নিয়ে যাচ্ছে — মেহের পিছনে হাঁটছে, মুখে বিব্রত হাসি।",
        environment: "স্কুলের মাঠ, দুপুর",
        lighting: "দুপুরের রোদ",
        camera_angle: "ওয়াইড শট, দুজন",
        story_line: "নাসরিন মেহেরের সাহস। সে সবসময় মেহেরকে এগিয়ে দেয়।",
        dialogue: "নাসরিন: 'Meher! Aj class-e teacher question korle tumi answer dibe, okay? Chup thakbe na!' মেহের: (মাথা নাড়ে) 'Ami... parbo na re...'",
        full_prompt: "bold energetic Bengali village girl pulling shy quiet Bengali girl across school playground at noon, one girl dragging other forward with big smile and pointing, shy girl with embarrassed smile being led, energetic friendship dynamic, 2D manhwa illustration, bright noon schoolyard",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 101004, status: "draft",
      },
      {
        shot_number: 5, character: "মেহের জাহান",
        shot_description: "ক্লাসে সবাই হাত তুলেছে — মেহের হাত তুলতে যাচ্ছে কিন্তু পারছে না। হাত আধা উঠে আবার নামে।",
        environment: "স্কুলের ক্লাসরুম, দুপুর",
        lighting: "জানালার আলো",
        camera_angle: "ক্লোজ শট, হাত আধা তোলা",
        story_line: "এটাই মেহেরের সবচেয়ে বড় যুদ্ধ — ভেতরে উত্তর জানে, কিন্তু মুখ দিয়ে বের করতে পারে না।",
        dialogue: "(মনে মনে) Ami jani... ami jani uttorata... kintu shobai takiye thakbe... boro kore hasbe...হাতটা আবার নেমে গেল।",
        full_prompt: "shy Bengali village girl age 14 in classroom hesitantly raising hand halfway while other students raise hands confidently, internal conflict visible on her face, reaching up then pulling back, torn expression of wanting to answer but fear, warm classroom window light, 2D manhwa illustration, emotional character study",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 101005, status: "draft",
      },
      {
        shot_number: 6, character: "মেহের জাহান",
        shot_description: "বিকেলে মেহের একা পুকুর পাড়ে বসে আছে — পানিতে নিজের ছায়া দেখছে, চোখে একটা প্রশ্ন।",
        environment: "গ্রামের পুকুর পাড়, বিকেল",
        lighting: "বিকেলের সোনালি আলো, পানিতে প্রতিফলন",
        camera_angle: "সাইড প্রোফাইল",
        story_line: "মেহের নিজেকে প্রশ্ন করে — সে কি সত্যিই এতটাই ছোট যে কথা বলার যোগ্য না?",
        dialogue: "(পানির দিকে তাকিয়ে) Ami ki shotti-i eto choto? Nodir jol-o to shobdoheen, tabu taar golpo ache...",
        full_prompt: "shy Bengali village girl sitting alone at village pond edge in golden afternoon light, looking at her reflection in still water with questioning contemplative expression, flowers in her braid reflected in water, melancholy but gentle mood, 2D manhwa illustration, golden water reflection",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 101006, status: "draft",
      },
      {
        shot_number: 7, character: "জলিল চাচা",
        shot_description: "জলিল চাচা বটগাছের নিচে বসে মেহেরকে দেখছেন — ডাকছেন 'মেহের মা, এখানে বোসো।'",
        environment: "বটগাছের ছায়া, বিকেল",
        lighting: "ছায়াময় নরম আলো",
        camera_angle: "মিড শট",
        story_line: "জলিল চাচা মেহেরকে দেখেছেন অনেকদিন থেকে। আজ কথা বলবেন।",
        dialogue: "জলিল চাচা: 'বোসো মা। তোমার চোখে কী দেখলাম জানো? একটা গল্প — যেটা এখনো বলা হয় নাই।'",
        full_prompt: "wise elderly Bengali village barber sitting under large banyan tree calling to shy village girl to come sit, kind warm beckoning gesture, afternoon shade under banyan, girl approaching hesitantly, wise elder knowing expression, 2D manhwa illustration, peaceful shade atmosphere",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 101007, status: "draft",
      },
      {
        shot_number: 8, character: "মেহের জাহান",
        shot_description: "রাতে কুপির আলোয় মেহের নতুন কবিতা লিখছে — এবার ভিন্ন, আগের চেয়ে সাহসী শব্দ।",
        environment: "ঘরের ভেতর, রাত, কুপির আলো",
        lighting: "উষ্ণ কুপির আলো",
        camera_angle: "ওপর থেকে ক্লোজ শট",
        story_line: "জলিল চাচার কথার পরে মেহের একটু আলাদাভাবে লেখে — একটু সাহসের সাথে।",
        dialogue: "(লিখছে) 'আমিও নদীর মতো — চুপ থেকেও পাথর কাটি...'",
        full_prompt: "shy Bengali village girl writing poetry in worn notebook by warm oil lamp at night, slightly bolder more determined expression than usual, pen moving across page, lamplight casting warm shadows, intimate creative night scene, notebook pages filling with words, 2D manhwa illustration",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 101008, status: "draft",
      },
      {
        shot_number: 9, character: "আম্মু",
        shot_description: "আম্মু দরজার আড়াল থেকে মেহেরকে লিখতে দেখছেন — মুখে গোপন গর্বের হাসি।",
        environment: "ঘরের দরজা, রাত",
        lighting: "ভেতরের কুপির আলো বাইরে পড়ছে",
        camera_angle: "দরজার ফাঁক দিয়ে",
        story_line: "মা সব জানেন। মা সব দেখেন।",
        dialogue: "(মনে মনে) আমার মেয়ে... তুমি বড় হয়ে যাচ্ছ।",
        full_prompt: "loving Bengali mother secretly watching from doorway as her shy daughter writes by lamplight at night, mother's face showing quiet pride and love from shadows of doorway, daughter visible through door frame bent over notebook, tender maternal observation, 2D manhwa illustration, warm doorway light",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 101009, status: "draft",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // EP 2 — মেলার দিনে
  // ═══════════════════════════════════════════════════════════
  {
    title: "মেলার দিনে",
    description: "গ্রামের বার্ষিক মেলা। মেহের মিঠুকে নিয়ে মেলায় যায়। মিঠু হারিয়ে যায়। মেহেরকে প্রথমবার জোরে কথা বলতে হয়।",
    shots: [
      {
        shot_number: 1, character: "মিঠু",
        shot_description: "মেলায় মিঠু সবকিছু দেখে চিৎকার করছে — মাটির পুতুল, রঙিন চুড়ি, মিষ্টির দোকান। মেহেরের হাত ধরে টানছে।",
        environment: "গ্রামের মেলা, রঙিন স্টল, দিন",
        lighting: "উজ্জ্বল দিনের রোদ, রঙিন আলো",
        camera_angle: "ওয়াইড শট, মেলার ভিড়",
        story_line: "মেলায় মিঠুর আনন্দের শেষ নেই। মেহের শান্তভাবে পিছন পিছন যাচ্ছে।",
        dialogue: "মিঠু: 'Apu! Oi churi dekho! Oi putul! Oi mishti! Apuuuu!' মেহের: 'ধীরে... ধীরে যাও।'",
        full_prompt: "tiny mischievous Bengali village girl age 8 pulling shy older sister through colorful village fair, pointing excitedly at clay dolls colorful bangles sweet shops, older sister following calmly with gentle smile, vibrant fair atmosphere with crowds, 2D manhwa illustration, vivid festive colors",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 102001, status: "draft",
      },
      {
        shot_number: 2, character: "মেহের জাহান",
        shot_description: "মেহের একটি কবিতার বই দেখছে দোকানে — মুগ্ধ হয়ে পাতা উল্টাচ্ছে, ভুলে গেছে মিঠুর কথা।",
        environment: "বইয়ের দোকান, মেলা",
        lighting: "দোকানের ছাউনির নরম আলো",
        camera_angle: "ক্লোজ শট, বই ও মেহের",
        story_line: "মেহের বইয়ে ডুবে গেছে — এই মুহূর্তেই মিঠু হারিয়ে যায়।",
        dialogue: "মেহের: (পড়ছে, মুগ্ধ) 'জীবন মানেই লড়াই, তবু এই মাটি আমার...' — ওহ, এটা তো আমার কথার মতো!",
        full_prompt: "shy Bengali village girl age 14 absorbed reading poetry book at bookstall in village fair, completely lost in reading with rare expression of wonder and recognition, finger tracing words on page, fair sounds forgotten around her, 2D manhwa illustration, soft stall lighting",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 102002, status: "draft",
      },
      {
        shot_number: 3, character: "মেহের জাহান",
        shot_description: "মেহের হঠাৎ চারদিকে তাকাচ্ছে — মিঠু নেই! চোখ বড় হয়েছে, বুকে ধাক্কা।",
        environment: "মেলার ভিড়",
        lighting: "বিকেলের আলো",
        camera_angle: "ক্লোজ শট, আতঙ্কিত মুখ",
        story_line: "বইয়ে মগ্ন থাকতে গিয়ে মেহের মিঠুর হাত ছেড়ে দিয়েছে।",
        dialogue: "মেহের: 'মিঠু? মিঠু! (আস্তে আস্তে, তারপর আস্তে চিৎকার) মিঠু... মিঠুউউ!!'",
        full_prompt: "shy Bengali village girl age 14 looking around crowded village fair in sudden panic, eyes wide with alarm, holding empty air where little sister's hand was, turning frantically in crowd, fear on face, 2D manhwa illustration, crowded fair atmosphere",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 102003, status: "draft",
      },
      {
        shot_number: 4, character: "মিঠু",
        shot_description: "মিঠু একটি পুতুলের দোকানের সামনে কাঁদছে — হারিয়ে গেছে, চারদিকে অপরিচিত মুখ।",
        environment: "পুতুলের দোকান, মেলা",
        lighting: "বিকেলের আলো",
        camera_angle: "লো অ্যাঙ্গেল, ছোট মিঠু",
        story_line: "মিঠু ভয় পেয়েছে। সে কাঁদছে কিন্তু গলায় স্বর নেই।",
        dialogue: "মিঠু: (কাঁদছে) 'Apu... apu koi gelo... (ফুঁপিয়ে) apu...'",
        full_prompt: "tiny Bengali village girl age 8 crying alone in front of toy stall at village fair, lost and frightened, tears streaming down chubby face, surrounded by strangers legs and fair chaos, small vulnerable figure, 2D manhwa illustration, emotional scene",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 102004, status: "draft",
      },
      {
        shot_number: 5, character: "মেহের জাহান",
        shot_description: "মেহের ভিড়ের মাঝে উঁচু গলায় ডাকছে — 'মিঠু! মিঠু!' — প্রথমবার সে জোরে গলা তুলেছে।",
        environment: "মেলার ভিড়",
        lighting: "বিকেলের আলো",
        camera_angle: "ওয়াইড শট, মেহের ভিড়ের মাঝে",
        story_line: "ভয়ে মেহেরের লজ্জা গলে গেছে। মিঠুর জন্য সে নিজেকে ভুলে যায়।",
        dialogue: "মেহের: 'মিঠু! মিঠুউউ! (চারদিকে ঘুরে) Please... কেউ কি একটা ছোট মেয়েকে দেখেছেন? হলুদ জামা পরা?'",
        full_prompt: "shy Bengali village girl age 14 standing in middle of crowded fair calling out loudly for first time, breaking through her shyness out of desperation, hand cupped around mouth shouting, determined urgent expression replacing usual shyness, crowd around her, 2D manhwa illustration, urgent emotional moment",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 102005, status: "draft",
      },
      {
        shot_number: 6, character: "মেহের জাহান",
        shot_description: "মেহের মিঠুকে খুঁজে পেয়েছে — দুজনে জড়িয়ে ধরেছে, মেহেরের চোখে জল।",
        environment: "মেলার পুতুলের দোকান",
        lighting: "বিকেলের সোনালি আলো",
        camera_angle: "ক্লোজ শট, আলিঙ্গন",
        story_line: "খুঁজে পেয়েছে। এই মুহূর্তে মেহের বুঝতে পারে — কথা বলাটা কতটা জরুরি।",
        dialogue: "মেহের: (কাঁদতে কাঁদতে) 'মিঠু... তুই ঠিক আছিস? কোথায় ছিলি?' মিঠু: 'Apu! (জড়িয়ে ধরে) Boro beshi kachhe chole giyesile!'",
        full_prompt: "shy Bengali village girl age 14 kneeling and hugging crying tiny sister age 8 in village fair, both crying with relief, older sister's tears of relief mixed with joy, emotional reunion embrace, golden afternoon fair light, 2D manhwa illustration, tender emotional reunion",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 102006, status: "draft",
      },
      {
        shot_number: 7, character: "নাসরিন",
        shot_description: "নাসরিন মেহেরকে বলছে — 'দেখলি? তুই চিৎকার করতে পারিস!' মেহের বিস্মিত নিজেই।",
        environment: "মেলার বাইরে, বিকেল",
        lighting: "বিকেলের আলো",
        camera_angle: "টু শট",
        story_line: "নাসরিন মেহেরকে বুঝিয়ে দেয় — সে পারে। সে সবসময় পারত।",
        dialogue: "নাসরিন: 'Meher! Tui chillate parish! Ami shune gelam! Tui bolte parish re, just bhoy pash!' মেহের: (অবাক হয়ে নিজের দিকে তাকায়) 'Ami... chillaislam?'",
        full_prompt: "bold energetic Bengali village girl excitedly telling shy friend that she can speak out, pointing at friend in amazement, shy friend looking at her own hands with disbelief and wonder, both standing at fair edge in afternoon light, breakthrough friendship moment, 2D manhwa illustration",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 102007, status: "draft",
      },
      {
        shot_number: 8, character: "মেহের জাহান",
        shot_description: "ঘরে ফেরার পথে মেহের মিঠুর হাত ধরে হাঁটছে — সূর্য ডুবছে, মেহেরের মনে একটা নতুন অনুভূতি।",
        environment: "গ্রামের রাস্তা, সন্ধ্যা",
        lighting: "সূর্যাস্তের কমলা আলো",
        camera_angle: "ব্যাক শট, দুজন হাঁটছে",
        story_line: "আজকের মেহের গতকালের চেয়ে একটু আলাদা।",
        dialogue: "মেহের: (মনে মনে) Ami bolte pari... jodi shotti dorkar hoy... ami bolte pari। কথাটা মনে রাখতে হবে।",
        full_prompt: "shy Bengali village girl and tiny sister walking home hand in hand on village path at sunset, seen from behind, sunset painting them in orange gold light, older sister's posture slightly more upright than usual, quiet transformation after crisis, 2D manhwa illustration, beautiful sunset village path",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 102008, status: "draft",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // EP 3 — সালেহা আপার চিঠি
  // ═══════════════════════════════════════════════════════════
  {
    title: "সালেহা আপার চিঠি",
    description: "নতুন শিক্ষিকা সালেহা আপা মেহেরের notebook পড়েন। তিনি মেহেরকে ডেকে বলেন — তোমার লেখা প্রকাশ করতে হবে। মেহেরের জীবনের সবচেয়ে বড় ধাক্কা।",
    shots: [
      {
        shot_number: 1, character: "সালেহা আপা",
        shot_description: "সালেহা আপা প্রথমদিন ক্লাসে ঢুকেছেন — সবাই অবাক, এত সুন্দর চেহারার teacher আগে আসেনি।",
        environment: "গ্রামের স্কুল ক্লাসরুম",
        lighting: "সকালের আলো",
        camera_angle: "ফ্রন্ট শট, teacher ক্লাসে",
        story_line: "সালেহা আপার আগমন — গ্রামের ছেলেমেয়েদের জীবনে নতুন হাওয়া।",
        dialogue: "সালেহা আপা: 'Ami Saleha. Ami Dhaka theke eshechi, toder shonge pori — shudhu porate na, shikhteo ashechi। তোমরা কে কে কবিতা লেখো?'",
        full_prompt: "young elegant Bengali female teacher arriving at village school classroom for first time, introducing herself with warm confident smile, students staring in wonder and curiosity, morning light through windows, round silver glasses, new teacher energy, 2D manhwa illustration",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 103001, status: "draft",
      },
      {
        shot_number: 2, character: "মেহের জাহান",
        shot_description: "বাকি সবাই হাত তুলেছে কবিতা লেখার প্রশ্নে — মেহের হাত তোলেনি কিন্তু notebook বুকের কাছে শক্ত করে ধরেছে।",
        environment: "ক্লাসরুম",
        lighting: "সকালের আলো",
        camera_angle: "ক্লোজ শট",
        story_line: "মেহের হাত তুলতে পারেনি — কিন্তু তার notebook সাক্ষী।",
        dialogue: "(মনে মনে) Ami to likhhi... kintu oi notebuk amar ekarer জন্য... ওটা দেখালে... সবাই হাসবে।",
        full_prompt: "shy Bengali village girl in classroom with all students raising hands except her, she clutches worn notebook tightly to chest while looking down, internal conflict between truth and fear, new teacher visible at front looking at students, 2D manhwa illustration",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 103002, status: "draft",
      },
      {
        shot_number: 3, character: "সালেহা আপা",
        shot_description: "বিরতিতে সালেহা আপা মেহেরের কাছে আসছেন — notebook-এ নজর পড়েছে তাঁর।",
        environment: "স্কুলের বারান্দা",
        lighting: "দুপুরের আলো",
        camera_angle: "মিড শট",
        story_line: "সালেহা আপার তীক্ষ্ণ দৃষ্টি মেহেরের গোপনটা দেখে ফেলেছে।",
        dialogue: "সালেহা আপা: (মৃদুভাবে) 'মেহের, ওই notebook-এ কী আছে?' মেহের: (বুকে ঢেকে) '...কিছু না আপা।'",
        full_prompt: "young Bengali female teacher approaching shy village girl in school veranda during break with gentle curious expression, teacher looking at notebook girl is clutching protectively, kind non-threatening approach, girl looking apprehensive, 2D manhwa illustration, school veranda afternoon light",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 103003, status: "draft",
      },
      {
        shot_number: 4, character: "সালেহা আপা",
        shot_description: "সালেহা আপা মেহেরের notebook পড়ছেন — পড়তে পড়তে চোখ বড় হচ্ছে, তারপর হাসি।",
        environment: "শিক্ষিকার টেবিল",
        lighting: "বিকেলের আলো",
        camera_angle: "ক্লোজ শট, পড়ার মুহূর্ত",
        story_line: "সালেহা আপা বুঝলেন — এই মেয়ে অসাধারণ।",
        dialogue: "সালেহা আপা: (পড়তে পড়তে) 'আমিও নদীর মতো... চুপ থেকেও পাথর কাটি...' (হাসি) Subhanallah। এই মেয়ে লিখেছে এটা?",
        full_prompt: "young Bengali female teacher reading student notebook with widening eyes of amazement at teacher's desk, expression going from curious to deeply moved, pages of poetry, afternoon light casting warm glow, discovery of hidden talent moment, 2D manhwa illustration",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 103004, status: "draft",
      },
      {
        shot_number: 5, character: "মেহের জাহান",
        shot_description: "সালেহা আপা মেহেরকে বলছেন তার লেখা অসাধারণ — মেহের কাঁপছে, বিশ্বাস হচ্ছে না।",
        environment: "শিক্ষিকার ঘর",
        lighting: "বিকেলের আলো",
        camera_angle: "টু শট, মুখোমুখি",
        story_line: "প্রথমবার কেউ মেহেরকে বলল — তুমি ভালো।",
        dialogue: "সালেহা আপা: 'Meher, ei kobita gulo outstanding। Tumi ki jano tumi koto shundor likho?' মেহের: (কাঁপা গলায়) '...aপা... ওগুলো শুধু... খেলা আমার...' সালেহা আপা: 'No. Ei শিল্প।'",
        full_prompt: "young Bengali female teacher holding notebook showing shy girl her own poetry, teacher's expression showing genuine amazement and pride, shy village girl trembling slightly unable to believe compliment, overwhelmed emotional reaction to first validation, 2D manhwa illustration, warm afternoon light",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 103005, status: "draft",
      },
      {
        shot_number: 6, character: "মেহের জাহান",
        shot_description: "মেহের বাড়ি ফিরছে — এবার মাথাটা আগের চেয়ে সামান্য উঁচু।",
        environment: "গ্রামের পথ, বিকেল",
        lighting: "সোনালি বিকেল",
        camera_angle: "সাইড শট",
        story_line: "একটা কথা তার বদলে দিয়ে গেছে।",
        dialogue: "(মনে মনে) Shundor... shundor likhhi ami? (আস্তে আস্তে মাথা তুলে) Ami... shundor likhhi।",
        full_prompt: "shy Bengali village girl walking home on village path in golden afternoon, very subtly more upright posture than before, slight small smile on usually downcast face, first seeds of confidence, golden light, 2D manhwa illustration, quiet personal transformation",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 103006, status: "draft",
      },
      {
        shot_number: 7, character: "রফিক ভাই",
        shot_description: "রফিক ভাই মেহেরের মুখের পরিবর্তন দেখছেন — জিজ্ঞেস করছেন কী হয়েছে।",
        environment: "বাড়ির উঠান, সন্ধ্যা",
        lighting: "সন্ধ্যার আলো",
        camera_angle: "মিড শট",
        story_line: "রফিক ভাই সব ধরে ফেলেন।",
        dialogue: "রফিক ভাই: 'Meher, tomar mukhe ki hoyeche? Ektu alag lagche? Ki holo aaj?' মেহের: (মৃদু হেসে) 'কিছু না ভাই... মানে... আপা বললেন আমি ভালো লিখি।'",
        full_prompt: "Bengali young farmer brother age 18 noticing something different about his shy sister in evening courtyard, leaning forward with warm curious expression, sister with subtle new light in eyes giving small smile, tender sibling moment, 2D manhwa illustration",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 103007, status: "draft",
      },
      {
        shot_number: 8, character: "আম্মু",
        shot_description: "আম্মু মেহেরকে জড়িয়ে ধরছেন — 'আমি তো জানতামই।' দুজনের চোখে জল।",
        environment: "রান্নাঘর, রাত",
        lighting: "কুপির আলো",
        camera_angle: "ক্লোজ শট",
        story_line: "মা সবসময় জানতেন। মা-ই প্রথম বিশ্বাস করেছিলেন।",
        dialogue: "আম্মু: 'মা, আমি তো জানতাম। তোর ভেতরে অনেক কথা আছে।' (জড়িয়ে ধরেন) 'এখন শোনাও মা, ভয় নাই।'",
        full_prompt: "loving Bengali mother hugging shy daughter warmly in kitchen at night, both with emotional tears, mother whispering encouragement into daughter's hair, oil lamp casting warm light, deeply moving mother daughter validation scene, 2D manhwa illustration",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 103008, status: "draft",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // EP 4 — ঝড়ের রাতে
  // ═══════════════════════════════════════════════════════════
  {
    title: "ঝড়ের রাতে",
    description: "প্রচণ্ড ঝড়ের রাতে রফিক ভাই মাঠে আটকা পড়েছেন। মেহেরকে একা গ্রামের মানুষদের ডেকে সাহায্য আনতে হবে।",
    shots: [
      {
        shot_number: 1, character: "মেহের জাহান",
        shot_description: "রাতে প্রচণ্ড ঝড় — মেহের জানালা দিয়ে দেখছে, আম্মু কাঁদছেন রফিক ভাই আসেনি।",
        environment: "ঘরের ভেতর, ঝড়ের রাত",
        lighting: "বিদ্যুৎ চমক, অন্ধকার",
        camera_angle: "উইন্ডো শট",
        story_line: "ঝড়ের রাতে রফিক ভাই মাঠে। আম্মু চিন্তায় কাঁদছেন।",
        dialogue: "আম্মু: 'রফিক কোথায়? এই ঝড়ে...' মেহের: (দৃঢ় হয়ে) 'আমি যাব আম্মু। আমি সবাইকে ডেকে আনব।'",
        full_prompt: "shy Bengali village girl looking out at violent monsoon storm at night through window, mother crying with worry behind her, lightning flashing outside showing flooded path, girl's expression shifting to determined resolve, dark dramatic storm atmosphere, 2D manhwa illustration",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 104001, status: "draft",
      },
      {
        shot_number: 2, character: "মেহের জাহান",
        shot_description: "মেহের ঝড়ের মধ্যে দৌড়াচ্ছে — বৃষ্টিতে ভিজছে, চুল উড়ছে, কিন্তু থামছে না।",
        environment: "ঝড়ের রাত, গ্রামের রাস্তা",
        lighting: "বিদ্যুৎ চমক, ঝড়ের আবহ",
        camera_angle: "ড্রামাটিক অ্যাকশন শট",
        story_line: "মেহের দৌড়াচ্ছে। লজ্জা নেই, ভয় নেই — শুধু ভাইকে বাঁচাতে হবে।",
        dialogue: "(দৌড়াতে দৌড়াতে) জলিল চাচার বাড়ি... তারপর হাশেম চাচা... সবাইকে ডাকতে হবে।",
        full_prompt: "shy Bengali village girl running bravely through violent monsoon storm at night, soaking wet with hair flying, lightning illuminating her determined face, muddy path, running from house to house for help, complete fearlessness replacing usual shyness, 2D manhwa illustration, dramatic storm action",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 104002, status: "draft",
      },
      {
        shot_number: 3, character: "জলিল চাচা",
        shot_description: "জলিল চাচা দরজা খুলে মেহেরকে ভেজা অবস্থায় দেখে চমকে গেছেন।",
        environment: "জলিল চাচার দরজা, ঝড়ের রাত",
        lighting: "ঘরের আলো বাইরে পড়ছে",
        camera_angle: "দরজার ফ্রেম শট",
        story_line: "জলিল চাচা এই মেয়েকে নতুনভাবে দেখছেন।",
        dialogue: "মেহের: 'চাচা! রফিক ভাই মাঠে আটকা! ঝড়ে... সাহায্য দরকার! (হাঁপাচ্ছে) তাড়াতাড়ি আসেন চাচা!' জলিল চাচা: (অবাক) 'মেহের মা? তুমি—'",
        full_prompt: "wise elderly Bengali village barber opening door to find soaking wet determined village girl in storm at night, girl panting urgently asking for help, elder shocked to see usually shy quiet girl so bold and urgent, doorway dramatically lit by storm lightning, 2D manhwa illustration",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 104003, status: "draft",
      },
      {
        shot_number: 4, character: "রফিক ভাই",
        shot_description: "ঝড়ের মাঠে রফিক ভাই ভেজা অবস্থায় — হঠাৎ লণ্ঠনের আলো দেখছেন, মানুষের ডাক শুনছেন।",
        environment: "ঝড়ের মাঠ, রাত",
        lighting: "বিদ্যুৎ ও লণ্ঠনের আলো",
        camera_angle: "ওয়াইড শট",
        story_line: "মেহেরের ডাকা মানুষরা এসেছে। রফিক ভাই উদ্ধার হচ্ছেন।",
        dialogue: "রফিক ভাই: (আলো দেখে) কে আসছে? (চিৎকার শুনে) মেহের? মেহের তুই এখানে?",
        full_prompt: "Bengali young farmer in flooded field during violent storm at night, seeing distant lantern lights approaching through rain, people coming to rescue, disbelief and relief on face, dramatic storm rescue scene, 2D manhwa illustration, lightning storm atmosphere",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 104004, status: "draft",
      },
      {
        shot_number: 5, character: "মেহের জাহান",
        shot_description: "মেহের ঝড়ের মাঝে রফিক ভাইকে খুঁজে পেয়েছে — ভাই বোনের মিলন, ভেজা কাদায়।",
        environment: "মাঠ, ঝড়ের রাত",
        lighting: "বিদ্যুৎ চমক",
        camera_angle: "ইমোশনাল মিড শট",
        story_line: "ভাই-বোনের মিলন। মেহেরের সাহস আজ প্রমাণিত।",
        dialogue: "মেহের: 'ভাই! ভাই!' রফিক ভাই: (জড়িয়ে ধরে) 'মেহের... তুই আসলি কীভাবে? একা... ঝড়ে...' মেহের: 'একা না ভাই, সবাইকে ডেকে এনেছি।'",
        full_prompt: "shy Bengali village girl and older brother reuniting in flooded field during storm at night, soaking wet both of them, brother kneeling to embrace sister in amazement, her expression showing she found something new about herself, emotional stormy reunion, 2D manhwa illustration",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 104005, status: "draft",
      },
      {
        shot_number: 6, character: "জলিল চাচা",
        shot_description: "ঝড় থেমে গেছে — জলিল চাচা মেহেরের মাথায় হাত রাখছেন। 'তুমি আজ নিজেকে চিনলে।'",
        environment: "উঠান, ঝড়ের পরের রাত",
        lighting: "মেঘের ফাঁকে চাঁদ",
        camera_angle: "ক্লোজ শট",
        story_line: "জলিল চাচা জানতেন এদিন আসবে।",
        dialogue: "জলিল চাচা: 'মেহের মা, আজকে তুমি নিজেকে চিনলে। ওই লজ্জা তোমার দুর্বলতা না — সেটাই তোমার গভীরতা। আর আজকে দেখলাম তোমার সাহস।'",
        full_prompt: "wise elderly Bengali village barber placing hand on wet soaking village girl's head in blessing after storm, clouds parting to show moonlight, deeply wise and proud expression, girl looking up at him with newfound understanding, post-storm quiet moment, 2D manhwa illustration",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 104006, status: "draft",
      },
      {
        shot_number: 7, character: "আম্মু",
        shot_description: "আম্মু মেহেরকে গামছায় মুছিয়ে দিচ্ছেন — দুজনেই কাঁদছেন, হাসছেন।",
        environment: "ঘরের ভেতর, রাত",
        lighting: "কুপির উষ্ণ আলো",
        camera_angle: "ক্লোজ শট",
        story_line: "মায়ের কোলে ফিরে আসা।",
        dialogue: "আম্মু: 'তুই পাগল! একা ঝড়ে!' মেহের: 'কিন্তু আম্মু, ভাই ফিরে এসেছে।' আম্মু: (কাঁদতে কাঁদতে হেসে) 'পাগলি মেয়ে আমার।'",
        full_prompt: "loving Bengali mother drying soaking wet daughter with cloth in warm home at night after storm, both crying and laughing at same time, oil lamp warmth, relief and love, tender post-crisis family scene, 2D manhwa illustration, warm intimate colors",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 104007, status: "draft",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // EP 5 — মেহেরের কণ্ঠস্বর
  // ═══════════════════════════════════════════════════════════
  {
    title: "মেহেরের কণ্ঠস্বর",
    description: "সালেহা আপা মেহেরকে স্কুলের সাংস্কৃতিক অনুষ্ঠানে কবিতা পড়তে বলেছেন। মেহেরের জীবনের সবচেয়ে কঠিন চ্যালেঞ্জ — সবার সামনে দাঁড়িয়ে নিজের কথা বলা।",
    shots: [
      {
        shot_number: 1, character: "সালেহা আপা",
        shot_description: "সালেহা আপা মেহেরকে বলছেন স্কুল অনুষ্ঠানে কবিতা পড়তে হবে — মেহের পাথর হয়ে গেছে।",
        environment: "শিক্ষিকার ঘর",
        lighting: "বিকেলের আলো",
        camera_angle: "টু শট",
        story_line: "এতদিনের সব প্রস্তুতির পরীক্ষা।",
        dialogue: "সালেহা আপা: 'Meher, school-er onushthane tumi tomar kobita porbe। Stagete।' মেহের: (ফ্যাকাশে) '...আ..আপা... ami... shobai...থাকবে...' সালেহা আপা: 'হ্যাঁ। Shobai thakbe। Shei jonno-i তোমাকে দরকার।'",
        full_prompt: "young Bengali female teacher telling shy village girl she must read her poetry on school stage, teacher's expression firm but encouraging, girl going pale with shock and fear, pivotal challenge moment, afternoon school room, 2D manhwa illustration",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 105001, status: "draft",
      },
      {
        shot_number: 2, character: "নাসরিন",
        shot_description: "নাসরিন মেহেরকে রাতে প্র্যাকটিস করাচ্ছে — জোরে জোরে পড়তে বলছে।",
        environment: "নাসরিনদের বাড়ির উঠান, রাত",
        lighting: "কুপির আলো",
        camera_angle: "মিড শট",
        story_line: "নাসরিন সবচেয়ে বড় সাপোর্ট।",
        dialogue: "নাসরিন: 'Aro jore! Stage-e shobai shunbe!' মেহের: (চেষ্টা করছে) 'আমিও নদীর...' নাসরিন: 'Jore! Tumi ki nodi na ki? Nodi ki chhepe thake?'",
        full_prompt: "bold Bengali village girl coaching shy friend to speak louder at night in courtyard, bold girl conducting and directing while shy girl practices reciting poetry nervously, night oil lamp practice scene, friendship support and coaching, 2D manhwa illustration, warm night practice atmosphere",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 105002, status: "draft",
      },
      {
        shot_number: 3, character: "মেহের জাহান",
        shot_description: "অনুষ্ঠানের দিন — মেহের স্টেজের পিছনে দাঁড়িয়ে কাঁপছে, হাতে notebook।",
        environment: "স্কুলের স্টেজের পিছনে",
        lighting: "স্টেজের আলো পর্দার ফাঁকে",
        camera_angle: "ক্লোজ শট, কাঁপা হাত",
        story_line: "এই মুহূর্তটাই সব।",
        dialogue: "(কাঁপতে কাঁপতে) Pari na... ami pari na... shobai hasbe... না, না — আমি নদীর মতো... আমি পারি... আমি পারি...",
        full_prompt: "shy Bengali village girl trembling backstage before performing, holding worn notebook in shaking hands, stage light peeking through curtain, intense internal battle between fear and determination, sweat on forehead, eyes closing in concentration, 2D manhwa illustration, backstage dramatic tension",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 105003, status: "draft",
      },
      {
        shot_number: 4, character: "মেহের জাহান",
        shot_description: "মেহের স্টেজে উঠেছে — মাইকের সামনে দাঁড়িয়ে, দর্শকরা শত শত মানুষ। মেহের চোখ বন্ধ করে।",
        environment: "স্কুলের স্টেজ",
        lighting: "স্টেজের স্পটলাইট",
        camera_angle: "ফ্রন্ট শট, স্টেজে",
        story_line: "সে স্টেজে উঠেছে। এটাই সবচেয়ে সাহসী কাজ।",
        dialogue: "(চোখ বন্ধ, শ্বাস নিচ্ছে)... নদীর মতো... আমি চুপ থেকেও পাথর কাটি...",
        full_prompt: "shy Bengali village girl standing at microphone on school stage before large audience, eyes closed taking deep breath before speaking, spotlight on her, hundreds of people watching, moment of greatest courage, flowers in her braid under stage light, 2D manhwa illustration, dramatic stage lighting",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 105004, status: "draft",
      },
      {
        shot_number: 5, character: "মেহের জাহান",
        shot_description: "মেহের পড়ছে — চোখ খোলা, গলা কাঁপছে কিন্তু থামছে না। দর্শকরা মুগ্ধ।",
        environment: "স্কুলের স্টেজ",
        lighting: "স্পটলাইট",
        camera_angle: "ক্লোজ শট, পড়ার মুহূর্ত",
        story_line: "সে পড়ছে। নিজের কথা, নিজের গলায়।",
        dialogue: "মেহের: (কাঁপা কিন্তু স্পষ্ট গলায়) 'আমিও নদীর মতো — চুপ থেকেও পাথর কাটি। আমার কথা কেউ শোনে না, তবু আমি বলে যাই...'",
        full_prompt: "shy Bengali village girl reading her poetry at school microphone with trembling but clear voice, eyes open now looking at audience, first time speaking publicly, emotional breakthrough expression of someone finding their voice, audience visible in background listening intently, 2D manhwa illustration, spotlight performance",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 105005, status: "draft",
      },
      {
        shot_number: 6, character: "আম্মু",
        shot_description: "আম্মু দর্শকদের মাঝে বসে মেয়েকে দেখছেন — চোখ বন্ধ করে কাঁদছেন, গর্বে।",
        environment: "দর্শক সারি",
        lighting: "হলের আলো",
        camera_angle: "ক্লোজ শট, আম্মুর মুখ",
        story_line: "মায়ের চোখে সবচেয়ে বড় পুরস্কার।",
        dialogue: "আম্মু: (মনে মনে, চোখে জল) আমার মেয়ে... আমার মেহের... ওর কণ্ঠস্বর।",
        full_prompt: "loving Bengali mother sitting in audience with eyes closed crying tears of pride while daughter performs on stage in background, hands folded in grateful prayer, overwhelmed with maternal pride, 2D manhwa illustration, audience lighting",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 105006, status: "draft",
      },
      {
        shot_number: 7, character: "নাসরিন",
        shot_description: "নাসরিন দর্শকদের মাঝে দাঁড়িয়ে হাততালি দিচ্ছে — চিৎকার করছে 'Meher! Meher!'",
        environment: "দর্শক সারি",
        lighting: "হলের আলো",
        camera_angle: "মিড শট",
        story_line: "বেস্ট ফ্রেন্ডের উচ্ছ্বাস।",
        dialogue: "নাসরিন: 'MEHER! MEHER! THAT'S MY BEST FRIEND! EI JEGULO AMI JANTAM! (চিৎকার করে) Wooooo!'",
        full_prompt: "bold energetic Bengali village girl standing in audience cheering and clapping wildly for her shy friend performing on stage, yelling best friend's name with huge proud grin, other audience members around her amused by her enthusiasm, 2D manhwa illustration",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 105007, status: "draft",
      },
      {
        shot_number: 8, character: "মেহের জাহান",
        shot_description: "পড়া শেষ — মেহের মাথা তুলে দর্শকদের দিকে তাকাল, হাততালি শুনছে। প্রথমবার সত্যিকারের হাসি।",
        environment: "স্কুলের স্টেজ",
        lighting: "স্পটলাইট",
        camera_angle: "ফ্রন্ট শট",
        story_line: "এই হাসি — মেহেরের সত্যিকারের প্রথম হাসি।",
        dialogue: "(মাথা তুলে, সত্যিকারের হাসি) ... (কথা নেই, শুধু হাসি, শুধু আলো)",
        full_prompt: "shy Bengali village girl on stage looking up at audience for first time with genuine full smile, applause washing over her, flowers in braid under spotlight, transformation complete from hiding to standing in light, most beautiful genuine smile, 2D manhwa illustration, triumphant stage moment",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 105008, status: "draft",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // EP 6 — মেহেরের পথ
  // ═══════════════════════════════════════════════════════════
  {
    title: "মেহেরের পথ",
    description: "সব পথ এসে মিলেছে। মেহের এখন নিজেই ছোটদের কবিতা শেখায়। সালেহা আপার মতো একদিন সে-ও শিক্ষিকা হবে। গ্রামের শান্ত মেয়ে — এখন শান্ত কিন্তু শক্তিশালী।",
    shots: [
      {
        shot_number: 1, character: "মেহের জাহান",
        shot_description: "কিছু মাস পরে — মেহের এখন ছোট বাচ্চাদের গাছের নিচে কবিতা শেখাচ্ছে। নাসরিন পাশে বসে।",
        environment: "বটগাছের ছায়া, সকাল",
        lighting: "সকালের নরম আলো",
        camera_angle: "ওয়াইড শট",
        story_line: "মেহের আর লুকিয়ে রাখে না। সে দেয়।",
        dialogue: "মেহের: 'পড়ো সবাই — 'নদীও কথা বলে না, তবু তার গল্প আছে...' এখন তোমরা বলো তোমাদের গল্প কী?'",
        full_prompt: "transformed shy Bengali village girl now confidently teaching younger children poetry sitting under large banyan tree in morning, children sitting around her listening, bold friend sitting beside her smiling, girl still gentle but no longer hiding, teaching posture, 2D manhwa illustration, warm morning teaching scene",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 106001, status: "draft",
      },
      {
        shot_number: 2, character: "মিঠু",
        shot_description: "মিঠু মেহেরের ছাত্রীদের মাঝে বসে সবচেয়ে মনোযোগী — 'Apu-i amar teacher!'",
        environment: "বটগাছের নিচে",
        lighting: "সকালের আলো",
        camera_angle: "ক্লোজ শট",
        story_line: "মিঠু গর্বিত বোন।",
        dialogue: "মিঠু: (পাশের মেয়েকে ফিসফিস করে) 'Oi je apu-e tumi dekho? Oi amar apu। She is the BEST poet। Ami-i shobai-er aage jantam!'",
        full_prompt: "tiny mischievous Bengali village girl sitting among students listening to older sister teach, whispering proudly to neighbor about her sister being the best poet, gap-toothed proud smile, chibi style character, 2D manhwa illustration, cute proud sibling moment",
        negative_prompt: NEG, width: 832, height: 1216, steps: 28, seed: 106002, status: "draft",
      },
      {
        shot_number: 3, character: "সালেহা আপা",
        shot_description: "সালেহা আপা দূর থেকে মেহেরকে পড়াতে দেখছেন — চোখে তৃপ্তি।",
        environment: "স্কুলের মাঠ, সকাল",
        lighting: "সকালের আলো",
        camera_angle: "মিড শট, দূর থেকে",
        story_line: "শিক্ষকের সবচেয়ে বড় পুরস্কার — ছাত্র যখন নিজেই শেখায়।",
        dialogue: "সালেহা আপা: (মনে মনে) Ei-i shikha। Ei-i আমার কাজ।",
        full_prompt: "young Bengali female teacher watching from distance as her formerly shy student now teaches younger children under banyan tree, teacher's expression showing deep satisfaction and pride of a true educator, morning school yard, 2D manhwa illustration",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 106003, status: "draft",
      },
      {
        shot_number: 4, character: "রফিক ভাই",
        shot_description: "রফিক ভাই মাঠ থেকে ফিরে মেহেরকে পড়াতে দেখছেন — গর্বে বুক ভরে যাচ্ছে।",
        environment: "বাড়ির কাছাকাছি, দুপুর",
        lighting: "দুপুরের রোদ",
        camera_angle: "সাইড শট",
        story_line: "ভাই সাক্ষী ছিলেন সব পরিবর্তনের।",
        dialogue: "রফিক ভাই: (আম্মুকে বলছেন) 'আম্মু, মেহের দেখো — মাইনষেরে পড়াচ্ছে। আমাদের মেহের।'",
        full_prompt: "Bengali young farmer brother returning from field watching his sister teaching children in distance, arms crossed with quiet enormous pride, sun-tanned face with emotional warm smile, 2D manhwa illustration, afternoon golden light",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 106004, status: "draft",
      },
      {
        shot_number: 5, character: "মেহের জাহান",
        shot_description: "মেহের পুকুর পাড়ে বসে নতুন কবিতা লিখছে — এবার মাথা উঁচু, চোখে আলো।",
        environment: "পুকুর পাড়, বিকেল",
        lighting: "বিকেলের সোনালি আলো",
        camera_angle: "সাইড প্রোফাইল",
        story_line: "একই পুকুর, একই মেহের — কিন্তু সব বদলে গেছে।",
        dialogue: "(লিখছে) 'লজ্জা আমার দুর্বলতা নয় — লজ্জা আমার গভীরতা। আমি চুপ থাকি কারণ আমার কথার দাম আছে।'",
        full_prompt: "transformed Bengali village girl sitting at same pond where she used to sit doubtfully but now with head raised and light in eyes writing confidently in notebook, posture completely different from episode 1, same location different girl, golden afternoon light on water, 2D manhwa illustration",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 106005, status: "draft",
      },
      {
        shot_number: 6, character: "জলিল চাচা",
        shot_description: "জলিল চাচা বটগাছের নিচে মেহেরকে দেখছেন — মৃদু হাসছেন। 'জানতাম।'",
        environment: "বটগাছের ছায়া",
        lighting: "বিকেলের আলো",
        camera_angle: "ক্লোজ শট",
        story_line: "জলিল চাচা জানতেন।",
        dialogue: "জলিল চাচা: 'মেহের মা, তোমাকে প্রথমদিন দেখেই বুঝসিলাম — এই মেয়ে একদিন সবার কথা বলবে।' মেহের: (হেসে) 'চাচা, আপনি কীভাবে জানলেন?' জলিল চাচা: 'চোখ দেখলেই বোঝা যায়।'",
        full_prompt: "wise elderly Bengali village barber sharing knowing smile with transformed village girl under banyan tree, elder's expression saying 'I always knew', girl smiling back with new confidence, full circle moment, afternoon light through leaves, 2D manhwa illustration",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 106006, status: "draft",
      },
      {
        shot_number: 7, character: "মেহের জাহান",
        shot_description: "ফাইনাল শট — মেহের গ্রামের রাস্তায় হাঁটছে, মাথা উঁচু, হাতে notebook। সূর্যাস্ত।",
        environment: "গ্রামের রাস্তা, সূর্যাস্ত",
        lighting: "সুন্দর সূর্যাস্ত",
        camera_angle: "ব্যাক শট, সিনেমাটিক",
        story_line: "এই মেহের — সহজ, শান্ত, কিন্তু আর আড়াল করে না নিজেকে।",
        dialogue: "(ভয়েসওভার) লজ্জাবতী মানে মরে যাওয়া না। লজ্জাবতী ফুল — ছোঁলে মুড়িয়ে যায়, কিন্তু একটু পরেই আবার ফোটে।",
        full_prompt: "transformed Bengali village girl walking on village path at sunset with head held up confidently, notebook under arm instead of clutched to chest, flowers in braid catching sunset light, back shot showing her walking toward golden horizon, complete arc from episode 1 shy girl to confident young woman, 2D manhwa illustration, breathtaking sunset finale",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 106007, status: "draft",
      },
      {
        shot_number: 8, character: "নাসরিন",
        shot_description: "নাসরিন মেহেরের পাশে এসে হাত ধরে হাঁটছে — দুই বান্ধবী, সূর্যাস্তে।",
        environment: "গ্রামের রাস্তা, সূর্যাস্ত",
        lighting: "সোনালি সূর্যাস্ত",
        camera_angle: "ওয়াইড শট, দুজন",
        story_line: "দুই বান্ধবী, দুই পথ — একসাথে।",
        dialogue: "নাসরিন: 'Meher, tumi ki jano tumi koto change hoye geso?' মেহের: 'Tumi-i change korlam আমাকে।' নাসরিন: 'Na। Tumi nijer bhitor already chilo — ami shudhu dekhaisi।'",
        full_prompt: "bold energetic Bengali village girl walking hand in hand with formerly shy now confident friend at beautiful sunset, two different personalities perfectly complementing each other, both smiling walking into golden sunset, perfect friendship finale, 2D manhwa illustration, gorgeous golden sunset",
        negative_prompt: NEG, width: 1216, height: 832, steps: 28, seed: 106008, status: "draft",
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log("🌸 মেহের জাহান — Seeding...\n");

  const cookie = await (async () => {
    console.log("🔐 Logging in...");
    const c = await login();
    console.log("   ✓ Authenticated\n");
    return c;
  })();

  console.log(`📁 Creating project: ${PROJECT_NAME}`);
  const project = await post<{ id: string }>(cookie, "/api/projects", {
    name: PROJECT_NAME,
    description: "মেহের জাহান — গ্রামের এক সহজ লাজুক মেয়ের নিজেকে খুঁজে পাওয়ার গল্প। Banglish style, 7 চরিত্র, 6 episode, 54 shot।",
  });
  console.log(`   ✓ Project: ${project.id}\n`);

  console.log(`👤 Creating ${CHARACTERS.length} characters...`);
  for (const c of CHARACTERS) {
    await post(cookie, `/api/projects/${project.id}/characters`, c);
    console.log(`   ✓ ${c.name} (${c.role})`);
  }
  console.log();

  let totalShots = 0;
  for (let ei = 0; ei < EPISODES.length; ei++) {
    const ep = EPISODES[ei];
    console.log(`📺 Episode ${ei + 1}: ${ep.title}`);
    const episode = await post<{ id: string }>(cookie, `/api/projects/${project.id}/episodes`, {
      title: ep.title, description: ep.description, episode_number: ei + 1,
    });
    console.log(`   ✓ Ep ${ei + 1} — ${episode.id}`);

    let created = 0;
    for (const shot of ep.shots) {
      await post(cookie, `/api/episodes/${episode.id}/shots`, shot);
      created++;
      process.stdout.write(`   Shot ${created}/${ep.shots.length}   `);
    }
    totalShots += created;
    console.log(`\n   ✓ ${created} shots\n`);
  }

  console.log("✅ Done!\n");
  console.log(`   প্রজেক্ট  : ${PROJECT_NAME}`);
  console.log(`   চরিত্র   : ${CHARACTERS.length}`);
  console.log(`   এপিসোড   : ${EPISODES.length}`);
  console.log(`   মোট শট   : ${totalShots}`);
  console.log(`\n   👉 http://localhost:3000/projects/${project.id}`);
}

main().catch(e => { console.error(e); process.exit(1); });
