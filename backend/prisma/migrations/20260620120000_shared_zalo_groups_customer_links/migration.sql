-- AlterTable
ALTER TABLE "archive_messages" ADD COLUMN     "native_zalo_message_id" TEXT;

-- AlterTable
ALTER TABLE "archive_stories" ADD COLUMN     "customer_context_subject_id" TEXT,
ADD COLUMN     "customer_context_type" TEXT,
ADD COLUMN     "customer_profile_code_snapshot" TEXT,
ADD COLUMN     "customer_profile_id" TEXT,
ADD COLUMN     "customer_profile_name_snapshot" TEXT,
ADD COLUMN     "handling_zalo_account_id" TEXT;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "native_group_id" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "native_zalo_message_id" TEXT;

-- CreateTable
CREATE TABLE "native_zalo_groups" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "global_id" TEXT NOT NULL,
    "name" TEXT,
    "avatar_url" TEXT,
    "description" TEXT,
    "group_type" INTEGER,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "native_zalo_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "native_zalo_group_accounts" (
    "id" TEXT NOT NULL,
    "native_group_id" TEXT NOT NULL,
    "zalo_account_id" TEXT NOT NULL,
    "account_scoped_group_id" TEXT NOT NULL,
    "membership_status" TEXT NOT NULL DEFAULT 'active',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "native_zalo_group_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "native_zalo_messages" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "native_group_id" TEXT NOT NULL,
    "zalo_msg_id" TEXT NOT NULL,
    "sender_global_id" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "native_zalo_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "native_zalo_group_members" (
    "id" TEXT NOT NULL,
    "native_group_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "zalo_global_id" TEXT NOT NULL,
    "membership_status" TEXT NOT NULL DEFAULT 'active',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "native_zalo_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "external_key" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "source" TEXT NOT NULL DEFAULT 'google_sheet',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profile_zalo_groups" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "customer_profile_id" TEXT NOT NULL,
    "native_group_id" TEXT NOT NULL,
    "linked_by_user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual_assignment',
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profile_zalo_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profile_zalo_users" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "customer_profile_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "linked_by_user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual_assignment',
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profile_zalo_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_user_crm_tags" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "crm_tag_id" TEXT NOT NULL,
    "assigned_by_user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zalo_user_crm_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "native_zalo_group_crm_tags" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "native_group_id" TEXT NOT NULL,
    "crm_tag_id" TEXT NOT NULL,
    "assigned_by_user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "native_zalo_group_crm_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_subject_work_assignments" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "contact_id" TEXT,
    "native_group_id" TEXT,
    "assigned_user_id" TEXT NOT NULL,
    "crm_tag_id" TEXT,
    "role" TEXT NOT NULL DEFAULT 'collaborator',
    "assigned_by_user_id" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "close_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zalo_subject_work_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "native_zalo_groups_org_id_last_seen_at_idx" ON "native_zalo_groups"("org_id", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "native_zalo_groups_org_id_global_id_key" ON "native_zalo_groups"("org_id", "global_id");

-- CreateIndex
CREATE INDEX "native_zalo_group_accounts_native_group_id_membership_statu_idx" ON "native_zalo_group_accounts"("native_group_id", "membership_status");

