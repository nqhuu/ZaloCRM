# 13. Archive story fields, cau hinh cot va dialog luu tin nhan

## 1. Muc tieu

Nang cap module `Ho so trao doi` de quan ly ho so gan voi van hanh don hang thuc te hon:

- Tach ro `ma don hang`, `tieu de`, `khach hang`, `uu tien`, `ghi chu khac`.
- `Can xac nhan` khong phai metadata sua theo tung ho so, ma la cau hinh gan voi Zalo user/Zalo group trong giai doan nay.
- Cho phep cau hinh cot bang va luu cau hinh vao DB chinh thuc.
- Cho phep admin cau hinh danh sach trang thai uu tien de sau nay bo sung them muc uu tien moi.
- Dialog `Luu tin nhan vao ho so` chi dung de tao/append ho so, khong dung de cau hinh `Can xac nhan`.

## 2. Quy tac da thong nhat

### 2.1. Can xac nhan

`Can xac nhan` chi co 2 gia tri nghiep vu:

- `true`: Co
- `false`: Khong

Khong con trang thai lua chon `Chua xac dinh` trong UI setup. Neu du lieu cu hoac du lieu chua setup dang la `null`, UI co the hien thi tam thoi `Chua cai dat` de nhac admin can thiet lap, nhung khi setup chi duoc chon `Co` hoac `Khong`.

Quy tac:

- Khong hien thi thanh field chon trong popup `Luu tin nhan vao ho so`.
- Khong cho sua trong bang `Ho so trao doi` hoac popup chi tiet ho so.
- Giai doan nay setup truc tiep vao Zalo user/Zalo group.
- Ho so tao tu Zalo user/group nao thi doc gia tri `Can xac nhan` tu cau hinh cua user/group do.
- Giai doan sau, khi co data khach hang, gia tri nay se gan vao khach hang va ap xuong cac Zalo user/group thuoc khach hang do.

Vi tri setup can bo sung:

- Man hinh/khung thong tin `Ban be`, `Nhom Zalo` hoac `Khach hang` dang dai dien cho Zalo user/group.
- Chi user co quyen quan tri phu hop moi duoc sua.

### 2.2. Uu tien

`Uu tien` la metadata cua ho so don hang.

Quy tac:

- Duoc chon trong popup `Luu tin nhan vao ho so`.
- Trong popup nay phai la dropdown/select, khong phai button group.
- Duoc sua trong bang `Ho so trao doi` neu user co quyen sua ho so.
- Danh sach muc uu tien khong nen hard-code co dinh ve lau dai.
- Can co vi tri setup danh sach muc uu tien de admin co the bo sung/sua label/mau/thu tu sau nay.

Gia tri mac dinh hien tai:

- `low`: Thap
- `normal`: Binh thuong
- `high`: Uu tien
- `urgent`: Gap

Huong mo rong:

- Tao cau hinh priority theo organization.
- Admin/Owner moi duoc sua danh sach priority.
- Moi option nen co: `key`, `label`, `color`, `sortOrder`, `isDefault`, `isActive`.

### 2.3. Ghi chu khac

`Ghi chu khac` la metadata cua ho so.

Quy tac:

- Co field trong popup `Luu tin nhan vao ho so` khi tao ho so moi.
- Co cot rieng trong bang `Ho so trao doi`.
- Cho phep sua inline neu user co quyen sua ho so.
- Khong thay the timeline ghi chu khach hang.

## 3. Data contract de xuat

### 3.1. ArchiveStory

```ts
type ArchiveStoryPriority = string;

interface ArchiveStory {
  title: string | null;
  orderCode: string | null;
  priority: ArchiveStoryPriority;
  requiresConfirmation: boolean | null;
  extraNote: string | null;
  customerId: string | null;
  customerNameSnapshot: string | null;
}
```

Ghi chu:

- `requiresConfirmation` tren ho so chi la gia tri ke thua/snapshot de hien thi va loc.
- Khong sua `requiresConfirmation` truc tiep tu ho so.
- Neu cau hinh Zalo user/group thay doi, can quyet dinh ro co dong bo lai cac ho so cu hay chi ap dung cho ho so moi. Huong hien tai uu tien dong bo hien thi theo conversation de tranh lech trang thai.

### 3.2. Conversation/Zalo user/group

