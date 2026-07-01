import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import {
  actorHasArchiveGrant,
  archiveScopeWhere,
  archiveStoryPermissions,
  canAppendArchiveStory,
  canMutateArchiveStory,
  getArchiveSaveContext,
  type ArchiveActor,
} from './archive-access.js';
import {
  appendArchiveMessages,
  ArchiveConflictError,
  archiveStoryInclude,
  archiveSummary,
  createArchiveStory,
  preflightArchiveMessages,
  updateArchiveStoryMetadata,
} from './archive-service.js';
import { syncStory } from './archive-backup-worker.js';
import { formatArchiveMessage } from './archive-format.js';
import { getZaloScope } from '../zalo/zalo-scope.js';
import { syncReplyMessageToArchive } from './archive-reply-sync-service.js';
import {
  assignArchiveStoryDirectly,
  cancelArchiveHandover,
  createArchiveHandoverRequest,
  getArchiveHandoverContext,
  HandoverError,
  listArchiveHandoverInbox,
  respondArchiveHandover,
} from './archive-handover-service.js';
import { registerArchiveStatusRoutes } from './archive-status-routes.js';
import {
  allowedArchiveStatusTargets,
  legacyBusinessStatus,
  resolveArchiveStatusByLegacy,
  transitionPermission,
} from './archive-status-service.js';
import { emitNotificationCount } from '../notifications/notification-events.js';
import { logActivity } from '../activity/activity-logger.js';

