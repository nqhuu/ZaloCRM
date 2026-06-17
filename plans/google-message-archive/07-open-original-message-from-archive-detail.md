# 07. Xem tin nhắn gốc từ chi tiết hồ sơ

## 1. Mục tiêu

Trong popup chi tiết hồ sơ đơn hàng, người dùng có thể thao tác trên từng tin nhắn đã lưu và mở lại đúng tin nhắn gốc trong màn hình Tin nhắn của hệ thống CRM.

Luồng này phải đảm bảo:

- Không bỏ qua phân quyền xem hồ sơ.
- Không bỏ qua phân quyền xem hội thoại hoặc tài khoản Zalo gốc.
- Không phụ thuộc vào deep link Zalo native vì không có URL ổn định để mở đúng một message từ hệ thống ngoài.
- Mở được cả tin nhắn thường, tin nhắn đã thu hồi và tin có file đính kèm.
- Nếu không thể mở tin gốc thì UI phải báo lý do rõ ràng.

## 2. Kết luận thiết kế

Không redirect ra Zalo native.

Hệ thống sẽ redirect nội bộ về màn hình chat của CRM:

```text
/chat/:conversationId?messageId=:sourceMessageId
```

Màn chat sau đó:

- Load đúng hội thoại.
- Đảm bảo tin nhắn cần xem đã được tải.
- Scroll tới bubble gốc.
- Highlight bubble trong vài giây để người dùng nhận ra ngay.

## 3. Luồng người dùng

1. Người dùng mở popup chi tiết hồ sơ.
2. Chuột phải vào một tin nhắn trong timeline hồ sơ.
3. Context menu hiển thị các hành động phù hợp.
4. Người dùng chọn `Xem tin nhắn gốc`.
5. Frontend gọi API kiểm tra quyền và lấy thông tin nguồn.
6. Nếu hợp lệ, chuyển sang màn chat và highlight tin gốc.
7. Nếu không hợp lệ, hiển thị thông báo lý do.

## 4. Context menu trong chi tiết hồ sơ

Menu chuột phải trên từng `timeline-message` nên có các mục:

- `Xem tin nhắn gốc`
- `Sao chép nội dung`
- `Tải file đính kèm` nếu tin có media/file


## 5. API đề xuất

### 5.1. Lấy thông tin mở tin gốc

```http
GET /api/v1/archive/messages/:archiveMessageId/origin
```

`archiveMessageId` là id của bản ghi `ArchiveMessage`, không phải `sourceMessageId`.

### 5.2. Response mở được

```json
{
  "canOpen": true,
  "conversationId": "conv-1",
  "sourceMessageId": "msg-1"
}
```

### 5.3. Response không mở được

```json
{
  "canOpen": false,
  "reason": "zalo_account_deleted",
  "message": "Tài khoản Zalo gốc đã bị xóa, chỉ có thể xem bản lưu trong hồ sơ."
}
```

## 6. Kiểm tra phân quyền backend

API phải kiểm tra theo thứ tự:

1. User có quyền `archive.access`.
2. Archive message tồn tại trong một hồ sơ user được phép xem theo `archiveScopeWhere(actor)`.
3. Conversation gốc thuộc cùng `orgId`.
4. User có quyền đọc hội thoại hoặc tài khoản Zalo gốc theo cơ chế hiện hành.
5. Tài khoản Zalo gốc chưa bị xóa nếu yêu cầu mở hội thoại live.

Nếu bước 1-4 không hợp lệ, trả `403`.

Nếu tài khoản Zalo đã bị xóa, trả `200` với `canOpen=false` và `reason=zalo_account_deleted` để UI báo mềm, vì user vẫn có quyền xem bản lưu trong hồ sơ.

## 7. Các reason chuẩn

```text
archive_message_not_found
archive_access_denied
conversation_not_found
conversation_access_denied
zalo_account_deleted
source_message_not_found
```

Gợi ý mapping UI:

