// Package middleware provides HTTP middleware for the SnapBase API.
package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// bucket is a simple token-bucket rate limiter for one client.
type bucket struct {
	tokens   float64
	capacity float64
	refill   float64 // tokens per second
	lastSeen time.Time
}

func (b *bucket) allow() bool {
	now := time.Now()
	elapsed := now.Sub(b.lastSeen).Seconds()
	b.lastSeen = now
	b.tokens += elapsed * b.refill
	if b.tokens > b.capacity {
		b.tokens = b.capacity
	}
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// limiter holds per-IP buckets.
type limiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	capacity float64
	refill   float64
}

func newLimiter(requestsPerMinute float64) *limiter {
	l := &limiter{
		buckets:  make(map[string]*bucket),
		capacity: requestsPerMinute,
		refill:   requestsPerMinute / 60.0,
	}
	// Cleanup goroutine — remove stale entries every 5 minutes.
	go func() {
		for range time.Tick(5 * time.Minute) {
			l.mu.Lock()
			cutoff := time.Now().Add(-10 * time.Minute)
			for ip, b := range l.buckets {
				if b.lastSeen.Before(cutoff) {
					delete(l.buckets, ip)
				}
			}
			l.mu.Unlock()
		}
	}()
	return l
}

func (l *limiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[ip]
	if !ok {
		b = &bucket{
			tokens:   l.capacity,
			capacity: l.capacity,
			refill:   l.refill,
			lastSeen: time.Now(),
		}
		l.buckets[ip] = b
	}
	return b.allow()
}

var (
	generalLimiter = newLimiter(60)  // 60 req/min
	authLimiter    = newLimiter(10)  // 10 req/min
)

// RateLimit is a general-purpose 60 req/min per-IP middleware.
func RateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !generalLimiter.allow(ip) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "Too many requests. Please slow down.",
			})
			return
		}
		c.Next()
	}
}

// RateLimitAuth is a strict 10 req/min per-IP middleware for auth endpoints.
func RateLimitAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !authLimiter.allow(ip) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "Too many authentication attempts. Please wait before trying again.",
			})
			return
		}
		c.Next()
	}
}
