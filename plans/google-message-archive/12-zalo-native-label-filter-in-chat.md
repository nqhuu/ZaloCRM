# 12. Zalo Native Label Filter trong màn hình Tin nhắn

## 1. Mục tiêu

Cho phép người dùng sử dụng trực tiếp các nhãn đã tạo trong Zalo native trên màn hình Tin nhắn của Zalo CRM.

Mục tiêu chính:

- Hiển thị danh sách tag/label Zalo native theo từng tài khoản Zalo mà user có quyền xem.
- Lọc hội thoại cá nhân và nhóm theo các label đó.
- Tránh nhầm lẫn khi nhiều nick Zalo có label trùng tên.
- Không bypass phân quyền xem/thao tác nick Zalo.
- Đồng bộ được thay đổi label từ Zalo native về CRM.

## 2. Khái niệm

### 2.1. Zalo native label

Zalo native label là nhãn được user tạo trực tiếp trong app/web Zalo thật.

Ví dụ:

- `Dự án`
- `Nhà máy`
- `Công việc`
- `Nhóm An`

Các nhãn này thuộc về từng tài khoản Zalo riêng biệt.

### 2.2. Tag CRM

Tag CRM là tag do hệ thống CRM tạo và quản lý. Tag CRM có thể dùng cho tự động hoá, phân loại khách hàng, báo cáo.

### 2.3. Nguyên tắc tách lớp

Không trộn cứng Zalo native label với Tag CRM.

Zalo native label là dữ liệu đồng bộ từ Zalo, còn Tag CRM là dữ liệu quản trị trong CRM. UI có thể hiển thị chung trong khu vực lọc, nhưng backend cần giữ source rõ ràng.

## 3. Hiện trạng hệ thống

Hệ thống hiện đã có nền tảng:

- Model `ZaloLabel` lưu label native theo từng `zaloAccountId`.
- `Friend.zaloLabels` lưu các label đang gắn cho từng user/group trong nick Zalo.
- Có endpoint sync label từ Zalo SDK qua `getLabels()`.
- Có UI quản lý label trong `ZaloLabelsManagement.vue`.
- Màn hình Tin nhắn đã có khu vực `Tag Zalo native`.
- API danh sách hội thoại đã nhận query `zaloLabels`.

Điểm cần nâng cấp:

- Filter hiện chủ yếu dựa theo tên label, dễ sai khi nhiều nick có label trùng tên.
- UI cần thể hiện label theo phạm vi nick Zalo đang xem.
- Cần đảm bảo user/group đều được lọc đúng.
- Cần chuẩn hoá phân quyền theo nick Zalo trước khi trả danh sách label/filter.

## 4. Data contract đề xuất

### 4.1. ZaloLabel

Một label native cần được định danh bằng cặp:

```ts
{
  zaloAccountId: string;
  zaloLabelId: number;
}
```

Không dùng `text/name` làm khoá logic.

Tên label chỉ dùng để hiển thị.

### 4.2. Label item trả về frontend

```ts
interface ZaloNativeLabelOption {
  accountId: string;
  accountName: string;
  labelId: number;
  name: string;
  color?: string | null;
  emoji?: string | null;
  assignedCount?: number;
}
```

### 4.3. Filter payload

Frontend nên gửi filter theo ID, không gửi tên:

```http
GET /api/v1/chat/conversations?zaloLabelIds=accountId:labelId,accountId:labelId
```

Ví dụ:

```http
GET /api/v1/chat/conversations?zaloLabelIds=acc_1:12,acc_2:12
```

Nếu cần dễ parse hơn ở backend, có thể dùng dạng:

```http
GET /api/v1/chat/conversations?zaloLabels=acc_1:12,acc_2:12
```

Tên query cuối cùng cần thống nhất với code hiện tại để tránh phá tương thích.

## 5. Logic phân quyền

Danh sách label trả về và kết quả filter phải đi qua quyền xem nick Zalo.

### 5.1. Nhân viên thường

