package service

import (
	"testing"

	"github.com/boxingoctopus/kurator/api/internal/models"
)

func TestParseBoardVisibility(t *testing.T) {
	t.Parallel()
	v, err := parseBoardVisibility("public")
	if err != nil || v != models.BoardVisibilityPublic {
		t.Fatalf("public: got %q err %v", v, err)
	}
	v, err = parseBoardVisibility("private")
	if err != nil || v != models.BoardVisibilityPrivate {
		t.Fatalf("private: got %q err %v", v, err)
	}
	if _, err := parseBoardVisibility("followers"); err == nil {
		t.Fatal("expected error for shelf visibility on boards")
	}
}
