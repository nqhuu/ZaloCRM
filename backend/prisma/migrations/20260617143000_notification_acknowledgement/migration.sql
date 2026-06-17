-- Notification lifecycle fields for Facebook-style bell and required acknowledgement.
ALTER TABLE "archive_notifications"
  ADD COLUMN IF NOT EXISTS "seen_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "requires_ack" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acknowledged_by_user_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'archive_notifications_acknowledged_by_user_id_fkey'
  ) THEN
    ALTER TABLE "archive_notifications"
      ADD CONSTRAINT "archive_notifications_acknowledged_by_user_id_fkey"
      FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "archive_notifications_org_id_user_id_requires_ack_acknowledged_at_created_at_idx"
  ON "archive_notifications"("org_id", "user_id", "requires_ack", "acknowledged_at", "created_at");

UPDATE "archive_notifications"
SET "requires_ack" = true
WHERE "type" = 'message_recalled';
