# 14. Bao cao nhanh ton dong nhan su trong man hinh Ho So

## 1. Muc tieu

Thiet ke mot bang bao cao nhanh nam o phan con trong cua sidebar trai, goc duoi man hinh `Ho so`, de quan ly nhin ngay duoc khoi luong cong viec ton dong cua tung user.

Muc tieu nghiep vu:

- Biet ai dang qua tai, ai dang it viec de dieu phoi ho so phu hop.
- Biet ton dong nao dang nguy cap: gap, qua han, can xac nhan, thieu thong tin.
- Cho truong phong/quan ly co diem nhin nhanh ma khong can vao man hinh bao cao rieng.
- Click vao user trong bang de loc nhanh danh sach ho so theo user do.

Phan nay la dashboard van hanh nhanh, khong thay the man `Bao cao` day du.

## 2. Vi tri hien thi

Dat trong sidebar trai cua man hinh `Ho so`, tai vung con trong goc duoi, phia tren cum nut tien ich cuoi sidebar neu co.

De xuat cau truc sidebar:

```text
Bo loc
  - View mode
  - Tim kiem
  - Khach hang / nhom / SDT
  - Pham vi / Nguoi phu trach
  - Phong ban
  - Loai ho so
  - Muc do uu tien
  - Can xac nhan

[Bao cao nhanh ton dong]

Tien ich cuoi sidebar
  - Tin nhan bi thu hoi
  - Lam moi
```

Quy tac layout:

- Sidebar van scroll duoc neu chieu cao man hinh thap.
- Bang bao cao nhanh nen sticky gan day sidebar khi con du cho, nhung khong che nut `Lam moi`.
- Co che do thu gon/mo rong de tranh lam chat sidebar.
- Mac dinh mo voi user co quyen quan ly, mac dinh thu gon voi nhan vien thuong neu van cho xem.

## 3. Doi tuong su dung va phan quyen

### 3.1. Owner/Admin

Duoc xem tat ca nhan su trong to chuc hoac theo phong ban dang loc.

### 3.2. Truong phong/Quan ly phong ban

Duoc xem nhan su thuoc phong ban minh quan ly.

Neu dang loc mot phong ban ngoai pham vi quan ly thi:

- Khong hien bang neu khong co quyen.
- Hoac chi hien dong cua chinh user neu duoc phep xem ho so cua minh.

### 3.3. Nhan vien

Mac dinh chi xem ton dong cua chinh minh.

Co the an hoan toan neu sau nay muon giao dien gon hon cho nhan vien.

## 4. Dinh nghia ton dong

Mot ho so duoc tinh la `ton dong` khi:

- Chua o trang thai ket thuc.
- Khong bi huy.
- Chua hoan thanh.

Trang thai tinh la ton dong:

- `Dang xu ly`
- `Thieu thong tin`
- `Ban giao` neu van can nguoi tiep nhan xu ly tiep
- Cac trang thai moi sau nay co `isClosed = false`

Trang thai khong tinh ton dong:

- `Hoan thanh`
- `Da gui BBXN`
- `Huy`
- Cac trang thai moi sau nay co `isClosed = true`

Ghi chu: nen dua rule nay ve status config thay vi hard-code label tieng Viet.

## 5. Chi so can hien thi

### 5.1. Chi so tong quan tren header

Header cua widget:

```text
Ton dong nhan su
Tong: 38
```

Co the hien them:

- So user dang co ton dong.
- So ho so qua han.
- Nut thu gon/mo rong.
- Nut refresh nho neu can.

### 5.2. Moi dong user

Moi dong nen gom:

| Truong | Y nghia |
|---|---|
| User | Avatar/ten ngan cua nhan su |
| Ton | Tong ho so dang ton dong |
| Gap | So ho so co muc uu tien cao/gap |
| Qua han | So ho so qua SLA hoac qua thoi gian nhac viec |
| Thieu | So ho so thieu thong tin |
| Can XN | So ho so can xac nhan |
| Gia | Tuoi ton dong lon nhat |

Phien ban UI compact de sidebar khong bi qua tai:

