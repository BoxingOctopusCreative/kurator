package service

import (
	"testing"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
)

func TestResolveWebAuthnRP(t *testing.T) {
	t.Parallel()
	rpID, origins := resolveWebAuthnRP("http://localhost:3000", []string{"https://app.example.com"})
	if rpID != "localhost" {
		t.Fatalf("rpID = %q, want localhost", rpID)
	}
	if len(origins) != 2 {
		t.Fatalf("origins len = %d, want 2", len(origins))
	}
}

func TestWebAuthnSessionJWTRoundTrip(t *testing.T) {
	t.Parallel()
	svc := &WebAuthnService{jwtSecret: []byte("test-secret")}
	session := &webauthn.SessionData{
		Challenge: "challenge",
		RelyingPartyID: "localhost",
		UserID:    webAuthnUserID(42),
		Expires:   time.Now().Add(2 * time.Minute),
	}
	tok, err := svc.signSession(session)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := svc.parseSession(tok)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Challenge != session.Challenge {
		t.Fatalf("challenge = %q", parsed.Challenge)
	}
}

func TestParseWebAuthnUserIDFromHandle(t *testing.T) {
	t.Parallel()
	id := webAuthnUserID(99)
	uid, err := parseWebAuthnUserIDFromHandle(id)
	if err != nil || uid != 99 {
		t.Fatalf("uid=%d err=%v", uid, err)
	}
}
