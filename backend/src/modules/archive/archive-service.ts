import type { Prisma } from '@prisma/client';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import {
  archiveDisplayContent,
  extractMediaCandidates,
  formatArchiveMessage,
  oneLine,
  summarizeQuote,
} from './archive-format.js';
import {
  isOpenArchiveBehavior,
  resolveDefaultArchiveStatus,
} from './archive-status-service.js';
import { getEffectivePrimaryAssignee } from '../zalo/zalo-assignment-service.js';
import { emitNotificationNew } from '../notifications/notification-events.js';

export interface CreateArchiveStoryInput {
  orgId: string;
  userId: string;
  userRole: string;
  conversationId: string;
  messageIds: string[];
  title?: string | null;
  orderCode?: string | null;
  priority?: string | null;
  requiresConfirmation?: boolean | null;
  extraNote?: string | null;
  recordType?: string | null;
  departmentId?: string | null;
  assignedUserId?: string | null;
  allowCrossStoryDuplicates?: boolean;
}

export interface AppendArchiveMessagesInput {
  orgId: string;
  userId: string;
  userRole?: string;
  storyId: string;
  messageIds: string[];
  allowCrossStoryDuplicates?: boolean;
  addedSource?: 'append' | 'auto_reply_sync' | 'manual' | 'system';
}

export interface ArchiveConflict {
  messageId: string;
  stories: Array<{
    id: string;
    title: string;
    businessStatus: string;
    statusDefinition?: {
      id: string;
      code: string;
      name: string;
      behaviorGroup: string;
    } | null;
  }>;
}

export class ArchiveConflictError extends Error {
  readonly code = 'ARCHIVE_MESSAGE_CONFLICT';

  constructor(
    public readonly conflicts: ArchiveConflict[],
    public readonly targetDuplicates: string[] = [],
  ) {
    super('Một hoặc nhiều tin nhắn đã thuộc hồ sơ khác');
  }
}

export async function preflightArchiveMessages(input: {
  orgId: string;
  conversationId: string;
  messageIds: string[];
  targetStoryId?: string | null;
}) {
  const ids = uniqueMessageIds(input.messageIds);
  const messages = await prisma.message.findMany({
    where: { id: { in: ids }, conversationId: input.conversationId },
    select: { id: true, nativeZaloMessageId: true },
  });
  if (messages.length !== ids.length) {
    throw new Error('One or more messages do not belong to this conversation');
  }

  const nativeIds = messages
    .map((message) => message.nativeZaloMessageId)
    .filter((id): id is string => Boolean(id));
  const archived = await prisma.archiveMessage.findMany({
    where: {
      story: { orgId: input.orgId },
      OR: [
        { sourceMessageId: { in: ids } },
        ...(nativeIds.length ? [{ nativeZaloMessageId: { in: nativeIds } }] : []),
      ],
    },
    select: {
      sourceMessageId: true,
      nativeZaloMessageId: true,
      storyId: true,
      story: {
        select: {
          id: true,
          title: true,
          conversationName: true,
          businessStatus: true,
          statusDefinition: { select: { id: true, code: true, name: true, behaviorGroup: true } },
        },
      },
    },
  });

  const targetDuplicates = new Set<string>();
  const conflicts = new Map<string, ArchiveConflict>();
  for (const message of messages) {
    const matches = archived.filter((item) => (
      item.sourceMessageId === message.id
      || Boolean(message.nativeZaloMessageId && item.nativeZaloMessageId === message.nativeZaloMessageId)
    ));
    const seenStoryIds = new Set<string>();
    for (const item of matches) {
      if (seenStoryIds.has(item.storyId)) continue;
      seenStoryIds.add(item.storyId);
      if (input.targetStoryId && item.storyId === input.targetStoryId) {
        targetDuplicates.add(message.id);
        continue;
      }
      const conflict = conflicts.get(message.id) ?? {
        messageId: message.id,
        stories: [],
      };
      conflict.stories.push({
        id: item.story.id,
        title: item.story.title || item.story.conversationName,
        businessStatus: item.story.businessStatus,
        statusDefinition: item.story.statusDefinition,
      });
      conflicts.set(message.id, conflict);
    }
  }

  return {
    targetDuplicates: [...targetDuplicates],
    crossStoryConflicts: [...conflicts.values()],
    savableMessageIds: ids.filter((id) => !targetDuplicates.has(id)),
  };
}

