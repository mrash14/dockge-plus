import { io } from "socket.io-client";
import { Socket } from "socket.io-client";
import { defineComponent } from "vue";
import jwtDecode from "jwt-decode";
import { Terminal } from "@xterm/xterm";
import { AgentSocket } from "../../../common/agent-socket";
import { USER_TYPE_ADMIN } from "../../../common/util-common";

let socket : Socket;

let terminalMap : Map<string, Terminal> = new Map();

export default defineComponent({
    data() {
        return {
            socketIO: {
                token: null,
                firstConnect: true,
                connected: false,
                connectCount: 0,
                initedSocketIO: false,
                connectionErrorMsg: `${this.$t("Cannot connect to the socket server.")} ${this.$t("Reconnecting...")}`,
                showReverseProxyGuide: true,
                connecting: false,
            },
            info: {

            },
            remember: (localStorage.remember !== "0"),
            loggedIn: false,
            allowLoginDialog: false,
            username: null,
            composeTemplate: "",

            stackList: {},

            // All stack list from all agents
            allAgentStackList: {} as Record<string, object>,

            // online / offline / connecting
            agentStatusList: {

            },

            // Agent List
            agentList: {

            },

            // RBAC
            userType: "",

            // Per-stack access rules from the server
            // Each rule: { stackName, endpoint, accessLevel }
            stackAccessRules: [] as Array<{ stackName: string, endpoint: string, accessLevel: string }>,
            stackAccessIsAdmin: true,
        };
    },
    computed: {

        agentCount() {
            return Object.keys(this.agentList).length;
        },

        completeStackList() {
            let list : Record<string, object> = {};

            for (let stackName in this.stackList) {
                list[stackName + "_"] = this.stackList[stackName];
            }

            for (let endpoint in this.allAgentStackList) {
                let instance = this.allAgentStackList[endpoint];
                for (let stackName in instance.stackList) {
                    list[stackName + "_" + endpoint] = instance.stackList[stackName];
                }
            }
            return list;
        },

        usernameFirstChar() {
            if (typeof this.username == "string" && this.username.length >= 1) {
                return this.username.charAt(0).toUpperCase();
            } else {
                return "🐬";
            }
        },

        /**
         *  Frontend Version
         *  It should be compiled to a static value while building the frontend.
         *  Please see ./frontend/vite.config.ts, it is defined via vite.js
         * @returns {string}
         */
        frontendVersion() {
            // eslint-disable-next-line no-undef
            return FRONTEND_VERSION;
        },

        /**
         * Are both frontend and backend in the same version?
         * @returns {boolean}
         */
        isFrontendBackendVersionMatched() {
            if (!this.info.version) {
                return true;
            }
            return this.info.version === this.frontendVersion;
        },

        /**
         * Is the current user an admin?
         * @returns {boolean}
         */
        isAdmin() {
            return this.userType === USER_TYPE_ADMIN;
        },

        /**
         * Can the current user create stacks?
         * Admin: always true. Normal users: true only if they have a 'manager' rule on '*'.
         * Used for global UI elements like the "Create new stack" button.
         * @returns {boolean}
         */
        canManageStacks() {
            if (this.stackAccessIsAdmin) {
                return true;
            }
            return this.stackAccessRules.some(
                (rule: { stackName: string, accessLevel: string }) =>
                    rule.stackName === "*" && this._accessLevelRank(rule.accessLevel) >= 3
            );
        },

        /**
         * Can the current user globally operate stacks?
         * Admin: always true. Normal users: true only if they have at least one 'operator' or 'manager' access rule.
         * Used for generic checks, but most logic should use the per-stack method.
         * @returns {boolean}
         */
        canOperateStacks() {
            if (this.stackAccessIsAdmin) {
                return true;
            }
            return this.stackAccessRules.some(
                (rule: { accessLevel: string }) => this._accessLevelRank(rule.accessLevel) >= 2
            );
        },

    },
    watch: {

        "socketIO.connected"() {
            if (this.socketIO.connected) {
                this.agentStatusList[""] = "online";
            } else {
                this.agentStatusList[""] = "offline";
            }
        },

        remember() {
            localStorage.remember = (this.remember) ? "1" : "0";
        },

        // Reload the SPA if the server version is changed.
        "info.version"(to, from) {
            if (from && from !== to) {
                window.location.reload();
            }
        },
    },
    created() {
        this.initSocketIO();
    },
    mounted() {
        return;

    },
    methods: {

        endpointDisplayFunction(endpoint : string) {
            for (const [ , v ] of Object.entries(this.$data.agentList)) {
                if (endpoint) {
                    if (endpoint === v["endpoint"] && v["name"] !== "") {
                        return v["name"];
                    }
                    if (endpoint === v["endpoint"] && v["name"] === "" ) {
                        return endpoint;
                    }
                }
            }
        },

        /**
         * Initialize connection to socket server
         * @param bypass Should the check for if we
         * are on a status page be bypassed?
         */
        initSocketIO(bypass = false) {
            // No need to re-init
            if (this.socketIO.initedSocketIO) {
                return;
            }

            this.socketIO.initedSocketIO = true;
            let url : string;
            const env = process.env.NODE_ENV || "production";
            if (env === "development" || localStorage.dev === "dev") {
                url = location.protocol + "//" + location.hostname + ":5001";
            } else {
                url = location.protocol + "//" + location.host;
            }

            let connectingMsgTimeout = setTimeout(() => {
                this.socketIO.connecting = true;
            }, 1500);

            socket = io(url);

            // Handling events from agents
            let agentSocket = new AgentSocket();
            socket.on("agent", (eventName : unknown, ...args : unknown[]) => {
                agentSocket.call(eventName, ...args);
            });

            socket.on("connect", () => {
                console.log("Connected to the socket server");

                clearTimeout(connectingMsgTimeout);
                this.socketIO.connecting = false;

                this.socketIO.connectCount++;
                this.socketIO.connected = true;
                this.socketIO.showReverseProxyGuide = false;
                const token = this.storage().token;

                if (token) {
                    if (token !== "autoLogin") {
                        console.log("Logging in by token");
                        this.loginByToken(token);
                    } else {
                        // Timeout if it is not actually auto login
                        setTimeout(() => {
                            if (! this.loggedIn) {
                                this.allowLoginDialog = true;
                                this.storage().removeItem("token");
                            }
                        }, 5000);
                    }
                } else {
                    this.allowLoginDialog = true;
                }

                this.socketIO.firstConnect = false;
            });

            socket.on("disconnect", () => {
                console.log("disconnect");
                this.socketIO.connectionErrorMsg = `${this.$t("Lost connection to the socket server. Reconnecting...")}`;
                this.socketIO.connected = false;
            });

            socket.on("connect_error", (err) => {
                console.error(`Failed to connect to the backend. Socket.io connect_error: ${err.message}`);
                this.socketIO.connectionErrorMsg = `${this.$t("Cannot connect to the socket server.")} [${err}] ${this.$t("reconnecting...")}`;
                this.socketIO.showReverseProxyGuide = true;
                this.socketIO.connected = false;
                this.socketIO.firstConnect = false;
                this.socketIO.connecting = false;
            });

            // Custom Events

            socket.on("info", (info) => {
                this.info = info;
            });

            socket.on("autoLogin", () => {
                this.loggedIn = true;
                this.storage().token = "autoLogin";
                this.socketIO.token = "autoLogin";
                this.allowLoginDialog = false;
                this.userType = USER_TYPE_ADMIN; // autoLogin is always admin
                this.afterLogin();
            });

            // Listen for user type from server
            socket.on("userType", (data) => {
                if (data && data.userType) {
                    this.userType = data.userType;
                }
            });

            // Listen for per-stack access permissions
            socket.on("userStackPermissions", (data) => {
                if (data) {
                    this.stackAccessIsAdmin = !!data.isAdmin;
                    this.stackAccessRules = data.accessRules || [];
                }
            });

            socket.on("setup", () => {
                console.log("setup");
                this.$router.push("/setup");
            });

            agentSocket.on("terminalWrite", (terminalName, data) => {
                const terminal = terminalMap.get(terminalName);
                if (!terminal) {
                    //console.error("Terminal not found: " + terminalName);
                    return;
                }
                terminal.write(data);
            });

            agentSocket.on("stackList", (res) => {
                if (res.ok) {
                    if (!res.endpoint) {
                        this.stackList = res.stackList;
                    } else {
                        if (!this.allAgentStackList[res.endpoint]) {
                            this.allAgentStackList[res.endpoint] = {
                                stackList: {},
                            };
                        }
                        this.allAgentStackList[res.endpoint].stackList = res.stackList;
                    }
                }
            });

            socket.on("stackStatusList", (res) => {
                if (res.ok) {
                    for (let stackName in res.stackStatusList) {
                        const stackObj = this.stackList[stackName];
                        if (stackObj) {
                            stackObj.status = res.stackStatusList[stackName];
                        }
                    }
                }
            });

            socket.on("agentStatus", (res) => {
                this.agentStatusList[res.endpoint] = res.status;

                if (res.msg) {
                    this.toastError(res.msg);
                }
            });

            socket.on("agentList", (res) => {
                if (res.ok) {
                    this.agentList = res.agentList;
                }
            });

            socket.on("refresh", () => {
                location.reload();
            });
        },

        /**
         * The storage currently in use
         * @returns Current storage
         */
        storage() : Storage {
            return (this.remember) ? localStorage : sessionStorage;
        },

        getSocket() : Socket {
            return socket;
        },

        emitAgent(endpoint : string, eventName : string, ...args : unknown[]) {
            this.getSocket().emit("agent", endpoint, eventName, ...args);
        },

        /**
         * Get payload of JWT cookie
         * @returns {(object | undefined)} JWT payload
         */
        getJWTPayload() {
            const jwtToken = this.storage().token;

            if (jwtToken && jwtToken !== "autoLogin") {
                return jwtDecode(jwtToken);
            }
            return undefined;
        },

        /**
         * Send request to log user in
         * @param {string} username Username to log in with
         * @param {string} password Password to log in with
         * @param {string} token User token
         * @param {loginCB} callback Callback to call with result
         * @returns {void}
         */
        login(username : string, password : string, token : string, callback) {
            this.getSocket().emit("login", {
                username,
                password,
                token,
            }, (res) => {
                if (res.tokenRequired) {
                    callback(res);
                }

                if (res.ok) {
                    this.storage().token = res.token;
                    this.socketIO.token = res.token;
                    this.loggedIn = true;
                    const payload = this.getJWTPayload();
                    this.username = payload?.username;
                    this.userType = payload?.userType || USER_TYPE_ADMIN;

                    this.afterLogin();

                    // Trigger Chrome Save Password
                    history.pushState({}, "");
                }

                callback(res);
            });
        },

        /**
         * Log in using a token
         * @param {string} token Token to log in with
         * @returns {void}
         */
        loginByToken(token : string) {
            socket.emit("loginByToken", token, (res) => {
                this.allowLoginDialog = true;

                if (! res.ok) {
                    this.logout();
                } else {
                    this.loggedIn = true;
                    const payload = this.getJWTPayload();
                    this.username = payload?.username;
                    this.userType = payload?.userType || USER_TYPE_ADMIN;
                    this.afterLogin();
                }
            });
        },

        /**
         * Log out of the web application
         * @returns {void}
         */
        logout() {
            socket.emit("logout", () => { });
            this.storage().removeItem("token");
            this.socketIO.token = null;
            this.loggedIn = false;
            this.username = null;
            this.userType = "";
            this.stackAccessRules = [];
            this.stackAccessIsAdmin = true;
            this.clearData();
        },

        /**
         * @returns {void}
         */
        clearData() {

        },

        afterLogin() {

        },

        bindTerminal(endpoint : string, terminalName : string, terminal : Terminal) {
            // Load terminal, get terminal screen
            this.emitAgent(endpoint, "terminalJoin", terminalName, (res) => {
                if (res.ok) {
                    terminal.write(res.buffer);
                    terminalMap.set(terminalName, terminal);
                } else {
                    this.toastRes(res);
                }
            });
        },

        unbindTerminal(terminalName : string) {
            terminalMap.delete(terminalName);
        },

        /**
         * Check if the current user has a specific permission.
         * Admin users have all permissions.
         * Normal users: detailed per-stack permissions are enforced server-side.
         * On the frontend, we only gate admin-only UI elements.
         * @param {string} permission - The permission to check
         * @returns {boolean}
         */
        hasPermission(permission : string) : boolean {
            if (!this.userType) {
                return false;
            }
            // Admin has all permissions
            if (this.userType === USER_TYPE_ADMIN) {
                return true;
            }
            // For normal users, non-admin permissions are allowed on the frontend
            // (server enforces per-stack access level)
            const adminOnlyPermissions = [ "user.manage", "agent.manage", "settings.edit", "terminal.console" ];
            return !adminOnlyPermissions.includes(permission);
        },

        /**
         * Get the effective access level for a specific stack.
         * Admin users always return "manager" (full access).
         * Normal users: look up the access rules from the server.
         * Supports wildcard rules (* for stackName and/or endpoint).
         * @param {string} stackName - The stack name
         * @param {string} endpoint - The endpoint (empty string for local)
         * @returns {string|null} The access level: "viewer", "operator", "manager", or null if no access
         */
        getStackAccessLevel(stackName : string, endpoint : string = "") : string | null {
            if (this.stackAccessIsAdmin) {
                return "manager";
            }

            // Check for exact match first, then wildcard matches
            // Priority: exact > wildcard stack > wildcard endpoint > wildcard both
            let bestMatch : string | null = null;

            for (const rule of this.stackAccessRules) {
                const stackMatch = rule.stackName === stackName || rule.stackName === "*";
                const endpointMatch = rule.endpoint === endpoint || rule.endpoint === "*";

                if (stackMatch && endpointMatch) {
                    // Use the highest access level found
                    if (!bestMatch || this._accessLevelRank(rule.accessLevel) > this._accessLevelRank(bestMatch)) {
                        bestMatch = rule.accessLevel;
                    }
                }
            }

            return bestMatch;
        },

        /**
         * Get numeric rank of an access level for comparison.
         * Higher rank = more permissions.
         */
        _accessLevelRank(level : string) : number {
            switch (level) {
                case "viewer": return 1;
                case "operator": return 2;
                case "manager": return 3;
                default: return 0;
            }
        },

        /**
         * Check if the user can operate (start/stop/restart) a specific stack.
         * Requires at least "operator" access level.
         */
        canOperateStack(stackName : string, endpoint : string = "") : boolean {
            const level = this.getStackAccessLevel(stackName, endpoint);
            return level !== null && this._accessLevelRank(level) >= 2; // operator or manager
        },

        /**
         * Check if the user can manage (create/edit/delete) a specific stack.
         * Requires "manager" access level.
         */
        canManageStack(stackName : string, endpoint : string = "") : boolean {
            const level = this.getStackAccessLevel(stackName, endpoint);
            return level !== null && this._accessLevelRank(level) >= 3; // manager only
        },

        /**
         * Check if the user has at least viewer access to a specific stack.
         */
        canViewStack(stackName : string, endpoint : string = "") : boolean {
            const level = this.getStackAccessLevel(stackName, endpoint);
            return level !== null && this._accessLevelRank(level) >= 1; // any level
        },

        /**
         * Check if user can use terminal exec on a specific stack.
         * Requires "manager" access level.
         */
        canExecStack(stackName : string, endpoint : string = "") : boolean {
            const level = this.getStackAccessLevel(stackName, endpoint);
            return level !== null && this._accessLevelRank(level) >= 3; // manager only
        },

    }
});
