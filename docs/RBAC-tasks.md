# لیست تسک‌های پیاده‌سازی RBAC برای Dockge

> **هدف**: اضافه کردن سیستم کنترل دسترسی مبتنی بر نقش (RBAC) به Dockge
> **مرجع تحلیل**: [`RBAC-analysis.md`](./RBAC-analysis.md)
> **سازگار با**: [`CONTRIBUTING.md`](../CONTRIBUTING.md) و [`SECURITY.md`](../SECURITY.md)

---

## فاز ۱: زیرساخت دیتابیس و ماژول اصلی RBAC

### تسک ۱.۱: مایگریشن دیتابیس

- **فایل**: `backend/migrations/XXXX-XX-XX-XXXX-rbac-tables.ts`
- **عملیات**:
    - [x] اضافه کردن ستون `role TEXT NOT NULL DEFAULT 'admin'` به جدول `user`
    - [x] ساخت جدول `user_stack_access` با فیلدهای:
        - `id` (PRIMARY KEY AUTOINCREMENT)
        - `user_id` (INTEGER, FOREIGN KEY → user.id)
        - `stack_name` (TEXT, NOT NULL)
        - `endpoint` (TEXT, NOT NULL, DEFAULT '')
        - UNIQUE constraint روی `(user_id, stack_name, endpoint)`
- **نکته**: مقدار پیش‌فرض `'admin'` تضمین می‌کند که کاربران فعلی بدون تغییر دسترسی کامل دارند (backward compatible)

### تسک ۱.۲: ساخت ماژول RBAC

- **فایل جدید**: `backend/rbac.ts`
- **عملیات**:
    - [x] تعریف enum `Role` با مقادیر: `admin`, `manager`, `operator`, `viewer`
    - [x] تعریف enum `Permission` با تمام مجوزها (مطابق ماتریس مجوزها در تحلیل)
    - [x] تعریف `ROLE_PERMISSIONS` (نگاشت نقش‌ها به لیست مجوزها)
    - [x] تابع `hasPermission(role, permission): boolean`
    - [x] تابع `hasStackAccess(userId, stackName, endpoint): Promise<boolean>`
    - [x] مستندسازی JSDoc برای تمام توابع

### تسک ۱.۳: آپدیت ثوابت مشترک

- **فایل**: `common/util-common.ts`
- **عملیات**:
    - [x] اضافه کردن ثوابت نقش‌ها (`ROLE_ADMIN`, `ROLE_MANAGER`, `ROLE_OPERATOR`, `ROLE_VIEWER`)
    - [x] export کردن لیست نقش‌ها برای استفاده در فرانت‌اند

---

## فاز ۲: اعمال بررسی مجوزها در Backend

### تسک ۲.۱: آپدیت `util-server.ts`

- **فایل**: `backend/util-server.ts`
- **عملیات**:
    - [x] اضافه کردن `role` به interface `DockgeSocket`
    - [x] ساخت تابع `checkPermission(socket, permission)` - بررسی مجوز عملیات
    - [x] ساخت تابع `checkStackAccess(socket, stackName, endpoint)` - بررسی دسترسی به استک خاص
    - [x] مستندسازی JSDoc

### تسک ۲.۲: آپدیت مدل User

- **فایل**: `backend/models/user.ts`
- **عملیات**:
    - [x] خواندن و استفاده از فیلد `role`
    - [x] اضافه کردن متد `hasPermission(permission): boolean`
    - [x] آپدیت `createJWT()` برای شامل شدن `role` در payload

### تسک ۲.۳: اعمال مجوزها در Docker Socket Handler

