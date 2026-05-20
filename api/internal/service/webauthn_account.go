package service

import (
	"encoding/binary"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/go-webauthn/webauthn/webauthn"
)

// webAuthnUserID is a stable 8-byte user handle for WebAuthn ceremonies.
func webAuthnUserID(userID int64) []byte {
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, uint64(userID))
	return b
}

func webAuthnDisplayName(u *models.User) string {
	if u == nil {
		return ""
	}
	if n := strings.TrimSpace(u.DisplayName); n != "" {
		return n
	}
	parts := []string{}
	if fn := strings.TrimSpace(u.FirstName); fn != "" {
		parts = append(parts, fn)
	}
	if ln := strings.TrimSpace(u.LastName); ln != "" {
		parts = append(parts, ln)
	}
	if len(parts) > 0 {
		return strings.Join(parts, " ")
	}
	if un := strings.TrimSpace(u.Username); un != "" {
		return un
	}
	return u.Email
}

type webAuthnAccount struct {
	user        *models.User
	credentials []webauthn.Credential
}

func (a *webAuthnAccount) WebAuthnID() []byte {
	return webAuthnUserID(a.user.ID)
}

func (a *webAuthnAccount) WebAuthnName() string {
	return a.user.Email
}

func (a *webAuthnAccount) WebAuthnDisplayName() string {
	return webAuthnDisplayName(a.user)
}

func (a *webAuthnAccount) WebAuthnCredentials() []webauthn.Credential {
	return a.credentials
}

func recordsToWebAuthnCredentials(recs []repository.WebAuthnCredentialRecord) []webauthn.Credential {
	out := make([]webauthn.Credential, len(recs))
	for i, rec := range recs {
		out[i] = rec.Credential
	}
	return out
}

func newWebAuthnAccount(u *models.User, recs []repository.WebAuthnCredentialRecord) *webAuthnAccount {
	return &webAuthnAccount{
		user:        u,
		credentials: recordsToWebAuthnCredentials(recs),
	}
}

func parseWebAuthnUserIDFromHandle(handle []byte) (int64, error) {
	if len(handle) != 8 {
		return 0, fmt.Errorf("invalid user handle length")
	}
	uid := int64(binary.BigEndian.Uint64(handle))
	if uid < 1 {
		return 0, fmt.Errorf("invalid user id")
	}
	return uid, nil
}
