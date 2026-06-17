<template>
  <div class="archive-page">
    <header class="archive-header">
      <div class="archive-summary">
        <p class="eyebrow">HỒ SƠ TRAO ĐỔI</p>
        <h1>{{ archiveHeading }}</h1>
        <p>Quản lý nội dung trao đổi đã lưu.</p>
      </div>
      <div class="header-actions">
        <div class="stats-panel">
          <div class="quick-stat"><strong>{{ total }}</strong><span>Tổng hồ sơ</span></div>
          <div class="quick-stat"><strong>{{ pendingCount }}</strong><span>Chưa hoàn thành</span></div>
          <div class="quick-stat danger"><strong>{{ failedCount }}</strong><span>Backup lỗi</span></div>
        </div>
        <v-btn
          v-if="canManageStatuses"
          class="config-trigger"
          variant="text"
          icon="mdi-tune-variant"
          title="Cấu hình trạng thái hồ sơ"
          @click="openStatusManager"
        />
        <v-btn
          v-if="canConfigure"
          class="config-trigger"
          variant="text"
          icon="mdi-cog-outline"
          title="Cấu hình Google"
          @click="openConfig"
        />
      </div>
    </header>

    <section class="archive-toolbar">
      <div class="status-tabs">
        <button
          v-for="option in statusOptions"
          :key="option.value"
          :class="{ active: filters.status === option.value }"
          @click="selectStatusFilter(option.value)"
        >
          <span>{{ option.label }}</span>
          <span v-if="statusTabCount(option) !== null" class="status-tab-count">
            {{ statusTabCount(option) }}
          </span>
        </button>
      </div>
    </section>

    <div class="archive-main-layout">
      <aside class="archive-filter-panel">
        <div class="archive-filter-header">
          <span>Bộ lọc</span>
          <button type="button" @click="resetFilters">Xóa lọc</button>
        </div>
        <div class="archive-filter-view">
          <button :class="{ active: viewMode === 'list' }" @click="setViewMode('list')">
            <v-icon size="18">mdi-view-list-outline</v-icon>
            <span>Danh sách</span>
          </button>
          <button :class="{ active: viewMode === 'kanban' }" @click="setViewMode('kanban')">
            <v-icon size="18">mdi-view-column-outline</v-icon>
            <span>Kanban</span>
          </button>
        </div>
        <div class="archive-filter-search">
          <v-text-field
            v-model="filters.q"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            placeholder="Tìm kiếm hồ sơ..."
            prepend-inner-icon="mdi-magnify"
            @keyup.enter="applyFilters"
            @click:clear="applyFilters"
          />
        </div>
        <div class="archive-filter-fields">
        <label class="archive-filter-field archive-customer-filter">
          <span>Khách hàng / nhóm / SĐT</span>
          <v-autocomplete
            v-model="filters.conversationId"
            v-model:search="customerSearch"
            :items="customerOptions"
            :loading="customerLoading"
            item-title="label"
            item-value="conversationId"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            no-filter
            placeholder="Nhập ít nhất 2 ký tự"
            no-data-text="Không có khách hàng hoặc nhóm phù hợp"
            @update:model-value="applyFilters"
            @keyup.enter="applyCustomerTextSearch"
            @click:clear="clearCustomerFilter"
          >
            <template #item="{ props, item }">
              <v-list-item v-bind="props" :subtitle="item.subtitle">
                <template #prepend>
                  <v-avatar size="28" color="grey-lighten-3">
                    <v-img v-if="item.avatarUrl" :src="item.avatarUrl" />
                    <v-icon v-else size="16">
                      {{ item.type === 'group' ? 'mdi-account-group-outline' : 'mdi-account-outline' }}
                    </v-icon>
                  </v-avatar>
                </template>
              </v-list-item>
            </template>
          </v-autocomplete>
        </label>
        <label class="archive-filter-field">
          <span>Phạm vi / Người phụ trách</span>
        <v-autocomplete
          v-model="filters.assignedUserId"
          v-model:search="assignedUserSearch"
          :items="filteredUserOptions"
          :menu-props="{ contentClass: 'archive-assignee-menu' }"
          item-title="title"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          no-filter
          placeholder="Hồ sơ của tôi hoặc nhân viên được quyền xem"
          no-data-text="Không có người phụ trách phù hợp"
          @update:model-value="applyFilters"
        >
          <template #append-item>
            <div class="archive-assignee-menu-footer" @mousedown.prevent>
              <v-list-item
                v-if="filters.assignedUserId"
                prepend-icon="mdi-star-outline"
                title="Đặt lựa chọn này làm mặc định"
                :subtitle="selectedUserOption?.title"
                @click="saveAssignedUserDefault"
              />
              <v-list-item
                v-if="assignedUserDefaultId"
                prepend-icon="mdi-star-off-outline"
                title="Bỏ mặc định đã lưu"
                @click="clearAssignedUserDefault"
              />
            </div>
          </template>
        </v-autocomplete>
        </label>
        <label class="archive-filter-field">
          <span>Phòng ban</span>
        <v-autocomplete
          v-model="filters.departmentId"
          :items="departmentOptions"
          item-title="name"
          item-value="id"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          placeholder="Tất cả phòng ban"
          @update:model-value="handleDepartmentFilterChange"
        />
        </label>
        <details class="archive-filter-record-type">
          <summary>
            <span>Loại hồ sơ</span>
            <v-icon size="18">mdi-chevron-down</v-icon>
          </summary>
          <v-select
            v-model="filters.recordType"
            :items="recordTypeOptions"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            placeholder="Tất cả loại hồ sơ"
            @update:model-value="applyFilters"
          />
        </details>
        <div class="archive-filter-footer">
          <div class="archive-filter-recall">
            <div>
              <v-icon size="18">mdi-alert-circle-outline</v-icon>
              <span>Tin nhắn bị thu hồi</span>
            </div>
            <button
              class="archive-recall-toggle"
              :class="{ active: filters.recallState === 'recalled' }"
              type="button"
              role="switch"
              :aria-checked="filters.recallState === 'recalled'"
              aria-label="Lọc hồ sơ có tin nhắn bị thu hồi"
              @click="toggleRecallFilter"
            >
              <span />
            </button>
          </div>
          <v-btn class="archive-filter-refresh" variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="fetchStories">
            Làm mới
          </v-btn>
        </div>
        </div>
      </aside>

      <main class="archive-results">
        <div v-if="loading && stories.length === 0 && viewMode === 'list'" class="center-state">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <section v-else-if="viewMode === 'list'" class="archive-table-wrap">
          <table v-if="stories.length" class="archive-table">
            <thead>
              <tr>
                <th>Đơn hàng</th>
                <th>Khách hàng</th>
                <th>Ngày/Giờ nhận</th>
                <th class="message-column">Tin nhắn cuối</th>
                <th>Phòng ban</th>
                <th>Nhân viên</th>
                <th>Trạng thái</th>
                <th class="action-column">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="story in stories" :key="story.id" class="clickable-story-row" @click="openDetail(story)">
                <td><strong>{{ story.title || story.conversationName }}</strong></td>
                <td>
                  <strong>{{ story.conversationName }}</strong>
                  <small>{{ story.contactPhone || accountDisplayName(story) || 'Không có SĐT' }}</small>
                </td>
                <td class="received-at-cell">
                  <strong>{{ formatDate(story.receivedAt || firstMessageAt(story) || story.createdAt) }}</strong>
                  <small>Tin đầu tiên</small>
                </td>
                <td>
                  <p class="last-message">{{ lastMessagePreview(story) }}</p>
                  <div class="table-message-meta">
                    <span><v-icon size="14">mdi-message-text-outline</v-icon>{{ story.messages.length }}</span>
                    <span><v-icon size="14">mdi-image-outline</v-icon>{{ mediaCount(story) }}</span>
                    <span v-if="recalledMessageCount(story)" class="recalled-count">
                      <v-icon size="14">mdi-alert-circle-outline</v-icon>{{ recalledMessageCount(story) }}
                    </span>
                    <span>{{ formatDate(story.updatedAt) }}</span>
                  </div>
                </td>
                <td>{{ story.department?.name || 'Chưa có phòng ban' }}</td>
                <td>
                  {{ storyAssigneeLabel(story) }}
                  <span v-if="pendingHandoverLabel(story)" class="handover-inline-chip">
                    <v-icon size="13">mdi-account-arrow-right-outline</v-icon>
                    {{ pendingHandoverLabel(story) }}
                  </span>
                  <span
                    v-else-if="assignmentOriginLabel(story)"
                    class="handover-inline-chip assignment-origin"
                    :class="assignmentOriginClass(story)"
                  >
                    <v-icon size="13">{{ assignmentOriginIcon(story) }}</v-icon>
                    {{ assignmentOriginLabel(story) }}
                  </span>
                  <span v-if="isDeletedZaloAccount(story)" class="deleted-account-note">
                    <v-icon size="14">mdi-account-off-outline</v-icon>
                    Tài khoản Zalo đã bị xóa
                  </span>
                </td>
                <td>
                  <span class="status-pill" :style="statusPillStyle(storyStatus(story))">
                    {{ storyStatus(story).name }}
                  </span>
                </td>
                <td class="action-column">
                  <v-menu location="bottom end">
                    <template #activator="{ props }">
                      <button v-bind="props" class="table-action-btn" title="Chuyển trạng thái" @click.stop>
                        <v-icon size="18">mdi-file-edit-outline</v-icon>
                      </button>
                    </template>
                    <v-list density="compact" min-width="210">
                      <v-list-subheader>Chuyển trạng thái</v-list-subheader>
                      <v-list-item
                        v-for="option in transitionOptions(story)"
                        :key="option.id"
                        :active="story.statusDefinition?.id === option.id"
                        :title="option.name"
                        :disabled="!canUpdateStoryStatus(story)"
                        @click="quickChangeStatus(story, option.id)"
                      >
                        <template #prepend>
                          <v-icon :color="statusColor(option)" size="18">{{ option.icon }}</v-icon>
                        </template>
                      </v-list-item>
                      <v-divider />
                      <v-list-item
                        title="Cập nhật kết quả chi tiết"
                        prepend-icon="mdi-text-box-edit-outline"
                        :disabled="!canUpdateStoryStatus(story)"
                        @click="openStatusDialog(story)"
                      />
                      <v-list-item
                        v-if="['failed', 'partial'].includes(story.backupStatus) && canUpdateStoryStatus(story)"
                        title="Backup lại"
                        prepend-icon="mdi-cloud-refresh-outline"
                        @click="retryBackup(story)"
                      />
                      <v-list-item title="Xem chi tiết" prepend-icon="mdi-eye-outline" @click="openDetail(story)" />
                    </v-list>
                  </v-menu>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="stories.length === 0" class="center-state empty">
            <v-icon size="56">mdi-archive-outline</v-icon>
            <h3>Chưa có hồ sơ phù hợp</h3>
            <p>Vào Tin nhắn, chọn các tin cần lưu rồi tạo hoặc bổ sung vào hồ sơ.</p>
          </div>
        </section>

        <section v-else class="archive-kanban-board">
          <div v-if="kanbanLoadError" class="archive-kanban-error">
            <v-icon size="30">mdi-alert-circle-outline</v-icon>
            <strong>Không thể tải dữ liệu Kanban</strong>
            <span>{{ kanbanLoadError }}</span>
            <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" @click="fetchStories">
              Thử lại
            </v-btn>
          </div>
          <div
            v-for="column in kanbanColumns"
            v-else
            :key="column.id"
            class="archive-kanban-column"
            :style="kanbanColumnStyle(column)"
          >
            <header class="archive-kanban-column-head">
              <span class="archive-kanban-column-title">
                <i aria-hidden="true" />
                <span :title="column.name">{{ column.name }}</span>
              </span>
              <strong>{{ statusCountFor(column) }}</strong>
            </header>
            <div class="archive-kanban-items">
              <template v-if="loading">
                <div v-for="index in 2" :key="index" class="archive-kanban-skeleton">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </template>
              <article
                v-for="story in loading ? [] : (storiesByStatus[column.id] || [])"
                :key="story.id"
                class="archive-kanban-card"
                @click="openDetail(story)"
              >
                <div class="archive-kanban-card-head">
                  <span>{{ recordTypeLabel(story.recordType) }}</span>
                  <div class="archive-kanban-head-meta">
                    <small>{{ formatCompactDate(story.updatedAt) }}</small>
                    <v-tooltip
                      v-if="['failed', 'partial'].includes(story.backupStatus)"
                      :text="story.backupError || 'Backup hồ sơ bị lỗi'"
                      location="top"
                      content-class="archive-warning-tooltip"
                    >
                      <template #activator="{ props }">
                        <span
                          v-bind="props"
                          class="backup-warning archive-kanban-warning"
                          aria-label="Backup hồ sơ bị lỗi"
                          @click.stop
                        >
                          <v-icon size="16">mdi-alert</v-icon>
                        </span>
                      </template>
                    </v-tooltip>
                  </div>
                </div>
                <h3 :title="story.title || story.conversationName">
                  {{ story.title || story.conversationName }}
                </h3>
                <p class="archive-kanban-preview">{{ kanbanConversationPreview(story) }}</p>
                <div class="archive-kanban-counts">
                  <span><v-icon size="14">mdi-message-text-outline</v-icon>{{ story.messages.length }}</span>
                  <span><v-icon size="14">mdi-image-multiple-outline</v-icon>{{ mediaCount(story) }}</span>
                  <span v-if="recalledMessageCount(story)" class="recalled-count">
                    <v-icon size="14">mdi-message-alert-outline</v-icon>{{ recalledMessageCount(story) }} thu hồi
                  </span>
                </div>
                <footer class="archive-kanban-card-footer">
                  <div>
                    <span :title="story.department?.name || 'Chưa có phòng ban'">
                      {{ story.department?.name || 'Chưa có phòng ban' }}
                    </span>
                    <strong :title="story.assignedUser?.fullName || 'Chưa phân công'">
                      {{ story.assignedUser?.fullName || 'Chưa phân công' }}
                    </strong>
                    <span v-if="pendingHandoverLabel(story)" class="handover-inline-chip is-kanban">
                      <v-icon size="12">mdi-account-arrow-right-outline</v-icon>
                      {{ pendingHandoverLabel(story) }}
                    </span>
                    <span
                      v-else-if="assignmentOriginLabel(story)"
                      class="handover-inline-chip assignment-origin is-kanban"
                      :class="assignmentOriginClass(story)"
                    >
                      <v-icon size="12">{{ assignmentOriginIcon(story) }}</v-icon>
                      {{ assignmentOriginLabel(story) }}
                    </span>
                    <v-tooltip
                      v-if="isDeletedZaloAccount(story)"
                      text="Tài khoản Zalo của hồ sơ đã bị xóa"
                      location="top"
                      content-class="archive-warning-tooltip"
                    >
                      <template #activator="{ props }">
                        <span v-bind="props" class="archive-kanban-deleted-account">
                          <v-icon size="13">mdi-account-off-outline</v-icon>
                          Zalo đã bị xóa
                        </span>
                      </template>
                    </v-tooltip>
                  </div>
                  <v-menu location="bottom end">
                    <template #activator="{ props }">
                      <button
                        v-bind="props"
                        class="archive-kanban-action"
                        type="button"
                        @click.stop
                      >
                        <v-icon size="14">mdi-file-edit-outline</v-icon>
                        Thao tác
                      </button>
                    </template>
                    <v-list density="compact" min-width="220">
                      <v-list-subheader>Chuyển trạng thái</v-list-subheader>
                      <v-list-item
                        v-for="option in transitionOptions(story)"
                        :key="option.id"
                        :title="option.name"
                        :disabled="!canUpdateStoryStatus(story)"
                        @click="quickChangeStatus(story, option.id)"
                      >
                        <template #prepend>
                          <v-icon :color="statusColor(option)" size="18">{{ option.icon }}</v-icon>
                        </template>
                      </v-list-item>
                      <v-list-item
                        v-if="transitionOptions(story).length === 0"
                        title="Không có trạng thái phù hợp"
                        disabled
                      />
                      <v-divider />
                      <v-list-item
                        title="Cập nhật kết quả chi tiết"
                        prepend-icon="mdi-text-box-edit-outline"
                        :disabled="!canUpdateStoryStatus(story)"
                        @click="openStatusDialog(story)"
                      />
                      <v-list-item
                        v-if="['failed', 'partial'].includes(story.backupStatus) && canUpdateStoryStatus(story)"
                        title="Backup lại"
                        prepend-icon="mdi-cloud-refresh-outline"
                        @click="retryBackup(story)"
                      />
                      <v-list-item title="Xem chi tiết" prepend-icon="mdi-eye-outline" @click="openDetail(story)" />
                    </v-list>
                  </v-menu>
                </footer>
              </article>
              <div
                v-if="!loading && (storiesByStatus[column.id]?.length || 0) === 0"
                class="archive-kanban-empty"
              >
                {{ statusCountFor(column) > 0 ? 'Không có hồ sơ ở trang này' : 'Không có hồ sơ' }}
              </div>
            </div>
          </div>
        </section>
        <footer v-if="total > 0" class="archive-pagination">
          <div>
            <span>Tổng cộng: <strong>{{ total }}</strong> hồ sơ</span>
            <label>
              Hiển thị:
              <select v-model.number="pagination.limit" @change="changePage(1)">
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </label>
          </div>
          <div class="pagination-buttons">
            <button :disabled="pagination.page <= 1" @click="changePage(pagination.page - 1)">
              <v-icon size="18">mdi-chevron-left</v-icon>
            </button>
            <button
              v-for="pageNumber in visiblePages"
              :key="pageNumber"
              :class="{ active: pagination.page === pageNumber }"
              @click="changePage(pageNumber)"
            >{{ pageNumber }}</button>
            <button :disabled="pagination.page >= totalPages" @click="changePage(pagination.page + 1)">
              <v-icon size="18">mdi-chevron-right</v-icon>
            </button>
          </div>
        </footer>
      </main>
    </div>

    <v-dialog v-model="detailDialog" max-width="900" scrollable transition="archive-dialog-transition">
      <v-card v-if="selectedStory" class="detail-card" rounded="lg">
        <v-card-title class="detail-title">
          <div class="detail-title-content">
            <small>{{ recordTypeLabel(selectedStory.recordType) }}</small>
            <div v-if="!titleEditing" class="detail-title-row">
              <h2>{{ selectedStory.title || selectedStory.conversationName }}</h2>
              <v-btn
                v-if="canEditSelectedStoryTitle"
                icon="mdi-pencil-outline"
                size="small"
                variant="text"
                title="Sửa tiêu đề hồ sơ"
                @click="startTitleEdit"
              />
            </div>
            <div v-else class="title-edit-row">
              <div class="title-edit-fields">
                <v-text-field
                  :model-value="selectedStory.conversationName"
                  density="compact"
                  variant="outlined"
                  hide-details
                  readonly
                  label="Tên khách hàng / nhóm"
                />
                <v-text-field
                  v-model="titleDraft"
                  density="compact"
                  variant="outlined"
                  hide-details
                  autofocus
                  label="Nội dung bổ sung"
                  placeholder="Ví dụ: Đơn số 1"
                  @keyup.enter="saveTitle"
                  @keyup.esc="cancelTitleEdit"
                />
              </div>
              <v-btn color="primary" size="small" :loading="titleSaving" @click="saveTitle">Lưu</v-btn>
              <v-btn size="small" variant="text" @click="cancelTitleEdit">Hủy</v-btn>
            </div>
          </div>
          <v-btn icon="mdi-close" variant="text" @click="detailDialog = false" />
        </v-card-title>
        <v-card-text class="detail-body">
          <div class="detail-sticky-top">
            <div class="detail-meta">
              <span>{{ selectedStory.department?.name || 'Chưa có phòng ban' }}</span>
              <span>{{ selectedStory.assignedUser?.fullName || 'Chưa phân công' }}</span>
              <span :style="statusPillStyle(storyStatus(selectedStory))">
                {{ storyStatus(selectedStory).name }}
              </span>
              <span>{{ backupLabel(selectedStory.backupStatus) }}</span>
              <span v-if="isDeletedZaloAccount(selectedStory)" class="deleted-account-badge">
                <v-icon size="15">mdi-account-off-outline</v-icon>
                Tài khoản Zalo "{{ accountDisplayName(selectedStory) || 'Không rõ tên' }}" đã bị xóa
                <template v-if="selectedStory.zaloAccountDeletedAt">
                  lúc {{ formatDate(selectedStory.zaloAccountDeletedAt) }}
                </template>
              </span>
            </div>

            <div v-if="handoverContext?.pendingRequest" class="handover-pending">
              <v-icon size="18">mdi-account-arrow-right-outline</v-icon>
              <div>
                <strong>
                  Đang chờ {{ handoverContext.pendingRequest.toUser.fullName }} xác nhận bàn giao
                </strong>
                <span>
                  {{ handoverContext.pendingRequest.reason }}
                  · hết hạn {{ formatDate(handoverContext.pendingRequest.expiresAt) }}
                </span>
              </div>
            </div>

            <details v-if="handoverContext?.assignmentHistory?.length" class="assignment-history">
              <summary>Lịch sử người xử lý</summary>
              <div
                v-for="entry in handoverContext.assignmentHistory"
                :key="entry.id"
                class="assignment-history-row"
              >
                <span>
                  {{ entry.fromUser?.fullName || 'Chưa phân công' }}
                  <v-icon size="14">mdi-arrow-right</v-icon>
                  {{ entry.toUser.fullName }}
                </span>
                <small>{{ formatDate(entry.createdAt) }} · {{ entry.reason || entry.changeType }}</small>
              </div>
            </details>

            <div v-if="canRemoveSelectedStoryMessages" class="message-selection-bar">
              <label>
                <input
                  type="checkbox"
                  :checked="allMessagesSelected"
                  :indeterminate.prop="someMessagesSelected"
                  @change="toggleAllMessages"
                />
                <span>Chọn tất cả tin nhắn</span>
              </label>
              <v-btn
                color="error"
                variant="tonal"
                size="small"
                prepend-icon="mdi-delete-outline"
                :disabled="selectedMessageIds.length === 0"
                :loading="messageRemoving"
                @click="removeSelectedMessages"
              >
                Loại khỏi hồ sơ ({{ selectedMessageIds.length }})
              </v-btn>
            </div>
          </div>

          <section class="timeline">
            <article
              v-for="message in selectedStory.messages"
              :key="message.id"
              class="timeline-message"
              :class="{ 'is-staff': message.senderType === 'self', 'is-customer': message.senderType !== 'self' }"
              :data-archive-message-id="message.id"
              @contextmenu.prevent="openMessageContextMenu($event, message)"
            >
              <label v-if="canRemoveSelectedStoryMessages" class="message-selector" title="Chọn tin nhắn để loại khỏi hồ sơ">
                <input v-model="selectedMessageIds" type="checkbox" :value="message.id" />
              </label>
              <div class="message-head">
                <strong>{{ messageSenderLabel(message) }}</strong>
                <span>{{ formatDate(message.sentAt) }}</span>
              </div>
              <button
                v-if="archiveReplyPreview(message)"
                class="archive-reply-card"
                type="button"
                title="Xem tin nhắn được trả lời"
                @click.stop="openArchiveReplyTarget(message)"
              >
                <span>
                  <v-icon size="13">mdi-reply</v-icon>
                  Trả lời{{ archiveReplyPreview(message)?.senderName ? ` ${archiveReplyPreview(message)?.senderName}` : '' }}
                </span>
                <strong>{{ archiveReplyPreview(message)?.content }}</strong>
              </button>
              <p>{{ message.contentSnapshot || `[${message.contentType}]` }}</p>
              <div v-if="message.media.length" class="media-grid">
                <template v-for="media in message.media" :key="media.id">
                  <button
                    v-if="isImage(media)"
                    class="image-thumb"
                    type="button"
                    @click="openMedia(media)"
                  >
                    <img :src="mediaUrl(media)" :alt="media.fileName || 'Ảnh đã lưu'" />
                    <span
                      class="archive-media-download"
                      title="Tải xuống"
                      @click.stop="downloadArchiveMedia(media)"
                    >
                      <v-icon size="15">mdi-download</v-icon>
                    </span>
                  </button>
                  <button
                    v-else
                    class="file-link"
                    type="button"
                    @click="downloadArchiveMedia(media)"
                  >
                    <v-icon size="18">{{ mediaIcon(media.mediaType) }}</v-icon>
                    {{ media.fileName || media.mediaType }}
                    <v-icon size="15">mdi-download</v-icon>
                  </button>
                </template>
              </div>
              <div v-if="message.recalledAt" class="recall-note">
                <v-icon size="14">mdi-information-outline</v-icon>
                <span>Tin nhắn đã bị thu hồi trên Zalo lúc {{ formatDate(message.recalledAt) }}.</span>
              </div>
              <div v-if="archiveMessageAuditLabel(message)" class="archive-message-audit">
                <v-icon size="13">mdi-account-clock-outline</v-icon>
                <span>{{ archiveMessageAuditLabel(message) }}</span>
              </div>
            </article>
          </section>

          <div v-if="selectedStory.resultContent" class="result-box">
            <strong>Kết quả xử lý</strong>
            <p>{{ selectedStory.resultContent }}</p>
          </div>
        </v-card-text>
        <v-card-actions class="detail-actions">
          <v-btn
            v-if="handoverContext?.canRequest && canHandoverSelectedStory"
            variant="text"
            prepend-icon="mdi-account-arrow-right-outline"
            @click="openHandoverDialog('request')"
          >Bàn giao</v-btn>
          <v-btn
            v-if="handoverContext?.canOverride && canOverrideSelectedAssignee"
            variant="text"
            prepend-icon="mdi-account-switch-outline"
            @click="openHandoverDialog('override')"
          >Chuyển người xử lý</v-btn>
          <template v-if="isPendingHandoverRecipient">
            <v-btn
              variant="text"
              color="error"
              :loading="handoverSaving"
              @click="respondHandover(false)"
            >Từ chối</v-btn>
            <v-btn
              color="primary"
              variant="tonal"
              :loading="handoverSaving"
              @click="respondHandover(true)"
            >Đồng ý nhận</v-btn>
          </template>
          <v-btn
            v-if="isPendingHandoverRequester"
            variant="text"
            color="warning"
            :loading="handoverSaving"
            @click="cancelHandover"
          >Huỷ yêu cầu bàn giao</v-btn>
          <v-spacer />
          <v-btn
            v-if="canUpdateSelectedStoryStatus"
            color="primary"
            variant="tonal"
            @click="openStatusDialog(selectedStory)"
          >Cập nhật kết quả</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="handoverDialog" max-width="520" transition="archive-dialog-transition">
      <v-card rounded="xl">
        <v-card-title>
          {{ handoverMode === 'override' ? 'Chuyển người xử lý' : 'Bàn giao hồ sơ' }}
        </v-card-title>
        <v-card-subtitle v-if="handoverMode === 'request'">
          Người nhận cần đồng ý trước khi chính thức tiếp nhận hồ sơ.
        </v-card-subtitle>
        <v-card-subtitle v-else>
          Điều phối của trưởng phòng có hiệu lực ngay, không cần người nhận xác nhận.
        </v-card-subtitle>
        <v-card-text>
          <v-select
            v-model="handoverForm.toUserId"
            :items="handoverCandidateOptions"
            item-title="title"
            item-value="value"
            label="Người xử lý mới"
            variant="outlined"
          />
          <v-textarea
            v-model="handoverForm.reason"
            label="Lý do"
            variant="outlined"
            rows="3"
            auto-grow
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="handoverDialog = false">Đóng</v-btn>
          <v-btn
            color="primary"
            :loading="handoverSaving"
            :disabled="!handoverForm.toUserId || !handoverForm.reason.trim()"
            @click="submitHandover"
          >
            {{ handoverMode === 'override' ? 'Xác nhận chuyển' : 'Gửi yêu cầu' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="mediaDialog" max-width="1100" transition="archive-dialog-transition">
      <div class="media-preview" @click.self="mediaDialog = false">
        <img v-if="previewMediaUrl" :src="previewMediaUrl" alt="Ảnh đã lưu" />
        <button
          v-if="previewMedia"
          type="button"
          class="media-preview-download"
          @click="downloadPreviewMedia"
        >
          <v-icon size="16">mdi-download</v-icon>
          Tải xuống
        </button>
      </div>
    </v-dialog>

    <v-dialog v-model="statusDialog" max-width="560" transition="archive-dialog-transition">
      <v-card rounded="xl">
        <v-card-title>Cập nhật kết quả</v-card-title>
        <v-card-text>
          <v-select
            v-model="statusForm.statusDefinitionId"
            :items="selectedStatusOptions"
            item-title="name"
            item-value="id"
            label="Trạng thái"
          />
          <v-textarea
            v-if="selectedTargetStatus?.requireNote || selectedTargetStatus?.behaviorGroup === 'waiting' || isReopeningSelectedStory"
            v-model="statusForm.note"
            :label="statusNoteLabel"
            rows="3"
            auto-grow
          />
          <v-textarea
            v-model="statusForm.resultContent"
            :label="selectedTargetStatus?.requireResult ? 'Kết quả xử lý *' : 'Nội dung kết quả'"
            rows="4"
            auto-grow
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="statusDialog = false">Đóng</v-btn>
          <v-btn color="primary" :loading="statusSaving" @click="saveStatus()">Lưu kết quả</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="statusManagerDialog" max-width="980" scrollable transition="archive-dialog-transition">
      <v-card rounded="xl" class="status-manager-card">
        <v-card-title class="status-manager-title">
          <div>
            <strong>Trạng thái hồ sơ</strong>
            <small>Danh sách, Kanban và báo cáo tự dùng cấu hình này.</small>
          </div>
          <v-btn icon="mdi-close" variant="text" @click="statusManagerDialog = false" />
        </v-card-title>
        <v-card-text>
          <div class="status-manager-layout">
            <section class="status-manager-list">
              <div class="status-manager-list-head">
                <strong>Danh mục trạng thái</strong>
                <v-btn size="small" color="primary" prepend-icon="mdi-plus" @click="startCreateStatus">
                  Thêm trạng thái
                </v-btn>
              </div>
              <article
                v-for="(status, index) in managedStatuses"
                :key="status.id"
                class="status-manager-row"
                :class="{ inactive: !status.isActive }"
              >
                <v-icon :color="statusColor(status)">{{ status.icon }}</v-icon>
                <div>
                  <strong>{{ status.name }}</strong>
                  <span>{{ behaviorLabel(status.behaviorGroup) }} · {{ status.code }}</span>
                </div>
                <span v-if="status.isDefault" class="status-default-badge">Mặc định</span>
                <div class="status-manager-actions">
                  <v-btn
                    icon="mdi-chevron-up"
                    size="x-small"
                    variant="text"
                    :disabled="!canMoveManagedStatus(status, index, -1)"
                    @click="moveManagedStatus(index, -1)"
                  />
                  <v-btn
                    icon="mdi-chevron-down"
                    size="x-small"
                    variant="text"
                    :disabled="!canMoveManagedStatus(status, index, 1)"
                    @click="moveManagedStatus(index, 1)"
                  />
                  <v-btn icon="mdi-pencil-outline" size="x-small" variant="text" @click="editManagedStatus(status)" />
                </div>
              </article>
            </section>

            <section class="status-manager-form">
              <h3>{{ editingStatusId ? 'Sửa trạng thái' : 'Thêm trạng thái' }}</h3>
              <v-text-field v-model="statusEditForm.name" label="Tên trạng thái *" variant="outlined" />
              <v-text-field
                v-model="statusEditForm.code"
                label="Mã trạng thái *"
                variant="outlined"
                :readonly="Boolean(editingStatusId)"
                hint="Chữ thường, số và dấu gạch dưới"
                persistent-hint
              />
              <div class="config-row">
                <v-select
                  v-model="statusEditForm.behaviorGroup"
                  :items="behaviorOptions"
                  item-title="title"
                  item-value="value"
                  label="Nhóm hành vi *"
                  variant="outlined"
                />
                <v-select
                  v-model="statusEditForm.colorToken"
                  :items="colorOptions"
                  item-title="title"
                  item-value="value"
                  label="Màu"
                  variant="outlined"
                />
              </div>
              <v-select
                v-model="statusEditForm.departmentId"
                :items="statusDepartmentOptions"
                item-title="name"
                item-value="id"
                label="Phạm vi phòng ban"
                variant="outlined"
                clearable
                :disabled="Boolean(editingStatusId)"
              />
              <v-textarea v-model="statusEditForm.description" label="Mô tả" rows="2" auto-grow />
              <v-select
                v-model="statusEditForm.transitionToIds"
                :items="transitionTargetOptions"
                item-title="name"
                item-value="id"
                label="Được phép chuyển sang"
                multiple
                chips
                variant="outlined"
              />
              <div class="status-rule-grid">
                <v-switch v-model="statusEditForm.isDefault" label="Mặc định khi tạo" color="primary" hide-details />
                <v-switch v-model="statusEditForm.showOnKanban" label="Hiển thị trên Kanban" color="primary" hide-details />
                <v-switch v-model="statusEditForm.showCountOnOverview" label="Hiển thị số tồn trên tab" color="primary" hide-details />
                <v-switch v-model="statusEditForm.allowMessageAppend" label="Cho bổ sung tin nhắn" color="primary" hide-details />
                <v-switch v-model="statusEditForm.autoSyncReplies" label="Tự đồng bộ trả lời" color="primary" hide-details />
                <v-switch v-model="statusEditForm.requireNote" label="Yêu cầu ghi chú" color="primary" hide-details />
                <v-switch v-model="statusEditForm.requireResult" label="Yêu cầu kết quả" color="primary" hide-details />
                <v-switch v-model="statusEditForm.isActive" label="Đang sử dụng" color="primary" hide-details />
              </div>
              <div class="status-manager-form-actions">
                <v-btn
                  v-if="editingStatusId"
                  color="error"
                  variant="text"
                  :loading="statusManagerSaving"
                  @click="removeManagedStatus"
                >
                  Ngừng sử dụng
                </v-btn>
                <v-spacer />
                <v-btn variant="text" @click="startCreateStatus">Làm mới</v-btn>
                <v-btn color="primary" :loading="statusManagerSaving" @click="saveManagedStatus">
                  Lưu trạng thái
                </v-btn>
              </div>
            </section>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="configDialog" max-width="640" transition="archive-dialog-transition">
      <v-card rounded="xl">
        <v-card-title>Cấu hình Google Archive</v-card-title>
        <v-card-subtitle>Share Spreadsheet và thư mục Drive cho Service Account trước khi lưu.</v-card-subtitle>
        <v-card-text>
          <v-select
            v-model="configForm.zaloAccountId"
            :items="accounts"
            item-title="displayName"
            item-value="id"
            label="Tài khoản Zalo"
            @update:model-value="applyDestination"
          />
          <v-text-field v-model="configForm.spreadsheetId" label="Google Spreadsheet ID" />
          <v-text-field v-model="configForm.driveFolderId" label="Google Drive Folder ID" />
          <div class="config-row">
            <v-text-field v-model="configForm.rawSheetName" label="Tab dữ liệu gốc" />
            <v-text-field v-model="configForm.viewSheetName" label="Tab trình bày" />
          </div>
          <v-switch v-model="configForm.enabled" color="primary" label="Bật tự động backup" hide-details />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="configDialog = false">Đóng</v-btn>
          <v-btn color="primary" :loading="configSaving" @click="saveConfig">Lưu cấu hình</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <div
      v-if="messageContextMenu.visible"
      class="archive-message-context-menu"
      :style="{ left: `${messageContextMenu.x}px`, top: `${messageContextMenu.y}px` }"
      @click.stop
    >
      <button type="button" @click="openOriginalMessage">
        <v-icon size="16">mdi-message-text-outline</v-icon>
        Xem tin nhắn gốc
      </button>
      <button type="button" @click="copyArchivedMessageContent">
        <v-icon size="16">mdi-content-copy</v-icon>
        Sao chép nội dung
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { resolveAttachmentUrl } from '@/utils/attachment-url';
import { downloadAttachment } from '@/utils/download-attachment';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { useAuthStore } from '@/stores/auth';
import { useRoute, useRouter } from 'vue-router';

interface ArchiveMedia {
  id: string;
  mediaType: string;
  sourceUrl: string;
  driveUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}

interface ArchiveReplyPreview {
  sourceMessageId?: string;
  msgId?: string;
  cliMsgId?: string;
  senderName?: string;
  content: string;
}

interface ArchiveMessage {
  id: string;
  senderType: string;
  senderName?: string | null;
  contentType: string;
  contentSnapshot?: string | null;
  sentAt: string;
  recalledAt?: string | null;
  addedAt?: string | null;
  addedSource?: string | null;
  addedBy?: { id: string; fullName?: string | null; email?: string | null } | null;
  media: ArchiveMedia[];
  sourceMessage?: {
    id?: string;
    zaloMsgId?: string | null;
    zaloMsgIdNum?: string | null;
    quote?: unknown;
    content?: string | null;
    contentType?: string | null;
    senderName?: string | null;
    isDeleted?: boolean | null;
    repliedBy?: { id: string; fullName: string; email?: string | null } | null;
  } | null;
}

interface ArchiveStatusDefinition {
  id: string;
  departmentId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  behaviorGroup: 'active' | 'waiting' | 'completed' | 'cancelled';
  colorToken: string;
  icon: string;
  displayOrder: number;
  isDefault: boolean;
  showOnKanban: boolean;
  showCountOnOverview: boolean;
  allowMessageAppend: boolean;
  autoSyncReplies: boolean;
  requireNote: boolean;
  requireResult: boolean;
  isSystem: boolean;
  isActive: boolean;
  allowedTransitionIds?: string[];
  transitionsFrom?: Array<{ toStatusId: string; requiredPermission?: string | null }>;
  _count?: { stories: number };
}

interface ArchiveStoryPermissions {
  canView: boolean;
  canUpdateStatus: boolean;
  canAppendMessages: boolean;
  canEditMetadata: boolean;
  canRemoveMessages: boolean;
  canDeleteStory: boolean;
  canHandover: boolean;
  canOverrideAssignee: boolean;
  reason?: string;
}

interface ArchiveStory {
  id: string;
  createdByUserId: string;
  conversationId: string;
  title?: string | null;
  recordType: string;
  conversationName: string;
  contactPhone?: string | null;
  conversationContent: string;
  receivedAt?: string | null;
  assignmentOrigin?: 'initial' | 'handover' | 'manager_override' | string | null;
  resultContent?: string | null;
  businessStatus: string;
  statusDefinition?: ArchiveStatusDefinition | null;
  backupStatus: string;
  backupError?: string | null;
  createdAt: string;
  updatedAt: string;
  department?: { id: string; name: string } | null;
  assignedUser?: { id: string; fullName: string } | null;
  zaloAccountDisplayNameSnapshot?: string | null;
  zaloAccountUidSnapshot?: string | null;
  zaloAccountDeletedAt?: string | null;
  zaloAccount?: {
    displayName: string | null;
    zaloUid?: string | null;
    deletedAt?: string | null;
  } | null;
  permissions?: ArchiveStoryPermissions;
  messages: ArchiveMessage[];
  transferRequests?: ArchiveHandoverRequest[];
}

interface ArchiveHandoverUser {
  id: string;
  fullName: string;
  assignmentRole?: string;
}

interface ArchiveHandoverRequest {
  id: string;
  storyId: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  reason: string;
  expiresAt: string;
  fromUser: ArchiveHandoverUser;
  toUser: ArchiveHandoverUser;
  requestedBy: ArchiveHandoverUser;
}

interface ArchiveHandoverContext {
  currentAssignee: ArchiveHandoverUser | null;
  pendingRequest: ArchiveHandoverRequest | null;
  eligibleRecipients: ArchiveHandoverUser[];
  managerCandidates: ArchiveHandoverUser[];
  canRequest: boolean;
  canOverride: boolean;
  assignmentHistory: Array<{
    id: string;
    changeType: string;
    reason?: string | null;
    createdAt: string;
    fromUser?: ArchiveHandoverUser | null;
    toUser: ArchiveHandoverUser;
    changedBy: ArchiveHandoverUser;
  }>;
}

interface CustomerOption {
  conversationId: string;
  type: string;
  name: string;
  phone?: string | null;
  avatarUrl?: string | null;
  label: string;
  subtitle: string;
}

const toast = useToast();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const stories = ref<ArchiveStory[]>([]);
const total = ref(0);
const statusCounts = ref<Record<string, number>>({});
const handoverInboxCount = ref(0);
const loading = ref(false);
const kanbanLoadError = ref('');
const detailDialog = ref(false);
const selectedStory = ref<ArchiveStory | null>(null);
const statusDialog = ref(false);
const statusSaving = ref(false);
const titleEditing = ref(false);
const titleSaving = ref(false);
const titleDraft = ref('');
const selectedMessageIds = ref<string[]>([]);
const messageRemoving = ref(false);
const handoverContext = ref<ArchiveHandoverContext | null>(null);
const handoverLoading = ref(false);
const handoverSaving = ref(false);
const handoverDialog = ref(false);
const handoverMode = ref<'request' | 'override'>('request');
const handoverForm = ref({ toUserId: '', reason: '' });
const mediaDialog = ref(false);
const previewMediaUrl = ref('');
const previewMedia = ref<ArchiveMedia | null>(null);
const configDialog = ref(false);
const configSaving = ref(false);
const statusDefinitions = ref<ArchiveStatusDefinition[]>([]);
const managedStatuses = ref<ArchiveStatusDefinition[]>([]);
const canManageStatuses = ref(false);
const statusManagerDialog = ref(false);
const statusManagerSaving = ref(false);
const editingStatusId = ref('');
const accounts = ref<Array<{ id: string; displayName: string | null }>>([]);
const destinations = ref<any[]>([]);
const departmentOptions = ref<Array<{ id: string; name: string }>>([]);
const userOptions = ref<Array<{ value: string; title: string; departmentId: string | null }>>([]);
const assignedUserSearch = ref('');
const ASSIGNED_USER_DEFAULT_KEY = 'archive-default-assigned-user-id';
const assignedUserDefaultId = ref(localStorage.getItem(ASSIGNED_USER_DEFAULT_KEY) || '');
const currentDepartment = ref<{ id: string; name: string } | null>(null);
const customerOptions = ref<CustomerOption[]>([]);
const customerSearch = ref('');
const customerLoading = ref(false);
let customerSearchTimer: ReturnType<typeof setTimeout> | null = null;
const viewMode = ref<'list' | 'kanban'>(
  localStorage.getItem('archive-view-mode') === 'kanban' ? 'kanban' : 'list',
);
const filters = ref({
  status: '',
  q: '',
  titleQ: '',
  customerQ: '',
  conversationId: '',
  contentQ: '',
  departmentId: '',
  assignedUserId: assignedUserDefaultId.value || '__all__',
  recordType: '',
  recallState: '',
});
const pagination = ref({ page: 1, limit: 20 });
const statusForm = ref({ statusDefinitionId: '', resultContent: '', note: '' });
const statusEditForm = ref(emptyStatusEditForm());
const configForm = ref({
  zaloAccountId: '',
  spreadsheetId: '',
  driveFolderId: '',
  rawSheetName: 'Raw_Messages',
  viewSheetName: 'View_Messages',
  enabled: true,
});
const messageContextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  message: ArchiveMessage | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  message: null,
});

