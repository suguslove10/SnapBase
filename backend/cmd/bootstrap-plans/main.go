// Bootstrap script: creates all SnapBase Razorpay plans in one shot and prints
// the env vars to paste into Dokploy. Idempotent — re-running skips plans that
// already exist (matched via notes.snapbase_key).
//
// Usage:
//   cd backend
//   RAZORPAY_KEY_ID=rzp_live_xxx RAZORPAY_KEY_SECRET=yyy go run ./cmd/bootstrap-plans
//
// For test mode, use rzp_test_xxx keys. Same script works for both.
package main

import (
	"fmt"
	"log"
	"os"
	"sort"

	razorpay "github.com/razorpay/razorpay-go"
)

type planSpec struct {
	envVar      string // env var name to print at the end
	snapbaseKey string // tag stored in notes.snapbase_key for idempotency
	period      string // "monthly" | "yearly" (Razorpay terminology)
	itemName    string
	description string
	amountCents int // USD cents
}

var plans = []planSpec{
	{"RAZORPAY_PLAN_PRO_MONTHLY", "pro:monthly", "monthly", "SnapBase Pro (monthly)", "Pro plan — 5 connections, 10GB, 30-day retention", 900},
	{"RAZORPAY_PLAN_PRO_ANNUAL", "pro:annual", "yearly", "SnapBase Pro (annual)", "Pro plan — billed annually, 17% off", 9000},
	{"RAZORPAY_PLAN_TEAM_MONTHLY", "team:monthly", "monthly", "SnapBase Team (monthly)", "Team plan — unlimited connections, 100GB, 90-day retention, 5 seats", 4900},
	{"RAZORPAY_PLAN_TEAM_ANNUAL", "team:annual", "yearly", "SnapBase Team (annual)", "Team plan — billed annually, 17% off", 49000},
	{"RAZORPAY_PLAN_BUSINESS_MONTHLY", "business:monthly", "monthly", "SnapBase Business (monthly)", "Business plan — 500GB, 365-day retention, 25 seats", 14900},
	{"RAZORPAY_PLAN_BUSINESS_ANNUAL", "business:annual", "yearly", "SnapBase Business (annual)", "Business plan — billed annually, 17% off", 149000},
	{"RAZORPAY_PLAN_STORAGE_50", "storage:50", "monthly", "SnapBase Storage +50GB", "Add-on: extra 50GB storage", 500},
	{"RAZORPAY_PLAN_STORAGE_100", "storage:100", "monthly", "SnapBase Storage +100GB", "Add-on: extra 100GB storage", 900},
}

func main() {
	keyID := os.Getenv("RAZORPAY_KEY_ID")
	keySecret := os.Getenv("RAZORPAY_KEY_SECRET")
	if keyID == "" || keySecret == "" {
		log.Fatal("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set")
	}
	currency := os.Getenv("RAZORPAY_CURRENCY")
	if currency == "" {
		currency = "USD"
	}

	client := razorpay.NewClient(keyID, keySecret)

	existing := loadExistingPlans(client)
	results := map[string]string{}

	for _, p := range plans {
		if id, ok := existing[p.snapbaseKey]; ok {
			fmt.Printf("✓ %-32s already exists → %s\n", p.snapbaseKey, id)
			results[p.envVar] = id
			continue
		}

		body := map[string]interface{}{
			"period":   p.period,
			"interval": 1,
			"item": map[string]interface{}{
				"name":        p.itemName,
				"description": p.description,
				"amount":      p.amountCents,
				"currency":    currency,
			},
			"notes": map[string]interface{}{
				"snapbase_key": p.snapbaseKey,
			},
		}
		resp, err := client.Plan.Create(body, nil)
		if err != nil {
			log.Fatalf("✗ create %s: %v", p.snapbaseKey, err)
		}
		id, _ := resp["id"].(string)
		fmt.Printf("+ %-32s created          → %s\n", p.snapbaseKey, id)
		results[p.envVar] = id
	}

	// Sort env block for stable output.
	keys := make([]string, 0, len(results))
	for k := range results {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	fmt.Println("\n────────────────────────────────────────")
	fmt.Println("Paste the following into Dokploy → Environment:")
	fmt.Println("────────────────────────────────────────")
	for _, k := range keys {
		fmt.Printf("%s=%s\n", k, results[k])
	}
	fmt.Println("────────────────────────────────────────")
	fmt.Println("Also confirm these are set:")
	fmt.Println("  RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET")
	fmt.Println("Then redeploy the backend.")
}

// loadExistingPlans fetches all plans and indexes them by notes.snapbase_key
// so the script is safe to re-run.
func loadExistingPlans(client *razorpay.Client) map[string]string {
	out := map[string]string{}
	resp, err := client.Plan.All(map[string]interface{}{"count": 100}, nil)
	if err != nil {
		log.Printf("warning: could not list existing plans (%v) — will attempt to create all", err)
		return out
	}
	items, _ := resp["items"].([]interface{})
	for _, it := range items {
		m, ok := it.(map[string]interface{})
		if !ok {
			continue
		}
		id, _ := m["id"].(string)
		notes, _ := m["notes"].(map[string]interface{})
		key, _ := notes["snapbase_key"].(string)
		if id != "" && key != "" {
			out[key] = id
		}
	}
	return out
}
