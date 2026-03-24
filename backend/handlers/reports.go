package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"

	"github.com/suguslove10/snapbase/config"
)

type ReportHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

func (h *ReportHandler) GenerateCompliance(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		From string `json:"from" binding:"required"`
		To   string `json:"to" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Provide from and to dates (YYYY-MM-DD)"})
		return
	}

	fromDate, err := time.Parse("2006-01-02", req.From)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid from date"})
		return
	}
	toDate, err := time.Parse("2006-01-02", req.To)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid to date"})
		return
	}
	toDate = toDate.Add(24*time.Hour - time.Second) // end of day

	// Get user email
	var email string
	h.DB.QueryRow("SELECT email FROM users WHERE id = $1", userID).Scan(&email)

	// Stats
	var totalBackups, successBackups, failedBackups int
	var storageUsed int64
	var verifiedCount int

	h.DB.QueryRow(`
		SELECT COUNT(*) FROM backup_jobs b JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1 AND b.started_at >= $2 AND b.started_at <= $3
	`, userID, fromDate, toDate).Scan(&totalBackups)

	h.DB.QueryRow(`
		SELECT COUNT(*) FROM backup_jobs b JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1 AND b.status = 'success' AND b.started_at >= $2 AND b.started_at <= $3
	`, userID, fromDate, toDate).Scan(&successBackups)

	h.DB.QueryRow(`
		SELECT COUNT(*) FROM backup_jobs b JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1 AND b.status = 'failed' AND b.started_at >= $2 AND b.started_at <= $3
	`, userID, fromDate, toDate).Scan(&failedBackups)

	h.DB.QueryRow(`
		SELECT COALESCE(SUM(b.size_bytes), 0) FROM backup_jobs b JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1 AND b.status = 'success' AND b.started_at >= $2 AND b.started_at <= $3
	`, userID, fromDate, toDate).Scan(&storageUsed)

	h.DB.QueryRow(`
		SELECT COUNT(*) FROM backup_jobs b JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1 AND b.verified = true AND b.started_at >= $2 AND b.started_at <= $3
	`, userID, fromDate, toDate).Scan(&verifiedCount)

	successRate := float64(0)
	if totalBackups > 0 {
		successRate = float64(successBackups) / float64(totalBackups) * 100
	}
	verificationRate := float64(0)
	if successBackups > 0 {
		verificationRate = float64(verifiedCount) / float64(successBackups) * 100
	}

	// Per-database stats
	type dbStat struct {
		Name       string
		Type       string
		Backups    int
		Successful int
		Retention  int
	}
	var dbStats []dbStat
	rows, _ := h.DB.Query(`
		SELECT dc.name, dc.type, dc.retention_days,
			COUNT(b.id),
			COUNT(CASE WHEN b.status = 'success' THEN 1 END)
		FROM db_connections dc
		LEFT JOIN backup_jobs b ON b.connection_id = dc.id AND b.started_at >= $2 AND b.started_at <= $3
		WHERE dc.user_id = $1
		GROUP BY dc.id, dc.name, dc.type, dc.retention_days
	`, userID, fromDate, toDate)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var ds dbStat
			rows.Scan(&ds.Name, &ds.Type, &ds.Retention, &ds.Backups, &ds.Successful)
			dbStats = append(dbStats, ds)
		}
	}

	// Anomalies count
	var anomalyCount int
	h.DB.QueryRow(`
		SELECT COUNT(*) FROM anomalies a JOIN db_connections dc ON a.connection_id = dc.id
		WHERE dc.user_id = $1 AND a.created_at >= $2 AND a.created_at <= $3
	`, userID, fromDate, toDate).Scan(&anomalyCount)

	// Generate PDF
	pdf := gofpdf.New("P", "mm", "A4", "")

	// Cover page
	pdf.AddPage()
	pdf.SetFillColor(15, 23, 42) // #0f172a
	pdf.Rect(0, 0, 210, 297, "F")

	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Helvetica", "B", 28)
	pdf.SetY(80)
	pdf.CellFormat(190, 15, "SnapBase", "", 1, "C", false, 0, "")

	pdf.SetFont("Helvetica", "", 16)
	pdf.SetTextColor(148, 163, 184)
	pdf.CellFormat(190, 10, "Compliance Report", "", 1, "C", false, 0, "")

	pdf.SetY(120)
	pdf.SetFont("Helvetica", "", 11)
	pdf.SetTextColor(148, 163, 184)
	pdf.CellFormat(190, 7, fmt.Sprintf("Period: %s to %s", req.From, req.To), "", 1, "C", false, 0, "")
	pdf.CellFormat(190, 7, fmt.Sprintf("Generated: %s", time.Now().Format("2006-01-02 15:04:05 MST")), "", 1, "C", false, 0, "")
	pdf.CellFormat(190, 7, fmt.Sprintf("Account: %s", email), "", 1, "C", false, 0, "")

	// Summary page
	pdf.AddPage()
	pdf.SetFillColor(255, 255, 255)
	pdf.Rect(0, 0, 210, 297, "F")
	pdf.SetTextColor(15, 23, 42)

	pdf.SetFont("Helvetica", "B", 18)
	pdf.CellFormat(190, 12, "Executive Summary", "", 1, "L", false, 0, "")
	pdf.Ln(5)

	pdf.SetFont("Helvetica", "", 11)
	pdf.SetTextColor(71, 85, 105)

	summaryItems := []struct{ label, value string }{
		{"Total Backups", fmt.Sprintf("%d", totalBackups)},
		{"Successful Backups", fmt.Sprintf("%d", successBackups)},
		{"Failed Backups", fmt.Sprintf("%d", failedBackups)},
		{"Success Rate", fmt.Sprintf("%.1f%%", successRate)},
		{"Storage Used", formatStorageSize(storageUsed)},
		{"Verification Rate", fmt.Sprintf("%.1f%%", verificationRate)},
		{"Anomalies Detected", fmt.Sprintf("%d", anomalyCount)},
	}

	for _, item := range summaryItems {
		pdf.SetFont("Helvetica", "", 10)
		pdf.SetTextColor(100, 116, 139)
		pdf.CellFormat(80, 7, item.label, "", 0, "L", false, 0, "")
		pdf.SetFont("Helvetica", "B", 10)
		pdf.SetTextColor(15, 23, 42)
		pdf.CellFormat(110, 7, item.value, "", 1, "L", false, 0, "")
	}

	// Per-database section
	if len(dbStats) > 0 {
		pdf.Ln(10)
		pdf.SetFont("Helvetica", "B", 14)
		pdf.SetTextColor(15, 23, 42)
		pdf.CellFormat(190, 10, "Database Breakdown", "", 1, "L", false, 0, "")
		pdf.Ln(3)

		// Table header
		pdf.SetFont("Helvetica", "B", 9)
		pdf.SetFillColor(241, 245, 249)
		pdf.SetTextColor(71, 85, 105)
		pdf.CellFormat(55, 8, "DATABASE", "1", 0, "L", true, 0, "")
		pdf.CellFormat(30, 8, "TYPE", "1", 0, "L", true, 0, "")
		pdf.CellFormat(30, 8, "BACKUPS", "1", 0, "C", true, 0, "")
		pdf.CellFormat(35, 8, "SUCCESSFUL", "1", 0, "C", true, 0, "")
		pdf.CellFormat(40, 8, "RETENTION", "1", 1, "C", true, 0, "")

		pdf.SetFont("Helvetica", "", 9)
		pdf.SetTextColor(51, 65, 85)
		for _, ds := range dbStats {
			ret := fmt.Sprintf("%d days", ds.Retention)
			if ds.Retention == 0 {
				ret = "Forever"
			}
			pdf.CellFormat(55, 7, ds.Name, "1", 0, "L", false, 0, "")
			pdf.CellFormat(30, 7, ds.Type, "1", 0, "L", false, 0, "")
			pdf.CellFormat(30, 7, fmt.Sprintf("%d", ds.Backups), "1", 0, "C", false, 0, "")
			pdf.CellFormat(35, 7, fmt.Sprintf("%d", ds.Successful), "1", 0, "C", false, 0, "")
			pdf.CellFormat(40, 7, ret, "1", 1, "C", false, 0, "")
		}
	}

	// Footer
	pdf.SetY(-15)
	pdf.SetFont("Helvetica", "I", 8)
	pdf.SetTextColor(148, 163, 184)
	pdf.CellFormat(0, 10, "Generated by SnapBase", "", 0, "C", false, 0, "")

	// Write to response
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=compliance-report-%s-to-%s.pdf", req.From, req.To))
	pdf.Output(c.Writer)
}

func formatStorageSize(bytes int64) string {
	if bytes == 0 {
		return "0 B"
	}
	const k = 1024
	sizes := []string{"B", "KB", "MB", "GB"}
	i := 0
	size := float64(bytes)
	for size >= float64(k) && i < len(sizes)-1 {
		size /= float64(k)
		i++
	}
	return fmt.Sprintf("%.2f %s", size, sizes[i])
}
