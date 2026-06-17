# 11. Nâng cấp chuông thông báo theo kiểu Facebook và xác nhận bắt buộc

## 1. Mục tiêu

Nâng cấp chức năng chuông thông báo của CRM theo hướng giống Facebook:

- Người dùng nhìn được danh sách thông báo mới nhất ngay trên chuông.
- Có trạng thái rõ ràng: chưa đọc, đã xem, đã đọc, cần xác nhận, đã xác nhận.
- Notification có hành động trực tiếp: mở hồ sơ, mở chat, mở tài khoản Zalo, mở bàn giao.
- Riêng thông báo liên quan đến tin nhắn đã lưu trong hồ sơ bị thu hồi phải yêu cầu user xác nhận đã nhận thông tin thì mới hết cảnh báo.

## 2. Hiện trạng hệ thống

Frontend hiện có:

- `frontend/src/components/NotificationBell.vue`
- Chuông gọi `/api/v1/notifications` mỗi 60 giây.
- Badge đang đếm trực tiếp `notifications.length`.
- Item chỉ có title/detail và click redirect đơn giản.

Backend hiện có:

- `backend/src/modules/notifications/notification-routes.ts`
- Route `/api/v1/notifications` gom thông báo từ:
  - `ArchiveNotification`
  - hội thoại chưa trả lời quá 30 phút
  - lịch hẹn hôm nay/ngày mai
  - tài khoản Zalo mất kết nối

Archive hiện có:

- Model `ArchiveNotification`
- Các field chính: `userId`, `storyId`, `type`, `title`, `detail`, `priority`, `readAt`, `dedupeKey`, `createdAt`.
- Route riêng:
  - `GET /api/v1/archive/notifications`
  - `PATCH /api/v1/archive/notifications/:id/read`

## 3. Vấn đề cần xử lý

Hiện tại notification chưa có vòng đời đầy đủ:

- Chưa phân biệt mở dropdown với đọc chi tiết.
- Chưa có trạng thái xác nhận bắt buộc.
- Chưa có action payload chuẩn để frontend biết mở màn hình nào.
- Chưa có cơ chế không cho notification quan trọng biến mất chỉ vì user đã mở chuông.

Riêng với tin nhắn trong hồ sơ bị thu hồi:

- Đây là thông báo nghiệp vụ quan trọng.
- User phải xác nhận đã nhận thông tin.
- Chỉ `readAt` là chưa đủ vì đọc không đồng nghĩa đã xác nhận.

## 4. Phạm vi Phase 1

Phase 1 ưu tiên ít rủi ro, tận dụng bảng `ArchiveNotification` hiện tại.

Chưa tạo bảng notification tổng quát cho toàn CRM ở phase này.

### 4.1. Backend

Mở rộng model `ArchiveNotification`:

```prisma
model ArchiveNotification {
  id        String    @id @default(uuid())
  orgId     String    @map("org_id")
  userId    String?   @map("user_id")
  storyId   String?   @map("story_id")
  type      String
  title     String
  detail    String
  priority  String    @default("medium")

  readAt    DateTime? @map("read_at")
  seenAt    DateTime? @map("seen_at")

  requiresAck         Boolean   @default(false) @map("requires_ack")
  acknowledgedAt      DateTime? @map("acknowledged_at")
  acknowledgedByUserId String?  @map("acknowledged_by_user_id")

  dedupeKey String?   @unique @map("dedupe_key")
  createdAt DateTime  @default(now()) @map("created_at")

  org   Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user  User?         @relation(fields: [userId], references: [id], onDelete: Cascade)
  story ArchiveStory? @relation(fields: [storyId], references: [id], onDelete: Cascade)
  acknowledgedBy User? @relation("ArchiveNotificationAcknowledgedBy", fields: [acknowledgedByUserId], references: [id], onDelete: SetNull)

  @@index([orgId, userId, readAt, createdAt])
  @@index([orgId, userId, requiresAck, acknowledgedAt, createdAt])
  @@map("archive_notifications")
}
```

Lưu ý khi thực hiện code:

- Nếu schema relation với `User` cần thêm relation name ở model `User`, phải bổ sung đúng để Prisma generate được.
- Migration cần backfill:
  - `requires_ack = true` cho notification `type = 'message_recalled'`.
  - Các notification cũ không phải recall giữ `requires_ack = false`.

### 4.2. API notification tổng

Nâng cấp `GET /api/v1/notifications` trả format thống nhất:

```ts
{
  id: string;
  source: 'archive' | 'chat' | 'appointment' | 'zalo';
  sourceId?: string;
  type: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  detail: string;
  createdAt: string;
  readAt?: string | null;
  seenAt?: string | null;
  requiresAck: boolean;
  acknowledgedAt?: string | null;
  action: {
    kind: 'open_archive_story' | 'open_chat' | 'open_appointments' | 'open_zalo_account' | 'open_archive_handover';
    path: string;
    storyId?: string;
    messageId?: string;
    accountId?: string;
  };
}
```

Badge count nên tính:

```ts
unreadCount = notifications.filter(n =>
  (n.requiresAck && !n.acknowledgedAt) ||
  (!n.requiresAck && !n.readAt)
).length
```

### 4.3. API thao tác trạng thái

Thêm hoặc chuẩn hóa các endpoint:

```http
PATCH /api/v1/notifications/:id/seen
PATCH /api/v1/notifications/:id/read
PATCH /api/v1/notifications/:id/acknowledge
POST  /api/v1/notifications/mark-all-read
```

Quy tắc:

- `seen`: gọi khi mở dropdown chuông.
- `read`: gọi khi user click notification và mở màn hình liên quan.
- `acknowledge`: chỉ hợp lệ với notification `requiresAck = true`.
- Với notification cần xác nhận, `readAt` không làm hết badge nếu `acknowledgedAt` vẫn null.
- `mark-all-read` không được tự acknowledge notification yêu cầu xác nhận.

