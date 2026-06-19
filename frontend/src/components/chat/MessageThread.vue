<template>
  <div
    class="message-thread"
    :class="{ 'drag-over': isDraggingFiles }"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDropFiles"
  >
    <div v-if="!conversation" class="empty-state">
      <v-icon icon="mdi-chat-outline" size="96" color="grey-lighten-2" />
      <p class="text-h6 mt-4">Chọn cuộc trò chuyện</p>
    </div>

    <template v-else>
      <div v-if="isDraggingFiles" class="drop-overlay">
        <div class="drop-card">
          <v-icon size="34" color="primary">mdi-cloud-upload-outline</v-icon>
          <div class="drop-title">Thả để gửi file</div>
          <div class="drop-subtitle">Hình ảnh, video và tài liệu sẽ được upload vào cuộc trò chuyện này</div>
        </div>
      </div>

      <header class="chat-header">
        <Avatar
          :src="headerAvatarSrc"
          :name="headerName"
          :size="46"
          :gender="contactGender"
          :is-group="conversation.threadType === 'group'"
          :gradient-seed="conversation.id"
        />

        <div class="ch-info">
          <div class="ch-row-1">
            <div class="ch-name" :title="headerName">{{ headerName }}</div>
            <span class="ch-sep">|</span>
            <span class="ch-gender-chip" :class="genderChipClass" :title="genderTitle">
              <svg v-if="conversation.threadType === 'group'" class="gender-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
              </svg>
              <svg v-else-if="contactGender === 'female'" class="gender-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17 9.5C17 6.46 14.54 4 11.5 4S6 6.46 6 9.5c0 2.71 1.96 4.94 4.5 5.41V17H8v2h2.5v2.5h2V19H15v-2h-2.5v-2.09c2.54-.47 4.5-2.7 4.5-5.41zm-9 0C8 7.57 9.57 6 11.5 6S15 7.57 15 9.5S13.43 13 11.5 13S8 11.43 8 9.5z"/>
              </svg>
              <svg v-else-if="contactGender === 'male'" class="gender-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 4h-6v2h2.59l-4.13 4.13C10.65 9.42 9.36 9 8 9c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6c0-1.36-.42-2.65-1.13-3.74L17 7.41V10h2V4h0zM8 19c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/>
              </svg>
              <svg v-else class="gender-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
              </svg>
              <span class="gender-label">{{ genderLabel }}</span>
            </span>
            <CareStatusBadge
              v-if="conversation.contact"
              :model-value="(conversation.contact.status as string | null) || 'new'"
              @update:model-value="onCareStatusChange"
            />
            <v-menu v-if="conversation.externalThreadId && conversation.zaloAccount" :close-on-content-click="false" location="bottom start">
              <template #activator="{ props: actProps }">
                <button v-bind="actProps" class="zlbl-trigger" :title="currentLabel ? `Đang gắn: ${currentLabel.text}` : 'Chưa gắn tag Zalo'">
                  <span class="zlbl-icon" :style="currentLabel ? `color: ${currentLabel.color}` : ''">🏷</span>
                  <span v-if="currentLabel" class="zlbl-current-name" :style="`color: ${currentLabel.color}`">
                    {{ currentLabel.emoji ? currentLabel.emoji + ' ' : '' }}{{ currentLabel.text }}
                  </span>
                  <span v-else class="zlbl-empty">Phân loại</span>
                  <span class="zlbl-caret">▾</span>
                </button>
              </template>
              <div class="zlbl-dropdown zalo-native">
                <div v-if="loadingAllLabels && !allLabels.length" class="zlbl-loading">Đang tải…</div>

                <div v-else-if="!allLabels.length" class="zlbl-empty-state">
                  Tài khoản chưa có thẻ phân loại nào.<br />
                  <button class="zlbl-inline-sync" @click="onSyncLabels">⟳ Đồng bộ từ Zalo</button>
                </div>

                <div v-else class="zlbl-options">
                  <button
                    v-for="lbl in allLabels"
                    :key="lbl.id"
                    class="zlbl-option"
                    :class="{ active: currentLabel?.id === lbl.id }"
                    @click="onPickLabel(lbl)"
                  >
                    <span class="zlbl-flag" :style="`color: ${lbl.color}`">⚑</span>
                    <span class="zlbl-name">
                      <span v-if="lbl.emoji">{{ lbl.emoji }} </span>{{ lbl.text }}
                    </span>
                    <span v-if="currentLabel?.id === lbl.id" class="zlbl-check">✓</span>
                  </button>
                </div>

                <div class="zlbl-divider"></div>
                <button class="zlbl-manage" @click="goToLabelsSettings">
                  <span class="manage-icon">⚙</span>
                  Quản lý thẻ phân loại
                </button>
              </div>
            </v-menu>
          </div>

          <div class="ch-row-2">
            <NickAvatarLock
              v-if="conversation.zaloAccount"
              :privacy-mode="conversation.zaloAccount.privacyMode"
            >
              <Avatar
                :src="conversation.zaloAccount.avatarUrl"
                :name="conversation.zaloAccount.displayName || 'Nick'"
                :size="22"
                :gradient-seed="conversation.zaloAccount.id"
                platform="zalo"
              />
            </NickAvatarLock>
            <span class="nick-name" :title="conversation.zaloAccount?.displayName || ''">
              {{ conversation.zaloAccount?.displayName || '—' }}
            </span>
            <span class="ch-sep">|</span>
            <span
              class="msg-counts"
              :title="`Tin nhắn 1-1 RIÊNG cặp nick × KH này: ${msgInCount} đến / ${msgOutCount} gửi. (Tổng toàn KH ${contactTotalIn}/${contactTotalOut} qua mọi nick chăm)`"
            >
              <span class="cnt-in">{{ msgInCount }}</span>↘
              <span class="cnt-out">{{ msgOutCount }}</span>↗
              <span class="cnt-scope">per nick này</span>
            </span>
            <template v-if="showOnlineIndicator && lastOnlineLabel">
              <span class="ch-sep">|</span>
              <span class="last-online" :class="{ 'is-online': isOnline }">
                <span class="online-dot" />
                {{ lastOnlineLabel }}
              </span>
            </template>
          </div>
        </div>

        <div class="ch-actions">
          <div v-if="friendshipState === 'friend'" class="friend-hover-group">
            <button class="btn-action btn-friend-already" :title="friendshipTitle" disabled>
              <span class="ic">✓</span> Đã KB
              <span v-if="friendDaysLabel" class="sub-meta">{{ friendDaysLabel }}</span>
            </button>
            <button
              class="btn-action btn-remove-friend"
              title="Huỷ kết bạn với KH (Zalo unfriend)"
              :disabled="actionLoading"
              @click="onRemoveFriend"
            >
              <span class="ic">✗</span> Huỷ KB
            </button>
          </div>
          <template v-else-if="friendshipState === 'pending_sent' || friendshipState === 'pending_friend'">
            <button
              class="btn-action btn-pending"
              :title="pendingSentTooltip"
              disabled
            >
              <span class="ic">📤</span> Đã mời <span class="sub-meta">{{ pendingDaysLabel }}</span>
            </button>
            <button
              class="btn-action btn-cancel-invite"
              title="Thu hồi lời mời kết bạn"
              :disabled="actionLoading"
              @click="onCancelInvite"
            >
              <span class="ic">↩️</span> Thu hồi
            </button>
          </template>
          <template v-else-if="friendshipState === 'pending_received'">
            <button
              class="btn-action btn-accept-friend"
              :title="pendingReceivedTooltip"
              :disabled="actionLoading"
              @click="onAcceptInvite"
            >
              <span class="ic">✋</span> Chấp nhận <span class="sub-meta">{{ pendingDaysLabel }}</span>
            </button>
            <button
              class="btn-action btn-reject-invite"
              title="Từ chối lời mời kết bạn"
              :disabled="actionLoading"
              @click="onRejectInvite"
            >
              <span class="ic">✗</span> Từ chối
            </button>
          </template>
          <button
            v-else-if="friendshipState === 'ghost'"
            class="btn-action btn-add-friend"
            title="KH đã huỷ kết bạn. Gửi lời mời lại?"
            :disabled="actionLoading"
            @click="onOpenInviteDialog"
          >
            <span class="ic">↻</span> Mời lại
          </button>
          <button
            v-else-if="conversation.threadType === 'user'"
            class="btn-action btn-add-friend"
            title="Gửi lời mời kết bạn"
            :disabled="actionLoading"
            @click="onOpenInviteDialog"
          >
            <span class="ic">+</span> Kết bạn
          </button>

          <button class="btn-action btn-webhook" :disabled="webhookLoading" @click="fireWebhook">
            {{ webhookLoading ? '⏳ Đang bắn…' : '🚀 Webhook' }}
          </button>

          <v-menu>
            <template #activator="{ props: act }">
              <button class="icon-btn" v-bind="act" title="Thêm">⋮</button>
            </template>
            <v-list density="compact" min-width="220">
              <v-list-item prepend-icon="mdi-history" title="Lịch sử hội thoại" @click="toast.push('Lịch sử: chưa implement')" />
              <v-list-item prepend-icon="mdi-magnify" title="Tìm trong hội thoại" @click="toast.push('Tìm: chưa implement')" />
              <v-list-item prepend-icon="mdi-note-edit-outline" title="Ghi chú nhanh" @click="onOpenNote" />
              <v-divider />
              <v-list-item
                v-if="conversation.contact"
                prepend-icon="mdi-merge"
                title="🔗 Gắn vào KH Cha (merge)"
                @click="showLinkParentDialog = true"
              />
              <v-divider />
              <v-list-item prepend-icon="mdi-bell-off-outline" title="Tắt thông báo" @click="toast.push('Mute: chưa implement')" />
              <v-list-item prepend-icon="mdi-flag-outline" title="Báo cáo" @click="toast.push('Report: chưa implement')" />
            </v-list>
          </v-menu>

          <button
            class="icon-btn"
            :class="{ on: showContactPanel }"
            title="Toggle thông tin KH"
            @click="$emit('toggle-contact-panel')"
          >ⓘ</button>
        </div>
      </header>

      <div ref="messagesContainer" class="messages chat-messages-area">
        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />

        <template v-for="item in displayItems" :key="item.key">
          <div v-if="item.kind === 'divider'" class="msg-divider">{{ item.label }}</div>

          <div
            v-else-if="item.kind === 'album'"
            class="msg-album-wrap"
            :class="{
              self: item.senderType === 'self',
              'msg-archive-selected': isArchiveAlbumFullySelected(item.messages),
            }"
            @click="onAlbumClick($event, item.messages)"
            @contextmenu.prevent="onAlbumContextMenu($event, item)"
          >
            <Avatar
              v-if="item.senderType !== 'self'"
              :src="resolveSenderAvatar(item.messages[0])"
              :name="item.senderName || '?'"
              :size="32"
              :gradient-seed="item.messages[0]?.senderUid || item.senderName || ''"
              class="msg-avatar"
            />
            <div class="msg-album-body">
              <div class="bubble album">
                <div v-if="conversation.threadType === 'group' && item.senderType !== 'self'" class="album-sender">
                  {{ item.senderName || 'Unknown' }}
                </div>
                <div class="album-grid" :class="albumGridClass(item.messages.length)">
                  <img
                    v-for="m in item.messages"
                    :key="m.id"
                    :src="getImageUrl(m)!"
                    alt="Hình ảnh"
                    class="album-tile"
                    @click="onAlbumImageClick($event, m, item.messages)"
                  />
                </div>
                <div v-if="item.totalExpected && item.totalExpected > item.messages.length" class="album-progress">
                  {{ item.messages.length }}/{{ item.totalExpected }} ảnh đã nhận
                </div>
                <div class="bubble-time">
                  {{ formatMessageTime(item.sentAt) }} · 🖼️ {{ item.messages.length }} ảnh
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="isReminderNotice(item.msg)" class="msg-system-event reminder-notice">
            <v-icon size="14" color="warning" class="mr-1">mdi-bell-ring</v-icon>
            <span>{{ reminderNoticeText(item.msg) }}</span>
            <span v-if="reminderNoticeTime(item.msg)" class="reminder-notice-time">· {{ reminderNoticeTime(item.msg) }}</span>
          </div>

          <div
            v-else
            class="msg-bubble-wrap"
            :data-message-id="item.msg.id"
            :class="{
              'msg-privacy-blurred': privacyVisibility.shouldBlurMessage(item.msg, conversation),
              'msg-wrap-self': item.msg.senderType === 'self',
              'msg-wrap-other': item.msg.senderType !== 'self',
              'msg-archive-selected': selectedArchiveMessageIds.has(item.msg.id),
              'msg-archive-conflict': archiveConflictMessageIds.has(item.msg.id),
            }"
            @click="onMessageBubbleClick($event, item.msg)"
          >
            <MessageBubble
              :message="item.msg"
              :reply="item.msg.reply || null"
              :reactions="item.msg.reactions || []"
              :is-self="item.msg.senderType === 'self'"
              :is-last-self="item.msg.id === lastSelfMessageId"
              :is-group="conversation.threadType === 'group'"
              :sender-avatar-url="resolveSenderAvatar(item.msg)"
              @contextmenu="onContextMenu($event, item.msg)"
              @preview-image="openImageLightbox($event, [])"
              @preview-video="previewVideoUrl = $event"
              @toggle-reaction="onToggleReaction(item.msg, $event)"
              @sender-click="onSenderClick(item.msg)"
              @callback="onMessageCallback(item.msg)"
              @open-profile="onOpenProfileFromCard"
              @open-reaction-detail="onOpenReactionDetail"
              @open-reply="focusReplyMessage"
            />
          </div>
        </template>

        <div v-if="!loading && messages.length === 0" class="text-center pa-8 text-grey">Chưa có tin nhắn</div>
      </div>

      <div v-if="archiveSelectionMode" class="archive-selection-bar">
        <div class="archive-selection-copy">
          <strong>Đã chọn {{ selectedArchiveMessageIds.size }} tin nhắn</strong>
          <span>Lưu vào CRM trước, sau đó backup media lên Drive và nội dung lên Sheets.</span>
        </div>
        <div class="archive-selection-actions">
          <v-btn variant="text" size="small" :disabled="archiveSaving" @click="cancelArchiveSelection">Hủy</v-btn>
          <v-btn color="primary" size="small" :loading="archiveDialogLoading" :disabled="selectedArchiveMessageIds.size === 0" @click="openArchiveSaveDialog">
            Lưu nội dung
          </v-btn>
        </div>
      </div>

      <TypingIndicator :typers="currentTypers" />

      <AISuggestBar
        :suggestion="aiSuggestion"
        :loading="aiSuggestionLoading"
        :error="aiSuggestionError"
        @use="applySuggestion"
        @refresh="$emit('ask-ai')"
      />

      <div class="input-area">
        <TagCrmBar
          v-if="conversation.contact && conversation.threadType === 'user'"
          :contact-id="conversation.contact.id"
          :model-value="contactTags"
          :auto-tags="conversationAutoTags"
          @update:model-value="onUpdateTags"
        />

        <ReplyPreviewBar
          :message="(replyingTo || editingMessage) ?? null"
          :mode="editingMessage ? 'edit' : 'reply'"
          @cancel="onCancelReplyEdit"
        />

        <div class="input-toolbar-top">
          <StickerPicker @select="onSendSticker" />
          <button class="icon-tool" title="Gửi ảnh" @click="onPickImage">
            <ImageIcon :size="18" :stroke-width="1.5" />
          </button>
          <button class="icon-tool" title="Gửi file" @click="onPickFile">
            <PaperclipIcon :size="18" :stroke-width="1.5" />
          </button>
          <span class="toolbar-divider"></span>

          <button class="icon-tool" title="Gửi danh thiếp" @click="todoToast('Danh thiếp')">
            <ContactIcon :size="18" :stroke-width="1.5" />
          </button>
          <button
            class="icon-tool"
            :class="{ active: formatBarVisible }"
            :title="formatBarVisible ? 'Ẩn định dạng văn bản' : 'Hiện định dạng văn bản (B I U S ...)'"
            @click="toggleFormat"
          >
            <TypeIcon :size="18" :stroke-width="1.5" />
          </button>
          <span class="toolbar-divider"></span>

          <button
            class="icon-tool"
            :class="{ active: showAppointmentDialog }"
            title="Tạo nhắc hẹn cho KH này"
            :disabled="!conversation.contact"
            @click="showAppointmentDialog = true"
          >
            <CalendarClockIcon :size="18" :stroke-width="1.5" />
          </button>
          <button class="icon-tool" title="Template tin nhắn (gõ /)" @click="openTemplatePopup">
            <ZapIcon :size="18" :stroke-width="1.5" />
          </button>
          <button class="icon-tool ai-btn" title="AI compose" :disabled="aiSuggestionLoading" @click="$emit('ask-ai')">
            <SparklesIcon :size="18" :stroke-width="1.5" />
          </button>
        </div>

        <div class="input-row">
          <NickAvatarLock
            v-if="conversation.zaloAccount"
            :privacy-mode="conversation.zaloAccount.privacyMode"
          >
          <div
            class="nick-avatar-halo"
            :title="`Tin nhắn này được gửi đi từ ${conversation.zaloAccount.displayName || 'nick Zalo'}`"
          >
            <Avatar
              :src="conversation.zaloAccount.avatarUrl"
              :name="conversation.zaloAccount.displayName || 'Nick'"
              :size="36"
              :gradient-seed="conversation.zaloAccount.id"
              platform="zalo"
              class="sender-nick-avatar"
            />
          </div>
          </NickAvatarLock>

          <div class="editor-wrap" :class="{ 'editor-locked': !privacyVisibility.canSendInConv(conversation) }">
            <QuickTemplatePopup
              :visible="showTemplatePopup"
              :query="templateQuery"
              :templates="templates"
              :contact="conversation.contact"
              @select="onTemplateSelect"
              @close="showTemplatePopup = false"
            />
            <RichTextEditor
              ref="editorRef"
              v-model="inputText"
              :placeholder="inputPlaceholder"
              :show-toolbar="formatBarVisible"
              class="input-editor"
              @submit="handleSend"
              @typing="onTypingEvent"
              @paste-image="onPasteImage"
            />
            <div
              v-if="!privacyVisibility.canSendInConv(conversation)"
              class="editor-lock-overlay"
              @click.stop="onComposerLockClick"
            >
              <span class="editor-lock-pill">🔒 Riêng tư — chỉ chính chủ nick gửi được tin</span>
            </div>
          </div>

          <EmojiPicker @pick="onPickEmoji" />

          <button class="send-btn" :disabled="!inputText.trim() || sending" @click="handleSend" title="Gửi (Enter)">
            <v-icon v-if="sending" size="20">mdi-loading mdi-spin</v-icon>
            <v-icon v-else size="20">mdi-send</v-icon>
          </button>
        </div>

        <AppointmentEditor
          v-model="showAppointmentDialog"
          :prefill-contact="conversation.contact ? {
            id: conversation.contact.id,
            fullName: conversation.contact.fullName,
            phone: conversation.contact.phone,
            zaloUid: conversation.contact.zaloUid ?? null,
            zaloUsername: (conversation.contact as any).zaloUsername ?? null,
          } : null"
          :current-user-id="currentUserId"
          @created="onAppointmentCreated"
        />

        <input
          ref="imageInputRef"
          type="file"
          accept="image/*"
          multiple
          style="display: none"
          @change="onImageFilesPicked"
        />
        <input
          ref="fileInputRef"
          type="file"
          multiple
          style="display: none"
          @change="onFileFilesPicked"
        />
      </div>
    </template>

    <MessageContextMenu
      v-model="showContextMenu"
      :message="contextMsg"
      :is-self="contextMsg?.senderType === 'self'"
      :is-pinned="conversation?.isPinned"
      :position="contextPos"
      @reply="onReply"
      @edit="onEdit"
      @delete="onDelete"
      @undo="onUndo"
      @forward="showForwardDialog = true"
      @copy="() => {}"
      @pin="onPin"
      @select="startArchiveSelection"
    />

    <ForwardDialog
      v-if="showForwardDialog"
      v-model="showForwardDialog"
      :conversations="allConversations ?? []"
      @forward="onForward"
    />

    <v-dialog v-model="archiveSaveDialog" max-width="640" content-class="archive-save-dialog">
      <v-card class="archive-save-card">
        <header class="archive-save-header">
          <h2>Lưu tin nhắn vào hồ sơ</h2>
          <p>{{ selectedArchiveMessageIds.size }} tin nhắn đã chọn</p>
        </header>
        <v-card-text class="archive-save-body">
          <v-radio-group v-model="archiveForm.mode" class="archive-save-radios" inline hide-details>
            <v-radio class="archive-save-radio" label="Tạo hồ sơ mới" value="create" />
            <v-radio class="archive-save-radio" label="Thêm vào hồ sơ hiện có" value="append" />
          </v-radio-group>

          <div v-if="archiveForm.mode === 'append'" class="archive-save-field-wrap">
            <label>Hồ sơ của cuộc trò chuyện này</label>
            <v-select
              v-model="archiveForm.storyId"
              :items="archiveStoryOptions"
              item-title="label"
              item-value="id"
              no-data-text="Chưa có hồ sơ phù hợp"
              class="archive-save-field archive-save-select-field"
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </div>

          <div v-else class="archive-save-fields">
            <div class="archive-save-field-wrap">
              <label>Tên hồ sơ mặc định</label>
              <v-text-field
                :model-value="archiveDefaultTitle"
                class="archive-save-field archive-save-select-field"
                variant="outlined"
                density="comfortable"
                hide-details
                readonly
              />
            </div>
            
            <div class="archive-save-field-wrap">
              <label>Nội dung bổ sung cho tên hồ sơ</label>
              <v-text-field
                v-model="archiveForm.title"
                placeholder="PO: số 2008"
                persistent-placeholder
                class="archive-save-field archive-save-select-field"
                variant="outlined"
                density="comfortable"
                hide-details
                bg-color="white"
              />
            </div>

            <div class="archive-save-field-wrap">
              <label>Để trống sẽ dùng tên khách hàng hoặc nhóm chat</label>
              <v-text-field
                v-model="archiveForm.orderCode"
                placeholder="Mã đơn hàng"
                persistent-placeholder
                class="archive-save-field archive-save-select-field"
                variant="outlined"
                density="comfortable"
                hide-details
                bg-color="white"
              />
            </div>

            <div class="archive-save-field-wrap">
              <label>Loại hồ sơ</label>
              <v-select
                v-model="archiveForm.recordType"
                :items="archiveRecordTypes"
                item-title="label"
                item-value="value"
                class="archive-save-field"
                variant="outlined"
                density="comfortable"
                hide-details
              />
            </div>

            <div class="archive-save-field-wrap">
              <label>Mức độ ưu tiên</label>
              <select v-model="archiveForm.priority">
                <option
                  v-for="option in archivePriorityOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <v-icon size="18">mdi-chevron-down</v-icon>
            </div>

            <div class="archive-confirmation-setup">
              <v-icon color="primary" size="22">mdi-account</v-icon>
              <div>
                <span>Cần xác nhận theo user/nhóm</span>
                <strong>{{ archiveConfirmationLabel(archiveSaveContext.conversationConfirmationDefault) }}</strong>
              </div>
            </div>

            <div class="archive-save-field-wrap">
              <label>Phòng ban tiếp nhận</label>
              <v-select
                v-model="archiveForm.departmentId"
                :items="archiveSaveContext.departments"
                item-title="name"
                item-value="id"
                :readonly="!archiveSaveContext.canAssignOthers"
                class="archive-save-field"
                variant="outlined"
                density="comfortable"
                hide-details
              />
            </div>

            <div class="archive-save-field-wrap">
              <label>Người phụ trách</label>
              <v-select
                v-model="archiveForm.assignedUserId"
                :items="archiveAssignableUsers"
                item-title="fullName"
                item-value="id"
                :readonly="!archiveSaveContext.canAssignOthers"
                class="archive-save-field"
                variant="outlined"
                density="comfortable"
                hide-details
              />
            </div>

            <div class="archive-save-field-wrap">
              <label>Ghi chú khác</label>
              <v-textarea
                v-model="archiveForm.extraNote"
                class="archive-save-field archive-save-note"
                variant="outlined"
                density="comfortable"
                rows="4"
                hide-details
                no-resize
              />
            </div>
          </div>

          <v-alert
            v-if="archiveTargetDuplicateCount"
            type="info"
            variant="tonal"
            class="mt-3"
          >
            {{ archiveTargetDuplicateCount }} tin đã có trong hồ sơ đích và sẽ được tự động bỏ qua.
          </v-alert>
        </v-card-text>
        <v-card-actions class="archive-save-footer">
          <v-btn class="archive-save-close" variant="outlined" @click="archiveSaveDialog = false">Đóng</v-btn>
          <v-btn
            class="archive-save-submit"
            color="primary"
            variant="flat"
            :loading="archiveSaving"
            :disabled="archiveForm.mode === 'append' && !archiveForm.storyId"
            @click="preflightAndSaveArchive"
          >Lưu hồ sơ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="archiveConflictDialog" max-width="620">
      <v-card rounded="xl">
        <v-card-title>Tin nhắn đã thuộc hồ sơ khác</v-card-title>
        <v-card-text>
          <p>
            Có {{ archiveConflictMessageIds.size }} tin nhắn đã được lưu trong hồ sơ khác.
            Bạn vẫn muốn dùng các tin này cho hồ sơ đang chọn?
          </p>
          <div class="archive-conflict-list">
            <div v-for="conflict in archiveConflicts" :key="conflict.messageId">
              <strong>Tin nhắn {{ shortMessageId(conflict.messageId) }}</strong>
              <span>{{ conflict.stories.map((story) => story.title).join(', ') }}</span>
            </div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" color="error" @click="cancelArchiveFromConflict">Hủy thao tác</v-btn>
          <v-spacer />
          <v-btn variant="outlined" @click="reviewArchiveConflicts">Quay lại kiểm tra</v-btn>
          <v-btn color="primary" :loading="archiveSaving" @click="confirmArchiveConflicts">Vẫn lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showImagePreview" max-width="1100" content-class="elevation-0" @keydown="onLightboxKey">
      <div class="lightbox-wrap" @click.self="showImagePreview = false">
        <button
          v-if="lightboxList.length > 1"
          class="lightbox-nav lightbox-prev"
          :disabled="lightboxIndex <= 0"
          title="Ảnh trước (←)"
          @click.stop="lightboxPrev"
        >‹</button>
        <img :src="previewImageUrl" alt="Preview" class="lightbox-img" />
        <button
          v-if="lightboxList.length > 1"
          class="lightbox-nav lightbox-next"
          :disabled="lightboxIndex >= lightboxList.length - 1"
          title="Ảnh sau (→)"
          @click.stop="lightboxNext"
        >›</button>
        <div class="lightbox-meta">
          <span v-if="lightboxList.length > 1">{{ lightboxIndex + 1 }} / {{ lightboxList.length }} ·</span>
          Nhấn vùng tối để đóng
        </div>
      </div>
    </v-dialog>

    <v-dialog v-model="showVideoPreview" max-width="900" content-class="elevation-0">
      <div class="text-center" @click.self="showVideoPreview = false" style="cursor: pointer; padding: 16px;">
        <video
          v-if="previewVideoUrl"
          :src="previewVideoUrl"
          controls
          autoplay
          playsinline
          style="max-width: 100%; max-height: 85vh; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); background: #000;"
        />
        <div class="text-caption mt-2" style="color: #aaa;">Nhấn ngoài video để đóng</div>
      </div>
    </v-dialog>

    <ZaloUserInfoDialog
      v-model="userInfoDialog"
      :uid="userInfoUid"
      :zalo-account-id="conversation?.zaloAccount?.id || ''"
    />

    <LinkParentDialog
      v-if="conversation?.contact"
      v-model="showLinkParentDialog"
      :child-contact-id="conversation.contact.id"
      @linked="onLinkedParent"
    />

    <FriendInviteDialog
      v-model="showInviteDialog"
      :receiver-name="headerName"
      :loading="actionLoading"
      @submit="onSendInviteSubmit"
    />

    <ReactionDetailPopup
      v-model="reactionPopupOpen"
      :reactions="reactionPopupReactions"
      :details="reactionPopupDetails"
    />

    <PrivacyUnlockDialog
      v-model="privacyUnlockOpen"
      :nick="privacyDialogNick"
      @unlocked="onPrivacyUnlocked"
    />
    <PrivacyViewerDialog
      v-model="privacyViewerOpen"
      :nick="privacyDialogNick"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue';
