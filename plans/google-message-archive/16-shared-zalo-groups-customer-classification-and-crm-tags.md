# 16. Shared Zalo Groups, Customer Linking And Independent CRM Tags

## 1. Muc tieu

Chuan hoa truong hop mot hoac nhieu tai khoan Zalo native cung tham gia mot
nhom, de Zalo CRM co the:

- Nhan biet hai conversation theo hai nick thuc chat la cung mot nhom native.
- Chong luu trung cung mot tin nhan vao ho so.
- Tao quan he cong tac co pham vi giua cac user CRM dang phu trach cac nick cung nhom.
- Ban giao ho so qua nick khac dang con trong cung nhom ma nguoi nhan khong can
  la phu trach phu cua nick nguon.
- Xac dinh nhom nao la nhom khach hang/nghiep vu.
- Gan CRM tag truc tiep cho nhom chung de loc, chia viec va tao hang doi xu ly.
- Giu CRM tag hoan toan doc lap voi Zalo native label.

Plan nay mo rong quy tac tai plan 05, 10 va 12.

## 2. Ket qua da xac minh voi Zalo native

Da kiem tra truc tiep bang `zca-js 2.1.2` va hai session Zalo dang ket noi.

Nhom `Nhom 1 - Quoc Khach` duoc quan sat boi hai nick:

| Nick Zalo | account-scoped `groupId` | `globalId` |
|---|---|---|
| Quoc | `7451995173968450160` | `K6U3LRT1O2B9N8RJVJ6EACP01I7S0000` |
| Quoc Huu | `4444359956750616581` | `K6U3LRT1O2B9N8RJVJ6EACP01I7S0000` |

Ket luan:

- `groupId` khac nhau theo nick dang truy cap.
- `GroupInfo.globalId` la dinh danh chung cua nhom native.
- Khong dung `Conversation.externalThreadId` lam khoa nhom chung.
- Moi nick van can giu `groupId` rieng de goi Zalo SDK.

Tin nhan dang co trong hai conversation cua nhom tren cung tra ve mot
`zaloMsgId`. Nguoi gui, noi dung va thoi diem gui cung trung nhau.

Khoa tin nhan native de xuat:

```text
(orgId, nativeGroupGlobalId, zaloMsgId)
```

## 3. Nguyen tac kien truc

```text
Nhom Zalo native = khong gian nghiep vu chung
Tai khoan Zalo   = diem truy cap vao nhom
User CRM         = nguoi duoc phan cong xu ly
Conversation     = ban quan sat nhom qua mot tai khoan Zalo cu the
```

Khong gop/xoa cac `Conversation` theo nick. Chung van can thiet de goi API bang
dung session, gui tin bang nick duoc chon, kiem tra membership va audit nguon.
Lop nhom canonical nam phia tren cac conversation nay.

## 4. Mo hinh du lieu nhom chung

### 4.1. NativeZaloGroup

```text
NativeZaloGroup

id
orgId
globalId
name
avatarUrl
description
groupType
firstSeenAt
lastSeenAt
createdAt
updatedAt
```

Rang buoc:

```text
unique(orgId, globalId)
```

`name` va `avatarUrl` la metadata co the thay doi, khong dung lam khoa nhan dang.

### 4.2. NativeZaloGroupAccount

```text
NativeZaloGroupAccount

id
nativeGroupId
zaloAccountId
accountScopedGroupId
membershipStatus
firstSeenAt
lastConfirmedAt
leftAt
createdAt
updatedAt
```

Rang buoc:

```text
unique(zaloAccountId, accountScopedGroupId)
unique(nativeGroupId, zaloAccountId)
```

`membershipStatus` gom `active`, `stale`, `left`, `removed`, `unknown`.

### 4.3. Conversation va NativeZaloMessage

Them `Conversation.nativeGroupId nullable`, chi set khi `threadType=group`.
Conversation van giu:

```text
zaloAccountId
externalThreadId = accountScopedGroupId
```

Them:

```text
NativeZaloMessage

id
orgId
nativeGroupId
zaloMsgId
senderGlobalId nullable
sentAt
firstSeenAt
createdAt
```

Rang buoc:

```text
unique(orgId, nativeGroupId, zaloMsgId)
```

Them `Message.nativeZaloMessageId nullable`. Nhieu dong Message quan sat qua
nhieu nick co the tro toi cung mot `NativeZaloMessage`. Phase dau khong can xoa
cac Message theo nick.

## 5. Xac dinh khach hang B2B, contact va Zalo channel

### 5.0. Dinh nghia lai ranh gioi nghiep vu

Cong ty dang ban hang B2B, vi vay `Khach hang` trong CRM khong nen dong nghia
voi mot nick Zalo hoac mot `Contact`. Can tach ro ba lop:

