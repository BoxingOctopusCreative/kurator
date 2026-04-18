package service

import (
	"encoding/json"
	"testing"
)

func TestCVWriterArtistFromCredits_nestedPerson(t *testing.T) {
	raw := `[
		{"role":"writer","person":{"name":"Alan Moore"}},
		{"role":"penciler","person":{"name":"Dave Gibbons"}}
	]`
	var credits []cvPersonCredit
	if err := json.Unmarshal([]byte(raw), &credits); err != nil {
		t.Fatal(err)
	}
	w, a := cvWriterArtistFromCredits(credits)
	if w != "Alan Moore" {
		t.Errorf("writer: got %q", w)
	}
	if a != "Dave Gibbons" {
		t.Errorf("artist: got %q", a)
	}
}

func TestCVWriterArtistFromCredits_topLevelName(t *testing.T) {
	raw := `[
		{"role":"Writer","name":"Grant Morrison","person":null}
	]`
	var credits []cvPersonCredit
	if err := json.Unmarshal([]byte(raw), &credits); err != nil {
		t.Fatal(err)
	}
	w, a := cvWriterArtistFromCredits(credits)
	if w != "Grant Morrison" || a != "" {
		t.Errorf("got writer=%q artist=%q", w, a)
	}
}
