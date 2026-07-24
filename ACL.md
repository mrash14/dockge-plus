# Dockge Role-Based Access Control (RBAC) User Guide

Dockge supports a two-tiered Role-Based Access Control (RBAC) system, allowing you to define global privileges and fine-grained, per-stack access levels.

## 1. Global User Types

Every user in Dockge is assigned one of two global user types:

1. **Admin**
    - Has full access to the entire system.
    - Can manage settings, users, and agents.
    - Can view and manage all stacks without explicit stack access configuration.
    - Has full terminal and console access.

2. **Normal**
    - Has restricted access to the system.
    - Cannot manage system settings, users, or agents.
    - Cannot see or access any stacks by default.
    - Must be explicitly granted per-stack access to interact with Docker resources.

## 2. Per-Stack Access Levels

By default, Normal users **cannot see or access any stacks or agents**. You must explicitly grant them access to specific stacks, choosing one of the following Access Levels for each grant:

1. **Manager**
    - Can create, edit, update, delete, and operate the assigned stack.
2. **Operator**
    - Can start, stop, restart, and update the assigned stack.
    - Cannot create, edit (compose.yaml), or delete the stack.
3. **Viewer**
    - Read-only access.
    - Can view the assigned stack's status and container logs.
    - Cannot make any changes or execute commands.

## Stack Access Configuration

To grant a Normal user access to a stack:

1. Go to **Settings > Users** (requires Admin access).
2. Click the **Key icon (Stack Access)** next to a Normal user.
3. Add an entry for the stack the user should have access to:
    - **Endpoint**: The name/URL of the Dockge agent the stack is located on. Use `*` to grant access to the stack across all endpoints. Leave empty for the primary server.
    - **Stack Name**: The exact name of the stack. Use `*` to grant access to all stacks on the specified endpoint.
    - **Access Level**: Select Viewer, Operator, or Manager for this specific grant.

Once access is granted, the user will see the allowed stacks in their dashboard and can perform actions according to the chosen Access Level.

## Multi-Agent RBAC

Dockge's RBAC system seamlessly works across multiple agents natively.

When a user on the primary Dockge server attempts to perform an action on a stack located on a remote agent:
1. The primary server verifies the user's role and stack access level.
2. The primary server dynamically filters endpoint availability based on the user's grants.
3. If approved, the primary server proxies the action to the remote agent securely.

This means you only need to manage your users and their access rules on your **primary Dockge instance**. The remote agents do not need to know about your users.

## Security Considerations

- **Global Console & Exec**: The main console terminal and interactive container terminals (exec) are restricted strictly to Admins, as they provide host-level access to Docker.
- **Backward Compatibility**: Any users created prior to the RBAC update will automatically be assigned the `Admin` role to preserve their existing access.
- **Agent Proxies**: External requests and server lists are validated locally and securely filtered before being sent over the proxy connection to the user's browser, ensuring isolated security.
