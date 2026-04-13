/**
 * Seed script: Islamic cartoon "Noor's Adventures"
 * Run: npx tsx scripts/seed-islamic-cartoon.ts
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
  if (!match) throw new Error("No session cookie returned");
  return `session=${match[1]}`;
}

async function post<T>(cookie: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${t}`);
  }
  return res.json() as Promise<T>;
}

// ──────────────────────────────────────────────────────
// Content definition
// ──────────────────────────────────────────────────────

const PROJECT_NAME = "Noor's Adventures — Islamic Cartoon";

const CHARACTERS = [
  {
    name: "Noor",
    role: "Protagonist",
    description: "A curious, kind-hearted 10-year-old Muslim girl who loves learning about Islam and helping others.",
    appearance: "young Muslim girl, age 10, wearing a colorful hijab (light teal), round bright eyes, warm olive skin, cheerful smile, modest modest clothing, cartoon style, clean lines",
    reference_prompt: "young Muslim girl with teal hijab, bright cheerful eyes, warm smile, modest Islamic clothing, 2D cartoon illustration, soft colors, child-friendly",
  },
  {
    name: "Ibrahim",
    role: "Supporting — Noor's brother",
    description: "Noor's playful and brave 8-year-old brother who is full of energy and always eager for adventure.",
    appearance: "young Muslim boy, age 8, short dark hair, kufi cap (white), big curious eyes, olive skin, playful grin, modest Islamic clothing, cartoon style",
    reference_prompt: "young Muslim boy with white kufi cap, big curious eyes, playful grin, modest clothing, 2D cartoon illustration, soft warm colors, child-friendly",
  },
  {
    name: "Grandpa Hassan",
    role: "Mentor",
    description: "A wise and loving grandfather who teaches the children Islamic values through stories and gentle guidance.",
    appearance: "elderly Muslim man, long white beard, white turban, warm kind eyes, light wrinkles, traditional thobe, gentle smile, cartoon style",
    reference_prompt: "wise elderly Muslim grandfather, white beard, white turban, kind warm eyes, traditional thobe, gentle smile, 2D cartoon illustration, soft colors",
  },
  {
    name: "Layla",
    role: "Supporting — best friend",
    description: "Noor's cheerful and helpful best friend who is always ready to share and cooperate.",
    appearance: "young Muslim girl, age 10, pink hijab with small floral pattern, bright hazel eyes, light brown skin, warm smile, modest clothing, cartoon style",
    reference_prompt: "young Muslim girl with pink floral hijab, bright hazel eyes, warm smile, modest clothing, 2D cartoon illustration, cheerful pastel colors",
  },
  {
    name: "Mama Fatima",
    role: "Parent",
    description: "Noor and Ibrahim's caring and devoted mother who models Islamic values at home.",
    appearance: "Muslim woman, mid-30s, elegant white hijab, gentle eyes, warm smile, modest modest abaya in soft blue, loving expression, cartoon style",
    reference_prompt: "Muslim mother, white hijab, gentle warm eyes, modest blue abaya, loving expression, 2D cartoon illustration, soft calming colors",
  },
];

const EPISODES: {
  title: string;
  summary: string;
  shots: {
    shot_description: string;
    character: string;
    environment: string;
    lighting: string;
    camera_angle: string;
    story_line: string;
    dialogue?: string;
    full_prompt: string;
  }[];
}[] = [
  {
    title: "The Gift of Bismillah",
    summary: "Noor forgets to say Bismillah before eating and spills her food. Grandpa Hassan gently teaches her the importance of beginning every action in the name of Allah.",
    shots: [
      {
        shot_description: "Noor sits at the breakfast table reaching excitedly for a glass of juice",
        character: "Noor",
        environment: "bright cozy kitchen with Islamic geometric tile patterns on the wall",
        lighting: "warm morning sunlight streaming through window",
        camera_angle: "medium shot",
        story_line: "Noor is eager to drink her juice without saying Bismillah",
        dialogue: "Ooh, orange juice!",
        full_prompt: "young Muslim girl Noor in teal hijab sitting at breakfast table reaching excitedly for a glass of orange juice, bright cozy Islamic kitchen with geometric tile patterns, warm morning sunlight, 2D cartoon illustration, soft warm colors",
      },
      {
        shot_description: "The juice glass tips and spills all over the table",
        character: "Noor",
        environment: "breakfast table with spilled orange juice spreading across the tablecloth",
        lighting: "bright morning light",
        camera_angle: "close-up",
        story_line: "Because she rushed, the juice spills",
        dialogue: "Oh no!",
        full_prompt: "juice glass tipping and spilling orange juice across a breakfast table, Noor in teal hijab looking surprised and upset, bright morning light, 2D cartoon illustration, dynamic action moment",
      },
      {
        shot_description: "Grandpa Hassan walks in with a warm smile, not angry at all",
        character: "Grandpa Hassan",
        environment: "kitchen doorway, morning light behind him",
        lighting: "soft warm backlight",
        camera_angle: "medium shot from Noor's perspective",
        story_line: "Grandpa arrives and sees what happened",
        full_prompt: "wise elderly Muslim grandfather Grandpa Hassan with white beard and turban walking through kitchen doorway with warm kind smile, soft warm backlight, seen from a child's perspective, 2D cartoon illustration",
      },
      {
        shot_description: "Grandpa sits beside Noor at the table and gently takes her hands",
        character: "Grandpa Hassan, Noor",
        environment: "kitchen table, spilled juice nearby but calm atmosphere",
        lighting: "gentle warm interior light",
        camera_angle: "medium two-shot",
        story_line: "Grandpa is going to teach Noor a lesson",
        dialogue: "Let me show you something special, habibti.",
        full_prompt: "wise elderly Muslim grandfather sitting beside young Muslim girl Noor at kitchen table, gently holding her hands, warm caring moment, spilled juice visible, gentle warm interior light, 2D cartoon illustration, heartwarming",
      },
      {
        shot_description: "Grandpa pours a new glass and says Bismillah with eyes closed and hand raised",
        character: "Grandpa Hassan",
        environment: "kitchen table, fresh glass of juice",
        lighting: "warm glowing light emphasizing the moment",
        camera_angle: "close-up on Grandpa's face",
        story_line: "Grandpa demonstrates saying Bismillah",
        dialogue: "Bismillah ir-Rahman ir-Raheem.",
        full_prompt: "wise elderly Muslim grandfather with white beard and turban saying Bismillah with eyes gently closed, hand raised gracefully, warm glowing light, peaceful serene expression, close-up, 2D cartoon illustration, spiritual warm glow effect",
      },
      {
        shot_description: "Noor closes her eyes and says Bismillah before drinking her new glass of juice",
        character: "Noor",
        environment: "kitchen table, bright and cheerful",
        lighting: "golden warm morning light",
        camera_angle: "medium close-up",
        story_line: "Noor learns and applies the lesson",
        dialogue: "Bismillah!",
        full_prompt: "young Muslim girl Noor in teal hijab closing eyes and saying Bismillah before drinking orange juice, golden warm morning kitchen light, peaceful happy expression, 2D cartoon illustration, warm pastel colors",
      },
      {
        shot_description: "Wide shot: Noor and Grandpa Hassan smile at each other, golden light fills the kitchen",
        character: "Noor, Grandpa Hassan",
        environment: "warm cozy kitchen with Islamic patterns",
        lighting: "golden morning sunlight flooding the room",
        camera_angle: "wide shot",
        story_line: "The lesson is learned — a beautiful moment of connection",
        full_prompt: "young Muslim girl Noor in teal hijab and wise grandfather Grandpa Hassan smiling warmly at each other in a cozy Islamic kitchen, golden morning sunlight flooding the room, 2D cartoon illustration, heartwarming, soft golden colors",
      },
    ],
  },
  {
    title: "The Five Pillars of Islam",
    summary: "Ibrahim's class assignment is to explain the Five Pillars. Grandpa Hassan brings them to life through an imaginative journey showing each pillar in a fun, memorable way.",
    shots: [
      {
        shot_description: "Ibrahim sits at his desk looking at a blank piece of paper, looking confused",
        character: "Ibrahim",
        environment: "cozy child's bedroom with Islamic art on the wall, desk with lamp",
        lighting: "afternoon warm desk lamp light",
        camera_angle: "medium shot",
        story_line: "Ibrahim is stuck on his school homework",
        dialogue: "Five Pillars of Islam... where do I even start?",
        full_prompt: "young Muslim boy Ibrahim in white kufi cap sitting at desk looking confused at blank paper, cozy bedroom with Islamic art on wall, warm desk lamp light, thoughtful puzzled expression, 2D cartoon illustration",
      },
      {
        shot_description: "Grandpa Hassan knocks gently on the door holding a lantern",
        character: "Grandpa Hassan",
        environment: "bedroom doorway, hallway softly lit behind",
        lighting: "warm lantern glow",
        camera_angle: "medium shot",
        story_line: "Grandpa arrives to help with an imaginative approach",
        dialogue: "Ready for an adventure, ya Ibrahim?",
        full_prompt: "wise elderly Muslim grandfather with white beard and turban standing in bedroom doorway holding a glowing traditional lantern, warm magical glow, gentle smile, 2D cartoon illustration, magical warm atmosphere",
      },
      {
        shot_description: "Ibrahim and Grandpa stand before a glowing scroll that reads SHAHADA, rays of light emanating",
        character: "Ibrahim, Grandpa Hassan",
        environment: "magical glowing Islamic library with stars and geometric patterns",
        lighting: "golden magical light from the scroll",
        camera_angle: "wide shot",
        story_line: "First Pillar — Shahada (Declaration of Faith)",
        dialogue: "The First Pillar: There is no god but Allah, and Muhammad is His messenger.",
        full_prompt: "young Muslim boy and wise elderly grandfather standing before a glowing magical scroll inscribed with Shahada calligraphy, magical Islamic library with stars and geometric light patterns, golden divine light, 2D cartoon illustration, wondrous and awe-inspiring",
      },
      {
        shot_description: "Ibrahim mimics Grandpa praying Salah on a beautiful prayer rug, both in sujood",
        character: "Ibrahim, Grandpa Hassan",
        environment: "serene prayer room with soft carpet, window showing starry night sky",
        lighting: "soft moonlight through window, peaceful warm interior light",
        camera_angle: "side view medium shot",
        story_line: "Second Pillar — Salah (Prayer)",
        full_prompt: "young Muslim boy and elderly grandfather both in sujood position praying Salah on colorful prayer rugs, serene prayer room with moonlit window showing stars, soft peaceful lighting, 2D cartoon illustration, reverent and peaceful",
      },
      {
        shot_description: "Ibrahim smiling and dropping coins into a charity box, poor child receiving help in background",
        character: "Ibrahim",
        environment: "warm community center or marketplace, happy people around",
        lighting: "bright cheerful daylight",
        camera_angle: "medium shot",
        story_line: "Third Pillar — Zakat (Charity)",
        dialogue: "Sharing is caring — and it's what Allah loves!",
        full_prompt: "young Muslim boy Ibrahim happily dropping gold coins into charity box, background shows grateful poor child receiving help, warm busy community marketplace, bright cheerful daylight, 2D cartoon illustration, joyful generous moment",
      },
      {
        shot_description: "Ibrahim and Noor at the iftar table as the sun sets, about to break their fast",
        character: "Ibrahim, Noor",
        environment: "family dining table beautifully set for iftar, crescent moon visible through window",
        lighting: "warm golden sunset light through window",
        camera_angle: "medium wide shot",
        story_line: "Fourth Pillar — Sawm (Fasting during Ramadan)",
        dialogue: "Allahu Akbar! Time to break our fast!",
        full_prompt: "young Muslim boy and girl at beautifully decorated iftar table waiting to break fast at sunset, crescent moon through window, golden warm sunset light, traditional Islamic food on table, 2D cartoon illustration, joyful and festive",
      },
      {
        shot_description: "Grandpa points to an illustrated globe with the Kaaba in Mecca glowing at the center",
        character: "Grandpa Hassan",
        environment: "magical study room with floating globe and Islamic art",
        lighting: "magical golden light emanating from the Kaaba illustration",
        camera_angle: "medium shot",
        story_line: "Fifth Pillar — Hajj (Pilgrimage to Mecca)",
        dialogue: "And the Fifth Pillar — the great journey to the House of Allah.",
        full_prompt: "wise elderly Muslim grandfather pointing at magical floating globe with illustrated Kaaba in Mecca glowing golden at the center, magical Islamic study room, divine golden light, 2D cartoon illustration, majestic and wondrous",
      },
      {
        shot_description: "Ibrahim proudly holds up his finished assignment paper with all Five Pillars drawn",
        character: "Ibrahim",
        environment: "bedroom desk, lamp on, completed colorful drawing visible",
        lighting: "warm desk lamp light, evening",
        camera_angle: "medium close-up",
        story_line: "Ibrahim completes his homework with joy",
        dialogue: "I got it! Thank you, Grandpa!",
        full_prompt: "young Muslim boy Ibrahim holding up completed colorful school assignment showing the Five Pillars of Islam with drawings, proud and happy expression, bedroom desk with warm lamp light, 2D cartoon illustration",
      },
    ],
  },
  {
    title: "Ramadan Nights",
    summary: "The family prepares for Ramadan together — decorating the home, preparing for suhoor, and experiencing the spiritual beauty of the holy month.",
    shots: [
      {
        shot_description: "The family spots the crescent moon in the night sky from their rooftop — Ramadan has begun!",
        character: "Noor, Ibrahim, Mama Fatima, Grandpa Hassan",
        environment: "rooftop terrace at night, city lights below, clear starry sky",
        lighting: "moonlight and city glow, magical night atmosphere",
        camera_angle: "wide shot looking up at the crescent moon",
        story_line: "The family sights the Ramadan crescent moon together",
        dialogue: "Ramadan Mubarak, everyone!",
        full_prompt: "Muslim family — young girl in teal hijab, young boy in kufi, mother in white hijab, elderly grandfather — all looking up joyfully at crescent moon in starry night sky from rooftop, city lights below, magical moonlight, 2D cartoon illustration, festive joyful night scene",
      },
      {
        shot_description: "Noor and Ibrahim hang colorful Ramadan lanterns and stars around the living room",
        character: "Noor, Ibrahim",
        environment: "cozy living room being decorated with Ramadan lanterns, golden stars, crescent moon decorations",
        lighting: "warm glowing lantern light",
        camera_angle: "medium wide shot",
        story_line: "The children decorate the house for Ramadan",
        dialogue: "Let's make it the most beautiful Ramadan ever!",
        full_prompt: "young Muslim girl in teal hijab and young Muslim boy in kufi hanging colorful glowing Ramadan lanterns and golden stars in cozy living room, warm festive lantern light, cheerful and busy, 2D cartoon illustration, warm festive Ramadan atmosphere",
      },
      {
        shot_description: "Mama Fatima wakes Noor gently in the dark for suhoor, a soft light glows",
        character: "Mama Fatima, Noor",
        environment: "Noor's bedroom, very early morning before dawn, soft bedside lamp",
        lighting: "single soft warm bedside lamp in otherwise dark room",
        camera_angle: "close-up on their faces",
        story_line: "Waking up for the pre-dawn meal — suhoor",
        dialogue: "Habibti, time for suhoor. Come, let's eat before Fajr.",
        full_prompt: "Muslim mother in white hijab gently waking her young daughter Noor in teal hijab before dawn, cozy bedroom with single soft warm bedside lamp in darkness, tender loving close-up moment, 2D cartoon illustration, warm intimate quiet atmosphere",
      },
      {
        shot_description: "The whole family eats suhoor together at the predawn table, steam rising from food",
        character: "Noor, Ibrahim, Mama Fatima, Grandpa Hassan",
        environment: "family dining table, windows show predawn dark blue sky",
        lighting: "warm indoor light against dark outside",
        camera_angle: "medium wide shot",
        story_line: "Family suhoor meal before the fast begins",
        full_prompt: "Muslim family eating predawn suhoor meal together, young girl in teal hijab, boy in kufi, mother in white hijab, elderly grandfather, warm indoor light contrasting dark predawn blue sky through window, steam rising from food, 2D cartoon illustration, cozy family moment",
      },
      {
        shot_description: "Noor and Ibrahim listen to Grandpa recite Quran after Fajr, soft dawn light appears",
        character: "Noor, Ibrahim, Grandpa Hassan",
        environment: "prayer room with Quran on rehal (stand), soft blue dawn light through window",
        lighting: "soft blue dawn light mixing with warm interior light",
        camera_angle: "medium shot",
        story_line: "Quran recitation after the morning prayer",
        full_prompt: "wise elderly Muslim grandfather reciting from Quran on wooden rehal as two young children listen attentively, prayer room with soft blue dawn light through window, peaceful reverent atmosphere, 2D cartoon illustration",
      },
      {
        shot_description: "Iftar: the family breaks fast together with dates and water, eyes filled with gratitude",
        character: "Noor, Ibrahim, Mama Fatima, Grandpa Hassan",
        environment: "festive iftar table filled with traditional food, lanterns glowing, sunset light",
        lighting: "warm golden sunset flooding through windows, lantern glow",
        camera_angle: "wide shot of the whole family table",
        story_line: "Breaking the fast at sunset — the joy of iftar",
        dialogue: "Alhamdulillah! Allah accepted our fast today.",
        full_prompt: "Muslim family raising dates and glasses of water at beautiful iftar table to break their Ramadan fast, warm golden sunset light through windows mixed with glowing lanterns, joyful grateful expressions, traditional Islamic food, 2D cartoon illustration, festive and spiritual",
      },
    ],
  },
  {
    title: "The Honest Merchant",
    summary: "Ibrahim accidentally breaks a neighbor's vase while playing. He is tempted to hide it, but learns from Grandpa Hassan that honesty and taking responsibility is the Islamic way.",
    shots: [
      {
        shot_description: "Ibrahim kicking a ball outside near the neighbor's flower pots",
        character: "Ibrahim",
        environment: "sunny garden/courtyard outside, colorful flower pots along a wall",
        lighting: "bright afternoon sunlight",
        camera_angle: "medium wide shot",
        story_line: "Ibrahim is playing outside carelessly",
        full_prompt: "young Muslim boy Ibrahim in white kufi kicking a ball in a sunny courtyard garden with colorful flower pots along the wall, bright afternoon sunlight, active playful scene, 2D cartoon illustration",
      },
      {
        shot_description: "The ball hits a beautiful vase which shatters on the ground — Ibrahim looks shocked",
        character: "Ibrahim",
        environment: "garden courtyard, broken vase pieces scattered",
        lighting: "afternoon sunlight",
        camera_angle: "medium shot on Ibrahim's shocked face and broken vase",
        story_line: "Ibrahim breaks the neighbor's vase by accident",
        dialogue: "Oh no... not Auntie Sumaiya's vase!",
        full_prompt: "young Muslim boy Ibrahim in white kufi standing in shock as beautiful vase lies shattered on ground in sunny garden, horrified expression, broken pieces visible, 2D cartoon illustration, dramatic moment",
      },
      {
        shot_description: "Ibrahim hides behind a wall, looking left and right to see if anyone saw",
        character: "Ibrahim",
        environment: "garden wall, hiding in shadow",
        lighting: "afternoon light, Ibrahim in shadow",
        camera_angle: "close-up, secretive angle",
        story_line: "Ibrahim is tempted to run away and hide the truth",
        full_prompt: "young Muslim boy Ibrahim in white kufi hiding behind garden wall looking nervously left and right, shadow and light contrast, guilty worried expression, 2D cartoon illustration, tense secretive atmosphere",
      },
      {
        shot_description: "Grandpa Hassan appears from behind and puts a gentle hand on Ibrahim's shoulder",
        character: "Grandpa Hassan, Ibrahim",
        environment: "garden, afternoon, near the broken vase",
        lighting: "warm afternoon light",
        camera_angle: "medium shot from behind then turning to face",
        story_line: "Grandpa saw everything — now the teaching moment begins",
        dialogue: "I saw what happened, Ibrahim. What does your heart tell you to do?",
        full_prompt: "wise elderly Muslim grandfather with white beard gently placing hand on shoulder of young Muslim boy Ibrahim who looks guilty, garden setting with broken vase visible, warm afternoon light, tender but serious teaching moment, 2D cartoon illustration",
      },
      {
        shot_description: "Grandpa quotes the Prophet (PBUH) about honesty with words glowing in the air",
        character: "Grandpa Hassan",
        environment: "garden, soft magical glow around the calligraphy words",
        lighting: "warm golden light with magical glow on Arabic calligraphy",
        camera_angle: "medium close-up on Grandpa, calligraphy text visible",
        story_line: "The Hadith about honesty is shared",
        dialogue: "The Prophet, peace be upon him, said: 'Truthfulness leads to righteousness.'",
        full_prompt: "wise elderly Muslim grandfather speaking with gentle conviction, beautiful Arabic calligraphy glowing softly in the air beside him, warm golden magical light, garden setting, 2D cartoon illustration, spiritual and inspiring",
      },
      {
        shot_description: "Ibrahim knocks on the neighbor's door holding the broken pieces of the vase",
        character: "Ibrahim",
        environment: "neighbor's front door, afternoon",
        lighting: "warm afternoon light",
        camera_angle: "medium shot",
        story_line: "Ibrahim decides to tell the truth and take responsibility",
        dialogue: "Auntie Sumaiya... I accidentally broke your vase. I'm very sorry.",
        full_prompt: "young Muslim boy Ibrahim in white kufi standing at neighbor's front door holding broken vase pieces with sad but courageous honest expression, warm afternoon light, 2D cartoon illustration, brave honest moment",
      },
      {
        shot_description: "The elderly neighbor smiles and hugs Ibrahim — she forgives him and gives him a cookie",
        character: "Ibrahim",
        environment: "doorway, warm and welcoming",
        lighting: "warm inviting interior light from open door",
        camera_angle: "medium shot",
        story_line: "Honesty is rewarded with forgiveness and kindness",
        dialogue: "MashaAllah! What a good and honest boy you are!",
        full_prompt: "kind elderly woman in modest clothes hugging a young Muslim boy Ibrahim in white kufi at doorway, warm welcoming interior light, joyful forgiving moment, cookie visible in her hand, 2D cartoon illustration, heartwarming resolution",
      },
    ],
  },
  {
    title: "Helping Hands — Sadaqah in Action",
    summary: "Noor and Layla discover their elderly neighbor needs help. They organize a neighborhood effort to help her, learning about the rewards of sadaqah (charity) and helping others.",
    shots: [
      {
        shot_description: "Noor and Layla walk home from school and notice their elderly neighbor struggling with heavy bags",
        character: "Noor, Layla",
        environment: "neighborhood street, afternoon, houses with gardens",
        lighting: "warm golden afternoon light",
        camera_angle: "medium wide shot",
        story_line: "The girls notice someone who needs help",
        dialogue: "Look Layla — Auntie Maryam looks like she needs help!",
        full_prompt: "two young Muslim girls in colorful hijabs (teal and pink) walking home from school on a sunny neighborhood street noticing an elderly woman struggling with heavy shopping bags, warm golden afternoon light, 2D cartoon illustration, observant caring expressions",
      },
      {
        shot_description: "Noor and Layla rush over to the elderly neighbor and each take a bag from her",
        character: "Noor, Layla",
        environment: "neighborhood street in front of the neighbor's house",
        lighting: "warm afternoon sunlight",
        camera_angle: "medium shot",
        story_line: "The girls immediately act to help",
        dialogue: "Please let us help, Auntie! It's no trouble at all!",
        full_prompt: "two young Muslim girls in teal and pink hijabs eagerly helping elderly woman by taking heavy shopping bags from her, sunny neighborhood street, warm and cheerful, 2D cartoon illustration, helpfulness and kindness",
      },
      {
        shot_description: "The elderly neighbor tells the girls her garden needs tending too — weeds everywhere",
        character: "Noor, Layla",
        environment: "overgrown garden with weeds and drooping plants",
        lighting: "afternoon light",
        camera_angle: "wide shot of the garden",
        story_line: "The girls discover there is more help needed",
        dialogue: "I haven't been able to tend my garden for weeks...",
        full_prompt: "elderly woman showing two young Muslim girls her overgrown garden with weeds and neglected plants, sad but hopeful expression, warm afternoon light, 2D cartoon illustration",
      },
      {
        shot_description: "Noor talks to Ibrahim and other neighborhood kids, convincing them to come help",
        character: "Noor, Ibrahim",
        environment: "neighborhood playground or street corner",
        lighting: "afternoon light",
        camera_angle: "medium shot",
        story_line: "Noor organizes a group effort — community action",
        dialogue: "We can all help together! Allah loves those who help others!",
        full_prompt: "young Muslim girl Noor in teal hijab energetically talking to her brother Ibrahim and other neighborhood children, gathering them for a community helping effort, neighborhood street, afternoon light, 2D cartoon illustration, inspiring leadership",
      },
      {
        shot_description: "A team of children work together in the garden — weeding, watering, planting flowers",
        character: "Noor, Ibrahim, Layla",
        environment: "garden transforming from overgrown to beautiful, sunny afternoon",
        lighting: "bright warm afternoon sunlight",
        camera_angle: "wide shot of garden teamwork",
        story_line: "Collective sadaqah in action — community coming together",
        full_prompt: "group of Muslim children in colorful hijabs and kufi working together joyfully in a garden — weeding, watering, planting colorful flowers, sunny afternoon, 2D cartoon illustration, vibrant teamwork and joy",
      },
      {
        shot_description: "The elderly neighbor weeps happy tears seeing her transformed beautiful garden",
        character: "Noor, Layla",
        environment: "beautiful transformed garden, sunset golden hour",
        lighting: "beautiful golden sunset light over the garden",
        camera_angle: "wide shot then close-up on happy tears",
        story_line: "The impact of their sadaqah is fully felt",
        dialogue: "JazakAllah Khayr, my dear children. May Allah bless you always.",
        full_prompt: "elderly woman with happy tears seeing her beautifully transformed garden filled with colorful flowers, two young Muslim girls in hijabs smiling beside her, beautiful golden sunset light, 2D cartoon illustration, deeply heartwarming",
      },
      {
        shot_description: "Grandpa Hassan and Mama Fatima watch from the gate and smile proudly",
        character: "Grandpa Hassan, Mama Fatima",
        environment: "garden gate, golden sunset",
        lighting: "warm golden sunset",
        camera_angle: "medium shot on proud parents/grandparent",
        story_line: "The family witnesses the children's good deed",
        dialogue: "MashaAllah. Allah is pleased with them today.",
        full_prompt: "wise elderly Muslim grandfather and Muslim mother in white hijab standing at garden gate watching proudly with warm smiles, golden sunset light, 2D cartoon illustration, proud loving family moment",
      },
    ],
  },
];

// ──────────────────────────────────────────────────────
// Main seed function
// ──────────────────────────────────────────────────────

async function main() {
  console.log("🌙 Seeding Islamic Cartoon: Noor's Adventures\n");

  // 1. Login
  console.log("🔐 Logging in...");
  const cookie = await login();
  console.log("   ✓ Authenticated\n");

  // 2. Create project
  console.log(`📁 Creating project: ${PROJECT_NAME}`);
  const project = await post<{ id: string; name: string }>(cookie, "/api/projects", { name: PROJECT_NAME });
  console.log(`   ✓ Project created: ${project.id}\n`);

  // 3. Create characters
  console.log(`👤 Creating ${CHARACTERS.length} characters...`);
  const charIds: Record<string, string> = {};
  for (const c of CHARACTERS) {
    const char = await post<{ id: string; name: string }>(cookie, `/api/projects/${project.id}/characters`, c);
    charIds[c.name] = char.id;
    console.log(`   ✓ ${c.name} (${c.role})`);
  }
  console.log();

  // 4. Create episodes + shots
  for (const ep of EPISODES) {
    console.log(`📺 Creating episode: ${ep.title}`);
    const episode = await post<{ id: string; number: number }>(cookie, `/api/projects/${project.id}/episodes`, {
      title: ep.title,
      summary: ep.summary,
    });
    console.log(`   ✓ Episode ${episode.number} created: ${episode.id}`);

    console.log(`   🎬 Creating ${ep.shots.length} shots...`);
    for (let i = 0; i < ep.shots.length; i++) {
      const s = ep.shots[i];
      await post(cookie, `/api/episodes/${episode.id}/shots`, s);
      process.stdout.write(`   ✓ Shot ${i + 1}/${ep.shots.length}\r`);
    }
    console.log(`   ✓ All ${ep.shots.length} shots created\n`);
  }

  console.log("🎉 Done! Summary:");
  console.log(`   Project : ${PROJECT_NAME}`);
  console.log(`   Characters : ${CHARACTERS.length}`);
  console.log(`   Episodes   : ${EPISODES.length}`);
  const totalShots = EPISODES.reduce((n, e) => n + e.shots.length, 0);
  console.log(`   Total Shots: ${totalShots}`);
  console.log(`\n   Open: http://localhost:3000/projects/${project.id}`);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
