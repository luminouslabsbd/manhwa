/**
 * Seed: বকুলের হাসি — The Gap-Toothed Village Pagli
 * Banglish gram Bangla story about an eccentric girl who is secretly wise
 * 7 characters · 6 episodes · 54 shots
 * Run: npx tsx scripts/seed-bokul-pagli.ts
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
const PROJECT_NAME = "বকুলের হাসি";

// ─────────────────────────────────────────────────────────────
// CHARACTERS
// ─────────────────────────────────────────────────────────────
const CHARACTERS = [
  {
    name: "বকুল",
    role: "নায়িকা — দাঁত ফাঁকা পাগলি, আসলে জ্ঞানী",
    description: "বয়স ১৭। গ্রামের সবাই তাকে 'পাগলি বকুল' ডাকে। দাঁতের ফাঁকে হাওয়া ঢুকে হাসলে শোঁ শোঁ শব্দ হয় — সে সেটা নিয়ে একটুও মাথা ঘামায় না, বরং আরো বড় করে হাসে। খালি পায়ে দৌড়ায়, গাছের সাথে কথা বলে, বৃষ্টি আসার আগে নাচতে শুরু করে। কিন্তু সে জানে কোন গাছের পাতায় জ্বর সারে, কোথায় পানি পাওয়া যাবে খরায়, কখন ঝড় আসবে। বলে — 'Pagol? Haa haa! Ami pagol na, ami shudhu tomar cheye beshi dekhi!' দাঁত ফাঁকা হাসি — গ্রামের সবচেয়ে সৎ হাসি।",
    appearance: "eccentric Bengali village girl age 17, gap-toothed wide joyful smile, wild unruly dark hair with twigs and flowers tangled in it, bright curious dark eyes, sun-kissed brown skin with dirt smudges, wearing mismatched colorful patched dress, bare feet, always slightly disheveled but radiantly happy, holding a bundle of wild herbs and flowers, 2D manhwa illustration, warm vibrant earthy colors",
    reference_prompt: "eccentric Bengali village pagli girl age 17, wide gap-toothed smile, wild tangled hair with flowers and twigs, bright curious eyes, mismatched colorful patched dress, bare feet, bundle of wild herbs, radiantly happy despite disheveled look, 2D manhwa cartoon style",
  },
  {
    name: "আনোয়ারা বেগম",
    role: "বকুলের মা — ভাঙা হৃদয়ের মহিলা",
    description: "বয়স ৪২। বকুলের মা। স্বামী মারা যাওয়ার পর থেকে ভেতরে ভেতরে শুকিয়ে গেছেন। মেয়েকে ভালোবাসেন কিন্তু দুনিয়ার কথা ভেবে ভয় পান। বলেন — 'Bokul, tumi ki ektu soja hoye chalfna ma? Manushe ki bole shuno!' চোখে সবসময় একটু পানি থাকে — মেয়ের জন্য না, নিজের অসহায়ত্বের জন্য।",
    appearance: "Bengali village widow mother age 42, tired sad gentle face, deep worry lines around eyes, greying hair pulled back tight, wearing faded grey-white saree, hunched shoulders, wringing hands anxiously, sorrowful but loving expression, dim cottage interior, 2D manhwa illustration",
    reference_prompt: "Bengali widow mother age 42, tired sad face, greying pulled-back hair, faded grey saree, hunched worried posture, loving sorrowful expression, 2D manhwa cartoon style",
  },
  {
    name: "করিম চাচা",
    role: "বুড়ো জেলে — বকুলের একমাত্র বন্ধু",
    description: "বয়স ৬৫। গ্রামের বুড়ো জেলে, নদীর ধারে থাকেন। একমাত্র মানুষ যিনি বকুলকে পাগল মনে করেন না। বলেন — 'Ei meye amar cheye beshi jaane. Tara pagol hoy na jara beshi jaane — tara ekla hoy.' বকুলের সাথে চুপ করে নদীর ধারে বসে থাকেন, দুজন দুজনকে বোঝেন।",
    appearance: "old Bengali fisherman age 65, deeply wrinkled weather-beaten face, white stubble beard, kind wise crinkled eyes, wearing faded blue lungi and open white shirt, sitting by river with fishing net, calm peaceful smile, gentle grandfather energy, sunset riverbank background, 2D manhwa illustration",
    reference_prompt: "old Bengali fisherman age 65, deeply wrinkled kind face, white stubble, faded blue lungi, sitting by river with fishing net, calm wise smile, grandfather energy, 2D manhwa cartoon style",
  },
  {
    name: "সোনালি",
    role: "নতুন মেয়ে — বকুলের প্রথম বন্ধু",
    description: "বয়স ১৬। শহর থেকে এসেছে মামার বাড়িতে। কৌতূহলী, ভয়হীন। গ্রামের বাচ্চারা যখন বলে 'Bokul-er kaache jaio na, she pagol' — সোনালি সোজা হেঁটে বকুলের কাছে চলে যায়। বলে — 'Tomar naam bokul? Amar naam Shonali. Tumi ki shotti gaacher shathe kotha bolo? Amake shekhao!' সে প্রথম বকুলকে মানুষ হিসেবে দেখে।",
    appearance: "cheerful Bengali city girl age 16, shoulder-length neat black hair with a headband, bright curious brown eyes, light skin, wearing casual yellow kurta with jeans, small backpack, open friendly confident smile, slightly out of place in village setting but genuinely excited, 2D manhwa illustration, warm bright colors",
    reference_prompt: "cheerful Bengali city girl age 16, neat shoulder hair with headband, bright curious eyes, yellow kurta with jeans, small backpack, friendly confident smile, slightly out of place in village, 2D manhwa cartoon style",
  },
  {
    name: "মতলব মিয়া",
    role: "গ্রাম্য ভিলেন — জমি দখলকারী",
    description: "বয়স ৫০। গ্রামের সবচেয়ে ক্ষমতাশালী ও লোভী মানুষ। বকুলের পরিবারের জমি দখল করতে চায়। বকুলকে 'পাগলি' বলে প্রমাণ করতে পারলে সম্পত্তি হাতিয়ে নেওয়া সহজ হবে — তাই সে সবাইকে বকুলের বিরুদ্ধে লাগায়। বলে — 'Oi paglir maa to ekla ashohay manush. Tader jomi-i to amader dike ashaichhe।' চর্বিদার শরীর, তেল চকচকে চুল, মুখে সবসময় মিষ্টি কিন্তু চোখে সাপের ঠান্ডা।",
    appearance: "greedy Bengali village man age 50, fat and oily appearance, slicked back dark hair, thin calculating smile hiding cold eyes, wearing expensive lungi with gold chain, fat fingers with rings, scheming expression, village background, threatening presence, 2D manhwa illustration villain design",
    reference_prompt: "greedy fat Bengali village man age 50, slicked back hair, thin fake smile, cold calculating eyes, expensive lungi gold chain, fat ringed fingers, scheming villain presence, 2D manhwa cartoon style",
  },
  {
    name: "ডাক্তার রাহেলা",
    role: "মহিলা ডাক্তার — বকুলের জ্ঞানের সাক্ষী",
    description: "বয়স ৩৫। NGO-র হয়ে গ্রামে এসেছেন। প্রথমে ভাবেন বকুল মানসিকভাবে অসুস্থ। কিন্তু বকুলের ভেষজ চিকিৎসার জ্ঞান দেখে অবাক হয়ে যান। বলেন — 'Tumi eta kothay shikhlae? Ei gaach-er extract ami research journal-e porechi kintu tumi practically use korcho!' বকুলকে প্রথমে রোগী ভাবেন, শেষে গুরু মানেন।",
    appearance: "professional Bengali female doctor age 35, neat ponytail, confident kind face, wearing NGO field outfit of grey salwar with vest full of pockets, stethoscope around neck, carrying a medical bag and notebook, glasses, intelligent warm eyes transitioning from skeptical to amazed, village health camp setting, 2D manhwa illustration",
    reference_prompt: "professional Bengali female NGO doctor age 35, ponytail, glasses, grey salwar with vest pockets, stethoscope, medical bag and notebook, intelligent warm eyes, confident kind expression, 2D manhwa cartoon style",
  },
  {
    name: "বটু",
    role: "ছোট ছেলে — বকুলের ছায়া",
    description: "বয়স ৯। গ্রামের সবচেয়ে দুষ্টু ছেলে কিন্তু বকুলকে দেখলে চুপ হয়ে যায়। ভাবে বকুল যাদু জানে। বকুলের পিছে পিছে হাঁটে সবসময়। বলে — 'Bokul apa! Bokul apa! Amader beral-er bachcha abar hobe kobe? Tumi to jano!' বকুলের কাছে প্রশ্ন নিয়ে আসে সবাই, বটু সবচেয়ে বেশি।",
    appearance: "mischievous Bengali village boy age 9, spiky messy hair, big round curious eyes, gap in his milk teeth, dark skin, wearing oversized torn shirt and shorts, always barefoot, half in awe half in excitement expression, following close behind, runny nose wiped on sleeve, 2D manhwa illustration",
    reference_prompt: "mischievous Bengali village boy age 9, spiky messy hair, big curious round eyes, gap teeth, dark skin, oversized torn shirt shorts, barefoot, excited awe expression, 2D manhwa cartoon style",
  },
];

// ─────────────────────────────────────────────────────────────
// EPISODES + SHOTS
// ─────────────────────────────────────────────────────────────
const EPISODES = [
  // ── EP 1 ──────────────────────────────────────────────────
  {
    title: "পাগলি বকুল",
    synopsis: "গ্রামের সবাই বকুলকে পাগলি বলে। সে একাই থাকে, গাছের সাথে কথা বলে, বৃষ্টিতে নাচে। কিন্তু বটু দেখে — বকুলের কথা সত্যি হয়।",
    shots: [
      {
        shot_number: "S01",
        character: "বকুল",
        dialogue: "Haa haa haa! Dekho dekho, aam gach-ta aaj khushi! Tumi ki dekhtecho batu? Pata gulo naachchhe!",
        action: "বকুল গাছের নিচে দাঁড়িয়ে পাতাদের সাথে কথা বলছে, দাঁত ফাঁকা হাসিতে মুখ ভরা",
        full_prompt: "eccentric gap-toothed Bengali village girl age 17, wild tangled hair with flowers, mismatched colorful patched dress, barefoot, standing under mango tree looking up at leaves with wide joyful smile, talking to the tree, warm golden morning light, lush green village background, 2D manhwa illustration, vibrant warm colors",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S02",
        character: "বটু",
        dialogue: "Oiii! Bokul apa pagol! Haha! Ei dekho, gaacher shathe kotha bolchhe!",
        action: "বটু আর তার বন্ধুরা বকুলকে দেখিয়ে হাসছে, দূর থেকে আঙুল দেখাচ্ছে",
        full_prompt: "mischievous Bengali village boy age 9, spiky messy hair, gap teeth grinning, pointing and laughing with other village kids in background, village dirt path, bright midday sun, 2D manhwa illustration, energetic fun composition",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S03",
        character: "বকুল",
        dialogue: "Tumi haso. Haste thako. Kal brishti ashbe. Tomar mayer dheki pora kapor bhaijha thakbe na.",
        action: "বকুল বটুর দিকে তাকিয়ে শান্তভাবে বলছে, চোখে একটুও রাগ নেই, শুধু জানা কিছু জানানোর ভঙ্গি",
        full_prompt: "eccentric Bengali village girl age 17, gap-toothed calm knowing smile, wild hair, standing facing a small boy, gentle pointing gesture, clear blue sky behind her turning slightly hazy, afternoon light, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S04",
        character: "আনোয়ারা বেগম",
        dialogue: "Bokul! Ore Bokul! Bari aish! Manushe ki bole shuno naki? Ei bhabei thakbi?",
        action: "মা উঠোনে দাঁড়িয়ে বকুলকে ডাকছেন, চোখে উদ্বেগ, হাতে কাপড়ের থালা",
        full_prompt: "Bengali widow mother age 42, tired worried face, greying tight bun hair, faded grey saree, standing in courtyard calling out to someone off frame, anxious expression, village home background with clothesline, late afternoon golden light, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S05",
        character: "বকুল",
        dialogue: "Ammu! Brishti ashbe! Kapor tulo tulo! Jaldi!",
        action: "বকুল দৌড়ে বাড়িতে ঢুকছে, আকাশ দেখাচ্ছে — মেঘ জমেছে",
        full_prompt: "eccentric Bengali village girl age 17, running barefoot toward village home, wild hair flying, arms outstretched pointing at sky, dark storm clouds gathering in distance, dramatic sky contrast, wide shot, 2D manhwa illustration, dynamic movement",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S06",
        character: "বটু",
        dialogue: "...Apa shotti boleche. Brishti ashche. Amader kapor bhije gelo.",
        action: "পরের দিন ভোরে বটু বৃষ্টিতে ভেজা কাপড়ের দিকে তাকিয়ে চমকে গেছে, মুখে বিস্ময়",
        full_prompt: "mischievous Bengali village boy age 9, standing in morning light looking at wet clothes on clothesline after rain, genuinely shocked and amazed expression, mouth slightly open, village courtyard with puddles and fallen leaves after rain, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S07",
        character: "করিম চাচা",
        dialogue: "Bokul. Boshi. Manusher kotha shune mon kharap korish na. Nodi ki kothao jaay? Jai na. Tai manushe tare chena.",
        action: "করিম চাচা নদীর ধারে বকুলের পাশে বসে জাল বুনছেন, শান্ত সন্ধ্যা",
        full_prompt: "old Bengali fisherman age 65, deeply wrinkled kind face, sitting on riverbank at sunset mending fishing nets, next to teenage girl with wild hair sitting quietly beside him, calm peaceful atmosphere, warm orange-pink sunset light reflecting on river, 2D manhwa illustration, serene wide shot",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S08",
        character: "বকুল",
        dialogue: "Chacha, amar ki pagol hooa uchit chilo? Ami cheshta korle ki pari?",
        action: "বকুল নদীর দিকে তাকিয়ে জিজ্ঞেস করছে, গলায় সত্যিকারের প্রশ্ন",
        full_prompt: "eccentric Bengali village girl age 17, sitting on riverbank at sunset, wild hair with flowers, looking at river water thoughtfully, genuine questioning expression mixed with her usual light, warm sunset golden hour, 2D manhwa illustration, emotional close-up",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S09",
        character: "করিম চাচা",
        dialogue: "Pagol hoa uchit kina janina. Kintu tumi ja acho — shetai thako. Nodi kono din shukay na, karon she nijeke nodi theke badlai na.",
        action: "করিম চাচা হাসিমুখে বকুলের মাথায় হাত রাখছেন, স্নেহের দৃশ্য",
        full_prompt: "old Bengali fisherman age 65, placing gentle weathered hand on teenage girl's wild-haired head in a grandfatherly gesture, both sitting by river at sunset, warm tender moment, soft golden light, 2D manhwa illustration, emotional warmth",
        width: 832, height: 1216, steps: 30,
      },
    ],
  },

  // ── EP 2 ──────────────────────────────────────────────────
  {
    title: "সোনালির আগমন",
    synopsis: "শহর থেকে সোনালি আসে মামার বাড়িতে। সবাই তাকে বকুল থেকে দূরে রাখতে বলে। সোনালি উল্টো বকুলের কাছে চলে যায়।",
    shots: [
      {
        shot_number: "S01",
        character: "সোনালি",
        dialogue: "Ei gram-e eto shundor! Khejirgaach! Nodi! Ooooh — oi meye-ta ki korche? Gaacher shathe kotha bolche?",
        action: "সোনালি প্রথমবার গ্রামে এসে অবাক হয়ে তাকাচ্ছে, দূরে বকুলকে দেখতে পাচ্ছে",
        full_prompt: "cheerful Bengali city girl age 16, neat shoulder hair with headband, yellow kurta with jeans, small backpack, standing on village road looking around with excited curious expression, in background wild-haired girl can be seen talking to a tree, village landscape with palms and fields, 2D manhwa illustration",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S02",
        character: "বটু",
        dialogue: "Apa! Oi paglir kaache jaio na! She pagol! Gaacher shathe kotha bole, brishti ashle naache, shobai tare dare!",
        action: "বটু সোনালির সামনে হাত দিয়ে আটকানোর ভঙ্গিতে দাঁড়িয়ে সতর্ক করছে",
        full_prompt: "mischievous Bengali village boy age 9, standing with arms outstretched blocking path, serious warning expression unusual for him, pointing toward wild-haired girl in distance, village path, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S03",
        character: "সোনালি",
        dialogue: "Pagol? Interesting! Aaro interesting holo. Cholo, ami jaabo.",
        action: "সোনালি বটুকে পাশ কাটিয়ে সোজা বকুলের দিকে হাঁটছে, চোখে কৌতূহল",
        full_prompt: "cheerful Bengali city girl age 16, walking confidently toward wild-haired figure in distance, bypassing a small shocked boy who tries to stop her, determined curious smile, village path with trees, 2D manhwa illustration, dynamic walking pose",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S04",
        character: "সোনালি",
        dialogue: "Tomar naam bokul? Amar naam Shonali. Tumi ki shotti gaacher shathe kotha bolo? Amake shekhao na please!",
        action: "সোনালি বকুলের সামনে দাঁড়িয়ে সরাসরি কথা বলছে, কোনো ভয় বা ঠাট্টা নেই",
        full_prompt: "cheerful Bengali city girl age 16, standing face to face with eccentric wild-haired village girl age 17, both the same height, Shonali with open friendly direct expression, Bokul with surprised wide eyes not used to anyone approaching without mockery, village tree in background, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S05",
        character: "বকুল",
        dialogue: "...Tumi dare na?",
        action: "বকুল অবাক চোখে সোনালির দিকে তাকিয়ে আছে, এত সহজভাবে কেউ কথা বলেনি আগে",
        full_prompt: "eccentric Bengali village girl age 17, wide genuinely surprised expression, wild hair framing face, gap-toothed mouth slightly open in surprise, looking at city girl with bewildered but curious eyes, soft warm light, emotional close-up, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S06",
        character: "সোনালি",
        dialogue: "Ki theke darbo? Tumi to manush. Naaki tumi shotti pagol?",
        action: "সোনালি মাথা কাত করে সরাসরি জিজ্ঞেস করছে, চোখে হাসি",
        full_prompt: "cheerful Bengali city girl age 16, tilting head to side with playful direct questioning expression, one hand on hip, looking at Bokul with genuine curiosity and warmth, no mockery in expression, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S07",
        character: "বকুল",
        dialogue: "Haa haa haa! Tumi shundor proshno korecho! Pagol kina ami nijeshe janina. Cholo, toke ekta shundor jinish dekhai!",
        action: "বকুল প্রথমবার কারো সামনে সত্যিকারের হাসি দিচ্ছে, সোনালির হাত ধরে টানছে",
        full_prompt: "eccentric Bengali village girl age 17, wide genuine gap-toothed laugh throwing head back, reaching out to grab city girl's hand to pull her along, both girls in motion, wild hair flying, joyful spontaneous moment, warm afternoon light, 2D manhwa illustration, energetic happy composition",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S08",
        character: "বটু",
        dialogue: "...Shonali apa... Bokul apa-r shathe cholo gelo? She dare ni? She ki paglir moton naki?",
        action: "বটু পেছনে রয়ে গেছে, মুখ হাঁ করে দুজনকে দেখছে",
        full_prompt: "mischievous Bengali village boy age 9, standing alone on village path, jaw dropped in shock, watching two girls run away together in distance, bewildered expression, village landscape, 2D manhwa illustration, comedic reaction shot",
        width: 1216, height: 832, steps: 30,
      },
    ],
  },

  // ── EP 3 ──────────────────────────────────────────────────
  {
    title: "মতলবের ফাঁদ",
    synopsis: "মতলব মিয়া বকুলদের জমি দখল করতে চায়। বকুলকে আনুষ্ঠানিকভাবে 'পাগল' ঘোষণা করাতে পারলে মায়ের পক্ষে সম্পত্তি রক্ষা কঠিন হবে। সে গ্রাম্য সালিসে বকুলের বিরুদ্ধে কেস তোলে।",
    shots: [
      {
        shot_number: "S01",
        character: "মতলব মিয়া",
        dialogue: "Ei paglir karon gram-er nam noshto hochhe. Tader jomi ki thak-a uchit? Ek pagol meyer haat-e jomi?",
        action: "মতলব মিয়া গ্রামের মানুষের সামনে বক্তব্য দিচ্ছে, বকুলের বিরুদ্ধে উস্কানো দিচ্ছে",
        full_prompt: "greedy fat Bengali village man age 50, standing in village gathering addressing crowd, slicked back hair, expensive lungi gold chain, one fat finger pointing accusingly, false concerned expression covering scheming eyes, crowd of villagers listening, village tree shade, 2D manhwa illustration, villain framing",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S02",
        character: "আনোয়ারা বেগম",
        dialogue: "Amar meye pagol na. Shudhu ektu alada. Ke boleche tader jomi niye kotha bolte?",
        action: "মা ভয়ে ভয়ে কিন্তু মেয়ের পক্ষে দাঁড়াচ্ছেন, গলা কাঁপছে কিন্তু চোখে দৃঢ়তা",
        full_prompt: "Bengali widow mother age 42, standing in village gathering with trembling but determined posture, faded grey saree, facing away from camera toward crowd, voice cracking but holding position to defend daughter, other villagers watching, tense village scene, 2D manhwa illustration",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S03",
        character: "বকুল",
        dialogue: "Motlob Chacha! Tomar chokh-er niche ki holo? Haldi bata lagao, noyto infection hochhe. Ami herbal dibo?",
        action: "বকুল সম্পূর্ণ অজান্তে মতলবের চোখের ইনফেকশন লক্ষ্য করে সহজভাবে বলছে, সবাই হতবাক",
        full_prompt: "eccentric Bengali village girl age 17, standing in village meeting looking at fat villain man with genuine concern pointing to area under his eye, gap-toothed innocent helpful expression, villagers in background looking shocked at her observation, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S04",
        character: "মতলব মিয়া",
        dialogue: "Ei dekho! Pagol ei! Amaar shathe eivabe kotha bole! Ei pagol-ke ki beleye rakha uchit naki?",
        action: "মতলব লজ্জা পেয়ে আরো রাগী হয়ে গেছে, ঢাকতে চাইছে",
        full_prompt: "greedy fat Bengali village man age 50, face red with embarrassment turning to rage, pointing aggressively at young girl, trying to regain control of situation, crowd watching confused, village gathering, 2D manhwa illustration, conflict scene",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S05",
        character: "করিম চাচা",
        dialogue: "Bokul to thik i boleche. Motlob-er chokh-e kal theke infection — ami dekhechi. Meye-ta pagol noy, she daktar-er cheye beshi jaane.",
        action: "করিম চাচা উঠে দাঁড়িয়ে শান্তভাবে বকুলের পক্ষে বলছেন, গ্রামের মানুষ চুপ হয়ে শুনছে",
        full_prompt: "old Bengali fisherman age 65, standing up at village gathering with dignified calm authority, pointing calmly, crowd quieting to listen to elder, village tree shade afternoon light, 2D manhwa illustration, elder wisdom moment",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S06",
        character: "সোনালি",
        dialogue: "Ami shoto din ei gram-e aachi. Kintu ekta jinish bujechi — Bokul-er kotha shob shomoi thik hoy. Pagol-er kotha ki thik hoy?",
        action: "সোনালি দাঁড়িয়ে সরাসরি মতলবের দিকে তাকিয়ে চ্যালেঞ্জ করছে, নতুন মেয়ের সাহস",
        full_prompt: "cheerful Bengali city girl age 16, standing confidently at village gathering, looking directly at fat man with fearless determined expression, chin raised, hands at sides, crowd watching in surprise at her boldness, 2D manhwa illustration, empowerment moment",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S07",
        character: "বকুল",
        dialogue: "Motlob Chacha. Tomar chokh-er niche-r chamra dekhe bujhechi. Ei herbal diye raat-e lagao. Kal valo lagbe.",
        action: "বকুল মতলবের সামনে গিয়ে শান্তভাবে হাতের তাজা ভেষজ পাতা এগিয়ে দিচ্ছে, কোনো রাগ নেই",
        full_prompt: "eccentric Bengali village girl age 17, calmly offering fresh herbs to shocked fat village man, gap-toothed gentle expression showing no grudge, holding out herbal bundle to his hands, crowd watching in amazement, afternoon village scene, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S08",
        character: "মতলব মিয়া",
        dialogue: "...",
        action: "মতলব থমকে গেছে, বকুলের ভেষজ পাতা হাতে নিচ্ছে অজান্তেই, মুখে হতভম্ব ভাব",
        full_prompt: "greedy fat Bengali village man age 50, completely caught off guard, hesitantly accepting herb bundle from young girl, conflicted embarrassed expression, calculation draining from his face, crowd watching with small smiles, 2D manhwa illustration, ironic victory moment",
        width: 832, height: 1216, steps: 30,
      },
    ],
  },

  // ── EP 4 ──────────────────────────────────────────────────
  {
    title: "বকুলের জ্ঞান",
    synopsis: "বড় খরা এসেছে গ্রামে। পানি নেই, ফসল শুকাচ্ছে। বকুল জানে কোথায় পানি আছে — কিন্তু কেউ তাকে বিশ্বাস করে না। শেষমেশ সোনালি আর বটু তাকে সাহায্য করে।",
    shots: [
      {
        shot_number: "S01",
        character: "বকুল",
        dialogue: "Oi tak-e khunti diye khodo. Tin hat niche pani aache. Ami jani.",
        action: "বকুল শুকনো মাঠে একটা জায়গা দেখিয়ে বলছে, চারদিকে খরার ধূলা",
        full_prompt: "eccentric Bengali village girl age 17, standing in dry cracked field during drought, pointing down at specific spot in ground, confident knowing expression, dry dusty landscape with withered crops, harsh dry light, 2D manhwa illustration, wide establishing shot",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S02",
        character: "আনোয়ারা বেগম",
        dialogue: "Manushe shune haasbe. Keu khunti niye aasbe na. Bokul, tumi chup thako.",
        action: "মা বকুলকে থামাচ্ছেন, চিন্তিত মুখে",
        full_prompt: "Bengali widow mother age 42, placing restraining hand on daughter's shoulder with worried expression, dry dusty background, tired exhausted village drought atmosphere, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S03",
        character: "সোনালি",
        dialogue: "Ami bishas kori. Batu, tumi ki ekta khunti niye ashte parbe? Kicchhu hobena. Khali dekhbo.",
        action: "সোনালি বটুর দিকে তাকাচ্ছে, সিদ্ধান্ত নিচ্ছে নিজেই চেষ্টা করার",
        full_prompt: "cheerful Bengali city girl age 16, kneeling in dry field looking at small village boy with determined encouraging expression, holding bkul's arm supportively, dry village background, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S04",
        character: "বটু",
        dialogue: "Ami... Ami khunti niye ashchi! Bokul apa shotti bole! Ager bar brishti-r kotha-o shotti hoechilo!",
        action: "বটু ছুটে যাচ্ছে খুঁটি আনতে, সাহস করে সিদ্ধান্ত নিয়েছে",
        full_prompt: "mischievous Bengali village boy age 9, running at full speed through dry village, determined brave expression, dust kicking up behind him, cracked dry earth, 2D manhwa illustration, action running shot",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S05",
        character: "বকুল",
        dialogue: "Ektu deeper. Haa... oi khane. Mati-ta dekhcho? Rang-ta alada. Shital.",
        action: "বকুল মাটিতে বসে মাটির রং দেখছে, হাত দিয়ে ছুঁয়ে বুঝছে, সোনালি পাশে হাঁটু গেড়ে দেখছে",
        full_prompt: "eccentric Bengali village girl age 17, kneeling on dry cracked ground touching soil with fingers, intense focused expression studying soil color, city girl kneeling beside watching intently, small boy in background digging, scientific-intuitive observation, 2D manhwa illustration",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S06",
        character: "বটু",
        dialogue: "PAAAAAANI! PANI PAICHI! BOKUL APA THIK BOLECHE! PAAANI!",
        action: "বটু পানি দেখে চিৎকার করছে, মাটি খুঁড়ে পানি উঠে এসেছে, সবাই অবাক",
        full_prompt: "mischievous Bengali village boy age 9, screaming with pure joy and shock, water rising from hole in dry ground, arm thrust up triumphantly, gap-toothed grin at maximum, dust and water spray, excited villagers rushing over in background, 2D manhwa illustration, triumphant splash moment",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S07",
        character: "বকুল",
        dialogue: "Haa haa haa! Pani! Pani pailam! Dekhecho Shonali? Mati-r bhaasha bujhte hoy — she shob bolte paarey!",
        action: "বকুল পানিতে হাত দিয়ে আনন্দে লাফাচ্ছে, পানি ছিটাচ্ছে, দাঁত ফাঁকা হাসিতে মুখ ভরা",
        full_prompt: "eccentric Bengali village girl age 17, splashing water with both hands from newly found water source in dry ground, gap-toothed wide laugh, wild hair flying, pure joy and vindication, city girl and small boy celebrating beside her, other villagers arriving to see, 2D manhwa illustration, celebratory splash composition",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S08",
        character: "করিম চাচা",
        dialogue: "Ei meye-ta jibon-e kono boro kaam korbe. Ami jani.",
        action: "করিম চাচা দূরে দাঁড়িয়ে বকুলের আনন্দ দেখছেন, চোখে গর্ব আর ভালোবাসা",
        full_prompt: "old Bengali fisherman age 65, standing at distance watching joyful girl splashing water, deeply proud and loving expression, weathered face with gentle smile and glistening eyes, village crowd in middle ground, 2D manhwa illustration, emotional wide shot",
        width: 1216, height: 832, steps: 30,
      },
    ],
  },

  // ── EP 5 ──────────────────────────────────────────────────
  {
    title: "ডাক্তারের নোটবুক",
    synopsis: "NGO ডাক্তার রাহেলা গ্রামে আসেন। বকুলকে মানসিক রোগী ভেবে পরীক্ষা করতে চান। কিন্তু বকুলের ভেষজ জ্ঞান দেখে তাঁর ধারণা বদলে যায়।",
    shots: [
      {
        shot_number: "S01",
        character: "ডাক্তার রাহেলা",
        dialogue: "Bokul, tumi ki kothao kharap laage? Maajhey maajhey ki keu nai ekhane bole mone hoy?",
        action: "ডাক্তার রাহেলা ক্লিনিক টেন্টে বকুলের সামনে বসে ধীরে সাবধানে প্রশ্ন করছেন, হাতে নোটবুক",
        full_prompt: "professional Bengali female NGO doctor age 35, sitting across from wild-haired teenage girl in makeshift clinic tent, asking careful clinical questions, holding notebook, concerned professional expression, soft clinic lighting, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S02",
        character: "বকুল",
        dialogue: "Kharap laage na. Amar shob jaiga-i vandhu aache — gaach, nodi, pakhi. Ekhane bole mone hoy na, ektu alaaday mone hoy. Onek tofat.",
        action: "বকুল সহজভাবে উত্তর দিচ্ছে, ডাক্তারের প্রশ্নের গভীরতা বুঝতে পারছে",
        full_prompt: "eccentric Bengali village girl age 17, sitting calmly in clinic tent facing doctor, gap-toothed thoughtful expression, hands in lap, answering with clear eyes and genuine clarity, not confused not disturbed, just different, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S03",
        character: "বকুল",
        dialogue: "Apa, tomar haather kache ki tulshir pata aache? Tomar cholate ki ektu infection hoyeche dekha jaachhe. Ei pata bata kore lagao, kal thakbe na.",
        action: "বকুল ডাক্তারের হাতের দিকে তাকিয়ে কিছু লক্ষ্য করে বলছে, ডাক্তার হতবাক",
        full_prompt: "eccentric Bengali village girl age 17, leaning forward pointing at doctor's hand with observant expression, doctor looking down at own hand in surprise, clinical examination dynamic reversed, 2D manhwa illustration, ironic role reversal",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S04",
        character: "ডাক্তার রাহেলা",
        dialogue: "Ki bole! Haa... haa there is slight inflammation... Tumi eta kothay shikhlae?",
        action: "ডাক্তার নিজের হাত দেখে চমকে উঠেছেন, নোটবুক খুলে কিছু লিখতে শুরু করেছেন",
        full_prompt: "professional Bengali female NGO doctor age 35, looking at her own hand with shocked expression, pen hovering over notebook, completely disarmed by teenage girl's accurate observation, shifting from clinical examiner to curious student, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S05",
        character: "বকুল",
        dialogue: "Kaaro kaachhe shikhi ni. Amaar ma bole — bon-er gaach shob jaane. Ami shudhu shuni.",
        action: "বকুল সরলভাবে বলছে, বাইরে বনের দিকে হাত দেখাচ্ছে",
        full_prompt: "eccentric Bengali village girl age 17, pointing toward forest outside clinic tent, simple innocent explaining expression, wild hair and mismatched dress contrasting with the depth of her knowledge, warm afternoon light through tent canvas, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S06",
        character: "ডাক্তার রাহেলা",
        dialogue: "Bokul, tumi ki amar shathe ektu ban-e jabe? Tumi ja jano — sheita ami research koritey chai. Eta boro kaam.",
        action: "ডাক্তার উৎসাহিত হয়ে বকুলকে একসাথে কাজ করতে বলছেন, নোটবুক এগিয়ে দিচ্ছেন",
        full_prompt: "professional Bengali female NGO doctor age 35, leaning forward with excited research expression, extending notebook toward teenage girl, role completely reversed from earlier skepticism, now genuinely eager student, 2D manhwa illustration",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S07",
        character: "বকুল",
        dialogue: "Haa haa! Apa, amake kokhono keu research-er shaathi bole nai! Cholo! Oi nolkhuror gaach-ta dekhai, sheta rater betha-y kaam kore!",
        action: "বকুল খুশিতে উঠে দাঁড়িয়ে ডাক্তারের হাত ধরে টানছে, দাঁত ফাঁকা হাসিতে মুখ উজ্জ্বল",
        full_prompt: "eccentric Bengali village girl age 17, jumping up with full gap-toothed joyful laugh, grabbing doctor's hand to pull her toward forest, wild hair bouncing, doctor laughing surprised being pulled along, evening golden light, 2D manhwa illustration, joyful dynamic movement",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S08",
        character: "সোনালি",
        dialogue: "Ami shuru thekei jantam. Bokul pagol noy — she shudhu amader cheye onek beshi bujhte parey.",
        action: "সোনালি দূর থেকে দুজনকে একসাথে যেতে দেখে মুচকি হাসছে",
        full_prompt: "cheerful Bengali city girl age 16, leaning against village wall watching Bokul and doctor disappear toward forest together, warm proud knowing smile, afternoon golden light, 2D manhwa illustration, quiet satisfied observer shot",
        width: 832, height: 1216, steps: 30,
      },
    ],
  },

  // ── EP 6 ──────────────────────────────────────────────────
  {
    title: "বকুলের হাসি",
    synopsis: "ডাক্তার রাহেলা বকুলের ভেষজ জ্ঞান নিয়ে রিপোর্ট লেখেন। গ্রামের মানুষ বুঝতে পারে বকুল আসলে কী। মতলব মিয়া পিছিয়ে যায়। আর বকুলের দাঁত ফাঁকা হাসি — গ্রামের সবচেয়ে মূল্যবান হাসি হয়ে ওঠে।",
    shots: [
      {
        shot_number: "S01",
        character: "ডাক্তার রাহেলা",
        dialogue: "Bokul jaano je tumi ki shikiyechho amake? Aami 7 bochor medical school-e jaa padhechi, tumi taaar khanikhta natural wisdom-ei jano.",
        action: "ডাক্তার সন্ধ্যায় বকুলকে নদীর ধারে বসে বলছেন, হাতে ভরা নোটবুক",
        full_prompt: "professional Bengali female NGO doctor age 35, sitting on riverbank at evening with completely filled notebook, talking earnestly to wild-haired girl beside her, genuine amazed and grateful expression, warm sunset on river, 2D manhwa illustration",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S02",
        character: "বকুল",
        dialogue: "Apa, tumi ki amake pathaghor-e poriye dite parbe? Ami likhte pori na valo. Kintu ami jodi likha shikhi — tahole aro manush jaante parbe.",
        action: "বকুল প্রথমবার নিজে কিছু চাইছে, চোখে নতুন আলো",
        full_prompt: "eccentric Bengali village girl age 17, sitting by river at evening with uncharacteristically vulnerable hopeful expression, asking for something for herself for the first time, gap-toothed but closed mouth earnest expression, hands clasped in lap, warm sunset light, 2D manhwa illustration, emotional character growth moment",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S03",
        character: "মতলব মিয়া",
        dialogue: "Aacha aacha. Jomi-r kotha... pore dekhaa jaabe. Akhon shob thak.",
        action: "মতলব মিয়া মাথা নামিয়ে সরে যাচ্ছে, হার মেনেছে কিন্তু সেটা স্বীকার করছে না",
        full_prompt: "greedy fat Bengali village man age 50, walking away head slightly bowed, defeated deflated posture, gold chain and rings looking less imposing now, villagers watching him leave, 2D manhwa illustration, villain retreat with quiet dignity",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S04",
        character: "বটু",
        dialogue: "Bokul apa! Ami boro holey tomar moton hote chai! Tumi shob jano!",
        action: "বটু বকুলকে জড়িয়ে ধরেছে, শিশুর সরল স্বীকৃতি",
        full_prompt: "mischievous Bengali village boy age 9, hugging wild-haired girl's waist looking up at her with pure admiring expression, gap-toothed grin mirroring hers, village path with other children watching, warm afternoon, 2D manhwa illustration, heartwarming moment",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S05",
        character: "আনোয়ারা বেগম",
        dialogue: "Bokul... Tomar baba thakle tomar dike takiye ki boltho jano? 'Ei meye amaar shob theke boro shompod.' Ami bujtam na. Akhon bujhi.",
        action: "মা বকুলকে বুকে জড়িয়ে ধরে কাঁদছেন, মেয়েকে বোঝার আনন্দ-কষ্টের কান্না",
        full_prompt: "Bengali widow mother age 42, embracing wild-haired teenage daughter tightly, crying with mixed joy and regret, faded grey saree, daughter's mismatched dress and flowers visible over mother's shoulder, late evening light, 2D manhwa illustration, emotional reconciliation moment",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S06",
        character: "বকুল",
        dialogue: "Ammu! Kaando na! Ami kintu tomar bari-r jomi-ta beshajomi kore debo — shob shomoy nolkhuror bagan thakbe!",
        action: "বকুল মাকে জড়িয়ে সাথে সাথে ভবিষ্যতের পরিকল্পনা বলছে, দুজনই হাসছে কাঁদতে কাঁদতে",
        full_prompt: "eccentric Bengali village girl age 17, hugging mother while already planning out loud with gap-toothed laugh through tears, mother laughing and crying at same time, warm evening light, village home background, 2D manhwa illustration, emotional comedy warmth",
        width: 832, height: 1216, steps: 30,
      },
      {
        shot_number: "S07",
        character: "সোনালি",
        dialogue: "Bokul, jodi tumi shohore ashto — ki hoto bolo to?",
        action: "সোনালি বকুলের পাশে বসে জিজ্ঞেস করছে, রাতের তারা আকাশের নিচে",
        full_prompt: "cheerful Bengali city girl age 16, sitting under stars next to wild-haired girl at night, asking thoughtful question, both looking up at sky, warm lamp light from nearby house, peaceful night village, 2D manhwa illustration, quiet friendship moment",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S08",
        character: "বকুল",
        dialogue: "Shohor-e gele toh mati-r bhaasha shunbo ki kore? Nodi-r katha shunbo ki kore? Nah, ami ei gram-ei thakbo. Kintu shohorer manus jodi ashe — ami shekhabo.",
        action: "বকুল তারার দিকে তাকিয়ে হাসছে, এত নিশ্চিত কখনো ছিল না",
        full_prompt: "eccentric Bengali village girl age 17, lying back looking up at stars at night, full wide gap-toothed smile of total contentment and certainty, wild hair spread around her like a halo, beside her city friend, village sounds and fireflies, 2D manhwa illustration, peaceful resolution beauty shot",
        width: 1216, height: 832, steps: 30,
      },
      {
        shot_number: "S09",
        character: "করিম চাচা",
        dialogue: "Haa... ami jantam. Nodi kono din shukay na.",
        action: "করিম চাচা নদীর ধারে একা বসে রাতের নদীর দিকে তাকিয়ে মুচকি হাসছেন, গল্পের শেষ টানা",
        full_prompt: "old Bengali fisherman age 65, sitting alone on moonlit riverbank at night, small content wise smile, fishing net in lap, moonlight reflecting on peaceful river, crickets and fireflies, 2D manhwa illustration, final peaceful wide shot with deep quiet wisdom",
        width: 1216, height: 832, steps: 30,
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log("🌸 বকুলের হাসি — Seeding...\n");

  console.log("🔐 Logging in...");
  const cookie = await login();
  console.log("   ✓ Authenticated\n");

  console.log(`📁 Creating project: ${PROJECT_NAME}`);
  const project = await post<{ id: string }>(cookie, "/api/projects", { name: PROJECT_NAME });
  console.log(`   ✓ Project: ${project.id}\n`);

  console.log(`👤 Creating ${CHARACTERS.length} characters...`);
  const charMap: Record<string, string> = {};
  for (const c of CHARACTERS) {
    const char = await post<{ id: string }>(cookie, `/api/projects/${project.id}/characters`, c);
    charMap[c.name] = char.id;
    console.log(`   ✓ ${c.name} (${c.role})`);
  }

  let totalShots = 0;

  for (let ei = 0; ei < EPISODES.length; ei++) {
    const ep = EPISODES[ei];
    console.log(`\n📺 Episode ${ei + 1}: ${ep.title}`);

    const epRecord = await post<{ id: string }>(cookie, `/api/projects/${project.id}/episodes`, {
      title: ep.title,
      synopsis: ep.synopsis,
      episode_number: ei + 1,
    });
    console.log(`   ✓ Ep ${ei + 1} — ${epRecord.id}`);

    process.stdout.write("   ");
    for (let si = 0; si < ep.shots.length; si++) {
      const s = ep.shots[si];
      await post(cookie, `/api/episodes/${epRecord.id}/shots`, {
        shot_number: s.shot_number,
        character: s.character,
        dialogue: s.dialogue,
        action: s.action,
        shot_description: s.action,
        full_prompt: s.full_prompt,
        width: s.width,
        height: s.height,
        steps: s.steps,
        status: "draft",
        project_id: project.id,
      });
      process.stdout.write(`Shot ${si + 1}/${ep.shots.length}      `);
      totalShots++;
    }
    console.log(`\n   ✓ ${ep.shots.length} shots`);
  }

  console.log(`
✅ Done!

   প্রজেক্ট  : ${PROJECT_NAME}
   চরিত্র   : ${CHARACTERS.length}
   এপিসোড   : ${EPISODES.length}
   মোট শট   : ${totalShots}

   👉 http://localhost:3000/projects/${project.id}
`);
}

main().catch(e => { console.error(e); process.exit(1); });