```text
CustomerProfile = ho so khach hang/nghiep vu mua hang
Contact         = nguoi lien he thuoc ho so khach hang
Zalo user/group = kenh lien lac hoac ngu canh trao doi cua Contact/CustomerProfile
```

Voi khach hang doanh nghiep:

```text
CustomerProfile: Cong ty ABC
- Contact 1: Giam doc
- Contact 2: Ke toan
- Contact 3: Ky thuat
- Zalo group: Nhom ABC - Bao gia
- Zalo group: DA ABC - Trien khai
```

Voi khach hang ca nhan, van tao `CustomerProfile` rieng:

```text
CustomerProfile: Nguyen Van A
type: individual
primary Contact: Nguyen Van A
Zalo user: globalId cua Nguyen Van A
```

Do do `Contact` hien co trong CRM nen duoc hieu la nguoi lien he/dau moi
Zalo, con `CustomerProfile` moi la khach hang nghiep vu dung cho ho so, don
hang, bao cao va dong bo Google Sheet.

### 5.1. Nguon su that duy nhat

Danh sach ho so khach hang duoc dong bo tu Google Sheet vao `CustomerProfile`.
Google Sheet la nguon master data dang song cua phong Kinh doanh, khong phai
nguon import mot lan.

Mot Zalo user/group chi duoc xac dinh la khach hang khi duoc gan vao mot
`CustomerProfile`.

```text
Google Sheet
-> CustomerProfile
-> gan Contact / Zalo user / canonical Zalo group
-> doi tuong Zalo duoc phan loai la kenh khach hang
```

Khong dung CRM tag, Zalo native label, ten nhom, noi dung tin nhan, so thanh
vien hoac viec nhieu nick cung nhom de ket luan doi tuong la khach hang.

### 5.2. Cardinality da chot

```text
CustomerProfile 1 -> N Contacts
Contact M -> N CustomerProfiles
CustomerProfile 1 -> N canonical Zalo groups
Canonical Zalo group N -> 1 CustomerProfile active
Contact/Zalo user M <-> N canonical Zalo groups
CustomerProfile 0..1 -> 1 primary Contact
```

Quy tac:

- Mot CustomerProfile co the la doanh nghiep hoac ca nhan.
- Mot CustomerProfile doanh nghiep co nhieu Contact.
- Mot Contact co thong tin ca nhan rieng: ngay sinh, so dien thoai, email,
  chuc vu, vai tro mua hang, Zalo identity, ghi chu.
- Mot Contact co the lien quan nhieu CustomerProfile trong truong hop dac biet.
- Mot Contact co the dong thoi la nguoi lien he cua doanh nghiep A va co
  CustomerProfile ca nhan rieng cua chinh ho.
- Mot group chi thuoc mot CustomerProfile dang hieu luc.
- Mot CustomerProfile co the co nhieu group.
- Mot Zalo user co the tham gia nhieu group thuoc nhieu CustomerProfile khac nhau.
- Membership trong group khong tao customer ownership truc tiep cho user.

Vi du:

```text
Contact Nguyen Van A
- CustomerProfile ca nhan: Cua hang Nguyen Van A
- Contact role trong Cong ty X: buyer
- member cua group G1 -> CustomerProfile: Cong ty X
- member cua group G2 -> CustomerProfile: Cong ty Y
```

Nguyen Van A van la mot Contact/Zalo identity duy nhat, nhung tham gia nhieu
customer contexts khac nhau.

### 5.3. Mo hinh lien ket customer

Them bang noi Contact voi CustomerProfile:

```text
CustomerProfileContact

id
orgId
customerProfileId
contactId
role: legal_representative | decision_maker | buyer | accountant | technical | delivery | owner | staff | other
title nullable
department nullable
isPrimary
isActive
rawText nullable
source: google_sheet | manual | zalo_inference
linkedByUserId nullable
linkedAt
unlinkedAt nullable
```

Uu tien dung bang nay thay cho viec coi mot Zalo user la khach hang truc tiep.
Neu customer la ca nhan, tao `CustomerProfile.type=individual` va gan Contact do
la primary contact.

Lien ket group voi CustomerProfile:

```text
CustomerProfileZaloGroup

id
orgId
customerProfileId
nativeGroupId
linkedByUserId
linkedAt
unlinkedAt nullable
source: google_sheet_assignment | manual_assignment
```

Rang buoc nghiep vu/database:

```text
mot nativeGroupId chi co mot link active
```

Lien ket Zalo user truc tiep nen di qua Contact:

```text
CustomerProfileZaloUser

id
orgId
customerProfileId
contactId
linkedByUserId
linkedAt
unlinkedAt nullable
source: google_sheet_assignment | manual_assignment
```

Trong phase tiep theo nen doi ten/di chuyen y nghia bang nay thanh
`CustomerProfileContact` de dung B2B hon. Lich su link cu duoc giu bang
`unlinkedAt`, khong hard delete.

Membership group luu rieng:

