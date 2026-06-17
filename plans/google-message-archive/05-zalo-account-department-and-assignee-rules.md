# PHASE 9 - Phòng ban và người phụ trách tài khoản Zalo

## 1. Mục tiêu

Chuẩn hoá quan hệ giữa:

- Tài khoản Zalo.
- Phòng ban quản lý.
- Trưởng phòng.
- Người phụ trách chính.
- Người phụ trách phụ 1 và phụ 2.
- Owner kỹ thuật của tài khoản.
- Người xử lý mặc định của hồ sơ được lưu từ tài khoản Zalo.

Các nguyên tắc cần chốt:

1. Mỗi tài khoản Zalo chỉ thuộc một phòng ban tại cùng một thời điểm.
2. Mỗi tài khoản Zalo chỉ có một người phụ trách chính gốc.
3. Có thể có tối đa hai người phụ trách phụ: `Phụ 1` và `Phụ 2`.
4. Trưởng phòng quản lý việc phân công các tài khoản Zalo thuộc phòng mình.
5. Trưởng phòng có thể chỉ định người phụ trách chính tạm thời cho một ngày cụ thể.
6. Hết ngày được chỉ định, hệ thống tự quay về người phụ trách chính gốc.
7. Owner tài khoản không đồng nghĩa với người phụ trách chính.
8. Khi trưởng phòng lưu hồ sơ, người xử lý mặc định là người phụ trách chính có hiệu lực của tài khoản Zalo tại thời điểm lưu.

---

## 2. Tách rõ ba khái niệm

### 2.1. Owner tài khoản

`ownerUserId` hiện có được hiểu là người sở hữu/quản trị kỹ thuật:

- Đăng nhập hoặc tiếp nhận tài khoản Zalo vào hệ thống.
- Quản lý session, QR, proxy hoặc các thao tác kỹ thuật nếu được cấp quyền.
- Không mặc định là người chịu trách nhiệm nghiệp vụ.
- Không tự động trở thành người xử lý hồ sơ.
- Có thể đồng thời được trưởng phòng phân công làm phụ trách chính, nhưng đó là một phân công riêng.

Không tiếp tục dùng nhãn `Sale phụ trách (Owner)` vì gây hiểu nhầm.

Nhãn giao diện đề xuất:

```text
Owner kỹ thuật
```

### 2.2. Quyền truy cập

`ZaloAccountAccess` tiếp tục quản lý người dùng được:

- Xem tài khoản/tin nhắn.
- Chat.
- Quản trị tài khoản.

Quyền truy cập không đồng nghĩa với trách nhiệm xử lý.

Ví dụ:

- Một nhân viên có quyền `read` nhưng không phải người phụ trách.
- Người phụ trách phụ có quyền `chat`.
- Trưởng phòng có quyền quản lý phân công nhưng không cần là Owner.

### 2.3. Phân công nghiệp vụ

Phân công nghiệp vụ xác định:

- Ai là người chịu trách nhiệm chính.
- Ai là người hỗ trợ thứ nhất và thứ hai.
- Ai đang thay người chính trong một ngày cụ thể.
- Hồ sơ mới mặc định giao cho ai xử lý.
- Báo cáo hiệu suất ghi nhận vào người nào.

Phân công nghiệp vụ phải có mô hình dữ liệu riêng, không tái sử dụng `ownerUserId` hoặc `ZaloAccountAccess.permission`.

---

## 3. Quan hệ tài khoản Zalo và phòng ban

### 3.1. Quy tắc sở hữu phòng ban

- Một tài khoản Zalo có đúng một `departmentId` đang hiệu lực.
- Không cho tài khoản đồng thời thuộc hai phòng ban.
- Người phụ trách chính/phụ phải là thành viên đang hoạt động của phòng ban đó.
- Trưởng phòng hoặc phó phòng có quyền được cấp mới quản lý phân công trong phòng.
- Admin ứng dụng được chuyển tài khoản giữa các phòng ban.
- Trưởng phòng chỉ được tiếp nhận/chuyển tài khoản nếu có quyền và phòng đích nằm trong phạm vi quản lý.

### 3.2. Khi chuyển phòng ban

Không được âm thầm giữ lại người phụ trách thuộc phòng cũ.

Luồng chuyển:

1. Chọn phòng ban mới.
2. Chọn người phụ trách chính mới thuộc phòng mới.
3. Tuỳ chọn người phụ trách phụ 1 và phụ 2.
4. Chọn thời điểm có hiệu lực.
5. Xác nhận ảnh hưởng đến quyền truy cập và hồ sơ đang mở.

