import { beforeEach, describe, expect, it, vi } from 'vitest';

const txMock = {
  nativeZaloGroup: { upsert: vi.fn() },
  nativeZaloGroupAccount: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  conversation: { updateMany: vi.fn() },
};
const prismaMock = {
  ...txMock,
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => unknown) => callback(txMock)),
  nativeZaloMessage: { upsert: vi.fn() },
  contact: { findFirst: vi.fn() },
  nativeZaloGroupMember: { upsert: vi.fn() },
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { ensureNativeMessage, observeNativeGroup } = await import('../src/modules/zalo/shared-group-service.js');

beforeEach(() => {
  vi.clearAllMocks();
  txMock.nativeZaloGroup.upsert.mockResolvedValue({ id: 'native-group-1' });
  txMock.nativeZaloGroupAccount.findUnique
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null);
  txMock.nativeZaloGroupAccount.create.mockResolvedValue({ id: 'membership-1' });
  txMock.conversation.updateMany.mockResolvedValue({ count: 1 });
});

describe('observeNativeGroup', () => {
  it('maps a viewer-scoped groupId to the shared globalId', async () => {
    const id = await observeNativeGroup({
      orgId: 'org-1',
      zaloAccountId: 'account-quoc-huu',
      accountScopedGroupId: '4444359956750616581',
      globalId: 'K6U3LRT1O2B9N8RJVJ6EACP01I7S0000',
      name: 'Nhóm 1 - Quốc Khách',
    });

    expect(id).toBe('native-group-1');
    expect(txMock.nativeZaloGroup.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        orgId_globalId: {
          orgId: 'org-1',
          globalId: 'K6U3LRT1O2B9N8RJVJ6EACP01I7S0000',
        },
      },
    }));
    expect(txMock.nativeZaloGroupAccount.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        nativeGroupId: 'native-group-1',
        accountScopedGroupId: '4444359956750616581',
      }),
    }));
    expect(txMock.conversation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { nativeGroupId: 'native-group-1' },
    }));
  });

  it('does not create a canonical group without globalId', async () => {
    const id = await observeNativeGroup({
      orgId: 'org-1',
      zaloAccountId: 'account-1',
      accountScopedGroupId: 'group-1',
      globalId: '',
    });
    expect(id).toBeNull();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('ensureNativeMessage', () => {
  it('deduplicates a message by canonical group and Zalo msgId', async () => {
    prismaMock.nativeZaloMessage.upsert.mockResolvedValue({ id: 'native-message-1' });
    const id = await ensureNativeMessage({
      orgId: 'org-1',
      nativeGroupId: 'native-group-1',
      zaloMsgId: '987654321',
      sentAt: new Date('2026-06-20T00:00:00Z'),
    });
    expect(id).toBe('native-message-1');
    expect(prismaMock.nativeZaloMessage.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        nativeGroupId_zaloMsgId: {
          nativeGroupId: 'native-group-1',
          zaloMsgId: '987654321',
        },
      },
    }));
  });
});
