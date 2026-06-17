const STORAGE_SEGMENT = '/zalocrm-attachments/';
const STORAGE_PROXY_PATH = '/api/v1/storage/object';

interface ResolveAttachmentUrlOptions {
  download?: boolean;
  filename?: string;
}

function isProxyUrl(url: URL) {
  return url.pathname === STORAGE_PROXY_PATH;
}

function applyProxyOptions(url: URL, options: ResolveAttachmentUrlOptions) {
  if (options.download) url.searchParams.set('download', '1');
  const filename = options.filename?.trim();
  if (filename) url.searchParams.set('filename', filename);
  return url.toString();
}

export function resolveAttachmentUrl(rawUrl?: string | null, options: ResolveAttachmentUrlOptions = {}) {
  const value = rawUrl?.trim();
  if (!value) return '';

  try {
    const url = new URL(value, window.location.origin);
    if (isProxyUrl(url)) return applyProxyOptions(url, options);
    if (!url.pathname.includes(STORAGE_SEGMENT)) return url.toString();

    const proxyUrl = new URL(STORAGE_PROXY_PATH, window.location.origin);
    proxyUrl.searchParams.set('url', url.toString());
    return applyProxyOptions(proxyUrl, options);
  } catch {
    return value;
  }
}
