import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { oneLine, summarizeQuote } from './archive-format.js';
import {
  appendSheetRows,
  ensureSheetWithHeader,
  isGoogleArchiveConfigured,
  mergeConversationNameBlock,
  updateSheetRow,
  uploadUrlToDrive,
} from './google-archive-client.js';
import { archiveSummary, archiveStoryInclude } from './archive-service.js';

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startArchiveBackupWorker(io: Server): void {
  if (timer) return;
  timer = setInterval(() => void drain(io), 10_000);
  timer.unref();
  void drain(io);
  logger.info('[archive] Google backup worker started');
}

async function drain(io: Server): Promise<void> {
  if (running || !isGoogleArchiveConfigured()) return;
  running = true;
  try {
    const stories = await prisma.archiveStory.findMany({
      where: {
        destinationId: { not: null },
        backupStatus: { in: ['pending', 'partial', 'failed'] },
        OR: [{ nextBackupAt: null }, { nextBackupAt: { lte: new Date() } }],
        backupAttempts: { lt: 8 },
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
      select: { id: true },
    });
    for (const story of stories) await syncStory(story.id, io);
  } finally {
    running = false;
  }
}

export async function syncStory(storyId: string, io?: Server): Promise<void> {
  const story = await prisma.archiveStory.findUnique({
    where: { id: storyId },
    include: {
      ...archiveStoryInclude,
      destination: true,
    },
  });
  if (!story?.destination?.enabled) return;

  await prisma.archiveStory.update({
    where: { id: story.id },
    data: { backupStatus: 'syncing', backupAttempts: { increment: 1 }, backupError: null },
  });

  try {
    await ensureSheetWithHeader({
      spreadsheetId: story.destination.spreadsheetId,
      sheetName: story.destination.rawSheetName,
      headers: RAW_HEADERS,
    });
    await ensureSheetWithHeader({
      spreadsheetId: story.destination.spreadsheetId,
      sheetName: story.destination.viewSheetName,
      headers: VIEW_HEADERS,
    });

    for (const message of story.messages) {
      for (const media of message.media) {
        if (media.driveFileId) continue;
        try {
          const uploaded = await uploadUrlToDrive({
            sourceUrl: media.sourceUrl,
            folderId: story.destination.driveFolderId,
            fileName: media.fileName,
            mimeType: media.mimeType,
          });
          await prisma.archiveMedia.update({
            where: { id: media.id },
            data: {
              driveFileId: uploaded.fileId,
              driveUrl: uploaded.driveUrl,
              backupStatus: 'completed',
              backupError: null,
            },
          });
          media.driveFileId = uploaded.fileId;
          media.driveUrl = uploaded.driveUrl;
          media.backupStatus = 'completed';
        } catch (error) {
          await prisma.archiveMedia.update({
            where: { id: media.id },
            data: { backupStatus: 'failed', backupError: errorMessage(error) },
          });
          throw error;
        }
      }
    }
    for (const message of story.messages) {
      const rowValues = rawRow(story, message);
      if (message.googleRawRow) {
        await updateSheetRow({
          spreadsheetId: story.destination.spreadsheetId,
          sheetName: story.destination.rawSheetName,
          row: message.googleRawRow,
          values: rowValues,
        });
      } else {
        const row = await appendSheetRows({
          spreadsheetId: story.destination.spreadsheetId,
          sheetName: story.destination.rawSheetName,
          rows: [rowValues],
        });
        await prisma.archiveMessage.update({ where: { id: message.id }, data: { googleRawRow: row } });
        message.googleRawRow = row;
      }
    }

    const viewValues = viewRow(story);
    let googleViewRow = story.googleViewRow;
    if (googleViewRow) {
      await updateSheetRow({
        spreadsheetId: story.destination.spreadsheetId,
        sheetName: story.destination.viewSheetName,
        row: googleViewRow,
        values: viewValues,
      });
    } else {
      googleViewRow = await appendSheetRows({
        spreadsheetId: story.destination.spreadsheetId,
        sheetName: story.destination.viewSheetName,
        rows: [viewValues],
      });
    }
    await mergeConversationNameBlock({
      spreadsheetId: story.destination.spreadsheetId,
      sheetName: story.destination.viewSheetName,
      row: googleViewRow,
      conversationName: story.conversationName,
    });

    await prisma.$transaction([
      prisma.archiveStory.update({
        where: { id: story.id },
        data: {
          backupStatus: 'completed',
          backupError: null,
          nextBackupAt: null,
          googleViewRow,
        },
      }),
      prisma.archiveRecallEvent.updateMany({
        where: { storyId: story.id, sheetSyncedAt: null },
        data: { sheetSyncedAt: new Date() },
      }),
      prisma.archiveNotification.create({
        data: {
          orgId: story.orgId,
          userId: story.createdByUserId,
          storyId: story.id,
          type: 'backup_completed',
          title: 'Đã sao lưu lên Google',
          detail: `${archiveSummary(story)}: ${story.messages.length} tin nhắn đã ghi vào Sheets, media đã lưu lên Drive`,
          priority: 'low',
          dedupeKey: `archive-backup:${story.id}:${story.updatedAt.toISOString()}`,
        },
      }),
    ]);
    io?.to(`org:${story.orgId}`).emit('archive:backup-completed', {
      storyId: story.id,
      userId: story.createdByUserId,
      summary: archiveSummary(story),
    });
  } catch (error) {
    const attempts = story.backupAttempts + 1;
    const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 6));
    await prisma.archiveStory.update({
      where: { id: story.id },
      data: {
        backupStatus: 'failed',
        backupError: errorMessage(error),
        nextBackupAt: new Date(Date.now() + delayMinutes * 60_000),
      },
    });
    logger.error(`[archive] Backup failed for story ${story.id}:`, error);
    io?.to(`org:${story.orgId}`).emit('archive:backup-failed', {
      storyId: story.id,
      userId: story.createdByUserId,
      error: errorMessage(error),
    });
  }
}

