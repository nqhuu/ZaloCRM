# Phase 9 - De xuat nang cap tim kiem khach hang, bao toan ho so va tu dong dong bo

> Tai lieu nay la dac ta de duyet truoc khi sua code.
> Pham vi gom ba nhom: tim kiem khach hang/nhom co goi y, giu ho so khi xoa
> tai khoan Zalo, va tu dong dua tin tra loi vao ho so lien quan.

## 1. Muc tieu

1. O tim kiem khach hang cho phep go ten, so dien thoai hoac ten nhom va hien
   goi y cac user/group dang co trong pham vi duoc phep.
2. Ket qua goi y va ket qua loc khong lam lo du lieu cua tai khoan Zalo ma user
   khong co quyen truy cap.
3. Xoa tai khoan Zalo khong duoc xoa ho so, message snapshot, media, lich su
   trang thai hoac ket qua xu ly da luu.
4. Ho so phai hien canh bao ro rang khi tai khoan Zalo nguon da bi xoa/ngung
   hoat dong.
5. Khi nhan vien tra loi mot tin nhan dang co trong ho so, tin tra loi moi duoc
   tu dong snapshot vao dung ho so.

## 2. Hien trang ky thuat can xu ly

Schema hien tai co cac quan he nguy hiem:

```text
ArchiveStory.zaloAccount -> ZaloAccount (onDelete: Cascade)
Conversation.zaloAccount -> ZaloAccount (onDelete: Cascade)
ArchiveStory.conversation -> Conversation (onDelete: Cascade)
```

Route xoa tai khoan hien tai dang goi:

```text
prisma.zaloAccount.delete(...)
```

Neu tiep tuc xoa vat ly, database co the cascade xoa conversation va
`ArchiveStory`. Yeu cau moi bat buoc phai thay doi lifecycle tai khoan Zalo
truoc khi bo sung giao dien.

## 3. Tim kiem khach hang va nhom co goi y

### 3.1. Giao dien

Trong bo loc Ho so, them o:

```text
Khach hang / nhom / SDT
```

Khi user nhap tu 2 ky tu:

- debounce 250-350 ms;
- hien toi da 10 goi y;
- chia nhom ket qua `Ca nhan` va `Nhom`;
- moi ket qua hien avatar, ten, SDT neu co, loai conversation va tai khoan Zalo;
- co loading, empty state va nut xoa lua chon;
- chon goi y se loc bang `conversationId`, khong chi loc bang chuoi ten;
- van cho phep Enter de tim full-text neu khong chon goi y.

Vi du:

```text
Ca nhan
  Quoc Huu
  84985385157
  Tai khoan Zalo: Quoc

Nhom
  Nhom Don hang mien Bac
  18 thanh vien
  Tai khoan Zalo: Quoc
```

### 3.2. Nguon du lieu

Goi y lay tu `Conversation` va snapshot trong `ArchiveStory`, khong goi truc
tiep Zalo SDK cho moi lan go phim.

Thu tu uu tien:

1. conversation dang co ho so trong pham vi;
2. conversation user co quyen truy cap qua tai khoan Zalo;
3. khop chinh xac ten/SDT;
4. khop prefix;
5. khop contains.

### 3.3. Pham vi tim kiem

Ket qua cuoi cung la giao cua hai pham vi:

```text
Pham vi ho so RBAC
AND
Pham vi tai khoan Zalo duoc truy cap
```

Quy tac mac dinh:

| Doi tuong | Pham vi goi y |
|---|---|
| Owner/Admin | Tat ca conversation trong organization |
| User la owner tai khoan Zalo | Conversation cua tai khoan do |
| User duoc cap quyen Manage/Chat | Conversation cua tai khoan duoc cap |
| User khong co quyen tai khoan | Khong tra ve goi y cua tai khoan do |

`archive.view_all` chi mo rong pham vi ho so/phong ban, khong mac nhien bo qua
quyen truy cap tai khoan Zalo.

