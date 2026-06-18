<template>
  <v-menu
    v-model="menuOpen"
    offset-y
    :close-on-content-click="false"
    max-width="420"
    @update:model-value="onMenuToggle"
  >
    <template #activator="{ props: menuProps }">
      <v-btn icon variant="text" v-bind="menuProps" class="mr-1">
        <v-badge
          :content="badgeCount"
          :model-value="badgeCount > 0"
          color="error"
          overlap
        >
          <v-icon>{{ badgeCount > 0 ? 'mdi-bell-ring-outline' : 'mdi-bell-outline' }}</v-icon>
        </v-badge>
      </v-btn>
    </template>

    <v-card class="noti-card">
      <div class="noti-head">
        <div>
          <div class="noti-title">Thông báo</div>
          <div class="noti-subtitle" v-if="ackRequiredCount > 0">
            {{ ackRequiredCount }} thông báo cần xác nhận
          </div>
        </div>
        <div class="noti-actions">
          <v-btn
            size="small"
            variant="text"
            :disabled="!hasMarkableUnread"
            @click.stop="markAllRead"
          >
            Đánh dấu đã đọc
          </v-btn>
        </div>
      </div>

      <div class="noti-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="noti-tab"
          :class="{ active: activeTab === tab.value }"
          type="button"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
          <span v-if="tab.count > 0" class="noti-tab-count">{{ tab.count }}</span>
        </button>
      </div>

      <v-divider />

      <div class="noti-list" v-if="filteredNotifications.length > 0">
        <button
          v-for="n in filteredNotifications"
          :key="n.id"
          class="noti-item"
          :class="{ unread: isUnread(n), ack: needsAck(n) }"
          type="button"
          @click="handleClick(n)"
        >
          <span class="noti-dot" v-if="isUnread(n)"></span>
          <span class="noti-icon" :class="n.severity">
            <v-icon size="18">{{ iconFor(n) }}</v-icon>
          </span>
          <span class="noti-body">
            <span class="noti-item-title">{{ n.title }}</span>
            <span class="noti-detail">{{ n.detail }}</span>
            <span class="noti-meta">
              {{ relativeTime(n.createdAt) }}
              <span v-if="needsAck(n)" class="ack-badge">Cần xác nhận</span>
            </span>
          </span>
          <span class="noti-item-actions" v-if="needsAck(n)">
            <button class="ack-btn" type="button" @click.stop="acknowledge(n)">Đã nhận</button>
          </span>
        </button>
      </div>

      <div v-else class="noti-empty">
        <v-icon size="34" color="grey-lighten-1">mdi-bell-check-outline</v-icon>
        <div>Không có thông báo phù hợp</div>
      </div>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { io, type Socket } from 'socket.io-client';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';

type NotificationTab = 'all' | 'unread' | 'ack';

interface NotificationAction {
  kind: string;
  path: string;
  storyId?: string;
  messageId?: string;
  accountId?: string;
}

interface Notification {
  id: string;
  source: string;
  sourceId?: string;
  type: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  detail: string;
  createdAt: string;
  readAt: string | null;
  seenAt: string | null;
  requiresAck: boolean;
  acknowledgedAt: string | null;
  action?: NotificationAction;
}

const router = useRouter();
const authStore = useAuthStore();
const notifications = ref<Notification[]>([]);
const badgeCount = ref(0);
const ackRequiredCount = ref(0);
const activeTab = ref<NotificationTab>('all');
const menuOpen = ref(false);
let interval: ReturnType<typeof setInterval> | null = null;
let notificationSocket: Socket | null = null;
let realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let notificationSocketOrgId: string | null = null;

const filteredNotifications = computed(() => {
  if (activeTab.value === 'unread') return notifications.value.filter(isUnread);
  if (activeTab.value === 'ack') return notifications.value.filter(needsAck);
  return notifications.value;
});

const hasMarkableUnread = computed(() =>
  notifications.value.some((n) => !n.requiresAck && !n.readAt)
);

const tabs = computed(() => [
  { value: 'all' as const, label: 'Tất cả', count: notifications.value.length },
  { value: 'unread' as const, label: 'Chưa đọc', count: notifications.value.filter(isUnread).length },
  { value: 'ack' as const, label: 'Cần xác nhận', count: notifications.value.filter(needsAck).length },
]);

