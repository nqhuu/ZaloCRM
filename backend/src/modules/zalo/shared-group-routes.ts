import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { getZaloScope } from './zalo-scope.js';
import { zaloPool } from './zalo-pool.js';
import { syncNativeGroupsForAccount } from './shared-group-service.js';
import { readSheetRows } from '../archive/google-archive-client.js';

type Actor = { id: string; orgId: string; role: string };
type SubjectType = 'user' | 'group';

function badRequest(reply: FastifyReply, error: string) {
  return reply.status(400).send({ error });
}

function isAdmin(actor: Actor) {
  return actor.role === 'owner' || actor.role === 'admin';
}

async function canManageWork(actor: Actor): Promise<boolean> {
  if (isAdmin(actor)) return true;
  const member = await prisma.departmentMember.findUnique({
    where: { userId: actor.id },
    select: { deptRole: true },
  });
  return member?.deptRole === 'leader' || member?.deptRole === 'deputy';
}

async function accessibleAccountIds(actor: Actor): Promise<string[]> {
  const scope = await getZaloScope(actor.id, actor.orgId, actor.role);
  return scope.accessibleIds;
}

async function loadVisibleGroup(actor: Actor, id: string) {
  const accountIds = await accessibleAccountIds(actor);
  return prisma.nativeZaloGroup.findFirst({
    where: {
      id,
      orgId: actor.orgId,
      ...(isAdmin(actor) ? {} : { accounts: { some: { zaloAccountId: { in: accountIds } } } }),
    },
    include: groupInclude,
  });
}

async function loadVisibleContact(actor: Actor, id: string) {
  const accountIds = await accessibleAccountIds(actor);
  return prisma.contact.findFirst({
    where: {
      id,
      orgId: actor.orgId,
      ...(isAdmin(actor) ? {} : { conversations: { some: { zaloAccountId: { in: accountIds } } } }),
    },
    select: { id: true, zaloGlobalId: true },
  });
}

