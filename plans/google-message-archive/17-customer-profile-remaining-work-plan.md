# 17. CustomerProfile Remaining Work Plan

## 1. Muc tieu

File nay tong hop cac noi dung con ton quanh `CustomerProfile` sau khi da co
nen tang:

- Dong bo khach hang tu Google Sheet.
- Bang `CustomerProfile` theo mo hinh B2B.
- Bang lien ket group/user/contact Zalo voi `CustomerProfile`.
- Man `Khach hang` co danh sach, popup chi tiet va cau hinh cot.
- Man `Nhom Zalo` co the gan group vao ho so khach hang.

Muc tieu tiep theo la bien `CustomerProfile` thanh trung tam nghiep vu:

```text
CustomerProfile
-> master data tu Google Sheet
-> nguoi lien he
-> kenh Zalo user/group
-> ho so luu / don hang / trao doi
-> phan cong va tag workload
-> bao cao va audit
```

## 2. Nguyen tac chot

### 2.1. Khach hang B2B la CustomerProfile

```text
CustomerProfile = ho so khach hang nghiep vu/account B2B
Contact         = nguoi lien he/Zalo identity
Zalo group/user = kenh lien lac hoac ngu canh trao doi
ArchiveStory    = ho so luu/ho so trao doi/don hang phat sinh
```

Khong tiep tuc dung mot nick Zalo hoac mot Contact lam dinh nghia duy nhat cua
khach hang.

### 2.2. Google Sheet la nguon master data song

Google Sheet van la nguon master data cua phong Kinh doanh. CRM sync len
`CustomerProfile`, sau do user quan ly lien ket Zalo/contact/workflow tu CRM.

Khong xoa `CustomerProfile` khi row bien mat khoi sheet. Chi danh dau
`missingFromSource=true` de review.

Can phan biet ro 3 loai du lieu:

- `sheet_managed`: ho so sinh ra tu Google Sheet va cac field master do Sheet
  quan ly.
- `crm_managed`: ho so/field duoc bo sung truc tiep tren CRM, khong bi coi la
  thieu chi vi khong co tren Sheet.
- `mixed`: ho so co phan master lay tu Sheet, nhung co cac phan van hanh rieng
  tren CRM nhu Zalo link, contact, so lien he, tag, assignment, ho so luu.

Khi Sheet co it dong hon CRM, sync chi duoc danh dau missing cho nhung
`CustomerProfile` dang thuoc dung `CustomerDataSource` do va con trong trang thai
Sheet quan ly. Du lieu tao thu cong tren CRM, hoac du lieu CRM bo sung vao ho so
da sync, khong duoc xoa/ghi de ngoai y muon.

### 2.3. Giao dien nen xuat phat tu CustomerProfile

Luong hien tai da co:

```text
Nhom Zalo -> gan CustomerProfile
```

Luong can bo sung:

```text
CustomerProfile -> gan group Zalo
CustomerProfile -> gan user/contact Zalo
CustomerProfile -> xem ho so luu
CustomerProfile -> quan ly nguoi lien he
```

### 2.4. Mot CustomerProfile co nhieu so lien he

Mot khach hang B2B co the co nhieu so dien thoai/kenh lien he khac nhau:

- So tong dai cong ty.
- So van phong giao dich.
- So nguoi mua hang.
- So ke toan.
- So ky thuat.
- So giao/nhan hang.
- So ca nhan cua chu doanh nghiep.
- So Zalo dang trao doi truc tiep.

Vi vay khong nen chi luu mot `phone` duy nhat tren `CustomerProfile` roi coi do
la tat ca lien he cua khach hang.

Can bo sung lop du lieu so lien he rieng:

```text
CustomerProfilePhone

id
orgId
customerProfileId
contactId nullable              // neu so nay thuoc mot Contact cu the
phone
normalizedPhone
label nullable                  // VD: Tong dai, Ke toan, Mua hang, Giao hang
type: main | office | mobile | zalo | accounting | technical | delivery | other
isDefault
isActive
source: google_sheet | manual | zalo_sync
rawText nullable
createdByUserId nullable
createdAt
updatedAt
```

Quy tac:

- Mot CustomerProfile co the co nhieu so lien he active.
- Moi CustomerProfile nen co toi da mot so `isDefault=true`.
- So mac dinh la so uu tien hien thi tren danh sach, bao cao, autocomplete va
  khi can tao lien he nhanh.
- Neu import tu Google Sheet co cot `MST/DT` hoac `Nguoi lien he` chua tach
  duoc thanh Contact, van co the luu so vao `CustomerProfilePhone` voi
  `source=google_sheet` va `rawText`.
- Neu so lien he thuoc mot nguoi lien he cu the thi gan them `contactId`.
- Tat ca so dien thoai can chuan hoa vao `normalizedPhone` de tim kiem va tranh
  trung.
- Khi so mac dinh bi tat/xoa lien ket, UI phai yeu cau chon so mac dinh moi neu
  khach hang van con so active.

UI can co trong CustomerProfile:

- Trong tab `Tong quan`: hien so mac dinh.
- Trong tab `Nguoi lien he` hoac section `So lien he`: hien toan bo so lien he.
- Cho them/sua/tat so lien he.
- Cho chon `Dat lam mac dinh`.
- Canh bao neu nhap so da ton tai trong cung CustomerProfile.

Tam thoi `CustomerProfile.mainPhone` co the giu vai tro snapshot/denormalized de
hien thi nhanh, nhung source of truth lau dai nen la bang
`CustomerProfilePhone`.

## 3. Hien trang da co

### 3.1. Database/schema

Da co cac model nen:

- `CustomerProfile`
- `CustomerType`
- `CustomerProfileContact`
- `CustomerProfileZaloGroup`
- `CustomerProfileZaloUser`
- `CustomerDataSource`
- `CustomerDataSourceColumnMap`
- `CustomerSyncRun`
- `CustomerSyncRowError`
- `NativeZaloGroup`
- `NativeZaloGroupAccount`
- `NativeZaloMessage`
- `NativeZaloGroupMember`
- `NativeZaloGroupCrmTag`
- `ZaloSubjectWorkAssignment`

### 3.2. Backend/API

Da co cac API chinh:

```http
GET    /api/v1/customer-profiles
POST   /api/v1/customer-profiles/sync-google-sheet
POST   /api/v1/customer-profiles/sync-google-sheet-adhoc

GET    /api/v1/customer-data-sources
POST   /api/v1/customer-data-sources
PATCH  /api/v1/customer-data-sources/:id
POST   /api/v1/customer-data-sources/:id/sync
GET    /api/v1/customer-data-sources/:id/sync-runs
GET    /api/v1/customer-sync-runs/:id/errors

GET    /api/v1/customer-types
POST   /api/v1/customer-types
PATCH  /api/v1/customer-types/:id

POST   /api/v1/customer-profiles/:id/contacts
PATCH  /api/v1/customer-profiles/:id/contacts/:contactId
DELETE /api/v1/customer-profiles/:id/contacts/:contactId

POST   /api/v1/customer-profiles/:id/zalo-groups
DELETE /api/v1/customer-profiles/:id/zalo-groups/:nativeGroupId
POST   /api/v1/customer-profiles/:id/zalo-users
DELETE /api/v1/customer-profiles/:id/zalo-users/:contactId
```

### 3.3. Frontend/UI

Da co:

- Trang `/customers`.
- Tab `Ho so`.
- Tab `Dong bo`.
- Tab `Loai hinh`.
- Upload/lua Service Account JSON.
- Cau hinh nguon Google Sheet.
- Nut `Dong bo ngay`.
- Bang ho so khach hang.
- Cau hinh cot hien thi bang.
- Popup chi tiet CustomerProfile.
- Hien raw data tu Google Sheet.
- Trong man `Nhom Zalo`, co autocomplete tim CustomerProfile va gan group vao ho so.

## 4. Noi dung con ton

## 4.1. CustomerProfile detail page

**Trang thai 2026-06-29: da trien khai nen trang chi tiet `/customers/:id`.**

- API `GET /api/v1/customer-profiles/:id` tra ve ho so kem owner, department,
  customer type, source Sheet, contact link, Zalo group/user link, va 20 ho so
  luu gan nhat.
