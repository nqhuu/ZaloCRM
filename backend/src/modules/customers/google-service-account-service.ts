import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { prisma } from '../../shared/database/prisma-client.js';
import { decrypt, encrypt } from '../../shared/crypto/aes-gcm.js';
import { config } from '../../config/index.js';

export const GOOGLE_SERVICE_ACCOUNT_SETTING_KEY = 'google_service_account_json';

export type GoogleServiceAccountCredential = {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  project_id?: string;
  token_uri?: string;
  type?: string;
};

export type GoogleServiceAccountStatus = {
  configured: boolean;
  source: 'crm' | 'env' | 'none';
  clientEmail: string | null;
  projectId: string | null;
  privateKeyId: string | null;
  updatedAt: Date | null;
  error?: string;
};

type LoadedCredential = {
  credentials: GoogleServiceAccountCredential;
  source: 'crm' | 'env';
};

export function parseGoogleServiceAccountInput(value: string): GoogleServiceAccountCredential {
  const raw = decodeMaybeBase64(value);
  if (!raw) throw new Error('Service account JSON is required');
  let parsed: GoogleServiceAccountCredential;
  try {
    parsed = JSON.parse(raw) as GoogleServiceAccountCredential;
  } catch (error) {
    throw new Error(`Service account JSON không hợp lệ: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Service account JSON thiếu client_email hoặc private_key');
  }
  const privateKey = String(parsed.private_key).replace(/\\n/g, '\n');
  try {
    createPrivateKey(privateKey);
  } catch {
    throw new Error('private_key trong Service Account JSON không hợp lệ');
  }
  return {
    ...parsed,
    client_email: String(parsed.client_email).trim(),
    private_key: privateKey,
    token_uri: parsed.token_uri || 'https://oauth2.googleapis.com/token',
  };
}

export async function saveGoogleServiceAccountCredential(orgId: string, value: string): Promise<GoogleServiceAccountStatus> {
  const credentials = parseGoogleServiceAccountInput(value);
  const metadata = credentialMetadata(credentials);
  await prisma.appSetting.upsert({
    where: { orgId_settingKey: { orgId, settingKey: GOOGLE_SERVICE_ACCOUNT_SETTING_KEY } },
    create: {
      orgId,
      settingKey: GOOGLE_SERVICE_ACCOUNT_SETTING_KEY,
      valuePlain: JSON.stringify(metadata),
      valueEncrypted: Buffer.from(encrypt(JSON.stringify(credentials)), 'utf8'),
    },
    update: {
      valuePlain: JSON.stringify(metadata),
      valueEncrypted: Buffer.from(encrypt(JSON.stringify(credentials)), 'utf8'),
    },
  });
  return getGoogleServiceAccountStatus(orgId);
}

export async function deleteGoogleServiceAccountCredential(orgId: string): Promise<void> {
  await prisma.appSetting.deleteMany({
    where: { orgId, settingKey: GOOGLE_SERVICE_ACCOUNT_SETTING_KEY },
  });
}

export async function getGoogleServiceAccountStatus(orgId: string): Promise<GoogleServiceAccountStatus> {
  const setting = await prisma.appSetting.findUnique({
    where: { orgId_settingKey: { orgId, settingKey: GOOGLE_SERVICE_ACCOUNT_SETTING_KEY } },
    select: { valuePlain: true, valueEncrypted: true, updatedAt: true },
  });
  if (setting?.valueEncrypted) {
    try {
      const metadata = parseMetadata(setting.valuePlain);
      return {
        configured: true,
        source: 'crm',
        clientEmail: metadata.clientEmail,
        projectId: metadata.projectId,
        privateKeyId: metadata.privateKeyId,
        updatedAt: setting.updatedAt,
      };
    } catch (error) {
      return emptyStatus('crm', setting.updatedAt, error);
    }
  }

  let envText = '';
  try {
    envText = envCredentialText();
    if (!envText) return emptyStatus('none', null);
    const credentials = parseGoogleServiceAccountInput(envText);
    const metadata = credentialMetadata(credentials);
    return {
      configured: true,
      source: 'env',
      clientEmail: metadata.clientEmail,
      projectId: metadata.projectId,
      privateKeyId: metadata.privateKeyId,
      updatedAt: null,
    };
  } catch (error) {
    return emptyStatus('env', null, error);
  }
}

export async function loadGoogleServiceAccountCredentials(orgId?: string): Promise<LoadedCredential> {
  if (orgId) {
    const setting = await prisma.appSetting.findUnique({
      where: { orgId_settingKey: { orgId, settingKey: GOOGLE_SERVICE_ACCOUNT_SETTING_KEY } },
      select: { valueEncrypted: true },
    });
    if (setting?.valueEncrypted) {
      const encrypted = Buffer.from(setting.valueEncrypted).toString('utf8');
      return {
        credentials: parseGoogleServiceAccountInput(decrypt(encrypted)),
        source: 'crm',
      };
    }
  }

  const envText = envCredentialText();
  if (!envText) {
    throw new Error('Chưa cấu hình Google Service Account. Vào Khách hàng > Đồng bộ để dán JSON credential, hoặc cấu hình GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.');
  }
  return {
    credentials: parseGoogleServiceAccountInput(envText),
    source: 'env',
  };
}

function credentialMetadata(credentials: GoogleServiceAccountCredential) {
  return {
    clientEmail: credentials.client_email || null,
    projectId: credentials.project_id || null,
    privateKeyId: credentials.private_key_id || null,
  };
}

function parseMetadata(value?: string | null): ReturnType<typeof credentialMetadata> {
  if (!value) return { clientEmail: null, projectId: null, privateKeyId: null };
  const parsed = JSON.parse(value) as Partial<ReturnType<typeof credentialMetadata>>;
  return {
    clientEmail: parsed.clientEmail || null,
    projectId: parsed.projectId || null,
    privateKeyId: parsed.privateKeyId || null,
  };
}

function emptyStatus(source: GoogleServiceAccountStatus['source'], updatedAt: Date | null, error?: unknown): GoogleServiceAccountStatus {
  return {
    configured: false,
    source,
    clientEmail: null,
    projectId: null,
    privateKeyId: null,
    updatedAt,
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
  };
}

function decodeMaybeBase64(value: string): string {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('{')) return text;
  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8').trim();
    return decoded.startsWith('{') ? decoded : text;
  } catch {
    return text;
  }
}

function envCredentialText(): string {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim()) {
    return Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.trim(), 'base64').toString('utf8').trim();
  }
  if (config.googleServiceAccountJson.trim()) return config.googleServiceAccountJson.trim();
  if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim()) {
    return readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE.trim(), 'utf8').trim();
  }
  return '';
}
