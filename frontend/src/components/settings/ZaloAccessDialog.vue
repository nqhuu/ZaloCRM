<template>
  <v-dialog v-model="open" max-width="760" class="zalo-access-dialog">
    <v-card class="access-card">
      <v-card-title class="access-header d-flex align-center">
        <v-icon class="mr-3" color="#dbe7ff" size="28">mdi-shield-account-outline</v-icon>
        <span class="access-title-text"><strong>Phân quyền truy cập</strong> — {{ accountName }}</span>
        <v-spacer />
        <v-btn icon variant="text" color="white" @click="open = false">
          <v-icon size="28">mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text class="access-body">
        <v-progress-linear v-if="loading" indeterminate color="cyan" class="mb-3" />

        <section class="dialog-section department-config">
          <div>
            <div class="section-kicker">Phòng ban hiện hành</div>
            <div class="section-desc">
              Xác định phòng ban quản lý tài khoản và người được phép nhận vai trò phụ trách.
            </div>
          </div>
          <div class="department-config__control">
            <v-select
              v-model="selectedDepartmentId"
              :items="departmentOptions"
              item-title="title"
              item-value="value"
              label="Chọn phòng ban"
              density="comfortable"
              variant="outlined"
              hide-details
              class="field-control"
              :disabled="!canManageDepartment"
              no-data-text="Chưa có phòng ban"
            />
            <v-btn
              color="primary"
              class="primary-action"
              size="large"
              :loading="savingDepartment"
              :disabled="!canSaveDepartment"
              @click="handleSaveDepartment"
            >
              Lưu phòng ban
            </v-btn>
          </div>
          <v-alert
            v-if="!canManageDepartment"
            type="info"
            variant="tonal"
            density="compact"
          >
            Chỉ admin ứng dụng hoặc trưởng phòng đang quản lý tài khoản được thay đổi.
          </v-alert>
        </section>

        <v-divider class="section-divider" />

        <section class="dialog-section primary-delegation">
          <div class="primary-delegation__header">
            <div>
              <div class="section-title">Ủy quyền phụ trách chính tạm thời</div>
              <div class="section-desc">
                Dùng khi phụ trách chính nghỉ phép hoặc cần chuyển ca trong một khoảng ngày cụ thể.
              </div>
            </div>
            <v-chip
              v-if="effectivePrimary"
              size="small"
              color="primary"
              variant="tonal"
            >
              Hiện hành: {{ effectivePrimary.fullName }}
            </v-chip>
          </div>

          <div class="primary-delegation__form">
            <v-select
              v-model="delegationForm.delegateUserId"
              :items="delegationUserOptions"
              item-title="fullName"
              item-value="id"
              label="Người phụ trách tạm thời"
              density="comfortable"
              variant="outlined"
              hide-details
              class="field-control"
              :disabled="!canManageDepartment"
              no-data-text="Chưa có nhân sự phù hợp"
            />
            <v-text-field
              v-model="delegationForm.startDate"
              label="Từ ngày"
              type="date"
              density="comfortable"
              variant="outlined"
              hide-details
              class="field-control"
              :disabled="!canManageDepartment"
            />
            <v-text-field
              v-model="delegationForm.endDate"
              label="Đến ngày"
              type="date"
              density="comfortable"
              variant="outlined"
              hide-details
              class="field-control"
              :disabled="!canManageDepartment"
            />
            <v-text-field
              v-model="delegationForm.reason"
              label="Lý do"
              density="comfortable"
              variant="outlined"
              hide-details
              class="field-control"
              :disabled="!canManageDepartment"
            />
            <v-btn
              color="deep-purple-accent-3"
              class="delegation-action"
              size="large"
              :loading="savingDelegation"
              :disabled="!canCreateDelegation"
              @click="handleCreateDelegation"
            >
              Tạo uỷ quyền
            </v-btn>
          </div>

          <v-list v-if="primaryDelegations.length" density="compact" class="primary-delegation__list">
            <v-list-item
              v-for="delegation in primaryDelegations"
              :key="delegation.id"
              class="delegation-item"
              :class="{ active: isDelegationActive(delegation) }"
            >
              <template #prepend>
                <div class="person-avatar" :class="{ muted: !isDelegationActive(delegation) }">
                  <v-icon size="20">mdi-account-outline</v-icon>
                </div>
              </template>
              <v-list-item-title>
                {{ delegation.delegateUser.fullName }}
                <v-chip size="x-small" class="ml-1 status-chip" :color="delegationStatus(delegation).color" variant="tonal">
                  {{ delegationStatus(delegation).label }}
                </v-chip>
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ delegation.startDate }} → {{ delegation.endDate }}
                <span v-if="delegation.reason"> · {{ delegation.reason }}</span>
              </v-list-item-subtitle>
              <template #append>
                <v-btn
                  v-if="canManageDepartment && isDelegationActive(delegation)"
                  icon
                  size="x-small"
                  color="error"
                  variant="text"
                  @click="handleCancelDelegation(delegation.id)"
                >
                  <v-icon>mdi-close-circle</v-icon>
                </v-btn>
              </template>
            </v-list-item>
          </v-list>
        </section>

        <v-divider class="section-divider" />

        <!-- Current access list -->
        <div v-if="accessList.length" class="access-section mb-4">
          <div class="section-title mb-4">Người có quyền truy cập</div>
          <div class="access-table-head">
            <span>Nhân viên</span>
            <span>Phụ trách</span>
            <span>Quyền</span>
            <span></span>
          </div>
          <div class="access-list">
            <div v-for="a in accessList" :key="a.id" class="access-row">
              <div class="access-person">
                <div class="person-avatar">
                  <v-icon size="18">mdi-account-outline</v-icon>
                </div>
                <div class="access-person__text">
                  <div class="access-name">{{ a.fullName }}</div>
                  <div class="access-email">{{ a.email }}</div>
                </div>
              </div>
                <div class="access-controls">
                  <v-select
                    :model-value="a.assignmentRole"
                    :items="assignmentRoleOptions"
                    item-title="label"
                    item-value="value"
                    density="comfortable"
                    hide-details
                    variant="outlined"
                    label="Phụ trách"
                    class="access-select"
                    @update:model-value="handleUpdateAssignment(a, $event)"
                  />
                  <v-select
                    :model-value="a.permission"
                    :items="permissionOptions"
                    item-title="label"
                    item-value="value"
                    density="comfortable"
                    hide-details
                    variant="outlined"
                    label="Quyền"
                    class="access-select"
                    @update:model-value="handleUpdatePermission(a.id, $event)"
                  />
                </div>
                <v-btn icon color="error" variant="text" class="delete-btn" @click="handleRemoveAccess(a.id)">
                  <v-icon size="22">mdi-trash-can-outline</v-icon>
                </v-btn>
            </div>
          </div>
        </div>
        <div v-else-if="!loading" class="text-medium-emphasis text-body-2 mb-4">
          Chưa có người dùng nào được cấp quyền
        </div>

        <!-- Add access section -->
        <v-divider class="section-divider" />
        <div class="add-access-section">
        <div class="section-kicker mb-2">Thêm người dùng</div>
        <div class="add-access-grid">
          <v-select
            v-model="newUserId"
            :items="availableUsers"
            item-title="fullName"
            item-value="id"
            label="Chọn nhân viên"
            density="comfortable"
            hide-details
            variant="outlined"
            no-data-text="Không có nhân viên để thêm"
            class="field-control"
          />
          <v-select
            v-model="newPermission"
            :items="permissionOptions"
            item-title="label"
            item-value="value"
            label="Quyền"
            density="comfortable"
            hide-details
            variant="outlined"
            class="field-control"
          />
          <v-select
            v-model="newAssignmentRole"
            :items="assignmentRoleOptions"
            item-title="label"
            item-value="value"
            label="Vai trò xử lý"
            density="comfortable"
            hide-details
            variant="outlined"
            class="field-control"
          />
          <v-btn color="primary" size="large" :loading="saving" :disabled="!newUserId" @click="handleAddAccess">
            Thêm
          </v-btn>
        </div>
        </div>
        <v-alert v-if="dialogError" type="error" density="compact" class="mt-4">{{ dialogError }}</v-alert>
      </v-card-text>

      <v-card-actions class="access-footer">
        <v-spacer />
        <v-btn class="footer-cancel" variant="outlined" size="large" @click="open = false">Hủy bỏ</v-btn>
        <v-btn class="footer-close" color="#25292c" size="large" @click="open = false">Đóng</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { api } from '@/api/index';
