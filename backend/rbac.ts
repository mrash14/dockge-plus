/**
 * Role-Based Access Control (RBAC) module for Dockge — v2.
 *
 * Users are either "admin" (full access) or "normal" (access defined per-entry).
 * Each entry in user_stack_access grants an access level (viewer/operator/manager)
 * for a specific (endpoint, stack) pair, with wildcard "*" support.
 *
 * @module rbac
 */
import { R } from "redbean-node";

/**
 * User types — simplified from v1 roles.
 */
export enum UserType {
    ADMIN = "admin",
    NORMAL = "normal",
}

/**
 * Access levels ordered by privilege (lowest to highest).
 */
export enum AccessLevel {
    VIEWER = "viewer",
    OPERATOR = "operator",
    MANAGER = "manager",
}

/**
 * Numeric privilege rank for each access level (higher = more privilege).
 */
const ACCESS_LEVEL_RANK: Record<string, number> = {
    [AccessLevel.VIEWER]: 1,
    [AccessLevel.OPERATOR]: 2,
    [AccessLevel.MANAGER]: 3,
};

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
 * Permissions granted to admin users (all permissions).
 */
const ADMIN_PERMISSIONS: Permission[] = Object.values(Permission);

/**
 * Mapping of each access level to its granted permissions.
 */
export const ACCESS_LEVEL_PERMISSIONS: Record<AccessLevel, Permission[]> = {
    [AccessLevel.MANAGER]: [
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
    [AccessLevel.OPERATOR]: [
        Permission.STACK_VIEW,
        Permission.STACK_START,
        Permission.STACK_STOP,
        Permission.STACK_RESTART,
        Permission.STACK_UPDATE,
        Permission.STACK_LOGS,
    ],
    [AccessLevel.VIEWER]: [
        Permission.STACK_VIEW,
        Permission.STACK_LOGS,
    ],
};

/**
 * List of all valid user type values for validation.
 */
export const VALID_USER_TYPES: string[] = Object.values(UserType);

/**
 * List of all valid access level values for validation.
 */
export const VALID_ACCESS_LEVELS: string[] = Object.values(AccessLevel);

/**
 * Check if an admin or a specific access level grants a permission.
 * @param {string} userType - "admin" or "normal"
 * @param {string | null} accessLevel - The access level (only used for normal users)
 * @param {Permission} permission - The permission to check
 * @returns {boolean}
 */
export function hasPermission(userType: string, accessLevel: string | null, permission: Permission): boolean {
    if (userType === UserType.ADMIN) {
        return ADMIN_PERMISSIONS.includes(permission);
    }
    if (!accessLevel) {
        return false;
    }
    const level = accessLevel as AccessLevel;
    const permissions = ACCESS_LEVEL_PERMISSIONS[level];
    if (!permissions) {
        return false;
    }
    return permissions.includes(permission);
}

/**
 * Get the effective access level for a user on a specific stack.
 * Considers wildcard entries and returns the highest matching level.
 *
 * Priority order (all are checked, highest wins):
 *   1. endpoint="*", stack_name="*"  → applies to everything
 *   2. endpoint=E,   stack_name="*"  → applies to all stacks on endpoint E
 *   3. endpoint=E,   stack_name=S    → applies to specific stack S on endpoint E
 *
 * @param {number} userId
 * @param {string} stackName
 * @param {string} endpoint - Empty string for local
 * @returns {Promise<string | null>} The highest access level, or null if no access
 */
export async function getEffectiveAccessLevel(userId: number, stackName: string, endpoint: string = ""): Promise<string | null> {
    const rows = await R.getAll(
        `SELECT access_level FROM user_stack_access
         WHERE user_id = ?
           AND (endpoint = ? OR endpoint = '*')
           AND (stack_name = ? OR stack_name = '*')`,
        [userId, endpoint, stackName]
    );

    if (rows.length === 0) {
        return null;
    }

    // Find the highest access level among all matching entries
    let highestRank = 0;
    let highestLevel: string | null = null;
    for (const row of rows) {
        const rank = ACCESS_LEVEL_RANK[row.access_level] || 0;
        if (rank > highestRank) {
            highestRank = rank;
            highestLevel = row.access_level;
        }
    }

    return highestLevel;
}

/**
 * Check if a user has access to a specific stack.
 * Admin users have access to all stacks.
 * Normal users must have at least one matching entry in user_stack_access.
 *
 * @param {number} userId
 * @param {string} userType - "admin" or "normal"
 * @param {string} stackName
 * @param {string} endpoint - Empty string for local
 * @returns {Promise<boolean>}
 */
export async function hasStackAccess(userId: number, userType: string, stackName: string, endpoint: string = ""): Promise<boolean> {
    if (userType === UserType.ADMIN) {
        return true;
    }

    const level = await getEffectiveAccessLevel(userId, stackName, endpoint);
    return level !== null;
}

/**
 * Check if a user has a specific permission on a specific stack.
 * This combines stack access check with permission check.
 *
 * @param {number} userId
 * @param {string} userType
 * @param {Permission} permission
 * @param {string} stackName
 * @param {string} endpoint
 * @returns {Promise<boolean>}
 */
export async function hasStackPermission(userId: number, userType: string, permission: Permission, stackName: string, endpoint: string = ""): Promise<boolean> {
    if (userType === UserType.ADMIN) {
        return true;
    }

    const level = await getEffectiveAccessLevel(userId, stackName, endpoint);
    if (!level) {
        return false;
    }

    return hasPermission(userType, level, permission);
}

/**
 * Get the list of stack names a user has access to for a given endpoint.
 * Admin users return null (meaning all stacks).
 * If the user has a wildcard entry for the endpoint, also returns null.
 *
 * @param {number} userId
 * @param {string} userType
 * @param {string} endpoint - Empty string for local
 * @returns {Promise<string[] | null>} List of stack names, or null for all access
 */
export async function getAccessibleStackNames(userId: number, userType: string, endpoint: string = ""): Promise<string[] | null> {
    if (userType === UserType.ADMIN) {
        return null;
    }

    // Check for wildcard entries first
    const wildcardAll = await R.findOne("user_stack_access",
        " user_id = ? AND endpoint = '*' AND stack_name = '*' ",
        [userId]
    );
    if (wildcardAll) {
        return null; // Access to all stacks on all endpoints
    }

    const wildcardEndpoint = await R.findOne("user_stack_access",
        " user_id = ? AND endpoint = ? AND stack_name = '*' ",
        [userId, endpoint]
    );
    if (wildcardEndpoint) {
        return null; // Access to all stacks on this endpoint
    }

    const rows = await R.getAll(
        "SELECT stack_name FROM user_stack_access WHERE user_id = ? AND (endpoint = ? OR endpoint = '*')",
        [userId, endpoint]
    );

    return rows
        .map((row: { stack_name: string }) => row.stack_name)
        .filter((name: string) => name !== "*");
}