-- CreateIndex
CREATE UNIQUE INDEX "native_zalo_group_accounts_zalo_account_id_account_scoped_g_key" ON "native_zalo_group_accounts"("zalo_account_id", "account_scoped_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "native_zalo_group_accounts_native_group_id_zalo_account_id_key" ON "native_zalo_group_accounts"("native_group_id", "zalo_account_id");

-- CreateIndex
CREATE INDEX "native_zalo_messages_org_id_sent_at_idx" ON "native_zalo_messages"("org_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "native_zalo_messages_native_group_id_zalo_msg_id_key" ON "native_zalo_messages"("native_group_id", "zalo_msg_id");

-- CreateIndex
CREATE INDEX "native_zalo_group_members_contact_id_membership_status_idx" ON "native_zalo_group_members"("contact_id", "membership_status");

-- CreateIndex
CREATE UNIQUE INDEX "native_zalo_group_members_native_group_id_zalo_global_id_key" ON "native_zalo_group_members"("native_group_id", "zalo_global_id");

-- CreateIndex
CREATE INDEX "customer_profiles_org_id_name_idx" ON "customer_profiles"("org_id", "name");

-- CreateIndex
CREATE INDEX "customer_profiles_org_id_code_idx" ON "customer_profiles"("org_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_org_id_external_key_key" ON "customer_profiles"("org_id", "external_key");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profile_zalo_groups_native_group_id_key" ON "customer_profile_zalo_groups"("native_group_id");

-- CreateIndex
CREATE INDEX "customer_profile_zalo_groups_org_id_customer_profile_id_idx" ON "customer_profile_zalo_groups"("org_id", "customer_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profile_zalo_users_contact_id_key" ON "customer_profile_zalo_users"("contact_id");

-- CreateIndex
CREATE INDEX "customer_profile_zalo_users_org_id_customer_profile_id_idx" ON "customer_profile_zalo_users"("org_id", "customer_profile_id");

-- CreateIndex
CREATE INDEX "zalo_user_crm_tags_org_id_crm_tag_id_idx" ON "zalo_user_crm_tags"("org_id", "crm_tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_user_crm_tags_contact_id_crm_tag_id_key" ON "zalo_user_crm_tags"("contact_id", "crm_tag_id");

-- CreateIndex
CREATE INDEX "native_zalo_group_crm_tags_org_id_crm_tag_id_idx" ON "native_zalo_group_crm_tags"("org_id", "crm_tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "native_zalo_group_crm_tags_native_group_id_crm_tag_id_key" ON "native_zalo_group_crm_tags"("native_group_id", "crm_tag_id");

-- CreateIndex
CREATE INDEX "zalo_subject_work_assignments_org_id_assigned_user_id_close_idx" ON "zalo_subject_work_assignments"("org_id", "assigned_user_id", "closed_at");

-- CreateIndex
CREATE INDEX "zalo_subject_work_assignments_contact_id_closed_at_idx" ON "zalo_subject_work_assignments"("contact_id", "closed_at");

-- CreateIndex
CREATE INDEX "zalo_subject_work_assignments_native_group_id_closed_at_idx" ON "zalo_subject_work_assignments"("native_group_id", "closed_at");

-- CreateIndex
CREATE INDEX "zalo_subject_work_assignments_crm_tag_id_assigned_user_id_c_idx" ON "zalo_subject_work_assignments"("crm_tag_id", "assigned_user_id", "closed_at");

-- CreateIndex
CREATE INDEX "archive_messages_native_zalo_message_id_idx" ON "archive_messages"("native_zalo_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "archive_messages_story_id_native_zalo_message_id_key" ON "archive_messages"("story_id", "native_zalo_message_id");

-- CreateIndex
CREATE INDEX "archive_stories_org_id_customer_profile_id_created_at_idx" ON "archive_stories"("org_id", "customer_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "archive_stories_handling_zalo_account_id_business_status_cr_idx" ON "archive_stories"("handling_zalo_account_id", "business_status", "created_at");

-- CreateIndex
CREATE INDEX "conversations_native_group_id_last_message_at_idx" ON "conversations"("native_group_id", "last_message_at");

-- CreateIndex
CREATE INDEX "messages_native_zalo_message_id_idx" ON "messages"("native_zalo_message_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_native_group_id_fkey" FOREIGN KEY ("native_group_id") REFERENCES "native_zalo_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_native_zalo_message_id_fkey" FOREIGN KEY ("native_zalo_message_id") REFERENCES "native_zalo_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "native_zalo_groups" ADD CONSTRAINT "native_zalo_groups_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "native_zalo_group_accounts" ADD CONSTRAINT "native_zalo_group_accounts_native_group_id_fkey" FOREIGN KEY ("native_group_id") REFERENCES "native_zalo_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "native_zalo_group_accounts" ADD CONSTRAINT "native_zalo_group_accounts_zalo_account_id_fkey" FOREIGN KEY ("zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "native_zalo_messages" ADD CONSTRAINT "native_zalo_messages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "native_zalo_messages" ADD CONSTRAINT "native_zalo_messages_native_group_id_fkey" FOREIGN KEY ("native_group_id") REFERENCES "native_zalo_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "native_zalo_group_members" ADD CONSTRAINT "native_zalo_group_members_native_group_id_fkey" FOREIGN KEY ("native_group_id") REFERENCES "native_zalo_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "native_zalo_group_members" ADD CONSTRAINT "native_zalo_group_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profile_zalo_groups" ADD CONSTRAINT "customer_profile_zalo_groups_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profile_zalo_groups" ADD CONSTRAINT "customer_profile_zalo_groups_native_group_id_fkey" FOREIGN KEY ("native_group_id") REFERENCES "native_zalo_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profile_zalo_users" ADD CONSTRAINT "customer_profile_zalo_users_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profile_zalo_users" ADD CONSTRAINT "customer_profile_zalo_users_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_user_crm_tags" ADD CONSTRAINT "zalo_user_crm_tags_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_user_crm_tags" ADD CONSTRAINT "zalo_user_crm_tags_crm_tag_id_fkey" FOREIGN KEY ("crm_tag_id") REFERENCES "crm_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "native_zalo_group_crm_tags" ADD CONSTRAINT "native_zalo_group_crm_tags_native_group_id_fkey" FOREIGN KEY ("native_group_id") REFERENCES "native_zalo_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "native_zalo_group_crm_tags" ADD CONSTRAINT "native_zalo_group_crm_tags_crm_tag_id_fkey" FOREIGN KEY ("crm_tag_id") REFERENCES "crm_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_subject_work_assignments" ADD CONSTRAINT "zalo_subject_work_assignments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_subject_work_assignments" ADD CONSTRAINT "zalo_subject_work_assignments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_subject_work_assignments" ADD CONSTRAINT "zalo_subject_work_assignments_native_group_id_fkey" FOREIGN KEY ("native_group_id") REFERENCES "native_zalo_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_subject_work_assignments" ADD CONSTRAINT "zalo_subject_work_assignments_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_subject_work_assignments" ADD CONSTRAINT "zalo_subject_work_assignments_crm_tag_id_fkey" FOREIGN KEY ("crm_tag_id") REFERENCES "crm_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_stories" ADD CONSTRAINT "archive_stories_handling_zalo_account_id_fkey" FOREIGN KEY ("handling_zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_stories" ADD CONSTRAINT "archive_stories_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_messages" ADD CONSTRAINT "archive_messages_native_zalo_message_id_fkey" FOREIGN KEY ("native_zalo_message_id") REFERENCES "native_zalo_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A workload assignment targets exactly one canonical Zalo subject.
ALTER TABLE "zalo_subject_work_assignments"
ADD CONSTRAINT "zalo_subject_work_assignments_subject_check"
CHECK (
  ("subject_type" = 'user' AND "contact_id" IS NOT NULL AND "native_group_id" IS NULL)
  OR
  ("subject_type" = 'group' AND "contact_id" IS NULL AND "native_group_id" IS NOT NULL)
);

-- Prevent duplicate active assignments while retaining closed history rows.
CREATE UNIQUE INDEX "zalo_subject_work_assignments_active_user_key"
ON "zalo_subject_work_assignments"("contact_id", "assigned_user_id", "role")
WHERE "closed_at" IS NULL AND "contact_id" IS NOT NULL;

CREATE UNIQUE INDEX "zalo_subject_work_assignments_active_group_key"
ON "zalo_subject_work_assignments"("native_group_id", "assigned_user_id", "role")
WHERE "closed_at" IS NULL AND "native_group_id" IS NOT NULL;
