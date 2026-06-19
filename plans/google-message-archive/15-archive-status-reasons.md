# 15. Ly do theo trang thai ho so

## 1. Muc tieu

Bo sung co che cau hinh `ly do` rieng cho tung trang thai ho so.

Muc tieu nghiep vu:

- Moi trang thai co the co danh sach ly do rieng, vi du:
  - `Thieu thong tin`: thieu SDT, thieu dia chi, thieu ma don.
  - `Huy`: khach huy, sai don, trung ho so.
  - `Hoan thanh`: da giao thanh cong, da gui bao gia, da chot thong tin.
- Admin hoac nguoi co quyen co the cau hinh danh sach ly do trong bang `Trang thai ho so`.
- Co the setup trang thai bat buoc chon ly do hoac khong.
- Ly do duoc luu bang ma va ten de phuc vu bao cao sau nay.
- Khi doi ten hoac tat ly do cu, lich su va bao cao cu van giu dung snapshot tai thoi diem chuyen trang thai.

## 2. Pham vi

Ap dung cho man hinh `Ho so` va popup `Trang thai ho so`.

Bao gom:

- Cau hinh ly do theo tung trang thai.
- Import danh sach ly do bang Excel.
- Chon ly do khi chuyen trang thai ho so.
- Hien thi ly do hien tai trong chi tiet ho so.
- Hien thi ly do trong lich su chuyen trang thai.
- Luu du lieu phuc vu bao cao theo ma ly do.

Khong bao gom trong phase dau:

- Man bao cao tong hop theo ly do.
- Bieu do thong ke ly do.
- Automation dua tren ly do.

## 3. Dinh nghia du lieu

### 3.1. Bang ArchiveStatusReason

Them bang moi `ArchiveStatusReason`.

Truong de xuat:

- `id`: khoa chinh.
- `orgId`: to chuc.
- `statusDefinitionId`: trang thai so huu ly do.
- `code`: ma ly do, dung cho bao cao va import.
- `name`: ten hien thi cho nguoi dung.
- `description`: mo ta tuy chon.
- `displayOrder`: thu tu hien thi.
- `isActive`: con su dung hay khong.
- `createdByUserId`: nguoi tao.
- `createdAt`: thoi gian tao.
- `updatedAt`: thoi gian cap nhat.

Rang buoc:

- Unique theo `statusDefinitionId + code`.
- `code` chi gom chu thuong, so, dau gach duoi hoac gach ngang.
- Ly do khong hard delete neu da tung duoc su dung trong lich su.
- Khi xoa ly do da co du lieu tham chieu thi chuyen sang `isActive = false`.

### 3.2. Bang ArchiveStatusDefinition

Them truong:

- `requireReason`: trang thai nay co bat buoc chon ly do khi chuyen vao hay khong.

Gia tri mac dinh:

- Trang thai cu: `requireReason = false`.
- Trang thai moi: mac dinh theo behavior:
  - `cancelled`: nen bat mac dinh `true`.
  - `waiting`: co the mac dinh `false`, admin tu cau hinh.
  - `completed`: co the mac dinh `false`, admin tu cau hinh.
  - `active`: mac dinh `false`.

### 3.3. Bang ArchiveStory

Them cac truong ly do hien tai:

- `statusReasonId`: ly do hien tai neu co.
- `statusReasonCodeSnapshot`: ma ly do tai thoi diem chuyen trang thai.
- `statusReasonNameSnapshot`: ten ly do tai thoi diem chuyen trang thai.

Ly do:

- Giup man danh sach va chi tiet hien thi nhanh ly do hien tai.
- Neu ly do bi sua ten hoac tat, ho so van hien thi dung ten da ghi nhan.

### 3.4. Bang ArchiveStatusHistory

Them cac truong:

- `reasonId`: ly do da chon trong lan chuyen trang thai.
- `reasonCodeSnapshot`: ma ly do tai thoi diem chuyen.
- `reasonNameSnapshot`: ten ly do tai thoi diem chuyen.

