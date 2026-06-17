ALTER TABLE "zalo_accounts"
  ADD COLUMN "department_id" TEXT;

ALTER TABLE "zalo_account_access"
  ADD COLUMN "assignment_role" TEXT;

ALTER TABLE "zalo_accounts"
  ADD CONSTRAINT "zalo_accounts_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "zalo_account_access"
  ADD CONSTRAINT "zalo_account_access_assignment_role_check"
  CHECK ("assignment_role" IS NULL OR "assignment_role" IN ('primary', 'secondary_1', 'secondary_2'));

CREATE UNIQUE INDEX "zalo_account_access_active_assignment_role_key"
  ON "zalo_account_access"("zalo_account_id", "assignment_role")
  WHERE "assignment_role" IS NOT NULL;

CREATE INDEX "zalo_accounts_department_id_deleted_at_idx"
  ON "zalo_accounts"("department_id", "deleted_at");

UPDATE "zalo_accounts" AS account
SET "department_id" = member."department_id"
FROM "department_members" AS member
WHERE member."user_id" = account."owner_user_id"
  AND account."department_id" IS NULL;

CREATE TABLE "archive_assignment_transfer_requests" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "from_user_id" TEXT NOT NULL,
  "to_user_id" TEXT NOT NULL,
  "requested_by_user_id" TEXT NOT NULL,
  "responded_by_user_id" TEXT,
  "request_type" TEXT NOT NULL DEFAULT 'consent',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reason" TEXT NOT NULL,
  "response_note" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "responded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "archive_assignment_transfer_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "archive_assignment_transfer_requests_type_check"
    CHECK ("request_type" IN ('consent', 'manager_override')),
  CONSTRAINT "archive_assignment_transfer_requests_status_check"
    CHECK ("status" IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired', 'superseded', 'invalidated'))
);

CREATE TABLE "archive_assignment_history" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "from_user_id" TEXT,
  "to_user_id" TEXT NOT NULL,
  "changed_by_user_id" TEXT NOT NULL,
  "transfer_request_id" TEXT,
  "change_type" TEXT NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "archive_assignment_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "archive_assignment_transfer_requests"
  ADD CONSTRAINT "archive_assignment_transfer_requests_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_assignment_transfer_requests_story_id_fkey"
  FOREIGN KEY ("story_id") REFERENCES "archive_stories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_assignment_transfer_requests_from_user_id_fkey"
  FOREIGN KEY ("from_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_assignment_transfer_requests_to_user_id_fkey"
  FOREIGN KEY ("to_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_assignment_transfer_requests_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_assignment_transfer_requests_responded_by_user_id_fkey"
  FOREIGN KEY ("responded_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "archive_assignment_history"
  ADD CONSTRAINT "archive_assignment_history_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_assignment_history_story_id_fkey"
  FOREIGN KEY ("story_id") REFERENCES "archive_stories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_assignment_history_from_user_id_fkey"
  FOREIGN KEY ("from_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_assignment_history_to_user_id_fkey"
  FOREIGN KEY ("to_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_assignment_history_changed_by_user_id_fkey"
  FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_assignment_history_transfer_request_id_fkey"
  FOREIGN KEY ("transfer_request_id") REFERENCES "archive_assignment_transfer_requests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "archive_assignment_transfer_requests_one_pending_per_story"
  ON "archive_assignment_transfer_requests"("story_id")
  WHERE "status" = 'pending';

CREATE INDEX "archive_assignment_transfer_requests_story_id_status_idx"
  ON "archive_assignment_transfer_requests"("story_id", "status");

CREATE INDEX "archive_assignment_transfer_requests_to_user_id_status_expires_at_idx"
  ON "archive_assignment_transfer_requests"("to_user_id", "status", "expires_at");

CREATE INDEX "archive_assignment_transfer_requests_org_id_status_created_at_idx"
  ON "archive_assignment_transfer_requests"("org_id", "status", "created_at");

CREATE INDEX "archive_assignment_history_story_id_created_at_idx"
  ON "archive_assignment_history"("story_id", "created_at");

CREATE INDEX "archive_assignment_history_to_user_id_created_at_idx"
  ON "archive_assignment_history"("to_user_id", "created_at");
