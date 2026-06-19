import type { Action } from '../rbac/permission-types.js';
import { prisma } from '../../shared/database/prisma-client.js';

export const ARCHIVE_STATUS_BEHAVIORS = ['active', 'waiting', 'completed', 'cancelled'] as const;
export type ArchiveStatusBehavior = (typeof ARCHIVE_STATUS_BEHAVIORS)[number];

const COLOR_TOKENS = new Set(['primary', 'warning', 'success', 'error', 'neutral', 'info']);
const CODE_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;

const DEFAULT_STATUSES = [
  {
    code: 'processing',
    name: 'Đang xử lý',
    description: 'Hồ sơ đang được thực hiện',
    behaviorGroup: 'active' as const,
    colorToken: 'primary',
    icon: 'mdi-progress-clock',
    displayOrder: 10,
    isDefault: true,
    countsAsWorkload: true,
    allowMessageAppend: true,
    autoSyncReplies: true,
    requireNote: false,
    requireResult: false,
  },
  {
    code: 'needs_info',
    name: 'Thiếu thông tin',
    description: 'Đang chờ dữ liệu hoặc phản hồi',
    behaviorGroup: 'waiting' as const,
    colorToken: 'warning',
    icon: 'mdi-alert-circle-outline',
    displayOrder: 20,
    isDefault: false,
    countsAsWorkload: true,
    allowMessageAppend: true,
    autoSyncReplies: true,
    requireNote: true,
    requireResult: false,
  },
  {
    code: 'completed',
    name: 'Hoàn thành',
    description: 'Đã có kết quả xử lý cuối cùng',
    behaviorGroup: 'completed' as const,
    colorToken: 'success',
    icon: 'mdi-check-circle-outline',
    displayOrder: 30,
    isDefault: false,
    countsAsWorkload: false,
    allowMessageAppend: false,
    autoSyncReplies: false,
    requireNote: false,
    requireResult: true,
  },
  {
    code: 'cancelled',
    name: 'Huỷ',
    description: 'Hồ sơ không tiếp tục xử lý',
    behaviorGroup: 'cancelled' as const,
    colorToken: 'error',
    icon: 'mdi-cancel',
    displayOrder: 40,
    isDefault: false,
    countsAsWorkload: false,
    allowMessageAppend: false,
    autoSyncReplies: false,
    requireNote: true,
    requireResult: false,
  },
] as const;

export interface ArchiveStatusInput {
  departmentId?: string | null;
  code?: string;
  name?: string;
  description?: string | null;
  behaviorGroup?: ArchiveStatusBehavior;
  colorToken?: string;
  icon?: string;
  displayOrder?: number;
  isDefault?: boolean;
  showOnKanban?: boolean;
  showCountOnOverview?: boolean;
  countsAsWorkload?: boolean;
  allowMessageAppend?: boolean;
  autoSyncReplies?: boolean;
  requireNote?: boolean;
  requireResult?: boolean;
  isActive?: boolean;
  transitionToIds?: string[];
  confirmBehaviorChange?: boolean;
}

export async function ensureArchiveDefaultStatuses(orgId: string) {
  const existing = await prisma.archiveStatusDefinition.findMany({
    where: {
      orgId,
      departmentId: null,
      code: { in: DEFAULT_STATUSES.map((status) => status.code) },
    },
  });
  const byCode = new Map(existing.map((status) => [status.code, status]));

  for (const definition of DEFAULT_STATUSES) {
    if (byCode.has(definition.code)) continue;
    const created = await prisma.archiveStatusDefinition.create({
      data: {
        orgId,
        departmentId: null,
        ...definition,
        showOnKanban: true,
        showCountOnOverview: ['active', 'waiting'].includes(definition.behaviorGroup),
        countsAsWorkload: definition.countsAsWorkload,
        isSystem: true,
        isActive: true,
      },
    });
    byCode.set(created.code, created);
  }

  const defaults = [...byCode.values()];
  await ensureDefaultTransitions(orgId, defaults);

  for (const definition of defaults) {
    const legacyStatus = legacyBusinessStatus(definition.behaviorGroup as ArchiveStatusBehavior);
    const legacyValues = definition.code === 'processing'
      ? ['pending', 'processing']
      : [legacyStatus, definition.code];
    await prisma.archiveStory.updateMany({
      where: {
        orgId,
        statusDefinitionId: null,
        businessStatus: { in: [...new Set(legacyValues)] },
      },
      data: {
        statusDefinitionId: definition.id,
        businessStatus: legacyStatus,
      },
    });
  }

  return defaults.sort((left, right) => left.displayOrder - right.displayOrder);
}

