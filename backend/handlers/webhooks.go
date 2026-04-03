package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"

	"github.com/suguslove10/snapbase/webhooks"
)

type WebhookHandler struct {
	DB *sql.DB
}

func (h *WebhookHandler) List(c *gin.Context) {
	orgIDRaw, ok := c.Get("org_id")
	if !ok {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	orgID := orgIDRaw.(int)

	rows, err := h.DB.Query(
		`SELECT id, org_id, name, url, COALESCE(secret,''), events, enabled, created_at
		 FROM webhooks WHERE org_id = $1 ORDER BY created_at DESC`,
		orgID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch webhooks"})
		return
	}
	defer rows.Close()

	type WebhookRow struct {
		ID        int       `json:"id"`
		OrgID     int       `json:"org_id"`
		Name      string    `json:"name"`
		URL       string    `json:"url"`
		Secret    string    `json:"secret,omitempty"`
		Events    []string  `json:"events"`
		Enabled   bool      `json:"enabled"`
		CreatedAt time.Time `json:"created_at"`
	}

	var list []WebhookRow
	for rows.Next() {
		var w WebhookRow
		if err := rows.Scan(&w.ID, &w.OrgID, &w.Name, &w.URL, &w.Secret, pq.Array(&w.Events), &w.Enabled, &w.CreatedAt); err != nil {
			continue
		}
		list = append(list, w)
	}
	if list == nil {
		list = []WebhookRow{}
	}
	c.JSON(http.StatusOK, list)
}

func (h *WebhookHandler) Create(c *gin.Context) {
	orgIDRaw, ok := c.Get("org_id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No organization found"})
		return
	}
	orgID := orgIDRaw.(int)

	var req struct {
		Name   string   `json:"name" binding:"required"`
		URL    string   `json:"url" binding:"required"`
		Secret string   `json:"secret"`
		Events []string `json:"events"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and url are required"})
		return
	}
	if len(req.Events) == 0 {
		req.Events = []string{}
	}

	var id int
	err := h.DB.QueryRow(
		`INSERT INTO webhooks (org_id, name, url, secret, events) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		orgID, req.Name, req.URL, req.Secret, pq.Array(req.Events),
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create webhook"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "message": "Webhook created"})
}

func (h *WebhookHandler) Update(c *gin.Context) {
	orgIDRaw, ok := c.Get("org_id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No organization found"})
		return
	}
	orgID := orgIDRaw.(int)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var req struct {
		Name    *string  `json:"name"`
		URL     *string  `json:"url"`
		Secret  *string  `json:"secret"`
		Events  []string `json:"events"`
		Enabled *bool    `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	result, err := h.DB.Exec(
		`UPDATE webhooks SET
			name    = COALESCE($1, name),
			url     = COALESCE($2, url),
			secret  = COALESCE($3, secret),
			events  = COALESCE($4, events),
			enabled = COALESCE($5, enabled)
		 WHERE id = $6 AND org_id = $7`,
		req.Name, req.URL, req.Secret, pq.Array(req.Events), req.Enabled, id, orgID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update webhook"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Webhook not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Webhook updated"})
}

func (h *WebhookHandler) Delete(c *gin.Context) {
	orgIDRaw, ok := c.Get("org_id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No organization found"})
		return
	}
	orgID := orgIDRaw.(int)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	result, err := h.DB.Exec(`DELETE FROM webhooks WHERE id = $1 AND org_id = $2`, id, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete webhook"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Webhook not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Webhook deleted"})
}

func (h *WebhookHandler) Test(c *gin.Context) {
	orgIDRaw, ok := c.Get("org_id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No organization found"})
		return
	}
	orgID := orgIDRaw.(int)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	// Verify ownership
	var count int
	h.DB.QueryRow(`SELECT COUNT(*) FROM webhooks WHERE id = $1 AND org_id = $2`, id, orgID).Scan(&count)
	if count == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Webhook not found"})
		return
	}

	testData := webhooks.BackupEventData{
		ConnectionName: "test-connection",
		DBType:         "postgres",
		SizeBytes:      42240,
		SizeFormatted:  "41.25 KB",
		DurationMS:     523,
		Verified:       true,
		BackupID:       0,
	}

	status, body, failed := webhooks.DeliverWebhookSync(h.DB, id, "backup.success", testData)
	c.JSON(http.StatusOK, gin.H{
		"status_code": status,
		"response":    body,
		"success":     !failed,
	})
}

func (h *WebhookHandler) Deliveries(c *gin.Context) {
	orgIDRaw, ok := c.Get("org_id")
	if !ok {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	orgID := orgIDRaw.(int)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	// Verify ownership
	var count int
	h.DB.QueryRow(`SELECT COUNT(*) FROM webhooks WHERE id = $1 AND org_id = $2`, id, orgID).Scan(&count)
	if count == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Webhook not found"})
		return
	}

	rows, err := h.DB.Query(
		`SELECT id, event, payload::text, COALESCE(response_status, 0), COALESCE(response_body,''), delivered_at, failed, created_at
		 FROM webhook_deliveries WHERE webhook_id = $1
		 ORDER BY created_at DESC LIMIT 50`,
		id,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch deliveries"})
		return
	}
	defer rows.Close()

	type DeliveryRow struct {
		ID             int        `json:"id"`
		Event          string     `json:"event"`
		Payload        string     `json:"payload"`
		ResponseStatus int        `json:"response_status"`
		ResponseBody   string     `json:"response_body"`
		DeliveredAt    *time.Time `json:"delivered_at"`
		Failed         bool       `json:"failed"`
		CreatedAt      time.Time  `json:"created_at"`
	}

	var list []DeliveryRow
	for rows.Next() {
		var d DeliveryRow
		if err := rows.Scan(&d.ID, &d.Event, &d.Payload, &d.ResponseStatus, &d.ResponseBody, &d.DeliveredAt, &d.Failed, &d.CreatedAt); err != nil {
			continue
		}
		list = append(list, d)
	}
	if list == nil {
		list = []DeliveryRow{}
	}
	c.JSON(http.StatusOK, list)
}
