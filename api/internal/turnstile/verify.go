package turnstile

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const siteVerifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

type siteverifyResponse struct {
	Success    bool     `json:"success"`
	ErrorCodes []string `json:"error-codes"`
}

// Verify checks a Turnstile token with Cloudflare. secret and token must be non-empty.
func Verify(ctx context.Context, client *http.Client, secret, token, remoteIP string) error {
	secret = strings.TrimSpace(secret)
	token = strings.TrimSpace(token)
	if secret == "" {
		return fmt.Errorf("turnstile: secret not configured")
	}
	if token == "" {
		return fmt.Errorf("turnstile: missing token")
	}
	if len(token) > 4096 {
		return fmt.Errorf("turnstile: token too long")
	}
	if client == nil {
		client = http.DefaultClient
	}
	form := url.Values{}
	form.Set("secret", secret)
	form.Set("response", token)
	if rip := strings.TrimSpace(remoteIP); rip != "" {
		form.Set("remoteip", rip)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, siteVerifyURL, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	var out siteverifyResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return fmt.Errorf("turnstile: invalid siteverify response")
	}
	if out.Success {
		return nil
	}
	if len(out.ErrorCodes) > 0 {
		return fmt.Errorf("turnstile: %s", strings.Join(out.ErrorCodes, ", "))
	}
	return fmt.Errorf("turnstile: verification failed")
}
