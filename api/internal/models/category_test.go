package models

import "testing"

func TestCategory_Valid(t *testing.T) {
	tests := []struct {
		c    Category
		want bool
	}{
		{CategoryGame, true},
		{CategoryMusic, true},
		{CategoryBook, true},
		{CategoryVideo, true},
		{CategoryComicBook, true},
		{CategoryManga, true},
		{"", false},
		{"unknown", false},
		{"GAME", false},
	}
	for _, tt := range tests {
		if got := tt.c.Valid(); got != tt.want {
			t.Errorf("Valid(%q) = %v, want %v", tt.c, got, tt.want)
		}
	}
}