import type { Conversation, Message, ReplyMessageRef } from '@/composables/use-chat';
import { formatInOrgTz, weekdayInOrgTz, getOrgParts } from '@/composables/use-org-timezone';
import { api } from '@/api/index';
import { resolveAttachmentUrl } from '@/utils/attachment-url';
import AISuggestBar from '@/components/chat/AISuggestBar.vue';
import CareStatusBadge from '@/components/ui/CareStatusBadge.vue';
import Avatar from '@/components/ui/Avatar.vue';
import EmojiPicker from '@/components/chat/EmojiPicker.vue';
import QuickTemplatePopup from '@/components/chat/quick-template-popup.vue';
import MessageBubble from '@/components/chat/message-bubble.vue';
import ReactionDetailPopup from '@/components/chat/reaction-detail-popup.vue';
import { usePrivacyVisibility } from '@/composables/use-privacy-visibility';
import NickAvatarLock from '@/components/privacy/NickAvatarLock.vue';
import PrivacyUnlockDialog from '@/components/privacy/PrivacyUnlockDialog.vue';
import PrivacyViewerDialog from '@/components/privacy/PrivacyViewerDialog.vue';
import { useAuthStore as _useAuthStorePriv } from '@/stores/auth';

const privacyUnlockOpen = ref(false);
const privacyViewerOpen = ref(false);
const privacyDialogNick = ref<{ displayName?: string | null; avatarUrl?: string | null; zaloUid?: string | null } | null>(null);
const _authStorePriv = _useAuthStorePriv();