const behaviorOptions = [
  { title: 'Đang xử lý', value: 'active' },
  { title: 'Đang chờ', value: 'waiting' },
  { title: 'Hoàn thành', value: 'completed' },
  { title: 'Đã huỷ', value: 'cancelled' },
];
const colorOptions = [
  { title: 'Xanh dương', value: 'primary' },
  { title: 'Cam / vàng', value: 'warning' },
  { title: 'Xanh lá', value: 'success' },
  { title: 'Đỏ', value: 'error' },
  { title: 'Xám', value: 'neutral' },
  { title: 'Xanh nhạt', value: 'info' },
];
const recordTypeOptions = [
  { title: 'Đơn hàng', value: 'order' },
  { title: 'Yêu cầu báo giá', value: 'quotation' },
  { title: 'Chăm sóc khách hàng', value: 'customer_care' },
  { title: 'Hồ sơ khác', value: 'other' },
];
const statusOptions = computed(() => [
  { label: 'Tất cả', value: '' },
  ...statusDefinitions.value
    .filter((status) => status.isActive)
    .map((status) => ({ label: status.name, value: status.id, status })),
  { label: 'Bàn giao', value: '__handover_inbox__', system: 'handover' as const },
]);
const kanbanColumns = computed(() => statusDefinitions.value.filter((status) => (
  status.isActive && status.showOnKanban
)));
const pendingCount = computed(() => statusDefinitions.value
  .filter((status) => ['active', 'waiting'].includes(status.behaviorGroup))
  .reduce((sum, status) => sum + (statusCounts.value[status.id] || 0), 0));