Tại thời điểm chuyển có hiệu lực:

- Kết thúc phân công cũ.
- Huỷ các uỷ quyền tạm thời chưa diễn ra của phòng cũ hoặc yêu cầu Admin xác nhận giữ/chuyển.
- Tạo phân công mới.
- Cập nhật quyền truy cập cần thiết.
- Hồ sơ cũ giữ nguyên snapshot phòng ban/người xử lý để phục vụ lịch sử.
- Hồ sơ đang mở không tự đổi người xử lý, trừ khi người quản lý chọn `Chuyển các hồ sơ đang mở`.

Mọi lần chuyển phòng phải có audit:

```text
Tài khoản
Phòng cũ
Phòng mới
Người thực hiện
Lý do
Thời gian có hiệu lực
```

---

## 4. Người phụ trách chính và phụ

### 4.1. Các vị trí phân công

| Vị trí | Số lượng tối đa | Vai trò |
|---|---:|---|
| Phụ trách chính | 1 | Chịu trách nhiệm chính và nhận hồ sơ mặc định |
| Phụ trách phụ 1 | 1 | Hỗ trợ xử lý/chat |
| Phụ trách phụ 2 | 1 | Hỗ trợ xử lý/chat |

Một người không được đồng thời chiếm nhiều vị trí trên cùng một tài khoản.

### 4.2. Điều kiện được phân công

Người được phân công phải:

- Thuộc cùng tổ chức.
- Là thành viên đang hoạt động của phòng ban đang quản lý tài khoản.
- Không bị khoá hoặc nghỉ việc.
- Có quyền truy cập phù hợp vào tài khoản Zalo.

Khi gán người phụ trách:

- `Phụ trách chính`: hệ thống bảo đảm ít nhất quyền `chat`.
- `Phụ 1`, `Phụ 2`: mặc định quyền `chat`, có thể giảm xuống `read` nếu nghiệp vụ chỉ cần theo dõi.
- Không tự nâng lên quyền `admin` tài khoản.

Khi bỏ phân công:

- Không xoá quyền truy cập nếu quyền đó được cấp từ nguồn khác.
- Chỉ thu hồi quyền tự động nếu quyền được tạo riêng từ phân công này và người dùng không còn vai trò/phạm vi nào khác cần quyền.

Do đó, quyền truy cập cần lưu thêm nguồn cấp quyền hoặc được tính theo nhiều nguồn, tránh xoá nhầm quyền thủ công.

### 4.3. Tài khoản chưa có người phụ trách chính

Không nên để tài khoản hoạt động lâu dài mà không có người chính.

Quy tắc:

- Khi thêm tài khoản vào phòng ban, bắt buộc chọn người phụ trách chính.
- Dữ liệu cũ chưa có người chính được đánh dấu `Chưa phân công`.
- Trưởng phòng và Admin nhìn thấy cảnh báo trên danh sách.
- Không tự lấy Owner làm người chính.
- Khi lưu hồ sơ từ tài khoản chưa phân công:
  - Trưởng phòng/Admin phải chọn người xử lý trước khi lưu; hoặc
  - Hệ thống dùng cấu hình người nhận hồ sơ mặc định của phòng ban nếu đã được thiết lập.

Không âm thầm gán trưởng phòng để tránh sai báo cáo hiệu suất.

---

## 5. Uỷ quyền người phụ trách chính theo ngày

### 5.1. Mô hình hoạt động

Không sửa hoặc ghi đè người phụ trách chính gốc khi nhân viên nghỉ phép.

Lưu hai lớp:

1. **Người phụ trách chính gốc**: phân công ổn định.
2. **Uỷ quyền theo ngày**: người thay thế chỉ có hiệu lực trong ngày được chọn.

Người phụ trách chính có hiệu lực:

```text
nếu có uỷ quyền hợp lệ cho ngày hiện tại
  => người được uỷ quyền
ngược lại
  => người phụ trách chính gốc
```

Nhờ cách này, sau khi hết ngày hệ thống tự quay lại người chính gốc mà không cần cron sửa dữ liệu.

### 5.2. Quy tắc ngày và múi giờ

- Ngày hiệu lực được tính theo múi giờ của tổ chức; hiện tại ưu tiên `Asia/Bangkok`.
- Hiệu lực từ `00:00:00` đến `23:59:59.999` của ngày đã chọn.
- Mỗi tài khoản chỉ có một người phụ trách chính tạm thời trong cùng một ngày.
- Không cho hai uỷ quyền chồng lấn.
- Có thể tạo trước cho ngày tương lai.
- Không được sửa uỷ quyền đã hết hạn; chỉ được xem lịch sử.
- Có thể huỷ uỷ quyền tương lai hoặc uỷ quyền của ngày hiện tại, kèm lý do.

