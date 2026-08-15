# پیاده‌سازی RBAC برای Dockge

مبتنی بر [RBAC-analysis.md](file:///home/mrash/workspace/dockge/docs/RBAC-analysis.md) و [RBAC-tasks.md](file:///home/mrash/workspace/dockge/docs/RBAC-tasks.md)

## خلاصه

اضافه کردن سیستم کنترل دسترسی مبتنی بر نقش (RBAC) با ۴ نقش: `admin`, `manager`, `operator`, `viewer`. شامل:
- کنترل دسترسی سمت سرور در تمام socket handler ها
- فیلتر لیست استک بر اساس دسترسی کاربر
- UI مدیریت کاربران برای admin
- Backward compatible (کاربران فعلی → admin)

---

## فاز ۱: زیرساخت (۳ فایل جدید + ۱ فایل اصلاحی)

### [NEW] [rbac.ts](file:///home/mrash/workspace/dockge/backend/rbac.ts)
- ماژول اصلی RBAC
- تعریف enum `Role` و `Permission`
- تعریف `ROLE_PERMISSIONS` mapping
- تابع `hasPermission(role, permission)`
- تابع `hasStackAccess(userId, stackName, endpoint)` با query به DB
- JSDoc مستندسازی

### [NEW] [2026-07-23-0001-rbac-tables.ts](file:///home/mrash/workspace/dockge/backend/migrations/2026-07-23-0001-rbac-tables.ts)
- اضافه کردن ستون `role TEXT NOT NULL DEFAULT 'admin'` به جدول `user`
- ساخت جدول `user_stack_access` با UNIQUE constraint

### [MODIFY] [util-common.ts](file:///home/mrash/workspace/dockge/common/util-common.ts)
- اضافه کردن ثوابت نقش‌ها و permission ها برای استفاده مشترک frontend/backend

---

## فاز ۲: اعمال مجوزها در Backend (۸ فایل)

### [MODIFY] [util-server.ts](file:///home/mrash/workspace/dockge/backend/util-server.ts)
- Implement `checkPermission` and `checkStackAccess` to throw errors on failure.
- Implement `verifyProxiedEventAccess` to check event-specific permissions before proxying to an agent.
- اضافه کردن `role` به `JWTDecoded` interface
- ساخت تابع `checkPermission(socket, permission)` 
- ساخت تابع `checkStackAccess(socket, stackName, endpoint)`

### [MODIFY] [user.ts](file:///home/mrash/workspace/dockge/backend/models/user.ts)
- آپدیت `createJWT()` برای شامل شدن `role` در payload

### [MODIFY] [docker-socket-handler.ts](file:///home/mrash/workspace/dockge/backend/agent-socket-handlers/docker-socket-handler.ts)
- جایگزینی `checkLogin()` با `checkPermission()` + `checkStackAccess()` در ۱۵ عملیات

### [MODIFY] [terminal-socket-handler.ts](file:///home/mrash/workspace/dockge/backend/agent-socket-handlers/terminal-socket-handler.ts)
- `mainTerminal` → `TERMINAL_CONSOLE` (فقط admin)
- `interactiveTerminal` → `TERMINAL_EXEC` + `checkStackAccess`
- `terminalInput` → بررسی بر اساس نوع ترمینال

### [MODIFY] [main-socket-handler.ts](file:///home/mrash/workspace/dockge/backend/socket-handlers/main-socket-handler.ts)
- `setSettings` → `SETTINGS_EDIT` (فقط admin)
- `getSettings` → `SETTINGS_VIEW` (فقط admin)
- `composerize` → `STACK_CREATE`
- `setup` → اضافه کردن `role: 'admin'` به کاربر اول
- `afterLogin` → ارسال نقش به frontend

### [MODIFY] [manage-agent-socket-handler.ts](file:///home/mrash/workspace/dockge/backend/socket-handlers/manage-agent-socket-handler.ts)
- `addAgent`, `removeAgent`, `updateAgent` → `AGENT_MANAGE` (فقط admin)

### [MODIFY] [agent-proxy-socket-handler.ts](file:///home/mrash/workspace/dockge/backend/socket-handlers/agent-proxy-socket-handler.ts)
- بررسی مجوز قبل از proxy

### [MODIFY] [dockge-server.ts](file:///home/mrash/workspace/dockge/backend/dockge-server.ts)
- `sendStackList()` → فیلتر بر اساس دسترسی کاربر
- `afterLogin()` → ذخیره `role` در socket + ارسال به client

### [NEW] [user-management-socket-handler.ts](file:///home/mrash/workspace/dockge/backend/socket-handlers/user-management-socket-handler.ts)
- CRUD کاربران (getUserList, addUser, editUser, deleteUser)
- مدیریت دسترسی استک (setStackAccess, getStackAccess)
- همه فقط admin

---

## فاز ۳: تغییرات Frontend (۳ فایل جدید + ۶ فایل اصلاحی)

### [NEW] [UserManagement.vue](file:///home/mrash/workspace/dockge/frontend/src/components/settings/UserManagement.vue)
- لیست کاربران با نقش، وضعیت
- CRUD UI

### [NEW] [UserEditDialog.vue](file:///home/mrash/workspace/dockge/frontend/src/components/UserEditDialog.vue)
- فرم ساخت/ویرایش کاربر

### [NEW] [StackAccessDialog.vue](file:///home/mrash/workspace/dockge/frontend/src/components/StackAccessDialog.vue)
- تخصیص دسترسی استک به کاربر

### [MODIFY] [socket.ts](file:///home/mrash/workspace/dockge/frontend/src/mixins/socket.ts)
- ذخیره `userRole` و ساخت `hasPermission()` method

### [MODIFY] [Settings.vue](file:///home/mrash/workspace/dockge/frontend/src/pages/Settings.vue)
- منوی Users فقط برای admin

### [MODIFY] [router.ts](file:///home/mrash/workspace/dockge/frontend/src/router.ts)
- اضافه کردن route `/settings/users`

### [MODIFY] [Compose.vue](file:///home/mrash/workspace/dockge/frontend/src/pages/Compose.vue)
- پنهان کردن دکمه‌ها بر اساس نقش

### [MODIFY] [DashboardHome.vue](file:///home/mrash/workspace/dockge/frontend/src/pages/DashboardHome.vue)
- پنهان کردن دکمه `+ Compose` برای operator/viewer

### [MODIFY] [Container.vue](file:///home/mrash/workspace/dockge/frontend/src/components/Container.vue)
- پنهان کردن دکمه‌های عملیاتی بر اساس نقش

---

## فاز ۴: ترجمه

### [MODIFY] [en.json](file:///home/mrash/workspace/dockge/frontend/src/lang/en.json)
- کلیدهای ترجمه جدید RBAC

---

## فاز ۵: مستندات

### [NEW] docs/RBAC-user-guide.md
- راهنمای استفاده

---

## Verification Plan

### Manual Verification
- بیلد پروژه با `npm run build`
- تست لاگین با هر نقش
- تست دسترسی سمت سرور (viewer نمی‌تواند start/stop کند)
- تست backward compatibility (کاربران فعلی admin هستند)

> [!IMPORTANT]
> ترتیب اجرا: **فاز ۱ → فاز ۲ → فاز ۳ → فاز ۴ → فاز ۵**
> هر فاز مستقل قابل تست است.

> [!NOTE]
> آیا می‌خواهید از فاز ۱ شروع کنیم یا نظر خاصی درباره تغییرات دارید؟
