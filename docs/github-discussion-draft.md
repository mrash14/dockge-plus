# [Feature Request / Discussion] Role-Based Access Control (RBAC) for Multi-User Environments

## The Problem

Dockge is an amazing tool for managing Docker Compose stacks, especially with its multi-agent architecture. However, in environments where multiple users need access to the same Dockge instance, **there is no way to restrict what a user can see or do**.

Currently, every logged-in user has full admin-level access:
- Can see **all** stacks across all agents
- Can **create, edit, and delete** any stack
- Can **start, stop, and restart** any container
- Can open an **interactive terminal** (exec) into any container
- Can modify **system settings** and manage agents

### Real-World Use Case

I manage multiple servers through Dockge and need to give limited access to different team members:

- **Developer A** should only see and manage their own project's containers (e.g., `webapp-frontend`, `webapp-backend`), but not touch production databases or other team's stacks.
- **Monitoring operator** should be able to view logs and restart a stuck service, but should **not** be able to edit `compose.yaml` or delete stacks.
- **Junior team member** should only have **read-only** access — view stack status and logs, nothing more.

None of this is currently possible.

## Implemented Solution: Two-Tiered Role-Based Access Control

We have added a flexible, two-tiered RBAC system to Dockge:

1. **Global User Type**: Determines global privileges (`admin` vs `normal`).
2. **Per-Stack Access Level**: Grants specific operational rights to `normal` users on a per-stack (or wildcard) basis.

### 1. Global User Types
| Role | Description |
|------|-------------|
| **admin** | Full access to all stacks, agents, system settings, and user management. |
| **normal** | Limited access. Cannot see stacks or agents by default. Only sees explicitly assigned stacks. |

### 2. Stack Access Levels (For Normal Users)
For any `normal` user, an admin can assign access to a specific stack (or all stacks via `*` wildcard) on a specific agent (or all agents via `*` wildcard) with one of the following levels:

| Access Level | Description |
|------|-------------|
| **manager** | Can create, edit, delete, deploy, and operate the assigned stack. |
| **operator** | Can start/stop/restart and view logs. Cannot edit or deploy. |
| **viewer** | Read-only. Can view stack status and logs. |

### Key Design Decisions

1. **Granular Access Control**: Non-admin users only see and interact with stacks explicitly assigned to them (per user + per endpoint).
2. **Server-side Enforcement**: All permission checks happen securely in socket handlers on the backend. The frontend hides UI elements for better UX, but security is strictly server-side.
3. **Endpoint Filtering**: Agent servers are dynamically filtered so a normal user only sees the endpoints that host stacks they have access to.
4. **Backward Compatibility**: Existing users get `admin` user type by default via database migration — zero disruption on upgrade.
5. **Simple DB Schema**: Just one new column (`user.user_type`) and one new table (`user_stack_access`).
6. **User Management UI**: A new settings page for admins to manage users and configure granular stack access (Server, Stack, Access Level).

### Permission Matrix

| Permission | admin | normal + manager | normal + operator | normal + viewer |
|---|:---:|:---:|:---:|:---:|
| View assigned stacks | ✅ | ✅ | ✅ | ✅ |
| View logs | ✅ | ✅ | ✅ | ✅ |
| Start / Stop / Restart | ✅ | ✅ | ✅ | ❌ |
| Update (pull + redeploy) | ✅ | ✅ | ❌ | ❌ |
| Create new stack | ✅ | ✅ | ❌ | ❌ |
| Edit compose.yaml | ✅ | ✅ | ❌ | ❌ |
| Delete stack | ✅ | ✅ | ❌ | ❌ |
| Container terminal (exec) | ✅ | ❌ | ❌ | ❌ |
| System console | ✅ | ❌ | ❌ | ❌ |
| Manage agents | ✅ | ❌ | ❌ | ❌ |
| System settings | ✅ | ❌ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ | ❌ |

## Scope of Changes

I've done a thorough analysis of the codebase. Here's a summary of what would need to change:

### Backend (~10 files)
- **1 new migration** — add `role` column to `user` table + create `user_stack_access` table
- **1 new module** (`rbac.ts`) — role/permission definitions and check functions
- **1 new socket handler** — user management (CRUD users, assign stack access)
- **6 modified files** — replace `checkLogin()` with `checkPermission()` + `checkStackAccess()` in all socket handlers; filter `sendStackList()` per user

### Frontend (~8 files)
- **3 new components** — User management page, user edit dialog, stack access dialog
- **5 modified files** — conditionally hide/show UI elements based on user role

### Design Principles (aligned with CONTRIBUTING.md)
- ✅ No breaking changes (backward compatible migration)
- ✅ Settings configurable in frontend (user management UI in Settings page)
- ✅ Easy to use (simple role selection dropdown)
- ✅ Consistent UI (reusing existing Bootstrap components)
- ✅ No native build dependencies
- ✅ Following all coding style conventions (camelCase JS, snake_case SQLite, JSDoc)

## Current Status

I've already forked the project and started working on this in my fork. I'd love to get your feedback on the approach before investing more time, and I'm happy to submit a PR if the direction looks good to you.

### Questions for @louislam

1. **Are you open to adding RBAC?** I know this is a significant feature — happy to discuss scope reduction if needed.
2. **4 roles vs. simpler model?** Would you prefer starting with just `admin` + `viewer` (or `admin` + `read-only`) as a first step?
3. **Stack-level access**: Is per-stack assignment the right granularity, or would you prefer something simpler like "access to all stacks" vs "no access"?
4. **User management**: Currently there's only one user created during setup. Should we add multi-user support as part of this, or is that already planned separately?

Looking forward to your thoughts! 🙏
