import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { canAppendArchiveStory, type ArchiveActor } from './archive-access.js';
import { appendArchiveMessages } from './archive-service.js';

export interface ArchiveReplySyncResult {
  status: 'synced' | 'not_reply' | 'source_not_archived' | 'ambiguous' | 'forbidden' | 'duplicate';
  storyId?: string;
  candidateStories?: Array<{ id: string; title: string }>;
}

export async function syncReplyMessageToArchive(input: {
  messageId: string;
  actor: ArchiveActor;
  replyToMessageId?: string | null;
  targetStoryId?: string | null;
  io?: Server | null;
}): Promise<ArchiveReplySyncResult> {
  const message = await prisma.message.findUnique({
    where: { id: input.messageId },
    select: {
      id: true,
      conversationId: true,
      quote: true,
      archiveSnapshots: { select: { storyId: true } },
    },
  });
  if (!message) return { status: 'not_reply' };
  if (message.archiveSnapshots.length > 0) {
    return { status: 'duplicate', storyId: message.archiveSnapshots[0]?.storyId };
  }

  const sourceMessageId = input.replyToMessageId
    || await resolveQuotedSourceMessageId(message.conversationId, message.quote);
  if (!sourceMessageId) return { status: 'not_reply' };

  const sourceSnapshots = await prisma.archiveMessage.findMany({
    where: {
      sourceMessageId,
      story: {
        orgId: input.actor.orgId,
        conversationId: message.conversationId,
        OR: [
          { statusDefinition: { is: { autoSyncReplies: true, isActive: true } } },
          { statusDefinitionId: null, businessStatus: 'pending' },
        ],
      },
    },
    select: {
      story: {
        select: {
          id: true,
          title: true,
          conversationName: true,
          createdByUserId: true,
          assignedUserId: true,
          departmentId: true,
          businessStatus: true,
          statusDefinition: true,
        },
      },
    },
  });
  const candidates = [...new Map(
    sourceSnapshots.map((item) => [item.story.id, item.story]),
  ).values()];
  if (candidates.length === 0) return { status: 'source_not_archived' };

  let target;
  if (input.targetStoryId) {
    target = candidates.find((story) => story.id === input.targetStoryId);
    if (!target) return { status: 'source_not_archived' };
  } else if (candidates.length === 1) {
    target = candidates[0];
  } else {
    const assigned = candidates.filter((story) => story.assignedUserId === input.actor.id);
    if (assigned.length === 1) target = assigned[0];
  }
  if (!target) {
    return {
      status: 'ambiguous',
      candidateStories: candidates.map((story) => ({
        id: story.id,
        title: story.title || story.conversationName,
      })),
    };
  }
  if (!(await canAppendArchiveStory(input.actor, target))) {
    return { status: 'forbidden', storyId: target.id };
  }

  try {
    const result = await appendArchiveMessages({
      orgId: input.actor.orgId,
      userId: input.actor.id,
      userRole: input.actor.role,
      storyId: target.id,
      messageIds: [message.id],
      addedSource: 'auto_reply_sync',
    });
    if (result.addedCount === 0) return { status: 'duplicate', storyId: target.id };

    input.io?.to(`org:${input.actor.orgId}`).emit('archive:message-added', {
      storyId: target.id,
      messageId: message.id,
      addedByUserId: input.actor.id,
    });
    return { status: 'synced', storyId: target.id };
  } catch (error) {
    logger.error('[archive] auto-sync reply failed:', error);
    throw error;
  }
}

async function resolveQuotedSourceMessageId(
  conversationId: string,
  quote: unknown,
): Promise<string | null> {
  if (!quote || typeof quote !== 'object' || Array.isArray(quote)) return null;
  const value = quote as Record<string, unknown>;
  const directId = stringValue(value, ['sourceMessageId', 'replyMessageId', 'messageId']);
  if (directId) {
    const direct = await prisma.message.findFirst({
      where: { id: directId, conversationId },
      select: { id: true },
    });
    if (direct) return direct.id;
  }

  const zaloMsgId = stringValue(value, ['msgId', 'zaloMsgId']);
  const cliMsgId = stringValue(value, ['cliMsgId', 'zaloCliMsgId']);
  if (!zaloMsgId && !cliMsgId) return null;
  const source = await prisma.message.findFirst({
    where: {
      conversationId,
      OR: [
        ...(zaloMsgId ? [{ zaloMsgId }] : []),
        ...(cliMsgId ? [{ zaloCliMsgId: cliMsgId }] : []),
      ],
    },
    select: { id: true },
    orderBy: { sentAt: 'desc' },
  });
  return source?.id || null;
}

function stringValue(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'number' || typeof candidate === 'bigint') return String(candidate);
  }
  return '';
}
