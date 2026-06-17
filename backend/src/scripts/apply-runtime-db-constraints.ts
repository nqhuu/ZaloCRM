import pg from 'pg';

const { Client } = pg;

const sql = `
UPDATE "zalo_accounts" AS account
SET "department_id" = member."department_id"
FROM "department_members" AS member
WHERE member."user_id" = account."owner_user_id"
  AND account."department_id" IS NULL;

ALTER TABLE "zalo_account_access"
  DROP CONSTRAINT IF EXISTS "zalo_account_access_assignment_role_check";

ALTER TABLE "zalo_account_access"
  ADD CONSTRAINT "zalo_account_access_assignment_role_check"
  CHECK (
    "assignment_role" IS NULL
    OR "assignment_role" = 'primary'
    OR "assignment_role" ~ '^secondary_[1-9][0-9]*$'
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'archive_assignment_transfer_requests_type_check'
  ) THEN
    ALTER TABLE "archive_assignment_transfer_requests"
      ADD CONSTRAINT "archive_assignment_transfer_requests_type_check"
      CHECK ("request_type" IN ('consent', 'manager_override'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'archive_assignment_transfer_requests_status_check'
  ) THEN
    ALTER TABLE "archive_assignment_transfer_requests"
      ADD CONSTRAINT "archive_assignment_transfer_requests_status_check"
      CHECK (
        "status" IN (
          'pending',
          'accepted',
          'rejected',
          'cancelled',
          'expired',
          'superseded',
          'invalidated'
        )
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS
  "zalo_account_access_active_assignment_role_key"
ON "zalo_account_access" ("zalo_account_id", "assignment_role")
WHERE "assignment_role" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  "archive_assignment_transfer_requests_one_pending_per_story"
ON "archive_assignment_transfer_requests" ("story_id")
WHERE "status" = 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'archive_status_definitions_behavior_group_check'
  ) THEN
    ALTER TABLE "archive_status_definitions"
      ADD CONSTRAINT "archive_status_definitions_behavior_group_check"
      CHECK ("behavior_group" IN ('active', 'waiting', 'completed', 'cancelled'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS
  "archive_status_definitions_global_code_key"
ON "archive_status_definitions" ("org_id", "code")
WHERE "department_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  "archive_status_definitions_one_global_default"
ON "archive_status_definitions" ("org_id")
WHERE "department_id" IS NULL AND "is_default" = true AND "is_active" = true;

CREATE UNIQUE INDEX IF NOT EXISTS
  "archive_status_definitions_one_department_default"
ON "archive_status_definitions" ("org_id", "department_id")
WHERE "department_id" IS NOT NULL AND "is_default" = true AND "is_active" = true;

INSERT INTO "archive_status_definitions" (
  "id", "org_id", "code", "name", "description", "behavior_group",
  "color_token", "icon", "display_order", "is_default", "show_on_kanban",
  "allow_message_append", "auto_sync_replies", "require_note", "require_result",
  "is_system", "is_active", "updated_at"
)
SELECT
  md5(org."id" || ':archive-status:' || seed."code"),
  org."id",
  seed."code",
  seed."name",
  seed."description",
  seed."behavior_group",
  seed."color_token",
  seed."icon",
  seed."display_order",
  seed."is_default",
  true,
  seed."allow_message_append",
  seed."auto_sync_replies",
  seed."require_note",
  seed."require_result",
  true,
  true,
  CURRENT_TIMESTAMP
FROM "organizations" org
CROSS JOIN (
  VALUES
    ('processing', 'Đang xử lý', 'Hồ sơ đang được thực hiện', 'active', 'primary', 'mdi-progress-clock', 10, true, true, true, false, false),
    ('needs_info', 'Thiếu thông tin', 'Đang chờ dữ liệu hoặc phản hồi', 'waiting', 'warning', 'mdi-alert-circle-outline', 20, false, true, true, true, false),
    ('completed', 'Hoàn thành', 'Đã có kết quả xử lý cuối cùng', 'completed', 'success', 'mdi-check-circle-outline', 30, false, false, false, false, true),
    ('cancelled', 'Huỷ', 'Hồ sơ không tiếp tục xử lý', 'cancelled', 'error', 'mdi-cancel', 40, false, false, false, true, false)
) AS seed(
  "code", "name", "description", "behavior_group", "color_token", "icon",
  "display_order", "is_default", "allow_message_append", "auto_sync_replies",
  "require_note", "require_result"
)
WHERE NOT EXISTS (
  SELECT 1
  FROM "archive_status_definitions" existing
  WHERE existing."org_id" = org."id"
    AND existing."department_id" IS NULL
    AND existing."code" = seed."code"
);

INSERT INTO "archive_status_transitions" (
  "id", "org_id", "from_status_id", "to_status_id", "required_permission", "is_active", "updated_at"
)
SELECT
  md5(source."id" || ':to:' || target."id"),
  source."org_id",
  source."id",
  target."id",
  CASE
    WHEN target."behavior_group" = 'cancelled' THEN 'delete'
    WHEN target."behavior_group" = 'completed'
      OR source."behavior_group" IN ('completed', 'cancelled') THEN 'approve'
    ELSE 'edit'
  END,
  true,
  CURRENT_TIMESTAMP
FROM "archive_status_definitions" source
JOIN "archive_status_definitions" target
  ON target."org_id" = source."org_id"
 AND target."department_id" IS NULL
WHERE source."department_id" IS NULL
  AND source."id" <> target."id"
  AND NOT (source."behavior_group" = 'completed' AND target."behavior_group" = 'cancelled')
  AND NOT (source."behavior_group" = 'cancelled' AND target."behavior_group" = 'completed')
  AND (
    source."behavior_group" IN ('active', 'waiting')
    OR target."behavior_group" = 'active'
  )
ON CONFLICT ("from_status_id", "to_status_id") DO NOTHING;

UPDATE "archive_stories" story
SET "status_definition_id" = definition."id"
FROM "archive_status_definitions" definition
WHERE definition."org_id" = story."org_id"
  AND definition."department_id" IS NULL
  AND definition."code" = CASE story."business_status"
    WHEN 'completed' THEN 'completed'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'processing'
  END
  AND story."status_definition_id" IS NULL;

UPDATE "archive_status_history" history
SET
  "from_status_definition_id" = (
    SELECT definition."id"
    FROM "archive_stories" story
    JOIN "archive_status_definitions" definition
      ON definition."org_id" = story."org_id"
     AND definition."department_id" IS NULL
     AND definition."code" = CASE history."from_status"
       WHEN 'completed' THEN 'completed'
       WHEN 'cancelled' THEN 'cancelled'
       ELSE 'processing'
     END
    WHERE story."id" = history."story_id"
    LIMIT 1
  ),
  "to_status_definition_id" = (
    SELECT definition."id"
    FROM "archive_stories" story
    JOIN "archive_status_definitions" definition
      ON definition."org_id" = story."org_id"
     AND definition."department_id" IS NULL
     AND definition."code" = CASE history."to_status"
       WHEN 'completed' THEN 'completed'
       WHEN 'cancelled' THEN 'cancelled'
       ELSE 'processing'
     END
    WHERE story."id" = history."story_id"
    LIMIT 1
  )
WHERE history."from_status_definition_id" IS NULL
   OR history."to_status_definition_id" IS NULL;
`;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(sql);
    console.log('[database] Runtime archive assignment constraints are ready');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[database] Failed to apply runtime archive assignment constraints', error);
  process.exit(1);
});
