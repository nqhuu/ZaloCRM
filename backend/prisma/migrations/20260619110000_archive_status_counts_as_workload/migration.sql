ALTER TABLE "archive_status_definitions"
  ADD COLUMN "counts_as_workload" BOOLEAN NOT NULL DEFAULT false;

UPDATE "archive_status_definitions"
SET "counts_as_workload" = true
WHERE "behavior_group" IN ('active', 'waiting');
