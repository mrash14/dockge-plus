/**
 * RBAC v2 Unit Tests
 * Tests for UserType/AccessLevel-based permission system with wildcard support.
 */
import { describe, it, before, afterEach } from "mocha";
import assert from "assert";
import { hasPermission, hasStackAccess, hasStackPermission, getEffectiveAccessLevel, getAccessibleStackNames, Permission, UserType, AccessLevel } from "./rbac";
import { R } from "redbean-node";

// Mock redbean-node for testing
let mockData: Array<{ user_id: number; stack_name: string; endpoint: string; access_level: string }> = [];

before(() => {
    const ACCESS_LEVEL_RANK: Record<string, number> = {
        manager: 3,
        operator: 2,
        viewer: 1,
    };

    // Override R.findOne and R.getAll to use mockData
    (R as unknown as Record<string, unknown>).findOne = async (table: string, condition: string, params: unknown[]) => {
        if (table === "user_stack_access") {
            const userId = (params as number[])[0];

            // For wildcard-only queries (e.g. getAccessibleStackNames wildcard checks)
            const strictEndpointWildcard = condition.includes("endpoint = '*'") && !condition.includes("endpoint = ?");
            const strictStackWildcard = condition.includes("stack_name = '*'") && !condition.includes("stack_name = ?");

            let candidates = mockData.filter(row => {
                if (row.user_id !== userId) {
                    return false;
                }

                const endpointParam = (params as string[])[1];
                const stackNameParam = (params as string[])[2];

                // Strict wildcard-only checks
                if (strictEndpointWildcard && row.endpoint !== "*") {
                    return false;
                }
                if (strictStackWildcard && row.stack_name !== "*") {
                    return false;
                }

                // Flexible endpoint match: exact OR wildcard
                if (!strictEndpointWildcard && endpointParam !== undefined) {
                    if (row.endpoint !== endpointParam && row.endpoint !== "*") {
                        return false;
                    }
                }

                // Flexible stack_name match: exact OR wildcard
                if (!strictStackWildcard && stackNameParam !== undefined) {
                    if (row.stack_name !== stackNameParam && row.stack_name !== "*") {
                        return false;
                    }
                }

                return true;
            });

            if (candidates.length === 0) {
                return null;
            }

            // Return highest access level match (mirrors ORDER BY CASE ... DESC)
            candidates.sort((a, b) =>
                (ACCESS_LEVEL_RANK[b.access_level] ?? 0) - (ACCESS_LEVEL_RANK[a.access_level] ?? 0)
            );
            return candidates[0];
        }
        return null;
    };

    (R as unknown as Record<string, unknown>).getAll = async (query: string, params: unknown[]) => {
        const userId = (params as number[])[0];
        let results = mockData.filter(row => row.user_id === userId);

        if (query.includes("access_level FROM")) {
            const endpoint = (params as string[])[1];
            const stackName = (params as string[])[2];
            results = results.filter(row =>
                (row.endpoint === endpoint || row.endpoint === "*") &&
                (row.stack_name === stackName || row.stack_name === "*")
            );
        } else if (query.includes("stack_name FROM")) {
            const endpoint = (params as string[])[1];
            results = results.filter(row =>
                row.endpoint === endpoint || row.endpoint === "*"
            );
        }

        return results;
    };
});

afterEach(() => {
    mockData = [];
});

describe("hasPermission", () => {
    it("admin has all permissions", () => {
        assert.strictEqual(hasPermission(UserType.ADMIN, null, Permission.STACK_VIEW), true);
        assert.strictEqual(hasPermission(UserType.ADMIN, null, Permission.USER_MANAGE), true);
        assert.strictEqual(hasPermission(UserType.ADMIN, null, Permission.SETTINGS_EDIT), true);
        assert.strictEqual(hasPermission(UserType.ADMIN, null, Permission.TERMINAL_CONSOLE), true);
    });

    it("normal user with no access level has no permissions", () => {
        assert.strictEqual(hasPermission(UserType.NORMAL, null, Permission.STACK_VIEW), false);
        assert.strictEqual(hasPermission(UserType.NORMAL, null, Permission.USER_MANAGE), false);
    });

    it("viewer access level can view and see logs", () => {
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.VIEWER, Permission.STACK_VIEW), true);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.VIEWER, Permission.STACK_LOGS), true);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.VIEWER, Permission.STACK_START), false);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.VIEWER, Permission.STACK_DELETE), false);
    });

    it("operator access level can start/stop/restart", () => {
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.OPERATOR, Permission.STACK_VIEW), true);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.OPERATOR, Permission.STACK_START), true);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.OPERATOR, Permission.STACK_STOP), true);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.OPERATOR, Permission.STACK_RESTART), true);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.OPERATOR, Permission.STACK_CREATE), false);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.OPERATOR, Permission.STACK_DELETE), false);
    });

    it("manager access level can create/edit/delete", () => {
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.MANAGER, Permission.STACK_VIEW), true);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.MANAGER, Permission.STACK_CREATE), true);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.MANAGER, Permission.STACK_EDIT), true);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.MANAGER, Permission.STACK_DELETE), true);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.MANAGER, Permission.TERMINAL_EXEC), true);
    });

    it("no access level grants admin-only permissions", () => {
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.MANAGER, Permission.USER_MANAGE), false);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.MANAGER, Permission.AGENT_MANAGE), false);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.MANAGER, Permission.TERMINAL_CONSOLE), false);
        assert.strictEqual(hasPermission(UserType.NORMAL, AccessLevel.MANAGER, Permission.SETTINGS_EDIT), false);
    });
});