### 5.3. Người được uỷ quyền

Người thay thế phải:

- Là thành viên cùng phòng ban.
- Đang hoạt động trong ngày được chỉ định.
- Có quyền `chat` trên tài khoản trong thời gian thay thế.
- Không phải chính người đang được thay thế.

Ưu tiên gợi ý:

1. Phụ trách phụ 1.
2. Phụ trách phụ 2.
3. Nhân viên khác trong phòng.

Không bắt buộc người thay thế phải là phụ 1/phụ 2, vì trưởng phòng có thể điều phối nhân viên khác.

### 5.4. Quyền truy cập trong ngày uỷ quyền

Nếu người thay thế chưa có quyền:

- Hệ thống cấp quyền `chat` có thời hạn tương ứng.
- Hết ngày, quyền tạm tự hết hiệu lực.
- Không xoá quyền nếu người đó còn được cấp bởi phân công phụ, quyền thủ công hoặc vai trò quản lý.

Nên hỗ trợ quyền truy cập có hiệu lực:

```text
validFrom
validUntil
source
```

Không dùng cron để xoá quyền là nguồn sự thật. Middleware xác định quyền dựa trên thời gian hiệu lực; cron chỉ dọn dữ liệu/cache nếu cần.

---

## 6. Người xử lý mặc định khi lưu hồ sơ

### 6.1. Quy tắc chung

Khi lưu hồ sơ từ một cuộc hội thoại:

1. Xác định tài khoản Zalo của cuộc hội thoại.
2. Xác định phòng ban đang quản lý tài khoản tại thời điểm lưu.
3. Xác định người phụ trách chính có hiệu lực tại thời điểm lưu.
4. Gắn:

```text
departmentId = phòng ban của tài khoản Zalo
assignedUserId = người phụ trách chính có hiệu lực
```

Quy tắc này áp dụng cả khi người bấm lưu là:

- Trưởng phòng.
- Phó phòng.
- Admin.
- Người phụ trách phụ.
- Nhân viên khác có quyền lưu.

Người bấm lưu được ghi ở `createdByUserId`, không thay thế `assignedUserId`.

### 6.2. Trưởng phòng lưu hồ sơ

Ví dụ:

```text
Tài khoản Zalo: Zalo Đơn hàng 01
Phòng ban: Phòng Kế Hoạch Sản Xuất
Phụ trách chính gốc: Nguyễn Văn A
Uỷ quyền ngày 15/06/2026: Trần Văn B
Người bấm lưu: Trưởng phòng
```

Nếu lưu ngày `15/06/2026`:

```text
createdByUserId = Trưởng phòng
assignedUserId = Trần Văn B
```

Nếu lưu ngày `16/06/2026` và không có uỷ quyền:

```text
createdByUserId = Trưởng phòng
assignedUserId = Nguyễn Văn A
```

### 6.3. Cho phép thay đổi người xử lý

- Người đang được gán xử lý hồ sơ được quyền tạo yêu cầu bàn giao cho:
  - Người phụ trách phụ 1 của tài khoản Zalo.
  - Người phụ trách phụ 2 của tài khoản Zalo.
- Chỉ hiển thị người phụ đang hoạt động, còn thuộc phòng ban và có quyền xử lý tài khoản.
- Người xử lý không được tự chuyển hồ sơ cho nhân viên khác ngoài phụ 1/phụ 2.
- Yêu cầu bàn giao chỉ chính thức có hiệu lực sau khi người nhận bấm `Đồng ý nhận`.
- Trong thời gian chờ xác nhận:
  - `assignedUserId` vẫn là người xử lý hiện tại.
  - Người hiện tại vẫn chịu trách nhiệm, nhận nhắc việc và được tính vào báo cáo.
  - Hồ sơ hiển thị trạng thái phụ `Đang chờ Trần Văn B nhận bàn giao`.
  - Không tạo thêm một yêu cầu bàn giao đang chờ khác cho cùng hồ sơ.
- Khi người nhận đồng ý:
  - Cập nhật `assignedUserId` sang người nhận.
  - Ghi thời gian, người đề nghị, người nhận và lý do vào lịch sử.
  - Thông báo kết quả cho người chuyển và trưởng phòng.
- Khi người nhận từ chối:
  - Hồ sơ vẫn thuộc người cũ.
  - Người nhận có thể nhập lý do từ chối.
  - Thông báo cho người đề nghị và trưởng phòng.
