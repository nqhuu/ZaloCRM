-- Store Google Sheet customer rows as a staging/snapshot layer before applying
-- them into canonical CRM CustomerProfile records.
CREATE TABLE "customer_source_snapshots" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "sync_run_id" TEXT NOT NULL,
  "source_row_number" INTEGER NOT NULL,
  "source_row_key" TEXT,
  "raw_row" JSONB NOT NULL,
  "normalized_data" JSONB NOT NULL,
  "row_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'new',
  "action" TEXT NOT NULL DEFAULT 'no_op',
  "error_message" TEXT,
  "matched_customer_profile_id" TEXT,
  "applied_at" TIMESTAMP(3),
  "ignored_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_source_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_source_snapshots_org_id_source_id_idx"
  ON "customer_source_snapshots"("org_id", "source_id");

CREATE INDEX "customer_source_snapshots_sync_run_id_status_idx"
  ON "customer_source_snapshots"("sync_run_id", "status");

CREATE INDEX "customer_source_snapshots_source_id_source_row_key_idx"
  ON "customer_source_snapshots"("source_id", "source_row_key");

ALTER TABLE "customer_source_snapshots"
  ADD CONSTRAINT "customer_source_snapshots_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_source_snapshots"
  ADD CONSTRAINT "customer_source_snapshots_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "customer_data_sources"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_source_snapshots"
  ADD CONSTRAINT "customer_source_snapshots_sync_run_id_fkey"
  FOREIGN KEY ("sync_run_id") REFERENCES "customer_sync_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
