import { DockgeSocket } from "./util-server";
import { io, Socket as SocketClient } from "socket.io-client";
import { log } from "./log";
import { Agent } from "./models/agent";
import { isDev, LooseObject, sleep } from "../common/util-common";
import semver from "semver";
import { R } from "redbean-node";
import dayjs, { Dayjs } from "dayjs";
import { UserType, getAccessibleStackNames } from "./rbac";

/**
 * Dockge Instance Manager
 * One AgentManager per Socket connection
 */
export class AgentManager {

    protected socket : DockgeSocket;
    protected agentSocketList : Record<string, SocketClient> = {};
    protected agentLoggedInList : Record<string, boolean> = {};
    protected _firstConnectTime : Dayjs = dayjs();

    constructor(socket: DockgeSocket) {
        this.socket = socket;
    }

    get firstConnectTime() : Dayjs {
        return this._firstConnectTime;
    }

    test(url : string, username : string, password : string) : Promise<void> {
        return new Promise((resolve, reject) => {
            let obj = new URL(url);
            let endpoint = obj.host;

            if (!endpoint) {
                reject(new Error("Invalid Dockge URL"));
            }

            if (this.agentSocketList[endpoint]) {
                reject(new Error("The Dockge URL already exists"));
            }

            let client = io(url, {
                reconnection: false,
                extraHeaders: {
                    endpoint,
                }
            });

            client.on("connect", () => {
                client.emit("login", {
                    username: username,
                    password: password,
                }, (res : LooseObject) => {
                    if (res.ok) {
                        resolve();
                    } else {
                        reject(new Error(res.msg));
                    }
                    client.disconnect();
                });
            });

            client.on("connect_error", (err) => {
                if (err.message === "xhr poll error") {
                    reject(new Error("Unable to connect to the Dockge instance"));
                } else {
                    reject(err);
                }
                client.disconnect();
            });
        });
    }

    /**
     *
     * @param url
     * @param username
     * @param password
     * @param name
     */
    async add(url: string, username: string, password: string, name: string): Promise<Agent> {
        let bean = R.dispense("agent") as Agent;
        bean.url = url;
        bean.username = username;
        bean.password = password;
        bean.name = name;
        await R.store(bean);
        return bean;
    }

    /**
     *
     * @param url
     */
    async remove(url : string) {
        let bean = await R.findOne("agent", " url = ? ", [
            url,
        ]);

        if (bean) {
            await R.trash(bean);
            let endpoint = bean.endpoint;
            this.disconnect(endpoint);
            this.sendAgentList();
            delete this.agentSocketList[endpoint];
        } else {
            throw new Error("Agent not found");
        }
    }

    /**
     *
     * @param url
     * @param updatedName
     */
    async update(url: string, updatedName: string) {
        const agent = await R.findOne("agent", " url = ? ", [
            url,
        ]);
        if (agent) {
            agent.name = updatedName;
            await R.store(agent);
        } else {
            throw new Error("Agent not found");
        }
    }

    connect(url : string, username : string, password : string) {
        let obj = new URL(url);
        let endpoint = obj.host;

        this.emitAgentStatus(endpoint, "connecting");

        if (!endpoint) {
            log.error("agent-manager", "Invalid endpoint: " + endpoint + " URL: " + url);
            return;
        }

        if (this.agentSocketList[endpoint]) {
            log.debug("agent-manager", "Already connected to the socket server: " + endpoint);
            return;
        }

        log.info("agent-manager", "Connecting to the socket server: " + endpoint);
        let client = io(url, {
            extraHeaders: {
                endpoint,
            }
        });

        client.on("connect", () => {
            log.info("agent-manager", "Connected to the socket server: " + endpoint);

            client.emit("login", {
                username: username,
                password: password,
            }, (res : LooseObject) => {
                if (res.ok) {
                    log.info("agent-manager", "Logged in to the socket server: " + endpoint);
                    this.agentLoggedInList[endpoint] = true;
                    this.emitAgentStatus(endpoint, "online");
                } else {
                    log.error("agent-manager", "Failed to login to the socket server: " + endpoint);
                    this.agentLoggedInList[endpoint] = false;
                    this.emitAgentStatus(endpoint, "offline");
                }
            });
        });

        client.on("connect_error", (err) => {
            log.error("agent-manager", "Error from the socket server: " + endpoint);
            this.emitAgentStatus(endpoint, "offline");
        });

        client.on("disconnect", () => {
            log.info("agent-manager", "Disconnected from the socket server: " + endpoint);
            this.emitAgentStatus(endpoint, "offline");
        });

        client.on("agent", async (...args : unknown[]) => {
            if (args[0] === "stackList") {
                const res = args[1] as LooseObject;
                if (res && res.stackList) {
                    const userType = this.socket.userType || UserType.ADMIN;
                    const accessibleNames = await getAccessibleStackNames(this.socket.userID, userType, endpoint);
                    
                    console.log("AGENT PROXY DEBUG - endpoint:", endpoint, "user:", this.socket.userID, "type:", userType, "accessibleNames:", accessibleNames);
                    console.log("AGENT PROXY DEBUG - BEFORE filter stack keys:", Object.keys(res.stackList));

                    if (accessibleNames !== null) {
                        let filteredStackList: Record<string, any> = {};
                        for (let stackName in res.stackList) {
                            if (accessibleNames.includes(stackName)) {
                                filteredStackList[stackName] = res.stackList[stackName];
                            }
                        }
                        res.stackList = filteredStackList;
                    }
                    console.log("AGENT PROXY DEBUG - AFTER filter stack keys:", Object.keys(res.stackList));
                }
            }
            this.socket.emit("agent", ...args);
        });

        client.on("info", (res) => {
            log.debug("agent-manager", res);

            // Disconnect if the version is lower than 1.4.0
            if (!isDev && semver.satisfies(res.version, "< 1.4.0")) {
                this.emitAgentStatus(endpoint, "offline", `${endpoint}: Unsupported version: ` + res.version);
                client.disconnect();
            }
        });

        this.agentSocketList[endpoint] = client;
    }

