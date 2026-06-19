import type { FastifyInstance, FastifyReply } from 'fastify';
import ExcelJS from 'exceljs';
import { logActivity } from '../activity/activity-logger.js';
import { actorHasArchiveGrant, type ArchiveActor } from './archive-access.js';
import {
  ArchiveStatusError,
  createArchiveStatusReason,
  createArchiveStatusDefinition,
  deleteOrDeactivateArchiveStatusReason,
  deleteOrDeactivateArchiveStatus,
  importArchiveStatusReasons,
  listArchiveStatusDefinitions,
  reorderArchiveStatusReasons,
  reorderArchiveStatuses,
  updateArchiveStatusReason,
  updateArchiveStatusDefinition,
  type ArchiveStatusReasonInput,
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

  app.post('/api/v1/archive/status-definitions/:id/reasons', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const existing = await prisma.archiveStatusDefinition.findFirst({
      where: { id, orgId: actor.orgId },
      select: { departmentId: true },
    });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy trạng thái' });
    if (!(await canManageStatuses(actor, existing.departmentId))) return forbidden(reply);
    try {
      const reason = await createArchiveStatusReason({
        orgId: actor.orgId,
        userId: actor.id,
        statusId: id,
        data: request.body as ArchiveStatusReasonInput,
      });
      logStatusActivity(actor, 'archive_status_reason_created', reason.id, { reason });
      return reply.status(201).send({ reason });
    } catch (error) {
      return sendStatusError(reply, error);
    }
  });

  app.patch('/api/v1/archive/status-reasons/:reasonId', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { reasonId } = request.params as { reasonId: string };
    const existing = await prisma.archiveStatusReason.findFirst({
      where: { id: reasonId, orgId: actor.orgId },
      include: { statusDefinition: { select: { departmentId: true } } },
    });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy lý do trạng thái' });
    if (!(await canManageStatuses(actor, existing.statusDefinition.departmentId))) return forbidden(reply);
    try {
      const reason = await updateArchiveStatusReason({
        orgId: actor.orgId,
        reasonId,
        data: request.body as ArchiveStatusReasonInput,
      });
      logStatusActivity(actor, 'archive_status_reason_updated', reason.id, { reason });
      return { reason };
    } catch (error) {
      return sendStatusError(reply, error);
    }
  });

  app.delete('/api/v1/archive/status-reasons/:reasonId', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { reasonId } = request.params as { reasonId: string };
    const existing = await prisma.archiveStatusReason.findFirst({
      where: { id: reasonId, orgId: actor.orgId },
      include: { statusDefinition: { select: { departmentId: true } } },
    });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy lý do trạng thái' });
    if (!(await canManageStatuses(actor, existing.statusDefinition.departmentId))) return forbidden(reply);
    try {
      const result = await deleteOrDeactivateArchiveStatusReason({ orgId: actor.orgId, reasonId });
      logStatusActivity(actor, 'archive_status_reason_removed', reasonId, { mode: result.mode });
      return {
        ...result,
        message: result.mode === 'deleted'
          ? 'Đã xoá lý do chưa sử dụng'
          : 'Lý do đã được sử dụng nên hệ thống chỉ ngừng sử dụng',
      };
    } catch (error) {
      return sendStatusError(reply, error);
    }
  });

  app.post('/api/v1/archive/status-definitions/:id/reasons/reorder', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const body = request.body as { reasonIds?: string[] };
    const existing = await prisma.archiveStatusDefinition.findFirst({
      where: { id, orgId: actor.orgId },
      select: { departmentId: true },
    });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy trạng thái' });
    if (!(await canManageStatuses(actor, existing.departmentId))) return forbidden(reply);
    try {
      await reorderArchiveStatusReasons({
        orgId: actor.orgId,
        statusId: id,
        reasonIds: body.reasonIds || [],
      });
      logStatusActivity(actor, 'archive_status_reason_reordered', id, { reasonIds: body.reasonIds || [] });
      return { message: 'Đã cập nhật thứ tự lý do' };
    } catch (error) {
      return sendStatusError(reply, error);
    }
  });

  app.post('/api/v1/archive/status-definitions/:id/reasons/import', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const existing = await prisma.archiveStatusDefinition.findFirst({
      where: { id, orgId: actor.orgId },
      select: { departmentId: true },
    });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy trạng thái' });
    if (!(await canManageStatuses(actor, existing.departmentId))) return forbidden(reply);
    try {
      const upload = await (request as any).file();
      if (!upload) return reply.status(400).send({ error: 'File Excel là bắt buộc' });
      const buffer = await upload.toBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) return reply.status(400).send({ error: 'File Excel không có sheet dữ liệu' });
      const rows = readReasonExcelRows(sheet);
      const result = await importArchiveStatusReasons({
        orgId: actor.orgId,
        userId: actor.id,
        statusId: id,
        rows,
      });
      logStatusActivity(actor, 'archive_status_reason_imported', id, result);
      return { ...result, message: 'Đã xử lý file lý do trạng thái' };
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

function readReasonExcelRows(sheet: ExcelJS.Worksheet) {
  const firstRow = sheet.getRow(1);
  const headers = firstRow.values as unknown[];
  const normalizedHeaders = headers.map((value) => normalizeHeader(value));
  const codeIndex = normalizedHeaders.findIndex((value) => ['code', 'ma', 'ma_ly_do', 'reason_code'].includes(value));
  const nameIndex = normalizedHeaders.findIndex((value) => ['name', 'ten', 'ten_ly_do', 'reason_name'].includes(value));
  const hasHeader = codeIndex > 0 && nameIndex > 0;
  const rows: Array<{ code?: unknown; name?: unknown }> = [];

  sheet.eachRow((row, rowNumber) => {
    if (hasHeader && rowNumber === 1) return;
    const code = row.getCell(hasHeader ? codeIndex : 1).value;
    const name = row.getCell(hasHeader ? nameIndex : 2).value;
    if (!String(cellText(code)).trim() && !String(cellText(name)).trim()) return;
    rows.push({ code: cellText(code), name: cellText(name) });
  });
  return rows;
}

function normalizeHeader(value: unknown) {
  return String(cellText(value) || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in (value as any)) return String((value as any).text || '');
  if (typeof value === 'object' && 'result' in (value as any)) return String((value as any).result || '');
  if (typeof value === 'object' && 'richText' in (value as any)) {
    return ((value as any).richText || []).map((part: any) => part.text || '').join('');
  }
  return String(value);
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
