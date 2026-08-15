import { SocketHandler } from "../socket-handler.js";
import { DockgeServer } from "../dockge-server";
import { log } from "../log";
import { callbackError, callbackResult, checkPermission, DockgeSocket, ValidationError } from "../util-server";
import { R } from "redbean-node";
import { generatePasswordHash } from "../password-hash";
import { Permission, VALID_USER_TYPES, VALID_ACCESS_LEVELS, UserType } from "../rbac";
import { passwordStrength } from "check-password-strength";
import { ACCESS_WILDCARD } from "../../common/util-common";

/**
 * Socket handler for user management operations.
 * All operations require USER_MANAGE permission (admin only).
 */
export class UserManagementSocketHandler extends SocketHandler {
    create(socket : DockgeSocket, server : DockgeServer) {

        /**
         * Get list of all users (admin only).
         * Returns user id, username, user_type, and active status.
         * Passwords are never sent to the client.
         */
        socket.on("getUserList", async (callback) => {
            try {
                await checkPermission(socket, Permission.USER_MANAGE);

                const users = await R.getAll(
                    "SELECT id, username, user_type, active FROM user ORDER BY id ASC"
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
         * @param data.userType - The user type ("admin" or "normal")
         */
        socket.on("addUser", async (data : unknown, callback : unknown) => {
            try {
                await checkPermission(socket, Permission.USER_MANAGE);

                if (typeof data !== "object" || data === null) {
                    throw new ValidationError("Data must be an object");
                }

                const { username, password, userType } = data as {
                    username: string;
                    password: string;
                    userType: string;
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

                // Validate user type
                if (!VALID_USER_TYPES.includes(userType)) {
                    throw new ValidationError("Invalid user type: " + userType);
                }

                // Check if username already exists
                const existingUser = await R.findOne("user", " username = ? ", [ username.trim() ]);
                if (existingUser) {
                    throw new ValidationError("Username already exists");
                }

                const user = R.dispense("user");
                user.username = username.trim();
                user.password = generatePasswordHash(password);
                user.user_type = userType;
                user.active = true;
                await R.store(user);

                log.info("user-management", `User "${username}" created with type "${userType}" by user ID ${socket.userID}`);

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
         * Can change user type and active status.
         * Password change is optional.
         * @param data.id - The user ID to edit
         * @param data.userType - New user type (optional)
         * @param data.active - Active status (optional)
         * @param data.password - New password (optional)
         */
        socket.on("editUser", async (data : unknown, callback : unknown) => {
            try {
                await checkPermission(socket, Permission.USER_MANAGE);

                if (typeof data !== "object" || data === null) {
                    throw new ValidationError("Data must be an object");
                }

                const { id, userType, active, password } = data as {
                    id: number;
                    userType?: string;
                    active?: boolean;
                    password?: string;
                };

                if (typeof id !== "number") {
                    throw new ValidationError("User ID is required");
                }

                const user = await R.findOne("user", " id = ? ", [ id ]);
                if (!user) {
                    throw new Error("User not found");
                }

                // Prevent admin from changing their own user type (safety)
                if (id === socket.userID && userType && userType !== user.user_type) {
                    throw new Error("Cannot change your own user type");
                }

                // Prevent deactivating yourself
                if (id === socket.userID && active === false) {
                    throw new Error("Cannot deactivate your own account");
                }

                const originalUserType = user.user_type;

                if (userType !== undefined) {
                    if (!VALID_USER_TYPES.includes(userType)) {
                        throw new ValidationError("Invalid user type: " + userType);
                    }
                    user.user_type = userType;
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

                // If the user's type changed, disconnect their sessions to force re-auth
                if (userType !== undefined && userType !== originalUserType) {
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

                const user = await R.findOne("user", " id = ? ", [ userId ]);
                if (!user) {
                    throw new Error("User not found");
                }

                // Delete stack access records first (cascade should handle, but be explicit)
                await R.exec("DELETE FROM user_stack_access WHERE user_id = ?", [ userId ]);
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
                    "SELECT id, stack_name, endpoint, access_level FROM user_stack_access WHERE user_id = ? ORDER BY endpoint, stack_name",
                    [ userId ]
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
         * @param data.stackAccess - Array of {stackName, endpoint, accessLevel} objects
         */
        socket.on("setStackAccess", async (data : unknown, callback : unknown) => {
            try {
                await checkPermission(socket, Permission.USER_MANAGE);

                if (typeof data !== "object" || data === null) {
                    throw new ValidationError("Data must be an object");
                }

                const { userId, stackAccess } = data as {
                    userId: number;
                    stackAccess: Array<{ stackName: string; endpoint: string; accessLevel: string }>;
                };

                if (typeof userId !== "number") {
                    throw new ValidationError("User ID must be a number");
                }

                if (!Array.isArray(stackAccess)) {
                    throw new ValidationError("Stack access must be an array");
                }

                // Check that user exists
                const user = await R.findOne("user", " id = ? ", [ userId ]);
                if (!user) {
                    throw new Error("User not found");
                }

                // Admin doesn't need stack access records
                if (user.user_type === UserType.ADMIN) {
                    throw new Error("Admin users have access to all stacks. No need to set stack access.");
                }

                // Validate entries
                for (const access of stackAccess) {
                    // Validate access level
                    if (!VALID_ACCESS_LEVELS.includes(access.accessLevel)) {
                        throw new ValidationError("Invalid access level: " + access.accessLevel);
                    }

                    // If endpoint is wildcard, stack must also be wildcard
                    if (access.endpoint === ACCESS_WILDCARD && access.stackName !== ACCESS_WILDCARD) {
                        throw new ValidationError("When server is set to 'All', stack must also be 'All'.");
                    }
                }

                // Delete existing access
                await R.exec("DELETE FROM user_stack_access WHERE user_id = ?", [ userId ]);

                // Insert new access entries
                for (const access of stackAccess) {
                    if (typeof access.stackName !== "string" || access.stackName.trim().length === 0) {
                        continue;
                    }
                    const bean = R.dispense("user_stack_access");
                    bean.user_id = userId;
                    bean.stack_name = access.stackName.trim();
                    bean.endpoint = access.endpoint || "";
                    bean.access_level = access.accessLevel || "viewer";
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