- **فایل**: `backend/agent-socket-handlers/docker-socket-handler.ts`
- **عملیات**:
    - [x] `deployStack`: بررسی `STACK_CREATE` + `checkStackAccess` (اگر ویرایش)
    - [x] `saveStack`: بررسی `STACK_CREATE` (اگر isAdd) یا `STACK_EDIT` (اگر ویرایش)
    - [x] `deleteStack`: بررسی `STACK_DELETE` + `checkStackAccess`
    - [x] `getStack`: بررسی `STACK_VIEW` + `checkStackAccess`
    - [x] `startStack`: بررسی `STACK_START` + `checkStackAccess`
    - [x] `stopStack`: بررسی `STACK_STOP` + `checkStackAccess`
    - [x] `restartStack`: بررسی `STACK_RESTART` + `checkStackAccess`
    - [x] `updateStack`: بررسی `STACK_UPDATE` + `checkStackAccess`
    - [x] `downStack`: بررسی `STACK_STOP` + `checkStackAccess`
    - [x] `startService`: بررسی `STACK_START` + `checkStackAccess`
    - [x] `stopService`: بررسی `STACK_STOP` + `checkStackAccess`
    - [x] `restartService`: بررسی `STACK_RESTART` + `checkStackAccess`
    - [x] `requestStackList`: بررسی `STACK_VIEW`
    - [x] `serviceStatusList`: بررسی `STACK_VIEW` + `checkStackAccess`
    - [x] `dockerStats`: بررسی `STACK_VIEW`

### تسک ۲.۴: اعمال مجوزها در Terminal Socket Handler

- **فایل**: `backend/agent-socket-handlers/terminal-socket-handler.ts`
- **عملیات**:
    - [x] `interactiveTerminal`: بررسی `TERMINAL_EXEC` + `checkStackAccess`
    - [x] `mainTerminal`: بررسی `TERMINAL_CONSOLE` (فقط admin)
    - [x] `terminalInput`: بررسی مجوز بر اساس نوع ترمینال
    - [x] `terminalJoin`: بررسی `STACK_LOGS` + `checkStackAccess` (برای combined terminal)

### تسک ۲.۵: اعمال مجوزها در Main Socket Handler

- **فایل**: `backend/socket-handlers/main-socket-handler.ts`
- **عملیات**:
    - [x] `setSettings`: بررسی `SETTINGS_EDIT` (فقط admin)
    - [x] `getSettings`: بررسی `SETTINGS_VIEW` (admin فقط بعضی تنظیمات، بقیه محدود)
    - [x] `composerize`: بررسی `STACK_CREATE`

### تسک ۲.۶: اعمال مجوزها در Agent Management

- **فایل**: `backend/socket-handlers/manage-agent-socket-handler.ts`
- **عملیات**:
    - [x] `addAgent`: بررسی `AGENT_MANAGE` (فقط admin)
    - [x] `removeAgent`: بررسی `AGENT_MANAGE` (فقط admin)
    - [x] `updateAgent`: بررسی `AGENT_MANAGE` (فقط admin)

### تسک ۲.۷: اعمال مجوزها در Agent Proxy

- **فایل**: `backend/socket-handlers/agent-proxy-socket-handler.ts`
- **عملیات**:
    - [x] بررسی مجوز کاربر قبل از proxy کردن درخواست
    - [x] اطمینان از اینکه درخواست‌های proxy شده هم از نظر مجوز بررسی می‌شوند

### تسک ۲.۸: فیلتر `sendStackList` بر اساس دسترسی

- **فایل**: `backend/dockge-server.ts`
- **عملیات**:
    - [x] آپدیت `sendStackList()` برای فیلتر کردن استک‌ها بر اساس `user_stack_access`
    - [x] آپدیت `afterLogin()` برای ذخیره `role` در socket
    - [x] اضافه کردن متد `hasStackAccess(userId, stackName, endpoint)` به سرور
    - [x] ارسال `role` کاربر به فرانت‌اند بعد از لاگین

### تسک ۲.۹: ساخت Socket Handler مدیریت کاربران

- **فایل جدید**: `backend/socket-handlers/user-management-socket-handler.ts`
- **عملیات**:
    - [x] `getUserList`: لیست کاربران (فقط admin)
    - [x] `addUser`: ساخت کاربر جدید (فقط admin)
    - [x] `editUser`: ویرایش کاربر (تغییر نقش، فعال/غیرفعال) (فقط admin)
    - [x] `deleteUser`: حذف کاربر (فقط admin)
    - [x] `setStackAccess`: تنظیم دسترسی کاربر به استک‌ها (فقط admin)
    - [x] `getStackAccess`: دریافت لیست دسترسی‌های یک کاربر (فقط admin)
    - [x] ثبت handler در `dockge-server.ts` → `socketHandlerList`
    - [x] مستندسازی JSDoc

