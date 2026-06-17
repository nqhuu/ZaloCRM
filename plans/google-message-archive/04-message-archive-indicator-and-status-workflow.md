# PHASE 9 - Biểu tượng hồ sơ trên tin nhắn và trạng thái hồ sơ cấu hình được

## 1. Mục tiêu

Nâng cấp hai khu vực liên quan trực tiếp với nhau:

1. Trên màn hình nhắn tin, người dùng nhận biết ngay tin nhắn nào đã được đưa vào hồ sơ.
2. Hồ sơ trao đổi có bốn trạng thái mặc định:
   - `Đang xử lý`
   - `Thiếu thông tin`
   - `Hoàn thành`
   - `Huỷ`
3. Admin ứng dụng có thể bổ sung, đổi tên, sắp xếp hoặc ngừng sử dụng trạng thái theo nhu cầu thực tế.

Thiết kế phải đáp ứng:

- Không làm giao diện tin nhắn rối hoặc che nội dung, media, thời gian và trạng thái thu hồi.
- Không phát sinh một API riêng cho từng tin nhắn.
- Không làm lộ tên hoặc số lượng hồ sơ ngoài phạm vi người dùng được phép xem.
- Cập nhật gần thời gian thực khi tin nhắn được thêm vào hoặc loại khỏi hồ sơ.
- Tương thích với dữ liệu hồ sơ đang dùng trạng thái `pending`.
- Trạng thái do Admin bổ sung vẫn phải được gắn với một nhóm hành vi hệ thống để các chức năng đồng bộ, báo cáo và phân quyền hoạt động đúng.

Quy tắc phòng ban, người phụ trách tài khoản Zalo và người xử lý mặc định của hồ sơ được mô tả tại `05-zalo-account-department-and-assignee-rules.md`.

---

## 2. Thuật ngữ

- **Tin nhắn nguồn**: bản ghi `Message` lấy từ cuộc hội thoại Zalo.
- **Hồ sơ**: bản ghi `ArchiveStory`.
- **Tin nhắn trong hồ sơ**: bản chụp `ArchiveMessage`, liên kết với tin nhắn nguồn bằng `sourceMessageId`.
- **Số hồ sơ hiển thị**: số hồ sơ chứa tin nhắn mà người đang đăng nhập có quyền xem. Đây không nhất thiết là tổng số hồ sơ trong toàn tổ chức.
- **Trạng thái hồ sơ**: danh mục trạng thái có thể cấu hình bởi Admin.
- **Nhóm hành vi**: phân loại cố định mà hệ thống dùng để xác định hồ sơ đang mở, đang chờ, hoàn thành hay đã huỷ.
- **Hồ sơ đang mở**: hồ sơ có trạng thái thuộc nhóm hành vi `active` hoặc `waiting`.
- **Hồ sơ đã đóng**: hồ sơ có trạng thái thuộc nhóm hành vi `completed` hoặc `cancelled`.

---

## 3. Biểu tượng hồ sơ trên từng tin nhắn

### 3.1. Trạng thái hiển thị

| Trường hợp | Hiển thị |
|---|---|
| Tin nhắn chưa nằm trong hồ sơ nào người dùng được xem | Không hiển thị biểu tượng |
| Tin nhắn nằm trong 1 hồ sơ | Icon hồ sơ kèm số `1` |
| Tin nhắn nằm trong nhiều hồ sơ | Icon hồ sơ kèm số lượng |
| Số lượng lớn hơn 99 | Hiển thị `99+` |
| Tin nhắn đã bị thu hồi nhưng vẫn còn bản chụp trong hồ sơ | Vẫn hiển thị icon và số hồ sơ |
| Tài khoản Zalo nguồn đã bị xoá | Vẫn hiển thị icon và số hồ sơ |

Không hiển thị icon ở trạng thái `0`, vì sẽ tạo nhiễu trên toàn bộ luồng chat.

### 3.2. Vị trí đề xuất

Thêm một vùng metadata nhỏ trong footer của bong bóng tin nhắn:

- Tin khách gửi: nằm cùng hàng với thời gian, ở phía trong bên phải bong bóng.
- Tin nhân viên gửi: nằm cùng hàng với thời gian, ở phía trong bên trái hoặc ngay trước thời gian.
- Không đặt icon nổi đè lên góc bong bóng.
- Không dùng vị trí đang dành cho trạng thái gửi, đã xem, thu hồi hoặc menu thao tác.
- Với album ảnh, tổng số hồ sơ của các ảnh không được cộng gộp mơ hồ. Mỗi ảnh cần giữ quan hệ riêng; giao diện album có thể hiển thị một icon tổng hợp và tooltip phân nhóm theo ảnh trong giai đoạn sau. Giai đoạn đầu, khi album được render chung, hiển thị tổng số hồ sơ duy nhất chứa ít nhất một ảnh trong album.

