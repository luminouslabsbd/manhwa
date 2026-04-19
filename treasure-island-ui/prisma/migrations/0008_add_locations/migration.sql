-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference_image" TEXT,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "shots" ADD COLUMN "location_id" TEXT;
