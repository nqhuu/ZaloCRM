# 10. Zalo Assignee Delegation And Archive Handover Rules

## 1. Ket luan nghiep vu

Viec ban giao ho so don hang khong nen chi la thao tac doi `assignedUserId`. Nguoi nhan ho so phai co kha nang thao tac tren dung tai khoan Zalo CRM da phat sinh hoi thoai goc.

Phuong an chot:

- Nhan vien dang xu ly ho so chi duoc de nghi ban giao cho nguoi dang la `secondary_1`, `secondary_1` hoac `secondary_n` hop le cua tai khoan Zalo.
- Truong phong/Admin co the dieu phoi linh hoat hon, nhung khong duoc chuyen am tham cho nguoi khong co quyen chat tren nick Zalo.
- Neu can chuyen cho nguoi khac trong phong, he thong phai dong thoi tao/cap quyen thao tac Zalo co thoi han hoac yeu cau gan nguoi do vao nhom phu trach Zalo.
- Phu trach chinh tam thoi can ho tro khoang `tu ngay` den `den ngay`, khong chi mot ngay don le.

## 2. Ly do khong nen chuyen ho so cho nguoi ngoai nhom phu trach Zalo

Quan ly don hang gan truc tiep voi kha nang doc, tra loi va theo doi hoi thoai tren Zalo CRM. Neu ho so duoc chuyen cho nguoi khong co quyen thao tac nick Zalo:

- Nguoi nhan khong the xu ly hoi thoai goc.
- Quyen xem ho so va quyen chat bi lech nhau.
- Bao cao hieu suat co the tinh sai nguoi chiu trach nhiem.
- Khi tin nhan moi phat sinh, auto-sync vao ho so se khong ro nen gan cho ai.

Do do, `assignedUserId` cua ho so phai gan voi mot nguoi co quyen hop le tren `zaloAccountId` cua ho so tai thoi diem ban giao.

## 3. Luong ban giao cua nhan vien dang xu ly

Nhan vien dang xu ly ho so duoc tao yeu cau ban giao neu:

- Ho so dang mo.
- User la `assignedUserId` hien tai.
- User co permission `archive.handover.request`.
- Ho so khong co yeu cau ban giao pending khac.

Nguoi nhan hop le:

- La `secondary_1`, `secondary_2` hoac `secondary_n` cua tai khoan Zalo.
- Dang active.
- Thuoc phong ban hien hanh cua tai khoan Zalo.
- Co quyen `chat` hoac `admin` tren tai khoan Zalo.

Nguoi nhan phai bam dong y thi `assignedUserId` moi thay doi. Trong thoi gian cho, trach nhiem van thuoc nguoi cu.

## 4. Luong chuyen truc tiep cua truong phong/Admin

Truong phong/Admin duoc chuyen truc tiep neu:

- Co permission `archive.handover.override`.
- Ho so thuoc phong ban nam trong pham vi quan ly.
- Ho so dang mo.

Nguoi nhan duoc chia thanh hai nhom:

### 4.1. Nhom hop le san

Nguoi nhan da la:

- `primary`
- `secondary_1`
- `secondary_2`
- `secondary_n`

Va co quyen `chat/admin` tren tai khoan Zalo.

Ket qua: cho phep chuyen ngay, khong can nguoi nhan xac nhan.

### 4.2. Nguoi trong phong nhung chua phu trach Zalo

Khong cho chuyen am tham. UI phai hien thi canh bao:

```text
Nguoi nay chua co quyen phu trach tai khoan Zalo.
Neu chuyen ho so, he thong can cap quyen chat tam thoi tren nick Zalo nay.

[Cap quyen tam thoi va chuyen]
[Huy]
```

Neu truong phong xac nhan:

- Tao quyen `chat` co thoi han.
- Ghi nguon quyen la `delegation` hoac `temporary_assignment`.
- Ghi audit ly do.
- Chuyen `assignedUserId` sang nguoi nhan.

Khong tu dong gan vinh vien nguoi do thanh `primary/secondary` neu UI khong noi ro.

## 5. Phu trach chinh tam thoi theo khoang ngay

