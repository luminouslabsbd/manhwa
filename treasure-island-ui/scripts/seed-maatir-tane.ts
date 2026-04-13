/**
 * Seed: মাটির টানে — Pull of the Soil
 * A beautiful Banglish-style gram Bangla story
 * 7 characters · 7 episodes · ~63 shots
 * Run: npx tsx scripts/seed-maatir-tane.ts
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
const PROJECT_NAME = "মাটির টানে";

// ─────────────────────────────────────────────────────────────
// CHARACTERS
// ─────────────────────────────────────────────────────────────
const CHARACTERS = [
  {
    name: "রিয়া",
    role: "নায়িকা — গ্রামের স্বপ্নবাজ মেয়ে",
    description: "বয়স ১৩। চোখে স্বপ্ন, মনে সাহস। গ্রামের ছোট্ট মেয়ে রিয়া পড়াশোনা করে doctor হতে চায়। ওর কথায় আধুনিক শব্দ মেশা — 'Apu, seriously bolchi, ami boro hoye doctor hobo!' তবে মাটির প্রতি ভালোবাসাটা একটুও কমেনি।",
    appearance: "Bengali village girl age 13, two braids tied with red ribbon, bright eager eyes, warm brown skin, wearing blue-white printed salwar kameez, worn leather sandals, old canvas school bag on shoulder, cheerful determined expression, 2D manhwa illustration, soft watercolor background",
    reference_prompt: "bright Bengali village girl age 13, braided hair with red ribbon, blue printed salwar, school bag, curious expressive eyes, warm smile, 2D manhwa cartoon style",
  },
  {
    name: "দাদাভাই",
    role: "দাদু — গল্পের প্রাণ",
    description: "বয়স ৭২। পাকা দাড়ি, মাথায় সাদা টুপি। নদীর পাড়ে বসে বাঁশি বাজান আর রিয়াকে গল্প শোনান। তার কথায় গ্রামের ইতিহাস জীবন্ত হয়ে ওঠে। বলেন — 'মা, এই মাটি তোমার নাড়ির টান। এইখানেই তোমার শিকড়।'",
    appearance: "elderly Bengali grandfather age 72, long white beard, white topi cap, white kurta and lungi, deeply lined kind face, gentle warm eyes, sitting by river holding bamboo flute, 2D manhwa illustration, golden hour lighting",
    reference_prompt: "wise elderly Bengali grandfather, white beard white topi, white kurta lungi, sitting riverside with bamboo flute, kind warm smile, deeply wrinkled face, 2D manhwa style",
  },
  {
    name: "ফুলমতি",
    role: "রিয়ার절বিএফএফ — মাঝির মেয়ে",
    description: "বয়স ১৩। নদীর মাঝির মেয়ে ফুলমতি — সাঁতার কাটতে পারে ঢেউয়ের মতো, গান গাইতে পারে পাখির মতো। সে বলে — 'Riya apa, nodi chhere ki kothao jawa jay? Amader eto beshi kisher dorkar!' তার হাসিতে গোটা নদী ঝলমল করে।",
    appearance: "Bengali village girl age 13, wild wavy shoulder-length hair, sun-kissed dark skin, wearing faded yellow saree draped playfully, barefoot, bright adventurous eyes, standing in river with water at ankles, 2D manhwa illustration, river blues and greens",
    reference_prompt: "spirited Bengali river girl age 13, wavy dark hair, yellow saree, barefoot in river, bright adventurous eyes, wide grin, 2D manhwa cartoon style",
  },
  {
    name: "সুমন ভাই",
    role: "রিয়ার বড় ভাই — দ্বন্দ্বে ভরা যুবক",
    description: "বয়স ১৯। শহরের স্বপ্ন দেখা যুবক। একটা garments-এ job পেয়েছে Dhaka-তে। গ্রাম ছেড়ে যেতে চায়, তবু মনের ভেতর একটা টানাটানি আছে। বলে — 'Riya, gram-e thakle future nai. Dhaka gele chance ache।' কিন্তু চোখে একটু জল থাকে।",
    appearance: "Bengali young man age 19, short neat black hair, medium brown skin, wearing city-style shirt and trousers, city sandals, conflicted expression mixing sadness and determination, holding a bag as if leaving, 2D manhwa illustration",
    reference_prompt: "young Bengali man age 19, neat short hair, city clothes shirt trousers, holding travel bag, conflicted emotional expression, 2D manhwa cartoon style",
  },
  {
    name: "মাস্টার স্যার",
    role: "পাঠশালার শিক্ষক — নীরব বিপ্লবী",
    description: "বয়স ৪৫। পাতলা গড়ন, মোটা চশমা, সবসময় একটা বই হাতে। গরিব পরিবারের ছেলেমেয়েদের বিনামূল্যে পড়ান। বলেন — 'Shiksha-i poriborton ane. Tumi shikbo, tarpor tumi onke shikhabe।' তাঁর ক্লাসরুমে বিদ্যুৎ নেই কিন্তু স্বপ্ন আছে।",
    appearance: "middle-aged Bengali teacher age 45, thin build, thick glasses, wearing white kurta with pockets full of chalk, slightly dusty from chalk, holding open book, passionate teaching expression, simple village school background, 2D manhwa illustration",
    reference_prompt: "dedicated Bengali village teacher age 45, thick glasses, white kurta, chalk-dusted, holding book, passionate expression, 2D manhwa cartoon style",
  },
  {
    name: "নানু",
    role: "দাদির মা — গ্রামের নিরাময়কারী",
    description: "বয়স ৬৫। রিয়ার নানু, একজন ভেষজ চিকিৎসক যিনি গাছগাছালি দিয়ে মানুষের রোগ সারান। বলেন — 'Maa, shonar bari ei maati. Ei gaach-er pata diye tumi manush bachate parbe।' তার বাগানে শত রকম ভেষজ গাছ।",
    appearance: "elderly Bengali grandmother age 65, silver hair in loose bun, round kind face with deep smile lines, wearing earthy green and brown saree, herb basket on arm, surrounded by medicinal plants, healing hands, 2D manhwa illustration",
    reference_prompt: "wise elderly Bengali herbalist grandmother age 65, silver bun hair, green earthy saree, herb basket, kind healing face, surrounded by plants, 2D manhwa style",
  },
  {
    name: "বজলু চাচা",
    role: "প্রতিপক্ষ — লোভী জমিদার",
    description: "বয়স ৫০। গ্রামের ধনী জমিদার যিনি গরিব কৃষকদের জমি দখল করতে চান। বলেন — 'Toder ei chhotoder school diye ki hobe? Khet koro, sheshe khai।' তার টাকা আছে কিন্তু মন নেই।",
    appearance: "greedy Bengali landlord age 50, overweight, wearing expensive lungi and kurta, thick gold chain, cruel calculating eyes, sinister smile, standing with arms crossed on village land, 2D manhwa illustration, darker color palette",
    reference_prompt: "villainous Bengali landlord age 50, overweight, gold chain expensive clothes, cruel calculating eyes, sinister expression, 2D manhwa cartoon style",
  },
];

// ─────────────────────────────────────────────────────────────
// EPISODES
// ─────────────────────────────────────────────────────────────
const EPISODES: Array<{
  title: string;
  description: string;
  shots: Array<{
    shot_number: number;
    character: string;
    shot_description: string;
    environment: string;
    lighting: string;
    camera_angle: string;
    story_line: string;
    dialogue: string;
    full_prompt: string;
    negative_prompt: string;
    width: number;
    height: number;
    steps: number;
    seed: number;
    status: string;
  }>;
}> = [

  // ═══════════════════════════════════════════════════════════
  // EPISODE 1 — ভোরের গ্রাম
  // ═══════════════════════════════════════════════════════════
  {
    title: "ভোরের গ্রাম",
    description: "ভোরের আলোয় একটি সুন্দর বাংলা গ্রামের জীবন জেগে ওঠে। রিয়া দাদাভাইয়ের সাথে নদীর পাড়ে হাঁটতে যায়। গ্রামের সৌন্দর্য আর সরলতা দেখা যায়।",
    shots: [
      {
        shot_number: 1,
        character: "রিয়া",
        shot_description: "ভোরবেলা রিয়া ঘুম থেকে উঠে জানালা দিয়ে গ্রাম দেখছে — কুয়াশায় ঢাকা মাঠ, দূরে নদী চিকচিক করছে।",
        environment: "গ্রামের মাটির বাড়ি, পুরানো কাঠের জানালা, ভোরের নরম আলো",
        lighting: "সোনালি ভোরের আলো, নরম কুয়াশা",
        camera_angle: "কাছের শট, জানালার পাশে রিয়ার মুখ",
        story_line: "একটি নতুন দিনের শুরু। রিয়া জানালা দিয়ে তার গ্রামকে দেখে — সে এই গ্রামকে ভালোবাসে, কিন্তু তার স্বপ্ন আরো বড়।",
        dialogue: "Suboh hoye gese... aajke school-e jaabo. Master sir bolsilo notun boi ashbe!",
        full_prompt: "Bengali village girl age 13 with braided hair waking up at dawn, looking through old wooden window at misty green fields and distant river, golden morning light streaming in, wonder and excitement on face, cozy mud house interior, warm golden atmosphere, 2D manhwa illustration, soft watercolor style, cinematic composition",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 111001, status: "draft",
      },
      {
        shot_number: 2,
        character: "দাদাভাই",
        shot_description: "দাদাভাই উঠানে বসে ফজরের নামাজ পড়ছেন, পাশে একটি তুলসী গাছ, কোকিলের ডাক শোনা যাচ্ছে।",
        environment: "মাটির উঠান, ভোরের আলো, সবুজ গাছপালা",
        lighting: "ভোরের নরম সোনালি আলো, দীর্ঘ ছায়া",
        camera_angle: "মিড শট, পাশ থেকে",
        story_line: "দাদাভাই প্রতিদিন এভাবেই শুরু করেন — নামাজে, শান্তিতে। তাঁর এই শান্ততা রিয়ার মনে একটা নিরাপত্তার অনুভূতি দেয়।",
        dialogue: "আল্লাহ, আমার নাতনিকে ভালো রাইখো। ওর স্বপ্নগুলো পূরণ কইরো।",
        full_prompt: "elderly Bengali grandfather age 72 with white beard and topi praying at dawn in earthen courtyard, tulsi plant nearby, soft morning mist, birds visible, peaceful serene atmosphere, golden hour light casting long shadows, 2D manhwa illustration, spiritual gentle mood",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 111002, status: "draft",
      },
      {
        shot_number: 3,
        character: "রিয়া",
        shot_description: "রিয়া আর দাদাভাই নদীর পাড়ে হাঁটছেন — নদীতে সূর্যের আলো ঝলমল করছে, হাঁস সাঁতার কাটছে।",
        environment: "নদীর পাড়, সবুজ ঘাস, জলের ধারে হাঁটার পথ",
        lighting: "সকালের সোনালি রোদ, নদীতে আলোর প্রতিফলন",
        camera_angle: "ওয়াইড শট, দুজন পাশাপাশি হাঁটছেন",
        story_line: "দাদাভাই রিয়াকে গ্রামের গল্প বলছেন। প্রতিটি সকাল এভাবেই কাটে — গল্পে, ভালোবাসায়।",
        dialogue: "দাদাভাই: 'মা, দেখ এই নদী। আমার বাবার বাবাও এই নদীতে মাছ ধরতো। এই পানিতেই আমাদের সব স্মৃতি।'\nরিয়া: 'Dadu, amar dream-e ami ei nodi dekhte pai. Seriously!'",
        full_prompt: "elderly Bengali grandfather and young village girl walking along river bank in morning, golden sunlight reflecting on wide river, ducks swimming, green grass path, grandfather pointing to river telling stories, girl looking amazed, warm familial bond, wide cinematic shot, 2D manhwa illustration, golden morning palette",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 111003, status: "draft",
      },
      {
        shot_number: 4,
        character: "ফুলমতি",
        shot_description: "ফুলমতি তার বাবার নৌকায় দাঁড়িয়ে রিয়াকে হাত নাড়ছে — ভোরের নদীতে জেলেদের নৌকা ভেসে যাচ্ছে।",
        environment: "নদী, কাঠের নৌকা, ভোরের কুয়াশা",
        lighting: "ভোরের কুয়াশাচ্ছন্ন নরম আলো",
        camera_angle: "মিড শট, নৌকা থেকে",
        story_line: "ফুলমতি ভোরবেলা বাবার সাথে মাছ ধরতে যায়। সে আর রিয়া প্রতিদিন এভাবেই দেখা করে।",
        dialogue: "Riya apa! Aaj shokal sokalee? Baba amar doye ekta bashi mach dhorse! Hilsha!",
        full_prompt: "spirited Bengali river girl age 13 with wavy dark hair standing in wooden fishing boat at dawn, waving happily to friend on riverbank, misty river morning with other fishing boats in background, fishermen with nets, soft dawn light, joyful energetic pose, 2D manhwa illustration, river morning atmosphere",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 111004, status: "draft",
      },
      {
        shot_number: 5,
        character: "নানু",
        shot_description: "নানু তার ভেষজ বাগানে গাছের যত্ন নিচ্ছেন — হলুদ, আদা, তুলসী, পুদিনা — সব গাছে সকালের শিশির।",
        environment: "ভেষজ বাগান, মাটির উঠান, সকালের শিশির",
        lighting: "মৃদু সকালের আলো, গাছে শিশিরের চমক",
        camera_angle: "ক্লোজ শট, নানুর হাত ও গাছ",
        story_line: "নানুর বাগানে প্রতিটি গাছের একটা গল্প আছে। রিয়া এই গাছগুলো দেখেই doctor হওয়ার স্বপ্ন দেখে।",
        dialogue: "এই হলুদ দিয়া আমি কতজনের জ্বর সারাইসি... আমার রিয়া একদিন বড় ডাক্তার হইবো।",
        full_prompt: "elderly Bengali herbalist grandmother age 65 with silver bun hair tending medicinal herb garden in morning, turmeric ginger tulsi mint plants with morning dew droplets, green earthy saree, gentle caring hands touching plants, warm golden morning light, 2D manhwa illustration, soft botanical style",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 111005, status: "draft",
      },
      {
        shot_number: 6,
        character: "রিয়া",
        shot_description: "রিয়া স্কুলের পথে হাঁটছে — কাঁচা মাটির রাস্তায়, দু'পাশে সরিষার হলুদ ফুল, দূরে পাঠশালা দেখা যাচ্ছে।",
        environment: "গ্রামের কাঁচা রাস্তা, সরিষা ক্ষেত, সকালের আলো",
        lighting: "উজ্জ্বল সকালের সোনালি আলো",
        camera_angle: "লো অ্যাঙ্গেল, সামনে থেকে",
        story_line: "স্কুলের পথ মাত্র আধা মাইল কিন্তু রিয়ার কাছে প্রতিদিন এই পথটা নতুন মনে হয়।",
        dialogue: "আজকে Master sir bolsilo geography class-e world map dekhabo! Ami boro hoye whole world ghurbo!",
        full_prompt: "Bengali village girl age 13 with school bag walking along muddy rural path through golden mustard fields in morning sunshine, distant village school visible, energetic determined stride, warm golden yellow palette of mustard flowers all around, 2D manhwa illustration, beautiful rural Bangladesh landscape",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 111006, status: "draft",
      },
      {
        shot_number: 7,
        character: "মাস্টার স্যার",
        shot_description: "মাস্টার স্যার ক্লাসরুমে ব্ল্যাকবোর্ডে বিশ্বের মানচিত্র আঁকছেন — শিক্ষার্থীরা মুগ্ধ হয়ে দেখছে।",
        environment: "গ্রামের পাঠশালা, কাদামাটির দেয়াল, ব্ল্যাকবোর্ড",
        lighting: "জানালার আলো, চকের ধুলো বাতাসে ভাসছে",
        camera_angle: "ওয়াইড শট, শিক্ষার্থীদের পেছন থেকে",
        story_line: "স্যারের ক্লাসে বিদ্যুৎ নেই, পাখা নেই — কিন্তু কল্পনার কোনো সীমা নেই।",
        dialogue: "Master sir: 'Tora ki janos Bangladesh-er baire-o onek baro prithibi ache? Shei prithibi dekhte hole agey ekhane shikhe nite hobe!'",
        full_prompt: "dedicated Bengali village teacher age 45 with thick glasses drawing world map on chalkboard in simple village classroom, students sitting on wooden benches watching in wonder, chalk dust floating in window light, passionate teaching expression, humble rural school atmosphere, 2D manhwa illustration, warm educational scene",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 111007, status: "draft",
      },
      {
        shot_number: 8,
        character: "রিয়া",
        shot_description: "সন্ধ্যায় রিয়া কুপির আলোয় পড়ছে — মায়াবী আলোয় তার মুখ আলোকিত, বাইরে জোনাকি জ্বলছে।",
        environment: "মাটির ঘরের ভেতর, কুপির আলো, রাতের পরিবেশ",
        lighting: "উষ্ণ কমলা কুপির আলো, বাইরে নীল রাতের আলো",
        camera_angle: "ক্লোজ শট, রিয়ার মুখ বইয়ের পাশে",
        story_line: "বিদ্যুৎ নেই তাই কুপির আলোয় পড়া। কিন্তু রিয়ার পড়ার আগ্রহ কোনো আলো-অন্ধকার মানে না।",
        dialogue: "Aaj raat-e shob lesson sesh korte hobe. Master sir kal exam neben... ami fail korbo na, never!",
        full_prompt: "Bengali village girl age 13 studying by warm oil lamp light at night, open textbooks and notebooks, soft golden lamplight illuminating her focused face, fireflies glowing outside the window in dark blue night, mud house interior, cozy intimate scene, 2D manhwa illustration, warm amber and cool blue contrast",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 111008, status: "draft",
      },
      {
        shot_number: 9,
        character: "দাদাভাই",
        shot_description: "রাতে দাদাভাই রিয়াকে বাঁশি বাজিয়ে ঘুম পাড়াচ্ছেন — চাঁদের আলো উঠানে পড়েছে।",
        environment: "উঠান, রাতের আকাশ, পূর্ণিমার চাঁদ",
        lighting: "নীল চাঁদের আলো, নরম রাতের পরিবেশ",
        camera_angle: "মিড শট, উপর থেকে",
        story_line: "দিন শেষে এটাই রিয়ার প্রিয় মুহূর্ত — দাদাভাইয়ের বাঁশির সুরে ঘুমিয়ে পড়া।",
        dialogue: "দাদাভাই: (বাঁশি বাজাতে বাজাতে) 'ঘুমাও মা... স্বপ্নে ডাক্তার হও...'",
        full_prompt: "elderly Bengali grandfather playing bamboo flute under full moonlight in earthen courtyard, young village girl sleeping peacefully nearby, silver moonlight casting gentle shadows, stars visible, peaceful night village scene, 2D manhwa illustration, dreamy blue and silver nighttime palette",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 111009, status: "draft",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // EPISODE 2 — নদীর কথা বলে
  // ═══════════════════════════════════════════════════════════
  {
    title: "নদীর কথা বলে",
    description: "রিয়া আর ফুলমতির গভীর বন্ধুত্বের গল্প। নদীর বুকে দুই বান্ধবী — হাসি আনন্দে, ঝগড়ায়, আবার মিলে যাওয়ায়। নদী তাদের সাক্ষী।",
    shots: [
      {
        shot_number: 1,
        character: "ফুলমতি",
        shot_description: "ফুলমতি নদীতে লাফ দিচ্ছে — ঝপাস করে পানিতে পড়ছে, চারদিকে জলকণা ছিটকে যাচ্ছে।",
        environment: "নদী, গ্রীষ্মের দুপুর, সবুজ পাড়",
        lighting: "উজ্জ্বল দুপুরের রোদ, পানিতে আলোর ঝলক",
        camera_angle: "অ্যাকশন শট, সামনে থেকে",
        story_line: "গ্রীষ্মের ছুটিতে দুই বান্ধবী নদীতে ঝাঁপ দিচ্ছে। এই মুহূর্তগুলো চিরকাল মনে থাকবে।",
        dialogue: "Aaaaahhh! Riya apa, dekho kemon chhilam! AI! Thanda pani!",
        full_prompt: "spirited Bengali village girl age 13 jumping into wide river with big splash, water droplets flying everywhere, bright afternoon sunshine, green riverbanks, pure joy and laughter on face mid-air, dynamic action shot, 2D manhwa illustration, vibrant summer colors",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 222001, status: "draft",
      },
      {
        shot_number: 2,
        character: "রিয়া",
        shot_description: "রিয়া পাড়ে বসে পা ভিজিয়ে হাসছে — ফুলমতির সাথে মজা করছে, দুজনের মুখে বড় হাসি।",
        environment: "নদীর পাড়, সবুজ ঘাস, গাছের ছায়া",
        lighting: "দুপুরের রোদ, ছায়া-আলোর মিশেল",
        camera_angle: "মিড শট, দুজন একসাথে",
        story_line: "রিয়া ফুলমতিকে সাঁতার শেখায়নি — সে নিজেও সাঁতার জানে না। তারা একসাথে হেসে যায়।",
        dialogue: "রিয়া: 'Tumi ekta pagli! Ami ki bolsilam jump dite? Hahaha!' ফুলমতি: 'Apa tumi beshi darpo. Aso na pani-te!'",
        full_prompt: "two Bengali village girls age 13 sitting at riverbank laughing together, feet in water, one just came from river dripping wet still laughing, bright sunny afternoon, green grass bank, shady trees, genuine friendship and joy, 2D manhwa illustration, warm vibrant colors",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 222002, status: "draft",
      },
      {
        shot_number: 3,
        character: "ফুলমতি",
        shot_description: "ফুলমতি নৌকায় বসে গান গাইছে — বাংলার ভাটিয়ালি সুর, নদীর পানিতে গানের ঢেউ।",
        environment: "নদী, কাঠের নৌকা, বিকেলের আলো",
        lighting: "বিকেলের সোনালি আলো, নদীতে প্রতিফলন",
        camera_angle: "ক্লোজ শট, গানের আবেগ ধরা",
        story_line: "ফুলমতির গলায় ভাটিয়ালি সুর — নদীর মতোই তার গান বয়ে যায়।",
        dialogue: "আমার সোনার বাংলা, আমি তোমায় ভালোবাসি... (সুর করে গাইছে)",
        full_prompt: "spirited Bengali village river girl age 13 sitting in wooden boat singing traditional Bhatiali folk song, eyes closed in song, late afternoon golden light on river, emotional expressive face, boat gently rocking, 2D manhwa illustration, golden river sunset atmosphere",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 222003, status: "draft",
      },
      {
        shot_number: 4,
        character: "রিয়া",
        shot_description: "রিয়া ফুলমতিকে পড়া শেখাচ্ছে নৌকার উপরে বসে — বই, কলম, আর সন্ধ্যার আলো।",
        environment: "নদীর নৌকা, সন্ধ্যার আলো",
        lighting: "সন্ধ্যার কমলা আকাশ",
        camera_angle: "মিড শট, দুজন মুখোমুখি",
        story_line: "রিয়া চায় ফুলমতিও পড়ুক। ফুলমতি শেখার চেষ্টা করছে কিন্তু শব্দগুলো কঠিন লাগছে।",
        dialogue: "রিয়া: 'Dekho — b-a-n-g-l-a-d-e-s-h. Bangladesh! Tumi parba ফুলমতি!' ফুলমতি: 'Apa, amar mathay dhuke na re... Nodi-r pani diye likhte chai!'",
        full_prompt: "two Bengali village girls sitting in wooden boat at sunset, one teaching the other to read from textbook, open book and pencil, warm orange sunset sky reflected in river, one girl encouraging the other who looks confused but trying, tender friendship scene, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 222004, status: "draft",
      },
      {
        shot_number: 5,
        character: "দাদাভাই",
        shot_description: "দাদাভাই নদীর পাড়ে বসে দুই বান্ধবীকে নদীর ইতিহাস বলছেন — তার চোখে স্মৃতির জল।",
        environment: "নদীর পাড়, বটগাছের ছায়া",
        lighting: "বিকেলের নরম আলো",
        camera_angle: "থ্রি শট, দাদাভাইকে মাঝে রেখে",
        story_line: "দাদাভাই বলছেন ১৯৭১-এর গল্প — এই নদীর কাছেই অনেক কিছু হয়েছিল।",
        dialogue: "দাদাভাই: 'এই নদীতেই আমরা '৭১-এ পার হইসিলাম... রাতের বেলা, ভয়ে ভয়ে। তোমরা যা দেখতেছো সেটা তাদেরই দেওয়া।'",
        full_prompt: "elderly Bengali grandfather sitting under large banyan tree by river telling story to two young girls, grandfather with white beard gesturing at river with emotional eyes, girls listening intently with wide eyes, afternoon light filtering through banyan leaves, 2D manhwa illustration, storytelling mood",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 222005, status: "draft",
      },
      {
        shot_number: 6,
        character: "রিয়া",
        shot_description: "রিয়া আর ফুলমতি একসাথে সন্ধ্যার তারা দেখছে নৌকায় শুয়ে — আকাশ ভরা তারা।",
        environment: "নদীর মাঝখানে নৌকা, রাতের আকাশ",
        lighting: "তারাভরা রাতের আকাশ, নীল আলো",
        camera_angle: "উপর থেকে লো অ্যাঙ্গেল",
        story_line: "দুই বান্ধবী স্বপ্ন ভাগ করে — রিয়া ডাক্তার হবে, ফুলমতি গান গাইবে।",
        dialogue: "রিয়া: 'Oi tara-ta dekho. Ota ki Dhruva tara?' ফুলমতি: 'Apa, ami boro hoye singer hobo. Tumi ki aasbe amar concert-e?'",
        full_prompt: "two Bengali village girls lying in wooden boat at night looking up at star-filled sky, Milky Way visible, dreamy expressions, one pointing at bright star, gentle river sounds, starlight reflected in calm river water, 2D manhwa illustration, beautiful night sky stars illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 222006, status: "draft",
      },
      {
        shot_number: 7,
        character: "ফুলমতি",
        shot_description: "ফুলমতি রিয়াকে জড়িয়ে ধরছে, বলছে সে কোনোদিন ভুলবে না — এই বন্ধুত্ব চিরকালের।",
        environment: "নদীর পাড়, সন্ধ্যার আলো",
        lighting: "সোনালি সন্ধ্যার আলো",
        camera_angle: "ক্লোজ শট, দুজনের আলিঙ্গন",
        story_line: "সন্ধ্যায় বাড়ি ফেরার আগে ফুলমতি রিয়াকে জড়িয়ে ধরে। কিছু মুহূর্ত চিরকাল থাকে।",
        dialogue: "ফুলমতি: 'Riya apa, tumi kono din chhole jabe na to? Tumi na thakle ei nodi-r pani aro thanda hoye jabe।'",
        full_prompt: "two Bengali village girls hugging by river at golden sunset, one taller hugging shorter one warmly, both with emotional expression, golden evening light reflecting on river, silhouette-like warmth, genuine emotional bond, 2D manhwa illustration, warm golden sunset colors",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 222007, status: "draft",
      },
      {
        shot_number: 8,
        character: "রিয়া",
        shot_description: "রিয়া নদীর দিকে তাকিয়ে গভীর চিন্তায় — সুমন ভাই Dhaka চলে যাওয়ার কথা বলেছে, সে কি ভাবছে?",
        environment: "নদীর পাড়, সন্ধ্যার শেষ আলো",
        lighting: "ম্লান বিকেলের আলো",
        camera_angle: "প্রোফাইল শট",
        story_line: "আনন্দের মাঝেই একটা দুশ্চিন্তা — সুমন ভাই চলে যাচ্ছে। পরিবার ভাঙে না কিন্তু দূরত্ব বাড়ে।",
        dialogue: "(মনে মনে) Sumon bhai chhole gele... ghore ki shudhu ami ar dadu thakbo? Ma-r kaanda shunle ami ki korbo...",
        full_prompt: "Bengali village girl age 13 sitting alone at riverbank in fading evening light, profile view showing thoughtful melancholy expression, river flowing quietly, sky turning purple and orange at dusk, contemplative mood, gentle sadness mixed with determination, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 222008, status: "draft",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // EPISODE 3 — ভাইয়ের বিদায়
  // ═══════════════════════════════════════════════════════════
  {
    title: "ভাইয়ের বিদায়",
    description: "সুমন ভাই Dhaka যাওয়ার দিন এলো। পরিবারে আনন্দ আর বেদনার মিশেল। রিয়া ভাইকে থামাতে চায় — কিন্তু বুঝতে পারে সবার স্বপ্ন আলাদা।",
    shots: [
      {
        shot_number: 1,
        character: "সুমন ভাই",
        shot_description: "সুমন ভাই ভোরবেলা ব্যাগ গুছাচ্ছেন — পুরানো ব্যাগে কাপড়, মায়ের দেওয়া আচার, দাদাভাইয়ের তাবিজ।",
        environment: "ছোট ঘর, ভোরের আলো, সরল আসবাবপত্র",
        lighting: "ভোরের নরম আলো",
        camera_angle: "ক্লোজ শট, ব্যাগ গোছানো",
        story_line: "সুমন ভাই যাচ্ছেন স্বপ্নের শহরে — কিন্তু মনে কোথাও একটা কষ্ট।",
        dialogue: "Bag-e jagay ache to sab? Ma-r achar... dadu-r tabij... Riya-r ekta ছবি রাখি।",
        full_prompt: "young Bengali man age 19 packing worn travel bag in simple small room at dawn, placing mother's homemade pickle jar, old talisman, and photo of sister inside bag, conflicted emotional expression mixing hope and sadness, soft morning light, humble rural home interior, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 333001, status: "draft",
      },
      {
        shot_number: 2,
        character: "রিয়া",
        shot_description: "রিয়া সুমন ভাইয়ের হাত ধরে টানছে — 'যেও না' বলতে পারছে না, চোখে জল।",
        environment: "বাড়ির উঠান, সকালের আলো",
        lighting: "সকালের আলো",
        camera_angle: "ক্লোজ শট, হাত ধরার দৃশ্য",
        story_line: "রিয়া বুঝতে পারছে সুমন ভাইকে থামানো যাবে না। কিন্তু বিদায় দেওয়াটা কঠিন।",
        dialogue: "রিয়া: 'Bhai... Dhaka-te gele ki tumi amader bhule jabe?' সুমন: 'Pagoli! Ami ki thakle toder jন্য chakri korte parbo?'",
        full_prompt: "young Bengali village girl holding older brother's hand at home courtyard in morning, girl's eyes glistening with unshed tears, brother looking down at her with emotional expression, tender sibling farewell moment, warm morning light, 2D manhwa illustration, emotional family scene",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 333002, status: "draft",
      },
      {
        shot_number: 3,
        character: "দাদাভাই",
        shot_description: "দাদাভাই সুমনের কপালে হাত রেখে দোয়া করছেন — চোখ বন্ধ, মুখে মৃদু কম্পন।",
        environment: "উঠান, সকালের আলো",
        lighting: "সকালের সোনালি আলো",
        camera_angle: "ক্লোজ শট, দাদার হাত মাথায়",
        story_line: "দাদাভাইয়ের দোয়া — এটাই সবচেয়ে বড় পাথেয়।",
        dialogue: "দাদাভাই: 'আল্লাহ তোমাকে হেফাজত করুক। মনে রাইখো — যত দূরেই যাও, মাটির টান ছাড়ো না।'",
        full_prompt: "elderly Bengali grandfather placing hand on young man's head in blessing gesture at courtyard, eyes closed in prayer, young man with bowed head receiving blessing reverently, morning sunlight, deeply emotional spiritual moment, 2D manhwa illustration, warm golden light",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 333003, status: "draft",
      },
      {
        shot_number: 4,
        character: "সুমন ভাই",
        shot_description: "সুমন ভাই নৌকায় উঠছেন — পিছনে ফিরে তাকিয়ে হাত নাড়ছেন, পরিবার পাড়ে দাঁড়িয়ে।",
        environment: "নদীর ঘাট, সকালের আলো, নৌকা",
        lighting: "সকালের উজ্জ্বল আলো",
        camera_angle: "ওয়াইড শট, নৌকা থেকে পাড়ের দিকে",
        story_line: "সুমন চলে যাচ্ছেন। এই বিদায়ের মুহূর্তটা সবার মনে গেঁথে যায়।",
        dialogue: "সুমন: 'Riya! Bhalo kore porish! Boro hoye doctor hoiyo! Ami Dhaka theke tomar jonno boi pathabo!'",
        full_prompt: "young Bengali man on wooden boat waving back to family standing on riverbank as boat leaves, family group including old grandfather and young girl waving back with emotional faces, boat moving away on morning river, emotional farewell scene, beautiful river landscape, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 333004, status: "draft",
      },
      {
        shot_number: 5,
        character: "রিয়া",
        shot_description: "রিয়া পাড়ে দাঁড়িয়ে নৌকা দূরে মিলিয়ে যাওয়া দেখছে — চোখ মুছছে, তবু মুখে দৃঢ়তা।",
        environment: "নদীর পাড়, সকালের আলো, দূরে নৌকা",
        lighting: "সকালের আলো",
        camera_angle: "পিছন থেকে, নদীর দিকে তাকানো",
        story_line: "রিয়া কাঁদছে কিন্তু ভেঙে পড়ছে না। সে ঠিক করেছে — ভাইয়ের সাথে আবার দেখা হবে, তার পড়াশোনা শেষ করেই।",
        dialogue: "(চোখ মুছে) Bhai, ami doctor hobo. Promise. Tumi Dhaka theke shune nite parbe sei din-er akhabar।",
        full_prompt: "Bengali village girl age 13 seen from behind standing at riverbank watching small boat disappear in distance, wiping tears with sleeve, determined posture despite sadness, morning light on river, emotional but resilient mood, 2D manhwa illustration, bittersweet farewell atmosphere",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 333005, status: "draft",
      },
      {
        shot_number: 6,
        character: "নানু",
        shot_description: "নানু রিয়াকে কোলে টেনে নিচ্ছেন — দুজনই কাঁদছেন, দুজনই শক্ত হচ্ছেন।",
        environment: "বাড়ির উঠান, দুপুরের আলো",
        lighting: "নরম দুপুরের আলো",
        camera_angle: "মিড শট, আলিঙ্গন",
        story_line: "নানুর কোলে রিয়া সব ভার নামিয়ে রাখে। এই মুহূর্তে কোনো কথা লাগে না।",
        dialogue: "নানু: 'কাঁদো মা... কাঁদো। কান্না আটকে রাখলে বুক ভাইরা যায়। কাঁইদা হালকা হও।'",
        full_prompt: "elderly Bengali herbalist grandmother age 65 holding young village girl in warm comforting hug in courtyard, both emotional, grandmother stroking girl's hair lovingly, afternoon soft light, genuine grandmother-granddaughter warmth, 2D manhwa illustration, warm earthy colors",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 333006, status: "draft",
      },
      {
        shot_number: 7,
        character: "মাস্টার স্যার",
        shot_description: "পরের দিন মাস্টার স্যার রিয়াকে বিশেষভাবে ডেকে একটি বই দিচ্ছেন — 'বড় হওয়ার গল্প'।",
        environment: "স্কুলের বারান্দা, দুপুর",
        lighting: "দুপুরের নরম আলো",
        camera_angle: "মিড শট, বই দেওয়ার দৃশ্য",
        story_line: "স্যার জানেন রিয়ার কষ্টের কথা। বইটা দেওয়া মানে বলা — এগিয়ে যাও।",
        dialogue: "Master sir: 'Riya, ei boi-ta pore dekho. Marie Curie-r golpo ache. Taro baba-ma chhilo na, tao she thame ni। Tumi-o thakbe na।'",
        full_prompt: "dedicated Bengali village teacher age 45 with thick glasses handing an old book to young village girl in school veranda, warm encouraging expression, girl receiving book with both hands respectfully, afternoon light, mentorship moment, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 333007, status: "draft",
      },
      {
        shot_number: 8,
        character: "রিয়া",
        shot_description: "রাতে রিয়া স্যারের দেওয়া বই পড়ছে — Marie Curie-র ছবিতে মুগ্ধ হয়ে তাকিয়ে আছে।",
        environment: "ঘরের ভেতর, কুপির আলো",
        lighting: "উষ্ণ কুপির আলো",
        camera_angle: "ক্লোজ শট, বইয়ের পাতা ও রিয়ার মুখ",
        story_line: "রিয়া বুঝতে পারল — স্বপ্ন পূরণ করতে কষ্ট লাগে। কিন্তু কষ্টই স্বপ্নকে শক্তিশালী করে।",
        dialogue: "Marie Curie-o gramete boshe shikse... ami-o parbo। Bhai, dekho ami ki korchi!",
        full_prompt: "Bengali village girl age 13 reading book by oil lamp at night, staring at illustration in book with wonder and inspiration, lamplight illuminating her amazed face, mud house interior at night, books and notebooks around, determined dreaming expression, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 333008, status: "draft",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // EPISODE 4 — বজলু চাচার ষড়যন্ত্র
  // ═══════════════════════════════════════════════════════════
  {
    title: "বজলু চাচার ষড়যন্ত্র",
    description: "গ্রামের লোভী জমিদার বজলু চাচা পাঠশালার জমি দখল করতে চায়। রিয়া আর তার বন্ধুরা মিলে প্রতিবাদ করে — গ্রামের শিশুদের অধিকার রক্ষার লড়াই।",
    shots: [
      {
        shot_number: 1,
        character: "বজলু চাচা",
        shot_description: "বজলু চাচা জমিদারি ভাব নিয়ে পাঠশালার সামনে দাঁড়িয়ে — কাগজ হাতে, পিছনে লোকজন।",
        environment: "গ্রামের পাঠশালার সামনে, দুপুর",
        lighting: "কড়া দুপুরের রোদ",
        camera_angle: "লো অ্যাঙ্গেল, ভয় দেখানো",
        story_line: "বজলু চাচা দাবি করছেন এই জমি তার — পাঠশালা ভাঙতে হবে।",
        dialogue: "বজলু: 'এই জমি আমার বাপের। কাগজ দেখেন! এই স্কুল-টুল ভাঙতে হবে। এইখানে আমার warehouse হইব।'",
        full_prompt: "overweight greedy Bengali landlord age 50 with gold chain standing menacingly in front of small village school holding official-looking papers, goons standing behind him, dark threatening expression, harsh noon sunlight, sinister atmosphere, 2D manhwa illustration, darker color palette with dramatic shadows",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 444001, status: "draft",
      },
      {
        shot_number: 2,
        character: "মাস্টার স্যার",
        shot_description: "মাস্টার স্যার শান্তভাবে বজলু চাচার সামনে দাঁড়িয়েছেন — ভয় নেই, চোখে দৃঢ়তা।",
        environment: "পাঠশালার দরজায়",
        lighting: "কড়া রোদ",
        camera_angle: "টু শট, মুখোমুখি",
        story_line: "মাস্টার স্যার একা কিন্তু অবিচল।",
        dialogue: "Master sir: 'Bajlu sahib, ei school-er kono shapath nai. Ei shishuder shikkha-r odhikar ache. Aapni jodi ei school nosto koren, amra court jabo।'",
        full_prompt: "dedicated Bengali village teacher age 45 with thick glasses standing calmly and defiantly facing overweight greedy landlord, teacher's expression showing quiet courage without fear, school doorway behind teacher, confrontation scene, 2D manhwa illustration, dramatic composition",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 444002, status: "draft",
      },
      {
        shot_number: 3,
        character: "রিয়া",
        shot_description: "রিয়া স্কুলের ছেলেমেয়েদের নিয়ে মানববন্ধন করছে — হাতে বানানো ব্যানার 'আমাদের স্কুল বাঁচাও'।",
        environment: "পাঠশালার সামনে, দিনের আলো",
        lighting: "দিনের উজ্জ্বল আলো",
        camera_angle: "ওয়াইড শট, মানববন্ধন",
        story_line: "রিয়ার নেতৃত্বে শিশুরা প্রতিবাদে নামে।",
        dialogue: "রিয়া: 'Amra ei school chharbo na! Amader poras-te dao! Seriously — ekjon-o na sorle ami court-e Petition dibo!'",
        full_prompt: "Bengali village girl age 13 leading group of school children in human chain protest in front of village school, children holding hand-painted banner saying school protection, raised fists and determined faces, bright daylight, powerful grassroots protest scene, 2D manhwa illustration, vibrant colors",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 444003, status: "draft",
      },
      {
        shot_number: 4,
        character: "ফুলমতি",
        shot_description: "ফুলমতি মাছওয়ালা, কৃষক, সবাইকে ডেকে আনছে — 'স্কুল বাঁচাতে হবে' বলে চিৎকার করছে।",
        environment: "গ্রামের বাজার, দুপুর",
        lighting: "দুপুরের রোদ",
        camera_angle: "অ্যাকশন শট",
        story_line: "ফুলমতি গ্রামের সবাইকে একজোট করছে — তার গলার জোর কাজে লাগছে।",
        dialogue: "ফুলমতি: 'Oi bhai-ra shunno! Bajlu cha school vangbe! Tader shontaner ki porsune jabe? Aso shobai! Jao na!'",
        full_prompt: "spirited Bengali river girl age 13 standing on market stall calling out to villagers, fishermen and farmers gathering to listen, urgent passionate expression, village market setting, crowd gathering, girl as community mobilizer, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 444004, status: "draft",
      },
      {
        shot_number: 5,
        character: "দাদাভাই",
        shot_description: "দাদাভাই গ্রামের বড়দের নিয়ে বজলু চাচার সাথে কথা বলছেন — শান্তভাবে কিন্তু দৃঢ়ভাবে।",
        environment: "গ্রামের মাঠ, বিকেল",
        lighting: "বিকেলের আলো",
        camera_angle: "গ্রুপ শট",
        story_line: "গ্রামের বুজুর্গরা একজোট হন। বজলু চাচা চাপে পড়েন।",
        dialogue: "দাদাভাই: 'বজলু, তোমার বাপও এই স্কুলে পড়সে। লজ্জা নাই? টাকার লোভে মানুষ হও না।'",
        full_prompt: "elderly Bengali grandfather with white beard leading group of village elders confronting greedy landlord in open field at afternoon, calm but firm discussion, community solidarity, traditional village conflict resolution scene, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 444005, status: "draft",
      },
      {
        shot_number: 6,
        character: "বজলু চাচা",
        shot_description: "বজলু চাচা পিছু হটছেন — সারা গ্রাম তার বিরুদ্ধে, মুখ লাল হয়ে গেছে।",
        environment: "পাঠশালার সামনে, বিকেল",
        lighting: "বিকেলের আলো",
        camera_angle: "ক্লোজ শট, বিরক্তি ও পরাজয়",
        story_line: "বজলু চাচাকে পিছু হটতে হয় — কিন্তু সে ভেতরে ভেতরে রেগে আছে।",
        dialogue: "বজলু: 'ঠিক আছে, যাই। কিন্তু এই গ্রামে আমার শত্রু বাড়ল! এখন সবাই সাবধান!'",
        full_prompt: "overweight greedy Bengali landlord age 50 being forced to back down by united village crowd, red face of embarrassment and anger, reluctantly turning to leave, village school and children visible in background celebrating, defeated villain scene, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 444006, status: "draft",
      },
      {
        shot_number: 7,
        character: "রিয়া",
        shot_description: "রিয়া মাস্টার স্যারের সাথে হাত মেলাচ্ছে — জয়ের হাসি মুখে, পিছনে আনন্দিত শিক্ষার্থীরা।",
        environment: "পাঠশালার সামনে, বিকেল",
        lighting: "বিকেলের সোনালি আলো",
        camera_angle: "ওয়াইড শট, উদযাপন",
        story_line: "ছোটরা জিতেছে। স্কুল বেঁচেছে।",
        dialogue: "রিয়া: 'Sir, amra jitesi! School safe ache!' Master sir: 'Na maa, tumi jiteso। Tumi shobikaike ek korse।'",
        full_prompt: "Bengali village girl age 13 shaking hands with village teacher in victory celebration, both beaming with happiness, excited school children cheering behind them, golden afternoon sunlight, triumphant joyful moment, 2D manhwa illustration, warm victory colors",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 444007, status: "draft",
      },
      {
        shot_number: 8,
        character: "নানু",
        shot_description: "নানু রিয়াকে দেখে হাসছেন — বলছেন 'তোমার মধ্যে নেতা আছে'।",
        environment: "বাড়ির উঠান, সন্ধ্যা",
        lighting: "সন্ধ্যার আলো",
        camera_angle: "ক্লোজ শট",
        story_line: "নানুর স্বীকৃতি — রিয়ার কাছে এটাই সবচেয়ে বড় পুরস্কার।",
        dialogue: "নানু: 'তোমার মধ্যে নেতা আছে মা। তুমি শুধু ডাক্তার হবা না — তুমি গ্রামের মা হবা।'",
        full_prompt: "elderly Bengali herbalist grandmother age 65 cupping young village girl's face in her hands with proud loving expression, girl smiling with mix of pride and shyness, warm evening courtyard light, grandmother granddaughter pride moment, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 444008, status: "draft",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // EPISODE 5 — বন্যার রাত
  // ═══════════════════════════════════════════════════════════
  {
    title: "বন্যার রাত",
    description: "আষাঢ়ের বন্যায় গ্রাম ডুবে যাচ্ছে। রিয়া নানুর শেখানো ভেষজ জ্ঞান দিয়ে অসুস্থ মানুষদের সাহায্য করে। সবচেয়ে বড় পরীক্ষার রাত।",
    shots: [
      {
        shot_number: 1,
        character: "রিয়া",
        shot_description: "মুষলধারে বৃষ্টিতে রিয়া ছাদে উঠে দেখছে — গ্রামের রাস্তায় পানি, নদী উপচে পড়ছে।",
        environment: "মাটির বাড়ির ছাদ, রাতের বন্যা",
        lighting: "বিদ্যুৎ চমকে আলো, অন্ধকার রাত",
        camera_angle: "ওয়াইড শট, ওপর থেকে",
        story_line: "বন্যা এসেছে। রিয়া ভয় পাচ্ছে কিন্তু মাথা ঠান্ডা রাখছে।",
        dialogue: "Ya Allah! Nodi bhenge gese naki? Dadu! Dadu! Pani ashe! Ghor theke beriye jete hobe!",
        full_prompt: "Bengali village girl age 13 standing on rooftop of mud house in torrential monsoon rain at night, looking out at flooded village streets and overflowing river, lightning flashing in stormy sky, terrified but determined expression, dramatic monsoon storm atmosphere, 2D manhwa illustration, dark dramatic blue-grey colors with lightning",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 555001, status: "draft",
      },
      {
        shot_number: 2,
        character: "দাদাভাই",
        shot_description: "দাদাভাই নৌকা বেয়ে আশেপাশের বাড়ির মানুষদের উদ্ধার করছেন — বৃষ্টিতে ভিজে।",
        environment: "বন্যার পানিতে নৌকা, রাতের ঝড়",
        lighting: "বৃষ্টির রাত, লণ্ঠনের আলো",
        camera_angle: "অ্যাকশন শট, নৌকা",
        story_line: "বন্যায় দাদাভাই তরুণদের মতো সাহসী হন।",
        dialogue: "দাদাভাই: 'ওই বাড়ির নানিরে উঠাও আগে! শিশুগুলারে নিয়া আসো! নৌকায় উঠো মা!'",
        full_prompt: "elderly Bengali grandfather age 72 rowing wooden boat through flooded village streets at night, rescuing people from submerged houses, white beard soaked with rain, holding oil lantern, heroic brave expression despite age, dramatic flood rescue scene, 2D manhwa illustration, dark stormy atmosphere with warm lantern glow",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 555002, status: "draft",
      },
      {
        shot_number: 3,
        character: "নানু",
        shot_description: "নানু উঁচু জমিতে আশ্রয় কেন্দ্রে রোগীদের সেবা করছেন — ভেষজ পাতা থেঁতো করছেন।",
        environment: "উঁচু আশ্রয় কেন্দ্র, রাত",
        lighting: "লণ্ঠনের আলো",
        camera_angle: "মিড শট, সেবার দৃশ্য",
        story_line: "নানুর ভেষজ জ্ঞান আজ জীবন বাঁচাচ্ছে।",
        dialogue: "নানু: 'এই তুলসী পাতা সিদ্ধ করো... আদা আর গোলমরিচ দাও... জ্বর কমব।'",
        full_prompt: "elderly Bengali herbalist grandmother age 65 working by lantern light in flood relief camp treating sick people, crushing medicinal herbs with mortar and pestle, calm focused healing expression, organized medical area with traditional medicines, 2D manhwa illustration, warm golden lantern light in dark night",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 555003, status: "draft",
      },
      {
        shot_number: 4,
        character: "রিয়া",
        shot_description: "রিয়া একটি ছোট্ট শিশুকে কোলে নিয়ে নানুর কাছে দৌড়ে আসছে — শিশুটির জ্বর।",
        environment: "আশ্রয় কেন্দ্র, রাত",
        lighting: "লণ্ঠনের আলো",
        camera_angle: "অ্যাকশন শট, দৌড়ানো",
        story_line: "রিয়া প্রথমবার একটি অসুস্থ শিশুকে দেখছে — সে প্রকৃত doctor হওয়ার অনুভূতি পাচ্ছে।",
        dialogue: "রিয়া: 'Nanu! Nanu! Ei shishuta khub garan-e jwalte ache! Ki korbo? Nanu please!'",
        full_prompt: "Bengali village girl age 13 running urgently carrying sick infant to elderly grandmother at night flood relief camp, worried expression mixed with determination, lantern casting urgent shadows, emergency medical scene, 2D manhwa illustration, tense dramatic atmosphere",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 555004, status: "draft",
      },
      {
        shot_number: 5,
        character: "নানু",
        shot_description: "নানু রিয়াকে শেখাচ্ছেন ভেষজ দিয়ে কীভাবে জ্বর কমাতে হয় — রিয়া মনোযোগ দিয়ে শিখছে।",
        environment: "আশ্রয় কেন্দ্র, রাত",
        lighting: "লণ্ঠনের আলো",
        camera_angle: "ক্লোজ শট, শেখার মুহূর্ত",
        story_line: "এই রাতে রিয়া প্রকৃত চিকিৎসার পাঠ পাচ্ছে।",
        dialogue: "নানু: 'শোনো মা — এই পাতা কপালে লাগাও। ঠান্ডা পানিতে কাপড় ভিজিয়ে শরীর মোছাও। আর বলো — ভয় নাই।'",
        full_prompt: "elderly Bengali herbalist grandmother teaching young village girl how to treat fever with traditional herbs by lantern light at night, hands-on learning scene, girl watching intently with focused expression, traditional medicine preparation, mentor moment in crisis, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 555005, status: "draft",
      },
      {
        shot_number: 6,
        character: "ফুলমতি",
        shot_description: "ফুলমতি বাবার নৌকায় দাঁড়িয়ে আলো দেখাচ্ছে — অন্ধকার পানিতে পথ দেখাচ্ছে।",
        environment: "বন্যার পানিতে নৌকা, রাত",
        lighting: "লণ্ঠনের আলো, অন্ধকার পানি",
        camera_angle: "ড্রামাটিক শট",
        story_line: "ফুলমতি নদীর মেয়ে — এই পানিতে সে ভয় পায় না।",
        dialogue: "ফুলমতি: 'Oi dike jao na! Beshi shallow — nao atke jabe! Amar piche aso, ami path dekhai!'",
        full_prompt: "spirited Bengali river girl age 13 standing bravely at front of wooden rescue boat at night flood, holding high lantern to light the way through dark floodwaters, fearless commanding expression, dramatic lighting with lantern glow against dark stormy sky, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 555006, status: "draft",
      },
      {
        shot_number: 7,
        character: "রিয়া",
        shot_description: "ভোরবেলায় বন্যার পানি নামছে — রিয়া ক্লান্ত কিন্তু সন্তুষ্ট, একটি শিশু সুস্থ হয়েছে।",
        environment: "আশ্রয় কেন্দ্র, ভোর",
        lighting: "ভোরের আলো",
        camera_angle: "মিড শট, ক্লান্ত রিয়া",
        story_line: "সারারাত জেগে কাজ করেছে রিয়া। এই ক্লান্তি আনন্দের।",
        dialogue: "রিয়া: (ক্লান্ত হাসি) Nanu, shishuta shusto hoye gese. Ami ektu ghemese kintu... ami-i therayi disi! Nanu, ami ki doctor hoye jabo?",
        full_prompt: "Bengali village girl age 13 exhausted but smiling at dawn after long night of flood relief work, sitting near sleeping healthy baby she helped treat, tired satisfied expression, first light of dawn coming through window, 2D manhwa illustration, warm dawn colors after dark night",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 555007, status: "draft",
      },
      {
        shot_number: 8,
        character: "দাদাভাই",
        shot_description: "ভোরে দাদাভাই ভেজা কাপড়ে উঠানে বসে শুকর করছেন — রিয়া পাশে বসে হাত ধরে আছে।",
        environment: "উঠান, ভোরের আলো",
        lighting: "সোনালি ভোরের আলো",
        camera_angle: "টু শট, শান্তির মুহূর্ত",
        story_line: "বিপদ কেটেছে। গ্রাম টিকেছে। পরিবার একসাথে।",
        dialogue: "দাদাভাই: 'আলহামদুলিল্লাহ। মা, তুমি আজ অনেক বড় কাজ করসো। আমি গর্বিত।'",
        full_prompt: "elderly Bengali grandfather age 72 sitting in courtyard at dawn with wet clothes after flood rescue work, young granddaughter sitting beside him holding his hand, both peaceful and grateful after long night, golden morning light, tender family moment after crisis, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 555008, status: "draft",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // EPISODE 6 — শহরের চিঠি
  // ═══════════════════════════════════════════════════════════
  {
    title: "শহরের চিঠি",
    description: "সুমন ভাই Dhaka থেকে চিঠি পাঠিয়েছেন — শহরের গল্প, কিন্তু একটা খবরও আছে যা পরিবারকে নাড়িয়ে দেয়। রিয়া সিদ্ধান্ত নেয়।",
    shots: [
      {
        shot_number: 1,
        character: "রিয়া",
        shot_description: "ডাকপিয়ন চিঠি দিয়ে যাচ্ছে — রিয়া দৌড়ে এসে নিচ্ছে, Dhaka-র ঠিকানা দেখে উত্তেজিত।",
        environment: "উঠান, দুপুর",
        lighting: "দুপুরের রোদ",
        camera_angle: "অ্যাকশন শট",
        story_line: "সুমন ভাইয়ের চিঠি — দীর্ঘ প্রতীক্ষার পর।",
        dialogue: "রিয়া: 'Chiti! Sumon bhai-er chiti! Dadu! Dadu! Aso! Bhai chiti pathaise!'",
        full_prompt: "excited Bengali village girl age 13 running to receive letter from postman, envelope with Dhaka address visible, postman on bicycle, pure excitement and joy on face, sunny village courtyard, 2D manhwa illustration, vibrant cheerful scene",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 666001, status: "draft",
      },
      {
        shot_number: 2,
        character: "দাদাভাই",
        shot_description: "দাদাভাই চিঠি পড়ছেন — রিয়া পাশে উৎসুক হয়ে শুনছে। চিঠিতে সুমনের কথা।",
        environment: "উঠান, দুপুর",
        lighting: "দুপুরের আলো",
        camera_angle: "টু শট",
        story_line: "সুমন ভালো আছেন, কিন্তু কষ্টে আছেন — অনেক কাজ, কম টাকা।",
        dialogue: "দাদাভাই: (পড়ছেন) 'দাদু, আমি ভালো আছি। কিন্তু Dhaka-তে সব কঠিন। রাত ১২টা পর্যন্ত কাজ। তবু চেষ্টা করছি।... রিয়াকে বলো পড়াশোনা ছাড়বে না।'",
        full_prompt: "elderly Bengali grandfather reading handwritten letter in courtyard with granddaughter listening intently beside him, afternoon light, emotional reading scene, grandfather's voice catching with emotion while granddaughter watches his face, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 666002, status: "draft",
      },
      {
        shot_number: 3,
        character: "রিয়া",
        shot_description: "রিয়া একা বসে সুমন ভাইকে চিঠির জবাব লিখছে — অনেক কথা আছে।",
        environment: "ঘরের ভেতর, বিকেল",
        lighting: "বিকেলের আলো",
        camera_angle: "ক্লোজ শট, লেখা",
        story_line: "রিয়া লিখছে তার সব কথা — স্কুলের, বন্যার, স্বপ্নের।",
        dialogue: "রিয়া: (লিখছে) 'প্রিয় সুমন ভাই, আমি doctor হওয়ার preparation শুরু করসি। Nanu-r কাছ থেকে medicine শিখতেছি। Tumi kosto korona। Amader jonne tumi enough করso।'",
        full_prompt: "Bengali village girl age 13 writing reply letter by afternoon window light, focused expression full of emotion, pen in hand over paper, village visible through window, intimate quiet scene, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 666003, status: "draft",
      },
      {
        shot_number: 4,
        character: "মাস্টার স্যার",
        shot_description: "মাস্টার স্যার রিয়াকে ডেকে বলছেন — district scholarship exam আছে, রিয়াকে দিতে হবে।",
        environment: "স্কুলের বারান্দা, দুপুর",
        lighting: "দুপুরের আলো",
        camera_angle: "মিড শট",
        story_line: "একটা সুযোগ এসেছে — scholarship পেলে রিয়া শহরের ভালো স্কুলে যেতে পারবে।",
        dialogue: "Master sir: 'Riya, district scholarship exam-er form ache। Tumi apply korbe। Ami janি tumi pabe। Kintu ekta question ache — tumi ki gram chhorte razzi ache?'",
        full_prompt: "dedicated Bengali village teacher age 45 with thick glasses having serious important conversation with village girl student in school veranda, teacher showing scholarship exam form, girl with conflicted but interested expression, afternoon light, pivotal mentor conversation, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 666004, status: "draft",
      },
      {
        shot_number: 5,
        character: "রিয়া",
        shot_description: "রিয়া সন্ধ্যায় নদীর পাড়ে একা বসে ভাবছে — যাবে নাকি থাকবে?",
        environment: "নদীর পাড়, সন্ধ্যা",
        lighting: "সন্ধ্যার কমলা আলো",
        camera_angle: "ওয়াইড শট, একাকীত্ব",
        story_line: "এই সিদ্ধান্তই তার জীবন বদলে দেবে।",
        dialogue: "(মনে মনে) Gram chhorle dadu-r ki hobe? Nanu-r ki hobe? Fulfoti-r ki hobe? Kintu ami jodi na jai... tahole doctor-i ba hobo ki kore?",
        full_prompt: "Bengali village girl age 13 sitting alone at sunset riverbank in deep thought, knees to chest, river glowing orange and gold, conflicted expression of someone making big life decision, symbolic lonely figure against beautiful sunset landscape, 2D manhwa illustration, contemplative mood",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 666005, status: "draft",
      },
      {
        shot_number: 6,
        character: "দাদাভাই",
        shot_description: "দাদাভাই রিয়ার পাশে এসে বসেন — রাতের নদীর পাশে দু'জন চুপচাপ।",
        environment: "নদীর পাড়, রাত",
        lighting: "চাঁদের আলো",
        camera_angle: "টু শট, পাশাপাশি",
        story_line: "দাদাভাই একটাই কথা বলেন — সবচেয়ে দরকারি কথা।",
        dialogue: "দাদাভাই: 'মা, পাখি যদি শুধু বাসায় থাকে, তাহলে আকাশ কে দেখবে? তুমি উড়তে পারো — উড়ে যাও। মাটির টান কখনো ছুটবে না।'",
        full_prompt: "elderly Bengali grandfather and young granddaughter sitting side by side on riverbank at night in moonlight, grandfather speaking wisdom softly, girl listening with emotional face, moonlight reflecting on quiet river, profound grandfather wisdom scene, 2D manhwa illustration, beautiful night blues and silver",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 666006, status: "draft",
      },
      {
        shot_number: 7,
        character: "ফুলমতি",
        shot_description: "ফুলমতি রিয়াকে বলছে 'যাও, আমি তোমার জন্য অপেক্ষা করব' — দু'জনের চোখে জল।",
        environment: "নদীর পাড়, রাত",
        lighting: "চাঁদের আলো",
        camera_angle: "ক্লোজ শট",
        story_line: "বন্ধুত্বের সবচেয়ে বড় পরীক্ষা — একজন চলে যাবে, একজন থাকবে।",
        dialogue: "ফুলমতি: 'Riya apa, jao। Amader jonno jao। Doctor hoye eso — ei gram-er jonno। Ami gaan gaitei thakbo, tumi ashar din porjonto।'",
        full_prompt: "two Bengali village best friends age 13 holding hands at night riverside, both with tears in eyes but smiling bravely, moonlight, one saying goodbye to the other, emotional bittersweet friendship farewell, 2D manhwa illustration, beautiful emotional scene",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 666007, status: "draft",
      },
      {
        shot_number: 8,
        character: "রিয়া",
        shot_description: "রিয়া সিদ্ধান্ত নিয়েছে — পরের দিন সকালে মাস্টার স্যারের কাছে গিয়ে form জমা দেবে।",
        environment: "ঘরের ভেতর, রাত",
        lighting: "কুপির আলো",
        camera_angle: "ক্লোজ শট, দৃঢ়তা",
        story_line: "সিদ্ধান্ত হয়েছে। এখন শুধু এগিয়ে যাওয়া।",
        dialogue: "রিয়া: (scholarship form-এর দিকে তাকিয়ে) Ami apply korbo। Ami jabo। Kintu fire ashbo। Promise — gram, tumi amake boro korso, ami tomake boro korte asbo।",
        full_prompt: "Bengali village girl age 13 sitting by oil lamp at night looking at scholarship application form with determined resolved expression, pen in hand about to fill it out, quiet confident decision-making moment, warm lamplight, 2D manhwa illustration, empowering scene",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 666008, status: "draft",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // EPISODE 7 — মাটির টানে ফিরি
  // ═══════════════════════════════════════════════════════════
  {
    title: "মাটির টানে ফিরি",
    description: "Scholarship পাওয়ার পর কয়েক বছর পর — রিয়া এখন medical student। সে গ্রামে ফিরে এসেছে, গ্রামের জন্য একটা free clinic করার স্বপ্ন নিয়ে।",
    shots: [
      {
        shot_number: 1,
        character: "রিয়া",
        shot_description: "রিয়া নৌকায় গ্রামে ফিরছে — এখন সে বড়, medical student। নদীর পাড় দেখে চোখে জল।",
        environment: "নদী, দুপুরের আলো",
        lighting: "উজ্জ্বল দুপুরের আলো",
        camera_angle: "ফ্রন্ট শট, নৌকায় দাঁড়ানো",
        story_line: "প্রত্যাবর্তন — কয়েক বছর পর রিয়া ফিরছে স্বপ্ন নিয়ে।",
        dialogue: "রিয়া: (মনে মনে) Gram... ami phire ashlam। Tomake je promise korsilam... shei din ashse।",
        full_prompt: "older Bengali girl now medical student age 16-17 standing in wooden boat returning to her village after years away, wearing simple salwar with stethoscope around neck, emotional homecoming expression as she sees beloved riverbanks, bright afternoon sunshine on river, 2D manhwa illustration, nostalgic homecoming mood",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 777001, status: "draft",
      },
      {
        shot_number: 2,
        character: "দাদাভাই",
        shot_description: "দাদাভাই নদীর পাড়ে অপেক্ষা করছেন — রিয়াকে দেখে এগিয়ে আসছেন, হাত বাড়িয়ে।",
        environment: "নদীর ঘাট, দুপুর",
        lighting: "দুপুরের আলো",
        camera_angle: "ওয়াইড শট",
        story_line: "দাদাভাই জানতেন রিয়া ফিরবে।",
        dialogue: "দাদাভাই: 'আমি জানতাম মা... আমি জানতাম তুমি আসবে। আলহামদুলিল্লাহ।'",
        full_prompt: "elderly Bengali grandfather age 75 with white beard waiting at river dock with arms outstretched as older granddaughter returns by boat, tears of joy on grandfather's face, emotional reunion embrace, bright river afternoon, 2D manhwa illustration, powerful reunion scene",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 777002, status: "draft",
      },
      {
        shot_number: 3,
        character: "ফুলমতি",
        shot_description: "ফুলমতি দৌড়ে আসছে — বড় হয়েছে, চোখে আনন্দের অশ্রু, দুই বান্ধবীর মিলন।",
        environment: "নদীর পাড়, দুপুর",
        lighting: "উজ্জ্বল আলো",
        camera_angle: "অ্যাকশন শট",
        story_line: "কতদিন পরে দুই বান্ধবীর মিলন।",
        dialogue: "ফুলমতি: 'Riya apa! Amar Riya apa phire ashsse! Ei nodi-r pani bole silo! Tumi ashbe!'",
        full_prompt: "older Bengali river girl age 16-17 running joyfully to embrace returning friend, both girls older now teenagers, emotional reunion with tears and laughter, riverbank afternoon light, years of separation ending in joyful embrace, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 777003, status: "draft",
      },
      {
        shot_number: 4,
        character: "নানু",
        shot_description: "নানু রিয়ার গলায় পরা stethoscope দেখে হাসছেন — এটাই তাঁর স্বপ্ন।",
        environment: "বাড়ির উঠান, বিকেল",
        lighting: "বিকেলের নরম আলো",
        camera_angle: "ক্লোজ শট",
        story_line: "নানুর মুখে এই হাসিটাই সবকিছুর পুরস্কার।",
        dialogue: "নানু: 'ওই stethoscope-টা দেখা। আমার ভেষজ, তোমার পড়াশোনা — দুইটা মিইলা গেছে। মা, এইবার গ্রামের মানুষের সেবা করো।'",
        full_prompt: "elderly Bengali herbalist grandmother touching young woman's stethoscope with reverent proud expression, granddaughter now medical student looking at grandmother with deep love, afternoon golden light, full circle of teaching and healing, 2D manhwa illustration, deeply moving scene",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 777004, status: "draft",
      },
      {
        shot_number: 5,
        character: "মাস্টার স্যার",
        shot_description: "মাস্টার স্যার রিয়াকে দেখে চশমা খুলে চোখ মুছছেন — এই ছাত্রী তাঁর সেরা গর্ব।",
        environment: "স্কুলের বারান্দা, বিকেল",
        lighting: "বিকেলের আলো",
        camera_angle: "মিড শট",
        story_line: "একজন শিক্ষকের সবচেয়ে বড় পুরস্কার।",
        dialogue: "Master sir: 'Riya... (chokh mochhen) ...tumi amake bohut kisher cheyeo boro kichu disle। তুমি বললে — shiksha kaj kore।'",
        full_prompt: "dedicated Bengali village teacher age 48 removing thick glasses to wipe emotional tears seeing his student return as medical student, student standing before him with grateful expression, village school background, deeply moving teacher-student reunion, 2D manhwa illustration",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 832, height: 1216, steps: 28, seed: 777005, status: "draft",
      },
      {
        shot_number: 6,
        character: "রিয়া",
        shot_description: "রিয়া গ্রামের মানুষদের সামনে বলছে — এখানে একটা free clinic করব।",
        environment: "গ্রামের মাঠ, সন্ধ্যা",
        lighting: "সন্ধ্যার সোনালি আলো",
        camera_angle: "ওয়াইড শট, সবার মাঝে রিয়া",
        story_line: "রিয়া তার স্বপ্নের কথা বলছে — গ্রামের জন্য, গ্রামবাসীর জন্য।",
        dialogue: "রিয়া: 'Ami ei gram-er meye। Ei gram amake doctor banaise। Ekhon ami ei gram-ke clinic debo — free-te, shobai-er jonno। Ei ami kore debo।'",
        full_prompt: "older Bengali medical student standing before gathered village community at sunset, speaking passionately about opening free clinic, villagers listening with proud and moved expressions, golden sunset light, community gathering scene, 2D manhwa illustration, inspiring community moment",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 777006, status: "draft",
      },
      {
        shot_number: 7,
        character: "দাদাভাই",
        shot_description: "দাদাভাই সবার সামনে রিয়ার মাথায় হাত রেখে দোয়া করছেন — চারপাশে গ্রামের সব মানুষ।",
        environment: "গ্রামের মাঠ, সন্ধ্যা",
        lighting: "সোনালি সন্ধ্যার আলো",
        camera_angle: "সিনেমাটিক ওয়াইড শট",
        story_line: "দাদাভাইয়ের আশীর্বাদে এই যাত্রার সমাপ্তি এবং নতুন শুরু।",
        dialogue: "দাদাভাই: 'আল্লাহ এই মেয়েকে আরো শক্তি দাও। ও আমার গ্রামের মেয়ে — ও তোমাদের মেয়ে।' (সবার চোখে জল)",
        full_prompt: "elderly Bengali grandfather age 75 placing both hands on granddaughter's head in blessing, surrounded by entire village community at golden sunset, deeply emotional communal blessing scene, tears of pride on many faces, beautiful golden warm light, cinematic wide shot, 2D manhwa illustration, epic emotional finale",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 777007, status: "draft",
      },
      {
        shot_number: 8,
        character: "রিয়া",
        shot_description: "চূড়ান্ত শট — রিয়া নদীর পাড়ে দাঁড়িয়ে দিগন্তের দিকে তাকিয়ে। পিছনে গ্রাম, সামনে স্বপ্ন।",
        environment: "নদীর পাড়, সন্ধ্যার শেষ আলো",
        lighting: "সুন্দর সূর্যাস্ত",
        camera_angle: "সিলুয়েট শট",
        story_line: "এই গ্রামই তার শিকড়। এই নদীই তার পরিচয়। সামনে অসীম আকাশ।",
        dialogue: "(ভয়েসওভার) মাটির টান বলতে কী বোঝায় — সেটা আমি বুঝি। টান মানে শুধু কষ্ট না। টান মানে শক্তি। এই মাটি আমার মা।",
        full_prompt: "silhouette of young Bengali woman standing at riverbank at beautiful sunset, looking towards glowing horizon, village and nature behind her, stethoscope visible at neck, figure of hope and determination against magnificent orange and gold sunset sky reflected in river, cinematic finale shot, 2D manhwa illustration, breathtaking finale",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 777008, status: "draft",
      },
      {
        shot_number: 9,
        character: "ফুলমতি",
        shot_description: "শেষ দৃশ্য — ফুলমতি নৌকায় গান গাইছে, রিয়া পাড়ে শুনছে। পূর্ণিমার রাত।",
        environment: "নদী, পূর্ণিমার রাত",
        lighting: "পূর্ণিমার চাঁদের আলো, নদীতে আলোর প্রতিফলন",
        camera_angle: "ওয়াইড শট, ড্রিমি",
        story_line: "এভাবেই শেষ হয় একটা অধ্যায়, শুরু হয় নতুন। নদী বয়েই যায়।",
        dialogue: "ফুলমতি: (গাইছে) 'আমার সোনার বাংলা... আমি তোমায় ভালোবাসি...' রিয়া: 'Fulfoti, tumi akdin boro singer hobe। Ami promise করলাম।'",
        full_prompt: "spirited Bengali river girl older now singing folk song in wooden boat on moonlit river, other girl sitting on riverbank listening with peaceful smile, full moon casting silver path on calm river, both girls now older teenagers, perfect peaceful ending scene, 2D manhwa illustration, magical moonlit river finale",
        negative_prompt: "ugly, deformed, bad anatomy, blurry, watermark, text, adult content",
        width: 1216, height: 832, steps: 28, seed: 777009, status: "draft",
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log("🌾 মাটির টানে — Seeding...\n");

  const cookie = await (async () => {
    console.log("🔐 Logging in...");
    const c = await login();
    console.log("   ✓ Authenticated\n");
    return c;
  })();

  // Create project
  console.log(`📁 Creating project: ${PROJECT_NAME}`);
  const project = await post<{ id: string }>(cookie, "/api/projects", {
    name: PROJECT_NAME,
    description: "একটি বাংলাদেশের গ্রামের মেয়ের স্বপ্ন আর সংগ্রামের গল্প — Banglish style, 7 চরিত্র, 7 episode, ৬৩ shot।",
    pipeline_model: process.env.COMFYUI_MODEL ?? null,
  });
  console.log(`   ✓ Project: ${project.id}\n`);

  // Create characters
  console.log(`👤 Creating ${CHARACTERS.length} characters...`);
  const charMap: Record<string, string> = {};
  for (const c of CHARACTERS) {
    const created = await post<{ id: string }>(cookie, `/api/projects/${project.id}/characters`, c);
    charMap[c.name] = created.id;
    console.log(`   ✓ ${c.name} (${c.role})`);
  }
  console.log();

  // Create episodes + shots
  let totalShots = 0;
  for (let ei = 0; ei < EPISODES.length; ei++) {
    const ep = EPISODES[ei];
    console.log(`📺 Episode ${ei + 1}: ${ep.title}`);
    const episode = await post<{ id: string }>(cookie, `/api/projects/${project.id}/episodes`, {
      title: ep.title,
      description: ep.description,
      episode_number: ei + 1,
    });
    console.log(`   ✓ Ep ${ei + 1} — ${episode.id}`);

    let created = 0;
    for (const shot of ep.shots) {
      await post(cookie, `/api/episodes/${episode.id}/shots`, shot);
      created++;
      process.stdout.write(`   Shot ${created}/${ep.shots.length}   `);
    }
    totalShots += created;
    console.log(`\n   ✓ ${created} shots created\n`);
  }

  console.log("✅ Done!\n");
  console.log(`   প্রজেক্ট  : ${PROJECT_NAME}`);
  console.log(`   চরিত্র   : ${CHARACTERS.length}`);
  console.log(`   এপিসোড   : ${EPISODES.length}`);
  console.log(`   মোট শট   : ${totalShots}`);
  console.log(`\n   👉 http://localhost:3000/projects/${project.id}`);
}

main().catch(e => { console.error(e); process.exit(1); });
