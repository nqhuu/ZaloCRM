# Phase 9 - Ho so trao doi va Google Message Archive

> Phase 9 chuyen cac tin nhan Zalo duoc chon thanh ho so cong viec co the theo doi
> trong ZaloCRM. Giai doan hien tai toi uu cho Phong Don hang, chi quan ly ho so
> va noi dung trao doi; khong thay the phan mem xu ly don hang chi tiet.

## 1. Nguyen tac

1. PostgreSQL la source of truth.
2. Google Drive va Google Sheets chi la lop backup/doi soat.
3. Mot conversation Zalo co the co nhieu ho so.
4. Khi luu, user chon tao ho so moi hoac bo sung vao ho so hien co.
5. Trong cung mot ho so, mot message khong duoc luu trung.
6. Neu message da thuoc ho so khac, he thong phai canh bao va chi luu khi user xac nhan.
7. Pham vi xem du lieu theo phong ban; hanh dong theo PermissionGroup.
8. Google loi khong duoc lam that bai thao tac luu vao CRM.

## 2. Mental model

```text
Conversation Zalo
  |-- Message
  |-- Message
  `-- Message
       |
       | user chon message
       v
Save dialog
  |-- Them vao ho so hien co
  `-- Tao ho so moi
       |
       v
ArchiveStory (ho so cong viec)
  |-- ArchiveMessage
  |    `-- ArchiveMedia
  |-- ArchiveRecallEvent
  |-- ArchiveStatusHistory
  `-- ArchiveNotification
```

Mot message mac dinh nen chi thuoc mot ho so. Truong hop can dung lai message cho
ho so khac van duoc phep, nhung phai co xac nhan ro rang.

## 3. Pham vi Phong Don hang

Phase nay chi quan ly:

- ho so trao doi lien quan den don hang;
- cac message va media lam can cu;
- phong ban tiep nhan va nguoi phu trach;
- trang thai xu ly, ket qua va lich su thay doi;
- backup Google va canh bao thu hoi.

Khong lam:

- san pham, so luong, don gia;
- van chuyen, thanh toan;
- quy trinh len don chi tiet;
- thay the phan mem don hang hien co.

Kien truc van dung cac truong chung de sau nay mo rong cho Phong Kinh doanh,
CSKH va cac phong ban khac.

## 4. Hop thoai luu message

Khi user chon message va bam `Luu noi dung`, mo dialog gom:

### Cach luu

- `Them vao ho so hien co`
- `Tao ho so moi`

Danh sach ho so hien co chi hien thi cac ho so cua conversation hien tai ma user
co quyen cap nhat. Uu tien ho so `pending`.

### Gia tri mac dinh khi tao moi

| Truong | Mac dinh |
|---|---|
| Loai ho so | Cau hinh cua phong ban; Phase nay mac dinh `order` |
| Phong ban | Phong ban hien tai cua user |
| Nguoi phu trach | User dang thao tac |
| Ten ho so | Ten nhom chat hoac ten khach hang |
| Noi dung bo sung cho ten | De trong |

Neu user nhap `Don may loc nuoc`, title duoc tao thanh:

```text
Quoc Huu - Don may loc nuoc
```

Neu khong nhap, title la `Quoc Huu`, khong de trong.

Chi admin/owner hoac quan ly co grant phu hop moi duoc gan nguoi phu trach khac.
Chuyen phong ban cung phai duoc kiem tra quyen.

Moi Department co `defaultArchiveRecordType`, cau hinh tai
`Cai dat -> So do to chuc -> Chi tiet phong ban -> Cau hinh Luu tru ho so`.
Gia tri ho tro: `order`, `quotation`, `customer_care`, `other`; neu chua cau
hinh thi fallback `order`.

## 5. Kiem tra message trung

Truoc khi ghi DB, frontend goi preflight:

```text
POST /api/v1/archive/stories/preflight
```

Backend tra ve:

- message da co trong ho so dich;
- message dang nam trong ho so khac;
- ten va ID cac ho so lien quan;
- message hop le co the luu.

Quy tac:

1. Message da co trong ho so dich luon bi bo qua.
2. Message chua thuoc ho so nao duoc luu binh thuong.
3. Message thuoc ho so khac can `allowCrossStoryDuplicates=true`.
4. Backend van kiem tra lai trong transaction, khong tin vao frontend.

Dialog canh bao co ba hanh dong:

- `Van luu`: xac nhan dung message o nhieu ho so.
- `Quay lai kiem tra`: dong dialog, giu cac message da chon, cuon den message
  trung dau tien va danh dau tat ca message trung.
- `Huy thao tac`: thoat selection mode.

Khi quay lai, cac message khong trung van giu lua chon.

## 6. Tao va bo sung ho so

### Tao ho so moi

Tao `ArchiveStory`, sau do snapshot cac message trong mot transaction.

### Bo sung ho so hien co

