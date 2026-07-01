import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { getZaloScope } from './zalo-scope.js';
import { zaloPool } from './zalo-pool.js';
import { syncNativeGroupsForAccount } from './shared-group-service.js';
import { runAdhocCustomerSheetSync } from '../customers/customer-master-sync-service.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { backfillArchiveStoriesForCustomerProfile } from '../archive/archive-customer-context-service.js';

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
      ...(isAdmin(actor)
        ? {}
        : {
            OR: [
              { conversations: { some: { zaloAccountId: { in: accountIds } } } },
              { friends: { some: { zaloAccountId: { in: accountIds } } } },
            ],
          }),
    },
    select: {
      id: true,
      zaloGlobalId: true,
      zaloUsername: true,
      phone: true,
      phoneNormalized: true,
      fullName: true,
      crmName: true,
      metadata: true,
      avatarUrl: true,
      hasZalo: true,
      friends: {
        select: {
          aliasInNick: true,
          zaloDisplayName: true,
          zaloGlobalId: true,
          zaloUsername: true,
          relationshipKind: true,
          friendshipStatus: true,
          zaloAccount: { select: { id: true, displayName: true, phone: true } },
        },
        take: 5,
        orderBy: { lastInteractionAt: { sort: 'desc', nulls: 'last' } },
      },
    },
  });
}

type VisibleZaloContact = NonNullable<Awaited<ReturnType<typeof loadVisibleContact>>>;

function trimOrNull(value?: string | null): string | null {
  const text = String(value || '').trim();
  return text || null;
}

function equivalentContactWhere(contact: Pick<VisibleZaloContact, 'id' | 'zaloGlobalId' | 'phoneNormalized'>): Prisma.ContactWhereInput {
  return {
    OR: [
      { id: contact.id },
      ...(contact.zaloGlobalId ? [{ zaloGlobalId: contact.zaloGlobalId }] : []),
      ...(contact.phoneNormalized ? [{ phoneNormalized: contact.phoneNormalized }] : []),
    ],
  };
}

function visibleContactDisplayName(contact: VisibleZaloContact): string | null {
  return trimOrNull(contact.crmName || contact.fullName || contact.phone);
}

function preferredVisibleZaloIdentity(contact: VisibleZaloContact) {
  const friend = [...(contact.friends || [])].sort((left, right) => {
    const leftRank = left.friendshipStatus === 'accepted' ? 0 : left.relationshipKind === 'chatting_stranger' ? 1 : 2;
    const rightRank = right.friendshipStatus === 'accepted' ? 0 : right.relationshipKind === 'chatting_stranger' ? 1 : 2;
    return leftRank - rightRank;
  })[0];
  return {
    displayName: trimOrNull(friend?.aliasInNick || friend?.zaloDisplayName || contact.zaloUsername || contact.fullName || contact.crmName),
    globalId: trimOrNull(friend?.zaloGlobalId || contact.zaloGlobalId),
    username: trimOrNull(friend?.zaloUsername || contact.zaloUsername),
    accountName: trimOrNull(friend?.zaloAccount?.displayName || friend?.zaloAccount?.phone),
  };
}

function buildZaloUserLinkSnapshot(contact: VisibleZaloContact) {
  const zalo = preferredVisibleZaloIdentity(contact);
  return {
    contactDisplayNameSnapshot: visibleContactDisplayName(contact),
    zaloDisplayNameSnapshot: zalo.displayName,
    phoneSnapshot: trimOrNull(contact.phone || contact.phoneNormalized),
    zaloGlobalIdSnapshot: zalo.globalId,
    zaloUsernameSnapshot: zalo.username,
  };
}

function buildVisibleContactZaloMetadata(contact: VisibleZaloContact) {
  const zalo = preferredVisibleZaloIdentity(contact);
  const phone = trimOrNull(contact.phone || contact.phoneNormalized);
  const normalizedPhone = phone ? normalizePhone(phone) : null;
  const current = (contact.metadata && typeof contact.metadata === 'object' && !Array.isArray(contact.metadata))
    ? contact.metadata as Record<string, unknown>
    : {};
  const existingEntries = Array.isArray((current as any).zaloNickByPhone)
    ? (current as any).zaloNickByPhone
    : [];
  const nextEntry = {
    phone,
    normalizedPhone,
    zaloDisplayName: zalo.displayName,
    zaloGlobalId: zalo.globalId,
    zaloUsername: zalo.username,
    accountName: zalo.accountName,
    syncedAt: new Date().toISOString(),
  };
  return {
    ...current,
    zaloNickByPhone: [
      ...existingEntries.filter((item: any) => (
        item?.normalizedPhone
          ? item.normalizedPhone !== nextEntry.normalizedPhone
          : item?.phone !== nextEntry.phone
      )),
      nextEntry,
    ],
    lastZaloNickForPhone: nextEntry,
  };
}

