import test from "node:test";
import assert from "node:assert";
import { verifyProxiedEventAccess } from "./util-server.js";
import { Permission, Role } from "./rbac.js";
import { R } from "redbean-node";

// Mock user in DB
const mockUser = {
    id: 10,
    role: Role.OPERATOR,
    active: 1
};

// Simple socket mock
const mockSocket: any = {
    userID: 10,
    endpoint: "local"
};

test("util-server - verifyProxiedEventAccess", async (t) => {
    // Setup mocks
    const originalFindOne = R.findOne;
    
    t.after(() => {
        R.findOne = originalFindOne;
    });

    R.findOne = async (table, query, params) => {
        if (table === "user") {
            if (params[0] === 10) return mockUser;
            return null;
        }
        if (table === "user_stack_access") {
            // Operator has access to "allowed-stack" on "agent-1"
            if (params[0] === 10 && params[1] === "allowed-stack" && params[2] === "agent-1") {
                return { id: 1 };
            }
            return null;
        }
        return null;
    };

    await t.test("Should allow getStack if user has STACK_VIEW and stack access", async () => {
        // Operator has STACK_VIEW. We query "allowed-stack" on "agent-1"
        try {
            await verifyProxiedEventAccess(mockSocket, "agent-1", "getStack", ["allowed-stack"]);
            assert.ok(true);
        } catch (e) {
            assert.fail("Should not throw");
        }
    });

    await t.test("Should throw if user lacks stack access", async () => {
        try {
            await verifyProxiedEventAccess(mockSocket, "agent-1", "getStack", ["denied-stack"]);
            assert.fail("Should have thrown");
        } catch (e: any) {
            assert.strictEqual(e.message, "Access denied to this stack.");
        }
    });

    await t.test("Should throw if user lacks permission for action (e.g. STACK_DELETE for Operator)", async () => {
        try {
            await verifyProxiedEventAccess(mockSocket, "agent-1", "deleteStack", ["allowed-stack"]);
            assert.fail("Should have thrown");
        } catch (e: any) {
            assert.strictEqual(e.message, "Permission denied.");
        }
    });

    await t.test("Should allow restartService if user has STACK_RESTART and stack access", async () => {
        try {
            await verifyProxiedEventAccess(mockSocket, "agent-1", "restartService", ["allowed-stack", "my-service"]);
            assert.ok(true);
        } catch (e) {
            assert.fail("Should not throw");
        }
    });

    await t.test("Should allow deployStack (edit) if Manager", async () => {
        // Change mock user to MANAGER
        mockUser.role = Role.MANAGER;
        try {
            await verifyProxiedEventAccess(mockSocket, "agent-1", "deployStack", ["allowed-stack", "yaml", "env", false]);
            assert.ok(true);
        } catch (e) {
            assert.fail("Should not throw");
        }
        // Revert role
        mockUser.role = Role.OPERATOR;
    });
});