---

## فاز ۳: تغییرات Frontend

### تسک ۳.۱: آپدیت Socket Mixin برای نقش کاربر

- **فایل**: `frontend/src/mixins/socket.ts`
- **عملیات**:
    - [x] اضافه کردن `userRole` به data
    - [x] دریافت نقش از سرور بعد از لاگین
    - [x] ساخت computed property `isAdmin`, `isManager`, `isOperator`, `isViewer`
    - [x] ساخت متد `hasPermission(permission)` برای استفاده در کامپوننت‌ها

### تسک ۳.۲: ساخت صفحه مدیریت کاربران

- **فایل جدید**: `frontend/src/components/settings/UserManagement.vue`
- **عملیات**:
    - [x] لیست کاربران با نمایش نام کاربری، نقش، وضعیت فعال/غیرفعال
    - [x] دکمه «افزودن کاربر» → دیالوگ ساخت کاربر
    - [x] دکمه «ویرایش» برای هر کاربر → دیالوگ ویرایش
    - [x] دکمه «حذف» با تأیید
    - [x] دکمه «مدیریت دسترسی استک‌ها» → دیالوگ تخصیص استک
    - [x] فقط برای admin قابل مشاهده باشد

### تسک ۳.۳: ساخت دیالوگ ویرایش/ساخت کاربر

- **فایل جدید**: `frontend/src/components/UserEditDialog.vue`
- **عملیات**:
    - [x] فرم شامل: نام کاربری، پسورد، نقش (dropdown)، فعال/غیرفعال (toggle)
    - [x] اعتبارسنجی (قدرت پسورد، نام کاربری یکتا)
    - [x] ارسال درخواست `addUser` یا `editUser` به سرور

### تسک ۳.۴: ساخت دیالوگ تخصیص دسترسی استک

- **فایل جدید**: `frontend/src/components/StackAccessDialog.vue`
- **عملیات**:
    - [x] لیست تمام استک‌ها با checkbox برای اختصاص/حذف دسترسی
    - [x] گروه‌بندی بر اساس endpoint (سرور)
    - [x] دکمه «انتخاب همه» و «حذف همه»
    - [x] ارسال درخواست `setStackAccess` به سرور

### تسک ۳.۵: آپدیت Settings Page

- **فایل**: `frontend/src/pages/Settings.vue`
- **عملیات**:
    - [x] اضافه کردن منوی «مدیریت کاربران» (Users) به `subMenus`
    - [x] نمایش این منو فقط برای admin
    - [x] پنهان کردن منوهای «General»، «GlobalEnv» برای غیر-admin

### تسک ۳.۶: آپدیت Router

- **فایل**: `frontend/src/router.ts`
- **عملیات**:
    - [x] اضافه کردن route `/settings/users` → `UserManagement.vue`
    - [x] import کامپوننت‌های جدید

### تسک ۳.۷: آپدیت Compose Page (محدود کردن UI)

- **فایل**: `frontend/src/pages/Compose.vue`
- **عملیات**:
    - [x] پنهان کردن دکمه «Deploy» برای کاربران بدون `STACK_CREATE`/`STACK_EDIT`
    - [x] غیرفعال کردن ویرایش compose.yaml برای viewer و operator
    - [x] پنهان کردن دکمه «Delete» برای کاربران بدون `STACK_DELETE`
    - [x] نمایش compose.yaml به صورت فقط‌خواندنی برای operator/viewer
    - [x] پنهان کردن دکمه‌های start/stop/restart برای viewer

### تسک ۳.۸: آپدیت DashboardHome

- **فایل**: `frontend/src/pages/DashboardHome.vue`
- **عملیات**:
    - [x] پنهان کردن دکمه «+ Compose» (ساخت استک جدید) برای operator/viewer

### تسک ۳.۹: آپدیت Container Component

- **فایل**: `frontend/src/components/Container.vue`
- **عملیات**:
    - [x] پنهان کردن دکمه‌های start/stop/restart سرویس برای viewer
    - [x] پنهان کردن دکمه ترمینال (exec) برای operator/viewer
    - [x] پنهان کردن دکمه‌های عملیاتی بر اساس نقش