function openPrivacyDialog(conv: any) {
  if (!conv?.zaloAccount) return;
  const nickInfo = {
    displayName: conv.zaloAccount.displayName,
    avatarUrl: conv.zaloAccount.avatarUrl,
    zaloUid: conv.zaloAccount.zaloUid,
  };
  privacyDialogNick.value = nickInfo;
  const myId = _authStorePriv.user?.id;
  const isOwner = !!myId && conv.zaloAccount.ownerUserId === myId;
  if (isOwner) privacyUnlockOpen.value = true;
  else privacyViewerOpen.value = true;
}
function onPrivacyUnlocked() {
  if (props.conversation?.id) {
    privacyUnlockOpen.value = false;
  }
}

import {
  Image as ImageIcon,
  Paperclip as PaperclipIcon,
  Contact as ContactIcon,
  Type as TypeIcon,
  CalendarClock as CalendarClockIcon,
  Zap as ZapIcon,
  Sparkles as SparklesIcon,
} from 'lucide-vue-next';

const reactionPopupOpen = ref(false);
const reactionPopupReactions = ref<Array<{ emoji: string; count: number; reacted: boolean }>>([]);
const reactionPopupDetails = ref<Array<{ userId: string; userName?: string | null; emoji: string; source?: 'crm' | 'zalo' }>>([]);
function onOpenReactionDetail(payload: { reactions: any[]; message: Message }) {
  reactionPopupReactions.value = payload.reactions;
  const raw = (payload.message as any).reactions ?? [];
  reactionPopupDetails.value = raw.map((r: any) => ({
    userId: r.reactorId || r.userId || '',
    userName: r.reactorName || r.userName || null,
    emoji: r.emoji,
    source: r.reactorSource || r.source,
  }));
  reactionPopupOpen.value = true;
}

const privacyVisibility = usePrivacyVisibility();
function onMessageLockClick(_e: MouseEvent) {
  openPrivacyDialog(props.conversation);
}
function onComposerLockClick() {
  openPrivacyDialog(props.conversation);
}
import StickerPicker from '@/components/chat/StickerPicker.vue';
import ZaloUserInfoDialog from '@/components/chat/ZaloUserInfoDialog.vue';
import LinkParentDialog from '@/components/chat/LinkParentDialog.vue';
import MessageContextMenu from '@/components/chat/message-context-menu.vue';
import TypingIndicator from '@/components/chat/typing-indicator.vue';
import ReplyPreviewBar from '@/components/chat/reply-preview-bar.vue';
import ForwardDialog from '@/components/chat/forward-dialog.vue';
import RichTextEditor from '@/components/chat/rich-text-editor.vue';
import TagCrmBar from '@/components/chat/TagCrmBar.vue';
import AppointmentEditor from '@/components/appointments/AppointmentEditor.vue';
import { useAuthStore } from '@/stores/auth';

const _authStore = useAuthStore();
const currentUserId = computed<string | null>(() => _authStore.user?.id ?? null);
import FriendInviteDialog from '@/components/chat/FriendInviteDialog.vue';
import { useToast } from '@/composables/use-toast';
import { useZaloPresence } from '@/composables/use-zalo-presence';
import { useZaloFriendStatus } from '@/composables/use-zalo-friend-status';
import { useFriendSocket } from '@/composables/use-friend-socket';
import { groupAvatarStore } from '@/composables/use-group-avatar-cache';
import { registerPendingTags, clearPendingTags } from '@/composables/use-pending-mutations';

interface TemplateItem { id: string; name: string; content: string; category: string | null; isPersonal: boolean; }

const props = defineProps<{
  conversation: Conversation | null;
  messages: Message[];
  loading: boolean;
  sending: boolean;
  showContactPanel?: boolean;
  aiSuggestion: string;
  aiSuggestionLoading: boolean;
  aiSuggestionError: string;
  allConversations?: Conversation[];
  replyingTo?: Message | null;
  editingMessage?: Message | null;
  typingUsers?: { userId: string; userName: string }[];
  focusMessageId?: string;
  focusMessageToken?: string;
}>();

const emit = defineEmits<{
  send: [content: string, replyMessageId?: string | null, styles?: Array<{ st: string; start: number; len: number }>];
  'toggle-contact-panel': [];
  'ask-ai': [];
  'add-reaction': [msgId: string, reaction: string];
  'remove-reaction': [msgId: string, reaction: string];
  'delete-message': [msgId: string];
  'undo-message': [msgId: string];
  'edit-message': [msgId: string, content: string];
  'forward-message': [msgId: string, targetIds: string[]];
  'pin-conversation': [];
  'set-reply-to': [msg: Message];
  'set-editing': [msg: Message];
  'cancel-reply-edit': [];
  'typing': [];
  'refresh-thread': [];
  'care-status-changed': [value: string];
  'focus-reply-message': [reply: ReplyMessageRef];
}>();

const toast = useToast();
const inputText = ref('');
const messagesContainer = ref<HTMLElement | null>(null);
const previewImageUrl = ref('');
const showImagePreview = computed({ get: () => !!previewImageUrl.value, set: (v) => { if (!v) { previewImageUrl.value = ''; lightboxList.value = []; lightboxIndex.value = 0; } } });
const lightboxList = ref<string[]>([]);
const lightboxIndex = ref(0);

function openImageLightbox(url: string, list: string[] = []): void {
  lightboxList.value = list;
  lightboxIndex.value = Math.max(0, list.indexOf(url));
  previewImageUrl.value = url;
}
function lightboxPrev(): void {
  if (lightboxIndex.value > 0) {
    lightboxIndex.value -= 1;
    previewImageUrl.value = lightboxList.value[lightboxIndex.value];
  }
}
function lightboxNext(): void {
  if (lightboxIndex.value < lightboxList.value.length - 1) {
    lightboxIndex.value += 1;
    previewImageUrl.value = lightboxList.value[lightboxIndex.value];
  }
}
function onLightboxKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { lightboxPrev(); e.preventDefault(); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { lightboxNext(); e.preventDefault(); }
  else if (e.key === 'Escape') { showImagePreview.value = false; }
}

const previewVideoUrl = ref('');
const showVideoPreview = computed({ get: () => !!previewVideoUrl.value, set: (v) => { if (!v) previewVideoUrl.value = ''; } });
const webhookLoading = ref(false);

function onMessageCallback(_msg: Message) {
  const phone = props.conversation?.contact?.phone;
  if (phone) {
    navigator.clipboard?.writeText(phone).catch(() => {});
    toast.success(`Đã copy SĐT ${phone} — dán vào app gọi`);
  } else {
    toast.warning('Liên hệ này chưa có SĐT trong CRM');
  }
}

const showContextMenu = ref(false);
const contextMsg = ref<Message | null>(null);
const contextPos = ref({ x: 0, y: 0 });
const contextArchiveMessageIds = ref<string[]>([]);
const showForwardDialog = ref(false);
const showLinkParentDialog = ref(false);
const selectedArchiveMessageIds = ref<Set<string>>(new Set());
const archiveSelectionMode = computed(() => selectedArchiveMessageIds.value.size > 0);
const archiveSaving = ref(false);
const archiveDialogLoading = ref(false);
const archiveSaveDialog = ref(false);
const archiveConflictDialog = ref(false);
const archiveTargetDuplicateCount = ref(0);
const archiveConflictMessageIds = ref<Set<string>>(new Set());
const archiveConflicts = ref<Array<{
  messageId: string;
  stories: Array<{ id: string; title: string; businessStatus: string }>;
}>>([]);
const archiveStories = ref<Array<{
  id: string;
  title: string;
  businessStatus: string;
  statusDefinition?: {
    id: string;
    name: string;
    behaviorGroup: string;
    allowMessageAppend: boolean;
  } | null;
  updatedAt: string;
  _count: { messages: number };
  assignedUser?: { fullName: string } | null;
}>>([]);
const archiveSaveContext = ref<{
  defaultRecordType: string;
  currentDepartment: { id: string; name: string } | null;
  currentUser: { id: string; fullName: string } | null;
  conversationConfirmationDefault: boolean | null;
  conversationConfirmationUpdatedAt?: string | null;
  canAssignOthers: boolean;
  departments: Array<{ id: string; name: string }>;
  users: Array<{ id: string; fullName: string; departmentId: string | null }>;
}>({
  defaultRecordType: 'order',
  currentDepartment: null,
  currentUser: null,
  conversationConfirmationDefault: null,
  conversationConfirmationUpdatedAt: null,
  canAssignOthers: false,
  departments: [],
  users: [],
});
const archiveForm = ref({
  mode: 'create' as 'create' | 'append',
  storyId: '',
  title: '',
  orderCode: '',
  priority: 'normal',
  extraNote: '',
  recordType: 'order',
  departmentId: '',
  assignedUserId: '',
});
const archiveRecordTypes = [
  { label: 'Đơn hàng', value: 'order' },
  { label: 'Yêu cầu báo giá', value: 'quotation' },
  { label: 'Chăm sóc khách hàng', value: 'customer_care' },
  { label: 'Khác', value: 'other' },
];
const defaultArchivePriorityOptions = [
  { label: 'Thấp', value: 'low' },
  { label: 'Bình thường', value: 'normal' },
  { label: 'Ưu tiên', value: 'high' },
  { label: 'Gấp', value: 'urgent' },
];
const archivePriorityOptions = ref([...defaultArchivePriorityOptions]);
const archiveDefaultTitle = computed(() => headerName.value || 'Hồ sơ mới');
function archiveConfirmationLabel(value?: boolean | null) {
  if (value === true) return 'Có';
  if (value === false) return 'Không';
  return 'Chưa cài đặt';
}

function canAppendToArchiveStory(story: (typeof archiveStories.value)[number]) {
  return story.statusDefinition
    ? story.statusDefinition.allowMessageAppend
    : story.businessStatus === 'pending';
}
const appendableArchiveStories = computed(() => archiveStories.value.filter(canAppendToArchiveStory));
const archiveStoryOptions = computed(() => appendableArchiveStories.value.map((story) => ({
  id: story.id,
  label: `${story.title} · ${story.statusDefinition?.name || legacyArchiveStatusLabel(story.businessStatus)} · ${story._count.messages} tin`,
})));

function legacyArchiveStatusLabel(status: string) {
  if (status === 'completed') return 'Hoàn thành';
  if (status === 'cancelled') return 'Huỷ';
  return 'Đang xử lý';
}

const archiveAssignableUsers = computed(() => {
  if (!archiveForm.value.departmentId) return archiveSaveContext.value.users;
  return archiveSaveContext.value.users.filter((user) => user.departmentId === archiveForm.value.departmentId);
});

async function onLinkedParent() {
  toast.success('Đã merge KH này vào KH Cha — conversations + friends đã chuyển');
  emit('refresh-thread');
}
const editorRef = ref<InstanceType<typeof RichTextEditor> | null>(null);
const currentTypers = computed(() => props.typingUsers || []);

const lastSelfMessageId = computed<string | null>(() => {
  const list = props.messages;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]?.senderType === 'self' && !list[i]?.isDeleted) return list[i].id;
  }
  return null;
});

function _isUsableName(s: string | null | undefined): s is string {
  return !!s && s.trim().length > 0 && s.trim().toLowerCase() !== 'unknown';
}
const headerName = computed(() => {
  if (props.conversation?.threadType === 'group') {
    const groupName = (props.conversation as { groupName?: string }).groupName;
    if (_isUsableName(groupName)) return groupName!;
    if (_isUsableName(props.conversation?.contact?.fullName)) return props.conversation!.contact!.fullName!;
    return 'Nhóm Zalo';
  }
  if (_isUsableName(props.conversation?.friendship?.aliasInNick)) {
    return props.conversation!.friendship!.aliasInNick!;
  }
  if (_isUsableName(props.conversation?.contact?.fullName)) {
    return props.conversation!.contact!.fullName!;
  }
  const friendship = props.conversation?.friendship as { zaloDisplayName?: string | null } | undefined;
  if (_isUsableName(friendship?.zaloDisplayName)) return friendship!.zaloDisplayName!;
  return 'Unknown';
});
const headerAvatarSrc = computed(() => {
  if (props.conversation?.threadType === 'group') {
    return (props.conversation as { groupAvatarUrl?: string }).groupAvatarUrl || null;
  }
  const friendship = props.conversation?.friendship as { zaloAvatarUrl?: string | null } | undefined;
  return props.conversation?.contact?.avatarUrl
    || friendship?.zaloAvatarUrl
    || null;
});
const contactGender = computed(() => props.conversation?.contact?.gender || null);

