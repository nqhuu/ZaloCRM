<template>
  <div class="shared-workspace">
    <aside class="group-browser">
      <div class="browser-toolbar">
        <v-text-field
          v-model="filters.q"
          prepend-inner-icon="mdi-magnify"
          placeholder="Tìm tên hoặc global ID"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          @update:model-value="scheduleLoad"
        />
        <v-btn icon="mdi-refresh" variant="text" :loading="loading" title="Làm mới" @click="loadGroups" />
      </div>
      <div class="filter-row">
        <v-select
          v-model="filters.customerLinkStatus"
          :items="customerFilters"
          density="compact"
          variant="outlined"
          hide-details
          @update:model-value="loadGroups"
        />
        <v-checkbox
          v-model="filters.sharedOnly"
          label="Từ 2 nick"
          density="compact"
          hide-details
          @update:model-value="loadGroups"
        />
      </div>
      <div class="browser-actions">
        <v-btn size="small" variant="tonal" prepend-icon="mdi-sync" :loading="syncing" @click="syncGroups">
          Đồng bộ nhóm
        </v-btn>
        <v-btn size="small" variant="text" prepend-icon="mdi-google-spreadsheet" @click="sheetDialog = true">
          Đồng bộ khách hàng
        </v-btn>
      </div>

      <div class="group-count">{{ groups.length }} nhóm</div>
      <div class="group-list">
        <button
          v-for="group in groups"
          :key="group.id"
          class="group-row"
          :class="{ active: selectedId === group.id }"
          @click="selectedId = group.id"
        >
          <v-avatar size="34" color="surface-variant">
            <v-img v-if="group.avatarUrl" :src="group.avatarUrl" />
            <v-icon v-else size="18">mdi-account-group</v-icon>
          </v-avatar>
          <span class="group-row-main">
            <span class="group-name">{{ group.name || 'Nhóm chưa đặt tên' }}</span>
            <span class="group-meta">
              {{ group.accounts.length }} nick · {{ group._count.members }} thành viên
            </span>
            <span v-if="group.customerLink" class="customer-name">
              {{ group.customerLink.customerProfile.name }}
            </span>
            <span v-else class="unlinked">Chưa gắn hồ sơ khách hàng</span>
          </span>
        </button>
        <div v-if="!loading && groups.length === 0" class="empty-state">Không có nhóm phù hợp</div>
      </div>
    </aside>

    <main v-if="selectedGroup" class="group-detail">
      <header class="detail-header">
        <div class="detail-identity">
          <v-avatar size="46" color="surface-variant">
            <v-img v-if="selectedGroup.avatarUrl" :src="selectedGroup.avatarUrl" />
            <v-icon v-else>mdi-account-group</v-icon>
          </v-avatar>
          <div>
            <h2>{{ selectedGroup.name || 'Nhóm chưa đặt tên' }}</h2>
            <code>{{ selectedGroup.globalId }}</code>
          </div>
        </div>
        <v-btn prepend-icon="mdi-message-text-outline" color="primary" variant="tonal" @click="openChat">
          Mở hội thoại
        </v-btn>
      </header>

      <section class="detail-section">
        <h3>Nick Zalo trong nhóm</h3>
        <div class="account-list">
          <div v-for="membership in selectedGroup.accounts" :key="membership.id" class="account-row">
            <v-icon size="18" :color="membership.zaloAccount.status === 'connected' ? 'success' : 'medium-emphasis'">
              mdi-cellphone
            </v-icon>
            <span>{{ membership.zaloAccount.displayName || 'Nick Zalo' }}</span>
            <code>{{ membership.accountScopedGroupId }}</code>
            <v-chip size="x-small" :color="membership.membershipStatus === 'active' ? 'success' : 'warning'" variant="tonal">
              {{ membership.membershipStatus }}
            </v-chip>
          </div>
        </div>
      </section>

      <section class="detail-section">
        <div class="section-title-row">
          <h3>Hồ sơ khách hàng</h3>
          <v-btn
            v-if="selectedGroup.customerLink"
            icon="mdi-link-off"
            size="small"
            variant="text"
            color="error"
            title="Gỡ liên kết"
            @click="unlinkCustomer"
          />
        </div>
        <div class="inline-form">
          <v-autocomplete
            v-model="customerProfileId"
            v-model:search="customerProfileSearch"
            :items="customerProfiles"
            :loading="loadingCustomerProfiles"
            :no-filter="true"
            item-title="displayName"
            item-value="id"
            label="Hồ sơ khách hàng"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            @update:search="scheduleCustomerProfileSearch"
          />
          <v-btn color="primary" :disabled="!customerProfileId" :loading="savingCustomer" @click="linkCustomer">
            Gắn hồ sơ
          </v-btn>
        </div>
      </section>

      <section class="detail-section">
        <h3>CRM tag workload</h3>
        <div class="chip-row">
          <v-chip
            v-for="item in selectedGroup.crmTags"
            :key="item.id"
            closable
            :color="item.crmTag.color"
            variant="tonal"
            @click:close="removeTag(item.crmTagId)"
          >
            {{ item.crmTag.name }}
          </v-chip>
          <span v-if="!selectedGroup.crmTags.length" class="muted">Chưa có tag</span>
        </div>
        <div class="inline-form compact-form">
          <v-select
            v-model="tagId"
            :items="crmTags"
            item-title="name"
            item-value="id"
            label="Thêm tag"
            density="compact"
            variant="outlined"
            hide-details
          />
          <v-btn :disabled="!tagId" variant="tonal" @click="addTag">Thêm</v-btn>
        </div>
      </section>

      <section class="detail-section assignments-section">
        <h3>Người được phân công</h3>
        <div class="assignment-list">
          <div v-for="assignment in selectedGroup.workAssignments" :key="assignment.id" class="assignment-row">
            <v-icon size="18">{{ roleIcon(assignment.role) }}</v-icon>
            <span class="assignment-user">{{ assignment.assignedUser.fullName }}</span>
            <v-chip size="x-small" variant="outlined">{{ roleLabel(assignment.role) }}</v-chip>
            <v-chip v-if="assignment.crmTag" size="x-small" :color="assignment.crmTag.color" variant="tonal">
              {{ assignment.crmTag.name }}
            </v-chip>
            <v-spacer />
            <v-btn icon="mdi-close" size="x-small" variant="text" title="Kết thúc phân công" @click="closeAssignment(assignment.id)" />
          </div>
          <span v-if="!selectedGroup.workAssignments.length" class="muted">Chưa phân công</span>
        </div>
        <div class="assignment-form">
          <v-autocomplete
            v-model="assignmentForm.userId"
            :items="users"
            item-title="fullName"
            item-value="id"
            label="Người nhận"
            density="compact"
            variant="outlined"
            hide-details
          />
          <v-select
            v-model="assignmentForm.role"
            :items="roles"
            label="Vai trò"
            density="compact"
            variant="outlined"
            hide-details
          />
          <v-select
            v-model="assignmentForm.crmTagId"
            :items="crmTags"
            item-title="name"
            item-value="id"
            label="Tag lọc"
            density="compact"
            variant="outlined"
            hide-details
            clearable
          />
          <v-btn color="primary" :disabled="!assignmentForm.userId" @click="assignUser">Phân công</v-btn>
        </div>
      </section>
    </main>

    <main v-else class="no-selection">
      <v-icon size="38" color="medium-emphasis">mdi-account-multiple-outline</v-icon>
      <span>Chọn một nhóm để quản lý</span>
    </main>

    <v-dialog v-model="sheetDialog" max-width="520">
      <v-card>
        <v-card-title>Đồng bộ hồ sơ khách hàng</v-card-title>
        <v-card-text class="sheet-form">
          <v-text-field v-model="sheetForm.spreadsheetId" label="Spreadsheet ID" variant="outlined" density="compact" />
          <v-text-field v-model="sheetForm.sheetName" label="Tên sheet" variant="outlined" density="compact" />
          <v-text-field v-model="sheetForm.range" label="Phạm vi" placeholder="A:Z" variant="outlined" density="compact" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="sheetDialog = false">Hủy</v-btn>
          <v-btn color="primary" :loading="syncingSheet" @click="syncCustomers">Đồng bộ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3500" location="bottom end">
      {{ snack.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/index';

interface CrmTag { id: string; name: string; color: string; managedBy: string | null }
interface CustomerProfile { id: string; name: string; code: string | null; externalKey: string; displayName: string }
interface RbacUser { id: string; fullName: string; isActive: boolean }
interface SharedGroup {
  id: string;
  globalId: string;
  name: string | null;
  avatarUrl: string | null;
  accounts: Array<{
    id: string;
    accountScopedGroupId: string;
    membershipStatus: string;
    zaloAccount: { id: string; displayName: string | null; status: string };
  }>;
  customerLink: null | { customerProfileId: string; customerProfile: CustomerProfile };
  crmTags: Array<{ id: string; crmTagId: string; crmTag: CrmTag }>;
  workAssignments: Array<{
    id: string;
    role: string;
    assignedUser: RbacUser;
    crmTag: CrmTag | null;
  }>;
  _count: { conversations: number; messages: number; members: number };
}

const router = useRouter();
const groups = ref<SharedGroup[]>([]);
const selectedId = ref('');
const loading = ref(false);
const syncing = ref(false);
const syncingSheet = ref(false);
const savingCustomer = ref(false);
const loadingCustomerProfiles = ref(false);
const sheetDialog = ref(false);
const customerProfiles = ref<CustomerProfile[]>([]);
const crmTags = ref<CrmTag[]>([]);
const users = ref<RbacUser[]>([]);
const customerProfileId = ref<string | null>(null);
const customerProfileSearch = ref('');
const tagId = ref<string | null>(null);
const filters = reactive({ q: '', customerLinkStatus: '', sharedOnly: false });
const assignmentForm = reactive({ userId: '', role: 'collaborator', crmTagId: null as string | null });
const sheetForm = reactive({ spreadsheetId: '', sheetName: 'KhachHang', range: 'A:Z' });
const snack = reactive({ show: false, message: '', color: 'success' });
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let customerProfileSearchTimer: ReturnType<typeof setTimeout> | null = null;

const customerFilters = [
  { title: 'Tất cả', value: '' },
  { title: 'Đã gắn khách hàng', value: 'linked' },
  { title: 'Chưa gắn', value: 'unlinked' },
];
const roles = [
  { title: 'Chịu trách nhiệm', value: 'owner' },
  { title: 'Phối hợp', value: 'collaborator' },
  { title: 'Theo dõi', value: 'watcher' },
];
const selectedGroup = computed(() => groups.value.find(group => group.id === selectedId.value) || null);

watch(selectedGroup, (group) => {
  customerProfileId.value = group?.customerLink?.customerProfileId || null;
  tagId.value = null;
  assignmentForm.userId = '';
  assignmentForm.crmTagId = null;
});

function notify(message: string, color = 'success') {
  snack.message = message;
  snack.color = color;
  snack.show = true;
}

function errorMessage(error: any): string {
  return error?.response?.data?.error || error?.message || 'Thao tác thất bại';
}

function scheduleLoad() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(loadGroups, 250);
}

function scheduleCustomerProfileSearch(value?: string) {
  if (customerProfileSearchTimer) clearTimeout(customerProfileSearchTimer);
  customerProfileSearchTimer = setTimeout(() => loadCustomerProfiles(value ?? customerProfileSearch.value), 250);
}

async function loadGroups() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.customerLinkStatus) params.set('customerLinkStatus', filters.customerLinkStatus);
    if (filters.sharedOnly) params.set('sharedOnly', 'true');
    const { data } = await api.get(`/native-zalo-groups?${params.toString()}`);
    groups.value = data.groups || [];
    if (!groups.value.some(group => group.id === selectedId.value)) {
      selectedId.value = groups.value[0]?.id || '';
    }
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    loading.value = false;
  }
}