const failedCount = computed(() => stories.value.filter((item) => ['failed', 'partial'].includes(item.backupStatus)).length);
const canConfigure = computed(() => ['owner', 'admin'].includes(authStore.user?.role || ''));

function statusTabCount(option: { value: string; status?: ArchiveStatusDefinition; system?: 'handover' }) {
  if (option.system === 'handover') return handoverInboxCount.value;
  if (!option.status?.showCountOnOverview) return null;
  return statusCounts.value[option.status.id] || 0;
}
function normalizeFilterText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi-VN')
    .replace(/\s+/g, ' ')
    .trim();
}

function userOptionScore(option: { title: string; value: string }, query: string) {
  const normalizedTitle = normalizeFilterText(option.title);
  const normalizedQuery = normalizeFilterText(query);
  if (!normalizedQuery) return 0;
  if (normalizedTitle === normalizedQuery) return 100;
  if (normalizedTitle.startsWith(normalizedQuery)) return 90;
  if (normalizedTitle.includes(normalizedQuery)) return 70;
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  const matched = tokens.filter((token) => normalizedTitle.includes(token)).length;
  return matched ? 40 + matched * 8 : -1;
}

const selectedUserOption = computed(() => (
  userOptions.value.find((item) => item.value === filters.value.assignedUserId) || null
));

const filteredUserOptions = computed(() => {
  const query = assignedUserSearch.value.trim();
  const selected = selectedUserOption.value;
  if (!query) {
    return userOptions.value;
  }
  const matched = userOptions.value
    .map((item) => ({ item, score: userOptionScore(item, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'vi-VN'))
    .slice(0, 12)
    .map((entry) => entry.item);
  return selected && !matched.some((item) => item.value === selected.value)
    ? [selected, ...matched]
    : matched;
});

const canEditSelectedStoryTitle = computed(() => Boolean(
  selectedStory.value && canEditStoryMetadata(selectedStory.value),
));
const canRemoveSelectedStoryMessages = computed(() => Boolean(
  selectedStory.value && canRemoveStoryMessages(selectedStory.value),
));
const canUpdateSelectedStoryStatus = computed(() => Boolean(
  selectedStory.value && canUpdateStoryStatus(selectedStory.value),
));
const canHandoverSelectedStory = computed(() => Boolean(
  selectedStory.value && canHandoverStory(selectedStory.value),
));
const canOverrideSelectedAssignee = computed(() => Boolean(
  selectedStory.value && canOverrideAssignee(selectedStory.value),
));
const isPendingHandoverRecipient = computed(() => (
  handoverContext.value?.pendingRequest?.status === 'pending'
  && handoverContext.value.pendingRequest.toUserId === authStore.user?.id
));
const isPendingHandoverRequester = computed(() => (
  handoverContext.value?.pendingRequest?.status === 'pending'
  && handoverContext.value.pendingRequest.requestedBy.id === authStore.user?.id
));
const handoverCandidateOptions = computed(() => {
  const candidates = handoverMode.value === 'override'
    ? handoverContext.value?.managerCandidates || []
    : handoverContext.value?.eligibleRecipients || [];
  return candidates.map((user) => ({
    value: user.id,
    title: user.assignmentRole
      ? `${user.fullName} · ${assignmentRoleLabel(user.assignmentRole)}`
      : user.fullName,
  }));
});
const allMessagesSelected = computed(() => Boolean(
  selectedStory.value?.messages.length
  && selectedMessageIds.value.length === selectedStory.value.messages.length
));
const someMessagesSelected = computed(() => (
  selectedMessageIds.value.length > 0 && !allMessagesSelected.value
));
const archiveHeading = computed(() => {
  const selected = departmentOptions.value.find((item) => item.id === filters.value.departmentId);
  if (selected) return selected.name;
  if (canConfigure.value) return 'Tất cả phòng ban';
  return currentDepartment.value?.name || 'Hồ sơ trao đổi';
});
const storiesByStatus = computed<Record<string, ArchiveStory[]>>(() => {
  const grouped: Record<string, ArchiveStory[]> = {};
  for (const status of kanbanColumns.value) grouped[status.id] = [];
  for (const story of stories.value) {
    const statusId = storyStatus(story).id;
    if (!grouped[statusId]) grouped[statusId] = [];
    grouped[statusId].push(story);
  }
  return grouped;
});
const selectedStatusOptions = computed(() => {
  if (!selectedStory.value) return statusDefinitions.value;
  const current = storyStatus(selectedStory.value);
  const targets = transitionOptions(selectedStory.value);
  return [current, ...targets.filter((status) => status.id !== current.id)];
});
const selectedTargetStatus = computed(() => (
  selectedStatusOptions.value.find((status) => status.id === statusForm.value.statusDefinitionId)
  || null
));
const isReopeningSelectedStory = computed(() => {
  if (!selectedStory.value || !selectedTargetStatus.value) return false;
  const source = storyStatus(selectedStory.value);
  return ['completed', 'cancelled'].includes(source.behaviorGroup)
    && source.id !== selectedTargetStatus.value.id;
});
const statusNoteLabel = computed(() => {
  if (isReopeningSelectedStory.value) return 'Lý do mở lại hồ sơ *';
  if (selectedTargetStatus.value?.behaviorGroup === 'cancelled') return 'Lý do huỷ';
  return 'Ghi chú chuyển trạng thái';
});
const statusDepartmentOptions = computed(() => departmentOptions.value);
const transitionTargetOptions = computed(() => managedStatuses.value.filter((status) => (
  status.isActive && status.id !== editingStatusId.value
)));
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pagination.value.limit)));
const visiblePages = computed(() => {
  const pages = new Set<number>([1, totalPages.value]);
  for (let page = pagination.value.page - 1; page <= pagination.value.page + 1; page += 1) {
    if (page >= 1 && page <= totalPages.value) pages.add(page);
  }
  return [...pages].sort((left, right) => left - right);
});

function fallbackCanMutateStory(story: ArchiveStory) {
  const userId = authStore.user?.id;
  return Boolean(canConfigure.value || (userId && story.assignedUser?.id === userId));
}

function canUpdateStoryStatus(story: ArchiveStory) {
  return story.permissions?.canUpdateStatus ?? fallbackCanMutateStory(story);
}

function canEditStoryMetadata(story: ArchiveStory) {
  return story.permissions?.canEditMetadata ?? fallbackCanMutateStory(story);
}

function canRemoveStoryMessages(story: ArchiveStory) {
  return story.permissions?.canRemoveMessages ?? fallbackCanMutateStory(story);
}

function canHandoverStory(story: ArchiveStory) {
  return story.permissions?.canHandover ?? fallbackCanMutateStory(story);
}

function canOverrideAssignee(story: ArchiveStory) {
  return story.permissions?.canOverrideAssignee ?? canConfigure.value;
}

function mutationDeniedMessage(story: ArchiveStory) {
  return story.permissions?.reason || 'Bạn không có quyền thao tác hồ sơ này';
}