- Người đề nghị được huỷ yêu cầu khi người nhận chưa phản hồi.
- Yêu cầu có thời hạn mặc định 24 giờ hoặc theo cấu hình tổ chức. Hết hạn thì hồ sơ vẫn thuộc người cũ.

Trưởng phòng là ngoại lệ điều phối:

- Trưởng phòng có permission `archive.handover.override` được chuyển trực tiếp, không cần người nhận xác nhận.
- Người nhận có hiệu lực ngay sau khi trưởng phòng xác nhận thao tác.
- Trưởng phòng có thể chuyển cho phụ 1, phụ 2 hoặc nhân viên hợp lệ khác trong phòng.
- Phó phòng chỉ được chuyển trực tiếp nếu permission group có quyền tương ứng; không mặc định ngang quyền trưởng phòng.
- Admin ứng dụng có thể chuyển trực tiếp trong phạm vi được phép.
- Chuyển trực tiếp phải ghi lý do và audit `manager_override`.

Khi thay đổi khỏi người mặc định, giao diện hiển thị:

```text
Mặc định theo Zalo: Nguyễn Văn A
Người xử lý hiện tại: Nguyễn Văn A
Đề nghị bàn giao cho: Trần Văn B
```

Popup của người xử lý:

```text
Bàn giao hồ sơ

Người nhận: [Phụ 1 | Phụ 2]
Lý do bàn giao *
[Gửi yêu cầu]
```

Thông báo của người nhận:

```text
Nguyễn Văn A đề nghị bàn giao hồ sơ "Đơn hàng kính 12mm"
Lý do: Nghỉ phép buổi chiều

[Từ chối] [Đồng ý nhận]
```

Popup của trưởng phòng:

```text
Chuyển người xử lý

Người xử lý mới *
Lý do điều phối *

[Xác nhận chuyển]
```

Đối với trưởng phòng, thao tác này mặc định là chuyển trực tiếp; giao diện không hiển thị lựa chọn yêu cầu người nhận xác nhận.

Mọi thao tác đề nghị, đồng ý, từ chối, huỷ, hết hạn hoặc trưởng phòng chuyển trực tiếp đều phải được ghi lịch sử.

### 6.4. Xử lý đồng thời và thay đổi dữ liệu

- Khi người nhận bấm đồng ý, backend phải kiểm tra yêu cầu vẫn ở trạng thái `pending`.
- Backend phải kiểm tra người đề nghị vẫn là `assignedUserId` hiện tại.
- Backend phải kiểm tra người nhận vẫn là phụ 1/phụ 2 hợp lệ, còn trong phòng và còn quyền truy cập.
- Nếu trưởng phòng đã chuyển hồ sơ trong lúc yêu cầu đang chờ:
  - Yêu cầu cũ tự chuyển thành `superseded`.
  - Người nhận không thể đồng ý yêu cầu cũ.
- Nếu hồ sơ đã `Hoàn thành` hoặc `Huỷ`:
  - Yêu cầu đang chờ tự hết hiệu lực, trừ khi Admin có quy trình đặc biệt.
- Nếu người nhận bị khoá, chuyển phòng hoặc bị bỏ khỏi vị trí phụ:
  - Yêu cầu chưa phản hồi tự chuyển thành `invalidated`.
- Thao tác nhận bàn giao và cập nhật `assignedUserId` phải chạy trong cùng transaction để tránh nhận hai lần.

### 6.5. Snapshot lịch sử

Hồ sơ cần giữ thông tin tại thời điểm tạo:

- Phòng ban nguồn.
- Người phụ trách chính có hiệu lực.
- Đây là phân công gốc hay uỷ quyền.
- Người tạo hồ sơ.

Sau này nếu tài khoản đổi phòng hoặc đổi người chính:

- Hồ sơ cũ không tự thay đổi.
- Hồ sơ mới dùng phân công mới.
- Trưởng phòng có thể chủ động điều phối lại hồ sơ đang mở bằng thao tác riêng.

---

## 7. Tự đồng bộ tin nhắn vào hồ sơ

Khi trả lời một tin nhắn đã có trong hồ sơ:

- Kiểm tra trạng thái hồ sơ có `autoSyncReplies = true`.
- Người gửi tin phải có quyền chat tài khoản Zalo.
- Tin trả lời vẫn được đồng bộ vào hồ sơ đang mở dù người gửi là người phụ trách chính, phụ hoặc người được uỷ quyền.
- `assignedUserId` của hồ sơ không tự thay đổi chỉ vì người khác gửi một tin nhắn.