Kích thước đề xuất:

- Icon: `14px`.
- Badge số: cao tối thiểu `16px`, rộng tự động.
- Khoảng cách với thời gian: `4px`.
- Màu mặc định: màu primary hiện có của hệ thống.
- Hover/focus: tăng độ đậm, không đổi layout.

### 3.3. Tooltip/Popover

Không dùng tooltip một dòng đơn giản vì cần hiển thị nhiều hồ sơ. Sử dụng popover nhỏ:

```text
Đã lưu trong 3 hồ sơ

Đơn hàng kính 12mm          Đang xử lý
Báo giá công trình A        Thiếu thông tin
Chăm sóc sau bán            Hoàn thành
```

Quy tắc:

- Desktop: mở khi rê chuột hoặc focus bằng bàn phím.
- Mobile/tablet: mở khi chạm vào icon.
- Hiển thị tối đa 5 hồ sơ trong popover.
- Nếu còn dữ liệu: hiển thị `Xem thêm N hồ sơ`.
- Mỗi dòng gồm tên hồ sơ và nhãn trạng thái.
- Có thể bổ sung phòng ban/người phụ trách bằng chữ nhỏ khi cần phân biệt hai hồ sơ trùng tên.
- Click vào tên hồ sơ mở popup chi tiết hồ sơ hiện có.
- Popover tự chọn hướng trên/dưới để không bị cắt bởi khung chat.
- Nội dung phải có nền đặc, độ tương phản cao và không dùng opacity thấp như tooltip cảnh báo Google Archive hiện tại.

Tên hồ sơ dùng theo thứ tự:

1. `ArchiveStory.title`.
2. `ArchiveStory.conversationName`.
3. `Hồ sơ không có tiêu đề`.

### 3.4. Khả năng truy cập

Icon phải là nút có thể focus, không chỉ là một `span`.

```text
aria-label="Tin nhắn đang nằm trong 3 hồ sơ"
```

- `Enter` hoặc `Space`: mở popover.
- `Escape`: đóng popover.
- Không phụ thuộc riêng vào màu sắc để truyền đạt trạng thái.

---

## 4. Phân quyền và chống lộ dữ liệu

Số lượng hiển thị phải được tính sau khi áp dụng phạm vi hồ sơ của người đăng nhập.

Ví dụ:

- Tin nhắn thực tế nằm trong 4 hồ sơ.
- Nhân viên chỉ có quyền xem 2 hồ sơ.
- Giao diện chỉ hiển thị số `2` và tên 2 hồ sơ được phép xem.

Không trả về:

- Tổng số hồ sơ thật nếu có hồ sơ bị ẩn.
- ID, tên, trạng thái, phòng ban hoặc người phụ trách của hồ sơ ngoài phạm vi.
- Dấu hiệu như `còn 2 hồ sơ bị ẩn`, vì vẫn làm lộ sự tồn tại của dữ liệu.

Phạm vi sử dụng cùng quy tắc `archiveScopeWhere(actor)` đang áp dụng tại khu vực Hồ sơ.

Admin ứng dụng có thể thấy toàn bộ trong tổ chức. Admin phòng ban và user thường chỉ thấy dữ liệu theo quyền/phạm vi đã được cấu hình.

---

## 5. Contract dữ liệu cho màn hình chat

### 5.1. Không gọi API theo từng tin nhắn

Không triển khai kiểu:

```text
GET /messages/:messageId/archive-stories
```

cho từng bong bóng, vì 50 tin nhắn sẽ tạo thêm tối đa 50 request.

Phương án chính:

- Mở rộng `GET /api/v1/conversations/:id/messages`.
- Truy vấn toàn bộ quan hệ hồ sơ cho danh sách `messageIds` của trang hiện tại bằng một truy vấn batch.
- Áp dụng scope của người dùng trước khi nhóm dữ liệu theo `sourceMessageId`.

### 5.2. Dữ liệu trả về trên từng tin nhắn

```json
{
  "id": "message-id",
  "content": "Nội dung tin nhắn",
  "archiveInfo": {
    "visibleCount": 2,
    "items": [
      {
        "id": "story-id-1",
        "title": "Đơn hàng kính 12mm",
        "businessStatus": "processing",
        "departmentName": "Phòng Kế Hoạch Sản Xuất",
        "assignedUserName": "Đặng Hồ Sơn"
      },
      {
        "id": "story-id-2",
        "title": "Báo giá công trình A",
        "businessStatus": "needs_info",
        "departmentName": "Phòng Kinh doanh",
        "assignedUserName": "Ngô Quốc Hữu"
      }
    ],
    "hasMore": false
  }
}
```