- UI danh sach `Khach hang > Ho so` click vao dong se mo trang chi tiet thay vi
  chi mo popup.
- Trang chi tiet da co cac tab nen: `Tong quan`, `Zalo`, `Nguoi lien he`,
  `Ho so luu`, `Dong bo Sheet`.
- Cac thao tac sua field, gan Zalo tu profile, them contact va filter ho so luu
  se lam o cac muc tiep theo.

### Van de

Popup chi tiet hien tai moi dung de xem nhanh. Chua phu hop de thao tac day du
voi mot khach hang B2B co nhieu thong tin, nhieu contact va nhieu kenh Zalo.

### Can lam

Them route rieng:

```text
/customers/:id
hoac
/customer-profiles/:id
```

Man chi tiet gom cac tab:

1. `Tong quan`
2. `Nguoi lien he`
3. `Zalo`
4. `Ho so luu`
5. `Dong bo Sheet`
6. `Phan cong`
7. `Lich su`

### Tong quan

Hien va cho phep sua co kiem soat:

- Ma khach hang.
- Ten khach hang.
- Ten viet tat.
- Loai khach hang: business/individual.
- MST/DT.
- SDT chinh.
- Website.
- Dia phuong.
- Van phong giao dich.
- Dia chi giao/nhan hang.
- Dai dien phap luat raw.
- Ngay hoat dong.
- Ngay giao dich dau tien.
- NVKD phu trach.
- Bo phan quan ly.
- Loai hinh.

Can tach ro:

- Du lieu sync tu Sheet.
- Du lieu bo sung/sua trong CRM.
- Du lieu snapshot legacy code.

### API can bo sung/kiem tra

```http
GET   /api/v1/customer-profiles/:id
PATCH /api/v1/customer-profiles/:id
```

Patch can co audit va permission.

### Nghiem thu

- Click mot khach hang tu danh sach mo duoc trang chi tiet.
- Reload URL van mo dung khach hang.
- Sua field CRM local khong lam mat rawRow sync.
- Field map tu Sheet hien ro nguon du lieu.
- User khong co quyen khong sua duoc.

## 4.2. Gan Zalo tu CustomerProfile

**Trang thai 2026-06-29: da trien khai phan gan/go group Zalo tu trang chi tiet
CustomerProfile.**

- Trong tab `Zalo` cua `/customers/:id` da co khu vuc tim nhom Zalo theo ten
  hoac `globalId`.
- Co filter `Tat ca nhom`, `Chua gan ho so`, `Da gan ho so` va checkbox `Tu 2
  nick`.
- Tu CustomerProfile co the gan nhom Zalo vao ho so hien tai.
- Neu nhom dang thuoc ho so khach hang khac, UI hien confirm truoc khi chuyen
  link ve ho so hien tai.
- Co the go lien ket nhom khoi CustomerProfile ma khong xoa nhom, khong xoa lich
  su.
- Sau thao tac gan/go, UI reload lai ho so va ket qua tim de trang thai khop DB.

**Bo sung 2026-06-29: da trien khai phan gan/go `Zalo user/contact` tu
CustomerProfile.**

- Them endpoint autocomplete `GET /api/v1/customer-profiles/link-options/zalo-users`
  de tim Contact co `zaloGlobalId` theo ten, so dien thoai, Zalo username hoac
  globalId.
- Autocomplete ton trong pham vi nick Zalo user dang duoc phep truy cap.
- UI tab `Zalo` co khu vuc tim user Zalo, filter `Tat ca user`, `Chua gan ho so`,
  `Da gan ho so`.
- Co the gan user Zalo vao CustomerProfile hien tai.
- Neu user Zalo dang thuoc ho so khach hang khac, UI hien confirm truoc khi
  chuyen link ve ho so hien tai.
- Co the go lien ket user Zalo khoi CustomerProfile ma khong xoa Contact/Zalo
  identity.
- Ket qua tim user Zalo hien ro user do duoc thay qua nick Zalo nao, lay tu
  `friends` va `conversations`.
- Neu cung mot user Zalo/globalId co quan he voi nhieu nick Zalo, UI canh bao so
  nick cung thay user do; link CustomerProfile van gan theo Contact/globalId
  chung, khong tao nhieu link rieng theo tung nick.
- Khu vuc gan nhom Zalo da duoc thu gon vao cot `Nhom Zalo`, dong bo cach bo tri
  voi cot `User Zalo`.
- Bo sung quy tac dong bo `User Zalo -> Nguoi lien he`: chi tu dong day sang
  tab `Nguoi lien he` khi Contact/Zalo user co so dien thoai hop le. Neu user
  Zalo chua co so dien thoai thi van co the gan vao tab `Zalo` de quan ly kenh
  chat, nhung bo qua tao/gắn `CustomerProfileContact` va phai thong bao ro cho
  UI: "User Zalo chua co so dien thoai nen chua the tao Nguoi lien he".
- Khi User Zalo co so dien thoai hop le, he thong chuan hoa so dien thoai va
  upsert link `CustomerProfileContact` tu Contact do vao CustomerProfile. Neu
  ho so chua co nguoi lien he nao thi co the dat link moi la lien he chinh mac
  dinh; neu da co lien he thi khong tu ghi de lien he chinh.
- Bo sung 2026-06-30: khi sync qua lai giua `Nguoi lien he` va `User Zalo`,
  khong tron lan ten nghiep vu voi ten nick Zalo:
  - `Contact.fullName/crmName` giu ten nguoi lien he trong CRM.
  - `CustomerProfileZaloUser` luu snapshot rieng: ten lien he CRM, ten nick
    Zalo, so dien thoai, `zaloGlobalId`, `zaloUsername`.
  - `Contact.metadata.zaloNickByPhone` va `lastZaloNickForPhone` luu mapping
    "so dien thoai nay dang ung voi nick Zalo nao" de tab `Nguoi lien he` co
    the hien nick Zalo theo dung SDT.
  - Neu thao tac bat dau tu tab `Nguoi lien he`, sau khi add/gắn Contact co
    Zalo, tab `Zalo > User Zalo` phai hien ten nick Zalo + SDT cua user do.
  - Neu thao tac bat dau tu tab `Zalo > User Zalo`, tab `Nguoi lien he` chi tu
    dong tao/gắn contact khi co SDT hop le; neu khong co SDT thi bo qua va
    thong bao ro.
  - UI 2026-06-30: trong tab `Nguoi lien he`, dong "Nick Zalo theo SDT" duoc
    dat ngay duoi ten nguoi lien he vi day la thong tin dinh danh cua contact.
    Cot `Zalo` doi thanh `Zalo ket ban`, chi hien trang thai quan he Zalo va
    nut chi tiet khi can xem cac nick cham.
  - UI tab `Zalo` can giu dong chinh gon: ten nhom/user, tom tat SDT/CRM
    contact/trang thai. Cac noi dung nhu globalId, nick tham gia, nick cham va
    logic gan theo globalId/SDT duoc dua vao phan `Chi tiet` de mo khi can.

Phan con lai cua muc nay: toi uu them UX autocomplete neu can, vi du goi y user
Zalo tu cac thanh vien trong nhom da gan voi CustomerProfile.

### Van de

Hien tai goc thao tac chinh la `Nhom Zalo -> CustomerProfile`. Chua co luong
`CustomerProfile -> Zalo`.

### Can lam

Trong tab `Zalo` cua CustomerProfile:

- Hien danh sach group Zalo da gan.
- Hien danh sach Zalo user/contact da gan.
- Nut `Gan nhom Zalo`.
- Nut `Gan user Zalo`.
- Nut go lien ket.
- Nut chuyen group/user sang CustomerProfile khac neu can.

### Tim group Zalo

Autocomplete/command palette cho group:

- Tim theo ten group.
- Tim theo `globalId`.
- Tim theo nick Zalo tham gia group.
- Loc group chua gan ho so.
- Loc group dang gan ho so khac.
- Loc group co tu 2 nick tro len.

### Tim user/contact Zalo

Autocomplete cho contact:

- Tim theo ten CRM.
- Ten Zalo.
- So dien thoai.
- `zaloGlobalId`.
- Nick Zalo dang co quan he.

