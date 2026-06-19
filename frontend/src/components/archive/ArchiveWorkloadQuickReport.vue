<template>
  <section class="archive-workload-report" :class="{ collapsed }">
    <header class="archive-workload-head">
      <button type="button" class="archive-workload-title" @click="toggleCollapsed">
        <span>Tồn đọng</span>
        <strong>{{ summary?.totals.openCount ?? 0 }}</strong>
      </button>
      <div class="archive-workload-actions">
        <button type="button" title="Làm mới báo cáo" :disabled="loading" @click.stop="fetchSummary">
          <v-icon size="15">mdi-refresh</v-icon>
        </button>
        <button type="button" :title="collapsed ? 'Mở báo cáo' : 'Thu gọn báo cáo'" @click.stop="toggleCollapsed">
          <v-icon size="16">{{ collapsed ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        </button>
      </div>
      <label class="archive-workload-scope-toggle" title="Theo bộ lọc hiện tại">
        <input v-model="followCurrentFilters" type="checkbox" />
        <span>Theo bộ lọc</span>
      </label>
    </header>

    <div v-if="collapsed" class="archive-workload-collapsed">
      <button
        v-for="row in collapsedRows"
        :key="row.userId || 'unassigned'"
        type="button"
        :class="{ active: isSelected(row) }"
        :title="rowTooltip(row)"
        @click="selectRow(row)"
      >
        <span>{{ shortName(row.userName) }}</span>
        <strong>{{ row.openCount }}</strong>
      </button>
      <span v-if="!loading && collapsedRows.length === 0">Không có tồn đọng</span>
      <v-progress-circular v-if="loading" indeterminate size="16" width="2" />
    </div>

    <div v-else class="archive-workload-body">
      <div v-if="loading && !summary" class="archive-workload-state">
        <v-progress-circular indeterminate size="20" width="2" />
        <span>Đang tải</span>
      </div>
      <div v-else-if="error" class="archive-workload-state error">
        <span>{{ error }}</span>
        <button type="button" @click="fetchSummary">Thử lại</button>
      </div>
      <div v-else-if="rows.length === 0" class="archive-workload-state">
        <v-icon size="18">mdi-check-circle-outline</v-icon>
        <span>Không có hồ sơ tồn đọng</span>
      </div>
      <template v-else>
        <div class="archive-workload-meta">
          <span>{{ activeUserCount }} người có việc</span>
          <span v-if="summary?.totals.overdueCount">QH {{ summary.totals.overdueCount }}</span>
          <span v-if="summary?.totals.urgentCount">Gấp {{ summary.totals.urgentCount }}</span>
        </div>
        <button
          v-for="row in rows"
          :key="row.userId || 'unassigned'"
          type="button"
          class="archive-workload-row"
          :class="[row.warningLevel, { active: isSelected(row) }]"
          :title="rowTooltip(row)"
          @click="selectRow(row)"
        >
          <span class="archive-workload-avatar" :class="row.warningLevel">
            {{ initials(row.userName) }}
          </span>
          <span class="archive-workload-info">
            <span class="archive-workload-line">
              <strong>{{ row.userName }}</strong>
              <b>{{ row.openCount }}</b>
            </span>
            <span class="archive-workload-chips">
              <span>G: {{ row.urgentCount }}</span>
              <span :class="{ danger: row.overdueCount > 0 }">QH: {{ row.overdueCount }}</span>
              <span v-if="row.missingInfoCount">Thiếu: {{ row.missingInfoCount }}</span>
              <span v-if="row.needsConfirmationCount">CXN: {{ row.needsConfirmationCount }}</span>
              <span v-if="row.oldestOpenAgeMinutes !== null">Cũ: {{ formatAge(row.oldestOpenAgeMinutes) }}</span>
            </span>
            <span class="archive-workload-bar">
              <i :style="{ width: `${scorePercent(row)}%` }" />
            </span>
          </span>
        </button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';

interface ArchiveUserWorkloadRow {
  userId: string | null;
  userName: string;
  avatarUrl: string | null;
  departmentId: string | null;
  departmentName: string | null;
  openCount: number;
  urgentCount: number;
  overdueCount: number;
  missingInfoCount: number;
  needsConfirmationCount: number;
  oldestOpenAt: string | null;
  oldestOpenAgeMinutes: number | null;
  workloadScore: number;
  warningLevel: 'normal' | 'warning' | 'danger';
}

interface ArchiveWorkloadSummary {
  scope: {
    departmentId: string | null;
    departmentName: string | null;
    generatedAt: string;
  };
  totals: {
    openCount: number;
    urgentCount: number;
    overdueCount: number;
    missingInfoCount: number;
    needsConfirmationCount: number;
    unassignedCount: number;
  };
  users: ArchiveUserWorkloadRow[];
}

const props = defineProps<{
  departmentId?: string;
  selectedUserId?: string;
  refreshKey?: number;
  recordType?: string;
  priority?: string;
  requiresConfirmation?: string;
}>();

const emit = defineEmits<{
  (event: 'select-user', userId: string): void;
}>();

const authStore = useAuthStore();
const collapsedStorageKey = computed(() => `archive-workload-report-collapsed:${authStore.user?.id || 'default'}`);
const followFiltersStorageKey = computed(() => `archive-workload-report-follow-filters:${authStore.user?.id || 'default'}`);
const savedCollapsed = localStorage.getItem(collapsedStorageKey.value);
const collapsed = ref(savedCollapsed === null ? authStore.user?.role === 'member' : savedCollapsed === 'true');
const savedFollowFilters = localStorage.getItem(followFiltersStorageKey.value);
const followCurrentFilters = ref(savedFollowFilters === 'true');
const loading = ref(false);
const error = ref('');
const summary = ref<ArchiveWorkloadSummary | null>(null);
let lastFetchKey = '';

const rows = computed(() => summary.value?.users || []);
const collapsedRows = computed(() => rows.value.filter((row) => row.openCount > 0));
const activeUserCount = computed(() => rows.value.filter((row) => row.openCount > 0).length);
const maxScore = computed(() => Math.max(1, ...rows.value.map((row) => row.workloadScore)));

watch(collapsedStorageKey, () => {
  const saved = localStorage.getItem(collapsedStorageKey.value);
  collapsed.value = saved === null ? authStore.user?.role === 'member' : saved === 'true';
});

watch(followFiltersStorageKey, () => {
  const saved = localStorage.getItem(followFiltersStorageKey.value);
  followCurrentFilters.value = saved === 'true';
});

watch(followCurrentFilters, (value) => {
  localStorage.setItem(followFiltersStorageKey.value, String(value));
});

watch(
  () => [
    props.departmentId || '',
    props.refreshKey || 0,
    followCurrentFilters.value ? '1' : '0',
    followCurrentFilters.value ? (props.recordType || '') : '',
    followCurrentFilters.value ? (props.priority || '') : '',
    followCurrentFilters.value ? (props.requiresConfirmation || '') : '',
  ],
  () => {
    void fetchSummary();
  },
  { immediate: true },
);

function toggleCollapsed() {
  collapsed.value = !collapsed.value;
  localStorage.setItem(collapsedStorageKey.value, String(collapsed.value));
}

async function fetchSummary() {
  const fetchKey = [
    props.departmentId || '',
    props.refreshKey || 0,
    followCurrentFilters.value ? '1' : '0',
    followCurrentFilters.value ? (props.recordType || '') : '',
    followCurrentFilters.value ? (props.priority || '') : '',
    followCurrentFilters.value ? (props.requiresConfirmation || '') : '',
  ].join(':');
  if (loading.value && fetchKey === lastFetchKey) return;
  lastFetchKey = fetchKey;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/archive/workload-summary', {
      params: {
        departmentId: props.departmentId || undefined,
        includeUnassigned: 'true',
        followCurrentFilters: followCurrentFilters.value ? 'true' : undefined,
        recordType: followCurrentFilters.value ? props.recordType || undefined : undefined,
        priority: followCurrentFilters.value ? props.priority || undefined : undefined,
        requiresConfirmation: followCurrentFilters.value ? props.requiresConfirmation || undefined : undefined,
      },
    });
    summary.value = data;
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Không tải được báo cáo';
  } finally {
    loading.value = false;
  }
}