```text
Ton dong nhan su              Tong 38

Nguyen Van Linh       12   G:2  QH:3
Nguyen Xuan Cuong      8   G:1  QH:0
Duong Hoi An           5   G:0  QH:1
Chua gan               3   G:1  QH:2
```

Neu can hien thi them chi tiet, dung tooltip hoac popover khi hover/click.

## 6. Mau sac va muc canh bao

Khong nen dung qua nhieu mau. Widget can doc nhanh, gon, khong bien sidebar thanh man bao cao lon.

De xuat:

- Xanh: tai binh thuong.
- Vang: can theo doi.
- Do: qua tai hoac co qua han/gap cao.
- Xam: chua co viec hoac du lieu thap.

Nguong canh bao mac dinh:

| Muc | Dieu kien de xuat |
|---|---|
| Binh thuong | Ton dong <= 5 va qua han = 0 |
| Can theo doi | Ton dong 6-10 hoac co 1 qua han |
| Qua tai | Ton dong > 10 hoac qua han >= 2 hoac gap >= 3 |

Nguong nen dua vao setting sau nay:

- `workloadNormalMax`
- `workloadWarningMax`
- `overdueWarningMin`
- `urgentWarningMin`

## 7. Cong thuc diem tai cong viec

De so sanh nhanh giua user, co the tinh `workloadScore`.

Cong thuc de xuat giai doan 1:

```text
workloadScore =
  openCount * 1
  + urgentCount * 3
  + overdueCount * 2
  + missingInfoCount * 1.5
  + needsConfirmationCount * 1
```

Dung diem nay de:

- Sap xep user mac dinh tu nang nhat den nhe nhat.
- Hien thanh progress nho trong moi dong.
- Gan mau canh bao.

Khong can hien diem so ra UI neu lam roi mat nguoi dung.

## 8. Tuong tac UI

### 8.1. Click vao user

Click mot dong user se:

- Ap dung filter `Nguoi phu trach = user do`.
- Cap nhat bang ho so ben phai theo user.
- Giu cac filter hien co khac neu khong xung dot.

Click lai user dang chon:

- Bo filter user.

### 8.2. Click vao chi so nho

Neu click vao chip `QH:3`:

- Loc them danh sach ho so qua han cua user do.

Neu click vao chip `G:2`:

- Loc them ho so uu tien cao/gap cua user do.

Giai doan 1 co the chi can click dong user, chua can click tung chi so.

### 8.3. Hover/tooltip

Tooltip hien:

```text
Nguyen Van Linh
Ton dong: 12
Gap/Uu tien: 2
Qua han: 3
Thieu thong tin: 1
Can xac nhan: 4
Cu nhat: 2 ngay 4 gio
```

### 8.4. Thu gon

Khi thu gon:

```text
Ton dong nhan su  38
```

Va hien 3 avatar/user co tai cao nhat.

## 9. Pham vi du lieu

Widget phai bam theo ngu canh man hinh hien tai.

Mac dinh:

- Neu dang loc phong ban: chi tinh phong ban do.
- Neu dang xem `Tat ca phong ban`: tinh theo quyen cua user dang dang nhap.
- Neu dang loc loai ho so/uu tien/can xac nhan: co 2 cach.

De xuat giai doan 1:

- Widget chi bam theo `Phong ban` va quyen truy cap.
- Khong bam theo moi filter bang nhu `Uu tien`, `Can xac nhan`, `Loai ho so`, de bao cao tai tong quan khong bi nhay lien tuc.

De xuat giai doan 2:

- Them toggle `Theo bo loc hien tai`.
- Khi bat toggle, widget tinh theo tat ca filter dang ap dung tren bang.

## 10. Data contract de xuat

### 10.1. API summary

```http
GET /api/v1/archive/workload-summary
```

Query:

```ts
interface ArchiveWorkloadSummaryQuery {
  departmentId?: string;
  scope?: 'my-managed-departments' | 'current-department' | 'all-accessible';
  includeUnassigned?: boolean;
  followCurrentFilters?: boolean;
  recordType?: string;
  priority?: string;
  requiresConfirmation?: boolean;
}
```