async function loadMetadata() {
  const requests = await Promise.allSettled([
    api.get('/customer-profiles'),
    api.get('/crm-tags'),
    api.get('/rbac/users'),
  ]);
  if (requests[0].status === 'fulfilled') {
    customerProfiles.value = (requests[0].value.data.profiles || []).map((item: any) => ({
      ...item,
      displayName: item.code ? `${item.name} · ${item.code}` : item.name,
    }));
  }
  if (requests[1].status === 'fulfilled') {
    crmTags.value = (requests[1].value.data.tags || []).filter((item: CrmTag) => !item.managedBy);
  }
  if (requests[2].status === 'fulfilled') users.value = requests[2].value.data.users || [];
}

function toCustomerProfileOption(item: any): CustomerProfile {
  return {
    ...item,
    displayName: item.code ? `${item.name} · ${item.code}` : item.name,
  };
}

function mergeCustomerProfileOptions(items: CustomerProfile[]) {
  const map = new Map<string, CustomerProfile>();
  customerProfiles.value.forEach((item) => map.set(item.id, item));
  items.forEach((item) => map.set(item.id, item));
  customerProfiles.value = [...map.values()];
}

async function loadCustomerProfiles(q = '') {
  loadingCustomerProfiles.value = true;
  try {
    const { data } = await api.get('/customer-profiles', { params: { q: q?.trim() || undefined } });
    const options = (data.profiles || []).map(toCustomerProfileOption);
    if (customerProfileId.value && !options.some((item: CustomerProfile) => item.id === customerProfileId.value)) {
      mergeCustomerProfileOptions(options);
    } else {
      customerProfiles.value = options;
    }
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    loadingCustomerProfiles.value = false;
  }
}