Quy tac:

- Moi lan chuyen trang thai co the co ly do rieng.
- Lich su khong phu thuoc vao ten ly do hien tai.

## 4. Migration du lieu cu

- Tat ca trang thai cu duoc set `requireReason = false`.
- Tat ca ho so cu co `statusReasonId = null`.
- Tat ca lich su cu co `reasonId = null`.
- Khong can seed ly do mac dinh neu chua co danh muc chuan.
- Neu sau nay can seed, tao script rieng theo tung org hoac tung phong ban.

## 5. Backend API

### 5.1. Lay danh sach trang thai

Cap nhat `GET /api/v1/archive/status-definitions`.

Response moi can co:

```json
{
  "statuses": [
    {
      "id": "...",
      "name": "Thieu thong tin",
      "code": "needs_info",
      "requireReason": true,
      "reasons": [
        {
          "id": "...",
          "code": "missing_phone",
          "name": "Thieu SDT",
          "displayOrder": 10,
          "isActive": true
        }
      ]
    }
  ]
}
```

### 5.2. Tao va cap nhat trang thai

Cap nhat:

- `POST /api/v1/archive/status-definitions`
- `PATCH /api/v1/archive/status-definitions/:id`

Body moi co:

- `requireReason`
- `reasons` neu can update inline trong cung form.

Quy tac:

- Neu `requireReason = true` thi trang thai nen co it nhat mot ly do active.
- Co the cho phep luu trang thai truoc, nhung can canh bao UI neu bat buoc ly do ma chua co danh sach ly do.

### 5.3. CRUD ly do

Them API:

- `POST /api/v1/archive/status-definitions/:statusId/reasons`
- `PATCH /api/v1/archive/status-reasons/:reasonId`
- `DELETE /api/v1/archive/status-reasons/:reasonId`
- `POST /api/v1/archive/status-definitions/:statusId/reasons/reorder`

Quyen:

- Phase dau: `owner/admin`.
- Neu he thong permission can mo rong: dung grant quan ly cau hinh ho so hoac quan ly phong ban.

### 5.4. Import Excel ly do

Them API:

- `POST /api/v1/archive/status-definitions/:statusId/reasons/import`

File Excel gom 2 cot:

| code | name |
| --- | --- |
| missing_phone | Thieu SDT |
| missing_address | Thieu dia chi |

Quy tac import:

- Dong thieu `code` hoac `name` la loi.
- `code` duoc normalize ve lowercase snake case neu can.
- Neu `code` da ton tai trong trang thai:
  - Cap nhat `name`.
  - Bat lai `isActive = true` neu ly do dang bi tat.
- Neu `code` chua ton tai:
  - Tao moi.
- Tra ve summary:
  - `created`
  - `updated`
  - `skipped`
  - `errors`

Can co nut tai file mau tren frontend.

### 5.5. Chuyen trang thai ho so

Cap nhat endpoint chuyen trang thai:

- `PATCH /api/v1/archive/stories/:id/status`

Body moi:

```json
{
  "statusDefinitionId": "...",
  "reasonId": "...",
  "note": "...",
  "resultContent": "..."
}
```

Validate:

- Neu trang thai dich co `requireReason = true` thi `reasonId` bat buoc.
- Neu co `reasonId`, reason phai:
  - thuoc dung `statusDefinitionId` dich.
  - dang `isActive = true`.
  - cung `orgId`.
- Neu khong bat buoc va user khong chon ly do thi luu null.
- Khi reopen tu trang thai ket thuc ve active, co the clear ly do hien tai hoac bat ly do cua trang thai active neu trang thai active cau hinh require.

Khi luu:

- Cap nhat `ArchiveStory.statusReasonId`.
- Cap nhat `ArchiveStory.statusReasonCodeSnapshot`.
- Cap nhat `ArchiveStory.statusReasonNameSnapshot`.
- Tao `ArchiveStatusHistory` kem snapshot ly do.