Chỉ được thấy label của các tài khoản Zalo mà nhân viên được gán phụ trách hoặc được uỷ quyền thao tác.

### 5.2. Trưởng/phó phòng

Được thấy label của toàn bộ tài khoản Zalo thuộc phòng ban họ quản lý.

### 5.3. Admin/owner

Được thấy label theo phạm vi toàn hệ thống hoặc theo phòng ban/nick đã chọn.

### 5.4. Nguyên tắc bảo mật

Không cho phép dùng label filter để dò ra hội thoại thuộc nick Zalo mà user không có quyền xem.

Backend luôn áp scope tài khoản trước:

```ts
accessibleAccountIds = getZaloScope(user)
```

Sau đó mới áp filter label.

## 6. Logic lọc hội thoại

### 6.1. Khi chọn một nick Zalo

UI chỉ hiển thị label của nick đó.

Filter:

```ts
conversation.zaloAccountId === selectedAccountId
AND conversation.friend/group has selected label
```

### 6.2. Khi chọn nhiều nick hoặc ALL

UI có 2 phương án:

Phương án ưu tiên:

- Group label theo nick Zalo.
- Nếu nhiều nick có label cùng tên vẫn hiển thị riêng.

Ví dụ:

```text
Nguyễn Cường Kính Hồng Phúc
- Dự án
- Nhà máy

Quốc
- Dự án
- Công việc
```

Phương án gọn:

- Gộp label cùng tên nhưng tooltip hoặc badge hiển thị số nick.
- Khi click label gộp, backend lọc tất cả label có cùng tên trong các nick được phép.

Phương án gọn dễ dùng, nhưng có thể gây mơ hồ. Giai đoạn đầu nên ưu tiên group theo nick.

### 6.3. OR/AND khi chọn nhiều label

Mặc định dùng OR:

```text
Hội thoại có ít nhất một trong các label đã chọn.
```

Sau này có thể thêm chế độ nâng cao AND:

```text
Hội thoại phải có đủ tất cả label đã chọn.
```

## 7. User và group Zalo

Filter phải áp dụng cho cả:

- Hội thoại cá nhân.
- Hội thoại nhóm.

Điểm cần kiểm tra:

- `ZaloLabel.conversations[]` đang lưu external thread id từ SDK.
- User cá nhân thường match qua `Friend.zaloUidInNick`.
- Group cần match qua `Conversation.externalThreadId` hoặc field tương đương.

Nếu group chưa có mapping riêng, cần bổ sung mapping label cho conversation/group thay vì chỉ dựa vào `Friend`.

## 8. API cần bổ sung/chỉnh sửa

### 8.1. API lấy label native theo phạm vi

```http
GET /api/v1/chat/zalo-native-labels?accountIds=...
```

Response:

```ts
{
  labels: ZaloNativeLabelOption[];
}
```

Backend tự giới hạn theo quyền user.

Nếu không truyền `accountIds`, trả label của toàn bộ nick user được phép xem.

### 8.2. API danh sách hội thoại

Mở rộng `GET /api/v1/chat/conversations`:

```http
?zaloLabelIds=accountId:labelId,accountId:labelId
```

Hoặc giữ tương thích query cũ:

```http
?zaloLabels=name1,name2
```

Đề xuất:

- Hỗ trợ query cũ trong giai đoạn chuyển tiếp.
- Query mới theo ID có độ ưu tiên cao hơn.

### 8.3. API sync label

Đã có:

```http
POST /api/v1/zalo-accounts/:accountId/labels/sync
POST /api/v1/zalo-accounts/:accountId/labels/touch
```

Cần đảm bảo sau sync:

- Cập nhật `ZaloLabel`.
- Cập nhật mapping cho user/group.
- Emit event để frontend refresh label và conversation list.

## 9. UI trong màn hình Tin nhắn

### 9.1. Sidebar filter

Khu vực `Tag Zalo native` nên có:

- Ô tìm tag.
- Danh sách label theo nick Zalo.
- Chip label có màu/emoji nếu Zalo trả về.
- Badge số lượng hội thoại nếu tính được.
- Trạng thái loading/sync.
- Nút `Đồng bộ tag` nhỏ khi cần.

### 9.2. Khi chọn một nick

Hiển thị:

```text
Tag Zalo native (17)
[Tìm tag...]
[Dự án] [Nhà máy] [Nhóm 1]
```

### 9.3. Khi chọn ALL hoặc nhiều nick

Hiển thị:

```text
Tag Zalo native

Nguyễn Cường Kính Hồng Phúc
[Dự án] [Nhà máy]

Quốc
[Dự án] [Công việc]
```

### 9.4. Active filter chip

Khi chọn tag, phía trên danh sách hoặc trong active filters nên hiển thị:

```text
Tag Zalo: Dự án · Nguyễn Cường Kính Hồng Phúc
```

Không chỉ hiển thị `Dự án`, vì có thể trùng tên ở nick khác.

## 10. Hiển thị trên hội thoại

Mỗi item hội thoại trong danh sách nên hiển thị tối đa 2-3 label Zalo native đang gắn.

Nếu nhiều hơn:

```text
[Dự án] [Nhà máy] +3
```

Tooltip hoặc hover hiển thị đầy đủ label.

## 11. Đồng bộ dữ liệu

### 11.1. Sync thủ công

Người dùng có thể bấm `Đồng bộ tag Zalo` trong:

- Sidebar Tin nhắn.
- Header hội thoại.
- Trang cấu hình tag Zalo.

### 11.2. Sync nền

Khi nick Zalo online:

- Pull label định kỳ.
- Hoặc touch/sync khi mở hội thoại.
- Có cooldown để tránh gọi SDK quá dày.

### 11.3. Khi gán/gỡ label trong CRM

Nếu CRM cho phép thao tác gán label native:

- Phải gọi SDK `updateLabels`.
- Sau khi thành công, sync lại DB bằng seed data trả về từ SDK.
- Nếu SDK lỗi, không cập nhật optimistic lâu dài.

Giai đoạn đầu có thể chỉ tập trung vào lọc và hiển thị, chưa mở rộng thao tác gán/gỡ.

## 12. Rủi ro và cách xử lý

### 12.1. Trùng tên label giữa các nick

Giải pháp:

- Dùng `accountId + labelId` làm key.
- UI hiển thị kèm tên nick khi ở phạm vi nhiều nick.

### 12.2. Đổi tên label trên Zalo

Giải pháp:

- Filter lưu theo ID.
- Tên mới được sync về và UI tự cập nhật.

### 12.3. Label bị xoá trên Zalo

Giải pháp:

- Full sync đánh dấu label không còn active hoặc xoá mapping.
- Filter cũ nên tự bỏ label không còn tồn tại.

### 12.4. Group chưa được map label

Giải pháp:

- Kiểm tra mapping từ `ZaloLabel.conversations[]` sang `Conversation.externalThreadId`.
- Nếu hiện chưa có, bổ sung bảng/mapping cho conversation label.

## 13. Tiêu chí kiểm thử

### 13.1. Phân quyền

- Nhân viên thường chỉ thấy label của nick được giao.
- Trưởng/phó phòng thấy label của nick thuộc phòng mình.
- Admin/owner thấy label theo phạm vi được chọn.
- Không dùng label để lọc ra hội thoại ngoài quyền.

### 13.2. Lọc hội thoại

- Chọn một label lọc đúng hội thoại cá nhân.
- Chọn một label lọc đúng hội thoại nhóm.
- Chọn nhiều label lọc đúng theo OR.
- Trùng tên label ở hai nick không gây lẫn kết quả.

### 13.3. Đồng bộ

- Tạo label mới trên Zalo native, sync về CRM hiển thị đúng.
- Đổi tên label trên Zalo native, CRM cập nhật tên nhưng filter theo ID vẫn đúng.
- Gỡ label khỏi một user/group trên Zalo, sync xong CRM không còn hiển thị ở hội thoại đó.