function selectRow(row: ArchiveUserWorkloadRow) {
  emit('select-user', isSelected(row) ? '__all__' : (row.userId || '__unassigned__'));
}

function isSelected(row: ArchiveUserWorkloadRow) {
  return row.userId
    ? props.selectedUserId === row.userId
    : props.selectedUserId === '__unassigned__';
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return name;
  return parts.slice(-2).join(' ');
}

function initials(name: string) {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('');
  return letters.toUpperCase() || '?';
}

function formatAge(minutes: number) {
  if (minutes < 60) return `${minutes}p`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}g`;
  return `${Math.floor(hours / 24)}n`;
}

function rowTooltip(row: ArchiveUserWorkloadRow) {
  return [
    row.userName,
    `Tồn đọng: ${row.openCount}`,
    `Gấp/Uu tiên: ${row.urgentCount}`,
    `Quá hạn: ${row.overdueCount}`,
    `Thiếu thông tin: ${row.missingInfoCount}`,
    `Cần xác nhận: ${row.needsConfirmationCount}`,
    row.oldestOpenAgeMinutes === null ? '' : `Cũ nhất: ${formatAge(row.oldestOpenAgeMinutes)}`,
  ].filter(Boolean).join('\n');
}

function scorePercent(row: ArchiveUserWorkloadRow) {
  return Math.max(6, Math.min(100, Math.round((row.workloadScore / maxScore.value) * 100)));
}
</script>

<style scoped>
.archive-workload-report {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
  min-height: 188px;
  height: auto;
  margin-top: 8px;
  margin-bottom: 12px;
  padding: 10px;
  flex: 1 1 260px;
  border: 1px solid #d9e0ea;
  border-radius: 8px;
  background: #fbfcfe;
}

.archive-workload-report.collapsed {
  min-height: 0;
  height: auto;
  margin-bottom: 12px;
  flex: 0 0 auto;
  grid-template-rows: auto;
}

.archive-workload-head {
  display: grid;
  min-width: 0;
  align-items: center;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
}

.archive-workload-title,
.archive-workload-actions button,
.archive-workload-collapsed button,
.archive-workload-row,
.archive-workload-more,
.archive-workload-state button {
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.archive-workload-title {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  color: #172033;
  font-size: 13px;
  font-weight: 800;
  text-align: left;
}

.archive-workload-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-workload-title strong {
  display: inline-flex;
  min-width: 28px;
  height: 24px;
  padding: 0 8px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #e8efff;
  color: #1d4ed8;
  font-size: 12px;
  line-height: 1;
}

.archive-workload-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
}

.archive-workload-scope-toggle {
  display: inline-flex;
  grid-column: 1 / -1;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  min-height: 24px;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border: 1px solid #d6ddea;
  border-radius: 999px;
  background: #fff;
  color: #42526b;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.archive-workload-scope-toggle span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-workload-scope-toggle input {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  margin: 0;
}

.archive-workload-actions button {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: #64748b;
}

.archive-workload-actions button:hover,
.archive-workload-row:hover,
.archive-workload-collapsed button:hover {
  background: #eef4ff;
}

.archive-workload-collapsed {
  display: flex;
  min-width: 0;
  max-height: 86px;
  align-items: center;
  align-content: flex-start;
  flex-wrap: wrap;
  gap: 5px;
  overflow-y: auto;
  padding-right: 2px;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  color: #64748b;
  font-size: 10px;
}

.archive-workload-collapsed button {
  display: inline-flex;
  max-width: 92px;
  min-height: 24px;
  padding: 0 6px;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  border: 1px solid #dbe3ef;
  border-radius: 999px;
  color: #334155;
}

.archive-workload-collapsed button.active {
  border-color: #2563eb;
  background: #eaf2ff;
  color: #174ea6;
}

.archive-workload-collapsed button span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-workload-body {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 9px;
  padding-right: 3px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.archive-workload-meta {
  display: flex;
  min-height: 18px;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: #64748b;
  font-size: 10px;
  font-weight: 650;
}

.archive-workload-row {
  display: grid;
  min-width: 0;
  min-height: 88px;
  padding: 10px 9px;
  align-items: center;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 9px;
  border: 1px solid #d9e1ec;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .03);
  text-align: left;
}

.archive-workload-row.active {
  border-color: #2563eb;
  background: #edf4ff;
}

.archive-workload-row.warning {
  border-left: 4px solid #d97706;
}

.archive-workload-row.danger {
  border-left: 4px solid #dc2626;
}

.archive-workload-avatar {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #e2e8f0;
  color: #334155;
  font-size: 11px;
  font-weight: 800;
}

.archive-workload-avatar.normal {
  background: #e7f8ef;
  color: #137333;
}

.archive-workload-avatar.warning {
  background: #fff4dd;
  color: #b45309;
}

.archive-workload-avatar.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.archive-workload-info {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.archive-workload-line {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.archive-workload-line strong {
  overflow: hidden;
  color: #172033;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 16px;
}

.archive-workload-line b {
  flex: 0 0 auto;
  color: #0f172a;
  font-size: 13px;
  line-height: 16px;
}

.archive-workload-chips {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px 9px;
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
}

.archive-workload-chips span {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-workload-chips .danger {
  color: #b91c1c;
}

.archive-workload-bar {
  display: block;
  width: 100%;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: #e5eaf1;
}

.archive-workload-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #2563eb;
}

.archive-workload-more {
  min-height: 26px;
  border: 1px dashed #cbd5e1;
  border-radius: 7px;
  color: #1d4ed8;
  font-size: 10px;
  font-weight: 800;
}

.archive-workload-state {
  display: flex;
  min-height: 42px;
  padding: 8px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: #64748b;
  text-align: center;
  font-size: 11px;
}

.archive-workload-state.error {
  display: grid;
  color: #b91c1c;
}

.archive-workload-state button {
  color: #1d4ed8;
  font-weight: 800;
}
</style>
