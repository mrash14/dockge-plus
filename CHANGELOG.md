# Changelog - Dockge-plus

All notable changes to **Dockge-plus** will be documented in this file.

---

## [2.0.0] - 2.0.0 Major Release

### 🚀 Major Features & Enhancements

#### 🔐 Role-Based Access Control (RBAC) System
- **Two-Tiered User Architecture:** Introduced `Admin` and `Normal` global user types.
- **Per-Stack Access Levels:** Fine-grained authorization per stack:
  - `Manager`: Full management rights (create, edit compose.yaml, delete, operate).
  - `Operator`: Operational rights (start, stop, restart, update).
  - `Viewer`: Read-only access to stack status and container logs.
- **Agent Proxy Authorization:** Primary server validates user roles and stack grants before proxying actions to remote agents.
- **User Management UI:** Built dedicated Settings panel (`UserManagement.vue`) for Admin users to manage accounts and stack access grants.
- **Database Schema Migration:** Added `user_stack_access` table and `role` column to the `user` table.

#### 🇮🇷 Full Persian (RTL) & Arabic Support
- **Persian Localization:** Added complete `fa.json` UI translations.
- **RTL Layout Engine:** Integrated `postcss-rtlcss` and standard **Vazirmatn** font for RTL rendering.
- **Arabic Language Support:** Configured RTL locale handling for Arabic and Persian interface layouts.

#### 📁 Multi-Directory Stack Management
- **Multiple Stack Paths (`DOCKGE_STACKS_DIR`):** Added support for defining multiple comma-separated or colon-separated paths for stack storage.
- **UI Path Display:** Displays stack directory locations clearly in the dashboard interface.

---

### 🛠️ Bug Fixes & Refactoring
- **Frontend State Handling:** Prevented infinite loading UI states on `getStack` errors.
- **Dark Mode UI Tweaks:** Improved text contrast, datalists, and button icons in dark mode.
- **Role Reassignment Fixes:** Resolved edge cases where role changes could bypass socket disconnections.
- **Proxy Event Permission Security:** Prevented unauthorized wildcard stack queries across remote endpoints.

---

### 📦 Branding & Deployment
- Renamed project image paths and repository endpoints to `mrash14/dockge-plus`.
- Updated Docker healthcheck and base image build workflows.