async function syncGroups() {
  syncing.value = true;
  try {
    const { data } = await api.post('/native-zalo-groups/sync', {});
    const total = (data.results || []).reduce((sum: number, item: any) => sum + (item.groups || 0), 0);
    notify(`Đã đồng bộ ${total} nhóm`);
    await loadGroups();
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    syncing.value = false;
  }
}

async function syncCustomers() {
  if (!sheetForm.spreadsheetId || !sheetForm.sheetName) return;
  syncingSheet.value = true;
  try {
    const { data } = await api.post('/customer-profiles/sync-google-sheet', sheetForm);
    notify(`Đã đồng bộ ${data.synced || 0} hồ sơ khách hàng`);
    sheetDialog.value = false;
    await loadMetadata();
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    syncingSheet.value = false;
  }
}

async function linkCustomer(confirmTransfer = false) {
  const group = selectedGroup.value;
  if (!group || !customerProfileId.value) return;
  savingCustomer.value = true;
  try {
    await api.post(`/customer-profiles/${customerProfileId.value}/zalo-groups`, {
      nativeGroupId: group.id,
      confirmTransfer,
    });
    notify('Đã gắn hồ sơ khách hàng');
    await Promise.all([loadGroups(), loadMetadata()]);
  } catch (error: any) {
    if (error?.response?.status === 409 && !confirmTransfer) {
      const accepted = window.confirm('Nhóm đang thuộc hồ sơ khác. Chuyển nhóm sang hồ sơ đã chọn?');
      if (accepted) await linkCustomer(true);
    } else {
      notify(errorMessage(error), 'error');
    }
  } finally {
    savingCustomer.value = false;
  }
}

