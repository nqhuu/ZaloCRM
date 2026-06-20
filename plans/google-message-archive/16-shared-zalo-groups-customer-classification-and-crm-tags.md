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

## 5. Xac dinh Zalo user/group la khach hang

### 5.1. Nguon su that duy nhat

Danh sach ho so khach hang duoc dong bo tu Google Sheet vao `CustomerProfile`.
Mot Zalo user/group chi duoc xac dinh la khach hang sau khi duoc gan vao mot
`CustomerProfile` da dong bo.

```text
Google Sheet
-> CustomerProfile
-> gan Zalo user hoac canonical Zalo group
-> doi tuong duoc xac dinh la khach hang
```

Khong dung CRM tag, Zalo native label, ten nhom, noi dung tin nhan, so thanh
vien hoac viec nhieu nick cung nhom de ket luan doi tuong la khach hang.

### 5.2. Cardinality da chot

```text
CustomerProfile 1 -> N canonical Zalo groups
Canonical Zalo group N -> 1 CustomerProfile
Zalo user M <-> N canonical Zalo groups
Zalo user 0..1 -> 1 CustomerProfile truc tiep trong phase nay
```

Quy tac:

- Mot group chi thuoc mot ho so khach hang dang hieu luc.
- Mot ho so khach hang co the co nhieu group.
- Mot Zalo user co the tham gia nhieu group thuoc nhieu ho so khach hang khac nhau.
- Mot Zalo user co the co ho so khach hang truc tiep cua rieng ho.
- Ho so truc tiep cua user khong bi thay doi khi user tham gia group cua mot
  khach hang khac.
- Membership trong group khong tao customer ownership truc tiep cho user.

Vi du:

```text
Zalo user Nguyen Van A
- direct CustomerProfile: Cua hang ca nhan Nguyen Van A
- member cua group G1 -> CustomerProfile: Cong ty X
- member cua group G2 -> CustomerProfile: Cong ty Y
```

Nguyen Van A van la mot Zalo identity duy nhat, nhung tham gia ba customer
contexts khac nhau.

### 5.3. Mo hinh lien ket customer

Uu tien hai bang rieng de rang buoc ro hon mot polymorphic table:

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

```text
CustomerProfileZaloUser

id
orgId
customerProfileId
zaloUserIdentityId
linkedByUserId
linkedAt
unlinkedAt nullable
source: google_sheet_assignment | manual_assignment
```

Trong phase nay, mot `zaloUserIdentityId` chi co mot direct customer link active.
Lich su link cu duoc giu bang `unlinkedAt`, khong hard delete.

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
-> dung CustomerProfileZaloUser active cua user

Hoi thoai group
-> dung CustomerProfileZaloGroup active cua canonical group
```

Trong group, khong dung direct customer profile cua nguoi gui de gan ho so. Vi
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

1. Dong bo Google Sheet va upsert CustomerProfile theo external key on dinh.
2. Hien danh sach Zalo user/group chua gan.
3. Manager tim theo globalId, ten, so dien thoai hoac group globalId.
4. Gan user/group vao CustomerProfile.
5. Backend kiem tra unique active link truoc khi luu.
6. Neu group da thuoc profile khac, bat buoc dung luong chuyen link co xac nhan.
7. Ghi audit profile cu, profile moi, nguoi thuc hien, ly do va thoi diem.

User/group chua co active customer link van la doi tuong Zalo hop le trong CRM,
nhung khong duoc tu dong coi la khach hang.

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
POST   /api/v1/customer-profiles/:id/zalo-groups
DELETE /api/v1/customer-profiles/:id/zalo-groups/:nativeGroupId
POST   /api/v1/customer-profiles/:id/zalo-users
DELETE /api/v1/customer-profiles/:id/zalo-users/:zaloUserIdentityId
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

### Phase C - Customer linking va independent CRM tag

1. Them CustomerProfileZaloGroup va CustomerProfileZaloUser.
2. Them NativeZaloGroupMember de tach membership khoi customer ownership.
3. Them ZaloUserCrmTag va NativeZaloGroupCrmTag.
4. Dung mirror native label sang CRM tag.
5. Them sync Google Sheet va queue Chua gan ho so khach hang.

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
- Mot user co direct profile rieng va tham gia group cua profile khac ma khong
  bi gop/chuyen nham customer context.
- Tin nhan 1:1 dung direct user profile; tin nhan group dung group profile.
- Ban giao giu source account va doi handling account ro rang.
- Nick roi nhom khong con la duong ban giao moi.
- Khong suy dien quyen bac cau qua nhieu nhom/user.

## 19. Ket luan nghiep vu

```text
GroupInfo.globalId          = danh tinh nhom chung
accountScopedGroupId        = dia chi goi Zalo API theo tung nick
groupGlobalId + zaloMsgId   = danh tinh tin nhan native
active CustomerProfile link = user/group co phai khach hang hay khong
group membership            = user dang tham gia customer context nao
CRM tag                     = loc workload noi bo, doc lap native label
work assignment             = ai duoc manager giao xu ly user/group
account access              = user co the doc/chat bang nick nao
```

Khong dung mot field/tag de thay the tat ca cac lop tren. Tach ro danh tinh,
customer ownership, group membership, dieu phoi cong viec va quyen truy cap
giup tranh trung/gan nham ho so ma van ho tro primary/secondary quan ly nhieu
user/group theo CRM tag mot cach de hieu.