Hien tai he thong co `ZaloAccountAccess.assignmentRole` de gan:

- `primary`
- `secondary_1`
- `secondary_2`
- `secondary_n`

Nhung chua co lop phu trach chinh tam thoi theo khoang ngay. Can bo sung model:

```text
ZaloAccountPrimaryDelegation

id
orgId
zaloAccountId
departmentId
basePrimaryUserId
delegateUserId
startDate
endDate
timezone
reason
createdByUserId
cancelledAt
cancelledByUserId
createdAt
updatedAt
```

Quy tac:

- `startDate` va `endDate` la ngay theo timezone to chuc.
- Cho phep uy quyen nhieu ngay lien tiep.
- Khong cho hai uy quyen chong lan tren cung mot tai khoan Zalo.
- Nguoi thay the phai la nhan vien active trong phong ban hien hanh.
- Nguoi thay the phai co quyen `chat` trong thoi gian uy quyen.
- Khong ghi de `primary` goc.
- Het `endDate`, he thong tu quay ve `primary` goc khi tinh `effectivePrimary`.

## 6. Cach tinh primary hieu luc

Backend tinh tai thoi diem can dung:

```text
if activeDelegation exists for zaloAccountId and currentDate in [startDate, endDate]:
  effectivePrimary = delegateUser
else:
  effectivePrimary = basePrimary
```

Ap dung cho:

- tao ho so moi tu hoi thoai;
- truong phong luu ho so;
- bao cao phat sinh theo ngay;
- hien thi tren quan ly Zalo;
- goi y nguoi xu ly mac dinh;
- thong bao va canh bao trong ngay uy quyen.

## 7. UI can bo sung

Trong popup phan quyen tai khoan Zalo:

```text
Phong ban hien hanh

Phu trach Zalo
- Phu trach chinh
- Phu trach phu 1
- Phu trach phu 2
- Phu trach phu n

Uy quyen tam thoi
- Tu ngay
- Den ngay
- Nguoi thay the
- Ly do
- Danh sach uy quyen dang/sap hieu luc
```

Trong man hinh ho so:

- Cot `Nhan vien` hien thi nguoi xu ly hien tai.
- Neu co ban giao pending, hien chip `Cho ban giao: A -> B`.
- Neu nguoi xu ly dang la delegate tam thoi, tooltip hien `Dang thay phu trach chinh tu dd/mm/yyyy den dd/mm/yyyy`.
- Kanban card cung hien chip ban giao/uy quyen giong list.

## 8. Trang thai code hien tai

Da co:

- `ZaloAccount.departmentId`.
- `ZaloAccountAccess.assignmentRole`.
- Unique moi tai khoan chi co mot role `primary`, `secondary_1`, `secondary_2`, `secondary_n`.
- UI phan quyen nick Zalo co the gan vai tro phu trach.
- Ban giao thong thuong da bi gioi han sang `secondary_1/secondary_2/secondary_n`.
- Nhan ban giao co kiem tra lai nguoi nhan con la phu trach phu hop le.

Chua co:

- `ZaloAccountPrimaryDelegation`.
- UI tao uy quyen tu ngay den ngay.
- Quyen Zalo co thoi han theo nguon uy quyen.
- Rang buoc manager override phai gan voi quyen thao tac nick Zalo.
- Chip/cot hien ban giao `A -> B` tren list/Kanban.

## 9. Thu tu trien khai de an toan

1. Them schema va migration cho `ZaloAccountPrimaryDelegation`.
2. Them service `getEffectivePrimaryAssignee`.
3. Them API list/create/cancel delegation tren tai khoan Zalo.
4. Cap nhat popup phan quyen Zalo de quan ly phu trach va uy quyen.
5. Cap nhat luong tao ho so de dung `effectivePrimary`.
6. Cap nhat `assignArchiveStoryDirectly` de chi chuyen cho nguoi co quyen Zalo hop le, hoac yeu cau cap quyen tam thoi ro rang.
7. Them chip ban giao/uy quyen tren list va Kanban.
8. Them test phan quyen voi nhan vien, phu trach phu, truong phong, admin va uy quyen het han.
