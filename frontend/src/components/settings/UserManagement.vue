<template>
    <div>
        <!-- User List Table -->
        <div class="shadow-box big-padding">
            <div class="mb-3">
                <button class="btn btn-primary" @click="showAddDialog = true">
                    <font-awesome-icon icon="plus" class="me-1" />
                    {{ $t("Add User") }}
                </button>
            </div>

            <table class="table table-hover" aria-label="User list">
                <thead>
                    <tr>
                        <th>{{ $t("Username") }}</th>
                        <th>{{ $t("Role") }}</th>
                        <th>{{ $t("Status") }}</th>
                        <th>{{ $t("Actions") }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="user in userList" :key="user.id">
                        <td>{{ user.username }}</td>
                        <td>
                            <span class="badge" :class="roleBadgeClass(user.role)">
                                {{ roleLabel(user.role) }}
                            </span>
                        </td>
                        <td>
                            <span v-if="user.active" class="badge bg-success">{{ $t("Active") }}</span>
                            <span v-else class="badge bg-danger">{{ $t("Inactive") }}</span>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary me-1" @click="editUser(user)">
                                <font-awesome-icon icon="pen" />
                            </button>
                            <button class="btn btn-sm btn-outline-info me-1" @click="manageAccess(user)">
                                <font-awesome-icon icon="key" />
                            </button>
                            <button
                                v-if="user.id !== currentUserId"
                                class="btn btn-sm btn-outline-danger"
                                @click="confirmDelete(user)"
                            >
                                <font-awesome-icon icon="trash" />
                            </button>
                        </td>
                    </tr>
                    <tr v-if="userList.length === 0">
                        <td colspan="4" class="text-center text-muted">
                            {{ $t("No users found") }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <BModal
            v-model="showAddDialog"
            :title="editingUser ? $t('Edit User') : $t('Add User')"
            :okTitle="editingUser ? $t('Save') : $t('Add')"
            :cancelTitle="$t('cancel')"
            @ok="saveUser"
            @hidden="resetForm"
        >
            <div class="mb-3">
                <label for="userFormUsername" class="form-label">{{ $t("Username") }}</label>
                <input
                    id="userFormUsername"
                    v-model="userForm.username"
                    type="text"
                    class="form-control"
                    :disabled="!!editingUser"
                    required
                >
            </div>
            <div class="mb-3">
                <label for="userFormPassword" class="form-label">
                    {{ $t("Password") }}
                    <span v-if="editingUser" class="text-muted">({{ $t("Leave blank to keep current") }})</span>
                </label>
                <input
                    id="userFormPassword"
                    v-model="userForm.password"
                    type="password"
                    class="form-control"
                    autocomplete="new-password"
                >
            </div>
            <div class="mb-3">
                <label for="userFormRole" class="form-label">{{ $t("Role") }}</label>
                <select id="userFormRole" v-model="userForm.role" class="form-select">
                    <option v-for="role in allRoles" :key="role" :value="role">
                        {{ roleLabel(role) }}
                    </option>
                </select>
            </div>
            <div v-if="editingUser" class="mb-3 form-check">
                <input
                    id="userFormActive"
                    v-model="userForm.active"
                    class="form-check-input"
                    type="checkbox"
                    :disabled="editingUser && editingUser.id === currentUserId"
                >
                <label class="form-check-label" for="userFormActive">
                    {{ $t("Active") }}
                </label>
            </div>
        </BModal>

        <!-- Delete Confirmation Dialog -->
        <BModal
            v-model="showDeleteDialog"
            :title="$t('Delete User')"
            :okTitle="$t('Delete')"
            :cancelTitle="$t('cancel')"
            okVariant="danger"
            @ok="deleteUser"
        >
            <p>{{ $t("deleteUserMsg", [deletingUser?.username]) }}</p>
        </BModal>

        <!-- Stack Access Dialog -->
        <BModal
            v-model="showAccessDialog"
            :title="$t('Stack Access') + ': ' + (accessUser?.username || '')"
            :okTitle="$t('Save')"
            :cancelTitle="$t('cancel')"
            size="lg"
            @ok="saveStackAccess"
        >
            <div v-if="accessUser && accessUser.role === 'admin'" class="alert alert-info">
                {{ $t("adminFullAccess") }}
            </div>
            <div v-else>
                <div class="mb-3">
                    <p class="text-muted">{{ $t("stackAccessDesc") }}</p>
                </div>

                <!-- Existing access list -->
                <div v-for="(access, index) in stackAccessList" :key="index" class="input-group mb-2">
                    <select v-model="access.endpoint" class="form-select">
                        <option value="">{{ $t('Endpoint (empty for local)') }}</option>
                        <option v-for="(agent, agentEndpoint) in $root.agentList" :key="agentEndpoint" :value="agentEndpoint">
                            {{ agent.name }} ({{ agentEndpoint }})
                        </option>
                    </select>

                    <input
                        v-model="access.stackName"
                        type="text"
                        class="form-control"
                        :placeholder="$t('stackName')"
                        :list="'stack-list-' + index"
                    >
                    <datalist :id="'stack-list-' + index">
                        <option v-for="stackName in availableStacksForEndpoint(access.endpoint)" :key="stackName" :value="stackName"></option>
                    </datalist>

                    <button class="btn btn-outline-danger" @click="removeAccessEntry(index)">
                        <font-awesome-icon icon="trash" />
                    </button>
                </div>

                <button class="btn btn-sm btn-normal" @click="addAccessEntry">
                    <font-awesome-icon icon="plus" class="me-1" />
                    {{ $t("Add") }}
                </button>
            </div>
        </BModal>
    </div>
</template>

<script>
import { BModal } from "bootstrap-vue-next";
import { ALL_ROLES, ROLE_LABELS } from "../../../../common/util-common";

export default {
    components: {
        BModal,
    },
    data() {
        return {
            userList: [],
            showAddDialog: false,
            showDeleteDialog: false,
            showAccessDialog: false,
            editingUser: null,
            deletingUser: null,
            accessUser: null,
            stackAccessList: [],
            userForm: {
                username: "",
                password: "",
                role: "viewer",
                active: true,
            },
        };
    },
    computed: {
        allRoles() {
            return ALL_ROLES;
        },
        currentUserId() {
            // Get current user ID from JWT payload
            const payload = this.$root.getJWTPayload();
            return payload?.id;
        },
    },
    mounted() {
        this.loadUsers();
    },
    methods: {
        roleLabel(role) {
            return ROLE_LABELS[role] || role;
        },

        roleBadgeClass(role) {
            switch (role) {
            case "admin":
                return "bg-danger";
            case "manager":
                return "bg-primary";
            case "operator":
                return "bg-warning text-dark";
            case "viewer":
                return "bg-secondary";
            default:
                return "bg-secondary";
            }
        },

        loadUsers() {
            this.$root.getSocket().emit("getUserList", (res) => {
                if (res.ok) {
                    this.userList = res.users;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        editUser(user) {
            this.editingUser = user;
            this.userForm = {
                username: user.username,
                password: "",
                role: user.role,
                active: !!user.active,
            };
            this.showAddDialog = true;
        },

        saveUser(e) {
            e.preventDefault();
            if (this.editingUser) {
                // Edit existing user
                const data = {
                    id: this.editingUser.id,
                    role: this.userForm.role,
                    active: this.userForm.active,
                };

                if (this.userForm.password) {
                    data.password = this.userForm.password;
                }

                this.$root.getSocket().emit("editUser", data, (res) => {
                    this.$root.toastRes(res);
                    if (res.ok) {
                        this.showAddDialog = false;
                        this.loadUsers();
                    }
                });
            } else {
                // Add new user
                this.$root.getSocket().emit("addUser", {
                    username: this.userForm.username,
                    password: this.userForm.password,
                    role: this.userForm.role,
                }, (res) => {
                    this.$root.toastRes(res);
                    if (res.ok) {
                        this.showAddDialog = false;
                        this.loadUsers();
                    }
                });
            }
        },

        confirmDelete(user) {
            this.deletingUser = user;
            this.showDeleteDialog = true;
        },

        deleteUser(e) {
            e.preventDefault();
            if (this.deletingUser) {
                this.$root.getSocket().emit("deleteUser", this.deletingUser.id, (res) => {
                    this.$root.toastRes(res);
                    if (res.ok) {
                        this.showDeleteDialog = false;
                        this.loadUsers();
                    }
                });
            }
        },

        manageAccess(user) {
            this.accessUser = user;
            this.stackAccessList = [];

            // Load existing access
            this.$root.getSocket().emit("getStackAccess", user.id, (res) => {
                if (res.ok) {
                    this.stackAccessList = res.accessList.map(a => ({
                        stackName: a.stack_name,
                        endpoint: a.endpoint,
                    }));
                }
                this.showAccessDialog = true;
            });
        },

        addAccessEntry() {
            this.stackAccessList.push({
                stackName: "",
                endpoint: "",
            });
        },

        removeAccessEntry(index) {
            this.stackAccessList.splice(index, 1);
        },

        saveStackAccess(e) {
            e.preventDefault();
            if (this.accessUser) {
                this.$root.getSocket().emit("setStackAccess", {
                    userId: this.accessUser.id,
                    stackAccess: this.stackAccessList.filter(a => a.stackName.trim() !== ""),
                }, (res) => {
                    this.$root.toastRes(res);
                    if (res.ok) {
                        this.showAccessDialog = false;
                    }
                });
            }
        },

        resetForm() {
            this.editingUser = null;
            this.userForm = {
                username: "",
                password: "",
                role: "viewer",
                active: true,
            };
        },

        availableStacksForEndpoint(endpoint) {
            if (!endpoint || endpoint === "") {
                return Object.keys(this.$root.stackList || {}).sort();
            } else {
                if (this.$root.allAgentStackList[endpoint] && this.$root.allAgentStackList[endpoint].stackList) {
                    return Object.keys(this.$root.allAgentStackList[endpoint].stackList).sort();
                }
                return [];
            }
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../../styles/vars.scss";

.table {
    th {
        font-weight: 600;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
}

.text-muted {
    .dark & {
        color: $dark-font-color3 !important;
    }
}
</style>
