# 09. Phân Quyền Động Hồ Sơ Và Audit Người Bổ Sung Tin

## Mục tiêu

Hoàn thiện phân quyền hồ sơ đơn hàng theo hướng tách rõ quyền xem và quyền thao tác. Người dùng có quyền truy cập vẫn có thể xem/lọc hồ sơ trong phạm vi được cấp, nhưng thao tác thay đổi hồ sơ phải bị giới hạn theo người xử lý, trưởng phòng hoặc quyền quản trị.

## Nguyên tắc quyền

### Quyền xem

- Tất cả bộ lọc hồ sơ chỉ hoạt động trên tập hồ sơ user được phép xem.
- User được xem hồ sơ theo scope hiện có:
  - hồ sơ được giao;
  - hồ sơ tự tạo;
  - hồ sơ trong phòng ban/phạm vi được phân quyền;
  - yêu cầu bàn giao đang chờ xử lý;
  - owner/admin theo cơ chế riêng.

### Quyền thao tác

Các thao tác cập nhật trạng thái, sửa tiêu đề bổ sung, loại tin khỏi hồ sơ, bàn giao hoặc cập nhật kết quả chỉ cho phép khi user là:

- người xử lý hiện tại của hồ sơ;
- trưởng/phó phòng quản lý phòng ban của hồ sơ;
- owner/admin;
- đồng thời vẫn phải có grant RBAC tương ứng.

Người tạo hồ sơ không tự động có quyền sửa nếu hiện tại không còn là người xử lý hoặc quản lý phòng ban.

## Permissions trả về frontend

Mỗi hồ sơ trả thêm:

```ts
permissions: {
  canView: boolean
  canUpdateStatus: boolean
  canAppendMessages: boolean
  canEditMetadata: boolean
  canRemoveMessages: boolean
  canDeleteStory: boolean
  canHandover: boolean
  canOverrideAssignee: boolean
  reason?: string
}
```

Frontend chỉ hiển thị nút thao tác theo `permissions`. Backend vẫn kiểm tra lại trước mọi mutation.

## Audit người thêm tin vào hồ sơ

Mỗi `ArchiveMessage` lưu thêm:

```ts
addedByUserId?: string
addedAt: DateTime
addedSource: 'manual' | 'append' | 'auto_reply_sync' | 'system'
```

Khi hiển thị chi tiết hồ sơ, mỗi tin nhắn có dòng phụ:

- `Được thêm bởi Nguyễn Văn A lúc 14:36 16/06/26`
- hoặc `Tự đồng bộ từ trả lời bởi Nguyễn Văn A lúc ...`

## Phạm vi triển khai lần này

- Thêm schema và include dữ liệu `addedBy`.
- Ghi `addedByUserId`, `addedAt`, `addedSource` khi tạo/bổ sung/auto-sync tin vào hồ sơ.
- Trả `permissions` theo từng hồ sơ từ API danh sách và chi tiết.
- UI ẩn/disable thao tác trạng thái, sửa title, loại tin, bàn giao theo `permissions`.
- Hiển thị thông tin người bổ sung tin trong timeline chi tiết hồ sơ.

## Bổ sung sau kiểm thử thực tế

Thao tác **bổ sung tin nhắn vào hồ sơ hiện có** được tách khỏi quyền sửa hồ sơ.

- Người dùng có quyền xem hồ sơ trong phạm vi của mình và có grant `archive.create` được phép bổ sung tin nhắn vào hồ sơ đó.
- Người dùng đó vẫn không được sửa tiêu đề, đổi trạng thái, loại tin, xoá hoặc bàn giao hồ sơ nếu không phải người xử lý, trưởng/phó phòng quản lý, owner hoặc admin.
- Mỗi tin nhắn bổ sung vẫn ghi `addedByUserId`, `addedAt`, `addedSource` để biết nhân sự nào đã cập nhật thêm nội dung vào hồ sơ.
- Preflight và auto-sync reply cũng dùng quyền append mới để không còn báo nhầm `Archive story not found` khi hồ sơ đã được chuyển sang người xử lý khác.
