ALTER TABLE "archive_stories"
  ADD COLUMN IF NOT EXISTS "order_code" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "requires_confirmation" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "extra_note" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_id" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_name_snapshot" TEXT;

CREATE INDEX IF NOT EXISTS "archive_stories_org_order_code_idx"
  ON "archive_stories"("org_id", "order_code");

CREATE INDEX IF NOT EXISTS "archive_stories_org_priority_updated_at_idx"
  ON "archive_stories"("org_id", "priority", "updated_at");

CREATE INDEX IF NOT EXISTS "archive_stories_org_requires_confirmation_updated_at_idx"
  ON "archive_stories"("org_id", "requires_confirmation", "updated_at");

CREATE INDEX IF NOT EXISTS "archive_stories_org_customer_id_idx"
  ON "archive_stories"("org_id", "customer_id");
