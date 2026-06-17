# PHASE 9 - Prompt thiết kế lại phần thân Kanban hồ sơ

## 1. Mục tiêu

Thiết kế lại **phần thân của màn hình Kanban Hồ sơ** theo ảnh mẫu đã duyệt:

- Các trạng thái được trình bày thành những cột thẳng hàng.
- Cột có chiều cao đồng đều và sử dụng tối đa chiều cao còn lại của màn hình.
- Thẻ hồ sơ nhỏ gọn, dễ quét nhanh, không chiếm quá nhiều chiều cao.
- Phân trang luôn nằm ở chân khu vực nội dung.
- Giao diện giữ nguyên màu sắc, font chữ và ngôn ngữ thiết kế của hệ thống hiện tại.
- Kanban phải tiếp tục dùng danh mục trạng thái động do Admin cấu hình, không hard-code bốn trạng thái.

---

## 2. Prompt chốt để triển khai

```text
Hãy thiết kế lại phần thân màn hình Kanban của khu vực Hồ sơ theo phong cách
gọn, phẳng và có cấu trúc giống ảnh tham chiếu.

Giữ nguyên thanh điều hướng, khu vực tiêu đề, bộ lọc bên trái và thanh tab
trạng thái hiện tại. Chỉ thiết kế lại khu vực Kanban và phần phân trang.

1. Bố cục bảng Kanban

- Kanban chiếm toàn bộ chiều rộng còn lại bên phải bộ lọc.
- Các cột trạng thái nằm trên cùng một hàng và có chiều cao bằng nhau.
- Cột được sinh động từ ArchiveStatusDefinition có:
  isActive = true và showOnKanban = true.
- Không hard-code Đang xử lý, Thiếu thông tin, Hoàn thành và Huỷ.
- Thứ tự cột theo displayOrder do Admin cấu hình.
- Mỗi cột có chiều rộng tối thiểu khoảng 270-300px.
- Khi số cột không vừa màn hình, Kanban cuộn ngang; không ép cột co nhỏ làm
  vỡ chữ hoặc vỡ thẻ.
- Khoảng cách giữa các cột khoảng 12-16px.
- Border cột mảnh, màu trung tính đồng nhất hệ thống, bo góc khoảng 6-8px.
- Nền thân cột gần màu trắng, không dùng gradient hoặc shadow quá mạnh.
- Chiều cao Kanban tối thiểu bằng phần nội dung còn lại của viewport và dừng
  ngay phía trên thanh phân trang.

2. Header mỗi cột

- Header cao khoảng 42-46px.
- Bên trái gồm:
  + Chấm màu nhỏ lấy từ colorToken của trạng thái.
  + Tên trạng thái viết rõ ràng, font đậm vừa phải.
- Bên phải là badge số lượng hồ sơ của trạng thái.
- Badge dạng hình tròn hoặc pill nhỏ, nền sáng, border mảnh.
- Header cố định ở đầu cột khi nội dung cột cuộn dọc.
- Tên dài phải ellipsis, có tooltip hiển thị tên đầy đủ.

3. Nội dung cột

- Mỗi cột có vùng danh sách cuộn dọc độc lập.
- Các cột luôn giữ cùng chiều cao dù số lượng hồ sơ khác nhau.
- Khi cột không có hồ sơ:
  + Hiển thị “Không có hồ sơ” ở giữa thân cột.
  + Dùng chữ nhỏ, màu trung tính, không hiển thị icon quá lớn.
- Không để cột rỗng bị co chiều cao theo nội dung.

4. Thẻ hồ sơ Kanban

- Thẻ rộng hết phần thân cột, trừ padding hai bên khoảng 10-12px.
- Chiều cao thẻ cần gọn, ưu tiên khoảng 170-190px với dữ liệu thông thường.
- Border mảnh, bo góc 6-8px, shadow rất nhẹ hoặc không dùng shadow.
- Bên trái thẻ có đường nhấn màu 2-3px theo màu của trạng thái hiện tại.
- Click vào vùng thẻ mở popup chi tiết hồ sơ.
- Nút Thao tác không được kích hoạt sự kiện mở popup chi tiết.

Thứ tự nội dung trong thẻ:

a. Dòng đầu:
- Loại hồ sơ, ví dụ “ĐƠN HÀNG”, chữ nhỏ, màu primary.
- Thời gian cập nhật gần nhất nằm bên phải.
- Nếu backup lỗi, hiển thị tam giác cảnh báo đỏ cạnh thời gian.
- Tooltip cảnh báo phải có nền đặc và chữ rõ.

b. Tiêu đề:
- Hiển thị tên hồ sơ đầy đủ tối đa 2 dòng.
- Vượt quá 2 dòng thì ellipsis.
- Không để tiêu đề làm tăng chiều cao thẻ không giới hạn.

c. Nội dung trao đổi:
- Chỉ hiển thị tối đa 3 dòng trao đổi gần nhất.
- Mỗi dòng giữ dạng thời gian, người gửi và nội dung rút gọn.
- Tên nhân viên phải dùng tên tài khoản Zalo kèm tài khoản ứng dụng:
  “Quốc [sondh]”.
- Nội dung dài dùng ellipsis, không làm tràn chiều ngang.

d. Dòng thống kê:
- Tổng số tin nhắn.
- Tổng số media.
- Số tin nhắn bị thu hồi, chỉ hiển thị khi lớn hơn 0.
- Mục thu hồi dùng màu cảnh báo đỏ nhưng không quá nổi.
- Các chỉ số nằm cùng một hàng và tự xuống hàng khi thật sự thiếu chiều rộng.

e. Footer thẻ:
- Có đường phân cách mảnh.
- Bên trái hiển thị tên phòng ban bằng chữ nhỏ và người xử lý bằng chữ đậm.
- Tên phòng ban và người xử lý dài phải ellipsis.
- Nếu tài khoản Zalo đã bị xoá, hiển thị icon cảnh báo và tooltip phù hợp.
- Bên phải là nút “Thao tác”.

5. Nút Thao tác

- Nút nhỏ, nền primary rất nhạt, chữ primary.
- Khi click, mở menu các trạng thái đích mà hồ sơ được phép chuyển tới.
- Danh sách trạng thái đích lấy từ ArchiveStatusTransition và quyền hiện tại.
- Nếu trạng thái đích yêu cầu ghi chú hoặc kết quả, mở popup cập nhật kết quả.
- Không hiển thị trạng thái hiện tại hoặc trạng thái user không có quyền chọn.
- Chưa triển khai kéo thả trong lần này.
- Kiến trúc CSS và component không được cản trở việc bổ sung kéo thả sau này.

6. Phân trang Kanban

- Thanh phân trang nằm cố định ở chân khu vực nội dung giống ảnh mẫu.
- Bên trái:
  + “Tổng cộng: X hồ sơ”.
  + Chọn số lượng hiển thị: 20, 50 hoặc 100.
- Bên phải:
  + Nút trang trước.
  + Danh sách trang.
  + Nút trang sau.
- Phân trang dùng chung với điều kiện lọc hiện tại.
- Badge trên đầu cột phải là tổng số hồ sơ của trạng thái trong toàn bộ kết
  quả đã lọc, không chỉ số lượng của trang đang xem.
- Nếu trạng thái có dữ liệu ở trang khác nhưng không có thẻ ở trang hiện tại,
  hiển thị “Không có hồ sơ ở trang này” thay cho “Không có hồ sơ”.

7. API và dữ liệu

- API danh sách Kanban phải trả thêm tổng số theo statusDefinitionId sau khi
  áp dụng toàn bộ bộ lọc và phạm vi quyền.
- Không tính badge bằng số phần tử đang có trong mảng frontend.
- Response đề xuất:

  {
    "stories": [],
    "total": 150,
    "page": 1,
    "limit": 20,
    "statusCounts": {
      "status-id-processing": 80,
      "status-id-needs-info": 20,
      "status-id-completed": 45,
      "status-id-cancelled": 5
    }
  }

- Hồ sơ trong trang hiện tại được phân phối vào cột theo statusDefinitionId.
- Mọi truy vấn vẫn áp dụng archiveScopeWhere(actor).
- User không được nhìn thấy số lượng hồ sơ ngoài phạm vi được phép xem.

8. Responsive

- Desktop từ 1280px:
  + Hiển thị các cột trên một hàng.
  + Nếu đủ chỗ, các cột chia đều chiều rộng.
  + Nếu không đủ chỗ, cuộn ngang.
- Tablet:
  + Cột giữ min-width khoảng 280px.
  + Cuộn ngang bằng touch.
- Mobile:
  + Không ép bốn cột nằm cạnh nhau.
  + Chỉ hiển thị một cột tại một thời điểm theo tab/chọn trạng thái.
  + Thẻ chiếm toàn chiều rộng.
  + Phân trang cho phép xuống hai hàng.
- Không xuất hiện scrollbar ngang trong từng thẻ.
- Không để header, badge, thời gian hoặc cảnh báo đè lên nhau.

9. Trạng thái tải và lỗi

- Khi tải dữ liệu, mỗi cột hiển thị skeleton card gọn.
- Khi API lỗi, hiển thị thông báo chung trong vùng Kanban và nút thử lại.
- Khi chuyển trạng thái thành công:
  + Thẻ được chuyển sang cột mới ngay.
  + Cập nhật badge của cột nguồn và cột đích.
  + Sau đó đồng bộ lại từ API.
- Nếu API chuyển trạng thái lỗi, trả thẻ về cột cũ và hiển thị lỗi.

10. Yêu cầu CSS

- Rà toàn bộ CSS Kanban hiện có và loại bỏ hoặc ghi đè có chủ đích các rule
  trùng lặp.
- Không tiếp tục chồng thêm nhiều nhóm .kanban-board, .kanban-column và
  .kanban-card ở các vị trí khác nhau.
- Tập trung CSS Kanban vào một khu vực cuối style hoặc tách thành component
  riêng nếu phù hợp.
- Không dùng !important trừ trường hợp bắt buộc với style thư viện.
- Giữ màu sắc theo design token hiện tại của hệ thống.
```