Response:

```ts
interface ArchiveWorkloadSummaryResponse {
  scope: {
    departmentId: string | null;
    departmentName: string | null;
    generatedAt: string;
  };
  totals: {
    openCount: number;
    urgentCount: number;
    overdueCount: number;
    missingInfoCount: number;
    needsConfirmationCount: number;
    unassignedCount: number;
  };
  users: ArchiveUserWorkloadRow[];
}

interface ArchiveUserWorkloadRow {
  userId: string | null;
  userName: string;
  avatarUrl: string | null;
  departmentId: string | null;
  departmentName: string | null;
  openCount: number;
  urgentCount: number;
  overdueCount: number;
  missingInfoCount: number;
  needsConfirmationCount: number;
  oldestOpenAt: string | null;
  oldestOpenAgeMinutes: number | null;
  workloadScore: number;
  warningLevel: 'normal' | 'warning' | 'danger';
}
```

Dong `userId = null` dai dien cho `Chua gan`.

### 10.2. Cach tinh tu ArchiveStory

Can co cac field du lieu:

- `assignedUserId`
- `departmentId`
- `status`
- `priority`
- `requiresConfirmation`
- `createdAt` hoac `receivedAt`
- `updatedAt`
- `lastMessageAt`

Neu chua co SLA chinh thuc, giai doan 1 tinh `qua han` theo rule tam:

```text
Qua han = ho so dang ton dong va receivedAt qua 24h
```

Sau nay thay bang SLA theo loai ho so/priority/phong ban.

## 11. Cache va tan suat cap nhat

Khong can realtime qua phuc tap o giai doan 1.

De xuat:

- Goi summary khi vao man `Ho so`.
- Goi lai khi doi `Phong ban`.
- Goi lai sau khi doi trang thai, doi nguoi phu trach, tao ho so moi.
- Co nut refresh nho trong widget.
- Neu co socket event archive update thi debounce 5-10 giay roi refresh.

Backend co the cache ngan theo org/user/scope trong 15-30 giay neu can.

## 12. UI de xuat chi tiet

### 12.1. Dang mo

```text
┌──────────────────────────────┐
│ Ton dong nhan su        38  ˄ │
├──────────────────────────────┤
│ Linh                 12  Do  │
│ Gap 2  QH 3  CXN 4        ▉ │
│ Cuong                 8 Vang │
│ Gap 1  QH 0  CXN 2        ▆ │
│ Hoi An                5 Xanh │
│ Gap 0  QH 1  CXN 1        ▃ │
│ Chua gan              3  Do  │
│ Gap 1  QH 2              ▂ │
└──────────────────────────────┘
```

### 12.2. Dang thu gon

```text
┌──────────────────────────────┐
│ Ton dong nhan su        38  ˅ │
│ Linh 12  Cuong 8  Hoi An 5   │
└──────────────────────────────┘
```

### 12.3. Nguyen tac thiet ke

- Khong dung card lon trong sidebar.
- Border nhe, nen trang/xam rat nhe de tach khoi filter.
- Font nho hon bang chinh nhung van doc duoc.
- So luong dong mac dinh 4-6 user dau tien.
- Neu nhieu user, co nut `Xem them` mo popup/side drawer nho.
- Khong chen qua nhieu text giai thich trong UI.

## 13. Backend logic de xuat

Pseudo query:

```sql
SELECT
  assignedUserId,
  COUNT(*) AS openCount,
  SUM(CASE WHEN priority IN ('high', 'urgent') THEN 1 ELSE 0 END) AS urgentCount,
  SUM(CASE WHEN receivedAt < now() - interval '24 hours' THEN 1 ELSE 0 END) AS overdueCount,
  SUM(CASE WHEN status = 'missing_info' THEN 1 ELSE 0 END) AS missingInfoCount,
  SUM(CASE WHEN requiresConfirmation = true THEN 1 ELSE 0 END) AS needsConfirmationCount,
  MIN(receivedAt) AS oldestOpenAt
FROM ArchiveStory
WHERE orgId = :orgId
  AND isClosed = false
  AND departmentId IN (:allowedDepartmentIds)
GROUP BY assignedUserId
```

