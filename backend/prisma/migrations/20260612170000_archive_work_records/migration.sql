ALTER TABLE "archive_stories"
  ADD COLUMN "department_id" TEXT,
  ADD COLUMN "record_type" TEXT NOT NULL DEFAULT 'order';

ALTER TABLE "archive_messages"
  ADD COLUMN "duplicate_confirmed_by_user_id" TEXT,
  ADD COLUMN "duplicate_confirmed_at" TIMESTAMP(3);

ALTER TABLE "archive_stories"
  ADD CONSTRAINT "archive_stories_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "archive_messages"
  ADD CONSTRAINT "archive_messages_duplicate_confirmed_by_user_id_fkey"
  FOREIGN KEY ("duplicate_confirmed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "archive_stories_department_id_business_status_created_at_idx"
  ON "archive_stories"("department_id", "business_status", "created_at");

UPDATE "archive_stories" AS story
SET "department_id" = member."department_id"
FROM "department_members" AS member
WHERE member."user_id" = COALESCE(story."assigned_user_id", story."created_by_user_id")
  AND story."department_id" IS NULL;

UPDATE "archive_stories"
SET "title" = "conversation_name"
WHERE "title" IS NULL OR btrim("title") = '';

UPDATE "permission_groups"
SET "grants" = "grants" || jsonb_build_object(
  'archive',
  CASE
    WHEN "name" = 'Admin' THEN '{"access":true,"create":true,"edit":true,"delete":true,"approve":true,"view_all":true}'::jsonb
    WHEN "name" IN ('CEO', 'Trưởng phòng') THEN '{"access":true,"create":true,"edit":true,"delete":true,"approve":true,"view_all":true}'::jsonb
    WHEN "name" = 'Sale Senior' THEN '{"access":true,"create":true,"edit":true,"delete":true,"approve":true}'::jsonb
    WHEN "name" = 'Sale' THEN '{"access":true,"create":true,"edit":true}'::jsonb
    ELSE '{}'::jsonb
  END
)
WHERE "archived_at" IS NULL
  AND "name" IN ('Admin', 'CEO', 'Trưởng phòng', 'Sale Senior', 'Sale');
