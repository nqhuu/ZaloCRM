-- Customer master data imported from Google Sheets.
-- Legacy codes are external business keys from existing Sheets, not CRM ids.

-- User / department legacy mapping fields.
ALTER TABLE "users" ADD COLUMN "legacy_employee_code" TEXT;
ALTER TABLE "departments" ADD COLUMN "legacy_department_code" TEXT;

-- Lookup table for customer type codes such as LDLO / LDVN.
CREATE TABLE "customer_types" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_types_pkey" PRIMARY KEY ("id")
);

-- Configured Google Sheet sources for customer master sync.
CREATE TABLE "customer_data_sources" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data_type" TEXT NOT NULL DEFAULT 'customer_master',
    "provider" TEXT NOT NULL DEFAULT 'google_sheet',
    "spreadsheet_id" TEXT NOT NULL,
    "sheet_name" TEXT NOT NULL,
    "range" TEXT,
    "header_row" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sync_mode" TEXT NOT NULL DEFAULT 'manual',
    "schedule_cron" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "last_sync_status" TEXT,
    "last_sync_error" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_data_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_data_source_column_maps" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "target_field" TEXT NOT NULL,
    "source_header" TEXT NOT NULL,
    "transform_rule" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_data_source_column_maps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_sync_runs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "triggered_by_user_id" TEXT,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_sync_row_errors" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "external_key" TEXT,
    "error_type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "raw_row" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sync_row_errors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_profile_contacts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "customer_profile_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'other',
    "title" TEXT,
    "department" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "raw_text" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "linked_by_user_id" TEXT,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profile_contacts_pkey" PRIMARY KEY ("id")
);

-- Expand existing profile table from group-link phase into B2B customer master.
ALTER TABLE "customer_profiles"
ADD COLUMN "short_name" TEXT,
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'business',
ADD COLUMN "tax_code" TEXT,
ADD COLUMN "main_phone" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "province_or_region" TEXT,
ADD COLUMN "office_address" TEXT,
ADD COLUMN "shipping_address" TEXT,
ADD COLUMN "legal_representative_raw" TEXT,
ADD COLUMN "active_since" TIMESTAMP(3),
ADD COLUMN "first_transaction_date" TIMESTAMP(3),
ADD COLUMN "owner_user_id" TEXT,
ADD COLUMN "sales_owner_code_snapshot" TEXT,
ADD COLUMN "managing_department_id" TEXT,
ADD COLUMN "managing_department_code_snapshot" TEXT,
ADD COLUMN "customer_type_id" TEXT,
ADD COLUMN "customer_type_code_snapshot" TEXT,
ADD COLUMN "source_id" TEXT,
ADD COLUMN "source_row_number" INTEGER,
ADD COLUMN "missing_from_source" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "source_missing_since" TIMESTAMP(3);

-- Indexes.
CREATE INDEX "users_org_id_legacy_employee_code_idx" ON "users"("org_id", "legacy_employee_code");
CREATE INDEX "departments_org_id_legacy_department_code_idx" ON "departments"("org_id", "legacy_department_code");

CREATE INDEX "customer_profiles_org_id_type_idx" ON "customer_profiles"("org_id", "type");
CREATE INDEX "customer_profiles_org_id_owner_user_id_idx" ON "customer_profiles"("org_id", "owner_user_id");
CREATE INDEX "customer_profiles_org_id_managing_department_id_idx" ON "customer_profiles"("org_id", "managing_department_id");
CREATE INDEX "customer_profiles_org_id_customer_type_id_idx" ON "customer_profiles"("org_id", "customer_type_id");
CREATE INDEX "customer_profiles_source_id_source_row_number_idx" ON "customer_profiles"("source_id", "source_row_number");
CREATE INDEX "customer_profiles_org_id_missing_from_source_idx" ON "customer_profiles"("org_id", "missing_from_source");

CREATE INDEX "customer_types_org_id_is_active_idx" ON "customer_types"("org_id", "is_active");
CREATE UNIQUE INDEX "customer_types_org_id_code_key" ON "customer_types"("org_id", "code");

CREATE INDEX "customer_data_sources_org_id_data_type_enabled_idx" ON "customer_data_sources"("org_id", "data_type", "enabled");
CREATE INDEX "customer_data_source_column_maps_source_id_source_header_idx" ON "customer_data_source_column_maps"("source_id", "source_header");
CREATE UNIQUE INDEX "customer_data_source_column_maps_source_id_target_field_key" ON "customer_data_source_column_maps"("source_id", "target_field");

CREATE INDEX "customer_sync_runs_org_id_started_at_idx" ON "customer_sync_runs"("org_id", "started_at");
CREATE INDEX "customer_sync_runs_source_id_started_at_idx" ON "customer_sync_runs"("source_id", "started_at");
CREATE INDEX "customer_sync_row_errors_run_id_row_number_idx" ON "customer_sync_row_errors"("run_id", "row_number");

CREATE INDEX "customer_profile_contacts_org_id_contact_id_idx" ON "customer_profile_contacts"("org_id", "contact_id");
CREATE INDEX "customer_profile_contacts_org_id_customer_profile_id_is_active_idx" ON "customer_profile_contacts"("org_id", "customer_profile_id", "is_active");
CREATE UNIQUE INDEX "customer_profile_contacts_customer_profile_id_contact_id_key" ON "customer_profile_contacts"("customer_profile_id", "contact_id");

-- Foreign keys.
ALTER TABLE "customer_types" ADD CONSTRAINT "customer_types_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_data_sources" ADD CONSTRAINT "customer_data_sources_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_data_sources" ADD CONSTRAINT "customer_data_sources_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_data_source_column_maps" ADD CONSTRAINT "customer_data_source_column_maps_source_id_fkey"
FOREIGN KEY ("source_id") REFERENCES "customer_data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_sync_runs" ADD CONSTRAINT "customer_sync_runs_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_sync_runs" ADD CONSTRAINT "customer_sync_runs_source_id_fkey"
FOREIGN KEY ("source_id") REFERENCES "customer_data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_sync_runs" ADD CONSTRAINT "customer_sync_runs_triggered_by_user_id_fkey"
FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_sync_row_errors" ADD CONSTRAINT "customer_sync_row_errors_run_id_fkey"
FOREIGN KEY ("run_id") REFERENCES "customer_sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_profile_contacts" ADD CONSTRAINT "customer_profile_contacts_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_profile_contacts" ADD CONSTRAINT "customer_profile_contacts_customer_profile_id_fkey"
FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_profile_contacts" ADD CONSTRAINT "customer_profile_contacts_contact_id_fkey"
FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_profile_contacts" ADD CONSTRAINT "customer_profile_contacts_linked_by_user_id_fkey"
FOREIGN KEY ("linked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_managing_department_id_fkey"
FOREIGN KEY ("managing_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_customer_type_id_fkey"
FOREIGN KEY ("customer_type_id") REFERENCES "customer_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_source_id_fkey"
FOREIGN KEY ("source_id") REFERENCES "customer_data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
