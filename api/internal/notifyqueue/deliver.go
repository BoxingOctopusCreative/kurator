package notifyqueue

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var discordHTTPClient = &http.Client{Timeout: 25 * time.Second}

// ValidateDiscordWebhookURL ensures the URL is a Discord incoming webhook endpoint.
func ValidateDiscordWebhookURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return fmt.Errorf("must be an https URL")
	}
	host := strings.ToLower(u.Hostname())
	switch host {
	case "discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com":
	default:
		return fmt.Errorf("host %q is not a Discord webhook host", host)
	}
	if !strings.HasPrefix(u.Path, "/api/webhooks/") {
		return fmt.Errorf("path must start with /api/webhooks/")
	}
	return nil
}

// SendDiscordWebhook posts markdown/plain content to a Discord incoming webhook.
func SendDiscordWebhook(ctx context.Context, webhookURL, content string) error {
	if strings.TrimSpace(webhookURL) == "" {
		return fmt.Errorf("discord webhook URL is empty")
	}
	if err := ValidateDiscordWebhookURL(webhookURL); err != nil {
		return err
	}
	body, err := json.Marshal(map[string]string{"content": content})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Kurator-API/notifyqueue")
	resp, err := discordHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("discord webhook status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(snippet)))
	}
	return nil
}

// DeliverBetaAccessRequest sends Discord (preferred) or admin email for a new beta request.
func DeliverBetaAccessRequest(ctx context.Context, deps Deps, requesterEmail, approveURL string) error {
	if strings.TrimSpace(deps.DiscordWebhookURL) != "" {
		msg := fmt.Sprintf("**New Kurator beta access request**\nRequester: `%s`\nApprove: %s", requesterEmail, approveURL)
		return SendDiscordWebhook(ctx, deps.DiscordWebhookURL, msg)
	}
	if deps.Mail != nil && strings.TrimSpace(deps.BetaAdminEmail) != "" {
		subject := "Kurator private beta access request"
		body := fmt.Sprintf("Someone requested access to the Kurator private beta.\n\nRequester email: %s\n\nTo approve:\n%s\n\nIgnore if unrecognised.\n", requesterEmail, approveURL)
		return deps.Mail.Send(ctx, deps.BetaAdminEmail, subject, body)
	}
	return nil
}

// DeliverBetaAccessApproved emails the requester their open-invite link.
func DeliverBetaAccessApproved(ctx context.Context, deps Deps, requesterEmail, openURL string) error {
	if deps.Mail == nil {
		return nil
	}
	subject := "You're approved for the Kurator private beta"
	body := fmt.Sprintf(`Your request for Kurator private beta access was approved.

Open this link in your browser to continue creating your account (it unlocks registration on this device):

%s

This link expires in 14 days. If you did not request access, you can ignore this email.
`, openURL)
	return deps.Mail.Send(ctx, requesterEmail, subject, body)
}

// DeliverUserRegistered is a hook for post-registration work (analytics, welcome email, etc.).
func DeliverUserRegistered(_ context.Context, _ Deps, userID int64, email string) error {
	if userID <= 0 || strings.TrimSpace(email) == "" {
		return nil
	}
	// Intentionally no default side effects; extend here or consume jobs elsewhere.
	_ = email
	return nil
}