export async function createArchiveStory(input: CreateArchiveStoryInput) {
  const ids = uniqueMessageIds(input.messageIds);
  const conversation = await loadConversation(input.conversationId, input.orgId);
  await ensureConversationWriteAccess(
    conversation.zaloAccountId,
    input.userId,
    input.userRole,
  );

  const messages = await loadSourceMessages(conversation.id, ids);
  const preflight = await preflightArchiveMessages({
    orgId: input.orgId,
    conversationId: conversation.id,
    messageIds: ids,
  });
  if (preflight.crossStoryConflicts.length > 0 && !input.allowCrossStoryDuplicates) {
    throw new ArchiveConflictError(preflight.crossStoryConflicts);
  }

  const destination = await prisma.archiveDestination.findFirst({
    where: { zaloAccountId: conversation.zaloAccountId, orgId: input.orgId, enabled: true },
  });
  const assignment = await resolveAssignment({
    orgId: input.orgId,
    actorUserId: input.userId,
    actorRole: input.userRole,
    zaloAccountId: conversation.zaloAccountId,
    requestedDepartmentId: input.departmentId,
    requestedAssignedUserId: input.assignedUserId,
  });
  const departmentDefaults = assignment.departmentId
    ? await prisma.department.findFirst({
        where: { id: assignment.departmentId, orgId: input.orgId, archivedAt: null },
        select: { defaultArchiveRecordType: true },
      })
    : null;
  const conversationName = getConversationName(conversation);
  const customerContext = conversation.threadType === 'group'
    ? conversation.nativeGroup?.customerLink?.customerProfile || null
    : conversation.contact?.customerProfileLink?.customerProfile || null;
  const customerContextSubjectId = conversation.threadType === 'group'
    ? conversation.nativeGroupId
    : conversation.contactId;
  const title = oneLine(input.title);
  const initialStatus = await resolveDefaultArchiveStatus(input.orgId, assignment.departmentId);

  const story = await prisma.$transaction(async (tx) => {
    await assertNoConcurrentArchiveConflict(
      tx,
      input.orgId,
      messages,
      Boolean(input.allowCrossStoryDuplicates),
    );
    const created = await tx.archiveStory.create({
      data: {
        orgId: input.orgId,
        destinationId: destination?.id || null,
        zaloAccountId: conversation.zaloAccountId,
        handlingZaloAccountId: conversation.zaloAccountId,
        conversationId: conversation.id,
        customerProfileId: customerContext?.id || null,
        customerProfileCodeSnapshot: customerContext?.code || null,
        customerProfileNameSnapshot: customerContext?.name || null,
        customerContextType: customerContext
          ? (conversation.threadType === 'group' ? 'group' : 'direct_user')
          : null,
        customerContextSubjectId: customerContext ? customerContextSubjectId : null,
        createdByUserId: input.userId,
        assignedUserId: assignment.assignedUserId,
        departmentId: assignment.departmentId,
        conversationName,
        conversationType: conversation.threadType,
        contactPhone: conversation.contact?.phone || null,
        zaloAccountDisplayNameSnapshot: conversation.zaloAccount.displayName,
        zaloAccountUidSnapshot: conversation.zaloAccount.zaloUid,
        zaloAccountDeletedAt: conversation.zaloAccount.deletedAt,
        title,
        orderCode: oneLine(input.orderCode) || null,
        priority: normalizeArchivePriority(input.priority),
        requiresConfirmation: typeof input.requiresConfirmation === 'boolean'
          ? input.requiresConfirmation
          : conversation.requiresConfirmationDefault ?? true,
        extraNote: oneLine(input.extraNote) || null,
        recordType: oneLine(input.recordType) || departmentDefaults?.defaultArchiveRecordType || 'order',
        conversationContent: messages.map(formatArchiveMessage).join('\n'),
        receivedAt: messages[0]?.sentAt || null,
        assignmentOrigin: 'initial',
        statusDefinitionId: initialStatus.id,
        businessStatus: 'pending',
        backupStatus: destination ? 'pending' : 'failed',
        backupError: destination ? null : 'Chưa cấu hình Google Archive cho tài khoản Zalo này',
        nextBackupAt: destination ? new Date() : null,
      },
    });

    await snapshotMessages(tx, {
      storyId: created.id,
      actorUserId: input.userId,
      messages,
      crossStoryMessageIds: new Set(preflight.crossStoryConflicts.map((item) => item.messageId)),
    });
    await tx.archiveAssignmentHistory.create({
      data: {
        orgId: input.orgId,
        storyId: created.id,
        fromUserId: null,
        toUserId: assignment.assignedUserId,
        changedByUserId: input.userId,
        changeType: 'initial_assignment',
        reason: 'Phân công khi tạo hồ sơ',
      },
    });
    return created;
  });

  return prisma.archiveStory.findUniqueOrThrow({
    where: { id: story.id },
    include: archiveStoryInclude,
  });
}

