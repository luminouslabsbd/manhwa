/**
 * Setup script: creates the superadmin user and migrates all existing
 * unassigned projects to them.
 *
 * Usage:
 *   npx tsx scripts/setup-admin.ts
 *
 * Env vars read from .env.local:
 *   ADMIN_EMAIL    (default: admin@studio.local)
 *   ADMIN_PASSWORD (default: ChangeMe123!)
 *   ADMIN_NAME     (default: Super Admin)
 *   DATABASE_URL   (required)
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter } as any);

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "admin@studio.local").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
const ADMIN_NAME = process.env.ADMIN_NAME ?? "Super Admin";

async function main() {
  console.log("=== Manhwa Studio — Admin Setup ===\n");

  // 1. Ensure the admin user exists
  let admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (admin) {
    console.log(`Admin user already exists: ${admin.email} (id: ${admin.id})`);
  } else {
    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12);
    admin = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: ADMIN_EMAIL,
        password: hashed,
        name: ADMIN_NAME,
        role: "SUPERADMIN",
        is_active: true,
        created_at: new Date().toISOString(),
      },
    });
    console.log(`Created admin user: ${admin.email} (id: ${admin.id})`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    console.log("  !! Change this password after first login !!\n");
  }

  // 2. Migrate unassigned projects to the admin user
  const unassigned = await prisma.project.count({ where: { user_id: null } });
  if (unassigned === 0) {
    console.log("No unassigned projects to migrate.");
  } else {
    const result = await prisma.project.updateMany({
      where: { user_id: null },
      data: { user_id: admin.id },
    });
    console.log(`Migrated ${result.count} project(s) → user ${admin.email}`);
  }

  // 3. Summary
  const totalProjects = await prisma.project.count({ where: { user_id: admin.id } });
  console.log(`\nAdmin now owns ${totalProjects} project(s).`);
  console.log("\nDone. You can now log in at /login\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