- khong tao story moi;
- chi them `ArchiveMessage` chua co;
- cap nhat `conversationContent`, `updatedAt` va trang thai backup;
- backup worker update View Sheet va append/update Raw Sheet;
- ho so `completed/cancelled` chi duoc bo sung khi user co quyen mo lai/chinh sua.

Mot conversation co the co nhieu ho so, vi mot chat co the phat sinh nhieu cong
viec hoac don hang khac nhau.

## 7. Trang thai va huy luu

`businessStatus`:

| Trang thai | Y nghia |
|---|---|
| `pending` | Chua hoan thanh, co the bo sung |
| `completed` | Da xu ly xong |
| `cancelled` | Da huy, du lieu van duoc giu |

Hanh dong:

- nhan vien: cap nhat ho so minh tao/duoc giao neu co grant;
- quan ly phong: quan ly ho so trong phong va phong con neu co grant;
- admin/owner: toan quyen trong organization;
- mo lai `completed/cancelled` can quyen `archive.approve`;
- huy luu la soft-cancel, khong xoa message/media;
- moi thay doi ghi `ArchiveStatusHistory`.

## 8. Phong ban va phan quyen

`ArchiveStory` luu snapshot `departmentId` va `assignedUserId`.

Pham vi:

- member: ho so minh tao hoac duoc giao;
- leader/deputy: ho so cua phong minh va cac phong con;
- owner/admin: toan organization.

Them resource `archive` vao PermissionGroup:

| Grant | Y nghia |
|---|---|
| `access` | Xem module |
| `create` | Tao ho so, bo sung message |
| `edit` | Sua title, ket qua, nguoi phu trach |
| `delete` | Huy ho so |
| `approve` | Hoan thanh, mo lai |
| `view_all` | Xem toan bo trong pham vi phong ban quan ly |

`deptRole` quyet dinh pham vi; `PermissionGroup` quyet dinh hanh dong.

### Tao user va cau hinh ban dau

Man `Cai dat -> Nhan vien` phai co nut `Them nhan vien` cho owner/admin. Mot lan
tao gom:

- ho ten, email dang nhap, mat khau ban dau;
- vai tro he thong (`member`, owner moi duoc tao `admin`);
- phong ban va chuc vu trong phong;
- nhom quyen.

Tai khoan duoc tao truoc, sau do gan department va PermissionGroup. Neu buoc gan
quyen loi, UI phai thong bao tai khoan da tao nhung cau hinh nao chua hoan tat,
khong duoc bao sai rang tai khoan chua ton tai.

Owner/admin co the reset mat khau user ve `Abcd1234`. Admin khong duoc reset
owner; thao tac can confirm va ghi log nguoi thuc hien.

## 9. Snapshot va media

Message snapshot luu noi dung doc duoc, khong hien payload JSON ky thuat.

Media extractor phai doc URL tu:

- `Message.attachments`;
- content la URL truc tiep;
- content la JSON string co `href`, `url`, `src`, `thumbnail` hoac cac field media.

`ArchiveMedia` luu:

```text
sourceUrl, mediaType, fileName, mimeType, sizeBytes,
driveFileId, driveUrl, backupStatus, backupError
```

UI:

- image co thumbnail va lightbox;
- file/audio/video co icon va nut mo/tai;
- uu tien `driveUrl`, fallback `sourceUrl`;
- endpoint/API chi tra media khi user co quyen xem ho so.

Can co backfill de trich media tu cac snapshot JSON da luu truoc day.

## 10. UI trang Luu tru

### Pham vi mac dinh theo user dang nhap

- Moi lan mo trang, bo loc mac dinh la `Ho so cua toi`.
- `Ho so cua toi` gom ho so do user tao hoac dang duoc giao phu trach.
- Nhan vien khong co `archive.view_all` khong duoc bo loc sang user khac.
- Quan ly/admin van vao trang voi mac dinh `Ho so cua toi`, sau do moi co the chon
  `Phong ban cua toi`, mot nhan vien cu the hoac `Tat ca trong pham vi`.
- Tieu de trang lay theo phong ban dang chon, khong hard-code `Phong Don hang`.
  Admin/owner co the chon tat ca hoac mot phong ban. User khac chi thay phong ban
  trong scope duoc phep boi `archive.view_all` va vai tro phong ban.
- Backend luon ap dung scope RBAC; frontend filter khong duoc dung de thay the
  kiem tra quyen.

Card mac dinh chi hien:

- title ho so;
- ten conversation va so dien thoai;
- loai ho so, phong ban, nguoi phu trach;
- trang thai nghiep vu va backup;
- 2-3 dong preview;
- so message, so media;
- createdAt va updatedAt.

Khong render toan bo `conversationContent` tren card.

Nut `Xem chi tiet` mo drawer/dialog gom:

- timeline message;
- image/media;
- noi dung thu hoi;
- ket qua;
- lich su trang thai;
- thong tin backup;
- cac hanh dong theo quyen.

Bo loc:

- pham vi: cua toi, phong ban cua toi, tat ca trong pham vi;
- trang thai;
- phong ban;
- nguoi phu trach;
- loai ho so;
- khach hang/conversation;
- Zalo account;
- backup status;
- khoang ngay;
- tim title, ten, so dien thoai, noi dung.

Thanh tim kiem tach ro:

- ten ho so/ten don hang;
- ten khach, ten nhom chat hoac so dien thoai;
- noi dung trao doi;
- tai khoan nhan vien phu trach (autocomplete);
- phong ban (autocomplete, mac dinh phong cua user).

Card va Kanban dung hanh dong `Cap nhat ket qua`, mo cung dialog voi man chi tiet
de user chon trang thai va nhap noi dung ket qua. Khong dung nut `Hoan thanh`
truc tiep ben ngoai vi de gay hieu nham va bo qua buoc nhap ket qua.

Kanban keo tha la huong nang cap sau. Chi bat khi co confirm, RBAC, status history
va rollback khi API loi; Phase hien tai click card/`Cap nhat ket qua` de doi
trang thai, tranh cap nhat ngoai y muon.

### Kieu hien thi

Trang Luu tru co it nhat hai che do va ghi nho lua chon cua user:

1. `Danh sach`: bang gon, de sap xep va doi soat nhieu ho so.
2. `Kanban`: ba cot `Chua hoan thanh`, `Hoan thanh`, `Da huy`.

Bo loc va tong so phai dung chung cho ca hai che do. Phase nay Kanban chi dung
de quan sat va mo chi tiet; keo tha doi trang thai se lam sau khi bo sung audit
va kiem tra grant day du.

Khach hang/conversation duoc suy ra tu cac ho so trong pham vi. Khi du lieu lon,
tach endpoint filter options/pagination thay vi tai toan bo message len client.

## 11. Bao cao

Trang Luu tru chi hien thong ke nhanh. Bao cao day du dua sang
`Phan tich/Bao cao`.

Khoang thoi gian:

- ngay;
- tuan;
- thang;
- khoang ngay tuy chon.

Chi so Phase 9:

- so ho so tao moi;
- pending/completed/cancelled;
- ty le hoan thanh;
- thoi gian xu ly trung binh;
- ho so ton va qua han;
- so message/media da luu;
- backup failed;
- hieu suat theo user va phong ban.

Admin/owner xem toan bo; quan ly xem pham vi phong; member xem ca nhan.

## 12. Google backup

Hot path:

```text
auth + RBAC -> snapshot PostgreSQL -> tra ket qua
```

Cold path:

```text
upload media Drive -> update Raw_Messages -> update View_Messages -> notification
```

Retry idempotent:

- media co `driveFileId` khong upload lai;
- message co `googleRawRow` thi update;
- story co `googleViewRow` thi update;
- notification dung `dedupeKey`.

## 13. API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/archive/stories/preflight` | Kiem tra trung va quyen truoc khi luu |
| POST | `/api/v1/archive/stories` | Tao ho so moi |
| POST | `/api/v1/archive/stories/:id/messages` | Bo sung message vao ho so |
| GET | `/api/v1/archive/conversations/:conversationId/stories` | Ho so co the chon trong save dialog |
| GET | `/api/v1/archive/stories` | Danh sach theo scope |
| GET | `/api/v1/archive/stories/:id` | Chi tiet + audit |
| PATCH | `/api/v1/archive/stories/:id` | Sua title/type/assignment |
| PATCH | `/api/v1/archive/stories/:id/status` | pending/completed/cancelled |
| POST | `/api/v1/archive/stories/:id/retry-backup` | Retry Google |
| GET/PUT | `/api/v1/archive/destinations...` | Cau hinh Google |

## 14. Migration du lieu cu

Migration/backfill phai:

1. Gan `recordType=order` cho story cu.
2. Gan `departmentId` theo assigned user, fallback created user.
3. Giu cac story pending hien co rieng biet; khong tu dong gop chi vi cung conversation.
4. Loai duplicate trong cung story neu co.
5. Trich media tu `attachmentsSnapshot` va JSON `contentSnapshot`.
6. Khong xoa backup, history hoac snapshot cu.

## 15. Tieu chi nghiem thu

1. Mot conversation tao duoc nhieu ho so.
2. Co the them message vao ho so hien co.
3. Khong luu trung trong cung ho so.
4. Canh bao ro khi message thuoc ho so khac.
5. `Quay lai kiem tra` giu selection va highlight message trung.
6. Mac dinh department/assignee/title dung user hien tai.
7. Manager/admin gan nguoi khac dung pham vi.
8. Member khong xem/sua ngoai scope.
9. Anh JSON cu va moi tao duoc `ArchiveMedia` va xem duoc.
10. Card rut gon, detail mo theo nhu cau.
11. Google loi van luu DB thanh cong.
12. Bao cao tong hop dung scope theo ngay/tuan/thang.