export async function appendArchiveMessages(input: AppendArchiveMessagesInput) {
  const ids = uniqueMessageIds(input.messageIds);
  const story = await prisma.archiveStory.findFirst({
    where: { id: input.storyId, orgId: input.orgId },
    select: {
      id: true,
      conversationId: true,
      destinationId: true,
      backupStatus: true,
      nextBackupAt: true,
      businessStatus: true,
      statusDefinition: {
        select: {
          id: true,
          behaviorGroup: true,
          allowMessageAppend: true,
        },
      },
    },
  });
  if (!story) throw new Error('Archive story not found');
  const openByLegacy = story.statusDefinition
    ? isOpenArchiveBehavior(story.statusDefinition.behaviorGroup)
    : story.businessStatus === 'pending';
  if (
    story.statusDefinition
    && !story.statusDefinition.allowMessageAppend
  ) {
    throw new Error('Trạng thái hiện tại không cho phép bổ sung tin nhắn');
  }
  if (!openByLegacy && !['owner', 'admin'].includes(input.userRole || '')) {
    throw new Error('Chỉ admin có thể bổ sung tin nhắn vào hồ sơ đã đóng');
  }

  const messages = await loadSourceMessages(story.conversationId, ids);
  const preflight = await preflightArchiveMessages({
    orgId: input.orgId,
    conversationId: story.conversationId,
    messageIds: ids,
    targetStoryId: story.id,
  });
  if (preflight.crossStoryConflicts.length > 0 && !input.allowCrossStoryDuplicates) {
    throw new ArchiveConflictError(preflight.crossStoryConflicts, preflight.targetDuplicates);
  }

  const savable = messages.filter((message) => preflight.savableMessageIds.includes(message.id));
  await prisma.$transaction(async (tx) => {
    await snapshotMessages(tx, {
      storyId: story.id,
      actorUserId: input.userId,
      addedSource: input.addedSource || 'append',
      messages: savable,
      crossStoryMessageIds: new Set(preflight.crossStoryConflicts.map((item) => item.messageId)),
    });
    const allMessages = await tx.archiveMessage.findMany({
      where: { storyId: story.id },
      orderBy: [{ sentAt: 'asc' }, { createdAt: 'asc' }],
    });
    await tx.archiveStory.update({
      where: { id: story.id },
      data: {
        conversationContent: allMessages.map(formatArchivedSnapshot).join('\n'),
        receivedAt: allMessages[0]?.sentAt || null,
        backupStatus: story.destinationId ? 'pending' : story.backupStatus,
        nextBackupAt: story.destinationId ? new Date() : story.nextBackupAt,
      },
    });
  });

  const updated = await prisma.archiveStory.findUniqueOrThrow({
    where: { id: story.id },
    include: archiveStoryInclude,
  });
  return {
    story: updated,
    addedCount: savable.length,
    skippedCount: preflight.targetDuplicates.length,
  };
}