async function fetchStories() {
  loading.value = true;
  kanbanLoadError.value = '';
  try {
    const { data } = await api.get('/archive/stories', {
      params: {
        page: pagination.value.page,
        limit: pagination.value.limit,
        statusDefinitionId: filters.value.status && filters.value.status !== '__handover_inbox__'
          ? filters.value.status
          : undefined,
        handover: filters.value.status === '__handover_inbox__' ? 'inbox' : undefined,
        q: filters.value.q || undefined,
        titleQ: filters.value.titleQ || undefined,
        customerQ: filters.value.customerQ || undefined,
        conversationId: filters.value.conversationId || undefined,
        contentQ: filters.value.contentQ || undefined,
        departmentId: filters.value.departmentId || undefined,
        assignedUserId: filters.value.assignedUserId === '__all__'
          ? undefined
          : filters.value.assignedUserId || undefined,
        recordType: filters.value.recordType || undefined,
        recallState: filters.value.recallState || undefined,
      },
    });
    stories.value = data.stories || [];
    total.value = data.total || 0;
    statusCounts.value = data.statusCounts || {};
    handoverInboxCount.value = Number(data.handoverInboxCount || 0);
  } catch (error: any) {
    const message = error?.response?.data?.error || 'Không thể tải hồ sơ';
    kanbanLoadError.value = message;
    toast.error(message);
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  pagination.value.page = 1;
  void fetchStories();
}

function toggleRecallFilter() {
  filters.value.recallState = filters.value.recallState === 'recalled' ? '' : 'recalled';
  applyFilters();
}

function applyCustomerTextSearch() {
  if (!filters.value.conversationId) {
    filters.value.customerQ = customerSearch.value.trim();
  }
  applyFilters();
}

function clearCustomerFilter() {
  filters.value.conversationId = '';
  filters.value.customerQ = '';
  customerSearch.value = '';
  customerOptions.value = [];
  applyFilters();
}

function resetFilters() {
  filters.value.q = '';
  filters.value.titleQ = '';
  filters.value.contentQ = '';
  filters.value.status = '';
  filters.value.recallState = '';
  filters.value.recordType = '';
  filters.value.conversationId = '';
  filters.value.customerQ = '';
  customerSearch.value = '';
  customerOptions.value = [];
  filters.value.assignedUserId = assignedUserDefaultId.value || '__all__';
  assignedUserSearch.value = '';
  filters.value.departmentId = currentDepartment.value?.id || '';
  void handleDepartmentFilterChange();
}

function saveAssignedUserDefault() {
  if (!filters.value.assignedUserId) return;
  assignedUserDefaultId.value = filters.value.assignedUserId;
  localStorage.setItem(ASSIGNED_USER_DEFAULT_KEY, filters.value.assignedUserId);
  toast.success('Đã lưu người phụ trách mặc định cho bộ lọc hồ sơ');
}

function clearAssignedUserDefault() {
  assignedUserDefaultId.value = '';
  localStorage.removeItem(ASSIGNED_USER_DEFAULT_KEY);
  filters.value.assignedUserId = '__all__';
  assignedUserSearch.value = '';
  toast.success('Đã bỏ mặc định người phụ trách');
}

async function handleDepartmentFilterChange() {
  filters.value.status = '';
  await fetchStatusDefinitions();
  applyFilters();
}

function changePage(page: number) {
  pagination.value.page = Math.min(Math.max(1, page), totalPages.value);
  void fetchStories();
}

async function loadFilterContext() {
  try {
    const { data } = await api.get('/archive/save-context');
    currentDepartment.value = data.currentDepartment || null;
    departmentOptions.value = data.filterDepartments || data.departments || [];
    const currentId = data.currentUser?.id || authStore.user?.id || '';
    const currentName = data.currentUser?.fullName || authStore.user?.fullName || 'Tôi';
    const scopedUsers = (data.filterUsers || data.users || []).filter((item: any) => item.id !== currentId);
    userOptions.value = [
      {
        value: '__all__',
        title: 'Tất cả hồ sơ trong phạm vi được quyền',
        departmentId: null,
      },
      {
        value: currentId,
        title: `Hồ sơ của tôi - ${String(currentName)}`,
        departmentId: data.currentDepartment?.id || null,
      },
      ...scopedUsers.map((item: any) => ({
        value: String(item.id),
        title: String(item.fullName || 'Chưa đặt tên'),
        departmentId: item.departmentId || null,
      })),
    ];
    const savedDefault = assignedUserDefaultId.value;
    const defaultExists = savedDefault && userOptions.value.some((item) => item.value === savedDefault);
    if (savedDefault && !defaultExists) {
      assignedUserDefaultId.value = '';
      localStorage.removeItem(ASSIGNED_USER_DEFAULT_KEY);
    }
    const selectedExists = filters.value.assignedUserId
      && userOptions.value.some((item) => item.value === filters.value.assignedUserId);
    if (!selectedExists) filters.value.assignedUserId = defaultExists ? savedDefault : '__all__';
    if (!filters.value.departmentId && data.currentDepartment?.id) {
      filters.value.departmentId = data.currentDepartment.id;
    }
  } catch {
    userOptions.value = authStore.user
      ? [
        {
          value: '__all__',
          title: 'Tất cả hồ sơ trong phạm vi được quyền',
          departmentId: null,
        },
        {
          value: authStore.user.id,
          title: `Hồ sơ của tôi - ${authStore.user.fullName}`,
          departmentId: null,
        },
      ]
      : [];
  }
}

async function fetchStatusDefinitions(includeInactive = false) {
  try {
    const { data } = await api.get('/archive/status-definitions', {
      params: {
        departmentId: filters.value.departmentId || undefined,
        allDepartments: !filters.value.departmentId ? 'true' : undefined,
        includeInactive: includeInactive ? 'true' : undefined,
      },
    });
    const loaded = (data.statuses || []) as ArchiveStatusDefinition[];
    statusDefinitions.value = loaded.filter((status) => status.isActive);
    if (includeInactive) managedStatuses.value = [...loaded];
    canManageStatuses.value = Boolean(data.canManage);
  } catch (error: any) {
    statusDefinitions.value = [];
    if (includeInactive) managedStatuses.value = [];
    toast.error(error?.response?.data?.error || 'Không thể tải danh mục trạng thái');
  }
}

async function openStatusManager() {
  statusManagerDialog.value = true;
  await fetchStatusDefinitions(true);
  startCreateStatus();
}

function emptyStatusEditForm() {
  return {
    departmentId: null as string | null,
    code: '',
    name: '',
    description: '',
    behaviorGroup: 'active' as ArchiveStatusDefinition['behaviorGroup'],
    colorToken: 'primary',
    icon: 'mdi-progress-clock',
    displayOrder: 100,
    isDefault: false,
    showOnKanban: true,
    showCountOnOverview: true,
    allowMessageAppend: true,
    autoSyncReplies: true,
    requireNote: false,
    requireResult: false,
    isActive: true,
    transitionToIds: [] as string[],
  };
}

function startCreateStatus() {
  editingStatusId.value = '';
  statusEditForm.value = {
    ...emptyStatusEditForm(),
    departmentId: canConfigure.value ? filters.value.departmentId || null : currentDepartment.value?.id || null,
  };
}

function editManagedStatus(status: ArchiveStatusDefinition) {
  editingStatusId.value = status.id;
  statusEditForm.value = {
    departmentId: status.departmentId || null,
    code: status.code,
    name: status.name,
    description: status.description || '',
    behaviorGroup: status.behaviorGroup,
    colorToken: status.colorToken,
    icon: status.icon,
    displayOrder: status.displayOrder,
    isDefault: status.isDefault,
    showOnKanban: status.showOnKanban,
    showCountOnOverview: status.showCountOnOverview,
    allowMessageAppend: status.allowMessageAppend,
    autoSyncReplies: status.autoSyncReplies,
    requireNote: status.requireNote,
    requireResult: status.requireResult,
    isActive: status.isActive,
    transitionToIds: status.allowedTransitionIds
      || status.transitionsFrom?.map((transition) => transition.toStatusId)
      || [],
  };
}

async function saveManagedStatus() {
  if (!statusEditForm.value.name.trim() || !statusEditForm.value.code.trim()) {
    toast.error('Tên và mã trạng thái là bắt buộc');
    return;
  }
  const existing = managedStatuses.value.find((status) => status.id === editingStatusId.value);
  let confirmBehaviorChange = false;
  if (existing && existing.behaviorGroup !== statusEditForm.value.behaviorGroup && (existing._count?.stories || 0) > 0) {
    confirmBehaviorChange = window.confirm(
      'Trạng thái đã có hồ sơ sử dụng. Đổi nhóm hành vi có thể ảnh hưởng đồng bộ, báo cáo và phân quyền. Tiếp tục?',
    );
    if (!confirmBehaviorChange) return;
  }
  statusManagerSaving.value = true;
  try {
    const payload = {
      ...statusEditForm.value,
      code: statusEditForm.value.code.trim().toLowerCase().replace(/\s+/g, '_'),
      name: statusEditForm.value.name.trim(),
      description: statusEditForm.value.description.trim() || null,
      confirmBehaviorChange,
    };
    if (editingStatusId.value) {
      await api.patch(`/archive/status-definitions/${editingStatusId.value}`, payload);
    } else {
      await api.post('/archive/status-definitions', payload);
    }
    await fetchStatusDefinitions(true);
    startCreateStatus();
    toast.success('Đã lưu cấu hình trạng thái');
    await fetchStories();
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể lưu trạng thái');
  } finally {
    statusManagerSaving.value = false;
  }
}

async function removeManagedStatus() {
  if (!editingStatusId.value) return;
  if (!window.confirm('Ngừng sử dụng trạng thái này? Hồ sơ cũ vẫn giữ nguyên trạng thái.')) return;
  statusManagerSaving.value = true;
  try {
    const { data } = await api.delete(`/archive/status-definitions/${editingStatusId.value}`);
    toast.success(data.message || 'Đã cập nhật trạng thái');
    await fetchStatusDefinitions(true);
    startCreateStatus();
    await fetchStories();
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể ngừng trạng thái');
  } finally {
    statusManagerSaving.value = false;
  }
}

async function moveManagedStatus(index: number, direction: -1 | 1) {
  const current = managedStatuses.value[index];
  if (!current) return;
  const scope = current.departmentId || null;
  let targetIndex = index + direction;
  while (
    targetIndex >= 0
    && targetIndex < managedStatuses.value.length
    && (managedStatuses.value[targetIndex]?.departmentId || null) !== scope
  ) {
    targetIndex += direction;
  }
  if (targetIndex < 0 || targetIndex >= managedStatuses.value.length) return;
  const reordered = [...managedStatuses.value];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
  const scoped = reordered.filter((status) => (status.departmentId || null) === scope);
  managedStatuses.value = reordered;
  try {
    await api.post('/archive/status-definitions/reorder', {
      statusIds: scoped.map((status) => status.id),
    });
    await fetchStatusDefinitions(true);
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể sắp xếp trạng thái');
    await fetchStatusDefinitions(true);
  }
}

function canMoveManagedStatus(status: ArchiveStatusDefinition, index: number, direction: -1 | 1) {
  const scope = status.departmentId || null;
  let targetIndex = index + direction;
  while (targetIndex >= 0 && targetIndex < managedStatuses.value.length) {
    if ((managedStatuses.value[targetIndex]?.departmentId || null) === scope) return true;
    targetIndex += direction;
  }
  return false;
}

function setViewMode(mode: 'list' | 'kanban') {
  viewMode.value = mode;
  localStorage.setItem('archive-view-mode', mode);
  pagination.value.page = 1;
  void fetchStories();
}

function selectStatusFilter(statusDefinitionId: string) {
  filters.value.status = statusDefinitionId;
  pagination.value.page = 1;
  void fetchStories();
}

function openDetail(story: ArchiveStory) {
  selectedStory.value = story;
  selectedMessageIds.value = [];
  closeMessageContextMenu();
  titleEditing.value = false;
  titleDraft.value = extractTitleSuffix(story);
  statusForm.value = {
    statusDefinitionId: storyStatus(story).id,
    resultContent: story.resultContent || '',
    note: '',
  };
  handoverContext.value = null;
  detailDialog.value = true;
  void loadHandoverContext(story.id);
}

function closeMessageContextMenu() {
  messageContextMenu.value = {
    visible: false,
    x: 0,
    y: 0,
    message: null,
  };
}

function openMessageContextMenu(event: MouseEvent, message: ArchiveMessage) {
  const menuWidth = 220;
  const menuHeight = 94;
  messageContextMenu.value = {
    visible: true,
    x: Math.min(event.clientX, window.innerWidth - menuWidth - 12),
    y: Math.min(event.clientY, window.innerHeight - menuHeight - 12),
    message,
  };
}

function originErrorMessage(reason?: string, fallback?: string) {
  if (fallback) return fallback;
  if (reason === 'archive_access_denied') return 'Bạn không có quyền xem hồ sơ chứa tin nhắn này.';
  if (reason === 'conversation_access_denied') return 'Bạn không có quyền xem hội thoại gốc.';
  if (reason === 'zalo_account_deleted') return 'Tài khoản Zalo gốc đã bị xóa, chỉ có thể xem bản lưu trong hồ sơ.';
  if (reason === 'source_message_not_found') return 'Tin nhắn gốc không còn tồn tại trong hệ thống.';
  return 'Không thể mở tin nhắn gốc.';
}

async function openOriginalMessage() {
  const message = messageContextMenu.value.message;
  if (!message) return;
  closeMessageContextMenu();
  try {
    const { data } = await api.get(`/archive/messages/${message.id}/origin`);
    if (!data.canOpen) {
      toast.error(originErrorMessage(data.reason, data.message));
      return;
    }
    detailDialog.value = false;
    await router.push({
      name: 'Chat',
      params: { convId: data.conversationId },
      query: { messageId: data.sourceMessageId, focusAt: String(Date.now()) },
    });
  } catch (error: any) {
    const data = error?.response?.data;
    toast.error(originErrorMessage(data?.reason, data?.message || data?.error));
  }
}

async function copyArchivedMessageContent() {
  const message = messageContextMenu.value.message;
  closeMessageContextMenu();
  const content = message?.contentSnapshot || `[${message?.contentType || 'message'}]`;
  try {
    await navigator.clipboard.writeText(content);
    toast.success('Đã sao chép nội dung tin nhắn');
  } catch {
    toast.error('Không thể sao chép nội dung tin nhắn');
  }
}

async function loadHandoverContext(storyId: string) {
  handoverLoading.value = true;
  try {
    const { data } = await api.get(`/archive/stories/${storyId}/handover-context`);
    if (selectedStory.value?.id === storyId) handoverContext.value = data;
  } catch (error: any) {
    handoverContext.value = null;
    if (error?.response?.status !== 403) {
      toast.error(error?.response?.data?.error || 'Không thể tải thông tin bàn giao');
    }
  } finally {
    handoverLoading.value = false;
  }
}

function openHandoverDialog(mode: 'request' | 'override') {
  if (!selectedStory.value) return;
  if (mode === 'override' && !canOverrideAssignee(selectedStory.value)) {
    toast.error(mutationDeniedMessage(selectedStory.value));
    return;
  }
  if (mode === 'request' && !canHandoverStory(selectedStory.value)) {
    toast.error(mutationDeniedMessage(selectedStory.value));
    return;
  }
  handoverMode.value = mode;
  handoverForm.value = { toUserId: '', reason: '' };
  handoverDialog.value = true;
}

async function submitHandover() {
  if (!selectedStory.value || !handoverForm.value.toUserId || !handoverForm.value.reason.trim()) return;
  if (handoverMode.value === 'override' && !canOverrideAssignee(selectedStory.value)) {
    toast.error(mutationDeniedMessage(selectedStory.value));
    return;
  }
  if (handoverMode.value === 'request' && !canHandoverStory(selectedStory.value)) {
    toast.error(mutationDeniedMessage(selectedStory.value));
    return;
  }
  const storyId = selectedStory.value.id;
  handoverSaving.value = true;
  try {
    if (handoverMode.value === 'override') {
      const { data } = await api.post(`/archive/stories/${storyId}/assign`, {
        toUserId: handoverForm.value.toUserId,
        reason: handoverForm.value.reason.trim(),
      });
      selectedStory.value = data.story;
      replaceStory(data.story);
    } else {
      await api.post(`/archive/stories/${storyId}/handover-requests`, {
        toUserId: handoverForm.value.toUserId,
        reason: handoverForm.value.reason.trim(),
      });
    }
    handoverDialog.value = false;
    await loadHandoverContext(storyId);
    await fetchStories();
    toast.success(handoverMode.value === 'override'
      ? 'Đã chuyển người xử lý'
      : 'Đã gửi yêu cầu bàn giao');
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể thực hiện bàn giao');
  } finally {
    handoverSaving.value = false;
  }
}

async function respondHandover(accept: boolean) {
  const request = handoverContext.value?.pendingRequest;
  if (!request || !selectedStory.value) return;
  const storyId = selectedStory.value.id;
  const responseNote = accept
    ? ''
    : window.prompt('Lý do từ chối (không bắt buộc):', '') || '';
  handoverSaving.value = true;
  try {
    const { data } = await api.post(
      `/archive/handover-requests/${request.id}/${accept ? 'accept' : 'reject'}`,
      { responseNote },
    );
    if (data.story) {
      selectedStory.value = data.story;
      replaceStory(data.story);
    }
    await loadHandoverContext(storyId);
    await fetchStories();
    toast.success(accept ? 'Đã nhận bàn giao hồ sơ' : 'Đã từ chối nhận bàn giao');
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể phản hồi yêu cầu bàn giao');
  } finally {
    handoverSaving.value = false;
  }
}

async function cancelHandover() {
  const request = handoverContext.value?.pendingRequest;
  if (!request || !selectedStory.value) return;
  handoverSaving.value = true;
  try {
    await api.post(`/archive/handover-requests/${request.id}/cancel`);
    await loadHandoverContext(selectedStory.value.id);
    toast.success('Đã huỷ yêu cầu bàn giao');
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể huỷ yêu cầu bàn giao');
  } finally {
    handoverSaving.value = false;
  }
}

function assignmentRoleLabel(role: string) {
  const secondaryMatch = role.match(/^secondary_(\d+)$/);
  if (secondaryMatch) return `Phụ trách phụ ${secondaryMatch[1]}`;
  if (role === 'primary') return 'Phụ trách chính';
  return role;
}

function toggleAllMessages(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  selectedMessageIds.value = checked
    ? selectedStory.value?.messages.map((message) => message.id) || []
    : [];
}

async function removeSelectedMessages() {
  if (!selectedStory.value || selectedMessageIds.value.length === 0) return;
  if (!canRemoveStoryMessages(selectedStory.value)) {
    toast.error(mutationDeniedMessage(selectedStory.value));
    return;
  }
  if (selectedMessageIds.value.length >= selectedStory.value.messages.length) {
    toast.error('Hồ sơ phải giữ lại ít nhất một tin nhắn');
    return;
  }
  const confirmed = window.confirm(
    `Loại ${selectedMessageIds.value.length} tin nhắn đã chọn khỏi hồ sơ này?`,
  );
  if (!confirmed) return;

  messageRemoving.value = true;
  try {
    const { data } = await api.delete(`/archive/stories/${selectedStory.value.id}/messages`, {
      data: { messageIds: selectedMessageIds.value },
    });
    replaceStory(data.story);
    selectedStory.value = data.story;
    selectedMessageIds.value = [];
    toast.success(data.message || 'Đã loại tin nhắn khỏi hồ sơ');
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể loại tin nhắn khỏi hồ sơ');
  } finally {
    messageRemoving.value = false;
  }
}

function startTitleEdit() {
  if (!selectedStory.value || !canEditSelectedStoryTitle.value) return;
  titleDraft.value = extractTitleSuffix(selectedStory.value);
  titleEditing.value = true;
}

function cancelTitleEdit() {
  titleEditing.value = false;
}

async function saveTitle() {
  if (!selectedStory.value || !canEditSelectedStoryTitle.value) return;
  const titleSuffix = titleDraft.value.trim();
  titleSaving.value = true;
  try {
    const { data } = await api.patch(`/archive/stories/${selectedStory.value.id}`, { titleSuffix });
    replaceStory(data.story);
    selectedStory.value = data.story;
    titleEditing.value = false;
    toast.success(data.message || 'Đã cập nhật tiêu đề hồ sơ');
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể cập nhật tiêu đề hồ sơ');
  } finally {
    titleSaving.value = false;
  }
}

function extractTitleSuffix(story: ArchiveStory) {
  const title = (story.title || '').trim();
  const baseName = (story.conversationName || '').trim();
  if (!title || title === baseName) return '';
  const prefix = `${baseName} - `;
  return title.startsWith(prefix) ? title.slice(prefix.length).trim() : title;
}

async function openStoryFromNotification() {
  const storyId = typeof route.query.storyId === 'string' ? route.query.storyId : '';
  if (!storyId) return;
  try {
    const { data } = await api.get(`/archive/stories/${storyId}`);
    openDetail(data);
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể mở hồ sơ từ thông báo');
  }
}

function openStatusDialog(story: ArchiveStory | null) {
  if (!story) return;
  if (!canUpdateStoryStatus(story)) {
    toast.error(mutationDeniedMessage(story));
    return;
  }
  selectedStory.value = story;
  statusForm.value = {
    statusDefinitionId: storyStatus(story).id,
    resultContent: story.resultContent || '',
    note: '',
  };
  statusDialog.value = true;
}

function messageSenderLabel(message: ArchiveMessage) {
  if (message.senderType !== 'self') {
    return message.senderName || selectedStory.value?.conversationName || 'Khách';
  }
  const genericNames = new Set(['staff', 'sale', 'nhân viên']);
  const snapshotName = message.senderName?.trim();
  const zaloName = snapshotName && !genericNames.has(snapshotName.toLocaleLowerCase('vi-VN'))
    ? snapshotName
    : accountDisplayName(selectedStory.value) || 'Nhân viên';
  const systemUserName = applicationAccountName(message);
  return systemUserName ? `${zaloName} [${systemUserName}]` : zaloName;
}

function applicationAccountName(message: ArchiveMessage) {
  const repliedBy = message.sourceMessage?.repliedBy;
  const emailAccount = repliedBy?.email?.split('@')[0]?.trim();
  return emailAccount || repliedBy?.fullName?.trim() || '';
}

function archiveMessageAuditLabel(message: ArchiveMessage) {
  if (!message.addedBy && !message.addedAt) return '';
  const actor = message.addedBy?.fullName?.trim()
    || message.addedBy?.email?.split('@')[0]?.trim()
    || 'hệ thống';
  const action = message.addedSource === 'auto_reply_sync'
    ? 'Tự đồng bộ vào hồ sơ bởi'
    : 'Được thêm vào hồ sơ bởi';
  const time = message.addedAt ? ` lúc ${formatDate(message.addedAt)}` : '';
  return `${action} ${actor}${time}`;
}

function quoteMessageType(quote: any) {
  const cliType = Number(quote?.cliMsgType ?? 0);
  let msgType = String(quote?.msgType ?? '');
  if (!msgType && cliType) {
    msgType = ({
      1: 'text',
      19: 'link',
      22: 'video',
      23: 'sticker',
      24: 'voice',
      30: 'file',
      32: 'image',
      38: 'card',
      46: 'location',
    } as Record<number, string>)[cliType] || '';
  }
  if (!msgType && typeof quote?.attach === 'string' && quote.attach.length > 2) {
    try {
      const attach = JSON.parse(quote.attach);
      if (attach.thumbUrl || attach.oriUrl) msgType = 'image';
      else if (attach.href || attach.title) msgType = 'file';
    } catch {
      // Ignore malformed Zalo attach payloads.
    }
  }
  return msgType;
}

function quotePreviewContent(quote: any) {
  const text = String(quote?.msg ?? quote?.content ?? '').trim();
  if (text) return text;
  const msgType = quoteMessageType(quote);
  if (msgType === 'image') return '[Hình ảnh]';
  if (msgType === 'video') return '[Video]';
  if (msgType === 'voice' || msgType === 'audio') return '[Âm thanh]';
  if (msgType === 'file') {
    try {
      const attach = typeof quote?.attach === 'string' ? JSON.parse(quote.attach) : quote?.attach;
      return attach?.title || attach?.name || '[File]';
    } catch {
      return '[File]';
    }
  }
  return '[Tin nhắn]';
}

function archiveReplyPreview(message: ArchiveMessage): ArchiveReplyPreview | null {
  const quote = message.sourceMessage?.quote as any;
  if (!quote) return null;
  const preview: ArchiveReplyPreview = {
    sourceMessageId: quote.sourceMessageId,
    msgId: String(quote.msgId || quote.msg_id || quote.globalMsgId || '').trim() || undefined,
    cliMsgId: quote.cliMsgId ? String(quote.cliMsgId) : undefined,
    senderName: String(quote.fromD ?? quote.senderName ?? quote.fromName ?? '').trim() || undefined,
    content: quotePreviewContent(quote),
  };
  return preview.sourceMessageId || preview.msgId || preview.cliMsgId || preview.content ? preview : null;
}

function archiveReplyCandidateIds(reply: ArchiveReplyPreview) {
  return [reply.sourceMessageId, reply.msgId, reply.cliMsgId]
    .filter((value): value is string => Boolean(value && value.trim()));
}

function findArchiveReplyTarget(reply: ArchiveReplyPreview) {
  const candidates = archiveReplyCandidateIds(reply);
  return selectedStory.value?.messages.find((message) => {
    const source = message.sourceMessage;
    return candidates.some((candidate) =>
      message.id === candidate
      || source?.id === candidate
      || source?.zaloMsgId === candidate
      || source?.zaloMsgIdNum === candidate,
    );
  }) || null;
}

function focusArchiveTimelineMessage(archiveMessageId: string) {
  const element = document.querySelector<HTMLElement>(
    `.timeline-message[data-archive-message-id="${CSS.escape(archiveMessageId)}"]`,
  );
  if (!element) return false;
  document.querySelectorAll('.archive-message-focus-highlight').forEach((node) => {
    node.classList.remove('archive-message-focus-highlight');
  });
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  element.classList.add('archive-message-focus-highlight');
  window.setTimeout(() => element.classList.remove('archive-message-focus-highlight'), 3200);
  return true;
}

async function openArchiveReplyTarget(message: ArchiveMessage) {
  const reply = archiveReplyPreview(message);
  if (!reply || !selectedStory.value) return;
  const inStoryTarget = findArchiveReplyTarget(reply);
  if (inStoryTarget && focusArchiveTimelineMessage(inStoryTarget.id)) return;

  const lookupId = archiveReplyCandidateIds(reply)[0];
  if (!lookupId) {
    toast.error('Không xác định được tin nhắn được trả lời');
    return;
  }
  detailDialog.value = false;
  await router.push({
    name: 'Chat',
    params: { convId: selectedStory.value.conversationId },
    query: { messageId: lookupId, focusAt: String(Date.now()) },
  });
}

function kanbanConversationPreview(story: ArchiveStory) {
  return story.messages.slice(-3).map((message) => {
    const timestamp = message.sentAt.replace('T', ' ').slice(0, 19);
    let sender = message.senderName?.trim() || story.conversationName || 'Khách';
    if (message.senderType === 'self') {
      const zaloName = accountDisplayName(story) || sender || 'Nhân viên';
      const applicationName = applicationAccountName(message);
      sender = applicationName ? `${zaloName} [${applicationName}]` : zaloName;
    }
    return `[${timestamp}] ${sender}: ${message.contentSnapshot || `[${message.contentType}]`}`;
  }).join('\n');
}

async function saveStatus(statusDefinitionId?: string) {
  if (!selectedStory.value) return;
  if (!canUpdateStoryStatus(selectedStory.value)) {
    toast.error(mutationDeniedMessage(selectedStory.value));
    return;
  }
  if (isReopeningSelectedStory.value && !statusForm.value.note.trim()) {
    toast.error('Mở lại hồ sơ yêu cầu ghi rõ lý do');
    return;
  }
  statusSaving.value = true;
  try {
    const payload = {
      statusDefinitionId: statusDefinitionId || statusForm.value.statusDefinitionId,
      resultContent: statusForm.value.resultContent,
      note: statusForm.value.note,
    };
    const { data } = await api.patch(`/archive/stories/${selectedStory.value.id}/status`, payload);
    if (filters.value.status && filters.value.status !== data.story.statusDefinition?.id) {
      stories.value = stories.value.filter((item) => item.id !== data.story.id);
      total.value = Math.max(0, total.value - 1);
    } else {
      replaceStory(data.story);
    }
    selectedStory.value = data.story;
    statusDialog.value = false;
    toast.success(data.message || 'Đã cập nhật trạng thái');
    await fetchStories();
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể cập nhật trạng thái');
  } finally {
    statusSaving.value = false;
  }
}

async function quickChangeStatus(story: ArchiveStory, statusDefinitionId: string) {
  if (storyStatus(story).id === statusDefinitionId) return;
  if (!canUpdateStoryStatus(story)) {
    toast.error(mutationDeniedMessage(story));
    return;
  }
  selectedStory.value = story;
  statusForm.value = {
    statusDefinitionId,
    resultContent: story.resultContent || '',
    note: '',
  };
  const target = statusDefinitions.value.find((status) => status.id === statusDefinitionId);
  const source = storyStatus(story);
  const isReopening = Boolean(
    target
    && ['completed', 'cancelled'].includes(source.behaviorGroup)
    && source.id !== target.id,
  );
  if (target?.requireNote || target?.requireResult || isReopening) {
    statusDialog.value = true;
    return;
  }
  await saveStatus(statusDefinitionId);
}

async function retryBackup(story: ArchiveStory) {
  try {
    const { data } = await api.post(`/archive/stories/${story.id}/retry-backup`);
    story.backupStatus = 'pending';
    toast.success(data.message);
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể thử backup lại');
  }
}

function openMedia(media: ArchiveMedia) {
  previewMediaUrl.value = mediaUrl(media);
  previewMedia.value = media;
  mediaDialog.value = true;
}

function downloadArchiveMedia(media: ArchiveMedia) {
  downloadAttachment(media.sourceUrl || media.driveUrl, archiveMediaFileName(media));
}

function downloadPreviewMedia() {
  if (previewMedia.value) downloadArchiveMedia(previewMedia.value);
}

async function openConfig() {
  configDialog.value = true;
  try {
    const [accountsResponse, destinationsResponse] = await Promise.all([
      api.get('/zalo-accounts'),
      api.get('/archive/destinations'),
    ]);
    accounts.value = accountsResponse.data || [];
    destinations.value = destinationsResponse.data.destinations || [];
    if (!configForm.value.zaloAccountId && accounts.value[0]) {
      configForm.value.zaloAccountId = accounts.value[0].id;
    }
    applyDestination();
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể tải cấu hình Google');
  }
}

function applyDestination() {
  const destination = destinations.value.find((item) => item.zaloAccountId === configForm.value.zaloAccountId);
  configForm.value = {
    zaloAccountId: configForm.value.zaloAccountId,
    spreadsheetId: destination?.spreadsheetId || '',
    driveFolderId: destination?.driveFolderId || '',
    rawSheetName: destination?.rawSheetName || 'Raw_Messages',
    viewSheetName: destination?.viewSheetName || 'View_Messages',
    enabled: destination?.enabled ?? true,
  };
}

async function saveConfig() {
  if (!configForm.value.zaloAccountId) return;
  configSaving.value = true;
  try {
    const { zaloAccountId, ...payload } = configForm.value;
    const { data } = await api.put(`/archive/destinations/${zaloAccountId}`, payload);
    const index = destinations.value.findIndex((item) => item.zaloAccountId === zaloAccountId);
    if (index >= 0) destinations.value[index] = data;
    else destinations.value.push(data);
    configDialog.value = false;
    toast.success('Đã lưu cấu hình Google Archive');
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể lưu cấu hình Google');
  } finally {
    configSaving.value = false;
  }
}

function replaceStory(story: ArchiveStory) {
  const index = stories.value.findIndex((item) => item.id === story.id);
  if (index >= 0) stories.value[index] = story;
}

function mediaCount(story: ArchiveStory) {
  return story.messages.reduce((sum, message) => sum + message.media.length, 0);
}

function recalledMessageCount(story: ArchiveStory) {
  return story.messages.reduce((sum, message) => sum + (message.recalledAt ? 1 : 0), 0);
}

function firstMessageAt(story: ArchiveStory) {
  return story.messages[0]?.sentAt || null;
}

function lastMessagePreview(story: ArchiveStory) {
  const message = story.messages.at(-1);
  if (!message) return 'Chưa có nội dung trao đổi';
  const sentAt = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(message.sentAt));
  let sender = message.senderName?.trim() || story.conversationName || 'Khách';
  if (message.senderType === 'self') {
    const zaloName = accountDisplayName(story) || sender || 'Nhân viên';
    const applicationName = applicationAccountName(message);
    sender = applicationName ? `${zaloName} [${applicationName}]` : zaloName;
  }
  return `[${sentAt}] ${sender}: ${message.contentSnapshot || `[${message.contentType}]`}`;
}

function storyAssigneeLabel(story: ArchiveStory) {
  return story.assignedUser?.fullName || 'Chưa phân công';
}

function pendingHandoverLabel(story: ArchiveStory) {
  const request = story.transferRequests?.find((item) => item.status === 'pending') || null;
  if (!request) return '';
  return `${request.fromUser?.fullName || 'Người xử lý'} → ${request.toUser?.fullName || 'Người nhận'}`;
}

function assignmentOriginLabel(story: ArchiveStory) {
  if (!story.assignmentOrigin || story.assignmentOrigin === 'initial') return 'Gắn ban đầu';
  if (story.assignmentOrigin === 'handover') return 'Đã nhận bàn giao';
  if (story.assignmentOrigin === 'manager_override') return 'QL/Admin chuyển';
  return '';
}

