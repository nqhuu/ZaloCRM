<template>
  <div class="customer-detail-page">
    <header class="detail-head">
      <button class="ghost-btn" type="button" @click="router.push('/customers')">
        <v-icon size="18">mdi-arrow-left</v-icon>
        Danh sách
      </button>
      <button class="ghost-btn" type="button" :disabled="loading" @click="loadProfile">
        <v-icon size="18">mdi-refresh</v-icon>
      </button>
    </header>

    <section v-if="loading" class="panel empty-state">Đang tải hồ sơ khách hàng...</section>
    <section v-else-if="error" class="panel error-state">{{ error }}</section>

    <template v-else-if="profile">
      <section class="profile-hero">
        <div>
          <span class="mono">{{ profile.code || profile.externalKey }}</span>
          <h1>{{ profile.name }}</h1>
          <p>{{ [profile.shortName, profile.provinceOrRegion].filter(Boolean).join(' · ') || 'Hồ sơ khách hàng' }}</p>
        </div>
        <div class="hero-stats">
          <span><strong>{{ profile._count?.zaloGroups ?? 0 }}</strong> nhóm Zalo</span>
          <span><strong>{{ profile._count?.zaloUsers ?? 0 }}</strong> user Zalo</span>
          <span><strong>{{ profile._count?.contacts ?? 0 }}</strong> liên hệ</span>
          <span><strong>{{ profile._count?.archiveStories ?? 0 }}</strong> hồ sơ lưu</span>
        </div>
      </section>

      <nav class="detail-tabs">
        <button v-for="tab in tabs" :key="tab.key" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
          <v-icon size="17">{{ tab.icon }}</v-icon>
          {{ tab.label }}
        </button>
      </nav>

      <section v-if="activeTab === 'overview'" class="panel">
        <header class="panel-head">
          <h2>Tổng quan</h2>
          <span :class="['status-pill', profile.missingFromSource ? 'warn' : 'ok']">
            {{ profile.missingFromSource ? 'Thiếu trên Sheet' : 'Đang theo dõi' }}
          </span>
        </header>
        <div class="overview-strip">
          <div>
            <span>Mã KH</span>
            <strong class="mono">{{ profile.code || profile.externalKey }}</strong>
          </div>
          <div>
            <span>Số liên hệ</span>
            <strong>{{ profile.mainPhone || profile.phone || '—' }}</strong>
          </div>
          <div>
            <span>Phụ trách</span>
            <strong>{{ profile.ownerUser?.fullName || profile.salesOwnerCodeSnapshot || '—' }}</strong>
          </div>
          <div>
            <span>Nguồn</span>
            <strong>{{ profile.sourceDataSource?.name || profile.source || 'CRM' }}</strong>
          </div>
        </div>
        <div class="info-grid">
          <InfoItem label="Mã khách hàng" :value="profile.code || profile.externalKey" mono />
          <InfoItem label="Tên viết tắt" :value="profile.shortName" />
          <InfoItem label="MST / ĐT" :value="profile.taxCode || profile.mainPhone || profile.phone" />
          <InfoItem label="Website" :value="profile.website" />
          <InfoItem label="Địa phương" :value="profile.provinceOrRegion" />
          <InfoItem label="Văn phòng giao dịch" :value="profile.officeAddress" />
          <InfoItem label="Địa chỉ giao/nhận" :value="profile.shippingAddress" />
          <InfoItem label="Đại diện pháp luật" :value="profile.legalRepresentativeRaw" />
          <InfoItem label="Ngày hoạt động" :value="formatDate(profile.activeSince)" />
          <InfoItem label="Ngày giao dịch đầu tiên" :value="formatDate(profile.firstTransactionDate)" />
          <InfoItem label="NVKD phụ trách" :value="profile.ownerUser?.fullName || profile.salesOwnerCodeSnapshot" />
          <InfoItem label="Bộ phận quản lý" :value="profile.managingDepartment?.name || profile.managingDepartmentCodeSnapshot" />
          <InfoItem label="Loại hình" :value="profile.customerType?.code || profile.customerTypeCodeSnapshot" />
          <InfoItem label="Cập nhật Sheet" :value="formatDate(profile.syncedAt)" />
        </div>
      </section>

      <section v-else-if="activeTab === 'zalo'" class="panel">
        <header class="panel-head">
          <div>
            <h2>Zalo</h2>
            <p class="panel-subtitle">
              Kênh liên lạc gắn với hồ sơ. Nhóm Zalo là ngữ cảnh trao đổi, User Zalo là người trực tiếp. Bấm chi tiết khi cần xem globalId, nick chạm và logic liên quan.
            </p>
          </div>
          <span>{{ (profile.zaloGroups?.length ?? 0) + (profile.zaloUsers?.length ?? 0) }} liên kết</span>
        </header>
        <div class="split-grid">
          <div>
            <div class="zalo-section-head">
              <div>
                <h3>Nhóm Zalo</h3>
                <p>Gán group chung của khách hàng. “Từ 2 nick” chỉ là bộ lọc nhóm có nhiều nick CRM cùng tham gia.</p>
              </div>
              <span class="count-pill">{{ profile.zaloGroups?.length || 0 }}</span>
            </div>
            <div class="user-link-tools zalo-link-tools">
              <div class="search-row compact zalo-search-row group-search-row">
                <input
                  v-model.trim="groupSearchQuery"
                  type="search"
                  placeholder="Tên nhóm, globalId..."
                  @keydown.enter.prevent="searchGroups"
                />
                <select v-model="groupLinkStatus">
                  <option value="">Tất cả nhóm</option>
                  <option value="unlinked">Chưa gắn hồ sơ</option>
                  <option value="linked">Đã gắn hồ sơ</option>
                </select>
                <label class="inline-check compact-inline-check">
                  <input v-model="groupSharedOnly" type="checkbox" />
                  Từ 2 nick
                </label>
                <button class="ghost-btn" type="button" :disabled="groupSearchLoading" @click="searchGroups">
                  <v-icon size="17">mdi-magnify</v-icon>
                  Tìm nhóm
                </button>
              </div>
              <div class="tool-feedback">
                <p v-if="groupActionError" class="inline-error">{{ groupActionError }}</p>
                <p v-else-if="groupActionMessage" class="inline-success">{{ groupActionMessage }}</p>
              </div>
              <div v-if="groupSearchLoading" class="empty-state">Đang tìm nhóm Zalo...</div>
              <div v-else-if="groupSearchResults.length" class="group-result-list">
                <article v-for="group in groupSearchResults" :key="group.id" class="group-result">
                  <div>
                    <strong>{{ group.name || 'Nhóm chưa đặt tên' }}</strong>
                    <span class="mono">{{ group.globalId }}</span>
                    <span>{{ groupAccountsText(group) }}</span>
                    <span v-if="group.customerLink?.customerProfile" class="linked-note">
                      Đang thuộc: {{ group.customerLink.customerProfile.code || group.customerLink.customerProfile.externalKey }}
                      · {{ group.customerLink.customerProfile.name }}
                    </span>
                  </div>
                  <button
                    class="primary-btn"
                    type="button"
                    :disabled="linkingGroupId === group.id || isGroupLinkedToCurrentProfile(group)"
                    @click="linkGroup(group)"
                  >
                    <v-icon size="16">mdi-link-variant-plus</v-icon>
                    {{ isGroupLinkedToCurrentProfile(group) ? 'Đã gắn' : group.customerLink ? 'Chuyển về hồ sơ này' : 'Gắn nhóm' }}
                  </button>
                </article>
              </div>
              <div v-else-if="groupSearchTouched" class="empty-state">Không tìm thấy nhóm Zalo phù hợp.</div>
            </div>
            <div v-if="profile.zaloGroups?.length" class="item-list">
              <article v-for="link in profile.zaloGroups" :key="link.id" class="link-item zalo-card">
                <div>
                  <strong>{{ link.nativeGroup?.name || 'Nhóm chưa đặt tên' }}</strong>
                </div>
                <span class="zalo-card-side-info">{{ groupSummaryText(link.nativeGroup) }}</span>
                <div class="zalo-card-actions">
                  <button class="ghost-btn compact-action" type="button" @click="toggleZaloDetail(`group:${link.id}`)">
                    <v-icon size="15">mdi-information-outline</v-icon>
                    {{ isZaloDetailOpen(`group:${link.id}`) ? 'Ẩn chi tiết' : 'Chi tiết' }}
                  </button>
                </div>
                <div v-if="isZaloDetailOpen(`group:${link.id}`)" class="zalo-detail-grid">
                  <span><b>GlobalId</b>{{ link.nativeGroup?.globalId || '—' }}</span>
                  <span><b>Nick tham gia</b>{{ groupAccountsText(link.nativeGroup) }}</span>
                  <span><b>Logic</b>Mỗi group chỉ thuộc 1 hồ sơ khách hàng; globalId dùng để gom nhóm chung giữa nhiều nick Zalo.</span>
                </div>
                <button
                  class="danger-btn"
                  type="button"
                  :disabled="unlinkingGroupId === link.nativeGroup?.id"
                  @click="link.nativeGroup?.id && unlinkGroup(link.nativeGroup.id)"
                >
                  <v-icon size="16">mdi-link-variant-off</v-icon>
                  Gỡ
                </button>
              </article>
            </div>
            <div v-else class="empty-state">Chưa gán nhóm Zalo.</div>
          </div>
          <div>
            <div class="zalo-section-head">
              <div>
                <h3>User Zalo</h3>
                <p>Gán nick Zalo cá nhân. Nếu có SĐT hợp lệ, CRM tự đối chiếu sang Người liên hệ.</p>
              </div>
              <span class="count-pill">{{ profile.zaloUsers?.length || 0 }}</span>
            </div>
            <div class="user-link-tools zalo-link-tools">
              <div class="search-row compact zalo-search-row user-search-row">
                <input
                  v-model.trim="userSearchQuery"
                  type="search"
                  placeholder="Tên, SĐT, Zalo username, globalId..."
                  @keydown.enter.prevent="searchZaloUsers"
                />
                <select v-model="userLinkStatus">
                  <option value="">Tất cả user</option>
                  <option value="unlinked">Chưa gắn hồ sơ</option>
                  <option value="linked">Đã gắn hồ sơ</option>
                </select>
                <button class="ghost-btn" type="button" :disabled="userSearchLoading" @click="searchZaloUsers">
                  <v-icon size="17">mdi-account-search-outline</v-icon>
                  Tìm user
                </button>
              </div>
              <div class="tool-feedback">
                <p v-if="userActionError" class="inline-error">{{ userActionError }}</p>
                <p v-else-if="userActionMessage" class="inline-success">{{ userActionMessage }}</p>
              </div>
              <div v-if="userSearchLoading" class="empty-state">Đang tìm user Zalo...</div>
              <div v-else-if="userSearchResults.length" class="group-result-list">
                <article v-for="contact in userSearchResults" :key="contact.id" class="group-result">
                  <div>
                    <strong>{{ contactZaloDisplayName(contact) }}</strong>
                    <span>{{ userZaloIdentityLine(contact) }}</span>
                    <span>Liên hệ CRM: {{ contactName(contact) }}</span>
                    <span class="mono">{{ contact.zaloGlobalId || '—' }}</span>
                    <span>{{ contactAccountsText(contact) }}</span>
                    <span v-if="contactZaloNickCount(contact) > 1" class="multi-note">
                      {{ contactZaloNickCount(contact) }} nick cùng có quan hệ với user này; CRM gắn theo globalId chung.
                    </span>
                    <span v-if="contact.customerProfileLink?.customerProfile" class="linked-note">
                      Đang thuộc: {{ contact.customerProfileLink.customerProfile.code || contact.customerProfileLink.customerProfile.externalKey }}
                      · {{ contact.customerProfileLink.customerProfile.name }}
                    </span>
                  </div>
                  <button
                    class="primary-btn"
                    type="button"
                    :disabled="linkingUserId === contact.id || isUserLinkedToCurrentProfile(contact)"
                    @click="linkZaloUser(contact)"
                  >
                    <v-icon size="16">mdi-account-plus-outline</v-icon>
                    {{ isUserLinkedToCurrentProfile(contact) ? 'Đã gắn' : contact.customerProfileLink ? 'Chuyển về hồ sơ này' : 'Gắn user' }}
                  </button>
                </article>
              </div>
              <div v-else-if="userSearchTouched" class="empty-state">Không tìm thấy user Zalo phù hợp.</div>
            </div>
            <div v-if="profile.zaloUsers?.length" class="item-list">
              <article v-for="link in profile.zaloUsers" :key="link.id" class="link-item zalo-card">
                <div>
                  <strong>{{ link.zaloDisplayNameSnapshot || contactZaloDisplayName(link.contact) }}</strong>
                </div>
                <span class="zalo-card-side-info">{{ userZaloLinkContactText(link) }}</span>
                <div class="zalo-card-actions">
                  <button class="ghost-btn compact-action" type="button" @click="toggleZaloDetail(`user:${link.id}`)">
                    <v-icon size="15">mdi-information-outline</v-icon>
                    {{ isZaloDetailOpen(`user:${link.id}`) ? 'Ẩn chi tiết' : 'Chi tiết' }}
                  </button>
                </div>
                <div v-if="isZaloDetailOpen(`user:${link.id}`)" class="zalo-detail-grid">
                  <span><b>SĐT / username</b>{{ userZaloLinkIdentityLine(link) }}</span>
                  <span><b>GlobalId</b>{{ link.zaloGlobalIdSnapshot || link.contact?.zaloGlobalId || '—' }}</span>
                  <span><b>Logic</b>{{ userZaloLinkLogicText(link.contact) }}</span>
                </div>
                <button
                  class="danger-btn"
                  type="button"
                  :disabled="unlinkingUserId === link.contact?.id"
                  @click="link.contact?.id && unlinkZaloUser(link.contact.id)"
                >
                  <v-icon size="16">mdi-account-remove-outline</v-icon>
                  Gỡ
                </button>
              </article>
            </div>
            <div v-else class="empty-state">Chưa gán user Zalo.</div>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'contacts'" class="panel">
        <header class="panel-head">
          <h2>Người liên hệ</h2>
          <span>{{ profile.contacts?.length ?? 0 }} liên hệ</span>
        </header>
        <div class="contact-workspace">
          <section class="contact-panel contact-create-tools">
            <div class="tool-head compact-head">
              <div>
                <h3>Thêm người liên hệ</h3>
                <p>Nhập số điện thoại để CRM đối chiếu Contact/Zalo friend hiện có. Bước này không lọc theo nhóm Zalo.</p>
              </div>
            </div>
            <div class="contact-create-grid">
              <input v-model.trim="contactCreateForm.fullName" type="text" placeholder="Họ tên *" required />
              <input v-model.trim="contactCreateForm.phone" type="tel" placeholder="Số điện thoại *" required @blur="lookupContactPhone" />
              <input v-model.trim="contactCreateForm.title" type="text" placeholder="Chức danh" />
              <input v-model.trim="contactCreateForm.department" type="text" placeholder="Bộ phận" />
              <input v-model.trim="contactCreateForm.email" type="email" placeholder="Email" />
              <input v-model="contactCreateForm.birthDate" type="date" />
              <input v-model.trim="contactCreateForm.notes" type="text" placeholder="Ghi chú" />
              <label class="inline-check compact-check">
                <input v-model="contactCreateForm.isPrimary" type="checkbox" />
                Liên hệ chính
              </label>
            </div>
            <div class="contact-action-row">
              <button class="ghost-btn" type="button" :disabled="phoneLookupLoading || !contactCreateForm.phone" @click="lookupContactPhone">
                <v-icon size="17">mdi-phone-search-outline</v-icon>
                Kiểm tra Zalo
              </button>
              <button class="primary-btn" type="button" :disabled="creatingContact" @click="createProfileContact">
                <v-icon size="16">mdi-account-plus-outline</v-icon>
                Lưu và gắn hồ sơ
              </button>
            </div>
            <div v-if="phoneLookupLoading" class="empty-state compact-empty">Đang kiểm tra số điện thoại...</div>
            <p v-if="phoneLookupError" class="inline-error">{{ phoneLookupError }}</p>
            <p v-if="contactActionError" class="inline-error">{{ contactActionError }}</p>
            <p v-if="contactActionMessage" class="inline-success">{{ contactActionMessage }}</p>
            <div v-if="phoneLookup" class="phone-lookup-card">
              <div>
                <strong>{{ phoneLookupStatusText(phoneLookup) }}</strong>
                <span class="mono">{{ phoneLookup.normalizedPhone }}</span>
              </div>
              <span>{{ phoneLookupFriendText(phoneLookup) }}</span>
              <span v-if="phoneLookup.contacts.length" class="linked-note">
                Tìm thấy {{ phoneLookup.contacts.length }} Contact trùng số. Khi lưu, CRM sẽ dùng lại Contact có sẵn để tránh tạo trùng.
              </span>
              <span class="muted-note">{{ phoneLookup.note }}</span>
            </div>
          </section>
          <details class="contact-panel contact-existing-panel">
            <summary>
              <div>
                <strong>Gắn contact có sẵn</strong>
                <small>Dùng khi người liên hệ đã tồn tại trong CRM/Zalo để tránh tạo trùng.</small>
              </div>
              <v-icon size="18">mdi-chevron-down</v-icon>
            </summary>
            <div class="search-row compact existing-search-row">
              <input
                v-model.trim="contactSearchQuery"
                type="search"
                placeholder="Tên, SĐT, email, username, globalId..."
                @keydown.enter.prevent="searchContactOptions"
              />
              <button class="ghost-btn" type="button" :disabled="contactSearchLoading" @click="searchContactOptions">
                <v-icon size="17">mdi-card-search-outline</v-icon>
                Tìm contact
              </button>
            </div>
            <div v-if="contactSearchLoading" class="empty-state compact-empty">Đang tìm contact...</div>
            <div v-else-if="contactSearchResults.length" class="group-result-list">
              <article
                v-for="contact in contactSearchResults"
                :key="contact.id"
                :class="['group-result', { selected: selectedContactId === contact.id }]"
              >
                <div>
                  <strong>{{ contactName(contact) }}</strong>
                  <span>{{ [contact.phone, contact.email, contact.zaloUsername].filter(Boolean).join(' · ') || 'Chưa có thông tin liên hệ' }}</span>
                  <span>{{ contactCustomerContextsText(contact) }}</span>
                  <span v-if="contact.zaloGlobalId" class="mono">{{ contact.zaloGlobalId }}</span>
                  <span v-if="contactAccountsText(contact)">{{ contactAccountsText(contact) }}</span>
                </div>
                <button class="ghost-btn" type="button" @click="selectContactOption(contact)">
                  <v-icon size="16">mdi-check</v-icon>
                  Chọn
                </button>
              </article>
            </div>
            <div v-else-if="contactSearchTouched" class="empty-state compact-empty">Không tìm thấy contact phù hợp.</div>

            <div v-if="selectedContact" class="contact-link-form">
              <div class="selected-contact">
                <span>Contact đã chọn</span>
                <strong>{{ contactName(selectedContact) }}</strong>
              </div>
              <input v-model.trim="contactForm.title" type="text" placeholder="Chức danh" />
              <input v-model.trim="contactForm.department" type="text" placeholder="Bộ phận" />
              <input v-model.trim="contactForm.rawText" type="text" placeholder="Ghi chú quan hệ" />
              <label class="inline-check">
                <input v-model="contactForm.isPrimary" type="checkbox" />
                Đặt làm liên hệ chính
              </label>
              <button class="primary-btn" type="button" :disabled="linkingContactId === selectedContact.id" @click="linkProfileContact">
                <v-icon size="16">mdi-account-link-outline</v-icon>
                Gắn contact
              </button>
            </div>
          </details>
          <div v-if="profile.contacts?.length" class="contact-table-wrap">
            <table class="contact-table">
              <thead>
                <tr>
                  <th>Người liên hệ</th>
                  <th>Số điện thoại</th>
                  <th>Email</th>
                  <th>Ngày sinh</th>
                  <th>Chức danh</th>
                  <th>Bộ phận</th>
                  <th>Zalo kết bạn</th>
                  <th>Liên hệ chính</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="link in profile.contacts" :key="link.id">
                  <td>
                    <strong>{{ contactName(link.contact) }}</strong>
                    <span class="contact-zalo-nick">{{ contactZaloPhoneNickText(link.contact) }}</span>
                    <span>{{ link.contact?.notes || '' }}</span>
                  </td>
                  <td>{{ link.contact?.phone || '—' }}</td>
                  <td>{{ link.contact?.email || '—' }}</td>
                  <td>{{ formatDateOnly(link.contact?.birthDate) }}</td>
                  <td>{{ link.title || '—' }}</td>
                  <td>{{ link.department || '—' }}</td>
                  <td>
                    <div class="accepted-zalo-cell">
                      <span class="compact-zalo-text strong-zalo-text">{{ contactAcceptedZaloText(link.contact) }}</span>
                      <button
                        v-if="contactAcceptedZaloCount(link.contact) > 1"
                        class="inline-detail-btn"
                        type="button"
                        @click="openAcceptedZaloPicker(link)"
                      >
                        Các nick khác
                      </button>
                    </div>
                  </td>
                  <td>
                    <span v-if="link.isPrimary" class="status-pill ok">Chính</span>
                    <button
                      v-else
                      class="icon-text-btn primary-link-btn"
                      type="button"
                      title="Đặt người này làm liên hệ chính của hồ sơ"
                      :disabled="updatingContactId === link.contact?.id"
                      @click="setPrimaryContact(link)"
                    >
                      <v-icon size="15">mdi-star-outline</v-icon>
                      Đặt làm chính
                    </button>
                  </td>
                  <td class="row-actions">
                    <button class="ghost-btn compact-action" type="button" :disabled="updatingContactId === link.contact?.id" @click="openContactEdit(link)">
                      <v-icon size="15">mdi-pencil-outline</v-icon>
                      Sửa
                    </button>
                    <button
                      class="danger-btn compact-danger"
                      type="button"
                      title="Xóa liên hệ khỏi hồ sơ này"
                      :disabled="unlinkingContactId === link.contact?.id"
                      @click="link.contact?.id && unlinkProfileContact(link.contact.id)"
                    >
                      <v-icon size="15">mdi-link-variant-off</v-icon>
                      Xóa
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="empty-state compact-empty">Chưa có người liên hệ được gắn vào hồ sơ.</div>
        </div>
      </section>

      <section v-else-if="activeTab === 'archive'" class="panel">
        <header class="panel-head archive-head">
          <div>
            <h2>Hồ sơ lưu</h2>
            <p class="panel-subtitle">Các hồ sơ/đơn hàng đã gắn với khách hàng này, giữ theo customer context tại thời điểm lưu.</p>
          </div>
          <span>{{ archiveTotal }} hồ sơ</span>
        </header>
        <div class="archive-toolbar">
          <input
            v-model.trim="archiveSearchQuery"
            type="search"
            placeholder="Tìm tiêu đề, mã đơn, nội dung..."
            @keydown.enter.prevent="reloadArchiveStories"
          />
          <select v-model="archiveStatusFilter" @change="reloadArchiveStories">
            <option value="">Tất cả trạng thái</option>
            <option value="pending">Đang xử lý</option>
            <option value="completed">Hoàn thành</option>
            <option value="cancelled">Đã hủy</option>
          </select>
          <select v-model="archiveRecordTypeFilter" @change="reloadArchiveStories">
            <option value="">Tất cả loại hồ sơ</option>
            <option value="order">Đơn hàng</option>
            <option value="quote">Báo giá</option>
            <option value="support">Hỗ trợ</option>
            <option value="other">Khác</option>
          </select>
          <button class="ghost-btn" type="button" :disabled="archiveLoading" @click="reloadArchiveStories">
            <v-icon size="17">mdi-magnify</v-icon>
            Lọc
          </button>
        </div>
        <p v-if="archiveError" class="inline-error">{{ archiveError }}</p>
        <div v-if="archiveLoading" class="empty-state">Đang tải hồ sơ lưu...</div>
        <div v-else-if="archiveStories.length" class="archive-table-wrap">
          <table class="archive-table">
            <thead>
              <tr>
                <th>Hồ sơ</th>
                <th>Loại</th>
                <th>Trạng thái</th>
                <th>Ưu tiên</th>
                <th>Nguồn hội thoại</th>
                <th>Cập nhật</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="story in archiveStories" :key="story.id">
                <td>
                  <strong>{{ story.title || story.orderCode || story.conversationName }}</strong>
                  <span v-if="story.orderCode">Mã đơn: {{ story.orderCode }}</span>
                  <span>{{ archiveCustomerSnapshotText(story) }}</span>
                </td>
                <td>{{ archiveRecordTypeLabel(story.recordType) }}</td>
                <td>
                  <span class="status-pill">{{ archiveStatusLabel(story) }}</span>
                </td>
                <td>{{ archivePriorityLabel(story.priority) }}</td>
                <td>{{ story.conversationName || '—' }}</td>
                <td>{{ formatDate(story.updatedAt || story.createdAt) }}</td>
                <td class="row-actions">
                  <button class="ghost-btn compact-action" type="button" @click="openArchiveStory(story.id)">
                    <v-icon size="15">mdi-eye-outline</v-icon>
                    Xem
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <footer class="archive-pager">
            <button class="ghost-btn compact-action" type="button" :disabled="archivePage <= 1 || archiveLoading" @click="changeArchivePage(archivePage - 1)">
              <v-icon size="15">mdi-chevron-left</v-icon>
              Trước
            </button>
            <span>Trang {{ archivePage }} / {{ archiveTotalPages }}</span>
            <button class="ghost-btn compact-action" type="button" :disabled="archivePage >= archiveTotalPages || archiveLoading" @click="changeArchivePage(archivePage + 1)">
              Sau
              <v-icon size="15">mdi-chevron-right</v-icon>
            </button>
          </footer>
        </div>
        <div v-else class="empty-state">Chưa có hồ sơ lưu liên quan.</div>
      </section>

      <section v-else class="panel">
        <header class="panel-head">
          <div>
            <h2>Nguồn Sheet</h2>
            <p class="panel-subtitle">
              Đối chiếu hồ sơ này với dòng nguồn Google Sheet: nguồn nào, tab nào, dòng nào và toàn bộ cột gốc đã được đưa vào CRM.
            </p>
          </div>
          <span>{{ sheetRawEntries.length }} cột gốc</span>
        </header>
        <div class="sync-layout">
          <aside class="sync-summary">
            <div class="summary-card">
              <span>Nguồn đồng bộ</span>
              <strong>{{ profile.sourceDataSource?.name || profile.source || 'Nguồn CRM' }}</strong>
            </div>
            <div class="summary-card" v-if="profile.sourceDataSource">
              <span>Spreadsheet</span>
              <strong class="mono">{{ profile.sourceDataSource.spreadsheetId }}</strong>
            </div>
            <div class="summary-card" v-if="profile.sourceDataSource">
              <span>Tab / Range</span>
              <strong>{{ profile.sourceDataSource.sheetName }}{{ profile.sourceDataSource.range ? ` · ${profile.sourceDataSource.range}` : '' }}</strong>
            </div>
            <div class="summary-card">
              <span>Dòng nguồn</span>
              <strong>{{ profile.sourceRowNumber || '—' }}</strong>
            </div>
            <div class="summary-card">
              <span>Lần cập nhật gần nhất</span>
              <strong>{{ formatDate(profile.syncedAt || profile.sourceDataSource?.lastSyncedAt) }}</strong>
            </div>
            <div class="summary-note">
              Màn này dùng để kiểm tra dữ liệu gốc của riêng khách hàng đang mở. Cấu hình nguồn và chạy đồng bộ tổng thực hiện ở danh sách Khách hàng, tab Đồng bộ.
            </div>
          </aside>
          <div class="raw-table-wrap">
            <table v-if="sheetRawEntries.length" class="raw-table">
              <tbody>
                <tr v-for="[key, value] in sheetRawEntries" :key="key">
                  <th>{{ key }}</th>
                  <td>{{ displayRawValue(value) }}</td>
                </tr>
              </tbody>
            </table>
            <div v-else class="empty-state">Hồ sơ này chưa có dữ liệu gốc từ Google Sheet.</div>
          </div>
        </div>
      </section>
    </template>

    <div v-if="editingContactLink" class="modal-backdrop" @click.self="closeContactEdit">
      <form class="modal-card contact-edit-modal" @submit.prevent="saveContactEdit">
        <header class="modal-head">
          <div>
            <h3>Sửa người liên hệ</h3>
            <p>Cập nhật thông tin người liên hệ trong hồ sơ khách hàng này.</p>
          </div>
          <button class="icon-only-btn" type="button" @click="closeContactEdit">
            <v-icon size="18">mdi-close</v-icon>
          </button>
        </header>
        <div class="modal-form-grid">
          <label>
            <span>Họ tên *</span>
            <input v-model.trim="contactEditForm.fullName" type="text" required />
          </label>
          <label>
            <span>Số điện thoại *</span>
            <input v-model.trim="contactEditForm.phone" type="tel" required />
          </label>
          <label>
            <span>Email</span>
            <input v-model.trim="contactEditForm.email" type="email" />
          </label>
          <label>
            <span>Ngày sinh</span>
            <input v-model="contactEditForm.birthDate" type="date" />
          </label>
          <label>
            <span>Chức danh</span>
            <input v-model.trim="contactEditForm.title" type="text" />
          </label>
          <label>
            <span>Bộ phận</span>
            <input v-model.trim="contactEditForm.department" type="text" />
          </label>
          <label class="modal-wide">
            <span>Ghi chú</span>
            <textarea v-model.trim="contactEditForm.notes" rows="3" />
          </label>
          <label class="modal-check-row modal-wide">
            <input v-model="contactEditForm.isPrimary" type="checkbox" />
            <span>Đặt làm liên hệ chính</span>
          </label>
        </div>
        <p v-if="contactEditError" class="inline-error">{{ contactEditError }}</p>
        <footer class="modal-actions">
          <button class="ghost-btn" type="button" @click="closeContactEdit">Hủy</button>
          <button class="primary-btn" type="submit" :disabled="savingContactEdit">
            <v-icon size="16">mdi-content-save-outline</v-icon>
            Lưu thay đổi
          </button>
        </footer>
      </form>
    </div>

    <div v-if="acceptedZaloPickerLink" class="modal-backdrop" @click.self="closeAcceptedZaloPicker">
      <section class="modal-card accepted-zalo-modal">
        <header class="modal-head">
          <div>
            <h3>Các nick Zalo đã kết bạn</h3>
            <p>Chọn nick Zalo nội bộ sẽ hiển thị mặc định trong cột Zalo kết bạn.</p>
          </div>
          <button class="icon-only-btn" type="button" @click="closeAcceptedZaloPicker">
            <v-icon size="18">mdi-close</v-icon>
          </button>
        </header>
        <div class="accepted-zalo-list">
          <article v-for="option in acceptedZaloPickerOptions" :key="option.key" class="accepted-zalo-option">
            <div>
              <strong>{{ option.name }}</strong>
              <span>{{ option.phone || 'Chưa lưu SĐT tài khoản' }}</span>
            </div>
            <span v-if="option.isSelected" class="status-pill ok">Đang hiển thị</span>
            <button
              v-else
              class="ghost-btn compact-action"
              type="button"
              :disabled="savingAcceptedZaloDefaultId === option.key"
              @click="setAcceptedZaloDefault(option)"
            >
              <v-icon size="15">mdi-star-outline</v-icon>
              Đặt hiển thị
            </button>
          </article>
        </div>
        <footer class="modal-actions">
          <button class="ghost-btn" type="button" @click="closeAcceptedZaloPicker">Đóng</button>
        </footer>
      </section>
    </div>

    <div v-if="archivePreviewOpen" class="modal-backdrop" @click.self="closeArchivePreview">
      <section class="modal-card archive-preview-modal">
        <header class="modal-head archive-preview-head">
          <div>
            <span class="archive-preview-kicker">
              {{ archiveRecordTypeLabel(archivePreviewStory?.recordType) }}
            </span>
            <h3>
              {{ archivePreviewStory?.title || archivePreviewStory?.orderCode || archivePreviewStory?.conversationName || 'Chi tiết hồ sơ lưu' }}
            </h3>
            <p v-if="archivePreviewStory">{{ archiveCustomerSnapshotText(archivePreviewStory) }}</p>
          </div>
          <button class="icon-only-btn" type="button" title="Đóng" @click="closeArchivePreview">
            <v-icon size="18">mdi-close</v-icon>
          </button>
        </header>

        <div v-if="archivePreviewLoading" class="archive-preview-state">
          <v-icon size="22">mdi-loading mdi-spin</v-icon>
          Đang tải chi tiết hồ sơ...
        </div>
        <div v-else-if="archivePreviewError" class="archive-preview-state error-state">
          {{ archivePreviewError }}
        </div>
        <div v-else-if="archivePreviewStory" class="archive-preview-body">
          <div class="archive-preview-facts">
            <div><span>Trạng thái</span><strong>{{ archiveStatusLabel(archivePreviewStory) }}</strong></div>
            <div><span>Ưu tiên</span><strong>{{ archivePriorityLabel(archivePreviewStory.priority) }}</strong></div>
            <div><span>Người xử lý</span><strong>{{ archivePreviewStory.assignedUser?.fullName || 'Chưa phân công' }}</strong></div>
            <div><span>Phòng ban</span><strong>{{ archivePreviewStory.department?.name || 'Chưa xác định' }}</strong></div>
            <div><span>Nguồn hội thoại</span><strong>{{ archivePreviewStory.conversationName || '—' }}</strong></div>
            <div><span>Cập nhật</span><strong>{{ formatDate(archivePreviewStory.updatedAt || archivePreviewStory.createdAt) }}</strong></div>
          </div>

          <section v-if="archivePreviewStory.extraNote" class="archive-preview-note">
            <strong>Ghi chú</strong>
            <p>{{ archivePreviewStory.extraNote }}</p>
          </section>

          <section class="archive-preview-messages">
            <header>
              <strong>Nội dung đã lưu</strong>
              <span>{{ archivePreviewStory.messages?.length || 0 }} tin nhắn</span>
            </header>
            <div v-if="archivePreviewStory.messages?.length" class="archive-preview-message-list">
              <article
                v-for="message in archivePreviewStory.messages"
                :key="message.id"
                :class="{ 'is-staff': message.senderType === 'self' }"
              >
                <div>
                  <strong>{{ message.senderName || (message.senderType === 'self' ? 'Nhân viên' : 'Khách hàng') }}</strong>
                  <time>{{ formatDate(message.sentAt) }}</time>
                </div>
                <p>{{ message.contentSnapshot || `[${message.contentType || 'Tin nhắn'}]` }}</p>
                <span v-if="message.media?.length">{{ message.media.length }} tệp đính kèm</span>
                <span v-if="message.recalledAt" class="archive-preview-recalled">Đã thu hồi trên Zalo</span>
              </article>
            </div>
            <p v-else class="empty-state compact-empty">
              {{ archivePreviewStory.conversationContent || 'Hồ sơ chưa có nội dung tin nhắn.' }}
            </p>
          </section>

          <section v-if="archivePreviewStory.resultContent" class="archive-preview-note result">
            <strong>Kết quả xử lý</strong>
            <p>{{ archivePreviewStory.resultContent }}</p>
          </section>
        </div>

        <footer class="modal-actions">
          <button class="ghost-btn" type="button" @click="closeArchivePreview">Đóng</button>
          <button
            class="primary-btn"
            type="button"
            :disabled="!archivePreviewStory"
            @click="goToArchiveStory"
          >
            <v-icon size="16">mdi-open-in-new</v-icon>
            Đi tới Hồ sơ lưu
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';