### 4.4. Logic riêng cho tin nhắn bị thu hồi trong hồ sơ

Khi phát hiện tin đã lưu trong hồ sơ bị thu hồi:

- Tạo hoặc cập nhật notification type `message_recalled`.
- Set `requiresAck = true`.
- Dedupe theo story/message/user để tránh spam:

```ts
dedupeKey = `archive:recall:${storyId}:${messageId}:${userId || 'org'}`
```

Người nhận notification:

- User đang xử lý hồ sơ.
- Trưởng/phó phòng quản lý phòng ban của hồ sơ.
- Admin/owner nếu cấu hình nhận cảnh báo nghiêm trọng.

Khi user click notification:

- Mở `/archive?storyId=...&messageId=...`.
- Popup hồ sơ cần focus vào tin bị thu hồi nếu có thể.
- Notification vẫn còn badge nếu chưa bấm `Đã nhận thông tin`.

Khi user bấm `Đã nhận thông tin`:

- Set `acknowledgedAt`.
- Set `acknowledgedByUserId`.
- Có thể set luôn `readAt` nếu chưa có.
- Ghi audit log nếu hệ thống đang có audit service phù hợp.

## 5. Frontend NotificationBell

Thiết kế lại chuông theo hướng Facebook:

### 5.1. Header dropdown

- Tiêu đề: `Thông báo`.
- Badge tổng ở chuông chỉ đếm notification chưa đọc hoặc cần xác nhận.
- Có tabs:
  - `Tất cả`
  - `Chưa đọc`
  - `Cần xác nhận`
- Có nút:
  - `Đánh dấu đã đọc`
  - `Xem tất cả` (có thể để coming soon nếu chưa làm page riêng)

### 5.2. Item notification

Mỗi item hiển thị:

- Icon theo severity:
  - info: xanh
  - warning: vàng/cam
  - error/critical: đỏ
  - success: xanh lá
- Title rõ ràng.
- Detail ngắn.
- Thời gian tương đối.
- Dot unread nếu chưa đọc.
- Badge `Cần xác nhận` nếu `requiresAck = true && acknowledgedAt = null`.

### 5.3. Action của item

Click item:

- Gọi `read`.
- Điều hướng theo `action.path`.
- Nếu là notification cần xác nhận thì không tự acknowledge.

Với notification thu hồi:

- Hiển thị nút nhỏ `Đã nhận`.
- Click nút này gọi `acknowledge`.
- Sau khi acknowledge, item chuyển trạng thái đã xác nhận và badge chuông giảm.

## 6. Popup hồ sơ cần phối hợp

Khi mở hồ sơ từ notification thu hồi:

- Tự focus vào tin nhắn bị thu hồi nếu truyền `messageId`.
- Tin bị thu hồi hiển thị cảnh báo rõ:
  - `Tin nhắn này đã bị thu hồi trên Zalo lúc ...`
- Nếu notification chưa xác nhận, popup có thể hiển thị action:
  - `Đã nhận thông tin`

Không bắt buộc phải làm sâu phần popup trong Phase 1 nếu chưa có message focus param sẵn, nhưng API/action nên thiết kế sẵn.

## 7. Realtime

Phase 1:

- Giữ polling hiện tại, giảm interval nếu cần xuống 30 giây.
- Khi thao tác ack/read, cập nhật state frontend ngay.

Phase 2:

- Emit socket:
  - `notification:new`
  - `notification:updated`
  - `notification:count`
- Frontend subscribe để badge cập nhật tức thì.

## 8. Phân quyền

Notification chỉ trả cho user có quyền xem đối tượng liên quan.

Với archive:

- User chỉ nhận hoặc thấy notification hồ sơ nếu có quyền xem hồ sơ đó.
- User không có quyền xem hồ sơ không được mở qua notification.

Với Zalo account:

- Notification mất kết nối chỉ trả cho người có quyền quản lý/xem nick theo scope.

Với chat:

- Notification chưa trả lời chỉ tính trên hội thoại user được phép xem.

## 9. Tiêu chí kiểm thử

### Backend

- `/notifications` trả đúng notification archive chưa đọc.
- Notification `message_recalled` có `requiresAck = true`.
- `read` không làm hết badge với notification cần xác nhận.
- `acknowledge` làm hết badge với notification cần xác nhận.
- `mark-all-read` không acknowledge notification cần xác nhận.
- User không có quyền không thấy notification của hồ sơ/nick không được phép xem.

### Frontend

- Chuông hiển thị badge đúng.
- Mở dropdown gọi `seen`.
- Click item mở đúng màn hình.
- Item thu hồi có badge `Cần xác nhận`.
- Bấm `Đã nhận` thì badge giảm.
- Không có thông báo thì hiển thị empty state rõ.

## 10. Kế hoạch triển khai đề xuất

1. Cập nhật Prisma schema và migration.
2. Nâng cấp `/api/v1/notifications`.
3. Thêm endpoints `seen`, `read`, `acknowledge`, `mark-all-read`.
4. Cập nhật nơi tạo `ArchiveNotification` cho `message_recalled` để set `requiresAck`.
5. Thiết kế lại `NotificationBell.vue`.
6. Build Docker và test API/UI.

## 11. Chưa làm trong Phase 1

- Chưa tạo bảng notification tổng quát cho toàn CRM.
- Chưa làm trang “Tất cả thông báo” đầy đủ.
- Chưa làm browser push notification.
- Chưa làm âm thanh notification.
- Chưa làm preference bật/tắt từng loại notification.

Các phần này nên đưa sang Phase 2 sau khi Phase 1 ổn định.