Neu can cho mot nhom quyen xem tat ca conversation, bo sung grant rieng:

```text
archive.customer_search_all
```

Grant nay van chi co tac dung trong organization hien tai.

### 3.4. API de xuat

```http
GET /api/v1/archive/filter-options/conversations
  ?q=quoc
  &limit=10
  &departmentId=...
  &zaloAccountId=...
```

Response:

```json
{
  "items": [
    {
      "conversationId": "uuid",
      "type": "user",
      "name": "Quoc Huu",
      "phone": "84985385157",
      "avatarUrl": "https://...",
      "zaloAccount": {
        "id": "uuid",
        "displayName": "Quoc",
        "deleted": false
      }
    },
    {
      "conversationId": "uuid",
      "type": "group",
      "name": "Nhom Don hang mien Bac",
      "memberCount": 18,
      "zaloAccount": {
        "id": "uuid",
        "displayName": "Quoc",
        "deleted": false
      }
    }
  ]
}
```

API danh sach ho so bo sung:

```text
conversationId
zaloAccountId
customerQ (fallback full-text)
```

Backend luon tu tinh scope, khong tin danh sach account ID do frontend gui.

## 4. Bao toan ho so khi xoa tai khoan Zalo

### 4.1. Nguyen tac

Xoa tai khoan Zalo trong giao dien phai duoc hieu la:

```text
ngung ket noi + vo hieu hoa tai khoan
```

Khong duoc xoa:

- `ArchiveStory`;
- `ArchiveMessage`;
- `ArchiveMedia`;
- `ArchiveRecallEvent`;
- `ArchiveStatusHistory`;
- `ArchiveNotification`;
- snapshot ten tai khoan, khach hang va conversation.

### 4.2. Phuong an du lieu khuyen nghi

Dung soft delete cho `ZaloAccount`:

```text
deletedAt        DateTime?
deletedByUserId  String?
deletionReason   String?
status           "deleted"
```

Route DELETE thuc hien transaction:

1. disconnect khoi Zalo pool;
2. xoa/vo hieu hoa session va token nhay cam;
3. set `deletedAt`, `deletedByUserId`, `status=deleted`;
4. vo hieu hoa automation va access lien quan;
5. giu record account de cac FK va audit van ton tai.

Khong goi `prisma.zaloAccount.delete()` trong luong thong thuong.

### 4.3. Snapshot tren ho so

Bo sung snapshot de ho so doc lap voi du lieu song:

```text
ArchiveStory.zaloAccountDisplayNameSnapshot
ArchiveStory.zaloAccountUidSnapshot
ArchiveStory.zaloAccountDeletedAt
ArchiveStory.conversationName          (da co)
ArchiveStory.contactPhone              (da co)
```

UI uu tien ten account song; neu account da xoa thi dung snapshot.

### 4.4. Hien thi

Danh sach va Kanban:

```text
Tai khoan Zalo da bi xoa
```

Hien bang icon canh bao mau cam/xam, tooltip:

```text
Tai khoan Zalo "Quoc" da bi xoa luc 09:30 14/06/2026.
Ho so va noi dung da luu van duoc bao toan.
```

Chi tiet ho so:

- badge `Tai khoan Zalo da xoa`;
- ten/UID snapshot;
- thoi gian xoa;
- nguoi xoa neu co quyen xem audit;
- cac thao tac title, assignment, status, ket qua, loai message van hoat dong;
- an/disable thao tac gui tin, retry sync Zalo hoac bo sung message tu tai
  khoan da xoa;
- Google backup van cho phep neu destination con hop le.

### 4.5. Migration

1. Them cot soft delete va snapshot.
2. Backfill snapshot tu `ZaloAccount` cho tat ca `ArchiveStory`.
3. Doi luong DELETE thanh soft delete.
4. Khong doi `onDelete` sang `SetNull` neu chua lam `zaloAccountId` nullable.
5. Sau khi soft delete on dinh, co the them job purge session/blob nhay cam,
   nhung khong purge record account dang duoc ho so tham chieu.