Them cau hinh `Can xac nhan` vao entity dai dien cho Zalo user/group:

```ts
interface ConversationConfirmationSetting {
  conversationId: string;
  requiresConfirmationDefault: boolean | null;
  updatedByUserId: string | null;
  updatedAt: string | null;
}
```

Quy tac:

- Gia tri setup hop le trong UI: `true` hoac `false`.
- `null` chi la trang thai chua migrate/chua setup.
- API update phai validate quyen quan tri.

### 3.3. Priority config

De co the bo sung trang thai uu tien moi:

```ts
interface ArchivePriorityOption {
  key: string;
  label: string;
  color?: string | null;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
}
```

Co the luu bang DB rieng hoac trong bang setting/user preference tuy theo pattern hien co. Neu dung setting JSON can co validate schema ro rang.

## 4. Dialog `Luu tin nhan vao ho so`

### 4.1. Khi tao ho so moi

Field nen co:

- Ten ho so mac dinh: lay tu Zalo user/group.
- Tieu de: input.
- Ma don hang: input.
- Loai ho so: select.
- Muc do uu tien: dropdown/select.
- Phong ban tiep nhan: select.
- Nguoi phu trach: select.
- Ghi chu khac: textarea.

Khong co field chon:

- `Can xac nhan`

Neu can thong tin cho user, chi hien thi readonly:

```text
Can xac nhan: Co/Khong/Chua cai dat
```

Readonly nay khong co dropdown, khong co nut sua nhanh trong dialog luu ho so.

### 4.2. Khi them vao ho so hien co

Field nen co:

- Danh sach ho so phu hop.
- Thong tin tom tat: tieu de, ma don hang, trang thai, nguoi phu trach.

Khong yeu cau nhap lai:

- Priority.
- Ghi chu khac.
- Can xac nhan.

Neu can sua metadata ho so hien co, user vao bang/chi tiet ho so de sua theo quyen.

## 5. Bang `Ho so trao doi`

Cot mac dinh de xuat:

1. Khach hang
2. Don hang
3. Tieu de
4. Ngay/Gio nhan
5. Uu tien
6. Can xac nhan
7. Ghi chu khac
8. Tin nhan cuoi
9. Nhan vien
10. Phong ban
11. Trang thai
12. Thao tac

Quy tac cot:

- `Uu tien`: hien thi badge/dropdown sua nhanh neu co quyen.
- `Can xac nhan`: chi hien thi `Co`, `Khong`, hoac `Chua cai dat`; khong sua tai bang.
- `Ghi chu khac`: cot rieng, cho sua inline neu co quyen.
- `Don hang`, `Tieu de`: cho sua inline neu co quyen.

## 6. Cau hinh cot

Can luu cau hinh cot vao DB chinh thuc, khong chi localStorage.

Endpoint de xuat:

```http
GET /api/v1/archive/table-column-prefs
PUT /api/v1/archive/table-column-prefs
```

Data:

```ts
interface ArchiveTableColumnPreference {
  key: string;
  visible: boolean;
  order: number;
  width?: number;
  pinned?: 'left' | 'right' | null;
}
```

Mac dinh luu theo user. Sau nay co the mo rong template theo phong ban/to chuc cho admin.

## 7. API de xuat

### 7.1. Tao ho so

```http
POST /api/v1/archive/stories
```

Body:

```ts
{
  conversationId: string;
  messageIds: string[];
  title?: string | null;
  orderCode?: string | null;
  recordType: string;
  departmentId?: string | null;
  assignedUserId?: string | null;
  priority?: string;
  extraNote?: string | null;
}
```

Khong nhan `requiresConfirmation` tu dialog.

Backend lay `requiresConfirmation` tu cau hinh Zalo user/group.

### 7.2. Cap nhat metadata ho so

```http
PATCH /api/v1/archive/stories/:id
```

Body cho phep:

```ts
{
  title?: string | null;
  orderCode?: string | null;
  priority?: string;
  extraNote?: string | null;
}
```

Khong cho update `requiresConfirmation` qua endpoint metadata ho so.

### 7.3. Setup `Can xac nhan` cho Zalo user/group

```http
PATCH /api/v1/archive/conversations/:conversationId/confirmation-default
```

Body:

```ts
{
  requiresConfirmation: boolean;
}
```

Quyen:

- Owner/Admin.
- Hoac role quan tri duoc thiet ke cho khu vuc Ban be/Nhom Zalo/Khach hang.
- Khong phai user thuong dang xu ly ho so.

### 7.4. Setup danh sach priority

Endpoint de xuat:

```http
GET /api/v1/archive/priority-options
PUT /api/v1/archive/priority-options
```

Body PUT:

```ts
{
  options: ArchivePriorityOption[];
}
```

Quyen:

- Owner/Admin.
- Co audit log neu he thong da co co che audit.

## 8. Trang thai thuc hien

### 8.1. Da hoan thanh

- Da co schema/migration bo sung metadata ho so co ban: `orderCode`, `priority`, `requiresConfirmation`, `extraNote`.
- Da co luong tao ho so co truyen `priority`, `orderCode`, `extraNote`.
- Da bo sung co che luu cau hinh cot vao DB qua user preference.
- Da bo sung cot `Ghi chu khac` tren bang `Ho so trao doi`.
- Da co backend doc `requiresConfirmation` tu cau hinh conversation khi tao ho so.
- Popup `Luu tin nhan vao ho so` da dua `Uu tien` ve dropdown/select.
- Popup `Luu tin nhan vao ho so` khong con field thao tac/chon `Can xac nhan`; chi hien thi readonly trang thai cau hinh hien tai.
- Bang `Ho so trao doi` da chuyen cot `Can xac nhan` thanh readonly, khong con thao tac doi nhanh tu tung ho so.
- Da bo UI setup `Can xac nhan` khoi popup luu ho so va dua sang panel thong tin conversation hien tai trong chat.
- Setup `Can xac nhan` chi cho chon `Co` hoac `Khong`; `null` chi con la trang thai chua cai dat/migration.
- Endpoint update `Can xac nhan` chi nhan `true/false`, khong nhan `null`.
- Endpoint metadata ho so khong con nhan/update `requiresConfirmation`.
- Da co API cau hinh priority options theo org: `GET/PUT /api/v1/archive/priority-options`.
- Dialog luu ho so va bang ho so da doc priority options tu backend, fallback ve default neu chua cau hinh.
- Da co UI quan tri priority options cho Owner/Admin ngay trong man hinh `Ho so trao doi`.
- UI quan tri priority options da cho them/sua label, sua ma cho muc moi, chon mau, sap xep thu tu, bat/tat active va chon 1 muc default.
- Da khoa xoa/sua ma cac muc priority mac dinh `low`, `normal`, `high`, `urgent` de tranh lech du lieu ho so cu.
- Da co audit log qua `ActivityLog` khi admin luu cau hinh priority options, gom before/after.
- Da build frontend thanh cong.
- Da rebuild Docker thanh cong, backend/frontend build pass trong container va app tra HTTP 200 tren `http://localhost:3080`.

### 8.2. Da lam nhung can sua lai theo thong nhat moi

- Tam thoi khong con muc nao trong pham vi vua chot can sua lai.

### 8.3. Chua hoan thanh

- Chua test click UI thuc te voi user da dang nhap trong browser noi bo; browser hien dang dung o man login nen chua click duoc cac luong can quyen.

## 9. Thu tu xu ly tiep theo

1. Test click UI thuc te tren browser voi tai khoan co quyen:
   - Dropdown `Binh thuong` trong dialog mo va chon duoc.
   - Dialog khong co field chon `Can xac nhan`.
   - Bang ho so khong sua duoc `Can xac nhan`.
   - Setup user/group `Can xac nhan` chi chon `Co` hoac `Khong`.
   - Cot `Ghi chu khac` hien thi va sua duoc theo quyen.
   - Dialog cau hinh priority options them/sua/sap xep/luu duoc.
2. Neu can hien thi audit priority options o UI rieng, bo sung bo loc/label trong man activity log chung.

## 10. Ket luan chot

`Can xac nhan` la cau hinh cua Zalo user/group trong giai doan nay, khong phai field thao tac trong popup luu ho so va khong phai field sua trong tung ho so don hang. `Uu tien` la metadata cua ho so, duoc chon khi tao ho so va sua trong ho so, nhung danh sach muc uu tien can duoc thiet ke theo huong admin cau hinh mo rong.

File nay la can cu de sua lai code hien tai cho dung luong nghiep vu da thong nhat.
