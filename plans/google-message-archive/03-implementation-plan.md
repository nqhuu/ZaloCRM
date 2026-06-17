# Phase 9 - Implementation checklist cap nhat

## P0 - Ho so va duplicate

- [ ] Them `recordType`, `departmentId` vao ArchiveStory.
- [ ] Them resource `archive` vao PermissionGroup.
- [ ] Preflight cross-story duplicate.
- [ ] Tao story voi default department/assignee/title.
- [ ] Append message vao story hien co.
- [ ] Chan duplicate trong cung story.
- [ ] Audit xac nhan cross-story duplicate.

## P1 - Save dialog

- [ ] Chon tao moi hoac ho so hien co.
- [ ] Tu dien type/department/assignee/title.
- [ ] Chi manager/admin duoc gan nguoi khac.
- [ ] Canh bao conflict.
- [ ] Quay lai giu selection va highlight conflict.

## P2 - Archive UI

- [ ] Card preview 2-3 dong.
- [ ] Hien count message/media.
- [ ] Detail drawer/dialog.
- [ ] Huy, hoan thanh, mo lai theo grant.
- [ ] Filter department/assignee/type/date/backup.
- [ ] Mac dinh loc `Ho so cua toi` theo user dang nhap.
- [ ] Manager/admin co the doi sang phong ban hoac toan scope duoc cap.
- [ ] Filter theo khach hang/conversation.
- [ ] Chuyen doi List/Kanban va ghi nho lua chon.

## P3 - Media

- [ ] Parse JSON content.
- [ ] Tao ArchiveMedia cho image/file cu va moi.
- [ ] Thumbnail/lightbox/open/download.
- [ ] Backfill media snapshot cu.

## P4 - Department va bao cao

- [ ] Scope member/manager/admin.
- [ ] Default type theo department, Phase nay fallback `order`.
- [ ] Aggregate API theo ngay/tuan/thang.
- [ ] Bao cao theo department va assignee.

## P5 - Verification

- [ ] Prisma validate/generate.
- [ ] Backend build.
- [ ] Frontend typecheck/build.
- [ ] Unit/API tests create/append/conflict/RBAC/media.
- [ ] Docker build va smoke test.