6. Kiem tra database staging de dam bao khong co cascade xoa ho so.

## 5. Tu dong dong bo tin tra loi vao ho so

### 5.1. Quy tac nghiep vu

Mot tin tra loi duoc tu dong them vao ho so khi:

1. tin moi da ghi thanh cong vao bang `Message`;
2. tin co `quote/reply` tham chieu mot source message;
3. source message da co `ArchiveMessage` trong ho so;
4. actor co quyen cap nhat ho so;
5. tin moi chua co trong ho so do.

Snapshot phai ghi:

- noi dung/media;
- ten tai khoan Zalo gui;
- `repliedByUserId`;
- ten/email user ung dung;
- thoi gian gui;
- quote snapshot;
- trang thai backup.

### 5.2. Truong hop tra loi

#### Tra loi tu popup chi tiet ho so

Neu UI sau nay cho phep tra loi ngay trong popup:

- target story da xac dinh;
- tin gui thanh cong se append vao story do;
- khong can hoi lai.

#### Tra loi trong man Tin nhan

Neu user quote mot tin dang nam trong dung mot ho so:

- append tin tra loi vao ho so do;
- toast: `Da dong bo tin tra loi vao ho so "..."`.

#### Source message nam trong nhieu ho so

Khong duoc tu dong gan ngau nhien.

Thu tu xac dinh:

1. neu thao tac bat dau tu chi tiet ho so, dung story hien tai;
2. neu chi co mot story `pending` ma user phu trach, dung story do;
3. neu van con nhieu story, hien chon `Dong bo vao ho so nao?` truoc khi gui;
4. khong mac dinh append vao tat ca story.

Lua chon cua user khong lam can tro gui Zalo neu API archive loi. Tin van gui,
sau do hien canh bao va cho phep retry dong bo ho so.

### 5.3. Tin khach hang gui tiep sau khi da luu

Yeu cau hien tai chi chac chan cho truong hop `tra loi mot tin nhan co trong ho
so`. Khong mac dinh tu dong luu moi tin tiep theo cua conversation vi mot
conversation co the co nhieu ho so.

Co the bo sung tuy chon tren tung ho so:

```text
autoSyncMode:
  off
  replies_only
  conversation_until_completed
```

Mac dinh de xuat:

```text
replies_only
```

`conversation_until_completed` chi dong bo khi story `pending`, va phai duoc
user bat chu dong.

### 5.4. Kien truc xu ly

Khong chen logic rieng vao tung route gui text/image/file.

Tao service dung chung:

```text
archiveReplySyncService.syncMessage(messageId, context?)
```

Service duoc goi sau khi Message commit thanh cong tu:

- gui text;
- gui image/file/video/voice;
- automation neu cho phep;
- listener nhan echo cua tin gui tu Zalo native.

Can idempotent bang unique hien co:

```text
@@unique([storyId, sourceMessageId])
```

Neu CRM route va Zalo listener cung nhan mot tin, lan thu hai phai skip.

### 5.5. Backup va realtime

Sau khi append:

- rebuild `conversationContent`;
- cap nhat `updatedAt`;
- set backup `pending` neu co destination;
- emit `archive:message-added`;
- cap nhat danh sach, Kanban va popup neu dang mo;
- backup loi khong rollback tin da gui hoac snapshot PostgreSQL.

## 6. API va contract de xuat

| Method | Path | Muc dich |
|---|---|---|
| GET | `/api/v1/archive/filter-options/conversations` | Goi y user/group theo scope |
| GET | `/api/v1/archive/stories` | Them `conversationId`, `zaloAccountId`, `customerQ` |
| DELETE | `/api/v1/zalo-accounts/:id` | Chuyen thanh soft delete |
| POST | `/api/v1/archive/stories/:id/messages/sync-reply` | Retry/append reply vao story cu the |
| GET | `/api/v1/archive/messages/:sourceMessageId/stories` | Tim story lien quan khi quote reply |

