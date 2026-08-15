# تحلیل سیستم کنترل دسترسی (RBAC) برای Dockge

## ۱. وضعیت فعلی سیستم احراز هویت و مجوزدهی

### ۱.۱ خلاصه مشکل

Dockge در حال حاضر **هیچ سیستم کنترل دسترسی مبتنی بر نقش (RBAC)** ندارد. تمام کاربرانی که وارد سیستم می‌شوند، دسترسی کامل **Admin** دارند. یعنی:

- ✅ هر کاربر لاگین شده می‌تواند **تمام استک‌ها/کانتینرها** را ببیند
- ✅ هر کاربر می‌تواند کانتینر جدید **بسازد**
- ✅ هر کاربر می‌تواند کانتینرها را **ویرایش، حذف، استارت، استاپ** کند
- ✅ هر کاربر می‌تواند به **ترمینال** کانتینرها دسترسی داشته باشد
- ✅ هر کاربر می‌تواند **تنظیمات سیستم** را تغییر دهد
- ✅ هر کاربر می‌تواند **agent** (سرور دیگر) اضافه یا حذف کند

### ۱.۲ معماری فعلی احراز هویت

#### مدل کاربر (`backend/models/user.ts`)
```
جدول user:
- id (auto increment)
- username (unique)
- password (bcrypt hash)
- active (boolean)
- timezone
- twofa_secret
- twofa_status
- twofa_last_token
```

> **نکته مهم**: هیچ فیلد `role` یا `permissions` وجود ندارد.

#### جریان احراز هویت
1. کاربر با username/password لاگین می‌کند → `main-socket-handler.ts` → متد `login()`
2. یک JWT توکن ساخته می‌شود (فقط شامل `username` و `h` = هش پسورد)
3. بعد از لاگین، `socket.userID` ست می‌شود
4. تمام درخواست‌ها فقط `checkLogin(socket)` را بررسی می‌کنند

#### تابع `checkLogin()` (`backend/util-server.ts`)
```typescript
export function checkLogin(socket: DockgeSocket) {
    if (!socket.userID) {
        throw new Error("You are not logged in.");
    }
}
```

> **این تابع فقط بررسی می‌کند آیا کاربر لاگین کرده یا نه.** هیچ بررسی مجوز یا نقشی انجام نمی‌دهد.

### ۱.۳ نقاط ورودی بدون کنترل دسترسی

در فایل‌های زیر، تمام عملیات‌ها فقط با `checkLogin()` محافظت شده‌اند:

| فایل | عملیات‌ها | ریسک |
|------|----------|------|
| `docker-socket-handler.ts` | `deployStack`, `saveStack`, `deleteStack`, `startStack`, `stopStack`, `restartStack`, `updateStack`, `downStack`, `startService`, `stopService`, `restartService` | 🔴 بالا |
| `terminal-socket-handler.ts` | `terminalInput`, `mainTerminal`, `interactiveTerminal` | 🔴 بالا |
| `manage-agent-socket-handler.ts` | `addAgent`, `removeAgent`, `updateAgent` | 🔴 بالا |
| `main-socket-handler.ts` | `changePassword`, `getSettings`, `setSettings`, `composerize` | 🟡 متوسط |
| `agent-proxy-socket-handler.ts` | `agent` (proxy به همه endpoints) | 🔴 بالا |

### ۱.۴ مشکل `sendStackList` (لیست استک‌ها)

در فایل `dockge-server.ts`، متد `sendStackList()` لیست **تمام استک‌ها** را به **تمام کاربران لاگین شده** ارسال می‌کند بدون هیچ فیلتری:

```typescript
async sendStackList(useCache = false) {
    // ...
    for (let socket of socketList) {
        if (dockgeSocket.userID) {
            // تمام استک‌ها برای همه کاربران
            stackList = await Stack.getStackList(this, useCache);
            // ...
        }
    }
}
```

---

## ۲. معماری پیشنهادی RBAC

### ۲.۱ مدل نقش‌ها (Roles)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Role Hierarchy                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  admin ──────► full access (manage users, settings, agents)     │
│                                                                 │
│  manager ────► manage stacks (create, edit, delete, start/stop) │
│                                                                 │
│  operator ───► operate stacks (start, stop, restart, logs)      │
│                                                                 │
│  viewer ─────► view only (see stack list, logs, status)         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### ۲.۲ ماتریس مجوزها