```text
NativeZaloGroupMember

nativeGroupId
zaloUserIdentityId
membershipStatus
firstSeenAt
lastConfirmedAt
leftAt nullable
```

Bang membership khong chua `customerProfileId`, vi customer context cua member
duoc suy ra tu group khi xu ly hoi thoai group.

### 5.4. Quy tac chon customer context

```text
Hoi thoai 1:1 voi Zalo user
-> neu Contact chi gan mot CustomerProfile active thi goi y customer do
-> neu Contact co CustomerProfile ca nhan thi goi y profile ca nhan
-> neu Contact gan nhieu CustomerProfile thi UI can cho user chon

Hoi thoai group
-> dung CustomerProfileZaloGroup active cua canonical group
```

Trong group, khong dung CustomerProfile ca nhan cua nguoi gui de gan ho so. Vi
du Nguyen Van A nhan tin trong group Cong ty X thi tin do thuoc customer context
Cong ty X, khong thuoc cua hang ca nhan Nguyen Van A.

ArchiveStory can luu snapshot:

```text
customerProfileId
customerProfileCodeSnapshot
customerProfileNameSnapshot
customerContextType: direct_user | group
customerContextSubjectId
```

Nho snapshot, doi/unlink mapping sau nay khong lam sai ho so lich su.

### 5.5. Luong dong bo va gan customer

1. Dong bo Google Sheet va upsert CustomerProfile theo `Ma khach hang`.
2. Map cac legacy code nhu NVKD, bo phan, loai hinh sang bang CRM noi bo.
3. Hien danh sach CustomerProfile tu sheet.
4. Tu CustomerProfile, gan Contacts va canonical Zalo groups lien quan.
5. Hien danh sach Zalo user/group chua gan de manager xu ly.
6. Manager tim theo ma khach hang, ten, so dien thoai, globalId, group globalId.
7. Gan Contact/user/group vao CustomerProfile.
8. Backend kiem tra unique active group link truoc khi luu.
9. Neu group da thuoc profile khac, bat buoc dung luong chuyen link co xac nhan.
10. Ghi audit profile cu, profile moi, nguoi thuc hien, ly do va thoi diem.

User/group chua co active customer link van la doi tuong Zalo hop le trong CRM,
nhung khong duoc tu dong coi la khach hang.

### 5.6. Du lieu Google Sheet khach hang B2B

Bang khach hang hien tai cua phong Kinh doanh co dang master data cap doanh
nghiep. Mot dong sheet la mot CustomerProfile.

Mapping de xuat:

| Cot Google Sheet | Field CRM |
|---|---|
| Ma khach hang | `CustomerProfile.externalKey` / `code` |
| Ten khach hang | `CustomerProfile.name` |
| Ten viet tat | `CustomerProfile.shortName` / aliases |
| Dia phuong | `CustomerProfile.provinceOrRegion` |
| Van phong giao dich | `CustomerProfile.officeAddress` |
| MST/DT | `taxCode` hoac `mainPhone`, can rule tach |
| Dai dien phap luat | `legalRepresentativeRaw`, co the tao Contact role `legal_representative` |
| Ngay hoat dong | `activeSince` / `establishedDate` |
| Dia chi giao/nhan hang | `shippingAddress` |
| Web | `website` |
| Nguoi lien he | raw contact hint, dung de goi y/tao Contact |
| Bo phan quan ly | `managingDepartmentCodeSnapshot` va map sang Department |
| NVKD phu trach | `salesOwnerCodeSnapshot` va map sang User |
| Loai hinh | `customerTypeCodeSnapshot` va map sang CustomerType |
| Ngay giao dich dau tien | `firstTransactionDate` |

De xuat mo rong `CustomerProfile`:

```text
CustomerProfile

id
orgId
externalKey              // Ma khach hang tu sheet
code                     // ma hien thi, co the trung externalKey
name
shortName nullable
type: business | individual
taxCode nullable
mainPhone nullable
website nullable
provinceOrRegion nullable
officeAddress nullable
shippingAddress nullable
legalRepresentativeRaw nullable
activeSince nullable
firstTransactionDate nullable

ownerUserId nullable
salesOwnerCodeSnapshot nullable
managingDepartmentId nullable
managingDepartmentCodeSnapshot nullable
customerTypeId nullable
customerTypeCodeSnapshot nullable

source: google_sheet | manual
metadata
syncedAt nullable
missingFromSource Boolean
sourceMissingSince nullable
```

Khong xoa CustomerProfile khi row bien mat khoi sheet. Chi danh dau
`missingFromSource=true` de admin review, vi sheet co the bi xoa nham.

### 5.7. Legacy code tu Google Sheet

`DA01`, `BPKD`, `LDL0`, `LDVN` la ma nghiep vu legacy do phong Kinh doanh dang
dung trong Google Sheet. Chung khong phai ID noi bo cua CRM va khong nen dung
lam primary key.