describe("getEffectiveAccessLevel", () => {
    it("returns null for user with no access entries", async () => {
        const level = await getEffectiveAccessLevel(1, "my-stack", "");
        assert.strictEqual(level, null);
    });

    it("returns exact match access level", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "my-stack",
                endpoint: "",
                access_level: "operator" },
        ];
        const level = await getEffectiveAccessLevel(1, "my-stack", "");
        assert.strictEqual(level, "operator");
    });

    it("returns wildcard endpoint+stack match", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "*",
                endpoint: "*",
                access_level: "viewer" },
        ];
        const level = await getEffectiveAccessLevel(1, "any-stack", "any-endpoint");
        assert.strictEqual(level, "viewer");
    });

    it("returns wildcard stack match for specific endpoint", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "*",
                endpoint: "http://agent1:5001",
                access_level: "operator" },
        ];
        const level = await getEffectiveAccessLevel(1, "my-stack", "http://agent1:5001");
        assert.strictEqual(level, "operator");
    });

    it("returns the HIGHEST access level when multiple entries match", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "*",
                endpoint: "*",
                access_level: "viewer" },       // global viewer
            { user_id: 1,
                stack_name: "my-stack",
                endpoint: "",
                access_level: "manager" }, // specific manager
        ];
        const level = await getEffectiveAccessLevel(1, "my-stack", "");
        assert.strictEqual(level, "manager");
    });

    it("wildcard match does not override a higher specific match", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "*",
                endpoint: "",
                access_level: "manager" },     // all stacks on local = manager
            { user_id: 1,
                stack_name: "my-stack",
                endpoint: "",
                access_level: "viewer" }, // specific stack = viewer
        ];
        // Highest should still be manager
        const level = await getEffectiveAccessLevel(1, "my-stack", "");
        assert.strictEqual(level, "manager");
    });

    it("does not match wrong endpoint", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "my-stack",
                endpoint: "http://agent1:5001",
                access_level: "operator" },
        ];
        const level = await getEffectiveAccessLevel(1, "my-stack", "");
        assert.strictEqual(level, null);
    });
});

describe("hasStackAccess", () => {
    it("admin always has access", async () => {
        assert.strictEqual(await hasStackAccess(1, UserType.ADMIN, "any-stack", "any-endpoint"), true);
    });

    it("normal user with no entries has no access", async () => {
        assert.strictEqual(await hasStackAccess(1, UserType.NORMAL, "my-stack", ""), false);
    });

    it("normal user with exact entry has access", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "my-stack",
                endpoint: "",
                access_level: "viewer" },
        ];
        assert.strictEqual(await hasStackAccess(1, UserType.NORMAL, "my-stack", ""), true);
    });

    it("normal user with wildcard entry has access to any stack", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "*",
                endpoint: "*",
                access_level: "viewer" },
        ];
        assert.strictEqual(await hasStackAccess(1, UserType.NORMAL, "any-stack", "any-endpoint"), true);
    });
});

describe("hasStackPermission", () => {
    it("admin has all permissions on any stack", async () => {
        assert.strictEqual(await hasStackPermission(1, UserType.ADMIN, "my-stack", "", Permission.STACK_DELETE), true);
    });

    it("normal user viewer cannot start stack", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "my-stack",
                endpoint: "",
                access_level: "viewer" },
        ];
        assert.strictEqual(await hasStackPermission(1, UserType.NORMAL, "my-stack", "", Permission.STACK_START), false);
    });

    it("normal user operator can start stack", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "my-stack",
                endpoint: "",
                access_level: "operator" },
        ];
        assert.strictEqual(await hasStackPermission(1, UserType.NORMAL, "my-stack", "", Permission.STACK_START), true);
    });

    it("normal user manager can delete stack", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "my-stack",
                endpoint: "",
                access_level: "manager" },
        ];
        assert.strictEqual(await hasStackPermission(1, UserType.NORMAL, "my-stack", "", Permission.STACK_DELETE), true);
    });

    it("highest access level applies when multiple entries match", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "*",
                endpoint: "*",
                access_level: "viewer" },
            { user_id: 1,
                stack_name: "my-stack",
                endpoint: "",
                access_level: "operator" },
        ];
        // Operator can start, viewer cannot → result should be true (highest = operator)
        assert.strictEqual(await hasStackPermission(1, UserType.NORMAL, "my-stack", "", Permission.STACK_START), true);
    });
});

describe("getAccessibleStackNames", () => {
    it("admin returns null (all access)", async () => {
        const result = await getAccessibleStackNames(1, UserType.ADMIN, "");
        assert.strictEqual(result, null);
    });

    it("normal user with no entries returns empty array", async () => {
        const result = await getAccessibleStackNames(1, UserType.NORMAL, "");
        assert.deepStrictEqual(result, []);
    });

    it("normal user with wildcard all returns null", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "*",
                endpoint: "*",
                access_level: "viewer" },
        ];
        const result = await getAccessibleStackNames(1, UserType.NORMAL, "");
        assert.strictEqual(result, null);
    });

    it("normal user with specific entries returns those stack names", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "stack-a",
                endpoint: "",
                access_level: "viewer" },
            { user_id: 1,
                stack_name: "stack-b",
                endpoint: "",
                access_level: "operator" },
        ];
        const result = await getAccessibleStackNames(1, UserType.NORMAL, "");
        assert.deepStrictEqual(result?.sort(), [ "stack-a", "stack-b" ]);
    });

    it("normal user with wildcard on specific endpoint returns null for that endpoint", async () => {
        mockData = [
            { user_id: 1,
                stack_name: "*",
                endpoint: "http://agent1:5001",
                access_level: "viewer" },
        ];
        const result = await getAccessibleStackNames(1, UserType.NORMAL, "http://agent1:5001");
        assert.strictEqual(result, null);
    });
});