const genderLabel = computed(() => {
  if (props.conversation?.threadType === 'group') return 'Nhóm';
  if (contactGender.value === 'female') return 'Nữ';
  if (contactGender.value === 'male') return 'Nam';
  return 'Chưa rõ';
});
const genderTitle = computed(() => {
  if (props.conversation?.threadType === 'group') return 'Nhóm hội thoại';
  return `Giới tính: ${genderLabel.value}`;
});
const genderChipClass = computed(() => {
  if (props.conversation?.threadType === 'group') return 'gender-group';
  if (contactGender.value === 'female') return 'gender-female';
  if (contactGender.value === 'male') return 'gender-male';
  return 'gender-unknown';
});

const msgInCount = computed(() => props.conversation?.friendship?.totalInbound ?? 0);

type AccountLabelView = {
  id: number;
  text: string;
  color: string;
  emoji: string | null;
  offset: number;
  assignedCount: number;
  assignedTo?: boolean;
};

const allLabels = ref<AccountLabelView[]>([]);
const loadingAllLabels = ref(false);

const currentLabel = computed<AccountLabelView | null>(() => {
  const fromList = allLabels.value.find(l => l.assignedTo);
  if (fromList) return fromList;
  const fs = props.conversation?.friendship;
  const labels = Array.isArray(fs?.zaloLabels) ? fs!.zaloLabels : [];
  if (!labels.length) return null;
  const first = labels[0] as { id?: number | string; name?: string; color?: string; emoji?: string };
  return {
    id: Number(first.id) || 0,
    text: first.name || '—',
    color: first.color || '#999',
    emoji: first.emoji || null,
    offset: 0,
    assignedCount: 0,
  };
});

async function fetchAllLabels(accountId: string, threadId?: string | null) {
  if (!accountId) return;
  loadingAllLabels.value = true;
  try {
    const { api: apiClient } = await import('@/api/index');
    const query = threadId ? `?threadId=${encodeURIComponent(threadId)}` : '';
    const { data } = await apiClient.get(`/zalo-accounts/${accountId}/labels${query}`);
    allLabels.value = (data.labels || []) as AccountLabelView[];
  } catch (err) {
    console.error('[zalo-labels] fetch all error', err);
  } finally {
    loadingAllLabels.value = false;
  }
}

async function touchAccountSync(accountId: string, threadId?: string | null) {
  if (!accountId) return;
  try {
    const { api: apiClient } = await import('@/api/index');
    await apiClient.post(`/zalo-accounts/${accountId}/labels/touch`);
    await fetchAllLabels(accountId, threadId);
    window.dispatchEvent(new CustomEvent('zalo-labels-synced', { detail: { accountId } }));
  } catch (err) {
  }
}

async function touchConversationProfile(convId: string) {
  if (!convId) return;
  try {
    const { api: apiClient } = await import('@/api/index');
    await apiClient.post(`/conversations/${convId}/touch-profile`);
  } catch {
  }
}

watch(() => props.conversation?.id, (newId, oldId) => {
  if (!newId || newId === oldId) return;
  const accId = props.conversation?.zaloAccount?.id;
  const threadId = props.conversation?.externalThreadId;
  if (accId) {
    void fetchAllLabels(accId, threadId);
    void touchAccountSync(accId, threadId);
    void touchConversationProfile(newId);
  }
}, { immediate: true });

async function onPickLabel(label: AccountLabelView) {
  const accId = props.conversation?.zaloAccount?.id;
  const threadId = props.conversation?.externalThreadId;
  if (!accId || !threadId) return;

  const labelId = currentLabel.value?.id === label.id ? null : label.id;

  const snapshotAllLabels = allLabels.value.map(l => ({ ...l }));
  const friendship = props.conversation?.friendship as { crmTagsPerNick?: string[] } | null | undefined;
  const oldCrmTags = Array.isArray(friendship?.crmTagsPerNick)
    ? [...(friendship!.crmTagsPerNick as string[])]
    : [];

  allLabels.value = allLabels.value.map(l => ({
    ...l,
    assignedTo: labelId !== null && l.id === labelId,
  }));

  const stripped = oldCrmTags.filter(t => !t.startsWith('🔵 '));
  const newTags = labelId !== null ? [...stripped, `🔵 ${label.text}`] : stripped;
  if (friendship) {
    friendship.crmTagsPerNick = newTags;
  }

  const convId = props.conversation?.id;
  if (convId) registerPendingTags(convId, newTags);

  toast.success(labelId ? `✓ Đã gắn "${label.text}"` : `✓ Đã bỏ tag`);

  try {
    const { api: apiClient } = await import('@/api/index');
    await apiClient.post(`/zalo-accounts/${accId}/labels/assign-thread`, { threadId, labelId });
    if (convId) clearPendingTags(convId);
    void fetchAllLabels(accId, threadId);
    window.dispatchEvent(new CustomEvent('zalo-labels-synced', { detail: { accountId: accId } }));
    const contactId = props.conversation?.contact?.id;
    if (contactId) window.dispatchEvent(new CustomEvent('timeline-updated', { detail: { contactId } }));
  } catch (err: any) {
    allLabels.value = snapshotAllLabels;
    if (friendship) friendship.crmTagsPerNick = oldCrmTags;
    if (convId) clearPendingTags(convId);
    toast.error(err.response?.data?.error || 'Không gán được tag — đã hoàn tác');
  }
}

async function onSyncLabels() {
  const accId = props.conversation?.zaloAccount?.id;
  const threadId = props.conversation?.externalThreadId;
  if (!accId) return;
  try {
    const { api: apiClient } = await import('@/api/index');
    const { data } = await apiClient.post(`/zalo-accounts/${accId}/labels/sync`);
    toast.success(`✓ Sync ${data.labels.length} tag · ${data.friendsUpdated} KH`);
    await fetchAllLabels(accId, threadId);
    window.dispatchEvent(new CustomEvent('zalo-labels-synced', { detail: { accountId: accId } }));
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Sync thất bại');
  }
}

function goToLabelsSettings() {
  window.location.assign('/settings?tab=zalo-labels');
}

const contactTags = ref<string[]>([]);

const conversationAutoTags = computed<string[]>(() => {
  const conv = props.conversation as any;
  const fromFriendship = conv?.friendship?.autoTags;
  const fromContact = conv?.contact?.autoTags;
  const list = (fromFriendship ?? fromContact ?? []) as unknown;
  return Array.isArray(list) ? (list as string[]) : [];
});
function recomputeTags() {
  const ct = Array.isArray(props.conversation?.contact?.tags)
    ? (props.conversation!.contact!.tags as string[])
    : [];
  const ftRaw = (props.conversation?.friendship as { crmTagsPerNick?: string[] } | null | undefined)?.crmTagsPerNick;
  const ft = Array.isArray(ftRaw) ? ftRaw : [];
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const t of ft) if (t.startsWith('🔵 ') && !seen.has(t)) { seen.add(t); merged.push(t); }
  for (const t of ft) if (!t.startsWith('🔵 ') && !seen.has(t)) { seen.add(t); merged.push(t); }
  for (const t of ct) if (!t.startsWith('🔵 ') && !seen.has(t)) { seen.add(t); merged.push(t); }
  contactTags.value = merged;
}
watch(() => [
  props.conversation?.contact?.tags,
  (props.conversation?.friendship as { crmTagsPerNick?: string[] } | null | undefined)?.crmTagsPerNick,
], recomputeTags, { immediate: true, deep: true });

function onUpdateTags(next: string[]) {
  contactTags.value = next;
}
const msgOutCount = computed(() => props.conversation?.friendship?.totalOutbound ?? 0);
const contactTotalIn = computed(() => props.conversation?.contact?.totalInbound ?? 0);
const contactTotalOut = computed(() => props.conversation?.contact?.totalOutbound ?? 0);

const presence = useZaloPresence(
  () => props.conversation?.zaloAccount?.id || null,
  () => {
    if (props.conversation?.threadType === 'group') return null;
    return props.conversation?.externalThreadId || props.conversation?.contact?.zaloUid || null;
  },
);

const isOnline = computed(() => presence.isOnline.value);
const lastOnlineLabel = computed(() => {
  if (props.conversation?.threadType === 'group') {
    const count = (props.conversation as { groupMembersCount?: number | null }).groupMembersCount;
    return count ? `${count} thành viên` : 'Nhóm';
  }
  return presence.label.value;
});
const showOnlineIndicator = computed(() => {
  if (props.conversation?.threadType === 'group') return true;
  return presence.hasIndicator.value;
});

watch(
  [() => props.conversation?.id, () => props.messages],
  () => {
    if (props.conversation?.threadType !== 'group') return;
    const uids = new Set<string>();
    for (const m of props.messages) {
      if (m.senderUid && m.senderType !== 'self' && !groupAvatarStore.has(m.senderUid)) {
        uids.add(m.senderUid);
      }
    }
    if (uids.size > 0) void groupAvatarStore.fetchBatch([...uids]);
  },
  { immediate: true },
);

function resolveSenderAvatar(msg: Message): string | null {
  if (msg.senderType === 'self') return null;
  if (props.conversation?.threadType === 'user') {
    return props.conversation?.contact?.avatarUrl || null;
  }
  if (msg.senderUid) return groupAvatarStore.get(msg.senderUid) || null;
  return null;
}

const userInfoDialog = ref(false);
const userInfoUid = ref('');
function onOpenProfileFromCard(uid: string) {
  if (!uid) return;
  userInfoUid.value = uid;
  userInfoDialog.value = true;
}

function onSenderClick(msg: Message) {
  if (!msg.senderUid || msg.senderType === 'self') return;
  userInfoUid.value = msg.senderUid;
  userInfoDialog.value = true;
}