CRM can luu ca ID noi bo va code snapshot:

```text
User.id                 = UUID noi bo CRM
User.legacyEmployeeCode = DA01

Department.id                   = UUID noi bo CRM
Department.legacyDepartmentCode = BPKD

CustomerType.id   = UUID noi bo CRM
CustomerType.code = LDL0 / LDVN
```

Khi dong bo sheet:

```text
NVKD phu trach = DA01
-> tim User.legacyEmployeeCode = DA01
-> neu co: CustomerProfile.ownerUserId = User.id
-> luon luu salesOwnerCodeSnapshot = DA01

Bo phan quan ly = BPKD
-> tim Department.legacyDepartmentCode = BPKD
-> neu co: CustomerProfile.managingDepartmentId = Department.id
-> luon luu managingDepartmentCodeSnapshot = BPKD

Loai hinh = LDL0
-> tim CustomerType.code = LDL0
-> neu co: CustomerProfile.customerTypeId = CustomerType.id
-> luon luu customerTypeCodeSnapshot = LDL0
```

Neu chua map duoc code, van import CustomerProfile nhung can hien canh bao
`unmappedSalesCode`, `unmappedDepartmentCode`, `unmappedCustomerTypeCode`.
Admin co the vao man mapping de gan code voi User/Department/CustomerType, sau
do chay lai reconcile.

### 5.8. Workflow dong bo Google Sheet

Google Sheet la nguon master data song, nen can ho tro ca dong bo thu cong va
dinh ky. Hai cach chay dung chung mot engine:

```text
runCustomerSheetSync(sourceId, triggerType: manual | scheduled)
```

Bang cau hinh nguon:

```text
CustomerDataSource

id
orgId
name
dataType: customer_master | order_report | sales_report | receivable_report | other
provider: google_sheet
spreadsheetId
sheetName
range nullable
headerRow
enabled
syncMode: manual | scheduled
scheduleCron nullable
lastSyncedAt nullable
lastSyncStatus nullable
lastSyncError nullable
createdByUserId
createdAt
updatedAt
```

Bang mapping cot:

```text
CustomerDataSourceColumnMap

id
sourceId
targetField
sourceHeader
transformRule nullable
required
```

Bang log moi lan sync:

```text
CustomerSyncRun

id
sourceId
startedAt
finishedAt nullable
triggerType: manual | scheduled
status: running | success | partial | failed
totalRows
createdCount
updatedCount
skippedCount
errorCount
```

Bang loi tung dong:

```text
CustomerSyncRowError

id
runId
rowNumber
externalKey nullable
errorType
message
rawRow
```

UI de xuat:

- Man `Nguon khach hang`: cau hinh spreadsheet, sheet, range, lich sync.
- Man mapping cot: auto-detect theo header tieng Viet, cho sua thu cong.
- Preview 5-20 dong dau truoc khi sync.
- Nut `Dong bo ngay`.
- Lich su sync: so dong tao/cap nhat/bo qua/loi.
- Bo loc `ma chua map`: NVKD, bo phan, loai hinh.

Trong giai doan dau chi xu ly `dataType=customer_master`. Cac sheet bao cao
doanh so, don hang, cong no se dung engine nguon du lieu tuong tu nhung map vao
bang nghiep vu khac.

## 6. CRM tag doc lap voi Zalo native label

### 6.1. Nguyen tac chot

| Thuoc tinh | Zalo native label | CRM tag |
|---|---|---|
| Noi tao | Zalo native | Zalo CRM |
| Pham vi | Tung nick Zalo | To chuc, gan cho canonical user/group |
| Dinh danh | `(zaloAccountId, zaloLabelId)` | `crmTagId` |
| Dong bo SDK | Co | Khong |
| Doi ten | Theo Zalo | Theo CRM |
| Muc dich | To chuc inbox native | Loc workload da duoc quan ly phan cong |

Quy tac bat buoc:

- Khong tao CRM tag khi sync Zalo native label.
- Khong day CRM tag nguoc len Zalo native.
- Khong gan/xoa CRM tag khi user doi native label.
- Hai tag trung ten van la hai doi tuong khac nguon.
- UI hien hai khu vuc rieng va source ro rang.

### 6.2. Hien trang can tach

Code hien tai co mirror native label vao CRM tag qua:

```text
CrmTag.managedBy = zalo_sync
CrmTag.sourceZaloLabelId
CrmTagGroup.zaloAccountId
Friend.crmTagsPerNick
```

Can migration an toan:

1. Dung tao/cap nhat CrmTag khi sync native label.
2. Giu ZaloLabel va mapping native nhu cu.
3. Danh dau `CrmTag managedBy=zalo_sync` la legacy.
4. Khong xoa ngay de tranh mat saved filter/bao cao cu.
5. Cho Admin preview va chon chuyen thanh CRM tag doc lap, chi giu native label,
   hoac archive tag legacy.