function searchTerms(input?: string): string[] {
  const raw = String(input || '').trim();
  if (!raw) return [];
  const tokens = raw
    .split(/[\s,.;:|/\\_-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  return [...new Set([raw, ...tokens])];
}

function containsSearch(field: string, term: string): Record<string, unknown> {
  return {
    [field]: {
      contains: term,
      ...(field === 'contactPhone' ? {} : { mode: 'insensitive' }),
    },
  };
}

function buildApproxSearch(fields: string[], input?: string): Record<string, unknown>[] {
  return searchTerms(input).flatMap((term) => fields.map((field) => containsSearch(field, term)));
}

function oneLineText(input?: string | null): string {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function isAppendBlockedByStatus(story: {
  businessStatus?: string | null;
  statusDefinition?: { allowMessageAppend: boolean } | null;
}) {
  return story.statusDefinition
    ? !story.statusDefinition.allowMessageAppend
    : story.businessStatus !== 'pending';
}

const ARCHIVE_TABLE_COLUMN_PREF_KEY = 'archive.tableColumnPrefs';
const ARCHIVE_TABLE_COLUMN_SYSTEM_PREF_KEY = 'archive.tableColumnPrefs.system';
const ARCHIVE_PRIORITY_OPTIONS_KEY = 'archive.priorityOptions';
const ARCHIVE_WORKLOAD_OVERDUE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ARCHIVE_PRIORITY_OPTIONS = [
  { key: 'low', label: 'Thap', color: 'info', sortOrder: 10, isDefault: false, isActive: true },
  { key: 'normal', label: 'Binh thuong', color: 'neutral', sortOrder: 20, isDefault: true, isActive: true },
  { key: 'high', label: 'Uu tien', color: 'warning', sortOrder: 30, isDefault: false, isActive: true },
  { key: 'urgent', label: 'Gap', color: 'error', sortOrder: 40, isDefault: false, isActive: true },
];
const ARCHIVE_TABLE_COLUMN_KEYS = new Set([
  'orderCode',
  'title',
  'customer',
  'receivedAt',
  'priority',
  'requiresConfirmation',
  'extraNote',
  'lastMessage',
  'department',
  'assignee',
  'status',
  'actions',
]);

function normalizeArchiveTableColumnPrefs(input: unknown) {
  const rows = Array.isArray(input) ? input : [];
  return rows
    .filter((row): row is { key: string; visible?: unknown; order?: unknown; width?: unknown; pinned?: unknown } => (
      row && typeof row === 'object' && ARCHIVE_TABLE_COLUMN_KEYS.has((row as any).key)
    ))
    .map((row, index) => ({
      key: row.key,
      visible: typeof row.visible === 'boolean' ? row.visible : true,
      order: Number.isFinite(Number(row.order)) ? Number(row.order) : index,
      ...(Number.isFinite(Number(row.width)) ? { width: Number(row.width) } : {}),
      ...(row.pinned === 'left' || row.pinned === 'right' || row.pinned === null ? { pinned: row.pinned } : {}),
    }))
    .sort((left, right) => left.order - right.order)
    .map((row, index) => ({ ...row, order: index }));
}

function parseArchiveTableColumnPrefs(input?: string | null) {
  if (!input) return [];
  try {
    return normalizeArchiveTableColumnPrefs(JSON.parse(input));
  } catch {
    return [];
  }
}

function canConfigureArchiveTableColumns(actor: ArchiveActor) {
  return ['owner', 'admin'].includes(actor.role);
}

function normalizeArchivePriorityOptions(input: unknown) {
  const rows = Array.isArray(input) ? input : [];
  const normalized = rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map((row, index) => {
      const key = String(row.key || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
      const label = String(row.label || '').trim();
      if (!key || !label) return null;
      return {
        key,
        label,
        color: typeof row.color === 'string' && row.color.trim() ? row.color.trim() : null,
        sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : (index + 1) * 10,
        isDefault: row.isDefault === true,
        isActive: row.isActive !== false,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (normalized.length === 0) return DEFAULT_ARCHIVE_PRIORITY_OPTIONS;
  const seen = new Set<string>();
  const deduped = normalized.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });
  const defaultIndex = deduped.findIndex((row) => row.isDefault && row.isActive);
  return deduped
    .map((row, index) => ({ ...row, isDefault: defaultIndex >= 0 ? index === defaultIndex : row.key === 'normal' }))
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function normalizeArchivePriorityKey(value?: string | null) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
}

async function archivePriorityRankMap(orgId: string) {
  const setting = await prisma.appSetting.findUnique({
    where: { orgId_settingKey: { orgId, settingKey: ARCHIVE_PRIORITY_OPTIONS_KEY } },
    select: { valuePlain: true },
  });
  let saved: unknown = null;
  if (setting?.valuePlain) {
    try {
      saved = JSON.parse(setting.valuePlain);
    } catch {
      saved = null;
    }
  }
  const options = normalizeArchivePriorityOptions(saved);
  const ranks = new Map(options.map((option) => [option.key, option.sortOrder]));
  const defaultRank = ranks.get('normal') ?? DEFAULT_ARCHIVE_PRIORITY_OPTIONS.find((option) => option.key === 'normal')?.sortOrder ?? 0;
  return { ranks, defaultRank };
}

async function archiveStatusRankMap(orgId: string) {
  const statuses = await prisma.archiveStatusDefinition.findMany({
    where: { orgId },
    select: { id: true, displayOrder: true, createdAt: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const ranks = new Map(statuses.map((status, index) => [
    status.id,
    Number.isFinite(Number(status.displayOrder)) ? Number(status.displayOrder) : (index + 1) * 10,
  ]));
  const legacyRanks = new Map([
    ['pending', 10],
    ['completed', 30],
    ['cancelled', 40],
  ]);
  return { ranks, legacyRanks, defaultRank: 20 };
}

function isOpenArchiveStory(story: {
  businessStatus?: string | null;
  statusDefinition?: { behaviorGroup: string; countsAsWorkload?: boolean | null } | null;
}) {
  if (story.statusDefinition) {
    return story.statusDefinition.countsAsWorkload
      ?? ['active', 'waiting'].includes(story.statusDefinition.behaviorGroup);
  }
  return !['completed', 'cancelled'].includes(String(story.businessStatus || 'pending'));
}

function isMissingInfoArchiveStory(story: {
  businessStatus?: string | null;
  statusDefinition?: { code: string; name: string } | null;
}) {
  const statusText = `${story.statusDefinition?.code || ''} ${story.statusDefinition?.name || ''} ${story.businessStatus || ''}`.toLowerCase();
  return statusText.includes('missing')
    || statusText.includes('thieu')
    || statusText.includes('thiếu')
    || statusText.includes('bo_sung')
    || statusText.includes('bổ sung');
}

function archiveWorkloadWarningLevel(row: {
  openCount: number;
  urgentCount: number;
  overdueCount: number;
}) {
  if (row.openCount > 10 || row.overdueCount >= 2 || row.urgentCount >= 3) return 'danger';
  if (row.openCount > 5 || row.overdueCount >= 1) return 'warning';
  return 'normal';
}

function archiveWorkloadScore(row: {
  openCount: number;
  urgentCount: number;
  overdueCount: number;
  missingInfoCount: number;
  needsConfirmationCount: number;
}) {
  return row.openCount
    + row.urgentCount * 3
    + row.overdueCount * 2
    + row.missingInfoCount * 1.5
    + row.needsConfirmationCount;
}

async function withArchivePermissions<T extends {
  createdByUserId: string;
  assignedUserId: string | null;
  departmentId: string | null;
}>(actor: ArchiveActor, story: T): Promise<T & { permissions: Awaited<ReturnType<typeof archiveStoryPermissions>> }> {
  return {
    ...story,
    permissions: await archiveStoryPermissions(actor, story),
  };
}

async function withArchivePermissionsList<T extends {
  createdByUserId: string;
  assignedUserId: string | null;
  departmentId: string | null;
}>(actor: ArchiveActor, stories: T[]): Promise<Array<T & { permissions: Awaited<ReturnType<typeof archiveStoryPermissions>> }>> {
  return Promise.all(stories.map((story) => withArchivePermissions(actor, story)));
}

export async function archiveRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  await registerArchiveStatusRoutes(app);

  app.get('/api/v1/archive/save-context', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'create'))) return forbidden(reply, 'archive.create');
    const { conversationId } = request.query as { conversationId?: string };
    return getArchiveSaveContext(actor, conversationId);
  });

  app.get('/api/v1/archive/table-column-prefs', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    const [pref, systemPref] = await Promise.all([
      prisma.userPreference.findUnique({
        where: { userId_key: { userId: actor.id, key: ARCHIVE_TABLE_COLUMN_PREF_KEY } },
        select: { value: true, updatedAt: true },
      }),
      prisma.appSetting.findUnique({
        where: { orgId_settingKey: { orgId: actor.orgId, settingKey: ARCHIVE_TABLE_COLUMN_SYSTEM_PREF_KEY } },
        select: { valuePlain: true, updatedAt: true },
      }),
    ]);
    const userColumns = normalizeArchiveTableColumnPrefs(pref?.value);
    const systemColumns = parseArchiveTableColumnPrefs(systemPref?.valuePlain);
    const columns = userColumns.length ? userColumns : systemColumns;
    return {
      columns,
      source: userColumns.length ? 'user' : systemColumns.length ? 'system' : 'default',
      userColumns,
      systemColumns,
      updatedAt: pref?.updatedAt || null,
      systemUpdatedAt: systemPref?.updatedAt || null,
      canApplySystem: canConfigureArchiveTableColumns(actor),
    };
  });

  app.put('/api/v1/archive/table-column-prefs', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    const body = request.body as { columns?: unknown };
    const columns = normalizeArchiveTableColumnPrefs(body.columns);
    if (columns.length === 0) return reply.status(400).send({ error: 'columns is required' });
    const pref = await prisma.userPreference.upsert({
      where: { userId_key: { userId: actor.id, key: ARCHIVE_TABLE_COLUMN_PREF_KEY } },
      create: { userId: actor.id, key: ARCHIVE_TABLE_COLUMN_PREF_KEY, value: columns as any },
      update: { value: columns as any },
    });
    return { columns, updatedAt: pref.updatedAt };
  });

  app.delete('/api/v1/archive/table-column-prefs', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    await prisma.userPreference.deleteMany({
      where: { userId: actor.id, key: ARCHIVE_TABLE_COLUMN_PREF_KEY },
    });
    const systemPref = await prisma.appSetting.findUnique({
      where: { orgId_settingKey: { orgId: actor.orgId, settingKey: ARCHIVE_TABLE_COLUMN_SYSTEM_PREF_KEY } },
      select: { valuePlain: true, updatedAt: true },
    });
    const systemColumns = parseArchiveTableColumnPrefs(systemPref?.valuePlain);
    return {
      columns: systemColumns,
      source: systemColumns.length ? 'system' : 'default',
      systemColumns,
      systemUpdatedAt: systemPref?.updatedAt || null,
      canApplySystem: canConfigureArchiveTableColumns(actor),
    };
  });

  app.put('/api/v1/archive/table-column-prefs/system', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    if (!canConfigureArchiveTableColumns(actor)) return forbidden(reply, 'archive.configure_columns');
    const body = request.body as { columns?: unknown };
    const columns = normalizeArchiveTableColumnPrefs(body.columns);
    if (columns.length === 0) return reply.status(400).send({ error: 'columns is required' });
    const setting = await prisma.appSetting.upsert({
      where: { orgId_settingKey: { orgId: actor.orgId, settingKey: ARCHIVE_TABLE_COLUMN_SYSTEM_PREF_KEY } },
      create: {
        orgId: actor.orgId,
        settingKey: ARCHIVE_TABLE_COLUMN_SYSTEM_PREF_KEY,
        valuePlain: JSON.stringify(columns),
      },
      update: { valuePlain: JSON.stringify(columns) },
    });
    return {
      columns,
      systemColumns: columns,
      systemUpdatedAt: setting.updatedAt,
    };
  });

  app.get('/api/v1/archive/priority-options', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    const setting = await prisma.appSetting.findUnique({
      where: { orgId_settingKey: { orgId: actor.orgId, settingKey: ARCHIVE_PRIORITY_OPTIONS_KEY } },
    });
    let saved: unknown = null;
    if (setting?.valuePlain) {
      try {
        saved = JSON.parse(setting.valuePlain);
      } catch {
        saved = null;
      }
    }
    return {
      options: normalizeArchivePriorityOptions(saved),
      updatedAt: setting?.updatedAt ?? null,
      canConfigure: ['owner', 'admin'].includes(actor.role),
    };
  });

  app.get('/api/v1/archive/workload-summary', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    const query = request.query as {
      departmentId?: string;
      includeUnassigned?: string;
      followCurrentFilters?: string;
      recordType?: string;
      priority?: string;
      requiresConfirmation?: string;
    };
    const scopeWhere: any = await archiveScopeWhere(actor);
    const where: any = {
      ...scopeWhere,
      AND: [
        ...(scopeWhere.AND || []),
        {
          OR: [
            { statusDefinition: { is: { countsAsWorkload: true } } },
            { statusDefinitionId: null, businessStatus: { notIn: ['completed', 'cancelled'] } },
          ],
        },
      ],
    };
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.followCurrentFilters === 'true') {
      if (query.recordType) where.recordType = query.recordType;
      if (query.priority) where.priority = query.priority;
      if (query.requiresConfirmation === 'true') {
        where.OR = [...(where.OR || []), { requiresConfirmation: true }, { requiresConfirmation: null }];
      } else if (query.requiresConfirmation === 'false') {
        where.requiresConfirmation = false;
      } else if (query.requiresConfirmation === 'unknown') {
        where.requiresConfirmation = null;
      }
    }

    const [stories, department] = await Promise.all([
      prisma.archiveStory.findMany({
        where,
        select: {
          id: true,
          assignedUserId: true,
          departmentId: true,
          priority: true,
          requiresConfirmation: true,
          businessStatus: true,
          receivedAt: true,
          createdAt: true,
          statusDefinition: {
            select: { code: true, name: true, behaviorGroup: true, countsAsWorkload: true },
          },
          assignedUser: {
            select: {
              id: true,
              fullName: true,
              departmentMember: {
                select: {
                  departmentId: true,
                  department: { select: { id: true, name: true } },
                },
              },
            },
          },
          department: { select: { id: true, name: true } },
        },
      }),
      query.departmentId
        ? prisma.department.findFirst({
            where: { id: query.departmentId, orgId: actor.orgId, archivedAt: null },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);

    const now = Date.now();
    const includeUnassigned = query.includeUnassigned !== 'false';
    const rows = new Map<string, {
      userId: string | null;
      userName: string;
      avatarUrl: string | null;
      departmentId: string | null;
      departmentName: string | null;
      openCount: number;
      urgentCount: number;
      overdueCount: number;
      missingInfoCount: number;
      needsConfirmationCount: number;
      oldestOpenAt: Date | null;
      oldestOpenAgeMinutes: number | null;
      workloadScore: number;
      warningLevel: 'normal' | 'warning' | 'danger';
    }>();

    for (const story of stories) {
      if (!isOpenArchiveStory(story)) continue;
      if (!story.assignedUserId && !includeUnassigned) continue;
      const key = story.assignedUserId || 'unassigned';
      const baseDate = story.receivedAt || story.createdAt;
      const row = rows.get(key) || {
        userId: story.assignedUserId || null,
        userName: story.assignedUser?.fullName || 'Chưa phân công',
        avatarUrl: null,
        departmentId: story.assignedUser?.departmentMember?.departmentId || story.departmentId || null,
        departmentName: story.assignedUser?.departmentMember?.department?.name || story.department?.name || null,
        openCount: 0,
        urgentCount: 0,
        overdueCount: 0,
        missingInfoCount: 0,
        needsConfirmationCount: 0,
        oldestOpenAt: null,
        oldestOpenAgeMinutes: null,
        workloadScore: 0,
        warningLevel: 'normal',
      };
      row.openCount += 1;
      if (['high', 'urgent'].includes(story.priority)) row.urgentCount += 1;
      if (baseDate && now - baseDate.getTime() > ARCHIVE_WORKLOAD_OVERDUE_MS) row.overdueCount += 1;
      if (isMissingInfoArchiveStory(story)) row.missingInfoCount += 1;
      if (story.requiresConfirmation !== false) row.needsConfirmationCount += 1;
      if (baseDate && (!row.oldestOpenAt || baseDate < row.oldestOpenAt)) {
        row.oldestOpenAt = baseDate;
      }
      rows.set(key, row);
    }

    const users = [...rows.values()].map((row) => {
      const workloadScore = archiveWorkloadScore(row);
      const warningLevel = archiveWorkloadWarningLevel(row);
      return {
        ...row,
        oldestOpenAt: row.oldestOpenAt ? row.oldestOpenAt.toISOString() : null,
        oldestOpenAgeMinutes: row.oldestOpenAt ? Math.max(0, Math.floor((now - row.oldestOpenAt.getTime()) / 60_000)) : null,
        workloadScore,
        warningLevel,
      };
    }).sort((left, right) => (
      right.workloadScore - left.workloadScore
      || right.openCount - left.openCount
      || left.userName.localeCompare(right.userName, 'vi')
    ));

    const totals = users.reduce((acc, row) => {
      acc.openCount += row.openCount;
      acc.urgentCount += row.urgentCount;
      acc.overdueCount += row.overdueCount;
      acc.missingInfoCount += row.missingInfoCount;
      acc.needsConfirmationCount += row.needsConfirmationCount;
      if (!row.userId) acc.unassignedCount += row.openCount;
      return acc;
    }, {
      openCount: 0,
      urgentCount: 0,
      overdueCount: 0,
      missingInfoCount: 0,
      needsConfirmationCount: 0,
      unassignedCount: 0,
    });

    return {
      scope: {
        departmentId: department?.id || query.departmentId || null,
        departmentName: department?.name || null,
        generatedAt: new Date(now).toISOString(),
      },
      totals,
      users,
    };
  });

  app.put('/api/v1/archive/priority-options', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!['owner', 'admin'].includes(actor.role)) return forbidden(reply, 'admin');
    const body = request.body as { options?: unknown };
    const options = normalizeArchivePriorityOptions(body.options);
    const activeDefaults = options.filter((option) => option.isActive && option.isDefault);
    if (activeDefaults.length !== 1) {
      return reply.status(400).send({ error: 'Exactly one active default priority is required' });
    }
    const previousSetting = await prisma.appSetting.findUnique({
      where: { orgId_settingKey: { orgId: actor.orgId, settingKey: ARCHIVE_PRIORITY_OPTIONS_KEY } },
      select: { valuePlain: true },
    });
    let previousOptions: unknown = null;
    if (previousSetting?.valuePlain) {
      try {
        previousOptions = JSON.parse(previousSetting.valuePlain);
      } catch {
        previousOptions = null;
      }
    }
    const setting = await prisma.appSetting.upsert({
      where: { orgId_settingKey: { orgId: actor.orgId, settingKey: ARCHIVE_PRIORITY_OPTIONS_KEY } },
      create: { orgId: actor.orgId, settingKey: ARCHIVE_PRIORITY_OPTIONS_KEY, valuePlain: JSON.stringify(options) },
      update: { valuePlain: JSON.stringify(options) },
    });
    logActivity({
      orgId: actor.orgId,
      userId: actor.id,
      category: 'system',
      action: 'archive_priority_options_update',
      entityType: 'archive_priority_options',
      entityId: actor.orgId,
      details: {
        before: normalizeArchivePriorityOptions(previousOptions),
        after: options,
      },
    });
    return { options, updatedAt: setting.updatedAt };
  });

  app.patch('/api/v1/archive/conversations/:conversationId/confirmation-default', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    const { conversationId } = request.params as { conversationId: string };
    const body = request.body as { requiresConfirmation?: boolean | null };
    if (
      body.requiresConfirmation !== true
      && body.requiresConfirmation !== false
    ) {
      return reply.status(400).send({ error: 'requiresConfirmation must be true or false' });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, orgId: actor.orgId },
      select: {
        id: true,
        requiresConfirmationDefault: true,
        zaloAccount: {
          select: {
            id: true,
            department: { select: { path: true } },
            access: {
              where: { userId: actor.id, assignmentRole: 'primary' },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    let canConfigureConversation = ['owner', 'admin'].includes(actor.role)
      || conversation.zaloAccount.access.length > 0;
    if (!canConfigureConversation) {
      const membership = await prisma.departmentMember.findUnique({
        where: { userId: actor.id },
        select: {
          deptRole: true,
          department: { select: { path: true } },
        },
      });
      canConfigureConversation = Boolean(
        membership
        && ['leader', 'deputy'].includes(membership.deptRole)
        && conversation.zaloAccount.department?.path.startsWith(membership.department.path),
      );
    }
    if (!canConfigureConversation) return forbidden(reply, 'archive.edit');

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          requiresConfirmationDefault: body.requiresConfirmation,
          requiresConfirmationUpdatedByUserId: actor.id,
          requiresConfirmationUpdatedAt: now,
        },
        select: {
          id: true,
          requiresConfirmationDefault: true,
          requiresConfirmationUpdatedAt: true,
        },
      });
      const stories = await tx.archiveStory.updateMany({
        where: { orgId: actor.orgId, conversationId: conversation.id },
        data: { requiresConfirmation: body.requiresConfirmation },
      });
      return { updated, affectedStories: stories.count };
    });
    return {
      conversationId: result.updated.id,
      requiresConfirmation: result.updated.requiresConfirmationDefault,
      updatedAt: result.updated.requiresConfirmationUpdatedAt,
      affectedStories: result.affectedStories,
    };
  });

  app.get('/api/v1/archive/conversations/:conversationId/stories', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    const { conversationId } = request.params as { conversationId: string };
    const scope = await archiveScopeWhere(actor);
    const stories = await prisma.archiveStory.findMany({
      where: { ...scope, conversationId },
      select: {
        id: true,
        title: true,
        recordType: true,
        businessStatus: true,
        statusDefinition: true,
        assignedUserId: true,
        departmentId: true,
        updatedAt: true,
        _count: { select: { messages: true } },
        assignedUser: { select: { id: true, fullName: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ businessStatus: 'asc' }, { updatedAt: 'desc' }],
      take: 100,
    });
    return { stories };
  });

  app.get('/api/v1/archive/filter-options/conversations', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    const query = request.query as {
      q?: string;
      limit?: string;
      departmentId?: string;
      zaloAccountId?: string;
    };
    const q = String(query.q || '').trim();
    if (q.length < 2) return { items: [] };

    const limit = Math.min(20, Math.max(1, Number(query.limit || 10)));
    const zaloScope = await getZaloScope(actor.id, actor.orgId, actor.role);
    const archivedConversations = await prisma.archiveStory.findMany({
      where: await archiveScopeWhere(actor),
      distinct: ['conversationId'],
      select: { conversationId: true, zaloAccountId: true },
    });
    const activeAccountIds = query.zaloAccountId
      ? zaloScope.accessibleIds.filter((id) => id === query.zaloAccountId)
      : zaloScope.accessibleIds;
    const archivedConversationIds = archivedConversations
      .filter((item) => !query.zaloAccountId || item.zaloAccountId === query.zaloAccountId)
      .map((item) => item.conversationId);
    if (activeAccountIds.length === 0 && archivedConversationIds.length === 0) {
      return { items: [] };
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        orgId: actor.orgId,
        AND: [
          {
            OR: [
              ...(activeAccountIds.length ? [{ zaloAccountId: { in: activeAccountIds } }] : []),
              ...(archivedConversationIds.length ? [{ id: { in: archivedConversationIds } }] : []),
            ],
          },
        ],
        OR: [
          { groupName: { contains: q, mode: 'insensitive' } },
          { externalThreadId: { contains: q, mode: 'insensitive' } },
          { contact: { fullName: { contains: q, mode: 'insensitive' } } },
          { contact: { phone: { contains: q } } },
          { contact: { zaloUsername: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        threadType: true,
        groupName: true,
        groupAvatarUrl: true,
        groupMembersCount: true,
        contact: {
          select: {
            fullName: true,
            phone: true,
            avatarUrl: true,
          },
        },
        zaloAccount: {
          select: {
            id: true,
            displayName: true,
            deletedAt: true,
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
    });

    return {
      items: conversations.map((conversation) => ({
        conversationId: conversation.id,
        type: conversation.threadType,
        name: conversation.threadType === 'group'
          ? conversation.groupName || 'Nhóm Zalo'
          : conversation.contact?.fullName || 'Khách Zalo',
        phone: conversation.contact?.phone || null,
        avatarUrl: conversation.threadType === 'group'
          ? conversation.groupAvatarUrl
          : conversation.contact?.avatarUrl || null,
        memberCount: conversation.groupMembersCount,
        zaloAccount: {
          id: conversation.zaloAccount.id,
          displayName: conversation.zaloAccount.displayName,
          deleted: Boolean(conversation.zaloAccount.deletedAt),
        },
      })),
    };
  });

  app.get('/api/v1/archive/messages/:sourceMessageId/stories', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    const { sourceMessageId } = request.params as { sourceMessageId: string };
    const stories = await prisma.archiveStory.findMany({
      where: {
        ...(await archiveScopeWhere(actor)),
        messages: { some: { sourceMessageId } },
      },
      select: {
        id: true,
        title: true,
        conversationName: true,
        businessStatus: true,
        statusDefinition: true,
        assignedUserId: true,
        departmentId: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      stories: stories.map((story) => ({
        ...story,
        title: story.title || story.conversationName,
      })),
    };
  });

  app.get('/api/v1/archive/messages/:archiveMessageId/origin', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    const { archiveMessageId } = request.params as { archiveMessageId: string };

    const story = await prisma.archiveStory.findFirst({
      where: {
        ...(await archiveScopeWhere(actor)),
        messages: { some: { id: archiveMessageId } },
      },
      select: {
        id: true,
        conversationId: true,
        zaloAccountDeletedAt: true,
        messages: {
          where: { id: archiveMessageId },
          take: 1,
          select: {
            id: true,
            sourceMessageId: true,
            sourceMessage: { select: { id: true, conversationId: true } },
          },
        },
      },
    });
    if (!story) {
      return reply.status(404).send({
        canOpen: false,
        reason: 'archive_message_not_found',
        message: 'Không tìm thấy tin nhắn trong hồ sơ hoặc bạn không có quyền xem hồ sơ này.',
      });
    }

    const archivedMessage = story.messages[0];
    const sourceMessageId = archivedMessage?.sourceMessage?.id || archivedMessage?.sourceMessageId;
    const conversationId = archivedMessage?.sourceMessage?.conversationId || story.conversationId;
    if (!sourceMessageId || !conversationId) {
      return reply.status(200).send({
        canOpen: false,
        reason: 'source_message_not_found',
        message: 'Tin nhắn gốc không còn tồn tại trong hệ thống.',
      });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, orgId: actor.orgId },
      select: {
        id: true,
        zaloAccount: {
          select: {
            id: true,
            deletedAt: true,
            ownerUserId: true,
          },
        },
      },
    });
    if (!conversation) {
      return reply.status(404).send({
        canOpen: false,
        reason: 'conversation_not_found',
        message: 'Không tìm thấy hội thoại gốc.',
      });
    }

    if (conversation.zaloAccount.deletedAt || story.zaloAccountDeletedAt) {
      return reply.status(200).send({
        canOpen: false,
        reason: 'zalo_account_deleted',
        message: 'Tài khoản Zalo gốc đã bị xóa, chỉ có thể xem bản lưu trong hồ sơ.',
      });
    }

    if (!['owner', 'admin'].includes(actor.role)) {
      const scope = await getZaloScope(actor.id, actor.orgId, actor.role);
      if (!scope.accessibleIds.includes(conversation.zaloAccount.id)) {
        return reply.status(403).send({
          canOpen: false,
          reason: 'conversation_access_denied',
          message: 'Bạn không có quyền xem hội thoại gốc.',
        });
      }
    }

    return {
      canOpen: true,
      conversationId: conversation.id,
      sourceMessageId,
    };
  });

  app.post('/api/v1/archive/stories/preflight', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'create'))) return forbidden(reply, 'archive.create');
    const body = request.body as {
      conversationId?: string;
      messageIds?: string[];
      targetStoryId?: string | null;
    };
    if (!body.conversationId || !Array.isArray(body.messageIds) || body.messageIds.length === 0) {
      return reply.status(400).send({ error: 'conversationId and messageIds are required' });
    }
    if (body.targetStoryId) {
      const target = await prisma.archiveStory.findFirst({
        where: {
          ...(await archiveScopeWhere(actor)),
          id: body.targetStoryId,
          conversationId: body.conversationId,
        },
        select: {
          id: true,
          createdByUserId: true,
          assignedUserId: true,
          departmentId: true,
          businessStatus: true,
          statusDefinition: true,
        },
      });
      if (!target) {
        return reply.status(404).send({ error: 'Archive story not found' });
      }
      if (isAppendBlockedByStatus(target)) {
        return reply.status(400).send({ error: 'Trạng thái hiện tại không cho phép bổ sung tin nhắn' });
      }
      if (!(await canAppendArchiveStory(actor, target))) return forbidden(reply, 'archive.create');
    }
    try {
      return await preflightArchiveMessages({
        orgId: actor.orgId,
        conversationId: body.conversationId,
        messageIds: body.messageIds,
        targetStoryId: body.targetStoryId,
      });
    } catch (error) {
      return reply.status(400).send({ error: errorMessage(error) });
    }
  });

  app.post('/api/v1/archive/stories', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'create'))) return forbidden(reply, 'archive.create');
    const body = request.body as {
      conversationId?: string;
      messageIds?: string[];
      title?: string | null;
      orderCode?: string | null;
      priority?: string | null;
      extraNote?: string | null;
      recordType?: string | null;
      departmentId?: string | null;
      assignedUserId?: string | null;
      allowCrossStoryDuplicates?: boolean;
    };
    if (!body.conversationId || !Array.isArray(body.messageIds) || body.messageIds.length === 0) {
      return reply.status(400).send({ error: 'conversationId and messageIds are required' });
    }
    try {
      const story = await createArchiveStory({
        orgId: actor.orgId,
        userId: actor.id,
        userRole: actor.role,
        conversationId: body.conversationId,
        messageIds: body.messageIds,
        title: body.title,
        orderCode: body.orderCode,
        priority: body.priority,
        extraNote: body.extraNote,
        recordType: body.recordType,
        departmentId: body.departmentId,
        assignedUserId: body.assignedUserId,
        allowCrossStoryDuplicates: body.allowCrossStoryDuplicates,
      });
      const storyWithPermissions = await withArchivePermissions(actor, story);
      emitSaved(app, actor, story, story.messages.length);
      return reply.status(201).send({
        story: storyWithPermissions,
        message: `Đã tạo hồ sơ "${story.title || archiveSummary(story)}" với ${story.messages.length} tin nhắn`,
      });
    } catch (error) {
      return sendArchiveError(reply, error);
    }
  });

  app.post('/api/v1/archive/stories/:id/messages', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'create'))) return forbidden(reply, 'archive.create');
    const { id } = request.params as { id: string };
    const body = request.body as { messageIds?: string[]; allowCrossStoryDuplicates?: boolean };
    if (!Array.isArray(body.messageIds) || body.messageIds.length === 0) {
      return reply.status(400).send({ error: 'messageIds are required' });
    }
    const target = await prisma.archiveStory.findFirst({
      where: { ...(await archiveScopeWhere(actor)), id },
      select: {
        id: true,
        createdByUserId: true,
        assignedUserId: true,
        departmentId: true,
        businessStatus: true,
        statusDefinition: true,
      },
    });
    if (!target) {
      return reply.status(404).send({ error: 'Archive story not found' });
    }
    if (isAppendBlockedByStatus(target)) {
      return reply.status(400).send({ error: 'Trạng thái hiện tại không cho phép bổ sung tin nhắn' });
    }
    if (!(await canAppendArchiveStory(actor, target))) return forbidden(reply, 'archive.create');
    try {
      const result = await appendArchiveMessages({
        orgId: actor.orgId,
        userId: actor.id,
        userRole: actor.role,
        storyId: id,
        messageIds: body.messageIds,
        allowCrossStoryDuplicates: body.allowCrossStoryDuplicates,
      });
      const storyWithPermissions = await withArchivePermissions(actor, result.story);
      emitSaved(app, actor, result.story, result.addedCount);
      return {
        ...result,
        story: storyWithPermissions,
        message: `Đã thêm ${result.addedCount} tin nhắn${result.skippedCount ? `, bỏ qua ${result.skippedCount} tin đã có` : ''}`,
      };
    } catch (error) {
      return sendArchiveError(reply, error);
    }
  });

  app.post('/api/v1/archive/stories/:id/messages/sync-reply', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const body = request.body as { messageId?: string; replyToMessageId?: string | null };
    if (!body.messageId) return reply.status(400).send({ error: 'messageId is required' });
    const result = await syncReplyMessageToArchive({
      messageId: body.messageId,
      replyToMessageId: body.replyToMessageId,
      targetStoryId: id,
      actor,
      io: (app as any).io,
    });
    if (result.status === 'forbidden') return forbidden(reply, 'archive.edit');
    if (result.status === 'ambiguous') return reply.status(409).send(result);
    return result;
  });

  app.get('/api/v1/archive/stories', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    const query = request.query as {
      page?: string;
      limit?: string;
      status?: string;
      statusDefinitionId?: string;
      behaviorGroup?: string;
      assignedUserId?: string;
      departmentId?: string;
      recordType?: string;
      customerProfileId?: string;
      conversationId?: string;
      zaloAccountId?: string;
      backupStatus?: string;
      orderCode?: string;
      priority?: string;
      requiresConfirmation?: string;
      q?: string;
      titleQ?: string;
      customerQ?: string;
      contentQ?: string;
      recallState?: string;
      handover?: string;
      receivedFrom?: string;
      receivedTo?: string;
      sortBy?: string;
      sortDir?: string;
    };
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 30)));
    const where: any = { ...(await archiveScopeWhere(actor)) };
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.recordType) where.recordType = query.recordType;
    if (query.customerProfileId) where.customerProfileId = query.customerProfileId;
    if (query.conversationId) where.conversationId = query.conversationId;
    if (query.zaloAccountId) where.zaloAccountId = query.zaloAccountId;
    if (query.backupStatus) where.backupStatus = query.backupStatus;
    const priorityFilter = normalizeArchivePriorityKey(query.priority);
    if (priorityFilter) {
      where.priority = priorityFilter;
    }
    if (query.requiresConfirmation === 'true') {
      where.OR = [...(where.OR || []), { requiresConfirmation: true }, { requiresConfirmation: null }];
    } else if (query.requiresConfirmation === 'false') {
      where.requiresConfirmation = false;
    } else if (query.requiresConfirmation === 'unknown') {
      where.requiresConfirmation = null;
    }
    const receivedAtFilter: any = {};
    if (query.receivedFrom && !Number.isNaN(Date.parse(query.receivedFrom))) {
      receivedAtFilter.gte = new Date(query.receivedFrom);
    }
    if (query.receivedTo && !Number.isNaN(Date.parse(query.receivedTo))) {
      receivedAtFilter.lte = new Date(query.receivedTo);
    }
    if (Object.keys(receivedAtFilter).length) where.receivedAt = receivedAtFilter;
    const fieldSearch: any[] = [];
    if (query.titleQ) {
      const search = buildApproxSearch(['title', 'orderCode', 'extraNote'], query.titleQ);
      if (search.length) fieldSearch.push({ OR: search });
    }
    if (query.customerQ) {
      const search = buildApproxSearch(['customerNameSnapshot', 'conversationName', 'contactPhone'], query.customerQ);
      if (search.length) fieldSearch.push({ OR: search });
    }
    if (query.contentQ) {
      const search = buildApproxSearch(['conversationContent'], query.contentQ);
      if (search.length) fieldSearch.push({ OR: search });
    }
    if (query.recallState === 'recalled') {
      fieldSearch.push({ messages: { some: { recalledAt: { not: null } } } });
    } else if (query.recallState === 'not_recalled') {
      fieldSearch.push({ messages: { none: { recalledAt: { not: null } } } });
    }
    if (fieldSearch.length) where.AND = [...(where.AND || []), ...fieldSearch];
    if (query.q) {
      const search = buildApproxSearch(['title', 'orderCode', 'customerNameSnapshot', 'conversationName', 'contactPhone', 'conversationContent', 'extraNote'], query.q);
      if (search.length) where.AND = [...(where.AND || []), { OR: search }];
    }

    const countWhere = {
      ...where,
      ...(where.AND ? { AND: [...where.AND] } : {}),
    };
    const handoverCountWhere = {
      ...countWhere,
      ...(countWhere.AND ? { AND: [...countWhere.AND] } : {}),
    };
    if (query.assignedUserId && query.handover !== 'inbox') {
      const assignedFilter = ['__unassigned__', 'unassigned'].includes(query.assignedUserId)
        ? null
        : query.assignedUserId;
      where.assignedUserId = assignedFilter;
      countWhere.assignedUserId = assignedFilter;
    }
    const handoverInboxWhere = {
      transferRequests: { some: { toUserId: actor.id, status: 'pending' } },
    };
    if (query.handover === 'inbox') {
      where.AND = [...(where.AND || []), handoverInboxWhere];
    } else if (query.statusDefinitionId) {
      where.statusDefinitionId = query.statusDefinitionId;
    } else if (query.behaviorGroup && ['active', 'waiting', 'completed', 'cancelled'].includes(query.behaviorGroup)) {
      where.statusDefinition = { behaviorGroup: query.behaviorGroup };
    } else if (query.status) {
      if (query.status === 'pending') {
        where.AND = [...(where.AND || []), {
          OR: [
            { statusDefinition: { is: { behaviorGroup: { in: ['active', 'waiting'] } } } },
            { statusDefinitionId: null, businessStatus: 'pending' },
          ],
        }];
      } else if (['completed', 'cancelled'].includes(query.status)) {
        where.AND = [...(where.AND || []), {
          OR: [
            { statusDefinition: { is: { behaviorGroup: query.status } } },
            { statusDefinitionId: null, businessStatus: query.status },
          ],
        }];
      }
    }

    const archiveSortBy = query.sortBy === 'status' ? 'status' : 'priority';
    const archiveSortDir = query.sortDir === 'asc' ? 'asc' : 'desc';
    const [sortRows, groupedStatusCounts, handoverInboxCount, priorityRanks, statusRanks] = await Promise.all([
      prisma.archiveStory.findMany({
        where,
        select: {
          id: true,
          priority: true,
          statusDefinitionId: true,
          businessStatus: true,
          receivedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.archiveStory.groupBy({
        by: ['statusDefinitionId', 'businessStatus'],
        where: countWhere,
        _count: { _all: true },
      }),
      prisma.archiveStory.count({
        where: {
          ...handoverCountWhere,
          AND: [...(handoverCountWhere.AND || []), handoverInboxWhere],
        },
      }),
      archivePriorityRankMap(actor.orgId),
      archiveStatusRankMap(actor.orgId),
    ]);
    const sortedIds = sortRows
      .sort((left, right) => {
        const leftRank = archiveSortBy === 'status'
          ? left.statusDefinitionId
            ? statusRanks.ranks.get(left.statusDefinitionId) ?? statusRanks.defaultRank
            : statusRanks.legacyRanks.get(String(left.businessStatus || 'pending')) ?? statusRanks.defaultRank
          : priorityRanks.ranks.get(normalizeArchivePriorityKey(left.priority)) ?? priorityRanks.defaultRank;
        const rightRank = archiveSortBy === 'status'
          ? right.statusDefinitionId
            ? statusRanks.ranks.get(right.statusDefinitionId) ?? statusRanks.defaultRank
            : statusRanks.legacyRanks.get(String(right.businessStatus || 'pending')) ?? statusRanks.defaultRank
          : priorityRanks.ranks.get(normalizeArchivePriorityKey(right.priority)) ?? priorityRanks.defaultRank;
        const rankDelta = archiveSortDir === 'asc' ? leftRank - rightRank : rightRank - leftRank;
        if (rankDelta !== 0) return rankDelta;
        const leftReceived = (left.receivedAt || left.createdAt).getTime();
        const rightReceived = (right.receivedAt || right.createdAt).getTime();
        return leftReceived - rightReceived || right.updatedAt.getTime() - left.updatedAt.getTime();
      })
      .map((row) => row.id);
    const pageIds = sortedIds.slice((page - 1) * limit, page * limit);
    const pageOrder = new Map(pageIds.map((id, index) => [id, index]));
    const stories = pageIds.length
      ? (await prisma.archiveStory.findMany({
          where: { id: { in: pageIds } },
          include: archiveStoryInclude,
        })).sort((left, right) => (pageOrder.get(left.id) ?? 0) - (pageOrder.get(right.id) ?? 0))
      : [];
    const statusCounts = Object.fromEntries(groupedStatusCounts.map((row) => [
      row.statusDefinitionId || `legacy:${row.businessStatus}`,
      row._count._all,
    ]));
    return {
      stories: await withArchivePermissionsList(actor, stories),
      total: sortedIds.length,
      page,
      limit,
      sortBy: archiveSortBy,
      sortDir: archiveSortDir,
      statusCounts,
      handoverInboxCount,
    };
  });

  app.get('/api/v1/archive/stories/:id', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    const { id } = request.params as { id: string };
    const story = await prisma.archiveStory.findFirst({
      where: { ...(await archiveScopeWhere(actor)), id },
      include: {
        ...archiveStoryInclude,
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            changedBy: { select: { id: true, fullName: true } },
            fromStatusDefinition: true,
            toStatusDefinition: true,
          },
        },
      },
    });
    if (!story) return reply.status(404).send({ error: 'Archive story not found' });
    return withArchivePermissions(actor, story);
  });

  app.get('/api/v1/archive/stories/:id/handover-context', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    const { id } = request.params as { id: string };
    try {
      return await getArchiveHandoverContext(actor, id);
    } catch (error) {
      return sendHandoverError(reply, error);
    }
  });

  app.get('/api/v1/archive/handover-requests/inbox', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'edit'))) return forbidden(reply, 'archive.edit');
    return { requests: await listArchiveHandoverInbox(actor) };
  });

  app.post('/api/v1/archive/stories/:id/handover-requests', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const body = request.body as { toUserId?: string; reason?: string };
    if (!body.toUserId) return reply.status(400).send({ error: 'Người nhận là bắt buộc' });
    try {
      const handoverRequest = await createArchiveHandoverRequest({
        actor,
        storyId: id,
        toUserId: body.toUserId,
        reason: body.reason || '',
      });
      (app as any).io?.to(`org:${actor.orgId}`).emit('archive:handover-changed', {
        storyId: id,
        requestId: handoverRequest.id,
        status: handoverRequest.status,
      });
      emitNotificationCount((app as any).io, {
        orgId: actor.orgId,
        source: 'archive',
        sourceId: id,
        type: 'archive_handover_requested',
      });
      return reply.status(201).send({
        request: handoverRequest,
        message: 'Đã gửi yêu cầu bàn giao',
      });
    } catch (error) {
      return sendHandoverError(reply, error);
    }
  });

  app.post('/api/v1/archive/handover-requests/:requestId/accept', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { requestId } = request.params as { requestId: string };
    const body = request.body as { responseNote?: string | null };
    try {
      const result = await respondArchiveHandover({
        actor,
        requestId,
        accept: true,
        responseNote: body.responseNote,
      });
      (app as any).io?.to(`org:${actor.orgId}`).emit('archive:assignment-changed', {
        storyId: result.request.storyId,
        assignedUserId: actor.id,
        requestId,
      });
      emitNotificationCount((app as any).io, {
        orgId: actor.orgId,
        source: 'archive',
        sourceId: result.request.storyId,
        type: 'archive_handover_accepted',
      });
      return {
        ...result,
        story: result.story ? await withArchivePermissions(actor, result.story) : result.story,
        message: 'Đã nhận bàn giao hồ sơ',
      };
    } catch (error) {
      return sendHandoverError(reply, error);
    }
  });

  app.post('/api/v1/archive/handover-requests/:requestId/reject', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { requestId } = request.params as { requestId: string };
    const body = request.body as { responseNote?: string | null };
    try {
      const result = await respondArchiveHandover({
        actor,
        requestId,
        accept: false,
        responseNote: body.responseNote,
      });
      (app as any).io?.to(`org:${actor.orgId}`).emit('archive:handover-changed', {
        storyId: result.request.storyId,
        requestId,
        status: 'rejected',
      });
      emitNotificationCount((app as any).io, {
        orgId: actor.orgId,
        source: 'archive',
        sourceId: result.request.storyId,
        type: 'archive_handover_rejected',
      });
      return { ...result, message: 'Đã từ chối nhận bàn giao' };
    } catch (error) {
      return sendHandoverError(reply, error);
    }
  });

  app.post('/api/v1/archive/handover-requests/:requestId/cancel', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { requestId } = request.params as { requestId: string };
    try {
      const handoverRequest = await cancelArchiveHandover({ actor, requestId });
      (app as any).io?.to(`org:${actor.orgId}`).emit('archive:handover-changed', {
        storyId: handoverRequest.storyId,
        requestId,
        status: 'cancelled',
      });
      emitNotificationCount((app as any).io, {
        orgId: actor.orgId,
        source: 'archive',
        sourceId: handoverRequest.storyId,
        type: 'archive_handover_cancelled',
      });
      return { request: handoverRequest, message: 'Đã huỷ yêu cầu bàn giao' };
    } catch (error) {
      return sendHandoverError(reply, error);
    }
  });

  app.post('/api/v1/archive/stories/:id/assign', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const body = request.body as { toUserId?: string; reason?: string };
    if (!body.toUserId) return reply.status(400).send({ error: 'Người xử lý mới là bắt buộc' });
    try {
      const story = await assignArchiveStoryDirectly({
        actor,
        storyId: id,
        toUserId: body.toUserId,
        reason: body.reason || '',
      });
      (app as any).io?.to(`org:${actor.orgId}`).emit('archive:assignment-changed', {
        storyId: story.id,
        assignedUserId: story.assignedUserId,
        changedByUserId: actor.id,
      });
      emitNotificationCount((app as any).io, {
        orgId: actor.orgId,
        source: 'archive',
        sourceId: story.id,
        type: 'archive_assignment_changed',
      });
      return { story: await withArchivePermissions(actor, story), message: 'Đã chuyển người xử lý' };
    } catch (error) {
      return sendHandoverError(reply, error);
    }
  });

  app.patch('/api/v1/archive/stories/:id', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const existing = await prisma.archiveStory.findFirst({
      where: { id, orgId: actor.orgId },
      select: { createdByUserId: true, assignedUserId: true, departmentId: true, businessStatus: true },
    });
    if (!existing || !(await canMutateArchiveStory(actor, existing, 'edit'))) {
      return reply.status(404).send({ error: 'Archive story not found' });
    }
    if (existing.businessStatus === 'completed') {
      return reply.status(409).send({ error: 'Hồ sơ đã hoàn thành, không thể cập nhật thông tin' });
    }
    try {
      const {
        title,
        orderCode,
        priority,
        extraNote,
        recordType,
        departmentId,
        assignedUserId,
      } = request.body as {
        title?: string | null;
        orderCode?: string | null;
        priority?: string | null;
        extraNote?: string | null;
        recordType?: string;
        departmentId?: string | null;
        assignedUserId?: string | null;
      };
      const story = await updateArchiveStoryMetadata({
        orgId: actor.orgId,
        userId: actor.id,
        userRole: actor.role,
        storyId: id,
        title,
        orderCode,
        priority,
        extraNote,
        recordType,
        departmentId,
        assignedUserId,
      });
      return { story: await withArchivePermissions(actor, story), message: 'Đã cập nhật hồ sơ' };
    } catch (error) {
      return reply.status(400).send({ error: errorMessage(error) });
    }
  });

  app.delete('/api/v1/archive/stories/:id/messages', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const body = request.body as { messageIds?: string[] };
    const messageIds = [...new Set((body.messageIds || []).filter(Boolean))];
    if (messageIds.length === 0) {
      return reply.status(400).send({ error: 'messageIds is required' });
    }

    const existing = await prisma.archiveStory.findFirst({
      where: { id, orgId: actor.orgId },
      select: {
        id: true,
        createdByUserId: true,
        assignedUserId: true,
        departmentId: true,
        destinationId: true,
        backupStatus: true,
        nextBackupAt: true,
      },
    });
    if (!existing || !(await canMutateArchiveStory(actor, existing, 'edit'))) {
      return reply.status(404).send({ error: 'Archive story not found' });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const [totalMessages, removableMessages] = await Promise.all([
          tx.archiveMessage.count({ where: { storyId: id } }),
          tx.archiveMessage.count({ where: { storyId: id, id: { in: messageIds } } }),
        ]);
        if (removableMessages === 0) throw new Error('Không tìm thấy tin nhắn thuộc hồ sơ');
        if (removableMessages >= totalMessages) {
          throw new Error('Hồ sơ phải giữ lại ít nhất một tin nhắn');
        }

        await tx.archiveMessage.deleteMany({
          where: { storyId: id, id: { in: messageIds } },
        });
        const remaining = await tx.archiveMessage.findMany({
          where: { storyId: id },
          orderBy: [{ sentAt: 'asc' }, { createdAt: 'asc' }],
          select: {
            sentAt: true,
            senderName: true,
            senderType: true,
            contentType: true,
            contentSnapshot: true,
            quoteSnapshot: true,
          },
        });
        const story = await tx.archiveStory.update({
          where: { id },
          data: {
            conversationContent: remaining.map((message) => formatArchiveMessage({
              sentAt: message.sentAt,
              senderName: message.senderName,
              senderType: message.senderType,
              contentType: message.contentType,
              content: message.contentSnapshot,
              quote: message.quoteSnapshot,
            })).join('\n'),
            receivedAt: remaining[0]?.sentAt || null,
            backupStatus: existing.destinationId ? 'pending' : existing.backupStatus,
            nextBackupAt: existing.destinationId ? new Date() : existing.nextBackupAt,
          },
          include: archiveStoryInclude,
        });
        return { story, removedCount: removableMessages };
      });
      const { story, removedCount } = result;
      const storyWithPermissions = await withArchivePermissions(actor, story);
      (app as any).io?.to(`org:${actor.orgId}`).emit('archive:messages-removed', {
        storyId: id,
        messageIds,
        removedByUserId: actor.id,
      });
      if (story.destinationId) void syncStory(story.id, (app as any).io);
      return {
        story: storyWithPermissions,
        removedCount,
        message: `Đã loại ${removedCount} tin nhắn khỏi hồ sơ`,
      };
    } catch (error) {
      return reply.status(400).send({ error: errorMessage(error) });
    }
  });

  app.patch('/api/v1/archive/stories/:id/status', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const body = request.body as {
      statusDefinitionId?: string;
      status?: string;
      reasonId?: string | null;
      resultContent?: string | null;
      note?: string | null;
      orderCode?: string | null;
    };
    if (!body.statusDefinitionId && !body.status) {
      return reply.status(400).send({ error: 'statusDefinitionId is required' });
    }
    const existing = await prisma.archiveStory.findFirst({
      where: { id, orgId: actor.orgId },
      include: { statusDefinition: true },
    });
    if (!existing) return reply.status(404).send({ error: 'Archive story not found' });

    const sourceStatus = existing.statusDefinition
      || await resolveArchiveStatusByLegacy(
        actor.orgId,
        existing.departmentId,
        existing.businessStatus,
      );
    if (!sourceStatus) {
      return reply.status(409).send({ error: 'Không xác định được trạng thái hiện tại của hồ sơ' });
    }
    const targetStatus = body.statusDefinitionId
      ? await prisma.archiveStatusDefinition.findFirst({
          where: {
            id: body.statusDefinitionId,
            orgId: actor.orgId,
            isActive: true,
            OR: [
              { departmentId: null },
              ...(existing.departmentId ? [{ departmentId: existing.departmentId }] : []),
            ],
          },
        })
      : await resolveArchiveStatusByLegacy(
          actor.orgId,
          existing.departmentId,
          body.status || 'pending',
        );
    if (!targetStatus) {
      return reply.status(400).send({ error: 'Trạng thái đích không hợp lệ hoặc đã ngừng sử dụng' });
    }

    let configuredPermission: string | null = null;
    if (sourceStatus.id !== targetStatus.id) {
      const allowedTargets = await allowedArchiveStatusTargets({
        orgId: actor.orgId,
        sourceStatusId: sourceStatus.id,
        departmentId: existing.departmentId,
      });
      const allowedTarget = allowedTargets.find((status) => status.id === targetStatus.id);
      if (!allowedTarget) {
        return reply.status(409).send({
          error: `Không được chuyển trực tiếp từ "${sourceStatus.name}" sang "${targetStatus.name}"`,
        });
      }
      configuredPermission = allowedTarget.requiredPermission;
    }
    const action = transitionPermission(
      sourceStatus.behaviorGroup,
      targetStatus.behaviorGroup,
      configuredPermission,
    );
    if (!(await canMutateArchiveStory(actor, existing, action))) {
      return forbidden(reply, `archive.${action}`);
    }
    const note = body.note?.trim() || '';
    const resultContent = body.resultContent?.trim() || '';
    if (targetStatus.requireNote && !note) {
      return reply.status(400).send({ error: `Trạng thái "${targetStatus.name}" yêu cầu ghi chú` });
    }
    if (targetStatus.requireResult && !resultContent) {
      return reply.status(400).send({ error: `Trạng thái "${targetStatus.name}" yêu cầu kết quả xử lý` });
    }
    const nextOrderCode = oneLineText(
      body.orderCode === undefined ? existing.orderCode : body.orderCode,
    );
    if (targetStatus.behaviorGroup === 'completed' && !nextOrderCode) {
      return reply.status(400).send({ error: 'Trạng thái hoàn thành yêu cầu nhập mã đơn hàng' });
    }
    const reasonProvided = Object.prototype.hasOwnProperty.call(body, 'reasonId');
    const reasonId = body.reasonId?.trim() || '';
    if (targetStatus.requireReason && sourceStatus.id !== targetStatus.id && !reasonId) {
      return reply.status(400).send({ error: `Trạng thái "${targetStatus.name}" yêu cầu chọn lý do` });
    }
    const selectedReason = reasonId
      ? await prisma.archiveStatusReason.findFirst({
          where: {
            id: reasonId,
            orgId: actor.orgId,
            statusDefinitionId: targetStatus.id,
            isActive: true,
          },
        })
      : null;
    if (reasonId && !selectedReason) {
      return reply.status(400).send({ error: 'Lý do không hợp lệ hoặc đã ngừng sử dụng' });
    }
    if (
      ['completed', 'cancelled'].includes(sourceStatus.behaviorGroup)
      && sourceStatus.id !== targetStatus.id
      && !note
    ) {
      return reply.status(400).send({ error: 'Mở lại hồ sơ yêu cầu ghi rõ lý do' });
    }
    const completed = targetStatus.behaviorGroup === 'completed';
    const closed = ['completed', 'cancelled'].includes(targetStatus.behaviorGroup);
    const reopening = ['completed', 'cancelled'].includes(sourceStatus.behaviorGroup)
      && ['active', 'waiting'].includes(targetStatus.behaviorGroup);
    const story = await prisma.$transaction(async (tx) => {
      if (closed) {
        await tx.archiveAssignmentTransferRequest.updateMany({
          where: { storyId: existing.id, status: 'pending' },
          data: {
            status: 'invalidated',
            respondedAt: new Date(),
            respondedByUserId: actor.id,
          },
        });
      }
      await tx.archiveStatusHistory.create({
        data: {
          storyId: existing.id,
          changedById: actor.id,
          fromStatus: sourceStatus.code,
          toStatus: targetStatus.code,
          fromStatusDefinitionId: sourceStatus.id,
          toStatusDefinitionId: targetStatus.id,
          reasonId: selectedReason?.id || null,
          reasonCodeSnapshot: selectedReason?.code || null,
          reasonNameSnapshot: selectedReason?.name || null,
          note: note || null,
          resultContent: resultContent || null,
        },
      });
      return tx.archiveStory.update({
        where: { id: existing.id },
        data: {
          statusDefinitionId: targetStatus.id,
          businessStatus: legacyBusinessStatus(targetStatus.behaviorGroup),
          orderCode: body.orderCode === undefined ? existing.orderCode : nextOrderCode,
          resultContent: reopening
            ? null
            : body.resultContent === undefined
              ? existing.resultContent
              : resultContent || null,
          completedAt: completed ? new Date() : null,
          completedByUserId: completed ? actor.id : null,
          statusReasonId: selectedReason
            ? selectedReason.id
            : sourceStatus.id === targetStatus.id && !reasonProvided
              ? existing.statusReasonId
              : null,
          statusReasonCodeSnapshot: selectedReason
            ? selectedReason.code
            : sourceStatus.id === targetStatus.id && !reasonProvided
              ? existing.statusReasonCodeSnapshot
              : null,
          statusReasonNameSnapshot: selectedReason
            ? selectedReason.name
            : sourceStatus.id === targetStatus.id && !reasonProvided
              ? existing.statusReasonNameSnapshot
              : null,
          backupStatus: existing.destinationId ? 'pending' : existing.backupStatus,
          nextBackupAt: existing.destinationId ? new Date() : existing.nextBackupAt,
        },
        include: archiveStoryInclude,
      });
    });
    (app as any).io?.to(`org:${actor.orgId}`).emit('archive:status-changed', {
      storyId: story.id,
      status: story.statusDefinition,
      businessStatus: story.businessStatus,
      resultContent: story.resultContent,
      statusReasonName: story.statusReasonNameSnapshot,
      changedByUserId: actor.id,
    });
    return { story: await withArchivePermissions(actor, story), message: 'Đã cập nhật trạng thái' };
  });

  app.post('/api/v1/archive/stories/:id/retry-backup', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const story = await prisma.archiveStory.findFirst({
      where: { id, orgId: actor.orgId },
    });
    if (!story || !(await canMutateArchiveStory(actor, story, 'edit'))) {
      return reply.status(404).send({ error: 'Archive story not found' });
    }
    if (!story.destinationId) return reply.status(400).send({ error: 'Story has no Google destination' });
    await prisma.archiveStory.update({
      where: { id },
      data: { backupStatus: 'pending', backupAttempts: 0, backupError: null, nextBackupAt: new Date() },
    });
    void syncStory(id, (app as any).io);
    return { message: 'Đã đưa yêu cầu backup vào hàng đợi' };
  });

  app.get('/api/v1/archive/reports/performance', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!(await actorHasArchiveGrant(actor, 'access'))) return forbidden(reply, 'archive.access');
    const query = request.query as {
      from?: string;
      to?: string;
      departmentId?: string;
      assignedUserId?: string;
    };
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86_400_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return reply.status(400).send({ error: 'Invalid report date range' });
    }
    const where: any = {
      ...(await archiveScopeWhere(actor)),
      createdAt: { gte: from, lte: to },
    };
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.assignedUserId) where.assignedUserId = query.assignedUserId;
    const stories = await prisma.archiveStory.findMany({
      where,
      select: {
        businessStatus: true,
        statusDefinition: {
          select: { id: true, code: true, name: true, behaviorGroup: true },
        },
        backupStatus: true,
        createdAt: true,
        completedAt: true,
        assignedUserId: true,
        departmentId: true,
        assignedUser: { select: { fullName: true } },
        department: { select: { name: true } },
        _count: { select: { messages: true } },
        messages: { select: { _count: { select: { media: true } } } },
      },
    });
    const summary = summarizePerformance(stories);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      ...summary,
    };
  });

  app.get('/api/v1/archive/destinations', async (request) => {
    const actor = request.user! as ArchiveActor;
    return {
      destinations: await prisma.archiveDestination.findMany({
        where: { orgId: actor.orgId },
        include: { zaloAccount: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
    };
  });

  app.put('/api/v1/archive/destinations/:zaloAccountId', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    if (!['owner', 'admin'].includes(actor.role)) {
      return reply.status(403).send({ error: 'Only owner/admin can configure Google Archive' });
    }
    const { zaloAccountId } = request.params as { zaloAccountId: string };
    const body = request.body as {
      spreadsheetId?: string;
      rawSheetName?: string;
      viewSheetName?: string;
      driveFolderId?: string;
      enabled?: boolean;
    };
    if (!body.spreadsheetId || !body.driveFolderId) {
      return reply.status(400).send({ error: 'spreadsheetId and driveFolderId are required' });
    }
    const account = await prisma.zaloAccount.findFirst({ where: { id: zaloAccountId, orgId: actor.orgId } });
    if (!account) return reply.status(404).send({ error: 'Zalo account not found' });
    return prisma.archiveDestination.upsert({
      where: { zaloAccountId },
      create: {
        orgId: actor.orgId,
        zaloAccountId,
        spreadsheetId: body.spreadsheetId,
        driveFolderId: body.driveFolderId,
        rawSheetName: body.rawSheetName || 'Raw_Messages',
        viewSheetName: body.viewSheetName || 'View_Messages',
        enabled: body.enabled ?? true,
      },
      update: {
        spreadsheetId: body.spreadsheetId,
        driveFolderId: body.driveFolderId,
        rawSheetName: body.rawSheetName || 'Raw_Messages',
        viewSheetName: body.viewSheetName || 'View_Messages',
        enabled: body.enabled ?? true,
      },
    });
  });

  app.get('/api/v1/archive/notifications', async (request) => {
    const actor = request.user! as ArchiveActor;
    const notifications = await prisma.archiveNotification.findMany({
      where: { orgId: actor.orgId, OR: [{ userId: actor.id }, { userId: null }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { notifications };
  });

  app.patch('/api/v1/archive/notifications/:id/read', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const notification = await prisma.archiveNotification.findFirst({
      where: { id, orgId: actor.orgId, OR: [{ userId: actor.id }, { userId: null }] },
    });
    if (!notification) return reply.status(404).send({ error: 'Notification not found' });
    return prisma.archiveNotification.update({
      where: { id },
      data: {
        readAt: notification.readAt || new Date(),
        seenAt: notification.seenAt || new Date(),
      },
    });
  });

  app.patch('/api/v1/archive/notifications/:id/acknowledge', async (request, reply) => {
    const actor = request.user! as ArchiveActor;
    const { id } = request.params as { id: string };
    const notification = await prisma.archiveNotification.findFirst({
      where: { id, orgId: actor.orgId, OR: [{ userId: actor.id }, { userId: null }] },
    });
    if (!notification) return reply.status(404).send({ error: 'Notification not found' });
    if (!notification.requiresAck && notification.type !== 'message_recalled') {
      return reply.status(400).send({ error: 'Notification does not require acknowledgement' });
    }
    return prisma.archiveNotification.update({
      where: { id },
      data: {
        requiresAck: true,
        acknowledgedAt: notification.acknowledgedAt || new Date(),
        acknowledgedByUserId: notification.acknowledgedByUserId || actor.id,
        readAt: notification.readAt || new Date(),
        seenAt: notification.seenAt || new Date(),
      },
    });
  });
}

function emitSaved(app: FastifyInstance, actor: ArchiveActor, story: any, messageCount: number) {
  (app as any).io?.to(`org:${actor.orgId}`).emit('archive:saved', {
    storyId: story.id,
    userId: actor.id,
    summary: archiveSummary(story),
    messageCount,
    backupStatus: story.backupStatus,
  });
}

function sendArchiveError(reply: FastifyReply, error: unknown) {
  if (error instanceof ArchiveConflictError) {
    return reply.status(409).send({
      error: error.message,
      code: error.code,
      crossStoryConflicts: error.conflicts,
      targetDuplicates: error.targetDuplicates,
    });
  }
  const message = errorMessage(error);
  const status = /not found|do not belong/i.test(message) ? 404 : 400;
  return reply.status(status).send({ error: message });
}

function sendHandoverError(reply: FastifyReply, error: unknown) {
  if (error instanceof HandoverError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  return reply.status(500).send({ error: errorMessage(error) });
}

function forbidden(reply: FastifyReply, permission: string) {
  return reply.status(403).send({ error: `Không có quyền ${permission}`, code: 'RBAC_FORBIDDEN' });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizePerformance(stories: any[]) {
  const totals = {
    created: stories.length,
    pending: 0,
    active: 0,
    waiting: 0,
    completed: 0,
    cancelled: 0,
    backupFailed: 0,
    messages: 0,
    media: 0,
    averageCompletionHours: 0,
  };
  let completionMs = 0;
  let completionCount = 0;
  const byUser = new Map<string, any>();
  const byDepartment = new Map<string, any>();
  const byStatus = new Map<string, { id: string; name: string; behaviorGroup: string; count: number }>();

  for (const story of stories) {
    const behaviorGroup = story.statusDefinition?.behaviorGroup
      || (story.businessStatus === 'completed'
        ? 'completed'
        : story.businessStatus === 'cancelled'
          ? 'cancelled'
          : 'active');
    if (behaviorGroup in totals) (totals as any)[behaviorGroup] += 1;
    if (behaviorGroup === 'active' || behaviorGroup === 'waiting') totals.pending += 1;
    const statusId = story.statusDefinition?.id || `legacy:${story.businessStatus}`;
    const statusRow = byStatus.get(statusId) || {
      id: statusId,
      name: story.statusDefinition?.name || story.businessStatus,
      behaviorGroup,
      count: 0,
    };
    statusRow.count += 1;
    byStatus.set(statusId, statusRow);
    if (story.backupStatus === 'failed' || story.backupStatus === 'partial') totals.backupFailed += 1;
    totals.messages += story._count.messages;
    totals.media += story.messages.reduce((sum: number, message: any) => sum + message._count.media, 0);
    if (story.completedAt) {
      completionMs += story.completedAt.getTime() - story.createdAt.getTime();
      completionCount += 1;
    }
    incrementPerformanceGroup(
      byUser,
      story.assignedUserId || 'unassigned',
      story.assignedUser?.fullName || 'Chưa phân công',
      story,
    );
    incrementPerformanceGroup(
      byDepartment,
      story.departmentId || 'unassigned',
      story.department?.name || 'Chưa có phòng ban',
      story,
    );
  }
  totals.averageCompletionHours = completionCount
    ? Math.round((completionMs / completionCount / 3_600_000) * 10) / 10
    : 0;
  return {
    totals,
    completionRate: totals.created ? Math.round((totals.completed / totals.created) * 1000) / 10 : 0,
    byStatus: [...byStatus.values()],
    byUser: [...byUser.values()],
    byDepartment: [...byDepartment.values()],
  };
}

function incrementPerformanceGroup(map: Map<string, any>, id: string, name: string, story: any) {
  const row = map.get(id) || {
    id,
    name,
    created: 0,
    pending: 0,
    active: 0,
    waiting: 0,
    completed: 0,
    cancelled: 0,
  };
  row.created += 1;
  const behaviorGroup = story.statusDefinition?.behaviorGroup
    || (story.businessStatus === 'completed'
      ? 'completed'
      : story.businessStatus === 'cancelled'
        ? 'cancelled'
        : 'active');
  if (behaviorGroup in row) row[behaviorGroup] += 1;
  if (behaviorGroup === 'active' || behaviorGroup === 'waiting') row.pending += 1;
  map.set(id, row);
}