## 6. Frontend - Cau hinh trang thai ho so

Vi tri:

- Popup `Trang thai ho so`.
- Form them/sua trang thai ben phai.

Them cac thanh phan:

- Toggle `Bat buoc chon ly do`.
- Section `Ly do cua trang thai`.
- Bang ly do gom:
  - `Ma ly do`.
  - `Ten ly do`.
  - Trang thai active.
  - Nut sua.
  - Nut tat/xoa.
  - Nut sap xep len/xuong.
- Nut `Them ly do`.
- Nut `Nhap Excel`.
- Nut `Tai file mau`.

Trang thai UI:

- Neu chua chon trang thai nao, section ly do disabled hoac hien empty state.
- Neu bat `Bat buoc chon ly do` ma khong co ly do active, hien canh bao.
- Ly do cu da bi tat van co the hien trong lich su, nhung khong hien trong dropdown chon moi.

## 7. Frontend - Chuyen trang thai ho so

Khi user chuyen trang thai:

- Xac dinh trang thai dich.
- Neu trang thai dich co danh sach ly do active thi hien o `Ly do`.
- Neu trang thai dich bat `requireReason` thi o `Ly do` la bat buoc.
- Neu trang thai dich khong co ly do active thi an o `Ly do`.

### 7.1. Dropdown ly do co tim kiem

Yeu cau UX:

- Khi click vao o `Ly do`, dropdown mo ngay.
- User co the go de tim.
- Ket qua tra ve cac ly do gan dung nhat.
- Tim tren ca:
  - `code`
  - `name`
  - chuoi khong dau tieng Viet.

Sap xep ket qua:

1. Khop chinh xac `code` hoac `name`.
2. Bat dau bang tu khoa.
3. Chua tu khoa.
4. Khop gan dung sau khi bo dau.
5. Theo `displayOrder`.

Khong cho tao ly do moi ngay trong dropdown o phase dau, de tranh lam lech danh muc bao cao.

### 7.2. Validation UI

- Neu `requireReason = true` va chua chon ly do:
  - Disable nut luu hoac hien loi khi bam luu.
  - Thong bao: `Vui long chon ly do cho trang thai nay`.
- Neu reason vua bi tat boi admin trong luc user dang thao tac:
  - Backend tra loi validation.
  - UI reload danh sach trang thai va yeu cau chon lai.

## 8. Hien thi trong chi tiet ho so

Trong drawer/detail ho so:

- Hien thi `Trang thai hien tai`.
- Hien thi `Ly do` neu co:
  - Uu tien `statusReasonNameSnapshot`.
  - Kem ma ly do nho neu can: `missing_phone`.

Vi tri de xuat:

- Gan section trang thai hien tai.
- Hoac ngay duoi badge trang thai.

Vi du:

```text
Trang thai: Thieu thong tin
Ly do: Thieu SDT
```

Neu ly do da bi tat hoac doi ten:

- Van hien snapshot cu.
- Khong can canh bao trong chi tiet, vi day la du lieu da ghi nhan.

## 9. Hien thi trong lich su trang thai

Trong lich su chuyen trang thai:

- Hien thi:
  - Tu trang thai.
  - Sang trang thai.
  - Ly do neu co.
  - Ghi chu neu co.
  - Ket qua neu co.
  - Nguoi cap nhat.
  - Thoi gian cap nhat.

Vi du:

```text
Dang xu ly -> Huy
Ly do: Khach huy
Ghi chu: Khach doi lich san xuat
Cap nhat boi: Nguyen Van A
Luc: 19/06/2026 10:42
```

## 10. Hien thi trong danh sach ho so

Phase dau:

- Khong bat buoc them cot ly do.
- Cot `Trang thai` co the chi hien badge trang thai.
- Neu can gon ma van ro, co the hien tooltip khi hover badge:
  - Trang thai.
  - Ly do hien tai.
  - Thoi gian hoan thanh neu co.

Phase sau:

- Them cot tuy chon `Ly do trang thai` vao cau hinh cot.

