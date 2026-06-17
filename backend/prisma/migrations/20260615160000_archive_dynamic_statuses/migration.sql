ALTER TABLE "archive_stories"
  ADD COLUMN "status_definition_id" TEXT;

ALTER TABLE "archive_status_history"
  ADD COLUMN "from_status_definition_id" TEXT,
  ADD COLUMN "to_status_definition_id" TEXT,
  ADD COLUMN "note" TEXT;

CREATE TABLE "archive_status_definitions" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "department_id" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "behavior_group" TEXT NOT NULL,
  "color_token" TEXT NOT NULL DEFAULT 'primary',
  "icon" TEXT NOT NULL DEFAULT 'mdi-progress-clock',
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "show_on_kanban" BOOLEAN NOT NULL DEFAULT true,
  "allow_message_append" BOOLEAN NOT NULL DEFAULT true,
  "auto_sync_replies" BOOLEAN NOT NULL DEFAULT true,
  "require_note" BOOLEAN NOT NULL DEFAULT false,
  "require_result" BOOLEAN NOT NULL DEFAULT false,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "archive_status_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "archive_status_definitions_behavior_group_check"
    CHECK ("behavior_group" IN ('active', 'waiting', 'completed', 'cancelled'))
);

CREATE TABLE "archive_status_transitions" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "from_status_id" TEXT NOT NULL,
  "to_status_id" TEXT NOT NULL,
  "required_permission" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "archive_status_transitions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "archive_status_definitions"
  ADD CONSTRAINT "archive_status_definitions_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_status_definitions_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_status_definitions_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "archive_status_transitions"
  ADD CONSTRAINT "archive_status_transitions_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_status_transitions_from_status_id_fkey"
  FOREIGN KEY ("from_status_id") REFERENCES "archive_status_definitions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_status_transitions_to_status_id_fkey"
  FOREIGN KEY ("to_status_id") REFERENCES "archive_status_definitions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "archive_stories"
  ADD CONSTRAINT "archive_stories_status_definition_id_fkey"
  FOREIGN KEY ("status_definition_id") REFERENCES "archive_status_definitions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "archive_status_history"
  ADD CONSTRAINT "archive_status_history_from_status_definition_id_fkey"
  FOREIGN KEY ("from_status_definition_id") REFERENCES "archive_status_definitions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "archive_status_history_to_status_definition_id_fkey"
  FOREIGN KEY ("to_status_definition_id") REFERENCES "archive_status_definitions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "archive_status_definitions_org_id_department_id_code_key"
  ON "archive_status_definitions"("org_id", "department_id", "code");
CREATE UNIQUE INDEX "archive_status_definitions_global_code_key"
  ON "archive_status_definitions"("org_id", "code")
  WHERE "department_id" IS NULL;
CREATE UNIQUE INDEX "archive_status_definitions_one_global_default"
  ON "archive_status_definitions"("org_id")
  WHERE "department_id" IS NULL AND "is_default" = true AND "is_active" = true;
CREATE UNIQUE INDEX "archive_status_definitions_one_department_default"
  ON "archive_status_definitions"("org_id", "department_id")
  WHERE "department_id" IS NOT NULL AND "is_default" = true AND "is_active" = true;
CREATE INDEX "archive_status_definitions_org_department_active_order_idx"
  ON "archive_status_definitions"("org_id", "department_id", "is_active", "display_order");
CREATE INDEX "archive_status_definitions_org_behavior_active_idx"
  ON "archive_status_definitions"("org_id", "behavior_group", "is_active");
CREATE UNIQUE INDEX "archive_status_transitions_from_status_id_to_status_id_key"
  ON "archive_status_transitions"("from_status_id", "to_status_id");
CREATE INDEX "archive_status_transitions_org_from_active_idx"
  ON "archive_status_transitions"("org_id", "from_status_id", "is_active");
CREATE INDEX "archive_stories_org_status_definition_created_at_idx"
  ON "archive_stories"("org_id", "status_definition_id", "created_at");
CREATE INDEX "archive_status_history_from_status_definition_id_idx"
  ON "archive_status_history"("from_status_definition_id");
CREATE INDEX "archive_status_history_to_status_definition_id_idx"
  ON "archive_status_history"("to_status_definition_id");

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
  );

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
