package notifyqueue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/mailgun"
	"github.com/redis/go-redis/v9"
)

// Deps holds credentials for outbound notifications (Discord + Mailgun).
type Deps struct {
	DiscordWebhookURL string
	BetaAdminEmail    string
	Mail              *mailgun.Client
}

const (
	jobBetaAccessRequest  = "beta_access_request"
	jobBetaAccessApproved = "beta_access_approved"
	jobUserRegistered     = "user_registered"
)

// Job is a single JSON payload stored in Redis (or processed inline when Redis is disabled).
type Job struct {
	Type     string `json:"type"`
	Attempts int    `json:"n"`
	// beta_access_request
	RequesterEmail string `json:"requester_email,omitempty"`
	ApproveURL     string `json:"approve_url,omitempty"`
	// beta_access_approved
	OpenURL string `json:"open_url,omitempty"`
	// user_registered
	UserID int64  `json:"user_id,omitempty"`
	Email  string `json:"email,omitempty"`
}

// Client enqueues notification jobs. When Redis is not configured, jobs run synchronously on Enqueue.
type Client struct {
	rdb     *redis.Client
	key     string
	deadKey string
	deps    Deps
}

// New builds a notification client. redisURL may be empty (sync delivery only). queueKey defaults to kurator:notify:jobs.
func New(redisURL, queueKey string, deps Deps) (*Client, error) {
	if strings.TrimSpace(queueKey) == "" {
		queueKey = "kurator:notify:jobs"
	}
	c := &Client{
		key:     strings.TrimSpace(queueKey),
		deadKey: strings.TrimSpace(queueKey) + ":dead",
		deps:    deps,
	}
	ru := strings.TrimSpace(redisURL)
	if ru == "" {
		return c, nil
	}
	opt, err := redis.ParseURL(ru)
	if err != nil {
		return nil, fmt.Errorf("redis url: %w", err)
	}
	c.rdb = redis.NewClient(opt)
	pingCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := c.rdb.Ping(pingCtx).Err(); err != nil {
		_ = c.rdb.Close()
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return c, nil
}

// Close releases the Redis connection when configured.
func (c *Client) Close() error {
	if c == nil || c.rdb == nil {
		return nil
	}
	return c.rdb.Close()
}

// RedisEnabled is true when jobs are persisted to Redis for background delivery.
func (c *Client) RedisEnabled() bool {
	return c != nil && c.rdb != nil
}

// Start launches a background worker when Redis is configured. ctx cancellation stops the worker.
func (c *Client) Start(ctx context.Context) {
	if c == nil || c.rdb == nil {
		return
	}
	go c.workerLoop(ctx)
}

func (c *Client) workerLoop(ctx context.Context) {
	log.Printf("notifyqueue: worker started (queue=%s)", c.key)
	for {
		res, err := c.rdb.BRPop(ctx, 5*time.Second, c.key).Result()
		if err != nil {
			if errors.Is(err, redis.Nil) {
				continue
			}
			if ctx.Err() != nil {
				log.Printf("notifyqueue: worker stopped")
				return
			}
			log.Printf("notifyqueue: brpop error: %v", err)
			time.Sleep(time.Second)
			continue
		}
		if len(res) < 2 {
			continue
		}
		raw := res[1]
		var job Job
		if err := json.Unmarshal([]byte(raw), &job); err != nil {
			log.Printf("notifyqueue: bad job json: %v", err)
			continue
		}
		workCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		derr := c.deliverJob(workCtx, &job)
		cancel()
		if derr == nil {
			continue
		}
		job.Attempts++
		log.Printf("notifyqueue: job %q attempt %d failed: %v", job.Type, job.Attempts, derr)
		if job.Attempts > 24 {
			if b, err := json.Marshal(job); err == nil {
				_ = c.rdb.RPush(context.Background(), c.deadKey, string(b)).Err()
			}
			log.Printf("notifyqueue: job moved to dead letter queue after max attempts (type=%s)", job.Type)
			continue
		}
		backoff := time.Duration(job.Attempts) * 2 * time.Second
		if backoff > 60*time.Second {
			backoff = 60 * time.Second
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		b, err := json.Marshal(job)
		if err != nil {
			log.Printf("notifyqueue: re-marshal job: %v", err)
			continue
		}
		if err := c.rdb.LPush(context.Background(), c.key, string(b)).Err(); err != nil {
			log.Printf("notifyqueue: requeue failed: %v", err)
		}
	}
}

func (c *Client) deliverJob(ctx context.Context, job *Job) error {
	switch job.Type {
	case jobBetaAccessRequest:
		return DeliverBetaAccessRequest(ctx, c.deps, job.RequesterEmail, job.ApproveURL)
	case jobBetaAccessApproved:
		return DeliverBetaAccessApproved(ctx, c.deps, job.RequesterEmail, job.OpenURL)
	case jobUserRegistered:
		return DeliverUserRegistered(ctx, c.deps, job.UserID, job.Email)
	default:
		return fmt.Errorf("unknown job type %q", job.Type)
	}
}

func (c *Client) push(ctx context.Context, job Job) error {
	if c.rdb == nil {
		bg, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := c.deliverJob(bg, &job); err != nil {
			log.Printf("notifyqueue: sync deliver failed (type=%s): %v", job.Type, err)
		}
		return nil
	}
	b, err := json.Marshal(job)
	if err != nil {
		return err
	}
	return c.rdb.LPush(ctx, c.key, string(b)).Err()
}

// EnqueueBetaAccessRequest notifies admins about a pending beta invite (Discord or email).
func (c *Client) EnqueueBetaAccessRequest(ctx context.Context, requesterEmail, approveURL string) error {
	if c == nil {
		return nil
	}
	job := Job{Type: jobBetaAccessRequest, RequesterEmail: requesterEmail, ApproveURL: approveURL}
	return c.push(ctx, job)
}

// EnqueueBetaAccessApproved emails the requester after an admin approves access.
func (c *Client) EnqueueBetaAccessApproved(ctx context.Context, requesterEmail, openURL string) error {
	if c == nil {
		return nil
	}
	job := Job{Type: jobBetaAccessApproved, RequesterEmail: requesterEmail, OpenURL: openURL}
	return c.push(ctx, job)
}

// EnqueueUserRegistered fires after a successful account registration (durable hook for future integrations).
func (c *Client) EnqueueUserRegistered(ctx context.Context, userID int64, email string) error {
	if c == nil {
		return nil
	}
	job := Job{Type: jobUserRegistered, UserID: userID, Email: email}
	return c.push(ctx, job)
}
