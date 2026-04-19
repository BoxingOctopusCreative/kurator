package mailgun

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client sends transactional email via Mailgun's HTTP API.
type Client struct {
	apiKey  string
	domain  string
	from    string
	apiBase string
	http    *http.Client
}

// New returns a sender, or nil if apiKey or domain is empty (password recovery is disabled).
func New(apiKey, domain, from, apiBase string) *Client {
	apiKey = strings.TrimSpace(apiKey)
	domain = strings.TrimSpace(domain)
	if apiKey == "" || domain == "" {
		return nil
	}
	base := strings.TrimRight(strings.TrimSpace(apiBase), "/")
	if base == "" {
		base = "https://api.mailgun.net"
	}
	fromAddr := strings.TrimSpace(from)
	if fromAddr == "" {
		fromAddr = fmt.Sprintf("Kurator <postmaster@%s>", domain)
	}
	return &Client{
		apiKey:  apiKey,
		domain:  domain,
		from:    fromAddr,
		apiBase: base,
		http:    &http.Client{Timeout: 25 * time.Second},
	}
}

// Send posts a plain-text message to one recipient.
func (c *Client) Send(ctx context.Context, toEmail, subject, textBody string) error {
	if c == nil {
		return fmt.Errorf("mailgun: not configured")
	}
	endpoint := fmt.Sprintf("%s/v3/%s/messages", c.apiBase, url.PathEscape(c.domain))
	form := url.Values{}
	form.Set("from", c.from)
	form.Set("to", toEmail)
	form.Set("subject", subject)
	form.Set("text", textBody)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth("api", c.apiKey)

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("mailgun: %s: %s", res.Status, strings.TrimSpace(string(body)))
	}
	return nil
}
