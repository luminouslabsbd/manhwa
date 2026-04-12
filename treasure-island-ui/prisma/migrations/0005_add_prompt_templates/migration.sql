ALTER TABLE "shots" ADD COLUMN IF NOT EXISTS "prompt_template_id" TEXT;

CREATE TABLE IF NOT EXISTS "prompt_templates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "formula" TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TEXT NOT NULL
);