6. Bo logic/cot legacy sau giai doan compatibility.

## 7. Gan CRM tag cho canonical Zalo user/group

CRM tag chi phuc vu viec loc workload da duoc manager phan cong cho primary hoac
secondary. CRM tag khong xac dinh khach hang va khong thay the customer link.

Khong gan tag vao tung Conversation theo nick. Tag phai gan vao canonical
identity de khong bi lap/lech khi cung user/group xuat hien qua nhieu nick.

Dung hai relation rieng de co foreign key ro rang:

```text
ZaloUserCrmTag

id
orgId
zaloUserIdentityId
crmTagId
assignedByUserId
assignedAt
```

```text
NativeZaloGroupCrmTag

id
orgId
nativeGroupId
crmTagId
assignedByUserId
assignedAt
```

Rang buoc:

```text
unique(zaloUserIdentityId, crmTagId)
unique(nativeGroupId, crmTagId)
```

Vi du CRM tag workload:

- `Phu 1 - An`.
- `Phu 2 - Binh`.
- `Ca sang`.
- `Can xu ly hom nay`.
- `Hang doi bao gia`.
- `Hang doi cong no`.

Gan tag cho group qua nick A phai hien khi xem cung group qua nick B. Gan tag
cho Zalo user qua mot nick phai hien tren canonical user khi xem qua nick khac.

## 8. Phan cong primary/secondary cho Zalo user/group

### 8.1. Tag khong phai ACL

User chi doc/chat duoc doi tuong khi co account access hop le. Gan tag hoac gan
workload khong tu dong cap quyen tren nick Zalo.

Voi group chung, user chi can co quyen tren it nhat mot account membership
active cua group. UI phai chi cho phep chon nick gui ma user co `chat/admin`.

### 8.2. Hai cap phan cong

Giu phan cong tai khoan hien tai:

```text
ZaloAccountAccess.assignmentRole
- primary
- secondary_1
- secondary_2
- secondary_n
```

Them phan cong workload theo canonical subject:

```text
ZaloSubjectWorkAssignment

id
orgId
subjectType: user | group
zaloUserIdentityId nullable
nativeGroupId nullable
assignedUserId
crmTagId nullable
role: owner | collaborator | watcher
assignedByUserId
validFrom nullable
validUntil nullable
createdAt
updatedAt
```

Bat buoc dung mot trong `zaloUserIdentityId` hoac `nativeGroupId` theo
`subjectType`. Unique active theo `subject + assignedUserId + role`.

`crmTagId` la nhan queue de user loc nhanh; assignment moi la nguon su that ai
duoc manager giao xu ly.

Mot user co the la secondary cua nick nhung la `owner` workload cua mot so
Zalo user/group cu the. Mot subject cung co the co mot owner va nhieu
collaborator neu nghiep vu can phoi hop.

### 8.3. Quy tac mac dinh

- Primary cua account thay tat ca subject trong scope account theo permission.
- Secondary co the thay theo permission, nhung default view uu tien workload
  duoc gan cho minh.
- Nhom/user chua co assignment vao queue `Chua phan cong` cua primary/manager.
- Manager chon owner/collaborator va CRM tag workload.
- Tag chi giup loc, khong an/xoa du lieu ngoai permission scope.
- Neu group co nhieu account, chi tao mot assignment tren canonical group.

## 9. Luong manager phan cong bang CRM tag

1. Manager chon mot hoac nhieu canonical Zalo user/group.
2. Chon primary/secondary nhan xu ly.
3. Chon hoac tao CRM tag workload.
4. Backend tao `ZaloSubjectWorkAssignment` va gan tag cho subject.
5. User nhan thay queue/tag tren default filter `Duoc giao cho toi`.
6. Khi ket thuc phan cong, dong assignment bang thoi gian/audit; khong hard delete.

Quy tac:

- Manager chi phan cong trong account/department scope minh quan ly.
- Nguoi nhan phai active va co quyen account phu hop.
- Cung mot tag co the duoc giao cho nhieu secondary neu day la shared queue.
- Cung mot subject co the co nhieu tag de phuc vu nhieu bo loc.
- Go tag khong am tham huy assignment.
- Huy assignment khong xoa tag neu tag con duoc assignment/manager khac su dung.
- Khong co automation tu CRM tag sang customer status.

## 10. Bo loc va trai nghiem lam viec

Filter de xuat trong man Tin nhan/Nhom:

- Trang thai customer link: da gan ho so khach hang, chua gan.
- CustomerProfile: ma/ten ho so khach hang cu the.
- CRM tag theo ID, OR/AND.
- Native label o section rieng va theo tung nick.
- Nguoi xu ly: toi, chua phan cong, user cu the.
- Vai tro cua toi: owner, collaborator, watcher.
- Nick co the gui.
- Nhom chung co tu hai nick CRM tro len.
- Membership stale/da roi nhom.
- Co ho so dang mo/chua co ho so.