function assignmentOriginIcon(story: ArchiveStory) {
  if (!story.assignmentOrigin || story.assignmentOrigin === 'initial') return 'mdi-account-check-outline';
  if (story.assignmentOrigin === 'manager_override') return 'mdi-account-tie-outline';
  return 'mdi-account-arrow-right-outline';
}

function assignmentOriginClass(story: ArchiveStory) {
  if (!story.assignmentOrigin || story.assignmentOrigin === 'initial') return 'is-initial';
  if (story.assignmentOrigin === 'manager_override') return 'is-manager-override';
  return 'is-handover';
}

function isDeletedZaloAccount(story: ArchiveStory) {
  return Boolean(story.zaloAccount?.deletedAt || story.zaloAccountDeletedAt);
}

function accountDisplayName(story: ArchiveStory | null | undefined) {
  return story?.zaloAccount?.displayName?.trim()
    || story?.zaloAccountDisplayNameSnapshot?.trim()
    || '';
}

async function searchCustomers(query: string) {
  const q = query.trim();
  if (q.length < 2) {
    customerOptions.value = [];
    return;
  }
  customerLoading.value = true;
  try {
    const { data } = await api.get('/archive/filter-options/conversations', {
      params: {
        q,
        limit: 10,
        departmentId: filters.value.departmentId || undefined,
      },
    });
    customerOptions.value = (data.items || []).map((item: any) => ({
      ...item,
      label: String(item.name || 'Chưa đặt tên'),
      subtitle: [
        item.type === 'group' ? 'Nhóm' : item.phone || 'Cá nhân',
        item.zaloAccount?.displayName ? `Zalo: ${item.zaloAccount.displayName}` : '',
      ].filter(Boolean).join(' · '),
    }));
  } catch (error: any) {
    customerOptions.value = [];
    toast.error(error?.response?.data?.error || 'Không thể tìm khách hàng hoặc nhóm');
  } finally {
    customerLoading.value = false;
  }
}

function mediaUrl(media: ArchiveMedia) {
  return resolveAttachmentUrl(media.driveUrl || media.sourceUrl);
}

function archiveMediaFileName(media: ArchiveMedia) {
  if (media.fileName?.trim()) return media.fileName.trim();
  const ext = media.mimeType?.split('/')[1]?.split(';')[0]
    || ({
      image: 'jpg',
      gif: 'gif',
      sticker: 'png',
      video: 'mp4',
      voice: 'mp3',
      audio: 'mp3',
      file: 'bin',
    } as Record<string, string>)[media.mediaType]
    || 'bin';
  return `archive-${media.mediaType || 'media'}-${media.id}.${ext.replace(/^\./, '')}`;
}

function isImage(media: ArchiveMedia) {
  return ['image', 'gif', 'sticker'].includes(media.mediaType)
    || Boolean(media.mimeType?.startsWith('image/'));
}

function mediaIcon(type: string) {
  return ({
    video: 'mdi-video-outline',
    voice: 'mdi-microphone-outline',
    audio: 'mdi-music-note',
    file: 'mdi-file-outline',
  } as Record<string, string>)[type] || 'mdi-paperclip';
}

function recordTypeLabel(value: string) {
  return ({
    order: 'ĐƠN HÀNG',
    quotation: 'YÊU CẦU BÁO GIÁ',
    customer_care: 'CHĂM SÓC KHÁCH HÀNG',
    other: 'HỒ SƠ KHÁC',
  } as Record<string, string>)[value] || value.toUpperCase();
}

function storyStatus(story: ArchiveStory): ArchiveStatusDefinition {
  if (story.statusDefinition) return story.statusDefinition;
  const fallbackCode = story.businessStatus === 'completed'
    ? 'completed'
    : story.businessStatus === 'cancelled'
      ? 'cancelled'
      : 'processing';
  const configured = statusDefinitions.value.find((status) => (
    status.code === fallbackCode
    && (!status.departmentId || status.departmentId === story.department?.id)
  ));
  if (configured) return configured;
  const behaviorGroup = story.businessStatus === 'completed'
    ? 'completed'
    : story.businessStatus === 'cancelled'
      ? 'cancelled'
      : 'active';
  return {
    id: `legacy:${story.businessStatus}`,
    code: fallbackCode,
    name: behaviorGroup === 'completed'
      ? 'Hoàn thành'
      : behaviorGroup === 'cancelled'
        ? 'Huỷ'
        : 'Đang xử lý',
    behaviorGroup,
    colorToken: behaviorGroup === 'completed'
      ? 'success'
      : behaviorGroup === 'cancelled'
        ? 'error'
        : 'primary',
    icon: behaviorGroup === 'completed'
      ? 'mdi-check-circle-outline'
      : behaviorGroup === 'cancelled'
        ? 'mdi-cancel'
        : 'mdi-progress-clock',
    displayOrder: 999,
    isDefault: false,
    showOnKanban: true,
    showCountOnOverview: ['active', 'waiting'].includes(behaviorGroup),
    allowMessageAppend: behaviorGroup === 'active',
    autoSyncReplies: behaviorGroup === 'active',
    requireNote: behaviorGroup === 'cancelled',
    requireResult: behaviorGroup === 'completed',
    isSystem: true,
    isActive: true,
  };
}

function transitionOptions(story: ArchiveStory) {
  const source = storyStatus(story);
  const configuredSource = statusDefinitions.value.find((status) => status.id === source.id);
  const allowedIds = configuredSource?.allowedTransitionIds
    || configuredSource?.transitionsFrom?.map((transition) => transition.toStatusId)
    || [];
  return statusDefinitions.value.filter((target) => {
    if (!target.isActive || target.id === source.id) return false;
    if (target.departmentId && target.departmentId !== story.department?.id) return false;
    if (allowedIds.length) return allowedIds.includes(target.id);
    return defaultTransitionAllowed(source.behaviorGroup, target.behaviorGroup);
  });
}

function defaultTransitionAllowed(
  source: ArchiveStatusDefinition['behaviorGroup'],
  target: ArchiveStatusDefinition['behaviorGroup'],
) {
  if (source === 'completed' || source === 'cancelled') return target === 'active';
  return true;
}

function behaviorLabel(value: ArchiveStatusDefinition['behaviorGroup']) {
  return ({
    active: 'Đang xử lý',
    waiting: 'Đang chờ',
    completed: 'Hoàn thành',
    cancelled: 'Đã huỷ',
  } as const)[value];
}

function statusColor(status: ArchiveStatusDefinition) {
  return ({
    primary: 'primary',
    warning: 'warning',
    success: 'success',
    error: 'error',
    neutral: 'grey',
    info: 'info',
  } as Record<string, string>)[status.colorToken] || 'primary';
}

function statusPillStyle(status: ArchiveStatusDefinition) {
  const palette = ({
    primary: { color: '#174ea6', background: '#e8f0fe', borderColor: '#c7d7f7' },
    warning: { color: '#9a5b00', background: '#fff4db', borderColor: '#f5d991' },
    success: { color: '#137333', background: '#e6f4ea', borderColor: '#b7dfc2' },
    error: { color: '#b3261e', background: '#fce8e6', borderColor: '#efc2bd' },
    neutral: { color: '#475569', background: '#f1f5f9', borderColor: '#d8e0e8' },
    info: { color: '#075985', background: '#e0f2fe', borderColor: '#bae6fd' },
  } as Record<string, { color: string; background: string; borderColor: string }>)[status.colorToken]
    || { color: '#174ea6', background: '#e8f0fe', borderColor: '#c7d7f7' };
  return palette;
}

function kanbanColumnStyle(status: ArchiveStatusDefinition) {
  return {
    '--archive-kanban-status': statusPillStyle(status).color,
  };
}

function statusCountFor(status: ArchiveStatusDefinition) {
  return statusCounts.value[status.id] || 0;
}

function backupLabel(value: string) {
  return ({
    pending: 'Chờ backup',
    syncing: 'Đang backup',
    completed: 'Đã backup Google',
    partial: 'Backup một phần',
    failed: 'Backup lỗi',
  } as Record<string, string>)[value] || value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

onMounted(async () => {
  window.addEventListener('click', closeMessageContextMenu);
  window.addEventListener('scroll', closeMessageContextMenu, true);
  await loadFilterContext();
  await fetchStatusDefinitions();
  await fetchStories();
  await openStoryFromNotification();
});

onUnmounted(() => {
  window.removeEventListener('click', closeMessageContextMenu);
  window.removeEventListener('scroll', closeMessageContextMenu, true);
});

watch(
  () => route.query.storyId,
  (storyId, previousStoryId) => {
    if (storyId && storyId !== previousStoryId) void openStoryFromNotification();
  },
);

watch(customerSearch, (value) => {
  if (customerSearchTimer) clearTimeout(customerSearchTimer);
  customerSearchTimer = setTimeout(() => {
    void searchCustomers(value || '');
  }, 300);
});
</script>

<style scoped>
.archive-page {
  min-height: calc(100vh - 52px);
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.06), transparent 18%),
    linear-gradient(180deg, #f7faff 0%, #f4f7fb 100%);
  color: #172033;
}

.archive-header,
.filter-panel,
.story-card,
.kanban-column {
  border: 1px solid #dbe5f1;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.05);
}

.archive-header {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(360px, .95fr);
  gap: 28px;
  max-width: 1480px;
  margin: 0 auto 18px;
  padding: 30px 34px;
  border-radius: 28px;
}

.archive-summary {
  min-width: 0;
  max-width: 720px;
}

.eyebrow {
  margin: 0 0 10px;
  color: #647aa3;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .16em;
}

h1 {
  margin: 0;
  color: #0f172a;
  font-size: 34px;
  font-weight: 800;
  line-height: 1.15;
}

.archive-header p {
  max-width: 560px;
  margin: 18px 0 0;
  color: #596780;
  font-size: 15px;
  line-height: 1.75;
}

.header-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: 14px;
  align-content: start;
}

.quick-stat {
  display: grid;
  place-items: center;
  min-height: 132px;
  padding: 18px;
  border: 1px solid #dfe8f4;
  border-radius: 18px;
  background: linear-gradient(180deg, #f8fbff 0%, #f3f7fd 100%);
  text-align: center;
}

.quick-stat strong,
.quick-stat span {
  display: block;
}

.quick-stat strong {
  margin-bottom: 8px;
  color: #173b92;
  font-size: 42px;
  font-weight: 800;
  line-height: 1;
}

.quick-stat span {
  color: #62748f;
  font-size: 13px;
}

.quick-stat.danger {
  background: linear-gradient(180deg, #fff8f8 0%, #fff2f2 100%);
  border-color: #ffd7d7;
}

.quick-stat.danger strong,
.quick-stat.danger span {
  color: #dc2626;
}

.config-trigger {
  min-height: 52px;
  border-radius: 16px;
  font-weight: 700;
}

.archive-toolbar {
  display: grid;
  gap: 14px;
  max-width: 1480px;
  margin: 0 auto 18px;
}

.status-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  padding: 0 8px;
  border-bottom: 1px solid #d7e0ec;
  scrollbar-width: none;
}

.status-tabs::-webkit-scrollbar {
  display: none;
}

.status-tabs button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 124px;
  padding: 14px 12px 16px;
  border: 0;
  background: transparent;
  color: #5f6f89;
  cursor: pointer;
  white-space: nowrap;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
  transition: color .18s ease;
}

.status-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: #eef4ff;
  color: #1d4ed8;
  border: 1px solid #cfe0ff;
  font-size: 12px;
  line-height: 1;
  font-weight: 800;
}

.status-tabs button.active .status-tab-count {
  background: #1d4ed8;
  color: #fff;
  border-color: #1d4ed8;
}

.status-tabs button::after {
  content: "";
  position: absolute;
  right: 12px;
  bottom: -1px;
  left: 12px;
  height: 3px;
  border-radius: 999px;
  background: transparent;
}

.status-tabs button.active {
  color: #1d4ed8;
}

.status-tabs button.active::after {
  background: linear-gradient(90deg, #2563eb, #3b82f6);
}

.filter-panel {
  display: grid;
  min-width: 0;
  gap: 16px;
  padding: 20px 22px;
  border-radius: 24px;
}

.filter-panel :deep(.v-input) {
  min-width: 0;
}

.filter-panel :deep(.v-field) {
  border-radius: 16px;
  background: #fbfdff;
  box-shadow: inset 0 0 0 1px rgba(219, 229, 241, 0.75);
}

.filter-panel :deep(.v-field__outline) {
  --v-field-border-opacity: 0;
}

.filter-panel :deep(.v-field__input) {
  color: #172033;
}

.filter-panel :deep(.v-label),
.filter-panel :deep(.v-field__prepend-inner) {
  color: #8a9ab3;
}

.filter-panel :deep(.v-field-label--floating) {
  width: auto;
  max-width: calc(100% - 28px);
  padding: 0 5px;
  background: #fff;
}

.filter-row {
  display: grid;
  min-width: 0;
  gap: 14px;
  align-items: end;
}

.filter-row-primary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.filter-row-secondary {
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr) auto;
}