const groupInclude = {
  accounts: {
    include: {
      zaloAccount: { select: { id: true, displayName: true, status: true, departmentId: true } },
    },
    orderBy: { lastConfirmedAt: 'desc' as const },
  },
  customerLink: {
    include: { customerProfile: true },
  },
  crmTags: {
    include: { crmTag: true },
    orderBy: { assignedAt: 'asc' as const },
  },
  workAssignments: {
    where: { closedAt: null },
    include: {
      assignedUser: { select: { id: true, fullName: true, isActive: true } },
      crmTag: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  _count: { select: { conversations: true, messages: true, members: true } },
} satisfies Prisma.NativeZaloGroupInclude;

async function subjectAccountIds(actor: Actor, type: SubjectType, subjectId: string): Promise<string[]> {
  if (type === 'group') {
    const group = await prisma.nativeZaloGroup.findFirst({
      where: { id: subjectId, orgId: actor.orgId },
      select: { accounts: { select: { zaloAccountId: true } } },
    });
    return group?.accounts.map((item) => item.zaloAccountId) || [];
  }
  const contact = await prisma.contact.findFirst({
    where: { id: subjectId, orgId: actor.orgId },
    select: { conversations: { select: { zaloAccountId: true } } },
  });
  return [...new Set(contact?.conversations.map((item) => item.zaloAccountId) || [])];
}

async function ensureAssigneeAccess(actor: Actor, assigneeUserId: string, accountIds: string[]) {
  const user = await prisma.user.findFirst({
    where: { id: assigneeUserId, orgId: actor.orgId, isActive: true },
    select: {
      id: true,
      zaloAccounts: { where: { id: { in: accountIds }, deletedAt: null }, select: { id: true } },
      zaloAccess: {
        where: { zaloAccountId: { in: accountIds }, permission: { in: ['read', 'chat', 'admin'] } },
        select: { zaloAccountId: true },
      },
    },
  });
  return Boolean(user && (user.zaloAccounts.length > 0 || user.zaloAccess.length > 0));
}

function normalizedHeader(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function columnIndex(headers: string[], aliases: string[], explicit?: string): number {
  const wanted = explicit ? [normalizedHeader(explicit), ...aliases] : aliases;
  return headers.findIndex((header) => wanted.includes(header));
}

export async function sharedGroupRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/native-zalo-groups', async (request) => {
    const actor = request.user! as Actor;
    const query = request.query as {
      q?: string;
      customerLinkStatus?: 'linked' | 'unlinked';
      customerProfileId?: string;
      crmTagIds?: string;
      assignedUserId?: string;
      sharedOnly?: string;
    };
    const accountIds = await accessibleAccountIds(actor);
    const tagIds = String(query.crmTagIds || '').split(',').map((id) => id.trim()).filter(Boolean);
    const rows = await prisma.nativeZaloGroup.findMany({
      where: {
        orgId: actor.orgId,
        ...(isAdmin(actor) ? {} : { accounts: { some: { zaloAccountId: { in: accountIds } } } }),
        ...(query.q ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { globalId: { contains: query.q, mode: 'insensitive' } },
          ],
        } : {}),
        ...(query.customerLinkStatus === 'linked' ? { customerLink: { isNot: null } } : {}),
        ...(query.customerLinkStatus === 'unlinked' ? { customerLink: { is: null } } : {}),
        ...(query.customerProfileId ? { customerLink: { customerProfileId: query.customerProfileId } } : {}),
        ...(tagIds.length ? { crmTags: { some: { crmTagId: { in: tagIds } } } } : {}),
        ...(query.assignedUserId ? {
          workAssignments: { some: { assignedUserId: query.assignedUserId, closedAt: null } },
        } : {}),
      },
      include: groupInclude,
      orderBy: [{ lastSeenAt: 'desc' }, { name: 'asc' }],
      take: 500,
    });
    return {
      groups: query.sharedOnly === 'true' ? rows.filter((group) => group.accounts.length > 1) : rows,
    };
  });

  app.get('/api/v1/native-zalo-groups/:id', async (request, reply) => {
    const actor = request.user! as Actor;
    const { id } = request.params as { id: string };
    const group = await loadVisibleGroup(actor, id);
    if (!group) return reply.status(404).send({ error: 'Native Zalo group not found' });
    return { group };
  });

  app.post('/api/v1/native-zalo-groups/sync', async (request, reply) => {
    const actor = request.user! as Actor;
    const body = (request.body || {}) as { accountId?: string };
    const allowed = await accessibleAccountIds(actor);
    const accountIds = body.accountId ? [body.accountId] : allowed;
    if (body.accountId && !allowed.includes(body.accountId) && !isAdmin(actor)) {
      return reply.status(403).send({ error: 'No access to this Zalo account' });
    }
    const results = [];
    for (const accountId of accountIds) {
      const account = await prisma.zaloAccount.findFirst({
        where: { id: accountId, orgId: actor.orgId, deletedAt: null },
        select: { id: true },
      });
      if (!account) continue;
      const api = zaloPool.getApi(accountId);
      if (!api) {
        results.push({ accountId, status: 'disconnected', groups: 0, members: 0, errors: 0 });
        continue;
      }
      const result = await syncNativeGroupsForAccount({ accountId, orgId: actor.orgId, api });
      results.push({ accountId, status: 'synced', ...result });
    }
    return { results };
  });

  app.post('/api/v1/zalo-subjects/:type/:id/tags', async (request, reply) => {
    const actor = request.user! as Actor;
    if (!(await canManageWork(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { type, id } = request.params as { type: SubjectType; id: string };
    const { crmTagId } = (request.body || {}) as { crmTagId?: string };
    if (!['user', 'group'].includes(type) || !crmTagId) return badRequest(reply, 'type and crmTagId are required');
    const tag = await prisma.crmTag.findFirst({
      where: { id: crmTagId, orgId: actor.orgId, isActive: true, managedBy: null },
      select: { id: true },
    });
    if (!tag) return reply.status(404).send({ error: 'Independent CRM tag not found' });
    const accounts = await subjectAccountIds(actor, type, id);
    if (accounts.length === 0) return reply.status(404).send({ error: 'Zalo subject not found' });
    const visible = await accessibleAccountIds(actor);
    if (!isAdmin(actor) && !accounts.some((accountId) => visible.includes(accountId))) {
      return reply.status(403).send({ error: 'Subject is outside your Zalo scope' });
    }
    const link = type === 'group'
      ? await prisma.nativeZaloGroupCrmTag.upsert({
          where: { nativeGroupId_crmTagId: { nativeGroupId: id, crmTagId } },
          create: { orgId: actor.orgId, nativeGroupId: id, crmTagId, assignedByUserId: actor.id },
          update: { assignedByUserId: actor.id, assignedAt: new Date() },
          include: { crmTag: true },
        })
      : await prisma.zaloUserCrmTag.upsert({
          where: { contactId_crmTagId: { contactId: id, crmTagId } },
          create: { orgId: actor.orgId, contactId: id, crmTagId, assignedByUserId: actor.id },
          update: { assignedByUserId: actor.id, assignedAt: new Date() },
          include: { crmTag: true },
        });
    return reply.status(201).send({ tag: link });
  });

  app.delete('/api/v1/zalo-subjects/:type/:id/tags/:tagId', async (request, reply) => {
    const actor = request.user! as Actor;
    if (!(await canManageWork(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { type, id, tagId } = request.params as { type: SubjectType; id: string; tagId: string };
    const accounts = await subjectAccountIds(actor, type, id);
    if (accounts.length === 0) return reply.status(404).send({ error: 'Zalo subject not found' });
    const visible = await accessibleAccountIds(actor);
    if (!isAdmin(actor) && !accounts.some((accountId) => visible.includes(accountId))) {
      return reply.status(403).send({ error: 'Subject is outside your Zalo scope' });
    }
    if (type === 'group') {
      await prisma.nativeZaloGroupCrmTag.deleteMany({ where: { orgId: actor.orgId, nativeGroupId: id, crmTagId: tagId } });
    } else if (type === 'user') {
      await prisma.zaloUserCrmTag.deleteMany({ where: { orgId: actor.orgId, contactId: id, crmTagId: tagId } });
    } else {
      return badRequest(reply, 'Invalid subject type');
    }
    return { ok: true };
  });

  app.post('/api/v1/zalo-subjects/:type/:id/assignments', async (request, reply) => {
    const actor = request.user! as Actor;
    if (!(await canManageWork(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { type, id } = request.params as { type: SubjectType; id: string };
    const body = (request.body || {}) as {
      assignedUserId?: string;
      crmTagId?: string | null;
      role?: 'owner' | 'collaborator' | 'watcher';
      validFrom?: string | null;
      validUntil?: string | null;
    };
    if (!['user', 'group'].includes(type) || !body.assignedUserId) {
      return badRequest(reply, 'type and assignedUserId are required');
    }
    const role = body.role || 'collaborator';
    if (!['owner', 'collaborator', 'watcher'].includes(role)) return badRequest(reply, 'Invalid assignment role');
    const accounts = await subjectAccountIds(actor, type, id);
    if (accounts.length === 0) return reply.status(404).send({ error: 'Zalo subject not found' });
    const visible = await accessibleAccountIds(actor);
    if (!isAdmin(actor) && !accounts.some((accountId) => visible.includes(accountId))) {
      return reply.status(403).send({ error: 'Subject is outside your Zalo scope' });
    }
    if (!(await ensureAssigneeAccess(actor, body.assignedUserId, accounts))) {
      return reply.status(409).send({ error: 'Assignee has no access to any Zalo account for this subject' });
    }
    try {
      const assignment = await prisma.zaloSubjectWorkAssignment.create({
        data: {
          orgId: actor.orgId,
          subjectType: type,
          contactId: type === 'user' ? id : null,
          nativeGroupId: type === 'group' ? id : null,
          assignedUserId: body.assignedUserId,
          crmTagId: body.crmTagId || null,
          role,
          assignedByUserId: actor.id,
          validFrom: body.validFrom ? new Date(body.validFrom) : null,
          validUntil: body.validUntil ? new Date(body.validUntil) : null,
        },
        include: { assignedUser: { select: { id: true, fullName: true } }, crmTag: true },
      });
      return reply.status(201).send({ assignment });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return reply.status(409).send({ error: 'Active assignment already exists' });
      }
      throw error;
    }
  });

  app.delete('/api/v1/zalo-subject-assignments/:id', async (request, reply) => {
    const actor = request.user! as Actor;
    if (!(await canManageWork(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { reason?: string };
    const result = await prisma.zaloSubjectWorkAssignment.updateMany({
      where: { id, orgId: actor.orgId, closedAt: null },
      data: { closedAt: new Date(), closeReason: String(body.reason || '').trim() || null },
    });
    if (!result.count) return reply.status(404).send({ error: 'Active assignment not found' });
    return { ok: true };
  });

  app.get('/api/v1/customer-profiles', async (request) => {
    const actor = request.user! as Actor;
    const { q = '' } = request.query as { q?: string };
    const profiles = await prisma.customerProfile.findMany({
      where: {
        orgId: actor.orgId,
        ...(q ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
            { externalKey: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        } : {}),
      },
      include: { _count: { select: { zaloGroups: true, zaloUsers: true, archiveStories: true } } },
      orderBy: [{ name: 'asc' }],
      take: 500,
    });
    return { profiles };
  });

  app.post('/api/v1/customer-profiles/sync-google-sheet', async (request, reply) => {
    const actor = request.user! as Actor;
    if (!(await canManageWork(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const body = (request.body || {}) as {
      spreadsheetId?: string;
      sheetName?: string;
      range?: string;
      columns?: Partial<Record<'externalKey' | 'code' | 'name' | 'phone' | 'email', string>>;
    };
    if (!body.spreadsheetId || !body.sheetName) return badRequest(reply, 'spreadsheetId and sheetName are required');
    const rows = await readSheetRows({ spreadsheetId: body.spreadsheetId, sheetName: body.sheetName, range: body.range });
    if (rows.length === 0) return { synced: 0, skipped: 0, errors: [] };
    const headers = rows[0].map(normalizedHeader);
    const indexes = {
      externalKey: columnIndex(headers, ['external_key', 'customer_id', 'id', 'ma_khach_hang', 'ma_kh'], body.columns?.externalKey),
      code: columnIndex(headers, ['code', 'customer_code', 'ma_khach_hang', 'ma_kh'], body.columns?.code),
      name: columnIndex(headers, ['name', 'customer_name', 'ten_khach_hang', 'ten_kh'], body.columns?.name),
      phone: columnIndex(headers, ['phone', 'so_dien_thoai', 'sdt'], body.columns?.phone),
      email: columnIndex(headers, ['email'], body.columns?.email),
    };
    if (indexes.externalKey < 0 || indexes.name < 0) {
      return badRequest(reply, 'Sheet must contain stable customer ID and customer name columns');
    }
    let synced = 0;
    let skipped = 0;
    const errors: Array<{ row: number; error: string }> = [];
    for (let offset = 1; offset < rows.length; offset++) {
      const row = rows[offset];
      const externalKey = String(row[indexes.externalKey] || '').trim();
      const name = String(row[indexes.name] || '').trim();
      if (!externalKey || !name) {
        skipped++;
        errors.push({ row: offset + 1, error: 'Missing customer ID or name' });
        continue;
      }
      await prisma.customerProfile.upsert({
        where: { orgId_externalKey: { orgId: actor.orgId, externalKey } },
        create: {
          orgId: actor.orgId,
          externalKey,
          code: indexes.code >= 0 ? String(row[indexes.code] || '').trim() || null : null,
          name,
          phone: indexes.phone >= 0 ? String(row[indexes.phone] || '').trim() || null : null,
          email: indexes.email >= 0 ? String(row[indexes.email] || '').trim() || null : null,
          source: 'google_sheet',
          metadata: { spreadsheetId: body.spreadsheetId, sheetName: body.sheetName, row: offset + 1 },
          syncedAt: new Date(),
        },
        update: {
          code: indexes.code >= 0 ? String(row[indexes.code] || '').trim() || null : null,
          name,
          phone: indexes.phone >= 0 ? String(row[indexes.phone] || '').trim() || null : null,
          email: indexes.email >= 0 ? String(row[indexes.email] || '').trim() || null : null,
          metadata: { spreadsheetId: body.spreadsheetId, sheetName: body.sheetName, row: offset + 1 },
          syncedAt: new Date(),
        },
      });
      synced++;
    }
    return { synced, skipped, errors: errors.slice(0, 100) };
  });

  app.post('/api/v1/customer-profiles/:id/zalo-groups', async (request, reply) => {
    const actor = request.user! as Actor;
    if (!(await canManageWork(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { nativeGroupId?: string; confirmTransfer?: boolean };
    if (!body.nativeGroupId) return badRequest(reply, 'nativeGroupId is required');
    const [profile, group, current] = await Promise.all([
      prisma.customerProfile.findFirst({ where: { id, orgId: actor.orgId }, select: { id: true } }),
      loadVisibleGroup(actor, body.nativeGroupId),
      prisma.customerProfileZaloGroup.findUnique({ where: { nativeGroupId: body.nativeGroupId } }),
    ]);
    if (!profile || !group) return reply.status(404).send({ error: 'Customer profile or group not found' });
    if (current && current.customerProfileId !== id && !body.confirmTransfer) {
      return reply.status(409).send({ error: 'Group already belongs to another customer profile', current });
    }
    const link = await prisma.customerProfileZaloGroup.upsert({
      where: { nativeGroupId: body.nativeGroupId },
      create: { orgId: actor.orgId, customerProfileId: id, nativeGroupId: body.nativeGroupId, linkedByUserId: actor.id },
      update: { customerProfileId: id, linkedByUserId: actor.id, linkedAt: new Date(), source: 'manual_assignment' },
      include: { customerProfile: true, nativeGroup: true },
    });
    return reply.status(current ? 200 : 201).send({ link });
  });

  app.delete('/api/v1/customer-profiles/:id/zalo-groups/:nativeGroupId', async (request, reply) => {
    const actor = request.user! as Actor;
    if (!(await canManageWork(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { id, nativeGroupId } = request.params as { id: string; nativeGroupId: string };
    const group = await loadVisibleGroup(actor, nativeGroupId);
    if (!group) return reply.status(404).send({ error: 'Customer group link not found' });
    const result = await prisma.customerProfileZaloGroup.deleteMany({
      where: { orgId: actor.orgId, customerProfileId: id, nativeGroupId },
    });
    if (!result.count) return reply.status(404).send({ error: 'Customer group link not found' });
    return { ok: true };
  });

  app.post('/api/v1/customer-profiles/:id/zalo-users', async (request, reply) => {
    const actor = request.user! as Actor;
    if (!(await canManageWork(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { contactId?: string; confirmTransfer?: boolean };
    if (!body.contactId) return badRequest(reply, 'contactId is required');
    const [profile, contact, current] = await Promise.all([
      prisma.customerProfile.findFirst({ where: { id, orgId: actor.orgId }, select: { id: true } }),
      loadVisibleContact(actor, body.contactId),
      prisma.customerProfileZaloUser.findUnique({ where: { contactId: body.contactId } }),
    ]);
    if (!profile || !contact) return reply.status(404).send({ error: 'Customer profile or Zalo user not found' });
    if (!contact.zaloGlobalId) return badRequest(reply, 'Contact has no canonical Zalo globalId');
    if (current && current.customerProfileId !== id && !body.confirmTransfer) {
      return reply.status(409).send({ error: 'Zalo user already belongs to another direct customer profile', current });
    }
    const link = await prisma.customerProfileZaloUser.upsert({
      where: { contactId: body.contactId },
      create: { orgId: actor.orgId, customerProfileId: id, contactId: body.contactId, linkedByUserId: actor.id },
      update: { customerProfileId: id, linkedByUserId: actor.id, linkedAt: new Date(), source: 'manual_assignment' },
      include: { customerProfile: true, contact: true },
    });
    return reply.status(current ? 200 : 201).send({ link });
  });

  app.delete('/api/v1/customer-profiles/:id/zalo-users/:contactId', async (request, reply) => {
    const actor = request.user! as Actor;
    if (!(await canManageWork(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { id, contactId } = request.params as { id: string; contactId: string };
    const contact = await loadVisibleContact(actor, contactId);
    if (!contact) return reply.status(404).send({ error: 'Customer user link not found' });
    const result = await prisma.customerProfileZaloUser.deleteMany({
      where: { orgId: actor.orgId, customerProfileId: id, contactId },
    });
    if (!result.count) return reply.status(404).send({ error: 'Customer user link not found' });
    return { ok: true };
  });
}
