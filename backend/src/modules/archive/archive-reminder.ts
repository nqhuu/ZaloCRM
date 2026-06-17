import cron from 'node-cron';
import type { Server } from 'socket.io';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { oneLine } from './archive-format.js';

export function startArchiveReminder(io: Server): void {
  cron.schedule(config.archiveReminderCron, () => void runArchiveReminder(io));
  logger.info(`[archive] End-of-day reminder scheduled: ${config.archiveReminderCron} UTC`);
}

export async function runArchiveReminder(io: Server): Promise<void> {
  const now = new Date();
  const organizations = await prisma.organization.findMany({
    select: { id: true, timezone: true },
  });
  const stories = [];
  for (const org of organizations) {
    const start = startOfLocalDay(now, org.timezone);
    const orgStories = await prisma.archiveStory.findMany({
      where: {
        orgId: org.id,
        AND: [
          {
            OR: [
              { statusDefinition: { is: { behaviorGroup: { in: ['active', 'waiting'] } } } },
              { statusDefinitionId: null, businessStatus: 'pending' },
            ],
          },
          {
            OR: [{ lastReminderDate: null }, { lastReminderDate: { lt: start } }],
          },
        ],
        createdAt: { gte: start, lte: now },
      },
      include: {
        assignedUser: { select: { id: true, fullName: true } },
      },
    });
    stories.push(...orgStories);
  }
  if (stories.length === 0) return;

  const byOrg = new Map<string, typeof stories>();
  const byUser = new Map<string, typeof stories>();
  for (const story of stories) {
    byOrg.set(story.orgId, [...(byOrg.get(story.orgId) || []), story]);
    if (story.assignedUserId) {
      byUser.set(story.assignedUserId, [...(byUser.get(story.assignedUserId) || []), story]);
    }
  }

  for (const [userId, items] of byUser) {
    const dayKey = localDayKey(now, organizations.find((org) => org.id === items[0].orgId)?.timezone || '+07:00');
    const detail = items.slice(0, 8)
      .map((story) => `${story.conversationName}: ${oneLine(story.title || story.conversationContent).slice(0, 80)}`)
      .join('\n');
    await prisma.archiveNotification.create({
      data: {
        orgId: items[0].orgId,
        userId,
        type: 'end_of_day_pending',
        title: `Bạn còn ${items.length} nội dung chưa hoàn thành`,
        detail,
        priority: 'high',
        dedupeKey: `archive-eod:${dayKey}:user:${userId}`,
      },
    }).catch(() => null);
    io.to(`org:${items[0].orgId}`).emit('archive:end-of-day-reminder', {
      userId,
      count: items.length,
      stories: items.map((story) => ({ id: story.id, title: story.title, conversationName: story.conversationName })),
    });
  }

  for (const [orgId, items] of byOrg) {
    const dayKey = localDayKey(now, organizations.find((org) => org.id === orgId)?.timezone || '+07:00');
    const managers = await prisma.user.findMany({
      where: { orgId, role: { in: ['owner', 'admin'] }, isActive: true },
      select: { id: true },
    });
    const counts = new Map<string, number>();
    items.forEach((story) => {
      const name = story.assignedUser?.fullName || 'Chưa phân công';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    const detail = [...counts.entries()].map(([name, count]) => `${name}: ${count}`).join('\n');
    for (const manager of managers) {
      await prisma.archiveNotification.create({
        data: {
          orgId,
          userId: manager.id,
          type: 'end_of_day_manager',
          title: `Cuối ngày còn ${items.length} nội dung chưa hoàn thành`,
          detail,
          priority: 'high',
          dedupeKey: `archive-eod:${dayKey}:manager:${manager.id}`,
        },
      }).catch(() => null);
    }
  }

  await prisma.archiveStory.updateMany({
    where: { id: { in: stories.map((story) => story.id) } },
    data: { lastReminderDate: now },
  });
}

function timezoneMinutes(timezone: string): number {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(timezone);
  if (!match) return 420;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

function localDayKey(now: Date, timezone: string): string {
  const shifted = new Date(now.getTime() + timezoneMinutes(timezone) * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function startOfLocalDay(now: Date, timezone: string): Date {
  const offset = timezoneMinutes(timezone);
  const key = localDayKey(now, timezone);
  return new Date(new Date(`${key}T00:00:00.000Z`).getTime() - offset * 60_000);
}
