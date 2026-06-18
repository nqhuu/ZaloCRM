import type { Server } from 'socket.io';

type NotificationSocketAction = 'new' | 'updated' | 'count';

export interface NotificationSocketPayload {
  orgId: string;
  userId?: string | null;
  source?: string;
  sourceId?: string | null;
  type?: string;
  notificationId?: string | null;
}

function emitNotificationEvent(
  io: Server | null | undefined,
  action: NotificationSocketAction,
  payload: NotificationSocketPayload,
) {
  if (!io || !payload.orgId) return;
  const event = {
    ...payload,
    userId: payload.userId ?? null,
    notificationId: payload.notificationId ?? null,
    action,
    at: new Date().toISOString(),
  };
  io.to(`org:${payload.orgId}`).emit(`notification:${action}`, event);
}

export function emitNotificationNew(io: Server | null | undefined, payload: NotificationSocketPayload) {
  emitNotificationEvent(io, 'new', payload);
  emitNotificationCount(io, payload);
}

export function emitNotificationUpdated(io: Server | null | undefined, payload: NotificationSocketPayload) {
  emitNotificationEvent(io, 'updated', payload);
  emitNotificationCount(io, payload);
}

export function emitNotificationCount(io: Server | null | undefined, payload: NotificationSocketPayload) {
  emitNotificationEvent(io, 'count', payload);
}