export async function updateArchiveStoryMetadata(input: {
  orgId: string;
  userId: string;
  userRole: string;
  storyId: string;
  title?: string | null;
  orderCode?: string | null;
  priority?: string | null;
  requiresConfirmation?: boolean | null;
  extraNote?: string | null;
  recordType?: string;
  departmentId?: string | null;
  assignedUserId?: string | null;
}) {
  const existing = await prisma.archiveStory.findFirst({
    where: { id: input.storyId, orgId: input.orgId },
    select: {
      id: true,
      title: true,
      orderCode: true,
      priority: true,
      requiresConfirmation: true,
      extraNote: true,
      recordType: true,
      departmentId: true,
      assignedUserId: true,
    },
  });
  if (!existing) throw new Error('Archive story not found');
  const assignment = await resolveAssignment({
    orgId: input.orgId,
    actorUserId: input.userId,
    actorRole: input.userRole,
    requestedDepartmentId: input.departmentId === undefined ? existing.departmentId : input.departmentId,
    requestedAssignedUserId: input.assignedUserId === undefined ? existing.assignedUserId : input.assignedUserId,
  });
  return prisma.archiveStory.update({
    where: { id: existing.id },
    data: {
      title: input.title === undefined ? existing.title : oneLine(input.title) || null,
      orderCode: input.orderCode === undefined ? existing.orderCode : oneLine(input.orderCode) || null,
      priority: input.priority === undefined ? existing.priority : normalizeArchivePriority(input.priority),
      requiresConfirmation: input.requiresConfirmation === undefined
        ? existing.requiresConfirmation
        : (typeof input.requiresConfirmation === 'boolean' ? input.requiresConfirmation : null),
      extraNote: input.extraNote === undefined ? existing.extraNote : oneLine(input.extraNote) || null,
      recordType: input.recordType === undefined ? existing.recordType : oneLine(input.recordType) || 'order',
      departmentId: assignment.departmentId,
      assignedUserId: assignment.assignedUserId,
    },
    include: archiveStoryInclude,
  });
}

export function normalizeArchivePriority(priority?: string | null) {
  const normalized = oneLine(priority);
  return ['low', 'normal', 'high', 'urgent'].includes(normalized) ? normalized : 'normal';
}

async function snapshotMessages(
  tx: any,
  input: {
    storyId: string;
    actorUserId: string;
    addedSource?: string;
    messages: SourceMessage[];
    crossStoryMessageIds: Set<string>;
  },
): Promise<void> {
  for (const message of input.messages) {
    const confirmedDuplicate = input.crossStoryMessageIds.has(message.id);
    const archived = await tx.archiveMessage.create({
      data: {
        storyId: input.storyId,
        sourceMessageId: message.id,
        nativeZaloMessageId: message.nativeZaloMessageId,
        senderType: message.senderType,
        senderUid: message.senderUid,
        senderName: message.senderName,
        contentType: message.contentType,
        contentSnapshot: archiveDisplayContent(message.content, message.contentType),
        quoteSnapshot: message.quote ?? undefined,
        attachmentsSnapshot: message.attachments as Prisma.InputJsonValue,
        sentAt: message.sentAt,
        recalledAt: message.isDeleted ? message.deletedAt || new Date() : null,
        recalledContent: message.isDeleted ? recallSnapshot(message) : null,
        duplicateConfirmedByUserId: confirmedDuplicate ? input.actorUserId : null,
        duplicateConfirmedAt: confirmedDuplicate ? new Date() : null,
        addedByUserId: input.actorUserId,
        addedAt: new Date(),
        addedSource: input.addedSource || 'manual',
      },
    });
    const media = extractMediaCandidates(message.contentType, message.attachments, message.content);
    if (media.length > 0) {
      await tx.archiveMedia.createMany({
        data: media.map((item) => ({
          archiveMessageId: archived.id,
          mediaType: item.mediaType,
          sourceUrl: item.url,
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
        })),
        skipDuplicates: true,
      });
    }
  }
}

type SourceMessage = Awaited<ReturnType<typeof loadSourceMessages>>[number];

