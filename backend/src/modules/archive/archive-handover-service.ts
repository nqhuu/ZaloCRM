import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { actorHasArchiveGrant, archiveScopeWhere, type ArchiveActor } from './archive-access.js';
import { archiveStoryInclude } from './archive-service.js';
import {
  findZaloHandlingCandidates,
  hasZaloHandlingAccess,
} from '../zalo/zalo-assignment-service.js';

const HANDOVER_TTL_MS = 24 * 60 * 60 * 1000;

export async function getArchiveHandoverContext(actor: ArchiveActor, storyId: string) {
  await expirePendingRequests({ storyId });
  const story = await prisma.archiveStory.findFirst({
    where: { ...(await archiveScopeWhere(actor)), id: storyId },
    select: {
      id: true,
      orgId: true,
      zaloAccountId: true,
      departmentId: true,
      assignedUserId: true,
      businessStatus: true,
      assignedUser: { select: { id: true, fullName: true } },
      transferRequests: {
        where: { status: 'pending' },
        take: 1,
        include: transferRequestInclude,
      },
      assignmentHistory: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          fromUser: { select: { id: true, fullName: true } },
          toUser: { select: { id: true, fullName: true } },
          changedBy: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  if (!story) throw new HandoverError('Không tìm thấy hồ sơ', 404);

  const [eligibleRecipients, canOverride] = await Promise.all([
    story.assignedUserId === actor.id
      ? findEligibleSecondaryAssignees(story.zaloAccountId, story.departmentId, story.assignedUserId)
      : Promise.resolve([]),
    canManagerOverrideAssignment(actor, story.departmentId),
  ]);

  let managerCandidates: Array<{ id: string; fullName: string }> = [];
  if (canOverride && story.departmentId) {
    managerCandidates = await findZaloHandlingCandidates({
      orgId: actor.orgId,
      zaloAccountId: story.zaloAccountId,
      departmentId: story.departmentId,
      excludeUserId: story.assignedUserId,
    });
  }

  return {
    currentAssignee: story.assignedUser,
    pendingRequest: story.transferRequests[0] || null,
    assignmentHistory: story.assignmentHistory,
    eligibleRecipients,
    managerCandidates,
    canRequest: story.assignedUserId === actor.id
      && story.businessStatus === 'pending'
      && !story.transferRequests.length,
    canOverride,
  };
}

export async function createArchiveHandoverRequest(input: {
  actor: ArchiveActor;
  storyId: string;
  toUserId: string;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!reason) throw new HandoverError('Lý do bàn giao là bắt buộc');
  await expirePendingRequests({ storyId: input.storyId });

  const story = await prisma.archiveStory.findFirst({
    where: { id: input.storyId, orgId: input.actor.orgId },
    select: {
      id: true,
      title: true,
      conversationName: true,
      zaloAccountId: true,
      departmentId: true,
      assignedUserId: true,
      businessStatus: true,
      assignedUser: { select: { fullName: true } },
    },
  });
  if (!story) throw new HandoverError('Không tìm thấy hồ sơ', 404);
  if (!(await actorHasArchiveGrant(input.actor, 'edit')) || story.assignedUserId !== input.actor.id) {
    throw new HandoverError('Chỉ người đang xử lý hồ sơ được gửi yêu cầu bàn giao', 403);
  }
  if (story.businessStatus !== 'pending') {
    throw new HandoverError('Chỉ hồ sơ chưa hoàn thành mới được bàn giao');
  }
  if (input.toUserId === story.assignedUserId) {
    throw new HandoverError('Người nhận phải khác người xử lý hiện tại');
  }

  const eligible = await findEligibleSecondaryAssignees(story.zaloAccountId, story.departmentId);
  const recipient = eligible.find((user) => user.id === input.toUserId);
  if (!recipient) {
    throw new HandoverError('Chỉ có thể bàn giao cho phụ trách phụ 1 hoặc phụ 2 hợp lệ');
  }

  try {
    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.archiveAssignmentTransferRequest.create({
        data: {
          orgId: input.actor.orgId,
          storyId: story.id,
          fromUserId: input.actor.id,
          toUserId: recipient.id,
          requestedByUserId: input.actor.id,
          reason,
          expiresAt: new Date(Date.now() + HANDOVER_TTL_MS),
        },
        include: transferRequestInclude,
      });
      await tx.archiveNotification.create({
        data: {
          orgId: input.actor.orgId,
          userId: recipient.id,
          storyId: story.id,
          type: 'archive_handover_requested',
          title: 'Yêu cầu nhận bàn giao hồ sơ',
          detail: `${story.assignedUser?.fullName || 'Người xử lý'} đề nghị bàn giao "${story.title || story.conversationName}": ${reason}`,
          priority: 'high',
        },
      });
      return created;
    });
    return request;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new HandoverError('Hồ sơ đang có một yêu cầu bàn giao chờ xác nhận', 409);
    }
    throw error;
  }
}

