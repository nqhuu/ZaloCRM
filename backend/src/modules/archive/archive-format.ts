import type { Prisma } from '@prisma/client';

export interface MediaCandidate {
  url: string;
  mediaType: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export function oneLine(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

export function sheetValue(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function formatArchiveMessage(message: {
  sentAt: Date;
  senderName: string | null;
  senderType: string;
  contentType: string;
  content: string | null;
  quote: Prisma.JsonValue | null;
}): string {
  const time = message.sentAt.toISOString().replace('T', ' ').slice(0, 19);
  const sender = oneLine(message.senderName) || (message.senderType === 'self' ? 'Sale' : 'Khách');
  const body = archiveDisplayContent(message.content, message.contentType);
  const quote = summarizeQuote(message.quote);
  return `[${time}] ${sender}: ${body}${quote ? `\n  ↳ Trả lời: ${quote}` : ''}`;
}

export function archiveDisplayContent(content: string | null | undefined, contentType: string): string {
  const raw = oneLine(content);
  if (!raw) return `[${contentType}]`;
  const parsed = parseJson(raw);
  if (!parsed) return raw;

  const text = firstReadableText(parsed);
  if (text) return text;
  if (containsUrl(parsed)) return `[${contentType === 'text' ? 'media' : contentType}]`;
  return `[${contentType}]`;
}

export function summarizeQuote(quote: Prisma.JsonValue | null): string {
  if (!quote || typeof quote !== 'object' || Array.isArray(quote)) return '';
  const value = quote as Record<string, unknown>;
  const sender = oneLine(String(value.senderName || value.fromName || value.name || ''));
  const content = oneLine(String(value.content || value.text || value.title || ''));
  const type = oneLine(String(value.contentType || value.type || ''));
  const summary = content || (type ? `[${type}]` : '');
  return [sender, summary].filter(Boolean).join(': ');
}

export function extractMediaCandidates(
  contentType: string,
  attachments: Prisma.JsonValue,
  content?: string | null,
): MediaCandidate[] {
  const found = new Map<string, MediaCandidate>();
  const mediaTypes = new Set(['image', 'video', 'voice', 'audio', 'file', 'gif', 'sticker']);

  const visit = (value: unknown, parent?: Record<string, unknown>): void => {
    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value) && looksLikeMedia(value, contentType, parent)) {
        found.set(value, {
          url: value,
          mediaType: mediaTypes.has(contentType) ? contentType : 'file',
          fileName: stringField(parent, ['fileName', 'filename', 'name', 'title']),
          mimeType: stringField(parent, ['mimeType', 'mimetype', 'contentType']),
          sizeBytes: numberField(parent, ['size', 'fileSize', 'sizeBytes']),
        });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item));
      return;
    }
    if (value && typeof value === 'object') {
      const object = value as Record<string, unknown>;
      Object.values(object).forEach((item) => visit(item, object));
    }
  };

  visit(attachments);
  const parsedContent = content ? parseJson(content.trim()) : null;
  if (parsedContent) visit(parsedContent);
  if (mediaTypes.has(contentType) && content && /^https?:\/\//i.test(content.trim())) {
    visit(content.trim());
  }
  return [...found.values()];
}

function parseJson(value: string): unknown | null {
  if (!value || (!value.startsWith('{') && !value.startsWith('['))) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function firstReadableText(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstReadableText(item);
      if (text) return text;
    }
    return '';
  }
  if (!value || typeof value !== 'object') return '';
  const object = value as Record<string, unknown>;
  for (const key of ['description', 'title', 'text', 'content', 'caption']) {
    const candidate = object[key];
    if (typeof candidate === 'string' && candidate.trim() && !/^https?:\/\//i.test(candidate.trim())) {
      return oneLine(candidate);
    }
  }
  return '';
}

function containsUrl(value: unknown): boolean {
  if (typeof value === 'string') return /^https?:\/\//i.test(value);
  if (Array.isArray(value)) return value.some(containsUrl);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some(containsUrl);
}

function looksLikeMedia(
  url: string,
  contentType: string,
  parent?: Record<string, unknown>,
): boolean {
  if (['image', 'video', 'voice', 'audio', 'file', 'gif', 'sticker'].includes(contentType)) return true;
  if (parent && Object.keys(parent).some((key) => /url|href|src|download/i.test(key))) return true;
  return /\.(jpe?g|png|webp|gif|mp4|mov|webm|mp3|m4a|aac|wav|ogg|pdf|docx?|xlsx?|zip)(\?|$)/i.test(url);
}

function stringField(parent: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!parent) return undefined;
  for (const key of keys) {
    if (typeof parent[key] === 'string' && parent[key]) return parent[key] as string;
  }
  return undefined;
}

function numberField(parent: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  if (!parent) return undefined;
  for (const key of keys) {
    const value = Number(parent[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return undefined;
}
