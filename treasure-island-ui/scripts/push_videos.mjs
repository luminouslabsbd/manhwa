// Upload 24 LTX videos to DO Spaces + insert Generation records in prod DB.
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const PROJECT_ID = "9a59a6ac-ef8b-4b1d-baf2-7ca97925a33c";
const EPISODE_ID = "1419fd94-e1be-4d87-aa07-45dc862f5360";

const S3 = new S3Client({
  endpoint: "https://sgp1.digitaloceanspaces.com",
  region: "sgp1",
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
  },
  forcePathStyle: false,
});
const BUCKET = process.env.DO_SPACES_BUCKET;
const PREFIX = process.env.DO_SPACES_PREFIX ?? "manhwa-studio";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Get all shots with approved images in the episode, sorted by shot_number
  const shots = await prisma.shot.findMany({
    where: { episode_id: EPISODE_ID },
    orderBy: { shot_number: "asc" },
  });
  console.log(`Found ${shots.length} shots in episode`);

  const videosDir = "/tmp/episode_ltx";
  const videoFiles = fs.readdirSync(videosDir)
    .filter(f => f.startsWith("shot_") && f.endsWith(".mp4"))
    .sort();
  console.log(`Have ${videoFiles.length} video files`);

  let uploaded = 0, failed = 0;
  for (let i = 0; i < Math.min(shots.length, videoFiles.length); i++) {
    const shot = shots[i];
    const file = videoFiles[i]; // shot_01.mp4 → shot index 0 → shots[0] = S1
    if (!shot.approved_image_ids?.length && !shot.approved_image_id) {
      console.log(`  skip ${file} — no approved image on S${shot.shot_number}`);
      continue;
    }

    const buf = fs.readFileSync(path.join(videosDir, file));
    const filename = `ltx_${randomUUID()}.mp4`;
    const relativePath = `/generated/${PROJECT_ID}/${filename}`;
    const key = `${PREFIX}${relativePath}`;

    try {
      await S3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buf,
        ACL: "public-read",
        ContentType: "video/mp4",
      }));
      console.log(`  ✓ uploaded ${file} → ${key}`);
    } catch (e) {
      console.error(`  ✗ upload failed ${file}: ${e.message}`);
      failed++;
      continue;
    }

    // Find the approved image to link as reference
    const approvedId = shot.approved_image_ids?.at(-1) ?? shot.approved_image_id;
    const approvedGen = approvedId ? await prisma.generation.findUnique({ where: { id: approvedId } }) : null;

    await prisma.generation.create({
      data: {
        id: randomUUID(),
        shot_id: shot.id,
        type: "video:ltx2",
        comfyui_prompt_id: null,
        status: "completed",
        seed: null,
        image_path: approvedGen?.image_path ?? null,
        video_path: relativePath,
        audio_path: shot.audio_path ?? null,
        voice: null,
        error: null,
        ref_image: approvedGen?.image_path ?? null,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
    });
    uploaded++;
  }

  console.log(`\nDone: ${uploaded} uploaded, ${failed} failed`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
