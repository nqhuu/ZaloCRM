import { prisma } from '../../shared/database/prisma-client.js';
import { readSheetRows } from '../archive/google-archive-client.js';
import { createHash } from 'node:crypto';

type TriggerType = 'manual' | 'scheduled' | 'adhoc' | 'preview';
type ApplyMode = 'update_safe' | 'overwrite_from_sheet';
type ApplyScope = 'selected' | 'filtered' | 'all_valid';

export type CustomerSyncResult = {
  runId?: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  snapshotCount?: number;
  missingCount?: number;
  errors: Array<{ row: number; externalKey?: string | null; error: string }>;
};

export type CustomerSnapshotApplyResult = {
  syncRunId: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  missingCount: number;
  skippedCount: number;
  errorCount: number;
  errors: Array<{ snapshotId: string; row: number; externalKey?: string | null; error: string }>;
};

type FieldName =
  | 'externalKey'
  | 'code'
  | 'name'
  | 'shortName'
  | 'provinceOrRegion'
  | 'officeAddress'
  | 'taxCode'
  | 'mainPhone'
  | 'taxCodeOrPhone'
  | 'legalRepresentativeRaw'
  | 'activeSince'
  | 'shippingAddress'
  | 'website'
  | 'contactRaw'
  | 'managingDepartmentCode'
  | 'salesOwnerCode'
  | 'customerTypeCode'
  | 'firstTransactionDate'
  | 'phone'
  | 'email';

const FIELD_ALIASES: Record<FieldName, string[]> = {
  externalKey: ['ff', 'ma_khach_hang', 'ma_kh', 'customer_id', 'external_key', 'id'],
  code: ['ff', 'ma_khach_hang', 'ma_kh', 'customer_code', 'code'],
  name: ['ten_khach_hang', 'ten_tren_sunnet', 'ten_kh', 'customer_name', 'name'],
  shortName: ['ten_viet_tat', 'ten_vt', 'short_name', 'alias'],
  provinceOrRegion: ['dia_phuong', 'tinh_thanh', 'khu_vuc', 'province', 'region'],
  officeAddress: ['van_phong_giao_dich', 'dia_chi_van_phong', 'office_address'],
  taxCode: ['mst', 'ma_so_thue', 'tax_code'],
  mainPhone: ['dt', 'dien_thoai', 'so_dien_thoai', 'phone', 'sdt'],
  taxCodeOrPhone: ['mst_dt', 'mst_dien_thoai', 'mst_dtdd', 'mst_đt'],
  legalRepresentativeRaw: ['dai_dien_phap_luat', 'nguoi_dai_dien', 'legal_representative'],
  activeSince: ['ngay_hoat_dong', 'ngay_thanh_lap', 'active_since', 'established_date'],
  shippingAddress: ['dia_chi_giao_nhan_hang', 'dia_chi_giao_hang', 'shipping_address'],
  website: ['web', 'website', 'url'],
  contactRaw: ['nguoi_lien_he', 'lien_he', 'contact', 'contact_raw'],
  managingDepartmentCode: ['bo_phan_quan_ly', 'phong_quan_ly', 'department_code'],
  salesOwnerCode: ['nvkd_phu_trach', 'nhan_vien_kinh_doanh', 'sales_owner_code', 'sale_code'],
  customerTypeCode: ['loai_hinh', 'customer_type', 'type_code'],
  firstTransactionDate: ['ngay_giao_dich_dau_tien', 'first_transaction_date'],
  phone: ['phone', 'so_dien_thoai', 'sdt', 'dien_thoai'],
  email: ['email', 'mail'],
};

