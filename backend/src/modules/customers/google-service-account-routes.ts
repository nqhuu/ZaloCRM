import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import {
  deleteGoogleServiceAccountCredential,
  getGoogleServiceAccountStatus,
  saveGoogleServiceAccountCredential,
} from './google-service-account-service.js';
import { testGoogleSheetsConnection } from '../archive/google-archive-client.js';

type Actor = { id: string; orgId: string; role: string };

function currentActor(request: FastifyRequest): Actor {
  const user = request.user! as any;
  return {
    id: user.userId ?? user.id,
    orgId: user.orgId,
    role: user.role,
  };
}

function canConfigure(actor: Actor) {
  return actor.role === 'owner' || actor.role === 'admin';
}

function forbidden(reply: FastifyReply) {
  return reply.status(403).send({ error: 'Owner hoặc admin mới được cấu hình Google credential' });
}

export async function googleServiceAccountRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/google-service-account', async (request) => {
    const actor = currentActor(request);
    return { credential: await getGoogleServiceAccountStatus(actor.orgId), canConfigure: canConfigure(actor) };
  });

  app.put('/api/v1/google-service-account', async (request, reply) => {
    const actor = currentActor(request);
    if (!canConfigure(actor)) return forbidden(reply);
    const body = (request.body || {}) as { credentialJson?: string };
    if (!body.credentialJson?.trim()) {
      return reply.status(400).send({ error: 'credentialJson is required' });
    }
    try {
      const credential = await saveGoogleServiceAccountCredential(actor.orgId, body.credentialJson);
      return { credential };
    } catch (error) {
      request.log.error({ error }, 'save google service account failed');
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Không lưu được Google credential' });
    }
  });

  app.delete('/api/v1/google-service-account', async (request, reply) => {
    const actor = currentActor(request);
    if (!canConfigure(actor)) return forbidden(reply);
    await deleteGoogleServiceAccountCredential(actor.orgId);
    return { credential: await getGoogleServiceAccountStatus(actor.orgId) };
  });

  app.post('/api/v1/google-service-account/test', async (request, reply) => {
    const actor = currentActor(request);
    const body = (request.body || {}) as { spreadsheetId?: string | null };
    try {
      const result = await testGoogleSheetsConnection({
        orgId: actor.orgId,
        spreadsheetId: body.spreadsheetId?.trim() || null,
      });
      return { result };
    } catch (error) {
      request.log.error({ error }, 'test google service account failed');
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Không kiểm tra được Google credential' });
    }
  });
}
