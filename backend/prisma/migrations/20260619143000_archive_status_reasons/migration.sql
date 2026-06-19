-- Archive status reasons: per-status reason catalog + snapshots for reporting.

ALTER TABLE "archive_status_definitions"
ADD COLUMN IF NOT EXISTS "require_reason" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "archive_status_reasons" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "status_definition_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "archive_status_reasons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "archive_status_reasons_status_definition_id_code_key"
ON "archive_status_reasons" ("status_definition_id", "code");

CREATE INDEX IF NOT EXISTS "archive_status_reasons_org_id_status_definition_id_is_active_display_order_idx"
ON "archive_status_reasons" ("org_id", "status_definition_id", "is_active", "display_order");

ALTER TABLE "archive_status_reasons"
ADD CONSTRAINT "archive_status_reasons_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "archive_status_reasons"
ADD CONSTRAINT "archive_status_reasons_status_definition_id_fkey"
FOREIGN KEY ("status_definition_id") REFERENCES "archive_status_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "archive_status_reasons"
ADD CONSTRAINT "archive_status_reasons_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "archive_stories"
ADD COLUMN IF NOT EXISTS "status_reason_id" TEXT,
ADD COLUMN IF NOT EXISTS "status_reason_code_snapshot" TEXT,
ADD COLUMN IF NOT EXISTS "status_reason_name_snapshot" TEXT;

CREATE INDEX IF NOT EXISTS "archive_stories_org_id_status_reason_id_updated_at_idx"
ON "archive_stories" ("org_id", "status_reason_id", "updated_at");

ALTER TABLE "archive_stories"
ADD CONSTRAINT "archive_stories_status_reason_id_fkey"
FOREIGN KEY ("status_reason_id") REFERENCES "archive_status_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "archive_status_history"
ADD COLUMN IF NOT EXISTS "reason_id" TEXT,
ADD COLUMN IF NOT EXISTS "reason_code_snapshot" TEXT,
ADD COLUMN IF NOT EXISTS "reason_name_snapshot" TEXT;

CREATE INDEX IF NOT EXISTS "archive_status_history_reason_id_idx"
ON "archive_status_history" ("reason_id");

ALTER TABLE "archive_status_history"
ADD CONSTRAINT "archive_status_history_reason_id_fkey"
FOREIGN KEY ("reason_id") REFERENCES "archive_status_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