Quy tắc:

- `visibleCount`: tổng số hồ sơ người dùng được phép xem.
- `items`: tối đa 5 hồ sơ mới cập nhật gần nhất.
- `hasMore`: chỉ phản ánh việc còn hồ sơ trong chính phạm vi được xem.
- Nếu `visibleCount = 0`, có thể trả `archiveInfo: null` để giảm payload.
- Chỉ select các trường gọn, không include toàn bộ tin nhắn hồ sơ, lịch sử hoặc cấu hình backup.

### 5.3. API xem đầy đủ khi có hơn 5 hồ sơ

```text
GET /api/v1/archive/messages/:sourceMessageId/stories?page=1&limit=20
```

API phải:

- Kiểm tra tin nhắn thuộc tổ chức hiện tại.
- Áp dụng `archiveScopeWhere(actor)`.
- Trả dữ liệu phân trang.
- Chỉ trả trường phục vụ danh sách hồ sơ.

---

## 6. Cập nhật realtime

### 6.1. Sự kiện đề xuất

Thêm sự kiện:

```text
archive:message-membership-changed
```

Payload tối thiểu:

```json
{
  "conversationId": "conversation-id",
  "sourceMessageIds": ["message-id-1", "message-id-2"],
  "action": "added"
}
```

`action` nhận `added` hoặc `removed`.

Không đưa tên hồ sơ vào sự kiện phát chung cho toàn tổ chức nếu socket chưa tách theo phạm vi người dùng. Client nhận sự kiện sẽ tải lại `archiveInfo` cho các tin nhắn đang hiển thị bằng API có kiểm tra quyền.

Phương án tốt hơn về lâu dài là phát sự kiện vào room theo user/phạm vi, nhưng không bắt buộc cho lần triển khai đầu.

### 6.2. Các thời điểm phát sự kiện

- Tạo hồ sơ từ tin nhắn.
- Bổ sung tin nhắn vào hồ sơ.
- Loại tin nhắn khỏi hồ sơ.
- Xoá/hủy liên kết hồ sơ nếu sau này có chức năng này.
- Thay đổi quyền làm cho hồ sơ bắt đầu hoặc ngừng hiển thị với user.

Đổi trạng thái hồ sơ không làm thay đổi số lượng, nhưng cần cập nhật nhãn trạng thái trong popover qua `archive:status-changed`.

### 6.3. Cập nhật lạc quan

Sau khi người dùng lưu hồ sơ thành công ngay trong màn hình chat:

- Cập nhật `archiveInfo` của các tin nhắn vừa chọn ngay lập tức.
- Sau đó đồng bộ lại bằng sự kiện/API.
- Không tăng số nếu hồ sơ đó đã tồn tại trong `archiveInfo`.

---

## 7. Danh mục trạng thái hồ sơ

### 7.1. Bốn trạng thái mặc định

| Mã mặc định | Nhãn giao diện | Nhóm hành vi | Ý nghĩa |
|---|---|---|---|
| `processing` | Đang xử lý | `active` | Hồ sơ đang được nhân viên thực hiện |
| `needs_info` | Thiếu thông tin | `waiting` | Tạm chờ khách hàng, bộ phận khác hoặc dữ liệu bổ sung |
| `completed` | Hoàn thành | `completed` | Công việc đã có kết quả cuối cùng |
| `cancelled` | Huỷ | `cancelled` | Hồ sơ không tiếp tục xử lý |

Đây là dữ liệu mặc định khi khởi tạo tổ chức, không phải danh sách hard-code cố định trên frontend.

Không tiếp tục dùng nhãn `Chưa hoàn thành` làm một trạng thái riêng. Khi cần số tổng hợp, `Chưa hoàn thành` được hiểu là tất cả trạng thái thuộc hai nhóm:

```text
active + waiting
```

### 7.2. Admin bổ sung trạng thái

Admin ứng dụng được mở màn hình:

```text
Cài đặt > Hồ sơ lưu trữ > Trạng thái hồ sơ
```

Admin có thể:

- Tạo trạng thái mới.
- Đổi tên và mô tả trạng thái.
- Chọn màu, biểu tượng và thứ tự hiển thị.
- Chọn phạm vi áp dụng toàn tổ chức hoặc một/một số phòng ban.
- Chọn trạng thái mặc định khi tạo hồ sơ.
- Chọn trạng thái được phép chuyển tiếp.
- Ngừng sử dụng trạng thái.

Ví dụ trạng thái bổ sung:

| Tên trạng thái | Nhóm hành vi |
|---|---|
| Chờ khách xác nhận | `waiting` |
| Chờ duyệt nội bộ | `waiting` |
| Đang sản xuất | `active` |
| Đang giao hàng | `active` |
| Hoàn thành một phần | `completed` hoặc `active`, do Admin chọn theo nghiệp vụ |
| Không liên hệ được | `cancelled` hoặc `waiting`, do Admin chọn |

Khi tạo trạng thái, Admin bắt buộc chọn một trong bốn nhóm hành vi hệ thống:

| Nhóm hành vi | Ý nghĩa hệ thống |
|---|---|
| `active` | Hồ sơ đang được xử lý; cho phép bổ sung và tự đồng bộ tin nhắn |
| `waiting` | Hồ sơ đang chờ dữ liệu/phản hồi; vẫn là hồ sơ mở |
| `completed` | Hồ sơ đã hoàn tất; mặc định khóa bổ sung tin nhắn |
| `cancelled` | Hồ sơ đã dừng; mặc định khóa bổ sung tin nhắn |

Tên trạng thái có thể thay đổi, nhưng nhóm hành vi không được thay đổi tùy tiện sau khi trạng thái đã có dữ liệu. Nếu cần đổi nhóm hành vi, Admin phải xác nhận tác động và hệ thống ghi audit.

### 7.3. Thuộc tính cấu hình trạng thái

Mỗi trạng thái gồm:

```text
Tên trạng thái *
Mã trạng thái *
Nhóm hành vi *
Màu hiển thị
Biểu tượng
Mô tả
Thứ tự hiển thị
Phạm vi phòng ban
Trạng thái mặc định
Cho phép bổ sung tin nhắn
Tự đồng bộ tin trả lời
Yêu cầu ghi chú khi chuyển vào
Yêu cầu kết quả xử lý
Đang hoạt động
```

Quy tắc:

- `code` duy nhất trong phạm vi tổ chức, không thay đổi sau khi tạo.
- Trạng thái thuộc `completed` mặc định yêu cầu kết quả xử lý.
- Trạng thái thuộc `cancelled` mặc định yêu cầu lý do.
- `active` và `waiting` mặc định cho phép bổ sung tin nhắn.
- Admin có thể siết chặt quy tắc, nhưng không được bật tự đồng bộ cho trạng thái đã đóng nếu chưa xác nhận cảnh báo.
- Mỗi phòng ban chỉ có một trạng thái mặc định khi tạo hồ sơ.
- Nếu phòng ban chưa cấu hình, dùng trạng thái mặc định toàn tổ chức.

### 7.4. Màu và biểu tượng

| Nhóm hành vi | Màu mặc định | Biểu tượng mặc định |
|---|---|---|
| `active` | Xanh dương | tiến trình/đồng hồ |
| `waiting` | Cam/vàng | cảnh báo thông tin |
| `completed` | Xanh lá | dấu kiểm |
| `cancelled` | Xám hoặc đỏ nhạt | vòng tròn gạch chéo |

Admin có thể chọn màu trong bảng màu giới hạn của hệ thống. Không cho nhập CSS hoặc mã màu tùy ý gây mất đồng nhất/độ tương phản.

### 7.5. Chuyển trạng thái

Luồng mặc định:

| Từ nhóm hành vi | Có thể chuyển sang |
|---|---|
| `active` | `active`, `waiting`, `completed`, `cancelled` |
| `waiting` | `active`, `waiting`, `completed`, `cancelled` |
| `completed` | `active` (mở lại) |
| `cancelled` | `active` (khôi phục) |

Admin có thể cấu hình danh sách trạng thái đích cụ thể. Tuy nhiên:

- Không chuyển trực tiếp từ nhóm `completed` sang `cancelled`.
- Không chuyển trực tiếp từ nhóm `cancelled` sang `completed`.
- Cần mở lại về một trạng thái thuộc nhóm `active` trước.
- Hệ thống không cho xoá đường chuyển đang cần thiết để mở lại hồ sơ nếu chưa có đường thay thế.

### 7.6. Điều kiện cập nhật

- Chuyển vào nhóm `completed`: bắt buộc nhập `Kết quả xử lý`, trừ khi Admin cấu hình yêu cầu cao hơn.
- Chuyển vào trạng thái `Thiếu thông tin` mặc định: nhập `Thông tin còn thiếu`.
- Chuyển vào nhóm `cancelled`: bắt buộc nhập `Lý do huỷ`.
- Mở lại từ nhóm `completed` hoặc `cancelled`: bắt buộc ghi nhận lý do mở lại.
- Mọi lần chuyển trạng thái ghi vào `ArchiveStatusHistory`.
- `completedAt` và `completedByUserId` chỉ có giá trị khi trạng thái thuộc nhóm `completed`.
- Khi mở lại hồ sơ hoàn thành, xoá `completedAt` và `completedByUserId`, nhưng giữ lịch sử cũ.