| مجوز (Permission) | admin | manager | operator | viewer |
|---|---|---|---|---|
| مشاهده لیست استک‌ها | ✅ | ✅ (فقط اختصاصی) | ✅ (فقط اختصاصی) | ✅ (فقط اختصاصی) |
| مشاهده جزئیات استک | ✅ | ✅ | ✅ | ✅ |
| مشاهده لاگ‌ها | ✅ | ✅ | ✅ | ✅ |
| ساخت استک جدید | ✅ | ✅ | ❌ | ❌ |
| ویرایش استک (compose.yaml) | ✅ | ✅ | ❌ | ❌ |
| حذف استک | ✅ | ✅ | ❌ | ❌ |
| استارت/استاپ/ریستارت | ✅ | ✅ | ✅ | ❌ |
| آپدیت (pull + restart) | ✅ | ✅ | ✅ | ❌ |
| دسترسی ترمینال (exec) | ✅ | ✅ | ❌ | ❌ |
| کنسول (main terminal) | ✅ | ❌ | ❌ | ❌ |
| مدیریت Agent ها | ✅ | ❌ | ❌ | ❌ |
| تنظیمات سیستم | ✅ | ❌ | ❌ | ❌ |
| مدیریت کاربران | ✅ | ❌ | ❌ | ❌ |
| تغییر پسورد خود | ✅ | ✅ | ✅ | ✅ |

### ۲.۳ مدل داده‌ای (Database Schema)

#### جدول‌های جدید:

```sql
-- اضافه کردن فیلد role به جدول user
ALTER TABLE user ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer';

-- جدول اختصاص استک به کاربر
CREATE TABLE user_stack_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    stack_name TEXT NOT NULL,        -- نام استک
    endpoint TEXT NOT NULL DEFAULT '', -- endpoint (خالی = لوکال)
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE(user_id, stack_name, endpoint)
);
```

> **توجه**: ادمین به همه استک‌ها دسترسی دارد و نیازی به اضافه کردن رکورد در `user_stack_access` ندارد.

### ۲.۴ تغییرات JWT

توکن JWT فعلی:
```json
{
    "username": "admin",
    "h": "<password_hash>"
}
```

توکن JWT پیشنهادی:
```json
{
    "username": "admin",
    "h": "<password_hash>",
    "role": "admin"
}
```

> **نکته**: نقش باید در سمت سرور هم از دیتابیس بررسی شود (JWT فقط برای cache).

---

## ۳. تغییرات مورد نیاز در کد

### ۳.۱ Backend تغییرات

#### فایل‌های جدید:
| فایل | توضیح |
|------|-------|
| `backend/rbac.ts` | ماژول اصلی RBAC شامل تعریف مجوزها، نقش‌ها و توابع بررسی |
| `backend/migrations/XXXX-rbac-tables.ts` | مایگریشن دیتابیس برای اضافه کردن جداول جدید |
| `backend/socket-handlers/user-management-socket-handler.ts` | هندلر Socket.io برای مدیریت کاربران |

#### فایل‌های اصلاح شده:
| فایل | تغییرات |
|------|---------|
| `backend/util-server.ts` | اضافه کردن `checkPermission()` و `checkStackAccess()` به `DockgeSocket` |
| `backend/models/user.ts` | اضافه کردن فیلد `role`، متدهای بررسی مجوز |
| `backend/agent-socket-handlers/docker-socket-handler.ts` | اضافه کردن بررسی مجوز به تمام عملیات‌ها |
| `backend/agent-socket-handlers/terminal-socket-handler.ts` | محدود کردن دسترسی ترمینال |
| `backend/socket-handlers/main-socket-handler.ts` | محدود کردن تنظیمات به admin |
| `backend/socket-handlers/manage-agent-socket-handler.ts` | محدود کردن مدیریت agent به admin |
| `backend/socket-handlers/agent-proxy-socket-handler.ts` | اضافه کردن بررسی مجوز |
| `backend/dockge-server.ts` | فیلتر لیست استک بر اساس دسترسی کاربر |
| `backend/stack.ts` | اضافه کردن متدهای مرتبط با دسترسی |

### ۳.۲ Frontend تغییرات