### 13.4. UI

- Chọn nick đơn: label hiển thị gọn theo nick đó.
- Chọn ALL: label group theo nick.
- Tìm tag gần đúng hoạt động.
- Active filter chip hiển thị rõ label thuộc nick nào.

## 14. Phạm vi triển khai đề xuất

### Phase 1

- Chuẩn hoá API trả label native theo phạm vi quyền.
- UI sidebar hiển thị label group theo nick.
- Filter conversation bằng `accountId + labelId`.
- Giữ tương thích query cũ theo tên label.

### Phase 2

- Đảm bảo group Zalo được filter theo label native.
- Active filter chip đầy đủ.
- Realtime refresh khi sync label.
- Nút sync nhanh trong sidebar Tin nhắn.

Ghi chu bo sung Phase 2:

- Tab hoi thoai mac dinh la `Chinh` khi user chua co lua chon truoc do.
- Khi user chuyen giua `Ca nhan`, `Nhom`, `Chinh`, `Khac`, he thong luu tab cuoi cung vao localStorage va tu focus lai tab do trong cac lan mo man hinh Tin nhan tiep theo.
- Neu localStorage khong kha dung hoac gia tri cu khong hop le, fallback ve `Chinh`.

### Phase 2 - da trien khai

- Group Zalo duoc filter theo label native bang `zaloLabelIds=<zaloAccountId>:<zaloLabelId>` va backend chuan hoa ca dang group id co/khong co tien to `g`.
- Active filter chip cho tag Zalo native hien thi day du `ten tag - ten nick Zalo`, khong chi hien token raw.
- Sidebar Tin nhan co nut `Dong bo` nhanh trong khu vuc `Tag Zalo native`.
- Sau khi dong bo tag native, frontend reload lai label native, reload tag def va refresh danh sach hoi thoai voi `bypassCache`.
- Tab hoi thoai mac dinh la `Chinh`, va luu lai tab cuoi cung user da dung cho lan mo Tin nhan tiep theo.

### Phase 1 - da trien khai

- Them API `GET /api/v1/chat/zalo-native-labels?accountIds=...` tra label theo pham vi `getZaloScope`.
- Sidebar Tin nhan doc label native that tu `ZaloLabel`, group theo nick Zalo khi xem nhieu nick.
- Filter moi dung query `zaloLabelIds=<zaloAccountId>:<zaloLabelId>`.
- Backend van giu `zaloLabels` theo ten de tuong thich preset/tag mirror cu.
- Ket qua filter van bi gioi han boi quyen xem nick Zalo cua user.
- Bo sung fix mapping group: Zalo SDK luu group trong `ZaloLabel.conversations[]` dang `g<id>`, trong khi `Conversation.externalThreadId` dang luu `<id>`. Backend da chuan hoa ca hai dang khi filter va khi danh dau `assignedTo`.
- API conversation tra them `nativeLabels` de UI hien thi tag native tren list va panel chi tiet.
- Ghi chu kiem tra 2026-06-17: DB hien tai co label native cho group, nhung `Friend.zaloLabels` dang bang 0 nen chua co nguon du lieu de loc/hien thi tag native cua ca nhan. Neu SDK tra ve UID ca nhan trong cac lan sync sau, logic `Friend.zaloLabels` cu van tiep tuc ho tro.

### Phase 3

- Cho phép gán/gỡ label native ngay trong CRM nếu cần.
- Hỗ trợ AND/OR mode nâng cao.
- Báo cáo theo label native.

## 15. Kết luận

Nên coi Zalo native label là dữ liệu per-nick, source of truth từ Zalo. CRM dùng để hiển thị, lọc và hỗ trợ thao tác theo quyền.

Điểm quan trọng nhất khi triển khai là không lọc theo tên label đơn thuần. Phải dùng `zaloAccountId + zaloLabelId` để tránh nhầm lẫn và giữ ổn định khi label đổi tên.