type DetailTab = 'overview' | 'zalo' | 'contacts' | 'archive' | 'sync';

type CustomerProfileDetail = {
  id: string;
  externalKey: string;
  code?: string | null;
  name: string;
  shortName?: string | null;
  type?: string | null;
  phone?: string | null;
  mainPhone?: string | null;
  email?: string | null;
  taxCode?: string | null;
  website?: string | null;
  provinceOrRegion?: string | null;
  officeAddress?: string | null;
  shippingAddress?: string | null;
  legalRepresentativeRaw?: string | null;
  activeSince?: string | null;
  firstTransactionDate?: string | null;
  salesOwnerCodeSnapshot?: string | null;
  managingDepartmentCodeSnapshot?: string | null;
  customerTypeCodeSnapshot?: string | null;
  source?: string | null;
  sourceRowNumber?: number | null;
  syncedAt?: string | null;
  missingFromSource: boolean;
  metadata?: { rawRow?: Record<string, unknown> } | null;
  ownerUser?: { id: string; fullName: string; email?: string | null } | null;
  managingDepartment?: { id: string; name: string; legacyDepartmentCode?: string | null } | null;
  customerType?: { id: string; code: string; name: string } | null;
  sourceDataSource?: {
    id: string;
    name: string;
    spreadsheetId: string;
    sheetName: string;
    range?: string | null;
    lastSyncedAt?: string | null;
    lastSyncStatus?: string | null;
  } | null;
  contacts?: Array<{
    id: string;
    role: string;
    title?: string | null;
    department?: string | null;
    rawText?: string | null;
    isPrimary: boolean;
    contact?: ContactLite | null;
  }>;
  zaloUsers?: Array<{
    id: string;
    contactDisplayNameSnapshot?: string | null;
    zaloDisplayNameSnapshot?: string | null;
    phoneSnapshot?: string | null;
    zaloGlobalIdSnapshot?: string | null;
    zaloUsernameSnapshot?: string | null;
    contact?: ContactLite | null;
  }>;
  zaloGroups?: Array<{ id: string; nativeGroup?: NativeGroupLite | null }>;
  archiveStories?: ArchiveStoryLite[];
  _count?: { zaloGroups: number; zaloUsers: number; contacts: number; archiveStories: number };
};