#### فایل‌های جدید:
| فایل | توضیح |
|------|-------|
| `frontend/src/components/settings/UserManagement.vue` | صفحه مدیریت کاربران |
| `frontend/src/components/UserEditDialog.vue` | دیالوگ ویرایش/ساخت کاربر |
| `frontend/src/components/StackAccessDialog.vue` | دیالوگ تخصیص استک به کاربر |

#### فایل‌های اصلاح شده:
| فایل | تغییرات |
|------|---------|
| `frontend/src/pages/Settings.vue` | اضافه کردن منوی «مدیریت کاربران» |
| `frontend/src/pages/Compose.vue` | پنهان کردن دکمه‌های ویرایش/حذف/ساخت بر اساس نقش |
| `frontend/src/pages/DashboardHome.vue` | پنهان کردن دکمه «+» (ساخت استک) برای operator/viewer |
| `frontend/src/components/StackList.vue` | فیلتر لیست استک (سمت سرور) |
| `frontend/src/components/Container.vue` | پنهان کردن دکمه‌های start/stop/terminal بر اساس نقش |
| `frontend/src/router.ts` | اضافه کردن route برای UserManagement |
| `frontend/src/mixins/socket.ts` | ذخیره نقش کاربر و ارسال آن به کامپوننت‌ها |

### ۳.۳ Common تغییرات

| فایل | تغییرات |
|------|---------|
| `common/util-common.ts` | اضافه کردن ثوابت نقش‌ها و مجوزها |

---

## ۴. جزئیات پیاده‌سازی کلیدی

### ۴.۱ ماژول RBAC (`backend/rbac.ts`)

```typescript
// نمونه ساختار پیشنهادی
export enum Role {
    ADMIN = "admin",
    MANAGER = "manager",
    OPERATOR = "operator",
    VIEWER = "viewer",
}

export enum Permission {
    STACK_VIEW = "stack.view",
    STACK_CREATE = "stack.create",
    STACK_EDIT = "stack.edit",
    STACK_DELETE = "stack.delete",
    STACK_START = "stack.start",
    STACK_STOP = "stack.stop",
    STACK_RESTART = "stack.restart",
    STACK_UPDATE = "stack.update",
    STACK_LOGS = "stack.logs",
    TERMINAL_EXEC = "terminal.exec",
    TERMINAL_CONSOLE = "terminal.console",
    AGENT_MANAGE = "agent.manage",
    SETTINGS_VIEW = "settings.view",
    SETTINGS_EDIT = "settings.edit",
    USER_MANAGE = "user.manage",
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    [Role.ADMIN]: Object.values(Permission),  // همه مجوزها
    [Role.MANAGER]: [
        Permission.STACK_VIEW, Permission.STACK_CREATE,
        Permission.STACK_EDIT, Permission.STACK_DELETE,
        Permission.STACK_START, Permission.STACK_STOP,
        Permission.STACK_RESTART, Permission.STACK_UPDATE,
        Permission.STACK_LOGS, Permission.TERMINAL_EXEC,
    ],
    [Role.OPERATOR]: [
        Permission.STACK_VIEW, Permission.STACK_START,
        Permission.STACK_STOP, Permission.STACK_RESTART,
        Permission.STACK_UPDATE, Permission.STACK_LOGS,
    ],
    [Role.VIEWER]: [
        Permission.STACK_VIEW, Permission.STACK_LOGS,
    ],
};
```

### ۴.۲ تابع بررسی مجوز (`backend/util-server.ts`)

```typescript
/**
 * بررسی مجوز کاربر برای یک عملیات خاص
 */
export async function checkPermission(socket: DockgeSocket, permission: Permission) {
    checkLogin(socket);
    const user = await R.findOne("user", " id = ? AND active = 1 ", [socket.userID]);
    if (!user) throw new Error("User not found");

    const role = user.role as Role;
    if (!ROLE_PERMISSIONS[role]?.includes(permission)) {
        throw new Error("Permission denied");
    }
}

/**
 * بررسی دسترسی کاربر به یک استک خاص
 */
export async function checkStackAccess(socket: DockgeSocket, stackName: string, endpoint: string = "") {
    checkLogin(socket);
    const user = await R.findOne("user", " id = ? AND active = 1 ", [socket.userID]);
    if (!user) throw new Error("User not found");

    // ادمین به همه دسترسی دارد
    if (user.role === Role.ADMIN) return;

    const access = await R.findOne("user_stack_access",
        " user_id = ? AND stack_name = ? AND endpoint = ? ",
        [socket.userID, stackName, endpoint]
    );

    if (!access) {
        throw new Error("Access denied to this stack");
    }
}
```