async function unlinkCustomer() {
  const group = selectedGroup.value;
  const profileId = group?.customerLink?.customerProfileId;
  if (!group || !profileId || !window.confirm('Gỡ nhóm khỏi hồ sơ khách hàng?')) return;
  try {
    await api.delete(`/customer-profiles/${profileId}/zalo-groups/${group.id}`);
    notify('Đã gỡ liên kết');
    await loadGroups();
  } catch (error) {
    notify(errorMessage(error), 'error');
  }
}

async function addTag() {
  if (!selectedGroup.value || !tagId.value) return;
  try {
    await api.post(`/zalo-subjects/group/${selectedGroup.value.id}/tags`, { crmTagId: tagId.value });
    notify('Đã thêm tag');
    await loadGroups();
  } catch (error) {
    notify(errorMessage(error), 'error');
  }
}

async function removeTag(crmTagId: string) {
  if (!selectedGroup.value) return;
  try {
    await api.delete(`/zalo-subjects/group/${selectedGroup.value.id}/tags/${crmTagId}`);
    await loadGroups();
  } catch (error) {
    notify(errorMessage(error), 'error');
  }
}

async function assignUser() {
  if (!selectedGroup.value || !assignmentForm.userId) return;
  try {
    await api.post(`/zalo-subjects/group/${selectedGroup.value.id}/assignments`, {
      assignedUserId: assignmentForm.userId,
      role: assignmentForm.role,
      crmTagId: assignmentForm.crmTagId,
    });
    notify('Đã phân công');
    await loadGroups();
  } catch (error) {
    notify(errorMessage(error), 'error');
  }
}

async function closeAssignment(id: string) {
  try {
    await api.delete(`/zalo-subject-assignments/${id}`, { data: { reason: 'Kết thúc từ màn Nhóm chung' } });
    await loadGroups();
  } catch (error) {
    notify(errorMessage(error), 'error');
  }
}

async function openChat() {
  const group = selectedGroup.value;
  const membership = group?.accounts.find(item => item.membershipStatus === 'active') || group?.accounts[0];
  if (!group || !membership) return;
  try {
    const { data } = await api.post(
      `/zalo-accounts/${membership.zaloAccount.id}/groups/${membership.accountScopedGroupId}/ensure-conversation`,
      {},
    );
    if (data.conversationId) router.push({ name: 'Chat', params: { convId: data.conversationId } });
  } catch (error) {
    notify(errorMessage(error), 'error');
  }
}

