ALTER TABLE "customer_profile_zalo_users"
  ADD COLUMN IF NOT EXISTS "contact_display_name_snapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "zalo_display_name_snapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "phone_snapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "zalo_global_id_snapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "zalo_username_snapshot" TEXT;
