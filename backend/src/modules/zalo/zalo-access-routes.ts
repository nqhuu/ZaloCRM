/**
 * Zalo account access control routes — manage per-user permissions on Zalo accounts.
 * Permission levels: read (view messages), chat (send messages), admin (manage account).
 * All write operations require owner/admin role.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../../shared/utils/logger.js';
import {
  cancelZaloPrimaryDelegation,
  createZaloPrimaryDelegation,
  listZaloPrimaryDelegations,
  ZaloAssignmentError,
} from './zalo-assignment-service.js';

const VALID_PERMISSIONS = ['read', 'chat', 'admin'] as const;
type Permission = (typeof VALID_PERMISSIONS)[number];
const SECONDARY_ASSIGNMENT_ROLE_RE = /^secondary_[1-9]\d*$/;

export async function zaloAccessRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/zalo-accounts/:id/access — list users with access to this account
  app.get('/api/v1/zalo-accounts/:id/access', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const account = await prisma.zaloAccount.findFirst({
      where: { id, orgId: user.orgId },
      select: {
        id: true,
        departmentId: true,
        department: { select: { id: true, name: true, path: true } },
      },
    });
    if (!account) return reply.status(404).send({ error: 'Zalo account not found' });

    const accessList = await prisma.zaloAccountAccess.findMany({
      where: { zaloAccountId: id },
      include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const delegationContext = await listZaloPrimaryDelegations(user as any, id);
    return {
      account: {
        id: account.id,
        departmentId: account.departmentId,
        department: account.department,
        canManageDepartment: await canManageBusinessAssignment(user, account),
      },
      effectivePrimary: delegationContext.effectivePrimary,
      primaryDelegations: delegationContext.delegations,
      access: accessList.map(({ user: accessUser, ...access }) => ({
        ...access,
        fullName: accessUser.fullName,
        email: accessUser.email,
        role: accessUser.role,
        user: accessUser,
      })),
    };
  });

  app.get('/api/v1/zalo-accounts/:id/primary-delegations', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    try {
      return await listZaloPrimaryDelegations(user as any, id);
    } catch (error) {
      return sendZaloAssignmentError(reply, error);
    }
  });

  app.post('/api/v1/zalo-accounts/:id/primary-delegations', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = request.body as {
      delegateUserId?: string;
      startDate?: string;
      endDate?: string;
      reason?: string | null;
    };
    if (!body.delegateUserId || !body.startDate || !body.endDate) {
      return reply.status(400).send({ error: 'delegateUserId, startDate và endDate là bắt buộc' });
    }
    try {
      const delegation = await createZaloPrimaryDelegation({
        actor: user as any,
        zaloAccountId: id,
        delegateUserId: body.delegateUserId,
        startDate: body.startDate,
        endDate: body.endDate,
        reason: body.reason,
      });
      return reply.status(201).send({ delegation, message: 'Đã tạo uỷ quyền phụ trách chính tạm thời' });
    } catch (error) {
      return sendZaloAssignmentError(reply, error);
    }
  });

  app.delete('/api/v1/zalo-accounts/:id/primary-delegations/:delegationId', async (request, reply) => {
    const user = request.user!;
    const { id, delegationId } = request.params as { id: string; delegationId: string };
    const body = request.body as { reason?: string | null };
    try {
      const delegation = await cancelZaloPrimaryDelegation({
        actor: user as any,
        zaloAccountId: id,
        delegationId,
        reason: body?.reason,
      });
      return { delegation, message: 'Đã huỷ uỷ quyền phụ trách chính tạm thời' };
    } catch (error) {
      return sendZaloAssignmentError(reply, error);
    }
  });

  app.patch(
    '/api/v1/zalo-accounts/:id/department',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const actorId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      const { departmentId } = request.body as { departmentId?: string | null };

      if (!departmentId || typeof departmentId !== 'string') {
        return reply.status(400).send({ error: 'Phòng ban hiện hành là bắt buộc' });
      }

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId, deletedAt: null },
        select: {
          id: true,
          departmentId: true,
          department: { select: { path: true } },
        },
      });
      if (!account) return reply.status(404).send({ error: 'Zalo account not found' });

      const targetDepartment = await prisma.department.findFirst({
        where: { id: departmentId, orgId: user.orgId, archivedAt: null },
        select: { id: true, name: true, path: true },
      });
      if (!targetDepartment) {
        return reply.status(400).send({ error: 'Phòng ban không tồn tại hoặc đã ngừng hoạt động' });
      }

      const isAdmin = user.role === 'owner' || user.role === 'admin';
      if (!isAdmin) {
        if (!account.departmentId) {
          return reply.status(403).send({
            error: 'Tài khoản chưa có phòng ban; chỉ admin ứng dụng được thiết lập lần đầu',
          });
        }
        const leaderPath = await getDepartmentLeaderPath(actorId);
        const canManageCurrent = Boolean(
          leaderPath && account.department?.path.startsWith(leaderPath),
        );
        const canManageTarget = Boolean(targetDepartment.path.startsWith(leaderPath || '__none__'));
        if (!canManageCurrent || !canManageTarget) {
          return reply.status(403).send({
            error: 'Trưởng phòng chỉ được chuyển tài khoản trong phạm vi phòng ban mình quản lý',
          });
        }
      }

      if (account.departmentId === targetDepartment.id) {
        return {
          ok: true,
          noop: true,
          department: targetDepartment,
        };
      }

      const incompatibleAssignments = await prisma.zaloAccountAccess.findMany({
        where: {
          zaloAccountId: account.id,
          assignmentRole: { not: null },
          user: {
            OR: [
              { departmentMember: null },
              { departmentMember: { departmentId: { not: targetDepartment.id } } },
            ],
          },
        },
        select: {
          assignmentRole: true,
          user: { select: { fullName: true } },
        },
      });
      if (incompatibleAssignments.length) {
        const names = incompatibleAssignments.map((item) => item.user.fullName).join(', ');
        return reply.status(409).send({
          error: `Cần bỏ hoặc gán lại vai trò phụ trách của ${names} trước khi đổi phòng ban`,
        });
      }

      const updated = await prisma.zaloAccount.update({
        where: { id: account.id },
        data: { departmentId: targetDepartment.id },
        select: {
          id: true,
          departmentId: true,
          department: { select: { id: true, name: true, path: true } },
        },
      });

      logger.info(
        `Zalo account department changed: account ${id} → ${targetDepartment.id} by ${user.email}`,
      );
      return { ok: true, ...updated };
    },
  );

  // POST /api/v1/zalo-accounts/:id/access — grant access { userId, permission } (owner/admin only)
  app.post(
    '/api/v1/zalo-accounts/:id/access',
    {
      preHandler: async (req: FastifyRequest, rep: FastifyReply) => {
        return requireAccessManager(req, rep);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { userId, permission = 'read', assignmentRole = null } = request.body as {
        userId: string;
        permission?: string;
        assignmentRole?: string | null;
      };

      if (!userId) return reply.status(400).send({ error: 'userId là bắt buộc' });
      if (!VALID_PERMISSIONS.includes(permission as Permission)) {
        return reply.status(400).send({ error: 'permission phải là read, chat hoặc admin' });
      }
      if (assignmentRole !== null && !isValidAssignmentRole(assignmentRole)) {
        return reply.status(400).send({ error: 'Vai trò phụ trách không hợp lệ' });
      }

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, departmentId: true, ownerUserId: true },
      });
      if (!account) return reply.status(404).send({ error: 'Zalo account not found' });

      const targetUser = await prisma.user.findFirst({
        where: { id: userId, orgId: user.orgId, isActive: true },
        include: { departmentMember: { select: { departmentId: true } } },
      });
      if (!targetUser) return reply.status(404).send({ error: 'User not found in org' });
      let departmentId = account.departmentId;
      if (assignmentRole) {
        if (!(await canManageBusinessAssignment(user, account))) {
          return reply.status(403).send({ error: 'Chỉ trưởng phòng hoặc admin được gán người phụ trách' });
        }
        departmentId ||= targetUser.departmentMember?.departmentId || null;
        if (!departmentId || targetUser.departmentMember?.departmentId !== departmentId) {
          return reply.status(400).send({ error: 'Người phụ trách phải thuộc phòng ban quản lý tài khoản Zalo' });
        }
        if (permission === 'read') {
          return reply.status(400).send({ error: 'Người phụ trách phải có quyền Chat hoặc Quản lý' });
        }
      }

      try {
        const access = await prisma.$transaction(async (tx) => {
          if (!account.departmentId && departmentId) {
            await tx.zaloAccount.update({ where: { id }, data: { departmentId } });
          }
          return tx.zaloAccountAccess.create({
            data: { id: randomUUID(), zaloAccountId: id, userId, permission, assignmentRole },
            include: { user: { select: { id: true, fullName: true, email: true } } },
          });
        });
        logger.info(`Zalo access granted: ${targetUser.email} → account ${id} (${permission}) by ${user.email}`);
        return reply.status(201).send(access);
      } catch (error) {
        // Unique constraint violation — access already exists
        return reply.status(409).send({
          error: assignmentRole
            ? 'Vị trí phụ trách đã có người hoặc user đã có quyền truy cập'
            : 'User đã có quyền truy cập tài khoản này',
        });
      }
    },
  );

  // PUT /api/v1/zalo-accounts/:id/access/:accessId — update permission (owner/admin only)
  app.put(
    '/api/v1/zalo-accounts/:id/access/:accessId',
    {
      preHandler: async (req: FastifyRequest, rep: FastifyReply) => {
        // FIX 2026-05-22 Bug B: owner của nick được cấp/sửa/xóa quyền.
        // Trước: chỉ legacy role='owner'|'admin' (org-wide) — sale không phải owner-of-nick → 403.
        return requireAccessManager(req, rep);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id, accessId } = request.params as { id: string; accessId: string };
      const body = request.body as { permission?: string; assignmentRole?: string | null };

      if (body.permission !== undefined && !VALID_PERMISSIONS.includes(body.permission as Permission)) {
        return reply.status(400).send({ error: 'permission phải là read, chat hoặc admin' });
      }
      if (
        body.assignmentRole !== undefined
        && body.assignmentRole !== null
        && !isValidAssignmentRole(body.assignmentRole)
      ) {
        return reply.status(400).send({ error: 'Vai trò phụ trách không hợp lệ' });
      }

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, departmentId: true, ownerUserId: true },
      });
      if (!account) return reply.status(404).send({ error: 'Zalo account not found' });
      const existing = await prisma.zaloAccountAccess.findFirst({
        where: { id: accessId, zaloAccountId: id },
        include: { user: { include: { departmentMember: { select: { departmentId: true } } } } },
      });
      if (!existing) return reply.status(404).send({ error: 'Access record not found' });
      if (body.assignmentRole !== undefined) {
        if (!(await canManageBusinessAssignment(user, account))) {
          return reply.status(403).send({ error: 'Chỉ trưởng phòng hoặc admin được gán người phụ trách' });
        }
        if (
          body.assignmentRole
          && (!account.departmentId || existing.user.departmentMember?.departmentId !== account.departmentId)
        ) {
          return reply.status(400).send({ error: 'Người phụ trách phải thuộc phòng ban quản lý tài khoản Zalo' });
        }
        if (body.assignmentRole && (body.permission || existing.permission) === 'read') {
          return reply.status(400).send({ error: 'Người phụ trách phải có quyền Chat hoặc Quản lý' });
        }
      }

      try {
        const access = await prisma.zaloAccountAccess.update({
          where: { id: accessId, zaloAccountId: id },
          data: {
            ...(body.permission !== undefined ? { permission: body.permission } : {}),
            ...(body.assignmentRole !== undefined ? { assignmentRole: body.assignmentRole } : {}),
            ...(body.permission !== undefined || body.assignmentRole !== undefined
              ? {
                  grantSource: null,
                  grantSourceId: null,
                  grantExpiresAt: null,
                  grantPreviousPermission: null,
                }
              : {}),
          },
          include: { user: { select: { id: true, fullName: true, email: true } } },
        });
        logger.info(`Zalo access updated: accessId ${accessId} by ${user.email}`);
        return access;
      } catch {
        return reply.status(409).send({ error: 'Vị trí phụ trách đã có người hoặc dữ liệu không hợp lệ' });
      }
    },
  );

  // DELETE /api/v1/zalo-accounts/:id/access/:accessId — revoke access (owner/admin only)
  app.delete(
    '/api/v1/zalo-accounts/:id/access/:accessId',
    {
      preHandler: async (req: FastifyRequest, rep: FastifyReply) => {
        // FIX 2026-05-22 Bug B: owner của nick được cấp/sửa/xóa quyền.
        // Trước: chỉ legacy role='owner'|'admin' (org-wide) — sale không phải owner-of-nick → 403.
        return requireAccessManager(req, rep);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id, accessId } = request.params as { id: string; accessId: string };

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, departmentId: true, ownerUserId: true },
      });
      if (!account) return reply.status(404).send({ error: 'Zalo account not found' });
      const existing = await prisma.zaloAccountAccess.findFirst({
        where: { id: accessId, zaloAccountId: id },
        select: { assignmentRole: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Access record not found' });
      if (existing.assignmentRole && !(await canManageBusinessAssignment(user, account))) {
        return reply.status(403).send({ error: 'Chỉ trưởng phòng hoặc admin được bỏ người phụ trách' });
      }

      try {
        await prisma.zaloAccountAccess.delete({ where: { id: accessId, zaloAccountId: id } });
        logger.info(`Zalo access revoked: accessId ${accessId} by ${user.email}`);
        return reply.status(204).send();
      } catch {
        return reply.status(404).send({ error: 'Access record not found' });
      }
    },
  );
}

async function requireAccessManager(req: FastifyRequest, rep: FastifyReply) {
  const user = (req as any).user;
  if (!user) return rep.status(401).send({ error: 'unauthorized' });
  if (user.role === 'owner' || user.role === 'admin') return;
  const { id } = req.params as { id: string };
  const account = await prisma.zaloAccount.findFirst({
    where: { id, orgId: user.orgId },
    select: { ownerUserId: true, departmentId: true },
  });
  if (!account) return rep.status(404).send({ error: 'Zalo account not found' });
  if (account.ownerUserId === (user.userId ?? user.id)) return;
  if (await isDepartmentLeader(user.userId ?? user.id, account.departmentId)) return;
  return rep.status(403).send({ error: 'Chỉ Owner kỹ thuật, trưởng/phó phòng hoặc admin được quản lý quyền truy cập' });
}

async function canManageBusinessAssignment(
  user: { id: string; userId?: string; role: string },
  account: { departmentId: string | null },
) {
  if (user.role === 'owner' || user.role === 'admin') return true;
  return isDepartmentLeader(user.userId ?? user.id, account.departmentId);
}

function isValidAssignmentRole(role: string) {
  return role === 'primary' || SECONDARY_ASSIGNMENT_ROLE_RE.test(role);
}

async function isDepartmentLeader(userId: string, departmentId: string | null) {
  if (!departmentId) return false;
  const membership = await prisma.departmentMember.findUnique({
    where: { userId },
    select: {
      deptRole: true,
      department: { select: { path: true } },
    },
  });
  if (!membership || !['leader', 'deputy'].includes(membership.deptRole)) return false;
  const target = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { path: true },
  });
  return Boolean(target?.path.startsWith(membership.department.path));
}

async function getDepartmentLeaderPath(userId: string) {
  const membership = await prisma.departmentMember.findUnique({
    where: { userId },
    select: {
      deptRole: true,
      department: { select: { path: true } },
    },
  });
  return membership && ['leader', 'deputy'].includes(membership.deptRole)
    ? membership.department.path
    : null;
}

function sendZaloAssignmentError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZaloAssignmentError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  throw error;
}
