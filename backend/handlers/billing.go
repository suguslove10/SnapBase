package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	stripe "github.com/stripe/stripe-go/v76"
	"github.com/stripe/stripe-go/v76/billingportal/session"
	checkoutsession "github.com/stripe/stripe-go/v76/checkout/session"
	"github.com/stripe/stripe-go/v76/customer"
	"github.com/stripe/stripe-go/v76/webhook"

	"github.com/suguslove10/snapbase/config"
)

type BillingHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

// getUserPlan returns the plan for a user ('free', 'pro', or 'team').
// Defaults to 'free' if no subscription record exists.
func getUserPlan(db *sql.DB, userID int) string {
	var plan, status string
	err := db.QueryRow(
		"SELECT plan, status FROM subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
		userID,
	).Scan(&plan, &status)
	if err != nil {
		return "free"
	}
	if status == "active" || status == "trialing" {
		return plan
	}
	return "free"
}

// seedFreeSubscription inserts a free subscription row for a newly created user.
func seedFreeSubscription(db *sql.DB, userID int) {
	db.Exec(
		"INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, 'free', 'active') ON CONFLICT DO NOTHING",
		userID,
	)
}

// GetSubscription returns the current user's subscription info.
func (h *BillingHandler) GetSubscription(c *gin.Context) {
	userID := c.GetInt("user_id")

	var sub struct {
		Plan              string         `json:"plan"`
		Status            string         `json:"status"`
		StripeCustomerID  sql.NullString `json:"-"`
		CurrentPeriodEnd  sql.NullTime   `json:"current_period_end"`
		CancelAtPeriodEnd bool           `json:"cancel_at_period_end"`
	}

	err := h.DB.QueryRow(`
		SELECT plan, status, stripe_customer_id, current_period_end, cancel_at_period_end
		FROM subscriptions WHERE user_id = $1
		ORDER BY id DESC LIMIT 1
	`, userID).Scan(&sub.Plan, &sub.Status, &sub.StripeCustomerID, &sub.CurrentPeriodEnd, &sub.CancelAtPeriodEnd)

	if err != nil {
		// No subscription row — default free
		c.JSON(http.StatusOK, gin.H{
			"plan":                "free",
			"status":              "active",
			"current_period_end":  nil,
			"cancel_at_period_end": false,
		})
		return
	}

	var periodEnd interface{}
	if sub.CurrentPeriodEnd.Valid {
		periodEnd = sub.CurrentPeriodEnd.Time
	}

	c.JSON(http.StatusOK, gin.H{
		"plan":                sub.Plan,
		"status":              sub.Status,
		"current_period_end":  periodEnd,
		"cancel_at_period_end": sub.CancelAtPeriodEnd,
	})
}

// Checkout creates a Stripe Checkout session and returns the redirect URL.
func (h *BillingHandler) Checkout(c *gin.Context) {
	userID := c.GetInt("user_id")
	email := c.GetString("email")

	var req struct {
		Plan string `json:"plan" binding:"required"` // "pro" or "team"
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan is required (pro or team)"})
		return
	}

	stripe.Key = h.Cfg.StripeSecretKey

	var priceID string
	switch strings.ToLower(req.Plan) {
	case "pro":
		priceID = h.Cfg.StripeProPriceID
	case "team":
		priceID = h.Cfg.StripeTeamPriceID
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan must be 'pro' or 'team'"})
		return
	}

	if priceID == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Stripe price not configured"})
		return
	}

	// Get or create Stripe customer
	var stripeCustomerID sql.NullString
	h.DB.QueryRow(
		"SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 AND stripe_customer_id IS NOT NULL ORDER BY id DESC LIMIT 1",
		userID,
	).Scan(&stripeCustomerID)

	var custID string
	if stripeCustomerID.Valid && stripeCustomerID.String != "" {
		custID = stripeCustomerID.String
	} else {
		cust, err := customer.New(&stripe.CustomerParams{
			Email: stripe.String(email),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create Stripe customer"})
			return
		}
		custID = cust.ID
	}

	params := &stripe.CheckoutSessionParams{
		Customer:           stripe.String(custID),
		ClientReferenceID:  stripe.String(fmt.Sprintf("%d", userID)),
		Mode:               stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		SuccessURL:         stripe.String(h.Cfg.FrontendURL + "/dashboard?upgraded=true"),
		CancelURL:          stripe.String(h.Cfg.FrontendURL + "/pricing"),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(priceID),
				Quantity: stripe.Int64(1),
			},
		},
	}

	sess, err := checkoutsession.New(params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create checkout session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"url": sess.URL})
}