### 7.7. Phân quyền quản trị trạng thái

- Chỉ Admin ứng dụng hoặc role có permission `archive.status.manage` được tạo/sửa/sắp xếp/ngừng sử dụng trạng thái.
- Quản lý phòng ban chỉ được cấu hình trạng thái riêng của phòng nếu có permission `archive.status.manage_department`.
- User thường chỉ được sử dụng trạng thái được cấp, không được sửa danh mục.
- Thao tác thêm, sửa nhóm hành vi, ngừng sử dụng và thay đổi luồng chuyển phải được ghi audit.

### 7.8. Phân quyền chuyển trạng thái

- User phụ trách hồ sơ:
  - Được chuyển theo các đường chuyển đã cấu hình.
  - Quyền huỷ phụ thuộc permission `archive.delete` hoặc permission tương đương hiện có.
- Quản lý phòng ban:
  - Được chuyển trạng thái hồ sơ trong phạm vi phòng ban.
  - Được mở lại hồ sơ nếu có quyền `archive.approve`.
- Admin ứng dụng:
  - Toàn quyền chuyển trạng thái và mở lại.

Backend là nơi quyết định quyền cuối cùng; không chỉ ẩn nút ở frontend.

### 7.9. Không xoá cứng trạng thái đã sử dụng

- Trạng thái chưa được hồ sơ nào sử dụng: Admin có thể xoá.
- Trạng thái đã được sử dụng: chỉ được `Ngừng sử dụng`.
- Hồ sơ cũ vẫn hiển thị tên và màu trạng thái đã ngừng sử dụng.
- Không cho chọn trạng thái đã ngừng sử dụng cho hồ sơ mới.
- Khi ngừng sử dụng, Admin phải chọn trạng thái thay thế cho các hồ sơ đang mở hoặc chủ động giữ nguyên dữ liệu cũ.

---

## 8. Tác động lên giao diện Hồ sơ

### 8.1. Tab trạng thái

Danh sách mặc định sau khi khởi tạo:

```text
Tất cả | Đang xử lý | Thiếu thông tin | Hoàn thành | Huỷ
```

Khi Admin bổ sung trạng thái:

- Tab được sinh từ danh mục trạng thái đang hoạt động.
- Thứ tự theo cấu hình của Admin.
- Có thể gộp tab theo nhóm hành vi khi tổ chức có quá nhiều trạng thái.
- Luôn có tab `Tất cả`.
- Trạng thái ngừng sử dụng chỉ xuất hiện khi bộ lọc cho phép xem dữ liệu cũ.

Responsive:

- Desktop: hiển thị một hàng.
- Màn hình hẹp: cho cuộn ngang, không ép chữ dính vào nhau.
- Tab có số lượng nếu không làm giao diện quá dày.
- Nếu có trên 6 trạng thái, ưu tiên thanh chọn trạng thái hoặc menu `Thêm` thay vì kéo dài toàn bộ header.

### 8.2. Danh sách

Cột `TRẠNG THÁI` dùng nhãn mới.

Cột `THAO TÁC` mở menu:

- Hiển thị danh sách trạng thái đích được cấu hình từ trạng thái hiện tại.
- Kèm màu và biểu tượng của trạng thái.
- Mở form ghi chú/kết quả theo quy tắc của trạng thái đích.

Chỉ hiển thị các đích hợp lệ và người dùng có quyền thực hiện.

### 8.3. Kanban

Kanban mặc định có bốn cột:

```text
Đang xử lý | Thiếu thông tin | Hoàn thành | Huỷ
```

- Số cột thực tế được sinh từ danh mục trạng thái đang hoạt động và có bật `Hiển thị trên Kanban`.
- Admin có thể ẩn một trạng thái khỏi Kanban nhưng trạng thái vẫn dùng được ở danh sách/bộ lọc.
- Desktop: mỗi cột có chiều rộng tối thiểu, container cuộn ngang khi thiếu không gian.
- Mobile: xếp theo từng cột hoặc dùng tab trạng thái; không ép nhiều cột co nhỏ.
- Nếu hỗ trợ kéo thả, thao tác thả phải mở form yêu cầu ghi chú/kết quả theo cấu hình trạng thái đích.
- Nếu chưa làm kéo thả, dùng menu thao tác thống nhất với danh sách.

### 8.4. Thẻ thống kê

Đề xuất hiển thị:

- Tổng hồ sơ.
- Đang mở (`active`).
- Đang chờ (`waiting`).
- Backup lỗi.

