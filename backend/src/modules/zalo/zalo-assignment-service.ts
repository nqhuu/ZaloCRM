import { prisma } from '../../shared/database/prisma-client.js';

export interface ZaloAssignmentActor {
  id: string;
  orgId: string;
  role: string;
}

export class ZaloAssignmentError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
  }
}

export function parseDateOnly(input: string, fieldName: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new ZaloAssignmentError(`${fieldName} phải có định dạng YYYY-MM-DD`);
  }
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ZaloAssignmentError(`${fieldName} không hợp lệ`);
  }
  return date;
}

export function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function getEffectivePrimaryAssignee(input: {
  orgId: string;
  zaloAccountId: string;
  at?: Date;
}) {
  const at = toDateOnly(input.at || new Date());
  const account = await prisma.zaloAccount.findFirst({
    where: { id: input.zaloAccountId, orgId: input.orgId },
    select: { id: true, departmentId: true },
  });
  if (!account) return null;

  const basePrimary = await findBasePrimary(input.zaloAccountId, account.departmentId);
  const delegation = await prisma.zaloAccountPrimaryDelegation.findFirst({
    where: {
      orgId: input.orgId,
      zaloAccountId: input.zaloAccountId,
      cancelledAt: null,
      startDate: { lte: at },
      endDate: { gte: at },
    },
    include: {
      basePrimaryUser: { select: { id: true, fullName: true, email: true } },
      delegateUser: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (delegation) {
    return {
      source: 'delegation' as const,
      userId: delegation.delegateUserId,
      fullName: delegation.delegateUser.fullName,
      email: delegation.delegateUser.email,
      user: delegation.delegateUser,
      basePrimaryUserId: delegation.basePrimaryUserId,
      basePrimaryUser: delegation.basePrimaryUser,
      delegation: serializeDelegation(delegation),
      departmentId: account.departmentId,
    };
  }

  if (!basePrimary) return null;
  return {
    source: 'base_primary' as const,
    userId: basePrimary.user.id,
    fullName: basePrimary.user.fullName,
    email: basePrimary.user.email,
    user: basePrimary.user,
    basePrimaryUserId: basePrimary.user.id,
    basePrimaryUser: basePrimary.user,
    delegation: null,
    departmentId: account.departmentId,
  };
}

export async function listZaloPrimaryDelegations(actor: ZaloAssignmentActor, zaloAccountId: string) {
  const account = await loadManagedAccount(actor, zaloAccountId, false);
  const [delegations, effectivePrimary] = await Promise.all([
    prisma.zaloAccountPrimaryDelegation.findMany({
      where: { orgId: actor.orgId, zaloAccountId },
      include: delegationInclude,
      orderBy: [{ cancelledAt: 'asc' }, { startDate: 'desc' }],
      take: 100,
    }),
    getEffectivePrimaryAssignee({ orgId: actor.orgId, zaloAccountId }),
  ]);
  return {
    account,
    effectivePrimary,
    delegations: delegations.map(serializeDelegation),
  };
}

export async function createZaloPrimaryDelegation(input: {
  actor: ZaloAssignmentActor;
  zaloAccountId: string;
  delegateUserId: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
}) {
  const account = await loadManagedAccount(input.actor, input.zaloAccountId, true);
  if (!account.departmentId) {
    throw new ZaloAssignmentError('Tài khoản Zalo chưa có phòng ban hiện hành');
  }
  const startDate = parseDateOnly(input.startDate, 'Từ ngày');
  const endDate = parseDateOnly(input.endDate, 'Đến ngày');
  if (endDate < startDate) {
    throw new ZaloAssignmentError('Đến ngày phải lớn hơn hoặc bằng từ ngày');
  }

  const basePrimary = await findBasePrimary(input.zaloAccountId, account.departmentId);
  if (!basePrimary) {
    throw new ZaloAssignmentError('Tài khoản Zalo chưa có phụ trách chính gốc');
  }
  if (basePrimary.userId === input.delegateUserId) {
    throw new ZaloAssignmentError('Người thay thế phải khác phụ trách chính gốc');
  }

  const delegate = await prisma.user.findFirst({
    where: {
      id: input.delegateUserId,
      orgId: input.actor.orgId,
      isActive: true,
      departmentMember: { departmentId: account.departmentId },
    },
    select: { id: true },
  });
  if (!delegate) {
    throw new ZaloAssignmentError('Người thay thế phải là nhân viên active trong phòng ban quản lý nick Zalo');
  }

  const overlap = await prisma.zaloAccountPrimaryDelegation.findFirst({
    where: {
      orgId: input.actor.orgId,
      zaloAccountId: input.zaloAccountId,
      cancelledAt: null,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true, startDate: true, endDate: true },
  });
  if (overlap) {
    throw new ZaloAssignmentError(
      `Đã có uỷ quyền từ ${formatDateOnly(overlap.startDate)} đến ${formatDateOnly(overlap.endDate)}`,
      409,
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const createdDelegation = await tx.zaloAccountPrimaryDelegation.create({
      data: {
        orgId: input.actor.orgId,
        zaloAccountId: input.zaloAccountId,
        departmentId: account.departmentId!,
        basePrimaryUserId: basePrimary.userId,
        delegateUserId: input.delegateUserId,
        startDate,
        endDate,
        timezone: '+07:00',
        reason: input.reason?.trim() || null,
        createdByUserId: input.actor.id,
      },
      include: delegationInclude,
    });
    const today = toDateOnly(new Date());
    if (startDate <= today && endDate >= today) {
      await ensureChatAccess(tx, {
        zaloAccountId: input.zaloAccountId,
        userId: input.delegateUserId,
        delegationId: createdDelegation.id,
        endDate,
      });
    }
    return createdDelegation;
  });
  return serializeDelegation(created);
}

export async function cancelZaloPrimaryDelegation(input: {
  actor: ZaloAssignmentActor;
  zaloAccountId: string;
  delegationId: string;
  reason?: string | null;
}) {
  await loadManagedAccount(input.actor, input.zaloAccountId, true);
  const existing = await prisma.zaloAccountPrimaryDelegation.findFirst({
    where: {
      id: input.delegationId,
      orgId: input.actor.orgId,
      zaloAccountId: input.zaloAccountId,
    },
    select: { id: true, cancelledAt: true },
  });
  if (!existing) throw new ZaloAssignmentError('Không tìm thấy uỷ quyền', 404);
  if (existing.cancelledAt) throw new ZaloAssignmentError('Uỷ quyền đã bị huỷ', 409);

  const cancelled = await prisma.zaloAccountPrimaryDelegation.update({
    where: { id: existing.id },
    data: {
      cancelledAt: new Date(),
      cancelledByUserId: input.actor.id,
      cancelReason: input.reason?.trim() || null,
    },
    include: delegationInclude,
  });
  await revokeTemporaryDelegationAccess(existing.id);
  return serializeDelegation(cancelled);
}

export async function reconcileExpiredPrimaryDelegationAccess(now = new Date()) {
  const today = toDateOnly(now);
  const activeDelegations = await prisma.zaloAccountPrimaryDelegation.findMany({
    where: {
      cancelledAt: null,
      startDate: { lte: today },
      endDate: { gte: today },
    },
    select: {
      id: true,
      zaloAccountId: true,
      delegateUserId: true,
      endDate: true,
    },
    take: 200,
  });
  let granted = 0;
  for (const delegation of activeDelegations) {
    const changed = await ensureChatAccess(prisma, {
      zaloAccountId: delegation.zaloAccountId,
      userId: delegation.delegateUserId,
      delegationId: delegation.id,
      endDate: delegation.endDate,
    });
    if (changed) granted++;
  }

  const expiredAccess = await prisma.zaloAccountAccess.findMany({
    where: {
      grantSource: 'primary_delegation',
      grantExpiresAt: { lte: today },
    },
    select: {
      id: true,
      grantSourceId: true,
    },
    take: 200,
  });

  let revoked = 0;
  let restored = 0;
  for (const access of expiredAccess) {
    const activeDelegation = access.grantSourceId
      ? await prisma.zaloAccountPrimaryDelegation.findFirst({
          where: {
            id: access.grantSourceId,
            cancelledAt: null,
            endDate: { gte: toDateOnly(now) },
          },
          select: { id: true },
        })
      : null;
    if (activeDelegation) continue;
    const result = await revokeTemporaryDelegationAccess(access.grantSourceId || '');
    revoked += result.revoked;
    restored += result.restored;
  }
  return { checked: expiredAccess.length, granted, revoked, restored };
}

async function revokeTemporaryDelegationAccess(delegationId: string) {
  if (!delegationId) return { revoked: 0, restored: 0 };
  const accessRows = await prisma.zaloAccountAccess.findMany({
    where: {
      grantSource: 'primary_delegation',
      grantSourceId: delegationId,
    },
    select: {
      id: true,
      grantPreviousPermission: true,
    },
  });
  let revoked = 0;
  let restored = 0;
  for (const access of accessRows) {
    if (access.grantPreviousPermission) {
      await prisma.zaloAccountAccess.update({
        where: { id: access.id },
        data: {
          permission: access.grantPreviousPermission,
          grantSource: null,
          grantSourceId: null,
          grantExpiresAt: null,
          grantPreviousPermission: null,
        },
      });
      restored++;
    } else {
      await prisma.zaloAccountAccess.delete({ where: { id: access.id } });
      revoked++;
    }
  }
  return { revoked, restored };
}

export async function hasZaloHandlingAccess(input: {
  orgId: string;
  zaloAccountId: string;
  userId: string;
}) {
  const access = await prisma.zaloAccountAccess.findFirst({
    where: {
      zaloAccountId: input.zaloAccountId,
      userId: input.userId,
      permission: { in: ['chat', 'admin'] },
    },
    select: { id: true, assignmentRole: true },
  });
  return Boolean(access);
}

export async function findZaloHandlingCandidates(input: {
  orgId: string;
  zaloAccountId: string;
  departmentId: string | null;
  excludeUserId?: string | null;
}) {
  if (!input.departmentId) return [];
  const users = await prisma.zaloAccountAccess.findMany({
    where: {
      zaloAccountId: input.zaloAccountId,
      permission: { in: ['chat', 'admin'] },
      user: {
        isActive: true,
        departmentMember: { departmentId: input.departmentId },
      },
    },
    select: {
      assignmentRole: true,
      user: { select: { id: true, fullName: true } },
    },
  });
  return users
    .filter((item) => item.user.id !== input.excludeUserId)
    .sort((a, b) => assignmentRank(a.assignmentRole) - assignmentRank(b.assignmentRole)
      || a.user.fullName.localeCompare(b.user.fullName, 'vi'))
    .map((item) => ({
      id: item.user.id,
      fullName: item.user.fullName,
      assignmentRole: item.assignmentRole,
      hasZaloHandlingAccess: true,
    }));
}

async function loadManagedAccount(
  actor: ZaloAssignmentActor,
  zaloAccountId: string,
  requireManage: boolean,
) {
  const account = await prisma.zaloAccount.findFirst({
    where: { id: zaloAccountId, orgId: actor.orgId, deletedAt: null },
    select: {
      id: true,
      departmentId: true,
      department: { select: { id: true, name: true, path: true } },
    },
  });
  if (!account) throw new ZaloAssignmentError('Không tìm thấy tài khoản Zalo', 404);
  if (requireManage && !(await canManageAccountAssignment(actor, account.departmentId))) {
    throw new ZaloAssignmentError('Chỉ trưởng/phó phòng hoặc admin được quản lý uỷ quyền phụ trách Zalo', 403);
  }
  return account;
}

async function canManageAccountAssignment(actor: ZaloAssignmentActor, departmentId: string | null) {
  if (['owner', 'admin'].includes(actor.role)) return true;
  if (!departmentId) return false;
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

async function findBasePrimary(zaloAccountId: string, departmentId: string | null) {
  if (!departmentId) return null;
  return prisma.zaloAccountAccess.findFirst({
    where: {
      zaloAccountId,
      assignmentRole: 'primary',
      permission: { in: ['chat', 'admin'] },
      user: {
        isActive: true,
        departmentMember: { departmentId },
      },
    },
    select: {
      userId: true,
      user: { select: { id: true, fullName: true, email: true } },
    },
  });
}

async function ensureChatAccess(tx: any, input: {
  zaloAccountId: string;
  userId: string;
  delegationId: string;
  endDate: Date;
}) {
  const existing = await tx.zaloAccountAccess.findFirst({
    where: { zaloAccountId: input.zaloAccountId, userId: input.userId },
    select: { id: true, permission: true, grantSource: true },
  });
  const grantExpiresAt = new Date(input.endDate.getTime() + 24 * 60 * 60 * 1000);
  if (!existing) {
    await tx.zaloAccountAccess.create({
      data: {
        zaloAccountId: input.zaloAccountId,
        userId: input.userId,
        permission: 'chat',
        grantSource: 'primary_delegation',
        grantSourceId: input.delegationId,
        grantExpiresAt,
        grantPreviousPermission: null,
      },
    });
    return true;
  }
  if (existing.permission === 'read') {
    await tx.zaloAccountAccess.update({
      where: { id: existing.id },
      data: {
        permission: 'chat',
        grantSource: 'primary_delegation',
        grantSourceId: input.delegationId,
        grantExpiresAt,
        grantPreviousPermission: existing.grantSource ? existing.permission : 'read',
      },
    });
    return true;
  }
  return false;
}

function toDateOnly(date: Date) {
  return new Date(date.toISOString().slice(0, 10) + 'T00:00:00.000Z');
}

function assignmentRank(role: string | null) {
  if (role === 'primary') return 0;
  const match = role?.match(/^secondary_(\d+)$/);
  return match ? Number(match[1]) : 9999;
}

const delegationInclude = {
  basePrimaryUser: { select: { id: true, fullName: true, email: true } },
  delegateUser: { select: { id: true, fullName: true, email: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  cancelledBy: { select: { id: true, fullName: true, email: true } },
} as const;

function serializeDelegation(delegation: any) {
  return {
    id: delegation.id,
    zaloAccountId: delegation.zaloAccountId,
    departmentId: delegation.departmentId,
    basePrimaryUserId: delegation.basePrimaryUserId,
    delegateUserId: delegation.delegateUserId,
    startDate: formatDateOnly(delegation.startDate),
    endDate: formatDateOnly(delegation.endDate),
    timezone: delegation.timezone,
    reason: delegation.reason,
    cancelledAt: delegation.cancelledAt,
    cancelReason: delegation.cancelReason,
    createdAt: delegation.createdAt,
    basePrimaryUser: delegation.basePrimaryUser,
    delegateUser: delegation.delegateUser,
    createdBy: delegation.createdBy,
    cancelledBy: delegation.cancelledBy,
  };
}
