# Phase 9 - Data contract

## ArchiveStory bo sung

```text
recordType       string, default "order"
departmentId     nullable FK Department
title            ten ho so day du, fallback conversationName
assignedUserId   user phu trach
updatedAt        thoi diem bo sung/chinh sua gan nhat
```

## API

### Preflight

```http
POST /api/v1/archive/stories/preflight
```

```json
{
  "conversationId": "uuid",
  "messageIds": ["uuid"],
  "targetStoryId": "uuid-or-null"
}
```

Response:

```json
{
  "targetDuplicates": ["message-id"],
  "crossStoryConflicts": [
    {
      "messageId": "message-id",
      "stories": [{ "id": "story-id", "title": "Quoc Huu - Don 12/06" }]
    }
  ],
  "savableMessageIds": ["message-id"]
}
```

### Create

```http
POST /api/v1/archive/stories
```

```json
{
  "conversationId": "uuid",
  "messageIds": ["uuid"],
  "titleSuffix": "Don may loc nuoc",
  "recordType": "order",
  "departmentId": "uuid",
  "assignedUserId": "uuid",
  "allowCrossStoryDuplicates": false
}
```

### Append

```http
POST /api/v1/archive/stories/:id/messages
```

```json
{
  "messageIds": ["uuid"],
  "allowCrossStoryDuplicates": false
}
```

### Update metadata

```http
PATCH /api/v1/archive/stories/:id
```

```json
{
  "title": "Quoc Huu - Don may loc nuoc",
  "recordType": "order",
  "departmentId": "uuid",
  "assignedUserId": "uuid"
}
```

## Permission resource

```text
archive.access
archive.create
archive.edit
archive.delete
archive.approve
archive.view_all
```

## Media contract

Moi ArchiveMessage tra:

```json
{
  "contentSnapshot": "Noi dung doc duoc",
  "media": [
    {
      "mediaType": "image",
      "sourceUrl": "https://...",
      "driveUrl": "https://...",
      "backupStatus": "completed"
    }
  ]
}
```

Frontend uu tien `driveUrl`, fallback `sourceUrl`.