async function syncZaloUserToCustomerContact(input: {
  actor: Actor;
  customerProfileId: string;
  contact: VisibleZaloContact;
}) {
  const phone = input.contact.phone || input.contact.phoneNormalized || '';
  const normalizedPhone = normalizePhone(phone);
  if (!phone.trim()) {
    return {
      status: 'skipped_missing_phone' as const,
      message: 'User Zalo chưa có số điện thoại nên chưa thể tạo Người liên hệ.',
    };
  }
  if (!normalizedPhone) {
    return {
      status: 'skipped_invalid_phone' as const,
      message: 'User Zalo có số điện thoại nhưng chưa hợp lệ nên chưa thể tạo Người liên hệ.',
    };
  }

  const activeOtherCount = await prisma.customerProfileContact.count({
    where: {
      orgId: input.actor.orgId,
      customerProfileId: input.customerProfileId,
      isActive: true,
      contactId: { not: input.contact.id },
    },
  });
  const link = await prisma.customerProfileContact.upsert({
    where: {
      customerProfileId_contactId: {
        customerProfileId: input.customerProfileId,
        contactId: input.contact.id,
      },
    },
    create: {
      orgId: input.actor.orgId,
      customerProfileId: input.customerProfileId,
      contactId: input.contact.id,
      role: 'other',
      isPrimary: activeOtherCount === 0,
      source: 'zalo_user_phone_sync',
      rawText: 'Tự động gắn từ User Zalo có số điện thoại',
      linkedByUserId: input.actor.id,
    },
    update: {
      isActive: true,
      unlinkedAt: null,
      linkedByUserId: input.actor.id,
      linkedAt: new Date(),
      source: 'zalo_user_phone_sync',
      ...(activeOtherCount === 0 ? { isPrimary: true } : {}),
    },
  });

  const contactData: Prisma.ContactUpdateInput = {
    metadata: buildVisibleContactZaloMetadata(input.contact),
  };
  if (!input.contact.phone && input.contact.phoneNormalized) {
    contactData.phone = input.contact.phoneNormalized;
    contactData.phoneNormalized = normalizedPhone;
  } else if (input.contact.phone && input.contact.phoneNormalized !== normalizedPhone) {
    contactData.phoneNormalized = normalizedPhone;
  }
  await prisma.contact.update({
    where: { id: input.contact.id },
    data: contactData,
  });

  return {
    status: 'linked' as const,
    message: activeOtherCount === 0
      ? 'Đã gắn User Zalo vào Người liên hệ và đặt làm liên hệ chính đầu tiên.'
      : 'Đã gắn User Zalo vào Người liên hệ.',
    link,
  };
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

  app.get('/api/v1/customer-profiles/link-options/zalo-users', async (request) => {
    const actor = request.user! as Actor;
    const query = request.query as { q?: string; limit?: string; linkStatus?: 'linked' | 'unlinked' };
    const accountIds = await accessibleAccountIds(actor);
    const q = String(query.q || '').trim();
    const digits = q.replace(/[^\d]/g, '');
    const limit = Math.min(Math.max(Number(query.limit || 20), 5), 50);
    const andFilters: Prisma.ContactWhereInput[] = [];
    if (!isAdmin(actor)) {
      andFilters.push({
        OR: [
          { conversations: { some: { zaloAccountId: { in: accountIds } } } },
          { friends: { some: { zaloAccountId: { in: accountIds } } } },
        ],
      });
    }
    if (q) {
      andFilters.push({
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { crmName: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          ...(digits ? [{ phoneNormalized: { contains: digits } }] : []),
          { zaloUsername: { contains: q, mode: 'insensitive' } },
          { zaloGlobalId: { contains: q } },
          { zaloUid: { contains: q } },
        ],
      });
    }
    const contacts = await prisma.contact.findMany({
      where: {
        orgId: actor.orgId,
        mergedInto: null,
        zaloGlobalId: { not: null },
        ...(query.linkStatus === 'linked' ? { customerProfileLink: { isNot: null } } : {}),
        ...(query.linkStatus === 'unlinked' ? { customerProfileLink: { is: null } } : {}),
        ...(andFilters.length ? { AND: andFilters } : {}),
      },
      select: {
        id: true,
        fullName: true,
        crmName: true,
        zaloUsername: true,
        zaloGlobalId: true,
        phone: true,
        phoneNormalized: true,
        avatarUrl: true,
        hasZalo: true,
        conversations: {
          select: {
            zaloAccount: { select: { id: true, displayName: true, phone: true } },
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
            zaloAccount: { select: { id: true, displayName: true, phone: true } },
          },
          take: 5,
          orderBy: { lastInteractionAt: { sort: 'desc', nulls: 'last' } },
        },
        customerProfileLink: {
          select: {
            customerProfileId: true,
            customerProfile: { select: { id: true, code: true, externalKey: true, name: true } },
          },
        },
      },
      orderBy: [{ lastActivity: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: limit,
    });
    return { contacts };
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
    const query = request.query as { q?: string; page?: string; pageSize?: string };
    const q = String(query.q || '').trim();
    const page = Math.max(1, Number(query.page || 1) || 1);
    const pageSize = Math.min(200, Math.max(10, Number(query.pageSize || 50) || 50));
    const where: Prisma.CustomerProfileWhereInput = {
      orgId: actor.orgId,
      ...(q ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { shortName: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
          { externalKey: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { taxCode: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { mainPhone: { contains: q } },
          { provinceOrRegion: { contains: q, mode: 'insensitive' } },
          { officeAddress: { contains: q, mode: 'insensitive' } },
          { legalRepresentativeRaw: { contains: q, mode: 'insensitive' } },
          { salesOwnerCodeSnapshot: { contains: q, mode: 'insensitive' } },
          { managingDepartmentCodeSnapshot: { contains: q, mode: 'insensitive' } },
          { customerTypeCodeSnapshot: { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [total, profiles] = await Promise.all([
      prisma.customerProfile.count({ where }),
      prisma.customerProfile.findMany({
        where,
        include: {
          ownerUser: { select: { id: true, fullName: true } },
          managingDepartment: { select: { id: true, name: true } },
          customerType: true,
          _count: { select: { zaloGroups: true, zaloUsers: true, contacts: true, archiveStories: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      profiles,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  });

  app.post('/api/v1/customer-profiles/sync-google-sheet', async (request, reply) => {
    const actor = request.user! as Actor;
    if (!(await canManageWork(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const body = (request.body || {}) as {
      spreadsheetId?: string;
      sheetName?: string;
      range?: string;
      headerRow?: number;
      columns?: Record<string, string>;
    };
    if (!body.spreadsheetId || !body.sheetName) return badRequest(reply, 'spreadsheetId and sheetName are required');
    const result = await runAdhocCustomerSheetSync({
      orgId: actor.orgId,
      actorUserId: actor.id,
      spreadsheetId: body.spreadsheetId,
      sheetName: body.sheetName,
      range: body.range,
      headerRow: body.headerRow,
      columns: body.columns as any,
    });
    return {
      synced: result.createdCount + result.updatedCount,
      created: result.createdCount,
      updated: result.updatedCount,
      skipped: result.skippedCount,
      errors: result.errors.slice(0, 100),
    };
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
    const archiveBackfill = await backfillArchiveStoriesForCustomerProfile({
      orgId: actor.orgId,
      customerProfileId: id,
    });
    return reply.status(current ? 200 : 201).send({ link, archiveBackfill });
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
    const snapshotData = buildZaloUserLinkSnapshot(contact);
    const link = await prisma.customerProfileZaloUser.upsert({
      where: { contactId: body.contactId },
      create: {
        orgId: actor.orgId,
        customerProfileId: id,
        contactId: body.contactId,
        linkedByUserId: actor.id,
        ...snapshotData,
      },
      update: {
        customerProfileId: id,
        linkedByUserId: actor.id,
        linkedAt: new Date(),
        source: 'manual_assignment',
        ...snapshotData,
      },
      include: { customerProfile: true, contact: true },
    });
    const contactSync = await syncZaloUserToCustomerContact({
      actor,
      customerProfileId: id,
      contact,
    });
    const archiveBackfill = await backfillArchiveStoriesForCustomerProfile({
      orgId: actor.orgId,
      customerProfileId: id,
    });
    return reply.status(current ? 200 : 201).send({ link, contactSync, archiveBackfill });
  });

  app.delete('/api/v1/customer-profiles/:id/zalo-users/:contactId', async (request, reply) => {
    const actor = request.user! as Actor;
    if (!(await canManageWork(actor))) return reply.status(403).send({ error: 'Manager permission required' });
    const { id, contactId } = request.params as { id: string; contactId: string };
    const query = (request.query || {}) as { unlinkContact?: string };
    const unlinkContact = query.unlinkContact === 'true';
    const contact = await loadVisibleContact(actor, contactId);
    if (!contact) return reply.status(404).send({ error: 'Customer user link not found' });
    const result = await prisma.$transaction(async (tx) => {
      const counterpartLinks = await tx.customerProfileContact.findMany({
        where: {
          orgId: actor.orgId,
          customerProfileId: id,
          isActive: true,
          contact: equivalentContactWhere(contact),
        },
        select: { id: true },
      });
      const userResult = await tx.customerProfileZaloUser.deleteMany({
        where: { orgId: actor.orgId, customerProfileId: id, contactId },
      });
      if (unlinkContact && counterpartLinks.length) {
        await tx.customerProfileContact.updateMany({
          where: { id: { in: counterpartLinks.map((link) => link.id) } },
          data: { isActive: false, unlinkedAt: new Date() },
        });
      }
      return {
        userCount: userResult.count,
        counterpartFound: counterpartLinks.length > 0,
        counterpartUnlinked: unlinkContact ? counterpartLinks.length : 0,
      };
    });
    if (!result.userCount) return reply.status(404).send({ error: 'Customer user link not found' });
    return { ok: true, ...result };
  });
}