    async emitAgentStatus(endpoint: string, status: string, msg?: string) {
        const userType = this.socket.userType || UserType.ADMIN;
        if (userType !== UserType.ADMIN && this.socket.userID) {
            const rows = await R.getAll(
                "SELECT DISTINCT endpoint FROM user_stack_access WHERE user_id = ?",
                [this.socket.userID]
            );
            const accessibleEndpoints = rows.map((r: any) => r.endpoint);
            const hasWildcard = accessibleEndpoints.includes("*");

            if (!hasWildcard && !accessibleEndpoints.includes(endpoint)) {
                return; // User has no access, don't emit status
            }
        }

        this.socket.emit("agentStatus", {
            endpoint,
            status,
            ...(msg ? { msg } : {}),
        });
    }

    disconnect(endpoint : string) {
        let client = this.agentSocketList[endpoint];
        client?.disconnect();
    }

    async connectAll() {
        this._firstConnectTime = dayjs();

        if (this.socket.endpoint) {
            log.info("agent-manager", "This connection is connected as an agent, skip connectAll()");
            return;
        }

        let list : Record<string, Agent> = await Agent.getAgentList();

        if (Object.keys(list).length !== 0) {
            log.info("agent-manager", "Connecting to all instance socket server(s)...");
        }

        for (let endpoint in list) {
            let agent = list[endpoint];
            this.connect(agent.url, agent.username, agent.password);
        }
    }

    disconnectAll() {
        for (let endpoint in this.agentSocketList) {
            this.disconnect(endpoint);
        }
    }

    async emitToEndpoint(endpoint: string, eventName: string, ...args : unknown[]) {
        log.debug("agent-manager", "Emitting event to endpoint: " + endpoint);
        let client = this.agentSocketList[endpoint];

        if (!client) {
            log.error("agent-manager", "Socket client not found for endpoint: " + endpoint);
            throw new Error("Socket client not found for endpoint: " + endpoint);
        }

        if (!client.connected || !this.agentLoggedInList[endpoint]) {
            // Maybe the request is too quick, the socket is not connected yet, check firstConnectTime
            // If it is within 10 seconds, we should apply retry logic here
            let diff = dayjs().diff(this.firstConnectTime, "second");
            log.debug("agent-manager", endpoint + ": diff: " + diff);
            let ok = false;
            while (diff < 10) {
                if (client.connected && this.agentLoggedInList[endpoint]) {
                    log.debug("agent-manager", `${endpoint}: Connected & Logged in`);
                    ok = true;
                    break;
                }
                log.debug("agent-manager", endpoint + ": not ready yet, retrying in 1 second...");
                await sleep(1000);
                diff = dayjs().diff(this.firstConnectTime, "second");
            }

            if (!ok) {
                log.error("agent-manager", `${endpoint}: Socket client not connected`);
                throw new Error("Socket client not connected for endpoint: " + endpoint);
            }
        }

        client.emit("agent", endpoint, eventName, ...args);
    }

    emitToAllEndpoints(eventName: string, ...args : unknown[]) {
        log.debug("agent-manager", "Emitting event to all endpoints");
        for (let endpoint in this.agentSocketList) {
            this.emitToEndpoint(endpoint, eventName, ...args).catch((e) => {
                log.warn("agent-manager", e.message);
            });
        }
    }

    async sendAgentList() {
        let list = await Agent.getAgentList();
        let result : Record<string, LooseObject> = {};

        // Myself
        result[""] = {
            url: "",
            username: "",
            endpoint: "",
            name: "",
            updatedName: "",
        };

        for (let endpoint in list) {
            let agent = list[endpoint];
            result[endpoint] = agent.toJSON();
        }

        const userType = this.socket.userType || UserType.ADMIN;
        console.log("SEND AGENT LIST - userID:", this.socket.userID, "userType:", userType, "result keys BEFORE:", Object.keys(result));
        if (userType !== UserType.ADMIN && this.socket.userID) {
            const rows = await R.getAll(
                "SELECT DISTINCT endpoint FROM user_stack_access WHERE user_id = ?",
                [this.socket.userID]
            );
            const accessibleEndpoints = rows.map((r: any) => r.endpoint);
            const hasWildcard = accessibleEndpoints.includes("*");
            
            console.log("SEND AGENT LIST - accessibleEndpoints:", accessibleEndpoints, "hasWildcard:", hasWildcard);

            if (!hasWildcard) {
                let filteredResult : Record<string, LooseObject> = {};
                for (const ep in result) {
                    if (accessibleEndpoints.includes(ep)) {
                        filteredResult[ep] = result[ep];
                    }
                }
                result = filteredResult;
            }
        }
        console.log("SEND AGENT LIST - result keys AFTER:", Object.keys(result));

        this.socket.emit("agentList", {
            ok: true,
            agentList: result,
        });
    }
}
