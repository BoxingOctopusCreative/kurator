package service

import (
	"testing"
)

func TestStarterCollectionName(t *testing.T) {
	if starterCollectionName != "My Collection" {
		t.Fatalf("unexpected starter name: %q", starterCollectionName)
	}
}
