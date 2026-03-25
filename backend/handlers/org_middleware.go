package handlers

import (
	"database/sql"

	"github.com/gin-gonic/gin"
)

// OrgContextMiddleware reads the user's primary org membership from the database
// and sets "org_id" and "org_role" in the gin context for downstream handlers.
// Priority: non-owner memberships come first (invited orgs), then owner orgs.
func OrgContextMiddleware(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetInt("user_id")
		if userID == 0 {
			c.Next()
			return
		}
		var orgID int
		var orgRole string
		err := db.QueryRow(`
			SELECT org_id, role FROM org_members
			WHERE user_id = $1
			ORDER BY (role = 'owner') ASC, created_at ASC
			LIMIT 1
		`, userID).Scan(&orgID, &orgRole)
		if err == nil {
			c.Set("org_id", orgID)
			c.Set("org_role", orgRole)
		}
		c.Next()
	}
}