---

## 3. Cấu trúc giao diện đề xuất

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Tab: Tất cả | Đang xử lý | Thiếu thông tin | Hoàn thành | Huỷ          │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌─ Đang xử lý (80) ┐ ┌─ Thiếu thông tin (20) ┐ ┌─ Hoàn thành (45) ┐   │
│ │                  │ │                       │ │                   │   │
│ │ ┌──────────────┐ │ │ ┌──────────────┐      │ │ Không có hồ sơ    │   │
│ │ │ ĐƠN HÀNG 12:05│ │ │ │ ...          │      │ │ ở trang này      │   │
│ │ │ Tên hồ sơ     │ │ │ └──────────────┘      │ │                   │   │
│ │ │ 3 dòng tin... │ │ │                       │ │                   │   │
│ │ │ 5 tin 1 media │ │ │                       │ │                   │   │
│ │ │ Phòng / User  │ │ │                       │ │                   │   │
│ │ │      Thao tác │ │ │                       │ │                   │   │
│ │ └──────────────┘ │ │                       │ │                   │   │
│ └──────────────────┘ └─────────────────────────┘ └───────────────────┘   │
├──────────────────────────────────────────────────────────────────────────┤
│ Tổng cộng: 150 hồ sơ  Hiển thị: 20              ‹  1  2  3 ... 8  ›   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Logic phân trang chốt

