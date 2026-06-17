CREATE TABLE "archive_destinations" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "zalo_account_id" TEXT NOT NULL,
    "spreadsheet_id" TEXT NOT NULL,
    "raw_sheet_name" TEXT NOT NULL DEFAULT 'Raw_Messages',
    "view_sheet_name" TEXT NOT NULL DEFAULT 'View_Messages',
    "drive_folder_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "archive_destinations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "archive_stories" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "destination_id" TEXT,
    "zalo_account_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "assigned_user_id" TEXT,
    "completed_by_user_id" TEXT,
    "conversation_name" TEXT NOT NULL,
    "conversation_type" TEXT NOT NULL,
    "contact_phone" TEXT,
    "title" TEXT,
    "conversation_content" TEXT NOT NULL,
    "recalled_content" TEXT,
    "result_content" TEXT,
    "business_status" TEXT NOT NULL DEFAULT 'pending',
    "backup_status" TEXT NOT NULL DEFAULT 'pending',
    "backup_attempts" INTEGER NOT NULL DEFAULT 0,
    "backup_error" TEXT,
    "next_backup_at" TIMESTAMP(3),
    "google_view_row" INTEGER,
    "completed_at" TIMESTAMP(3),
    "last_reminder_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "archive_stories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "archive_messages" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "source_message_id" TEXT NOT NULL,
    "sender_type" TEXT NOT NULL,
    "sender_uid" TEXT,
    "sender_name" TEXT,
    "content_type" TEXT NOT NULL,
    "content_snapshot" TEXT,
    "quote_snapshot" JSONB,
    "attachments_snapshot" JSONB NOT NULL DEFAULT '[]',
    "sent_at" TIMESTAMP(3) NOT NULL,
    "recalled_at" TIMESTAMP(3),
    "recalled_content" TEXT,
    "google_raw_row" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "archive_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "archive_media" (
    "id" TEXT NOT NULL,
    "archive_message_id" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "file_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "drive_file_id" TEXT,
    "drive_url" TEXT,
    "backup_status" TEXT NOT NULL DEFAULT 'pending',
    "backup_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "archive_media_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "archive_recall_events" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "archive_message_id" TEXT NOT NULL,
    "recalled_at" TIMESTAMP(3) NOT NULL,
    "content_snapshot" TEXT,
    "drive_links" JSONB NOT NULL DEFAULT '[]',
    "sheet_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "archive_recall_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "archive_status_history" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "result_content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "archive_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "archive_notifications" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT,
    "story_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "read_at" TIMESTAMP(3),
    "dedupe_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "archive_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "archive_destinations_zalo_account_id_key" ON "archive_destinations"("zalo_account_id");
CREATE INDEX "archive_destinations_org_id_enabled_idx" ON "archive_destinations"("org_id", "enabled");
CREATE INDEX "archive_stories_org_id_business_status_created_at_idx" ON "archive_stories"("org_id", "business_status", "created_at");
CREATE INDEX "archive_stories_assigned_user_id_business_status_created_at_idx" ON "archive_stories"("assigned_user_id", "business_status", "created_at");
CREATE INDEX "archive_stories_backup_status_next_backup_at_idx" ON "archive_stories"("backup_status", "next_backup_at");
CREATE INDEX "archive_stories_conversation_id_created_at_idx" ON "archive_stories"("conversation_id", "created_at");
CREATE UNIQUE INDEX "archive_messages_story_id_source_message_id_key" ON "archive_messages"("story_id", "source_message_id");
CREATE INDEX "archive_messages_source_message_id_idx" ON "archive_messages"("source_message_id");
CREATE UNIQUE INDEX "archive_media_archive_message_id_source_url_key" ON "archive_media"("archive_message_id", "source_url");
CREATE INDEX "archive_media_backup_status_idx" ON "archive_media"("backup_status");
CREATE INDEX "archive_recall_events_story_id_recalled_at_idx" ON "archive_recall_events"("story_id", "recalled_at");
CREATE UNIQUE INDEX "archive_recall_events_archive_message_id_key" ON "archive_recall_events"("archive_message_id");
CREATE INDEX "archive_status_history_story_id_created_at_idx" ON "archive_status_history"("story_id", "created_at");
CREATE UNIQUE INDEX "archive_notifications_dedupe_key_key" ON "archive_notifications"("dedupe_key");
CREATE INDEX "archive_notifications_org_id_user_id_read_at_created_at_idx" ON "archive_notifications"("org_id", "user_id", "read_at", "created_at");

ALTER TABLE "archive_destinations" ADD CONSTRAINT "archive_destinations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_destinations" ADD CONSTRAINT "archive_destinations_zalo_account_id_fkey" FOREIGN KEY ("zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_stories" ADD CONSTRAINT "archive_stories_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_stories" ADD CONSTRAINT "archive_stories_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "archive_destinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "archive_stories" ADD CONSTRAINT "archive_stories_zalo_account_id_fkey" FOREIGN KEY ("zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_stories" ADD CONSTRAINT "archive_stories_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_stories" ADD CONSTRAINT "archive_stories_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "archive_stories" ADD CONSTRAINT "archive_stories_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "archive_stories" ADD CONSTRAINT "archive_stories_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "archive_messages" ADD CONSTRAINT "archive_messages_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "archive_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_messages" ADD CONSTRAINT "archive_messages_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "archive_media" ADD CONSTRAINT "archive_media_archive_message_id_fkey" FOREIGN KEY ("archive_message_id") REFERENCES "archive_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_recall_events" ADD CONSTRAINT "archive_recall_events_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "archive_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_recall_events" ADD CONSTRAINT "archive_recall_events_archive_message_id_fkey" FOREIGN KEY ("archive_message_id") REFERENCES "archive_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_status_history" ADD CONSTRAINT "archive_status_history_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "archive_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_status_history" ADD CONSTRAINT "archive_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "archive_notifications" ADD CONSTRAINT "archive_notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_notifications" ADD CONSTRAINT "archive_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "archive_notifications" ADD CONSTRAINT "archive_notifications_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "archive_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
