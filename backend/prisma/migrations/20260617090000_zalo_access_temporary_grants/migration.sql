ALTER TABLE "zalo_account_access"
  ADD COLUMN "grant_source" TEXT,
  ADD COLUMN "grant_source_id" TEXT,
  ADD COLUMN "grant_expires_at" TIMESTAMP(3),
  ADD COLUMN "grant_previous_permission" TEXT;

CREATE INDEX "zalo_account_access_grant_source_expires_idx"
  ON "zalo_account_access"("grant_source", "grant_expires_at");
