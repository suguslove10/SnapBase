// End-to-end smoke test suite for the SnapBase API.
// Hits the live deployment (or any URL via -url) and verifies every critical
// path: health, auth, billing trial, connections, referrals, admin gating,
// webhook HMAC, plan catalog wiring.
//
// Each run uses a unique email so it's idempotent and safe to re-run.
//
// Usage:
//   go run ./cmd/smoketest                         # production
//   go run ./cmd/smoketest -url http://localhost:8080
//   go run ./cmd/smoketest -admin sugugalag@gmail.com  # also tests admin endpoint via that email
package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

var (
	baseURL       = flag.String("url", "https://api.getsnapbase.com", "API base URL (no trailing slash)")
	webhookSecret = flag.String("wh", "f49c47a9f9a0e3145b49cc9c81b131ae7cf337e94a156c002c207aff74ff10d2", "RAZORPAY_WEBHOOK_SECRET")
	adminEmail    = flag.String("admin", "sugugalag@gmail.com", "email for admin metrics test (must be in ADMIN_EMAILS)")

	passed int
	failed int
	skips  int
)

type ctx struct {
	token   string
	email   string
	userID  int
	connID  int
	subID   string
	planID  string
}

func main() {
	flag.Parse()

	state := &ctx{
		email: fmt.Sprintf("smoketest+%d@getsnapbase.com", time.Now().Unix()),
	}

	fmt.Printf("Smoke testing %s\n", *baseURL)
	fmt.Printf("Test email: %s\n", state.email)
	fmt.Println(strings.Repeat("-", 60))

	tests := []struct {
		name string
		fn   func() error
	}{
		{"GET /api/status (public)", func() error { return testStatus() }},
		{"GET /api/auth/providers (public)", func() error { return testProviders() }},
		{"POST /api/auth/register", func() error { return testRegister(state) }},
		{"POST /api/auth/login", func() error { return testLogin(state) }},
		{"GET /api/auth/me", func() error { return testMe(state) }},
		{"POST /api/auth/refresh", func() error { return testRefresh(state) }},
		{"GET /api/billing/subscription (trial)", func() error { return testSubscription(state) }},
		{"GET /api/billing/usage", func() error { return testUsage(state) }},
		{"GET /api/billing/invoices (empty)", func() error { return testInvoices(state) }},
		{"GET /api/storage-addons (empty)", func() error { return testStorageAddons(state) }},
		{"GET /api/referrals/stats", func() error { return testReferralStats(state) }},
		{"GET /api/connections (empty)", func() error { return testConnectionsEmpty(state) }},
		{"GET /api/backups (empty)", func() error { return testBackupsEmpty(state) }},
		{"GET /api/admin/metrics (gated)", func() error { return testAdminMetrics(state) }},
		{"POST /api/billing/checkout (Pro monthly)", func() error { return testCheckout(state) }},
		{"POST /api/billing/webhook (valid HMAC)", func() error { return testWebhookValid(state) }},
		{"POST /api/billing/webhook (invalid HMAC rejected)", func() error { return testWebhookInvalid() }},
		{"GET /api/auth/me (after refresh, still 200)", func() error { return testMe(state) }},
	}

	for _, t := range tests {
		err := t.fn()
		if err != nil {
			if strings.HasPrefix(err.Error(), "SKIP:") {
				skips++
				fmt.Printf("⊘ %-50s %s\n", t.name, err.Error())
			} else {
				failed++
				fmt.Printf("✗ %-50s %s\n", t.name, err.Error())
			}
		} else {
			passed++
			fmt.Printf("✓ %-50s\n", t.name)
		}
	}

	fmt.Println(strings.Repeat("-", 60))
	fmt.Printf("Results: %d passed, %d failed, %d skipped\n", passed, failed, skips)
	if failed > 0 {
		os.Exit(1)
	}
}

// ---------- helpers ----------

func req(method, path, token string, body any) (int, []byte, error) {
	var bodyReader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(b)
	}
	r, err := http.NewRequest(method, *baseURL+path, bodyReader)
	if err != nil {
		return 0, nil, err
	}
	if body != nil {
		r.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, b, nil
}

func reqJSON(method, path, token string, body any) (int, map[string]any, error) {
	code, raw, err := req(method, path, token, body)
	if err != nil {
		return code, nil, err
	}
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	return code, out, nil
}

func mustOK(code int, raw map[string]any) error {
	if code < 200 || code >= 300 {
		return fmt.Errorf("status %d: %v", code, raw)
	}
	return nil
}

// ---------- tests ----------

func testStatus() error {
	code, body, err := reqJSON("GET", "/api/status", "", nil)
	if err != nil {
		return err
	}
	if err := mustOK(code, body); err != nil {
		return err
	}
	if body["overall"] == nil {
		return fmt.Errorf("no 'overall' field in response")
	}
	return nil
}

func testProviders() error {
	code, _, err := req("GET", "/api/auth/providers", "", nil)
	if err != nil {
		return err
	}
	if code != 200 {
		return fmt.Errorf("status %d", code)
	}
	return nil
}

func testRegister(s *ctx) error {
	code, body, err := reqJSON("POST", "/api/auth/register", "", map[string]any{
		"email":    s.email,
		"password": "smoketest123!",
		"name":     "Smoke Test",
	})
	if err != nil {
		return err
	}
	return mustOK(code, body)
}

