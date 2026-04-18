package models

import "testing"

func TestRedactPublicNames(t *testing.T) {
	var pub PublicUser
	RedactPublicNames(&pub, "Ada", "Lovelace", true, false, false)
	if pub.FirstName != "Ada" || pub.LastName != "" {
		t.Fatalf("got first=%q last=%q", pub.FirstName, pub.LastName)
	}
	RedactPublicNames(&pub, "Ada", "Lovelace", false, false, true)
	if pub.FirstName != "Ada" || pub.LastName != "Lovelace" {
		t.Fatalf("owner view: got first=%q last=%q", pub.FirstName, pub.LastName)
	}
}

func TestPublicLegalLine(t *testing.T) {
	if s := PublicLegalLine("Ada", "Lovelace"); s != "Ada Lovelace" {
		t.Fatalf("got %q", s)
	}
	if s := PublicLegalLine("  Ada  ", ""); s != "Ada" {
		t.Fatalf("got %q", s)
	}
	if s := PublicLegalLine("", "  "); s != "" {
		t.Fatalf("got %q", s)
	}
}
