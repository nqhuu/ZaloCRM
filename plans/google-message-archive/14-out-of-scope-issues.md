# Out-of-scope issues found while continuing plan 14

Date: 2026-06-18

Scope checked: `14-archive-user-workload-quick-report-sidebar.md`

## 1. Node version / nvm status

Original observation while trying to verify the backend:

- Command: `npm install`
- Working directory: `backend`
- Result: failed during Prisma preinstall.
- Current Node: `v20.16.0`
- Prisma requirement: `20.19+`, `22.12+`, or `24.0+`

Key error:

```text
Prisma only supports Node.js versions 20.19+, 22.12+, 24.0+.
Please upgrade your Node.js version.
```

Follow-up performed:

- Downloaded and installed Node `v20.19.0` into the nvm layout at `C:\Users\Admin\AppData\Roaming\nvm\v20.19.0`.
- The global Node symlink now points to `C:\Users\Admin\AppData\Roaming\nvm\v20.19.0`.
- `node -v` now reports `v20.19.0`.
- `npm -v` now reports `10.8.2`.

## 2. Backend Prisma client generation/build

Original observation after the first partial install:

- Command: `npm run build`
- Working directory: `backend`
- Result: failed because Prisma Client had not been generated.

The first blocking class of errors is Prisma client generation/types:

```text
Module '"@prisma/client"' has no exported member 'Prisma'.
Module '"@prisma/client"' has no exported member 'PrismaClient'.
```

Follow-up performed with Node `v20.19.0`:

- Ran `npm install` in `backend`.
- Ran `npx prisma generate` with `DATABASE_URL` loaded from the root `.env`.
- Ran `npm run build` in `backend`.
- Result: backend TypeScript build passes.

Note: `DATABASE_URL` is stored in the root `.env`; Prisma CLI commands run from `backend` need that variable loaded explicitly or copied into `backend/.env`.

## 3. Frontend build

Observed command:

- Command: `npm run build`
- Working directory: `frontend`
- Result: passed.

Original warning under Node `v20.16.0`:

```text
You are using Node.js 20.16.0. Vite requires Node.js version 20.19+ or 22.12+.
```

Follow-up performed with Node `v20.19.0`:

- Command: `npm run build`
- Result: passed.
- Node version warning is gone.
- Remaining warnings are chunk-size/plugin timing warnings only.

## 4. Worktree contains unrelated modified files

The workspace already contains modified files outside plan 14. They were not reverted or changed for this task.

Observed unrelated modified files:

- `frontend/src/components/chat/MessageThread.vue`
- `frontend/src/composables/use-inbox-filters.ts`
- `frontend/src/views/ChatView.vue`
- `plans/google-message-archive/13-archive-story-fields-column-layout-and-save-dialog.md`

Plan 14 changes are limited to the archive workload report endpoint, widget, sidebar wiring, and plan/status docs.
