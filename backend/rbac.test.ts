import test from "node:test";
import assert from "node:assert";
import { hasPermission, hasStackAccess, getAccessibleStackNames, Role, Permission } from "./rbac.js";

// Mock redbean-node to test database calls
import { R } from "redbean-node";

test("RBAC - hasPermission Matrix", async (t) => {
    await t.test("Admin should have all permissions", () => {
        const adminRole = Role.ADMIN;
        assert.strictEqual(hasPermission(adminRole, Permission.STACK_VIEW), true);
        assert.strictEqual(hasPermission(adminRole, Permission.STACK_CREATE), true);
        assert.strictEqual(hasPermission(adminRole, Permission.STACK_EDIT), true);
        assert.strictEqual(hasPermission(adminRole, Permission.STACK_DELETE), true);
        assert.strictEqual(hasPermission(adminRole, Permission.TERMINAL_EXEC), true);
        assert.strictEqual(hasPermission(adminRole, Permission.TERMINAL_CONSOLE), true);
        assert.strictEqual(hasPermission(adminRole, Permission.USER_MANAGE), true);
    });

    await t.test("Manager should have specific permissions but not global admin settings", () => {
        const managerRole = Role.MANAGER;
        assert.strictEqual(hasPermission(managerRole, Permission.STACK_VIEW), true);
        assert.strictEqual(hasPermission(managerRole, Permission.STACK_CREATE), true);
        assert.strictEqual(hasPermission(managerRole, Permission.STACK_EDIT), true);
        assert.strictEqual(hasPermission(managerRole, Permission.STACK_DELETE), true);
        assert.strictEqual(hasPermission(managerRole, Permission.TERMINAL_EXEC), true);
        assert.strictEqual(hasPermission(managerRole, Permission.TERMINAL_CONSOLE), false);
        assert.strictEqual(hasPermission(managerRole, Permission.USER_MANAGE), false);
        assert.strictEqual(hasPermission(managerRole, Permission.AGENT_MANAGE), false);
        assert.strictEqual(hasPermission(managerRole, Permission.SETTINGS_EDIT), false);
    });

    await t.test("Operator should only have basic operation permissions", () => {
        const operatorRole = Role.OPERATOR;
        assert.strictEqual(hasPermission(operatorRole, Permission.STACK_VIEW), true);
        assert.strictEqual(hasPermission(operatorRole, Permission.STACK_START), true);
        assert.strictEqual(hasPermission(operatorRole, Permission.STACK_STOP), true);
        assert.strictEqual(hasPermission(operatorRole, Permission.STACK_RESTART), true);
        assert.strictEqual(hasPermission(operatorRole, Permission.STACK_UPDATE), true);
        assert.strictEqual(hasPermission(operatorRole, Permission.STACK_LOGS), true);
        assert.strictEqual(hasPermission(operatorRole, Permission.STACK_CREATE), false);
        assert.strictEqual(hasPermission(operatorRole, Permission.STACK_EDIT), false);
        assert.strictEqual(hasPermission(operatorRole, Permission.STACK_DELETE), false);
        assert.strictEqual(hasPermission(operatorRole, Permission.TERMINAL_EXEC), false);
    });

    await t.test("Viewer should only have read-only access", () => {
        const viewerRole = Role.VIEWER;
        assert.strictEqual(hasPermission(viewerRole, Permission.STACK_VIEW), true);
        assert.strictEqual(hasPermission(viewerRole, Permission.STACK_LOGS), true);
        assert.strictEqual(hasPermission(viewerRole, Permission.STACK_START), false);
        assert.strictEqual(hasPermission(viewerRole, Permission.STACK_CREATE), false);
        assert.strictEqual(hasPermission(viewerRole, Permission.TERMINAL_EXEC), false);
    });

    await t.test("Unknown role should have no permissions", () => {
        assert.strictEqual(hasPermission("unknown_role", Permission.STACK_VIEW), false);
    });
});

test("RBAC - Stack Access Logic", async (t) => {
    // Save original functions
    const originalFindOne = R.findOne;
    const originalGetAll = R.getAll;
    
    t.after(() => {
        R.findOne = originalFindOne;
        R.getAll = originalGetAll;
    });

    await t.test("Admin should always have stack access", async () => {
        // Redbean shouldn't even be called for admin
        let called = false;
        R.findOne = async () => { called = true; return null; };
        
        const access = await hasStackAccess(1, Role.ADMIN, "any-stack");
        assert.strictEqual(access, true);
        assert.strictEqual(called, false);
    });

    await t.test("Non-admin should return true if stack is in DB", async () => {
        R.findOne = async (table, query, params) => {
            if (table === "user_stack_access" && params[0] === 2 && params[1] === "my-stack" && params[2] === "") {
                return { id: 1, user_id: 2, stack_name: "my-stack", endpoint: "" };
            }
            return null;
        };
        
        const access = await hasStackAccess(2, Role.MANAGER, "my-stack");
        assert.strictEqual(access, true);
        
        const deniedAccess = await hasStackAccess(2, Role.MANAGER, "other-stack");
        assert.strictEqual(deniedAccess, false);
    });

    await t.test("Admin getAccessibleStackNames should return null", async () => {
        const names = await getAccessibleStackNames(1, Role.ADMIN);
        assert.strictEqual(names, null);
    });

    await t.test("Non-admin getAccessibleStackNames should return mapped list", async () => {
        R.getAll = async (query, params) => {
            if (params[0] === 3 && params[1] === "agent-1") {
                return [{ stack_name: "stack-a" }, { stack_name: "stack-b" }];
            }
            return [];
        };
        
        const names = await getAccessibleStackNames(3, Role.OPERATOR, "agent-1");
        assert.deepStrictEqual(names, ["stack-a", "stack-b"]);
        
        const emptyNames = await getAccessibleStackNames(3, Role.OPERATOR, "unknown");
        assert.deepStrictEqual(emptyNames, []);
    });
});
