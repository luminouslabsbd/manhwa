-- Admin-managed API keys / secrets. Plaintext (DB is access-controlled).
-- Consumers resolve via lib/secrets.ts getSecret(name) which prefers this
-- row and falls back to process.env[name].
CREATE TABLE "app_secrets" (
    "name"        TEXT NOT NULL,
    "value"       TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "updated_at"  TEXT NOT NULL,
    CONSTRAINT "app_secrets_pkey" PRIMARY KEY ("name")
);