import { useUsers } from '@/composables/use-users';

interface AccessEntry {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  permission: string;
  assignmentRole?: string | null;
  user?: {
    id: string;
    fullName: string;
    email: string;
  };
}

interface PrimaryDelegation {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  cancelledAt?: string | null;
  basePrimaryUser: { id: string; fullName: string };
  delegateUser: { id: string; fullName: string };
  createdBy: { id: string; fullName: string };
}

interface EffectivePrimary {
  userId: string;
  fullName: string;
  source: 'base_primary' | 'delegation';
}

const props = defineProps<{
  modelValue: boolean;
  accountId: string;
  accountName: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'changed'): void;
}>();

const { users, fetchUsers } = useUsers();

// Writable computed to allow v-model on the dialog
const open = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const accessList = ref<AccessEntry[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogError = ref('');
const newUserId = ref('');
const newPermission = ref('read');
const newAssignmentRole = ref<string | null>(null);
const currentDepartmentId = ref('');
const selectedDepartmentId = ref('');
const canManageDepartment = ref(false);
const primaryDelegations = ref<PrimaryDelegation[]>([]);
const effectivePrimary = ref<EffectivePrimary | null>(null);
const savingDelegation = ref(false);
const delegationForm = ref({
  delegateUserId: '',
  startDate: todayDate(),
  endDate: todayDate(),
  reason: '',
});
const departments = ref<Array<{
  id: string;
  name: string;
  path: string;
  depth: number;
  children?: Array<any>;
}>>([]);
const savingDepartment = ref(false);

const permissionOptions = [
  { label: 'Xem', value: 'read' },
  { label: 'Chat', value: 'chat' },
  { label: 'Quản lý', value: 'admin' },
];
const assignmentRoleOptions = computed(() => {
  const maxSecondary = Math.max(
    0,
    ...accessList.value
      .map((entry) => secondaryIndex(entry.assignmentRole))
      .filter((index) => index > 0),
  );
  const secondaryCount = Math.max(1, maxSecondary + 1);
  return [
    { label: 'Không phụ trách', value: null },
    { label: 'Phụ trách chính', value: 'primary' },
    ...Array.from({ length: secondaryCount }, (_, index) => {
      const roleIndex = index + 1;
      return {
        label: `Phụ trách phụ ${roleIndex}`,
        value: `secondary_${roleIndex}`,
      };
    }),
  ];
});

const departmentOptions = computed(() => {
  const result: Array<{ title: string; value: string }> = [];
  function append(nodes: typeof departments.value, depth = 0) {
    for (const department of nodes) {
      result.push({
        title: `${'— '.repeat(depth)}${department.name}`,
        value: department.id,
      });
      if (department.children?.length) append(department.children, depth + 1);
    }
  }
  append(departments.value);
  return result;
});

const canSaveDepartment = computed(() => (
  canManageDepartment.value
  && Boolean(selectedDepartmentId.value)
  && selectedDepartmentId.value !== currentDepartmentId.value
));

const availableUsers = computed(() => {
  const grantedIds = new Set(accessList.value.map((a) => a.userId));
  return users.value.filter((u) => !grantedIds.has(u.id));
});

const delegationUserOptions = computed(() => accessList.value
  .filter((entry) => ['chat', 'admin'].includes(entry.permission) && entry.assignmentRole !== 'primary')
  .map((entry) => ({
    id: entry.userId,
    fullName: entry.fullName,
  })));

const canCreateDelegation = computed(() => (
  canManageDepartment.value
  && Boolean(delegationForm.value.delegateUserId)
  && Boolean(delegationForm.value.startDate)
  && Boolean(delegationForm.value.endDate)
));

async function fetchAccess() {
  if (!props.accountId) return;
  loading.value = true;
  try {
    const res = await api.get(`/zalo-accounts/${props.accountId}/access`);
    const entries = res.data.access ?? res.data ?? [];
    currentDepartmentId.value = res.data.account?.departmentId || '';
    selectedDepartmentId.value = currentDepartmentId.value;
    canManageDepartment.value = Boolean(res.data.account?.canManageDepartment);
    primaryDelegations.value = res.data.primaryDelegations || [];
    effectivePrimary.value = res.data.effectivePrimary || null;
    accessList.value = entries.map((entry: AccessEntry) => ({
      ...entry,
      fullName: entry.fullName || entry.user?.fullName || entry.email || entry.user?.email || 'Chưa đặt tên',
      email: entry.email || entry.user?.email || '',
    }));
  } catch {
    accessList.value = [];
    primaryDelegations.value = [];
    effectivePrimary.value = null;
  } finally {
    loading.value = false;
  }
}

async function handleCreateDelegation() {
  if (!canCreateDelegation.value) return;
  savingDelegation.value = true;
  dialogError.value = '';
  try {
    await api.post(`/zalo-accounts/${props.accountId}/primary-delegations`, {
      delegateUserId: delegationForm.value.delegateUserId,
      startDate: delegationForm.value.startDate,
      endDate: delegationForm.value.endDate,
      reason: delegationForm.value.reason || null,
    });
    delegationForm.value = {
      delegateUserId: '',
      startDate: todayDate(),
      endDate: todayDate(),
      reason: '',
    };
    await fetchAccess();
    emit('changed');
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Không thể tạo uỷ quyền phụ trách chính tạm thời';
  } finally {
    savingDelegation.value = false;
  }
}

async function handleCancelDelegation(delegationId: string) {
  savingDelegation.value = true;
  dialogError.value = '';
  try {
    await api.delete(`/zalo-accounts/${props.accountId}/primary-delegations/${delegationId}`);
    await fetchAccess();
    emit('changed');
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Không thể huỷ uỷ quyền phụ trách chính tạm thời';
  } finally {
    savingDelegation.value = false;
  }
}

async function fetchDepartments() {
  try {
    const { data } = await api.get('/departments');
    departments.value = data.tree || [];
  } catch {
    departments.value = [];
  }
}

async function handleSaveDepartment() {
  if (!canSaveDepartment.value) return;
  savingDepartment.value = true;
  dialogError.value = '';
  try {
    await api.patch(`/zalo-accounts/${props.accountId}/department`, {
      departmentId: selectedDepartmentId.value,
    });
    await fetchAccess();
    emit('changed');
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Không thể cập nhật phòng ban hiện hành';
  } finally {
    savingDepartment.value = false;
  }
}

async function handleAddAccess() {
  if (!newUserId.value) return;
  saving.value = true;
  dialogError.value = '';
  try {
    await api.post(`/zalo-accounts/${props.accountId}/access`, {
      userId: newUserId.value,
      permission: newAssignmentRole.value && newPermission.value === 'read' ? 'chat' : newPermission.value,
      assignmentRole: newAssignmentRole.value,
    });
    newUserId.value = '';
    newPermission.value = 'read';
    newAssignmentRole.value = null;
    await fetchAccess();
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Lỗi thêm quyền truy cập';
  } finally {
    saving.value = false;
  }
}

async function handleUpdatePermission(accessId: string, permission: string) {
  try {
    await api.put(`/zalo-accounts/${props.accountId}/access/${accessId}`, { permission });
    await fetchAccess();
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Lỗi cập nhật quyền';
  }
}

async function handleUpdateAssignment(entry: AccessEntry, assignmentRole: string | null) {
  try {
    await api.put(`/zalo-accounts/${props.accountId}/access/${entry.id}`, {
      assignmentRole,
      ...(assignmentRole && entry.permission === 'read' ? { permission: 'chat' } : {}),
    });
    await fetchAccess();
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Lỗi cập nhật người phụ trách';
  }
}

async function handleRemoveAccess(accessId: string) {
  try {
    await api.delete(`/zalo-accounts/${props.accountId}/access/${accessId}`);
    await fetchAccess();
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Lỗi xóa quyền truy cập';
  }
}

function secondaryIndex(role?: string | null) {
  const match = role?.match(/^secondary_(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function delegationStatus(delegation: PrimaryDelegation) {
  if (delegation.cancelledAt) return { label: 'Đã huỷ', color: 'default' };
  if (isDelegationActive(delegation)) return { label: 'Hiệu lực', color: 'success' };
  if (delegation.startDate > todayDate()) return { label: 'Sắp tới', color: 'info' };
  return { label: 'Hết hạn', color: 'warning' };
}

function isDelegationActive(delegation: PrimaryDelegation) {
  if (delegation.cancelledAt) return false;
  const today = todayDate();
  return delegation.startDate <= today && delegation.endDate >= today;
}

function todayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

watch(() => props.modelValue, (val) => {
  if (val) {
    dialogError.value = '';
    void Promise.all([fetchAccess(), fetchDepartments(), fetchUsers()]);
  }
});
</script>

<style scoped>
.access-card {
  border: 1px solid #aeb7c8;
  border-radius: 12px !important;
  overflow: hidden;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
}

.access-header {
  min-height: 56px;
  padding: 0 22px !important;
  background: #292d30;
  color: #ffffff;
  font-size: 19px;
  font-weight: 400;
  letter-spacing: 0;
}

.access-title-text strong {
  font-weight: 800;
}

.access-body {
  padding: 20px !important;
  color: #111827;
}

.dialog-section {
  padding-bottom: 24px;
  border-bottom: 1px solid #d8deea;
  margin-bottom: 24px;
}

.section-divider {
  display: none;
}

.section-kicker {
  font-size: 12px;
  font-weight: 500;
  color: #111827;
  margin-bottom: 6px;
}

.section-title {
  font-size: 15px;
  font-weight: 800;
  line-height: 1.3;
  color: #111827;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 14px;
}

.primary-delegation .section-title {
  margin-bottom: 12px;
}

.section-desc {
  font-size: 12px;
  color: #343846;
  line-height: 1.5;
}

.department-config {
  display: grid;
  gap: 12px;
}

.department-config__control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 128px;
  gap: 14px;
  align-items: center;
}

.field-control :deep(.v-field),
.access-select :deep(.v-field) {
  min-height: 42px;
  border-radius: 7px;
  background: #ffffff;
  font-size: 13px;
}

.primary-action,
.delegation-action {
  min-height: 42px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 800;
  text-transform: none;
}

.primary-delegation {
  display: grid;
  gap: 16px;
}

.primary-delegation__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.current-chip {
  min-width: 170px;
  justify-content: center;
  border-radius: 999px;
  font-size: 11px;
}

.primary-delegation__form {
  display: grid;
  grid-template-columns: minmax(190px, 1fr) 112px 112px 112px 110px;
  gap: 12px;
  align-items: end;
}

.primary-delegation__list {
  padding: 12px;
  border: 0;
  border-radius: 10px;
  background: #eceff3;
}

.delegation-item {
  min-height: 44px;
  margin-bottom: 8px;
  border: 1px solid #c3cbe0;
  border-radius: 9px !important;
  background: #ffffff;
}

.delegation-item:last-child {
  margin-bottom: 0;
}

.delegation-item.active {
  border-color: #b9cdfc;
}

.person-avatar {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #0b55e7;
  background: #dfe8ff;
  flex: 0 0 auto;
}

.person-avatar.muted {
  color: #475569;
  background: #e5e7eb;
}

.dot-separator {
  width: 4px;
  height: 4px;
  margin: 0 12px;
  border-radius: 999px;
  background: #6b7280;
  display: inline-block;
  vertical-align: middle;
}

.delegation-reason {
  color: #64748b;
}

.status-chip {
  min-width: 74px;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.access-section {
  margin-bottom: 28px;
}

.access-table-head {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 170px 140px 40px;
  align-items: center;
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid #c1c9dc;
  border-bottom: 0;
  border-radius: 12px 12px 0 0;
  background: #f3f5f9;
  color: #111827;
  font-size: 12px;
}

.access-list {
  padding: 0;
  border: 1px solid #c1c9dc;
  border-radius: 0 0 12px 12px;
  background: #ffffff;
  overflow: hidden;
}

.access-row {
  min-height: 72px;
  padding: 12px 14px;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(322px, 0.9fr) 40px;
  gap: 12px;
  align-items: center;
  border-bottom: 1px solid #e2e8f0;
}

.access-row:last-child {
  border-bottom: 0;
}

.access-person {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.access-person__text {
  min-width: 0;
}

.access-name {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.access-email {
  margin-top: 1px;
  font-size: 11px;
  color: #64748b;
}

.access-controls {
  display: grid;
  grid-template-columns: 170px 140px;
  gap: 12px;
  min-width: 0;
  margin-right: 0;
}

.add-access-section {
  margin-top: -8px;
}

.add-access-grid {
  display: grid;
  grid-template-columns: minmax(210px, 1fr) 120px 150px 70px;
  gap: 12px;
  align-items: center;
}

.empty-access {
  padding: 18px 20px;
  border: 1px solid #c1c9dc;
  border-radius: 12px;
  color: #64748b;
}

.access-footer {
  min-height: 66px;
  padding: 12px 20px !important;
  border-top: 1px solid #d8deea;
  background: #f8fafc;
}

.footer-cancel,
.footer-close {
  min-width: 86px;
  min-height: 42px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 800;
  text-transform: none;
}

.footer-close {
  color: #ffffff !important;
}

@media (max-width: 960px) {
  .access-header {
    min-height: 72px;
    padding: 0 18px !important;
    font-size: 20px;
  }

  .access-body {
    padding: 20px !important;
  }

  .department-config__control,
  .primary-delegation__form,
  .add-access-grid {
    grid-template-columns: 1fr;
  }

  .primary-delegation__header {
    display: grid;
  }

  .access-table-head {
    display: none;
  }

  .access-list {
    border-radius: 12px;
  }

  .access-list :deep(.v-list-item__append),
  .access-controls {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}
</style>
.delete-btn {
  justify-self: center;
}