### API can bo sung/kiem tra

Co the dung lai API hien co:

```http
GET    /api/v1/native-zalo-groups?q=&customerLinkStatus=
POST   /api/v1/customer-profiles/:id/zalo-groups
DELETE /api/v1/customer-profiles/:id/zalo-groups/:nativeGroupId

GET    /api/v1/contacts?q=
POST   /api/v1/customer-profiles/:id/zalo-users
DELETE /api/v1/customer-profiles/:id/zalo-users/:contactId
```

Neu endpoint contact hien tai chua phu hop autocomplete, them endpoint rieng:

```http
GET /api/v1/customer-profiles/link-options/zalo-users?q=
```

### Nghiem thu

- Tu CustomerProfile gan duoc group `TRUNG HAU - HPG`.
- Group sau khi gan hien ca o man `Nhom Zalo`.
- Group da thuoc profile khac thi bat confirm transfer.
- Go link khong xoa group, khong xoa lich su.
- Tim khong bi gioi han boi 500 item preload.

## 4.3. Tab Nguoi lien he

**Trang thai 2026-06-30: da trien khai nen thao tac nguoi lien he trong trang
chi tiet CustomerProfile.**

- Them endpoint autocomplete `GET /api/v1/customer-profiles/contact-options?q=`
  de tim Contact theo ten, SDT, email, Zalo username, `zaloGlobalId` hoac
  `zaloUid`.
- Ket qua autocomplete tra them cac CustomerProfile khac ma Contact dang lien
  quan, giup thay ro mot Contact co the thuoc nhieu ho so B2B.
- Tab `Nguoi lien he` trong `/customers/:id` da co khu vuc tim contact co san,
  chon contact, khai bao role/title/department/rawText va gan vao ho so.
- Danh sach contact da gan co thao tac sua nhanh role/title/department, dat lam
  lien he chinh va go lien ket.
- Backend da siết quy tac `isPrimary`: neu dat mot Contact la lien he chinh,
  cac Contact khac trong cung CustomerProfile tu dong bi bo co chinh.
- Go lien ket chi set inactive tren `CustomerProfileContact`, khong xoa Contact
  goc hay Zalo identity.
- Bo sung luong tao nguoi lien he moi ngay trong tab `Nguoi lien he`: nhap ho
  ten, so dien thoai, email, ngay sinh, chuc danh, bo phan, ghi chu va gan vao
  CustomerProfile.
- Khi nhap so dien thoai, UI tu goi lookup de doi chieu Contact/Friend hien co:
  biet so do co Zalo trong CRM hay chua, dang la ban/quan he qua nick Zalo nao,
  va co Contact trung so hay khong.
- Lookup so dien thoai chi doi chieu theo Contact/Friend/user Zalo trong CRM,
  khong loc hay suy dien tu group Zalo.
- Khi luu nguoi lien he moi, neu so dien thoai da co Contact trung trong CRM thi
  mac dinh dung lai Contact co san va gan vao ho so, tranh tao trung Contact.
- UI da bo `role` khoi luong thao tac chinh; nguoi dung nhap `chuc danh` va
  `bo phan` theo cach hieu nghiep vu B2B.
- Dong bo hai chieu giua `User Zalo` va `Nguoi lien he` can lay so dien thoai
  lam dieu kien toi thieu khi day tu Zalo sang nguoi lien he. Cac field CRM nhu
  ngay sinh, chuc danh, bo phan, ghi chu khong lay tu Zalo va khong dong bo
  nguoc len Zalo; day la du lieu nghiep vu CRM.
- Bo sung chieu `Nguoi lien he -> User Zalo`: khi user them moi/gắn Contact vao
  ho so ma Contact do da co dinh danh Zalo trong CRM (`zaloGlobalId`,
  `zaloUsername`, friend hoac conversation), he thong tu tao link
  `CustomerProfileZaloUser` de contact do xuat hien trong tab `Zalo > User
  Zalo`.
- Neu Contact co Zalo nhung User Zalo do dang thuoc CustomerProfile khac, he
  thong khong tu chuyen ngam. UI phai thong bao ro de user chu dong qua tab
  `Zalo` va thao tac transfer neu can.
- Neu Contact chua co Zalo identity, he thong chi gắn lam `Nguoi lien he`, khong
  tao link `User Zalo`, va thong bao ro ly do.

Phan con lai cua muc nay: tach lop `CustomerProfilePhone` cho nhieu so lien
he/mac dinh, bo sung tuy chon lookup Zalo SDK truc tiep theo tung nick khi so
chua co trong CRM, va lam UI tieng Viet chuan lai sau khi xu ly rieng loi
encoding hien tai.

### Van de

Da co `CustomerProfileContact` nhung chua co UI quan ly nguoi lien he theo B2B.

### Can lam

Trong tab `Nguoi lien he`:

- Hien danh sach Contact thuoc CustomerProfile.
- Them contact co san.
- Tao contact moi neu chua co.
- Sua role, title, department, isPrimary, rawText.
- Ngung lien ket contact.
- Hien Zalo identity cua contact neu co.
- Hien cac CustomerProfile khac ma contact nay dang lien quan.

Role de xuat:

```text
legal_representative
decision_maker
buyer
accountant
technical
delivery
owner
staff
other
```

### API

Da co:

```http
POST   /api/v1/customer-profiles/:id/contacts
PATCH  /api/v1/customer-profiles/:id/contacts/:contactId
DELETE /api/v1/customer-profiles/:id/contacts/:contactId
```

Can bo sung neu thieu:

```http
GET /api/v1/customer-profiles/:id/contacts
GET /api/v1/customer-profiles/contact-options?q=
```

### Nghiem thu

- Mot CustomerProfile co nhieu contact.
- Mot contact co the thuoc nhieu CustomerProfile.
- Contact co CustomerProfile ca nhan rieng khong bi gop nham.
- Trong group, customer context lay theo group, khong theo profile ca nhan cua contact.

## 4.4. Tab Ho so luu

**Trang thai 2026-06-30: da trien khai nen danh sach ho so luu theo
CustomerProfile.**

- API `GET /api/v1/archive/stories` da ho tro filter `customerProfileId` de lay
  ho so luu theo dung khach hang dang mo.
- Tab `Ho so luu` trong `/customers/:id` khong chi dung 20 dong preload tu
  profile nua, ma goi truc tiep API archive co phan trang.
- UI co filter nhanh theo trang thai, loai ho so va o tim kiem tieu de/ma
  don/noi dung.
- Moi dong co nut `Mo` de nhay sang man `/archive?storyId=...` va xem/van hanh
  chi tiet ho so luu tren man Archive hien co.
- Phan nay hien tai la read/list/open. Cac thao tac sua trang thai/ban giao/ghi
  chu van thuc hien trong man Archive de tranh nhan doi logic.

### Van de

`ArchiveStory` da co lien ket customer profile mot phan, nhung UI CustomerProfile
chua cho xem toan bo ho so luu/don hang phat sinh theo khach hang.

### Can lam

Trong tab `Ho so luu`:

- Liet ke ArchiveStory co `customerProfileId`.
- Loc theo trang thai.
- Loc theo loai ho so.
- Loc theo phong ban/nguoi phu trach.
- Mo chi tiet ho so.
- Hien customer snapshot tai thoi diem tao ho so.

### API

Mo rong API archive list:

```http
GET /api/v1/archive/stories?customerProfileId=
```

Neu da co query thi nghiem thu lai.

### Nghiem thu

- Tu CustomerProfile xem duoc cac ho so luu lien quan.
- Doi link group sang khach khac khong lam ho so cu doi sai customer snapshot.
- Ho so tao tu group da gan customer tu dong co customer context.

## 4.5. Snapshot CustomerProfile tren ArchiveStory

**Trang thai 2026-06-30: da co nen snapshot customer context khi tao
ArchiveStory.**

- Schema `ArchiveStory` da co cac field:
  `customerProfileId`, `customerProfileCodeSnapshot`,
  `customerProfileNameSnapshot`, `customerContextType`,
  `customerContextSubjectId`.
