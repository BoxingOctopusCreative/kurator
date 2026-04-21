package httpx

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// PathUUID parses a UUID from a URL path segment and returns canonical lowercase string form.
func PathUUID(raw string) (string, error) {
	u, err := uuid.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", fmt.Errorf("invalid id")
	}
	return u.String(), nil
}