## 11. Bao cao sau nay

Ly do phuc vu bao cao theo:

- `reasonCodeSnapshot`.
- `reasonNameSnapshot`.
- `statusDefinitionId`.
- `status code`.
- Phong ban.
- Nhan vien phu trach.
- Thoi gian chuyen trang thai.

Khuyen nghi dung snapshot cho bao cao lich su.

Vi du chi so:

- So don huy theo ly do.
- So don thieu thong tin theo ly do.
- Ty le hoan thanh theo ly do ket qua.
- Top ly do gay ton dong.

## 12. Quyen han

Phase dau:

- `owner/admin` duoc cau hinh ly do.
- User co quyen chuyen trang thai duoc chon ly do khi chuyen trang thai.

Mo rong sau:

- Truong phong/pho phong duoc cau hinh ly do cho trang thai thuoc phong ban minh quan ly.
- Permission rieng:
  - `archive.status.configure`
  - `archive.status_reason.import`
  - `archive.status_reason.edit`

## 13. Thu tu trien khai

### Phase 1 - Data va backend

1. Them Prisma model `ArchiveStatusReason`.
2. Them truong `requireReason` vao `ArchiveStatusDefinition`.
3. Them truong ly do vao `ArchiveStory`.
4. Them truong ly do vao `ArchiveStatusHistory`.
5. Tao migration.
6. Cap nhat status API tra ve reasons.
7. Them CRUD reason.
8. Them import Excel reason.
9. Cap nhat API chuyen trang thai de validate va luu reason.

### Phase 2 - Frontend cau hinh

1. Them section ly do trong popup `Trang thai ho so`.
2. Them toggle `Bat buoc chon ly do`.
3. Them CRUD ly do trong UI.
4. Them import Excel va tai file mau.
5. Them canh bao khi bat buoc ly do nhung chua co ly do active.

### Phase 3 - Frontend van hanh

1. Them searchable dropdown `Ly do` khi chuyen trang thai.
2. Tim kiem gan dung theo ma, ten, khong dau.
3. Validate required reason tren UI.
4. Hien thi ly do hien tai trong chi tiet ho so.
5. Hien thi ly do trong lich su trang thai.

### Phase 4 - Kiem thu

1. Trang thai khong bat buoc ly do, khong co reason: chuyen binh thuong.
2. Trang thai co reason nhung khong required: co the bo qua.
3. Trang thai required reason: khong chon thi bi chan.
4. Reason khong thuoc trang thai dich: backend chan.
5. Reason inactive: backend chan.
6. Import Excel tao moi va cap nhat dung.
7. Snapshot ly do khong doi khi sua ten ly do sau do.
8. Chi tiet ho so hien dung ly do hien tai.
9. Lich su hien dung ly do cua tung lan chuyen.

## 14. Ruil ro va luu y

- Khong nen chi luu `reasonId` vi ten ly do co the bi sua, bao cao cu se sai ngu canh.
- Khong nen cho user tao ly do tu dropdown van hanh trong phase dau, vi danh muc bao cao de bi loan.
- Import Excel can validate ky de tranh trung ma hoac ma khong dung format.
- Neu mot trang thai bat buoc ly do nhung khong co ly do active, UI can canh bao de admin sua cau hinh.
- Can quy uoc ro khi reopen ho so thi ly do hien tai duoc clear hay duoc thay bang ly do cua trang thai moi.

## 15. Ket qua mong doi

Sau khi hoan thanh:

- Admin cau hinh duoc ly do rieng cho tung trang thai.
- Co the import ly do bang Excel gom 2 cot `code` va `name`.
- Khi chuyen trang thai, user chon ly do bang dropdown co tim kiem gan dung.
- Trang thai bat buoc ly do se khong cho luu neu thieu ly do.
- Chi tiet ho so hien ly do dang duoc ghi nhan.
- Lich su trang thai luu va hien ly do theo snapshot.
- Du lieu san sang cho bao cao theo ma ly do.
