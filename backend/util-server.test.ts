/**
 * util-server.ts Unit Tests (RBAC v2)
 * Tests for checkPermission, checkStackAccess with the new UserType + AccessLevel system.
 */
import { describe, it, beforeEach } from "mocha";
import assert from "assert";
import { R } from "redbean-node";

// We need to test checkPermission and checkStackAccess
// These functions require a DockgeSocket mock and DB queries

// Mock user data
let mockUser: { id: number; user_type: string; active: number } | null = null;
let mockAccessData: Array<{ user_id: number; stack_name: string; endpoint: string; access_level: string }> = [];

// Import after mocks are set up
import { checkPermission, checkStackAccess, DockgeSocket } from "./util-server";
import { Permission } from "./rbac";

function createMockSocket(userID: number): DockgeSocket {
    return { userID } as unknown as DockgeSocket;
}

describe("checkPermission (util-server)", () => {
    beforeEach(() => {
        mockUser = null;
        mockAccessData = [];

        // Mock R.findOne
        (R as unknown as Record<string, unknown>).findOne = async (table: string, condition: string, params: unknown[]) => {
            if (table === "user") {
                if (mockUser && mockUser.id === (params as number[])[0]) {
                    if (condition.includes("active = 1") && !mockUser.active) {
                        return null;
                    }
                    return mockUser;
                }
                return null;
            }
            if (table === "user_stack_access") {
                const userId = (params as number[])[0];
                const endpointParam = (params as string[])[1];
                const stackParam = (params as string[])[2];

                const strictEndpointWildcard = condition.includes("endpoint = '*'") && !condition.includes("endpoint = ?");
                const strictStackWildcard = condition.includes("stack_name = '*'") && !condition.includes("stack_name = ?");

                const candidates = mockAccessData.filter(row => {
                    if (row.user_id !== userId) {
                        return false;
                    }
                    if (strictEndpointWildcard && row.endpoint !== "*") {
                        return false;
                    }
                    if (strictStackWildcard && row.stack_name !== "*") {
                        return false;
                    }
                    if (!strictEndpointWildcard && endpointParam !== undefined) {
                        if (row.endpoint !== endpointParam && row.endpoint !== "*") {
                            return false;
                        }
                    }
                    if (!strictStackWildcard && stackParam !== undefined) {
                        if (row.stack_name !== stackParam && row.stack_name !== "*") {
                            return false;
                        }
                    }
                    return true;
                });

                if (candidates.length === 0) {
                    return null;
                }
                const rank: Record<string, number> = { manager: 3,
                    operator: 2,
                    viewer: 1 };
                candidates.sort((a, b) => (rank[b.access_level] ?? 0) - (rank[a.access_level] ?? 0));
                return candidates[0];
            }
            return null;
        };

        // Mock R.getAll
        (R as unknown as Record<string, unknown>).getAll = async (query: string, params: unknown[]) => {
            const userId = (params as number[])[0];
            let results = mockAccessData.filter(row => row.user_id === userId);

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

    it("throws if user is not logged in", async () => {
        const socket = createMockSocket(0);
        await assert.rejects(() => checkPermission(socket, Permission.STACK_VIEW), /not logged in/i);
    });

    it("throws if user not found in DB", async () => {
        const socket = createMockSocket(99);
        mockUser = null;
        await assert.rejects(() => checkPermission(socket, Permission.STACK_VIEW), /not found/i);
    });

    it("admin passes any permission check", async () => {
        const socket = createMockSocket(1);
        mockUser = { id: 1,
            user_type: "admin",
            active: 1 };
        await assert.doesNotReject(() => checkPermission(socket, Permission.USER_MANAGE));
        await assert.doesNotReject(() => checkPermission(socket, Permission.SETTINGS_EDIT));
    });

    it("normal user is denied admin-only permissions", async () => {
        const socket = createMockSocket(2);
        mockUser = { id: 2,
            user_type: "normal",
            active: 1 };
        await assert.rejects(() => checkPermission(socket, Permission.USER_MANAGE), /permission denied/i);
    });

    it("inactive user is denied", async () => {
        const socket = createMockSocket(1);
        mockUser = { id: 1,
            user_type: "admin",
            active: 0 };
        await assert.rejects(() => checkPermission(socket, Permission.STACK_VIEW), /not found/i);
    });
});

describe("checkStackAccess (util-server)", () => {
    beforeEach(() => {
        mockUser = null;
        mockAccessData = [];

        // Mock R.findOne
        (R as unknown as Record<string, unknown>).findOne = async (table: string, condition: string, params: unknown[]) => {
            if (table === "user") {
                if (mockUser && mockUser.id === (params as number[])[0]) {
                    if (condition.includes("active = 1") && !mockUser.active) {
                        return null;
                    }
                    return mockUser;
                }
                return null;
            }
            if (table === "user_stack_access") {
                const userId = (params as number[])[0];
                const endpointParam = (params as string[])[1];
                const stackParam = (params as string[])[2];

                const strictEndpointWildcard = condition.includes("endpoint = '*'") && !condition.includes("endpoint = ?");
                const strictStackWildcard = condition.includes("stack_name = '*'") && !condition.includes("stack_name = ?");

                const candidates = mockAccessData.filter(row => {
                    if (row.user_id !== userId) {
                        return false;
                    }
                    if (strictEndpointWildcard && row.endpoint !== "*") {
                        return false;
                    }
                    if (strictStackWildcard && row.stack_name !== "*") {
                        return false;
                    }
                    if (!strictEndpointWildcard && endpointParam !== undefined) {
                        if (row.endpoint !== endpointParam && row.endpoint !== "*") {
                            return false;
                        }
                    }
                    if (!strictStackWildcard && stackParam !== undefined) {
                        if (row.stack_name !== stackParam && row.stack_name !== "*") {
                            return false;
                        }
                    }
                    return true;
                });

                if (candidates.length === 0) {
                    return null;
                }
                const rank: Record<string, number> = { manager: 3,
                    operator: 2,
                    viewer: 1 };
                candidates.sort((a, b) => (rank[b.access_level] ?? 0) - (rank[a.access_level] ?? 0));
                return candidates[0];
            }
            return null;
        };

        // Mock R.getAll
        (R as unknown as Record<string, unknown>).getAll = async (query: string, params: unknown[]) => {
            const userId = (params as number[])[0];
            let results = mockAccessData.filter(row => row.user_id === userId);

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

    it("admin has access to any stack", async () => {
        const socket = createMockSocket(1);
        mockUser = { id: 1,
            user_type: "admin",
            active: 1 };
        await assert.doesNotReject(() => checkStackAccess(socket, "my-stack", ""));
    });

    it("normal user without access entries is denied", async () => {
        const socket = createMockSocket(2);
        mockUser = { id: 2,
            user_type: "normal",
            active: 1 };
        await assert.rejects(() => checkStackAccess(socket, "my-stack", ""), /access denied/i);
    });

    it("normal user with exact access entry is allowed", async () => {
        const socket = createMockSocket(2);
        mockUser = { id: 2,
            user_type: "normal",
            active: 1 };
        mockAccessData = [
            { user_id: 2,
                stack_name: "my-stack",
                endpoint: "",
                access_level: "viewer" },
        ];
        await assert.doesNotReject(() => checkStackAccess(socket, "my-stack", ""));
    });

    it("normal user with wildcard access is allowed", async () => {
        const socket = createMockSocket(2);
        mockUser = { id: 2,
            user_type: "normal",
            active: 1 };
        mockAccessData = [
            { user_id: 2,
                stack_name: "*",
                endpoint: "*",
                access_level: "viewer" },
        ];
        await assert.doesNotReject(() => checkStackAccess(socket, "any-stack", "any-endpoint"));
    });

    it("normal user with viewer access is denied STACK_START permission", async () => {
        const socket = createMockSocket(2);
        mockUser = { id: 2,
            user_type: "normal",
            active: 1 };
        mockAccessData = [
            { user_id: 2,
                stack_name: "my-stack",
                endpoint: "",
                access_level: "viewer" },
        ];
        await assert.rejects(
            () => checkStackAccess(socket, "my-stack", "", Permission.STACK_START),
            /access denied/i
        );
    });

    it("normal user with operator access is allowed STACK_START permission", async () => {
        const socket = createMockSocket(2);
        mockUser = { id: 2,
            user_type: "normal",
            active: 1 };
        mockAccessData = [
            { user_id: 2,
                stack_name: "my-stack",
                endpoint: "",
                access_level: "operator" },
        ];
        await assert.doesNotReject(
            () => checkStackAccess(socket, "my-stack", "", Permission.STACK_START)
        );
    });

    it("highest access level is used when multiple entries match", async () => {
        const socket = createMockSocket(2);
        mockUser = { id: 2,
            user_type: "normal",
            active: 1 };
        mockAccessData = [
            { user_id: 2,
                stack_name: "*",
                endpoint: "*",
                access_level: "viewer" },
            { user_id: 2,
                stack_name: "my-stack",
                endpoint: "",
                access_level: "manager" },
        ];
        // Manager can delete
        await assert.doesNotReject(
            () => checkStackAccess(socket, "my-stack", "", Permission.STACK_DELETE)
        );
    });
});