### تسک ۳.۱۰: آپدیت StackList Component

- **فایل**: `frontend/src/components/StackList.vue`
- **عملیات**:
    - [x] سمت سرور فیلتر شده، ولی double-check در فرانت

---

## فاز ۴: ترجمه‌ها و تست

### تسک ۴.۱: اضافه کردن کلیدهای ترجمه

- **فایل**: `frontend/src/lang/en.json`
- **عملیات**:
    - [x] کلیدهای جدید: `"Users"`, `"Add User"`, `"Edit User"`, `"Delete User"`, `"Role"`, `"Stack Access"`, `"Permission Denied"`, `"Admin"`, `"Manager"`, `"Operator"`, `"Viewer"`, `"Select Stacks"`, `"All Stacks"`, `"No Access"` و غیره
    - [x] **فقط `en.json`** — ترجمه‌های دیگر از طریق Weblate (طبق CONTRIBUTING.md)

### تسک ۴.۲: تست‌های دستی

- **عملیات**:
    - [x] تست لاگین با هر نقش و بررسی دسترسی‌ها
    - [x] تست اینکه viewer نمی‌تواند start/stop کند (سمت سرور)
    - [x] تست اینکه operator نمی‌تواند compose.yaml ویرایش کند
    - [x] تست اینکه manager نمی‌تواند تنظیمات سیستم را تغییر دهد
    - [x] تست اینکه کاربران فقط استک‌های اختصاصی خود را می‌بینند
    - [x] تست backward compatibility: کاربران فعلی بعد از مایگریشن admin هستند
    - [x] تست عملکرد agent proxy با مجوزهای مختلف
    - [x] تست حالت `disableAuth` با RBAC

---

## فاز ۵: مستندات و بهبود

### تسک ۵.۱: مستندات کاربری

- **فایل**: `docs/RBAC-user-guide.md` (جدید)
- **عملیات**:
    - [x] راهنمای استفاده از سیستم نقش‌ها
    - [x] توضیح هر نقش و مجوزهای آن
    - [x] اسکرین‌شات‌های UI مدیریت کاربران
    - [x] نمونه سناریوهای استفاده

### تسک ۵.۲: آپدیت README

- **فایل**: `README.md`
- **عملیات**:
    - [x] اضافه کردن بخش RBAC به features
    - [x] لینک به مستندات جدید

---

## خلاصه آمار تغییرات

| نوع                    | تعداد                   |
| ---------------------- | ----------------------- |
| فایل‌های **جدید**       | ≈ 6 فایل                |
| فایل‌های **اصلاح شده**   | ≈ 14 فایل               |
| جداول دیتابیس جدید     | 1 (`user_stack_access`) |
| ستون‌های جدید           | 1 (`user.role`)         |
| تخمین حجم کد           | ~1500-2000 خط           |

---

## ترتیب پیشنهادی اجرا

```
فاز ۱ (زیرساخت)  ──►  فاز ۲ (Backend)  ──►  فاز ۳ (Frontend)  ──►  فاز ۴ (تست)  ──►  فاز ۵ (مستندات)
     │                      │                      │                     │
     ▼                      ▼                      ▼                     ▼
   تسک ۱.۱               تسک ۲.۱                 تسک ۳.۱              تسک ۴.۱
   تسک ۱.۲               تسک ۲.۲                 تسک ۳.۲              تسک ۴.۲
   تسک ۱.۳                 تسک ۲.۳              تسک ۳.۳
                        تسک ۲.۴                 تسک ۳.۴
                        تسک ۲.۵                 تسک ۳.۵
                        تسک ۲.۶                 تسک ۳.۶
                        تسک ۲.۷                 تسک ۳.۷
                        تسک ۲.۸                 تسک ۳.۸
                        تسک ۲.۹                 تسک ۳.۹
                                                تسک ۳.۱۰
```

> ⚠️ **توجه مهم**: طبق CONTRIBUTING.md، قبل از شروع پیاده‌سازی حتماً یک Discussion در GitHub پروژه باز کنید و طرح را با maintainer (@louislam) مطرح کنید. این یک تغییر بزرگ است و بدون تأیید اولیه ممکن است merge نشود.