type ArchiveStoryLite = {
  id: string;
  title?: string | null;
  orderCode?: string | null;
  businessStatus?: string | null;
  priority?: string | null;
  conversationName?: string | null;
  recordType?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  customerProfileCodeSnapshot?: string | null;
  customerProfileNameSnapshot?: string | null;
  customerContextType?: string | null;
  statusDefinition?: { name?: string | null; label?: string | null; behaviorGroup?: string | null } | null;
};

type ArchiveStoryDetail = ArchiveStoryLite & {
  extraNote?: string | null;
  conversationContent?: string | null;
  resultContent?: string | null;
  assignedUser?: { id: string; fullName: string } | null;
  department?: { id: string; name: string } | null;
  messages?: Array<{
    id: string;
    senderName?: string | null;
    senderType?: string | null;
    contentSnapshot?: string | null;
    contentType?: string | null;
    sentAt?: string | null;
    recalledAt?: string | null;
    media?: Array<{ id: string }>;
  }>;
};

type ContactLite = {
  id: string;
  fullName?: string | null;
  crmName?: string | null;
  zaloUsername?: string | null;
  zaloGlobalId?: string | null;
  phone?: string | null;
  phoneNormalized?: string | null;
  email?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  hasZalo?: boolean | null;
  metadata?: {
    preferredAcceptedZaloAccountId?: string | null;
    lastZaloNickForPhone?: {
      phone?: string | null;
      normalizedPhone?: string | null;
      zaloDisplayName?: string | null;
      zaloGlobalId?: string | null;
      zaloUsername?: string | null;
      accountName?: string | null;
    } | null;
    zaloNickByPhone?: Array<{
      phone?: string | null;
      normalizedPhone?: string | null;
      zaloDisplayName?: string | null;
      zaloGlobalId?: string | null;
      zaloUsername?: string | null;
      accountName?: string | null;
    }>;
  } | null;
  conversations?: Array<{ zaloAccount?: { id: string; displayName?: string | null; phone?: string | null; deletedAt?: string | null } | null }>;
  friends?: Array<{
    aliasInNick?: string | null;
    zaloDisplayName?: string | null;
    zaloGlobalId?: string | null;
    zaloUsername?: string | null;
    zaloUidInNick?: string | null;
    relationshipKind?: string | null;
    friendshipStatus?: string | null;
    zaloAccount?: { id: string; displayName?: string | null; phone?: string | null; deletedAt?: string | null } | null;
  }>;
  customerProfileContacts?: Array<{
    customerProfileId: string;
    role?: string | null;
    isPrimary?: boolean | null;
    customerProfile?: {
      id: string;
      code?: string | null;
      externalKey?: string | null;
      name: string;
    } | null;
  }>;
  customerProfileLink?: {
    customerProfileId: string;
    customerProfile?: {
      id: string;
      code?: string | null;
      externalKey?: string | null;
      name: string;
    } | null;
  } | null;
};

