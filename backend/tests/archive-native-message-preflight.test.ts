import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  message: { findMany: vi.fn() },
  archiveMessage: { findMany: vi.fn() },
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { preflightArchiveMessages } = await import('../src/modules/archive/archive-service.js');

const archivedStory = {
  id: 'story-a',
  title: 'Hồ sơ đã lưu',
  conversationName: 'Nhóm 1 - Quốc Khách',
  businessStatus: 'pending',
  statusDefinition: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.message.findMany.mockResolvedValue([
    { id: 'message-viewed-by-quoc-huu', nativeZaloMessageId: 'native-message-1' },
  ]);
  prismaMock.archiveMessage.findMany.mockResolvedValue([
    {
      sourceMessageId: 'message-viewed-by-quoc',
      nativeZaloMessageId: 'native-message-1',
      storyId: 'story-a',
      story: archivedStory,
    },
  ]);
});

describe('preflightArchiveMessages native identity', () => {
  it('detects the same native message saved through another Zalo account', async () => {
    const result = await preflightArchiveMessages({
      orgId: 'org-1',
      conversationId: 'conversation-quoc-huu',
      messageIds: ['message-viewed-by-quoc-huu'],
    });

    expect(result.crossStoryConflicts).toEqual([
      expect.objectContaining({
        messageId: 'message-viewed-by-quoc-huu',
        stories: [expect.objectContaining({ id: 'story-a' })],
      }),
    ]);
    expect(result.savableMessageIds).toEqual(['message-viewed-by-quoc-huu']);
  });

  it('skips the mirrored message when it is already in the target story', async () => {
    const result = await preflightArchiveMessages({
      orgId: 'org-1',
      conversationId: 'conversation-quoc-huu',
      messageIds: ['message-viewed-by-quoc-huu'],
      targetStoryId: 'story-a',
    });

    expect(result.targetDuplicates).toEqual(['message-viewed-by-quoc-huu']);
    expect(result.crossStoryConflicts).toEqual([]);
    expect(result.savableMessageIds).toEqual([]);
  });
});
