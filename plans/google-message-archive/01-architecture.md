# Phase 9 - Kien truc ho so trao doi

## Quyet dinh chinh

- PostgreSQL la source of truth.
- Conversation va ho so la quan he mot-nhieu.
- Save dialog ho tro `create` va `append`.
- Preflight kiem tra message trung truoc khi ghi.
- Backend kiem tra lai duplicate trong transaction.
- Department tao data scope; PermissionGroup tao action scope.
- Google Drive/Sheets la cold path, khong chan luu DB.

## Save flow

```text
chon message
  -> mo save dialog
  -> load ho so cua conversation
  -> mac dinh department/assignee/type/title
  -> preflight duplicate
       -> khong conflict: save
       -> conflict: van luu / quay lai / huy
  -> create story hoac append messages
  -> queue Google backup
```

## Duplicate policy

- Unique trong story: `(storyId, sourceMessageId)`.
- Cross-story duplicate: cho phep khi request co xac nhan.
- API tra danh sach conflict theo source message va story.
- Frontend giu selection khi quay lai va highlight conflict.

## Scope

- Member: created-by hoac assigned-to.
- Leader/deputy: department subtree.
- Owner/admin: organization.
- Grant `archive.*` van bat buoc cho moi hanh dong.

## Media

Extractor xu ly ca attachments object va JSON string trong content. UI khong
render raw JSON; image hien thumbnail va co viewer. Backfill xu ly snapshot cu.

## Reporting

Archive list cung cap metrics nhanh. Module Reports dung aggregate API theo
period, department va assignee de danh gia hieu suat.
