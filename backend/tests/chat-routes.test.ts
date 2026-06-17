/**
 * chat-routes.test.ts — Integration tests for conversation message send flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mockUser, mockPrisma, mockIO } from './test-helpers.js';

const prismaMock = mockPrisma();
const sendMessageMock = vi.fn().mockResolvedValue({ msgId: 'zalo-msg-2' });
const zaloPoolMock = {
  getInstance: vi.fn(),
};


const zaloRateLimiterMock = {
  checkLimits: vi.fn(),
  recordSend: vi.fn(),
};
const archiveAccessMock = {
  actorHasArchiveGrant: vi.fn(),
  archiveScopeWhere: vi.fn(),
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser(); },
}));
vi.mock('../src/modules/zalo/zalo-access-middleware.js', () => ({
  requireZaloAccess: () => async () => {},
}));
vi.mock('../src/modules/zalo/zalo-pool.js', () => ({ zaloPool: zaloPoolMock }));
vi.mock('../src/modules/zalo/zalo-rate-limiter.js', () => ({ zaloRateLimiter: zaloRateLimiterMock }));
vi.mock('../src/modules/archive/archive-access.js', () => archiveAccessMock);
vi.mock('../src/modules/privacy/redact.js', () => ({
  buildPrivacyContext: vi.fn().mockResolvedValue({}),
  redactMessage: vi.fn((message: unknown) => message),
}));

const { chatRoutes } = await import('../src/modules/chat/chat-routes.js');

const CONV = {
  id: 'conv-1',
  orgId: 'org-1',
  threadType: 'user',
  externalThreadId: 'ext-1',
  zaloAccountId: 'za-1',
  zaloAccount: { id: 'za-1', zaloUid: 'own-1' },
};

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('io', mockIO());
  app.register(chatRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.conversation.findFirst.mockResolvedValue(CONV);
  prismaMock.message.findFirst.mockResolvedValue({
    id: 'reply-1',
    zaloMsgId: 'zalo-reply-1',
    senderUid: 'contact-1',
    content: 'hello',
    contentType: 'text',
    sentAt: new Date('2026-04-17T10:00:00.000Z'),
  });
  prismaMock.message.create.mockResolvedValue({ id: 'msg-2', content: 'thanks' });
  prismaMock.message.findMany.mockResolvedValue([]);
  prismaMock.message.count.mockResolvedValue(0);
  prismaMock.archiveStory.findMany.mockResolvedValue([]);
  prismaMock.conversation.update.mockResolvedValue({});
  zaloPoolMock.getInstance.mockReturnValue({
    api: {
      sendMessage: sendMessageMock,
    },
  });
  zaloRateLimiterMock.checkLimits.mockResolvedValue({ allowed: true });
  zaloRateLimiterMock.recordSend.mockReturnValue(undefined);
  archiveAccessMock.actorHasArchiveGrant.mockResolvedValue(true);
  archiveAccessMock.archiveScopeWhere.mockResolvedValue({ orgId: 'org-1' });
});

describe('POST /api/v1/conversations/:id/messages', () => {
  it('sends a reply quote when replyMessageId is provided', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations/conv-1/messages',
      payload: { content: 'thanks', replyMessageId: 'reply-1' },
    });

    expect(res.statusCode).toBe(200);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'thanks',
        quote: expect.objectContaining({
          msgId: 'zalo-reply-1',
          cliMsgId: 'zalo-reply-1',
          uidFrom: 'contact-1',
          propertyExt: {},
        }),
      }),
      'ext-1',
      0,
    );
    expect(prismaMock.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quote: expect.objectContaining({ msgId: 'zalo-reply-1' }) }),
    }));
  });
});

describe('GET /api/v1/conversations/:id/messages', () => {
  it('returns archive info batched with visible stories only', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      {
        id: 'msg-1',
        zaloMsgId: 'zalo-1',
        zaloMsgIdNum: 1n,
        senderUid: 'contact-1',
        senderName: 'Quốc Hữu',
        content: 'alo',
        contentType: 'text',
        senderType: 'user',
        sentAt: new Date('2026-06-15T10:00:00.000Z'),
        isDeleted: false,
        originalContent: null,
        editedAt: null,
        deliveredAt: null,
        seenAt: null,
        quote: null,
        attachments: [],
        albumKey: null,
        albumIndex: null,
        albumTotal: null,
        reactions: [],
      },
      {
        id: 'msg-2',
        zaloMsgId: 'zalo-2',
        zaloMsgIdNum: 2n,
        senderUid: 'user-1',
        senderName: 'Quốc',
        content: 'đã lưu',
        contentType: 'text',
        senderType: 'self',
        sentAt: new Date('2026-06-15T11:00:00.000Z'),
        isDeleted: false,
        originalContent: null,
        editedAt: null,
        deliveredAt: null,
        seenAt: null,
        quote: null,
        attachments: [],
        albumKey: null,
        albumIndex: null,
        albumTotal: null,
        reactions: [],
      },
    ]);
    prismaMock.message.count.mockResolvedValue(2);
    prismaMock.archiveStory.findMany.mockResolvedValue([
      {
        id: 'story-2',
        title: 'Đơn số 2',
        conversationName: 'Quốc Hữu',
        updatedAt: new Date('2026-06-15T12:00:00.000Z'),
        businessStatus: 'pending',
        statusDefinition: { name: 'Đang xử lý', colorToken: 'primary' },
        messages: [{ sourceMessageId: 'msg-2' }],
      },
      {
        id: 'story-1',
        title: 'Đơn số 1',
        conversationName: 'Quốc Hữu',
        updatedAt: new Date('2026-06-15T11:30:00.000Z'),
        businessStatus: 'pending',
        statusDefinition: { name: 'Đang xử lý', colorToken: 'primary' },
        messages: [{ sourceMessageId: 'msg-2' }],
      },
    ]);

    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/conv-1/messages?limit=100',
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.messages).toHaveLength(2);
    expect(payload.messages[0].archiveInfo).toBeUndefined();
    expect(payload.messages[1].archiveInfo).toEqual({
      visibleCount: 2,
      stories: [
        { id: 'story-2', title: 'Đơn số 2', statusName: 'Đang xử lý', statusColorToken: 'primary' },
        { id: 'story-1', title: 'Đơn số 1', statusName: 'Đang xử lý', statusColorToken: 'primary' },
      ],
    });
  });
});
