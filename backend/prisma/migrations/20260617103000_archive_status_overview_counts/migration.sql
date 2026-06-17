ALTER TABLE "archive_status_definitions"
  ADD COLUMN "show_count_on_overview" BOOLEAN NOT NULL DEFAULT false;

UPDATE "archive_status_definitions"
SET "show_count_on_overview" = true
WHERE "behavior_group" IN ('active', 'waiting');
