package handlers

import (
	"database/sql"
	"log"
	"time"
)

// RecordStorageOverage runs daily. For each user with paid storage, compute peak
// usage for the current calendar month, derive overage bytes vs (plan + add-ons),
// and upsert into storage_overage. Charged at $0.05/GB at month end.
//
// We don't auto-charge here — the row sits with charged=false. A monthly process
// (or admin) reconciles by adding the amount as a one-off Razorpay invoice tied
// to the user's existing subscription.
func RecordStorageOverage(db *sql.DB) {
	now := time.Now().UTC()
	periodStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	periodEnd := periodStart.AddDate(0, 1, 0).Add(-time.Second)

	rows, err := db.Query(`
		SELECT u.id, COALESCE(s.plan, 'free')
		FROM users u
		LEFT JOIN subscriptions s ON s.user_id = u.id
	`)
	if err != nil {
		log.Printf("[overage] query users failed: %v", err)
		return
	}
	defer rows.Close()

	type rec struct {
		id   int
		plan string
	}
	users := []rec{}
	for rows.Next() {
		var r rec
		if err := rows.Scan(&r.id, &r.plan); err != nil {
			continue
		}
		users = append(users, r)
	}

	const overageRateCents = 5 // $0.05 per GB
	const gb = int64(1024 * 1024 * 1024)
	written := 0
	for _, u := range users {
		var used int64
		db.QueryRow(`
			SELECT COALESCE(SUM(b.size_bytes), 0)
			FROM backup_jobs b
			JOIN db_connections dc ON dc.id = b.connection_id
			WHERE dc.user_id = $1 AND b.status = 'success'
		`, u.id).Scan(&used)

		limit := GetStorageLimitWithAddons(db, u.id, u.plan)
		if used <= limit {
			continue
		}
		overageBytes := used - limit
		overageGB := float64(overageBytes) / float64(gb)
		amountCents := int64(overageGB*float64(overageRateCents) + 0.5)

		// Upsert: track running peak this period.
		_, err := db.Exec(`
			INSERT INTO storage_overage (user_id, period_start, period_end, peak_bytes, overage_gb, amount_cents)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (user_id, period_start) DO UPDATE SET
				peak_bytes = GREATEST(storage_overage.peak_bytes, EXCLUDED.peak_bytes),
				overage_gb = GREATEST(storage_overage.overage_gb, EXCLUDED.overage_gb),
				amount_cents = GREATEST(storage_overage.amount_cents, EXCLUDED.amount_cents)
		`, u.id, periodStart, periodEnd, used, overageGB, amountCents)
		if err != nil {
			log.Printf("[overage] upsert failed user=%d: %v", u.id, err)
			continue
		}
		written++
	}
	if written > 0 {
		log.Printf("[overage] tracked overage for %d user(s) period=%s", written, periodStart.Format("2006-01"))
	}
}
