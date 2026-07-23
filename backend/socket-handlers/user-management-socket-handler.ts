import { SocketHandler } from "../socket-handler.js";
import { DockgeServer } from "../dockge-server";
import { log } from "../log";
import { callbackError, callbackResult, checkPermission, DockgeSocket, ValidationError } from "../util-server";
import { R } from "redbean-node";
import { generatePasswordHash } from "../password-hash";
import { Permission, VALID_ROLES, Role } from "../rbac";
import { passwordStrength } from "check-password-strength";

/**
 * Socket handler for user management operations.
 * All operations require USER_MANAGE permission (admin only).
 */
export class UserManagementSocketHandler extends SocketHandler {
    create(socket : DockgeSocket, server : DockgeServer) {

        /**
         * Get list of all users (admin only).
         * Returns user id, username, role, and active status.
         * Passwords are never sent to the client.
         */
        socket.on("getUserList", async (callback) => {
            try {
                await checkPermission(socket, Permission.USER_MANAGE);

                const users = await R.getAll(
                    "SELECT id, username, role, active FROM user ORDER BY id ASC"
                );

                callbackResult({
                    ok: true,
                    users,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        /**
         * Add a new user (admin only).
         * @param data.username - The username for the new user
         * @param data.password - The password for the new user
         * @param data.role - The role for the new user
         */
        socket.on("addUser", async (data : unknown, callback : unknown) => {
            try {
                await checkPermission(socket, Permission.USER_MANAGE);

                if (typeof data !== "object" || data === null) {
                    throw new ValidationError("Data must be an object");
                }

                const { username, password, role } = data as {
                    username: string;
                    password: string;
                    role: string;
                };

                // Validate username
                if (typeof username !== "string" || username.trim().length === 0) {
                    throw new ValidationError("Username is required");
                }

                // Validate password
                if (typeof password !== "string" || password.length === 0) {
                    throw new ValidationError("Password is required");
                }

                if (passwordStrength(password).value === "Too weak") {
                    throw new ValidationError("Password is too weak. It should contain alphabetic and numeric characters. It must be at least 6 characters in length.");
                }

                // Validate role
                if (!VALID_ROLES.includes(role)) {
                    throw new ValidationError("Invalid role: " + role);
                }

                // Check if username already exists
                const existingUser = await R.findOne("user", " username = ? ", [username.trim()]);
                if (existingUser) {
                    throw new ValidationError("Username already exists");
                }

                const user = R.dispense("user");
                user.username = username.trim();
                user.password = generatePasswordHash(password);
                user.role = role;
                user.active = true;
                await R.store(user);

                log.info("user-management", `User "${username}" created with role "${role}" by user ID ${socket.userID}`);

                callbackResult({
                    ok: true,
                    msg: "userAddedSuccessfully",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        /**
         * Edit an existing user (admin only).
         * Can change role and active status.
         * Password change is optional.
         * @param data.id - The user ID to edit
         * @param data.role - New role (optional)
         * @param data.active - Active status (optional)
         * @param data.password - New password (optional)
         */
        socket.on("editUser", async (data : unknown, callback : unknown) => {
            try {
                await checkPermission(socket, Permission.USER_MANAGE);

                if (typeof data !== "object" || data === null) {
                    throw new ValidationError("Data must be an object");
                }

                const { id, role, active, password } = data as {
                    id: number;
                    role?: string;
                    active?: boolean;
                    password?: string;
                };

                if (typeof id !== "number") {
                    throw new ValidationError("User ID is required");
                }

                const user = await R.findOne("user", " id = ? ", [id]);
                if (!user) {
                    throw new Error("User not found");
                }

                // Prevent admin from changing their own role (safety)
                if (id === socket.userID && role && role !== user.role) {
                    throw new Error("Cannot change your own role");
                }

                // Prevent deactivating yourself
                if (id === socket.userID && active === false) {
                    throw new Error("Cannot deactivate your own account");
                }

                const originalRole = user.role;

                if (role !== undefined) {
                    if (!VALID_ROLES.includes(role)) {
                        throw new ValidationError("Invalid role: " + role);
                    }
                    user.role = role;
                }

                if (active !== undefined) {
                    user.active = active;
                }

                if (password !== undefined && password.length > 0) {
                    if (passwordStrength(password).value === "Too weak") {
                        throw new ValidationError("Password is too weak.");
                    }
                    user.password = generatePasswordHash(password);
                }

                await R.store(user);

                log.info("user-management", `User ID ${id} edited by user ID ${socket.userID}`);

                // If the user's role changed, disconnect their sessions to force re-auth
                if (role !== undefined && role !== originalRole) {
                    server.disconnectAllSocketClients(id);
                }

                callbackResult({
                    ok: true,
                    msg: "Saved",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        /**
         * Delete a user (admin only).
         * Cannot delete your own account.
         * @param userId - The user ID to delete
         */
        socket.on("deleteUser", async (userId : unknown, callback : unknown) => {
            try {
                await checkPermission(socket, Permission.USER_MANAGE);

                if (typeof userId !== "number") {
                    throw new ValidationError("User ID must be a number");
                }

                // Prevent deleting yourself
                if (userId === socket.userID) {
                    throw new Error("Cannot delete your own account");
                }

                const user = await R.findOne("user", " id = ? ", [userId]);
                if (!user) {
                    throw new Error("User not found");
                }

                // Delete stack access records first (cascade should handle, but be explicit)
                await R.exec("DELETE FROM user_stack_access WHERE user_id = ?", [userId]);
                await R.trash(user);

                // Disconnect the deleted user's sessions
                server.disconnectAllSocketClients(userId as number);

                log.info("user-management", `User ID ${userId} deleted by user ID ${socket.userID}`);

                callbackResult({
                    ok: true,
                    msg: "Deleted",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        /**
         * Get stack access list for a specific user (admin only).
         * @param userId - The user ID to query
         */
        socket.on("getStackAccess", async (userId : unknown, callback : unknown) => {
            try {
                await checkPermission(socket, Permission.USER_MANAGE);

                if (typeof userId !== "number") {
                    throw new ValidationError("User ID must be a number");
                }

                const accessList = await R.getAll(
                    "SELECT id, stack_name, endpoint FROM user_stack_access WHERE user_id = ? ORDER BY endpoint, stack_name",
                    [userId]
                );

                callbackResult({
                    ok: true,
                    accessList,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        /**
         * Set stack access for a user (admin only).
         * Replaces all existing access with the new list.
         * @param data.userId - The user ID
         * @param data.stackAccess - Array of {stackName, endpoint} objects
         */
        socket.on("setStackAccess", async (data : unknown, callback : unknown) => {
            try {
                await checkPermission(socket, Permission.USER_MANAGE);

                if (typeof data !== "object" || data === null) {
                    throw new ValidationError("Data must be an object");
                }

                const { userId, stackAccess } = data as {
                    userId: number;
                    stackAccess: Array<{ stackName: string; endpoint: string }>;
                };

                if (typeof userId !== "number") {
                    throw new ValidationError("User ID must be a number");
                }

                if (!Array.isArray(stackAccess)) {
                    throw new ValidationError("Stack access must be an array");
                }

                // Check that user exists
                const user = await R.findOne("user", " id = ? ", [userId]);
                if (!user) {
                    throw new Error("User not found");
                }

                // Admin doesn't need stack access records
                if (user.role === Role.ADMIN) {
                    throw new Error("Admin users have access to all stacks. No need to set stack access.");
                }

                // Delete existing access
                await R.exec("DELETE FROM user_stack_access WHERE user_id = ?", [userId]);

                // Insert new access entries
                for (const access of stackAccess) {
                    if (typeof access.stackName !== "string" || access.stackName.trim().length === 0) {
                        continue;
                    }
                    const bean = R.dispense("user_stack_access");
                    bean.user_id = userId;
                    bean.stack_name = access.stackName.trim();
                    bean.endpoint = access.endpoint || "";
                    await R.store(bean);
                }

                log.info("user-management", `Stack access updated for user ID ${userId} by user ID ${socket.userID}`);

                // Refresh the user's stack list
                server.sendStackList();

                callbackResult({
                    ok: true,
                    msg: "Saved",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }
}
