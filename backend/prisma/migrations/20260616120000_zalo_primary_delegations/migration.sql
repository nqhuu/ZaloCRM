CREATE TABLE "zalo_account_primary_delegations" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "zalo_account_id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "base_primary_user_id" TEXT NOT NULL,
  "delegate_user_id" TEXT NOT NULL,
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT '+07:00',
  "reason" TEXT,
  "cancelled_at" TIMESTAMP(3),
  "cancelled_by_user_id" TEXT,
  "cancel_reason" TEXT,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "zalo_account_primary_delegations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "zalo_account_primary_delegations_date_check"
    CHECK ("end_date" >= "start_date"),
  CONSTRAINT "zalo_account_primary_delegations_delegate_check"
    CHECK ("delegate_user_id" <> "base_primary_user_id")
);

ALTER TABLE "zalo_account_primary_delegations"
  ADD CONSTRAINT "zalo_account_primary_delegations_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "zalo_account_primary_delegations_zalo_account_id_fkey"
  FOREIGN KEY ("zalo_account_id") REFERENCES "zalo_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "zalo_account_primary_delegations_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "zalo_account_primary_delegations_base_primary_user_id_fkey"
  FOREIGN KEY ("base_primary_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "zalo_account_primary_delegations_delegate_user_id_fkey"
  FOREIGN KEY ("delegate_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "zalo_account_primary_delegations_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "zalo_account_primary_delegations_cancelled_by_user_id_fkey"
  FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "zalo_account_primary_delegations_account_range_idx"
  ON "zalo_account_primary_delegations"("zalo_account_id", "start_date", "end_date");

CREATE INDEX "zalo_account_primary_delegations_org_cancelled_idx"
  ON "zalo_account_primary_delegations"("org_id", "cancelled_at");

