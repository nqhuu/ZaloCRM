import type { Action } from '../rbac/permission-types.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { userHasGrant } from '../rbac/permission-group-service.js';
import { getEffectivePrimaryAssignee } from '../zalo/zalo-assignment-service.js';

export interface ArchiveActor {
  id: string;
  orgId: string;
  role: string;
}

export async function actorHasArchiveGrant(actor: ArchiveActor, action: Action): Promise<boolean> {
  if (['owner', 'admin'].includes(actor.role)) return true;
  return userHasGrant(actor.id, 'archive', action);
}

export async function archiveScopeWhere(actor: ArchiveActor): Promise<Record<string, unknown>> {
  if (['owner', 'admin'].includes(actor.role) || await actorHasArchiveGrant(actor, 'access')) {
    return { orgId: actor.orgId };
  }

  const ownScope = [
    { assignedUserId: actor.id },
    { createdByUserId: actor.id },
    { transferRequests: { some: { toUserId: actor.id, status: 'pending' } } },
  ];
  if (!(await actorHasArchiveGrant(actor, 'view_all'))) {
    return { orgId: actor.orgId, OR: ownScope };
  }

  const membership = await prisma.departmentMember.findUnique({
    where: { userId: actor.id },
    select: {
      deptRole: true,
      department: { select: { path: true } },
    },
  });
  if (!membership || !['leader', 'deputy'].includes(membership.deptRole)) {
    return { orgId: actor.orgId, OR: ownScope };
  }

  const departments = await prisma.department.findMany({
    where: {
      orgId: actor.orgId,
      archivedAt: null,
      path: { startsWith: membership.department.path },
    },
    select: { id: true },
  });
  return {
    orgId: actor.orgId,
    OR: [
      ...ownScope,
      { departmentId: { in: departments.map((item) => item.id) } },
    ],
  };
}

export async function canMutateArchiveStory(
  actor: ArchiveActor,
  story: {
    id?: string;
    createdByUserId: string;
    assignedUserId: string | null;
    departmentId: string | null;
  },
  action: Action,
): Promise<boolean> {
  if (!(await actorHasArchiveGrant(actor, action))) return false;
  if (['owner', 'admin'].includes(actor.role)) return true;
  if (story.assignedUserId === actor.id) return true;
  if (!story.departmentId || !(await actorHasArchiveGrant(actor, 'view_all'))) return false;

  const membership = await prisma.departmentMember.findUnique({
    where: { userId: actor.id },
    select: {
      deptRole: true,
      department: { select: { path: true } },
    },
  });
  if (!membership || !['leader', 'deputy'].includes(membership.deptRole)) return false;
  const target = await prisma.department.findFirst({
    where: { id: story.departmentId, orgId: actor.orgId, archivedAt: null },
    select: { path: true },
  });
  return Boolean(target?.path.startsWith(membership.department.path));
}

export async function canAppendArchiveStory(
  actor: ArchiveActor,
  story: {
    id: string;
    createdByUserId: string;
    assignedUserId: string | null;
    departmentId: string | null;
    businessStatus?: string | null;
    statusDefinition?: {
      behaviorGroup: string;
      allowMessageAppend: boolean;
    } | null;
  },
): Promise<boolean> {
  if (!(await actorHasArchiveGrant(actor, 'create'))) return false;
  const canAppendByStatus = story.statusDefinition
    ? story.statusDefinition.allowMessageAppend
    : story.businessStatus === 'pending';
  if (!canAppendByStatus) return false;
  if (['owner', 'admin'].includes(actor.role)) return true;
  const visible = await prisma.archiveStory.findFirst({
    where: {
      ...(await archiveScopeWhere(actor)),
      id: story.id,
    },
    select: { id: true },
  });
  return Boolean(visible);
}

export interface ArchiveStoryPermissions {
  canView: boolean;
  canUpdateStatus: boolean;
  canAppendMessages: boolean;
  canEditMetadata: boolean;
  canRemoveMessages: boolean;
  canDeleteStory: boolean;
  canHandover: boolean;
  canOverrideAssignee: boolean;
  reason?: string;
}

export async function archiveStoryPermissions(
  actor: ArchiveActor,
  story: {
    id?: string;
    createdByUserId: string;
    assignedUserId: string | null;
    departmentId: string | null;
    businessStatus?: string | null;
    statusDefinition?: {
      behaviorGroup: string;
      allowMessageAppend: boolean;
    } | null;
  },
): Promise<ArchiveStoryPermissions> {
  const [canEdit, canCreate, canDelete, canAppend] = await Promise.all([
    canMutateArchiveStory(actor, story, 'edit'),
    canMutateArchiveStory(actor, story, 'create'),
    canMutateArchiveStory(actor, story, 'delete'),
    story.id
      ? canAppendArchiveStory(actor, { ...story, id: story.id })
      : canMutateArchiveStory(actor, story, 'create'),
  ]);
  const canOverrideAssignee = ['owner', 'admin'].includes(actor.role)
    || (canEdit && await isArchiveDepartmentManager(actor, story.departmentId));
  const isCompleted = story.businessStatus === 'completed'
    || story.statusDefinition?.behaviorGroup === 'completed';
  const completedReason = 'Hồ sơ đã hoàn thành, không thể cập nhật thông tin hoặc chuyển người xử lý';
  return {
    canView: true,
    canUpdateStatus: canEdit,
    canAppendMessages: canAppend,
    canEditMetadata: canEdit && !isCompleted,
    canRemoveMessages: canEdit,
    canDeleteStory: canDelete,
    canHandover: canEdit && !isCompleted,
    canOverrideAssignee: canOverrideAssignee && !isCompleted,
    reason: isCompleted
      ? completedReason
      : canEdit
        ? undefined
        : 'Chỉ người xử lý hoặc trưởng phòng quản lý hồ sơ mới được thao tác',
  };
}

