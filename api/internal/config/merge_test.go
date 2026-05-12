package config

import (
	"testing"
)

func TestMergeStringFirstEnv_secondKeyWinsWhenFirstEmpty(t *testing.T) {
	t.Setenv("BETA_DISCORD_WEBHOOK", "")
	t.Setenv("KURATOR_BETA_DISCORD_WEBHOOK", " https://example.com/hook ")
	t.Setenv("BETA_DISCORD_WEBHOOK_URL", "")

	got := mergeStringFirstEnv(
		[]string{"BETA_DISCORD_WEBHOOK", "KURATOR_BETA_DISCORD_WEBHOOK", "BETA_DISCORD_WEBHOOK_URL"},
		"",
		"from-file",
		"default",
	)
	if got != "https://example.com/hook" {
		t.Fatalf("got %q", got)
	}
}