- Khi tao ho so luu tu group, he thong lay customer context tu
  `NativeZaloGroup -> CustomerProfileZaloGroup` va snapshot ma/ten khach hang
  vao `ArchiveStory`.
- Khi tao ho so luu tu hoi thoai 1:1, he thong uu tien link `User Zalo` da gan
  vao `CustomerProfile`. Neu chua co link User Zalo nhung Contact chi dang gan
  vao dung 1 CustomerProfile active trong tab `Nguoi lien he`, he thong lay ho
  so do lam customer context.
- Neu Contact dang lien quan nhieu CustomerProfile, he thong khong tu doan khach
  hang de tranh gan sai; can bo sung UI chon customer context ro rang trong giai
  doan sau.
- Customer snapshot duoc giu tren `ArchiveStory`, nen sau nay doi/go link
  group/user/contact khong lam ho so cu doi sai ten/ma khach hang lich su.
- Tab `Ho so luu` cua CustomerProfile hien snapshot khach hang va loai context
  da gan vao ArchiveStory, giup doi chieu ho so cu duoc tao tu group, User Zalo
  hay Nguoi lien he.

### Van de

Plan yeu cau ho so luu can giu snapshot de lich su khong bi sai khi mapping doi.

### Can lam

Kiem tra/bo sung field:

```text
ArchiveStory.customerProfileId
ArchiveStory.customerProfileCodeSnapshot
ArchiveStory.customerProfileNameSnapshot
ArchiveStory.customerContextType
ArchiveStory.customerContextSubjectId
```

Khi tao ArchiveStory:

- Neu conversation la group va group co `CustomerProfileZaloGroup` active,
  gan customer context cua group.
- Neu conversation la 1:1, goi y CustomerProfile theo contact mapping.
- Neu khong ro, de null va cho user chon.

### Nghiem thu

- Chuyen group sang customer khac khong lam ho so cu doi ten khach hang.
- Ho so cu van hien snapshot customer tai thoi diem tao.
- Bao cao dung snapshot khi customer link thay doi.

## 4.6. Google Sheet sync operation UI

### Van de

Dong bo Google Sheet da chay duoc, nhung UI van thieu cac cong cu van hanh
de admin tu kiem tra loi va mapping.

### Can lam

Trong tab `Dong bo`:

- Lich su sync run.
- Chi tiet loi tung dong.
- Preview du lieu truoc khi sync.
- Mapping cot thu cong.
- Auto-detect mapping theo header tieng Viet.
- Canh bao range/header row sai.
- Canh bao source co 0 tao moi/0 cap nhat.
- Canh bao row bi skip.
- Xoa/luu tru nguon dong bo, co phan quyen va confirm ro rang.

### Xoa nguon dong bo

**Trang thai 2026-06-22: da trien khai phan luu tru/khoi phuc nguon.**

- Da co `archivedAt`, `archivedByUserId`, `archiveReason`; `archivedAt` la
  source of truth nen khong tao them field boolean `isArchived` de tranh lech
  trang thai.
- API da co `POST /customer-data-sources/:id/archive`,
  `DELETE /customer-data-sources/:id` (cung la soft archive) va
  `POST /customer-data-sources/:id/restore`.
- Nguon archived bi loai khoi cron va khong the sua, preview, sync hay apply
  snapshot cho den khi khoi phuc.
- Khoi phuc xong nguon van `enabled=false`; admin phai chu dong bat lai.
- UI co hai che do `Dang su dung` va `Da luu tru`, hien nguoi thao tac, thoi
  gian va ly do luu tru.
- Audit ghi `customer_source_archived` / `customer_source_restored`, ly do va
  `affectedCustomerCount`.
- Khong xoa `CustomerProfile`, sync run, snapshot, mapping hay lien ket CRM/Zalo.

Khong nen hard delete `CustomerDataSource` ngay lap tuc vi nguon dong bo lien quan
toi sync history, row error, mapping cot va audit nguon goc cua CustomerProfile.

De xuat mac dinh:

- Nut UI: `Xoa nguon` hoac `Luu tru nguon`.
- Hanh vi ky thuat: soft delete/archive source.
- Field can bo sung:

```text
CustomerDataSource.archivedAt
CustomerDataSource.archivedByUserId
CustomerDataSource.archiveReason
CustomerDataSource.isArchived
```

Khi archive source:

- Dung scheduled sync cua source do.
- An source khoi danh sach active, nhung van xem duoc o tab `Da luu tru`.
- Giu sync run, error log va column mapping de audit.
- Khong xoa `CustomerProfile` da tao tu source.
- Khong xoa Zalo link, contact, phone, assignment, CRM tag, ArchiveStory.
- Cac CustomerProfile tung sync tu source co the giu `sourceId` de truy vet, hoac
  hien trang thai `Nguon da luu tru`.

Neu sau nay can "xoa vinh vien" source thi tach thanh flow nguy hiem rieng:

- Chi super admin/role duoc cap quyen moi thay.
- Bat buoc source da archived truoc.
- Bat buoc khong co scheduled job dang chay.
- Khong cascade xoa customer theo mac dinh.
- Neu muon purge customer import tu source thi can workflow rieng co preview,
  export backup va xac nhan so luong.

### Phan quyen can co

**Trang thai 2026-06-22: da dua `customer_source` vao ma tran RBAC hien co.**

He thong hien dung ma tran chuan `resource x action`, vi vay slice nay map nhu
sau:

```text
customer_source.access  -> xem source, sync run, error, snapshot
customer_source.create  -> tao source
customer_source.edit    -> sua, preview, sync now, apply snapshot
customer_source.delete  -> archive va restore source
customer_source.view_all -> quyen xem toan bo theo convention RBAC
```

Neu can tach rieng `sync_now`, `manage_mapping`, `manage_credential` o giai
doan sau thi can mo rong tap action cua RBAC thay vi luu permission ngoai ma
tran.

Can them permission rieng trong bang phan quyen, khong gan chung voi quyen xem
khach hang:

```text
customer_source.view
customer_source.create
customer_source.edit
customer_source.delete          // archive/delete source
customer_source.sync_now
customer_source.view_sync_logs
customer_source.manage_mapping
customer_source.manage_credential
```

De xuat:

- User kinh doanh thong thuong khong duoc tao/sua/xoa source.
- Quan tri du lieu duoc `create/edit/sync_now/view_sync_logs/manage_mapping`.
- Chi admin cap cao duoc `delete` va `manage_credential`.
- Moi lan xoa/luu tru source phai ghi audit:

```text
actorUserId
sourceId
action: archive_source | restore_source | hard_delete_source
reason
affectedCustomerCount
createdAt
```

### Rang buoc khi Google Sheet it hon CRM

Day la tinh huong binh thuong vi CRM co the da bo sung ho so, contact, so dien
thoai, Zalo group/user, tag, assignment va ho so luu ma Sheet khong co.

Quy tac de xuat:

- Sync theo tung source. Source A chi duoc reconcile cac CustomerProfile co
  `sourceId = A`.
- Profile tao thu cong tren CRM (`source=manual` hoac `sourceId=null`) khong bi
  coi la missing khi Sheet thieu.
- Profile da sync tu Sheet nhung co du lieu CRM bo sung van khong bi xoa khi row
  tren Sheet mat.
- Row mat khoi Sheet:
  - set `missingFromSource=true`
  - set `sourceMissingSince=now`
  - giu nguyen tat ca du lieu CRM
  - dua vao queue review `CustomerProfile bi missing from Sheet`
- Row xuat hien lai tren Sheet:
  - clear `missingFromSource`
  - update `lastSeenInSourceAt`
- Field nao la CRM-owned thi Sheet khong duoc ghi de, vi du:
  - Zalo link/contact link
  - CRM tag
  - assignment
  - note noi bo
  - ho so luu
  - phone/contact them thu cong
- Field nao la Sheet-owned thi Sheet co the cap nhat, vi du:
  - ma khach hang
  - ten khach hang
  - ten viet tat/ten tren Sunnet
  - dia phuong
  - van phong giao dich
  - MST/DT raw
  - bo phan quan ly code
  - NVKD phu trach code
  - loai hinh code

Can co co che field ownership:

```text
CustomerProfile.sourceId
CustomerProfile.sourceRowKey
CustomerProfile.sourceOwnership: sheet_managed | crm_managed | mixed
CustomerProfile.lastSeenInSourceAt
CustomerProfile.sourceMissingSince
CustomerProfile.missingFromSource
CustomerProfile.localOverrideFields json nullable
```

Neu user sua truc tiep mot field Sheet-owned tren CRM, UI nen hoi:

- `Chi sua local override`: giu gia tri CRM, lan sync sau khong ghi de field do.
- `Sua tam thoi`: cho phep sync sau ghi de lai tu Sheet.
- `Cap nhat nguoc len Sheet`: chua lam giai doan nay, chi ghi nhan la future work.

### Mo hinh 2 lop: source snapshot va CRM canonical

Nen tach ro 2 lop du lieu thay vi ghi truc tiep tu Google Sheet vao
`CustomerProfile` ngay khi doc Sheet:

```text
CustomerDataSource        = cau hinh nguon sync
CustomerSourceSnapshot    = du lieu raw/normalized moi lan doc tu Sheet
CustomerProfile           = ho so khach hang chinh dang van hanh tren CRM
```

`CustomerSourceSnapshot` la bang trung gian/staging de luu nhung gi Sheet dang co:

```text
CustomerSourceSnapshot

id
orgId
sourceId
syncRunId
sourceRowNumber
sourceRowKey              // ma khach hang hoac key on dinh
rawRow json
normalizedData json
rowHash
status: new | matched | duplicate | invalid | missing | applied | ignored
matchedCustomerProfileId nullable
createdAt
```

Loi ich:

- Doc Sheet xong co the preview truoc khi cap nhat CRM.
- Co the so sanh snapshot voi `CustomerProfile` hien tai.
- Co the biet row nao moi, row nao thay doi, row nao mat, row nao duplicate.
- Co audit du lieu Sheet tai thoi diem sync.
- Neu mapping sai, co the sua mapping roi reconcile lai ma khong doc Sheet lai ngay.

Bang CRM canonical van la `CustomerProfile`. Tat ca thao tac nghiep vu nhu gan Zalo,
gan contact, so lien he, tag, assignment, ho so luu deu bam vao
`CustomerProfile`, khong bam vao snapshot.

### Hai che do apply tu Sheet sang CRM

Khi da co snapshot, UI nen cho chon cach apply tu Sheet sang CRM:

#### 1. Update/bo sung an toan

Day nen la mac dinh.

Y nghia:

- Tao moi `CustomerProfile` neu sourceRowKey chua ton tai.
- Cap nhat cac field Sheet-owned khi Sheet co gia tri moi.
- Khong ghi de field CRM-owned.
- Khong ghi de local override.
- Khong ghi de gia tri CRM bang gia tri rong tu Sheet, tru khi user bat tuy chon
  `Cho phep clear field bang gia tri rong`.
- Neu Sheet thieu row thi chi mark missing, khong xoa.

Phu hop cho dong bo dinh ky hang ngay vi it rui ro.

#### 2. Ghi de tu Sheet

Chi dung khi admin chac chan Sheet dang la master dung cho mot tap field cu the.

Y nghia:

- Ghi de cac field duoc mapping la Sheet-owned.
- Co the cho phep clear field tren CRM neu Sheet de rong, nhung phai la option
  rieng va mac dinh tat.
- Van khong duoc ghi de CRM-owned field nhu Zalo link, tag, assignment, note noi
  bo, ho so luu.
- Van khong xoa `CustomerProfile` khi Sheet mat row, tru khi co workflow purge
  rieng.

UI can hien preview truoc khi ghi de:

```text
Field        CRM hien tai        Sheet moi        Hanh dong
ten          ABC cu              ABC moi          overwrite
phone        091...              blank           keep / clear neu duoc bat
assignment   user A              --              keep CRM-owned
zalo group   group X             --              keep CRM-owned
```

Khuyen nghi:

- Sync thu cong co the cho chon `Update an toan` hoac `Ghi de tu Sheet`.
- Sync dinh ky chi nen chay `Update an toan`.
- `Ghi de tu Sheet` can permission rieng, vi rui ro cao hon sync thuong.
- Manual apply tu snapshot sang CRM can cho chon pham vi:
  - Cac profile/row duoc tick chon.
  - Tat ca row dang match filter hien tai.
  - Tat ca row hop le trong snapshot/sync run.
- Khi chon `Tat ca`, UI phai hien tong so row se bi tac dong va can confirm lan
  hai neu co bat ky row nao se ghi de field dang co du lieu CRM.

Permission bo sung:

```text
customer_source.apply_update
customer_source.apply_overwrite
```

### Chinh sach duplicate va conflict

- Bat buoc chon mot key on dinh tu Sheet de upsert, uu tien `Ma khach hang`.
- Neu Sheet co 2 row cung `Ma khach hang` trong cung source: skip ca 2 hoac skip
  row sau, ghi loi duplicate vao sync run.
- Neu Sheet co row trung voi profile CRM manual theo MST/DT/phone/ten gan giong:
  khong tu merge, dua vao queue `Co the trung khach hang`.
- Preview truoc sync phai hien:
  - so row se tao moi
  - so row se cap nhat
  - so row se danh dau missing
  - so row duplicate key
  - so row co the trung voi CRM manual
  - so field local override se khong bi ghi de

### Chon profile de apply

Sau khi doc Sheet vao `CustomerSourceSnapshot`, UI nen co bang preview tung row voi
checkbox:

```text
[ ] Ma KH   Ten KH        Trang thai   Hanh dong du kien
[x] K001    Cong ty A     matched      update
[ ] K002    Cong ty B     new          create
[x] K003    Cong ty C     changed      overwrite 3 fields
```

Thao tac apply can ho tro:

- `Apply selected`: chi dong bo cac row user tick.
- `Apply filtered`: dong bo tat ca row khop bo loc hien tai, vi du chi row
  `new`, chi row `changed`, chi row cua NVKD `DA01`.
- `Apply all valid`: dong bo tat ca row hop le trong snapshot.

Bo loc can co:

- Trang thai row: `new`, `matched`, `changed`, `duplicate`, `invalid`,
  `missing`, `ignored`.
- Hanh dong du kien: create/update/overwrite/mark missing/no-op.
- NVKD phu trach.
- Bo phan.
- Loai hinh.
- Co local override.
- Co the trung voi CRM manual.

Rang buoc:

- Row `duplicate` hoac `invalid` khong duoc apply cho toi khi duoc sua/bo qua.
- `Apply all valid` khong bao gom row duplicate/invalid.
- Neu chon `Ghi de tu Sheet`, moi apply scope deu phai hien diff truoc.
- Sau khi apply mot phan, snapshot row can doi status sang `applied`; row chua
  apply van giu lai de xu ly sau.
- Apply lai row da `applied` phai idempotent, khong tao trung profile.

### Queue can co

- NVKD code chua map User.
- Bo phan code chua map Department.
- Loai hinh code chua map CustomerType.
- CustomerProfile bi missing from Sheet.
- CustomerProfile co the trung voi CRM manual.
- CustomerProfile co local override khac du lieu Sheet.

### API da co/can dung

```http
GET /api/v1/customer-data-sources/:id/sync-runs
GET /api/v1/customer-sync-runs/:id/errors
```

Can bo sung:

```http
POST /api/v1/customer-data-sources/:id/preview
POST /api/v1/customer-data-sources/:id/reconcile
POST /api/v1/customer-source-snapshots/:syncRunId/apply
GET  /api/v1/customer-data-sources/:id/unmapped
DELETE /api/v1/customer-data-sources/:id
POST /api/v1/customer-data-sources/:id/archive
POST /api/v1/customer-data-sources/:id/restore
```

Payload apply nen ho tro:

```json
{
  "mode": "update_safe | overwrite_from_sheet",
  "scope": "selected | filtered | all_valid",
  "snapshotRowIds": ["row_1", "row_2"],
  "filter": {
    "status": ["new", "changed"],
    "salesCode": "DA01"
  },
  "allowClearBlankFields": false
}
```

### Nghiem thu