### ۴.۳ نمونه اعمال در `docker-socket-handler.ts`

```typescript
// قبل (فعلی):
agentSocket.on("startStack", async (stackName, callback) => {
    try {
        checkLogin(socket);
        // ...
    }
});

// بعد (پیشنهادی):
agentSocket.on("startStack", async (stackName, callback) => {
    try {
        await checkPermission(socket, Permission.STACK_START);
        await checkStackAccess(socket, stackName, socket.endpoint);
        // ...
    }
});
```

### ۴.۴ فیلتر لیست استک در `sendStackList`

```typescript
async sendStackList(useCache = false) {
    for (let socket of socketList) {
        let dockgeSocket = socket as DockgeSocket;
        if (dockgeSocket.userID) {
            const user = await R.findOne("user", " id = ? ", [dockgeSocket.userID]);
            let filteredMap = new Map();

            for (let [stackName, stack] of stackList) {
                if (user.role === 'admin' || await this.hasStackAccess(dockgeSocket.userID, stackName, dockgeSocket.endpoint)) {
                    filteredMap.set(stackName, stack.toSimpleJSON(dockgeSocket.endpoint));
                }
            }

            dockgeSocket.emitAgent("stackList", {
                ok: true,
                stackList: Object.fromEntries(filteredMap),
            });
        }
    }
}
```

---

## ۵. سازگاری با مستندات توسعه (CONTRIBUTING.md)

### ۵.۱ رعایت قوانین پروژه

| قانون | رعایت | توضیح |
|-------|-------|-------|
| No breaking changes | ✅ | مایگریشن backward-compatible - مقدار پیش‌فرض `role='admin'` برای کاربران موجود |
| Settings configurable in frontend | ✅ | مدیریت کاربران از طریق UI Settings |
| Easy to use | ✅ | نقش‌های ساده و قابل فهم |
| Consistent UI | ✅ | استفاده از همان کامپوننت‌های Bootstrap موجود |
| No native build dependency | ✅ | بدون وابستگی جدید native |
| 4 spaces indentation | ✅ | طبق `.editorconfig` |
| camelCase for JS/TS | ✅ | |
| snake_case for SQLite | ✅ | `user_stack_access`, `stack_name` |
| JSDoc documentation | ✅ | مستندسازی تمام توابع جدید |

### ۵.۲ نکات مهم SECURITY.md

- تمام تغییرات باید **سمت سرور** اعمال شوند (هرگز فقط به فرانت‌اند تکیه نکنید)
- Frontend فقط برای UX بهتر دکمه‌ها را مخفی می‌کند
- بررسی مجوز **حتماً** در socket handler انجام شود
- توکن JWT فقط cache است، مرجع اصلی دیتابیس است

---

## ۶. استراتژی مایگریشن

### فاز ۱: بدون شکستن سیستم فعلی
1. اضافه کردن فیلد `role` با مقدار پیش‌فرض `'admin'` → **تمام کاربران فعلی همان دسترسی قبلی را دارند**
2. ساخت جدول `user_stack_access`
3. اضافه کردن ماژول `rbac.ts`

### فاز ۲: اعمال بررسی مجوزها
4. جایگزینی `checkLogin()` با `checkPermission()` + `checkStackAccess()`
5. فیلتر کردن `sendStackList()` بر اساس دسترسی

### فاز ۳: UI مدیریت
6. ساخت صفحه مدیریت کاربران
7. پنهان کردن UI المان‌ها بر اساس نقش

---

## ۷. ریسک‌ها و ملاحظات

| ریسک | شدت | راه‌حل |
|------|-----|--------|
| مایگریشن از نسخه بدون RBAC | متوسط | Default role = admin (backward compatible) |
| Performance: بررسی دسترسی در هر درخواست | پایین | Cache دسترسی‌ها در حافظه + socket session |
| Agent proxy bypass | بالا | بررسی مجوز در `agent-proxy-socket-handler.ts` قبل از proxy |
| disableAuth + RBAC conflict | متوسط | وقتی auth غیرفعال باشد، همه admin هستند |
| Multi-agent stack access | متوسط | ذخیره endpoint در `user_stack_access` |
