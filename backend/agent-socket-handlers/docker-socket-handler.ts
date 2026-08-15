import { AgentSocketHandler } from "../agent-socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, checkStackAccess, DockgeSocket, ValidationError } from "../util-server";
import { Stack } from "../stack";
import { AgentSocket } from "../../common/agent-socket";
import { Permission } from "../rbac";

export class DockerSocketHandler extends AgentSocketHandler {
    create(socket : DockgeSocket, server : DockgeServer, agentSocket : AgentSocket) {
        // Do not call super.create()

        agentSocket.on("deployStack", async (name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, selectedStacksDir: unknown, callback) => {
            try {
                if (isAdd) {
                    await checkStackAccess(socket, "*", socket.endpoint, Permission.STACK_CREATE);
                } else {
                    if (typeof(name) === "string") {
                        await checkStackAccess(socket, name, socket.endpoint, Permission.STACK_EDIT);
                    }
                }
                const stack = await this.saveStack(server, name, composeYAML, composeENV, isAdd, selectedStacksDir);
                await stack.deploy(socket);
                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Deployed",
                    msgi18n: true,
                }, callback);
                stack.joinCombinedTerminal(socket);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("saveStack", async (name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, selectedStacksDir: unknown, callback) => {
            try {
                if (isAdd) {
                    await checkStackAccess(socket, "*", socket.endpoint, Permission.STACK_CREATE);
                } else {
                    if (typeof(name) === "string") {
                        await checkStackAccess(socket, name, socket.endpoint, Permission.STACK_EDIT);
                    }
                }
                await this.saveStack(server, name, composeYAML, composeENV, isAdd, selectedStacksDir);
                callbackResult({
                    ok: true,
                    msg: "Saved",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("deleteStack", async (name : unknown, callback) => {
            try {
                if (typeof(name) !== "string") {
                    throw new ValidationError("Name must be a string");
                }
                await checkStackAccess(socket, name, socket.endpoint, Permission.STACK_DELETE);
                const stack = await Stack.getStack(server, name);

                try {
                    await stack.delete(socket);
                } catch (e) {
                    server.sendStackList();
                    throw e;
                }

                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Deleted",
                    msgi18n: true,
                }, callback);

            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("getStack", async (stackName : unknown, callback) => {
            try {
                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                await checkStackAccess(socket, stackName, socket.endpoint, Permission.STACK_VIEW);
                const stack = await Stack.getStack(server, stackName);

                if (stack.isManagedByDockge) {
                    stack.joinCombinedTerminal(socket);
                }

                let stackJson = await stack.toJSON(socket.endpoint);
                console.log("getStack returning:", JSON.stringify(stackJson));
                callbackResult({
                    ok: true,
                    stack: stackJson,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("getStacksDirs", async (callback) => {
            try {
                // Return the configured stacks dirs
                callbackResult({
                    ok: true,
                    stacksDirs: server.stacksDirs,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // requestStackList
        agentSocket.on("requestStackList", async (callback) => {
            try {
                checkLogin(socket);
                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // startStack
        agentSocket.on("startStack", async (stackName : unknown, callback) => {
            try {
                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                await checkStackAccess(socket, stackName, socket.endpoint, Permission.STACK_START);
                const stack = await Stack.getStack(server, stackName);
                await stack.start(socket);
                callbackResult({
                    ok: true,
                    msg: "Started",
                    msgi18n: true,
                }, callback);
                server.sendStackList();

                stack.joinCombinedTerminal(socket);

            } catch (e) {
                callbackError(e, callback);
            }
        });

        // stopStack
        agentSocket.on("stopStack", async (stackName : unknown, callback) => {
            try {
                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                await checkStackAccess(socket, stackName, socket.endpoint, Permission.STACK_STOP);
                const stack = await Stack.getStack(server, stackName);
                await stack.stop(socket);
                callbackResult({
                    ok: true,
                    msg: "Stopped",
                    msgi18n: true,
                }, callback);
                server.sendStackList();

                stack.leaveCombinedTerminal(socket);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // restartStack
        agentSocket.on("restartStack", async (stackName : unknown, callback) => {
            try {
                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                await checkStackAccess(socket, stackName, socket.endpoint, Permission.STACK_RESTART);
                const stack = await Stack.getStack(server, stackName);
                await stack.restart(socket);
                callbackResult({
                    ok: true,
                    msg: "Restarted",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // updateStack
        agentSocket.on("updateStack", async (stackName : unknown, callback) => {
            try {
                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                await checkStackAccess(socket, stackName, socket.endpoint, Permission.STACK_START);
                const stack = await Stack.getStack(server, stackName);
                await stack.update(socket);
                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // down stack
        agentSocket.on("downStack", async (stackName : unknown, callback) => {
            try {
                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                await checkStackAccess(socket, stackName, socket.endpoint, Permission.STACK_STOP);
                const stack = await Stack.getStack(server, stackName);
                await stack.down(socket);
                callbackResult({
                    ok: true,
                    msg: "Downed",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Services status
        agentSocket.on("serviceStatusList", async (stackName : unknown, callback) => {
            try {
                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                await checkStackAccess(socket, stackName, socket.endpoint, Permission.STACK_VIEW);
                const stack = await Stack.getStack(server, stackName, true);
                const serviceStatusList = Object.fromEntries(await stack.getServiceStatusList());
                callbackResult({
                    ok: true,
                    serviceStatusList,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Docker stats
        agentSocket.on("dockerStats", async (callback) => {
            try {
                checkLogin(socket);

                const dockerStats = Object.fromEntries(await server.getDockerStats());
                callbackResult({
                    ok: true,
                    dockerStats,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Start a service
        agentSocket.on("startService", async (stackName: unknown, serviceName: unknown, callback) => {
            try {
                if (typeof (stackName) !== "string" || typeof (serviceName) !== "string") {
                    throw new ValidationError("Stack name and service name must be strings");
                }

                await checkStackAccess(socket, stackName as string, socket.endpoint, Permission.STACK_START);
                const stack = await Stack.getStack(server, stackName);
                await stack.startService(socket, serviceName);
                stack.joinCombinedTerminal(socket); // Ensure the combined terminal is joined
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " started"
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Stop a service
        agentSocket.on("stopService", async (stackName: unknown, serviceName: unknown, callback) => {
            try {
                if (typeof (stackName) !== "string" || typeof (serviceName) !== "string") {
                    throw new ValidationError("Stack name and service name must be strings");
                }

                await checkStackAccess(socket, stackName as string, socket.endpoint, Permission.STACK_STOP);
                const stack = await Stack.getStack(server, stackName);
                await stack.stopService(socket, serviceName);
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " stopped"
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("restartService", async (stackName: unknown, serviceName: unknown, callback) => {
            try {
                if (typeof stackName !== "string" || typeof serviceName !== "string") {
                    throw new Error("Invalid stackName or serviceName");
                }

                await checkStackAccess(socket, stackName as string, socket.endpoint, Permission.STACK_RESTART);
                const stack = await Stack.getStack(server, stackName, true);
                await stack.restartService(socket, serviceName);
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " restarted"
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // getExternalNetworkList
        agentSocket.on("getDockerNetworkList", async (callback) => {
            try {
                checkLogin(socket);
                const dockerNetworkList = await server.getDockerNetworkList();
                callbackResult({
                    ok: true,
                    dockerNetworkList,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }

    async saveStack(server : DockgeServer, name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, selectedStacksDir : unknown) : Promise<Stack> {
        // Check types
        if (typeof(name) !== "string") {
            throw new ValidationError("Name must be a string");
        }
        if (typeof(composeYAML) !== "string") {
            throw new ValidationError("Compose YAML must be a string");
        }
        if (typeof(composeENV) !== "string") {
            throw new ValidationError("Compose ENV must be a string");
        }
        if (typeof(isAdd) !== "boolean") {
            throw new ValidationError("isAdd must be a boolean");
        }
        if (selectedStacksDir !== undefined && typeof(selectedStacksDir) !== "string") {
            throw new ValidationError("selectedStacksDir must be a string");
        }

        // If isAdd is true and selectedStacksDir is provided, validate it
        if (isAdd && selectedStacksDir && !server.stacksDirs.includes(selectedStacksDir as string)) {
            throw new ValidationError("Invalid selected stacks directory");
        }

        const stack = new Stack(server, name, composeYAML, composeENV, false, selectedStacksDir as string | undefined);
        await stack.save(isAdd);
        return stack;
    }

}

