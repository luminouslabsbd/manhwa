-- CreateTable
CREATE TABLE IF NOT EXISTS "frames" (
    "id" TEXT NOT NULL,
    "shot_id" TEXT NOT NULL,
    "frame_number" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "needed" BOOLEAN NOT NULL DEFAULT true,
    "image_path" TEXT,
    "video_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "ai_suggested" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "frames_pkey" PRIMARY KEY ("id")
);