Response `ArchiveStory` bo sung:

```json
{
  "zaloAccount": {
    "id": "uuid",
    "displayName": "Quoc",
    "deletedAt": "2026-06-14T02:30:00.000Z"
  },
  "zaloAccountSnapshot": {
    "displayName": "Quoc",
    "zaloUid": "123456789"
  }
}
```

## 7. Phan quyen

### Tim kiem

- `archive.access`: duoc mo module;
- `archive.view_all`: mo rong scope ho so theo phong ban;
- Zalo account owner/access: quyet dinh conversation nao duoc goi y;
- `archive.customer_search_all`: tuy chon cho user duoc tim tat ca conversation
  trong organization.

### Tu dong dong bo

- append vao story can `archive.edit` hoac `archive.create` theo quy uoc chot;
- owner/admin toan quyen;
- user phu trach/nguoi tao duoc append neu co grant;
- manager chi append trong department scope;
- neu khong du quyen, tin van gui nhung archive sync bi skip va ghi audit.

### Xoa tai khoan Zalo

- chi owner/admin hoac grant quan tri kenh;
- phai confirm ro `Ho so da luu se duoc giu lai`;
- ghi audit nguoi xoa, thoi gian va account snapshot.

## 8. Tieu chi nghiem thu

1. Go ten ca nhan hien goi y user phu hop.
2. Go ten nhom hien goi y group phu hop.
3. Tim bang SDT hoat dong.
4. User khong thay conversation cua account khong co quyen.
5. Admin thay tat ca trong organization.
6. Chon goi y loc chinh xac theo `conversationId`.
7. Xoa tai khoan Zalo khong lam giam so ArchiveStory.
8. Message/media/history cua ho so van xem duoc sau khi xoa account.
9. Danh sach, Kanban va popup hien canh bao account da xoa.
10. Cac thao tac nghiep vu tren ho so cu van hoat dong.
11. Quote reply mot tin trong mot story tu dong append dung story.
12. Reply source nam nhieu story khong tu gan sai.
13. Tin tra loi khong bi snapshot trung khi route gui va listener cung xu ly.
14. Google backup loi khong lam that bai gui tin hoac luu PostgreSQL.
15. Realtime cap nhat popup/danh sach sau khi auto-sync.

## 9. Thu tu trien khai de xuat

1. Sua lifecycle ZaloAccount va migration bao toan ho so.
2. Backfill snapshot account vao ArchiveStory.
3. Them canh bao account da xoa tren UI.
4. Them API autocomplete conversation co RBAC + Zalo access.
5. Them o tim kiem khach hang/group.
6. Tao archive reply sync service idempotent.
7. Noi service vao cac luong gui text/media va Zalo listener.
8. Bo sung realtime, audit va test.

## 10. Prompt trien khai sau khi duyet

```text
Hay trien khai dac ta tai
plans/google-message-archive/03-customer-search-account-retention-auto-sync.md.

Yeu cau:
1. Lam theo thu tu migration bao toan du lieu truoc, UI sau.
2. Khong duoc de viec xoa ZaloAccount cascade xoa ArchiveStory.
3. Tim kiem user/group phai enforce ca archive RBAC va ZaloAccountAccess tai
   backend; frontend khong phai bien gioi bao mat.
4. Autocomplete debounce, pagination/limit va khong load toan bo conversation.
5. Tu dong dong bo chi khi reply/quote source message da nam trong ho so.
6. Neu source message nam nhieu ho so, khong tu gan ngau nhien.
7. Service dong bo phai idempotent, dung unique storyId + sourceMessageId.
8. Google backup la cold path; loi backup khong rollback PostgreSQL/luong gui.
9. Bo sung test cho RBAC, soft delete, duplicate, multi-story va realtime.
10. Build frontend/backend, build Docker va bao cao migration/test da chay.
```