Can map status hien tai sang `isClosed`/`statusCategory` de tranh phu thuoc label.

## 14. Cong viec can code

### 14.1. Backend

- Them endpoint `GET /api/v1/archive/workload-summary`.
- Them service tinh workload theo quyen user dang dang nhap.
- Xac dinh rule `isClosed` cho status archive.
- Tinh dong `Chua gan`.
- Tra ve `warningLevel` va `workloadScore`.

### 14.2. Frontend

- Them component `ArchiveWorkloadQuickReport.vue`.
- Dat component vao sidebar trai cua `ArchiveStoriesView.vue`.
- Fetch summary theo `departmentId`/scope hien tai.
- Click row user de set filter nguoi phu trach.
- Them trang thai loading/empty/error compact.
- Them thu gon/mo rong va luu state bang localStorage.

### 14.3. Test

- Test manager thay dung nhan su trong phong ban.
- Test admin thay tat ca phong ban.
- Test nhan vien chi thay chinh minh neu ap dung.
- Test click user loc dung bang ho so.
- Test ho so chuyen `Hoan thanh/Huy` bien mat khoi ton dong.
- Test ho so `Chua gan` duoc tinh rieng.
- Test F5 van giu trang thai thu gon/mo rong.

## 15. Trang thai

Da code giai doan 1.

Da thuc hien:

- Them endpoint `GET /api/v1/archive/workload-summary`.
- Tai su dung pham vi quyen hien co cua man Ho so qua `archiveScopeWhere`.
- Tinh ton dong theo `statusDefinition.behaviorGroup in ('active', 'waiting')`, fallback legacy la khong phai `completed/cancelled`.
- Tinh cac chi so: ton dong, gap, qua han, thieu thong tin, can xac nhan, tuoi ton dong cu nhat, `workloadScore`, `warningLevel`.
- Ho tro dong `Chua phan cong`.
- Them component `ArchiveWorkloadQuickReport.vue`.
- Gan widget vao sidebar trai cua `ArchiveStoriesView.vue`.
- Click user de loc nhanh danh sach ho so theo nguoi phu trach.
- Click dong dang chon de quay ve tat ca ho so trong pham vi.
- Luu trang thai thu gon/mo rong bang `localStorage`.
- Giam fetch trung lap trong widget khi vua mount vua refresh theo man cha.
- Tong hop loi ngoai pham vi vao `plans/google-message-archive/14-out-of-scope-issues.md`.
- Them toggle `Theo bo loc` cho widget workload va cho phep bam theo `Phong ban`, `Loai ho so`, `Muc do uu tien`, `Can xac nhan` khi bat che do nay.

Da xac minh:

- `frontend npm run build` pass.
- `backend npm run build` pass khi dung Node `v20.19.0` va da generate Prisma Client.

Gia dinh da dung:

- Qua han tam tinh theo `receivedAt || createdAt` qua 24h.
- Giai doan 1 widget bam theo `Phong ban` va quyen truy cap, chua bam theo tat ca filter con lai.
- Nhan vien thuong van co the thay widget nhung mac dinh thu gon.

Da thong nhat ve mat thiet ke nghiep vu:

- Vi tri: sidebar trai, goc duoi man `Ho so`.
- Doi tuong: quan ly/truong phong/admin la chinh.
- Don vi bao cao: tung user va dong `Chua gan`.
- Chi so chinh: ton dong, gap, qua han, thieu thong tin, can xac nhan, tuoi ton dong cu nhat.
- Tuong tac chinh: click user de loc nhanh bang ho so.

Can xac nhan them neu lam tiep:

- Nguong qua han tam dung 24h hay theo SLA khac.
- Nhan vien thuong co duoc xem widget hay an hoan toan.
- Click tung chip `G`, `QH`, `Thiếu`, `Cũ` de loc sau hon.
- Cache/realtime debounce cho workload summary neu muon giam tan so goi API.
- Bo sung test tu dong cho cac case manager/admin/nhan vien va tinh trang F5.
