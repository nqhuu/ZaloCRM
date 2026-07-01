import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logActivity } from '../activity/activity-logger.js';
import { userHasGrant } from '../rbac/permission-group-service.js';
import type { Action } from '../rbac/permission-types.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { getZaloScope } from '../zalo/zalo-scope.js';
import {
  applyCustomerSourceSnapshots,
  previewCustomerDataSourceSync,
  runAdhocCustomerSheetSync,
  runCustomerDataSourceSync,
} from './customer-master-sync-service.js';
import { reloadCustomerDataSourceCron } from './customer-master-cron.js';
import { backfillArchiveStoriesForCustomerProfile } from '../archive/archive-customer-context-service.js';

type Actor = { id: string; orgId: string; role: string };
type CustomerContactOption = Prisma.ContactGetPayload<{
  select: ReturnType<typeof contactSelectForCustomerProfile>;
}>;

function badRequest(reply: FastifyReply, error: string) {
  return reply.status(400).send({ error });
}

function isAdmin(actor: Actor) {
  return actor.role === 'owner' || actor.role === 'admin';
}

function currentActor(request: FastifyRequest): Actor {
  const user = request.user! as any;
  return {
    id: user.userId ?? user.id,
    orgId: user.orgId,
    role: user.role,
  };
}

async function canManageCustomers(actor: Actor): Promise<boolean> {
  if (isAdmin(actor)) return true;
  if (!actor.id) return false;
  const member = await prisma.departmentMember.findUnique({
    where: { userId: actor.id },
    select: { deptRole: true },
  });
  return member?.deptRole === 'leader' || member?.deptRole === 'deputy';
}

async function canManageCustomerSource(actor: Actor, action: Action): Promise<boolean> {
  if (isAdmin(actor)) return true;
  if (!actor.id) return false;
  return userHasGrant(actor.id, 'customer_source', action);
}

async function sourcePermissions(actor: Actor) {
  const [access, create, edit, remove] = await Promise.all([
    canManageCustomerSource(actor, 'access'),
    canManageCustomerSource(actor, 'create'),
    canManageCustomerSource(actor, 'edit'),
    canManageCustomerSource(actor, 'delete'),
  ]);
  return { access, create, edit, delete: remove, syncNow: edit };
}

function trimOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeSpreadsheetId(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const urlMatch = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const id = urlMatch?.[1] || text;
  if (!/^[a-zA-Z0-9-_]{20,}$/.test(id)) return null;
  return id;
}

function phoneSearchClauses(phone: string) {
  const canonicalPhone = normalizePhone(phone);
  const digits = phone.replace(/[^\d]/g, '');
  const phoneVariants = new Set<string>();
  if (digits.length >= 8) {
    phoneVariants.add(digits);
    if (digits.startsWith('0')) phoneVariants.add(`84${digits.slice(1)}`);
    if (digits.startsWith('84')) phoneVariants.add(`0${digits.slice(2)}`);
  }
  return {
    canonicalPhone,
    clauses: [
      ...(canonicalPhone ? [{ phoneNormalized: { equals: canonicalPhone } }] : []),
      ...Array.from(phoneVariants).flatMap((variant) => [
        { phone: { contains: variant } },
        { phone2: { contains: variant } },
        { phone3: { contains: variant } },
      ]),
    ],
  };
}

function contactSelectForCustomerProfile() {
  return {
    id: true,
    fullName: true,
    crmName: true,
    zaloUsername: true,
    zaloGlobalId: true,
    phone: true,
    phoneNormalized: true,
    email: true,
    birthDate: true,
    notes: true,
    metadata: true,
    avatarUrl: true,
    hasZalo: true,
    customerProfileContacts: {
      where: { isActive: true },
      select: {
        customerProfileId: true,
        role: true,
        isPrimary: true,
        customerProfile: {
          select: {
            id: true,
            code: true,
            externalKey: true,
            name: true,
          },
        },
      },
      take: 5,
    },
    conversations: {
      select: {
        zaloAccount: { select: { id: true, displayName: true, phone: true, deletedAt: true } },
      },
      take: 3,
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    },
    friends: {
      select: {
        aliasInNick: true,
        zaloDisplayName: true,
        zaloGlobalId: true,
        zaloUsername: true,
        zaloUidInNick: true,
        relationshipKind: true,
        friendshipStatus: true,
        zaloAccount: { select: { id: true, displayName: true, phone: true, deletedAt: true } },
      },
      take: 5,
      orderBy: { lastInteractionAt: { sort: 'desc', nulls: 'last' } },
    },
  } as const;
}

function contactHasZaloIdentity(contact: CustomerContactOption): boolean {
  return Boolean(
    contact.zaloGlobalId
    || contact.zaloUsername
    || contact.hasZalo
    || contact.friends?.length
    || contact.conversations?.length,
  );
}

function contactDisplayName(contact: Pick<CustomerContactOption, 'crmName' | 'fullName' | 'phone'>): string | null {
  return trimOrNull(contact.crmName || contact.fullName || contact.phone);
}

function preferredZaloIdentity(contact: CustomerContactOption) {
  const friend = [...(contact.friends || [])].sort((left, right) => {
    const leftRank = left.friendshipStatus === 'accepted' ? 0 : left.relationshipKind === 'chatting_stranger' ? 1 : 2;
    const rightRank = right.friendshipStatus === 'accepted' ? 0 : right.relationshipKind === 'chatting_stranger' ? 1 : 2;
    return leftRank - rightRank;
  })[0];
  const displayName = trimOrNull(friend?.aliasInNick || friend?.zaloDisplayName || contact.zaloUsername || contact.fullName || contact.crmName);
  return {
    displayName,
    globalId: trimOrNull(friend?.zaloGlobalId || contact.zaloGlobalId),
    username: trimOrNull(friend?.zaloUsername || contact.zaloUsername),
    accountName: trimOrNull(friend?.zaloAccount?.displayName || friend?.zaloAccount?.phone),
  };
}

