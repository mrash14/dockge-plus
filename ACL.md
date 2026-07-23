# Dockge Role-Based Access Control (RBAC) User Guide

Dockge now supports Role-Based Access Control (RBAC), allowing you to define fine-grained access levels and control which stacks each user can see and manage.

## Roles

Every user in Dockge is assigned one of four roles. Roles define the _actions_ a user can perform globally:

1. **Admin**
    - Has full access to the system.
    - Can manage settings, users, and agents.
    - Can view and manage all stacks without explicit stack access configuration.
    - Has full terminal and console access.

2. **Manager**
    - Can create, edit, and delete stacks.
    - Can start, stop, restart, and update stacks.
    - Can view stack logs and access the interactive terminal inside containers (`bash`/`sh`).
    - Cannot manage system settings or other users.

3. **Operator**
    - Can start, stop, restart, and update stacks.
    - Can view stacks and logs.
    - Cannot create, edit, or delete stacks.
    - Cannot access the interactive terminal.

4. **Viewer**
    - Read-only access.
    - Can view stacks and container logs.
    - Cannot make any changes or execute commands.

## Stack Access Configuration

By default, non-admin users (Manager, Operator, Viewer) **cannot see or access any stacks**. You must explicitly grant them access to specific stacks.

1. Go to **Settings > Users** (requires Admin access).
2. Click the **Key icon (Stack Access)** next to a user.
3. Add entries for the stacks the user should have access to:
    - **Stack Name**: The exact name of the stack.
    - **Endpoint**: The name of the Dockge agent the stack is located on. Leave this field empty if the stack is on the local/primary Dockge instance.

Once access is granted, the user will see these stacks in their dashboard and can perform actions on them according to their role.

## Multi-Agent RBAC

Dockge's RBAC system seamlessly works across multiple agents.

When a user on the primary Dockge server attempts to perform an action on a stack located on a remote agent:

1. The primary server verifies the user's role allows the action.
2. The primary server verifies the user has been granted access to that specific stack on that specific endpoint.
3. If approved, the primary server proxies the action to the remote agent securely using the agent's authentication.

This means you only need to manage your users and their access rules on your **primary Dockge instance**. The remote agents do not need to know about your users.

## Security Considerations

- **Global Console**: The main console terminal (via the top menu) is restricted strictly to Admins, as it provides host-level access to Docker.
- **Backward Compatibility**: Any users created prior to the RBAC update will automatically be assigned the `Admin` role to preserve their existing access.
- **Agent Proxies**: External requests are validated locally before being sent over the proxy connection to agents, ensuring isolated security.
