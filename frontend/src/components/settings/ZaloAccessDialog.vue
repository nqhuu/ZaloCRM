<template>
  <v-dialog v-model="open" max-width="760">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" color="cyan">mdi-shield-account</v-icon>
        Phân quyền truy cập — {{ accountName }}
      </v-card-title>

      <v-card-text>
        <v-progress-linear v-if="loading" indeterminate color="cyan" class="mb-3" />

        <section class="department-config">
          <div>
            <div class="text-subtitle-2">Phòng ban hiện hành</div>
            <div class="text-caption text-medium-emphasis">
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
              density="compact"
              variant="outlined"
              hide-details
              :disabled="!canManageDepartment"
              no-data-text="Chưa có phòng ban"
            />
            <v-btn
              color="primary"
              variant="tonal"
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

        <v-divider class="my-4" />

        <section class="primary-delegation">
          <div class="primary-delegation__header">
            <div>
              <div class="text-subtitle-2">Uỷ quyền phụ trách chính tạm thời</div>
              <div class="text-caption text-medium-emphasis">
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
              density="compact"
              variant="outlined"
              hide-details
              :disabled="!canManageDepartment"
              no-data-text="Chưa có nhân sự phù hợp"
            />
            <v-text-field
              v-model="delegationForm.startDate"
              label="Từ ngày"
              type="date"
              density="compact"
              variant="outlined"
              hide-details
              :disabled="!canManageDepartment"
            />
            <v-text-field
              v-model="delegationForm.endDate"
              label="Đến ngày"
              type="date"
              density="compact"
              variant="outlined"
              hide-details
              :disabled="!canManageDepartment"
            />
            <v-text-field
              v-model="delegationForm.reason"
              label="Lý do"
              density="compact"
              variant="outlined"
              hide-details
              :disabled="!canManageDepartment"
            />
            <v-btn
              color="primary"
              variant="tonal"
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
            >
              <v-list-item-title>
                {{ delegation.delegateUser.fullName }}
                <v-chip size="x-small" class="ml-1" :color="delegation.cancelledAt ? 'default' : 'success'" variant="tonal">
                  {{ delegation.cancelledAt ? 'Đã huỷ' : 'Hiệu lực' }}
                </v-chip>
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ delegation.startDate }} → {{ delegation.endDate }}
                <span v-if="delegation.reason"> · {{ delegation.reason }}</span>
              </v-list-item-subtitle>
              <template #append>
                <v-btn
                  v-if="canManageDepartment && !delegation.cancelledAt"
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

        <v-divider class="my-4" />

        <!-- Current access list -->
        <div v-if="accessList.length" class="mb-4">
          <div class="text-subtitle-2 mb-2">Người có quyền truy cập</div>
          <v-list density="compact" rounded="lg" variant="tonal">
            <v-list-item v-for="a in accessList" :key="a.id">
              <template #prepend>
                <v-icon color="cyan">mdi-account</v-icon>
              </template>
              <v-list-item-title>{{ a.fullName }}</v-list-item-title>
              <v-list-item-subtitle>{{ a.email }}</v-list-item-subtitle>
              <template #append>
                <div class="access-controls">
                  <v-select
                    :model-value="a.assignmentRole"
                    :items="assignmentRoleOptions"
                    item-title="label"
                    item-value="value"
                    density="compact"
                    hide-details
                    variant="outlined"
                    label="Phụ trách"
                    @update:model-value="handleUpdateAssignment(a, $event)"
                  />
                  <v-select
                    :model-value="a.permission"
                    :items="permissionOptions"
                    item-title="label"
                    item-value="value"
                    density="compact"
                    hide-details
                    variant="outlined"
                    label="Quyền"
                    @update:model-value="handleUpdatePermission(a.id, $event)"
                  />
                </div>
                <v-btn icon size="x-small" color="error" variant="text" @click="handleRemoveAccess(a.id)">
                  <v-icon>mdi-delete</v-icon>
                </v-btn>
              </template>
            </v-list-item>
          </v-list>
        </div>
        <div v-else-if="!loading" class="text-medium-emphasis text-body-2 mb-4">
          Chưa có người dùng nào được cấp quyền
        </div>

        <!-- Add access section -->
        <v-divider class="mb-3" />
        <div class="text-subtitle-2 mb-2">Thêm người dùng</div>
        <div class="d-flex gap-2 align-start">
          <v-select
            v-model="newUserId"
            :items="availableUsers"
            item-title="fullName"
            item-value="id"
            label="Chọn nhân viên"
            density="compact"
            hide-details
            variant="outlined"
            no-data-text="Không có nhân viên để thêm"
            class="flex-grow-1"
          />
          <v-select
            v-model="newPermission"
            :items="permissionOptions"
            item-title="label"
            item-value="value"
            label="Quyền"
            density="compact"
            hide-details
            variant="outlined"
            style="min-width: 130px;"
          />
          <v-select
            v-model="newAssignmentRole"
            :items="assignmentRoleOptions"
            item-title="label"
            item-value="value"
            label="Vai trò xử lý"
            density="compact"
            hide-details
            variant="outlined"
            style="min-width: 150px;"
          />
          <v-btn color="primary" :loading="saving" :disabled="!newUserId" @click="handleAddAccess">
            Thêm
          </v-btn>
        </div>
        <v-alert v-if="dialogError" type="error" density="compact" class="mt-3">{{ dialogError }}</v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Đóng</v-btn>
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

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

watch(() => props.modelValue, (val) => {
  if (val) {
    dialogError.value = '';
    void Promise.all([fetchAccess(), fetchDepartments(), fetchUsers()]);
  }
});
</script>

<style scoped>
.department-config {
  display: grid;
  gap: 12px;
}

.department-config__control {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.primary-delegation {
  display: grid;
  gap: 12px;
}

.primary-delegation__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.primary-delegation__form {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 130px 130px minmax(140px, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.primary-delegation__list {
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 12px;
}

.access-controls {
  display: grid;
  grid-template-columns: minmax(145px, 1fr) minmax(105px, 0.7fr);
  gap: 8px;
  min-width: 270px;
  margin-right: 8px;
}

@media (max-width: 640px) {
  .department-config__control {
    grid-template-columns: 1fr;
  }

  .primary-delegation__header {
    display: grid;
  }

  .primary-delegation__form {
    grid-template-columns: 1fr;
  }

  .access-controls {
    grid-template-columns: 1fr;
    min-width: 150px;
  }
}
</style>
