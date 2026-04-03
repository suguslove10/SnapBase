package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/suguslove10/snapbase/notifications"
	"github.com/suguslove10/snapbase/rbac"
	"github.com/suguslove10/snapbase/webhooks"
)

type OrgHandler struct {
	DB          *sql.DB
	EmailConfig *notifications.EmailConfig
}

// seedOrgForUser creates a personal workspace org for a newly registered user.
func seedOrgForUser(db *sql.DB, userID int, nameHint string) {
	orgName := nameHint + "'s Workspace"
	slug := strings.ToLower(strings.ReplaceAll(nameHint, "@", "-at-")) + "-org-" + strconv.Itoa(userID)

	var orgID int
	err := db.QueryRow(
		"INSERT INTO organizations (name, slug, owner_id) VALUES ($1, $2, $3) RETURNING id",
		orgName, slug, userID,
	).Scan(&orgID)
	if err != nil {
		log.Printf("seedOrgForUser: failed to create org for user %d: %v", userID, err)
		return
	}

	_, err = db.Exec(
		"INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT (org_id, user_id) DO NOTHING",
		orgID, userID,
	)
	if err != nil {
		log.Printf("seedOrgForUser: failed to add owner member for user %d: %v", userID, err)
	}
}

func (h *OrgHandler) GetOrg(c *gin.Context) {
	userID := c.GetInt("user_id")
	var org struct {
		ID      int    `json:"id"`
		Name    string `json:"name"`
		Slug    string `json:"slug"`
		OwnerID int    `json:"owner_id"`
	}
	err := h.DB.QueryRow(`
		SELECT o.id, o.name, o.slug, o.owner_id
		FROM organizations o
		JOIN org_members m ON m.org_id = o.id
		WHERE m.user_id = $1
		ORDER BY (m.role = 'owner') ASC, o.created_at ASC
		LIMIT 1
	`, userID).Scan(&org.ID, &org.Name, &org.Slug, &org.OwnerID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Organization not found"})
		return
	}
	c.JSON(http.StatusOK, org)
}

func (h *OrgHandler) UpdateOrg(c *gin.Context) {
	userID := c.GetInt("user_id")
	orgIDRaw, _ := c.Get("org_id")
	orgRoleStr := ""
	if r, ok := c.Get("org_role"); ok {
		orgRoleStr, _ = r.(string)
	}
	if orgRoleStr != "owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the owner can update organization settings"})
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name is required"})
		return
	}

	_, err := h.DB.Exec(
		"UPDATE organizations SET name = $1 WHERE id = $2 AND owner_id = $3",
		req.Name, orgIDRaw, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update organization"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Organization updated"})
}

func (h *OrgHandler) ListMembers(c *gin.Context) {
	orgIDRaw, exists := c.Get("org_id")
	if !exists {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	rows, err := h.DB.Query(`
		SELECT u.id, u.email, COALESCE(u.name, ''), COALESCE(u.avatar_url, ''), m.role, m.created_at
		FROM org_members m
		JOIN users u ON u.id = m.user_id
		WHERE m.org_id = $1
		ORDER BY m.created_at ASC
	`, orgIDRaw)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch members"})
		return
	}
	defer rows.Close()

	type Member struct {
		ID        int    `json:"id"`
		Email     string `json:"email"`
		Name      string `json:"name"`
		AvatarURL string `json:"avatar_url"`
		Role      string `json:"role"`
		JoinedAt  string `json:"joined_at"`
	}
	var members []Member
	for rows.Next() {
		var m Member
		var joinedAt time.Time
		if err := rows.Scan(&m.ID, &m.Email, &m.Name, &m.AvatarURL, &m.Role, &joinedAt); err != nil {
			continue
		}
		m.JoinedAt = joinedAt.Format(time.RFC3339)
		members = append(members, m)
	}
	if members == nil {
		members = []Member{}
	}
	c.JSON(http.StatusOK, members)
}

