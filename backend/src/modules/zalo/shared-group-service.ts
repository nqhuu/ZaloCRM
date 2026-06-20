import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export interface NativeGroupObservation {
  orgId: string;
  zaloAccountId: string;
  accountScopedGroupId: string;
  globalId: string;
  name?: string | null;
  avatarUrl?: string | null;
  description?: string | null;
  groupType?: number | null;
}

export function groupInfoFromResponse(result: any, accountScopedGroupId: string): any | null {
  return result?.gridInfoMap?.[accountScopedGroupId]
    || result?.data?.gridInfoMap?.[accountScopedGroupId]
    || null;
}

export async function observeNativeGroup(input: NativeGroupObservation): Promise<string | null> {
  const globalId = input.globalId.trim();
  if (!globalId || !input.accountScopedGroupId) return null;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const nativeGroup = await tx.nativeZaloGroup.upsert({
      where: { orgId_globalId: { orgId: input.orgId, globalId } },
      create: {
        orgId: input.orgId,
        globalId,
        name: input.name || null,
        avatarUrl: input.avatarUrl || null,
        description: input.description || null,
        groupType: input.groupType ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.description != null ? { description: input.description } : {}),
        ...(input.groupType != null ? { groupType: input.groupType } : {}),
        lastSeenAt: now,
      },
      select: { id: true },
    });

    const scoped = await tx.nativeZaloGroupAccount.findUnique({
      where: {
        zaloAccountId_accountScopedGroupId: {
          zaloAccountId: input.zaloAccountId,
          accountScopedGroupId: input.accountScopedGroupId,
        },
      },
      select: { id: true, nativeGroupId: true },
    });
    const accountMembership = await tx.nativeZaloGroupAccount.findUnique({
      where: {
        nativeGroupId_zaloAccountId: {
          nativeGroupId: nativeGroup.id,
          zaloAccountId: input.zaloAccountId,
        },
      },
      select: { id: true },
    });

    if (scoped) {
      await tx.nativeZaloGroupAccount.update({
        where: { id: scoped.id },
        data: {
          nativeGroupId: nativeGroup.id,
          membershipStatus: 'active',
          lastConfirmedAt: now,
          leftAt: null,
        },
      });
    } else if (accountMembership) {
      await tx.nativeZaloGroupAccount.update({
        where: { id: accountMembership.id },
        data: {
          accountScopedGroupId: input.accountScopedGroupId,
          membershipStatus: 'active',
          lastConfirmedAt: now,
          leftAt: null,
        },
      });
    } else {
      await tx.nativeZaloGroupAccount.create({
        data: {
          nativeGroupId: nativeGroup.id,
          zaloAccountId: input.zaloAccountId,
          accountScopedGroupId: input.accountScopedGroupId,
          membershipStatus: 'active',
          firstSeenAt: now,
          lastConfirmedAt: now,
        },
      });
    }

    await tx.conversation.updateMany({
      where: {
        zaloAccountId: input.zaloAccountId,
        externalThreadId: input.accountScopedGroupId,
        threadType: 'group',
      },
      data: { nativeGroupId: nativeGroup.id },
    });

    return nativeGroup.id;
  });
}

export async function observeGroupInfo(params: {
  orgId: string;
  zaloAccountId: string;
  accountScopedGroupId: string;
  info: any;
}): Promise<string | null> {
  const info = params.info;
  return observeNativeGroup({
    orgId: params.orgId,
    zaloAccountId: params.zaloAccountId,
    accountScopedGroupId: params.accountScopedGroupId,
    globalId: String(info?.globalId || ''),
    name: info?.name || null,
    avatarUrl: info?.avt || info?.fullAvt || info?.avatar || null,
    description: info?.desc || null,
    groupType: typeof info?.type === 'number' ? info.type : null,
  });
}

export async function ensureNativeMessage(input: {
  orgId: string;
  nativeGroupId: string | null;
  zaloMsgId: string;
  senderGlobalId?: string | null;
  sentAt: Date;
}): Promise<string | null> {
  if (!input.nativeGroupId || !input.zaloMsgId) return null;
  const row = await prisma.nativeZaloMessage.upsert({
    where: {
      nativeGroupId_zaloMsgId: {
        nativeGroupId: input.nativeGroupId,
        zaloMsgId: input.zaloMsgId,
      },
    },
    create: {
      orgId: input.orgId,
      nativeGroupId: input.nativeGroupId,
      zaloMsgId: input.zaloMsgId,
      senderGlobalId: input.senderGlobalId || null,
      sentAt: input.sentAt,
    },
    update: {
      ...(input.senderGlobalId ? { senderGlobalId: input.senderGlobalId } : {}),
    },
    select: { id: true },
  });
  return row.id;
}

