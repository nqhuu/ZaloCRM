import { prisma } from '../../shared/database/prisma-client.js';

type CustomerProfileContextInput = {
  orgId: string;
  customerProfileId: string;
};

function equivalentContactClauses(contact: {
  id: string;
  zaloGlobalId: string | null;
  phoneNormalized: string | null;
}) {
  return [
    { id: contact.id },
    ...(contact.zaloGlobalId ? [{ zaloGlobalId: contact.zaloGlobalId }] : []),
    ...(contact.phoneNormalized ? [{ phoneNormalized: contact.phoneNormalized }] : []),
  ];
}

export async function backfillArchiveStoriesForCustomerProfile(input: CustomerProfileContextInput) {
  const profile = await prisma.customerProfile.findFirst({
    where: { id: input.customerProfileId, orgId: input.orgId },
    select: {
      id: true,
      code: true,
      externalKey: true,
      name: true,
      zaloGroups: { select: { nativeGroupId: true } },
      zaloUsers: {
        select: {
          contact: {
            select: {
              id: true,
              zaloGlobalId: true,
              phoneNormalized: true,
            },
          },
        },
      },
    },
  });
  if (!profile) return { backfilled: 0, groups: 0, users: 0 };

  const codeSnapshot = profile.code || profile.externalKey || null;
  let groupBackfilled = 0;
  let userBackfilled = 0;

  await prisma.$transaction(async (tx) => {
    for (const link of profile.zaloGroups) {
      const result = await tx.archiveStory.updateMany({
        where: {
          orgId: input.orgId,
          customerProfileId: null,
          conversation: { is: { nativeGroupId: link.nativeGroupId } },
        },
        data: {
          customerProfileId: profile.id,
          customerProfileCodeSnapshot: codeSnapshot,
          customerProfileNameSnapshot: profile.name,
          customerContextType: 'group',
          customerContextSubjectId: link.nativeGroupId,
        },
      });
      groupBackfilled += result.count;
    }

    for (const link of profile.zaloUsers) {
      const result = await tx.archiveStory.updateMany({
        where: {
          orgId: input.orgId,
          customerProfileId: null,
          conversation: {
            is: {
              contact: {
                is: {
                  OR: equivalentContactClauses(link.contact),
                },
              },
            },
          },
        },
        data: {
          customerProfileId: profile.id,
          customerProfileCodeSnapshot: codeSnapshot,
          customerProfileNameSnapshot: profile.name,
          customerContextType: 'direct_user',
          customerContextSubjectId: link.contact.id,
        },
      });
      userBackfilled += result.count;
    }
  });

  return {
    backfilled: groupBackfilled + userBackfilled,
    groups: groupBackfilled,
    users: userBackfilled,
  };
}
