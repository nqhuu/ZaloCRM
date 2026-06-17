# 08. Reply Message Focus Và Ẩn Chỉnh Sửa Tin Nhắn CRM

## Mục tiêu

Khi người dùng bấm vào phần preview `Trả lời` của một tin nhắn trong Zalo CRM hoặc trong chi tiết hồ sơ, hệ thống tự cuộn và highlight tin nhắn gốc đang được trả lời.

Đồng thời ẩn chức năng `Chỉnh sửa` trong menu chuột phải của tin nhắn Zalo CRM. Việc sửa nội dung tin nhắn, dù chỉ là bản hiển thị trên CRM, có rủi ro làm sai lệch lịch sử trao đổi.

## Phạm vi triển khai

### 1. Màn hình Tin nhắn Zalo CRM

- `reply-card` trong bubble có thể click.
- Khi click:
  - Nếu tin gốc đang có trong danh sách hiện tại: scroll và highlight ngay.
  - Nếu tin gốc chưa load: gọi endpoint `messages/around`.
  - Endpoint hỗ trợ cả `Message.id`, `zaloMsgId`, `zaloMsgIdNum` vì quote của Zalo thường chỉ có mã tin Zalo.
- Áp dụng cho reply text, image, file, voice, video và tin đã thu hồi.

### 2. Popup chi tiết Hồ sơ / Đơn hàng

- Tin nhắn trong hồ sơ nếu là reply thì hiển thị block preview `Trả lời`.
- Khi click:
  - Nếu tin được reply cũng nằm trong cùng hồ sơ: scroll/highlight trong popup.
  - Nếu không nằm trong hồ sơ: điều hướng sang màn hình Tin nhắn với `messageId` là mã tin gốc để `messages/around` resolve và focus.

### 3. Phân quyền

- Chat CRM vẫn dùng quyền truy cập hội thoại/tài khoản Zalo hiện có qua route `/conversations/:id/messages/around/:messageId`.
- Hồ sơ vẫn dùng quyền xem hồ sơ hiện có trước khi người dùng có thể click.
- Không tạo đường vòng bỏ qua RBAC.

### 4. Tắt chỉnh sửa tin nhắn

- Ẩn item `Chỉnh sửa` trong menu chuột phải.
- Chưa xoá backend edit API trong lần này để tránh ảnh hưởng các luồng cũ chưa rà hết.
- UI không còn đường thao tác sửa nội dung tin nhắn từ menu chuột phải.

## Tiêu chí kiểm thử

- Bấm reply preview của tin text đang thấy trên màn hình: scroll/highlight đúng tin gốc.
- Bấm reply preview của tin ảnh/file: scroll/highlight đúng tin gốc.
- Bấm reply preview khi tin gốc chưa load trong danh sách hiện tại: hệ thống load quanh tin gốc rồi highlight.
- Trong chi tiết hồ sơ, bấm reply preview tới tin cùng hồ sơ: scroll/highlight trong popup.
- Trong chi tiết hồ sơ, bấm reply preview tới tin không nằm trong hồ sơ: chuyển sang màn hình Tin nhắn và focus đúng tin gốc.
- Menu chuột phải tin nhắn không còn mục `Chỉnh sửa`.
