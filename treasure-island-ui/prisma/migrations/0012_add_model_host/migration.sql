-- Optional host URL per catalog row for targeted health probing.
-- Blank = use the category's global active host when running the Test button.
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "host" TEXT NOT NULL DEFAULT '';
