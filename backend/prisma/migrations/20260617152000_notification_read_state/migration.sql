CREATE TABLE IF NOT EXISTS "notification_reads" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "notification_key" TEXT NOT NULL,
  "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_reads_org_id_user_id_notification_key_key"
  ON "notification_reads"("org_id", "user_id", "notification_key");

CREATE INDEX IF NOT EXISTS "notification_reads_org_id_user_id_read_at_idx"
  ON "notification_reads"("org_id", "user_id", "read_at");

ALTER TABLE "notification_reads"
  ADD CONSTRAINT "notification_reads_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_reads"
  ADD CONSTRAINT "notification_reads_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
