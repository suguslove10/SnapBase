package handlers

import (
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v76"
	billingportalSession "github.com/stripe/stripe-go/v76/billingportal/session"
	checkoutSession "github.com/stripe/stripe-go/v76/checkout/session"
	"github.com/stripe/stripe-go/v76/webhook"
	"github.com/suguslove10/snapbase/config"
)

type StripeHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

type StripeCheckoutRequest struct {
	Plan     string `json:"plan" binding:"required"` // pro, growth, business
	Interval string `json:"interval"`                // monthly, yearly
}

func (h *StripeHandler) Checkout(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req StripeCheckoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	apiKey := os.Getenv("STRIPE_SECRET_KEY")
	if apiKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Stripe integration is not configured on this server"})
		return
	}
	stripe.Key = apiKey

	var userEmail string
	err := h.DB.QueryRow("SELECT email FROM users WHERE id = $1", userID).Scan(&userEmail)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	var priceID string
	switch req.Plan {
	case "pro":
		priceID = os.Getenv("STRIPE_PRICE_PRO")
	case "growth":
		priceID = os.Getenv("STRIPE_PRICE_GROWTH")
	case "business":
		priceID = os.Getenv("STRIPE_PRICE_BUSINESS")
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid plan selected"})
		return
	}

	if priceID == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Price ID not configured for plan: " + req.Plan})
		return
	}

	domain := h.Cfg.FrontendURL
	if domain == "" {
		domain = "http://localhost:3001"
	}

	params := &stripe.CheckoutSessionParams{
		CustomerEmail: stripe.String(userEmail),
		PaymentMethodTypes: stripe.StringSlice([]string{
			"card",
		}),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(priceID),
				Quantity: stripe.Int64(1),
			},
		},
		Mode:       stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		SuccessURL: stripe.String(domain + "/billing?session_id={CHECKOUT_SESSION_ID}&success=true"),
		CancelURL:  stripe.String(domain + "/billing?canceled=true"),
		ClientReferenceID: stripe.String(string(rune(userID))),
		Metadata: map[string]string{
			"user_id": string(rune(userID)),
			"plan":    req.Plan,
		},
	}

	s, err := checkoutSession.New(params)
	if err != nil {
		log.Printf("[stripe] failed to create checkout session: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create Stripe checkout session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"url": s.URL, "session_id": s.ID})
}

func (h *StripeHandler) Portal(c *gin.Context) {
	userID := c.GetInt("user_id")

	apiKey := os.Getenv("STRIPE_SECRET_KEY")
	if apiKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Stripe integration is not configured"})
		return
	}
	stripe.Key = apiKey

	var customerID sql.NullString
	err := h.DB.QueryRow("SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1", userID).Scan(&customerID)
	if err != nil || !customerID.Valid || customerID.String == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No active Stripe customer found"})
		return
	}

	domain := h.Cfg.FrontendURL
	if domain == "" {
		domain = "http://localhost:3001"
	}

	params := &stripe.BillingPortalSessionParams{
		Customer:  stripe.String(customerID.String),
		ReturnURL: stripe.String(domain + "/billing"),
	}

	s, err := billingportalSession.New(params)
	if err != nil {
		log.Printf("[stripe] failed to create portal session: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create portal session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"url": s.URL})
}

func (h *StripeHandler) Webhook(c *gin.Context) {
	const MaxBodyBytes = int64(65536)
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxBodyBytes)
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Error reading request body"})
		return
	}

	endpointSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")
	var event stripe.Event

	if endpointSecret != "" {
		signatureHeader := c.GetHeader("Stripe-Signature")
		event, err = webhook.ConstructEvent(payload, signatureHeader, endpointSecret)
		if err != nil {
			log.Printf("[stripe-webhook] verification failed: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Webhook signature verification failed"})
			return
		}
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Webhook secret not set"})
		return
	}

	switch event.Type {
	case "checkout.session.completed":
		var session stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &session); err == nil {
			userIDStr := session.Metadata["user_id"]
			plan := session.Metadata["plan"]
			if userIDStr != "" && plan != "" {
				h.DB.Exec(`
					INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, updated_at)
					VALUES ($1, $2, $3, $4, 'active', NOW())
					ON CONFLICT (user_id) DO UPDATE SET
						stripe_customer_id = EXCLUDED.stripe_customer_id,
						stripe_subscription_id = EXCLUDED.stripe_subscription_id,
						plan = EXCLUDED.plan,
						status = 'active',
						updated_at = NOW()
				`, session.ClientReferenceID, session.Customer.ID, session.Subscription.ID, plan)
				log.Printf("[stripe-webhook] user %s subscribed to plan %s", userIDStr, plan)
			}
		}
	case "customer.subscription.deleted":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err == nil {
			h.DB.Exec(`
				UPDATE subscriptions SET plan = 'free', status = 'canceled', updated_at = NOW()
				WHERE stripe_subscription_id = $1
			`, sub.ID)
			log.Printf("[stripe-webhook] subscription %s canceled", sub.ID)
		}
	}

	c.JSON(http.StatusOK, gin.H{"received": true})
}