// Portal creates a Stripe Billing Portal session and returns the redirect URL.
func (h *BillingHandler) Portal(c *gin.Context) {
	userID := c.GetInt("user_id")
	stripe.Key = h.Cfg.StripeSecretKey

	var custID string
	err := h.DB.QueryRow(
		"SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 AND stripe_customer_id IS NOT NULL ORDER BY id DESC LIMIT 1",
		userID,
	).Scan(&custID)
	if err != nil || custID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No billing account found. Please subscribe first."})
		return
	}

	params := &stripe.BillingPortalSessionParams{
		Customer:  stripe.String(custID),
		ReturnURL: stripe.String(h.Cfg.FrontendURL + "/dashboard"),
	}
	sess, err := session.New(params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create portal session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"url": sess.URL})
}

// Webhook handles Stripe webhook events (must be a public route — no auth middleware).
func (h *BillingHandler) Webhook(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot read body"})
		return
	}

	var event stripe.Event
	if h.Cfg.StripeWebhookSecret != "" {
		event, err = webhook.ConstructEvent(body, c.GetHeader("Stripe-Signature"), h.Cfg.StripeWebhookSecret)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid webhook signature"})
			return
		}
	} else {
		// Dev mode: parse without signature check
		if err := json.Unmarshal(body, &event); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event"})
			return
		}
	}

	stripe.Key = h.Cfg.StripeSecretKey

	switch event.Type {
	case "checkout.session.completed":
		var sess stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &sess); err != nil {
			break
		}
		if sess.ClientReferenceID == "" || sess.Customer == nil {
			break
		}
		var userID int
		fmt.Sscanf(sess.ClientReferenceID, "%d", &userID)
		if userID == 0 {
			break
		}

		subID := ""
		if sess.Subscription != nil {
			subID = sess.Subscription.ID
		}

		h.DB.Exec(`
			INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status)
			VALUES ($1, $2, $3, 'pro', 'active')
			ON CONFLICT (user_id) DO UPDATE
			SET stripe_customer_id = $2, stripe_subscription_id = $3, plan = 'pro', status = 'active', updated_at = NOW()
		`, userID, sess.Customer.ID, subID)

	case "customer.subscription.updated", "customer.subscription.created":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			break
		}

		plan := h.planFromSubscription(&sub)
		h.DB.Exec(`
			UPDATE subscriptions
			SET plan = $1, status = $2, current_period_end = to_timestamp($3),
			    cancel_at_period_end = $4, stripe_subscription_id = $5, updated_at = NOW()
			WHERE stripe_customer_id = $6
		`, plan, string(sub.Status), sub.CurrentPeriodEnd,
			sub.CancelAtPeriodEnd, sub.ID, sub.Customer.ID)

	case "customer.subscription.deleted":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			break
		}
		h.DB.Exec(`
			UPDATE subscriptions SET plan = 'free', status = 'canceled', updated_at = NOW()
			WHERE stripe_customer_id = $1
		`, sub.Customer.ID)
	}

	c.JSON(http.StatusOK, gin.H{"received": true})
}

func (h *BillingHandler) planFromSubscription(sub *stripe.Subscription) string {
	if len(sub.Items.Data) == 0 {
		return "pro"
	}
	priceID := sub.Items.Data[0].Price.ID
	switch priceID {
	case h.Cfg.StripeTeamPriceID:
		return "team"
	default:
		return "pro"
	}
}