export function normalizedHeader(value: unknown): string {
  return String(value || '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function stringValue(row: unknown[], index: number | undefined): string {
  if (index == null || index < 0) return '';
  return String(row[index] ?? '').trim();
}

function findColumn(headers: string[], aliases: string[], explicit?: string | null): number {
  const wanted = explicit ? [normalizedHeader(explicit), ...aliases] : aliases;
  return headers.findIndex((header) => wanted.includes(header));
}

function parseSheetDate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime()) && /^\d{4}-\d{1,2}-\d{1,2}/.test(value)) return direct;
  const match = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  if (!day || !month || !year) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function splitTaxCodeOrPhone(raw: string): { taxCode: string | null; mainPhone: string | null } {
  const value = raw.trim();
  if (!value) return { taxCode: null, mainPhone: null };
  const lower = value.toLowerCase();
  const phoneLike = /(^|[\s:])0\d{8,10}\b/.exec(value) || lower.includes('dt') || lower.includes('đt');
  if (phoneLike && !/^\d{8,14}$/.test(value)) return { taxCode: null, mainPhone: value };
  return { taxCode: value, mainPhone: null };
}

function rawRowObject(headersRaw: unknown[], row: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  headersRaw.forEach((header, index) => {
    const key = String(header || `col_${index + 1}`).trim() || `col_${index + 1}`;
    result[key] = row[index] ?? null;
  });
  return result;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function dateToIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function isoToDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function withoutBlankClears<T extends Record<string, any>>(data: T, existing: boolean, allowClearBlankFields: boolean): T {
  if (!existing || allowClearBlankFields) return data;
  const next: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === '') continue;
    next[key] = value;
  }
  return next as T;
}

function normalizeSnapshotData(input: {
  externalKey: string;
  code: string;
  name: string;
  shortName: string | null;
  phone: string | null;
  mainPhone: string | null;
  email: string | null;
  taxCode: string | null;
  website: string | null;
  provinceOrRegion: string | null;
  officeAddress: string | null;
  shippingAddress: string | null;
  legalRepresentativeRaw: string | null;
  activeSince: Date | null;
  firstTransactionDate: Date | null;
  ownerUserId: string | null;
  salesOwnerCodeSnapshot: string | null;
  managingDepartmentId: string | null;
  managingDepartmentCodeSnapshot: string | null;
  customerTypeId: string | null;
  customerTypeCodeSnapshot: string | null;
  sourceId: string | null;
  sourceRowNumber: number;
  metadata: Record<string, unknown>;
}) {
  return {
    ...input,
    type: 'business',
    source: 'google_sheet',
    activeSince: dateToIso(input.activeSince),
    firstTransactionDate: dateToIso(input.firstTransactionDate),
  };
}

function snapshotToCustomerData(snapshotData: Record<string, any>, options: {
  existing: boolean;
  existingMetadata?: unknown;
  allowClearBlankFields: boolean;
}) {
  const sheetMetadata = asRecord(snapshotData.metadata);
  const existingMetadata = asRecord(options.existingMetadata);
  const data = {
    code: String(snapshotData.code || snapshotData.externalKey || '').trim(),
    name: String(snapshotData.name || '').trim(),
    shortName: snapshotData.shortName || null,
    type: 'business',
    phone: snapshotData.phone || null,
    mainPhone: snapshotData.mainPhone || null,
    email: snapshotData.email || null,
    taxCode: snapshotData.taxCode || null,
    website: snapshotData.website || null,
    provinceOrRegion: snapshotData.provinceOrRegion || null,
    officeAddress: snapshotData.officeAddress || null,
    shippingAddress: snapshotData.shippingAddress || null,
    legalRepresentativeRaw: snapshotData.legalRepresentativeRaw || null,
    activeSince: isoToDate(snapshotData.activeSince),
    firstTransactionDate: isoToDate(snapshotData.firstTransactionDate),
    ownerUserId: snapshotData.ownerUserId || null,
    salesOwnerCodeSnapshot: snapshotData.salesOwnerCodeSnapshot || null,
    managingDepartmentId: snapshotData.managingDepartmentId || null,
    managingDepartmentCodeSnapshot: snapshotData.managingDepartmentCodeSnapshot || null,
    customerTypeId: snapshotData.customerTypeId || null,
    customerTypeCodeSnapshot: snapshotData.customerTypeCodeSnapshot || null,
    source: 'google_sheet',
    sourceId: snapshotData.sourceId || null,
    sourceRowNumber: Number(snapshotData.sourceRowNumber || 0) || null,
    metadata: options.existing
      ? { ...existingMetadata, ...sheetMetadata }
      : sheetMetadata,
    syncedAt: new Date(),
    missingFromSource: false,
    sourceMissingSince: null,
  };
  return withoutBlankClears(data, options.existing, options.allowClearBlankFields);
}

