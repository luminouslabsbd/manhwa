-- Per-pod record of which catalog Model.id values were requested at creation.
-- Rendered back to the admin UI so each pod row shows the installed models
-- and their per-service readiness. Dropped when the pod is deleted.
CREATE TABLE "pod_models" (
    "pod_id"     TEXT   NOT NULL,
    "model_ids"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TEXT   NOT NULL,
    CONSTRAINT "pod_models_pkey" PRIMARY KEY ("pod_id")
);