Nếu muốn chuyển trách nhiệm xử lý, phải dùng thao tác `Đổi người xử lý`, không suy luận từ người vừa gửi tin.

Báo cáo cần tách:

- Người chịu trách nhiệm hồ sơ.
- Người thực tế gửi từng tin nhắn.
- Người tạo hồ sơ.

Không gộp ba khái niệm này thành một.

---

## 8. Giao diện quản lý tài khoản Zalo

### 8.1. Danh sách

Thay cột `Sale phụ trách (Owner)` thành các thông tin tách biệt:

- Phòng ban.
- Phụ trách chính.
- Đang thay bởi, nếu có uỷ quyền hôm nay.
- Phụ 1, phụ 2 ở tooltip hoặc drawer để tránh bảng quá rộng.
- Owner kỹ thuật chỉ hiển thị trong chi tiết hoặc cột tuỳ chọn.

Ví dụ:

```text
Phụ trách chính
Trần Văn B
Thay Nguyễn Văn A đến hết hôm nay
```

### 8.2. Drawer chi tiết

Các khu vực:

```text
Phòng ban quản lý
Phụ trách chính
Phụ trách phụ
Uỷ quyền theo ngày
Quyền truy cập
Owner kỹ thuật
```

Không trộn danh sách phụ trách với danh sách user có quyền truy cập.

### 8.3. Popup phân công

Trưởng phòng nhìn thấy:

```text
Phòng ban: Phòng Kế Hoạch Sản Xuất
Phụ trách chính *
Phụ trách phụ 1
Phụ trách phụ 2
```

Danh sách chọn chỉ gồm nhân viên hợp lệ trong phòng.

### 8.4. Popup uỷ quyền

```text
Người phụ trách chính gốc: Nguyễn Văn A
Ngày thay thế *
Người thay thế *
Lý do
Tự cấp quyền chat trong ngày: Có
```

Hiển thị lịch uỷ quyền sắp tới và lịch sử gần nhất.

### 8.5. Bàn giao người xử lý trong hồ sơ

Tại popup chi tiết hồ sơ:

- Người xử lý hiện tại thấy nút `Bàn giao`.
- Danh sách người nhận chỉ gồm phụ 1/phụ 2 hợp lệ.
- Khi đã gửi yêu cầu, nút chuyển thành `Đang chờ xác nhận`.
- Có thể xem người nhận, thời điểm hết hạn và huỷ yêu cầu.
- Người nhận thấy thông báo và mục `Yêu cầu nhận hồ sơ`.
- Trưởng phòng thấy nút `Chuyển người xử lý` và có thể chuyển ngay.

Trên danh sách/Kanban:

- Hồ sơ đang chờ bàn giao có icon nhỏ cạnh tên người xử lý.
- Tooltip: `Đang chờ Trần Văn B xác nhận bàn giao`.
- Không thay tên người xử lý trên cột chính cho đến khi yêu cầu được đồng ý.
- Không tạo một trạng thái hồ sơ mới tên `Chờ bàn giao`; đây là trạng thái phụ của việc phân công.

---

## 9. Phân quyền

### Admin ứng dụng

- Gán/chuyển phòng ban cho mọi tài khoản.
- Gán người chính/phụ.
- Tạo, sửa, huỷ uỷ quyền.
- Xem toàn bộ lịch sử.

### Trưởng phòng

- Quản lý tài khoản thuộc đúng phòng ban/phạm vi mình quản lý.
- Gán người chính/phụ trong danh sách nhân viên của phòng.
- Tạo uỷ quyền theo ngày.
- Điều phối hồ sơ đang mở nếu có permission.

### Phó phòng

- Quyền giống hoặc thấp hơn trưởng phòng theo permission group.
- Không mặc định có toàn quyền nếu chưa được cấp.

### Nhân viên

- Xem phân công liên quan.
- Không tự gán chính/phụ.
- Không tự tạo uỷ quyền, trừ khi có permission riêng.

### Owner kỹ thuật

- Không có quyền phân công nghiệp vụ chỉ vì là Owner.
- Chỉ quản lý phân công nếu đồng thời là Admin, trưởng/phó phòng hoặc có permission tương ứng.

Permission đề xuất:

```text
zalo_account.department.assign
zalo_account.assignee.manage
zalo_account.delegation.manage
zalo_account.assignment_history.view
archive.assign
archive.handover.request
archive.handover.respond
archive.handover.override
```

---

## 10. Mô hình dữ liệu đề xuất

### 10.1. Phòng ban hiện tại của tài khoản

Thêm vào `ZaloAccount`:

```text
departmentId
```

Quan hệ:

```text
ZaloAccount.department -> Department
```

### 10.2. Phân công gốc

Tạo bảng:

```text
ZaloAccountAssignment
```

Trường chính:

```text
id
orgId
zaloAccountId
departmentId
userId
role                 // primary | secondary_1 | secondary_2
validFrom
validUntil
createdByUserId
endedByUserId
reason
createdAt
updatedAt
```

Ràng buộc dữ liệu đang hiệu lực:

- Tối đa một `primary` trên mỗi tài khoản.
- Tối đa một `secondary_1`.
- Tối đa một `secondary_2`.
- Một user không giữ hai role cùng lúc trên cùng tài khoản.
- User phải thuộc `departmentId`.

Nên lưu theo lịch sử `validFrom/validUntil`, không update mất dấu phân công cũ.

### 10.3. Uỷ quyền theo ngày

Tạo bảng:

```text
ZaloAccountPrimaryDelegation
```

Trường chính:

```text
id
orgId
zaloAccountId
departmentId
basePrimaryUserId
delegateUserId
effectiveDate
timezone
reason
createdByUserId
cancelledAt
cancelledByUserId
createdAt
updatedAt
```

Ràng buộc:

- Unique một uỷ quyền đang hiệu lực trên `(zaloAccountId, effectiveDate)`.
- `basePrimaryUserId` và `delegateUserId` khác nhau.
- Cả hai thuộc cùng phòng ban tại thời điểm tạo.

### 10.4. Lịch sử phòng ban

Tạo bảng:

```text
ZaloAccountDepartmentHistory
```

Trường chính:

```text
zaloAccountId
fromDepartmentId
toDepartmentId
effectiveAt
changedByUserId
reason
createdAt
```

### 10.5. Nguồn quyền truy cập

Hiện `ZaloAccountAccess` chỉ có một dòng trên `(zaloAccountId, userId)`. Nếu tự cấp/thu hồi theo phân công, cần tránh xoá quyền thủ công.

Hai phương án:

1. Thêm `source`, `validFrom`, `validUntil` vào ACL hiện tại.
2. Tạo bảng grant riêng theo nguồn và tính quyền hiệu lực cao nhất.

Khuyến nghị phương án 2:

```text
ZaloAccountAccessGrant
```

Một user có thể có nhiều grant:

- `manual`
- `assignment_primary`
- `assignment_secondary`
- `delegation`
- `department_manager`

Quyền hiệu lực là mức cao nhất trong các grant còn hiệu lực.

### 10.6. Yêu cầu bàn giao hồ sơ

Tạo bảng:

```text
ArchiveAssignmentTransferRequest
```

Trường chính:

```text
id
orgId
storyId
fromUserId
toUserId
requestedByUserId
requestType          // consent | manager_override
status               // pending | accepted | rejected | cancelled | expired | superseded | invalidated
reason
responseNote
requestedAt
expiresAt
respondedAt
respondedByUserId
createdAt
updatedAt
```

Ràng buộc:

- Một hồ sơ chỉ có tối đa một yêu cầu `pending`.
- Với `consent`, `requestedByUserId` phải là người xử lý hiện tại.
- Với `consent`, `toUserId` phải là phụ 1 hoặc phụ 2 hợp lệ của tài khoản Zalo tại thời điểm tạo.
- Với `manager_override`, người thực hiện phải có `archive.handover.override`.
- `accepted` và cập nhật `ArchiveStory.assignedUserId` chạy trong cùng transaction.
- Lưu snapshot vai trò người nhận tại thời điểm đề nghị để phục vụ audit.

Nên bổ sung lịch sử thay đổi người xử lý:

```text
ArchiveAssignmentHistory
```

Trường chính:

```text
storyId
fromUserId
toUserId
changeType           // accepted_handover | manager_override | initial_assignment
transferRequestId
changedByUserId
reason
createdAt
```

Không dùng `ArchiveStatusHistory` để lưu bàn giao vì thay đổi trạng thái và thay đổi người xử lý là hai nghiệp vụ khác nhau.

---

## 11. API đề xuất

```text
GET    /api/v1/zalo-accounts/:id/assignment
PUT    /api/v1/zalo-accounts/:id/department
PUT    /api/v1/zalo-accounts/:id/assignment

GET    /api/v1/zalo-accounts/:id/delegations
POST   /api/v1/zalo-accounts/:id/delegations
DELETE /api/v1/zalo-accounts/:id/delegations/:delegationId

GET    /api/v1/zalo-accounts/:id/assignment-history
GET    /api/v1/zalo-accounts/:id/effective-primary?at=2026-06-15T10:00:00+07:00

POST   /api/v1/archive/stories/:id/handover-requests
GET    /api/v1/archive/handover-requests/inbox
POST   /api/v1/archive/handover-requests/:requestId/accept
POST   /api/v1/archive/handover-requests/:requestId/reject
POST   /api/v1/archive/handover-requests/:requestId/cancel
POST   /api/v1/archive/stories/:id/assign
```