User co the luu saved view, vi du:

- `Nhom khach hang cua toi`.
- `Du an A - can bao gia`.
- `Nhom chung Quoc + Quoc Huu`.
- `Chua phan cong`.
- `Chua gan ho so khach hang`.

Saved view chi luu filter, khong thay doi permission/assignment.

Che do unified hien moi NativeZaloGroup mot dong, cac nick active, owner,
collaborator va CRM tag. Khi gui tin, user chon nick minh co quyen chat. Van giu
che do theo nick de van hanh session/debug.

Chi tiet canonical Zalo user hien rieng:

- CustomerProfile truc tiep cua user, neu co.
- Cac group user dang tham gia.
- CustomerProfile cua tung group.
- Work assignments va CRM tags cua user.

Khong gop cac CustomerProfile chi vi chung mot Zalo user xuat hien trong nhieu
customer contexts.

## 11. Luu ho so va chong trung

Preflight archive hien tai so sanh `ArchiveMessage.sourceMessageId`, la UUID cua
tung dong Message. No khong phat hien cung tin native sync qua hai nick.

Can doi preflight theo `nativeZaloMessageId`:

- Da nam trong chinh ho so: bo qua.
- Da nam trong ho so khac: tra conflict va ho so dang giu.
- Hai user luu dong thoi: transaction/unique guard ngan race.
- Cho phep luu vao hai ho so chi khi co permission, ly do va audit.

Neu du lieu cu chua co native ID, co the tao fingerprint tu group globalId,
sender, normalized content/attachment va sentAt bucket. Ket qua nay chi la
`likely_duplicate`, khong tu dong chan.

## 12. Cong tac va ban giao xuyen nick

Neu nick A va B cung active trong nhom G:

```text
Primary(A) va Primary(B) la collaborator eligibility trong G
```

Day khong phai quan he toan cuc va khong bien ho thanh secondary cua nick kia.

Nguoi nhan ban giao hop le khi:

- Ho so phat sinh tu canonical group G.
- Group co `CustomerProfileZaloGroup` active.
- Nick cua nguoi nhan con membership active trong G.
- Nguoi nhan co `chat/admin` tren nick cua chinh ho.
- Nguoi nhan active va trong scope phong ban hop le.

Khi ban giao:

```text
sourceZaloAccountId   = nick goc, khong doi
handlingZaloAccountId = nick cua nguoi nhan
assignedUserId        = nguoi nhan
nativeGroupId         = giu nguyen
```

Khong can gan nguoi nhan thanh secondary cua source account.

Neu hai nick cung nhieu nhom, quan he van theo tung nhom. Khong suy dien bac cau
tu A chung G1 voi B va B chung G2 voi C thanh A co quyen G2.

## 13. Vong doi va tinh huong bien

- Nick roi nhom: ngung quyen/ban giao moi qua nick do, giu lich su.
- Nick mat ket noi: membership `stale`, chua ket luan da roi nhom.
- Nhom doi ten/avatar: cap nhat metadata, khong doi identity.
- Primary doi: khong am tham doi group owner da gan manual.
- Assignment source `account_primary_default` duoc dua vao queue review khi
  primary doi.
- Mot user quan ly ca hai nick: chi chon handling nick, khong can tu ban giao.
- Chuyen group sang CustomerProfile khac: ho so cu giu customer snapshot, ho so
  moi dung link active moi.
- Unlink group khoi CustomerProfile: khong xoa ho so cu; canh bao/chan tao ho so
  customer moi cho toi khi group duoc gan lai.
- Direct customer link cua user khong anh huong customer context cua cac group
  ma user dang tham gia.
- Cung globalId o hai org CRM van tach boi `orgId`.
- User match tag nhung khong co account access khong duoc doc/chat.

## 14. API va UI de xuat

API chinh:

```http
GET   /api/v1/native-zalo-groups
GET   /api/v1/native-zalo-groups/:id
POST  /api/v1/native-zalo-groups/:id/tags
DELETE /api/v1/native-zalo-groups/:id/tags/:tagId
POST  /api/v1/native-zalo-groups/:id/assignments
PATCH /api/v1/native-zalo-groups/:id/assignments/:assignmentId
DELETE /api/v1/native-zalo-groups/:id/assignments/:assignmentId
POST  /api/v1/native-zalo-groups/sync

GET    /api/v1/customer-profiles
POST   /api/v1/customer-profiles/sync-google-sheet
GET    /api/v1/customer-data-sources
POST   /api/v1/customer-data-sources
PATCH  /api/v1/customer-data-sources/:id
POST   /api/v1/customer-data-sources/:id/sync
GET    /api/v1/customer-data-sources/:id/sync-runs
GET    /api/v1/customer-sync-runs/:id/errors
GET    /api/v1/customer-types
POST   /api/v1/customer-types
PATCH  /api/v1/customer-types/:id
POST   /api/v1/customer-profiles/:id/zalo-groups
DELETE /api/v1/customer-profiles/:id/zalo-groups/:nativeGroupId
POST   /api/v1/customer-profiles/:id/contacts
PATCH  /api/v1/customer-profiles/:id/contacts/:contactId
DELETE /api/v1/customer-profiles/:id/contacts/:contactId
POST   /api/v1/customer-profiles/:id/zalo-users
DELETE /api/v1/customer-profiles/:id/zalo-users/:contactId
```