- Admin xem duoc lan sync gan nhat thanh cong/loi.
- Bam xem loi biet dong nao loi va raw data la gi.
- Mapping cot sai co the sua tren UI.
- Sync lai sau khi sua mapping khong tao trung CustomerProfile.
- User khong co permission `customer_source.delete` khong thay/khong goi duoc thao
  tac xoa/luu tru source.
- Xoa/luu tru source khong xoa CustomerProfile, Zalo link, contact, phone,
  assignment, tag va ArchiveStory.
- Source da luu tru khong con chay scheduled sync.
- Sheet it dong hon CRM chi danh dau missing nhung profile thuoc source do, khong
  anh huong profile tao thu cong tren CRM.
- Local override tren CRM khong bi Sheet ghi de ngoai y muon.
- Admin dong bo duoc cac row/profile duoc chon, cac row theo filter, hoac tat ca
  row hop le.
- Row duplicate/invalid khong duoc apply trong `Apply all valid`.
- Apply lai row da apply khong tao trung CustomerProfile.

## 4.7. Scheduled sync hardening

### Van de

Da co nen cron, nhung can nghiem thu van hanh.

### Can lam

- Kiem tra cron co load source enabled khi app start.
- Reload cron khi tao/sua source.
- Chong hai job sync cung source chay song song.
- Log sync run cho scheduled trigger.
- UI hien next run/last run.
- Canh bao credential loi hoac Google API disabled.

### Nghiem thu

- Source scheduled chay dung cron.
- Khi sync loi, UI hien lastSyncError.
- Manual sync dang chay thi scheduled sync khong chen ngang cung source.

## 4.8. Work assignment tu CustomerProfile

### Van de

Da co `ZaloSubjectWorkAssignment` cho group/user, nhung chua co phan cong theo
CustomerProfile.

### Can lam

Trong tab `Phan cong` cua CustomerProfile:

- Gan owner/collaborator/watcher cho customer.
- Gan CRM tag workload cho customer hoac cac subject Zalo lien quan.
- Hien cac assignment tren group/user thuoc customer.
- Queue `Chua phan cong`.
- View `Duoc giao cho toi`.

### Can quyet dinh schema

Phuong an A: Them assignment truc tiep theo `customerProfileId`.

```text
CustomerProfileWorkAssignment
```

Phuong an B: Mo rong `ZaloSubjectWorkAssignment` thanh subject moi:

```text
subjectType: customer_profile | user | group
customerProfileId nullable
```

Khuyen nghi: phuong an A ro nghia hon, tranh tron customer-level voi Zalo
subject-level.

### Nghiem thu

- Manager gan sale phu trach customer.
- Assignment customer khong tu cap quyen doc/chat Zalo neu user khong co account access.
- User duoc giao customer thay queue cong viec lien quan.

## 4.9. CRM tag va native label separation

### Van de

Group CRM tag da co mot phan. Can hoan thien tren toan bo UI/filter.

### Can lam

- Tach UI `CRM tag` va `Zalo native label`.
- Khong mirror native label thanh CRM tag moi.
- Native label hien theo tung nick Zalo.
- CRM tag hien theo canonical group/user/customer.
- Them filter CRM tag trong Nhom Zalo/Chat/CustomerProfile.

### Nghiem thu

- Doi label Zalo native khong tao/sua/xoa CRM tag.
- Doi CRM tag khong goi Zalo SDK.
- Group co 2 nick, gan CRM tag qua nick A thi xem qua nick B van thay.

## 4.10. Handover qua group chung

### Van de

Plan da chot ban giao qua nhom chung khong can nguoi nhan la secondary cua nick
nguon. Can UI va nghiem thu day du.

### Can lam

- Khi ho so phat sinh tu canonical group, lay candidate nguoi nhan theo nick
  con membership active trong group.
- Luu ro:

```text
sourceZaloAccountId
handlingZaloAccountId
assignedUserId
nativeGroupId
```

- UI chon nick gui/handling nick neu user co nhieu nick hop le.
- Audit doi handling account.

### Nghiem thu

- Primary cua nick A ban giao ho so group G cho primary cua nick B neu B cung trong G.
- Khong can gan B thanh secondary cua nick A.
- Neu B roi group, khong con la candidate ban giao moi.
- Khong suy dien quyen bac cau qua nhieu group.

## 4.11. Native group lifecycle UI

### Van de

Da co membership status, nhung UI chua the hien day du stale/left/removed.

### Can lam

- Filter group theo membership status.
- Hien canh bao nick stale/left/removed.
- Queue nhom can review.
- Khong cho chon nick gui da roi nhom.
- Audit membership change.

### Nghiem thu

- Nick roi group van giu lich su.
- Khong cho ban giao/gui qua nick roi group.
- Group doi ten/avatar khong lam doi identity.

## 4.12. Duplicate native message testing va fallback

### Van de

Da co native message dedup, nhung can test case thuc va fallback cho data cu.

### Can lam

- Test hai user luu cung tin qua hai nick cung group.
- Test race condition luu dong thoi.
- Backfill nativeZaloMessageId cho message cu.
- Fallback fingerprint cho tin cu chua native id:

```text
nativeGroupGlobalId + sender + normalized content/attachment + sentAt bucket
```

Fingerprint chi danh dau `likely_duplicate`, khong tu dong chan.

### Nghiem thu

- Cung tin native khong duplicate am tham.
- Conflict tra ve ho so dang giu tin.
- Du lieu cu chua native id van co canh bao likely duplicate neu trung ro.

## 4.13. Doi ten UI va tai lieu

### Van de

Tai lieu va UI cu dang dung `Khach hang` cho Contact/Zalo friend. Mo hinh moi
can tach:

```text
Ho so khach hang / Khach hang B2B = CustomerProfile
Lien he Zalo                        = Contact
Ho so luu / Ho so trao doi          = ArchiveStory
```

### Can lam

- Xem lai top nav.
- Doi `/contacts` thanh `Lien he Zalo` hoac them subtitle ro.
- Doi `/customers` thanh `Ho so khach hang` neu can.
- Cap nhat README/user guide.
- Ghi migration terminology trong docs.

### Nghiem thu

- User khong nham `Contact` la khach hang B2B.
- Man Khach hang B2B la noi gan group/user/contact vao ho so.
- Man Lien he Zalo la noi xem Zalo identity/contact.

## 5. Thu tu trien khai de xuat

### Phase 1 - CustomerProfile detail first

1. Them route detail `/customers/:id`.
2. Tach popup hien tai thanh component detail co tab.
3. Tab `Tong quan`.
4. Tab `Zalo` chi hien danh sach group/user da gan.
5. Tab `Raw Sheet`/`Dong bo Sheet` hien rawRow va source info.

Muc tieu: co noi dung trung tam de mo rong tiep.

### Phase 2 - Gan Zalo tu CustomerProfile

1. Them autocomplete group.
2. Gan/unlink/transfer group tu CustomerProfile.
3. Them autocomplete contact/Zalo user.
4. Gan/unlink user/contact tu CustomerProfile.

Muc tieu: user co the xuat phat tu khach hang de hoan thien kenh Zalo.

### Phase 3 - Nguoi lien he B2B

1. Tab `Nguoi lien he`.
2. Them contact co san.
3. Tao contact moi tu profile.
4. Sua role/title/department/isPrimary.
5. Hien customer contexts cua contact.

Muc tieu: dung mo hinh B2B, khong dong nhat contact voi customer.

### Phase 4 - Ho so luu theo customer

1. Gan snapshot customer khi tao ArchiveStory.
2. Filter archive theo `customerProfileId`.
3. Tab `Ho so luu`.
4. UI canh bao khi customer link da doi.

Muc tieu: moi ho so luu co customer context ro rang.

### Phase 5 - Sync operation hardening

1. Sync history UI.
2. Row errors UI.
3. Preview source.
4. Source snapshot/staging table.
5. Apply mode `Update an toan` va `Ghi de tu Sheet`.
6. Column mapping UI.
7. Unmapped queues.
8. Source archive/delete UI co phan quyen.
9. Reconcile policy khi Sheet it dong hon CRM.
10. Local override policy cho field CRM sua truc tiep.
11. Scheduled sync hardening.