export async function listArchiveStatusDefinitions(input: {
  orgId: string;
  departmentId?: string | null;
  includeInactive?: boolean;
  allDepartments?: boolean;
}) {
  await ensureArchiveDefaultStatuses(input.orgId);
  const statuses = await prisma.archiveStatusDefinition.findMany({
    where: {
      orgId: input.orgId,
      ...(input.includeInactive ? {} : { isActive: true }),
      ...(input.allDepartments
        ? {}
        : input.departmentId
          ? { OR: [{ departmentId: null }, { departmentId: input.departmentId }] }
          : { departmentId: null }),
    },
    include: {
      department: { select: { id: true, name: true } },
      transitionsFrom: {
        where: { isActive: true },
        select: { toStatusId: true, requiredPermission: true },
      },
      _count: { select: { stories: true } },
    },
    orderBy: [
      { departmentId: 'asc' },
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  });
  return statuses.map((status) => ({
    ...status,
    allowedTransitionIds: status.transitionsFrom.map((transition) => transition.toStatusId),
  }));
}

export async function resolveDefaultArchiveStatus(orgId: string, departmentId?: string | null) {
  await ensureArchiveDefaultStatuses(orgId);
  if (departmentId) {
    const departmentDefault = await prisma.archiveStatusDefinition.findFirst({
      where: { orgId, departmentId, isDefault: true, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (departmentDefault) return departmentDefault;
  }
  return prisma.archiveStatusDefinition.findFirstOrThrow({
    where: { orgId, departmentId: null, isDefault: true, isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function resolveArchiveStatusByLegacy(
  orgId: string,
  departmentId: string | null | undefined,
  legacyStatus: string,
) {
  await ensureArchiveDefaultStatuses(orgId);
  const code = legacyStatus === 'completed'
    ? 'completed'
    : legacyStatus === 'cancelled'
      ? 'cancelled'
      : 'processing';
  return prisma.archiveStatusDefinition.findFirst({
    where: {
      orgId,
      code,
      isActive: true,
      ...(departmentId
        ? { OR: [{ departmentId }, { departmentId: null }] }
        : { departmentId: null }),
    },
    orderBy: [{ departmentId: 'desc' }],
  });
}

export async function createArchiveStatusDefinition(input: {
  orgId: string;
  userId: string;
  data: ArchiveStatusInput;
}) {
  const data = normalizeStatusInput(input.data, true);
  if (data.isDefault && !data.isActive) {
    throw new ArchiveStatusError('Trạng thái mặc định phải đang được sử dụng');
  }
  await validateDepartment(input.orgId, data.departmentId);
  const duplicate = await prisma.archiveStatusDefinition.findFirst({
    where: {
      orgId: input.orgId,
      departmentId: data.departmentId,
      code: data.code,
    },
    select: { id: true },
  });
  if (duplicate) throw new ArchiveStatusError('Mã trạng thái đã tồn tại trong phạm vi này', 409);

  const created = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.archiveStatusDefinition.updateMany({
        where: {
          orgId: input.orgId,
          departmentId: data.departmentId,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }
    return tx.archiveStatusDefinition.create({
      data: {
        orgId: input.orgId,
        createdByUserId: input.userId,
        departmentId: data.departmentId,
        code: data.code,
        name: data.name,
        description: data.description,
        behaviorGroup: data.behaviorGroup,
        colorToken: data.colorToken,
        icon: data.icon,
        displayOrder: data.displayOrder,
        isDefault: data.isDefault,
        showOnKanban: data.showOnKanban,
        showCountOnOverview: data.showCountOnOverview,
        countsAsWorkload: data.countsAsWorkload,
        allowMessageAppend: data.allowMessageAppend,
        autoSyncReplies: data.autoSyncReplies,
        requireNote: data.requireNote,
        requireResult: data.requireResult,
        isSystem: false,
        isActive: data.isActive,
      },
    });
  });

  await configureStatusTransitions(
    input.orgId,
    created.id,
    input.data.transitionToIds,
    true,
  );
  return getArchiveStatusDefinition(input.orgId, created.id);
}

export async function updateArchiveStatusDefinition(input: {
  orgId: string;
  statusId: string;
  data: ArchiveStatusInput;
}) {
  const existing = await prisma.archiveStatusDefinition.findFirst({
    where: { id: input.statusId, orgId: input.orgId },
    include: { _count: { select: { stories: true } } },
  });
  if (!existing) throw new ArchiveStatusError('Không tìm thấy trạng thái', 404);
  if (input.data.code && input.data.code !== existing.code) {
    throw new ArchiveStatusError('Mã trạng thái không được thay đổi sau khi tạo');
  }
  const behaviorGroup = input.data.behaviorGroup || existing.behaviorGroup as ArchiveStatusBehavior;
  if (!ARCHIVE_STATUS_BEHAVIORS.includes(behaviorGroup)) {
    throw new ArchiveStatusError('Nhóm hành vi không hợp lệ');
  }
  if (
    behaviorGroup !== existing.behaviorGroup
    && existing._count.stories > 0
    && !input.data.confirmBehaviorChange
  ) {
    throw new ArchiveStatusError(
      'Trạng thái đã có hồ sơ sử dụng. Cần xác nhận tác động trước khi đổi nhóm hành vi.',
      409,
    );
  }
  const colorToken = normalizeColor(input.data.colorToken || existing.colorToken);
  const updateData = {
    name: cleanRequired(input.data.name ?? existing.name, 'Tên trạng thái'),
    description: cleanOptional(input.data.description === undefined ? existing.description : input.data.description),
    behaviorGroup,
    colorToken,
    icon: cleanRequired(input.data.icon ?? existing.icon, 'Biểu tượng'),
    displayOrder: integerValue(input.data.displayOrder, existing.displayOrder),
    isDefault: input.data.isDefault ?? existing.isDefault,
    showOnKanban: input.data.showOnKanban ?? existing.showOnKanban,
    showCountOnOverview: input.data.showCountOnOverview ?? existing.showCountOnOverview,
    countsAsWorkload: input.data.countsAsWorkload ?? existing.countsAsWorkload,
    allowMessageAppend: input.data.allowMessageAppend ?? existing.allowMessageAppend,
    autoSyncReplies: input.data.autoSyncReplies ?? existing.autoSyncReplies,
    requireNote: input.data.requireNote ?? existing.requireNote,
    requireResult: input.data.requireResult ?? existing.requireResult,
    isActive: input.data.isActive ?? existing.isActive,
  };
  if (!updateData.isActive && updateData.isDefault) {
    throw new ArchiveStatusError('Phải chọn trạng thái mặc định khác trước khi ngừng trạng thái này');
  }

  await prisma.$transaction(async (tx) => {
    if (updateData.isDefault && !existing.isDefault) {
      await tx.archiveStatusDefinition.updateMany({
        where: {
          orgId: input.orgId,
          departmentId: existing.departmentId,
          isDefault: true,
          id: { not: existing.id },
        },
        data: { isDefault: false },
      });
    }
    await tx.archiveStatusDefinition.update({
      where: { id: existing.id },
      data: updateData,
    });
  });
  if (input.data.transitionToIds) {
    await configureStatusTransitions(input.orgId, existing.id, input.data.transitionToIds, false);
  }
  return getArchiveStatusDefinition(input.orgId, existing.id);
}

export async function deleteOrDeactivateArchiveStatus(input: {
  orgId: string;
  statusId: string;
}) {
  const status = await prisma.archiveStatusDefinition.findFirst({
    where: { id: input.statusId, orgId: input.orgId },
    include: { _count: { select: { stories: true } } },
  });
  if (!status) throw new ArchiveStatusError('Không tìm thấy trạng thái', 404);
  if (status.isDefault) {
    throw new ArchiveStatusError('Phải chọn trạng thái mặc định khác trước khi xoá hoặc ngừng sử dụng');
  }
  if (status._count.stories > 0 || status.isSystem) {
    const updated = await prisma.archiveStatusDefinition.update({
      where: { id: status.id },
      data: { isActive: false, showOnKanban: false },
    });
    return { status: updated, mode: 'deactivated' as const };
  }
  await prisma.archiveStatusDefinition.delete({ where: { id: status.id } });
  return { status, mode: 'deleted' as const };
}

export async function reorderArchiveStatuses(input: {
  orgId: string;
  statusIds: string[];
}) {
  const ids = [...new Set(input.statusIds.filter(Boolean))];
  const statuses = await prisma.archiveStatusDefinition.findMany({
    where: { orgId: input.orgId, id: { in: ids } },
    select: { id: true },
  });
  if (statuses.length !== ids.length) throw new ArchiveStatusError('Danh sách trạng thái không hợp lệ');
  await prisma.$transaction(
    ids.map((id, index) => prisma.archiveStatusDefinition.update({
      where: { id },
      data: { displayOrder: (index + 1) * 10 },
    })),
  );
}

export async function getArchiveStatusDefinition(orgId: string, statusId: string) {
  return prisma.archiveStatusDefinition.findFirst({
    where: { id: statusId, orgId },
    include: {
      department: { select: { id: true, name: true } },
      transitionsFrom: {
        where: { isActive: true },
        select: { toStatusId: true, requiredPermission: true },
      },
      _count: { select: { stories: true } },
    },
  });
}

export async function allowedArchiveStatusTargets(input: {
  orgId: string;
  sourceStatusId: string;
  departmentId?: string | null;
}) {
  const source = await getArchiveStatusDefinition(input.orgId, input.sourceStatusId);
  if (!source) return [];
  const transitions = await prisma.archiveStatusTransition.findMany({
    where: {
      orgId: input.orgId,
      fromStatusId: source.id,
      isActive: true,
      toStatus: {
        isActive: true,
        OR: [
          { departmentId: null },
          ...(input.departmentId ? [{ departmentId: input.departmentId }] : []),
        ],
      },
    },
    include: { toStatus: true },
    orderBy: { toStatus: { displayOrder: 'asc' } },
  });
  return transitions.map((transition) => ({
    ...transition.toStatus,
    requiredPermission: transition.requiredPermission as Action | null,
  }));
}

export function legacyBusinessStatus(behaviorGroup: ArchiveStatusBehavior | string) {
  if (behaviorGroup === 'completed') return 'completed';
  if (behaviorGroup === 'cancelled') return 'cancelled';
  return 'pending';
}

export function isOpenArchiveBehavior(behaviorGroup?: string | null) {
  return behaviorGroup === 'active' || behaviorGroup === 'waiting';
}

export function defaultCountsAsWorkload(behaviorGroup?: string | null) {
  return isOpenArchiveBehavior(behaviorGroup);
}

export function transitionPermission(
  sourceBehavior: string,
  targetBehavior: string,
  configured?: string | null,
): Action {
  if (configured && ['access', 'create', 'edit', 'delete', 'approve', 'pay', 'view_all'].includes(configured)) {
    return configured as Action;
  }
  if (targetBehavior === 'cancelled') return 'delete';
  if (targetBehavior === 'completed' || ['completed', 'cancelled'].includes(sourceBehavior)) return 'approve';
  return 'edit';
}

function normalizeStatusInput(data: ArchiveStatusInput, requireIdentity: boolean) {
  const behaviorGroup = data.behaviorGroup;
  if (!behaviorGroup || !ARCHIVE_STATUS_BEHAVIORS.includes(behaviorGroup)) {
    throw new ArchiveStatusError('Nhóm hành vi không hợp lệ');
  }
  const code = requireIdentity ? cleanRequired(data.code, 'Mã trạng thái').toLowerCase() : '';
  if (requireIdentity && !CODE_PATTERN.test(code)) {
    throw new ArchiveStatusError('Mã trạng thái chỉ gồm chữ thường, số, dấu gạch dưới và dài 2-50 ký tự');
  }
  const open = isOpenArchiveBehavior(behaviorGroup);
  return {
    departmentId: data.departmentId || null,
    code,
    name: cleanRequired(data.name, 'Tên trạng thái'),
    description: cleanOptional(data.description),
    behaviorGroup,
    colorToken: normalizeColor(data.colorToken || defaultColor(behaviorGroup)),
    icon: cleanRequired(data.icon || defaultIcon(behaviorGroup), 'Biểu tượng'),
    displayOrder: integerValue(data.displayOrder, 100),
    isDefault: Boolean(data.isDefault),
    showOnKanban: data.showOnKanban ?? true,
    showCountOnOverview: data.showCountOnOverview ?? ['active', 'waiting'].includes(behaviorGroup),
    countsAsWorkload: data.countsAsWorkload ?? defaultCountsAsWorkload(behaviorGroup),
    allowMessageAppend: data.allowMessageAppend ?? open,
    autoSyncReplies: data.autoSyncReplies ?? open,
    requireNote: data.requireNote ?? (
      behaviorGroup === 'cancelled' || behaviorGroup === 'waiting'
    ),
    requireResult: data.requireResult ?? behaviorGroup === 'completed',
    isActive: data.isActive ?? true,
  };
}

async function configureStatusTransitions(
  orgId: string,
  sourceStatusId: string,
  requestedTargetIds: string[] | undefined,
  addReverseDefaults: boolean,
) {
  const source = await prisma.archiveStatusDefinition.findFirst({
    where: { id: sourceStatusId, orgId },
  });
  if (!source) throw new ArchiveStatusError('Không tìm thấy trạng thái', 404);
  const candidates = await prisma.archiveStatusDefinition.findMany({
    where: {
      orgId,
      isActive: true,
      OR: [
        { departmentId: null },
        ...(source.departmentId ? [{ departmentId: source.departmentId }] : []),
      ],
    },
  });
  const requested = requestedTargetIds
    ? new Set(requestedTargetIds)
    : new Set(candidates.filter((target) => (
        target.id !== source.id
        && defaultTransitionAllowed(source.behaviorGroup, target.behaviorGroup)
      )).map((target) => target.id));
  const targets = candidates.filter((target) => requested.has(target.id));
  if (targets.length !== requested.size) {
    throw new ArchiveStatusError('Có trạng thái đích không thuộc phạm vi áp dụng');
  }
  for (const target of targets) {
    if (!defaultTransitionAllowed(source.behaviorGroup, target.behaviorGroup)) {
      throw new ArchiveStatusError(`Không thể chuyển trực tiếp từ ${source.behaviorGroup} sang ${target.behaviorGroup}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.archiveStatusTransition.deleteMany({ where: { fromStatusId: source.id } });
    if (targets.length) {
      await tx.archiveStatusTransition.createMany({
        data: targets.map((target) => ({
          orgId,
          fromStatusId: source.id,
          toStatusId: target.id,
          requiredPermission: transitionPermission(source.behaviorGroup, target.behaviorGroup),
        })),
      });
    }
    if (addReverseDefaults) {
      for (const candidate of candidates) {
        if (
          candidate.id === source.id
          || !defaultTransitionAllowed(candidate.behaviorGroup, source.behaviorGroup)
        ) continue;
        await tx.archiveStatusTransition.upsert({
          where: {
            fromStatusId_toStatusId: {
              fromStatusId: candidate.id,
              toStatusId: source.id,
            },
          },
          create: {
            orgId,
            fromStatusId: candidate.id,
            toStatusId: source.id,
            requiredPermission: transitionPermission(candidate.behaviorGroup, source.behaviorGroup),
          },
          update: { isActive: true },
        });
      }
    }
  });
}

async function ensureDefaultTransitions(orgId: string, statuses: Array<{
  id: string;
  behaviorGroup: string;
}>) {
  const rows = [];
  for (const source of statuses) {
    for (const target of statuses) {
      if (
        source.id === target.id
        || !defaultTransitionAllowed(source.behaviorGroup, target.behaviorGroup)
      ) continue;
      rows.push({
        orgId,
        fromStatusId: source.id,
        toStatusId: target.id,
        requiredPermission: transitionPermission(source.behaviorGroup, target.behaviorGroup),
      });
    }
  }
  if (rows.length) {
    await prisma.archiveStatusTransition.createMany({ data: rows, skipDuplicates: true });
  }
}

function defaultTransitionAllowed(sourceBehavior: string, targetBehavior: string) {
  if (sourceBehavior === 'completed') return targetBehavior === 'active';
  if (sourceBehavior === 'cancelled') return targetBehavior === 'active';
  return ['active', 'waiting', 'completed', 'cancelled'].includes(targetBehavior);
}

async function validateDepartment(orgId: string, departmentId?: string | null) {
  if (!departmentId) return;
  const department = await prisma.department.findFirst({
    where: { id: departmentId, orgId, archivedAt: null },
    select: { id: true },
  });
  if (!department) throw new ArchiveStatusError('Phòng ban không hợp lệ');
}

function cleanRequired(value: unknown, label: string) {
  const result = String(value || '').trim();
  if (!result) throw new ArchiveStatusError(`${label} là bắt buộc`);
  return result;
}

function cleanOptional(value: unknown) {
  const result = String(value || '').trim();
  return result || null;
}

function integerValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function normalizeColor(value: string) {
  return COLOR_TOKENS.has(value) ? value : 'primary';
}

function defaultColor(behavior: ArchiveStatusBehavior) {
  return ({
    active: 'primary',
    waiting: 'warning',
    completed: 'success',
    cancelled: 'error',
  } as const)[behavior];
}

function defaultIcon(behavior: ArchiveStatusBehavior) {
  return ({
    active: 'mdi-progress-clock',
    waiting: 'mdi-alert-circle-outline',
    completed: 'mdi-check-circle-outline',
    cancelled: 'mdi-cancel',
  } as const)[behavior];
}

export class ArchiveStatusError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
  }
}
