import { createSign } from 'node:crypto';
import { basename } from 'node:path';
import { config } from '../../config/index.js';
import { sheetValue } from './archive-format.js';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export function isGoogleArchiveConfigured(): boolean {
  return Boolean(config.googleServiceAccountJson);
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const credentials = parseCredentials();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
    ].join(' '),
    aud: credentials.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(credentials.private_key, 'base64url')}`;

  const response = await fetch(credentials.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Google OAuth ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json() as { access_token: string; expires_in?: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return data.access_token;
}

export async function uploadUrlToDrive(input: {
  sourceUrl: string;
  folderId: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<{ fileId: string; driveUrl: string }> {
  const source = await fetch(input.sourceUrl, { signal: AbortSignal.timeout(60_000) });
  if (!source.ok) throw new Error(`Media download ${source.status}: ${input.sourceUrl}`);
  const bytes = await source.arrayBuffer();
  const mimeType = input.mimeType || source.headers.get('content-type') || 'application/octet-stream';
  const fileName = input.fileName || safeFileName(input.sourceUrl, mimeType);
  const boundary = `zalocrm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const metadata = JSON.stringify({ name: fileName, parents: [input.folderId] });
  const prefix = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    '',
  ].join('\r\n');
  const suffix = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(prefix), Buffer.from(bytes), Buffer.from(suffix)]);

  const response = await googleFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
      signal: AbortSignal.timeout(90_000),
    },
  );
  const data = await response.json() as { id: string; webViewLink?: string };
  return {
    fileId: data.id,
    driveUrl: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
  };
}

export async function appendSheetRows(input: {
  spreadsheetId: string;
  sheetName: string;
  rows: unknown[][];
}): Promise<number> {
  const range = `${quoteSheet(input.sheetName)}!A1`;
  const response = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ majorDimension: 'ROWS', values: input.rows.map((row) => row.map(sheetValue)) }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const data = await response.json() as { updates?: { updatedRange?: string } };
  return parseFirstRow(data.updates?.updatedRange);
}

export async function readSheetRows(input: {
  spreadsheetId: string;
  sheetName: string;
  range?: string;
}): Promise<unknown[][]> {
  const target = `${quoteSheet(input.sheetName)}!${input.range || 'A:Z'}`;
  const response = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(target)}?majorDimension=ROWS`,
    { method: 'GET', signal: AbortSignal.timeout(30_000) },
  );
  const data = await response.json() as { values?: unknown[][] };
  return Array.isArray(data.values) ? data.values : [];
}

export async function updateSheetRow(input: {
  spreadsheetId: string;
  sheetName: string;
  row: number;
  values: unknown[];
}): Promise<void> {
  const endColumn = columnName(input.values.length);
  const range = `${quoteSheet(input.sheetName)}!A${input.row}:${endColumn}${input.row}`;
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values: [input.values.map(sheetValue)] }),
      signal: AbortSignal.timeout(30_000),
    },
  );
}

export async function ensureSheetWithHeader(input: {
  spreadsheetId: string;
  sheetName: string;
  headers: string[];
}): Promise<void> {
  const metadataResponse = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}?fields=sheets.properties`,
    { signal: AbortSignal.timeout(30_000) },
  );
  const metadata = await metadataResponse.json() as {
    sheets?: Array<{ properties: { sheetId: number; title: string } }>;
  };
  let sheet = metadata.sheets?.find((item) => item.properties.title === input.sheetName);
  if (!sheet) {
    const createdResponse = await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: input.sheetName } } }] }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    const created = await createdResponse.json() as {
      replies?: Array<{ addSheet?: { properties: { sheetId: number; title: string } } }>;
    };
    const properties = created.replies?.[0]?.addSheet?.properties;
    if (!properties) throw new Error(`Unable to create Google Sheet tab ${input.sheetName}`);
    sheet = { properties };
  }

  const cellResponse = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(`${quoteSheet(input.sheetName)}!A1`)}?majorDimension=ROWS`,
    { signal: AbortSignal.timeout(30_000) },
  );
  const cell = await cellResponse.json() as { values?: unknown[][] };
  if (!cell.values?.[0]?.length) {
    await updateSheetRow({
      spreadsheetId: input.spreadsheetId,
      sheetName: input.sheetName,
      row: 1,
      values: input.headers,
    });
  }
}

export async function mergeConversationNameBlock(input: {
  spreadsheetId: string;
  sheetName: string;
  row: number;
  conversationName: string;
}): Promise<void> {
  const columnResponse = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(`${quoteSheet(input.sheetName)}!A2:A${input.row}`)}?majorDimension=COLUMNS`,
    { signal: AbortSignal.timeout(30_000) },
  );
  const column = await columnResponse.json() as { values?: string[][] };
  const values = column.values?.[0] || [];
  let startRow = input.row;
  for (let row = input.row - 1; row >= 2; row -= 1) {
    const value = values[row - 2] || '';
    if (value && value !== input.conversationName) break;
    startRow = row;
  }
  if (startRow >= input.row) return;

  const metadataResponse = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}?fields=sheets.properties`,
    { signal: AbortSignal.timeout(30_000) },
  );
  const metadata = await metadataResponse.json() as {
    sheets?: Array<{ properties: { sheetId: number; title: string } }>;
  };
  const sheetId = metadata.sheets?.find((item) => item.properties.title === input.sheetName)?.properties.sheetId;
  if (sheetId == null) return;
  const range = {
    sheetId,
    startRowIndex: startRow - 1,
    endRowIndex: input.row,
    startColumnIndex: 0,
    endColumnIndex: 1,
  };
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          { unmergeCells: { range } },
          { mergeCells: { range, mergeType: 'MERGE_ALL' } },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
}

async function googleFetch(url: string, init: RequestInit): Promise<Response> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw new Error(`Google API ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response;
}

function parseCredentials(): ServiceAccount {
  try {
    const parsed = JSON.parse(config.googleServiceAccountJson) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) throw new Error('missing client_email/private_key');
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  } catch (error) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function safeFileName(url: string, mimeType: string): string {
  try {
    const name = basename(new URL(url).pathname);
    if (name) return decodeURIComponent(name);
  } catch {
    // Use generated fallback below.
  }
  const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
  return `zalo-archive-${Date.now()}.${ext}`;
}

function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function parseFirstRow(range?: string): number {
  const match = range?.match(/![A-Z]+(\d+):/i);
  if (!match) throw new Error(`Google Sheets returned invalid updatedRange: ${range || 'empty'}`);
  return Number(match[1]);
}

function columnName(count: number): string {
  let value = count;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result || 'A';
}
