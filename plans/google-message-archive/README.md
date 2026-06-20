# Phase 9 — Google Message Archive

> Lưu các cụm tin nhắn Zalo thành hồ sơ công việc có thể theo dõi trong ZaloCRM.
> PostgreSQL là nguồn dữ liệu chính; Google Drive lưu bản sao media; Google
> Sheets là bản backup và bảng đối soát nghiệp vụ.

Tài liệu mô tả chức năng đầy đủ:

- [`docs/PHASE-9-GOOGLE-MESSAGE-ARCHIVE.md`](../../docs/PHASE-9-GOOGLE-MESSAGE-ARCHIVE.md)

Tài liệu kỹ thuật chi tiết:

- [`01-architecture.md`](01-architecture.md): kiến trúc, luồng lưu, thu hồi và backup.
- [`02-data-contract.md`](02-data-contract.md): database, API và cấu trúc Google Sheet.
- [`03-implementation-plan.md`](03-implementation-plan.md): checklist triển khai và nghiệm thu.
- [`03-customer-search-account-retention-auto-sync.md`](03-customer-search-account-retention-auto-sync.md): tìm khách hàng, giữ hồ sơ khi xoá Zalo và tự đồng bộ trả lời.
- [`04-message-archive-indicator-and-status-workflow.md`](04-message-archive-indicator-and-status-workflow.md): biểu tượng hồ sơ trên tin nhắn và trạng thái cấu hình được.
- [`05-zalo-account-department-and-assignee-rules.md`](05-zalo-account-department-and-assignee-rules.md): phòng ban, người phụ trách chính/phụ và uỷ quyền theo ngày.
- [`16-shared-zalo-groups-customer-classification-and-crm-tags.md`](16-shared-zalo-groups-customer-classification-and-crm-tags.md): nhóm Zalo chung theo `globalId`, chống trùng tin nhắn, liên kết hồ sơ khách hàng, CRM tag độc lập và phân công user chính/phụ.

## Trạng thái hiện tại

| Hạng mục | Trạng thái |
|---|---|
| Tài liệu thiết kế | Hoàn thành |
| Prisma schema + migration | Hoàn thành, chưa deploy do PostgreSQL container chưa chạy |
| API lưu/xem/cập nhật story | Hoàn thành |
| Google Drive + Sheets worker | Hoàn thành code, chưa test thật do chưa có Service Account |
| Chọn nhiều message trong Chat | Hoàn thành |
| Trang `/archive` | Hoàn thành |
| Thu hồi realtime | Hoàn thành |
| Cảnh báo cuối ngày | Hoàn thành |
| Typecheck/build/test | Đạt |

## Điều kiện chạy thật

1. Chạy PostgreSQL và áp migration `20260612090000_google_message_archive`.
2. Cấu hình `GOOGLE_SERVICE_ACCOUNT_JSON`.
3. Share Spreadsheet và Drive Folder cho `client_email` của Service Account.
4. Vào `/archive`, cấu hình đích Google cho từng tài khoản Zalo.
