ALTER TABLE "customer_data_sources"
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "archived_by_user_id" TEXT,
  ADD COLUMN "archive_reason" TEXT;

CREATE INDEX "customer_data_sources_org_id_archived_at_updated_at_idx"
  ON "customer_data_sources"("org_id", "archived_at", "updated_at");

ALTER TABLE "customer_data_sources"
  ADD CONSTRAINT "customer_data_sources_archived_by_user_id_fkey"
  FOREIGN KEY ("archived_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing system groups receive a conservative default. Custom groups remain
-- default-deny and can be configured from the permission matrix.
UPDATE "permission_groups"
SET "grants" = jsonb_set(
  COALESCE("grants", '{}'::jsonb),
  '{customer_source}',
  '{"access":true,"create":true,"edit":true,"delete":true,"view_all":true}'::jsonb,
  true
)
WHERE "is_system" = true AND "name" IN ('Admin', 'Trưởng phòng');

UPDATE "permission_groups"
SET "grants" = jsonb_set(
  COALESCE("grants", '{}'::jsonb),
  '{customer_source}',
  '{"access":true,"view_all":true}'::jsonb,
  true
)
WHERE "is_system" = true AND "name" = 'CEO';