func (h *OrgHandler) InviteMember(c *gin.Context) {
	userID := c.GetInt("user_id")
	orgIDRaw, exists := c.Get("org_id")
	if !exists {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No organization found"})
		return
	}
	orgRoleStr := ""
	if r, ok := c.Get("org_role"); ok {
		orgRoleStr, _ = r.(string)
	}
	if !rbac.HasPermission(rbac.Role(orgRoleStr), rbac.PermInviteMembers) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Insufficient permissions to invite members"})
		return
	}

	var req struct {
		Email string `json:"email" binding:"required"`
		Role  string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email and role are required"})
		return
	}

	validRoles := map[string]bool{"admin": true, "engineer": true, "viewer": true}
	if !validRoles[req.Role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid role. Must be admin, engineer, or viewer"})
		return
	}

	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)
	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	_, err := h.DB.Exec(`
		INSERT INTO org_invitations (org_id, email, role, token, invited_by, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, orgIDRaw, req.Email, req.Role, token, userID, expiresAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create invitation"})
		return
	}

	var inviterName, orgName string
	h.DB.QueryRow("SELECT COALESCE(name, email) FROM users WHERE id = $1", userID).Scan(&inviterName)
	h.DB.QueryRow("SELECT name FROM organizations WHERE id = $1", orgIDRaw).Scan(&orgName)

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "https://getsnapbase.com"
	}

	if h.EmailConfig != nil {
		notifications.SendInviteEmail(h.EmailConfig, req.Email, notifications.InviteEmailData{
			OrgName:     orgName,
			InviterName: inviterName,
			Role:        req.Role,
			AcceptURL:   frontendURL + "/invite/" + token,
		})
	}

	// Webhook delivery
	webhooks.DeliverWebhook(h.DB, orgIDRaw.(int), "member.invited", webhooks.MemberEventData{
		Email: req.Email,
		Role:  req.Role,
	})

	c.JSON(http.StatusCreated, gin.H{"message": "Invitation sent", "token": token})
}

func (h *OrgHandler) RemoveMember(c *gin.Context) {
	orgIDRaw, exists := c.Get("org_id")
	if !exists {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No organization found"})
		return
	}
	orgRoleStr := ""
	if r, ok := c.Get("org_role"); ok {
		orgRoleStr, _ = r.(string)
	}
	if !rbac.HasPermission(rbac.Role(orgRoleStr), rbac.PermManageMembers) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Insufficient permissions"})
		return
	}

	memberID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid member ID"})
		return
	}

	var ownerID int
	h.DB.QueryRow("SELECT owner_id FROM organizations WHERE id = $1", orgIDRaw).Scan(&ownerID)
	if memberID == ownerID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot remove the organization owner"})
		return
	}

	result, err := h.DB.Exec("DELETE FROM org_members WHERE org_id = $1 AND user_id = $2", orgIDRaw, memberID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove member"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Member not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Member removed"})
}

func (h *OrgHandler) UpdateMemberRole(c *gin.Context) {
	orgIDRaw, exists := c.Get("org_id")
	if !exists {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No organization found"})
		return
	}
	orgRoleStr := ""
	if r, ok := c.Get("org_role"); ok {
		orgRoleStr, _ = r.(string)
	}
	if !rbac.HasPermission(rbac.Role(orgRoleStr), rbac.PermManageMembers) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Insufficient permissions"})
		return
	}

	memberID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid member ID"})
		return
	}

	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Role is required"})
		return
	}

	validRoles := map[string]bool{"admin": true, "engineer": true, "viewer": true}
	if !validRoles[req.Role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid role"})
		return
	}

	var ownerID int
	h.DB.QueryRow("SELECT owner_id FROM organizations WHERE id = $1", orgIDRaw).Scan(&ownerID)
	if memberID == ownerID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot change the owner's role"})
		return
	}

	result, err := h.DB.Exec("UPDATE org_members SET role = $1 WHERE org_id = $2 AND user_id = $3", req.Role, orgIDRaw, memberID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update role"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Member not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Role updated"})
}

func (h *OrgHandler) ListPendingInvites(c *gin.Context) {
	orgIDRaw, exists := c.Get("org_id")
	if !exists {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	rows, err := h.DB.Query(`
		SELECT i.id, i.email, i.role, i.expires_at, i.created_at
		FROM org_invitations i
		WHERE i.org_id = $1 AND i.accepted_at IS NULL AND i.expires_at > NOW()
		ORDER BY i.created_at DESC
	`, orgIDRaw)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch invitations"})
		return
	}
	defer rows.Close()

	type Invite struct {
		ID        int    `json:"id"`
		Email     string `json:"email"`
		Role      string `json:"role"`
		ExpiresAt string `json:"expires_at"`
		CreatedAt string `json:"created_at"`
	}
	var invites []Invite
	for rows.Next() {
		var inv Invite
		var expiresAt, createdAt time.Time
		if err := rows.Scan(&inv.ID, &inv.Email, &inv.Role, &expiresAt, &createdAt); err != nil {
			continue
		}
		inv.ExpiresAt = expiresAt.Format(time.RFC3339)
		inv.CreatedAt = createdAt.Format(time.RFC3339)
		invites = append(invites, inv)
	}
	if invites == nil {
		invites = []Invite{}
	}
	c.JSON(http.StatusOK, invites)
}

func (h *OrgHandler) DeleteInvite(c *gin.Context) {
	orgIDRaw, exists := c.Get("org_id")
	if !exists {
		c.JSON(http.StatusForbidden, gin.H{"error": "No organization found"})
		return
	}
	orgRoleStr := ""
	if r, ok := c.Get("org_role"); ok {
		orgRoleStr, _ = r.(string)
	}
	if !rbac.HasPermission(rbac.Role(orgRoleStr), rbac.PermInviteMembers) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Insufficient permissions"})
		return
	}

	invID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid invitation ID"})
		return
	}

	result, err := h.DB.Exec("DELETE FROM org_invitations WHERE id = $1 AND org_id = $2", invID, orgIDRaw)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete invitation"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invitation not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Invitation cancelled"})
}

func (h *OrgHandler) GetInvite(c *gin.Context) {
	token := c.Param("token")
	var orgName, role, email string
	var expiresAt time.Time
	err := h.DB.QueryRow(`
		SELECT o.name, i.role, i.email, i.expires_at
		FROM org_invitations i
		JOIN organizations o ON o.id = i.org_id
		WHERE i.token = $1 AND i.accepted_at IS NULL
	`, token).Scan(&orgName, &role, &email, &expiresAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invitation not found or already accepted"})
		return
	}
	if time.Now().After(expiresAt) {
		c.JSON(http.StatusGone, gin.H{"error": "Invitation has expired"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"org_name": orgName,
		"role":     role,
		"email":    email,
	})
}

func (h *OrgHandler) AcceptInvite(c *gin.Context) {
	userID := c.GetInt("user_id")
	token := c.Param("token")

	var invID, orgID int
	var role string
	var expiresAt time.Time
	err := h.DB.QueryRow(`
		SELECT id, org_id, role, expires_at
		FROM org_invitations
		WHERE token = $1 AND accepted_at IS NULL
	`, token).Scan(&invID, &orgID, &role, &expiresAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invitation not found or already accepted"})
		return
	}
	if time.Now().After(expiresAt) {
		c.JSON(http.StatusGone, gin.H{"error": "Invitation has expired"})
		return
	}

	_, err = h.DB.Exec(`
		INSERT INTO org_members (org_id, user_id, role)
		VALUES ($1, $2, $3)
		ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role
	`, orgID, userID, role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to join organization"})
		return
	}

	h.DB.Exec("UPDATE org_invitations SET accepted_at = NOW() WHERE id = $1", invID)

	// Webhook delivery
	var memberEmail string
	h.DB.QueryRow("SELECT email FROM users WHERE id = $1", userID).Scan(&memberEmail)
	webhooks.DeliverWebhook(h.DB, orgID, "member.joined", webhooks.MemberEventData{
		Email: memberEmail,
		Role:  role,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Joined organization successfully"})
}