`Hoàn thành` và `Huỷ` đã có tab/báo cáo, không nhất thiết chiếm diện tích thẻ đầu trang. Nếu cần giữ ba thẻ như hiện tại:

- Tổng hồ sơ.
- Chưa hoàn thành = toàn bộ trạng thái thuộc `active` + `waiting`.
- Backup lỗi.

---

## 9. Logic bổ sung tin nhắn và tự đồng bộ trả lời

### 9.1. Bổ sung thủ công

- User thường được bổ sung tin nhắn vào trạng thái có `allowMessageAppend = true`.
- Trạng thái thuộc `completed` hoặc `cancelled` mặc định bị khoá bổ sung đối với user thường.
- Quản lý/admin có thể bổ sung vào hồ sơ đã đóng nếu có quyền cao hơn; hệ thống phải ghi audit.
- Một tin nhắn không được lưu trùng hai lần trong cùng một hồ sơ.
- Một tin nhắn có thể nằm trong nhiều hồ sơ sau khi người dùng xác nhận cảnh báo.

### 9.2. Tự đồng bộ khi trả lời

Hiện logic chỉ đồng bộ vào hồ sơ `pending`. Sau nâng cấp:

- Đồng bộ tự động vào trạng thái có `autoSyncReplies = true`.
- Bốn trạng thái mặc định bật tự đồng bộ cho `processing` và `needs_info`.
- Trạng thái thuộc `completed` hoặc `cancelled` mặc định tắt tự đồng bộ.
- Nếu tin nhắn được trả lời nằm trong nhiều hồ sơ đang mở, tin trả lời được đồng bộ vào tất cả các hồ sơ đang mở mà user có quyền thao tác.
- Nếu không có hồ sơ đang mở, không tự mở lại hồ sơ.
- Chống trùng bằng unique `(storyId, sourceMessageId)`.

### 9.3. Nhắc việc

- Mọi trạng thái thuộc `active` và `waiting` đều thuộc nhóm hồ sơ chưa hoàn thành.
- `needs_info` có thể có nội dung nhắc riêng: đang chờ thông tin gì và chờ từ ai.
- Không gửi nhắc xử lý cho nhóm `completed` hoặc `cancelled`.

---

## 10. Migration dữ liệu

### 10.1. Tạo danh mục trạng thái

Tạo bảng cấu hình:

```text
ArchiveStatusDefinition
```

Các trường chính:

```text
id
orgId
departmentId (nullable)
code
name
description
behaviorGroup
colorToken
icon
displayOrder
isDefault
showOnKanban
allowMessageAppend
autoSyncReplies
requireNote
requireResult
isSystem
isActive
createdByUserId
createdAt
updatedAt
```

Ràng buộc:

- Unique `(orgId, departmentId, code)`.
- Không xoá cứng trạng thái đã được sử dụng.
- Một trạng thái chỉ thuộc một tổ chức.
- Trạng thái riêng phòng ban chỉ áp dụng cho hồ sơ của phòng ban đó.

Tạo bảng luồng chuyển:

```text
ArchiveStatusTransition
```

Các trường chính:

```text
orgId
fromStatusId
toStatusId
requiredPermission
isActive
```

### 10.2. Liên kết hồ sơ với danh mục trạng thái

Thêm vào `ArchiveStory`:

```text
statusDefinitionId
```

`businessStatus` hiện tại được giữ tạm trong giai đoạn chuyển tiếp để tương thích API cũ. Sau khi toàn bộ backend/frontend dùng `statusDefinitionId`, mới xem xét loại bỏ trường cũ.

Không duy trì lâu dài hai nguồn sự thật. Trạng thái chính thức phải là `statusDefinitionId`; nhóm hành vi lấy từ `ArchiveStatusDefinition.behaviorGroup`.

### 10.3. Chuyển trạng thái cũ

```text
pending   -> processing
completed -> completed
cancelled -> cancelled
```

Mỗi tổ chức được seed bốn `ArchiveStatusDefinition` mặc định, sau đó backfill `ArchiveStory.statusDefinitionId`.

Không mất lịch sử trạng thái cũ. `ArchiveStatusHistory` nên bổ sung:

```text
fromStatusDefinitionId
toStatusDefinitionId
note
```

Giữ `fromStatus` và `toStatus` dạng chuỗi trong giai đoạn chuyển tiếp để đọc lịch sử cũ.

### 10.4. Giai đoạn tương thích

Trong một phiên bản chuyển tiếp:

- Backend có thể tiếp nhận `pending` từ client cũ và chuẩn hoá thành `processing`.
- API mới trả cả `statusDefinition` và `behaviorGroup`.
- Frontend mới không gửi `pending`.
- Sau khi toàn bộ frontend đã cập nhật, bỏ alias `pending`.

