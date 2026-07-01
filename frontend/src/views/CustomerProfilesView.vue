<template>
  <div class="customers-page">
    <header class="page-head">
      <div>
        <h1>Khách hàng</h1>
        <p>Hồ sơ khách hàng B2B, nguồn Google Sheet, mã nhân viên, phòng ban và loại hình đối chiếu.</p>
      </div>
      <button class="primary-btn" type="button" @click="activeTab = 'sources'">
        <v-icon size="18">mdi-google-spreadsheet</v-icon>
        Nguồn Sheet
      </button>
    </header>

    <nav class="tabs">
      <button :class="{ active: activeTab === 'profiles' }" @click="activeTab = 'profiles'">
        <v-icon size="17">mdi-domain</v-icon>
        Hồ sơ
      </button>
      <button :class="{ active: activeTab === 'sources' }" @click="activeTab = 'sources'">
        <v-icon size="17">mdi-sync</v-icon>
        Đồng bộ
      </button>
      <button :class="{ active: activeTab === 'types' }" @click="activeTab = 'types'">
        <v-icon size="17">mdi-shape-outline</v-icon>
        Loại hình
      </button>
    </nav>

    <section v-if="activeTab === 'profiles'" class="section-panel">
      <div class="toolbar">
        <label class="search-box">
          <v-icon size="17">mdi-magnify</v-icon>
          <input v-model="profileSearch" placeholder="Tìm mã, tên, MST, số điện thoại..." @input="queueLoadProfiles" />
        </label>
        <button class="ghost-btn" type="button" @click="showColumnSetup = !showColumnSetup">
          <v-icon size="17">mdi-view-column-outline</v-icon>
          Cột hiển thị
        </button>
        <button class="ghost-btn" :disabled="loadingProfiles" @click="loadProfiles">
          <v-icon size="17">mdi-refresh</v-icon>
        </button>
      </div>

      <div class="stats-line">
        <span>{{ profileTotal }} hồ sơ</span>
        <span>Đang xem {{ profilePageStart }}-{{ profilePageEnd }}</span>
        <span>{{ linkedGroupCount }} nhóm Zalo trong trang</span>
        <span>{{ linkedContactCount }} contact trong trang</span>
      </div>

      <div v-if="showColumnSetup" class="column-setup">
        <header>
          <strong>Thiết lập cột bảng tổng quan</strong>
          <button class="ghost-btn" type="button" @click="resetProfileColumns">Mặc định</button>
        </header>
        <div class="column-options">
          <label v-for="column in profileColumns" :key="column.key">
            <input
              type="checkbox"
              :checked="selectedProfileColumnKeys.includes(column.key)"
              @change="toggleProfileColumn(column.key)"
            />
            <span>{{ column.label }}</span>
          </label>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th v-for="column in visibleProfileColumns" :key="column.key">{{ column.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in profiles"
              :key="p.id"
              :class="['customer-row', { missing: p.missingFromSource }]"
              @click="openProfileDetail(p)"
            >
              <td v-for="column in visibleProfileColumns" :key="column.key" :class="profileCellClass(column)">
                {{ renderProfileCell(p, column) }}
              </td>
            </tr>
            <tr v-if="!loadingProfiles && profiles.length === 0">
              <td :colspan="visibleProfileColumns.length || 1" class="empty-cell">Chưa có hồ sơ khách hàng nào.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pagination-bar">
        <div class="page-size">
          <span>Dòng/trang</span>
          <select v-model.number="profilePageSize" @change="changeProfilePageSize">
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
            <option :value="200">200</option>
          </select>
        </div>
        <div class="page-controls">
          <button class="ghost-btn" :disabled="loadingProfiles || profilePage <= 1" @click="goProfilePage(1)">
            <v-icon size="17">mdi-page-first</v-icon>
          </button>
          <button class="ghost-btn" :disabled="loadingProfiles || profilePage <= 1" @click="goProfilePage(profilePage - 1)">
            <v-icon size="17">mdi-chevron-left</v-icon>
          </button>
          <span>Trang {{ profilePage }} / {{ profileTotalPages }}</span>
          <button class="ghost-btn" :disabled="loadingProfiles || profilePage >= profileTotalPages" @click="goProfilePage(profilePage + 1)">
            <v-icon size="17">mdi-chevron-right</v-icon>
          </button>
          <button class="ghost-btn" :disabled="loadingProfiles || profilePage >= profileTotalPages" @click="goProfilePage(profileTotalPages)">
            <v-icon size="17">mdi-page-last</v-icon>
          </button>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'sources'" class="section-panel two-col">
      <div class="source-column">
        <div class="credential-box">
          <header class="credential-head">
            <div>
              <h2>Credential Google</h2>
              <p>Service Account dùng để đọc Google Sheet khách hàng.</p>
            </div>
            <button class="ghost-btn" :disabled="loadingCredential" @click="loadGoogleCredential">
              <v-icon size="17">mdi-refresh</v-icon>
            </button>
          </header>
          <div class="credential-status">
            <span :class="['status-pill', googleCredential?.configured ? 'ok' : 'warn']">
              {{ googleCredential?.configured ? 'Đã cấu hình' : 'Chưa cấu hình' }}
            </span>
            <span v-if="googleCredential?.source && googleCredential.source !== 'none'">{{ googleCredential.source === 'crm' ? 'CRM' : 'ENV' }}</span>
            <span v-if="googleCredential?.clientEmail" class="mono">{{ googleCredential.clientEmail }}</span>
          </div>
          <p v-if="googleCredential?.clientEmail" class="field-hint">
            Share Google Sheet cho email service account này trước khi đồng bộ.
          </p>
          <div class="credential-file-row">
            <input
              ref="credentialFileInput"
              class="hidden-file-input"
              type="file"
              accept=".json,application/json"
              :disabled="!canConfigureGoogleCredential"
              @change="onCredentialFileChange"
            />
            <button class="ghost-btn" type="button" :disabled="!canConfigureGoogleCredential" @click="credentialFileInput?.click()">
              <v-icon size="17">mdi-file-upload-outline</v-icon>
              Chọn file JSON
            </button>
            <span v-if="credentialFileName" class="credential-file-name">{{ credentialFileName }}</span>
          </div>
          <label>
            Service Account JSON
            <textarea
              v-model="credentialJson"
              rows="7"
              placeholder="Dán toàn bộ JSON service account hoặc chuỗi base64 JSON"
              :disabled="!canConfigureGoogleCredential"
            />
          </label>
          <div class="form-actions">
            <button class="primary-btn" :disabled="savingCredential || !canConfigureGoogleCredential" @click="saveGoogleCredential">
              <v-icon size="18">mdi-shield-key-outline</v-icon>
              Lưu credential
            </button>
            <button class="ghost-btn" :disabled="testingCredential || !googleCredential?.configured" @click="testGoogleCredential">
              <v-icon size="17">mdi-connection</v-icon>
              Kiểm tra
            </button>
            <button v-if="googleCredential?.source === 'crm'" class="danger-btn" :disabled="savingCredential || !canConfigureGoogleCredential" @click="deleteGoogleCredential">
              <v-icon size="17">mdi-delete-outline</v-icon>
            </button>
          </div>
          <p v-if="!canConfigureGoogleCredential" class="field-hint">Owner hoặc admin mới được lưu credential.</p>
          <p v-if="credentialError" class="error-text">{{ credentialError }}</p>
          <p v-if="credentialNotice" class="notice-text">{{ credentialNotice }}</p>
        </div>

      <div v-if="sourcePermissions.create || editingSourceId" class="source-form">
        <h2>{{ editingSourceId ? 'Cập nhật nguồn Sheet' : 'Thêm nguồn Sheet' }}</h2>
        <label>Tên nguồn<input v-model="sourceForm.name" placeholder="VD: Danh sách khách hàng KD" /></label>
        <label>
          URL hoặc Spreadsheet ID
          <input
            v-model="sourceForm.spreadsheetId"
            placeholder="Dán URL Google Sheet hoặc ID sau /spreadsheets/d/"
            @blur="normalizeSheetUrlInForm"
          />
        </label>
        <p class="field-hint">
          Không dùng <code>gid</code> của tab. Ví dụ đúng: phần ID dài trong
          <code>docs.google.com/spreadsheets/d/&lt;ID&gt;/edit</code>.
        </p>
        <div class="form-grid">
          <label>Sheet name<input v-model="sourceForm.sheetName" placeholder="VD: KhachHang" /></label>
          <label>Range<input v-model="sourceForm.range" placeholder="A:O" /></label>
          <label>Header row<input v-model.number="sourceForm.headerRow" type="number" min="1" /></label>
          <label>
            Chế độ
            <select v-model="sourceForm.syncMode">
              <option value="manual">Thủ công</option>
              <option value="scheduled">Định kỳ</option>
            </select>
          </label>
        </div>
        <label>Cron định kỳ<input v-model="sourceForm.scheduleCron" placeholder="0 7 * * *" /></label>
        <div class="check-row">
          <input id="source-enabled" v-model="sourceForm.enabled" type="checkbox" />
          <label for="source-enabled">Nguồn đang hoạt động</label>
        </div>
        <div class="form-actions">
          <button
            class="primary-btn"
            :disabled="savingSource || (editingSourceId ? !sourcePermissions.edit : !sourcePermissions.create)"
            @click="saveSource"
          >
            <v-icon size="18">mdi-content-save-outline</v-icon>
            Lưu nguồn
          </button>
          <button v-if="editingSourceId" class="ghost-btn" @click="resetSourceForm">Hủy sửa</button>
        </div>
        <p v-if="sourceError" class="error-text">{{ sourceError }}</p>
        <p v-if="sourceNotice" class="notice-text">{{ sourceNotice }}</p>
      </div>
      </div>

      <div class="sources-list">
        <header class="list-head">
          <div>
            <h2>Nguồn đã cấu hình</h2>
            <div class="source-view-toggle" role="group" aria-label="Trạng thái nguồn đồng bộ">
              <button :class="{ active: sourceListMode === 'active' }" @click="setSourceListMode('active')">Đang sử dụng</button>
              <button :class="{ active: sourceListMode === 'archived' }" @click="setSourceListMode('archived')">Đã lưu trữ</button>
            </div>
          </div>
          <button class="ghost-btn" :disabled="loadingSources" @click="loadSources">
            <v-icon size="17">mdi-refresh</v-icon>
          </button>
        </header>
        <p v-if="sourceListMode === 'active'" class="list-hint">Sau khi lưu nguồn, bấm <strong>Đồng bộ ngay</strong> trên card nguồn để kéo dữ liệu khách hàng từ Sheet.</p>
        <p v-else class="list-hint">Nguồn lưu trữ không chạy đồng bộ và không làm mất hồ sơ khách hàng hay lịch sử đã có.</p>
        <p v-if="sourceError && !sourcePermissions.create && !editingSourceId" class="error-text">{{ sourceError }}</p>
        <p v-if="sourceNotice && !sourcePermissions.create && !editingSourceId" class="notice-text">{{ sourceNotice }}</p>
        <article v-for="s in sources" :key="s.id" :class="['source-card', { archived: Boolean(s.archivedAt) }]">
          <div class="source-main">
            <h3>{{ s.name }}</h3>
            <p>{{ s.spreadsheetId }} · {{ s.sheetName }}{{ s.range ? ` · ${s.range}` : '' }}</p>
            <div class="source-meta">
              <span v-if="s.archivedAt" class="status-pill warn">Đã lưu trữ</span>
              <span v-else :class="['status-pill', s.enabled ? 'ok' : 'muted-pill']">{{ s.enabled ? 'Active' : 'Off' }}</span>
              <span>{{ s.syncMode === 'scheduled' ? s.scheduleCron || 'scheduled' : 'manual' }}</span>
              <span>{{ s._count?.customerProfiles ?? 0 }} hồ sơ</span>
              <span>{{ s.lastSyncStatus || 'chưa sync' }}</span>
            </div>
            <p v-if="s.archivedAt" class="archive-note">
              {{ formatDate(s.archivedAt) }}<template v-if="s.archivedBy?.fullName"> · {{ s.archivedBy.fullName }}</template><template v-if="s.archiveReason"> · {{ s.archiveReason }}</template>
            </p>
            <p v-if="!looksLikeSpreadsheetId(s.spreadsheetId)" class="inline-warning">
              Spreadsheet ID có vẻ chưa đúng. Nếu đây là số như 1052006109 thì đó thường là gid của tab, không phải ID file.
            </p>
            <p v-if="s.lastSyncError" class="inline-warning">{{ s.lastSyncError }}</p>
          </div>
          <div class="card-actions">
            <button v-if="!s.archivedAt && sourcePermissions.edit" class="ghost-btn" :disabled="previewingSourceId === s.id || !s.enabled" @click="previewSource(s.id)">
              <v-icon size="17">mdi-table-eye</v-icon>
              {{ previewingSourceId === s.id ? 'Đang đọc' : 'Preview' }}
            </button>
            <button v-if="!s.archivedAt && sourcePermissions.syncNow" class="primary-btn" :disabled="syncingSourceId === s.id || !s.enabled" @click="syncSource(s.id)">
              <v-icon size="17">mdi-sync</v-icon>
              {{ syncingSourceId === s.id ? 'Đang đồng bộ' : 'Đồng bộ ngay' }}
            </button>
            <button v-if="!s.archivedAt && sourcePermissions.edit" class="ghost-btn" @click="editSource(s)">
              <v-icon size="17">mdi-pencil-outline</v-icon>
              Sửa
            </button>
            <div class="history-dropdown-wrap">
              <button class="ghost-btn" type="button" @click.stop="toggleSourceHistory(s)">
                <v-icon size="17">mdi-history</v-icon>
                Lịch sử
                <v-icon size="15">{{ expandedSourceHistoryId === s.id ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
              </button>
              <section v-if="expandedSourceHistoryId === s.id" class="history-dropdown" @click.stop>
                <div class="raw-head">
                  <strong>Lịch sử đồng bộ</strong>
                  <span>{{ sourceSyncRuns(s.id).length }} run</span>
                </div>
                <div v-if="loadingSyncRunsSourceId === s.id" class="history-loading">Đang tải lịch sử đồng bộ...</div>
                <template v-else>
                  <div v-if="visibleSourceSyncRuns(s.id).length" class="history-list">
                    <button
                      v-for="run in visibleSourceSyncRuns(s.id)"
                      :key="run.id"
                      type="button"
                      :class="['history-item', { active: selectedSyncRunId === run.id }]"
                      @click="openSyncRunSnapshots(s, run)"
                    >
                      <div class="history-main">
                        <strong>{{ run.triggerType === 'preview' ? 'Preview' : run.triggerType === 'manual' ? 'Đồng bộ tay' : run.triggerType }}</strong>
                        <span>{{ formatDate(run.startedAt) }}</span>
                      </div>
                      <div class="history-meta">
                        <span :class="['status-pill', syncRunStatusClass(run.status)]">{{ syncRunStatusLabel(run.status) }}</span>
                        <span>Tổng {{ run.totalRows ?? 0 }}</span>
                        <span>Tạo {{ run.createdCount ?? 0 }}</span>
                        <span>Cập nhật {{ run.updatedCount ?? 0 }}</span>
                        <span>Lỗi {{ run.errorCount ?? 0 }}</span>
                      </div>
                    </button>
                  </div>
                  <button
                    v-if="hasMoreSourceSyncRuns(s.id)"
                    class="ghost-btn history-more"
                    type="button"
                    @click="toggleSourceHistoryViewAll(s.id)"
                  >
                    <v-icon size="16">{{ sourceHistoryShowAllBySourceId[s.id] ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
                    {{ sourceHistoryShowAllBySourceId[s.id] ? 'Thu gọn' : `Xem thêm ${sourceSyncRuns(s.id).length - 5} run` }}
                  </button>
                  <div v-else-if="sourceSyncRuns(s.id).length === 0" class="empty-box history-empty">
                    Chưa có lịch sử đồng bộ cho nguồn này.
                  </div>
                </template>
              </section>
            </div>
            <button v-if="!s.archivedAt && sourcePermissions.delete" class="danger-btn" @click="archiveSource(s)">
              <v-icon size="17">mdi-archive-arrow-down-outline</v-icon>
              Lưu trữ
            </button>
            <button v-if="s.archivedAt && sourcePermissions.delete" class="ghost-btn" @click="restoreSource(s)">
              <v-icon size="17">mdi-archive-arrow-up-outline</v-icon>
              Khôi phục
            </button>
          </div>
        </article>
        <div v-if="!loadingSources && sources.length === 0" class="empty-box">
          {{ sourceListMode === 'active' ? 'Chưa có nguồn Google Sheet đang sử dụng.' : 'Chưa có nguồn nào được lưu trữ.' }}
        </div>

        <section v-if="selectedSyncRunId || previewingSourceId || snapshotRows.length" ref="snapshotPanelRef" class="snapshot-panel">
          <header class="snapshot-head">
            <div>
              <h3>Preview dữ liệu Sheet</h3>
              <p v-if="previewSourceContext">
                {{ previewingSourceId ? 'Đang đọc' : 'Đang xem' }}
                {{ previewSourceContext.name }}:
                {{ previewSourceContext.spreadsheetId }} · {{ previewSourceContext.sheetName }}{{ previewSourceContext.range ? ` · ${previewSourceContext.range}` : '' }}
              </p>
              <p v-else-if="previewingSourceId">Đang đọc dữ liệu preview từ Google Sheet...</p>
              <p v-else-if="snapshotRows.length">{{ snapshotRows.length }} dòng đã đọc. Tick dòng cần cập nhật hoặc áp dụng toàn bộ dòng hợp lệ.</p>
              <p v-else>Preview đã mở nhưng chưa có dòng dữ liệu để hiển thị.</p>
              <p v-if="selectedSyncRunId" class="mono preview-run-id">Run: {{ selectedSyncRunId }}</p>
            </div>
            <div class="snapshot-actions">
              <select v-model="snapshotApplyMode">
                <option value="update_safe">Update an toàn</option>
                <option value="overwrite_from_sheet">Ghi đè từ Sheet</option>
              </select>
              <button class="ghost-btn" :disabled="!selectedSyncRunId || Boolean(previewingSourceId)" @click="selectedSyncRunId && loadSnapshots(selectedSyncRunId)">
                <v-icon size="17">mdi-refresh</v-icon>
                Tải lại snapshot
              </button>
              <button class="ghost-btn" :disabled="applyingSnapshots || selectedSnapshotIds.length === 0" @click="applySnapshots('selected')">
                <v-icon size="17">mdi-checkbox-marked-outline</v-icon>
                Apply đã chọn
              </button>
              <button class="primary-btn" :disabled="applyingSnapshots" @click="applySnapshots('all_valid')">
                <v-icon size="17">mdi-database-import-outline</v-icon>
                Apply tất cả hợp lệ
              </button>
            </div>
          </header>
          <div v-if="previewingSourceId || previewSummary" class="preview-progress">
            <div class="progress-line">
              <span>{{ previewingSourceId ? 'Đang đọc Sheet' : 'Đã đọc xong' }}</span>
              <strong>{{ previewSummaryText }}</strong>
            </div>
            <div class="progress-track">
              <div class="progress-fill" :class="{ running: Boolean(previewingSourceId) }" :style="{ width: previewProgressWidth }"></div>
            </div>
            <div class="preview-metrics">
              <span>Tổng: {{ previewSummary?.totalRows ?? snapshotRows.length }}</span>
              <span>Snapshot: {{ previewSummary?.snapshotCount ?? snapshotRows.length }}</span>
              <span>Hợp lệ: {{ applicableSnapshotRows.length }}</span>
              <span>Lỗi: {{ previewSummary?.errorCount ?? snapshotErrorCount }}</span>
              <span>Bỏ qua: {{ previewSummary?.skippedCount ?? snapshotSkippedCount }}</span>
            </div>
          </div>
          <div v-if="selectedSyncRunId || snapshotRows.length" class="snapshot-toolbar">
            <label>
              Lọc dòng
              <select v-model="snapshotFilter" :disabled="loadingSnapshots" @change="changeSnapshotFilter">
                <option value="all">Tất cả</option>
                <option value="applicable">Có thể update/apply</option>
                <option value="blocked">Không thể update</option>
                <option value="invalid">Thiếu mã/tên</option>
                <option value="duplicate">Trùng mã</option>
                <option value="missing">Thiếu trên Sheet</option>
                <option value="new">Tạo mới</option>
                <option value="matched">Cập nhật</option>
                <option value="applied">Đã apply</option>
              </select>
            </label>
            <label>
              Dòng/trang
              <select v-model.number="snapshotPageSize" :disabled="loadingSnapshots" @change="changeSnapshotPageSize">
                <option :value="25">25</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
                <option :value="200">200</option>
              </select>
            </label>
            <div class="snapshot-page-info">
              {{ snapshotPageStart }}-{{ snapshotPageEnd }} / {{ snapshotTotal }} dòng
            </div>
            <div class="snapshot-page-controls">
              <button class="ghost-btn" :disabled="loadingSnapshots || snapshotPage <= 1" @click="goSnapshotPage(1)">
                <v-icon size="17">mdi-page-first</v-icon>
              </button>
              <button class="ghost-btn" :disabled="loadingSnapshots || snapshotPage <= 1" @click="goSnapshotPage(snapshotPage - 1)">
                <v-icon size="17">mdi-chevron-left</v-icon>
              </button>
              <span>Trang {{ snapshotPage }} / {{ snapshotTotalPages }}</span>
              <button class="ghost-btn" :disabled="loadingSnapshots || snapshotPage >= snapshotTotalPages" @click="goSnapshotPage(snapshotPage + 1)">
                <v-icon size="17">mdi-chevron-right</v-icon>
              </button>
              <button class="ghost-btn" :disabled="loadingSnapshots || snapshotPage >= snapshotTotalPages" @click="goSnapshotPage(snapshotTotalPages)">
                <v-icon size="17">mdi-page-last</v-icon>
              </button>
            </div>
          </div>
          <div v-if="snapshotRows.length" class="snapshot-table-wrap">
            <table class="snapshot-table">
              <thead>
                <tr>
                  <th class="check-col">
                    <input type="checkbox" :checked="allPreviewRowsSelected" @change="toggleAllSnapshotRows" />
                  </th>
                  <th>Dòng</th>
                  <th>Mã KH</th>
                  <th>Tên khách hàng</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                  <th>Lỗi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in snapshotRows" :key="row.id" :class="{ blocked: !canApplySnapshot(row) }">
                  <td class="check-col">
                    <input
                      type="checkbox"
                      :disabled="!canApplySnapshot(row)"
                      :checked="selectedSnapshotIds.includes(row.id)"
                      @change="toggleSnapshotRow(row.id)"
                    />
                  </td>
                  <td class="mono">{{ row.sourceRowNumber || '—' }}</td>
                  <td class="mono">{{ row.sourceRowKey || normalizedSnapshot(row).externalKey || '—' }}</td>
                  <td>{{ normalizedSnapshot(row).name || '—' }}</td>
                  <td><span :class="['status-pill', snapshotStatusClass(row.status)]">{{ snapshotStatusLabel(row.status) }}</span></td>
                  <td>{{ snapshotActionLabel(row.action) }}</td>
                  <td class="snapshot-error">{{ row.errorMessage || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="empty-box snapshot-empty">
            {{ loadingSnapshots ? 'Đang tải dữ liệu preview...' : 'Không có dòng preview phù hợp bộ lọc. Nếu Sheet vẫn có dữ liệu, hãy kiểm tra lại `Sheet name`, `Range` và cột mã khách hàng/tên khách hàng.' }}
          </div>
        </section>
      </div>
    </section>

    <section v-else class="section-panel two-col">
      <div class="source-form">
        <h2>Thêm loại hình</h2>
        <label>Mã loại hình<input v-model="typeForm.code" placeholder="VD: LDVN" /></label>
        <label>Tên loại hình<input v-model="typeForm.name" placeholder="VD: Doanh nghiệp Việt Nam" /></label>
        <label>Mô tả<input v-model="typeForm.description" placeholder="Ghi chú nội bộ" /></label>
        <button class="primary-btn" :disabled="savingType" @click="saveType">
          <v-icon size="18">mdi-plus</v-icon>
          Lưu loại hình
        </button>
        <p v-if="typeError" class="error-text">{{ typeError }}</p>
      </div>
      <div class="sources-list">
        <header class="list-head">
          <h2>Danh mục loại hình</h2>
          <button class="ghost-btn" :disabled="loadingTypes" @click="loadTypes">
            <v-icon size="17">mdi-refresh</v-icon>
          </button>
        </header>
        <article v-for="t in customerTypes" :key="t.id" class="type-row">
          <span class="mono">{{ t.code }}</span>
          <strong>{{ t.name }}</strong>
          <span :class="['status-pill', t.isActive ? 'ok' : 'muted-pill']">{{ t.isActive ? 'Active' : 'Off' }}</span>
        </article>
      </div>
    </section>

    <div v-if="selectedProfile" class="modal-backdrop" @click.self="closeProfileDetail">
      <article class="profile-modal">
        <header class="modal-head">
          <div>
            <span class="mono">{{ selectedProfile.code || selectedProfile.externalKey }}</span>
            <h2>{{ selectedProfile.name }}</h2>
            <p>{{ selectedProfile.shortName || selectedProfile.provinceOrRegion || 'Hồ sơ khách hàng' }}</p>
          </div>
          <button class="ghost-btn" type="button" @click="closeProfileDetail">
            <v-icon size="18">mdi-close</v-icon>
          </button>
        </header>

        <div class="modal-summary">
          <div>
            <span>MST / ĐT</span>
            <strong>{{ selectedProfile.taxCode || selectedProfile.mainPhone || selectedProfile.phone || '—' }}</strong>
          </div>
          <div>
            <span>Phụ trách</span>
            <strong>{{ selectedProfile.ownerUser?.fullName || selectedProfile.salesOwnerCodeSnapshot || '—' }}</strong>
          </div>
          <div>
            <span>Bộ phận</span>
            <strong>{{ selectedProfile.managingDepartment?.name || selectedProfile.managingDepartmentCodeSnapshot || '—' }}</strong>
          </div>
          <div>
            <span>Loại hình</span>
            <strong>{{ selectedProfile.customerType?.code || selectedProfile.customerTypeCodeSnapshot || '—' }}</strong>
          </div>
        </div>

        <section class="modal-section">
          <div class="raw-head">
            <strong>Liên kết CRM/Zalo</strong>
          </div>
          <div class="link-stats">
            <span><v-icon size="15">mdi-account-group-outline</v-icon>{{ selectedProfile._count?.zaloGroups ?? 0 }} nhóm Zalo</span>
            <span><v-icon size="15">mdi-account-outline</v-icon>{{ selectedProfile._count?.zaloUsers ?? 0 }} user Zalo</span>
            <span><v-icon size="15">mdi-card-account-phone-outline</v-icon>{{ selectedProfile._count?.contacts ?? 0 }} contact</span>
            <span><v-icon size="15">mdi-archive-outline</v-icon>{{ selectedProfile._count?.archiveStories ?? 0 }} hồ sơ lưu</span>
          </div>
        </section>

        <section class="modal-section">
          <div class="raw-head">
            <strong>Dữ liệu gốc từ Google Sheet</strong>
            <span>{{ sheetRawEntries(selectedProfile).length }} cột</span>
          </div>
          <div class="raw-grid">
            <div v-for="[key, value] in sheetRawEntries(selectedProfile)" :key="key" class="raw-item">
              <span>{{ key }}</span>
              <strong>{{ displayRawValue(value) }}</strong>
            </div>
          </div>
        </section>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';

type CustomerType = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
};

type CustomerProfile = {
  id: string;
  externalKey: string;
  code?: string | null;
  name: string;
  shortName?: string | null;
  phone?: string | null;
  mainPhone?: string | null;
  taxCode?: string | null;
  provinceOrRegion?: string | null;
  syncedAt?: string | null;
  missingFromSource: boolean;
  salesOwnerCodeSnapshot?: string | null;
  managingDepartmentCodeSnapshot?: string | null;
  customerTypeCodeSnapshot?: string | null;
  ownerUser?: { id: string; fullName: string } | null;
  managingDepartment?: { id: string; name: string } | null;
  customerType?: CustomerType | null;
  metadata?: { rawRow?: Record<string, unknown> } | null;
  _count?: { zaloGroups: number; zaloUsers: number; contacts: number; archiveStories: number };
};

type DataSource = {
  id: string;
  name: string;
  spreadsheetId: string;
  sheetName: string;
  range?: string | null;
  headerRow: number;
  enabled: boolean;
  syncMode: string;
  scheduleCron?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  lastSyncedAt?: string | null;
  archivedAt?: string | null;
  archiveReason?: string | null;
  archivedBy?: { id: string; fullName: string } | null;
  _count?: { syncRuns: number; customerProfiles: number };
};

type DataSourcePermissions = {
  access: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  syncNow: boolean;
};

type CustomerSourceSnapshot = {
  id: string;
  sourceRowNumber: number;
  sourceRowKey?: string | null;
  rawRow?: Record<string, unknown>;
  normalizedData?: Record<string, unknown>;
  status: string;
  action: string;
  errorMessage?: string | null;
  matchedCustomerProfileId?: string | null;
  appliedAt?: string | null;
};

type CustomerSyncSummary = {
  runId?: string;
  totalRows?: number;
  createdCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  snapshotCount?: number;
  missingCount?: number;
};

type CustomerSyncRun = {
  id: string;
  sourceId?: string;
  status: string;
  triggerType: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  totalRows?: number;
  createdCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  summary?: Record<string, any> | null;
  triggeredBy?: { id: string; fullName: string } | null;
};

type SnapshotFilter = 'all' | 'applicable' | 'blocked' | 'invalid' | 'duplicate' | 'missing' | 'new' | 'matched' | 'applied';

type GoogleCredentialStatus = {
  configured: boolean;
  source: 'crm' | 'env' | 'none';
  clientEmail?: string | null;
  projectId?: string | null;
  privateKeyId?: string | null;
  updatedAt?: string | null;
  error?: string;
};

type ProfileColumn = {
  key: string;
  label: string;
  rawKey?: string;
};

const PROFILE_COLUMNS_STORAGE_KEY = 'customer-profile-visible-columns';
const DEFAULT_PROFILE_COLUMN_KEYS = ['code', 'name', 'taxPhone', 'owner', 'department', 'type', 'zalo', 'sync'];
const CUSTOMER_SHEET_REQUEST_TIMEOUT_MS = 300000;

const activeTab = ref<'profiles' | 'sources' | 'types'>('profiles');
const router = useRouter();
const profiles = ref<CustomerProfile[]>([]);
const sources = ref<DataSource[]>([]);
const sourcePermissions = ref<DataSourcePermissions>({ access: false, create: false, edit: false, delete: false, syncNow: false });
const sourceListMode = ref<'active' | 'archived'>('active');
const customerTypes = ref<CustomerType[]>([]);
const googleCredential = ref<GoogleCredentialStatus | null>(null);
const canConfigureGoogleCredential = ref(false);
const credentialJson = ref('');
const credentialFileInput = ref<HTMLInputElement | null>(null);
const credentialFileName = ref('');
const selectedProfile = ref<CustomerProfile | null>(null);
const showColumnSetup = ref(false);
const selectedProfileColumnKeys = ref<string[]>(loadProfileColumnKeys());
const profileSearch = ref('');
const profilePage = ref(1);
const profilePageSize = ref(50);
const profileTotal = ref(0);
const loadingProfiles = ref(false);
const loadingSources = ref(false);
const loadingTypes = ref(false);
const loadingCredential = ref(false);
const savingSource = ref(false);
const savingCredential = ref(false);
const testingCredential = ref(false);
const syncingSourceId = ref('');
const previewingSourceId = ref('');
const previewSourceContextId = ref('');
const selectedSyncRunId = ref('');
const snapshotPanelRef = ref<HTMLElement | null>(null);
const snapshotRows = ref<CustomerSourceSnapshot[]>([]);
const selectedSnapshotIds = ref<string[]>([]);
const snapshotFilter = ref<SnapshotFilter>('all');
const snapshotPage = ref(1);
const snapshotPageSize = ref(50);
const snapshotTotal = ref(0);
const loadingSnapshots = ref(false);
const snapshotApplyMode = ref<'update_safe' | 'overwrite_from_sheet'>('update_safe');
const previewSummary = ref<CustomerSyncSummary | null>(null);
const applyingSnapshots = ref(false);
const savingType = ref(false);
const sourceError = ref('');
const sourceNotice = ref('');
const credentialError = ref('');
const credentialNotice = ref('');
const typeError = ref('');
const loadingSyncRunsSourceId = ref('');
const syncRunsBySourceId = ref<Record<string, CustomerSyncRun[]>>({});
const expandedSourceHistoryId = ref('');
const sourceHistoryShowAllBySourceId = ref<Record<string, boolean>>({});
let searchTimer: number | undefined;

const editingSourceId = ref('');
const sourceForm = ref({
  name: '',
  spreadsheetId: '',
  sheetName: '',
  range: '',
  headerRow: 1,
  syncMode: 'manual',
  scheduleCron: '',
  enabled: true,
});
const typeForm = ref({ code: '', name: '', description: '' });

const linkedGroupCount = computed(() => profiles.value.reduce((sum, p) => sum + (p._count?.zaloGroups ?? 0), 0));
const linkedContactCount = computed(() => profiles.value.reduce((sum, p) => sum + (p._count?.contacts ?? 0), 0));
const applicableSnapshotRows = computed(() => snapshotRows.value.filter(canApplySnapshot));
const snapshotErrorCount = computed(() => snapshotRows.value.filter((row) => ['invalid', 'duplicate'].includes(row.status)).length);
const snapshotSkippedCount = computed(() => snapshotRows.value.filter((row) => ['ignored', 'duplicate', 'invalid'].includes(row.status)).length);
const allPreviewRowsSelected = computed(() => (
  applicableSnapshotRows.value.length > 0
  && applicableSnapshotRows.value.every((row) => selectedSnapshotIds.value.includes(row.id))
));
const profileTotalPages = computed(() => Math.max(1, Math.ceil(profileTotal.value / profilePageSize.value)));
const profilePageStart = computed(() => profileTotal.value === 0 ? 0 : ((profilePage.value - 1) * profilePageSize.value) + 1);
const profilePageEnd = computed(() => Math.min(profileTotal.value, profilePage.value * profilePageSize.value));
const snapshotTotalPages = computed(() => Math.max(1, Math.ceil(snapshotTotal.value / snapshotPageSize.value)));
const snapshotPageStart = computed(() => snapshotTotal.value === 0 ? 0 : ((snapshotPage.value - 1) * snapshotPageSize.value) + 1);
const snapshotPageEnd = computed(() => Math.min(snapshotTotal.value, snapshotPage.value * snapshotPageSize.value));
const previewSummaryText = computed(() => {
  if (previewingSourceId.value) return 'Đang xử lý, vui lòng chờ...';
  const summary = previewSummary.value;
  if (!summary) return 'Chưa có preview';
  return `${summary.createdCount ?? 0} tạo mới, ${summary.updatedCount ?? 0} cập nhật, ${summary.skippedCount ?? 0} bỏ qua, ${summary.errorCount ?? 0} lỗi`;
});
const previewProgressWidth = computed(() => {
  if (previewingSourceId.value) return '45%';
  const total = previewSummary.value?.totalRows || snapshotRows.value.length;
  if (!total) return '0%';
  const done = previewSummary.value?.snapshotCount || snapshotRows.value.length;
  return `${Math.min(100, Math.round((done / total) * 100))}%`;
});
const previewSourceContext = computed(() => sources.value.find((source) => source.id === previewSourceContextId.value) || null);
const coreProfileColumns: ProfileColumn[] = [
  { key: 'code', label: 'Mã KH' },
  { key: 'name', label: 'Tên khách hàng' },
  { key: 'shortName', label: 'Tên viết tắt' },
  { key: 'taxPhone', label: 'MST / ĐT' },
  { key: 'province', label: 'Địa phương' },
  { key: 'owner', label: 'Phụ trách' },
  { key: 'department', label: 'Bộ phận' },
  { key: 'type', label: 'Loại hình' },
  { key: 'zalo', label: 'Zalo' },
  { key: 'sync', label: 'Sync' },
];
const rawProfileColumns = computed<ProfileColumn[]>(() => {
  const keys = new Set<string>();
  profiles.value.forEach((profile) => {
    Object.keys(profile.metadata?.rawRow || {}).forEach((key) => keys.add(key));
  });
  return [...keys].map((key) => ({ key: `raw:${key}`, label: key, rawKey: key }));
});
const profileColumns = computed(() => [...coreProfileColumns, ...rawProfileColumns.value]);
const visibleProfileColumns = computed(() => {
  const selected = selectedProfileColumnKeys.value.length ? selectedProfileColumnKeys.value : DEFAULT_PROFILE_COLUMN_KEYS;
  const visible = profileColumns.value.filter((column) => selected.includes(column.key));
  return visible.length ? visible : coreProfileColumns.filter((column) => DEFAULT_PROFILE_COLUMN_KEYS.includes(column.key));
});

onMounted(async () => {
  window.addEventListener('click', closeSourceHistoryDropdown);
  await Promise.all([loadProfiles(), loadSources(), loadTypes(), loadGoogleCredential()]);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', closeSourceHistoryDropdown);
});

watch(activeTab, (tab) => {
  if (tab === 'profiles') loadProfiles();
  if (tab === 'sources') {
    loadSources();
    loadGoogleCredential();
  }
  if (tab === 'types') loadTypes();
});

function queueLoadProfiles() {
  window.clearTimeout(searchTimer);
  profilePage.value = 1;
  searchTimer = window.setTimeout(() => loadProfiles(), 300);
}

async function loadProfiles() {
  loadingProfiles.value = true;
  try {
    const { data } = await api.get('/customer-profiles', {
      params: {
        q: profileSearch.value || undefined,
        page: profilePage.value,
        pageSize: profilePageSize.value,
      },
    });
    profiles.value = data.profiles ?? [];
    profileTotal.value = data.pagination?.total ?? profiles.value.length;
    const totalPages = data.pagination?.totalPages ?? profileTotalPages.value;
    if (profilePage.value > totalPages) {
      profilePage.value = Math.max(1, totalPages);
      await loadProfiles();
    }
  } finally {
    loadingProfiles.value = false;
  }
}

function goProfilePage(page: number) {
  const next = Math.min(Math.max(1, page), profileTotalPages.value);
  if (next === profilePage.value) return;
  profilePage.value = next;
  void loadProfiles();
}

function changeProfilePageSize() {
  profilePage.value = 1;
  void loadProfiles();
}

function resetSnapshotState(options: { keepFilter?: boolean } = {}) {
  snapshotRows.value = [];
  selectedSnapshotIds.value = [];
  snapshotTotal.value = 0;
  snapshotPage.value = 1;
  if (!options.keepFilter) snapshotFilter.value = 'all';
}

async function loadSources() {
  loadingSources.value = true;
  try {
    const { data } = await api.get('/customer-data-sources', { params: { archived: sourceListMode.value } });
    sources.value = data.sources ?? [];
    sourcePermissions.value = data.permissions ?? sourcePermissions.value;
  } catch (error: any) {
    sources.value = [];
    sourceError.value = error?.response?.data?.error || 'Không đọc được danh sách nguồn Sheet.';
  } finally {
    loadingSources.value = false;
  }
}

function setSourceListMode(mode: 'active' | 'archived') {
  if (sourceListMode.value === mode) return;
  sourceListMode.value = mode;
  sourceError.value = '';
  sourceNotice.value = '';
  resetSnapshotState();
  selectedSyncRunId.value = '';
  previewSummary.value = null;
  syncRunsBySourceId.value = {};
  sourceHistoryShowAllBySourceId.value = {};
  void loadSources();
}

async function loadTypes() {
  loadingTypes.value = true;
  try {
    const { data } = await api.get('/customer-types');
    customerTypes.value = data.types ?? [];
  } finally {
    loadingTypes.value = false;
  }
}

async function loadGoogleCredential() {
  loadingCredential.value = true;
  credentialError.value = '';
  try {
    const { data } = await api.get('/google-service-account');
    googleCredential.value = data.credential ?? null;
    canConfigureGoogleCredential.value = Boolean(data.canConfigure);
    if (googleCredential.value?.error) credentialError.value = googleCredential.value.error;
  } catch (error: any) {
    credentialError.value = error?.response?.data?.error || 'Không đọc được cấu hình Google credential.';
  } finally {
    loadingCredential.value = false;
  }
}

async function onCredentialFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  credentialError.value = '';
  credentialNotice.value = '';
  if (file.size > 1024 * 1024) {
    credentialError.value = 'File credential quá lớn. Hãy chọn đúng file JSON service account.';
    input.value = '';
    return;
  }
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('thiếu client_email hoặc private_key');
    }
    credentialJson.value = text;
    credentialFileName.value = file.name;
    credentialNotice.value = `Đã nạp file ${file.name}. Bấm "Lưu credential" để lưu vào CRM.`;
  } catch (error) {
    credentialError.value = `File JSON không hợp lệ: ${error instanceof Error ? error.message : String(error)}`;
    credentialJson.value = '';
    credentialFileName.value = '';
  } finally {
    input.value = '';
  }
}

async function saveGoogleCredential() {
  if (!credentialJson.value.trim()) {
    credentialError.value = 'Hãy dán Service Account JSON trước khi lưu.';
    return;
  }
  savingCredential.value = true;
  credentialError.value = '';
  credentialNotice.value = '';
  try {
    const { data } = await api.put('/google-service-account', { credentialJson: credentialJson.value.trim() });
    googleCredential.value = data.credential ?? null;
    credentialJson.value = '';
    credentialFileName.value = '';
    credentialNotice.value = 'Đã lưu credential. Hãy share Sheet cho client_email hiển thị ở trên rồi bấm Kiểm tra.';
  } catch (error: any) {
    credentialError.value = error?.response?.data?.error || 'Không lưu được Google credential.';
  } finally {
    savingCredential.value = false;
  }
}

async function testGoogleCredential() {
  testingCredential.value = true;
  credentialError.value = '';
  credentialNotice.value = '';
  try {
    const spreadsheetId = extractSpreadsheetId(sourceForm.value.spreadsheetId)
      || extractSpreadsheetId(sources.value[0]?.spreadsheetId || '');
    const { data } = await api.post('/google-service-account/test', { spreadsheetId });
    const title = data?.result?.spreadsheetTitle;
    credentialNotice.value = title
      ? `Kết nối Google OK, đọc được Sheet: ${title}.`
      : 'Kết nối Google OK. Hãy nhập nguồn Sheet rồi bấm Đồng bộ ngay.';
  } catch (error: any) {
    credentialError.value = error?.response?.data?.error || 'Không kiểm tra được Google credential.';
  } finally {
    testingCredential.value = false;
  }
}

async function deleteGoogleCredential() {
  if (!window.confirm('Xóa credential Google đang lưu trong CRM?')) return;
  savingCredential.value = true;
  credentialError.value = '';
  credentialNotice.value = '';
  try {
    const { data } = await api.delete('/google-service-account');
    googleCredential.value = data.credential ?? null;
    credentialNotice.value = 'Đã xóa credential lưu trong CRM.';
  } catch (error: any) {
    credentialError.value = error?.response?.data?.error || 'Không xóa được Google credential.';
  } finally {
    savingCredential.value = false;
  }
}

function resetSourceForm() {
  editingSourceId.value = '';
  sourceError.value = '';
  sourceNotice.value = '';
  sourceForm.value = {
    name: '',
    spreadsheetId: '',
    sheetName: '',
    range: '',
    headerRow: 1,
    syncMode: 'manual',
    scheduleCron: '',
    enabled: true,
  };
}

function editSource(source: DataSource) {
  editingSourceId.value = source.id;
  sourceError.value = '';
  sourceNotice.value = '';
  sourceForm.value = {
    name: source.name,
    spreadsheetId: source.spreadsheetId,
    sheetName: source.sheetName,
    range: source.range || '',
    headerRow: source.headerRow || 1,
    syncMode: source.syncMode || 'manual',
    scheduleCron: source.scheduleCron || '',
    enabled: source.enabled,
  };
}

async function saveSource() {
  const form = sourceForm.value;
  if (!form.name.trim() || !form.spreadsheetId.trim() || !form.sheetName.trim()) {
    sourceError.value = 'Tên nguồn, spreadsheetId và sheet name là bắt buộc.';
    return;
  }
  const spreadsheetId = extractSpreadsheetId(form.spreadsheetId);
  if (!spreadsheetId) {
    sourceError.value = 'Spreadsheet ID chưa đúng. Hãy dán URL Google Sheet hoặc ID dài sau /spreadsheets/d/. Số gid của tab không dùng để đồng bộ được.';
    return;
  }
  savingSource.value = true;
  sourceError.value = '';
  sourceNotice.value = '';
  try {
    const payload = {
      name: form.name.trim(),
      spreadsheetId,
      sheetName: form.sheetName.trim(),
      range: form.range.trim() || null,
      headerRow: Math.max(1, Number(form.headerRow || 1)),
      syncMode: form.syncMode,
      scheduleCron: form.scheduleCron.trim() || null,
      enabled: form.enabled,
    };
    if (editingSourceId.value) await api.patch(`/customer-data-sources/${editingSourceId.value}`, payload);
    else await api.post('/customer-data-sources', payload);
    resetSourceForm();
    sourceNotice.value = 'Đã lưu nguồn. Bấm "Đồng bộ ngay" ở card bên phải để kéo dữ liệu từ Sheet.';
    await loadSources();
  } catch (error: any) {
    sourceError.value = error?.response?.data?.error || 'Không lưu được nguồn Sheet.';
  } finally {
    savingSource.value = false;
  }
}

async function archiveSource(source: DataSource) {
  const reason = window.prompt(
    `Lưu trữ nguồn "${source.name}"?\n\nHồ sơ khách hàng và lịch sử đồng bộ vẫn được giữ nguyên. Có thể nhập lý do bên dưới:`,
    '',
  );
  if (reason === null) return;
  sourceError.value = '';
  sourceNotice.value = '';
  try {
    await api.post(`/customer-data-sources/${source.id}/archive`, { reason: reason.trim() || null });
    if (editingSourceId.value === source.id) resetSourceForm();
    resetSnapshotState();
    selectedSyncRunId.value = '';
    sourceNotice.value = `Đã lưu trữ nguồn "${source.name}". Hồ sơ CRM và lịch sử đồng bộ được giữ nguyên.`;
    await loadSources();
  } catch (error: any) {
    sourceError.value = error?.response?.data?.error || 'Không lưu trữ được nguồn Sheet.';
  }
}

async function restoreSource(source: DataSource) {
  if (!window.confirm(`Khôi phục nguồn "${source.name}"? Nguồn sẽ ở trạng thái tắt cho đến khi bạn chủ động bật lại.`)) return;
  sourceError.value = '';
  sourceNotice.value = '';
  try {
    await api.post(`/customer-data-sources/${source.id}/restore`);
    sourceNotice.value = `Đã khôi phục nguồn "${source.name}" ở trạng thái tắt.`;
    await loadSources();
  } catch (error: any) {
    sourceError.value = error?.response?.data?.error || 'Không khôi phục được nguồn Sheet.';
  }
}

async function syncSource(id: string) {
  syncingSourceId.value = id;
  sourceError.value = '';
  sourceNotice.value = '';
  try {
    const { data } = await api.post(`/customer-data-sources/${id}/sync`, undefined, { timeout: CUSTOMER_SHEET_REQUEST_TIMEOUT_MS });
    const result = data?.result;
    const syncErrors = (result?.errors ?? [])
      .slice(0, 5)
      .map((item: any) => `Dòng ${item.row ?? '?'}: ${item.error ?? 'Không đồng bộ được dòng này'}`)
      .join('\n');
    if (result) {
      sourceNotice.value = `Đồng bộ xong: ${result.createdCount ?? 0} tạo mới, ${result.updatedCount ?? 0} cập nhật, ${result.skippedCount ?? 0} bỏ qua, ${result.errorCount ?? 0} lỗi.`;
    } else {
      sourceNotice.value = 'Đồng bộ xong.';
    }
    if (syncErrors) sourceError.value = syncErrors;
    await Promise.all([loadSources(), loadProfiles()]);
    await loadSyncRuns(id);
  } catch (error: any) {
    sourceError.value = error?.code === 'ECONNABORTED'
      ? 'Đồng bộ Sheet chạy quá lâu so với thời gian chờ của trình duyệt. Hãy thử lại hoặc thu hẹp range.'
      : error?.response?.data?.error || 'Không đồng bộ được nguồn Sheet.';
  } finally {
    syncingSourceId.value = '';
  }
}

async function previewSource(id: string) {
  previewingSourceId.value = id;
  previewSourceContextId.value = id;
  sourceError.value = '';
  sourceNotice.value = '';
  resetSnapshotState();
  selectedSyncRunId.value = '';
  previewSummary.value = null;
  expandedSourceHistoryId.value = '';
  try {
    const { data } = await api.post(`/customer-data-sources/${id}/preview`, undefined, { timeout: CUSTOMER_SHEET_REQUEST_TIMEOUT_MS });
    const result = data?.result;
    previewSummary.value = result ?? null;
    selectedSyncRunId.value = result?.runId || '';
    sourceNotice.value = result
      ? `Preview xong: ${result.totalRows ?? 0} dòng, dự kiến ${result.createdCount ?? 0} tạo mới, ${result.updatedCount ?? 0} cập nhật, ${result.missingCount ?? 0} thiếu trên Sheet, ${result.errorCount ?? 0} lỗi.`
      : 'Preview xong.';
    if (selectedSyncRunId.value) {
      await loadSnapshots(selectedSyncRunId.value);
      await nextTick();
      snapshotPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      await loadSyncRuns(id);
    }
  } catch (error: any) {
    sourceError.value = error?.code === 'ECONNABORTED'
      ? 'Preview Sheet chạy quá lâu so với thời gian chờ của trình duyệt. Backend có thể vẫn đang xử lý; hãy mở Lịch sử sau vài phút để xem run mới nhất.'
      : error?.response?.data?.error || 'Không đọc preview nguồn Sheet.';
  } finally {
    previewingSourceId.value = '';
  }
}

async function loadSyncRuns(sourceId: string) {
  loadingSyncRunsSourceId.value = sourceId;
  try {
    const { data } = await api.get(`/customer-data-sources/${sourceId}/sync-runs`);
    syncRunsBySourceId.value = {
      ...syncRunsBySourceId.value,
      [sourceId]: data.runs ?? [],
    };
  } catch (error: any) {
    sourceError.value = error?.response?.data?.error || 'Không đọc được lịch sử đồng bộ.';
  } finally {
    loadingSyncRunsSourceId.value = '';
  }
}

function toggleSourceHistory(source: DataSource) {
  if (expandedSourceHistoryId.value === source.id) {
    expandedSourceHistoryId.value = '';
    return;
  }
  expandedSourceHistoryId.value = source.id;
  sourceHistoryShowAllBySourceId.value = {
    ...sourceHistoryShowAllBySourceId.value,
    [source.id]: false,
  };
  void loadSyncRuns(source.id);
}

function closeSourceHistoryDropdown() {
  expandedSourceHistoryId.value = '';
}

function sourceSyncRuns(sourceId: string): CustomerSyncRun[] {
  return syncRunsBySourceId.value[sourceId] || [];
}

function visibleSourceSyncRuns(sourceId: string): CustomerSyncRun[] {
  const runs = sourceSyncRuns(sourceId);
  return sourceHistoryShowAllBySourceId.value[sourceId] ? runs : runs.slice(0, 5);
}

function hasMoreSourceSyncRuns(sourceId: string): boolean {
  return sourceSyncRuns(sourceId).length > 5;
}

function toggleSourceHistoryViewAll(sourceId: string) {
  sourceHistoryShowAllBySourceId.value = {
    ...sourceHistoryShowAllBySourceId.value,
    [sourceId]: !sourceHistoryShowAllBySourceId.value[sourceId],
  };
}

async function openSyncRunSnapshots(source: DataSource, run: CustomerSyncRun) {
  expandedSourceHistoryId.value = '';
  previewSourceContextId.value = source.id;
  resetSnapshotState();
  selectedSyncRunId.value = run.id;
  previewSummary.value = {
    runId: run.id,
    totalRows: run.totalRows,
    createdCount: run.createdCount,
    updatedCount: run.updatedCount,
    skippedCount: run.skippedCount,
    errorCount: run.errorCount,
    snapshotCount: Number((run.summary as any)?.snapshotCount || 0) || undefined,
    missingCount: Number((run.summary as any)?.missingCount || 0) || undefined,
  };
  sourceNotice.value = `Đang mở lịch sử run ${formatDate(run.startedAt)}.`;
  await loadSnapshots(run.id);
  await nextTick();
  snapshotPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function snapshotFilterParams(): Record<string, string> {
  if (snapshotFilter.value === 'applicable') return { view: 'applicable' };
  if (snapshotFilter.value === 'blocked') return { view: 'blocked' };
  if (snapshotFilter.value === 'all') return { view: 'all' };
  return { status: snapshotFilter.value };
}

async function loadSnapshots(syncRunId: string) {
  loadingSnapshots.value = true;
  try {
    const { data } = await api.get(`/customer-sync-runs/${syncRunId}/snapshots`, {
      params: {
        page: snapshotPage.value,
        pageSize: snapshotPageSize.value,
        ...snapshotFilterParams(),
      },
      timeout: CUSTOMER_SHEET_REQUEST_TIMEOUT_MS,
    });
    snapshotRows.value = data.snapshots ?? [];
    snapshotTotal.value = data.pagination?.total ?? snapshotRows.value.length;
    const totalPages = data.pagination?.totalPages ?? snapshotTotalPages.value;
    if (snapshotPage.value > totalPages) {
      snapshotPage.value = Math.max(1, totalPages);
      await loadSnapshots(syncRunId);
      return;
    }
    selectedSnapshotIds.value = applicableSnapshotRows.value.map((row) => row.id);
  } finally {
    loadingSnapshots.value = false;
  }
}

function changeSnapshotFilter() {
  snapshotPage.value = 1;
  selectedSnapshotIds.value = [];
  if (selectedSyncRunId.value) void loadSnapshots(selectedSyncRunId.value);
}

function changeSnapshotPageSize() {
  snapshotPage.value = 1;
  selectedSnapshotIds.value = [];
  if (selectedSyncRunId.value) void loadSnapshots(selectedSyncRunId.value);
}

function goSnapshotPage(page: number) {
  const next = Math.min(Math.max(1, page), snapshotTotalPages.value);
  if (next === snapshotPage.value) return;
  snapshotPage.value = next;
  selectedSnapshotIds.value = [];
  if (selectedSyncRunId.value) void loadSnapshots(selectedSyncRunId.value);
}

function normalizedSnapshot(row: CustomerSourceSnapshot): Record<string, any> {
  return (row.normalizedData || {}) as Record<string, any>;
}

function canApplySnapshot(row: CustomerSourceSnapshot): boolean {
  return !['invalid', 'duplicate', 'ignored'].includes(row.status);
}

function toggleSnapshotRow(id: string) {
  const current = new Set(selectedSnapshotIds.value);
  if (current.has(id)) current.delete(id);
  else current.add(id);
  selectedSnapshotIds.value = [...current];
}

function toggleAllSnapshotRows() {
  if (allPreviewRowsSelected.value) {
    selectedSnapshotIds.value = [];
    return;
  }
  selectedSnapshotIds.value = applicableSnapshotRows.value.map((row) => row.id);
}

async function applySnapshots(scope: 'selected' | 'all_valid') {
  if (!selectedSyncRunId.value) {
    sourceError.value = 'Chưa có preview để apply.';
    return;
  }
  if (scope === 'selected' && selectedSnapshotIds.value.length === 0) {
    sourceError.value = 'Hãy chọn ít nhất một dòng để apply.';
    return;
  }
  if (
    snapshotApplyMode.value === 'overwrite_from_sheet'
    && !window.confirm('Ghi đè từ Sheet có thể thay đổi nhiều field trên CRM. Tiếp tục apply?')
  ) {
    return;
  }
  applyingSnapshots.value = true;
  sourceError.value = '';
  sourceNotice.value = '';
  try {
    const { data } = await api.post(`/customer-source-snapshots/${selectedSyncRunId.value}/apply`, {
      mode: snapshotApplyMode.value,
      scope,
      snapshotRowIds: scope === 'selected' ? selectedSnapshotIds.value : undefined,
      allowClearBlankFields: false,
    });
    const result = data?.result;
    sourceNotice.value = result
      ? `Apply xong: ${result.createdCount ?? 0} tạo mới, ${result.updatedCount ?? 0} cập nhật, ${result.missingCount ?? 0} đánh dấu thiếu, ${result.skippedCount ?? 0} bỏ qua, ${result.errorCount ?? 0} lỗi.`
      : 'Apply xong.';
    await Promise.all([loadSnapshots(selectedSyncRunId.value), loadSources(), loadProfiles()]);
  } catch (error: any) {
    sourceError.value = error?.response?.data?.error || 'Không apply được dữ liệu preview vào CRM.';
  } finally {
    applyingSnapshots.value = false;
  }
}

function snapshotStatusLabel(status: string): string {
  const map: Record<string, string> = {
    new: 'Mới',
    matched: 'Đã khớp',
    changed: 'Có đổi',
    missing: 'Thiếu Sheet',
    duplicate: 'Trùng mã',
    invalid: 'Lỗi',
    applied: 'Đã apply',
    ignored: 'Bỏ qua',
  };
  return map[status] || status;
}

function snapshotStatusClass(status: string): string {
  if (status === 'applied' || status === 'new' || status === 'matched') return 'ok';
  if (status === 'missing') return 'warn';
  if (status === 'duplicate' || status === 'invalid') return 'error-pill';
  return 'muted-pill';
}

function snapshotActionLabel(action: string): string {
  const map: Record<string, string> = {
    create: 'Tạo mới',
    update: 'Cập nhật',
    overwrite: 'Ghi đè',
    mark_missing: 'Đánh dấu thiếu',
    no_op: 'Không xử lý',
  };
  return map[action] || action;
}

function syncRunStatusLabel(status: string): string {
  const map: Record<string, string> = {
    running: 'Đang chạy',
    previewed: 'Preview',
    success: 'Hoàn tất',
    partial: 'Một phần',
    failed: 'Lỗi',
  };
  return map[status] || status;
}

function syncRunStatusClass(status: string): string {
  if (status === 'success' || status === 'previewed') return 'ok';
  if (status === 'partial') return 'warn';
  if (status === 'failed') return 'error-pill';
  return 'muted-pill';
}

function extractSpreadsheetId(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const urlMatch = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const id = urlMatch?.[1] || text;
  return /^[a-zA-Z0-9-_]{20,}$/.test(id) ? id : null;
}

function normalizeSheetUrlInForm() {
  const id = extractSpreadsheetId(sourceForm.value.spreadsheetId);
  if (id) sourceForm.value.spreadsheetId = id;
}

function looksLikeSpreadsheetId(value: string): boolean {
  return Boolean(extractSpreadsheetId(value));
}

function sheetRawEntries(profile: CustomerProfile): Array<[string, unknown]> {
  return Object.entries(profile.metadata?.rawRow || {});
}

function displayRawValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function loadProfileColumnKeys(): string[] {
  try {
    const saved = window.localStorage.getItem(PROFILE_COLUMNS_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? parsed
      : [...DEFAULT_PROFILE_COLUMN_KEYS];
  } catch {
    return [...DEFAULT_PROFILE_COLUMN_KEYS];
  }
}

function saveProfileColumnKeys() {
  window.localStorage.setItem(PROFILE_COLUMNS_STORAGE_KEY, JSON.stringify(selectedProfileColumnKeys.value));
}

function toggleProfileColumn(key: string) {
  const current = new Set(selectedProfileColumnKeys.value);
  if (current.has(key)) current.delete(key);
  else current.add(key);
  selectedProfileColumnKeys.value = [...current];
  saveProfileColumnKeys();
}

function resetProfileColumns() {
  selectedProfileColumnKeys.value = [...DEFAULT_PROFILE_COLUMN_KEYS];
  saveProfileColumnKeys();
}

function renderProfileCell(profile: CustomerProfile, column: ProfileColumn): string {
  if (column.rawKey) return displayRawValue(profile.metadata?.rawRow?.[column.rawKey]);
  switch (column.key) {
    case 'code':
      return profile.code || profile.externalKey || '—';
    case 'name':
      return [profile.name, profile.shortName || profile.provinceOrRegion].filter(Boolean).join('\n');
    case 'shortName':
      return profile.shortName || '—';
    case 'taxPhone':
      return [profile.taxCode, profile.mainPhone || profile.phone].filter(Boolean).join('\n') || '—';
    case 'province':
      return profile.provinceOrRegion || '—';
    case 'owner':
      return profile.ownerUser?.fullName || profile.salesOwnerCodeSnapshot || '—';
    case 'department':
      return profile.managingDepartment?.name || profile.managingDepartmentCodeSnapshot || '—';
    case 'type':
      return profile.customerType?.code || profile.customerTypeCodeSnapshot || '—';
    case 'zalo':
      return `Nhóm ${profile._count?.zaloGroups ?? 0} · User ${profile._count?.zaloUsers ?? 0} · Contact ${profile._count?.contacts ?? 0}`;
    case 'sync':
      return `${profile.missingFromSource ? 'Thiếu trên Sheet' : 'Đang theo dõi'}\n${formatDate(profile.syncedAt)}`;
    default:
      return '—';
  }
}

function profileCellClass(column: ProfileColumn): Record<string, boolean> {
  return {
    mono: column.key === 'code',
    'cell-multiline': true,
    'cell-raw': Boolean(column.rawKey),
  };
}

function openProfileDetail(profile: CustomerProfile) {
  void router.push(`/customers/${profile.id}`);
}

function closeProfileDetail() {
  selectedProfile.value = null;
}

async function saveType() {
  if (!typeForm.value.code.trim() || !typeForm.value.name.trim()) {
    typeError.value = 'Mã và tên loại hình là bắt buộc.';
    return;
  }
  savingType.value = true;
  typeError.value = '';
  try {
    await api.post('/customer-types', {
      code: typeForm.value.code.trim(),
      name: typeForm.value.name.trim(),
      description: typeForm.value.description.trim() || null,
    });
    typeForm.value = { code: '', name: '', description: '' };
    await loadTypes();
  } catch (error: any) {
    typeError.value = error?.response?.data?.error || 'Không lưu được loại hình.';
  } finally {
    savingType.value = false;
  }
}

function formatDate(value?: string | null): string {
  if (!value) return 'Chưa sync';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
</script>

<style scoped>
.customers-page {
  padding: 18px 22px 32px;
  color: #1f2937;
  background: #f6f7f9;
  min-height: 100%;
}
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.page-head h1,
.section-panel h2,
.source-card h3 {
  margin: 0;
}
.page-head h1 {
  font-size: 25px;
  font-weight: 650;
}
.page-head p {
  margin: 6px 0 0;
  color: #667085;
}
.tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid #dde2ea;
  margin-bottom: 14px;
}
.tabs button,
.primary-btn,
.ghost-btn,
.danger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid transparent;
  height: 34px;
  padding: 0 12px;
  font-weight: 600;
  cursor: pointer;
}
.tabs button {
  background: transparent;
  color: #667085;
  border-radius: 6px 6px 0 0;
}
.tabs button.active {
  color: #0f172a;
  background: white;
  border-color: #dde2ea;
  border-bottom-color: white;
}
.primary-btn {
  background: #1f6feb;
  color: white;
  border-radius: 6px;
}
.ghost-btn {
  background: white;
  color: #344054;
  border-color: #d0d5dd;
  border-radius: 6px;
}
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  margin-top: 6px;
  padding: 0 8px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #344054;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.danger-btn {
  background: white;
  color: #b42318;
  border-color: #fecdca;
  border-radius: 6px;
}
.section-panel {
  background: white;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  padding: 14px;
}
.two-col {
  display: grid;
  grid-template-columns: minmax(280px, 420px) minmax(0, 1fr);
  gap: 16px;
}
.toolbar,
.list-head,
.form-actions,
.source-meta,
.card-actions,
.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar {
  justify-content: space-between;
  margin-bottom: 10px;
}
.search-box {
  flex: 1;
  max-width: 520px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  padding: 0 10px;
  height: 36px;
}
.search-box input,
.source-form input,
.source-form select {
  border: 0;
  outline: 0;
  width: 100%;
  background: transparent;
}
.stats-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  color: #667085;
  font-size: 13px;
}
.stats-line span {
  background: #f2f4f7;
  border-radius: 999px;
  padding: 4px 10px;
}
.column-setup {
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: #f8fafc;
  padding: 12px;
  margin-bottom: 10px;
}
.column-setup header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.column-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}
.column-options label {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  padding: 5px 8px;
  border: 1px solid #e4e7ec;
  border-radius: 6px;
  background: white;
  color: #344054;
  font-size: 13px;
}
.table-wrap {
  overflow: auto;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
}
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  color: #475467;
  font-size: 13px;
}
.page-size,
.page-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-size select {
  height: 32px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: white;
  color: #344054;
  font-weight: 600;
}
.page-controls .ghost-btn {
  width: 34px;
  padding: 0;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 980px;
}
th,
td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid #edf0f4;
  vertical-align: middle;
}
th {
  background: #f8fafc;
  font-size: 11px;
  text-transform: uppercase;
  color: #475467;
  letter-spacing: 0.03em;
}
tbody tr.missing {
  background: #fff8eb;
}
.customer-row {
  cursor: pointer;
}
.customer-row:hover {
  background: #f8fafc;
}
.cell-multiline {
  white-space: pre-line;
  min-width: 120px;
}
.cell-raw {
  max-width: 300px;
  word-break: break-word;
}
.detail-row td {
  background: #f8fafc;
  padding: 12px;
}
.raw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: #344054;
}
.raw-head span {
  color: #667085;
  font-size: 12px;
}
.raw-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}
.raw-item {
  min-width: 0;
  border: 1px solid #e4e7ec;
  border-radius: 6px;
  background: white;
  padding: 8px 10px;
}
.raw-item span,
.raw-item strong {
  display: block;
}
.raw-item span {
  color: #667085;
  font-size: 11px;
  text-transform: uppercase;
}
.raw-item strong {
  margin-top: 4px;
  color: #101828;
  font-size: 13px;
  font-weight: 600;
  white-space: pre-wrap;
  word-break: break-word;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 44px 18px;
  background: rgba(15, 23, 42, 0.45);
  overflow: auto;
}
.profile-modal {
  width: min(1120px, 100%);
  max-height: calc(100vh - 88px);
  overflow: auto;
  border-radius: 8px;
  background: white;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.25);
}
.modal-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #e4e7ec;
  background: white;
}
.modal-head h2,
.modal-head p {
  margin: 0;
}
.modal-head h2 {
  margin-top: 4px;
  font-size: 21px;
}
.modal-head p {
  margin-top: 5px;
  color: #667085;
}
.modal-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
  padding: 16px 20px 0;
}
.modal-summary div {
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  padding: 10px 12px;
  background: #f8fafc;
}
.modal-summary span,
.modal-summary strong {
  display: block;
}
.modal-summary span {
  color: #667085;
  font-size: 12px;
}
.modal-summary strong {
  margin-top: 4px;
  color: #101828;
}
.modal-section {
  padding: 16px 20px 20px;
}
.link-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.link-stats span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  background: #eef4ff;
  color: #1849a9;
  padding: 5px 10px;
  font-size: 13px;
}
.muted {
  color: #667085;
  font-size: 12px;
}
.mono {
  font-family: "JetBrains Mono", "SF Mono", Consolas, monospace;
}
.chip,
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 12px;
  background: #eef4ff;
  color: #1849a9;
  white-space: nowrap;
}
.chip.soft {
  background: #f2f4f7;
  color: #475467;
}
.status-pill.ok {
  background: #ecfdf3;
  color: #027a48;
}
.status-pill.warn {
  background: #fffaeb;
  color: #b54708;
}
.status-pill.error-pill {
  background: #fef3f2;
  color: #b42318;
}
.status-pill.muted-pill {
  background: #f2f4f7;
  color: #475467;
}
.zalo-counts {
  display: flex;
  gap: 8px;
  white-space: nowrap;
}
.zalo-counts span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.empty-cell,
.empty-box {
  text-align: center;
  color: #667085;
  padding: 28px 12px;
}
.source-form,
.source-column,
.sources-list {
  min-width: 0;
}
.source-column {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.credential-box {
  border-bottom: 1px solid #e4e7ec;
  padding-bottom: 16px;
}
.credential-head,
.credential-status {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.credential-head {
  justify-content: space-between;
}
.credential-head h2,
.credential-head p {
  margin: 0;
}
.credential-head p {
  margin-top: 5px;
  color: #667085;
  font-size: 13px;
}
.credential-status {
  flex-wrap: wrap;
  align-items: center;
  margin-top: 10px;
  color: #667085;
  font-size: 12px;
}
.credential-file-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.hidden-file-input {
  display: none;
}
.credential-file-name {
  max-width: 100%;
  color: #475467;
  font-size: 12px;
  word-break: break-all;
}
.source-form label {
  display: block;
  margin-top: 11px;
  color: #475467;
  font-size: 12px;
  font-weight: 600;
}
.source-form input,
.source-form select,
.credential-box textarea {
  display: block;
  margin-top: 5px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  padding: 0 10px;
  color: #101828;
}
.source-form input,
.source-form select {
  height: 36px;
}
.credential-box label {
  display: block;
  margin-top: 11px;
  color: #475467;
  font-size: 12px;
  font-weight: 600;
}
.credential-box textarea {
  width: 100%;
  min-height: 128px;
  padding: 9px 10px;
  resize: vertical;
  font-family: "JetBrains Mono", "SF Mono", Consolas, monospace;
  font-size: 12px;
  outline: 0;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 10px;
}
.check-row {
  margin-top: 12px;
}
.check-row input {
  width: auto;
  height: auto;
  margin: 0;
}
.check-row label {
  margin: 0;
}
.form-actions {
  margin-top: 14px;
}
.error-text {
  color: #b42318;
  font-size: 13px;
  white-space: pre-line;
}
.notice-text {
  color: #027a48;
  font-size: 13px;
}
.field-hint,
.list-hint {
  color: #667085;
  font-size: 12px;
  line-height: 1.45;
}
.field-hint {
  margin: 6px 0 0;
}
.field-hint code {
  background: #f2f4f7;
  border-radius: 4px;
  padding: 1px 4px;
}
.list-hint {
  margin: 6px 0 10px;
}
.source-card,
.type-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  padding: 12px;
  margin-top: 10px;
}
.source-main {
  min-width: 0;
}
.source-card p {
  margin: 5px 0 8px;
  color: #667085;
  word-break: break-all;
}
.source-card .inline-warning {
  color: #b54708;
  background: #fffaeb;
  border-radius: 6px;
  padding: 6px 8px;
  margin: 8px 0 0;
}
.source-card.archived {
  background: #f8fafc;
}
.archive-note {
  color: #667085 !important;
  font-size: 12px;
}
.source-view-toggle {
  display: inline-flex;
  margin-top: 9px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  overflow: hidden;
}
.source-view-toggle button {
  height: 30px;
  border: 0;
  border-right: 1px solid #d0d5dd;
  padding: 0 10px;
  background: white;
  color: #475467;
  cursor: pointer;
}
.source-view-toggle button:last-child {
  border-right: 0;
}
.source-view-toggle button.active {
  background: #eef4ff;
  color: #1849a9;
  font-weight: 600;
}
.source-meta {
  flex-wrap: wrap;
  color: #667085;
  font-size: 12px;
}
.card-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  min-width: 172px;
}
.snapshot-panel {
  margin-top: 14px;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: #fcfcfd;
  padding: 12px;
}
.snapshot-empty {
  margin-top: 10px;
  color: #667085;
}
.history-dropdown-wrap {
  position: relative;
  display: inline-flex;
}
.history-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 40;
  width: min(420px, calc(100vw - 40px));
  max-height: 520px;
  overflow: auto;
  padding: 10px;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 18px 44px rgba(16, 24, 40, 0.18);
}
.history-loading,
.history-empty {
  margin-top: 8px;
}
.history-list {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}
.history-more {
  margin-top: 8px;
  width: 100%;
}
.history-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #d0d5dd;
  border-radius: 7px;
  background: #fff;
  color: #344054;
  text-align: left;
  cursor: pointer;
}
.history-item.active {
  border-color: #1f6feb;
  background: #eef4ff;
}
.history-main,
.history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}
.history-main {
  align-items: center;
  justify-content: space-between;
}
.history-main strong {
  color: #101828;
}
.history-main span {
  color: #667085;
  font-size: 12px;
}
.history-meta {
  color: #667085;
  font-size: 12px;
}
.preview-progress {
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: white;
  padding: 10px;
  margin-bottom: 10px;
}
.progress-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #475467;
  font-size: 13px;
}
.progress-line strong {
  color: #101828;
}
.preview-run-id {
  margin-top: 3px;
  color: #667085;
  font-size: 12px;
}
.progress-track {
  height: 7px;
  margin: 9px 0;
  border-radius: 999px;
  overflow: hidden;
  background: #eef2f6;
}
.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: #1f6feb;
  transition: width 0.25s ease;
}
.progress-fill.running {
  background: linear-gradient(90deg, #1f6feb, #71a9ff);
}
.preview-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: #667085;
  font-size: 12px;
}
.preview-metrics span {
  border-radius: 999px;
  background: #f2f4f7;
  padding: 4px 9px;
}
.snapshot-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.snapshot-head h3,
.snapshot-head p {
  margin: 0;
}
.snapshot-head p {
  margin-top: 4px;
  color: #667085;
  font-size: 12px;
}
.snapshot-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.snapshot-actions select {
  height: 34px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: white;
  padding: 0 10px;
  color: #344054;
  font-weight: 600;
}
.snapshot-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: white;
}
.snapshot-toolbar label {
  display: grid;
  gap: 4px;
  color: #475467;
  font-size: 12px;
  font-weight: 600;
}
.snapshot-toolbar select {
  min-width: 150px;
  height: 34px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: white;
  padding: 0 10px;
  color: #344054;
}
.snapshot-page-info {
  color: #667085;
  font-size: 13px;
  line-height: 34px;
}
.snapshot-page-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: #475467;
  font-size: 13px;
}
.snapshot-table-wrap {
  overflow: auto;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: white;
}
.snapshot-table {
  min-width: 860px;
}
.snapshot-table tr.blocked {
  background: #fffbfa;
}
.snapshot-table .check-col {
  width: 38px;
  text-align: center;
}
.snapshot-error {
  color: #b42318;
  font-size: 12px;
}
.type-row {
  justify-content: flex-start;
}
@media (max-width: 920px) {
  .page-head,
  .two-col,
  .pagination-bar {
    display: block;
  }
  .history-main {
    align-items: flex-start;
  }
  .history-dropdown {
    left: auto;
    right: 0;
    width: min(360px, calc(100vw - 32px));
    max-height: 420px;
  }
  .page-controls {
    margin-top: 8px;
  }
  .snapshot-page-controls {
    width: 100%;
    justify-content: flex-start;
    margin-left: 0;
  }
  .source-form {
    margin-bottom: 16px;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