function rawRow(story: any, message: any): unknown[] {
  const mediaLinks = message.media.map((media: any) => media.driveUrl).filter(Boolean).join('\n');
  return [
    message.id,
    story.id,
    story.conversationId,
    story.conversationName,
    story.zaloAccount.displayName || '',
    message.sourceMessageId,
    message.senderName || (message.senderType === 'self' ? 'Sale' : 'Khách'),
    story.contactPhone || '',
    message.sentAt.toISOString(),
    message.senderType === 'self' ? 'Sale gửi' : 'Khách gửi',
    message.contentType,
    oneLine(message.contentSnapshot) || `[${message.contentType}]`,
    summarizeQuote(message.quoteSnapshot),
    mediaLinks,
    message.recalledAt ? 'Có' : 'Không',
    message.recalledAt?.toISOString() || '',
    message.recalledContent || '',
    story.createdBy.fullName,
    story.createdAt.toISOString(),
  ];
}

function viewRow(story: any): unknown[] {
  const mediaLinks = story.messages
    .flatMap((message: any) => message.media.map((media: any) => media.driveUrl))
    .filter(Boolean)
    .join('\n');
  return [
    story.conversationName,
    story.contactPhone || '',
    story.conversationContent,
    story.recalledContent || '',
    mediaLinks,
    story.statusDefinition?.name || story.businessStatus,
    story.completedAt?.toISOString() || '',
    story.completedBy?.fullName || '',
    story.resultContent || '',
    story.assignedUser?.fullName || '',
    story.createdAt.toISOString(),
    story.id,
  ];
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

const RAW_HEADERS = [
  'Archive Message ID', 'Story ID', 'Conversation ID', 'Nhóm chat / User',
  'Tài khoản Zalo', 'Message ID', 'Người gửi', 'SĐT', 'Thời gian gửi',
  'Chiều tin', 'Loại tin', 'Nội dung', 'Trả lời tin', 'Link Drive',
  'Đã thu hồi', 'Thời gian thu hồi', 'Nội dung bị thu hồi', 'Người lưu', 'Thời gian lưu',
];

const VIEW_HEADERS = [
  'Nhóm chat / User', 'SĐT', 'Nội dung hội thoại', 'Tin nhắn thu hồi',
  'Link ảnh / file / voice trên Drive', 'Trạng thái', 'Thời gian hoàn thành',
  'Người hoàn thành', 'Nội dung kết quả', 'Người phụ trách', 'Thời gian lưu', 'Story ID',
];