### 10.5. Các vị trí phải đổi đồng bộ

- Bỏ bộ trạng thái hard-code trong `archive-routes.ts`.
- Bộ lọc danh sách và Kanban lấy danh mục từ API.
- Logic bổ sung tin nhắn dựa trên cấu hình trạng thái.
- `archive-reply-sync-service.ts`.
- `archive-reminder.ts`.
- Báo cáo/tổng hợp số lượng.
- Backup payload nếu đang ghi trạng thái lên Google Sheets.
- Test fixture và seed có dùng `pending`.

---

## 11. Thay đổi kỹ thuật dự kiến

### Backend

- `backend/src/modules/chat/chat-routes.ts`
  - Bổ sung `archiveInfo` theo batch vào response tin nhắn.
- `backend/src/modules/archive/archive-routes.ts`
  - API danh sách hồ sơ theo tin nhắn.
  - API danh mục trạng thái và điều kiện chuyển trạng thái động.
  - Sự kiện membership dùng `sourceMessageIds`.
- Module cấu hình trạng thái mới:
  - CRUD trạng thái theo tổ chức/phòng ban.
  - Cấu hình luồng chuyển.
  - Kiểm tra trạng thái đang được sử dụng trước khi xoá/ngừng sử dụng.
- `backend/src/modules/archive/archive-service.ts`
  - Helper tải tóm tắt hồ sơ theo danh sách tin nhắn.
  - Quy tắc hồ sơ đang mở dựa trên `behaviorGroup`.
- `backend/src/modules/archive/archive-reply-sync-service.ts`
  - Đồng bộ theo cờ `autoSyncReplies` và quyền thao tác.
- `backend/src/modules/archive/archive-reminder.ts`
  - Nhắc việc theo nhóm `active`, `waiting` và cấu hình từng trạng thái.
- `backend/prisma/schema.prisma`
  - Thêm `ArchiveStatusDefinition`, `ArchiveStatusTransition`.
  - Thêm `ArchiveStory.statusDefinitionId`.
  - Migration dữ liệu từ `businessStatus`.

### Frontend

- `frontend/src/components/chat/MessageThread.vue`
  - Nhận và cập nhật `archiveInfo`.
  - Xử lý realtime/optimistic update.
- `frontend/src/components/chat/message-bubble.vue`
  - Hiển thị icon, badge và popover.
- `frontend/src/views/ArchiveStoriesView.vue`
  - Tab, bộ lọc, nhãn, Kanban và form chuyển trạng thái động.
- Khu vực Cài đặt:
  - Danh sách trạng thái.
  - Form tạo/sửa.
  - Sắp xếp, phạm vi phòng ban và luồng chuyển.
- Type/interface dùng chung cho:
  - `MessageArchiveInfo`.
  - `ArchiveStatusDefinition`.
  - `ArchiveStatusBehaviorGroup`.

---

## 12. Hiệu năng

- Một trang 50 tin nhắn chỉ thêm tối đa một truy vấn batch quan hệ hồ sơ.
- Cần index hiệu quả trên `ArchiveMessage.sourceMessageId`.
- Không include toàn bộ `ArchiveStory.messages`.
- Giới hạn 5 hồ sơ tóm tắt trên mỗi tin nhắn.
- Chỉ refetch archive info của các tin nhắn đang có trên màn hình khi nhận socket event.
- Không tính số lượng bằng vòng lặp query trong frontend hoặc backend.

---

## 13. Trường hợp biên

1. Tin nhắn nằm trong nhiều hồ sơ cùng tên:
   - Popover hiển thị thêm phòng ban hoặc người phụ trách.
2. Hồ sơ bị đổi tên:
   - Icon giữ nguyên số lượng, popover cập nhật tên qua event/refetch.
3. Hồ sơ chuyển trạng thái:
   - Nhãn trong popover cập nhật, số lượng không đổi.
4. Tin nhắn bị loại khỏi một trong nhiều hồ sơ:
   - Badge giảm đúng một đơn vị trong phạm vi nhìn thấy.
5. Tin nhắn bị thu hồi:
   - Vẫn giữ icon vì bản chụp hồ sơ còn tồn tại.
6. Tài khoản Zalo bị xoá:
   - Hồ sơ và icon quan hệ vẫn tồn tại; popup hồ sơ hiển thị cảnh báo tài khoản đã bị xoá.
7. User mất quyền phòng ban:
   - Sau refresh hoặc sự kiện quyền, số lượng và tên hồ sơ ngoài quyền biến mất.
