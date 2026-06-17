import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import path from 'node:path';
import { config } from '../../config/index.js';
import { minioClient } from '../../shared/storage/minio-client.js';

interface PublicStorageQuery {
  url?: string;
  download?: string;
  filename?: string;
}

function sameOrigin(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return left.protocol === right.protocol && left.host === right.host;
  } catch {
    return false;
  }
}

function stripBasePathname(candidate: URL, base: URL) {
  const basePathname = base.pathname.replace(/\/$/, '');
  if (!basePathname) return candidate.pathname;
  if (!candidate.pathname.startsWith(basePathname)) return candidate.pathname;
  return candidate.pathname.slice(basePathname.length) || '/';
}

function resolveObjectTarget(rawUrl: string): { bucket: string; key: string } | null {
  let candidate: URL;
  try {
    candidate = new URL(rawUrl);
  } catch {
    return null;
  }

  for (const baseUrl of [config.s3PublicUrl, config.s3Endpoint]) {
    if (!sameOrigin(candidate.toString(), baseUrl)) continue;
    const base = new URL(baseUrl);
    const relativePath = stripBasePathname(candidate, base);
    const segments = relativePath.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    const [bucket, ...keyParts] = segments;
    if (bucket !== config.s3Bucket) return null;
    return { bucket, key: keyParts.join('/') };
  }

  return null;
}

function contentDisposition(filename: string, download: boolean) {
  const mode = download ? 'attachment' : 'inline';
  const fallback = filename.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'attachment';
  return `${mode}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function sanitizeDownloadFilename(value?: string | null) {
  const cleaned = value
    ?.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || null;
}

export async function publicStorageRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/storage/object',
    async (request: FastifyRequest<{ Querystring: PublicStorageQuery }>, reply: FastifyReply) => {
      const rawUrl = request.query.url?.trim();
      if (!rawUrl) {
        return reply.status(400).send({ error: 'url is required' });
      }

      const target = resolveObjectTarget(rawUrl);
      if (!target) {
        return reply.status(400).send({ error: 'Unsupported attachment URL' });
      }

      try {
        const stat = await minioClient.statObject(target.bucket, target.key);
        const stream = await minioClient.getObject(target.bucket, target.key);
        const filename =
          sanitizeDownloadFilename(request.query.filename) || path.posix.basename(target.key) || 'attachment';
        const mimeType = stat.metaData?.['content-type'] || 'application/octet-stream';

        reply.header('Content-Type', mimeType);
        reply.header('Content-Length', String(stat.size));
        reply.header('Content-Disposition', contentDisposition(filename, request.query.download === '1'));
        reply.header('Cache-Control', 'private, max-age=3600');
        return reply.send(stream);
      } catch (error: any) {
        const code = error?.code || error?.name;
        if (code === 'NoSuchKey' || code === 'NotFound') {
          return reply.status(404).send({ error: 'Attachment not found' });
        }
        request.log.error({ error, rawUrl, target }, 'Failed to stream attachment');
        return reply.status(500).send({ error: 'Could not open attachment' });
      }
    },
  );
}
