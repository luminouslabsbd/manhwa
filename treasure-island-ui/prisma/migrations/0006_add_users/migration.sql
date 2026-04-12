-- CreateTable: users
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique email
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AlterTable: add user_id to projects
ALTER TABLE "projects" ADD COLUMN "user_id" TEXT;