Filter query:

```text
customerLinkStatus=linked|unlinked
customerProfileId=
crmTagIds=
crmTagMode=or|and
assignedUserId=
myGroupRole=
zaloAccountIds=
sharedOnly=
membershipStatus=
hasOpenArchive=
```

Backend tinh `accessibleAccountIds` truoc, sau do moi loc nhom/tag.

Moi dong nhom tren UI hien ten/avatar, CustomerProfile dang lien ket, CRM tag,
cac nick dang tham gia, owner/collaborator, so ho so mo va membership status.

Filter phai tach ro:

```text
CRM tag
- Phu 1 - An
- Ca sang
- Hang doi bao gia

Nhan Zalo native
Quoc
- Cong viec
- Du an

Quoc Huu
- Quan trong
```

Dialog phan cong cho phep chon CustomerProfile, CRM tags workload, owner,
collaborators va ly do trong mot lan luu. CustomerProfile va CRM tag van la hai
quan he rieng duoc ghi trong cung transaction.

Man CustomerProfile de xuat:

- Tab `Tong quan`: master data tu Google Sheet, ma khach hang, loai hinh, sale,
  bo phan, dia chi, MST, ngay giao dich dau tien.
- Tab `Nguoi lien he`: Contact thuoc khach hang, vai tro, chuc vu, sinh nhat,
  Zalo identity, so dien thoai, email.
- Tab `Zalo`: canonical groups va Zalo users/contacts da gan.
- Tab `Ho so luu`: ArchiveStory theo customer context.
- Tab `Don hang`: de phase sau lien ket order/report sheet.
- Tab `Phan cong`: owner/collaborator/watcher theo customer hoac subject Zalo.

Man `Contacts` hien tai nen duoc hieu la `Lien he Zalo`. Neu giu ten UI
`Khach hang` trong giai doan chuyen tiep, can them tab/nhan de phan biet:

```text
Khach hang doanh nghiep / Ho so khach hang = CustomerProfile
Lien he / Zalo user                       = Contact
```

## 15. Audit va bao cao

Audit bat buoc cho:

- Phat hien/merge nhom canonical.
- Gan/unlink/chuyen CustomerProfile cua Zalo user/group.
- Gan/go CRM tag.
- Gan/go owner/collaborator.
- Manager tao/dong workload assignment.
- Doi handling account khi ban giao.
- Xac nhan luu trung native message.
- Membership roi nhom/stale/active lai.

Bao cao tach ro:

- Nguon hoi thoai: `sourceZaloAccountId`.
- Nick dang xu ly: `handlingZaloAccountId`.
- Nguoi chiu trach nhiem: `assignedUserId`.
- Phong ban nguon va phong ban xu ly.
- CustomerProfile va CRM tag snapshot luc tao ho so.

## 16. Migration va backfill

### 16.1. Backfill nhom va tin nhan

1. Lay conversation `threadType=group`.
2. Theo tung account active, goi `getGroupInfo(accountScopedGroupId)`.
3. Upsert NativeZaloGroup bang globalId.
4. Upsert NativeZaloGroupAccount va gan Conversation.nativeGroupId.
5. Khong resolve duoc thi retry; khong doan bang ten.
6. Gom Message theo `(nativeGroupId, zaloMsgId)`.
7. Upsert NativeZaloMessage va gan Message.nativeZaloMessageId.
8. Bao cao archive conflicts cu, khong tu xoa ho so/ArchiveMessage.

### 16.2. Tach CRM tag va native label

1. Thong ke CrmTag `managedBy=zalo_sync` va noi tham chieu.
2. Dung runtime mirror moi.
3. Admin xu ly tag legacy.
4. Filter native dung token `(zaloAccountId, zaloLabelId)`.
5. Group CRM tag dung relation theo `crmTagId`.
6. Het compatibility moi drop logic/cot legacy.

## 17. Thu tu trien khai

### Phase A - Canonical identity

1. Them NativeZaloGroup va NativeZaloGroupAccount.
2. Luu GroupInfo.globalId trong sync/listener/backfill.
3. Gan conversation vao canonical group.
4. Them job xac minh membership.

### Phase B - Native message dedup

1. Them NativeZaloMessage va lien ket Message.
2. Backfill theo `(nativeGroupId, zaloMsgId)`.
3. Doi archive preflight sang native identity.
4. Test hai user luu dong thoi.