.filter-actions {
  display: grid;
  grid-template-columns: auto minmax(146px, 1fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.view-switch {
  display: flex;
  align-items: center;
  padding: 4px;
  border: 1px solid #d8e2ee;
  border-radius: 14px;
  background: #f9fbff;
}

.view-switch button {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #8091ad;
  cursor: pointer;
}

.view-switch button.active {
  background: #172033;
  color: white;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.refresh-btn {
  width: 100%;
  min-height: 48px;
  border-radius: 14px;
  font-weight: 700;
}

.story-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 18px;
  max-width: 1480px;
  margin: auto;
}

.story-grid.view-list {
  grid-template-columns: 1fr;
}

.story-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 20px 22px;
  border-radius: 22px;
}

.view-list .story-card {
  display: grid;
  grid-template-columns: minmax(250px, 1.05fr) minmax(360px, 1.6fr) minmax(280px, .88fr);
  gap: 0;
  padding: 0;
  overflow: hidden;
}

.view-list .story-heading,
.view-list .content-preview,
.view-list .story-card > footer {
  min-width: 0;
  padding: 28px 30px;
}

.view-list .story-heading {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 12px;
  border-right: 1px solid #edf2f7;
}

.view-list .content-preview {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 18px;
  min-height: 100%;
  margin: 0;
  border-right: 1px solid #edf2f7;
  color: #51627e;
  font-size: 13px;
  line-height: 1.8;
  overflow-wrap: anywhere;
  word-break: break-word;
  -webkit-line-clamp: 4;
}

.view-list .story-counts {
  justify-content: flex-start;
}

.view-list .story-card > footer {
  justify-content: center;
  align-items: stretch;
  gap: 20px;
  border-top: 0;
}

.story-heading,
footer {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}

.story-title {
  min-width: 0;
}

.story-title > span {
  display: inline-block;
  margin-bottom: 12px;
  color: #2563eb;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .12em;
}

.story-title h2 {
  overflow: hidden;
  margin: 0 0 8px;
  color: #0f172a;
  font-size: 19px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.story-title p {
  overflow: hidden;
  margin: 0;
  color: #71829c;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-preview {
  display: -webkit-box;
  overflow: hidden;
  min-height: 42px;
  margin: 0;
  color: #334155;
  font-size: 13px;
  line-height: 1.7;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.story-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  color: #64748b;
  font-size: 12px;
}

.story-counts span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-pill,
.backup-state {
  width: fit-content;
  height: fit-content;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.status-pending {
  background: #fff8eb;
  color: #c97a09;
}

.status-completed {
  background: #ecfdf3;
  color: #047857;
}

.status-cancelled {
  background: #f2f5f9;
  color: #64748b;
}

.backup-completed {
  background: #ecfdf5;
  color: #047857;
}

.backup-failed,
.backup-partial {
  background: #fff1f1;
  color: #dc2626;
}

.backup-pending,
.backup-syncing {
  background: #edf5ff;
  color: #1d4ed8;
}

footer {
  align-items: end;
  padding-top: 12px;
  border-top: 1px solid #edf1f6;
}

.story-meta {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #71829c;
  font-size: 12px;
}

.story-meta strong {
  color: #0f172a;
  font-size: 15px;
}

.story-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.kanban-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  width: 100%;
  max-width: 1480px;
  margin: auto;
  align-items: start;
}

.kanban-column {
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border-radius: 24px;
}

.kanban-column > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid #e8eef6;
  background: #fdfefe;
  font-weight: 800;
  font-size: 15px;
}

.kanban-column > header strong {
  min-width: 34px;
  padding: 4px 10px;
  border: 1px solid #d7e2ef;
  border-radius: 999px;
  background: white;
  color: #46556f;
  text-align: center;
  font-size: 13px;
}

.kanban-items {
  display: grid;
  min-width: 0;
  gap: 14px;
  padding: 16px;
  background: linear-gradient(180deg, #f7faff 0%, #f4f7fb 100%);
}

.kanban-card {
  min-width: 0;
  overflow: hidden;
  padding: 18px;
  border: 1px solid #dde7f2;
  border-radius: 18px;
  background: white;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(30, 58, 95, 0.05);
}

.kanban-card:hover {
  border-color: #9ab8ea;
}

.kanban-card-head,
.kanban-card footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #71829c;
  font-size: 11px;
}

.kanban-card-head span {
  color: #2563eb;
  font-weight: 800;
  letter-spacing: .1em;
}

.kanban-head-meta {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  white-space: nowrap;
}

.kanban-head-meta .kanban-warning {
  position: static;
  width: 20px;
  height: 20px;
  color: #ba1a1a !important;
  filter: none;
}

.kanban-card h3 {
  overflow: hidden;
  margin: 10px 0 8px;
  color: #0f172a;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 18px;
  font-weight: 800;
}

.kanban-card .content-preview {
  overflow-wrap: anywhere;
  word-break: break-word;
  min-height: 66px;
  white-space: pre-line;
}

.kanban-card footer {
  align-items: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #edf1f6;
}

.kanban-card footer > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.kanban-card footer strong {
  overflow: hidden;
  color: #334155;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kanban-result {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 7px 10px;
  border: 0;
  border-radius: 10px;
  background: #eef5ff;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.kanban-empty {
  padding: 56px 16px;
  color: #94a3b8;
  text-align: center;
  font-size: 13px;
}
.center-state { display: grid; place-items: center; min-height: 300px; text-align: center; color: #64748b; }
.center-state.empty { grid-column: 1 / -1; }
.detail-card { overflow: hidden; background: #fff; }
.detail-title { display: flex; justify-content: space-between; align-items: start; padding: 22px 24px; border-bottom: 1px solid #e5e7eb; }
.detail-title small { display: inline-block; padding: 4px 8px; border-radius: 3px; background: #eef2ff; color: #3451a3; font-size: 10px; font-weight: 800; }
.detail-title h2 { margin: 8px 0 0; color: #171717; font-size: 27px; font-weight: 800; }
.detail-body { padding: 0 !important; background: #f8f9fb; }
.detail-sticky-top {
  position: sticky;
  top: 0;
  z-index: 5;
  background: #fff;
  box-shadow: 0 8px 18px rgba(15, 23, 42, .06);
}
.detail-meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 16px 24px; border-bottom: 1px solid #e5e7eb; }
.detail-meta span { padding: 5px 11px; border: 1px solid #dde3ec; border-radius: 999px; background: #f0f3f7; color: #536176; font-size: 11px; }
.timeline { display: flex; min-height: 250px; flex-direction: column; gap: 14px; padding: 24px; }
.timeline-message { width: fit-content; min-width: 260px; max-width: min(72%, 620px); padding: 14px 16px; border: 1px solid #d8dee8; border-radius: 10px; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, .03); }
.timeline-message.is-customer { align-self: flex-start; }
.timeline-message.is-staff { align-self: flex-end; }
.message-head { display: flex; justify-content: space-between; gap: 24px; color: #64748b; font-size: 11px; }
.message-head strong { color: #172033; font-size: 12px; }
.timeline-message.is-staff .message-head strong { color: #1d4ed8; }
.timeline-message p { margin: 9px 0 0; color: #1f2937; line-height: 1.55; white-space: pre-wrap; }
.archive-reply-card {
  display: block;
  width: 100%;
  margin: 10px 0 2px;
  padding: 8px 10px;
  border: 0;
  border-left: 3px solid #2563eb;
  border-radius: 8px;
  background: rgba(37, 99, 235, 0.08);
  color: #1f2937;
  text-align: left;
  cursor: pointer;
  transition: background-color .16s ease, transform .16s ease;
}
.archive-reply-card:hover {
  background: rgba(37, 99, 235, 0.14);
  transform: translateY(-1px);
}
.archive-reply-card span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 700;
}
.archive-reply-card strong {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.archive-message-focus-highlight {
  animation: archive-message-focus-pulse 3.2s ease;
}
@keyframes archive-message-focus-pulse {
  0%, 100% { box-shadow: 0 1px 2px rgba(15, 23, 42, .03); }
  12%, 72% {
    background: rgba(254, 226, 226, .72);
    box-shadow: 0 0 0 3px rgba(239, 68, 68, .32), 0 10px 28px rgba(249, 115, 22, .24);
  }
}
.archive-message-context-menu {
  position: fixed;
  z-index: 3000;
  width: 220px;
  padding: 6px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 18px 45px rgba(15, 23, 42, .18);
}
.archive-message-context-menu button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #172033;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.archive-message-context-menu button:hover {
  background: #eff6ff;
  color: #1457e6;
}
.detail-actions { min-height: 76px; padding: 14px 24px !important; border-top: 1px solid #e5e7eb; background: #fff; }
.detail-actions :deep(.v-btn) { min-height: 42px; font-weight: 700; }
.media-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.image-thumb { position: relative; width: 110px; height: 86px; overflow: hidden; padding: 0; border: 1px solid #dbe4ef; border-radius: 10px; background: #f8fafc; cursor: pointer; }
.image-thumb img { width: 100%; height: 100%; object-fit: cover; }
.archive-media-download {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
}
.image-thumb:hover .archive-media-download { opacity: 1; }
.archive-media-download:hover { background: rgba(15, 23, 42, 0.92); }
.file-link { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border: 0; border-radius: 9px; background: #eff6ff; color: #1d4ed8; text-decoration: none; cursor: pointer; }
.file-link:hover { background: #dbeafe; }
.media-preview-download {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 10px;
  padding: 9px 14px;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
.media-preview-download:hover { filter: brightness(0.96); }
.recall-note { display: flex; align-items: center; gap: 5px; margin-top: 8px; color: #b91c1c; font-size: 11px; }
.archive-message-audit {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
}
.archive-message-audit .v-icon {
  color: #64748b;
}
.result-box { margin: 0 24px 24px; padding: 12px; border-left: 3px solid #0f766e; background: #f0fdfa; }
.result-box p { margin: 4px 0 0; }
.media-preview { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px; }
.media-preview img { max-width: 100%; max-height: 82vh; border-radius: 12px; background: #111827; }
.media-preview a { color: white; }
.config-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 1200px) {
  .archive-header {
    grid-template-columns: 1fr;
  }

  .header-actions {
    grid-template-columns: repeat(3, minmax(120px, 1fr));
  }

  .view-list .story-card {
    grid-template-columns: minmax(220px, .95fr) minmax(0, 1.3fr);
  }

  .view-list .story-heading,
  .view-list .content-preview {
    padding: 26px;
  }

  .view-list .story-card > footer {
    grid-column: 1 / -1;
    align-items: center;
    padding: 20px 26px 24px;
    border-top: 1px solid #edf1f6;
    border-left: 0;
  }
}
@media (max-width: 900px) {
  .archive-page {
    padding: 18px;
  }

  .archive-header {
    padding: 24px;
  }

  .header-actions {
    grid-template-columns: 1fr 1fr;
  }

  .filter-row-primary, .filter-row-secondary { grid-template-columns: 1fr 1fr; }
  .filter-actions { grid-column: 1 / -1; }

  .view-list .story-card {
    display: flex;
    gap: 0;
  }

  .view-list .story-heading,
  .view-list .content-preview,
  .view-list .story-card > footer {
    padding: 22px;
    border-right: 0;
  }

  .view-list .story-card > footer {
    padding-top: 18px;
    border-top: 1px solid #edf1f6;
    border-left: 0;
  }

  .kanban-board { grid-template-columns: repeat(3, minmax(300px, 1fr)); overflow-x: auto; }
}
@media (max-width: 600px) {
  .archive-page { padding: 12px; }
  .archive-header { padding: 20px; border-radius: 22px; }
  h1 { font-size: 28px; }
  .header-actions { grid-template-columns: 1fr; }
  .quick-stat { min-height: 108px; }
  .status-tabs { width: 100%; padding: 0 2px; }
  .status-tabs button { min-width: 122px; padding: 12px 10px 14px; font-size: 15px; }
  .filter-panel { padding: 16px; border-radius: 20px; }
  .story-grid { grid-template-columns: 1fr; }
  footer { align-items: stretch; flex-direction: column; }
  .config-row { grid-template-columns: 1fr; }
  .filter-row-primary, .filter-row-secondary { grid-template-columns: 1fr; }
  .filter-actions { grid-column: auto; grid-template-columns: 1fr; }
  .view-switch { justify-content: center; }
  .story-card { border-radius: 18px; }
  .view-list .story-heading,
  .view-list .content-preview,
  .view-list .story-card > footer {
    padding: 18px;
  }
  .detail-title { padding: 18px; }
  .detail-title h2 { font-size: 22px; }
  .detail-meta { padding: 12px 18px; }
  .timeline { min-height: 220px; padding: 18px 12px; }
  .timeline-message { min-width: 0; max-width: 88%; padding: 12px; }
  .message-head { gap: 12px; }
  .detail-actions { min-height: 64px; padding: 10px 14px !important; }
  .result-box { margin: 0 12px 18px; }
}

/* Compact archive workspace */
@media (min-width: 901px) {
  .archive-header {
    grid-template-columns: minmax(0, 1fr) minmax(540px, .9fr);
    gap: 20px;
    margin-bottom: 12px;
    padding: 18px 22px;
    border-radius: 18px;
  }

  .eyebrow {
    margin-bottom: 4px;
    font-size: 12px;
  }

  h1 {
    font-size: 27px;
  }

  .archive-header p {
    margin-top: 7px;
    font-size: 12px;
    line-height: 1.45;
  }

  .header-actions {
    grid-template-columns: repeat(3, minmax(96px, 1fr)) auto;
    gap: 8px;
    align-items: stretch;
  }

  .quick-stat {
    min-height: 72px;
    padding: 8px 10px;
    border-radius: 12px;
  }

  .quick-stat strong {
    margin-bottom: 2px;
    font-size: 24px;
  }

  .quick-stat span {
    font-size: 9px;
  }

  .config-trigger {
    min-height: 72px;
    border-radius: 12px;
  }

  .archive-toolbar {
    gap: 8px;
    margin-bottom: 12px;
  }

  .status-tabs button {
    padding: 9px 12px 11px;
    font-size: 14px;
  }

  .filter-panel {
    gap: 8px;
    padding: 10px 12px;
    border-radius: 14px;
  }

  .filter-row {
    gap: 8px;
  }

  .filter-panel :deep(.v-field) {
    border-radius: 10px;
  }

  .view-switch {
    padding: 3px;
    border-radius: 10px;
  }

  .view-switch button {
    width: 34px;
    height: 32px;
    border-radius: 7px;
  }

  .refresh-btn {
    min-height: 40px;
    border-radius: 10px;
  }
}

@media (min-width: 1201px) {
  .story-grid {
    gap: 9px;
  }

  .view-list .story-card {
    display: grid;
    grid-template-columns:
      minmax(220px, 1fr)
      minmax(320px, 1.55fr)
      minmax(190px, .72fr)
      minmax(300px, 1fr);
    min-height: 112px;
    padding: 0;
    border-radius: 14px;
  }

  .view-list .story-heading,
  .view-list .content-preview,
  .view-list .story-counts,
  .view-list .story-card > footer {
    min-width: 0;
    padding: 12px 18px;
  }

  .view-list .story-heading {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-right: 1px solid #edf2f7;
  }

  .view-list .content-preview {
    display: -webkit-box;
    min-height: auto;
    margin: 0;
    border-right: 1px solid #edf2f7;
    font-size: 12px;
    line-height: 1.5;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .view-list .story-counts {
    flex-wrap: nowrap;
    justify-content: center;
    gap: 10px;
    border-right: 1px solid #edf2f7;
    white-space: nowrap;
  }

  .view-list .story-card > footer {
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-top: 0;
  }

  .story-title > span {
    margin-bottom: 4px;
    font-size: 9px;
  }

  .story-title h2 {
    margin-bottom: 3px;
    font-size: 15px;
  }

  .story-title p {
    font-size: 10px;
  }

  .status-pill,
  .backup-state {
    padding: 4px 7px;
    font-size: 9px;
  }

  .story-meta {
    gap: 2px;
    font-size: 9px;
  }

  .story-meta strong {
    font-size: 11px;
  }

  .story-actions {
    flex-wrap: nowrap;
    gap: 0;
  }

  .story-actions :deep(.v-btn) {
    min-width: auto;
    padding-inline: 7px;
    font-size: 10px;
  }
}

/* Horizon-inspired archive workspace */
.stats-panel {
  display: grid;
  grid-template-columns: repeat(3, minmax(108px, 1fr));
}

.story-conversation {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

@media (min-width: 1201px) {
  .archive-page {
    padding: 28px 36px 52px;
    background: #fff;
  }

  .archive-header,
  .archive-toolbar,
  .story-grid,
  .kanban-board,
  .center-state {
    width: 100%;
    max-width: 1200px;
    margin-right: auto;
    margin-left: auto;
  }

  .archive-header {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 40px;
    align-items: start;
    margin-bottom: 18px;
    padding: 0 0 28px;
    border: 0;
    border-bottom: 1px solid #e2e8f0;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
  }

  .archive-summary {
    padding-top: 2px;
  }

  .eyebrow {
    margin-bottom: 7px;
    color: #536987;
    font-size: 13px;
    letter-spacing: .08em;
  }

  h1 {
    color: #0f172a;
    font-size: 36px;
    line-height: 1.12;
  }

  .archive-header p {
    max-width: 660px;
    margin-top: 11px;
    color: #536987;
    font-size: 16px;
    line-height: 1.5;
  }

  .header-actions {
    display: flex;
    grid-template-columns: none;
    gap: 8px;
    align-items: center;
  }

  .stats-panel {
    min-width: 426px;
    overflow: hidden;
    border: 1px solid #d9e2ef;
    border-radius: 12px;
    background: #f8fafc;
  }

  .quick-stat {
    min-height: 92px;
    padding: 17px 18px;
    border: 0;
    border-left: 1px solid #e2e8f0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .quick-stat:first-child {
    border-left: 0;
    background: #fff;
    box-shadow: 0 1px 5px rgba(15, 23, 42, .08);
  }

  .quick-stat strong {
    margin-bottom: 7px;
    color: #1457e6;
    font-size: 25px;
  }

  .quick-stat span {
    color: #52647f;
    font-size: 13px;
  }

  .quick-stat.danger strong,
  .quick-stat.danger span {
    color: #e11d2e;
  }

  .config-trigger {
    width: 44px;
    min-width: 44px !important;
    height: 44px;
    min-height: 44px;
    border-radius: 10px;
    color: #64748b;
  }

  .archive-toolbar {
    gap: 40px;
    margin-bottom: 30px;
  }

  .status-tabs {
    width: 100%;
    padding: 0;
    gap: 26px;
    overflow: visible;
    border: 0;
    border-bottom: 1px solid #dfe6ef;
    border-radius: 0;
    background: transparent;
  }

  .status-tabs button {
    min-width: 118px;
    padding: 16px 4px 18px;
    color: #536987;
    font-size: 16px;
    border-bottom: 2px solid transparent;
  }

  .status-tabs button.active {
    color: #1457e6;
    border-bottom-color: #1457e6;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .filter-panel {
    gap: 28px;
    padding: 40px;
    border: 1px solid #d9e2ef;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 2px 5px rgba(15, 23, 42, .06);
  }

  .filter-row {
    gap: 20px;
  }

  .filter-row-secondary {
    grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  }

  .filter-panel :deep(.v-field) {
    min-height: 52px;
    border-radius: 11px;
    background: #fff;
  }

  .filter-panel :deep(.v-field__input) {
    min-height: 52px;
    font-size: 15px;
  }

  .filter-actions {
    gap: 14px;
  }

  .view-switch {
    min-height: 52px;
    padding: 4px;
    border-radius: 11px;
    background: #f1f5f9;
  }

  .view-switch button {
    width: 42px;
    height: 42px;
    border-radius: 8px;
  }

  .view-switch button.active {
    color: #0f172a;
    background: #fff;
    box-shadow: 0 1px 4px rgba(15, 23, 42, .12);
  }

  .refresh-btn {
    min-width: 148px;
    min-height: 52px;
    border-radius: 11px;
    color: #1e293b;
    background: #f1f3f6;
  }

  .story-grid {
    gap: 18px;
  }

  .view-list .story-card {
    grid-template-columns: minmax(300px, .95fr) minmax(410px, 1.3fr) minmax(310px, 1fr);
    min-height: 230px;
    overflow: hidden;
    border: 1px solid #d9e2ef;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 2px 5px rgba(15, 23, 42, .07);
  }

  .view-list .story-heading,
  .view-list .story-conversation,
  .view-list .story-card > footer {
    min-width: 0;
    padding: 38px 40px;
  }

  .view-list .story-heading {
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 30px;
    border-right: 1px solid #e7ecf2;
  }

  .story-title > span {
    margin-bottom: 10px;
    color: #1457e6;
    font-size: 11px;
    letter-spacing: .07em;
  }

  .story-title h2 {
    margin-bottom: 7px;
    color: #0f172a;
    font-size: 20px;
    line-height: 1.25;
  }

  .story-title p {
    color: #617590;
    font-size: 14px;
  }

  .status-pill,
  .backup-state {
    padding: 7px 12px;
    font-size: 12px;
  }

  .view-list .story-conversation {
    justify-content: space-between;
    border-right: 1px solid #e7ecf2;
  }

  .view-list .story-conversation .content-preview {
    display: -webkit-box;
    min-height: auto;
    margin: 0;
    padding: 0;
    border: 0;
    color: #22314a;
    font-size: 15px;
    line-height: 1.75;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }

  .view-list .story-conversation .story-counts {
    justify-content: flex-start;
    gap: 18px;
    padding: 18px 0 0;
    border: 0;
    border-top: 1px solid #edf1f5;
    color: #617590;
    font-size: 13px;
    white-space: nowrap;
  }

  .view-list .story-card > footer {
    flex-direction: column;
    align-items: stretch;
    justify-content: space-between;
    gap: 24px;
    border: 0;
  }

  .story-meta {
    gap: 6px;
    color: #7b8ba2;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .05em;
  }

  .story-meta strong {
    color: #0f172a;
    font-size: 18px;
    text-transform: none;
    letter-spacing: 0;
  }

  .story-meta .backup-state {
    align-self: flex-start;
    text-transform: none;
    letter-spacing: 0;
  }

  .story-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 10px;
    width: 100%;
  }

  .story-actions .primary-result-btn {
    grid-column: 1 / -1;
    width: 100%;
    min-height: 40px;
    margin-bottom: 2px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 700;
    text-transform: none;
  }

  .story-actions .secondary-action-btn {
    justify-content: flex-start;
    min-height: 34px;
    padding-inline: 4px;
    font-size: 12px;
    text-transform: none;
  }

  .story-actions .secondary-action-btn:last-child {
    justify-content: flex-end;
  }
}

@media (max-width: 1200px) {
  .stats-panel {
    grid-column: 1 / -1;
  }

  .story-conversation {
    padding: 20px;
  }

  .story-conversation .content-preview {
    padding: 0;
    border: 0;
  }

  .story-conversation .story-counts {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid #edf1f5;
  }
}

@media (max-width: 600px) {
  .stats-panel {
    grid-template-columns: 1fr;
  }

  .stats-panel .quick-stat {
    min-height: 82px;
    border-top: 1px solid #e2e8f0;
    border-left: 0;
  }

  .stats-panel .quick-stat:first-child {
    border-top: 0;
  }
}

.archive-main-layout {
  width: 100%;
  max-width: 1480px;
  margin: 0 auto;
}

.archive-results {
  min-width: 0;
}

.filter-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #172033;
  font-size: 15px;
  font-weight: 800;
}

:global(.archive-warning-tooltip) {
  max-width: 360px;
  padding: 10px 14px !important;
  border: 1px solid #334155;
  border-radius: 8px !important;
  background: #0f172a !important;
  box-shadow: 0 8px 24px rgba(15, 23, 42, .28) !important;
  color: #fff !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  line-height: 1.45 !important;
  opacity: 1 !important;
}

:global(.archive-dialog-transition-enter-active),
:global(.archive-dialog-transition-leave-active) {
  transition:
    opacity .22s ease,
    transform .22s cubic-bezier(.22, 1, .36, 1) !important;
}

:global(.archive-dialog-transition-enter-from),
:global(.archive-dialog-transition-leave-to) {
  opacity: 0;
  transform: translateY(10px) scale(.975);
}

.detail-title-content {
  min-width: 0;
  flex: 1;
}

.detail-title-row,
.title-edit-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.detail-title-row h2 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-edit-row {
  margin-top: 6px;
}

.title-edit-fields {
  display: grid;
  min-width: 0;
  flex: 1;
  grid-template-columns: minmax(180px, .8fr) minmax(220px, 1.2fr);
  gap: 8px;
}

.title-edit-fields :deep(.v-input) {
  min-width: 220px;
}

@media (max-width: 700px) {
  .title-edit-row {
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .title-edit-fields {
    width: 100%;
    flex-basis: 100%;
    grid-template-columns: 1fr;
  }
}

.kanban-card {
  position: relative;
}

.backup-warning {
  position: absolute;
  z-index: 2;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  color: #dc2626;
  cursor: help;
  filter: drop-shadow(0 2px 3px rgba(220, 38, 38, .18));
}

.recalled-count {
  color: #dc2626;
  font-weight: 700;
}

@media (min-width: 1201px) {
  .archive-header,
  .archive-toolbar {
    max-width: 1480px;
  }

  .archive-main-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 274px;
    grid-template-areas: "results filters";
    gap: 22px;
    align-items: start;
  }

  .archive-results {
    grid-area: results;
  }

  .archive-main-layout > .filter-panel {
    grid-area: filters;
    position: sticky;
    top: 70px;
    display: grid;
    gap: 14px;
    padding: 20px;
    border-radius: 12px;
  }

  .archive-main-layout .filter-panel-title {
    padding-bottom: 11px;
    border-bottom: 1px solid #e2e8f0;
  }

  .archive-main-layout .filter-row-primary,
  .archive-main-layout .filter-row-secondary {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .archive-main-layout .filter-actions {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .archive-main-layout .view-switch,
  .archive-main-layout .refresh-btn {
    width: 100%;
  }

  .archive-main-layout .view-switch button {
    width: 50%;
  }

  .story-grid {
    gap: 10px;
  }

  .view-list .story-card {
    position: relative;
    grid-template-columns: minmax(230px, .9fr) minmax(350px, 1.35fr) minmax(245px, .9fr);
    min-height: 148px;
    border-radius: 10px;
    box-shadow: 0 1px 3px rgba(15, 23, 42, .06);
  }

  .view-list .story-heading,
  .view-list .story-conversation,
  .view-list .story-card > footer {
    padding: 20px 22px;
  }

  .view-list .story-heading {
    gap: 14px;
  }

  .story-title > span {
    margin-bottom: 6px;
    font-size: 9px;
  }

  .story-title h2 {
    margin-bottom: 4px;
    font-size: 16px;
  }

  .story-title p {
    font-size: 11px;
  }

  .status-pill,
  .backup-state {
    padding: 5px 9px;
    font-size: 10px;
  }

  .view-list .story-conversation .content-preview {
    font-size: 12px;
    line-height: 1.55;
    -webkit-line-clamp: 2;
  }

  .view-list .story-conversation .story-counts {
    flex-wrap: wrap;
    gap: 8px 13px;
    padding-top: 11px;
    font-size: 10px;
  }

  .view-list .story-card > footer {
    gap: 12px;
    padding-right: 34px;
  }

  .story-meta {
    gap: 3px;
    font-size: 9px;
  }

  .story-meta strong {
    font-size: 14px;
  }

  .story-actions .primary-result-btn {
    min-height: 34px;
    margin: 0;
    font-size: 11px;
  }

  .story-actions .secondary-action-btn {
    min-height: 28px;
    font-size: 10px;
  }
}

@media (max-width: 1200px) {
  .archive-main-layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .archive-main-layout > .filter-panel {
    order: -1;
    width: 100%;
  }

  .archive-results,
  .story-grid,
  .kanban-board,
  .center-state {
    width: 100%;
  }

  .story-card {
    position: relative;
  }
}

/* Layout fidelity based on the supplied HTML reference */
.archive-page {
  background: #f7f9fb;
  color: #191c1e;
  font-family: Inter, "Segoe UI", Arial, sans-serif;
}

.recall-filter-toggle {
  display: flex;
  min-height: 62px;
  padding: 10px 12px;
  border: 1px solid #c3c6d7;
  border-radius: 8px;
  background: #fff;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.recall-filter-toggle > div:first-child {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: #191c1e;
  font-size: 14px;
  line-height: 20px;
}

.recall-filter-toggle > div:first-child .v-icon {
  flex: 0 0 auto;
  color: #ba1a1a;
}

.recall-filter-toggle :deep(.v-input) {
  flex: 0 0 auto;
}

@media (min-width: 1201px) {
  .archive-page {
    padding: 0 0 48px;
  }

  .archive-header,
  .archive-toolbar,
  .archive-main-layout {
    width: 95%;
    max-width: 1800px;
  }

  .archive-header {
    min-height: 160px;
    margin-bottom: 0;
    padding: 24px 32px;
    align-items: flex-end;
    border-bottom: 1px solid #c3c6d7;
  }

  .archive-summary {
    padding: 0;
  }

  .eyebrow {
    margin-bottom: 8px;
    color: #434655;
    font-size: 14px;
    line-height: 16px;
    letter-spacing: .12em;
  }

  h1 {
    color: #191c1e;
    font-family: "Hanken Grotesk", Inter, "Segoe UI", sans-serif;
    font-size: 48px;
    font-weight: 700;
    line-height: 56px;
    letter-spacing: -.02em;
  }

  .archive-header p {
    max-width: 700px;
    margin-top: 8px;
    color: #434655;
    font-size: 16px;
    line-height: 24px;
  }

  .stats-panel {
    min-width: 360px;
    border-color: #c3c6d7;
    border-radius: 8px;
    background: #fff;
  }

  .quick-stat {
    min-width: 120px;
    min-height: 78px;
    padding: 8px 24px;
    border-left-color: #c3c6d7;
  }

  .quick-stat strong {
    margin-bottom: 4px;
    color: #004ac6;
    font-family: "Hanken Grotesk", Inter, sans-serif;
    font-size: 32px;
    line-height: 40px;
  }

  .quick-stat span {
    color: #434655;
    font-size: 12px;
    line-height: 16px;
  }

  .quick-stat.danger {
    background: rgba(255, 218, 214, .2);
  }

  .quick-stat.danger strong,
  .quick-stat.danger span {
    color: #ba1a1a;
  }

  .config-trigger {
    color: #434655;
  }

  .archive-toolbar {
    margin-bottom: 0;
    padding: 0 32px;
    border-bottom: 1px solid #c3c6d7;
  }

  .status-tabs {
    height: 48px;
    gap: 24px;
    border-bottom: 0;
  }

  .status-tabs button {
    min-width: auto;
    height: 48px;
    padding: 0 8px;
    color: #434655;
    font-size: 14px;
    font-weight: 600;
    line-height: 16px;
  }

  .status-tabs button.active {
    color: #004ac6;
  }

  .status-tabs button.active::after {
    right: 0;
    left: 0;
    height: 2px;
    border-radius: 2px 2px 0 0;
    background: #004ac6;
  }

  .archive-main-layout {
    grid-template-columns: minmax(0, 4fr) minmax(220px, 1fr);
    gap: 48px;
    padding-top: 32px;
  }

  .archive-main-layout > .filter-panel {
    top: 32px;
    gap: 0;
    padding: 32px;
    border: 1px solid #c3c6d7;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, .05), 0 2px 4px -2px rgba(0, 0, 0, .05);
  }

  .archive-main-layout .filter-panel-title {
    display: block;
    margin-bottom: 24px;
    padding: 0 0 16px;
    border-bottom: 1px solid #c3c6d7;
    color: #191c1e;
    font-family: "Hanken Grotesk", Inter, sans-serif;
    font-size: 24px;
    font-weight: 600;
    line-height: 32px;
  }

  .archive-main-layout .filter-row-primary,
  .archive-main-layout .filter-row-secondary {
    gap: 24px;
  }

  .archive-main-layout .filter-row-secondary {
    margin-top: 24px;
  }

  .filter-panel :deep(.v-field) {
    min-height: 50px;
    border: 0;
    border-radius: 8px;
    background: #fff;
    box-shadow: none;
  }

  .filter-panel :deep(.v-field__outline) {
    --v-field-border-opacity: 1;
    color: #c3c6d7;
  }

  .filter-panel :deep(.v-field--focused .v-field__outline) {
    color: #004ac6;
  }

  .filter-panel :deep(.v-field__input) {
    min-height: 50px;
    padding-top: 12px;
    padding-bottom: 12px;
    color: #191c1e;
    font-size: 16px;
    line-height: 24px;
  }

  .filter-panel :deep(input::placeholder) {
    color: #737686;
    opacity: 1;
  }

  .filter-panel :deep(.v-field-label--floating) {
    background: #fff;
    color: #434655;
    font-size: 12px;
  }

  .archive-main-layout .filter-actions {
    display: flex;
    margin-top: 24px;
    flex-direction: column;
    gap: 24px;
  }

  .archive-main-layout .view-switch {
    min-height: 50px;
    padding: 4px;
    border: 1px solid #c3c6d7;
    border-radius: 8px;
    background: #f2f4f6;
  }

  .archive-main-layout .view-switch button {
    height: 40px;
    border-radius: 6px;
  }

  .archive-main-layout .view-switch button.active {
    color: #191c1e;
    background: #fff;
  }

  .archive-main-layout .refresh-btn {
    min-height: 50px;
    border: 1px solid #c3c6d7;
    border-radius: 8px;
    color: #191c1e;
    background: #e6e8ea;
    font-size: 14px;
    font-weight: 600;
  }

  .story-grid {
    gap: 24px;
  }

  .view-list .story-card {
    grid-template-columns: 25% 50% 25%;
    min-height: 242px;
    border: 1px solid #c3c6d7;
    border-radius: 8px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, .05), 0 2px 4px -2px rgba(0, 0, 0, .05);
  }

  .view-list .story-card:hover {
    border-color: #b4c5ff;
  }

  .view-list .story-heading,
  .view-list .story-conversation,
  .view-list .story-card > footer {
    padding: 32px;
  }

  .view-list .story-heading {
    justify-content: space-between;
    gap: 24px;
    border-right-color: #c3c6d7;
  }

  .story-title {
    min-width: 0;
    width: 100%;
  }

  .story-title > span {
    margin-bottom: 8px;
    color: #004ac6;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: .04em;
  }

  .story-title h2 {
    overflow: hidden;
    margin-bottom: 8px;
    color: #191c1e;
    font-family: "Hanken Grotesk", Inter, sans-serif;
    font-size: 24px;
    font-weight: 600;
    line-height: 32px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .story-title p {
    color: #434655;
    font-size: 16px;
    line-height: 24px;
  }

  .status-pill {
    padding: 5px 12px;
    border: 1px solid #bec6e0;
    border-radius: 999px;
    color: #3f465c;
    background: #dae2fd;
    font-size: 12px;
    line-height: 16px;
  }

  .view-list .story-conversation {
    border-right-color: #c3c6d7;
    background: rgba(247, 249, 251, .5);
  }

  .view-list .story-conversation .content-preview {
    color: #191c1e;
    font-size: 16px;
    line-height: 24px;
    white-space: pre-line;
    -webkit-line-clamp: 3;
  }

  .view-list .story-conversation .story-counts {
    flex-wrap: nowrap;
    gap: 24px;
    padding-top: 0;
    border-top: 0;
    color: #434655;
    font-size: 14px;
    line-height: 16px;
  }

  .view-list .story-conversation .story-counts span:last-child {
    margin-left: auto;
  }

  .view-list .story-card > footer {
    gap: 24px;
    padding-right: 32px;
  }

  .story-meta {
    gap: 8px;
    color: #434655;
    font-size: 14px;
    line-height: 16px;
  }

  .story-meta strong {
    color: #191c1e;
    font-family: "Hanken Grotesk", Inter, sans-serif;
    font-size: 24px;
    font-weight: 600;
    line-height: 32px;
  }

  .backup-warning {
    top: 28px;
    right: 24px;
    width: 24px;
    height: 24px;
    color: #ba1a1a;
  }

  .story-actions {
    gap: 8px 12px;
  }

  .story-actions .primary-result-btn {
    min-height: 42px;
    border-radius: 8px;
    background: #004ac6;
    font-size: 14px;
    line-height: 16px;
  }

  .story-actions .secondary-action-btn {
    min-height: 32px;
    color: #434655;
    font-size: 14px;
    line-height: 16px;
  }

  .story-actions .secondary-action-btn:last-child {
    color: #004ac6;
  }
}

@media (min-width: 1201px) and (max-width: 1450px) {
  .archive-main-layout {
    gap: 32px;
  }

  .archive-main-layout > .filter-panel,
  .view-list .story-heading,
  .view-list .story-conversation,
  .view-list .story-card > footer {
    padding: 24px;
  }

  .view-list .story-card {
    min-height: 220px;
  }

  .story-title h2,
  .story-meta strong {
    font-size: 20px;
    line-height: 28px;
  }

  .view-list .story-conversation .story-counts {
    gap: 14px;
    font-size: 12px;
  }
}

/* Three-column application shell from the latest HTML reference */
.archive-side-nav {
  display: none;
}

@media (min-width: 1201px) {
  .archive-page {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr) clamp(300px, 20vw, 400px);
    grid-template-rows: auto 48px minmax(0, 1fr);
    width: 100%;
    height: 100vh;
    min-height: 0;
    padding: 0;
    overflow: hidden;
  }

  .archive-side-nav {
    display: flex;
    grid-column: 1;
    grid-row: 1 / -1;
    min-width: 0;
    padding: 24px;
    border-right: 1px solid #c3c6d7;
    background: #f7f9fb;
    flex-direction: column;
    justify-content: space-between;
  }

  .archive-nav-top,
  .archive-nav-bottom {
    display: flex;
    flex-direction: column;
  }

  .archive-nav-top {
    gap: 32px;
  }

  .archive-brand {
    display: flex;
    padding: 0 8px;
    color: #191c1e;
    text-decoration: none;
    align-items: center;
    gap: 8px;
  }

  .archive-brand > span {
    display: grid;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #004ac6;
    color: #fff;
    font-family: "Hanken Grotesk", Inter, sans-serif;
    font-size: 18px;
    place-items: center;
  }

  .archive-brand strong {
    font-family: "Hanken Grotesk", Inter, sans-serif;
    font-size: 20px;
    font-weight: 600;
  }

  .archive-nav-links {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .archive-nav-links a,
  .archive-settings-link {
    display: flex;
    min-height: 48px;
    padding: 8px 16px;
    border-radius: 8px;
    color: #434655;
    font-size: 16px;
    font-weight: 600;
    text-decoration: none;
    align-items: center;
    gap: 16px;
    transition: background-color .18s ease, color .18s ease;
  }

  .archive-nav-links a:hover,
  .archive-settings-link:hover {
    color: #191c1e;
    background: #e0e3e5;
  }

  .archive-nav-links a.active {
    color: #fff;
    background: #2563eb;
  }

  .archive-nav-bottom {
    gap: 8px;
  }

  .archive-user-card {
    display: flex;
    margin-top: 16px;
    padding: 24px 16px 8px;
    border-top: 1px solid #c3c6d7;
    align-items: center;
    gap: 16px;
  }

  .archive-user-avatar {
    display: grid;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    color: #434655;
    background: #e0e3e5;
    place-items: center;
  }

  .archive-user-card > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .archive-user-card strong,
  .archive-user-card span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .archive-user-card strong {
    color: #191c1e;
    font-size: 14px;
    line-height: 20px;
  }

  .archive-user-card span {
    color: #434655;
    font-size: 12px;
    line-height: 16px;
  }

  .archive-header {
    grid-column: 2;
    grid-row: 1;
    width: 100%;
    max-width: none;
    min-height: 248px;
    margin: 0;
    padding: 24px 40px;
    grid-template-columns: minmax(280px, 1fr) 360px;
    gap: 24px;
    border-bottom: 1px solid #c3c6d7;
    background: #f7f9fb;
    align-items: end;
  }

  .archive-summary {
    max-width: 430px;
  }

  .archive-summary h1 {
    max-width: 390px;
  }

  .header-actions {
    justify-self: end;
  }

  .config-trigger {
    display: none;
  }

  .archive-toolbar {
    grid-column: 2;
    grid-row: 2;
    width: 100%;
    max-width: none;
    margin: 0;
    padding: 0 40px;
    background: #f7f9fb;
  }

  .archive-main-layout {
    display: contents;
  }

  .archive-results {
    grid-column: 2;
    grid-row: 3;
    min-width: 0;
    min-height: 0;
    padding: 32px 40px;
    overflow: auto;
  }

  .archive-main-layout > .filter-panel {
    display: grid;
    position: static;
    grid-column: 3;
    grid-row: 1 / -1;
    width: auto;
    max-height: calc(100vh - 80px);
    margin: 40px;
    padding: 32px;
    align-self: start;
    overflow-y: auto;
    border: 1px solid #c3c6d7;
    border-radius: 12px;
    background: #fff;
  }

  .archive-main-layout .filter-panel-title {
    font-size: 24px;
    line-height: 32px;
  }

  .archive-main-layout .filter-row-primary,
  .archive-main-layout .filter-row-secondary {
    grid-template-columns: minmax(0, 1fr);
  }

  .view-list .story-card {
    width: 100%;
  }
}

@media (min-width: 1201px) and (max-width: 1500px) {
  .archive-page {
    grid-template-columns: 240px minmax(0, 1fr) 300px;
  }

  .archive-side-nav {
    padding: 20px;
  }

  .archive-header {
    min-height: 220px;
    padding-inline: 32px;
    grid-template-columns: minmax(250px, 1fr) 330px;
  }

  .archive-summary h1 {
    font-size: 42px;
    line-height: 48px;
  }

  .archive-toolbar {
    padding-inline: 32px;
  }

  .archive-results {
    padding: 32px;
  }

  .archive-main-layout > .filter-panel {
    margin: 28px 24px;
    padding: 24px;
  }
}

/* Compact archive workspace based on the latest HTML reference. */
.archive-page {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  grid-template-rows: auto 48px minmax(0, 1fr);
  width: 100%;
  height: calc(100vh - var(--smax-topnav-h, 52px));
  min-height: 0;
  padding: 0;
  overflow: hidden;
  background: #f7f9fb;
}

.archive-side-nav {
  display: none !important;
}

.archive-header {
  grid-column: 2;
  grid-row: 1;
  width: 100%;
  max-width: none;
  min-height: 128px;
  margin: 0;
  padding: 20px 32px;
  border: 0;
  border-bottom: 1px solid #c3c6d7;
  border-radius: 0;
  box-shadow: none;
  background: #f7f9fb;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.archive-summary {
  max-width: 680px;
}

.archive-summary .eyebrow {
  margin-bottom: 6px;
  color: #434655;
  font-size: 11px;
}

.archive-summary h1 {
  max-width: none;
  font-size: clamp(28px, 2.5vw, 40px);
  line-height: 1.12;
}

.archive-header p {
  margin-top: 6px;
  font-size: 13px;
  line-height: 20px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stats-panel {
  display: flex;
  overflow: hidden;
  border: 1px solid #c3c6d7;
  border-radius: 8px;
  background: #fff;
}

.quick-stat {
  min-width: 118px;
  min-height: 62px;
  padding: 8px 16px;
  border: 0;
  border-right: 1px solid #c3c6d7;
  border-radius: 0;
  background: #fff;
}

.quick-stat:last-child {
  border-right: 0;
}

.quick-stat strong {
  margin: 0;
  font-size: 24px;
}

.quick-stat span {
  font-size: 10px;
}

.config-trigger {
  display: inline-flex;
}

.archive-toolbar {
  grid-column: 2;
  grid-row: 2;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0 24px;
  border-bottom: 1px solid #c3c6d7;
  background: #f7f9fb;
}

.status-tabs {
  height: 48px;
  padding: 0;
  border: 0;
}

.status-tabs button {
  min-width: auto;
  height: 48px;
  padding: 0 16px;
  font-size: 13px;
}

.archive-main-layout {
  display: contents;
}

.archive-main-layout > .filter-panel {
  position: static;
  display: flex;
  grid-column: 1;
  grid-row: 1 / -1;
  flex-direction: column;
  width: 230px;
  max-height: none;
  min-height: 0;
  margin: 0;
  padding: 18px;
  overflow-y: auto;
  border: 0;
  border-right: 1px solid #c3c6d7;
  border-radius: 0;
  box-shadow: none;
  background: #f7f9fb;
}

.filter-panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 0;
  border: 0;
  font-size: 14px;
  font-weight: 600;
}

.filter-panel-title button {
  border: 0;
  background: transparent;
  color: #004ac6;
  cursor: pointer;
  font-size: 12px;
}

.filter-view-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
  margin-bottom: 14px;
  padding: 3px;
  border: 0;
  border-radius: 7px;
  background: #e6e8ea;
}

.filter-view-switch button {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #434655;
  cursor: pointer;
  font-size: 12px;
}

.filter-view-switch button.active {
  background: #fff;
  color: #004ac6;
  box-shadow: 0 1px 3px rgba(25, 28, 30, .12);
}

.filter-row,
.filter-row-primary,
.filter-row-secondary {
  display: flex;
  grid-template-columns: none;
  flex-direction: column;
  gap: 12px;
}

.filter-row-primary {
  margin-bottom: 14px;
}

.filter-panel :deep(.v-field) {
  border-radius: 7px;
  background: #fff;
  font-size: 12px;
}

.filter-row-secondary {
  flex: 1;
}

.filter-control {
  display: grid;
  gap: 6px;
  color: #434655;
  font-size: 12px;
}

.filter-control > span {
  line-height: 16px;
}

.record-type-filter {
  padding: 2px 0 12px;
  border-bottom: 1px solid #d7dae3;
}

.record-type-filter summary {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  color: #191c1e;
  cursor: pointer;
  font-size: 12px;
  list-style: none;
}

.record-type-filter summary::-webkit-details-marker {
  display: none;
}

.record-type-filter[open] summary .v-icon {
  transform: rotate(180deg);
}

.record-type-filter :deep(.v-select) {
  margin-top: 8px;
}

.filter-panel :deep(.v-field__input) {
  min-height: 38px;
  padding-top: 7px;
  padding-bottom: 7px;
}

.filter-actions {
  display: flex;
  margin-top: auto;
  padding-top: 18px;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid #d7dae3;
}

.recall-filter-toggle,
.refresh-btn {
  width: 100%;
}

.archive-results {
  display: flex;
  grid-column: 2;
  grid-row: 3;
  min-width: 0;
  min-height: 0;
  padding: 24px;
  overflow: auto;
  flex-direction: column;
}

.archive-table-wrap {
  width: 100%;
  overflow: auto;
  border: 1px solid #c3c6d7;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 2px 5px rgba(25, 28, 30, .04);
}

.archive-table {
  width: 100%;
  min-width: 1220px;
  border-collapse: collapse;
  table-layout: fixed;
}

.archive-table th {
  padding: 11px 12px;
  border-bottom: 1px solid #c3c6d7;
  background: #f2f4f6;
  color: #434655;
  font-size: 11px;
  font-weight: 700;
  text-align: left;
  text-transform: uppercase;
}

.archive-table td {
  height: 58px;
  padding: 8px 12px;
  border-bottom: 1px solid #e0e3e5;
  color: #191c1e;
  font-size: 12px;
  vertical-align: middle;
}

.archive-table tbody tr {
  cursor: pointer;
  transition: background-color .16s ease;
}

.clickable-story-row:focus-within,
.clickable-story-row:hover {
  background: #f2f4f6;
}

.archive-table tbody tr:hover {
  background: #f7f9fb;
}

.archive-table tbody tr:last-child td {
  border-bottom: 0;
}

.archive-table th:nth-child(1) { width: 15%; }
.archive-table th:nth-child(2) { width: 12%; }
.archive-table th:nth-child(3) { width: 12%; }
.archive-table th:nth-child(4) { width: 28%; }
.archive-table th:nth-child(5) { width: 13%; }
.archive-table th:nth-child(6) { width: 12%; }
.archive-table th:nth-child(7) { width: 8%; }
.archive-table th:nth-child(8) { width: 64px; }

.archive-table td > strong,
.archive-table td small {
  display: block;
}

.archive-table td small {
  margin-top: 2px;
  color: #737686;
}

.received-at-cell strong {
  white-space: nowrap;
}

.last-message {
  overflow: hidden;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-message-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 3px;
  color: #737686;
  font-size: 10px;
}

.table-message-meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.table-message-meta .recalled-count {
  color: #ba1a1a;
}

.action-column {
  text-align: right !important;
}

.table-action-btn {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: 1px solid #c3c6d7;
  border-radius: 6px;
  background: #e6e8ea;
  color: #434655;
  cursor: pointer;
}

.table-action-btn:hover {
  border-color: #004ac6;
  color: #004ac6;
}

.status-pill {
  display: inline-flex;
  min-height: 20px;
  padding: 2px 8px;
  align-items: center;
  font-size: 10px;
  white-space: nowrap;
}

.archive-pagination {
  display: flex;
  min-height: 58px;
  margin: auto -24px -24px;
  padding: 12px 24px;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #c3c6d7;
  background: #f7f9fb;
  color: #434655;
  font-size: 12px;
}

.archive-pagination > div,
.archive-pagination label,
.pagination-buttons {
  display: flex;
  align-items: center;
  gap: 14px;
}

.archive-pagination select {
  height: 32px;
  padding: 0 28px 0 10px;
  border: 1px solid #c3c6d7;
  border-radius: 7px;
  background: #fff;
}

.pagination-buttons {
  gap: 4px !important;
}

.pagination-buttons button {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #434655;
  cursor: pointer;
}

.pagination-buttons button:hover:not(:disabled) {
  background: #e6e8ea;
}

.pagination-buttons button.active {
  background: #004ac6;
  color: #fff;
}

.pagination-buttons button:disabled {
  opacity: .4;
  cursor: not-allowed;
}

.kanban-board {
  gap: 16px;
}

.kanban-column {
  border-radius: 10px;
  box-shadow: none;
}

.kanban-card {
  padding: 12px;
  border-radius: 8px;
}

.message-selection-bar {
  display: flex;
  min-height: 54px;
  padding: 10px 24px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #e0e3e5;
  background: #fff;
}

.message-selection-bar label {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: #434655;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.message-selection-bar input,
.message-selector input {
  width: 16px;
  height: 16px;
  accent-color: #004ac6;
  cursor: pointer;
}

.timeline-message {
  position: relative;
}

.timeline-message.is-customer {
  padding-left: 42px;
}

.timeline-message.is-staff {
  padding-right: 42px;
}

.message-selector {
  position: absolute;
  top: 14px;
  display: inline-flex;
  align-items: center;
}

.timeline-message.is-customer .message-selector {
  left: 14px;
}

.timeline-message.is-staff .message-selector {
  right: 14px;
}

@media (max-width: 960px) {
  .archive-page {
    display: flex;
    height: auto;
    min-height: calc(100vh - var(--smax-topnav-h, 52px));
    overflow: visible;
    flex-direction: column;
  }

  .archive-header,
  .archive-toolbar,
  .archive-results {
    width: 100%;
  }

  .archive-header {
    padding: 18px 16px;
    grid-template-columns: 1fr;
  }

  .header-actions {
    width: 100%;
  }

  .stats-panel {
    width: 100%;
  }

  .quick-stat {
    min-width: 0;
    flex: 1;
  }

  .archive-main-layout {
    display: flex;
    flex-direction: column;
  }

  .archive-main-layout > .filter-panel {
    display: grid;
    width: 100%;
    padding: 12px 16px;
    border-right: 0;
    border-bottom: 1px solid #c3c6d7;
    grid-template-columns: 150px minmax(180px, 1fr) minmax(0, 2fr);
    gap: 10px;
  }

  .filter-panel-title {
    display: none;
  }

  .filter-view-switch,
  .filter-row-primary {
    margin: 0;
  }

  .filter-row-secondary {
    display: grid;
    grid-template-columns: repeat(3, minmax(150px, 1fr));
  }

  .filter-actions {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .recall-filter-toggle {
    display: none;
  }

  .archive-results {
    padding: 16px;
  }

  .archive-pagination {
    margin: auto -16px -16px;
    padding-inline: 16px;
  }

  .message-selection-bar {
    padding-inline: 16px;
  }
}

@media (max-width: 640px) {
  .archive-summary h1 {
    font-size: 25px;
  }

  .archive-header p {
    display: none;
  }

  .quick-stat {
    padding-inline: 6px;
  }

  .archive-toolbar {
    padding-inline: 8px;
  }

  .archive-main-layout > .filter-panel {
    display: flex;
    flex-direction: column;
  }

  .filter-row-secondary {
    grid-template-columns: 1fr;
  }

  .archive-pagination {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .message-selection-bar {
    align-items: stretch;
    flex-direction: column;
  }
}

/* Final desktop filter geometry: keep this last to override legacy archive styles. */
@media (min-width: 961px) {
  .archive-page {
    grid-template-columns: 212px minmax(0, 1fr);
  }

  .archive-main-layout > .filter-panel {
    box-sizing: border-box;
    width: 212px;
    height: 100%;
    padding: 16px;
    overflow: hidden;
    background: #f7f9fb;
  }

  .filter-panel-title {
    flex: 0 0 auto;
    width: 100%;
    min-height: 24px;
    margin: 0 0 14px;
    padding: 0 2px;
    font-size: 12px;
    line-height: 18px;
  }

  .filter-panel-title button {
    padding: 0;
    font-size: 10px;
    line-height: 18px;
  }

  .filter-view-switch {
    flex: 0 0 auto;
    width: 100%;
    height: 50px;
    margin: 0 0 12px;
    padding: 4px;
  }

  .filter-view-switch button {
    width: 100%;
    min-width: 0;
    min-height: 42px;
    padding: 4px 8px;
    line-height: 16px;
  }

  .filter-view-switch button span {
    white-space: normal;
  }

  .filter-row,
  .filter-row-primary,
  .filter-row-secondary {
    width: 100%;
    min-width: 0;
    margin-inline: 0;
    padding-inline: 0;
  }

  .filter-row-primary {
    display: block;
    flex: 0 0 auto;
    margin: 0 0 12px;
  }

  .filter-row-secondary {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    gap: 12px;
  }

  .filter-panel :deep(.v-input),
  .filter-panel :deep(.v-input__control),
  .filter-panel :deep(.v-field) {
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    margin: 0 !important;
  }

  .filter-panel :deep(.v-field) {
    min-height: 36px;
    border-radius: 6px;
  }

  .filter-panel :deep(.v-field__input) {
    min-height: 36px;
    padding: 6px 8px;
    font-size: 11px;
    line-height: 18px;
  }

  .filter-panel :deep(.v-field__prepend-inner) {
    padding-top: 7px;
  }

  .filter-panel :deep(.v-field__append-inner) {
    padding-top: 6px;
  }

  .filter-panel :deep(input::placeholder) {
    color: #8a91a2;
    opacity: 1;
  }

  .filter-control {
    width: 100%;
    min-width: 0;
    gap: 5px;
    font-size: 11px;
  }

  .filter-control > span {
    padding-left: 1px;
    color: #434655;
    line-height: 16px;
  }

  .record-type-filter {
    width: 100%;
    padding: 0 0 10px;
  }

  .record-type-filter summary {
    width: 100%;
    min-height: 34px;
    padding: 0 1px;
  }

  .filter-actions {
    flex: 0 0 auto;
    width: calc(100% + 32px);
    margin: auto -16px -16px;
    padding: 16px;
    gap: 8px;
    border-top: 1px solid #d7dae3;
    background: #f7f9fb;
  }

  .recall-filter-toggle {
    box-sizing: border-box;
    width: 100%;
    min-height: 38px;
    padding: 7px 8px;
    border-radius: 6px;
  }

  .recall-filter-toggle > div:first-child {
    gap: 6px;
    font-size: 11px;
    line-height: 16px;
  }

  .recall-filter-toggle :deep(.v-switch) {
    flex: 0 0 auto;
  }

  .refresh-btn {
    width: 100%;
    min-height: 36px;
    border-radius: 6px;
    font-size: 11px;
  }
}

/* Isolated archive filter. Legacy .filter-* rules above do not target this block. */
.archive-main-layout > .archive-filter-panel {
  position: static;
  display: flex;
  grid-column: 1;
  grid-row: 1 / -1;
  box-sizing: border-box;
  width: 212px;
  min-width: 212px;
  min-height: 0;
  padding: 16px;
  overflow: hidden;
  flex-direction: column;
  border-right: 1px solid #c3c6d7;
  background: #f7f9fb;
  color: #191c1e;
}

.archive-filter-header {
  display: flex;
  width: 100%;
  min-height: 26px;
  margin: 0 0 14px;
  padding: 0 2px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.archive-filter-header > span {
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  white-space: nowrap;
}

.archive-filter-header button {
  flex: 0 0 auto;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: #004ac6;
  cursor: pointer;
  font-size: 10px;
  line-height: 16px;
  white-space: nowrap;
}

.archive-filter-view {
  display: grid;
  width: 100%;
  height: 52px;
  margin: 0 0 12px;
  padding: 4px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-radius: 7px;
  background: #e6e8ea;
}

.archive-filter-view button {
  display: flex;
  min-width: 0;
  height: 44px;
  padding: 4px 8px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #30343b;
  cursor: pointer;
  font-size: 11px;
  line-height: 15px;
}

.archive-filter-view button span {
  min-width: 0;
  white-space: normal;
}

.archive-filter-view button.active {
  background: #fff;
  color: #004ac6;
  box-shadow: 0 1px 3px rgba(25, 28, 30, .13);
}

.archive-filter-search,
.archive-filter-fields,
.archive-filter-field,
.archive-filter-record-type {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
}

.archive-filter-search {
  margin-bottom: 14px;
}

.archive-filter-fields {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 14px;
}

.archive-filter-field {
  display: grid;
  gap: 5px;
  color: #434655;
  font-size: 11px;
  line-height: 16px;
}

.archive-filter-panel :deep(.v-input),
.archive-filter-panel :deep(.v-input__control),
.archive-filter-panel :deep(.v-field) {
  width: 100%;
  min-width: 0;
  max-width: none;
  margin: 0;
}

.archive-filter-panel :deep(.v-field) {
  min-height: 36px;
  border-radius: 6px;
  background: #fff;
  font-size: 11px;
}

.archive-filter-panel :deep(.v-field__input) {
  min-height: 36px;
  padding: 6px 8px;
  font-size: 11px;
  line-height: 18px;
}

.archive-filter-panel :deep(.v-field__prepend-inner) {
  padding-top: 7px;
}

.archive-filter-panel :deep(.v-field__append-inner) {
  padding-top: 6px;
}

.archive-filter-panel :deep(input::placeholder) {
  color: #8a91a2;
  opacity: 1;
}

:global(.archive-assignee-menu .v-list) {
  max-height: 340px;
  overflow-y: auto;
  padding-bottom: 0;
}

:global(.archive-assignee-menu .v-list-item) {
  min-height: 46px;
}

:global(.archive-assignee-menu .archive-assignee-menu-footer) {
  position: sticky;
  bottom: 0;
  z-index: 2;
  margin-top: 4px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
  box-shadow: 0 -8px 18px rgba(15, 23, 42, .06);
}

:global(.archive-assignee-menu .archive-assignee-menu-footer .v-list-item) {
  min-height: 42px;
}

.archive-filter-record-type {
  padding: 0 0 10px;
  border-bottom: 1px solid #d7dae3;
}

.archive-filter-record-type summary {
  display: flex;
  width: 100%;
  min-height: 34px;
  padding: 0 1px;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-size: 11px;
  line-height: 16px;
  list-style: none;
}

.archive-filter-record-type summary::-webkit-details-marker {
  display: none;
}

.archive-filter-record-type[open] summary .v-icon {
  transform: rotate(180deg);
}

.archive-filter-record-type :deep(.v-select) {
  margin-top: 8px;
}

.archive-filter-footer {
  display: flex;
  box-sizing: border-box;
  width: calc(100% + 32px);
  margin: auto -16px -16px;
  padding: 16px;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid #d7dae3;
  background: #f7f9fb;
}

.archive-filter-recall {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  min-height: 38px;
  padding: 7px 8px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  overflow: hidden;
  border: 1px solid #c3c6d7;
  border-radius: 6px;
  background: #fff;
}

.archive-filter-recall > div:first-child {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: #191c1e;
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
}

.archive-filter-recall > div:first-child .v-icon {
  flex: 0 0 auto;
  color: #ba1a1a;
}

.archive-recall-toggle {
  position: relative;
  width: 30px;
  height: 18px;
  padding: 0;
  flex: 0 0 30px;
  border: 0;
  border-radius: 999px;
  background: #d8dce3;
  cursor: pointer;
  transition: background-color .18s ease;
}

.archive-recall-toggle span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(25, 28, 30, .2);
  transition: transform .18s ease;
}

.archive-recall-toggle.active {
  background: #2563eb;
}

.archive-recall-toggle.active span {
  transform: translateX(12px);
}

.archive-recall-toggle:focus-visible {
  outline: 2px solid rgba(37, 99, 235, .35);
  outline-offset: 2px;
}

.archive-filter-refresh {
  width: 100%;
  min-height: 36px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.deleted-account-note {
  display: flex;
  margin-top: 4px;
  align-items: center;
  gap: 4px;
  color: #9a6700;
  font-size: 10px;
  line-height: 14px;
}

.handover-inline-chip {
  display: inline-flex;
  max-width: 180px;
  margin-top: 4px;
  padding: 2px 6px;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 10px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.handover-inline-chip.is-kanban {
  display: flex;
  max-width: 100%;
}

.handover-inline-chip.assignment-origin {
  border-color: #ddd6fe;
  background: #f5f3ff;
  color: #6d28d9;
}

.handover-inline-chip.assignment-origin.is-initial {
  border-color: #d7dde8;
  background: #f8fafc;
  color: #64748b;
}

.handover-inline-chip.assignment-origin.is-handover {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.handover-inline-chip.assignment-origin.is-manager-override {
  border-color: #ddd6fe;
  background: #f5f3ff;
  color: #6d28d9;
}

.deleted-account-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #f0c36a;
  background: #fff7e0;
  color: #7a4b00;
}

.handover-pending {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 0 16px;
  padding: 10px 12px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #eff6ff;
  color: #1e3a8a;
}

.handover-pending > div {
  display: grid;
  gap: 2px;
}

.handover-pending span {
  color: #475569;
  font-size: 12px;
}

.assignment-history {
  margin: 0 0 16px;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
}

.assignment-history summary {
  cursor: pointer;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}

.assignment-history-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid #f1f5f9;
  color: #334155;
  font-size: 12px;
}

.assignment-history-row small {
  color: #64748b;
  text-align: right;
}

.status-manager-card {
  overflow: hidden;
}

.status-manager-title {
  display: flex;
  min-height: 72px;
  padding: 18px 22px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #e2e8f0;
}

.status-manager-title > div {
  display: grid;
  gap: 4px;
}

.status-manager-title strong {
  color: #0f172a;
  font-size: 20px;
  line-height: 1.25;
}

.status-manager-title small {
  color: #64748b;
  font-size: 12px;
  font-weight: 400;
}

.status-manager-layout {
  display: grid;
  grid-template-columns: minmax(300px, .9fr) minmax(380px, 1.1fr);
  gap: 20px;
}

.status-manager-list,
.status-manager-form {
  min-width: 0;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}

.status-manager-list-head {
  display: flex;
  margin-bottom: 12px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.status-manager-row {
  display: grid;
  min-height: 58px;
  padding: 9px 8px;
  align-items: center;
  grid-template-columns: 28px minmax(0, 1fr) auto auto;
  gap: 8px;
  border-top: 1px solid #eef2f7;
}

.status-manager-row.inactive {
  opacity: .55;
  background: #f8fafc;
}

.status-manager-row > div:nth-child(2) {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.status-manager-row > div:nth-child(2) strong,
.status-manager-row > div:nth-child(2) span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-manager-row > div:nth-child(2) span {
  color: #64748b;
  font-size: 11px;
}

.status-default-badge {
  padding: 3px 7px;
  border-radius: 999px;
  background: #eaf2ff;
  color: #1d4ed8;
  font-size: 10px;
  font-weight: 700;
}

.status-manager-actions {
  display: flex;
  align-items: center;
}

.status-manager-form {
  display: grid;
  align-content: start;
  gap: 10px;
}

.status-manager-form h3 {
  margin: 0 0 4px;
  color: #0f172a;
  font-size: 16px;
}

.status-manager-form .config-row,
.status-rule-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.status-rule-grid {
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}

.status-manager-form-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid currentColor;
  border-radius: 999px;
}

/* Isolated Kanban redesign. Legacy .kanban-* rules do not target these classes. */
.archive-results:has(.archive-kanban-board) {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.archive-kanban-board {
  display: grid;
  min-width: 0;
  min-height: 430px;
  flex: 1 1 auto;
  padding: 0;
  overflow-x: auto;
  overflow-y: hidden;
  align-items: stretch;
  grid-auto-columns: minmax(270px, 1fr);
  grid-auto-flow: column;
  gap: 14px;
  scroll-snap-type: x proximity;
  scrollbar-gutter: stable;
}

.archive-kanban-column {
  --archive-kanban-status: #2563eb;
  display: flex;
  min-width: 270px;
  min-height: 430px;
  overflow: hidden;
  flex-direction: column;
  border: 1px solid #d5deea;
  border-radius: 8px;
  background: #fff;
  scroll-snap-align: start;
}

.archive-kanban-column-head {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  min-height: 44px;
  padding: 0 12px;
  flex: 0 0 44px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #dbe3ed;
  background: #fbfcfe;
}

.archive-kanban-column-title {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  color: #172033;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .025em;
  text-transform: uppercase;
}

.archive-kanban-column-title i {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: var(--archive-kanban-status);
}

.archive-kanban-column-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-kanban-column-head > strong {
  display: inline-flex;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  align-items: center;
  justify-content: center;
  border: 1px solid #d5deea;
  border-radius: 999px;
  background: #f5f7fa;
  color: #334155;
  font-size: 11px;
  font-weight: 700;
}

.archive-kanban-items {
  display: flex;
  min-height: 0;
  padding: 10px;
  overflow-y: auto;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  background: #fff;
  scrollbar-gutter: stable;
}

.archive-kanban-card {
  position: relative;
  display: flex;
  box-sizing: border-box;
  width: 100%;
  min-height: 174px;
  max-height: 190px;
  padding: 11px 12px 10px 15px;
  overflow: hidden;
  flex: 0 0 auto;
  flex-direction: column;
  border: 1px solid #d7e0ec;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
  transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}

.archive-kanban-card::before {
  position: absolute;
  top: -1px;
  bottom: -1px;
  left: -1px;
  width: 3px;
  border-radius: 8px 0 0 8px;
  background: var(--archive-kanban-status);
  content: "";
}

.archive-kanban-card:hover {
  border-color: #a9bdda;
  box-shadow: 0 5px 14px rgba(37, 99, 235, .08);
  transform: translateY(-1px);
}

.archive-kanban-card-head {
  display: flex;
  min-height: 18px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.archive-kanban-card-head > span {
  overflow: hidden;
  color: #1d4ed8;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .08em;
}

.archive-kanban-head-meta {
  display: inline-flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  color: #64748b;
  white-space: nowrap;
}

.archive-kanban-head-meta small {
  font-size: 9px;
}

.archive-kanban-warning {
  position: static;
  display: inline-flex;
  width: 17px;
  height: 17px;
  align-items: center;
  justify-content: center;
  color: #c62828 !important;
}

.archive-kanban-card h3 {
  display: -webkit-box;
  overflow: hidden;
  margin: 5px 0 4px;
  color: #111827;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 13px;
  font-weight: 750;
  line-height: 1.35;
}

.archive-kanban-preview {
  display: -webkit-box;
  min-height: 42px;
  margin: 0;
  overflow: hidden;
  color: #42516a;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  font-size: 9px;
  line-height: 14px;
  overflow-wrap: anywhere;
  white-space: pre-line;
}

.archive-kanban-counts {
  display: flex;
  min-height: 18px;
  margin-top: 4px;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: #60708a;
  font-size: 9px;
}

.archive-kanban-counts span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.archive-kanban-counts .recalled-count {
  color: #ba1a1a;
  font-weight: 650;
}

.archive-kanban-card-footer {
  display: flex;
  min-height: 37px;
  margin-top: auto;
  padding-top: 7px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid #edf1f5;
}

.archive-kanban-card-footer > div {
  display: grid;
  min-width: 0;
  flex: 1 1 auto;
  gap: 1px;
}

.archive-kanban-card-footer > div > span,
.archive-kanban-card-footer > div > strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-kanban-card-footer > div > span {
  color: #7b879a;
  font-size: 8px;
  text-transform: uppercase;
}

.archive-kanban-card-footer > div > strong {
  color: #27364d;
  font-size: 10px;
}

.archive-kanban-deleted-account {
  display: inline-flex !important;
  align-items: center;
  gap: 3px;
  color: #9a6700 !important;
  font-size: 8px !important;
  text-transform: none !important;
}

.archive-kanban-action {
  display: inline-flex;
  min-width: 66px;
  height: 27px;
  padding: 0 8px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid #d5e2fb;
  border-radius: 6px;
  background: #edf4ff;
  color: #1555b6;
  cursor: pointer;
  font-size: 9px;
  font-weight: 700;
}

.archive-kanban-action:hover {
  border-color: #9bb8ee;
  background: #e1ecff;
}

.archive-kanban-empty {
  display: grid;
  min-height: 220px;
  flex: 1 1 auto;
  place-items: center;
  padding: 20px;
  color: #7b879a;
  text-align: center;
  font-size: 11px;
  font-style: italic;
}

.archive-kanban-error {
  display: grid;
  min-width: min(520px, 100%);
  min-height: 300px;
  margin: auto;
  place-items: center;
  align-content: center;
  gap: 8px;
  color: #64748b;
  text-align: center;
}

.archive-kanban-error strong {
  color: #1f2937;
}

.archive-kanban-skeleton {
  display: grid;
  min-height: 174px;
  padding: 14px;
  gap: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

.archive-kanban-skeleton span {
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, #eef2f7 25%, #f8fafc 50%, #eef2f7 75%);
  background-size: 200% 100%;
  animation: archive-kanban-pulse 1.25s linear infinite;
}

.archive-kanban-skeleton span:nth-child(1) { width: 35%; }
.archive-kanban-skeleton span:nth-child(2) { width: 78%; height: 14px; }
.archive-kanban-skeleton span:nth-child(3) { width: 100%; height: 42px; border-radius: 5px; }
.archive-kanban-skeleton span:nth-child(4) { width: 62%; }

@keyframes archive-kanban-pulse {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

@media (max-width: 960px) {
  .status-manager-layout {
    grid-template-columns: 1fr;
  }

  .archive-kanban-board {
    min-height: 520px;
    grid-auto-columns: minmax(280px, 72vw);
  }

  .archive-kanban-column {
    min-height: 500px;
  }

  .archive-main-layout > .archive-filter-panel {
    display: grid;
    width: 100%;
    min-width: 0;
    padding: 12px 16px;
    overflow: visible;
    grid-template-columns: 150px minmax(180px, 1fr) minmax(0, 2fr);
    gap: 10px;
    border-right: 0;
    border-bottom: 1px solid #c3c6d7;
  }

  .archive-filter-header {
    display: none;
  }

  .archive-filter-view,
  .archive-filter-search {
    margin: 0;
  }

  .archive-filter-fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(150px, 1fr));
    gap: 10px;
  }

  .archive-filter-footer {
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .archive-filter-recall {
    display: none;
  }
}

@media (max-width: 640px) {
  .status-manager-title {
    padding: 14px 16px;
  }

  .status-manager-list,
  .status-manager-form {
    padding: 12px;
  }

  .status-manager-form .config-row,
  .status-rule-grid {
    grid-template-columns: 1fr;
  }

  .archive-kanban-board {
    width: 100%;
    min-height: 510px;
    grid-auto-columns: calc(100vw - 32px);
    gap: 10px;
    scroll-snap-type: x mandatory;
  }

  .archive-kanban-column {
    min-width: calc(100vw - 32px);
    min-height: 490px;
  }

  .archive-kanban-card {
    max-height: 192px;
  }

  .archive-main-layout > .archive-filter-panel {
    display: flex;
    flex-direction: column;
  }

  .archive-filter-fields {
    grid-template-columns: 1fr;
  }
}
</style>
