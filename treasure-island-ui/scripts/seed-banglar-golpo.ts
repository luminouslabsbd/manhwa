/**
 * Seed: গ্রামের বাংলার গল্প — Village Bangladesh Story
 * Run: npx tsx scripts/seed-banglar-golpo.ts
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

// ──────────────────────────────────────────────
// PROJECT
// ──────────────────────────────────────────────
const PROJECT_NAME = "গ্রামের বাংলার গল্প";

// ──────────────────────────────────────────────
// CHARACTERS
// ──────────────────────────────────────────────
const CHARACTERS = [
  {
    name: "রাহেলা",
    role: "নায়িকা",
    description: "একটি সাহসী ও বুদ্ধিমান গ্রামের মেয়ে, বয়স ১৪, যে তার গ্রামকে ভালোবাসে এবং সবসময় সত্যের পক্ষে থাকে।",
    appearance: "Bengali village girl age 14, long dark hair in two braids, bright curious eyes, warm brown skin, wearing colorful salwar kameez in red and yellow, bare feet, cheerful determined expression, 2D cartoon illustration, soft warm colors",
    reference_prompt: "Bengali village girl with braided dark hair, bright curious eyes, colorful red yellow salwar kameez, warm smile, determined expression, 2D cartoon illustration, rural Bangladesh setting",
  },
  {
    name: "কবির দাদু",
    role: "দাদু / জ্ঞানী বৃদ্ধ",
    description: "রাহেলার দাদু, বয়স ৭০, একজন সহৃদয় এবং জ্ঞানী বৃদ্ধ যিনি গ্রামের গল্প ও ইতিহাস জানেন।",
    appearance: "elderly Bengali grandfather age 70, white dhoti and white kurta, white beard and mustache, kind warm eyes with wrinkles, lungi wrapped at waist, traditional village elder appearance, 2D cartoon illustration, warm earthy colors",
    reference_prompt: "wise elderly Bengali grandfather, white beard, traditional white kurta and lungi, kind warm eyes, sitting posture, village elder, 2D cartoon illustration",
  },
  {
    name: "তোতা",
    role: "বন্ধু",
    description: "রাহেলার দুষ্টু ও মজাদার বন্ধু, বয়স ১৩, সবসময় হাসিখুশি এবং অ্যাডভেঞ্চার করতে ভালোবাসে।",
    appearance: "Bengali village boy age 13, short messy black hair, mischievous grin, dark skin, wearing torn shorts and white undershirt, barefoot, energetic playful pose, 2D cartoon illustration",
    reference_prompt: "playful Bengali village boy, messy black hair, mischievous grin, simple village clothes, barefoot, energetic pose, 2D cartoon illustration, warm rural colors",
  },
  {
    name: "মা (সুফিয়া)",
    role: "মা",
    description: "রাহেলার মা, একজন পরিশ্রমী ও মায়াবী গ্রামীণ মহিলা যিনি পরিবারকে আগলে রাখেন।",
    appearance: "Bengali village mother age 35, wearing cotton saree in green and white, hair tied in a bun, gentle warm eyes, soft smile, hands showing hardwork, traditional Bengali appearance, 2D cartoon illustration",
    reference_prompt: "Bengali village mother, green white cotton saree, bun hairstyle, gentle warm expression, traditional Bangladesh village woman, 2D cartoon illustration",
  },
  {
    name: "শিক্ষক মশাই",
    role: "শিক্ষক",
    description: "গ্রামের একমাত্র স্কুলের শিক্ষক, বয়স ৪৫, কঠোর কিন্তু মনে মনে ছাত্রছাত্রীদের অনেক ভালোবাসেন।",
    appearance: "Bengali village school teacher age 45, wearing white panjabi and dark trousers, round glasses, neat combed hair, stern but kind face, holding a book or chalk, 2D cartoon illustration",
    reference_prompt: "strict but kind Bengali village school teacher, white panjabi, round glasses, book in hand, neat appearance, 2D cartoon illustration",
  },
];

// ──────────────────────────────────────────────
// EPISODES
// ──────────────────────────────────────────────
const EPISODES = [
  {
    title: "পাখির বাসা",
    summary: "রাহেলা একটি আহত পাখি খুঁজে পায় এবং তাকে সুস্থ করার জন্য মরিয়া হয়ে পড়ে। দাদু তাকে শেখান যে ভালোবাসা ও যত্নই সেরা ওষুধ।",
    shots: [
      {
        shot_description: "রাহেলা ভোরবেলা আমগাছের নিচে একটি আহত ছোট পাখি পড়ে থাকতে দেখে",
        character: "রাহেলা",
        environment: "সকালের আলোয় গ্রামের আমবাগান, শিশিরভেজা ঘাস",
        lighting: "নরম সকালের সোনালী আলো",
        camera_angle: "মিডিয়াম শট — রাহেলার দৃষ্টিকোণ থেকে",
        story_line: "রাহেলা ভোরবেলা বাগানে যায় এবং আহত পাখি দেখে তার মন খারাপ হয়ে যায়",
        dialogue: "আরে! ছোট্ট পাখিটা পড়ে আছে কেন?",
        full_prompt: "Bengali village girl Rahela in colorful salwar kameez bending down to look at a small injured bird on the grass under a mango tree, soft golden morning light filtering through leaves, dewy grass, 2D cartoon illustration Bangladesh village setting, warm morning colors",
      },
      {
        shot_description: "রাহেলা সাবধানে পাখিটিকে দুই হাতে তুলে নেয়, পাখিটি ভয়ে কাঁপছে",
        character: "রাহেলা",
        environment: "আমবাগান, সকালের আলো",
        lighting: "উষ্ণ সোনালী সকালের আলো",
        camera_angle: "ক্লোজ-আপ — হাতে পাখি",
        story_line: "রাহেলা পাখিটিকে আলতো করে তুলে নেয়",
        dialogue: "ভয় পেও না, আমি তোমাকে কিছু করব না।",
        full_prompt: "close-up of Bengali village girl's hands gently holding a small trembling injured bird, warm golden morning light, 2D cartoon illustration, soft tender moment, detailed hands",
      },
      {
        shot_description: "রাহেলা দৌড়ে দাদুর কাছে যায়, দাদু উঠানে বসে হুক্কা টানছেন",
        character: "রাহেলা, কবির দাদু",
        environment: "গ্রামের বাড়ির উঠান, মাটির দাওয়া, বড় নিমগাছ",
        lighting: "সকালের নরম আলো",
        camera_angle: "ওয়াইড শট",
        story_line: "রাহেলা দাদুর সাহায্য চায়",
        dialogue: "দাদু! দাদু! এই পাখিটাকে দেখো, পাখাটা ভেঙে গেছে!",
        full_prompt: "Bengali village girl running urgently to her grandfather who sits on earthen veranda smoking hookah under a neem tree, village courtyard setting, morning light, 2D cartoon illustration, warm earthy tones",
      },
      {
        shot_description: "দাদু তার কোঁচড় থেকে কাপড়ের টুকরো বের করে পাখির পাখায় পট্টি বাঁধেন",
        character: "কবির দাদু, রাহেলা",
        environment: "দাওয়া, উঠান",
        lighting: "সকালের আলো",
        camera_angle: "মিডিয়াম ক্লোজ-আপ",
        story_line: "দাদু পাখিটির চিকিৎসা করেন এবং রাহেলাকে শেখান",
        dialogue: "দেখো মা, যত্নই হলো সেরা ওষুধ। ধৈর্য ধরো।",
        full_prompt: "wise elderly Bengali grandfather carefully bandaging a small bird's wing with cloth while granddaughter watches intently, village veranda setting, gentle morning light, 2D cartoon illustration, tender caring moment",
      },
      {
        shot_description: "রাহেলা একটি ছোট কাঠের বাক্সে নরম ঘাস বিছিয়ে পাখির বিছানা তৈরি করছে",
        character: "রাহেলা",
        environment: "ঘরের ভেতর, খড়ের ছাদের ঘর",
        lighting: "জানালা দিয়ে আসা নরম আলো",
        camera_angle: "মিডিয়াম শট",
        story_line: "রাহেলা পাখির জন্য বাসা তৈরি করে",
        full_prompt: "Bengali village girl carefully arranging soft grass inside a small wooden box to make a nest for injured bird, thatched roof village home interior, soft window light, 2D cartoon illustration, cozy warm atmosphere",
      },
      {
        shot_description: "কয়েকদিন পর — পাখিটি সুস্থ হয়ে রাহেলার হাতের ওপর বসে আছে এবং ডাকছে",
        character: "রাহেলা",
        environment: "বাড়ির উঠান, রোদেলা দিন",
        lighting: "উজ্জ্বল দুপুরের রোদ",
        camera_angle: "মিডিয়াম শট",
        story_line: "পাখিটি সুস্থ হয়ে ওঠে — রাহেলার যত্নের ফল",
        dialogue: "দেখো দাদু! পাখিটা উড়তে পারছে!",
        full_prompt: "Bengali village girl Rahela with a now-healed small bird perched happily on her outstretched hand, bright sunny village courtyard, joyful expression, 2D cartoon illustration, warm happy colors",
      },
      {
        shot_description: "পাখিটি আকাশে উড়ে যায়, রাহেলা হাসিমুখে তাকিয়ে থাকে, দাদু পাশে দাঁড়িয়ে হাসছেন",
        character: "রাহেলা, কবির দাদু",
        environment: "উঠান, নীল আকাশ, সবুজ মাঠ",
        lighting: "উজ্জ্বল দুপুরের আলো",
        camera_angle: "ওয়াইড শট — আকাশমুখী",
        story_line: "পাখিটি মুক্ত হয়ে উড়ে যায় — ভালোবাসার পুরস্কার",
        dialogue: "যাও পাখি, মুক্ত আকাশে উড়ে যাও।",
        full_prompt: "small bird flying free into bright blue sky while Bengali village girl and her grandfather watch happily from village courtyard, green fields in background, bright afternoon light, 2D cartoon illustration, joyful emotional moment, warm vivid colors",
      },
    ],
  },
  {
    title: "বর্ষার দিনে",
    summary: "মৌসুমী বৃষ্টিতে গ্রাম ডুবে যাওয়ার আশঙ্কায় রাহেলা ও তোতা মিলে গ্রামবাসীদের সতর্ক করতে বেরিয়ে পড়ে।",
    shots: [
      {
        shot_description: "ঘন কালো মেঘ আসছে, রাহেলা আকাশের দিকে তাকিয়ে আছে, মাঠে ধান কাটার কাজ চলছে",
        character: "রাহেলা",
        environment: "সবুজ ধানক্ষেত, দিগন্তে কালো মেঘ",
        lighting: "ঝড়ের আগের অন্ধকার আলো, হলুদাভ আকাশ",
        camera_angle: "ওয়াইড শট",
        story_line: "ঝড় আসছে — রাহেলা প্রথম বিপদ টের পায়",
        dialogue: "তোতা! দেখ, কেমন কালো মেঘ আসছে!",
        full_prompt: "Bengali village girl Rahela looking up at ominous dark storm clouds approaching over green rice fields, dramatic pre-storm yellow sky, farmers working in background, 2D cartoon illustration, tension and drama",
      },
      {
        shot_description: "মুষলধারে বৃষ্টি শুরু হয়েছে, রাহেলা ও তোতা একটি গাছের নিচে আশ্রয় নিয়েছে",
        character: "রাহেলা, তোতা",
        environment: "বড় বট গাছের নিচে, মুষলধারে বৃষ্টি, কাদাভরা রাস্তা",
        lighting: "ঝড়ের ধূসর আলো, বিজলি চমকানো",
        camera_angle: "মিডিয়াম শট",
        story_line: "বৃষ্টিতে আটকে পড়ে দুই বন্ধু পরিকল্পনা করে",
        dialogue: "নদীর পানি বাড়লে নিচু গ্রামগুলো ডুবে যাবে। আমাদের সবাইকে সতর্ক করতে হবে!",
        full_prompt: "Bengali village girl Rahela and her friend Tota sheltering under a large banyan tree in heavy monsoon rain, muddy village road, lightning in dark stormy sky, urgent planning expression, 2D cartoon illustration, dramatic monsoon atmosphere",
      },
      {
        shot_description: "রাহেলা বৃষ্টির মধ্যে দৌড়ে শিক্ষক মশাইয়ের বাড়িতে যাচ্ছে",
        character: "রাহেলা",
        environment: "বৃষ্টিভেজা গ্রামের রাস্তা, কাদাপানি ছিটকে যাচ্ছে",
        lighting: "ঝড়ের আলো, বৃষ্টির মধ্যে",
        camera_angle: "মিডিয়াম শট",
        story_line: "রাহেলা বৃষ্টি উপেক্ষা করে সাহায্যের জন্য ছুটছে",
        full_prompt: "Bengali village girl Rahela running through heavy monsoon rain on muddy village path, splashing water, determined urgent expression, rain soaked clothes, dramatic storm lighting, 2D cartoon illustration, motion and urgency",
      },
      {
        shot_description: "শিক্ষক মশাই রাহেলার কথা শুনে মাইক নিয়ে গ্রামবাসীদের ডাকছেন",
        character: "শিক্ষক মশাই",
        environment: "গ্রামের মসজিদের সামনে, বৃষ্টি",
        lighting: "ঝড়ের আলো",
        camera_angle: "মিডিয়াম শট",
        story_line: "শিক্ষক মশাই সবাইকে সতর্ক করেন",
        dialogue: "সকলের দৃষ্টি আকর্ষণ করছি — নদীর পানি বাড়ছে! সবাই উঁচু জায়গায় সরে যান!",
        full_prompt: "Bengali village school teacher with megaphone announcing warning to villagers in front of mosque in heavy rain, urgent authoritative expression, villagers listening and responding, 2D cartoon illustration, dramatic monsoon scene",
      },
      {
        shot_description: "গ্রামবাসীরা তাদের গরু-ছাগল, মালপত্র নিয়ে উঁচু জায়গায় সরে যাচ্ছে",
        character: "মা (সুফিয়া)",
        environment: "গ্রামের রাস্তা, বন্যার পানি আসছে",
        lighting: "ঝড়ের আলো, বৃষ্টি কমছে",
        camera_angle: "ওয়াইড শট",
        story_line: "গ্রামবাসী নিরাপদে সরে যায়",
        full_prompt: "Bengali villagers evacuating with cattle and belongings to higher ground as floodwater rises on village road, dramatic but hopeful atmosphere, 2D cartoon illustration, community resilience",
      },
      {
        shot_description: "বৃষ্টি থেমেছে, রাহেলা ও তোতা কাদায় মাখা হয়ে হাসছে, দাদু মাথায় হাত বুলিয়ে দিচ্ছেন",
        character: "রাহেলা, তোতা, কবির দাদু",
        environment: "বন্যার পর স্কুলের উঁচু মাঠ, সূর্য উঠছে",
        lighting: "বর্ষা-পরবর্তী সোনালী সূর্যোদয়",
        camera_angle: "মিডিয়াম শট",
        story_line: "বিপদ কেটে যায় — সাহস ও দলগত কাজের ফল",
        dialogue: "তোমরা দুজন আজকে পুরো গ্রামকে বাঁচিয়েছ।",
        full_prompt: "Bengali village girl Rahela and boy Tota covered in mud laughing joyfully while proud grandfather pats their heads, golden sunrise after monsoon storm, school grounds, 2D cartoon illustration, warm emotional resolution",
      },
    ],
  },
  {
    title: "পাঠশালার স্বপ্ন",
    summary: "রাহেলা জানতে পারে তাদের গ্রামের স্কুলটি বন্ধ হয়ে যাবে। সে সবাইকে একত্রিত করে স্কুলটি বাঁচানোর জন্য লড়াই করে।",
    shots: [
      {
        shot_description: "শিক্ষক মশাই দুঃখভারাক্রান্ত মুখে ক্লাসরুমে ঘোষণা দিচ্ছেন",
        character: "শিক্ষক মশাই",
        environment: "গ্রামের পুরনো স্কুলের ক্লাসরুম, কাদামাটির দেয়াল, শ্লেটে লেখা",
        lighting: "জানালা দিয়ে আসা বিকেলের আলো",
        camera_angle: "মিডিয়াম শট",
        story_line: "স্কুল বন্ধের দুঃসংবাদ",
        dialogue: "আমাদের স্কুলের জন্য আর ফান্ড নেই। আগামী মাস থেকে পাঠশালা বন্ধ হয়ে যাবে।",
        full_prompt: "Bengali village school teacher with sad expression announcing bad news to classroom of children, old village school with clay walls and chalkboard, afternoon light through windows, shocked children faces, 2D cartoon illustration",
      },
      {
        shot_description: "রাহেলা একা স্কুলের পুরনো বটগাছের নিচে মাথা নিচু করে বসে আছে",
        character: "রাহেলা",
        environment: "স্কুলের উঠান, পুরনো বটগাছ",
        lighting: "বিকেলের মলিন আলো",
        camera_angle: "মিডিয়াম শট",
        story_line: "রাহেলা চিন্তায় পড়ে যায়",
        dialogue: "না... আমি এই স্কুল বন্ধ হতে দেব না।",
        full_prompt: "Bengali village girl Rahela sitting alone under old banyan tree in school yard, head down in thought, sad but determined expression, evening light casting long shadows, 2D cartoon illustration, contemplative mood",
      },
      {
        shot_description: "রাহেলা তোতাকে নিয়ে গ্রামের প্রতিটি বাড়িতে যাচ্ছে এবং দরজায় কড়া নাড়ছে",
        character: "রাহেলা, তোতা",
        environment: "গ্রামের মেঠো পথ, বিভিন্ন মাটির বাড়ি",
        lighting: "সকালের উজ্জ্বল আলো",
        camera_angle: "মিডিয়াম ওয়াইড শট",
        story_line: "রাহেলা গ্রামবাসীদের একত্রিত করতে বেরিয়ে পড়ে",
        dialogue: "কাকা, আমাদের স্কুলটা বাঁচাতে হবে। আপনি কি সাহায্য করবেন?",
        full_prompt: "Bengali village girl Rahela and boy Tota going door to door in village, knocking on clay house doors, earnest pleading expressions, morning light on village path, 2D cartoon illustration, community appeal scene",
      },
      {
        shot_description: "গ্রামের মাঠে সন্ধ্যায় গ্রামসভা বসেছে, সবাই মাটিতে বসে আছে, হ্যারিকেন জ্বলছে",
        character: "রাহেলা, কবির দাদু, শিক্ষক মশাই",
        environment: "গ্রামের খোলা মাঠ, সন্ধ্যার আকাশ, হ্যারিকেন লণ্ঠন",
        lighting: "হ্যারিকেনের উষ্ণ কমলা আলো, সন্ধ্যার নীল আকাশ",
        camera_angle: "ওয়াইড শট",
        story_line: "গ্রামসভায় সমস্যার সমাধান খোঁজা হচ্ছে",
        full_prompt: "Bengali village gathering at dusk in open field, people sitting on ground, hurricane lanterns glowing warm orange light, village girl Rahela standing to speak, twilight blue sky, 2D cartoon illustration, community meeting atmosphere",
      },
      {
        shot_description: "রাহেলা দাঁড়িয়ে গ্রামবাসীদের সামনে ভাষণ দিচ্ছে, সবাই মনোযোগ দিয়ে শুনছে",
        character: "রাহেলা",
        environment: "গ্রামসভার মাঠ, হ্যারিকেনের আলো",
        lighting: "হ্যারিকেনের নাটকীয় আলো",
        camera_angle: "মিডিয়াম শট — রাহেলার দিক থেকে",
        story_line: "রাহেলার অনুপ্রেরণামূলক বক্তৃতা",
        dialogue: "আমাদের স্কুল না থাকলে আমাদের ছেলেমেয়েরা কোথায় পড়বে? আমরা সবাই মিলে একটু একটু করে চাঁদা দিলেই স্কুল চলবে!",
        full_prompt: "young Bengali village girl Rahela standing and speaking passionately to attentive crowd of villagers by lantern light, confident voice raised, crowd listening intently, 2D cartoon illustration, inspirational speech moment, dramatic warm lighting",
      },
      {
        shot_description: "গ্রামবাসীরা একে একে চাঁদার টাকা দিচ্ছে — কেউ কাগজের নোট, কেউ মুঠো মুঠো পয়সা",
        character: "মা (সুফিয়া)",
        environment: "গ্রামসভার মাঠ",
        lighting: "হ্যারিকেনের উষ্ণ আলো",
        camera_angle: "ক্লোজ-আপ সিরিজ — বিভিন্ন হাত থেকে টাকা দেওয়া",
        story_line: "গ্রামবাসী একতাবদ্ধ হয়ে স্কুল বাঁচায়",
        full_prompt: "close-up montage of different villager hands contributing money — paper notes, coins — to save the village school, warm lantern light, 2D cartoon illustration, unity and generosity",
      },
      {
        shot_description: "নতুন সকাল — স্কুলের গেটে নতুন সাইনবোর্ড লাগানো হচ্ছে, রাহেলা ও তোতা হাততালি দিচ্ছে",
        character: "রাহেলা, তোতা, শিক্ষক মশাই",
        environment: "গ্রামের স্কুলের গেট, ফুল দিয়ে সাজানো",
        lighting: "উজ্জ্বল সকালের আলো",
        camera_angle: "ওয়াইড শট",
        story_line: "স্কুল বেঁচে যায় — উদযাপন",
        dialogue: "আমাদের স্কুল চলবেই চলবে!",
        full_prompt: "Bengali village school gate decorated with flowers, new signboard being put up, village girl Rahela and boy Tota clapping joyfully, teacher smiling proudly, bright morning light, 2D cartoon illustration, celebration and victory",
      },
    ],
  },
  {
    title: "নদীর কান্না",
    summary: "গ্রামের পাশের নদীতে কারখানার দূষণ ছড়িয়ে পড়ছে। রাহেলা পরিবেশ রক্ষায় সচেতনতা তৈরি করতে উদ্যোগ নেয়।",
    shots: [
      {
        shot_description: "রাহেলা নদীর পাড়ে গিয়ে দেখে পানি কালো হয়ে গেছে, মরা মাছ ভাসছে",
        character: "রাহেলা",
        environment: "গ্রামের নদীর পাড়, দূষিত কালো পানি",
        lighting: "সকালের আলো, নদীর ধোঁয়াটে পরিবেশ",
        camera_angle: "ওয়াইড শট",
        story_line: "নদী দূষণের ভয়াবহ চিত্র",
        dialogue: "এই কী হয়েছে নদীর? এত মাছ মরে যাচ্ছে কেন?",
        full_prompt: "Bengali village girl Rahela standing horrified at riverbank seeing black polluted water with dead fish floating, industrial pollution visible upstream, 2D cartoon illustration, environmental crisis, sad and alarming atmosphere",
      },
      {
        shot_description: "মাছধরা নৌকায় জেলেরা খালি হাতে ফিরছে, মুখে হতাশা",
        character: "তোতা",
        environment: "নদীর ঘাট, জেলেদের নৌকা",
        lighting: "বিকেলের আলো",
        camera_angle: "মিডিয়াম শট",
        story_line: "নদী দূষণে জেলেদের জীবিকা ধ্বংস হচ্ছে",
        dialogue: "তিন দিন ধরে একটাও মাছ পাচ্ছি না। ছেলেপেলে না খেয়ে আছে।",
        full_prompt: "sad Bengali fishermen returning to river dock with empty boats and no fish catch, polluted river, dejected expressions, afternoon light, 2D cartoon illustration, social impact of pollution",
      },
      {
        shot_description: "দাদু রাহেলাকে বলছেন এই নদীতে কীভাবে তাঁরা ছোটবেলায় সাঁতার কাটতেন",
        character: "কবির দাদু, রাহেলা",
        environment: "নদীর পাড়, বিকেল",
        lighting: "বিকেলের সোনালী আলো",
        camera_angle: "মিডিয়াম টু-শট",
        story_line: "দাদুর স্মৃতিতে স্বচ্ছ নদীর কথা — অনুপ্রেরণা",
        dialogue: "এই নদীতে একসময় এত টলটলে পানি ছিল যে তলা দেখা যেত। আমরা মাছ ধরতাম, সাঁতার কাটতাম।",
        full_prompt: "wise Bengali grandfather sitting with granddaughter Rahela at polluted riverbank, nostalgic expression, pointing to river while remembering better times, golden afternoon light, 2D cartoon illustration, contrast of past and present",
      },
      {
        shot_description: "রাহেলা স্কুলে পোস্টার বানাচ্ছে — 'নদী বাঁচাও, জীবন বাঁচাও'",
        character: "রাহেলা, তোতা",
        environment: "স্কুলের ক্লাসরুম, টেবিলে রং-তুলি",
        lighting: "দিনের উজ্জ্বল আলো",
        camera_angle: "মিডিয়াম শট",
        story_line: "রাহেলা পরিবেশ সচেতনতার প্রচারণা শুরু করে",
        dialogue: "আমরা পোস্টার লাগাব, মিছিল করব। নদী দূষণ বন্ধ করতেই হবে!",
        full_prompt: "Bengali village girl Rahela and boy Tota making protest posters with Bangla text 'নদী বাঁচাও' (Save the River), colorful paints on school desk, determined excited expressions, 2D cartoon illustration",
      },
      {
        shot_description: "শিশুরা দল বেঁধে নদীর পাড়ে মিছিল করছে, পোস্টার হাতে",
        character: "রাহেলা, তোতা",
        environment: "নদীর পাড়ের রাস্তা, গ্রামবাসী দেখছে",
        lighting: "সকালের উজ্জ্বল আলো",
        camera_angle: "ওয়াইড শট",
        story_line: "শিশুদের পরিবেশ রক্ষার মিছিল",
        dialogue: "নদী দূষণ বন্ধ করো! নদী বাঁচাও, বাংলাদেশ বাঁচাও!",
        full_prompt: "group of Bengali village children marching along riverbank with Bangla protest posters demanding clean river, villagers watching and joining, bright morning light, 2D cartoon illustration, energetic protest march, hopeful atmosphere",
      },
      {
        shot_description: "কারখানার মালিক শেষপর্যন্ত পরিবেশ বিভাগের লোকদের সাথে বৈঠকে বসতে রাজি হন",
        character: "শিক্ষক মশাই",
        environment: "ইউনিয়ন পরিষদের অফিস",
        lighting: "ইন্টেরিয়র অফিস আলো",
        camera_angle: "মিডিয়াম শট",
        story_line: "পদক্ষেপ নেওয়া শুরু হয়",
        dialogue: "শিশুদের সাহস দেখে আমি লজ্জিত। আমরা ব্যবস্থা নেব।",
        full_prompt: "factory owner and officials in meeting at Union Parishad office, officials looking serious and ashamed, children's posters visible outside window, 2D cartoon illustration",
      },
      {
        shot_description: "কিছুদিন পর নদীর পানি আবার পরিষ্কার হতে শুরু করেছে, রাহেলা নদীতে হাত দিয়ে দেখছে",
        character: "রাহেলা",
        environment: "নদীর পাড়, পরিষ্কার পানি ফিরে আসছে",
        lighting: "সোনালী সকালের আলো",
        camera_angle: "ক্লোজ-আপ থেকে ওয়াইড",
        story_line: "পরিবেশ রক্ষায় সাফল্য — আশার আলো",
        dialogue: "দেখো দাদু! পানি আবার পরিষ্কার হচ্ছে!",
        full_prompt: "Bengali village girl Rahela touching cleaner river water with joy, small fish visible in the water again, golden morning light reflecting on river surface, hopeful expression, 2D cartoon illustration, environmental recovery, warm optimistic colors",
      },
    ],
  },
  {
    title: "ঈদের আনন্দ",
    summary: "ঈদ আসছে কিন্তু রাহেলার পরিবারের টাকা নেই। রাহেলা নিজের উদ্যোগে গ্রামের সবার জন্য আনন্দ তৈরি করে।",
    shots: [
      {
        shot_description: "বাজারে ঈদের কেনাকাটা চলছে, রাহেলা দোকানের সামনে দাঁড়িয়ে জামা দেখছে কিন্তু কিনতে পারছে না",
        character: "রাহেলা",
        environment: "গ্রামের বাজার, ঈদের রঙিন পোশাকের দোকান",
        lighting: "দিনের উজ্জ্বল আলো",
        camera_angle: "মিডিয়াম শট",
        story_line: "রাহেলার পরিবারের আর্থিক কষ্ট",
        full_prompt: "Bengali village girl Rahela looking longingly at colorful Eid clothes in village market shop, unable to afford them, other children buying happily, 2D cartoon illustration, bittersweet moment",
      },
      {
        shot_description: "মা রাহেলাকে বুকে জড়িয়ে ধরে বলছেন এবারের ঈদে নতুন জামা হবে না",
        character: "রাহেলা, মা (সুফিয়া)",
        environment: "ঘরের ভেতর, সন্ধ্যার হ্যারিকেনের আলো",
        lighting: "নরম হ্যারিকেনের আলো",
        camera_angle: "মিডিয়াম ক্লোজ-আপ",
        story_line: "মায়ের সাথে কথা — দারিদ্র্যের মুখেও ভালোবাসা",
        dialogue: "মা, ঈদ মানে শুধু নতুন জামা না। ঈদ মানে আনন্দ ভাগ করে নেওয়া।",
        full_prompt: "Bengali village mother hugging her daughter Rahela tenderly inside humble home with hurricane lamp light, both sad but loving expression, 2D cartoon illustration, warm intimate family moment",
      },
      {
        shot_description: "রাহেলা পুরনো জামা থেকে সুন্দর করে কাটছাঁট করে নতুন ডিজাইন বানাচ্ছে",
        character: "রাহেলা",
        environment: "বাড়ির উঠান, সুই-সুতা-কাঁচি নিয়ে কাজ",
        lighting: "সকালের আলো",
        camera_angle: "ক্লোজ-আপ — হাতের কাজ",
        story_line: "সৃজনশীলতায় নতুন জামা তৈরি",
        full_prompt: "Bengali village girl Rahela creatively redesigning old clothes with needle thread and scissors in village courtyard, creative focused expression, morning light, 2D cartoon illustration, resourcefulness and creativity",
      },
      {
        shot_description: "ঈদের দিন সকাল — গ্রামের মসজিদ থেকে মানুষ বের হচ্ছে, সবাই খুশি",
        character: "কবির দাদু",
        environment: "গ্রামের মসজিদের সামনে, ঈদের সকাল",
        lighting: "উজ্জ্বল সকালের আলো",
        camera_angle: "ওয়াইড শট",
        story_line: "ঈদের সকালের আনন্দময় পরিবেশ",
        dialogue: "ঈদ মোবারক! আল্লাহ সবাইকে ভালো রাখুন।",
        full_prompt: "joyful villagers coming out of village mosque on Eid morning, everyone in festive clothes, elderly grandfather with open arms greeting, bright sunny Eid morning, 2D cartoon illustration, festive celebration Bangladesh village",
      },
      {
        shot_description: "রাহেলা তার নিজে বানানো সুন্দর জামা পরে দাদুর কোলে মাথা রেখে হাসছে",
        character: "রাহেলা, কবির দাদু",
        environment: "বাড়ির উঠান, ঈদের দিন",
        lighting: "উজ্জ্বল আনন্দের আলো",
        camera_angle: "মিডিয়াম শট",
        story_line: "নিজের তৈরি জামায় রাহেলার আনন্দ",
        dialogue: "দাদু, আমি নিজেই বানিয়েছি! সুন্দর হয়েছে না?",
        full_prompt: "Bengali village girl Rahela in self-made beautiful clothes leaning happily on grandfather's lap in festive Eid day, grandfather praising and laughing, village courtyard, bright joyful Eid light, 2D cartoon illustration, heartwarming family moment",
      },
      {
        shot_description: "রাহেলা গরিব পাড়ার শিশুদের কাছে সেমাই ও মিষ্টি নিয়ে যাচ্ছে",
        character: "রাহেলা",
        environment: "গ্রামের গলি, ছোট ছোট বাচ্চারা",
        lighting: "দুপুরের আলো",
        camera_angle: "মিডিয়াম শট",
        story_line: "ভাগ করে নেওয়ার আনন্দ — সত্যিকারের ঈদ",
        dialogue: "ঈদ মোবারক! এসো সবাই মিলে ভাগ করে খাই।",
        full_prompt: "Bengali village girl Rahela sharing semai and sweets with poor neighborhood children on Eid day, children's delighted faces, narrow village alley, warm afternoon Eid light, 2D cartoon illustration, generosity and sharing",
      },
      {
        shot_description: "সন্ধ্যায় পুরো গ্রাম একসাথে বসে ঈদের মজলিস করছে, রাহেলা মাঝখানে হাসছে",
        character: "রাহেলা, কবির দাদু, মা (সুফিয়া), তোতা",
        environment: "গ্রামের খোলা মাঠ, সন্ধ্যার আলো, প্রদীপ জ্বলছে",
        lighting: "সন্ধ্যার কমলা আলো, প্রদীপের উষ্ণ আলো",
        camera_angle: "ওয়াইড শট",
        story_line: "সম্প্রীতি ও ভালোবাসায় পূর্ণ ঈদের সন্ধ্যা",
        dialogue: "এই হলো আসল ঈদ — সবাই মিলে একসাথে।",
        full_prompt: "entire Bengali village community sitting together in open field on Eid evening with oil lamps, Rahela smiling in the center surrounded by family and friends, warm orange sunset light mixed with lamp glow, 2D cartoon illustration, community harmony and Eid celebration",
      },
    ],
  },
];

// ──────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────
async function main() {
  console.log("🌿 গ্রামের বাংলার গল্প — Seeding...\n");

  console.log("🔐 Logging in...");
  const cookie = await login();
  console.log("   ✓ Authenticated\n");

  console.log(`📁 Creating project: ${PROJECT_NAME}`);
  const project = await post<{ id: string }>(cookie, "/api/projects", { name: PROJECT_NAME });
  console.log(`   ✓ Project: ${project.id}\n`);

  console.log(`👤 Creating ${CHARACTERS.length} characters...`);
  for (const c of CHARACTERS) {
    await post(cookie, `/api/projects/${project.id}/characters`, c);
    console.log(`   ✓ ${c.name} (${c.role})`);
  }
  console.log();

  for (const ep of EPISODES) {
    console.log(`📺 Episode: ${ep.title}`);
    const episode = await post<{ id: string; number: number }>(cookie, `/api/projects/${project.id}/episodes`, {
      title: ep.title, summary: ep.summary,
    });
    console.log(`   ✓ Ep ${episode.number} — ${episode.id}`);

    for (let i = 0; i < ep.shots.length; i++) {
      await post(cookie, `/api/episodes/${episode.id}/shots`, ep.shots[i]);
      process.stdout.write(`   Shot ${i + 1}/${ep.shots.length}\r`);
    }
    console.log(`   ✓ ${ep.shots.length} shots created\n`);
  }

  const totalShots = EPISODES.reduce((n, e) => n + e.shots.length, 0);
  console.log("✅ Done!");
  console.log(`   প্রজেক্ট  : ${PROJECT_NAME}`);
  console.log(`   চরিত্র   : ${CHARACTERS.length}`);
  console.log(`   এপিসোড   : ${EPISODES.length}`);
  console.log(`   মোট শট   : ${totalShots}`);
  console.log(`\n   👉 http://localhost:3000/projects/${project.id}`);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