### Phase C - Customer master data, contact linking va independent CRM tag

1. Mo rong CustomerProfile theo huong B2B account: type, shortName, taxCode,
   legacy code snapshots, ownerUserId, managingDepartmentId, customerTypeId.
2. Them CustomerProfileContact de mot khach hang co nhieu nguoi lien he.
3. Them CustomerType va legacy code mapping cho User/Department/CustomerType.
4. Them CustomerDataSource, ColumnMap, SyncRun va RowError.
5. Them sync Google Sheet thu cong va dinh ky cho `customer_master`.
6. Them CustomerProfileZaloGroup va giai doan chuyen tiep CustomerProfileZaloUser
   theo `contactId`.
7. Them NativeZaloGroupMember de tach membership khoi customer ownership.
8. Them ZaloUserCrmTag va NativeZaloGroupCrmTag.
9. Dung mirror native label sang CRM tag.
10. Them queue Chua gan ho so khach hang va queue ma legacy chua map.

### Phase D - Work assignment

1. Them ZaloSubjectWorkAssignment.
2. Them owner/collaborator/watcher UI.
3. Them saved views va queue Chua phan cong.
4. Them luong manager gan CRM tag workload khi phan cong.

### Phase E - Handover va unified inbox

1. Them `handlingZaloAccountId` cho ho so.
2. Mo candidate qua account cung canonical group.
3. Them selector nick gui.
4. Them audit/bao cao source vs handling.

## 18. Tieu chi nghiem thu

- Google Sheet customer master upsert CustomerProfile theo `Ma khach hang`, khong
  tao trung khi sync lai.
- Dong bo co the chay thu cong va dinh ky bang cung sync engine.
- Moi lan sync co SyncRun, so dong tao/cap nhat/bo qua/loi va row error.
- Row mat khoi sheet khong bi xoa khoi CRM, chi danh dau missingFromSource.
- `DA01`, `BPKD`, `LDL0/LDVN` duoc luu snapshot va map sang User/Department/
  CustomerType neu co legacy code tuong ung.
- Code legacy chua map khong chan import CustomerProfile, nhung phai hien canh bao.
- Mot CustomerProfile doanh nghiep co nhieu Contact voi vai tro/chuc vu rieng.
- Mot Contact co the thuoc nhieu CustomerProfile va co the co CustomerProfile ca
  nhan rieng.
- Hai nick co groupId khac va globalId giong chi tao mot NativeZaloGroup.
- Moi nick goi API bang accountScopedGroupId cua minh.
- Cung zaloMsgId trong nhom chung la cung native message.
- Hai user luu cung tin qua hai nick khong duplicate am tham.
- CRM tag gan qua nick A hien khi xem nhom qua nick B.
- Doi native label khong tao/sua/xoa CRM tag.
- Doi CRM tag khong goi Zalo SDK.
- Duoc gan workload/tag nhung khong co account access thi khong doc/chat duoc.
- Primary/secondary loc nhom theo CRM tag va assignment.
- Mot group khong co hai active CustomerProfile link.
- Mot Contact co profile ca nhan rieng va tham gia group cua CustomerProfile
  doanh nghiep khac ma khong bi gop/chuyen nham customer context.
- Tin nhan 1:1 goi y CustomerProfile theo Contact mapping; tin nhan group dung
  group profile.
- Ban giao giu source account va doi handling account ro rang.
- Nick roi nhom khong con la duong ban giao moi.
- Khong suy dien quyen bac cau qua nhieu nhom/user.

## 19. Ket luan nghiep vu

```text
CustomerProfile            = ho so khach hang nghiep vu/account B2B
Contact                    = nguoi lien he, co thong tin ca nhan va Zalo identity
CustomerProfileContact     = quan he Contact thuoc khach hang nao, vai tro gi
Google Sheet customer row  = nguon master data tao/cap nhat CustomerProfile
legacy business code       = ma doi soat sheet, khong phai ID noi bo CRM
GroupInfo.globalId          = danh tinh nhom chung
accountScopedGroupId        = dia chi goi Zalo API theo tung nick
groupGlobalId + zaloMsgId   = danh tinh tin nhan native
active CustomerProfile link = group/contact/Zalo channel dang thuoc khach hang nao
group membership            = user dang tham gia customer context nao
CRM tag                     = loc workload noi bo, doc lap native label
work assignment             = ai duoc manager giao xu ly user/group
account access              = user co the doc/chat bang nick nao
```

Khong dung mot field/tag de thay the tat ca cac lop tren. Tach ro ho so khach
hang, nguoi lien he, danh tinh Zalo, customer ownership, group membership, dieu
phoi cong viec va quyen truy cap giup tranh trung/gan nham ho so ma van ho tro
primary/secondary quan ly nhieu user/group theo CRM tag mot cach de hieu.
