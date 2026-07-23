import { R } from "redbean-node";

export const UserType = {
    ADMIN: "admin",
    NORMAL: "normal",
};

export const AccessLevel = {
    VIEWER: "viewer",
    OPERATOR: "operator",
    MANAGER: "manager",
};

export const VALID_USER_TYPES = Object.values(UserType);
export const VALID_ACCESS_LEVELS = Object.values(AccessLevel);

export const Permission = {
    STACK_VIEW: "stack.view",
    STACK_START: "stack.start",
    STACK_STOP: "stack.stop",
    STACK_RESTART: "stack.restart",
    STACK_CREATE: "stack.create",
    STACK_EDIT: "stack.edit",
    STACK_UPDATE: "stack.update",
    STACK_DELETE: "stack.delete",
    STACK_LOGS: "stack.logs",
    USER_MANAGE: "user.manage",
    AGENT_MANAGE: "agent.manage",
    TERMINAL_CONSOLE: "terminal.console",
    TERMINAL_EXEC: "terminal.exec",
    SETTINGS_EDIT: "settings.edit",
};

export function hasPermission(userType: string, accessLevel: string | null, permission: string): boolean {
    if (userType === UserType.ADMIN) {
        return true;
    }

    if (userType === UserType.NORMAL) {
        if (!accessLevel) {
            return false;
        }

        switch (accessLevel) {
            case AccessLevel.VIEWER:
                return [Permission.STACK_VIEW, Permission.STACK_LOGS].includes(permission);
            case AccessLevel.OPERATOR:
                return [
                    Permission.STACK_VIEW,
                    Permission.STACK_LOGS,
                    Permission.STACK_START,
                    Permission.STACK_STOP,
                    Permission.STACK_RESTART
                ].includes(permission);
            case AccessLevel.MANAGER:
                return [
                    Permission.STACK_VIEW,
                    Permission.STACK_LOGS,
                    Permission.STACK_START,
                    Permission.STACK_STOP,
                    Permission.STACK_RESTART,
                    Permission.STACK_CREATE,
                    Permission.STACK_EDIT,
                    Permission.STACK_UPDATE,
                    Permission.STACK_DELETE,
                    Permission.TERMINAL_EXEC
                ].includes(permission);
            default:
                return false;
        }
    }

    return false;
}

export async function hasStackAccess(userId: number, userType: string, stackName: string, endpoint: string = ""): Promise<boolean> {
    if (userType === UserType.ADMIN) {
        return true;
    }

    const access = await R.findOne("user_stack_access", 
        " user_id = ? AND (endpoint = ? OR endpoint = '*') AND (stack_name = ? OR stack_name = '*') ", 
        [userId, endpoint, stackName]
    );

    return !!access;
}

export async function getEffectiveAccessLevel(userId: number, stackName: string, endpoint: string = ""): Promise<string | null> {
    const access = await R.findOne("user_stack_access", 
        " user_id = ? AND (endpoint = ? OR endpoint = '*') AND (stack_name = ? OR stack_name = '*') ORDER BY access_level DESC ", 
        [userId, endpoint, stackName]
    );

    return access ? access.access_level : null;
}

export async function hasStackPermission(userId: number, userType: string, stackName: string, endpoint: string, permission: string): Promise<boolean> {
    if (userType === UserType.ADMIN) {
        return true;
    }

    const accessLevel = await getEffectiveAccessLevel(userId, stackName, endpoint);
    return hasPermission(userType, accessLevel, permission);
}

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
        " user_id = ? AND (endpoint = ? OR endpoint = '*') AND stack_name = '*' ",
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
        .map((row: any) => row.stack_name)
        .filter((name: string) => name !== "*");
}