8. Hồ sơ cuối cùng chứa tin nhắn:
   - Quy tắc hiện tại vẫn không cho loại toàn bộ tin nhắn làm hồ sơ rỗng, trừ khi sau này có nghiệp vụ xoá hồ sơ riêng.
9. Tin nhắn riêng tư bị che nội dung:
   - `archiveInfo` cũng phải tuân thủ quyền; không dùng icon để suy luận dữ liệu ngoài quyền.

---

## 14. Kiểm thử chấp nhận

### Biểu tượng trên chat

- Tin nhắn chưa lưu không có icon.
- Tin nhắn lưu một hồ sơ hiển thị `1`.
- Tin nhắn lưu nhiều hồ sơ hiển thị đúng số trong phạm vi user.
- Hover/focus/tap hiển thị đúng tên và trạng thái.
- Click tên mở đúng popup chi tiết.
- Không che thời gian, media, thu hồi hoặc menu tin nhắn.
- Hoạt động với tin đến, tin đi, ảnh, file và tin đã thu hồi.
- Không phát sinh N+1 request.

### Phân quyền

- User không thấy số lượng hoặc tên hồ sơ ngoài quyền.
- Quản lý phòng ban thấy đúng phạm vi phòng.
- Admin ứng dụng thấy toàn tổ chức.
- API trực tiếp vẫn từ chối dữ liệu ngoài quyền.

### Trạng thái

- Dữ liệu `pending` cũ chuyển thành `processing`.
- Bốn trạng thái mặc định được seed đúng cho mỗi tổ chức.
- Admin tạo được trạng thái mới và gắn đúng nhóm hành vi.
- Tab, bộ lọc và Kanban tự hiển thị trạng thái mới mà không sửa code frontend.
- Trạng thái thuộc nhóm hoàn thành bắt buộc có kết quả.
- Trạng thái thuộc nhóm huỷ bắt buộc có lý do.
- Mở lại ghi lịch sử và xoá thông tin hoàn thành hiện hành.
- User thường không sửa trái quyền.
- Trạng thái đã sử dụng chỉ được ngừng sử dụng, không bị xoá làm hỏng hồ sơ cũ.
- Trạng thái riêng phòng ban không xuất hiện sai phạm vi.
- Luồng chuyển do Admin cấu hình được kiểm tra ở backend.

### Đồng bộ

- Thêm/loại tin nhắn cập nhật badge khi chat đang mở.
- Trả lời tin thuộc hồ sơ đang mở tự đồng bộ đúng hồ sơ.
- Không tự đồng bộ vào hồ sơ hoàn thành/huỷ.
- Không tạo bản ghi trùng trong cùng hồ sơ.

---

## 15. Thứ tự triển khai đề xuất

1. Tạo schema danh mục trạng thái và luồng chuyển.
2. Seed bốn trạng thái mặc định, migration `pending -> processing` và backfill hồ sơ.
3. Xây API quản trị trạng thái theo tổ chức/phòng ban.
4. Cập nhật toàn bộ logic backend dùng trạng thái cấu hình và nhóm hành vi.
5. Bổ sung truy vấn batch `archiveInfo` vào API tin nhắn.
6. Tạo icon, badge và popover trong bong bóng tin nhắn.
7. Bổ sung socket event và cập nhật lạc quan.
8. Đổi tab, danh sách, Kanban và form trạng thái sang dữ liệu động.
9. Tạo giao diện Admin quản lý trạng thái.
10. Cập nhật báo cáo, nhắc việc và Google backup.
11. Chạy migration, test backend, test frontend và kiểm thử Docker.

---

## 16. Phương án chốt để thực hiện

- Badge chỉ đếm hồ sơ người dùng được phép xem.
- Không hiển thị icon nếu số lượng bằng `0`.
- Popover hiển thị tối đa 5 hồ sơ và cho mở chi tiết.
- Dữ liệu archive của tin nhắn được tải batch cùng API danh sách tin nhắn.
- Bốn trạng thái ban đầu chỉ là dữ liệu mặc định, không hard-code trên frontend.
- Admin được bổ sung, đổi tên, sắp xếp và ngừng sử dụng trạng thái.
- Mỗi trạng thái bắt buộc thuộc một nhóm hành vi: `active`, `waiting`, `completed` hoặc `cancelled`.
- Hồ sơ đang mở là mọi trạng thái thuộc `active` hoặc `waiting`.
- `pending` cũ được migration sang `processing`.
- Trả lời tự động dựa trên cờ `autoSyncReplies` của trạng thái.
- Kanban sinh cột từ trạng thái được cấu hình `showOnKanban`.
- Hoàn thành, huỷ và mở lại đều phải có dữ liệu nghiệp vụ phù hợp và ghi lịch sử.