async function assertNoConcurrentArchiveConflict(
  tx: any,
  orgId: string,
  messages: SourceMessage[],
  allowCrossStoryDuplicates: boolean,
): Promise<void> {
  const lockKeys = messages
    .map((message) => message.nativeZaloMessageId ? `native:${message.nativeZaloMessageId}` : `source:${message.id}`)
    .sort();
  for (const key of lockKeys) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
  if (allowCrossStoryDuplicates) return;

  const nativeIds = messages
    .map((message) => message.nativeZaloMessageId)
    .filter((id): id is string => Boolean(id));
  const existing = await tx.archiveMessage.findFirst({
    where: {
      story: { orgId },
      OR: [
        { sourceMessageId: { in: messages.map((message) => message.id) } },
        ...(nativeIds.length ? [{ nativeZaloMessageId: { in: nativeIds } }] : []),
      ],
    },
    include: {
      story: { select: { id: true, title: true, conversationName: true, businessStatus: true, statusDefinition: true } },
    },
  });
  if (!existing) return;
  const selected = messages.find((message) => (
    message.id === existing.sourceMessageId
    || Boolean(message.nativeZaloMessageId && message.nativeZaloMessageId === existing.nativeZaloMessageId)
  ));
  throw new ArchiveConflictError([{
    messageId: selected?.id || existing.sourceMessageId,
    stories: [{
      id: existing.story.id,
      title: existing.story.title || existing.story.conversationName,
      businessStatus: existing.story.businessStatus,
      statusDefinition: existing.story.statusDefinition,
    }],
  }]);
}

async function loadSourceMessages(conversationId: string, ids: string[]) {
  const messages = await prisma.message.findMany({
    where: { id: { in: ids }, conversationId },
    orderBy: [{ sentAt: 'asc' }, { createdAt: 'asc' }],
  });
  if (messages.length !== ids.length) {
    throw new Error('One or more messages do not belong to this conversation');
  }
  return messages;
}

async function loadConversation(conversationId: string, orgId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId },
    include: {
      contact: {
        select: {
          fullName: true,
          phone: true,
          customerProfileLink: { include: { customerProfile: true } },
        },
      },
      nativeGroup: {
        include: { customerLink: { include: { customerProfile: true } } },
      },
      zaloAccount: {
        select: {
          id: true,
          departmentId: true,
          displayName: true,
          zaloUid: true,
          ownerUserId: true,
          deletedAt: true,
        },
      },
    },
  });
  if (!conversation) throw new Error('Conversation not found');
  return conversation;
}

async function ensureConversationWriteAccess(
  zaloAccountId: string,
  userId: string,
  userRole: string,
): Promise<void> {
  if (['owner', 'admin'].includes(userRole)) return;
  const access = await prisma.zaloAccountAccess.findFirst({
    where: {
      zaloAccountId,
      userId,
      permission: { in: ['chat', 'admin'] },
    },
    select: { id: true },
  });
  if (!access) throw new Error('Không đủ quyền lưu nội dung từ tài khoản Zalo này');
}