function buildContactZaloMetadata(contact: CustomerContactOption, phone?: string | null) {
  const zalo = preferredZaloIdentity(contact);
  const normalized = phone ? normalizePhone(phone) : normalizePhone(contact.phone || contact.phoneNormalized || '');
  const current = (contact.metadata && typeof contact.metadata === 'object' && !Array.isArray(contact.metadata))
    ? contact.metadata as Record<string, unknown>
    : {};
  const existingEntries = Array.isArray((current as any).zaloNickByPhone)
    ? (current as any).zaloNickByPhone
    : [];
  const nextEntry = {
    phone: trimOrNull(phone || contact.phone || contact.phoneNormalized),
    normalizedPhone: normalized || null,
    zaloDisplayName: zalo.displayName,
    zaloGlobalId: zalo.globalId,
    zaloUsername: zalo.username,
    accountName: zalo.accountName,
    syncedAt: new Date().toISOString(),
  };
  const entries = [
    ...existingEntries.filter((item: any) => (
      item?.normalizedPhone
        ? item.normalizedPhone !== nextEntry.normalizedPhone
        : item?.phone !== nextEntry.phone
    )),
    nextEntry,
  ];
  return {
    ...current,
    zaloNickByPhone: entries,
    lastZaloNickForPhone: nextEntry,
  };
}

async function syncContactToCustomerZaloUser(input: {
  tx: any;
  actor: Actor;
  customerProfileId: string;
  contact: CustomerContactOption;
}) {
  if (!contactHasZaloIdentity(input.contact)) {
    return {
      status: 'skipped_no_zalo' as const,
      message: 'Người liên hệ chưa có định danh Zalo nên chưa thêm vào User Zalo.',
    };
  }
  const zalo = preferredZaloIdentity(input.contact);
  const snapshotData = {
    contactDisplayNameSnapshot: contactDisplayName(input.contact),
    zaloDisplayNameSnapshot: zalo.displayName,
    phoneSnapshot: trimOrNull(input.contact.phone || input.contact.phoneNormalized),
    zaloGlobalIdSnapshot: zalo.globalId,
    zaloUsernameSnapshot: zalo.username,
  };

  const existing = await input.tx.customerProfileZaloUser.findUnique({
    where: { contactId: input.contact.id },
    include: {
      customerProfile: { select: { id: true, code: true, externalKey: true, name: true } },
    },
  });
  if (existing?.customerProfileId === input.customerProfileId) {
    const updated = await input.tx.customerProfileZaloUser.update({
      where: { contactId: input.contact.id },
      data: snapshotData,
      include: {
        customerProfile: { select: { id: true, code: true, externalKey: true, name: true } },
      },
    });
    await input.tx.contact.update({
      where: { id: input.contact.id },
      data: { metadata: buildContactZaloMetadata(input.contact, snapshotData.phoneSnapshot) },
    });
    return {
      status: 'already_linked' as const,
      message: 'User Zalo của người liên hệ này đã có trong hồ sơ; đã cập nhật tên Zalo và số điện thoại snapshot.',
      link: updated,
    };
  }
  if (existing) {
    await input.tx.contact.update({
      where: { id: input.contact.id },
      data: { metadata: buildContactZaloMetadata(input.contact, snapshotData.phoneSnapshot) },
    });
    const profileCode = existing.customerProfile.code || existing.customerProfile.externalKey || '';
    return {
      status: 'skipped_linked_other_profile' as const,
      message: `Người liên hệ có Zalo nhưng User Zalo đang thuộc hồ sơ ${profileCode ? `${profileCode} - ` : ''}${existing.customerProfile.name}; chưa tự chuyển để tránh gắn sai.`,
      link: existing,
    };
  }

  const link = await input.tx.customerProfileZaloUser.create({
    data: {
      orgId: input.actor.orgId,
      customerProfileId: input.customerProfileId,
      contactId: input.contact.id,
      linkedByUserId: input.actor.id,
      source: 'contact_phone_sync',
      ...snapshotData,
    },
    include: { customerProfile: true, contact: true },
  });
  await input.tx.contact.update({
    where: { id: input.contact.id },
    data: { metadata: buildContactZaloMetadata(input.contact, snapshotData.phoneSnapshot) },
  });
  return {
    status: 'linked' as const,
    message: 'Đã thêm Zalo của người liên hệ vào tab User Zalo, kèm tên nick Zalo và số điện thoại.',
    link,
  };
}

