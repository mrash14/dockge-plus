import { Socket } from "socket.io";
import { Terminal } from "./terminal";
import { randomBytes } from "crypto";
import { log } from "./log";
import { ERROR_TYPE_VALIDATION } from "../common/util-common";
import { R } from "redbean-node";
import { verifyPassword } from "./password-hash";
import fs from "fs";
import { AgentManager } from "./agent-manager";
import { Permission, hasPermission, hasStackAccess } from "./rbac";

export interface JWTDecoded {
    username : string;
    h? : string;
    role? : string;
}

export interface DockgeSocket extends Socket {
    userID: number;
    userRole: string;
    consoleTerminal? : Terminal;
    instanceManager : AgentManager;
    endpoint : string;
    emitAgent : (eventName : string, ...args : unknown[]) => void;
}

// For command line arguments, so they are nullable
export interface Arguments {
    sslKey? : string;
    sslCert? : string;
    sslKeyPassphrase? : string;
    port? : number;
    hostname? : string;
    dataDir? : string;
    stacksDir? : string;
    enableConsole? : boolean;
}

// Some config values are required
export interface Config extends Arguments {
    dataDir : string;
    stacksDir : string;
}

export function checkLogin(socket : DockgeSocket) {
    if (!socket.userID) {
        throw new Error("You are not logged in.");
    }
}

/**
 * Check if the logged-in user has a specific permission.
 * Throws an error if not logged in or if permission is denied.
 * Uses the role cached on the socket (set during afterLogin).
 * @param {DockgeSocket} socket - The socket connection
 * @param {Permission} permission - The permission to check
 */
export async function checkPermission(socket : DockgeSocket, permission : Permission) {
    checkLogin(socket);

    // Fetch the role from DB as the authoritative source (not JWT cache)
    const user = await R.findOne("user", " id = ? AND active = 1 ", [socket.userID]);
    if (!user) {
        throw new Error("User not found or inactive.");
    }

    const role = user.role as string;
    if (!hasPermission(role, permission)) {
        throw new Error("Permission denied.");
    }
}

/**
 * Check if the logged-in user has access to a specific stack.
 * Admin users have access to all stacks.
 * Other users must have an explicit entry in user_stack_access.
 * @param {DockgeSocket} socket - The socket connection
 * @param {string} stackName - The name of the stack
 * @param {string} endpoint - The endpoint (empty string for local)
 */
export async function checkStackAccess(socket : DockgeSocket, stackName : string, endpoint : string = "") {
    checkLogin(socket);

    const user = await R.findOne("user", " id = ? AND active = 1 ", [socket.userID]);
    if (!user) {
        throw new Error("User not found or inactive.");
    }

    const accessible = await hasStackAccess(socket.userID, user.role, stackName, endpoint);
    if (!accessible) {
        throw new Error("Access denied to this stack.");
    }
}

/**
 * Verify access for a proxied event before sending it to an agent.
 * @param {DockgeSocket} socket - The socket connection
 * @param {string} endpoint - The target endpoint
 * @param {string} eventName - The event name
 * @param {unknown[]} args - The event arguments
 */
export async function verifyProxiedEventAccess(socket: DockgeSocket, endpoint: string, eventName: string, args: unknown[]) {
    let requiredPermission: Permission | null = null;
    let stackNameIndex: number = -1;

    switch (eventName) {
        // View access
        case "getStack":
        case "serviceStatusList":
        case "leaveCombinedTerminal":
            requiredPermission = Permission.STACK_VIEW;
            stackNameIndex = 0;
            break;
        case "dockerStats":
            requiredPermission = Permission.STACK_VIEW;
            break;

        // Create/Edit
        case "deployStack":
        case "saveStack":
            const isAdd = args[3] as boolean;
            requiredPermission = isAdd ? Permission.STACK_CREATE : Permission.STACK_EDIT;
            stackNameIndex = 0;
            break;

        // Delete
        case "deleteStack":
            requiredPermission = Permission.STACK_DELETE;
            stackNameIndex = 0;
            break;

        // Start/Stop/Restart/Update
        case "startStack":
        case "startService":
            requiredPermission = Permission.STACK_START;
            stackNameIndex = 0;
            break;
        case "stopStack":
        case "downStack":
        case "stopService":
            requiredPermission = Permission.STACK_STOP;
            stackNameIndex = 0;
            break;
        case "restartStack":
        case "restartService":
            requiredPermission = Permission.STACK_RESTART;
            stackNameIndex = 0;
            break;
        case "updateStack":
            requiredPermission = Permission.STACK_UPDATE;
            stackNameIndex = 0;
            break;

        // Terminal
        case "terminalJoin":
            requiredPermission = Permission.STACK_LOGS;
            if (typeof args[0] === "string") {
                const parts = args[0].split("-");
                if (parts.length >= 2) {
                    const stackName = parts[1];
                    await checkStackAccess(socket, stackName, endpoint);
                }
            }
            break;
        case "interactiveTerminal":
            requiredPermission = Permission.TERMINAL_EXEC;
            stackNameIndex = 0;
            break;
        case "mainTerminal":
            requiredPermission = Permission.TERMINAL_CONSOLE;
            break;

        default:
            break;
    }

    if (requiredPermission) {
        await checkPermission(socket, requiredPermission);
    }

    if (stackNameIndex >= 0 && typeof args[stackNameIndex] === "string") {
        await checkStackAccess(socket, args[stackNameIndex] as string, endpoint);
    }
}

export class ValidationError extends Error {
    constructor(message : string) {
        super(message);
    }
}

export function callbackError(error : unknown, callback : unknown) {
    if (typeof(callback) !== "function") {
        log.error("console", "Callback is not a function");
        return;
    }

    if (error instanceof Error) {
        callback({
            ok: false,
            msg: error.message,
            msgi18n: true,
        });
    } else if (error instanceof ValidationError) {
        callback({
            ok: false,
            type: ERROR_TYPE_VALIDATION,
            msg: error.message,
            msgi18n: true,
        });
    } else {
        log.debug("console", "Unknown error: " + error);
    }
}

export function callbackResult(result : unknown, callback : unknown) {
    if (typeof(callback) !== "function") {
        log.error("console", "Callback is not a function");
        return;
    }
    callback(result);
}

export async function doubleCheckPassword(socket : DockgeSocket, currentPassword : unknown) {
    if (typeof currentPassword !== "string") {
        throw new Error("Wrong data type?");
    }

    let user = await R.findOne("user", " id = ? AND active = 1 ", [
        socket.userID,
    ]);

    if (!user || !verifyPassword(currentPassword, user.password)) {
        throw new Error("Incorrect current password");
    }

    return user;
}

export function fileExists(file : string) {
    return fs.promises.access(file, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);
}