Response phân công cần tách rõ:

```json
{
  "department": {
    "id": "department-id",
    "name": "Phòng Kế Hoạch Sản Xuất"
  },
  "owner": {
    "id": "owner-user-id",
    "name": "Owner kỹ thuật"
  },
  "basePrimary": {
    "id": "user-a",
    "name": "Nguyễn Văn A"
  },
  "effectivePrimary": {
    "id": "user-b",
    "name": "Trần Văn B",
    "source": "delegation",
    "effectiveDate": "2026-06-15"
  },
  "secondary1": null,
  "secondary2": null
}
```

Backend phải tự tính `effectivePrimary`; frontend không tự suy luận theo ngày.

API `POST /archive/stories/:id/handover-requests`:

- Chỉ người xử lý hiện tại được tạo yêu cầu thông thường.
- Backend trả danh sách người nhận hợp lệ hoặc kiểm tra `toUserId`.
- Không thay đổi `assignedUserId` khi tạo yêu cầu.

API `POST /archive/stories/:id/assign`:

- Dành cho trưởng phòng/Admin có quyền chuyển trực tiếp.
- Huỷ hiệu lực mọi yêu cầu đang chờ.
- Cập nhật người xử lý và lịch sử trong cùng transaction.

---

## 12. Tác động đến code hiện tại

Hiện tại hệ thống đang dùng `ownerUserId` cho nhiều mục đích:

- Xác định tài khoản user được nhìn thấy.
- Xác định khả năng quản lý tài khoản.
- Hiển thị `Sale phụ trách (Owner)`.
- Gán contact mới cho Owner trong một số luồng.

Các vị trí này cần được rà soát và tách lại:

- `backend/src/modules/zalo/zalo-scope.ts`
- `backend/src/modules/zalo/zalo-access-middleware.ts`
- `backend/src/modules/zalo/zalo-access-routes.ts`
- `backend/src/modules/zalo/zalo-dashboard-routes.ts`
- `backend/src/modules/zalo/friend-event-handler.ts`
- `frontend/src/components/zalo-accounts/AccountsTable.vue`
- `frontend/src/components/zalo-accounts/AccountDetailDrawer.vue`
- `frontend/src/components/zalo-accounts/OwnerReassignDrawer.vue`

Không đổi toàn bộ ý nghĩa `ownerUserId` ngay trong một lần migration. Giữ Owner kỹ thuật, đồng thời chuyển logic nghiệp vụ sang mô hình assignment mới.

---

## 13. Trường hợp biên

1. Người phụ trách chính nghỉ việc:
   - Khoá user.
   - Tài khoản chuyển sang `Chưa phân công`.
   - Trưởng phòng nhận cảnh báo và phải chọn người mới.
2. Người chính chuyển phòng:
   - Không còn hợp lệ cho tài khoản phòng cũ.
   - Yêu cầu phân công người thay thế trước khi hoàn tất chuyển user.
3. Trưởng phòng nghỉ:
   - Admin/phó phòng tiếp quản quyền điều phối.
   - Không tự biến trưởng phòng mới thành phụ trách chính.
4. Có uỷ quyền tương lai nhưng tài khoản đổi phòng:
   - Uỷ quyền bị vô hiệu hoá và ghi audit.
5. Có uỷ quyền hôm nay rồi đổi người chính gốc:
   - Uỷ quyền hôm nay vẫn giữ nếu người thay thế còn hợp lệ; ngày sau dùng người chính gốc mới.
6. Lưu hồ sơ đúng thời điểm chuyển ngày:
   - Backend dùng thời gian server chuẩn hoá theo timezone tổ chức.
7. User là Owner kỹ thuật nhưng thuộc phòng khác:
   - Không được coi là người phụ trách.
   - Quyền kỹ thuật và quyền xem nội dung riêng tư vẫn theo chính sách riêng.
8. Phụ trách phụ gửi tin:
   - Lưu đúng tên user thực tế gửi tin.
   - Không tự đổi người xử lý hồ sơ.
9. Xoá mềm tài khoản Zalo:
   - Giữ nguyên lịch sử phòng ban, phân công và hồ sơ.
