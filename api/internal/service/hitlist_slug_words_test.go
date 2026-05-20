package service

import (
	"testing"
)

func TestHitlistMemorableSlugCandidate_format(t *testing.T) {
	got := hitlistMemorableSlugCandidate("my-list", "spark", "hepburn")
	want := "my-list-spark-hepburn"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestRandomHitlistSlugWord_variety(t *testing.T) {
	seen := make(map[string]struct{})
	for i := 0; i < 40; i++ {
		w, err := randomHitlistSlugWord()
		if err != nil {
			t.Fatal(err)
		}
		if w == "" {
			t.Fatal("empty word")
		}
		seen[w] = struct{}{}
	}
	if len(seen) < 3 {
		t.Fatalf("expected varied words, got %d unique", len(seen))
	}
}

func TestRandomHitlistCelebritySurname_nonempty(t *testing.T) {
	s, err := randomHitlistCelebritySurname()
	if err != nil {
		t.Fatal(err)
	}
	if s == "" {
		t.Fatal("empty surname")
	}
}
