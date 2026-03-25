package rbac

// Role represents a user's role within an organization.
type Role string

// Permission represents an action a user may perform.
type Permission string

const (
	RoleOwner    Role = "owner"
	RoleAdmin    Role = "admin"
	RoleEngineer Role = "engineer"
	RoleViewer   Role = "viewer"
)

const (
	PermManageMembers    Permission = "manage_members"
	PermInviteMembers    Permission = "invite_members"
	PermViewMembers      Permission = "view_members"
	PermManageConnections Permission = "manage_connections"
	PermViewConnections  Permission = "view_connections"
	PermTriggerBackup    Permission = "trigger_backup"
	PermViewBackups      Permission = "view_backups"
	PermManageSchedules  Permission = "manage_schedules"
	PermViewSchedules    Permission = "view_schedules"
)

var rolePermissions = map[Role][]Permission{
	RoleOwner: {
		PermManageMembers, PermInviteMembers, PermViewMembers,
		PermManageConnections, PermViewConnections,
		PermTriggerBackup, PermViewBackups,
		PermManageSchedules, PermViewSchedules,
	},
	RoleAdmin: {
		PermInviteMembers, PermViewMembers,
		PermManageConnections, PermViewConnections,
		PermTriggerBackup, PermViewBackups,
		PermManageSchedules, PermViewSchedules,
	},
	RoleEngineer: {
		PermViewMembers,
		PermManageConnections, PermViewConnections,
		PermTriggerBackup, PermViewBackups,
		PermManageSchedules, PermViewSchedules,
	},
	RoleViewer: {
		PermViewMembers,
		PermViewConnections,
		PermViewBackups,
		PermViewSchedules,
	},
}

// HasPermission returns true if the given role includes the given permission.
func HasPermission(role Role, perm Permission) bool {
	for _, p := range rolePermissions[role] {
		if p == perm {
			return true
		}
	}
	return false
}