async function resolveAssignment(input: {
  orgId: string;
  actorUserId: string;
  actorRole: string;
  zaloAccountId?: string | null;
  requestedDepartmentId?: string | null;
  requestedAssignedUserId?: string | null;
}) {
  const actor = await prisma.user.findFirst({
    where: { id: input.actorUserId, orgId: input.orgId },
    select: {
      id: true,
      departmentMember: {
        select: {
          departmentId: true,
          deptRole: true,
          department: { select: { path: true } },
        },
      },
    },
  });
  if (!actor) throw new Error('User not found');

  const isOrgAdmin = ['owner', 'admin'].includes(input.actorRole);
  const effectivePrimary = input.zaloAccountId && !input.requestedAssignedUserId
    ? await getEffectivePrimaryAssignee({
        orgId: input.orgId,
        zaloAccountId: input.zaloAccountId,
      })
    : null;
  const assignedUserId = input.requestedAssignedUserId
    || effectivePrimary?.userId
    || input.actorUserId;
  const assigned = await prisma.user.findFirst({
    where: { id: assignedUserId, orgId: input.orgId, isActive: true },
    select: {
      id: true,
      departmentMember: {
        select: { departmentId: true, department: { select: { path: true } } },
      },
    },
  });
  if (!assigned) throw new Error('Assigned user not found');

  let departmentId = input.requestedDepartmentId
    || effectivePrimary?.departmentId
    || assigned.departmentMember?.departmentId
    || actor.departmentMember?.departmentId
    || null;

  if (!isOrgAdmin) {
    if (input.requestedDepartmentId && input.requestedDepartmentId !== actor.departmentMember?.departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: input.requestedDepartmentId, orgId: input.orgId, archivedAt: null },
        select: { path: true },
      });
      const canManageSubtree = actor.departmentMember
        && ['leader', 'deputy'].includes(actor.departmentMember.deptRole)
        && department?.path.startsWith(actor.departmentMember.department.path);
      if (!canManageSubtree) throw new Error('Không đủ quyền chuyển hồ sơ sang phòng ban này');
    }
    if (assignedUserId !== input.actorUserId) {
      const canAssign = actor.departmentMember
        && ['leader', 'deputy'].includes(actor.departmentMember.deptRole)
        && assigned.departmentMember?.department.path.startsWith(actor.departmentMember.department.path);
      if (!canAssign) throw new Error('Không đủ quyền gán người phụ trách khác');
    }
  }

  if (departmentId) {
    const department = await prisma.department.findFirst({
      where: { id: departmentId, orgId: input.orgId, archivedAt: null },
      select: { id: true },
    });
    if (!department) departmentId = actor.departmentMember?.departmentId || null;
  }

  return { assignedUserId, departmentId };
}

function getConversationName(conversation: Awaited<ReturnType<typeof loadConversation>>): string {
  return conversation.threadType === 'group'
    ? conversation.groupName || conversation.contact?.fullName || 'Nhóm Zalo'
    : conversation.contact?.fullName || 'Khách Zalo';
}

function uniqueMessageIds(messageIds: string[]): string[] {
  const ids = [...new Set(messageIds)].slice(0, 100);
  if (ids.length === 0) throw new Error('messageIds is required');
  return ids;
}

function formatArchivedSnapshot(message: {
  sentAt: Date;
  senderName: string | null;
  senderType: string;
  contentType: string;
  contentSnapshot: string | null;
  quoteSnapshot: Prisma.JsonValue | null;
}): string {
  return formatArchiveMessage({
    sentAt: message.sentAt,
    senderName: message.senderName,
    senderType: message.senderType,
    contentType: message.contentType,
    content: message.contentSnapshot,
    quote: message.quoteSnapshot,
  });
}