type AcceptedZaloOption = {
  key: string;
  accountId: string;
  name: string;
  phone: string;
  text: string;
  isSelected: boolean;
};

type ContactPhoneLookup = {
  phone: string;
  normalizedPhone: string;
  status: 'has_zalo' | 'no_zalo_known' | 'unknown';
  hasZalo: boolean;
  friendAccounts: Array<{ id: string; displayName?: string | null; phone?: string | null; friendshipStatus?: string | null; relationshipKind?: string | null }>;
  contacts: ContactLite[];
  note?: string;
};

type NativeGroupLite = {
  id: string;
  globalId: string;
  name?: string | null;
  accounts?: Array<{ membershipStatus: string; zaloAccount?: { displayName?: string | null; phone?: string | null } | null }>;
  customerLink?: {
    customerProfileId: string;
    customerProfile?: {
      id: string;
      code?: string | null;
      externalKey?: string | null;
      name: string;
    } | null;
  } | null;
};

const route = useRoute();
const router = useRouter();
const profile = ref<CustomerProfileDetail | null>(null);
const loading = ref(false);
const error = ref('');
const activeTab = ref<DetailTab>('overview');
const groupSearchQuery = ref('');
const groupLinkStatus = ref<'linked' | 'unlinked' | ''>('');
const groupSharedOnly = ref(false);
const groupSearchResults = ref<NativeGroupLite[]>([]);
const groupSearchLoading = ref(false);
const groupSearchTouched = ref(false);
const linkingGroupId = ref('');
const unlinkingGroupId = ref('');
const userSearchQuery = ref('');
const userLinkStatus = ref<'linked' | 'unlinked' | ''>('');
const userSearchResults = ref<ContactLite[]>([]);
const userSearchLoading = ref(false);
const userSearchTouched = ref(false);
const linkingUserId = ref('');
const unlinkingUserId = ref('');
const groupActionError = ref('');
const groupActionMessage = ref('');
const userActionError = ref('');
const userActionMessage = ref('');
const openZaloDetailKeys = ref<string[]>([]);
const contactSearchQuery = ref('');
const contactSearchResults = ref<ContactLite[]>([]);
const contactSearchLoading = ref(false);
const contactSearchTouched = ref(false);
const selectedContactId = ref('');
const linkingContactId = ref('');
const updatingContactId = ref('');
const unlinkingContactId = ref('');
const contactActionError = ref('');
const contactActionMessage = ref('');
const editingContactLink = ref<NonNullable<CustomerProfileDetail['contacts']>[number] | null>(null);
const savingContactEdit = ref(false);
const contactEditError = ref('');
const acceptedZaloPickerLink = ref<NonNullable<CustomerProfileDetail['contacts']>[number] | null>(null);
const savingAcceptedZaloDefaultId = ref('');
const contactEditForm = ref({
  fullName: '',
  phone: '',
  email: '',
  birthDate: '',
  title: '',
  department: '',
  notes: '',
  isPrimary: false,
});
const contactForm = ref({
  role: 'other',
  title: '',
  department: '',
  rawText: '',
  isPrimary: false,
});
const contactCreateForm = ref({
  fullName: '',
  phone: '',
  email: '',
  birthDate: '',
  title: '',
  department: '',
  notes: '',
  rawText: '',
  isPrimary: false,
});
const phoneLookup = ref<ContactPhoneLookup | null>(null);
const phoneLookupLoading = ref(false);
const phoneLookupError = ref('');
const creatingContact = ref(false);
const archiveStories = ref<ArchiveStoryLite[]>([]);
const archiveLoading = ref(false);
const archiveError = ref('');
const archiveSearchQuery = ref('');
const archiveStatusFilter = ref('');
const archiveRecordTypeFilter = ref('');
const archivePage = ref(1);
const archiveLimit = 20;
const archiveTotal = ref(0);
const archivePreviewOpen = ref(false);
const archivePreviewLoading = ref(false);
const archivePreviewError = ref('');
const archivePreviewStory = ref<ArchiveStoryDetail | null>(null);
let phoneLookupTimer: ReturnType<typeof setTimeout> | null = null;

const tabs = [
  { key: 'overview' as const, label: 'Tổng quan', icon: 'mdi-domain' },
  { key: 'zalo' as const, label: 'Zalo', icon: 'mdi-account-group-outline' },
  { key: 'contacts' as const, label: 'Người liên hệ', icon: 'mdi-card-account-phone-outline' },
  { key: 'archive' as const, label: 'Hồ sơ lưu', icon: 'mdi-archive-outline' },
  { key: 'sync' as const, label: 'Nguồn Sheet', icon: 'mdi-google-spreadsheet' },
];

const sheetRawEntries = computed(() => Object.entries(profile.value?.metadata?.rawRow || {}));
const selectedContact = computed(() => contactSearchResults.value.find((contact) => contact.id === selectedContactId.value) || null);
const acceptedZaloPickerOptions = computed(() => acceptedZaloOptions(acceptedZaloPickerLink.value?.contact));
const archiveTotalPages = computed(() => Math.max(1, Math.ceil(archiveTotal.value / archiveLimit)));

watch(
  () => contactCreateForm.value.phone,
  (phone) => {
    if (phoneLookupTimer) clearTimeout(phoneLookupTimer);
    phoneLookup.value = null;
    phoneLookupError.value = '';
    const digits = String(phone || '').replace(/[^\d]/g, '');
    if (digits.length < 9) return;
    phoneLookupTimer = setTimeout(() => {
      lookupContactPhone();
    }, 550);
  },
);

watch(activeTab, (tab) => {
  if (tab === 'archive' && profile.value) {
    archivePage.value = 1;
    loadArchiveStories();
  }
});

const InfoItem = defineComponent({
  props: {
    label: { type: String, required: true },
    value: { type: null, default: '' },
    mono: { type: Boolean, default: false },
  },
  setup(props) {
    return () => h('div', { class: 'info-item' }, [
      h('span', props.label),
      h('strong', { class: props.mono ? 'mono' : '' }, props.value ? String(props.value) : '—'),
    ]);
  },
});

onMounted(loadProfile);