- `archive_access_denied`: Bạn không có quyền xem hồ sơ chứa tin nhắn này.
- `conversation_access_denied`: Bạn không có quyền xem hội thoại gốc.
- `zalo_account_deleted`: Tài khoản Zalo gốc đã bị xóa, chỉ có thể xem bản lưu trong hồ sơ.
- `source_message_not_found`: Tin nhắn gốc không còn tồn tại trong hệ thống.

## 8. Điều hướng frontend

Khi API trả `canOpen=true`, frontend chạy:

```ts
router.push({
  name: 'Chat',
  params: { convId: conversationId },
  query: { messageId: sourceMessageId },
});
```

Popup chi tiết hồ sơ nên đóng sau khi bắt đầu điều hướng để tránh lớp modal che màn chat.

## 9. Màn chat cần hỗ trợ messageId

ChatView cần đọc:

```text
route.query.messageId
```

Sau khi chọn hội thoại và fetch message:

- Tìm phần tử có `data-message-id`.
- Scroll vào giữa màn hình.
- Thêm class highlight tạm thời.
- Sau 2-3 giây bỏ highlight.

Nếu message chưa nằm trong danh sách đang load, cần API lấy vùng quanh message.

## 10. API tải vùng quanh tin nhắn

Vì `/conversations/:id/messages?limit=100` hiện chỉ lấy nhóm tin mới nhất, tin gốc có thể nằm ngoài danh sách.

Đề xuất bổ sung:

```http
GET /api/v1/conversations/:id/messages/around/:messageId?before=50&after=50
```

Response:

```json
{
  "messages": [],
  "targetMessageId": "msg-1",
  "hasBefore": true,
  "hasAfter": true
}
```

Endpoint này cũng phải trả kèm `archiveInfo` batch giống API danh sách tin nhắn hiện tại.

## 11. Trạng thái tin nhắn đã thu hồi

Nếu tin gốc đã bị thu hồi:

- Vẫn mở được bubble gốc nếu source message còn trong DB.
- Bubble hiển thị trạng thái thu hồi như màn chat hiện tại.
- Không coi đây là lỗi.

Nếu chỉ còn bản lưu trong `ArchiveMessage` nhưng source message không còn trong bảng `Message`, UI báo `source_message_not_found`.

## 12. Tài khoản Zalo đã bị xóa

Hồ sơ lưu trữ vẫn tồn tại và vẫn xem được bản lưu.

Tuy nhiên khi mở tin gốc:

- Không redirect sang chat live nếu tài khoản Zalo đã bị xóa.
- UI báo: `Tài khoản Zalo gốc đã bị xóa, chỉ có thể xem bản lưu trong hồ sơ.`
- Có thể thêm nút phụ `Ở lại hồ sơ`.

## 13. Tiêu chí hoàn thành

- Chuột phải vào tin nhắn trong chi tiết hồ sơ hiển thị context menu.
- Chọn `Xem tin nhắn gốc` gọi API kiểm tra quyền.
- User đủ quyền được chuyển tới đúng hội thoại.
- Tin gốc được scroll tới và highlight.
- User không đủ quyền không xem được tin gốc.
- Tin ngoài 100 tin mới nhất vẫn mở được qua API `around`.
- Tài khoản Zalo đã xóa không làm mất hồ sơ và có thông báo rõ ràng.
- Build frontend/backend pass.
- Có test backend cho các case quyền chính: được xem, không có quyền hồ sơ, không có quyền hội thoại, tài khoản Zalo đã xóa.

## 14. Phạm vi triển khai đề xuất

### Phase 1

- Thêm API `archive/messages/:archiveMessageId/origin`.
- Thêm context menu trong popup chi tiết hồ sơ.
- Redirect sang `/chat/:convId?messageId=...`.
- ChatView scroll/highlight nếu tin đã có trong danh sách.

### Phase 2

- Thêm API `messages/around/:messageId`.
- ChatView tự fallback sang endpoint around nếu không tìm thấy message.
- Trả kèm `archiveInfo` batch cho danh sách quanh message.

### Phase 3

- Bổ sung hành động `Sao chép nội dung`.
- Bổ sung hành động `Tải file đính kèm`.
- Thêm telemetry/audit log cho thao tác mở tin gốc nếu cần.
