ALTER TABLE "zalo_account_access"
  DROP CONSTRAINT IF EXISTS "zalo_account_access_assignment_role_check";

ALTER TABLE "zalo_account_access"
  ADD CONSTRAINT "zalo_account_access_assignment_role_check"
  CHECK (
    "assignment_role" IS NULL
    OR "assignment_role" = 'primary'
    OR "assignment_role" ~ '^secondary_[1-9][0-9]*$'
  );