export async function respondArchiveHandover(input: {
  actor: ArchiveActor;
  requestId: string;
  accept: boolean;
  responseNote?: string | null;
}) {
  const request = await prisma.archiveAssignmentTransferRequest.findFirst({
    where: { id: input.requestId, orgId: input.actor.orgId },
    include: {
      ...transferRequestInclude,
      story: {
        select: {
          id: true,
          title: true,
          conversationName: true,
          zaloAccountId: true,
          departmentId: true,
          assignedUserId: true,
          businessStatus: true,
        },
      },
    },
  });
  if (!request) throw new HandoverError('Không tìm thấy yêu cầu bàn giao', 404);
  if (request.toUserId !== input.actor.id) {
    throw new HandoverError('Chỉ người được đề nghị mới có thể phản hồi', 403);
  }
  if (request.status !== 'pending') {
    throw new HandoverError('Yêu cầu bàn giao không còn hiệu lực', 409);
  }
  if (request.expiresAt <= new Date()) {
    await expirePendingRequests({ requestId: request.id });
    throw new HandoverError('Yêu cầu bàn giao đã hết hạn', 409);
  }
  const leaderIds = await findDepartmentLeaderIds(request.story.departmentId);
  const leaderNotificationIds = leaderIds.filter(
    (userId) => userId !== request.fromUserId && userId !== request.toUserId,
  );
  if (!input.accept) {
    return prisma.$transaction(async (tx) => {
      const rejected = await tx.archiveAssignmentTransferRequest.updateMany({
        where: {
          id: request.id,
          status: 'pending',
          expiresAt: { gt: new Date() },
        },
        data: {
          status: 'rejected',
          responseNote: input.responseNote?.trim() || null,
          respondedAt: new Date(),
          respondedByUserId: input.actor.id,
        },
      });
      if (rejected.count !== 1) {
        throw new HandoverError('Yêu cầu bàn giao không còn hiệu lực', 409);
      }
      await tx.archiveNotification.create({
        data: {
          orgId: input.actor.orgId,
          userId: request.fromUserId,
          storyId: request.storyId,
          type: 'archive_handover_rejected',
          title: 'Yêu cầu bàn giao bị từ chối',
          detail: `${request.toUser.fullName} đã từ chối nhận "${request.story.title || request.story.conversationName}"${input.responseNote?.trim() ? `: ${input.responseNote.trim()}` : ''}`,
          priority: 'medium',
        },
      });
      if (leaderNotificationIds.length) {
        await tx.archiveNotification.createMany({
          data: leaderNotificationIds.map((userId) => ({
              orgId: input.actor.orgId,
              userId,
              storyId: request.storyId,
              type: 'archive_handover_rejected',
              title: 'Yêu cầu bàn giao bị từ chối',
              detail: `${request.toUser.fullName} đã từ chối nhận "${request.story.title || request.story.conversationName}"`,
              priority: 'medium',
            })),
        });
      }
      const updated = await tx.archiveAssignmentTransferRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: transferRequestInclude,
      });
      return { request: updated, story: null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  if (request.story.businessStatus !== 'pending') {
    await invalidateRequest(request.id);
    throw new HandoverError('Hồ sơ đã đóng nên không thể nhận bàn giao', 409);
  }
  const eligible = await findEligibleSecondaryAssignees(
    request.story.zaloAccountId,
    request.story.departmentId,
  );
  if (!eligible.some((user) => user.id === input.actor.id)) {
    await invalidateRequest(request.id);
    throw new HandoverError('Bạn không còn là người phụ trách phụ hợp lệ', 409);
  }

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.archiveAssignmentTransferRequest.updateMany({
      where: {
        id: request.id,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      data: {
        status: 'accepted',
        responseNote: input.responseNote?.trim() || null,
        respondedAt: new Date(),
        respondedByUserId: input.actor.id,
      },
    });
    if (claimed.count !== 1) throw new HandoverError('Yêu cầu bàn giao không còn hiệu lực', 409);

    const moved = await tx.archiveStory.updateMany({
      where: {
        id: request.storyId,
        assignedUserId: request.fromUserId,
        businessStatus: 'pending',
      },
      data: {
        assignedUserId: request.toUserId,
        assignmentOrigin: 'handover',
      },
    });
    if (moved.count !== 1) throw new HandoverError('Người xử lý hồ sơ đã thay đổi', 409);

    await tx.archiveAssignmentHistory.create({
      data: {
        orgId: input.actor.orgId,
        storyId: request.storyId,
        fromUserId: request.fromUserId,
        toUserId: request.toUserId,
        changedByUserId: input.actor.id,
        transferRequestId: request.id,
        changeType: 'accepted_handover',
        reason: request.reason,
      },
    });
    await tx.archiveNotification.create({
      data: {
        orgId: input.actor.orgId,
        userId: request.fromUserId,
        storyId: request.storyId,
        type: 'archive_handover_accepted',
        title: 'Đã bàn giao hồ sơ',
        detail: `${request.toUser.fullName} đã đồng ý nhận "${request.story.title || request.story.conversationName}"`,
        priority: 'medium',
      },
    });
    if (leaderNotificationIds.length) {
      await tx.archiveNotification.createMany({
        data: leaderNotificationIds.map((userId) => ({
            orgId: input.actor.orgId,
            userId,
            storyId: request.storyId,
            type: 'archive_handover_accepted',
            title: 'Hồ sơ đã được bàn giao',
            detail: `${request.toUser.fullName} đã nhận "${request.story.title || request.story.conversationName}"`,
            priority: 'medium',
          })),
      });
    }
    const story = await tx.archiveStory.findUniqueOrThrow({
      where: { id: request.storyId },
      include: archiveStoryInclude,
    });
    const updatedRequest = await tx.archiveAssignmentTransferRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: transferRequestInclude,
    });
    return { request: updatedRequest, story };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelArchiveHandover(input: {
  actor: ArchiveActor;
  requestId: string;
}) {
  const request = await prisma.archiveAssignmentTransferRequest.findFirst({
    where: { id: input.requestId, orgId: input.actor.orgId },
  });
  if (!request) throw new HandoverError('Không tìm thấy yêu cầu bàn giao', 404);
  if (request.requestedByUserId !== input.actor.id) {
    throw new HandoverError('Chỉ người gửi yêu cầu mới được huỷ', 403);
  }
  if (request.status !== 'pending') {
    throw new HandoverError('Yêu cầu bàn giao không còn hiệu lực', 409);
  }
  return prisma.$transaction(async (tx) => {
    const cancelled = await tx.archiveAssignmentTransferRequest.updateMany({
      where: {
        id: request.id,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      data: {
        status: 'cancelled',
        respondedAt: new Date(),
        respondedByUserId: input.actor.id,
      },
    });
    if (cancelled.count !== 1) {
      throw new HandoverError('Yêu cầu bàn giao không còn hiệu lực', 409);
    }
    await tx.archiveNotification.create({
      data: {
        orgId: input.actor.orgId,
        userId: request.toUserId,
        storyId: request.storyId,
        type: 'archive_handover_cancelled',
        title: 'Yêu cầu bàn giao đã được huỷ',
        detail: 'Người gửi đã huỷ yêu cầu bàn giao hồ sơ.',
        priority: 'low',
      },
    });
    return tx.archiveAssignmentTransferRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: transferRequestInclude,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function assignArchiveStoryDirectly(input: {
  actor: ArchiveActor;
  storyId: string;
  toUserId: string;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!reason) throw new HandoverError('Lý do điều phối là bắt buộc');
  const story = await prisma.archiveStory.findFirst({
    where: { id: input.storyId, orgId: input.actor.orgId },
    select: {
      id: true,
      title: true,
      conversationName: true,
      zaloAccountId: true,
      assignedUserId: true,
      departmentId: true,
      businessStatus: true,
    },
  });
  if (!story) throw new HandoverError('Không tìm thấy hồ sơ', 404);
  if (story.businessStatus !== 'pending') {
    throw new HandoverError('Chỉ hồ sơ chưa hoàn thành mới được chuyển người xử lý');
  }
  if (!(await canManagerOverrideAssignment(input.actor, story.departmentId))) {
    throw new HandoverError('Chỉ trưởng phòng hoặc admin được chuyển trực tiếp', 403);
  }
  if (!story.departmentId) throw new HandoverError('Hồ sơ chưa có phòng ban');
  if (story.assignedUserId === input.toUserId) {
    throw new HandoverError('Người được chọn đang là người xử lý hồ sơ');
  }
  const target = await prisma.user.findFirst({
    where: {
      id: input.toUserId,
      orgId: input.actor.orgId,
      isActive: true,
      departmentMember: { departmentId: story.departmentId },
    },
    select: { id: true, fullName: true },
  });
  if (!target) throw new HandoverError('Người xử lý mới phải là nhân viên đang hoạt động trong phòng');
  if (!(await hasZaloHandlingAccess({
    orgId: input.actor.orgId,
    zaloAccountId: story.zaloAccountId,
    userId: target.id,
  }))) {
    throw new HandoverError(
      'Người xử lý mới chưa có quyền chat trên tài khoản Zalo này; hãy gán phụ trách hoặc tạo uỷ quyền tạm thời trước khi chuyển',
      409,
    );
  }
  const pendingRequests = await prisma.archiveAssignmentTransferRequest.findMany({
    where: { storyId: story.id, status: 'pending' },
    select: { toUserId: true },
  });

  return prisma.$transaction(async (tx) => {
    await tx.archiveAssignmentTransferRequest.updateMany({
      where: { storyId: story.id, status: 'pending' },
      data: {
        status: 'superseded',
        respondedAt: new Date(),
        respondedByUserId: input.actor.id,
      },
    });
    const moved = await tx.archiveStory.updateMany({
      where: {
        id: story.id,
        assignedUserId: story.assignedUserId,
        businessStatus: 'pending',
      },
      data: {
        assignedUserId: target.id,
        assignmentOrigin: 'manager_override',
      },
    });
    if (moved.count !== 1) {
      throw new HandoverError('Người xử lý hồ sơ đã thay đổi', 409);
    }
    await tx.archiveAssignmentHistory.create({
      data: {
        orgId: input.actor.orgId,
        storyId: story.id,
        fromUserId: story.assignedUserId,
        toUserId: target.id,
        changedByUserId: input.actor.id,
        changeType: 'manager_override',
        reason,
      },
    });
    await tx.archiveNotification.create({
      data: {
        orgId: input.actor.orgId,
        userId: target.id,
        storyId: story.id,
        type: 'archive_assignment_changed',
        title: 'Bạn được giao xử lý hồ sơ',
        detail: `Bạn được giao "${story.title || story.conversationName}". Lý do: ${reason}`,
        priority: 'high',
      },
    });
    const displacedUsers = new Set([
      ...(story.assignedUserId ? [story.assignedUserId] : []),
      ...pendingRequests.map((request) => request.toUserId),
    ]);
    displacedUsers.delete(target.id);
    if (displacedUsers.size) {
      await tx.archiveNotification.createMany({
        data: [...displacedUsers].map((userId) => ({
          orgId: input.actor.orgId,
          userId,
          storyId: story.id,
          type: 'archive_assignment_overridden',
          title: 'Trưởng phòng đã điều phối hồ sơ',
          detail: `"${story.title || story.conversationName}" đã được chuyển cho ${target.fullName}. Lý do: ${reason}`,
          priority: 'medium',
        })),
      });
    }
    return tx.archiveStory.findUniqueOrThrow({
      where: { id: story.id },
      include: archiveStoryInclude,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listArchiveHandoverInbox(actor: ArchiveActor) {
  await expirePendingRequests({ toUserId: actor.id });
  return prisma.archiveAssignmentTransferRequest.findMany({
    where: { orgId: actor.orgId, toUserId: actor.id, status: 'pending' },
    include: {
      ...transferRequestInclude,
      story: {
        select: {
          id: true,
          title: true,
          conversationName: true,
          businessStatus: true,
        },
      },
    },
    orderBy: { requestedAt: 'desc' },
  });
}

export async function canManagerOverrideAssignment(
  actor: ArchiveActor,
  departmentId: string | null,
) {
  if (!(await actorHasArchiveGrant(actor, 'approve'))) return false;
  if (['owner', 'admin'].includes(actor.role)) return true;
  if (!departmentId) return false;
  const membership = await prisma.departmentMember.findUnique({
    where: { userId: actor.id },
    select: {
      deptRole: true,
      department: { select: { path: true } },
    },
  });
  if (!membership || membership.deptRole !== 'leader') return false;
  const target = await prisma.department.findFirst({
    where: { id: departmentId, orgId: actor.orgId, archivedAt: null },
    select: { path: true },
  });
  return Boolean(target?.path.startsWith(membership.department.path));
}

async function findEligibleSecondaryAssignees(
  zaloAccountId: string,
  departmentId: string | null,
  excludeUserId?: string | null,
) {
  if (!departmentId) return [];
  const access = await prisma.zaloAccountAccess.findMany({
    where: {
      zaloAccountId,
      OR: [
        { assignmentRole: 'primary' },
        { assignmentRole: { startsWith: 'secondary_' } },
      ],
      permission: { in: ['chat', 'admin'] },
      user: {
        isActive: true,
        departmentMember: { departmentId },
      },
    },
    select: {
      assignmentRole: true,
      user: { select: { id: true, fullName: true } },
    },
  });
  return access
    .filter((item) => item.user.id !== excludeUserId)
    .filter((item) => item.assignmentRole === 'primary' || /^secondary_[1-9]\d*$/.test(item.assignmentRole || ''))
    .sort((a, b) => assignmentRoleRank(a.assignmentRole) - assignmentRoleRank(b.assignmentRole)
      || a.user.fullName.localeCompare(b.user.fullName, 'vi'))
    .map((item) => ({
    id: item.user.id,
    fullName: item.user.fullName,
    assignmentRole: item.assignmentRole!,
  }));
}

function assignmentRoleRank(role: string | null) {
  if (role === 'primary') return 0;
  return Number(role?.replace('secondary_', '') || Number.MAX_SAFE_INTEGER);
}

async function expirePendingRequests(input: {
  storyId?: string;
  requestId?: string;
  toUserId?: string;
}) {
  await prisma.archiveAssignmentTransferRequest.updateMany({
    where: {
      status: 'pending',
      expiresAt: { lte: new Date() },
      ...(input.storyId ? { storyId: input.storyId } : {}),
      ...(input.requestId ? { id: input.requestId } : {}),
      ...(input.toUserId ? { toUserId: input.toUserId } : {}),
    },
    data: { status: 'expired', respondedAt: new Date() },
  });
}

async function invalidateRequest(requestId: string) {
  await prisma.archiveAssignmentTransferRequest.updateMany({
    where: { id: requestId, status: 'pending' },
    data: { status: 'invalidated', respondedAt: new Date() },
  });
}

async function findDepartmentLeaderIds(departmentId: string | null) {
  if (!departmentId) return [];
  const leaders = await prisma.departmentMember.findMany({
    where: { departmentId, deptRole: 'leader', user: { isActive: true } },
    select: { userId: true },
  });
  return leaders.map((leader) => leader.userId);
}

const transferRequestInclude = {
  fromUser: { select: { id: true, fullName: true } },
  toUser: { select: { id: true, fullName: true } },
  requestedBy: { select: { id: true, fullName: true } },
  respondedBy: { select: { id: true, fullName: true } },
} as const;

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class HandoverError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
  }
}