async function isArchiveDepartmentManager(actor: ArchiveActor, departmentId: string | null): Promise<boolean> {
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

export async function getArchiveSaveContext(actor: ArchiveActor, conversationId?: string) {
  const user = await prisma.user.findFirst({
    where: { id: actor.id, orgId: actor.orgId },
    select: {
      id: true,
      fullName: true,
      departmentMember: {
        select: {
          departmentId: true,
          deptRole: true,
          department: {
            select: { id: true, name: true, path: true, defaultArchiveRecordType: true },
          },
        },
      },
    },
  });
  if (!user) throw new Error('User not found');

  const canAssignOthers = ['owner', 'admin'].includes(actor.role)
    || Boolean(user.departmentMember && ['leader', 'deputy'].includes(user.departmentMember.deptRole));
  const canViewOthers = ['owner', 'admin'].includes(actor.role)
    || Boolean(
      user.departmentMember
      && ['leader', 'deputy'].includes(user.departmentMember.deptRole)
      && await actorHasArchiveGrant(actor, 'view_all'),
    );
  let departments: Array<{
    id: string;
    name: string;
    path: string;
    defaultArchiveRecordType: string;
  }> = [];
  let users: Array<{ id: string; fullName: string; departmentId: string | null }> = [
    { id: user.id, fullName: user.fullName, departmentId: user.departmentMember?.departmentId || null },
  ];

  if (canAssignOthers) {
    if (['owner', 'admin'].includes(actor.role)) {
      departments = await prisma.department.findMany({
        where: { orgId: actor.orgId, archivedAt: null },
        select: { id: true, name: true, path: true, defaultArchiveRecordType: true },
        orderBy: [{ depth: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
      });
    } else if (user.departmentMember) {
      departments = await prisma.department.findMany({
        where: {
          orgId: actor.orgId,
          archivedAt: null,
          path: { startsWith: user.departmentMember.department.path },
        },
        select: { id: true, name: true, path: true, defaultArchiveRecordType: true },
        orderBy: [{ depth: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
      });
    }
    const departmentIds = departments.map((item) => item.id);
    const scopedUsers = await prisma.user.findMany({
      where: {
        orgId: actor.orgId,
        isActive: true,
        ...(departmentIds.length
          ? { departmentMember: { departmentId: { in: departmentIds } } }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        departmentMember: { select: { departmentId: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    users = scopedUsers.map((item) => ({
      id: item.id,
      fullName: item.fullName,
      departmentId: item.departmentMember?.departmentId || null,
    }));
  } else if (user.departmentMember) {
    departments = [user.departmentMember.department];
  }

  // Filter controls are intentionally broader than mutation/assignment controls.
  // The result query still applies archiveScopeWhere(actor), so these options do not bypass view permissions.
  const filterDepartments = await prisma.department.findMany({
    where: { orgId: actor.orgId, archivedAt: null },
    select: { id: true, name: true, path: true, defaultArchiveRecordType: true },
    orderBy: [{ depth: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
  });
  const filterUsers = (await prisma.user.findMany({
    where: {
      orgId: actor.orgId,
      isActive: true,
    },
    select: {
      id: true,
      fullName: true,
      departmentMember: { select: { departmentId: true } },
    },
    orderBy: { fullName: 'asc' },
  })).map((item) => ({
    id: item.id,
    fullName: item.fullName,
    departmentId: item.departmentMember?.departmentId || null,
  }));

  let defaultDepartment = user.departmentMember?.department || null;
  let defaultAssignedUser = { id: user.id, fullName: user.fullName };
  let conversationConfirmationDefault: boolean | null = null;
  let conversationConfirmationUpdatedAt: Date | null = null;
  if (conversationId) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, orgId: actor.orgId },
      select: {
        requiresConfirmationDefault: true,
        requiresConfirmationUpdatedAt: true,
        zaloAccount: {
          select: {
            id: true,
            department: {
              select: { id: true, name: true, path: true, defaultArchiveRecordType: true },
            },
            access: {
              where: { assignmentRole: 'primary' },
              take: 1,
              select: {
                user: { select: { id: true, fullName: true, isActive: true } },
              },
            },
          },
        },
      },
    });
    conversationConfirmationDefault = conversation?.requiresConfirmationDefault ?? null;
    conversationConfirmationUpdatedAt = conversation?.requiresConfirmationUpdatedAt ?? null;
    const effectivePrimary = conversation?.zaloAccount.id
      ? await getEffectivePrimaryAssignee({
          orgId: actor.orgId,
          zaloAccountId: conversation.zaloAccount.id,
        })
      : null;
    const primary = effectivePrimary?.user || conversation?.zaloAccount.access[0]?.user;
    if (canAssignOthers && conversation?.zaloAccount.department) {
      defaultDepartment = conversation.zaloAccount.department;
    }
    if (canAssignOthers && primary && users.some((item) => item.id === primary.id)) {
      defaultAssignedUser = { id: primary.id, fullName: primary.fullName };
    }
  }

  return {
    defaultRecordType: defaultDepartment?.defaultArchiveRecordType
      || user.departmentMember?.department.defaultArchiveRecordType
      || 'order',
    defaultDepartment,
    defaultAssignedUser,
    currentDepartment: user.departmentMember?.department || null,
    currentUser: { id: user.id, fullName: user.fullName },
    conversationConfirmationDefault,
    conversationConfirmationUpdatedAt,
    canAssignOthers,
    canViewOthers,
    departments,
    users,
    filterDepartments,
    filterUsers,
  };
}
