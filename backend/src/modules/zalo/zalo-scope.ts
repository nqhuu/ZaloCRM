/**
 * Zalo account scope helper — quyết định user được thấy nick nào.
 *
 * Quy tắc (anh chốt 2026-05-22):
 *   - role='owner' (Chủ tổ chức) → tất cả nick trong org
 *   - Trưởng phòng / Phó phòng của dept X → nick thuộc dept X + tất cả dept con
 *     (cascade theo dept tree materialized path)
 *   - Member thường → chỉ nick mà user là ownerUserId HOẶC được grant ZaloAccountAccess
 *
 * Output: array of zaloAccount IDs user được phép xem.
 * Caller dùng `where: { id: { in: ids }, orgId: ... }` để filter list.
 */
import { prisma } from '../../shared/database/prisma-client.js';

export interface ZaloScope {
  /** Account IDs user được phép xem (read scope) */
  accessibleIds: string[];
  /** True nếu user có quyền manage org-wide (bulk actions, edit any) */
  isOrgAdmin: boolean;
  /** Set của account IDs mà user là owner (owns the nick) — dùng để gate Action buttons */
  ownedIds: Set<string>;
  managedIds: Set<string>;
}

export async function getZaloScope(userId: string, orgId: string, legacyRole: string): Promise<ZaloScope> {
  const isOrgAdmin = legacyRole === 'owner' || legacyRole === 'admin';

  // Org admin → tất cả accounts
  if (isOrgAdmin) {
    const all = await prisma.zaloAccount.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, ownerUserId: true },
    });
    return {
      accessibleIds: all.map((a) => a.id),
      isOrgAdmin: true,
      ownedIds: new Set(all.filter((a) => a.ownerUserId === userId).map((a) => a.id)),
      managedIds: new Set(all.map((a) => a.id)),
    };
  }

  // Load user's dept membership
  const me = await prisma.user.findFirst({
    where: { id: userId, orgId },
    select: {
      id: true,
      departmentMember: {
        select: {
          deptRole: true,
          departmentId: true,
          department: { select: { id: true, path: true } },
        },
      },
    },
  });

  // Build set of department-account scope.
  let subtreeDeptIds: string[] = [];
  const canManageDepartmentAccounts = ['leader', 'deputy'].includes(me?.departmentMember?.deptRole || '');

  if (me?.departmentMember && (me.departmentMember.deptRole === 'leader' || me.departmentMember.deptRole === 'deputy')) {
    const myDept = me.departmentMember.department;
    // Find all descendant dept IDs via materialized path LIKE
    const subtreeDepts = await prisma.department.findMany({
      where: { orgId, path: { startsWith: myDept.path } },
      select: { id: true },
    });
    subtreeDeptIds = subtreeDepts.map((d) => d.id);

  }

  // Technical ownership grants access only to the owner themselves.
  // Department visibility is derived from the account's current department.
  const ownedAccounts = await prisma.zaloAccount.findMany({
    where: { orgId, ownerUserId: userId, deletedAt: null },
    select: { id: true, ownerUserId: true },
  });

  const departmentAccounts = subtreeDeptIds.length
    ? await prisma.zaloAccount.findMany({
        where: { orgId, departmentId: { in: subtreeDeptIds }, deletedAt: null },
        select: { id: true },
      })
    : [];

  // PLUS accounts user được grant access explicit (qua ZaloAccountAccess)
  const grantedAccess = await prisma.zaloAccountAccess.findMany({
    where: { userId, zaloAccount: { orgId, deletedAt: null } },
    select: { zaloAccountId: true },
  });

  const accessibleIds = Array.from(
    new Set([
      ...ownedAccounts.map((a) => a.id),
      ...departmentAccounts.map((a) => a.id),
      ...grantedAccess.map((g) => g.zaloAccountId),
    ]),
  );
  const ownedIds = new Set(
    ownedAccounts.filter((a) => a.ownerUserId === userId).map((a) => a.id),
  );
  const managedIds = new Set(ownedIds);
  if (canManageDepartmentAccounts) {
    for (const account of departmentAccounts) managedIds.add(account.id);
  }

  return {
    accessibleIds,
    isOrgAdmin: false,
    ownedIds,
    managedIds,
  };
}

/**
 * Quick check: user có quyền manage (edit/delete/disconnect) account này không?
 * Rule: owner-of-nick HOẶC org admin.
 */
export function canManageAccount(
  accountOwnerUserId: string | null,
  userId: string,
  legacyRole: string,
): boolean {
  if (legacyRole === 'owner' || legacyRole === 'admin') return true;
  return accountOwnerUserId === userId;
}