function isReminderNotice(msg: Message): boolean {
  if (msg.contentType !== 'reminder') return false;
  try {
    const p = JSON.parse(msg.content || '{}');
    return p.action === 'msginfo.actionlist';
  } catch { return false; }
}
function reminderNoticeText(msg: Message): string {
  try {
    const p = JSON.parse(msg.content || '{}');
    return String(p.title || '').trim() || 'Nhắc hẹn mới';
  } catch { return 'Nhắc hẹn mới'; }
}
function reminderNoticeTime(msg: Message): string {
  try {
    const p = JSON.parse(msg.content || '{}');
    const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
    const hl = Array.isArray(params?.highLightsV2) ? params.highLightsV2 : [];
    for (const h of hl) {
      if (Number(h.ts) > 1e12) {
        const ts = Number(h.ts);
        const p = getOrgParts(ts);
        if (!p) return '';
        const dow = weekdayInOrgTz(ts, undefined, 'short');
        return `${dow}, ${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
      }
    }
  } catch {}
  return '';
}
type FriendshipState = 'friend' | 'pending_sent' | 'pending_received' | 'pending_friend' | 'chatting_stranger' | 'ghost' | null;

const zaloFriend = useZaloFriendStatus(
  () => props.conversation?.zaloAccount?.id || null,
  () => {
    if (props.conversation?.threadType !== 'user') return null;
    return props.conversation?.externalThreadId || props.conversation?.contact?.zaloUid || null;
  },
);

const recentlyUnfriended = ref(false);
useFriendSocket((payload) => {
  const acc = props.conversation?.zaloAccount?.id;
  const contactId = props.conversation?.contact?.id;
  const convUid = props.conversation?.externalThreadId;
  if (!acc || !contactId) return;
  if (payload.zaloAccountId !== acc || payload.contactId !== contactId) return;

  const status = payload.patch?.friendshipStatus as string | undefined;
  if (!status) return;

  const payloadUid = payload.zaloUidInNick;
  const isSameUid = !payloadUid || !convUid || payloadUid === convUid;

  if (status === 'accepted') {
    zaloFriend.setStatus({ isFriend: true, isRequested: false, isRequesting: false });
    recentlyUnfriended.value = false;
  } else if (status === 'pending_sent') {
    zaloFriend.setStatus({ isFriend: false, isRequested: true, isRequesting: false });
    recentlyUnfriended.value = false;
  } else if (status === 'pending_received') {
    zaloFriend.setStatus({ isFriend: false, isRequested: false, isRequesting: true });
    recentlyUnfriended.value = false;
  } else if (status === 'removed' || status === 'blocked') {
    if (isSameUid) {
      zaloFriend.setStatus({ isFriend: false, isRequested: false, isRequesting: false });
      recentlyUnfriended.value = true;
    }
  } else if (status === 'rejected' || status === 'none') {
    const currentIsFriend = zaloFriend.status.value?.isFriend === true;
    if (isSameUid || !currentIsFriend) {
      zaloFriend.setStatus({ isFriend: false, isRequested: false, isRequesting: false });
      if (status === 'rejected' && isSameUid) recentlyUnfriended.value = true;
    }
  }
});

watch(() => props.conversation?.id, () => {
  recentlyUnfriended.value = false;
  cancelArchiveSelection();
});

const friendshipState = computed<FriendshipState>(() => {
  if (props.conversation?.threadType !== 'user') return null;

  const fs = props.conversation?.friendship;
  const wasOnceFriend = recentlyUnfriended.value || !!(
    fs && (fs.becameFriendAt
      || fs.friendshipStatus === 'removed'
      || fs.friendshipStatus === 'blocked'
      || fs.relationshipKind === 'ghost')
  );

  const z = zaloFriend.status.value;
  if (z) {
    if (z.isFriend) return 'friend';
    if (z.isRequested) return 'pending_sent';
    if (z.isRequesting) return 'pending_received';
    if (wasOnceFriend) return 'ghost';
    if (props.conversation?.contact?.zaloUid) return 'chatting_stranger';
    return null;
  }

  if (fs) {
    if (fs.friendshipStatus === 'pending_sent') return 'pending_sent';
    if (fs.friendshipStatus === 'pending_received') return 'pending_received';
    const k = fs.relationshipKind;
    if (k === 'friend' || k === 'pending_friend' || k === 'chatting_stranger' || k === 'ghost') {
      return k;
    }
  }
  if (props.conversation?.contact?.zaloUid) return 'chatting_stranger';
  return null;
});

function calendarDaysDiff(at: string | Date): number {
  const d1 = new Date(at);
  const d2 = new Date();
  const day1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const day2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.floor((day2.getTime() - day1.getTime()) / 86400000);
}

const friendDaysLabel = computed(() => {
  const at = props.conversation?.friendship?.becameFriendAt;
  if (!at) return null;
  const d = calendarDaysDiff(at);
  if (d <= 0) return 'hôm nay';
  if (d === 1) return 'hôm qua';
  if (d < 30) return `${d} ngày`;
  if (d < 365) return `${Math.floor(d / 30)} tháng`;
  return `${Math.floor(d / 365)} năm`;
});

const pendingDaysLabel = computed(() => {
  const fs = props.conversation?.friendship;
  const at = fs?.updatedAt
    || fs?.firstMessageAt
    || props.conversation?.contact?.lastOutboundAt
    || null;
  if (!at) return 'vừa gửi';
  const d = calendarDaysDiff(at);
  if (d <= 0) return 'hôm nay';
  if (d === 1) return 'hôm qua';
  if (d === 2) return 'hôm kia';
  if (d < 7) return `${d} ngày trước`;
  if (d < 30) return `${d} ngày`;
  if (d < 60) return '1 tháng';
  if (d < 365) return `${Math.floor(d / 30)} tháng`;
  return `${Math.floor(d / 365)} năm`;
});

function naturalTimeLabel(daysLabel: string): string {
  if (daysLabel === 'hôm nay' || daysLabel === 'hôm qua' || daysLabel === 'hôm kia') return daysLabel;
  if (daysLabel.endsWith('trước')) return daysLabel;
  return `${daysLabel} trước`;
}

const pendingReceivedTooltip = computed(() => {
  const name = headerName.value && headerName.value !== 'Unknown' ? headerName.value : 'Khách hàng';
  const time = naturalTimeLabel(pendingDaysLabel.value);
  return `${name} đã gửi lời mời kết bạn từ ${time}. Chấp nhận kết bạn?`;
});

const pendingSentTooltip = computed(() => {
  const time = naturalTimeLabel(pendingDaysLabel.value);
  return `Sale đã gửi mời kết bạn từ ${time}. Click để huỷ.`;
});

const friendshipTitle = computed(() => {
  if (friendshipState.value === 'friend') {
    return friendDaysLabel.value ? `Đã kết bạn ${friendDaysLabel.value}` : 'Đã kết bạn';
  }
  return '';
});

const actionLoading = ref(false);
const showInviteDialog = ref(false);

function getActionContext() {
  const accountId = props.conversation?.zaloAccount?.id;
  const uid = props.conversation?.externalThreadId || props.conversation?.contact?.zaloUid;
  return { accountId, uid };
}

function onOpenInviteDialog() {
  const { accountId, uid } = getActionContext();
  if (!accountId || !uid) {
    toast.error('Thiếu thông tin nick hoặc KH');
    return;
  }
  showInviteDialog.value = true;
}

async function onSendInviteSubmit(message: string) {
  const { accountId, uid } = getActionContext();
  if (!accountId || !uid) {
    toast.error('Thiếu thông tin nick hoặc KH');
    return;
  }
  actionLoading.value = true;
  try {
    await api.post(`/zalo-accounts/${accountId}/friends/requests`, { userId: uid, message });
    toast.success('Đã gửi lời mời kết bạn');
    zaloFriend.setStatus({ isFriend: false, isRequested: true, isRequesting: false });
    showInviteDialog.value = false;
  } catch (err: any) {
    toast.error(formatFriendOpError(err, 'Không thể gửi lời mời'));
    console.error('[send-invite] failed', { accountId, uid, err: err?.response?.data || err });
  } finally {
    actionLoading.value = false;
  }
}

async function onCancelInvite() {
  const { accountId, uid } = getActionContext();
  if (!accountId || !uid) {
    toast.error('Thiếu thông tin nick hoặc KH');
    return;
  }
  actionLoading.value = true;
  try {
    await api.delete(`/zalo-accounts/${accountId}/friends/requests/${uid}`);
    toast.success('Đã thu hồi lời mời kết bạn');
    zaloFriend.setStatus({ isFriend: false, isRequested: false, isRequesting: false });
  } catch (err: any) {
    toast.error(formatFriendOpError(err, 'Không thể thu hồi'));
    console.error('[cancel-invite] failed', { accountId, uid, err: err?.response?.data || err });
  } finally {
    actionLoading.value = false;
  }
}

async function onRejectInvite() {
  const { accountId, uid } = getActionContext();
  if (!accountId || !uid) {
    toast.error('Thiếu thông tin nick hoặc KH');
    return;
  }
  actionLoading.value = true;
  try {
    await api.post(`/zalo-accounts/${accountId}/friends/requests/${uid}/reject`);
    toast.success('Đã từ chối lời mời kết bạn');
    zaloFriend.setStatus({ isFriend: false, isRequested: false, isRequesting: false });
  } catch (err: any) {
    toast.error(formatFriendOpError(err, 'Không thể từ chối lời mời'));
    console.error('[reject-invite] failed', { accountId, uid, err: err?.response?.data || err });
  } finally {
    actionLoading.value = false;
  }
}

function formatFriendOpError(err: any, fallback: string): string {
  const serverMsg = err?.response?.data?.error;
  if (serverMsg) return serverMsg;
  const code = err?.code || err?.response?.data?.code;
  if (code === 'ERR_NETWORK' || err?.message === 'Network Error') {
    return 'Lỗi mạng — server đang khởi động lại hoặc mất kết nối. Thử lại sau 5s.';
  }
  if (code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
    return 'Hết thời gian chờ Zalo phản hồi. Thử lại sau.';
  }
  return err?.message || fallback;
}

async function onRemoveFriend() {
  const { accountId, uid } = getActionContext();
  if (!accountId || !uid) {
    toast.error('Thiếu thông tin nick hoặc KH');
    return;
  }
  if (!confirm('Huỷ kết bạn với KH này? Sau đó muốn nhắn lại sẽ phải gửi lời mời kết bạn lại.')) return;
  actionLoading.value = true;
  try {
    await api.delete(`/zalo-accounts/${accountId}/friends/${uid}`);
    toast.success('Đã huỷ kết bạn với KH');
    zaloFriend.setStatus({ isFriend: false, isRequested: false, isRequesting: false });
    recentlyUnfriended.value = true; 
  } catch (err: any) {
    toast.error(formatFriendOpError(err, 'Không thể huỷ kết bạn'));
    console.error('[remove-friend] failed', { accountId, uid, err: err?.response?.data || err });
  } finally {
    actionLoading.value = false;
  }
}

async function onAcceptInvite() {
  const { accountId, uid } = getActionContext();
  if (!accountId || !uid) {
    toast.error('Thiếu thông tin nick hoặc KH');
    return;
  }
  actionLoading.value = true;
  try {
    const res = await api.post(`/zalo-accounts/${accountId}/friends/requests/${uid}/accept`);
    const method = res?.data?.method;
    toast.success(method === 'send-as-accept'
      ? 'Đã chấp nhận lời mời kết bạn (qua sendFriendRequest)'
      : 'Đã chấp nhận lời mời kết bạn');
    zaloFriend.setStatus({ isFriend: true, isRequested: false, isRequesting: false });
  } catch (err: any) {
    toast.error(formatFriendOpError(err, 'Không thể chấp nhận lời mời'));
    console.error('[accept-friend] failed', { accountId, uid, err: err?.response?.data || err });
  } finally {
    actionLoading.value = false;
  }
}
function onOpenNote() {
  if (!props.showContactPanel) emit('toggle-contact-panel');
  toast.push('Mở ghi chú nhanh ở panel bên phải');
}
const inputPlaceholder = computed(() => {
  return 'Gõ tin nhắn… ("/" template, "@" mention, "#" tag)';
});

async function onCareStatusChange(value: string) {
  const contactId = props.conversation?.contact?.id;
  if (!contactId) return;
  const prev = props.conversation?.contact?.status;
  if (props.conversation?.contact) {
    (props.conversation.contact as { status?: string | null }).status = value;
  }
  try {
    const { api: apiClient } = await import('@/api/index');
    await apiClient.put(`/contacts/${contactId}`, { status: value });
    window.dispatchEvent(new CustomEvent('timeline-updated', { detail: { contactId } }));
    toast.undo(`Đã đổi trạng thái → ${value}`, async () => {
      try {
        await apiClient.put(`/contacts/${contactId}`, { status: prev || null });
        if (props.conversation?.contact) {
          (props.conversation.contact as { status?: string | null }).status = prev as string | null;
        }
        toast.success(`✓ Đã hoàn tác về "${prev || 'không có'}"`);
      } catch {
        toast.error('Hoàn tác thất bại');
      }
    });
    emit('care-status-changed', value);
  } catch (err: any) {
    if (props.conversation?.contact) {
      (props.conversation.contact as { status?: string | null }).status = prev as string | null;
    }
    const msg = err?.response?.data?.error || `Lưu trạng thái thất bại (${err?.response?.status || 'network'})`;
    toast.error(msg);
    console.error(err);
  }
}

async function fireWebhook() {
  if (!props.conversation?.contact?.id) return;
  webhookLoading.value = true;
  try {
    await new Promise(r => setTimeout(r, 700));
    toast.success('Webhook đã bắn về CRM');
  } catch {
    toast.error('Webhook fail');
  } finally {
    webhookLoading.value = false;
  }
}

function todoToast(label: string) {
  toast.push(`${label}: chưa implement`, 'warning');
}

function onPickEmoji(emoji: string) {
  editorRef.value?.insertText(emoji);
}

async function onSendSticker(sticker: { id: number; catId: number; type: number }) {
  if (!props.conversation?.id) return;
  try {
    await api.post(`/conversations/${props.conversation.id}/sticker`, {
      stickerId: sticker.id,
      cateId: sticker.catId,
      type: sticker.type,
    });
    emit('refresh-thread');
    await nextTick();
    scrollToBottom();
  } catch (err) {
    console.error('[sticker] send error:', err);
    toast.push('Không gửi được sticker', 'error');
  }
}

const imageInputRef = ref<HTMLInputElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const dragDepth = ref(0);
const isDraggingFiles = ref(false);

function onPickImage() { imageInputRef.value?.click(); }
function onPickFile() { fileInputRef.value?.click(); }

function onImageFilesPicked(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files || []);
  if (files.length) handleImageFiles(files);
  if (imageInputRef.value) imageInputRef.value.value = '';
}
function onFileFilesPicked(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files || []);
  if (files.length) handleFiles(files);
  if (fileInputRef.value) fileInputRef.value.value = '';
}
function onPasteImage(files: File[]) {
  handleImageFiles(files);
}

function hasDraggedFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function resetDragState() {
  dragDepth.value = 0;
  isDraggingFiles.value = false;
}

function onDragEnter(event: DragEvent) {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  dragDepth.value += 1;
  isDraggingFiles.value = true;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function onDragOver(event: DragEvent) {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  isDraggingFiles.value = true;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function onDragLeave(event: DragEvent) {
  if (!isDraggingFiles.value) return;
  if (
    event.currentTarget instanceof Node &&
    event.relatedTarget instanceof Node &&
    event.currentTarget.contains(event.relatedTarget)
  ) {
    return;
  }
  dragDepth.value = Math.max(0, dragDepth.value - 1);
  if (dragDepth.value === 0) isDraggingFiles.value = false;
}

async function onDropFiles(event: DragEvent) {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  const files = Array.from(event.dataTransfer?.files || []);
  resetDragState();
  if (!files.length) return;
  if (!props.conversation?.id) {
    toast.error('Chọn cuộc trò chuyện trước khi gửi file');
    return;
  }
  const imageFiles = files.filter((file) => file.type.startsWith('image/'));
  const otherFiles = files.filter((file) => !file.type.startsWith('image/'));
  if (imageFiles.length) await handleImageFiles(imageFiles);
  if (otherFiles.length) await handleFiles(otherFiles);
}

async function handleImageFiles(files: File[]) {
  if (!props.conversation?.id) return;
  if (!files.length) return;
  toast.push(`📷 Đang gửi ${files.length} ảnh…`);
  try {
    const fd = new FormData();
    for (const f of files) fd.append('files', f, f.name);
    await api.post(`/conversations/${props.conversation.id}/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    toast.success(`Đã gửi ${files.length} ảnh`);
    emit('refresh-thread');
  } catch (err) {
    const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Upload thất bại';
    toast.error(`Lỗi gửi ảnh: ${detail}`);
    console.error('[upload-image]', err);
  }
}
async function handleFiles(files: File[]) {
  if (!props.conversation?.id) return;
  if (!files.length) return;
  toast.push(`📎 Đang gửi ${files.length} file…`);
  try {
    const fd = new FormData();
    for (const f of files) fd.append('files', f, f.name);
    await api.post(`/conversations/${props.conversation.id}/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    toast.success(`Đã gửi ${files.length} file`);
    emit('refresh-thread');
  } catch (err) {
    const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Upload thất bại';
    toast.error(`Lỗi gửi file: ${detail}`);
  }
}

const formatBarVisible = ref(false);
function toggleFormat() {
  formatBarVisible.value = !formatBarVisible.value;
  if (formatBarVisible.value) editorRef.value?.focus();
}

const showAppointmentDialog = ref(false);
function onAppointmentCreated() {
  emit('refresh-thread');
  window.dispatchEvent(new CustomEvent('appointment-created'));
}

type DisplayItem =
  | { kind: 'single'; key: string; msg: Message }
  | { kind: 'divider'; key: string; label: string }
  | { kind: 'album'; key: string; senderType: string; senderName: string | null; sentAt: string; totalExpected: number | null; messages: Message[] };

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = d.getHours().toString().padStart(2, '0');
  const mi = d.getMinutes().toString().padStart(2, '0');
  if (day.getTime() === today.getTime()) return `Hôm nay ${hh}:${mi}`;
  if (day.getTime() === yesterday.getTime()) return `Hôm qua ${hh}:${mi}`;
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

const displayItems = computed<DisplayItem[]>(() => {
  const out: DisplayItem[] = [];
  let curAlbum: Extract<DisplayItem, { kind: 'album' }> | null = null;
  let lastDayKey = '';

  for (const msg of props.messages) {
    const d = new Date(msg.sentAt);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${Math.floor(d.getHours() / 4)}`;
    if (dayKey !== lastDayKey) {
      out.push({ kind: 'divider', key: 'div:' + dayKey, label: dayLabel(msg.sentAt) });
      lastDayKey = dayKey;
      curAlbum = null;
    }

    const canGroup = msg.contentType === 'image' && msg.albumKey && !msg.isDeleted && !!getImageUrl(msg);
    if (canGroup && curAlbum && curAlbum.key === `album:${msg.albumKey}:${msg.senderType}`) {
      curAlbum.messages.push(msg);
      continue;
    }
    curAlbum = null;
    if (canGroup) {
      curAlbum = {
        kind: 'album',
        key: `album:${msg.albumKey}:${msg.senderType}`,
        senderType: msg.senderType,
        senderName: msg.senderName,
        sentAt: msg.sentAt,
        totalExpected: msg.albumTotal ?? null,
        messages: [msg],
      };
      out.push(curAlbum);
    } else {
      out.push({ kind: 'single', key: msg.id, msg });
    }
  }
  for (const item of out) {
    if (item.kind === 'album') {
      item.messages.sort((a, b) => (a.albumIndex ?? 0) - (b.albumIndex ?? 0));
    }
  }
  return out;
});

function albumGridClass(count: number): string {
  if (count <= 1) return 'album-grid-1';
  if (count <= 4) return 'album-grid-2';
  return 'album-grid-3';
}

function onContextMenu(event: MouseEvent, msg: Message) {
  contextMsg.value = msg;
  contextArchiveMessageIds.value = [msg.id];
  contextPos.value = { x: event.clientX, y: event.clientY };
  showContextMenu.value = true;
}
function onAlbumContextMenu(event: MouseEvent, album: Extract<DisplayItem, { kind: 'album' }>) {
  const messageIds = album.messages.map((msg) => msg.id);
  contextMsg.value = album.messages[0] || null;
  contextArchiveMessageIds.value = messageIds;
  contextPos.value = { x: event.clientX, y: event.clientY };
  showContextMenu.value = true;
}
function startArchiveSelection() {
  const ids = contextArchiveMessageIds.value.length
    ? contextArchiveMessageIds.value
    : (contextMsg.value ? [contextMsg.value.id] : []);
  if (!ids.length) return;
  selectedArchiveMessageIds.value = new Set(ids);
}
function toggleArchiveMessage(msg: Message) {
  const next = new Set(selectedArchiveMessageIds.value);
  if (next.has(msg.id)) next.delete(msg.id);
  else next.add(msg.id);
  selectedArchiveMessageIds.value = next;
}
function isArchiveAlbumFullySelected(messages: Message[]) {
  return messages.length > 0 && messages.every((msg) => selectedArchiveMessageIds.value.has(msg.id));
}
function toggleArchiveAlbum(messages: Message[]) {
  if (!messages.length) return;
  const next = new Set(selectedArchiveMessageIds.value);
  const allSelected = messages.every((msg) => next.has(msg.id));
  for (const msg of messages) {
    if (allSelected) next.delete(msg.id);
    else next.add(msg.id);
  }
  selectedArchiveMessageIds.value = next;
}
function onAlbumImageClick(event: MouseEvent, message: Message, albumMessages: Message[]) {
  if (archiveSelectionMode.value) {
    event.preventDefault();
    event.stopPropagation();
    toggleArchiveAlbum(albumMessages);
    return;
  }
  const imageUrl = getImageUrl(message);
  if (!imageUrl) return;
  openImageLightbox(imageUrl, albumMessages.map((msg) => getImageUrl(msg)).filter(Boolean) as string[]);
}
function cancelArchiveSelection() {
  selectedArchiveMessageIds.value = new Set();
  archiveConflictMessageIds.value = new Set();
}
function onAlbumClick(event: MouseEvent, messages: Message[]) {
  if (!archiveSelectionMode.value) return;
  event.preventDefault();
  event.stopPropagation();
  toggleArchiveAlbum(messages);
}
function onMessageBubbleClick(event: MouseEvent, msg: Message) {
  if (archiveSelectionMode.value) {
    event.preventDefault();
    event.stopPropagation();
    toggleArchiveMessage(msg);
    return;
  }
  if (privacyVisibility.shouldBlurMessage(msg, props.conversation)) onMessageLockClick(event);
}
async function openArchiveSaveDialog() {
  if (!props.conversation || selectedArchiveMessageIds.value.size === 0) return;
  archiveDialogLoading.value = true;
  archiveConflictMessageIds.value = new Set();
  archiveConflicts.value = [];
  archiveTargetDuplicateCount.value = 0;
  try {
    const [contextResponse, storiesResponse] = await Promise.all([
      api.get('/archive/save-context', { params: { conversationId: props.conversation.id } }),
      api.get(`/archive/conversations/${props.conversation.id}/stories`),
      loadArchivePriorityOptions(),
    ]);
    archiveSaveContext.value = contextResponse.data;
    archiveStories.value = storiesResponse.data.stories || [];
    const pendingStory = archiveStories.value.find(canAppendToArchiveStory);
    archiveForm.value = {
      mode: pendingStory ? 'append' : 'create',
      storyId: pendingStory?.id || '',
      title: '',
      orderCode: '',
      priority: 'normal',
      extraNote: '',
      recordType: contextResponse.data.defaultRecordType || 'order',
      departmentId: contextResponse.data.defaultDepartment?.id
        || contextResponse.data.currentDepartment?.id
        || '',
      assignedUserId: contextResponse.data.defaultAssignedUser?.id
        || contextResponse.data.currentUser?.id
        || '',
    };
    archiveSaveDialog.value = true;
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể tải thông tin lưu hồ sơ');
  } finally {
    archiveDialogLoading.value = false;
  }
}

async function loadArchivePriorityOptions() {
  try {
    const { data } = await api.get('/archive/priority-options');
    const options = Array.isArray(data.options)
      ? data.options
        .filter((item: any) => item?.isActive !== false && item?.key && item?.label)
        .sort((left: any, right: any) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
        .map((item: any) => ({ label: String(item.label), value: String(item.key) }))
      : [];
    archivePriorityOptions.value = options.length ? options : [...defaultArchivePriorityOptions];
  } catch {
    archivePriorityOptions.value = [...defaultArchivePriorityOptions];
  }
}

async function preflightAndSaveArchive() {
  if (!props.conversation || archiveSaving.value) return;
  archiveSaving.value = true;
  try {
    const { data } = await api.post('/archive/stories/preflight', {
      conversationId: props.conversation.id,
      messageIds: [...selectedArchiveMessageIds.value],
      targetStoryId: archiveForm.value.mode === 'append' ? archiveForm.value.storyId : null,
    });
    archiveTargetDuplicateCount.value = data.targetDuplicates?.length || 0;
    archiveConflicts.value = data.crossStoryConflicts || [];
    archiveConflictMessageIds.value = new Set(
      archiveConflicts.value.map((conflict) => conflict.messageId),
    );
    if (archiveConflicts.value.length > 0) {
      archiveConflictDialog.value = true;
      return;
    }
    await persistArchiveSelection(false);
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể kiểm tra tin nhắn đã lưu');
  } finally {
    archiveSaving.value = false;
  }
}

async function persistArchiveSelection(allowCrossStoryDuplicates: boolean) {
  if (!props.conversation) return;
  archiveSaving.value = true;
  try {
    const payload = {
      messageIds: [...selectedArchiveMessageIds.value],
      allowCrossStoryDuplicates,
    };
    const response = archiveForm.value.mode === 'append'
      ? await api.post(`/archive/stories/${archiveForm.value.storyId}/messages`, payload)
      : await api.post('/archive/stories', {
        ...payload,
        conversationId: props.conversation.id,
        title: archiveForm.value.title,
        orderCode: archiveForm.value.orderCode,
        priority: archiveForm.value.priority,
        extraNote: archiveForm.value.extraNote,
        recordType: archiveForm.value.recordType,
        departmentId: archiveForm.value.departmentId || null,
        assignedUserId: archiveForm.value.assignedUserId || null,
      });
    const data = response.data;
    toast.success(data.message || `Đã lưu ${selectedArchiveMessageIds.value.size} tin nhắn`);
    if (data.story?.backupStatus === 'failed') {
      toast.warning(data.story.backupError || 'Đã lưu DB nhưng chưa backup được lên Google');
    }
    archiveSaveDialog.value = false;
    archiveConflictDialog.value = false;
    archiveConflictMessageIds.value = new Set();
    cancelArchiveSelection();
    emit('refresh-thread');
  } catch (error: any) {
    const data = error?.response?.data;
    if (data?.code === 'ARCHIVE_MESSAGE_CONFLICT') {
      archiveConflicts.value = data.crossStoryConflicts || [];
      archiveConflictMessageIds.value = new Set(
        archiveConflicts.value.map((conflict) => conflict.messageId),
      );
      archiveConflictDialog.value = true;
    } else {
      toast.error(data?.error || 'Không thể lưu nội dung');
    }
  } finally {
    archiveSaving.value = false;
  }
}

async function confirmArchiveConflicts() {
  await persistArchiveSelection(true);
}

async function reviewArchiveConflicts() {
  archiveConflictDialog.value = false;
  archiveSaveDialog.value = false;
  await nextTick();
  const firstId = archiveConflicts.value[0]?.messageId;
  const element = firstId
    ? messagesContainer.value?.querySelector(`[data-message-id="${CSS.escape(firstId)}"]`)
    : null;
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast.warning('Các tin đã thuộc hồ sơ khác được đánh dấu. Bỏ chọn tin không muốn lưu.');
}

function cancelArchiveFromConflict() {
  archiveConflictDialog.value = false;
  archiveSaveDialog.value = false;
  archiveConflictMessageIds.value = new Set();
  cancelArchiveSelection();
}

function shortMessageId(messageId: string) {
  return messageId.length > 12 ? `${messageId.slice(0, 8)}…` : messageId;
}

function onToggleReaction(msg: Message, emoji: string) {
  const existing = (msg.reactions || []).find((r) => r.emoji === emoji);
  if (existing?.reacted) {
    emit('remove-reaction', msg.id, emoji);
  } else {
    emit('add-reaction', msg.id, emoji);
  }
}
function onReply() { if (contextMsg.value) emit('set-reply-to', contextMsg.value); }
function focusReplyMessage(reply: ReplyMessageRef) {
  emit('focus-reply-message', reply);
}
function onEdit() {
  if (contextMsg.value) {
    emit('set-editing', contextMsg.value);
    inputText.value = contextMsg.value.content || '';
  }
}
function onDelete() { if (contextMsg.value) emit('delete-message', contextMsg.value.id); }
function onUndo() { if (contextMsg.value) emit('undo-message', contextMsg.value.id); }
function onPin() { emit('pin-conversation'); }


function onForward(targetIds: string[]) {
  if (contextMsg.value) emit('forward-message', contextMsg.value.id, targetIds);
  showForwardDialog.value = false;
}

function onCancelReplyEdit() {
  emit('cancel-reply-edit');
  if (props.editingMessage) inputText.value = '';
}

const showTemplatePopup = ref(false);
const templateQuery = ref('');
const templates = ref<TemplateItem[]>([]);

async function loadTemplates() {
  try {
    const res = await api.get<{ templates: TemplateItem[] }>('/automation/templates');
    templates.value = res.data.templates;
  } catch { }
}
onMounted(() => { loadTemplates(); });

function onInsertSuggestionEvent(e: Event) {
  const text = (e as CustomEvent<{ text: string }>).detail?.text;
  if (text) void applySuggestion(text);
}
onMounted(() => window.addEventListener('chat:insert-suggestion', onInsertSuggestionEvent));
onBeforeUnmount(() => window.removeEventListener('chat:insert-suggestion', onInsertSuggestionEvent));

function onTypingEvent() {
  emit('typing');
  const value = inputText.value;
  if (value === '/' || /\s\/$/.test(value)) {
    showTemplatePopup.value = true;
    templateQuery.value = '';
  } else if (showTemplatePopup.value) {
    const lastSlash = value.lastIndexOf('/');
    if (lastSlash === -1) showTemplatePopup.value = false;
    else templateQuery.value = value.slice(lastSlash + 1);
  }
}

function openTemplatePopup() {
  showTemplatePopup.value = true;
  templateQuery.value = '';
}

function onTemplateSelect(rendered: string) {
  const lastSlash = inputText.value.lastIndexOf('/');
  inputText.value = lastSlash >= 0 ? inputText.value.slice(0, lastSlash) + rendered : rendered;
  showTemplatePopup.value = false;
  templateQuery.value = '';
}

function handleSend() {
  if (showTemplatePopup.value) { showTemplatePopup.value = false; return; }
  if (!inputText.value.trim()) return;

  const rich = (editorRef.value as any)?.getRichPayload?.() || { text: inputText.value, styles: [] };
  const textToSend = rich.text || inputText.value;
  const styles = Array.isArray(rich.styles) && rich.styles.length > 0 ? rich.styles : undefined;

  if (props.editingMessage) {
    emit('edit-message', props.editingMessage.id, textToSend);
  } else {
    emit('send', textToSend, props.replyingTo?.id ?? null, styles);
  }
  inputText.value = '';
  editorRef.value?.clear();
  emit('cancel-reply-edit');
}

async function applySuggestion(text?: string) {
  const t = text || props.aiSuggestion;
  if (!t) return;
  inputText.value = t;
  await nextTick();
  setTimeout(() => editorRef.value?.focus('end'), 30);
}

function formatMessageTime(d: string) {
  return formatInOrgTz(d, undefined, { timeOnly: true });
}

function getImageUrl(msg: Message): string | null {
  if (msg.contentType === 'image' && msg.content) {
    if (msg.content.startsWith('http')) return resolveAttachmentUrl(msg.content);
    try {
      const p = JSON.parse(msg.content);
      const rawUrl = p.href || p.thumb || p.hdUrl || null;
      return rawUrl ? resolveAttachmentUrl(rawUrl) : null;
    } catch {}
  }
  if (msg.content?.startsWith('{')) {
    try {
      const p = JSON.parse(msg.content);
      const href = p.href || p.thumb || '';
      if (href && /\.(jpg|jpeg|png|webp|gif)/i.test(href)) return resolveAttachmentUrl(href);
      if (href && href.includes('zdn.vn') && !p.params?.includes('fileExt')) return resolveAttachmentUrl(href);
    } catch {}
  }
  return null;
}

let originFocusRequestId = 0;
const originFocusBlockUntil = ref(0);

function shouldSkipAutoBottom() {
  return Boolean(props.focusMessageId && Date.now() < originFocusBlockUntil.value);
}

function blockAutoBottomForOriginFocus() {
  originFocusBlockUntil.value = Date.now() + 2500;
}

function findThreadMessageElement(messageId: string) {
  return messagesContainer.value?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`) || null;
}

async function waitForThreadMessageElement(messageId: string, attempts = 12) {
  for (let index = 0; index < attempts; index += 1) {
    await nextTick();
    const element = findThreadMessageElement(messageId);
    if (element) return element;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return null;
}

function scrollElementToThreadCenter(element: HTMLElement) {
  const container = messagesContainer.value;
  if (!container) return;
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const top = container.scrollTop
    + elementRect.top
    - containerRect.top
    - (container.clientHeight / 2)
    + (element.clientHeight / 2);
  container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

async function focusOriginalThreadMessage() {
  const messageId = props.focusMessageId;
  if (!messageId) return;
  blockAutoBottomForOriginFocus();
  const requestId = ++originFocusRequestId;
  const element = await waitForThreadMessageElement(messageId, 16);
  if (!element || requestId !== originFocusRequestId) return;

  document.querySelectorAll('.msg-origin-highlight').forEach((node) => {
    node.classList.remove('msg-origin-highlight');
  });
  const highlightTarget = element.querySelector<HTMLElement>('.message-bubble') || element;
  scrollElementToThreadCenter(element);
  highlightTarget.classList.add('msg-origin-highlight');
  window.setTimeout(() => highlightTarget.classList.remove('msg-origin-highlight'), 3200);
}

watch(
  [() => props.focusMessageId, () => props.focusMessageToken, () => props.messages.length, () => props.conversation?.id],
  () => {
    if (props.focusMessageId) void focusOriginalThreadMessage();
  },
);

function scrollToBottom(immediate = false) {
  if (shouldSkipAutoBottom()) return;
  if (!messagesContainer.value) return;
  const el = messagesContainer.value;
  const scroll = () => {
    if (shouldSkipAutoBottom()) return;
    el.scrollTop = el.scrollHeight;
  };
  scroll();
  if (!immediate) {
    setTimeout(scroll, 100);
    setTimeout(scroll, 400);
    setTimeout(scroll, 1000);
  }
}

watch(() => props.messages.length, async () => {
  await nextTick();
  if (shouldSkipAutoBottom()) {
    void focusOriginalThreadMessage();
    return;
  }
  scrollToBottom();
});

watch(() => props.conversation?.id, async (newId) => {
  if (!newId) return;
  await nextTick();
  if (shouldSkipAutoBottom()) {
    void focusOriginalThreadMessage();
  } else {
    scrollToBottom();
  }
  if (typeof window !== 'undefined' && window.innerWidth >= 768) {
    setTimeout(() => editorRef.value?.focus(), 80);
  }
});

watch(() => props.aiSuggestion, (next, prev) => {
  if (next && next !== prev) {
    applySuggestion(next);
  }
});

watch(() => props.replyingTo?.id, async (id) => {
  if (id) {
    await nextTick();
    editorRef.value?.focus();
  }
});
watch(() => props.editingMessage?.id, async (id) => {
  if (id) {
    await nextTick();
    editorRef.value?.focus();
  }
});
</script>

<style scoped>
.message-thread {
  display: flex; flex-direction: column;
  height: 100%;
  background: var(--smax-grey-100);
  overflow: hidden;
  position: relative;
}
.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(248, 250, 252, 0.72);
  border: 2px dashed var(--smax-primary, #2962ff);
  pointer-events: none;
}
.drop-card {
  width: min(360px, calc(100% - 40px));
  padding: 18px 20px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 16px 38px rgba(15, 23, 42, 0.18);
  text-align: center;
}
.drop-title {
  margin-top: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--smax-text, #111827);
}
.drop-subtitle {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--smax-grey-700, #6b7280);
}

.msg-bubble-wrap { position: relative; }
.msg-bubble-wrap.msg-privacy-blurred { cursor: pointer; }
.msg-bubble-wrap.msg-archive-selected {
  border-radius: 14px;
  outline: 2px solid #2563eb;
  outline-offset: 3px;
  background: rgba(37, 99, 235, 0.08);
}
.msg-bubble-wrap.msg-archive-selected::before {
  content: '✓';
  position: absolute;
  z-index: 4;
  top: 50%;
  left: 8px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  transform: translateY(-50%);
  border-radius: 50%;
  color: white;
  background: #2563eb;
  font-weight: 800;
  box-shadow: 0 3px 10px rgba(37, 99, 235, 0.35);
}
.msg-bubble-wrap.msg-archive-conflict {
  outline: 3px solid #f59e0b;
  outline-offset: 3px;
  border-radius: 12px;
}
.msg-bubble-wrap.msg-archive-conflict::after {
  content: 'Đã thuộc hồ sơ khác';
  position: absolute;
  top: -22px;
  right: 4px;
  z-index: 4;
  padding: 2px 7px;
  border-radius: 999px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 10px;
  font-weight: 700;
}
.archive-conflict-list {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}
.archive-conflict-list > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  background: #fff7ed;
}
.archive-conflict-list span {
  color: #9a3412;
  font-size: 12px;
}

.archive-save-card {
  max-height: 90vh;
  overflow: hidden;
  border-radius: 10px !important;
  color: #111827;
}
.archive-save-header {
  padding: 22px 24px 18px;
  border-bottom: 1px solid #e5e7eb;
}
.archive-save-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0;
  color: #111827;
}
.archive-save-header p {
  margin: 8px 0 0;
  color: #6b7280;
  font-size: 16px;
  line-height: 1.35;
}
.archive-save-body {
  display: flex;
  max-height: calc(90vh - 154px);
  flex-direction: column;
  gap: 22px;
  padding: 26px 24px 28px !important;
  overflow-y: auto;
}
.archive-save-radios {
  margin: 0;
}
.archive-save-radios :deep(.v-selection-control-group) {
  gap: 26px;
}
.archive-save-radio :deep(.v-label) {
  color: #1f2937;
  font-size: 17px;
  font-weight: 500;
  opacity: 1;
}
.archive-save-fields {
  display: grid;
  gap: 20px;
}
.archive-save-field :deep(.v-field) {
  min-height: 54px;
  border-radius: 0;
  color: #111827;
  background: #fff;
}
.archive-save-select-field :deep(.v-field) {
  border-radius: 8px;
}
.archive-save-field :deep(.v-field__outline) {
  --v-field-border-opacity: 1;
  color: #1f2937;
}
.archive-save-field :deep(.v-field__input) {
  min-height: 52px;
  padding: 15px 16px 8px;
  color: #111827;
  font-size: 18px;
  line-height: 1.35;
}
.archive-save-field :deep(input::placeholder),
.archive-save-note :deep(textarea::placeholder) {
  color: #9ca3af;
  opacity: 1;
}
.archive-save-note :deep(.v-field) {
  min-height: 122px;
  border-radius: 8px;
}
.archive-save-note :deep(.v-field__input) {
  align-items: flex-start;
  min-height: 120px;
  padding-top: 18px;
}

/* KHÔNG DÙNG CSS HACK VUETIFY - Dùng HTML Wrapper nguyên bản */
.archive-save-field-wrap {
  position: relative;
}
.archive-save-field-wrap > label {
  position: absolute;
  z-index: 10;
  top: -8px;
  left: 12px;
  padding: 0 4px;
  background: #fff;
  color: #4b5563;
  font-size: 13px;
  line-height: 1;
  pointer-events: none;
}
.archive-save-field-wrap select {
  width: 100%;
  min-height: 54px;
  padding: 14px 44px 10px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  outline: none;
  appearance: none;
  background: #fff;
  color: #111827;
  font: inherit;
  font-size: 18px;
  line-height: 1.35;
}
.archive-save-field-wrap select:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 1px #2563eb;
}
.archive-save-field-wrap .v-icon {
  position: absolute;
  top: 50%;
  right: 16px;
  color: #6b7280;
  transform: translateY(-50%);
  pointer-events: none;
}

.archive-confirmation-setup {
  display: flex;
  min-height: 82px;
  padding: 14px 16px;
  align-items: center;
  gap: 14px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #eff6ff;
}
.archive-confirmation-setup > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.archive-confirmation-setup span {
  color: #6b7280;
  font-size: 14px;
  line-height: 1.2;
}
.archive-confirmation-setup strong {
  color: #111827;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}
.archive-save-footer {
  justify-content: flex-end;
  gap: 14px;
  padding: 18px 24px !important;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
}
.archive-save-close,
.archive-save-submit {
  min-width: 84px;
  min-height: 46px;
  border-radius: 7px !important;
  font-weight: 600;
  text-transform: none;
}
.archive-save-close {
  border-color: #d1d5db;
  background: #fff;
  color: #374151;
}
.archive-save-submit {
  background: #2563eb !important;
  color: #fff !important;
}

.archive-selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid #bfdbfe;
  border-bottom: 1px solid #bfdbfe;
  background: linear-gradient(90deg, #eff6ff 0%, #f8fafc 100%);
}
.archive-selection-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.archive-selection-copy strong {
  color: #1e3a8a;
  font-size: 13px;
}
.archive-selection-copy span {
  color: #64748b;
  font-size: 11px;
}
.archive-selection-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

.msg-privacy-blurred :deep(.text-content),
.msg-privacy-blurred :deep(.media-caption),
.msg-privacy-blurred :deep(.recall-body),
.msg-privacy-blurred :deep(.reply-text),
.msg-privacy-blurred :deep(.chat-image),
.msg-privacy-blurred :deep(.chat-video),
.msg-privacy-blurred :deep(.file-card),
.msg-privacy-blurred :deep(.sticker-img),
.msg-privacy-blurred :deep(.sticker-anim),
.msg-privacy-blurred :deep(.reminder-card) {
  filter: blur(8px) saturate(0.4);
  opacity: 0.75;
  user-select: none;
  transition: filter 0.2s ease;
}
.msg-privacy-blurred :deep(.msg-avatar) {
  filter: blur(6px);
  opacity: 0.8;
}
.msg-privacy-blurred:hover :deep(.text-content),
.msg-privacy-blurred:hover :deep(.media-caption),
.msg-privacy-blurred:hover :deep(.recall-body),
.msg-privacy-blurred:hover :deep(.chat-image),
.msg-privacy-blurred:hover :deep(.chat-video) {
  filter: blur(10px) saturate(0.3);
}

.msg-privacy-blurred :deep(.msg-row)::after {
  content: '🔒 Riêng tư';
  display: inline-flex;
  align-items: center;
  align-self: center;
  background: #fbe6dc;
  color: #7a2000;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 9999px;
  border: 1px solid rgba(170, 45, 0, 0.25);
  white-space: nowrap;
  letter-spacing: 0.2px;
  flex-shrink: 0;
  pointer-events: none;
  box-shadow: 0 1px 2px rgba(170, 45, 0, 0.08);
}
.msg-privacy-blurred :deep(.msg-row.self)::after { margin-right: 8px; }
.msg-privacy-blurred :deep(.msg-row):not(.self)::after { margin-left: 8px; }

.editor-wrap { position: relative; }
.editor-wrap.editor-locked .input-editor {
  filter: blur(3px) saturate(0.4);
  opacity: 0.4;
  pointer-events: none;
  user-select: none;
}
.editor-lock-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(2px);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 5;
}
.editor-lock-pill {
  background: white;
  color: #7a2000;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 18px;
  border-radius: 9999px;
  border: 1px solid rgba(170, 45, 0, 0.3);
  box-shadow: 0 2px 8px rgba(170, 45, 0, 0.15);
  white-space: nowrap;
}
.editor-lock-overlay:hover .editor-lock-pill {
  background: #aa2d00;
  color: white;
  border-color: #aa2d00;
}

.empty-state {
  display: flex; flex: 1;
  align-items: center; justify-content: center;
  flex-direction: column;
  color: var(--smax-grey-700);
}

.chat-header {
  background: var(--smax-bg);
  padding: 10px 17px;
  border-bottom: 1px solid var(--smax-grey-200);
  display: flex; align-items: center; gap: 13px;
  flex-shrink: 0;
}

.ch-info {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 5px;
}

.ch-row-1 {
  display: flex; align-items: center; gap: 8px;
  min-width: 0; 
  flex-wrap: nowrap; overflow: hidden;
}
.ch-name {
  font-weight: 600; font-size: 16px;
  color: var(--smax-text);
  min-width: 0; flex-shrink: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ch-sep {
  color: var(--smax-grey-300);
  font-weight: 300;
  user-select: none;
}

.ch-gender-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px 3px 5px;
  border-radius: 13px;
  font-size: 12px; font-weight: 500;
}
.ch-gender-chip .gender-svg {
  width: 16px; height: 16px;
  flex-shrink: 0;
}
.gender-female {
  background: rgba(233, 30, 99, 0.10);
  color: var(--smax-female, #e91e63);
}
.gender-male {
  background: rgba(30, 136, 229, 0.10);
  color: var(--smax-male, #1e88e5);
}
.gender-unknown {
  background: var(--smax-grey-100);
  color: var(--smax-grey-700);
}
.gender-unknown .gender-q { background: var(--smax-grey-700); }
.gender-group {
  background: rgba(13, 71, 161, 0.10);
  color: #0D47A1;
}

.ch-row-2 {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--smax-grey-700);
  flex-wrap: wrap;
}
.nick-name {
  font-weight: 500; color: var(--smax-text);
  max-width: 160px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.msg-counts {
  display: inline-flex; align-items: center; gap: 7px;
}
.msg-counts .cnt-in {
  color: #00897b; font-weight: 600;
}
.msg-counts .cnt-out {
  color: var(--smax-primary); font-weight: 600;
}
.msg-counts .cnt-scope {
  font-size: 9.5px;
  color: var(--smax-grey-700);
  background: var(--smax-grey-100);
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 4px;
  text-transform: uppercase;
  letter-spacing: 0.2px;
}
.last-online {
  display: inline-flex; align-items: center; gap: 4px;
}
.last-online .online-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--smax-grey-300);
  flex-shrink: 0;
}
.last-online.is-online .online-dot {
  background: var(--smax-success);
  box-shadow: 0 0 0 2px rgba(0, 200, 83, 0.15);
  animation: online-pulse 2s ease-in-out infinite;
}
@keyframes online-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(0, 200, 83, 0.15); }
  50%      { box-shadow: 0 0 0 4px rgba(0, 200, 83, 0.30); }
}

.status-pill {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 7px; border-radius: 9px;
  font-size: 10px; font-weight: 500;
}
.pill-success { background: rgba(0,200,83,0.12); color: #00897b; }

.ch-actions { display: flex; gap: 5px; align-items: center; }
.btn-action {
  padding: 6px 11px;
  border-radius: 7px;
  border: 1px solid;
  cursor: pointer;
  font-size: 12px; font-weight: 500;
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--smax-bg);
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s, box-shadow 0.12s, transform 0.08s;
}
.btn-action:hover:not(:disabled) {
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  transform: translateY(-0.5px);
}
.btn-friend-already {
  background: rgba(0,200,83,0.08);
  color: #00897b;
  border-color: rgba(0,200,83,0.25);
  cursor: default;
}
.btn-friend-already:hover {
  background: rgba(0,200,83,0.16);
  border-color: rgba(0,200,83,0.45);
}
.btn-friend-already:disabled { opacity: 1; }
.btn-pending {
  background: rgba(255,145,0,0.10);
  color: #ef6c00;
  border-color: rgba(255,145,0,0.35);
}
.btn-pending:hover {
  background: rgba(255,145,0,0.22);
  border-color: rgba(255,145,0,0.6);
}
.btn-accept-friend {
  background: rgba(251, 191, 36, 0.18);
  color: #B45309;
  border-color: rgba(251, 191, 36, 0.5);
  font-weight: 600;
}
.btn-accept-friend:hover {
  background: rgba(251, 191, 36, 0.34);
  border-color: #F59E0B;
  color: #92400E;
}
.btn-add-friend {
  background: var(--smax-primary-soft);
  color: var(--smax-primary);
  border-color: var(--smax-primary);
}
.btn-add-friend:hover {
  background: var(--smax-primary);
  color: white;
  border-color: var(--smax-primary);
}
.btn-cancel-invite {
  background: rgba(100, 116, 139, 0.10);
  color: #475569;
  border-color: rgba(100, 116, 139, 0.30);
  font-weight: 500;
}
.btn-cancel-invite:hover:not(:disabled) {
  background: rgba(100, 116, 139, 0.20);
  border-color: rgba(100, 116, 139, 0.55);
  color: #1e293b;
}
.btn-reject-invite {
  background: rgba(239, 68, 68, 0.10);
  color: #b91c1c;
  border-color: rgba(239, 68, 68, 0.35);
  font-weight: 500;
}
.btn-reject-invite:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.22);
  border-color: rgba(239, 68, 68, 0.6);
  color: #991b1b;
}
.friend-hover-group {
  display: inline-flex;
  gap: 5px;
  align-items: center;
}
.btn-remove-friend {
  background: rgba(239, 68, 68, 0.10);
  color: #b91c1c;
  border-color: rgba(239, 68, 68, 0.35);
  font-weight: 500;
  opacity: 0;
  max-width: 0;
  padding-left: 0;
  padding-right: 0;
  border-width: 0;
  overflow: hidden;
  transition: opacity 0.18s ease, max-width 0.22s ease, padding 0.18s ease, border-width 0.18s ease;
  white-space: nowrap;
}
.friend-hover-group:hover .btn-remove-friend,
.btn-remove-friend:focus-visible {
  opacity: 1;
  max-width: 140px;
  padding-left: 8px;
  padding-right: 8px;
  border-width: 1px;
}
.btn-remove-friend:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.22);
  border-color: rgba(239, 68, 68, 0.6);
  color: #991b1b;
}
.btn-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn-action .ic {
  font-size: 13px;
  line-height: 1;
}
.btn-action .sub-meta {
  font-size: 10px;
  opacity: 0.7;
  font-weight: 400;
  margin-left: 2px;
}
.btn-webhook {
  background: var(--smax-primary);
  color: white;
  border-color: var(--smax-primary);
}
.btn-webhook:hover:not(:disabled) { background: var(--smax-primary-hover); }
.btn-webhook:disabled { opacity: 0.5; cursor: not-allowed; }

.icon-btn {
  width: 33px; height: 33px;
  border-radius: 7px;
  background: transparent; border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  color: var(--smax-grey-700);
  font-size: 15px;
}
.icon-btn:hover { background: var(--smax-grey-100); }
.icon-btn.on {
  background: var(--smax-primary-soft);
  color: var(--smax-primary);
}

.messages {
  flex: 1; min-height: 0;
  overflow-y: auto; overflow-anchor: auto;
  overflow-x: hidden;
  padding: 14px 26px;
  display: flex; flex-direction: column; gap: 5px;
}
.msg-divider {
  text-align: center; margin: 13px 0 9px;
  color: var(--smax-grey-700); font-size: 11px;
}
.lightbox-wrap {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  min-height: 60vh;
  cursor: pointer;
}
.lightbox-img {
  max-width: 100%; max-height: 85vh;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  cursor: default;
}
.lightbox-nav {
  position: absolute;
  top: 50%; transform: translateY(-50%);
  width: 48px; height: 48px;
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  color: white;
  border: 0;
  font-size: 32px; font-weight: 300;
  line-height: 1;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;
  user-select: none;
}
.lightbox-nav:hover:not(:disabled) { background: rgba(0,0,0,0.78); }
.lightbox-nav:disabled { opacity: 0.25; cursor: not-allowed; }
.lightbox-prev { left: 16px; padding-right: 4px; }
.lightbox-next { right: 16px; padding-left: 4px; }
.lightbox-meta {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
  font-size: 12px; color: #aaa;
  background: rgba(0,0,0,0.45);
  padding: 4px 10px; border-radius: 12px;
  white-space: nowrap;
}
.msg-divider::before,
.msg-divider::after {
  content: ''; display: inline-block;
  width: 60px; height: 1px;
  background: var(--smax-grey-300);
  vertical-align: middle; margin: 0 9px;
}

.msg-system-event {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 10px auto;
  padding: 6px 14px;
  background: rgba(255, 152, 0, 0.08);
  border: 1px solid rgba(255, 152, 0, 0.18);
  border-radius: 20px;
  font-size: 12px;
  color: #ef6c00;
  max-width: 80%;
  width: fit-content;
}
.msg-system-event.reminder-notice .reminder-notice-time {
  color: var(--smax-grey-700);
  font-weight: 500;
}

.msg-album-wrap { display: flex; align-items: flex-start; gap: 7px; margin-bottom: 5px; }
.msg-album-wrap.self { flex-direction: row-reverse; }
.msg-album-wrap .msg-avatar { flex-shrink: 0; }
.msg-album-body { max-width: 60%; }
.msg-album-wrap.msg-archive-selected .bubble.album {
  outline: 2px solid rgba(37, 99, 235, 0.65);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}
.bubble.album {
  background: var(--smax-bg);
  border-radius: 13px;
  overflow: hidden;
  box-shadow: 0 1px 1px rgba(0,0,0,0.06);
}
.album-sender {
  font-size: 11.5px; color: var(--smax-primary);
  font-weight: 600;
  padding: 6px 10px 0;
  line-height: 1.2;
}
.album-grid { display: grid; gap: 3px; max-width: 420px; }
.album-grid-1 { grid-template-columns: 1fr; }
.album-grid-2 { grid-template-columns: 1fr 1fr; }
.album-grid-3 { grid-template-columns: 1fr 1fr 1fr; }
.album-tile {
  width: 100%; aspect-ratio: 1/1;
  object-fit: cover; cursor: pointer;
  transition: transform 0.2s;
}
.album-tile:hover { transform: scale(1.02); }
.album-progress { font-size: 10px; padding: 5px 9px; opacity: 0.7; }
.bubble-time {
  font-size: 11px; color: var(--smax-grey-700);
  padding: 5px 9px;
  text-align: right;
}

.input-area {
  background: var(--smax-bg);
  border-top: 1px solid var(--smax-grey-200);
  padding: 7px 13px 9px;
  flex-shrink: 0;
  flex-grow: 0;
  max-height: 45%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  --editor-max-h: calc(45dvh - 130px);
}
.input-area .input-row {
  flex: 1 1 auto;
  min-height: 0;
}
.input-toolbar-top {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-bottom: 6px;
  padding: 2px 0 6px;
  border-bottom: 1px solid var(--smax-grey-100);
  flex-wrap: wrap;
}
.toolbar-divider {
  width: 1px;
  height: 18px;
  background: var(--smax-grey-200, #ebedf0);
  margin: 0 4px;
  flex-shrink: 0;
}
.icon-tool {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  color: var(--smax-grey-700);
  background: transparent; border: none;
  font-family: inherit;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
.icon-tool:hover { background: var(--smax-grey-100); color: var(--smax-primary); }
.icon-tool:focus { outline: none; }
.icon-tool:focus-visible {
  outline: 2px solid var(--smax-primary-soft, #bbdefb);
  outline-offset: -1px;
}
.icon-tool.active {
  background: var(--smax-primary-soft, #e3f2fd);
  color: var(--smax-primary, #2962ff);
}
.icon-tool.spacer-after {
  border-right: 1px solid var(--smax-grey-200);
  margin-right: 4px; padding-right: 4px;
}
.icon-tool.ai-btn { color: #9c27b0; }

.input-row {
  display: flex; align-items: center; gap: 8px;
  position: relative;
}
.editor-wrap {
  flex: 1; min-width: 0;
  position: relative;
}
.input-editor { width: 100%; }

.nick-avatar-halo {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  padding: 3px;
  background: conic-gradient(
    from var(--halo-angle, 0deg),
    #ef6c00 0%,
    #c62828 25%,
    #f9a825 50%,
    #ef6c00 75%,
    #c62828 100%
  );
  animation: haloSpin 3s linear infinite;
  cursor: help;
  transition: filter 0.18s;
}
.nick-avatar-halo:hover {
  filter: brightness(1.12) saturate(1.2);
  animation-duration: 1.8s;
}
.nick-avatar-halo .sender-nick-avatar {
  display: block;
  border: 2px solid var(--smax-bg, #fff);
  border-radius: 50%;
}
@property --halo-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
@supports not (background: conic-gradient(from 0deg, red, blue)) {
  .nick-avatar-halo {
    animation: haloRotate 3s linear infinite;
  }
  @keyframes haloRotate {
    to { transform: rotate(360deg); }
  }
}

.send-btn {
  background: var(--smax-primary);
  color: white;
  width: 40px; height: 40px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  margin-bottom: 1px;
}
.send-btn:hover:not(:disabled) { background: var(--smax-primary-hover); }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; background: var(--smax-grey-300); }

.input-row :deep(.emoji-trigger) {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent;
  font-size: 22px;
  cursor: pointer;
  border-radius: 50%;
  margin-bottom: 3px;
  flex-shrink: 0;
}
.input-row :deep(.emoji-trigger:hover) {
  background: var(--smax-grey-100);
}

.zlbl-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--smax-grey-100, #f5f6fa);
  border: 1px solid var(--smax-grey-200, #ebedf0);
  border-radius: 11px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  cursor: pointer;
  color: var(--smax-grey-700);
  transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
  max-width: 180px;
}
.zlbl-trigger:hover {
  background: var(--smax-primary-soft, #e3f2fd);
  border-color: var(--smax-primary, #2962ff);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.zlbl-icon { font-size: 12px; flex-shrink: 0; }
.zlbl-current-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zlbl-empty { font-style: italic; color: var(--smax-grey-500); }
.zlbl-caret { font-size: 9px; opacity: 0.6; flex-shrink: 0; }

.zlbl-dropdown.zalo-native {
  min-width: 280px;
  max-width: 320px;
  max-height: 480px;
  overflow-y: auto;
  background: #fff;
  padding: 6px 0;
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.15);
}
.zlbl-loading,
.zlbl-empty-state {
  padding: 16px;
  text-align: center;
  font-size: 13px;
  color: var(--smax-grey-500);
}
.zlbl-empty-state { font-style: italic; }
.zlbl-inline-sync {
  margin-top: 8px;
  background: var(--smax-primary-soft, #e3f2fd);
  color: var(--smax-primary, #2962ff);
  border: none;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 7px;
  cursor: pointer;
}
.zlbl-inline-sync:hover { filter: brightness(0.95); }

.zlbl-options {
  display: flex;
  flex-direction: column;
}
.zlbl-option {
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: none;
  padding: 9px 14px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  width: 100%;
  text-align: left;
  transition: background 0.1s;
}
.zlbl-option:hover { background: var(--smax-grey-50, #f5f6fa); }
.zlbl-option.active { background: rgba(33, 150, 243, 0.06); }
.zlbl-option.busy { opacity: 0.5; cursor: progress; }
.zlbl-option:disabled { cursor: not-allowed; }
.zlbl-flag {
  font-size: 16px;
  width: 18px;
  flex-shrink: 0;
  line-height: 1;
}
.zlbl-name {
  flex: 1;
  color: var(--smax-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zlbl-option.active .zlbl-name { font-weight: 600; }
.zlbl-check {
  color: var(--smax-primary, #2962ff);
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.zlbl-divider {
  height: 1px;
  background: var(--smax-grey-100);
  margin: 4px 0;
}
.zlbl-manage {
  width: 100%;
  background: transparent;
  border: none;
  padding: 10px 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--smax-grey-700);
  font-family: inherit;
  text-align: left;
  transition: background 0.1s;
}
.zlbl-manage:hover { background: var(--smax-grey-50); color: var(--smax-primary); }
.manage-icon { font-size: 14px; }
</style>