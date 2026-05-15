package service

import "testing"

func TestHashOpaqueTokenDeterministic(t *testing.T) {
	a := hashOpaqueToken("abc")
	b := hashOpaqueToken("abc")
	if a != b || len(a) != 64 {
		t.Fatalf("hashOpaqueToken: got %q", a)
	}
	if hashOpaqueToken("xyz") == a {
		t.Fatal("expected different hashes for different tokens")
	}
}

func TestNewOpaqueTokenUnique(t *testing.T) {
	r1, h1, err := newOpaqueToken()
	if err != nil {
		t.Fatal(err)
	}
	r2, h2, err := newOpaqueToken()
	if err != nil {
		t.Fatal(err)
	}
	if r1 == r2 || h1 == h2 {
		t.Fatal("expected unique tokens")
	}
	if hashOpaqueToken(r1) != h1 {
		t.Fatal("hash mismatch")
	}
}