Phương án đề xuất cho phiên bản này:

1. Backend lọc toàn bộ hồ sơ theo quyền, phòng ban, khách hàng, loại hồ sơ,
   từ khoá, trạng thái thu hồi và các điều kiện đang có.
2. Backend tính `statusCounts` trên toàn bộ kết quả đã lọc.
3. Backend áp dụng phân trang chung theo `updatedAt DESC`.
4. Frontend nhận các hồ sơ của trang hiện tại và chia vào cột tương ứng.
5. Badge cột dùng `statusCounts`, không dùng độ dài mảng trong trang.

Phương án này giữ đúng thiết kế phân trang chung ở cuối màn hình như ảnh mẫu,
đồng thời không làm sai số lượng tổng của từng trạng thái.

Không dùng phương án mỗi cột có phân trang riêng trong lần triển khai này vì:

- Khó hiểu với người dùng.
- Làm xuất hiện nhiều bộ điều khiển trang.
- Tăng số request.
- Không giống ảnh tham chiếu.

---

## 5. Kéo thả

Chưa bật kéo thả trong lần triển khai giao diện này.

Lý do:

- Một số trạng thái bắt buộc nhập ghi chú, lý do hoặc kết quả.
- Một số đường chuyển yêu cầu permission khác nhau.
- Cần xử lý hoàn tác khi API từ chối.

Giai đoạn sau có thể bổ sung:

1. Kéo thẻ sang cột đích.
2. Kiểm tra đường chuyển và quyền.
3. Nếu cần dữ liệu bổ sung, mở popup.
4. Chỉ chuyển thẻ chính thức sau khi API thành công.

---

## 6. Tiêu chí nghiệm thu

- Cột Kanban thẳng hàng, cùng chiều cao và không vỡ khối.
- Cột sinh động theo cấu hình trạng thái của Admin.
- Nhiều hơn bốn trạng thái vẫn hiển thị đúng bằng cuộn ngang.
- Thẻ gọn, không quá 190px trong trường hợp dữ liệu thông thường.
- Nội dung dài không làm tăng chiều cao không kiểm soát.
- Cảnh báo backup không đè lên thời gian.
- Hiển thị đúng số tin nhắn, media và tin bị thu hồi.
- Click thẻ mở chi tiết; click `Thao tác` không mở chi tiết.
- Chuyển trạng thái chỉ hiển thị đích hợp lệ theo quyền.
- Badge cột phản ánh tổng dữ liệu sau lọc, không chỉ trang hiện tại.
- Phân trang hoạt động ở cả chế độ danh sách và Kanban.
- Desktop, tablet và mobile không dính chữ hoặc tràn khung.
- CSS Kanban không còn nhiều rule trùng lặp gây chồng lấn.

---

## 7. Phạm vi thực hiện sau khi duyệt

### Frontend

- `frontend/src/views/ArchiveStoriesView.vue`
  - Cấu trúc Kanban.
  - Thẻ hồ sơ.
  - Phân trang Kanban.
  - Trạng thái tải/rỗng/lỗi.
  - Responsive.
  - Dọn CSS Kanban trùng lặp.

### Backend

- `backend/src/modules/archive/archive-routes.ts`
  - Trả `statusCounts` theo toàn bộ điều kiện lọc và phạm vi quyền.
  - Dùng phân trang chung cho Kanban.

### Kiểm thử

- Build frontend và backend.
- Test API count theo trạng thái và quyền.
- Test chuyển trạng thái cập nhật đúng cột.
- Test responsive ở desktop, tablet và mobile.
- Build và chạy lại Docker.

