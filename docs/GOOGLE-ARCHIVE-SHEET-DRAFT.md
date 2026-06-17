# Nhap thiet ke Google Archive Sheet

File mau: `docs/google-archive-sheet-draft.xlsx`

## 1. Raw_Messages

- Mot message la mot dong.
- Khong merge o.
- Luu khoa `message_id`, `batch_id`, `conversation_id`.
- Luu snapshot noi dung, reply, link Drive va trang thai thu hoi.
- Day la nguon du lieu chuan de app cap nhat khi co event thu hoi.

## 2. View_Messages

- Mot lan nguoi dung bam luu la mot dong, tuong ung mot `batch_id`.
- Cac message da chon trong batch duoc ghep theo thoi gian vao cot `Noi dung hoi thoai`.
- Cot A duoc merge qua cac batch lien tiep cua cung `conversation_id`.
- Tin reply co them dong `Tra loi` ben duoi noi dung chinh.
- Media duoc liet ke bang link Google Drive.
- Tin da thu hoi van giu noi dung snapshot va danh dau thoi gian thu hoi.

## 3. Quy tac merge

Chi merge tren `View_Messages`, sau khi da xac dinh block dong lien tiep co cung
`conversation_id`. Khong merge theo ten nhom vi ten nhom co the doi hoac bi trung.

Khi append batch moi:

1. Them cac message vao `Raw_Messages`.
2. Them mot dong tong hop vao `View_Messages`.
3. Unmerge block cu cua conversation neu can.
4. Merge lai cot A tu dong dau den dong cuoi cua block.

Neu du lieu View khong duoc sap xep lien tiep theo conversation thi khong merge; thay
vao do lap lai ten hoi thoai de tranh merge nham cac dong khong lien quan.

## 4. Xu ly thu hoi

Khi backend nhan event thu hoi:

1. Tim `Raw_Messages` theo `message_id`.
2. Cap nhat `Da thu hoi`, `Thoi gian thu hoi`, `Noi dung goc bi thu hoi`.
3. Tim `View_Messages` theo `batch_id` va cap nhat cot `Tin nhan thu hoi`.
4. Phat socket notification tren ZaloCRM.
5. Giu nguyen file tren Drive lam bang chung da luu.

## 5. Diem can xac nhan sau khi xem mau

- Mot batch co duoc phep chon message tu nhieu conversation hay khong. De an toan,
  ban dau nen chi cho chon trong mot conversation.
- Cot `Nguoi gui` nen liet ke tung dong hay bo vi da co ten trong noi dung.
- View co can tach rieng anh, video, file va voice thanh cac cot khac nhau hay dung
  chung mot cot Drive.
- Khi thu hoi, cap nhat dong View cu hay them them mot dong audit. De bao toan lich
  su, he thong nen cap nhat dong cu va dong thoi ghi audit trong database.