function isUnread(n: Notification) {
  if (n.requiresAck) return !n.acknowledgedAt;
  return !n.readAt;
}

function needsAck(n: Notification) {
  return n.requiresAck && !n.acknowledgedAt;
}

function iconFor(n: Notification) {
  if (n.type === 'message_recalled') return 'mdi-alert-octagon-outline';
  if (n.severity === 'error') return 'mdi-alert-circle-outline';
  if (n.severity === 'warning') return 'mdi-alert-outline';
  if (n.severity === 'success') return 'mdi-check-circle-outline';
  return 'mdi-information-outline';
}

function relativeTime(value: string) {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút trước`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} giờ trước`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} ngày trước`;
  return new Date(value).toLocaleDateString('vi-VN');
}

async function fetchNotifications() {
  try {
    const res = await api.get('/notifications');
    notifications.value = res.data.notifications || [];
    badgeCount.value = res.data.unreadCount ?? notifications.value.filter(isUnread).length;
    ackRequiredCount.value = res.data.ackRequiredCount ?? notifications.value.filter(needsAck).length;
  } catch {
    // Keep bell quiet if notification fetch fails.
  }
}

function eventTargetsCurrentUser(event: any) {
  const currentUser = authStore.user;
  if (!currentUser) return false;
  if (event?.orgId && event.orgId !== currentUser.orgId) return false;
  if (event?.userId && event.userId !== currentUser.id) return false;
  return true;
}

function scheduleRealtimeRefresh() {
  if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = setTimeout(() => {
    realtimeRefreshTimer = null;
    void fetchNotifications();
  }, 150);
}

function setupNotificationSocket() {
  const orgId = authStore.user?.orgId;
  if (!orgId || notificationSocket) return;

  notificationSocket = io({ transports: ['websocket', 'polling'] });
  notificationSocketOrgId = orgId;
  const joinOrg = () => notificationSocket?.emit('org:join', { orgId });
  const onNotificationChange = (event: any) => {
    if (eventTargetsCurrentUser(event)) scheduleRealtimeRefresh();
  };

  notificationSocket.on('connect', joinOrg);
  notificationSocket.on('notification:new', onNotificationChange);
  notificationSocket.on('notification:updated', onNotificationChange);
  notificationSocket.on('notification:count', onNotificationChange);

  if (notificationSocket.connected) joinOrg();
}

function teardownNotificationSocket() {
  if (realtimeRefreshTimer) {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = null;
  }
  notificationSocket?.removeAllListeners('connect');
  notificationSocket?.removeAllListeners('notification:new');
  notificationSocket?.removeAllListeners('notification:updated');
  notificationSocket?.removeAllListeners('notification:count');
  notificationSocket?.disconnect();
  notificationSocket = null;
  notificationSocketOrgId = null;
}

async function markSeen() {
  const targets = notifications.value.filter((n) => n.id.startsWith('archive-') && !n.seenAt);
  await Promise.allSettled(targets.map((n) => api.patch(`/notifications/${n.id}/seen`)));
  for (const n of targets) n.seenAt = new Date().toISOString();
}

async function onMenuToggle(open: boolean) {
  if (!open) return;
  await fetchNotifications();
  await markSeen();
}

async function markRead(n: Notification) {
  if (n.readAt) return;
  await api.patch(`/notifications/${n.id}/read`);
  n.readAt = new Date().toISOString();
  n.seenAt = n.seenAt || n.readAt;
  if (!n.requiresAck) badgeCount.value = Math.max(0, badgeCount.value - 1);
}

async function acknowledge(n: Notification) {
  if (!needsAck(n)) return;
  await api.patch(`/notifications/${n.id}/acknowledge`);
  const now = new Date().toISOString();
  n.acknowledgedAt = now;
  n.readAt = n.readAt || now;
  n.seenAt = n.seenAt || now;
  badgeCount.value = Math.max(0, badgeCount.value - 1);
  ackRequiredCount.value = Math.max(0, ackRequiredCount.value - 1);
}

async function markAllRead() {
  await api.post('/notifications/mark-all-read');
  const computedTargets = notifications.value.filter((n) => !n.requiresAck && !n.readAt && !n.id.startsWith('archive-'));
  await Promise.allSettled(computedTargets.map((n) => api.patch(`/notifications/${n.id}/read`)));
  const now = new Date().toISOString();
  for (const n of notifications.value) {
    if (!n.requiresAck) {
      n.readAt = n.readAt || now;
      n.seenAt = n.seenAt || now;
    }
  }
  badgeCount.value = notifications.value.filter(isUnread).length;
}

async function handleClick(n: Notification) {
  try {
    await markRead(n);
  } catch {
    // Navigation should still work for computed notifications.
  }
  const path = n.action?.path;
  if (path) {
    const targetPath = n.action?.kind?.startsWith('open_archive') && n.action.storyId
      ? {
          path: '/archive',
          query: {
            storyId: n.action.storyId,
            messageId: n.action.messageId || undefined,
            openAt: String(Date.now()),
          },
        }
      : path;
    router.push(targetPath);
  }
  else if (n.id.includes('unreplied')) router.push('/chat');
  else if (n.id.includes('apt')) router.push('/appointments');
  else if (n.id.includes('zalo')) router.push('/zalo-accounts');
}

onMounted(() => {
  fetchNotifications();
  setupNotificationSocket();
  interval = setInterval(fetchNotifications, 30000);
});

watch(
  () => authStore.user?.orgId,
  (orgId) => {
    if (!orgId) {
      teardownNotificationSocket();
      return;
    }
    if (notificationSocketOrgId && notificationSocketOrgId !== orgId) {
      teardownNotificationSocket();
    }
    setupNotificationSocket();
    void fetchNotifications();
  },
);

onUnmounted(() => {
  if (interval) clearInterval(interval);
  teardownNotificationSocket();
});
</script>

<style scoped>
.noti-card {
  width: 420px;
  max-height: 560px;
  display: flex;
  flex-direction: column;
}

.noti-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 14px 8px;
}

.noti-title {
  font-weight: 800;
  font-size: 18px;
  color: #0f172a;
}

.noti-subtitle {
  margin-top: 2px;
  color: #dc2626;
  font-size: 12px;
  font-weight: 600;
}

.noti-actions {
  white-space: nowrap;
}

.noti-tabs {
  display: flex;
  gap: 6px;
  padding: 0 12px 10px;
}

.noti-tab {
  border: 0;
  border-radius: 999px;
  padding: 7px 11px;
  background: transparent;
  color: #475569;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.noti-tab.active {
  background: #e8f0ff;
  color: #0b57d0;
}

.noti-tab-count {
  margin-left: 5px;
  min-width: 18px;
  display: inline-flex;
  justify-content: center;
  border-radius: 999px;
  background: #dbeafe;
  color: #0b57d0;
  font-size: 11px;
}

.noti-list {
  overflow-y: auto;
  max-height: 440px;
}

.noti-item {
  width: 100%;
  border: 0;
  border-bottom: 1px solid #eef2f7;
  background: #fff;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  text-align: left;
  padding: 11px 12px;
  cursor: pointer;
  color: inherit;
  min-width: 0;
}

.noti-item:hover {
  background: #f8fafc;
}

.noti-item.unread {
  background: #f5f9ff;
}

.noti-dot {
  flex: 0 0 8px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #2563eb;
  margin-top: 12px;
}

.noti-item:not(.unread) .noti-icon {
  margin-left: 16px;
}

.noti-icon {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eff6ff;
  color: #2563eb;
}

.noti-icon.warning {
  background: #fff7ed;
  color: #ea580c;
}

.noti-icon.error {
  background: #fef2f2;
  color: #dc2626;
}

.noti-icon.success {
  background: #ecfdf5;
  color: #059669;
}

.noti-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.noti-item-title {
  font-size: 13px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.3;
}

.noti-detail {
  font-size: 12px;
  color: #64748b;
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.noti-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #94a3b8;
  font-size: 11px;
  margin-top: 2px;
}

.ack-badge {
  color: #b91c1c;
  background: #fee2e2;
  border-radius: 999px;
  padding: 2px 7px;
  font-weight: 800;
}

.noti-item-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  padding-left: 4px;
}

.ack-btn {
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff;
  color: #dc2626;
  padding: 5px 8px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.ack-btn:hover {
  background: #fef2f2;
}

.noti-empty {
  min-height: 150px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 13px;
}
</style>