Muc tieu: admin tu van hanh duoc Google Sheet sync.

### Phase 6 - Assignment, tag, saved views

1. CustomerProfile assignment.
2. Queue `Duoc giao cho toi`.
3. Queue `Chua phan cong`.
4. CRM tag filter.
5. Native label separation tren cac UI lien quan.

Muc tieu: CustomerProfile tro thanh trung tam dieu phoi cong viec.

### Phase 7 - Handover va lifecycle polish

1. UI ban giao qua group chung.
2. Handling account selector.
3. Membership lifecycle UI.
4. Audit/report source vs handling account.
5. Test duplicate native message/race condition.

Muc tieu: van hanh an toan khi nhieu nick cung o chung group.

### Phase 8 - Documentation and terminology

1. Cap nhat README.
2. Cap nhat user guide.
3. Cap nhat plan index.
4. Doi ten UI neu can.

Muc tieu: tai lieu va UI khong con nham Contact voi CustomerProfile.

## 6. Tieu chi nghiem thu tong

- Tu mot `CustomerProfile`, user gan duoc group Zalo va user/contact Zalo.
- Mot group khong co hai active CustomerProfile link.
- Transfer group giua hai CustomerProfile phai co confirm va audit.
- CustomerProfile doanh nghiep co nhieu contact.
- Contact co the thuoc nhieu CustomerProfile.
- Contact co profile ca nhan rieng khong bi gop nham voi doanh nghiep.
- ArchiveStory tao tu group da gan customer se co customer context va snapshot.
- Doi/unlink mapping sau nay khong lam sai lich su ho so cu.
- Google Sheet sync khong tao trung khi sync lai.
- Google Sheet duoc doc vao source snapshot/staging truoc khi apply sang CRM.
- Manual sync cho chon `Update an toan` hoac `Ghi de tu Sheet`; scheduled sync
  mac dinh chi chay `Update an toan`.
- Row mat khoi sheet khong bi xoa CRM, chi danh dau missing.
- Row mat khoi sheet chi danh dau missing voi profile thuoc dung source do.
- Profile tao thu cong tren CRM khong bi anh huong khi Sheet it dong hon CRM.
- Field CRM-owned va local override khong bi Sheet ghi de ngoai y muon.
- Xoa/luu tru nguon sync co phan quyen, co audit, va khong xoa customer data
  theo mac dinh.
- Admin xem duoc sync history va row error.
- CRM tag khong dong bo nguoc len Zalo native.
- Native label khong tao CRM tag moi.
- Assignment/tag khong tu cap quyen doc/chat neu user khong co account access.
- Handover qua group chung khong yeu cau nguoi nhan la secondary cua nick nguon.
- Nick roi group khong con la duong ban giao/gui tin moi.
- UI/tai lieu tach ro CustomerProfile, Contact va ArchiveStory.

## 7. Ke hoach trien khai chi tiet tu trang thai hien tai

Bon phan nen da co va khong can lam lai:

1. Trang chi tiet `CustomerProfile`.
2. Gan/go group va User Zalo tu tab `Zalo`.
3. Tao, sua, dat lien he chinh va khoa `Nguoi lien he`.
4. Danh sach `Ho so luu` theo khach hang va customer snapshot.

Phan con lai duoc chia thanh cac goi nho ben duoi. Moi goi chi duoc danh dau
hoan thanh sau khi build, test API va test workflow tren UI.

### Goi 1 - Chot CustomerProfile detail va du lieu local

Muc tieu: trang chi tiet la noi sua thong tin khach hang an toan, phan biet ro
du lieu Sheet va du lieu bo sung tren CRM.

Can lam:

1. Hoan thien `PATCH /api/v1/customer-profiles/:id`.
2. Them quyen xem/sua tung nhom field.
3. Them audit cho thay doi ten, MST, dia chi, owner, department va loai hinh.
4. Danh dau ro field:
   - `Sheet-owned`: gia tri lay tu Google Sheet.
   - `CRM-owned`: gia tri chi quan ly tren CRM.
   - `Local override`: da sua tren CRM va khong tu ghi de khi sync an toan.
5. Them tab hoac panel `Lich su thay doi`.
6. Chuan hoa tieng Viet co dau va nhan field tren toan trang.

UI bi tac dong:

- `Khach hang > Ho so > Chi tiet > Tong quan`.
- Them nut `Sua`, popup/form sua, `Luu thay doi`, `Huy`.
- Hien nguon du lieu va thoi diem cap nhat cho field quan trong.

Test UI:

1. Mo khach hang `01637 - CUA HANG TRUNG HAU`.
2. Sua mot field CRM-owned va reload trang.
3. Chay sync an toan, field CRM-owned van duoc giu.
4. User khong co quyen chi xem, khong sua duoc.

Dieu kien hoan thanh:

- Khong sua truc tiep `rawRow`.
- Moi thay doi co audit user va thoi gian.
- Build backend/frontend va test API thanh cong.

### Goi 2 - Chot lien ket Zalo va Nguoi lien he

Muc tieu: dong bo quan he giua `User Zalo` va `Nguoi lien he` ma khong tao
trung Contact, khong tu chuyen lien ket sang khach hang khac.

Can lam:

1. Tach `CustomerProfilePhone` de mot khach hang co nhieu so lien he.
2. Cho dat mot so dien thoai mac dinh; moi thoi diem chi co mot so active mac
   dinh.
3. Chuan hoa so dien thoai truoc khi tim trung.
4. Hoan thien lookup:
   - So dien thoai da co Contact.
   - So dien thoai co User Zalo trong friends/conversations.
   - User Zalo duoc nhin thay qua nhung nick CRM nao.
5. Neu so chua co trong CRM, bo sung lookup Zalo truc tiep theo tung nick duoc
   phep truy cap.
6. Khi gan User Zalo co SDT hop le, tao/gan Nguoi lien he tuong ung.
7. Khi gan Nguoi lien he co Zalo identity, tao/gan User Zalo tuong ung.
8. Khi go mot ben, kiem tra lien ket ben con lai va hoi co go ca hai hay khong.
9. Khong tu transfer neu User Zalo dang thuoc CustomerProfile khac.
10. Them audit cho gan, go, transfer va thay doi lien he chinh.

UI bi tac dong:

- `Chi tiet khach hang > Zalo`.
- `Chi tiet khach hang > Nguoi lien he`.
- Popup sua lien he, popup cac nick Zalo ket ban va cac confirm go lien ket.

Test UI:

1. Them Nguoi lien he bang SDT da co Zalo friend.
2. Kiem tra User Zalo tu dong xuat hien dung mot lan.
3. Gan User Zalo khong co SDT: chi gan tab Zalo va hien thong bao.
4. Go User Zalo: confirm co go Nguoi lien he hay khong.
5. Go Nguoi lien he: confirm co go User Zalo hay khong.
6. Contact thuoc nhieu CustomerProfile khong bi gop hoac transfer ngam.

Dieu kien hoan thanh:

- Mot `zaloGlobalId` khong tao nhieu User Zalo logic.
- Mot SDT chuan hoa khong tao Contact trung.
- Hai chieu hien cung trang thai sau reload.

### Goi 3 - Hoan thien Ho so luu trong CustomerProfile

Muc tieu: xem va thao tac nhanh ho so cua khach hang ma khong roi khoi trang
khach hang.

Can lam:

1. Nut `Mo` hien popup chi tiet ArchiveStory.
2. Popup co nut `Mo tai man Ho so` khi can thao tac day du.
3. Dong popup khong redirect va van mo duoc ho so khac.
4. Bo sung filter nguoi phu trach, phong ban va khoang ngay.
5. Hien ro customer snapshot, context source va conversation source.
6. Xu ly case conversation 1:1 lien quan nhieu CustomerProfile: bat user chon
   customer context khi luu.

UI bi tac dong:

- `Chi tiet khach hang > Ho so luu`.
- Popup xem nhanh ArchiveStory.
- Luong luu ho so tu man `Tin nhan`.

Test UI:

1. Mo lien tiep nhieu ho so trong popup.
2. Dong popup van o dung CustomerProfile.
3. Nut `Mo tai man Ho so` redirect dung story.
4. Doi link Zalo sau do khong lam snapshot ho so cu thay doi.