async function resolveLegacyIds(orgId: string, input: {
  salesOwnerCode?: string | null;
  departmentCode?: string | null;
  customerTypeCode?: string | null;
}) {
  const [ownerUser, department, customerType] = await Promise.all([
    input.salesOwnerCode
      ? prisma.user.findFirst({
          where: { orgId, legacyEmployeeCode: input.salesOwnerCode, isActive: true },
          select: { id: true },
        })
      : null,
    input.departmentCode
      ? prisma.department.findFirst({
          where: { orgId, legacyDepartmentCode: input.departmentCode, archivedAt: null },
          select: { id: true },
        })
      : null,
    input.customerTypeCode
      ? prisma.customerType.findFirst({
          where: { orgId, code: input.customerTypeCode, isActive: true },
          select: { id: true },
        })
      : null,
  ]);
  return {
    ownerUserId: ownerUser?.id || null,
    managingDepartmentId: department?.id || null,
    customerTypeId: customerType?.id || null,
  };
}

async function applySnapshotToCustomerProfile(input: {
  orgId: string;
  snapshot: {
    id: string;
    sourceRowNumber: number;
    sourceRowKey: string | null;
    action: string;
    normalizedData: unknown;
    matchedCustomerProfileId: string | null;
  };
  mode: ApplyMode;
  allowClearBlankFields?: boolean;
}) {
  const now = new Date();
  const snapshotData = (input.snapshot.normalizedData || {}) as Record<string, any>;
  const externalKey = String(snapshotData.externalKey || input.snapshot.sourceRowKey || '').trim();

  if (input.snapshot.action === 'mark_missing') {
    const where = input.snapshot.matchedCustomerProfileId
      ? { id: input.snapshot.matchedCustomerProfileId, orgId: input.orgId }
      : externalKey
        ? { orgId_externalKey: { orgId: input.orgId, externalKey } }
        : null;
    if (!where) return { action: 'skipped' as const, customerProfileId: null };
    const updated = await prisma.customerProfile.updateMany({
      where: {
        ...(input.snapshot.matchedCustomerProfileId ? { id: input.snapshot.matchedCustomerProfileId } : { orgId: input.orgId, externalKey }),
        orgId: input.orgId,
        missingFromSource: false,
      },
      data: { missingFromSource: true, sourceMissingSince: now },
    });
    return { action: updated.count > 0 ? 'missing' as const : 'skipped' as const, customerProfileId: input.snapshot.matchedCustomerProfileId };
  }

  if (!externalKey || !String(snapshotData.name || '').trim()) {
    throw new Error('Snapshot thiếu mã hoặc tên khách hàng');
  }

  const existing = await prisma.customerProfile.findUnique({
    where: { orgId_externalKey: { orgId: input.orgId, externalKey } },
    select: { id: true, metadata: true },
  });
  const allowClearBlankFields = input.mode === 'overwrite_from_sheet'
    ? Boolean(input.allowClearBlankFields)
    : false;
  const data = snapshotToCustomerData(snapshotData, {
    existing: Boolean(existing),
    existingMetadata: existing?.metadata,
    allowClearBlankFields,
  });
  const profile = await prisma.customerProfile.upsert({
    where: { orgId_externalKey: { orgId: input.orgId, externalKey } },
    create: {
      orgId: input.orgId,
      externalKey,
      ...data,
    },
    update: data,
    select: { id: true },
  });
  return { action: existing ? 'updated' as const : 'created' as const, customerProfileId: profile.id };
}

