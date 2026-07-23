/**
 * Role-Based Access Control (RBAC) module for Dockge.
 *
 * Defines roles, permissions, and provides functions to check
 * whether a given role has a specific permission and whether
 * a user has access to a specific stack.
 *
 * @module rbac
 */
import { R } from "redbean-node";

/**
 * User roles ordered by privilege level (highest to lowest).
 */
export enum Role {
    ADMIN = "admin",
    MANAGER = "manager",
    OPERATOR = "operator",
    VIEWER = "viewer",
}

/**
 * All available permissions in the system.
 * Naming convention: `RESOURCE_ACTION`
 */
export enum Permission {
    // Stack permissions
    STACK_VIEW = "stack.view",
    STACK_CREATE = "stack.create",
    STACK_EDIT = "stack.edit",
    STACK_DELETE = "stack.delete",
    STACK_START = "stack.start",
    STACK_STOP = "stack.stop",
    STACK_RESTART = "stack.restart",
    STACK_UPDATE = "stack.update",
    STACK_LOGS = "stack.logs",

    // Terminal permissions
    TERMINAL_EXEC = "terminal.exec",
    TERMINAL_CONSOLE = "terminal.console",

    // Agent permissions
    AGENT_MANAGE = "agent.manage",

    // Settings permissions
    SETTINGS_VIEW = "settings.view",
    SETTINGS_EDIT = "settings.edit",

    // User management permissions
    USER_MANAGE = "user.manage",
}

/**
 * Mapping of each role to its granted permissions.
 * Admin gets all permissions. Other roles get a subset.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    [Role.ADMIN]: Object.values(Permission),
    [Role.MANAGER]: [
        Permission.STACK_VIEW,
        Permission.STACK_CREATE,
        Permission.STACK_EDIT,
        Permission.STACK_DELETE,
        Permission.STACK_START,
        Permission.STACK_STOP,
        Permission.STACK_RESTART,
        Permission.STACK_UPDATE,
        Permission.STACK_LOGS,
        Permission.TERMINAL_EXEC,
    ],
    [Role.OPERATOR]: [
        Permission.STACK_VIEW,
        Permission.STACK_START,
        Permission.STACK_STOP,
        Permission.STACK_RESTART,
        Permission.STACK_UPDATE,
        Permission.STACK_LOGS,
    ],
    [Role.VIEWER]: [
        Permission.STACK_VIEW,
        Permission.STACK_LOGS,
    ],
};

/**
 * List of all valid role values for validation.
 */
export const VALID_ROLES: string[] = Object.values(Role);

/**
 * Check if a role has a specific permission.
 * @param {string} role - The user's role
 * @param {Permission} permission - The permission to check
 * @returns {boolean} Whether the role has the permission
 */
export function hasPermission(role: string, permission: Permission): boolean {
    const roleEnum = role as Role;
    const permissions = ROLE_PERMISSIONS[roleEnum];
    if (!permissions) {
        return false;
    }
    return permissions.includes(permission);
}

/**
 * Check if a user has access to a specific stack.
 * Admin users have access to all stacks.
 * Other users must have an explicit entry in user_stack_access.
 *
 * @param {number} userId - The user's ID
 * @param {string} role - The user's role
 * @param {string} stackName - The name of the stack
 * @param {string} endpoint - The endpoint (empty string for local)
 * @returns {Promise<boolean>} Whether the user has access to the stack
 */
export async function hasStackAccess(userId: number, role: string, stackName: string, endpoint: string = ""): Promise<boolean> {
    // Admin has access to all stacks
    if (role === Role.ADMIN) {
        return true;
    }

    const access = await R.findOne("user_stack_access",
        " user_id = ? AND stack_name = ? AND endpoint = ? ",
        [userId, stackName, endpoint]
    );

    return !!access;
}

/**
 * Get the list of stack names a user has access to for a given endpoint.
 * Admin users return null (meaning all stacks).
 *
 * @param {number} userId - The user's ID
 * @param {string} role - The user's role
 * @param {string} endpoint - The endpoint (empty string for local)
 * @returns {Promise<string[] | null>} List of stack names, or null for admin (all access)
 */
export async function getAccessibleStackNames(userId: number, role: string, endpoint: string = ""): Promise<string[] | null> {
    // Admin has access to all stacks
    if (role === Role.ADMIN) {
        return null;
    }

    const rows = await R.getAll(
        "SELECT stack_name FROM user_stack_access WHERE user_id = ? AND endpoint = ?",
        [userId, endpoint]
    );

    return rows.map((row: { stack_name: string }) => row.stack_name);
}
