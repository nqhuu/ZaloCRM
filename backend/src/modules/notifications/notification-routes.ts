/**
 * Notification routes — Facebook-style notification feed for the authenticated user.
 *
 * Phase 1 keeps archive notifications persisted and keeps legacy computed
 * warnings for chat/appointments/Zalo status.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { getZaloScope } from '../zalo/zalo-scope.js';

type NotificationSeverity = 'info' | 'warning' | 'error' | 'success';
type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';
type NotificationSource = 'archive' | 'chat' | 'appointment' | 'zalo';
type NotificationActionKind =
  | 'open_archive_story'
  | 'open_chat'
  | 'open_appointments'
  | 'open_zalo_account'
  | 'open_archive_handover';

interface NotificationAction {
  kind: NotificationActionKind;
  path: string;
  storyId?: string;
  messageId?: string;
  accountId?: string;
}

interface NotificationItem {
  id: string;
  source: NotificationSource;
  sourceId?: string;
  type: string;
  severity: NotificationSeverity;
  priority: NotificationPriority;
  title: string;
  detail: string;
  createdAt: string;
  readAt: string | null;
  seenAt: string | null;
  requiresAck: boolean;
  acknowledgedAt: string | null;
  action: NotificationAction;
}

function priorityOf(priority: string): NotificationPriority {
  if (priority === 'critical' || priority === 'high' || priority === 'medium' || priority === 'low') {
    return priority;
  }
  return 'medium';
}

function archiveSeverity(type: string): NotificationSeverity {
  if (type === 'message_recalled') return 'error';
  if (type.includes('pending') || type.includes('handover') || type.includes('transfer')) return 'warning';
  return 'info';
}

function isActionableUnread(notification: Pick<NotificationItem, 'requiresAck' | 'acknowledgedAt' | 'readAt'>): boolean {
  if (notification.requiresAck) return !notification.acknowledgedAt;
  return !notification.readAt;
}

function requiresAcknowledgement(type: string, storedFlag: boolean): boolean {
  return storedFlag || type === 'message_recalled';
}

function isPersistedNotificationId(id: string): boolean {
  return id.startsWith('archive-');
}

function isComputedNotificationId(id: string): boolean {
  return id.startsWith('computed-');
}

async function markComputedNotificationRead(user: { id: string; orgId: string }, notificationKey: string) {
  const now = new Date();
  await prisma.notificationRead.upsert({
    where: {
      orgId_userId_notificationKey: {
        orgId: user.orgId,
        userId: user.id,
        notificationKey,
      },
    },
    create: {
      orgId: user.orgId,
      userId: user.id,
      notificationKey,
      readAt: now,
      seenAt: now,
    },
    update: {
      readAt: now,
      seenAt: now,
    },
  });
}

async function findMutableArchiveNotification(
  id: string,
  user: { id: string; orgId: string },
  reply: FastifyReply,
) {
  const rawId = id.startsWith('archive-') ? id.slice('archive-'.length) : id;
  const notification = await prisma.archiveNotification.findFirst({
    where: {
      id: rawId,
      orgId: user.orgId,
      OR: [{ userId: user.id }, { userId: null }],
    },
  });
  if (!notification) {
    reply.status(404).send({ error: 'Notification not found' });
    return null;
  }
  return notification;
}

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/notifications', async (request) => {
    const user = request.user!;
    const notifications: NotificationItem[] = [];

    const archiveNotifications = await prisma.archiveNotification.findMany({
      where: {
        orgId: user.orgId,
        AND: [
          { OR: [{ userId: user.id }, { userId: null }] },
          {
            OR: [
              { requiresAck: true, acknowledgedAt: null },
              { type: 'message_recalled', acknowledgedAt: null },
              { requiresAck: false, readAt: null },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        story: { select: { id: true, title: true, conversationName: true } },
      },
    });

    notifications.push(...archiveNotifications.map((item) => {
      const storyTitle = item.story?.title || item.story?.conversationName;
      const title = item.type === 'message_recalled' && storyTitle && !item.title.includes(storyTitle)
        ? `${item.title} trong hồ sơ "${storyTitle}"`
        : item.title;
      const path = item.storyId
        ? `/archive?storyId=${encodeURIComponent(item.storyId)}`
        : '/archive';
      const actionKind: NotificationActionKind = item.type.includes('handover') || item.type.includes('transfer')
        ? 'open_archive_handover'
        : 'open_archive_story';
      const requiresAck = requiresAcknowledgement(item.type, item.requiresAck);
      return {
        id: `archive-${item.id}`,
        source: 'archive' as const,
        sourceId: item.id,
        type: item.type,
        severity: archiveSeverity(item.type),
        priority: priorityOf(item.priority),
        title,
        detail: item.detail,
        createdAt: item.createdAt.toISOString(),
        readAt: item.readAt?.toISOString() || null,
        seenAt: item.seenAt?.toISOString() || null,
        requiresAck,
        acknowledgedAt: item.acknowledgedAt?.toISOString() || null,
        action: {
          kind: actionKind,
          path,
          storyId: item.storyId || undefined,
        },
      };
    }));

    // 1. Unreplied conversations > 30 min — scoped by accessible Zalo accounts.
    const scope = await getZaloScope(user.id, user.orgId, user.role);
    const thirtyMinAgo = new Date(Date.now() - 30 * 60000);
    const unreplied = scope.accessibleIds.length
      ? await prisma.conversation.count({
          where: {
            orgId: user.orgId,
            zaloAccountId: { in: scope.accessibleIds },
            isReplied: false,
            lastMessageAt: { lt: thirtyMinAgo },
          },
        })
      : 0;
    if (unreplied > 0) {
      notifications.push({
        id: 'computed-unreplied',
        source: 'chat',
        type: 'unreplied_overdue',
        severity: 'warning',
        priority: 'high',
        title: `${unreplied} cuộc trò chuyện chưa trả lời`,
        detail: 'Có tin nhắn chưa phản hồi quá 30 phút',
        createdAt: new Date().toISOString(),
        readAt: null,
        seenAt: null,
        requiresAck: false,
        acknowledgedAt: null,
        action: { kind: 'open_chat', path: '/chat' },
      });
    }

    // 2. Today's appointments.
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todayApts = await prisma.appointment.findMany({
      where: {
        orgId: user.orgId,
        appointmentDate: { gte: todayStart, lt: todayEnd },
        status: 'scheduled',
      },
      include: { contact: { select: { fullName: true } } },
      take: 5,
    });
    for (const apt of todayApts) {
      notifications.push({
        id: `computed-apt-${apt.id}`,
        source: 'appointment',
        sourceId: apt.id,
        type: 'appointment_today',
        severity: 'info',
        priority: 'medium',
        title: `Lịch hẹn: ${apt.contact?.fullName || 'KH'}`,
        detail: `${apt.appointmentTime || ''} - ${apt.notes || 'Tái khám'}`,
        createdAt: apt.appointmentDate.toISOString(),
        readAt: null,
        seenAt: null,
        requiresAck: false,
        acknowledgedAt: null,
        action: { kind: 'open_appointments', path: '/appointments' },
      });
    }

    // 3. Tomorrow's appointments.
    const tomorrowStart = new Date(todayEnd);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

    const tmrApts = await prisma.appointment.count({
      where: {
        orgId: user.orgId,
        appointmentDate: { gte: tomorrowStart, lt: tomorrowEnd },
        status: 'scheduled',
      },
    });
    if (tmrApts > 0) {
      notifications.push({
        id: 'computed-tmr-apts',
        source: 'appointment',
        type: 'appointment_tomorrow',
        severity: 'info',
        priority: 'low',
        title: `${tmrApts} lịch hẹn ngày mai`,
        detail: 'Chuẩn bị cho ngày mai',
        createdAt: new Date().toISOString(),
        readAt: null,
        seenAt: null,
        requiresAck: false,
        acknowledgedAt: null,
        action: { kind: 'open_appointments', path: '/appointments' },
      });
    }

    // 4. Disconnected Zalo accounts — scoped by accessible accounts.
    const accounts = scope.accessibleIds.length
      ? await prisma.zaloAccount.findMany({
          where: { orgId: user.orgId, id: { in: scope.accessibleIds }, deletedAt: null },
          select: { id: true, displayName: true },
        })
      : [];
    for (const acc of accounts) {
      const status = zaloPool.getStatus(acc.id);
      if (status !== 'connected') {
        notifications.push({
          id: `computed-zalo-${acc.id}`,
          source: 'zalo',
          sourceId: acc.id,
          type: 'zalo_disconnected',
          severity: 'error',
          priority: 'high',
          title: `Zalo "${acc.displayName}" mất kết nối`,
          detail: `Trạng thái: ${status}`,
          createdAt: new Date().toISOString(),
          readAt: null,
          seenAt: null,
          requiresAck: false,
          acknowledgedAt: null,
          action: { kind: 'open_zalo_account', path: '/zalo-accounts', accountId: acc.id },
        });
      }
    }

    const computedKeys = notifications
      .filter((n) => isComputedNotificationId(n.id))
      .map((n) => n.id);
    if (computedKeys.length > 0) {
      const readStates = await prisma.notificationRead.findMany({
        where: {
          orgId: user.orgId,
          userId: user.id,
          notificationKey: { in: computedKeys },
        },
      });
      const readByKey = new Map(readStates.map((r) => [r.notificationKey, r]));
      for (const notification of notifications) {
        const readState = readByKey.get(notification.id);
        if (readState) {
          notification.readAt = readState.readAt.toISOString();
          notification.seenAt = readState.seenAt.toISOString();
        }
      }
    }

    notifications.sort((a, b) => {
      const aUrgent = isActionableUnread(a) ? 1 : 0;
      const bUrgent = isActionableUnread(b) ? 1 : 0;
      if (aUrgent !== bUrgent) return bUrgent - aUrgent;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const unreadCount = notifications.filter(isActionableUnread).length;
    const ackRequiredCount = notifications.filter((n) => n.requiresAck && !n.acknowledgedAt).length;

    return { notifications, unreadCount, ackRequiredCount };
  });

  app.patch('/api/v1/notifications/:id/seen', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    if (!isPersistedNotificationId(id)) return { ok: true };
    const notification = await findMutableArchiveNotification(id, user, reply);
    if (!notification) return reply;
    if (notification.seenAt) return { ok: true };
    await prisma.archiveNotification.update({
      where: { id: notification.id },
      data: { seenAt: new Date() },
    });
    return { ok: true };
  });

  app.patch('/api/v1/notifications/:id/read', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    if (!isPersistedNotificationId(id)) {
      if (isComputedNotificationId(id)) {
        await markComputedNotificationRead(user, id);
      }
      return { ok: true };
    }
    const notification = await findMutableArchiveNotification(id, user, reply);
    if (!notification) return reply;
    await prisma.archiveNotification.update({
      where: { id: notification.id },
      data: {
        readAt: notification.readAt || new Date(),
        seenAt: notification.seenAt || new Date(),
      },
    });
    return { ok: true };
  });

  app.patch('/api/v1/notifications/:id/acknowledge', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    if (!id.startsWith('archive-')) return reply.status(400).send({ error: 'Only persisted notifications can be acknowledged' });
    const notification = await findMutableArchiveNotification(id, user, reply);
    if (!notification) return reply;
    if (!requiresAcknowledgement(notification.type, notification.requiresAck)) {
      return reply.status(400).send({ error: 'Notification does not require acknowledgement' });
    }
    await prisma.archiveNotification.update({
      where: { id: notification.id },
      data: {
        requiresAck: true,
        acknowledgedAt: notification.acknowledgedAt || new Date(),
        acknowledgedByUserId: notification.acknowledgedByUserId || user.id,
        readAt: notification.readAt || new Date(),
        seenAt: notification.seenAt || new Date(),
      },
    });
    return { ok: true };
  });

  app.post('/api/v1/notifications/mark-all-read', async (request) => {
    const user = request.user!;
    await prisma.archiveNotification.updateMany({
      where: {
        orgId: user.orgId,
        requiresAck: false,
        type: { not: 'message_recalled' },
        readAt: null,
        OR: [{ userId: user.id }, { userId: null }],
      },
      data: {
        readAt: new Date(),
        seenAt: new Date(),
      },
    });
    return { ok: true };
  });
}
