-- CreateTable
CREATE TABLE "app_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "video_model" TEXT NOT NULL DEFAULT 'wan2',
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton row
INSERT INTO "app_config" ("id", "video_model", "updated_at")
VALUES ('default', 'wan2', NOW()::TEXT)
ON CONFLICT ("id") DO NOTHING;