export async function customerMasterRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/customer-data-sources', async (request, reply) => {
    const actor = currentActor(request);
    const permissions = await sourcePermissions(actor);
    if (!permissions.access) return reply.status(403).send({ error: 'Bạn không có quyền xem nguồn đồng bộ khách hàng' });
    const query = (request.query || {}) as { archived?: 'active' | 'archived' | 'all' };
    const archived = query.archived || 'active';
    const sources = await prisma.customerDataSource.findMany({
      where: {
        orgId: actor.orgId,
        ...(archived === 'all' ? {} : archived === 'archived' ? { archivedAt: { not: null } } : { archivedAt: null }),
      },
      include: {
        columnMaps: { orderBy: { targetField: 'asc' } },
        archivedBy: { select: { id: true, fullName: true } },
        _count: { select: { syncRuns: true, customerProfiles: true } },
      },
      orderBy: [{ archivedAt: 'desc' }, { enabled: 'desc' }, { updatedAt: 'desc' }],
    });
    return { sources, permissions };
  });

  app.post('/api/v1/customer-data-sources', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomerSource(actor, 'create'))) return reply.status(403).send({ error: 'Bạn không có quyền tạo nguồn đồng bộ khách hàng' });
    const body = (request.body || {}) as {
      name?: string;
      spreadsheetId?: string;
      sheetName?: string;
      range?: string | null;
      headerRow?: number;
      syncMode?: 'manual' | 'scheduled';
      scheduleCron?: string | null;
      enabled?: boolean;
      columnMaps?: Array<{ targetField: string; sourceHeader: string; required?: boolean; transformRule?: string | null }>;
    };
    if (!body.name || !body.spreadsheetId || !body.sheetName) {
      return badRequest(reply, 'name, spreadsheetId and sheetName are required');
    }
    const spreadsheetId = normalizeSpreadsheetId(body.spreadsheetId);
    if (!spreadsheetId) {
      return badRequest(reply, 'Spreadsheet ID không hợp lệ. Hãy dán URL Google Sheet hoặc ID sau /spreadsheets/d/, không dùng gid của tab.');
    }
    try {
      const data: any = {
        orgId: actor.orgId,
        name: body.name.trim(),
        spreadsheetId,
        sheetName: body.sheetName.trim(),
        range: trimOrNull(body.range),
        headerRow: Math.max(1, Number(body.headerRow || 1)),
        syncMode: body.syncMode || 'manual',
        scheduleCron: trimOrNull(body.scheduleCron),
        enabled: body.enabled !== false,
        createdByUserId: actor.id,
      };
      if (body.columnMaps?.length) {
        data.columnMaps = {
          create: body.columnMaps
            .filter((item) => item.targetField && item.sourceHeader)
            .map((item) => ({
              targetField: item.targetField,
              sourceHeader: item.sourceHeader,
              required: Boolean(item.required),
              transformRule: trimOrNull(item.transformRule),
            })),
        };
      }
      const source = await prisma.customerDataSource.create({
        data,
        include: { columnMaps: true },
      });
      reloadCustomerDataSourceCron().catch(() => undefined);
      return reply.status(201).send({ source });
    } catch (error) {
      request.log.error({ error }, 'create customer data source failed');
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Không lưu được nguồn Sheet' });
    }
  });

  app.patch('/api/v1/customer-data-sources/:id', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomerSource(actor, 'edit'))) return reply.status(403).send({ error: 'Bạn không có quyền sửa nguồn đồng bộ khách hàng' });
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as {
      name?: string;
      spreadsheetId?: string;
      sheetName?: string;
      range?: string | null;
      headerRow?: number;
      enabled?: boolean;
      syncMode?: 'manual' | 'scheduled';
      scheduleCron?: string | null;
      columnMaps?: Array<{ targetField: string; sourceHeader: string; required?: boolean; transformRule?: string | null }>;
    };
    const existing = await prisma.customerDataSource.findFirst({ where: { id, orgId: actor.orgId }, select: { id: true, archivedAt: true } });
    if (!existing) return reply.status(404).send({ error: 'Customer data source not found' });
    if (existing.archivedAt) return reply.status(409).send({ error: 'Nguồn đã lưu trữ. Hãy khôi phục trước khi chỉnh sửa.' });
    let spreadsheetId: string | undefined;
    if (body.spreadsheetId !== undefined) {
      const normalizedSpreadsheetId = normalizeSpreadsheetId(body.spreadsheetId);
      if (!normalizedSpreadsheetId) {
        return badRequest(reply, 'Spreadsheet ID không hợp lệ. Hãy dán URL Google Sheet hoặc ID sau /spreadsheets/d/, không dùng gid của tab.');
      }
      spreadsheetId = normalizedSpreadsheetId;
    }
    const source = await prisma.$transaction(async (tx) => {
      if (body.columnMaps) {
        await tx.customerDataSourceColumnMap.deleteMany({ where: { sourceId: id } });
        if (body.columnMaps.length > 0) {
          await tx.customerDataSourceColumnMap.createMany({
            data: body.columnMaps
              .filter((item) => item.targetField && item.sourceHeader)
              .map((item) => ({
                sourceId: id,
                targetField: item.targetField,
                sourceHeader: item.sourceHeader,
                required: Boolean(item.required),
                transformRule: trimOrNull(item.transformRule),
              })),
          });
        }
      }
      return tx.customerDataSource.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.spreadsheetId !== undefined ? { spreadsheetId } : {}),
          ...(body.sheetName !== undefined ? { sheetName: body.sheetName.trim() } : {}),
          ...(body.range !== undefined ? { range: trimOrNull(body.range) } : {}),
          ...(body.headerRow !== undefined ? { headerRow: Math.max(1, Number(body.headerRow || 1)) } : {}),
          ...(body.enabled !== undefined ? { enabled: Boolean(body.enabled) } : {}),
          ...(body.syncMode !== undefined ? { syncMode: body.syncMode } : {}),
          ...(body.scheduleCron !== undefined ? { scheduleCron: trimOrNull(body.scheduleCron) } : {}),
        },
        include: { columnMaps: true },
      });
    });
    reloadCustomerDataSourceCron().catch(() => undefined);
    return { source };
  });

  const archiveSource = async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomerSource(actor, 'delete'))) {
      return reply.status(403).send({ error: 'Bạn không có quyền lưu trữ nguồn đồng bộ khách hàng' });
    }
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { reason?: string | null };
    const existing = await prisma.customerDataSource.findFirst({
      where: { id, orgId: actor.orgId },
      select: {
        id: true,
        name: true,
        enabled: true,
        archivedAt: true,
        _count: { select: { customerProfiles: true } },
      },
    });
    if (!existing) return reply.status(404).send({ error: 'Customer data source not found' });
    if (existing.archivedAt) return { source: existing, alreadyArchived: true };

    const source = await prisma.customerDataSource.update({
      where: { id },
      data: {
        enabled: false,
        archivedAt: new Date(),
        archivedByUserId: actor.id,
        archiveReason: trimOrNull(body.reason),
      },
      include: {
        archivedBy: { select: { id: true, fullName: true } },
        _count: { select: { syncRuns: true, customerProfiles: true } },
      },
    });
    logActivity({
      orgId: actor.orgId,
      userId: actor.id,
      action: 'customer_source_archived',
      entityType: 'customer_data_source',
      entityId: id,
      details: {
        name: existing.name,
        reason: trimOrNull(body.reason),
        wasEnabled: existing.enabled,
        affectedCustomerCount: existing._count.customerProfiles,
      },
    });
    reloadCustomerDataSourceCron().catch(() => undefined);
    return { source };
  };

  app.post('/api/v1/customer-data-sources/:id/archive', archiveSource);
  app.delete('/api/v1/customer-data-sources/:id', archiveSource);

  app.post('/api/v1/customer-data-sources/:id/restore', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomerSource(actor, 'delete'))) {
      return reply.status(403).send({ error: 'Bạn không có quyền khôi phục nguồn đồng bộ khách hàng' });
    }
    const { id } = request.params as { id: string };
    const existing = await prisma.customerDataSource.findFirst({
      where: { id, orgId: actor.orgId },
      select: {
        id: true,
        name: true,
        archivedAt: true,
        archiveReason: true,
        _count: { select: { customerProfiles: true } },
      },
    });
    if (!existing) return reply.status(404).send({ error: 'Customer data source not found' });
    if (!existing.archivedAt) return { source: existing, alreadyActive: true };

    const source = await prisma.customerDataSource.update({
      where: { id },
      data: {
        enabled: false,
        archivedAt: null,
        archivedByUserId: null,
        archiveReason: null,
      },
      include: { _count: { select: { syncRuns: true, customerProfiles: true } } },
    });
    logActivity({
      orgId: actor.orgId,
      userId: actor.id,
      action: 'customer_source_restored',
      entityType: 'customer_data_source',
      entityId: id,
      details: {
        name: existing.name,
        previousArchiveReason: existing.archiveReason,
        affectedCustomerCount: existing._count.customerProfiles,
      },
    });
    reloadCustomerDataSourceCron().catch(() => undefined);
    return { source };
  });

  app.post('/api/v1/customer-data-sources/:id/sync', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomerSource(actor, 'edit'))) return reply.status(403).send({ error: 'Bạn không có quyền chạy nguồn đồng bộ khách hàng' });
    const { id } = request.params as { id: string };
    const source = await prisma.customerDataSource.findFirst({ where: { id, orgId: actor.orgId, archivedAt: null }, select: { id: true, spreadsheetId: true, sheetName: true } });
    if (!source) return reply.status(404).send({ error: 'Customer data source not found' });
    if (!normalizeSpreadsheetId(source.spreadsheetId)) {
      return badRequest(reply, 'Nguồn Sheet đang lưu Spreadsheet ID không hợp lệ. Hãy sửa bằng URL Google Sheet hoặc ID sau /spreadsheets/d/.');
    }
    try {
      const result = await runCustomerDataSourceSync({
        sourceId: id,
        orgId: actor.orgId,
        actorUserId: actor.id,
        triggerType: 'manual',
      });
      return { result };
    } catch (error) {
      request.log.error({ error }, 'sync customer data source failed');
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Không đồng bộ được nguồn Sheet' });
    }
  });

  app.post('/api/v1/customer-data-sources/:id/preview', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomerSource(actor, 'edit'))) return reply.status(403).send({ error: 'Bạn không có quyền preview nguồn đồng bộ khách hàng' });
    const { id } = request.params as { id: string };
    const source = await prisma.customerDataSource.findFirst({ where: { id, orgId: actor.orgId, archivedAt: null }, select: { id: true, spreadsheetId: true } });
    if (!source) return reply.status(404).send({ error: 'Customer data source not found' });
    if (!normalizeSpreadsheetId(source.spreadsheetId)) {
      return badRequest(reply, 'Nguồn Sheet đang lưu Spreadsheet ID không hợp lệ. Hãy sửa bằng URL Google Sheet hoặc ID sau /spreadsheets/d/.');
    }
    try {
      const result = await previewCustomerDataSourceSync({
        sourceId: id,
        orgId: actor.orgId,
        actorUserId: actor.id,
      });
      return { result };
    } catch (error) {
      request.log.error({ error }, 'preview customer data source failed');
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Không đọc preview nguồn Sheet' });
    }
  });

  app.get('/api/v1/customer-data-sources/:id/sync-runs', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomerSource(actor, 'access'))) return reply.status(403).send({ error: 'Bạn không có quyền xem lịch sử đồng bộ khách hàng' });
    const { id } = request.params as { id: string };
    const source = await prisma.customerDataSource.findFirst({ where: { id, orgId: actor.orgId }, select: { id: true } });
    if (!source) return reply.status(404).send({ error: 'Customer data source not found' });
    const runs = await prisma.customerSyncRun.findMany({
      where: { sourceId: id, orgId: actor.orgId },
      include: { triggeredBy: { select: { id: true, fullName: true } } },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return { runs };
  });

  app.get('/api/v1/customer-sync-runs/:id/errors', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomerSource(actor, 'access'))) return reply.status(403).send({ error: 'Bạn không có quyền xem lỗi đồng bộ khách hàng' });
    const { id } = request.params as { id: string };
    const run = await prisma.customerSyncRun.findFirst({ where: { id, orgId: actor.orgId }, select: { id: true } });
    if (!run) return reply.status(404).send({ error: 'Customer sync run not found' });
    const errors = await prisma.customerSyncRowError.findMany({
      where: { runId: id },
      orderBy: { rowNumber: 'asc' },
      take: 500,
    });
    return { errors };
  });

  app.get('/api/v1/customer-sync-runs/:id/snapshots', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomerSource(actor, 'access'))) return reply.status(403).send({ error: 'Bạn không có quyền xem dữ liệu preview khách hàng' });
    const { id } = request.params as { id: string };
    const query = (request.query || {}) as {
      status?: string;
      action?: string;
      view?: 'all' | 'applicable' | 'blocked';
      page?: string;
      pageSize?: string;
      limit?: string;
    };
    const run = await prisma.customerSyncRun.findFirst({ where: { id, orgId: actor.orgId }, select: { id: true } });
    if (!run) return reply.status(404).send({ error: 'Customer sync run not found' });
    const pageSize = Math.min(Math.max(Number(query.pageSize || query.limit || 50), 10), 200);
    const page = Math.max(Number(query.page || 1), 1);
    const blockedStatuses = ['invalid', 'duplicate', 'ignored'];
    const where = {
      syncRunId: id,
      orgId: actor.orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.view === 'applicable' ? { status: { notIn: blockedStatuses } } : {}),
      ...(query.view === 'blocked' ? { status: { in: blockedStatuses } } : {}),
    };
    const [total, snapshots] = await Promise.all([
      prisma.customerSourceSnapshot.count({ where }),
      prisma.customerSourceSnapshot.findMany({
        where,
        orderBy: { sourceRowNumber: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      snapshots,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  });

  app.post('/api/v1/customer-source-snapshots/:syncRunId/apply', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomerSource(actor, 'edit'))) return reply.status(403).send({ error: 'Bạn không có quyền apply dữ liệu vào hồ sơ khách hàng' });
    const { syncRunId } = request.params as { syncRunId: string };
    const body = (request.body || {}) as {
      mode?: 'update_safe' | 'overwrite_from_sheet';
      scope?: 'selected' | 'filtered' | 'all_valid';
      snapshotRowIds?: string[];
      filter?: {
        status?: string[];
        action?: string[];
        salesCode?: string;
        departmentCode?: string;
        customerTypeCode?: string;
      };
      allowClearBlankFields?: boolean;
    };
    const run = await prisma.customerSyncRun.findFirst({
      where: { id: syncRunId, orgId: actor.orgId, source: { archivedAt: null } },
      select: { id: true },
    });
    if (!run) return reply.status(409).send({ error: 'Nguồn của preview này đã lưu trữ hoặc không còn tồn tại.' });
    try {
      const result = await applyCustomerSourceSnapshots({
        orgId: actor.orgId,
        syncRunId,
        mode: body.mode,
        scope: body.scope,
        snapshotRowIds: body.snapshotRowIds,
        filter: body.filter,
        allowClearBlankFields: body.allowClearBlankFields,
      });
      return { result };
    } catch (error) {
      request.log.error({ error }, 'apply customer source snapshots failed');
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Không apply được dữ liệu preview vào CRM' });
    }
  });

  app.post('/api/v1/customer-profiles/sync-google-sheet-adhoc', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomers(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const body = (request.body || {}) as {
      spreadsheetId?: string;
      sheetName?: string;
      range?: string;
      headerRow?: number;
      columns?: Record<string, string>;
    };
    if (!body.spreadsheetId || !body.sheetName) return badRequest(reply, 'spreadsheetId and sheetName are required');
    const spreadsheetId = normalizeSpreadsheetId(body.spreadsheetId);
    if (!spreadsheetId) {
      return badRequest(reply, 'Spreadsheet ID không hợp lệ. Hãy dán URL Google Sheet hoặc ID sau /spreadsheets/d/, không dùng gid của tab.');
    }
    const result = await runAdhocCustomerSheetSync({
      orgId: actor.orgId,
      actorUserId: actor.id,
      spreadsheetId,
      sheetName: body.sheetName,
      range: body.range,
      headerRow: body.headerRow,
      columns: body.columns as any,
    });
    return { result };
  });

  app.get('/api/v1/customer-profiles/contact-options', async (request, reply) => {
    const actor = currentActor(request);
    const query = (request.query || {}) as { q?: string; limit?: string };
    const q = String(query.q || '').trim();
    const limit = Math.min(Math.max(Number(query.limit || 20), 5), 50);
    const { clauses: phoneClauses } = phoneSearchClauses(q);
    const where: any = {
      orgId: actor.orgId,
      mergedInto: null,
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { crmName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { zaloUsername: { contains: q, mode: 'insensitive' } },
              { zaloGlobalId: { equals: q } },
              { zaloUid: { equals: q } },
              ...phoneClauses,
            ],
          }
        : {}),
    };
    const contacts = await prisma.contact.findMany({
      where,
      select: contactSelectForCustomerProfile(),
      orderBy: [
        { lastActivity: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
      ],
      take: limit,
    });
    return { contacts };
  });

  app.get('/api/v1/customer-profiles/contact-phone-lookup', async (request, reply) => {
    const actor = currentActor(request);
    const query = (request.query || {}) as { phone?: string };
    const phone = String(query.phone || '').trim();
    if (!phone) return badRequest(reply, 'phone is required');
    const { canonicalPhone, clauses } = phoneSearchClauses(phone);
    if (!canonicalPhone || !clauses.length) return badRequest(reply, 'phone format invalid');
    const scope = await getZaloScope(actor.id, actor.orgId, actor.role);
    const visibleAccountIds = scope.accessibleIds;
    const contacts = await prisma.contact.findMany({
      where: {
        orgId: actor.orgId,
        mergedInto: null,
        OR: clauses,
      },
      select: contactSelectForCustomerProfile(),
      orderBy: [{ updatedAt: 'desc' }],
      take: 20,
    });
    const visibleContacts = contacts.map((contact) => ({
      ...contact,
      friends: isAdmin(actor)
        ? contact.friends
        : contact.friends.filter((friend) => friend.zaloAccount?.id && visibleAccountIds.includes(friend.zaloAccount.id)),
      conversations: isAdmin(actor)
        ? contact.conversations
        : contact.conversations.filter((conversation) => conversation.zaloAccount?.id && visibleAccountIds.includes(conversation.zaloAccount.id)),
    }));
    const friendAccounts = new Map<string, { id: string; displayName?: string | null; phone?: string | null; friendshipStatus?: string | null; relationshipKind?: string | null }>();
    for (const contact of visibleContacts) {
      for (const friend of contact.friends) {
        const account = friend.zaloAccount;
        if (!account?.id) continue;
        friendAccounts.set(account.id, {
          id: account.id,
          displayName: account.displayName,
          phone: account.phone,
          friendshipStatus: friend.friendshipStatus,
          relationshipKind: friend.relationshipKind,
        });
      }
    }
    const hasZalo = visibleContacts.some((contact) => Boolean(contact.hasZalo || contact.zaloGlobalId || contact.friends.length));
    const knownNoZalo = visibleContacts.length > 0 && visibleContacts.every((contact) => contact.hasZalo === false && !contact.zaloGlobalId && contact.friends.length === 0);
    return {
      phone,
      normalizedPhone: canonicalPhone,
      status: hasZalo ? 'has_zalo' : knownNoZalo ? 'no_zalo_known' : 'unknown',
      hasZalo,
      friendAccounts: Array.from(friendAccounts.values()),
      contacts: visibleContacts,
      note: 'Ket qua nay doi chieu Contact/Friend hien co trong CRM, khong loc theo group Zalo.',
    };
  });

  app.get('/api/v1/customer-profiles/:id', async (request, reply) => {
    const actor = currentActor(request);
    const { id } = request.params as { id: string };
    await backfillArchiveStoriesForCustomerProfile({
      orgId: actor.orgId,
      customerProfileId: id,
    });
    const profile = await prisma.customerProfile.findFirst({
      where: { id, orgId: actor.orgId },
      include: {
        ownerUser: { select: { id: true, fullName: true, email: true } },
        managingDepartment: { select: { id: true, name: true, legacyDepartmentCode: true } },
        customerType: true,
        sourceDataSource: {
          select: {
            id: true,
            name: true,
            spreadsheetId: true,
            sheetName: true,
            range: true,
            headerRow: true,
            archivedAt: true,
            lastSyncedAt: true,
            lastSyncStatus: true,
          },
        },
        contacts: {
          where: { isActive: true },
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
                crmName: true,
                zaloUsername: true,
                zaloGlobalId: true,
                phone: true,
                phoneNormalized: true,
                email: true,
                birthDate: true,
                notes: true,
                metadata: true,
                avatarUrl: true,
                hasZalo: true,
                customerProfileContacts: {
                  where: { isActive: true },
                  select: {
                    customerProfileId: true,
                    role: true,
                    isPrimary: true,
                    customerProfile: {
                      select: {
                        id: true,
                        code: true,
                        externalKey: true,
                        name: true,
                      },
                    },
                  },
                  take: 5,
                },
                conversations: {
                  select: {
                    zaloAccount: { select: { id: true, displayName: true, phone: true, deletedAt: true } },
                  },
                  take: 3,
                  orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
                },
                friends: {
                  select: {
                    aliasInNick: true,
                    zaloDisplayName: true,
                    zaloGlobalId: true,
                    zaloUsername: true,
                    zaloUidInNick: true,
                    relationshipKind: true,
                    friendshipStatus: true,
                    zaloAccount: { select: { id: true, displayName: true, phone: true, deletedAt: true } },
                  },
                  take: 5,
                  orderBy: { lastInteractionAt: { sort: 'desc', nulls: 'last' } },
                },
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { linkedAt: 'desc' }],
        },
        zaloUsers: {
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
                crmName: true,
                zaloUsername: true,
                zaloGlobalId: true,
                phone: true,
                phoneNormalized: true,
                birthDate: true,
                notes: true,
                metadata: true,
                avatarUrl: true,
                hasZalo: true,
                conversations: {
                  select: {
                    zaloAccount: { select: { id: true, displayName: true, phone: true, deletedAt: true } },
                  },
                  take: 3,
                  orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
                },
                friends: {
                  select: {
                    aliasInNick: true,
                    zaloDisplayName: true,
                    zaloGlobalId: true,
                    zaloUsername: true,
                    zaloUidInNick: true,
                    relationshipKind: true,
                    friendshipStatus: true,
                    zaloAccount: { select: { id: true, displayName: true, phone: true, deletedAt: true } },
                  },
                  take: 5,
                  orderBy: { lastInteractionAt: { sort: 'desc', nulls: 'last' } },
                },
              },
            },
          },
          orderBy: { linkedAt: 'desc' },
        },
        zaloGroups: {
          include: {
            nativeGroup: {
              select: {
                id: true,
                globalId: true,
                name: true,
                avatarUrl: true,
                lastSeenAt: true,
                accounts: {
                  select: {
                    membershipStatus: true,
                    lastConfirmedAt: true,
                    zaloAccount: { select: { id: true, displayName: true, phone: true, deletedAt: true } },
                  },
                  orderBy: { lastConfirmedAt: 'desc' },
                },
              },
            },
          },
          orderBy: { linkedAt: 'desc' },
        },
        archiveStories: {
          select: {
            id: true,
            title: true,
            orderCode: true,
            businessStatus: true,
            priority: true,
            conversationName: true,
            recordType: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        _count: { select: { zaloGroups: true, zaloUsers: true, contacts: true, archiveStories: true } },
      },
    });
    if (!profile) return reply.status(404).send({ error: 'Customer profile not found' });
    return { profile };
  });

  app.get('/api/v1/customer-types', async (request) => {
    const actor = currentActor(request);
    const types = await prisma.customerType.findMany({
      where: { orgId: actor.orgId },
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
    return { types };
  });

  app.post('/api/v1/customer-types', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomers(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const body = (request.body || {}) as { code?: string; name?: string; description?: string | null };
    if (!body.code || !body.name) return badRequest(reply, 'code and name are required');
    const customerType = await prisma.customerType.upsert({
      where: { orgId_code: { orgId: actor.orgId, code: body.code.trim() } },
      create: {
        orgId: actor.orgId,
        code: body.code.trim(),
        name: body.name.trim(),
        description: trimOrNull(body.description),
      },
      update: { name: body.name.trim(), description: trimOrNull(body.description), isActive: true },
    });
    return reply.status(201).send({ customerType });
  });

  app.patch('/api/v1/customer-types/:id', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomers(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { code?: string; name?: string; description?: string | null; isActive?: boolean };
    const existing = await prisma.customerType.findFirst({ where: { id, orgId: actor.orgId }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: 'Customer type not found' });
    const customerType = await prisma.customerType.update({
      where: { id },
      data: {
        ...(body.code !== undefined ? { code: body.code.trim() } : {}),
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: trimOrNull(body.description) } : {}),
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      },
    });
    return { customerType };
  });

  app.post('/api/v1/customer-profiles/:id/contacts/create', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomers(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as {
      fullName?: string;
      phone?: string;
      email?: string | null;
      birthDate?: string | null;
      title?: string | null;
      department?: string | null;
      isPrimary?: boolean;
      rawText?: string | null;
      notes?: string | null;
      forceCreate?: boolean;
    };
    const fullName = trimOrNull(body.fullName);
    const phone = trimOrNull(body.phone);
    if (!fullName) return badRequest(reply, 'fullName is required');
    if (!phone) return badRequest(reply, 'phone is required');
    const { canonicalPhone, clauses } = phoneSearchClauses(phone);
    if (!canonicalPhone || !clauses.length) return badRequest(reply, 'phone format invalid');

    const result = await prisma.$transaction(async (tx) => {
      const profile = await tx.customerProfile.findFirst({ where: { id, orgId: actor.orgId }, select: { id: true } });
      if (!profile) return null;

      const existingContact = body.forceCreate
        ? null
        : await tx.contact.findFirst({
            where: { orgId: actor.orgId, mergedInto: null, OR: clauses },
            select: { id: true },
            orderBy: { updatedAt: 'desc' },
          });

      const contact = existingContact
        ? await tx.contact.update({
            where: { id: existingContact.id },
            data: {
              fullName,
              phone,
              phoneNormalized: canonicalPhone,
              ...(body.email !== undefined ? { email: trimOrNull(body.email) } : {}),
              ...(body.birthDate !== undefined ? { birthDate: body.birthDate ? new Date(body.birthDate) : null } : {}),
              ...(body.notes !== undefined ? { notes: trimOrNull(body.notes) } : {}),
            },
            select: contactSelectForCustomerProfile(),
          })
        : await tx.contact.create({
            data: {
              orgId: actor.orgId,
              fullName,
              phone,
              phoneNormalized: canonicalPhone,
              email: trimOrNull(body.email),
              birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
              notes: trimOrNull(body.notes),
              source: 'customer_profile_manual',
              status: 'new',
              metadata: { createdFromCustomerProfileId: id },
            },
            select: contactSelectForCustomerProfile(),
          });

      if (body.isPrimary) {
        await tx.customerProfileContact.updateMany({
          where: { orgId: actor.orgId, customerProfileId: id, contactId: { not: contact.id } },
          data: { isPrimary: false },
        });
      }

      const link = await tx.customerProfileContact.upsert({
        where: { customerProfileId_contactId: { customerProfileId: id, contactId: contact.id } },
        create: {
          orgId: actor.orgId,
          customerProfileId: id,
          contactId: contact.id,
          role: 'other',
          title: trimOrNull(body.title),
          department: trimOrNull(body.department),
          isPrimary: Boolean(body.isPrimary),
          rawText: trimOrNull(body.rawText),
          linkedByUserId: actor.id,
        },
        update: {
          role: 'other',
          title: trimOrNull(body.title),
          department: trimOrNull(body.department),
          isPrimary: Boolean(body.isPrimary),
          rawText: trimOrNull(body.rawText),
          isActive: true,
          unlinkedAt: null,
          linkedByUserId: actor.id,
          linkedAt: new Date(),
        },
      });
      const zaloSync = await syncContactToCustomerZaloUser({
        tx,
        actor,
        customerProfileId: id,
        contact,
      });
      return { contact, link, reusedExisting: Boolean(existingContact), zaloSync };
    });
    if (!result) return reply.status(404).send({ error: 'Customer profile not found' });
    return reply.status(201).send(result);
  });

  app.post('/api/v1/customer-profiles/:id/contacts', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomers(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as {
      contactId?: string;
      role?: string;
      title?: string | null;
      department?: string | null;
      isPrimary?: boolean;
      rawText?: string | null;
    };
    if (!body.contactId) return badRequest(reply, 'contactId is required');
    const contactId = body.contactId;
    const [profile, contact] = await Promise.all([
      prisma.customerProfile.findFirst({ where: { id, orgId: actor.orgId }, select: { id: true } }),
      prisma.contact.findFirst({ where: { id: contactId, orgId: actor.orgId }, select: { id: true } }),
    ]);
    if (!profile || !contact) return reply.status(404).send({ error: 'Customer profile or contact not found' });
    const result = await prisma.$transaction(async (tx) => {
      if (body.isPrimary) {
        await tx.customerProfileContact.updateMany({
          where: { orgId: actor.orgId, customerProfileId: id, contactId: { not: contactId } },
          data: { isPrimary: false },
        });
      }
      const link = await tx.customerProfileContact.upsert({
        where: { customerProfileId_contactId: { customerProfileId: id, contactId } },
        create: {
          orgId: actor.orgId,
          customerProfileId: id,
          contactId,
          role: body.role || 'other',
          title: trimOrNull(body.title),
          department: trimOrNull(body.department),
          isPrimary: Boolean(body.isPrimary),
          rawText: trimOrNull(body.rawText),
          linkedByUserId: actor.id,
        },
        update: {
          role: body.role || 'other',
          title: trimOrNull(body.title),
          department: trimOrNull(body.department),
          isPrimary: Boolean(body.isPrimary),
          rawText: trimOrNull(body.rawText),
          isActive: true,
          unlinkedAt: null,
          linkedByUserId: actor.id,
          linkedAt: new Date(),
        },
        include: { contact: { select: contactSelectForCustomerProfile() } },
      });
      const zaloSync = await syncContactToCustomerZaloUser({
        tx,
        actor,
        customerProfileId: id,
        contact: link.contact,
      });
      return { link, zaloSync };
    });
    return reply.status(201).send(result);
  });

  app.patch('/api/v1/customer-profiles/:id/contacts/:contactId', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomers(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { id, contactId } = request.params as { id: string; contactId: string };
    const body = (request.body || {}) as {
      role?: string;
      title?: string | null;
      department?: string | null;
      isPrimary?: boolean;
      fullName?: string | null;
      phone?: string | null;
      email?: string | null;
      birthDate?: string | null;
      notes?: string | null;
      preferredAcceptedZaloAccountId?: string | null;
    };
    const fullName = body.fullName !== undefined ? trimOrNull(body.fullName) : undefined;
    if (body.fullName !== undefined && !fullName) return badRequest(reply, 'Họ tên là bắt buộc');

    const phone = body.phone !== undefined ? trimOrNull(body.phone) : undefined;
    let canonicalPhone: string | null = null;
    let phoneConflictClauses: ReturnType<typeof phoneSearchClauses>['clauses'] = [];
    if (body.phone !== undefined) {
      if (!phone) return badRequest(reply, 'Số điện thoại là bắt buộc');
      const phoneSearch = phoneSearchClauses(phone);
      canonicalPhone = phoneSearch.canonicalPhone;
      phoneConflictClauses = phoneSearch.clauses;
      if (!canonicalPhone || !phoneConflictClauses.length) return badRequest(reply, 'Số điện thoại chưa hợp lệ');
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingLink = await tx.customerProfileContact.findFirst({
        where: { orgId: actor.orgId, customerProfileId: id, contactId, isActive: true },
        select: { id: true, contactId: true, contact: { select: { metadata: true } } },
      });
      if (!existingLink) return null;

      if (phone !== undefined && phoneConflictClauses.length) {
        const conflict = await tx.contact.findFirst({
          where: { orgId: actor.orgId, mergedInto: null, id: { not: contactId }, OR: phoneConflictClauses },
          select: { id: true, fullName: true, phone: true },
        });
        if (conflict) {
          return {
            conflict,
            conflictMessage: `Số điện thoại này đã thuộc contact khác: ${conflict.fullName || conflict.phone || conflict.id}. Nếu đây là số thứ hai của cùng một người, hãy thêm liên hệ mới rồi khóa liên hệ cũ khỏi hồ sơ nếu cần.`,
          };
        }
      }

      if (body.isPrimary) {
        await tx.customerProfileContact.updateMany({
          where: { orgId: actor.orgId, customerProfileId: id, contactId: { not: contactId } },
          data: { isPrimary: false },
        });
      }

      const linkResult = await tx.customerProfileContact.updateMany({
        where: { orgId: actor.orgId, customerProfileId: id, contactId, isActive: true },
        data: {
          ...(body.role !== undefined ? { role: body.role } : {}),
          ...(body.title !== undefined ? { title: trimOrNull(body.title) } : {}),
          ...(body.department !== undefined ? { department: trimOrNull(body.department) } : {}),
          ...(body.isPrimary !== undefined ? { isPrimary: Boolean(body.isPrimary) } : {}),
        },
      });
      const shouldUpdateContact =
        body.fullName !== undefined ||
        body.phone !== undefined ||
        body.email !== undefined ||
        body.birthDate !== undefined ||
        body.notes !== undefined ||
        body.preferredAcceptedZaloAccountId !== undefined;
      const shouldSyncZaloUser =
        body.fullName !== undefined ||
        body.phone !== undefined ||
        body.email !== undefined ||
        body.birthDate !== undefined ||
        body.notes !== undefined;
      const currentMetadata = (existingLink.contact.metadata && typeof existingLink.contact.metadata === 'object' && !Array.isArray(existingLink.contact.metadata))
        ? existingLink.contact.metadata as Record<string, unknown>
        : {};
      const contact = shouldUpdateContact
        ? await tx.contact.update({
            where: { id: contactId },
            data: {
              ...(fullName !== undefined ? { fullName } : {}),
              ...(phone !== undefined ? { phone, phoneNormalized: canonicalPhone } : {}),
              ...(body.email !== undefined ? { email: trimOrNull(body.email) } : {}),
              ...(body.birthDate !== undefined ? { birthDate: body.birthDate ? new Date(body.birthDate) : null } : {}),
              ...(body.notes !== undefined ? { notes: trimOrNull(body.notes) } : {}),
              ...(body.preferredAcceptedZaloAccountId !== undefined ? {
                metadata: {
                  ...currentMetadata,
                  preferredAcceptedZaloAccountId: trimOrNull(body.preferredAcceptedZaloAccountId),
                },
              } : {}),
            },
            select: contactSelectForCustomerProfile(),
          })
        : null;
      const zaloSync = contact && shouldSyncZaloUser
        ? await syncContactToCustomerZaloUser({
            tx,
            actor,
            customerProfileId: id,
            contact,
          })
        : null;
      return { linkResult, contact, zaloSync };
    });
    if (!result) return reply.status(404).send({ error: 'Customer contact link not found' });
    if ('conflictMessage' in result) return reply.status(409).send({ error: result.conflictMessage, conflict: result.conflict });
    if (!result.linkResult.count) return reply.status(404).send({ error: 'Customer contact link not found' });
    return { ok: true, contact: result.contact };
  });

  app.delete('/api/v1/customer-profiles/:id/contacts/:contactId', async (request, reply) => {
    const actor = currentActor(request);
    if (!(await canManageCustomers(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { id, contactId } = request.params as { id: string; contactId: string };
    const query = (request.query || {}) as { unlinkZaloUser?: string };
    const unlinkZaloUser = query.unlinkZaloUser === 'true';
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, orgId: actor.orgId },
      select: { id: true, zaloGlobalId: true, phoneNormalized: true },
    });
    if (!contact) return reply.status(404).send({ error: 'Customer contact link not found' });
    const equivalentContactFilter: Prisma.ContactWhereInput = {
      OR: [
        { id: contact.id },
        ...(contact.zaloGlobalId ? [{ zaloGlobalId: contact.zaloGlobalId }] : []),
        ...(contact.phoneNormalized ? [{ phoneNormalized: contact.phoneNormalized }] : []),
      ],
    };
    const result = await prisma.$transaction(async (tx) => {
      const counterpartLinks = await tx.customerProfileZaloUser.findMany({
        where: {
          orgId: actor.orgId,
          customerProfileId: id,
          contact: equivalentContactFilter,
        },
        select: { id: true },
      });
      const contactResult = await tx.customerProfileContact.updateMany({
        where: { orgId: actor.orgId, customerProfileId: id, contactId, isActive: true },
        data: { isActive: false, unlinkedAt: new Date() },
      });
      if (unlinkZaloUser && counterpartLinks.length) {
        await tx.customerProfileZaloUser.deleteMany({
          where: { id: { in: counterpartLinks.map((link) => link.id) } },
        });
      }
      return {
        contactCount: contactResult.count,
        counterpartFound: counterpartLinks.length > 0,
        counterpartUnlinked: unlinkZaloUser ? counterpartLinks.length : 0,
      };
    });
    if (!result.contactCount) return reply.status(404).send({ error: 'Customer contact link not found' });
    return { ok: true, ...result };
  });
}