func testLogin(s *ctx) error {
	code, body, err := reqJSON("POST", "/api/auth/login", "", map[string]any{
		"email":    s.email,
		"password": "smoketest123!",
	})
	if err != nil {
		return err
	}
	if err := mustOK(code, body); err != nil {
		return err
	}
	tok, ok := body["token"].(string)
	if !ok || tok == "" {
		return fmt.Errorf("no token in response")
	}
	s.token = tok
	return nil
}

func testMe(s *ctx) error {
	code, body, err := reqJSON("GET", "/api/auth/me", s.token, nil)
	if err != nil {
		return err
	}
	if err := mustOK(code, body); err != nil {
		return err
	}
	if id, ok := body["id"].(float64); ok {
		s.userID = int(id)
	}
	return nil
}

func testRefresh(s *ctx) error {
	code, body, err := reqJSON("POST", "/api/auth/refresh", s.token, nil)
	if err != nil {
		return err
	}
	// Older tokens (< 24h) may be returned unchanged; both 200 paths are fine.
	if err := mustOK(code, body); err != nil {
		return err
	}
	if tok, ok := body["token"].(string); ok && tok != "" {
		s.token = tok
	}
	return nil
}

func testSubscription(s *ctx) error {
	code, body, err := reqJSON("GET", "/api/billing/subscription", s.token, nil)
	if err != nil {
		return err
	}
	if err := mustOK(code, body); err != nil {
		return err
	}
	// New users should land on a Pro trial.
	if status, _ := body["status"].(string); status != "trialing" {
		return fmt.Errorf("expected 'trialing', got %q", status)
	}
	if plan, _ := body["plan"].(string); plan != "pro" {
		return fmt.Errorf("expected plan 'pro', got %q", plan)
	}
	return nil
}

func testUsage(s *ctx) error {
	code, body, err := reqJSON("GET", "/api/billing/usage", s.token, nil)
	if err != nil {
		return err
	}
	return mustOK(code, body)
}

func testInvoices(s *ctx) error {
	code, _, err := req("GET", "/api/billing/invoices", s.token, nil)
	if err != nil {
		return err
	}
	if code != 200 {
		return fmt.Errorf("status %d", code)
	}
	return nil
}

func testStorageAddons(s *ctx) error {
	code, _, err := req("GET", "/api/storage-addons", s.token, nil)
	if err != nil {
		return err
	}
	if code != 200 {
		return fmt.Errorf("status %d", code)
	}
	return nil
}

func testReferralStats(s *ctx) error {
	code, body, err := reqJSON("GET", "/api/referrals/stats", s.token, nil)
	if err != nil {
		return err
	}
	if err := mustOK(code, body); err != nil {
		return err
	}
	if code, _ := body["code"].(string); code == "" {
		return fmt.Errorf("no referral code generated")
	}
	if link, _ := body["link"].(string); !strings.Contains(link, "?ref=") {
		return fmt.Errorf("referral link malformed: %q", link)
	}
	return nil
}

func testConnectionsEmpty(s *ctx) error {
	code, _, err := req("GET", "/api/connections", s.token, nil)
	if err != nil {
		return err
	}
	if code != 200 {
		return fmt.Errorf("status %d", code)
	}
	return nil
}

func testBackupsEmpty(s *ctx) error {
	code, _, err := req("GET", "/api/backups", s.token, nil)
	if err != nil {
		return err
	}
	if code != 200 {
		return fmt.Errorf("status %d", code)
	}
	return nil
}

func testAdminMetrics(s *ctx) error {
	if !strings.Contains(*adminEmail, "@") {
		return fmt.Errorf("SKIP: no -admin flag")
	}
	// First: confirm non-admin user (the smoketest user) gets denied.
	code, _, _ := req("GET", "/api/admin/metrics", s.token, nil)
	if code == 200 {
		return fmt.Errorf("expected non-admin to be denied, got 200")
	}
	if code != 401 && code != 403 {
		return fmt.Errorf("expected 401/403 for non-admin, got %d", code)
	}
	// We can't easily test the positive path without an admin password — that requires
	// real ADMIN_EMAILS user creds, which we don't want to hardcode. Negative test is enough.
	return nil
}

func testCheckout(s *ctx) error {
	code, body, err := reqJSON("POST", "/api/billing/checkout", s.token, map[string]any{
		"plan":   "pro",
		"period": "monthly",
	})
	if err != nil {
		return err
	}
	if err := mustOK(code, body); err != nil {
		return err
	}
	if subID, _ := body["subscription_id"].(string); subID == "" {
		return fmt.Errorf("no subscription_id in response (plan IDs not configured?)")
	} else {
		s.subID = subID
	}
	return nil
}

func testWebhookValid(s *ctx) error {
	if *webhookSecret == "" {
		return fmt.Errorf("SKIP: no webhook secret")
	}
	payload := []byte(`{"event":"subscription.charged","payload":{"subscription":{"entity":{"id":"sub_smoke"}}}}`)
	mac := hmac.New(sha256.New, []byte(*webhookSecret))
	mac.Write(payload)
	sig := hex.EncodeToString(mac.Sum(nil))

	r, _ := http.NewRequest("POST", *baseURL+"/api/billing/webhook", bytes.NewReader(payload))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Razorpay-Signature", sig)
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("status %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func testWebhookInvalid() error {
	payload := []byte(`{"event":"subscription.charged"}`)
	r, _ := http.NewRequest("POST", *baseURL+"/api/billing/webhook", bytes.NewReader(payload))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Razorpay-Signature", "0000000000000000000000000000000000000000000000000000000000000000")
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 200 {
		return fmt.Errorf("invalid HMAC accepted (expected reject)")
	}
	return nil
}
