import type { FastifyInstance, FastifyReply } from 'fastify';
import { logActivity } from '../activity/activity-logger.js';
import { actorHasArchiveGrant, type ArchiveActor } from './archive-access.js';
import {
  ArchiveStatusError,
  createArchiveStatusDefinition,
  deleteOrDeactivateArchiveStatus,
  listArchiveStatusDefinitions,
  reorderArchiveStatuses,
  updateArchiveStatusDefinition,
  type ArchiveStatusInput,
} from './archive-status-service.js';
import { prisma } from '../../shared/database/prisma-client.js';

export async function registerArchiveStatusRoutes(app: FastifyInstance) {
  app.get('/api/v1/archive/status-definitions', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply);
    const query = request.query as {
      departmentId?: string;
      includeInactive?: string;
      allDepartments?: string;
    };
    const allDepartments = query.allDepartments === 'true';
    const departmentId = allDepartments ? null : query.departmentId || await actorDepartmentId(actor.id);
    const statuses = await listArchiveStatusDefinitions({
      orgId: actor.orgId,
      departmentId,
      includeInactive: query.includeInactive === 'true' && await canManageStatuses(actor, departmentId),
      allDepartments,
    });
    return {
      statuses,
      canManage: await canManageStatuses(actor, departmentId),
      behaviorGroups: ['active', 'waiting', 'completed', 'cancelled'],
    };
  });

  app.post('/api/v1/archive/status-definitions', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const body = request.body as ArchiveStatusInput;
    if (!(await canManageStatuses(actor, body.departmentId))) return forbidden(reply);
    try {
      const status = await createArchiveStatusDefinition({
        orgId: actor.orgId,
        userId: actor.id,
        data: body,
      });
      logStatusActivity(actor, 'archive_status_created', status?.id || null, { status });
      return reply.status(201).send({ status });
    } catch (error) {
      return sendStatusError(reply, error);
    }
  });

  app.patch('/api/v1/archive/status-definitions/:id', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const existing = await prisma.archiveStatusDefinition.findFirst({
      where: { id, orgId: actor.orgId },
      select: { departmentId: true },
    });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy trạng thái' });
    if (!(await canManageStatuses(actor, existing.departmentId))) return forbidden(reply);
    try {
      const status = await updateArchiveStatusDefinition({
        orgId: actor.orgId,
        statusId: id,
        data: request.body as ArchiveStatusInput,
      });
      logStatusActivity(actor, 'archive_status_updated', id, { status });
      return { status };
    } catch (error) {
      return sendStatusError(reply, error);
    }
  });

  app.delete('/api/v1/archive/status-definitions/:id', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const existing = await prisma.archiveStatusDefinition.findFirst({
      where: { id, orgId: actor.orgId },
      select: { departmentId: true },
    });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy trạng thái' });
    if (!(await canManageStatuses(actor, existing.departmentId))) return forbidden(reply);
    try {
      const result = await deleteOrDeactivateArchiveStatus({ orgId: actor.orgId, statusId: id });
      logStatusActivity(actor, 'archive_status_removed', id, { mode: result.mode });
      return {
        ...result,
        message: result.mode === 'deleted'
          ? 'Đã xoá trạng thái chưa sử dụng'
          : 'Trạng thái đã được sử dụng nên hệ thống chỉ ngừng sử dụng',
      };
    } catch (error) {
      return sendStatusError(reply, error);
    }
  });

  app.post('/api/v1/archive/status-definitions/reorder', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const body = request.body as { statusIds?: string[] };
    const ids = body.statusIds || [];
    const statuses = await prisma.archiveStatusDefinition.findMany({
      where: { id: { in: ids }, orgId: actor.orgId },
      select: { departmentId: true },
    });
    const scopes = [...new Set(statuses.map((status) => status.departmentId || 'global'))];
    if (
      statuses.length !== ids.length
      || scopes.length !== 1
      || !(await canManageStatuses(actor, scopes[0] === 'global' ? null : scopes[0]))
    ) return forbidden(reply);
    try {
      await reorderArchiveStatuses({ orgId: actor.orgId, statusIds: ids });
      logStatusActivity(actor, 'archive_status_reordered', null, { statusIds: ids });
      return { message: 'Đã cập nhật thứ tự trạng thái' };
    } catch (error) {
      return sendStatusError(reply, error);
    }
  });
}

async function canManageStatuses(actor: ArchiveActor, departmentId?: string | null) {
  if (['owner', 'admin'].includes(actor.role)) return true;
  if (!departmentId || !(await actorHasArchiveGrant(actor, 'approve'))) return false;
  const membership = await prisma.departmentMember.findUnique({
    where: { userId: actor.id },
    select: {
      deptRole: true,
      department: { select: { path: true } },
    },
  });
  if (!membership || !['leader', 'deputy'].includes(membership.deptRole)) return false;
  const target = await prisma.department.findFirst({
    where: { id: departmentId, orgId: actor.orgId, archivedAt: null },
    select: { path: true },
  });
  return Boolean(target?.path.startsWith(membership.department.path));
}

async function actorDepartmentId(userId: string) {
  const membership = await prisma.departmentMember.findUnique({
    where: { userId },
    select: { departmentId: true },
  });
  return membership?.departmentId || null;
}

function logStatusActivity(
  actor: ArchiveActor,
  action: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  logActivity({
    orgId: actor.orgId,
    userId: actor.id,
    action,
    entityType: 'archive_status_definition',
    entityId,
    details,
    category: 'system',
  });
}

function sendStatusError(reply: FastifyReply, error: unknown) {
  if (error instanceof ArchiveStatusError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  return reply.status(500).send({ error: error instanceof Error ? error.message : String(error) });
}

function forbidden(reply: FastifyReply) {
  return reply.status(403).send({
    error: 'Không có quyền quản lý trạng thái hồ sơ',
    code: 'RBAC_FORBIDDEN',
  });
}
