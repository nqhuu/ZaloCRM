ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "requires_confirmation_default" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "requires_confirmation_updated_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "requires_confirmation_updated_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "conversations_org_requires_confirmation_default_idx"
  ON "conversations"("org_id", "requires_confirmation_default");