async function runRowsSync(input: {
  orgId: string;
  actorUserId?: string | null;
  sourceId?: string | null;
  sourceName?: string | null;
  rows: unknown[][];
  headerRow?: number;
  explicitColumns?: Partial<Record<FieldName, string>>;
  triggerType: TriggerType;
  applyToCrm?: boolean;
  applyMode?: ApplyMode;
}): Promise<CustomerSyncResult> {
  const headerRow = Math.max(1, input.headerRow || 1);
  const headerIndex = headerRow - 1;
  if (input.rows.length <= headerIndex) {
    return { totalRows: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, errorCount: 0, errors: [] };
  }

  const headersRaw = input.rows[headerIndex];
  const headers = headersRaw.map(normalizedHeader);
  const fields = Object.fromEntries(
    (Object.keys(FIELD_ALIASES) as FieldName[]).map((field) => [
      field,
      findColumn(headers, FIELD_ALIASES[field], input.explicitColumns?.[field]),
    ]),
  ) as Record<FieldName, number>;

  if (fields.externalKey < 0 || fields.name < 0) {
    return {
      totalRows: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 1,
      errors: [{ row: headerRow, error: 'Sheet must contain customer code and customer name columns' }],
    };
  }

  let runId: string | undefined;
  if (input.sourceId) {
    const run = await prisma.customerSyncRun.create({
      data: {
        orgId: input.orgId,
        sourceId: input.sourceId,
        triggerType: input.triggerType,
        triggeredByUserId: input.actorUserId || null,
      },
      select: { id: true },
    });
    runId = run.id;
  }

  const result: CustomerSyncResult = {
    runId,
    totalRows: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    snapshotCount: 0,
    missingCount: 0,
    errors: [],
  };
  const seenExternalKeys = new Set<string>();
  const now = new Date();

  try {
    for (let offset = headerIndex + 1; offset < input.rows.length; offset++) {
      const row = input.rows[offset];
      if (!row.some((cell) => String(cell ?? '').trim())) continue;
      result.totalRows++;

      const externalKey = stringValue(row, fields.externalKey);
      const name = stringValue(row, fields.name);
      const rawRow = rawRowObject(headersRaw, row);
      if (!externalKey || !name) {
        result.skippedCount++;
        result.errorCount++;
        const error = { row: offset + 1, externalKey: externalKey || null, error: 'Missing customer code or customer name' };
        result.errors.push(error);
        if (runId && input.sourceId) {
          await prisma.customerSourceSnapshot.create({
            data: {
              orgId: input.orgId,
              sourceId: input.sourceId,
              syncRunId: runId,
              sourceRowNumber: offset + 1,
              sourceRowKey: externalKey || null,
              rawRow,
              normalizedData: {},
              rowHash: hashJson(rawRow),
              status: 'invalid',
              action: 'no_op',
              errorMessage: error.error,
            },
          });
          result.snapshotCount = (result.snapshotCount || 0) + 1;
        }
        if (runId) {
          await prisma.customerSyncRowError.create({
            data: {
              runId,
              rowNumber: offset + 1,
              externalKey: error.externalKey,
              errorType: 'missing_required',
              message: error.error,
              rawRow,
            },
          });
        }
        continue;
      }
      if (seenExternalKeys.has(externalKey)) {
        result.skippedCount++;
        result.errorCount++;
        const error = { row: offset + 1, externalKey, error: `Duplicate customer code in sheet: ${externalKey}` };
        result.errors.push(error);
        if (runId && input.sourceId) {
          await prisma.customerSourceSnapshot.create({
            data: {
              orgId: input.orgId,
              sourceId: input.sourceId,
              syncRunId: runId,
              sourceRowNumber: offset + 1,
              sourceRowKey: externalKey,
              rawRow,
              normalizedData: {},
              rowHash: hashJson(rawRow),
              status: 'duplicate',
              action: 'no_op',
              errorMessage: error.error,
            },
          });
          result.snapshotCount = (result.snapshotCount || 0) + 1;
        }
        if (runId) {
          await prisma.customerSyncRowError.create({
            data: {
              runId,
              rowNumber: offset + 1,
              externalKey,
              errorType: 'duplicate_key',
              message: error.error,
              rawRow,
            },
          });
        }
        continue;
      }
      seenExternalKeys.add(externalKey);

      const code = stringValue(row, fields.code) || externalKey;
      const taxOrPhone = splitTaxCodeOrPhone(stringValue(row, fields.taxCodeOrPhone));
      const taxCode = stringValue(row, fields.taxCode) || taxOrPhone.taxCode;
      const mainPhone = stringValue(row, fields.mainPhone) || stringValue(row, fields.phone) || taxOrPhone.mainPhone;
      const salesOwnerCode = stringValue(row, fields.salesOwnerCode) || null;
      const departmentCode = stringValue(row, fields.managingDepartmentCode) || null;
      const customerTypeCode = stringValue(row, fields.customerTypeCode) || null;
      const legacy = await resolveLegacyIds(input.orgId, {
        salesOwnerCode,
        departmentCode,
        customerTypeCode,
      });

      const existing = await prisma.customerProfile.findUnique({
        where: { orgId_externalKey: { orgId: input.orgId, externalKey } },
        select: { id: true },
      });

      const normalizedData = normalizeSnapshotData({
        externalKey,
        code,
        name,
        shortName: stringValue(row, fields.shortName) || null,
        phone: mainPhone || null,
        mainPhone: mainPhone || null,
        email: stringValue(row, fields.email) || null,
        taxCode: taxCode || null,
        website: stringValue(row, fields.website) || null,
        provinceOrRegion: stringValue(row, fields.provinceOrRegion) || null,
        officeAddress: stringValue(row, fields.officeAddress) || null,
        shippingAddress: stringValue(row, fields.shippingAddress) || null,
        legalRepresentativeRaw: stringValue(row, fields.legalRepresentativeRaw) || null,
        activeSince: parseSheetDate(stringValue(row, fields.activeSince)),
        firstTransactionDate: parseSheetDate(stringValue(row, fields.firstTransactionDate)),
        ownerUserId: legacy.ownerUserId,
        salesOwnerCodeSnapshot: salesOwnerCode,
        managingDepartmentId: legacy.managingDepartmentId,
        managingDepartmentCodeSnapshot: departmentCode,
        customerTypeId: legacy.customerTypeId,
        customerTypeCodeSnapshot: customerTypeCode,
        sourceId: input.sourceId || null,
        sourceRowNumber: offset + 1,
        metadata: {
          sourceName: input.sourceName || null,
          contactRaw: stringValue(row, fields.contactRaw) || null,
          rawRow,
          unmapped: {
            salesOwnerCode: salesOwnerCode && !legacy.ownerUserId ? salesOwnerCode : null,
            departmentCode: departmentCode && !legacy.managingDepartmentId ? departmentCode : null,
            customerTypeCode: customerTypeCode && !legacy.customerTypeId ? customerTypeCode : null,
          },
        },
      });
      let snapshotId: string | null = null;
      if (runId && input.sourceId) {
        const snapshot = await prisma.customerSourceSnapshot.create({
          data: {
            orgId: input.orgId,
            sourceId: input.sourceId,
            syncRunId: runId,
            sourceRowNumber: offset + 1,
            sourceRowKey: externalKey,
            rawRow,
            normalizedData,
            rowHash: hashJson(rawRow),
            status: existing ? 'matched' : 'new',
            action: existing ? 'update' : 'create',
            matchedCustomerProfileId: existing?.id || null,
          },
          select: { id: true },
        });
        snapshotId = snapshot.id;
        result.snapshotCount = (result.snapshotCount || 0) + 1;
      }

      if (input.applyToCrm !== false) {
        const applied = await applySnapshotToCustomerProfile({
          orgId: input.orgId,
          snapshot: {
            id: snapshotId || '',
            sourceRowNumber: offset + 1,
            sourceRowKey: externalKey,
            action: existing ? 'update' : 'create',
            normalizedData,
            matchedCustomerProfileId: existing?.id || null,
          },
          mode: input.applyMode || 'update_safe',
        });
        if (snapshotId) {
          await prisma.customerSourceSnapshot.update({
            where: { id: snapshotId },
            data: {
              status: 'applied',
              appliedAt: now,
              matchedCustomerProfileId: applied.customerProfileId,
            },
          });
        }
        if (applied.action === 'updated') result.updatedCount++;
        else if (applied.action === 'created') result.createdCount++;
      } else if (existing) {
        result.updatedCount++;
      } else {
        result.createdCount++;
      }
    }

    if (input.sourceId && seenExternalKeys.size > 0) {
      const missingProfiles = await prisma.customerProfile.findMany({
        where: {
          orgId: input.orgId,
          sourceId: input.sourceId,
          externalKey: { notIn: [...seenExternalKeys] },
          missingFromSource: false,
        },
        select: { id: true, externalKey: true, sourceRowNumber: true, name: true },
        take: 5000,
      });
      for (const profile of missingProfiles) {
        const normalizedData = {
          externalKey: profile.externalKey,
          sourceId: input.sourceId,
          sourceRowNumber: profile.sourceRowNumber || 0,
          name: profile.name,
        };
        let snapshotId: string | null = null;
        if (runId) {
          const snapshot = await prisma.customerSourceSnapshot.create({
            data: {
              orgId: input.orgId,
              sourceId: input.sourceId,
              syncRunId: runId,
              sourceRowNumber: profile.sourceRowNumber || 0,
              sourceRowKey: profile.externalKey,
              rawRow: {},
              normalizedData,
              rowHash: hashJson(normalizedData),
              status: 'missing',
              action: 'mark_missing',
              matchedCustomerProfileId: profile.id,
            },
            select: { id: true },
          });
          snapshotId = snapshot.id;
          result.snapshotCount = (result.snapshotCount || 0) + 1;
        }
        if (input.applyToCrm !== false) {
          const applied = await applySnapshotToCustomerProfile({
            orgId: input.orgId,
            snapshot: {
              id: snapshotId || '',
              sourceRowNumber: profile.sourceRowNumber || 0,
              sourceRowKey: profile.externalKey,
              action: 'mark_missing',
              normalizedData,
              matchedCustomerProfileId: profile.id,
            },
            mode: input.applyMode || 'update_safe',
          });
          if (applied.action === 'missing') result.missingCount = (result.missingCount || 0) + 1;
          if (snapshotId) {
            await prisma.customerSourceSnapshot.update({
              where: { id: snapshotId },
              data: { status: 'applied', appliedAt: now },
            });
          }
        } else {
          result.missingCount = (result.missingCount || 0) + 1;
        }
      }
    }

    const status = input.applyToCrm === false ? 'previewed' : (result.errorCount > 0 ? 'partial' : 'success');
      if (runId) {
        await prisma.customerSyncRun.update({
        where: { id: runId },
        data: {
          status,
          finishedAt: new Date(),
          totalRows: result.totalRows,
          createdCount: result.createdCount,
          updatedCount: result.updatedCount,
          skippedCount: result.skippedCount,
          errorCount: result.errorCount,
          summary: {
            errors: result.errors.slice(0, 100),
            snapshotCount: result.snapshotCount || 0,
            missingCount: result.missingCount || 0,
            applied: input.applyToCrm !== false,
          },
        },
      });
      if (input.applyToCrm !== false) {
        await prisma.customerDataSource.update({
          where: { id: input.sourceId! },
          data: {
            lastSyncedAt: new Date(),
            lastSyncStatus: status,
            lastSyncError: result.errors[0]?.error || null,
          },
        });
      }
    }
    return result;
  } catch (error) {
    if (runId) {
      await prisma.customerSyncRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          totalRows: result.totalRows,
          createdCount: result.createdCount,
          updatedCount: result.updatedCount,
          skippedCount: result.skippedCount,
          errorCount: result.errorCount + 1,
          summary: { error: error instanceof Error ? error.message : String(error) },
          },
        });
      if (input.applyToCrm !== false) {
        await prisma.customerDataSource.update({
          where: { id: input.sourceId! },
          data: {
            lastSyncStatus: 'failed',
            lastSyncError: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
    throw error;
  }
}

export async function runCustomerDataSourceSync(input: {
  sourceId: string;
  orgId: string;
  actorUserId?: string | null;
  triggerType?: TriggerType;
}): Promise<CustomerSyncResult> {
  const source = await prisma.customerDataSource.findFirst({
    where: { id: input.sourceId, orgId: input.orgId, archivedAt: null },
    include: { columnMaps: true },
  });
  if (!source) throw new Error('Customer data source not found');
  if (source.provider !== 'google_sheet') throw new Error(`Unsupported customer data source provider: ${source.provider}`);
  if (source.dataType !== 'customer_master') throw new Error(`Unsupported customer data type: ${source.dataType}`);

  const rows = await readSheetRows({
    spreadsheetId: source.spreadsheetId,
    sheetName: source.sheetName,
    range: source.range || undefined,
    orgId: input.orgId,
  });
  const explicitColumns = Object.fromEntries(
    source.columnMaps.map((item) => [item.targetField, item.sourceHeader]),
  ) as Partial<Record<FieldName, string>>;
  return runRowsSync({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    sourceId: source.id,
    sourceName: source.name,
    rows,
    headerRow: source.headerRow,
    explicitColumns,
    triggerType: input.triggerType || 'manual',
    applyToCrm: true,
    applyMode: 'update_safe',
  });
}

export async function previewCustomerDataSourceSync(input: {
  sourceId: string;
  orgId: string;
  actorUserId?: string | null;
}): Promise<CustomerSyncResult> {
  const source = await prisma.customerDataSource.findFirst({
    where: { id: input.sourceId, orgId: input.orgId, archivedAt: null },
    include: { columnMaps: true },
  });
  if (!source) throw new Error('Customer data source not found');
  if (source.provider !== 'google_sheet') throw new Error(`Unsupported customer data source provider: ${source.provider}`);
  if (source.dataType !== 'customer_master') throw new Error(`Unsupported customer data type: ${source.dataType}`);

  const rows = await readSheetRows({
    spreadsheetId: source.spreadsheetId,
    sheetName: source.sheetName,
    range: source.range || undefined,
    orgId: input.orgId,
  });
  const explicitColumns = Object.fromEntries(
    source.columnMaps.map((item) => [item.targetField, item.sourceHeader]),
  ) as Partial<Record<FieldName, string>>;
  return runRowsSync({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    sourceId: source.id,
    sourceName: source.name,
    rows,
    headerRow: source.headerRow,
    explicitColumns,
    triggerType: 'preview',
    applyToCrm: false,
  });
}

function snapshotMatchesFilter(snapshot: {
  status: string;
  action: string;
  normalizedData: unknown;
}, filter?: {
  status?: string[];
  action?: string[];
  salesCode?: string;
  departmentCode?: string;
  customerTypeCode?: string;
}): boolean {
  if (!filter) return true;
  const data = (snapshot.normalizedData || {}) as Record<string, any>;
  if (filter.status?.length && !filter.status.includes(snapshot.status)) return false;
  if (filter.action?.length && !filter.action.includes(snapshot.action)) return false;
  if (filter.salesCode && data.salesOwnerCodeSnapshot !== filter.salesCode) return false;
  if (filter.departmentCode && data.managingDepartmentCodeSnapshot !== filter.departmentCode) return false;
  if (filter.customerTypeCode && data.customerTypeCodeSnapshot !== filter.customerTypeCode) return false;
  return true;
}

export async function applyCustomerSourceSnapshots(input: {
  orgId: string;
  syncRunId: string;
  mode?: ApplyMode;
  scope?: ApplyScope;
  snapshotRowIds?: string[];
  filter?: {
    status?: string[];
    action?: string[];
    salesCode?: string;
    departmentCode?: string;
    customerTypeCode?: string;
  };
  allowClearBlankFields?: boolean;
}): Promise<CustomerSnapshotApplyResult> {
  const run = await prisma.customerSyncRun.findFirst({
    where: { id: input.syncRunId, orgId: input.orgId },
    select: { id: true, sourceId: true },
  });
  if (!run) throw new Error('Customer sync run not found');

  const scope = input.scope || 'selected';
  if (scope === 'selected' && (!input.snapshotRowIds || input.snapshotRowIds.length === 0)) {
    throw new Error('snapshotRowIds is required when scope is selected');
  }
  const snapshots = await prisma.customerSourceSnapshot.findMany({
    where: {
      syncRunId: input.syncRunId,
      orgId: input.orgId,
      ...(scope === 'selected' ? { id: { in: input.snapshotRowIds || [] } } : {}),
    },
    orderBy: { sourceRowNumber: 'asc' },
    take: 10000,
  });

  const result: CustomerSnapshotApplyResult = {
    syncRunId: input.syncRunId,
    totalRows: 0,
    createdCount: 0,
    updatedCount: 0,
    missingCount: 0,
    skippedCount: 0,
    errorCount: 0,
    errors: [],
  };
  const mode = input.mode || 'update_safe';
  const now = new Date();

  for (const snapshot of snapshots) {
    if (scope === 'filtered' && !snapshotMatchesFilter(snapshot, input.filter)) continue;
    if (scope === 'all_valid' && ['invalid', 'duplicate', 'ignored'].includes(snapshot.status)) continue;
    if (['invalid', 'duplicate', 'ignored'].includes(snapshot.status)) {
      result.skippedCount++;
      continue;
    }
    result.totalRows++;
    try {
      const applied = await applySnapshotToCustomerProfile({
        orgId: input.orgId,
        snapshot,
        mode,
        allowClearBlankFields: input.allowClearBlankFields,
      });
      if (applied.action === 'created') result.createdCount++;
      else if (applied.action === 'updated') result.updatedCount++;
      else if (applied.action === 'missing') result.missingCount++;
      else result.skippedCount++;

      await prisma.customerSourceSnapshot.update({
        where: { id: snapshot.id },
        data: {
          status: applied.action === 'skipped' ? snapshot.status : 'applied',
          appliedAt: applied.action === 'skipped' ? snapshot.appliedAt : now,
          matchedCustomerProfileId: applied.customerProfileId || snapshot.matchedCustomerProfileId,
        },
      });
    } catch (error) {
      result.errorCount++;
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({
        snapshotId: snapshot.id,
        row: snapshot.sourceRowNumber,
        externalKey: snapshot.sourceRowKey,
        error: message,
      });
      await prisma.customerSourceSnapshot.update({
        where: { id: snapshot.id },
        data: { status: 'invalid', errorMessage: message },
      });
    }
  }

  await prisma.customerSyncRun.update({
    where: { id: input.syncRunId },
    data: {
      status: result.errorCount > 0 ? 'partial' : 'success',
      finishedAt: now,
      createdCount: { increment: result.createdCount },
      updatedCount: { increment: result.updatedCount },
      skippedCount: { increment: result.skippedCount },
      errorCount: { increment: result.errorCount },
      summary: {
        appliedFromSnapshot: true,
        applyMode: mode,
        applyScope: scope,
        result,
      },
    },
  });
  await prisma.customerDataSource.update({
    where: { id: run.sourceId },
    data: {
      lastSyncedAt: now,
      lastSyncStatus: result.errorCount > 0 ? 'partial' : 'success',
      lastSyncError: result.errors[0]?.error || null,
    },
  });

  return result;
}

export async function runAdhocCustomerSheetSync(input: {
  orgId: string;
  actorUserId?: string | null;
  spreadsheetId: string;
  sheetName: string;
  range?: string;
  headerRow?: number;
  columns?: Partial<Record<FieldName, string>>;
}): Promise<CustomerSyncResult> {
  const rows = await readSheetRows({
    spreadsheetId: input.spreadsheetId,
    sheetName: input.sheetName,
    range: input.range,
    orgId: input.orgId,
  });
  return runRowsSync({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    rows,
    headerRow: input.headerRow || 1,
    explicitColumns: input.columns,
    triggerType: 'adhoc',
  });
}