export async function backfillNativeMessagesForGroup(input: {
  orgId: string;
  nativeGroupId: string;
  batchSize?: number;
}): Promise<number> {
  const batchSize = input.batchSize || 500;
  let updated = 0;

  while (true) {
    const messages = await prisma.message.findMany({
      where: {
        nativeZaloMessageId: null,
        zaloMsgId: { not: null },
        conversation: {
          orgId: input.orgId,
          nativeGroupId: input.nativeGroupId,
        },
      },
      select: {
        id: true,
        zaloMsgId: true,
        senderUid: true,
        sentAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });
    if (messages.length === 0) break;

    for (const message of messages) {
      if (!message.zaloMsgId) continue;
      const nativeZaloMessageId = await ensureNativeMessage({
        orgId: input.orgId,
        nativeGroupId: input.nativeGroupId,
        zaloMsgId: message.zaloMsgId,
        senderGlobalId: message.senderUid,
        sentAt: message.sentAt,
      });
      if (!nativeZaloMessageId) continue;

      const result = await prisma.message.updateMany({
        where: { id: message.id, nativeZaloMessageId: null },
        data: { nativeZaloMessageId },
      });
      updated += result.count;

      try {
        await prisma.archiveMessage.updateMany({
          where: { sourceMessageId: message.id, nativeZaloMessageId: null },
          data: { nativeZaloMessageId },
        });
      } catch (error) {
        logger.warn(`[shared-group] archive native message backfill skipped message=${message.id}`, error);
      }
    }

    if (messages.length < batchSize) break;
  }

  return updated;
}

export async function syncNativeGroupMembers(input: {
  nativeGroupId: string;
  orgId: string;
  profiles: any[];
}): Promise<number> {
  let synced = 0;
  const now = new Date();
  for (const profile of input.profiles) {
    const globalId = String(profile?.globalId || '').trim();
    if (!globalId) continue;
    const contact = await prisma.contact.findFirst({
      where: { orgId: input.orgId, zaloGlobalId: globalId },
      select: { id: true },
    });
    await prisma.nativeZaloGroupMember.upsert({
      where: {
        nativeGroupId_zaloGlobalId: {
          nativeGroupId: input.nativeGroupId,
          zaloGlobalId: globalId,
        },
      },
      create: {
        nativeGroupId: input.nativeGroupId,
        contactId: contact?.id || null,
        zaloGlobalId: globalId,
        membershipStatus: 'active',
        lastConfirmedAt: now,
      },
      update: {
        ...(contact?.id ? { contactId: contact.id } : {}),
        membershipStatus: 'active',
        lastConfirmedAt: now,
        leftAt: null,
      },
    });
    synced++;
  }
  return synced;
}

export async function syncNativeGroupsForAccount(input: {
  accountId: string;
  orgId: string;
  api: any;
}): Promise<{ groups: number; members: number; messages: number; errors: number }> {
  const result = { groups: 0, members: 0, messages: 0, errors: 0 };
  const list = await input.api.getAllGroups();
  const ids = Object.keys(list?.gridVerMap || list?.gridInfoMap || {});

  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    try {
      const response = await input.api.getGroupInfo(batch);
      for (const scopedGroupId of batch) {
        const info = groupInfoFromResponse(response, scopedGroupId);
        if (!info?.globalId) {
          result.errors++;
          continue;
        }
        const nativeGroupId = await observeGroupInfo({
          orgId: input.orgId,
          zaloAccountId: input.accountId,
          accountScopedGroupId: scopedGroupId,
          info,
        });
        if (!nativeGroupId) continue;
        result.groups++;
        result.messages += await backfillNativeMessagesForGroup({
          orgId: input.orgId,
          nativeGroupId,
        });

        const memberIds = Array.isArray(info.memberIds) ? info.memberIds : [];
        if (memberIds.length > 0 && input.api.getGroupMembersInfo) {
          try {
            const memberResult = await input.api.getGroupMembersInfo(memberIds);
            result.members += await syncNativeGroupMembers({
              nativeGroupId,
              orgId: input.orgId,
              profiles: Object.values(memberResult?.profiles || {}),
            });
          } catch (error) {
            result.errors++;
            logger.warn(`[shared-group] member sync failed account=${input.accountId} group=${scopedGroupId}`, error);
          }
        }
      }
    } catch (error) {
      result.errors += batch.length;
      logger.warn(`[shared-group] group sync batch failed account=${input.accountId}`, error);
    }
  }
  return result;
}