10. Một phòng không có trưởng phòng:
   - Admin ứng dụng quản lý tạm thời và hệ thống hiển thị cảnh báo cấu hình.

---

## 14. Báo cáo

Báo cáo phải có các chiều dữ liệu riêng:

- Phòng ban quản lý tài khoản tại thời điểm phát sinh.
- Người phụ trách chính gốc.
- Người phụ trách chính có hiệu lực.
- Người xử lý hồ sơ.
- Người tạo hồ sơ.
- Người thực tế gửi tin nhắn.
- Số ngày được uỷ quyền.
- Số hồ sơ phát sinh trong ngày uỷ quyền.

Hiệu suất hồ sơ mặc định ghi cho `assignedUserId` của hồ sơ, không tự đổi theo người phụ trách Zalo hiện tại sau này.

---

## 15. Kiểm thử chấp nhận

- Một tài khoản không thể thuộc hai phòng cùng lúc.
- Một tài khoản không thể có hai người chính cùng hiệu lực.
- Trưởng phòng chỉ gán nhân viên thuộc phạm vi quản lý.
- Owner không tự xuất hiện ở vị trí phụ trách chính.
- Phụ 1/phụ 2 không trùng người chính hoặc trùng nhau.
- Uỷ quyền chỉ hiệu lực đúng ngày và đúng timezone.
- Hết ngày tự quay về người chính gốc mà không cần cập nhật DB bằng cron.
- Trưởng phòng lưu hồ sơ gắn đúng người chính có hiệu lực.
- Người tạo hồ sơ và người xử lý được lưu riêng.
- Người xử lý chỉ đề nghị bàn giao cho phụ 1/phụ 2 hợp lệ.
- Gửi yêu cầu không làm thay đổi người xử lý hiện tại.
- Người nhận đồng ý mới chính thức nhận hồ sơ.
- Người nhận từ chối thì hồ sơ vẫn thuộc người cũ.
- Trưởng phòng chuyển trực tiếp không cần xác nhận.
- Chuyển trực tiếp làm yêu cầu đang chờ chuyển thành `superseded`.
- Không thể đồng ý hai lần hoặc đồng ý yêu cầu đã hết hạn.
- Chuyển phòng không làm thay đổi hồ sơ lịch sử.
- Thu hồi quyền tạm không xoá quyền được cấp từ nguồn khác.
- Backend từ chối mọi thao tác phân công trái phòng ban/phân quyền.

---

## 16. Thứ tự triển khai đề xuất

1. Thêm `ZaloAccount.departmentId` và các bảng lịch sử/phân công/uỷ quyền.
2. Backfill phòng ban từ dữ liệu Owner hiện tại để Admin rà soát, không mặc định Owner là người chính.
3. Xây service tính `effectivePrimary` theo thời điểm.
4. Xây ACL grant nhiều nguồn hoặc bổ sung quyền có thời hạn.
5. Xây API phòng ban, phân công và uỷ quyền.
6. Đổi giao diện quản lý Zalo, tách Owner khỏi người phụ trách.
7. Tích hợp người xử lý mặc định vào luồng tạo hồ sơ.
8. Xây luồng yêu cầu bàn giao, xác nhận và trưởng phòng chuyển trực tiếp.
9. Refactor `zalo-scope` và middleware theo phòng ban/phân công/quyền truy cập.
10. Cập nhật báo cáo, thông báo và audit.
11. Chạy migration, test backend, frontend và Docker.

---

## 17. Phương án chốt đề xuất

- Owner là vai trò kỹ thuật, không phải người phụ trách chính.
- Mỗi tài khoản Zalo có một phòng ban hiện hành.
- Mỗi tài khoản có một người chính gốc, một phụ 1 và một phụ 2.
- Trưởng phòng quản lý phân công trong phòng mình.
- Uỷ quyền theo ngày là lớp tạm thời, không ghi đè người chính gốc.
- Backend tính người chính có hiệu lực theo ngày và timezone.
- Hồ sơ mới mặc định giao cho người chính có hiệu lực của tài khoản Zalo.
- Người tạo hồ sơ và người xử lý luôn được lưu riêng.
- Người xử lý được đề nghị bàn giao cho phụ 1/phụ 2, nhưng người nhận phải đồng ý.
- Trưởng phòng/Admin có quyền điều phối được chuyển trực tiếp không cần xác nhận.
- Trong thời gian chờ bàn giao, trách nhiệm vẫn thuộc người xử lý hiện tại.
- Hồ sơ cũ giữ snapshot, không tự đổi theo phân công Zalo mới.
- Quyền truy cập và trách nhiệm nghiệp vụ là hai lớp riêng biệt.