function roleLabel(role: string) {
  return roles.find(item => item.value === role)?.title || role;
}

function roleIcon(role: string) {
  if (role === 'owner') return 'mdi-account-star-outline';
  if (role === 'watcher') return 'mdi-eye-outline';
  return 'mdi-account-multiple-outline';
}

onMounted(async () => {
  await Promise.all([loadGroups(), loadMetadata()]);
});
</script>

<style scoped>
.shared-workspace {
  display: grid;
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
  min-height: 0;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  background: rgb(var(--v-theme-surface));
}

.group-browser {
  display: flex;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid rgb(var(--v-theme-outline-variant));
}

.browser-toolbar,
.filter-row,
.browser-actions,
.inline-form,
.section-title-row,
.detail-header,
.detail-identity,
.account-row,
.assignment-row {
  display: flex;
  align-items: center;
}

.browser-toolbar { gap: 4px; padding: 12px; }
.filter-row { gap: 8px; padding: 0 12px 8px; }
.filter-row > :first-child { flex: 1; }
.browser-actions { gap: 4px; padding: 0 12px 10px; }
.group-count { padding: 6px 12px; border-top: 1px solid rgb(var(--v-theme-outline-variant)); color: rgb(var(--v-theme-on-surface-variant)); font-size: 12px; }
.group-list { min-height: 0; overflow-y: auto; }
.group-row { width: 100%; display: flex; gap: 10px; padding: 10px 12px; border: 0; border-bottom: 1px solid rgb(var(--v-theme-outline-variant)); background: transparent; color: inherit; text-align: left; cursor: pointer; }
.group-row:hover { background: rgba(var(--v-theme-on-surface), .04); }
.group-row.active { background: rgba(var(--v-theme-primary), .1); box-shadow: inset 3px 0 rgb(var(--v-theme-primary)); }
.group-row-main { min-width: 0; display: flex; flex: 1; flex-direction: column; }
.group-name { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.group-meta, .customer-name, .unlinked { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.group-meta { color: rgb(var(--v-theme-on-surface-variant)); }
.customer-name { color: rgb(var(--v-theme-primary)); }
.unlinked { color: rgb(var(--v-theme-warning)); }
.group-detail { min-width: 0; overflow-y: auto; }
.detail-header { justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid rgb(var(--v-theme-outline-variant)); }
.detail-identity { min-width: 0; gap: 12px; }
.detail-identity h2 { margin: 0; font-size: 19px; letter-spacing: 0; }
.detail-identity code { display: block; max-width: 480px; overflow: hidden; color: rgb(var(--v-theme-on-surface-variant)); font-size: 11px; text-overflow: ellipsis; }
.detail-section { padding: 16px 20px; border-bottom: 1px solid rgb(var(--v-theme-outline-variant)); }
.detail-section h3 { margin: 0 0 10px; font-size: 14px; letter-spacing: 0; }
.section-title-row { justify-content: space-between; }
.account-list, .assignment-list { display: grid; gap: 6px; }
.account-row, .assignment-row { min-height: 34px; gap: 8px; }
.account-row code { margin-left: auto; color: rgb(var(--v-theme-on-surface-variant)); font-size: 11px; }
.inline-form { max-width: 760px; gap: 8px; }
.inline-form > :first-child { flex: 1; }
.compact-form { margin-top: 12px; max-width: 560px; }
.chip-row { display: flex; flex-wrap: wrap; gap: 6px; min-height: 26px; }
.assignment-user { font-weight: 500; }
.assignment-form { display: grid; grid-template-columns: minmax(180px, 1fr) 150px minmax(160px, 1fr) auto; gap: 8px; margin-top: 12px; }
.muted { color: rgb(var(--v-theme-on-surface-variant)); font-size: 13px; }
.empty-state, .no-selection { display: flex; align-items: center; justify-content: center; color: rgb(var(--v-theme-on-surface-variant)); }
.empty-state { min-height: 120px; }
.no-selection { flex-direction: column; gap: 8px; }
.sheet-form { display: grid; gap: 4px; padding-top: 16px; }

@media (max-width: 900px) {
  .shared-workspace { grid-template-columns: 1fr; overflow-y: auto; }
  .group-browser { min-height: 360px; max-height: 48vh; border-right: 0; border-bottom: 1px solid rgb(var(--v-theme-outline-variant)); }
  .assignment-form { grid-template-columns: 1fr; }
  .detail-header { align-items: flex-start; flex-direction: column; }
}
</style>