Dieu kien hoan thanh:

- Phan trang/filter dung tong so dong.
- Popup khong lam thay doi URL neu user khong chon redirect.

### Goi 4 - Hoan thien van hanh dong bo Google Sheet

Muc tieu: admin xem truoc, chon dong va ap dung du lieu co kiem soat.

Can lam:

1. Chot UI preview snapshot va phan trang server-side.
2. Loc cac dong:
   - Hop le.
   - Thieu ma/ten.
   - Trung ma trong cung snapshot.
   - Xung dot voi CRM.
   - Da apply.
3. Cho apply:
   - Cac dong duoc chon.
   - Tat ca dong theo filter hien tai.
   - Tat ca dong hop le.
4. Hoan thien hai mode:
   - `Update an toan`.
   - `Ghi de tu Sheet`.
5. Hien field diff truoc khi ghi de.
6. Giu field CRM-owned va local override trong mode an toan.
7. Danh dau `missing_from_source`, khong xoa profile khi dong mat khoi Sheet.
8. Hoan thien mapping cot va queue field chua map.
9. Lich su chi hien 5 run gan nhat; dropdown xem them va popup chi tiet run.
10. Luu tru/khoi phuc/xoa nguon co permission va audit.

UI bi tac dong:

- `Khach hang > Dong bo`.
- Preview snapshot, filter, checkbox chon dong, popup diff va lich su run.

Test UI:

1. Preview source `DU_LIEU_KH`, range `A1:V2700`.
2. Loc dong loi va dong hop le.
3. Apply mot dong, mot nhom dong va tat ca hop le.
4. Apply lai khong tao CustomerProfile trung.
5. Sua field CRM local, sync an toan khong ghi de.
6. Sync ghi de chi chay sau confirm va hien field diff.
7. Dong mat khoi Sheet chi bi danh dau missing.

Dieu kien hoan thanh:

- Run khong bi treo `running`.
- Snapshot va history xem lai duoc.
- Ket qua created/updated/skipped/error khop DB.

### Goi 5 - Scheduled sync hardening

Muc tieu: dong bo dinh ky chay on dinh va quan sat duoc.

Can lam:

1. Load cac source enabled khi app start.
2. Reload schedule khi tao/sua/luu tru source.
3. Lock theo source de manual va scheduled run khong chay chong.
4. Scheduled sync mac dinh chi dung `Update an toan`.
5. Luu trigger, startedAt, finishedAt, error va thong ke row.
6. Hien `Lan chay truoc`, `Lan chay tiep theo` va canh bao credential/API.
7. Them timeout va co che ket thuc run bi treo.

UI bi tac dong:

- Card nguon dong bo.
- Popup lich su sync.

Test UI:

1. Dat cron ngan trong moi truong test.
2. Xac nhan run duoc tao dung lich.
3. Bam sync tay khi scheduled run dang chay va nguoc lai.
4. Thu credential sai va Google Sheets API disabled.

Dieu kien hoan thanh:

- Khong co hai active run cung source.
- Loi van hanh hien ro tren UI, khong chi nam trong log.

### Goi 6 - Phan cong va CRM tag

Muc tieu: CustomerProfile tro thanh trung tam phan cong cong viec, nhung khong
tu cap quyen Zalo.

Can lam:

1. Them `CustomerProfileWorkAssignment`.
2. Gan owner, collaborator, watcher cho CustomerProfile.
3. Them tab `Phan cong`.
4. Queue `Chua phan cong` va `Duoc giao cho toi`.
5. Gan CRM tag cho customer/group/user canonical.
6. Tach hoan toan `CRM tag` va `Zalo native label`.
7. Native label hien theo nick; CRM tag hien theo canonical subject.
8. Them filter assignment/tag tren Khach hang, Nhom Zalo va Tin nhan.

UI bi tac dong:

- `Chi tiet khach hang > Phan cong`.
- Danh sach `Khach hang`.
- `Nhom Zalo` va bo loc `Tin nhan`.

Test UI:

1. Manager gan sale phu trach khach hang.
2. Sale xem queue `Duoc giao cho toi`.
3. User khong co account access van khong doc/chat duoc nick Zalo.
4. Sua native label khong lam thay doi CRM tag va nguoc lai.

Dieu kien hoan thanh:

- Assignment va permission la hai lop doc lap.
- CRM tag khong goi Zalo SDK.

### Goi 7 - Ban giao qua nhom chung va lifecycle

Muc tieu: hai user quan ly hai nick cung mot group co the ban giao dung duong
hop le, co audit va khong dung nick da roi nhom.

Can lam:

1. Lay candidate theo active group membership.
2. Luu `sourceZaloAccountId`, `handlingZaloAccountId`, `assignedUserId` va
   `nativeGroupId`.
3. Them selector nick xu ly khi co nhieu nick hop le.
4. Audit moi lan doi handling account.
5. Hien membership `active`, `stale`, `left`, `removed`.
6. Them queue group can review.
7. Chan gui/ban giao qua nick khong con active.

UI bi tac dong:

- Popup ban giao ArchiveStory.
- `Nhom Zalo > Chi tiet`.
- Canh bao tren `Tin nhan` khi nick xu ly khong con trong group.

Test UI:

1. Primary nick A ban giao cho primary nick B trong cung canonical group.
2. B khong can la secondary cua nick A.
3. Cho B roi group va xac nhan B khong con trong candidate.
4. Lich su cu van giu source/handling account.

Dieu kien hoan thanh:

- Khong suy dien quyen qua group khac.
- Moi lan ban giao co audit day du.

### Goi 8 - Dedup native message va backfill

Muc tieu: hai nick cung group khong luu trung mot tin native.

Can lam:

1. Test hai user luu cung mot message qua hai nick.
2. Test race condition hai request dong thoi.
3. Backfill `nativeZaloMessageId` cho du lieu cu co du thong tin.
4. Them fallback fingerprint cho du lieu cu chua native id.
5. Fingerprint chi canh bao `likely_duplicate`, khong tu dong chan.
6. Khi conflict, tra ve ArchiveStory dang giu message.

UI bi tac dong:

- Luong luu ho so tu `Tin nhan`.
- Thong bao duplicate/likely duplicate va link mo ho so da ton tai.

Test UI:

1. Luu cung tin tu hai nick cua mot group.
2. Bam luu dong thoi o hai phien.
3. Thu tin cu khong co native id.

Dieu kien hoan thanh:

- Unique native message duoc bao ve o DB.
- Khong duplicate am tham.

### Goi 9 - Chuan hoa thuat ngu va tai lieu

Muc tieu: nguoi dung khong nham CustomerProfile, Contact va ArchiveStory.

Can lam:

1. Chot ten UI:
   - `Khach hang`/`Ho so khach hang`: CustomerProfile.
   - `Lien he Zalo`: Contact/Zalo identity.
   - `Ho so luu`: ArchiveStory.
2. Chuan hoa tieng Viet co dau va sua encoding.
3. Cap nhat README, user guide va plan index.
4. Them huong dan test UI cho moi workflow chinh.

Dieu kien hoan thanh:

- Cung mot thuat ngu duoc dung thong nhat tren nav, button, popup va tai lieu.

### Thu tu thuc hien va checkpoint

Thu tu khuyen nghi:

1. Goi 1: CustomerProfile detail/local override.
2. Goi 2: Zalo va Nguoi lien he.
3. Goi 3: Ho so luu popup.
4. Goi 4: Manual Sheet sync.
5. Goi 5: Scheduled sync.
6. Goi 6: Assignment va CRM tag.
7. Goi 7: Handover va lifecycle.
8. Goi 8: Dedup/backfill.
9. Goi 9: Tai lieu va thuat ngu.

Sau moi goi:

1. Cap nhat trang thai ngay trong file plan nay.
2. Liet ke ro cac man hinh/API bi thay doi.
3. Build backend va frontend.
4. Chay test lien quan va kiem tra log runtime.
5. Restart app neu can.
6. Giao cho user checklist test UI theo du lieu that.
7. Chi chuyen sang goi tiep theo sau khi checkpoint hien tai dat.
