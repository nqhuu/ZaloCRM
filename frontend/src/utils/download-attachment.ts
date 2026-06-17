import { resolveAttachmentUrl } from '@/utils/attachment-url';

export function downloadAttachment(rawUrl?: string | null, fileName?: string | null) {
  const cleanFileName = fileName?.trim() || undefined;
  const url = resolveAttachmentUrl(rawUrl, { download: true, filename: cleanFileName });
  if (!url) return;

  const link = document.createElement('a');
  link.href = url;
  if (cleanFileName) link.download = cleanFileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