export async function processArchivedMessageRecall(messageIds: string[], io?: Server | null): Promise<void> {
  if (messageIds.length === 0) return;
  // Some lightweight route tests and partial deployments do not expose the
  // archive delegate. Recall handling must not block the original chat action.
  if (!(prisma as any).archiveMessage?.findMany) return;
  const recalledAt = new Date();
  const archivedMessages = await prisma.archiveMessage.findMany({
    where: { sourceMessageId: { in: messageIds }, recalledAt: null },
    include: {
      story: true,
      media: true,
      sourceMessage: { select: { content: true, contentType: true, senderName: true, sentAt: true } },
    },
  });

  for (const archived of archivedMessages) {
    const driveLinks = archived.media.map((media) => media.driveUrl).filter(Boolean) as string[];
    const snapshot = archived.contentSnapshot || `[${archived.contentType}]`;
    const sender = oneLine(archived.senderName) || 'Khách';
    const storyTitle = oneLine(archived.story.title) || oneLine(archived.story.conversationName) || 'Hồ sơ không tên';
    const line = `[${recalledAt.toISOString().replace('T', ' ').slice(0, 19)}] ${sender} đã thu hồi: ${oneLine(snapshot)}${driveLinks.length ? ` | ${driveLinks.join(' | ')}` : ''}`;

    const notificationId = await prisma.$transaction(async (tx) => {
      const updated = await tx.archiveMessage.updateMany({
        where: { id: archived.id, recalledAt: null },
        data: { recalledAt, recalledContent: snapshot },
      });
      if (updated.count === 0) return null;
      await tx.archiveRecallEvent.create({
        data: {
          storyId: archived.storyId,
          archiveMessageId: archived.id,
          recalledAt,
          contentSnapshot: snapshot,
          driveLinks,
        },
      });
      await tx.archiveStory.update({
        where: { id: archived.storyId },
        data: {
          recalledContent: archived.story.recalledContent ? `${archived.story.recalledContent}\n${line}` : line,
          backupStatus: archived.story.destinationId ? 'pending' : archived.story.backupStatus,
          nextBackupAt: archived.story.destinationId ? new Date() : archived.story.nextBackupAt,
        },
      });
      const notification = await tx.archiveNotification.create({
        data: {
          orgId: archived.story.orgId,
          userId: archived.story.assignedUserId,
          storyId: archived.storyId,
          type: 'message_recalled',
          title: `${sender} đã thu hồi tin trong hồ sơ "${storyTitle}"`,
          detail: `${oneLine(snapshot).slice(0, 180)}${driveLinks.length ? ' (media vẫn còn trên Drive)' : ''}`,
          priority: 'high',
          requiresAck: true,
          dedupeKey: `archive-recall:${archived.id}`,
        },
      });
      return notification.id;
    });
    if (!notificationId) continue;

    io?.to(`org:${archived.story.orgId}`).emit('archive:message-recalled', {
      storyId: archived.storyId,
      archiveMessageId: archived.id,
      assignedUserId: archived.story.assignedUserId,
      conversationName: archived.story.conversationName,
      storyTitle,
      senderName: sender,
      content: snapshot,
      contentType: archived.contentType,
      driveLinks,
      recalledAt: recalledAt.toISOString(),
    });
    emitNotificationNew(io, {
      orgId: archived.story.orgId,
      userId: archived.story.assignedUserId,
      source: 'archive',
      sourceId: archived.storyId,
      type: 'message_recalled',
      notificationId,
    });
  }
}

export const archiveStoryInclude = {
  createdBy: { select: { id: true, fullName: true } },
  assignedUser: { select: { id: true, fullName: true } },
  completedBy: { select: { id: true, fullName: true } },
  statusDefinition: true,
  department: { select: { id: true, name: true, path: true } },
  zaloAccount: {
    select: {
      id: true,
      displayName: true,
      zaloUid: true,
      deletedAt: true,
      deletedByUserId: true,
    },
  },
  handlingZaloAccount: { select: { id: true, displayName: true, zaloUid: true, status: true } },
  customerProfile: true,
  messages: {
    orderBy: { sentAt: 'asc' as const },
    include: {
      media: true,
      sourceMessage: {
        select: {
          id: true,
          zaloMsgId: true,
          zaloMsgIdNum: true,
          quote: true,
          content: true,
          contentType: true,
          senderName: true,
          isDeleted: true,
          repliedBy: { select: { id: true, fullName: true, email: true } },
        },
      },
      addedBy: { select: { id: true, fullName: true, email: true } },
    },
  },
  recallEvents: { orderBy: { recalledAt: 'asc' as const } },
  transferRequests: {
    where: { status: 'pending' },
    take: 1,
    orderBy: { requestedAt: 'desc' as const },
    include: {
      fromUser: { select: { id: true, fullName: true } },
      toUser: { select: { id: true, fullName: true } },
      requestedBy: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.ArchiveStoryInclude;

function recallSnapshot(message: {
  content: string | null;
  contentType: string;
  quote: Prisma.JsonValue | null;
}): string {
  const content = archiveDisplayContent(message.content, message.contentType);
  const quote = summarizeQuote(message.quote);
  return quote ? `${content} | Trả lời: ${quote}` : content;
}

export function archiveSummary(story: { title: string | null; conversationContent: string }): string {
  return oneLine(story.title || story.conversationContent).slice(0, 120);
}

export function logArchiveError(context: string, error: unknown): void {
  logger.error(`[archive] ${context}:`, error);
}
