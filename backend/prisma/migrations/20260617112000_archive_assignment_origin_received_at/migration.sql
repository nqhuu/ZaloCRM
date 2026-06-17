ALTER TABLE "archive_stories"
  ADD COLUMN "received_at" TIMESTAMP(3),
  ADD COLUMN "assignment_origin" TEXT NOT NULL DEFAULT 'initial';

UPDATE "archive_stories" story
SET "received_at" = first_message."sent_at"
FROM (
  SELECT "story_id", MIN("sent_at") AS "sent_at"
  FROM "archive_messages"
  GROUP BY "story_id"
) first_message
WHERE story."id" = first_message."story_id"
  AND story."received_at" IS NULL;

UPDATE "archive_stories" story
SET "assignment_origin" = CASE
  WHEN history."change_type" = 'accepted_handover' THEN 'handover'
  WHEN history."change_type" = 'manager_override' THEN 'manager_override'
  ELSE story."assignment_origin"
END
FROM (
  SELECT DISTINCT ON ("story_id")
    "story_id",
    "change_type",
    "created_at"
  FROM "archive_assignment_history"
  WHERE "change_type" IN ('accepted_handover', 'manager_override')
  ORDER BY "story_id", "created_at" DESC
) history
WHERE story."id" = history."story_id";

CREATE INDEX "archive_stories_org_received_at_idx"
  ON "archive_stories"("org_id", "received_at");

CREATE INDEX "archive_stories_org_assignment_origin_updated_idx"
  ON "archive_stories"("org_id", "assignment_origin", "updated_at");
