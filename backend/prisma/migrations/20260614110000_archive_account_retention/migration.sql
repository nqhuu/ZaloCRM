ALTER TABLE "zalo_accounts"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by_user_id" TEXT,
  ADD COLUMN "deletion_reason" TEXT;

ALTER TABLE "archive_stories"
  ADD COLUMN "zalo_account_display_name_snapshot" TEXT,
  ADD COLUMN "zalo_account_uid_snapshot" TEXT,
  ADD COLUMN "zalo_account_deleted_at" TIMESTAMP(3);

UPDATE "archive_stories" AS story
SET
  "zalo_account_display_name_snapshot" = account."display_name",
  "zalo_account_uid_snapshot" = account."zalo_uid",
  "zalo_account_deleted_at" = account."deleted_at"
FROM "zalo_accounts" AS account
WHERE account."id" = story."zalo_account_id";

CREATE INDEX "zalo_accounts_org_id_deleted_at_idx"
  ON "zalo_accounts"("org_id", "deleted_at");