async function loadProfile() {
  const id = String(route.params.id || '');
  if (!id) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/customer-profiles/${id}`);
    profile.value = data.profile;
    archiveStories.value = data.profile?.archiveStories || [];
    archiveTotal.value = data.profile?._count?.archiveStories ?? archiveStories.value.length;
    if (activeTab.value === 'archive') {
      await loadArchiveStories();
    }
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Không tải được hồ sơ khách hàng.';
  } finally {
    loading.value = false;
  }
}

async function loadArchiveStories() {
  if (!profile.value) return;
  archiveLoading.value = true;
  archiveError.value = '';
  try {
    const params = new URLSearchParams({
      customerProfileId: profile.value.id,
      page: String(archivePage.value),
      limit: String(archiveLimit),
    });
    if (archiveSearchQuery.value) params.set('q', archiveSearchQuery.value);
    if (archiveStatusFilter.value) params.set('status', archiveStatusFilter.value);
    if (archiveRecordTypeFilter.value) params.set('recordType', archiveRecordTypeFilter.value);
    const { data } = await api.get(`/archive/stories?${params.toString()}`);
    archiveStories.value = data.stories || [];
    archiveTotal.value = Number(data.total || 0);
    archivePage.value = Number(data.page || archivePage.value);
  } catch (err: any) {
    archiveStories.value = [];
    archiveError.value = err?.response?.data?.error || 'Không tải được hồ sơ lưu của khách hàng.';
  } finally {
    archiveLoading.value = false;
  }
}

function reloadArchiveStories() {
  archivePage.value = 1;
  return loadArchiveStories();
}

function changeArchivePage(page: number) {
  archivePage.value = Math.min(Math.max(1, page), archiveTotalPages.value);
  return loadArchiveStories();
}

async function openArchiveStory(storyId: string) {
  archivePreviewOpen.value = true;
  archivePreviewLoading.value = true;
  archivePreviewError.value = '';
  archivePreviewStory.value = null;
  try {
    const { data } = await api.get(`/archive/stories/${storyId}`);
    if (!archivePreviewOpen.value) return;
    archivePreviewStory.value = data;
  } catch (err: any) {
    archivePreviewError.value = err?.response?.data?.error || 'Không tải được chi tiết hồ sơ lưu.';
  } finally {
    archivePreviewLoading.value = false;
  }
}

function closeArchivePreview() {
  archivePreviewOpen.value = false;
  archivePreviewLoading.value = false;
  archivePreviewError.value = '';
  archivePreviewStory.value = null;
}

function goToArchiveStory() {
  if (!archivePreviewStory.value) return;
  void router.push({ path: '/archive', query: { storyId: archivePreviewStory.value.id } });
}

async function searchGroups() {
  if (!profile.value) return;
  groupSearchLoading.value = true;
  groupSearchTouched.value = true;
  groupActionError.value = '';
  try {
    const params = new URLSearchParams();
    if (groupSearchQuery.value) params.set('q', groupSearchQuery.value);
    if (groupLinkStatus.value) params.set('customerLinkStatus', groupLinkStatus.value);
    if (groupSharedOnly.value) params.set('sharedOnly', 'true');
    const query = params.toString();
    const { data } = await api.get(`/native-zalo-groups${query ? `?${query}` : ''}`);
    groupSearchResults.value = data.groups || [];
  } catch (err: any) {
    groupSearchResults.value = [];
    groupActionError.value = err?.response?.data?.error || 'Không tìm được nhóm Zalo.';
  } finally {
    groupSearchLoading.value = false;
  }
}

function isGroupLinkedToCurrentProfile(group: NativeGroupLite): boolean {
  return Boolean(profile.value?.id && group.customerLink?.customerProfileId === profile.value.id);
}

async function linkGroup(group: NativeGroupLite) {
  if (!profile.value) return;
  const currentProfile = group.customerLink?.customerProfile;
  const isTransfer = Boolean(currentProfile && currentProfile.id !== profile.value.id);
  if (isTransfer) {
    const currentName = `${currentProfile?.code || currentProfile?.externalKey || ''} ${currentProfile?.name || ''}`.trim();
    const confirmed = window.confirm(`Nhóm này đang thuộc hồ sơ "${currentName}". Chuyển nhóm về hồ sơ "${profile.value.name}"?`);
    if (!confirmed) return;
  }
  linkingGroupId.value = group.id;
  groupActionError.value = '';
  groupActionMessage.value = '';
  try {
    await api.post(`/customer-profiles/${profile.value.id}/zalo-groups`, {
      nativeGroupId: group.id,
      confirmTransfer: isTransfer,
    });
    groupActionMessage.value = isTransfer ? 'Đã chuyển nhóm Zalo về hồ sơ này.' : 'Đã gắn nhóm Zalo vào hồ sơ.';
    await Promise.all([loadProfile(), searchGroups()]);
  } catch (err: any) {
    if (err?.response?.status === 409) {
      const confirmed = window.confirm('Nhóm này đã thuộc hồ sơ khách hàng khác. Bạn muốn chuyển về hồ sơ hiện tại?');
      if (confirmed) {
        try {
          await api.post(`/customer-profiles/${profile.value.id}/zalo-groups`, {
            nativeGroupId: group.id,
            confirmTransfer: true,
          });
          groupActionMessage.value = 'Đã chuyển nhóm Zalo về hồ sơ này.';
          await Promise.all([loadProfile(), searchGroups()]);
          return;
        } catch (transferErr: any) {
          groupActionError.value = transferErr?.response?.data?.error || 'Không chuyển được nhóm Zalo.';
          return;
        }
      }
    }
    groupActionError.value = err?.response?.data?.error || 'Không gắn được nhóm Zalo.';
  } finally {
    linkingGroupId.value = '';
  }
}

async function unlinkGroup(nativeGroupId: string) {
  if (!profile.value) return;
  const confirmed = window.confirm('Gỡ nhóm Zalo khỏi hồ sơ khách hàng này? Lịch sử nhóm và hồ sơ lưu sẽ không bị xóa.');
  if (!confirmed) return;
  unlinkingGroupId.value = nativeGroupId;
  groupActionError.value = '';
  groupActionMessage.value = '';
  try {
    await api.delete(`/customer-profiles/${profile.value.id}/zalo-groups/${nativeGroupId}`);
    groupActionMessage.value = 'Đã gỡ nhóm Zalo khỏi hồ sơ.';
    await Promise.all([loadProfile(), groupSearchTouched.value ? searchGroups() : Promise.resolve()]);
  } catch (err: any) {
    groupActionError.value = err?.response?.data?.error || 'Không gỡ được nhóm Zalo.';
  } finally {
    unlinkingGroupId.value = '';
  }
}

async function searchZaloUsers() {
  if (!profile.value) return;
  userSearchLoading.value = true;
  userSearchTouched.value = true;
  userActionError.value = '';
  try {
    const params = new URLSearchParams();
    if (userSearchQuery.value) params.set('q', userSearchQuery.value);
    if (userLinkStatus.value) params.set('linkStatus', userLinkStatus.value);
    params.set('limit', '20');
    const { data } = await api.get(`/customer-profiles/link-options/zalo-users?${params.toString()}`);
    userSearchResults.value = data.contacts || [];
  } catch (err: any) {
    userSearchResults.value = [];
    userActionError.value = err?.response?.data?.error || 'Không tìm được user Zalo.';
  } finally {
    userSearchLoading.value = false;
  }
}

function isUserLinkedToCurrentProfile(contact: ContactLite): boolean {
  return Boolean(profile.value?.id && contact.customerProfileLink?.customerProfileId === profile.value.id);
}

function zaloUserLinkMessage(baseMessage: string, data: any): string {
  const syncMessage = data?.contactSync?.message;
  if (!syncMessage) return baseMessage;
  return `${baseMessage} ${syncMessage}`;
}

function contactZaloSyncMessage(baseMessage: string, data: any): string {
  const syncMessage = data?.zaloSync?.message;
  if (!syncMessage) return baseMessage;
  return `${baseMessage} ${syncMessage}`;
}

async function linkZaloUser(contact: ContactLite) {
  if (!profile.value) return;
  const currentProfile = contact.customerProfileLink?.customerProfile;
  const isTransfer = Boolean(currentProfile && currentProfile.id !== profile.value.id);
  if (isTransfer) {
    const currentName = `${currentProfile?.code || currentProfile?.externalKey || ''} ${currentProfile?.name || ''}`.trim();
    const confirmed = window.confirm(`User Zalo này đang thuộc hồ sơ "${currentName}". Chuyển user về hồ sơ "${profile.value.name}"?`);
    if (!confirmed) return;
  }
  linkingUserId.value = contact.id;
  userActionError.value = '';
  userActionMessage.value = '';
  try {
    const { data } = await api.post(`/customer-profiles/${profile.value.id}/zalo-users`, {
      contactId: contact.id,
      confirmTransfer: isTransfer,
    });
    userActionMessage.value = zaloUserLinkMessage(
      isTransfer ? 'Đã chuyển user Zalo về hồ sơ này.' : 'Đã gắn user Zalo vào hồ sơ.',
      data,
    );
    await Promise.all([loadProfile(), searchZaloUsers()]);
  } catch (err: any) {
    if (err?.response?.status === 409) {
      const confirmed = window.confirm('User Zalo này đã thuộc hồ sơ khách hàng khác. Bạn muốn chuyển về hồ sơ hiện tại?');
      if (confirmed) {
        try {
          const { data } = await api.post(`/customer-profiles/${profile.value.id}/zalo-users`, {
            contactId: contact.id,
            confirmTransfer: true,
          });
          userActionMessage.value = zaloUserLinkMessage('Đã chuyển user Zalo về hồ sơ này.', data);
          await Promise.all([loadProfile(), searchZaloUsers()]);
          return;
        } catch (transferErr: any) {
          userActionError.value = transferErr?.response?.data?.error || 'Không chuyển được user Zalo.';
          return;
        }
      }
    }
    userActionError.value = err?.response?.data?.error || 'Không gắn được user Zalo.';
  } finally {
    linkingUserId.value = '';
  }
}

async function unlinkZaloUser(contactId: string) {
  if (!profile.value) return;
  const zaloLink = profile.value.zaloUsers?.find((link) => link.contact?.id === contactId);
  const counterpart = profile.value.contacts?.find((link) => sameContactIdentity(zaloLink?.contact, link.contact));
  const confirmed = window.confirm('Gỡ User Zalo khỏi hồ sơ khách hàng này? Tài khoản Zalo, tin nhắn và lịch sử vẫn được giữ lại.');
  if (!confirmed) return;
  const unlinkContact = counterpart
    ? window.confirm(
        `User Zalo này đang tương ứng với Người liên hệ "${contactName(counterpart.contact)}".\n\n`
        + 'Chọn OK để gỡ cả User Zalo và Người liên hệ khỏi hồ sơ.\n'
        + 'Chọn Hủy để chỉ gỡ User Zalo.',
      )
    : false;
  unlinkingUserId.value = contactId;
  userActionError.value = '';
  userActionMessage.value = '';
  try {
    await api.delete(
      `/customer-profiles/${profile.value.id}/zalo-users/${contactId}?unlinkContact=${unlinkContact}`,
    );
    userActionMessage.value = unlinkContact
      ? 'Đã gỡ User Zalo và Người liên hệ tương ứng khỏi hồ sơ.'
      : 'Đã gỡ User Zalo khỏi hồ sơ.';
    await Promise.all([loadProfile(), userSearchTouched.value ? searchZaloUsers() : Promise.resolve()]);
  } catch (err: any) {
    userActionError.value = err?.response?.data?.error || 'Không gỡ được user Zalo.';
  } finally {
    unlinkingUserId.value = '';
  }
}

function contactName(contact?: ContactLite | null): string {
  return contact?.crmName || contact?.fullName || contact?.zaloUsername || contact?.phone || 'Liên hệ chưa đặt tên';
}

function normalizedIdentityPhone(contact?: ContactLite | null): string {
  const digits = String(contact?.phoneNormalized || contact?.phone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `84${digits.slice(1)}`;
  return digits.startsWith('84') ? digits : digits;
}

function sameContactIdentity(left?: ContactLite | null, right?: ContactLite | null): boolean {
  if (!left || !right) return false;
  if (left.id && right.id && left.id === right.id) return true;
  if (left.zaloGlobalId && right.zaloGlobalId && left.zaloGlobalId === right.zaloGlobalId) return true;
  const leftPhone = normalizedIdentityPhone(left);
  const rightPhone = normalizedIdentityPhone(right);
  return Boolean(leftPhone && rightPhone && leftPhone === rightPhone);
}

function preferredZaloFriend(contact?: ContactLite | null) {
  const friends = [...(contact?.friends || [])];
  return friends.sort((left, right) => {
    const leftRank = left.friendshipStatus === 'accepted' ? 0 : left.relationshipKind === 'chatting_stranger' ? 1 : 2;
    const rightRank = right.friendshipStatus === 'accepted' ? 0 : right.relationshipKind === 'chatting_stranger' ? 1 : 2;
    return leftRank - rightRank;
  })[0] || null;
}

function contactZaloDisplayName(contact?: ContactLite | null): string {
  const metadataName = contact?.metadata?.lastZaloNickForPhone?.zaloDisplayName;
  const friend = preferredZaloFriend(contact);
  return metadataName
    || friend?.aliasInNick
    || friend?.zaloDisplayName
    || contact?.zaloUsername
    || contact?.fullName
    || contact?.crmName
    || contact?.phone
    || 'User Zalo chưa đặt tên';
}

function userZaloIdentityLine(contact?: ContactLite | null): string {
  const friend = preferredZaloFriend(contact);
  const phone = contact?.phone || contact?.metadata?.lastZaloNickForPhone?.phone;
  const username = friend?.zaloUsername || contact?.zaloUsername || contact?.metadata?.lastZaloNickForPhone?.zaloUsername;
  return [phone, username].filter(Boolean).join(' · ') || 'Chưa có SĐT/username';
}

function userZaloLinkIdentityLine(link: NonNullable<CustomerProfileDetail['zaloUsers']>[number]): string {
  const phone = link.phoneSnapshot || link.contact?.phone || link.contact?.metadata?.lastZaloNickForPhone?.phone;
  const username = link.zaloUsernameSnapshot || preferredZaloFriend(link.contact)?.zaloUsername || link.contact?.zaloUsername;
  return [phone, username].filter(Boolean).join(' · ') || 'Chưa có SĐT/username';
}

function userZaloLinkContactText(link: NonNullable<CustomerProfileDetail['zaloUsers']>[number]): string {
  const phone = link.phoneSnapshot || link.contact?.phone || link.contact?.metadata?.lastZaloNickForPhone?.phone;
  const name = link.contactDisplayNameSnapshot || contactName(link.contact);
  if (phone && name) return `Liên hệ: ${phone} - ${name}`;
  return `Liên hệ: ${name || phone || 'chưa có thông tin'}`;
}

function contactZaloPhoneNickText(contact?: ContactLite | null): string {
  const item = contact?.metadata?.lastZaloNickForPhone;
  if (item?.zaloDisplayName) {
    return `Nick theo SĐT: ${item.zaloDisplayName}`;
  }
  const friend = preferredZaloFriend(contact);
  const name = friend?.aliasInNick || friend?.zaloDisplayName || contact?.zaloUsername;
  if (!name) return 'Chưa lưu nick Zalo theo SĐT';
  return `Nick theo SĐT: ${name}`;
}

function formatZaloAccountPhone(phone?: string | null): string {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  const local = digits.startsWith('84') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
  if (local.length === 10) return `${local.slice(0, 4)}.${local.slice(4, 7)}.${local.slice(7)}`;
  return raw;
}

function contactAccountsText(contact?: ContactLite | null): string {
  const friendAccounts = contact?.friends?.map((item) => {
    const name = item.zaloAccount?.displayName || item.zaloAccount?.phone;
    if (!name) return '';
    const status = item.friendshipStatus === 'accepted' ? 'đã KB' : item.relationshipKind || item.friendshipStatus || '';
    return status ? `${name} (${status})` : name;
  }).filter(Boolean) || [];
  const conversationAccounts = contact?.conversations?.map((item) => {
    const name = item.zaloAccount?.displayName || item.zaloAccount?.phone;
    return name ? `${name} (có hội thoại)` : '';
  }).filter(Boolean) || [];
  const accounts = [...friendAccounts, ...conversationAccounts];
  if (!accounts.length) return 'Chưa có nick Zalo liên quan';
  return `Nick Zalo: ${[...new Set(accounts)].slice(0, 5).join(' · ')}`;
}

function acceptedZaloOptions(contact?: ContactLite | null): AcceptedZaloOption[] {
  const preferredAccountId = contact?.metadata?.preferredAcceptedZaloAccountId || '';
  const seen = new Set<string>();
  const options = (contact?.friends || [])
    .filter((item) => item.friendshipStatus === 'accepted' && !item.zaloAccount?.deletedAt)
    .map((item) => {
      const accountId = item.zaloAccount?.id || '';
      const name = item.zaloAccount?.displayName || item.zaloAccount?.phone || '';
      const phone = formatZaloAccountPhone(item.zaloAccount?.phone);
      const key = accountId || `${name}:${phone}`;
      if (!key || seen.has(key)) return null;
      seen.add(key);
      return {
        key,
        accountId: accountId || key,
        name,
        phone,
        text: name && phone ? `${name} [${phone}]` : name || phone,
        isSelected: Boolean(preferredAccountId && accountId && preferredAccountId === accountId),
      };
    })
    .filter((item): item is AcceptedZaloOption => Boolean(item));
  const sorted = options.sort((left, right) => left.text.localeCompare(right.text, 'vi', { sensitivity: 'base' }));
  if (!preferredAccountId && sorted[0]) {
    sorted[0] = { ...sorted[0], isSelected: true };
  }
  if (preferredAccountId && !sorted.some((item) => item.isSelected) && sorted[0]) {
    sorted[0] = { ...sorted[0], isSelected: true };
  }
  return sorted;
}

function contactAcceptedZaloText(contact?: ContactLite | null): string {
  const selected = acceptedZaloOptions(contact).find((item) => item.isSelected);
  if (selected) return selected.text;
  if (contact?.friends?.length) return 'Có Zalo, chưa có nick kết bạn';
  if (contact?.zaloGlobalId || contact?.zaloUsername || contact?.hasZalo) return 'Có định danh, chưa kết bạn';
  return 'Chưa có nick kết bạn';
}

function contactAcceptedZaloCount(contact?: ContactLite | null): number {
  return acceptedZaloOptions(contact).length;
}

function openAcceptedZaloPicker(link: NonNullable<CustomerProfileDetail['contacts']>[number]) {
  acceptedZaloPickerLink.value = link;
  contactActionError.value = '';
  contactActionMessage.value = '';
}

function closeAcceptedZaloPicker() {
  if (savingAcceptedZaloDefaultId.value) return;
  acceptedZaloPickerLink.value = null;
}

async function setAcceptedZaloDefault(option: AcceptedZaloOption) {
  const link = acceptedZaloPickerLink.value;
  if (!link?.contact?.id) return;
  savingAcceptedZaloDefaultId.value = option.key;
  try {
    await updateContactLink(
      link,
      { preferredAcceptedZaloAccountId: option.accountId },
      `Đã đặt ${option.name} làm nick Zalo hiển thị mặc định.`,
    );
    acceptedZaloPickerLink.value = null;
  } finally {
    savingAcceptedZaloDefaultId.value = '';
  }
}

function groupSummaryText(group?: NativeGroupLite | null): string {
  const count = group?.accounts?.length || 0;
  if (!count) return 'Chưa có nick Zalo active';
  return `${count} nick Zalo đang thấy nhóm này`;
}

function userZaloLinkLogicText(contact?: ContactLite | null): string {
  const count = contactZaloNickCount(contact);
  if (count > 1) return `${count} nick cùng có quan hệ với user này; CRM gắn theo Contact/globalId chung.`;
  if (contact?.phone || contact?.phoneNormalized) return 'Có SĐT nên có thể đối chiếu/tạo Người liên hệ theo số điện thoại.';
  return 'Chưa có SĐT nên chỉ quản lý ở tab User Zalo, không tự tạo Người liên hệ.';
}

function isZaloDetailOpen(key: string): boolean {
  return openZaloDetailKeys.value.includes(key);
}

function toggleZaloDetail(key: string) {
  openZaloDetailKeys.value = isZaloDetailOpen(key)
    ? openZaloDetailKeys.value.filter((item) => item !== key)
    : [...openZaloDetailKeys.value, key];
}

async function lookupContactPhone() {
  const phone = contactCreateForm.value.phone.trim();
  if (!phone) return;
  phoneLookupLoading.value = true;
  phoneLookupError.value = '';
  try {
    const params = new URLSearchParams({ phone });
    const { data } = await api.get(`/customer-profiles/contact-phone-lookup?${params.toString()}`);
    phoneLookup.value = data;
  } catch (err: any) {
    phoneLookup.value = null;
    phoneLookupError.value = err?.response?.data?.error || 'Không kiểm tra được số điện thoại.';
  } finally {
    phoneLookupLoading.value = false;
  }
}

async function createProfileContact() {
  if (!profile.value) return;
  const fullName = contactCreateForm.value.fullName.trim();
  const phone = contactCreateForm.value.phone.trim();
  if (!fullName || !phone) {
    contactActionError.value = !fullName && !phone
      ? 'Vui lòng nhập Họ tên và Số điện thoại trước khi lưu.'
      : !fullName
        ? 'Vui lòng nhập Họ tên trước khi lưu.'
        : 'Vui lòng nhập Số điện thoại trước khi lưu.';
    contactActionMessage.value = '';
    return;
  }
  if (phone.replace(/[^\d]/g, '').length < 9) {
    contactActionError.value = 'Số điện thoại chưa hợp lệ, cần ít nhất 9 chữ số.';
    contactActionMessage.value = '';
    return;
  }
  creatingContact.value = true;
  contactActionError.value = '';
  contactActionMessage.value = '';
  try {
    const { data } = await api.post(`/customer-profiles/${profile.value.id}/contacts/create`, {
      fullName,
      phone,
      email: contactCreateForm.value.email,
      birthDate: contactCreateForm.value.birthDate || null,
      title: contactCreateForm.value.title,
      department: contactCreateForm.value.department,
      notes: contactCreateForm.value.notes,
      rawText: contactCreateForm.value.rawText,
      isPrimary: contactCreateForm.value.isPrimary,
    });
    const baseMessage = data.reusedExisting
      ? 'Số điện thoại đã có Contact trong CRM; đã dùng lại Contact có sẵn và gắn vào hồ sơ.'
      : 'Đã tạo người liên hệ mới và gắn vào hồ sơ.';
    contactActionMessage.value = contactZaloSyncMessage(baseMessage, data);
    contactCreateForm.value = {
      fullName: '',
      phone: '',
      email: '',
      birthDate: '',
      title: '',
      department: '',
      notes: '',
      rawText: '',
      isPrimary: false,
    };
    phoneLookup.value = null;
    await loadProfile();
  } catch (err: any) {
    contactActionError.value = err?.response?.data?.error || 'Không tạo được người liên hệ.';
  } finally {
    creatingContact.value = false;
  }
}

function phoneLookupStatusText(result?: ContactPhoneLookup | null): string {
  if (!result) return '';
  if (result.status === 'has_zalo') return 'Có Zalo trong dữ liệu CRM';
  if (result.status === 'no_zalo_known') return 'CRM đã ghi nhận không có Zalo';
  return 'Chưa rõ có Zalo hay không';
}

function phoneLookupFriendText(result?: ContactPhoneLookup | null): string {
  if (!result?.friendAccounts.length) return 'Chưa thấy trong danh sách bạn bè của nick Zalo nào.';
  return `Đang là bạn/quan hệ qua: ${result.friendAccounts
    .map((account) => {
      const name = account.displayName || account.phone || 'Nick Zalo';
      const status = account.friendshipStatus === 'accepted' ? 'đã KB' : account.relationshipKind || account.friendshipStatus || '';
      return status ? `${name} (${status})` : name;
    })
    .join(' · ')}`;
}

async function searchContactOptions() {
  contactSearchLoading.value = true;
  contactSearchTouched.value = true;
  contactActionError.value = '';
  try {
    const params = new URLSearchParams();
    if (contactSearchQuery.value) params.set('q', contactSearchQuery.value);
    params.set('limit', '20');
    const { data } = await api.get(`/customer-profiles/contact-options?${params.toString()}`);
    contactSearchResults.value = data.contacts || [];
  } catch (err: any) {
    contactSearchResults.value = [];
    contactActionError.value = err?.response?.data?.error || 'Không tìm được contact.';
  } finally {
    contactSearchLoading.value = false;
  }
}

function selectContactOption(contact: ContactLite) {
  selectedContactId.value = contact.id;
  contactActionError.value = '';
  contactActionMessage.value = '';
  const existingLink = profile.value?.contacts?.find((link) => link.contact?.id === contact.id);
  contactForm.value = {
    role: existingLink?.role || 'other',
    title: existingLink?.title || '',
    department: existingLink?.department || '',
    rawText: existingLink?.rawText || '',
    isPrimary: Boolean(existingLink?.isPrimary),
  };
}

async function linkProfileContact() {
  if (!profile.value || !selectedContact.value) return;
  linkingContactId.value = selectedContact.value.id;
  contactActionError.value = '';
  contactActionMessage.value = '';
  try {
    const { data } = await api.post(`/customer-profiles/${profile.value.id}/contacts`, {
      contactId: selectedContact.value.id,
      role: contactForm.value.role,
      title: contactForm.value.title,
      department: contactForm.value.department,
      rawText: contactForm.value.rawText,
      isPrimary: contactForm.value.isPrimary,
    });
    contactActionMessage.value = contactZaloSyncMessage('Đã gắn contact vào hồ sơ.', data);
    await Promise.all([loadProfile(), contactSearchTouched.value ? searchContactOptions() : Promise.resolve()]);
  } catch (err: any) {
    contactActionError.value = err?.response?.data?.error || 'Không gắn được contact vào hồ sơ.';
  } finally {
    linkingContactId.value = '';
  }
}

function openContactEdit(link: NonNullable<CustomerProfileDetail['contacts']>[number]) {
  editingContactLink.value = link;
  contactEditError.value = '';
  contactActionError.value = '';
  contactActionMessage.value = '';
  contactEditForm.value = {
    fullName: link.contact?.fullName || link.contact?.crmName || '',
    phone: link.contact?.phone || '',
    email: link.contact?.email || '',
    birthDate: formatDateInput(link.contact?.birthDate),
    title: link.title || '',
    department: link.department || '',
    notes: link.contact?.notes || '',
    isPrimary: Boolean(link.isPrimary),
  };
}

function closeContactEdit() {
  if (savingContactEdit.value) return;
  editingContactLink.value = null;
  contactEditError.value = '';
}

async function saveContactEdit() {
  const link = editingContactLink.value;
  const contactId = link?.contact?.id;
  if (!profile.value || !link || !contactId) return;
  const fullName = contactEditForm.value.fullName.trim();
  const phone = contactEditForm.value.phone.trim();
  if (!fullName || !phone) {
    contactEditError.value = !fullName && !phone
      ? 'Vui lòng nhập Họ tên và Số điện thoại trước khi lưu.'
      : !fullName
        ? 'Vui lòng nhập Họ tên trước khi lưu.'
        : 'Vui lòng nhập Số điện thoại trước khi lưu.';
    return;
  }
  if (phone.replace(/[^\d]/g, '').length < 9) {
    contactEditError.value = 'Số điện thoại chưa hợp lệ, cần ít nhất 9 chữ số.';
    return;
  }

  savingContactEdit.value = true;
  updatingContactId.value = contactId;
  contactEditError.value = '';
  contactActionError.value = '';
  contactActionMessage.value = '';
  try {
    await api.patch(`/customer-profiles/${profile.value.id}/contacts/${contactId}`, {
      fullName,
      phone,
      email: contactEditForm.value.email,
      birthDate: contactEditForm.value.birthDate || null,
      title: contactEditForm.value.title,
      department: contactEditForm.value.department,
      notes: contactEditForm.value.notes,
      isPrimary: contactEditForm.value.isPrimary,
    });
    contactActionMessage.value = 'Đã lưu thay đổi người liên hệ.';
    editingContactLink.value = null;
    await loadProfile();
  } catch (err: any) {
    contactEditError.value = err?.response?.data?.error || 'Không lưu được thay đổi người liên hệ.';
  } finally {
    savingContactEdit.value = false;
    updatingContactId.value = '';
  }
}

async function updateContactLink(
  link: NonNullable<CustomerProfileDetail['contacts']>[number],
  patch: {
    role?: string;
    title?: string | null;
    department?: string | null;
    isPrimary?: boolean;
    fullName?: string | null;
    phone?: string | null;
    email?: string | null;
    birthDate?: string | null;
    notes?: string | null;
    preferredAcceptedZaloAccountId?: string | null;
  },
  successMessage = 'Đã cập nhật liên hệ.',
) {
  if (!profile.value || !link.contact?.id) return;
  updatingContactId.value = link.contact.id;
  contactActionError.value = '';
  contactActionMessage.value = '';
  try {
    await api.patch(`/customer-profiles/${profile.value.id}/contacts/${link.contact.id}`, patch);
    contactActionMessage.value = successMessage;
    await loadProfile();
  } catch (err: any) {
    contactActionError.value = err?.response?.data?.error || 'Không cập nhật được liên hệ.';
  } finally {
    updatingContactId.value = '';
  }
}

function setPrimaryContact(link: NonNullable<CustomerProfileDetail['contacts']>[number]) {
  return updateContactLink(link, { isPrimary: true }, 'Đã đặt liên hệ chính cho hồ sơ.');
}

async function unlinkProfileContact(contactId: string) {
  if (!profile.value) return;
  const contactLink = profile.value.contacts?.find((link) => link.contact?.id === contactId);
  const counterpart = profile.value.zaloUsers?.find((link) => sameContactIdentity(contactLink?.contact, link.contact));
  const confirmed = window.confirm('Xóa Người liên hệ khỏi hồ sơ khách hàng này? Contact gốc, dữ liệu Zalo và lịch sử vẫn được giữ lại.');
  if (!confirmed) return;
  const unlinkZaloUser = counterpart
    ? window.confirm(
        `Người liên hệ này đang tương ứng với User Zalo "${contactZaloDisplayName(counterpart.contact)}".\n\n`
        + 'Chọn OK để gỡ cả Người liên hệ và User Zalo khỏi hồ sơ.\n'
        + 'Chọn Hủy để chỉ gỡ Người liên hệ.',
      )
    : false;
  unlinkingContactId.value = contactId;
  contactActionError.value = '';
  contactActionMessage.value = '';
  try {
    await api.delete(
      `/customer-profiles/${profile.value.id}/contacts/${contactId}?unlinkZaloUser=${unlinkZaloUser}`,
    );
    contactActionMessage.value = unlinkZaloUser
      ? 'Đã gỡ Người liên hệ và User Zalo tương ứng khỏi hồ sơ.'
      : 'Đã gỡ Người liên hệ khỏi hồ sơ.';
    await loadProfile();
  } catch (err: any) {
    contactActionError.value = err?.response?.data?.error || 'Không khóa được liên hệ khỏi hồ sơ.';
  } finally {
    unlinkingContactId.value = '';
  }
}

function contactCustomerContextsText(contact?: ContactLite | null): string {
  const contexts = contact?.customerProfileContacts || [];
  if (!contexts.length) return 'Chưa gắn vào hồ sơ khách hàng nào';
  return `Hồ sơ liên quan: ${contexts
    .slice(0, 4)
    .map((item) => {
      const customer = item.customerProfile;
      const code = customer?.code || customer?.externalKey || '';
      const primary = item.isPrimary ? ' chính' : '';
      return `${code ? `${code} - ` : ''}${customer?.name || item.customerProfileId}${primary}`;
    })
    .join(' · ')}`;
}

function formatDateInput(value?: string | null): string {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function formatDateOnly(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('vi-VN');
}

function archiveStatusLabel(story: ArchiveStoryLite): string {
  if (story.statusDefinition?.label) return story.statusDefinition.label;
  if (story.statusDefinition?.name) return story.statusDefinition.name;
  const status = story.businessStatus || '';
  if (status === 'completed') return 'Hoàn thành';
  if (status === 'cancelled') return 'Đã hủy';
  if (status === 'pending') return 'Đang xử lý';
  return status || '—';
}

function archiveRecordTypeLabel(value?: string | null): string {
  if (value === 'order') return 'Đơn hàng';
  if (value === 'quote') return 'Báo giá';
  if (value === 'support') return 'Hỗ trợ';
  if (value === 'other') return 'Khác';
  return value || '—';
}

function archivePriorityLabel(value?: string | null): string {
  if (value === 'urgent') return 'Khẩn cấp';
  if (value === 'high') return 'Cao';
  if (value === 'normal') return 'Thường';
  if (value === 'low') return 'Thấp';
  return value || '—';
}

function archiveCustomerSnapshotText(story: ArchiveStoryLite): string {
  const code = story.customerProfileCodeSnapshot ? `${story.customerProfileCodeSnapshot} - ` : '';
  const name = story.customerProfileNameSnapshot || '';
  const context = archiveCustomerContextLabel(story.customerContextType);
  if (!name && !code) return 'Chưa có snapshot khách hàng';
  return `Snapshot KH: ${code}${name}${context ? ` · ${context}` : ''}`;
}

function archiveCustomerContextLabel(value?: string | null): string {
  if (value === 'group') return 'từ nhóm Zalo';
  if (value === 'direct_user') return 'từ User Zalo';
  if (value === 'direct_contact') return 'từ Người liên hệ';
  return '';
}

function contactZaloNickCount(contact?: ContactLite | null): number {
  const ids = new Set<string>();
  contact?.friends?.forEach((item) => {
    const id = item.zaloAccount?.id || item.zaloAccount?.displayName || item.zaloAccount?.phone;
    if (id) ids.add(id);
  });
  contact?.conversations?.forEach((item) => {
    const id = item.zaloAccount?.id || item.zaloAccount?.displayName || item.zaloAccount?.phone;
    if (id) ids.add(id);
  });
  return ids.size;
}

function groupAccountsText(group?: NativeGroupLite | null): string {
  const accounts = group?.accounts || [];
  if (!accounts.length) return 'Chưa có nick Zalo active';
  return accounts
    .slice(0, 3)
    .map((item) => `${item.zaloAccount?.displayName || item.zaloAccount?.phone || 'Nick Zalo'} (${item.membershipStatus})`)
    .join(' · ');
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', { hour12: false });
}

function displayRawValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
</script>

<style scoped>
.customer-detail-page {
  min-height: 100vh;
  background: #f5f7fb;
  color: #101828;
  padding: 20px;
  width: 100%;
  box-sizing: border-box;
}
.detail-head,
.panel-head,
.detail-tabs,
.hero-stats,
.contact-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.detail-head {
  justify-content: space-between;
  margin-bottom: 12px;
}
.ghost-btn {
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #344054;
  padding: 0 12px;
  font-weight: 600;
  cursor: pointer;
}
.primary-btn,
.danger-btn {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 6px;
  padding: 0 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.primary-btn {
  border: 1px solid #1f6feb;
  background: #1f6feb;
  color: #fff;
}
.danger-btn {
  border: 1px solid #fecdca;
  background: #fff;
  color: #b42318;
}
.ghost-btn:disabled,
.primary-btn:disabled,
.danger-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.profile-hero,
.panel {
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
  width: 100%;
  box-sizing: border-box;
}
.profile-hero {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 18px;
}
.profile-hero h1 {
  margin: 5px 0;
  font-size: 26px;
}
.profile-hero p,
.link-item span,
.contact-row span {
  color: #667085;
}
.hero-stats {
  flex-wrap: wrap;
  justify-content: flex-end;
}
.hero-stats span {
  min-width: 96px;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  padding: 9px 10px;
  background: #f8fafc;
  color: #475467;
}
.hero-stats strong {
  display: block;
  color: #101828;
  font-size: 18px;
}
.detail-tabs {
  margin: 12px 0;
  border-bottom: 1px solid #d0d5dd;
  overflow-x: auto;
}
.detail-tabs button {
  height: 38px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #475467;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  cursor: pointer;
  white-space: nowrap;
}
.detail-tabs button.active {
  border-color: #1f6feb;
  color: #1849a9;
  font-weight: 700;
}
.panel {
  padding: 16px;
}
.panel-head {
  justify-content: space-between;
  margin-bottom: 14px;
  align-items: flex-start;
}
.panel-head h2,
.split-grid h3 {
  margin: 0;
}
.panel-subtitle {
  max-width: 860px;
  margin: 5px 0 0;
  color: #667085;
  font-size: 13px;
  line-height: 1.45;
}
.overview-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.overview-strip div {
  border: 1px solid #d0d5dd;
  border-radius: 7px;
  background: #f8fafc;
  padding: 9px 11px;
  min-width: 0;
}
.overview-strip span,
.summary-card span {
  display: block;
  margin-bottom: 4px;
  color: #667085;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
.overview-strip strong,
.summary-card strong {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}
.info-grid,
.split-grid {
  display: grid;
  gap: 10px;
}
.info-grid {
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
}
.split-grid {
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}
.user-link-tools {
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #f8fafc;
  padding: 10px;
  margin: 10px 0;
}
.tool-head,
.search-row,
.group-result {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tool-head {
  justify-content: space-between;
  margin-bottom: 10px;
}
.tool-head h3 {
  margin: 0;
}
.tool-head p {
  margin: 4px 0 0;
  color: #667085;
  font-size: 13px;
}
.zalo-section-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 8px;
}
.zalo-section-head h3 {
  margin: 0;
}
.zalo-section-head p {
  margin: 4px 0 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.4;
}
.count-pill {
  min-width: 30px;
  height: 24px;
  border-radius: 999px;
  background: #eff6ff;
  color: #175cd3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 12px;
}
.search-row {
  flex-wrap: wrap;
}
.search-row > input,
.search-row > select {
  height: 38px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #101828;
  padding: 0 10px;
}
.search-row > input {
  min-width: 260px;
  flex: 1 1 320px;
}
.search-row.compact > input {
  min-width: 220px;
}
.search-row.compact .ghost-btn {
  height: 38px;
}
.search-row > select {
  min-width: 150px;
}
.zalo-search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px auto;
  gap: 8px;
  flex-wrap: nowrap;
}
.zalo-search-row.group-search-row {
  grid-template-columns: minmax(0, 1fr) 150px auto auto;
}
.zalo-search-row > input,
.zalo-search-row > select,
.zalo-search-row > button {
  min-width: 0;
  width: 100%;
}
.inline-check {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #475467;
  font-weight: 600;
}
.compact-inline-check {
  height: 38px;
  gap: 5px;
  padding: 0 2px;
  white-space: nowrap;
  font-size: 12px;
}
.compact-inline-check input[type='checkbox'] {
  width: 14px;
  height: 14px;
  margin: 0;
  flex: 0 0 14px;
  accent-color: #16a34a;
}
.tool-feedback {
  min-height: 18px;
  margin-top: 6px;
}
.tool-feedback .inline-error,
.tool-feedback .inline-success {
  margin: 0;
  line-height: 18px;
}
.inline-error,
.inline-success {
  margin: 10px 0 0;
  font-size: 13px;
  font-weight: 700;
}
.inline-error {
  color: #b42318;
}
.inline-success {
  color: #067647;
}
.group-result-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.group-result {
  justify-content: space-between;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: #fff;
  padding: 10px;
}
.group-result.selected {
  border-color: #1f6feb;
  background: #eff6ff;
}
.group-result > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.group-result span {
  color: #667085;
}
.linked-note {
  color: #b54708 !important;
}
.multi-note {
  color: #175cd3 !important;
  font-weight: 700;
}
.info-item,
.link-item,
.contact-row,
.empty-state,
.error-state {
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: #fcfcfd;
  padding: 10px;
}
.info-item {
  display: grid;
  grid-template-columns: minmax(118px, 0.42fr) minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  min-height: 42px;
}
.info-item span {
  color: #667085;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
.info-item strong {
  white-space: pre-wrap;
  min-width: 0;
  overflow-wrap: anywhere;
}
.item-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.zalo-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, auto) auto auto;
  align-items: start;
  gap: 10px;
}
.zalo-card > div:first-child {
  min-width: 0;
}
.zalo-card > div:first-child span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zalo-card > div:first-child .mono,
.zalo-card > div:first-child span:nth-of-type(n + 3),
.zalo-card > div:first-child .multi-note {
  display: none;
}
.zalo-card-side-info {
  grid-column: 2;
  grid-row: 1;
  align-self: center;
  max-width: 280px;
  color: #667085;
  font-size: 13px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zalo-card-actions {
  grid-column: 3;
  grid-row: 1;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.zalo-card > .danger-btn {
  grid-column: 4;
  grid-row: 1;
}
.zalo-detail-grid {
  grid-column: 1 / -1;
  grid-row: 2;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
  border-top: 1px dashed #d0d5dd;
  padding-top: 8px;
}
.zalo-detail-grid span {
  display: grid;
  gap: 3px;
  min-width: 0;
  color: #475467;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.zalo-detail-grid b {
  color: #667085;
  font-size: 11px;
  text-transform: uppercase;
}
.contact-workspace {
  display: grid;
  gap: 10px;
}
.contact-panel {
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #f8fafc;
  padding: 10px;
}
.compact-head {
  margin-bottom: 8px;
}
.contact-create-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 8px;
  align-items: center;
}
.contact-create-grid input,
.contact-link-form input {
  min-height: 34px;
  min-width: 0;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #101828;
  padding: 0 10px;
}
.compact-check {
  min-height: 34px;
  padding: 0 4px;
}
.contact-existing-panel summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  list-style: none;
}
.contact-existing-panel summary::-webkit-details-marker {
  display: none;
}
.contact-existing-panel small {
  display: block;
  margin-top: 3px;
  color: #667085;
  font-size: 12px;
}
.existing-search-row {
  margin-top: 10px;
}
.contact-table-wrap {
  overflow: auto;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
}
.archive-toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(150px, 190px) minmax(150px, 190px) auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.archive-toolbar input,
.archive-toolbar select {
  height: 38px;
  min-width: 0;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #101828;
  padding: 0 10px;
}
.archive-table-wrap {
  overflow: auto;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
}
.contact-table {
  width: 100%;
  min-width: 1220px;
  border-collapse: collapse;
}
.archive-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}
.contact-table th,
.contact-table td,
.archive-table th,
.archive-table td {
  border-bottom: 1px solid #eef2f6;
  padding: 8px 10px;
  text-align: left;
  vertical-align: middle;
}
.contact-table tr:last-child td,
.archive-table tr:last-child td {
  border-bottom: 0;
}
.contact-table th,
.archive-table th {
  background: #f8fafc;
  color: #667085;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}
.contact-table td strong,
.contact-table td span,
.archive-table td strong,
.archive-table td span {
  display: block;
}
.archive-table td span {
  color: #667085;
}
.archive-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px;
  color: #475467;
}
.compact-zalo-text {
  max-width: 280px;
  overflow: hidden;
  color: #667085;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.strong-zalo-text {
  color: #101828;
  font-weight: 700;
}
.accepted-zalo-cell {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.accepted-zalo-cell .compact-zalo-text {
  flex: 0 1 auto;
}
.inline-detail-btn {
  min-height: 28px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 6px;
  background: #eff8ff;
  color: #175cd3;
  font-weight: 700;
  padding: 0 8px;
  cursor: pointer;
}
.inline-detail-btn:hover {
  background: #d1e9ff;
}
.contact-zalo-nick {
  max-width: 320px;
  color: #475467;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-link-btn {
  margin-top: 5px;
  border: 0;
  background: transparent;
  color: #175cd3;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.row-actions {
  text-align: right;
  white-space: nowrap;
}
.row-actions .compact-action {
  margin-right: 6px;
}
.icon-text-btn {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #344054;
  padding: 0 10px;
  font-weight: 700;
  cursor: pointer;
}
.primary-link-btn {
  border-color: #b2ddff;
  color: #175cd3;
  background: #eff8ff;
}
.compact-danger {
  min-height: 32px;
  padding: 0 10px;
}
.compact-action {
  min-height: 32px;
  height: 32px;
  padding: 0 10px;
}
.compact-empty {
  padding: 8px 10px;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  background: rgba(16, 24, 40, 0.42);
  padding: 20px;
}
.modal-card {
  width: min(720px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 20px 48px rgba(16, 24, 40, 0.22);
}
.contact-edit-modal {
  padding: 16px;
}
.accepted-zalo-modal {
  width: min(560px, 100%);
  padding: 16px;
}
.archive-preview-modal {
  width: min(920px, 100%);
  padding: 16px;
  overflow: hidden;
}
.archive-preview-head {
  margin-bottom: 0;
}
.archive-preview-head > div {
  min-width: 0;
}
.archive-preview-kicker {
  display: block;
  margin-bottom: 4px;
  color: #175cd3;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}
.archive-preview-body {
  max-height: calc(100vh - 230px);
  overflow: auto;
  padding: 14px 2px 2px;
}
.archive-preview-state {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #667085;
}
.archive-preview-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border-top: 1px solid #e4e7ec;
  border-left: 1px solid #e4e7ec;
}
.archive-preview-facts div {
  min-width: 0;
  border-right: 1px solid #e4e7ec;
  border-bottom: 1px solid #e4e7ec;
  padding: 9px 10px;
}
.archive-preview-facts span,
.archive-preview-facts strong {
  display: block;
}
.archive-preview-facts span {
  margin-bottom: 3px;
  color: #667085;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
.archive-preview-facts strong {
  overflow-wrap: anywhere;
}
.archive-preview-note {
  margin-top: 12px;
  border-left: 3px solid #84adff;
  background: #f5f8ff;
  padding: 9px 11px;
}
.archive-preview-note.result {
  border-left-color: #32d583;
  background: #ecfdf3;
}
.archive-preview-note p {
  margin: 4px 0 0;
  white-space: pre-wrap;
}
.archive-preview-messages {
  margin-top: 14px;
}
.archive-preview-messages > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e4e7ec;
  padding-bottom: 8px;
}
.archive-preview-messages > header span {
  color: #667085;
  font-size: 12px;
}
.archive-preview-message-list {
  display: grid;
  gap: 8px;
  padding-top: 10px;
}
.archive-preview-message-list article {
  max-width: 78%;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: #f8fafc;
  padding: 8px 10px;
}
.archive-preview-message-list article.is-staff {
  justify-self: end;
  background: #eff6ff;
  border-color: #b2ccff;
}
.archive-preview-message-list article > div {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}
.archive-preview-message-list time,
.archive-preview-message-list article > span {
  color: #667085;
  font-size: 11px;
}
.archive-preview-message-list p {
  margin: 5px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.archive-preview-recalled {
  display: block;
  margin-top: 5px;
  color: #b54708 !important;
}
.accepted-zalo-list {
  display: grid;
  gap: 8px;
}
.accepted-zalo-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  padding: 10px;
}
.accepted-zalo-option div {
  min-width: 0;
}
.accepted-zalo-option strong,
.accepted-zalo-option span {
  display: block;
}
.accepted-zalo-option span {
  color: #667085;
  font-size: 13px;
}
.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid #e4e7ec;
  padding-bottom: 12px;
  margin-bottom: 12px;
}
.modal-head h3 {
  margin: 0;
  font-size: 20px;
}
.modal-head p {
  margin: 4px 0 0;
  color: #667085;
  font-size: 13px;
}
.icon-only-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #344054;
  cursor: pointer;
}
.modal-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.modal-form-grid label {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.modal-form-grid label > span {
  color: #475467;
  font-size: 12px;
  font-weight: 700;
}
.modal-form-grid input,
.modal-form-grid textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #101828;
  padding: 8px 10px;
  box-sizing: border-box;
}
.modal-form-grid input {
  height: 36px;
}
.modal-form-grid textarea {
  resize: vertical;
}
.modal-wide {
  grid-column: 1 / -1;
}
.modal-check-row {
  display: inline-flex !important;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  color: #475467;
  font-weight: 700;
}
.modal-check-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  min-width: 16px;
  padding: 0;
  margin: 0;
  accent-color: #16a34a;
  cursor: pointer;
}
.modal-check-row span {
  color: #475467;
  font-size: 13px;
  line-height: 1.3;
}
.modal-check-row:has(input[type='checkbox']:checked) span {
  color: #067647;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid #e4e7ec;
  padding-top: 12px;
  margin-top: 14px;
}
.contact-link-form,
.contact-row-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}
.contact-link-form input,
.contact-link-form select,
.contact-row-actions input,
.contact-row-actions select {
  min-height: 36px;
  min-width: 0;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #101828;
  padding: 0 10px;
}
.contact-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.phone-lookup-card {
  display: grid;
  gap: 5px;
  margin-top: 10px;
  border: 1px solid #d0d5dd;
  border-radius: 7px;
  background: #fff;
  padding: 10px;
}
.phone-lookup-card > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.muted-note {
  color: #667085;
  font-size: 12px;
}
.selected-contact,
.contact-contexts {
  min-width: 0;
  color: #667085;
  font-size: 13px;
}
.selected-contact strong {
  display: block;
  color: #101828;
  overflow-wrap: anywhere;
}
.link-item,
.sync-summary {
  display: grid;
  gap: 5px;
}
.link-item {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}
.contact-row {
  justify-content: space-between;
}
.sync-layout {
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
.sync-summary {
  gap: 8px;
}
.summary-card,
.summary-note {
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: #fcfcfd;
  padding: 10px;
}
.summary-note {
  color: #475467;
  font-size: 13px;
  line-height: 1.45;
  background: #f8fafc;
}
.raw-table-wrap {
  min-width: 0;
  max-height: calc(100vh - 300px);
  overflow: auto;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: #fff;
}
.raw-table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
}
.raw-table th,
.raw-table td {
  border-bottom: 1px solid #e4e7ec;
  padding: 9px 11px;
  text-align: left;
  vertical-align: top;
}
.raw-table tr:last-child th,
.raw-table tr:last-child td {
  border-bottom: 0;
}
.raw-table th {
  width: 240px;
  background: #f8fafc;
  color: #667085;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}
.raw-table td {
  color: #101828;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 12px;
  font-weight: 700;
}
.status-pill.ok {
  background: #dcfae6;
  color: #067647;
}
.status-pill.warn {
  background: #fffaeb;
  color: #b54708;
}
.status-pill.neutral {
  background: #f2f4f7;
  color: #475467;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}
.empty-state {
  color: #667085;
}
.error-state {
  color: #b42318;
}
@media (max-width: 860px) {
  .profile-hero,
  .contact-row,
  .tool-head,
  .group-result,
  .link-item {
    display: block;
  }
  .primary-btn,
  .danger-btn {
    width: 100%;
    margin-top: 10px;
  }
  .overview-strip,
  .sync-layout,
  .archive-toolbar {
    grid-template-columns: 1fr;
  }
  .info-grid {
    grid-template-columns: 1fr;
  }
  .zalo-search-row,
  .zalo-search-row.group-search-row {
    grid-template-columns: 1fr;
  }
  .compact-inline-check {
    justify-self: start;
  }
  .info-item {
    grid-template-columns: 1fr;
  }
  .modal-form-grid {
    grid-template-columns: 1fr;
  }
  .archive-preview-facts {
    grid-template-columns: 1fr;
  }
  .archive-preview-message-list article {
    max-width: 94%;
  }
  .modal-actions {
    display: grid;
  }
  .modal-actions .ghost-btn,
  .modal-actions .primary-btn {
    width: 100%;
  }
  .hero-stats {
    justify-content: flex-start;
    margin-top: 12px;
  }
}
</style>
