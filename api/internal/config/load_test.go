package config

import (
	"testing"

	"github.com/spf13/afero"
)

const sampleTOML = `
[server]
http_addr = ":9090"

[database]
url = "postgres://test:test@localhost:5432/kurator?sslmode=disable"

[meilisearch]
host = "http://meili.test:7700"
`

// clearKuratorEnv prevents the test environment from accidentally feeding values into Load via
// env vars (which take precedence over the TOML file we're trying to verify).
func clearKuratorEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"KURATOR_CONFIG", "HTTP_ADDR", "DATABASE_URL", "MEILISEARCH_HOST",
		"MEILISEARCH_API_KEY", "MEILISEARCH_INDEX", "CORS_ORIGINS", "AUTH_JWT_SECRET",
		"SESSION_MAX_AGE_SECONDS", "COOKIE_SECURE",
	} {
		t.Setenv(key, "")
	}
}

func TestLoadReadsConfigFileFromMemoryFS(t *testing.T) {
	clearKuratorEnv(t)

	mem := afero.NewMemMapFs()
	if err := afero.WriteFile(mem, "/config/kurator.toml", []byte(sampleTOML), 0o644); err != nil {
		t.Fatalf("seed memory fs: %v", err)
	}

	cfg, err := Load(mem, &LoadOptions{ConfigFile: "/config/kurator.toml", SessionMaxAge: -1})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.HTTPAddr != ":9090" {
		t.Errorf("HTTPAddr = %q, want %q", cfg.HTTPAddr, ":9090")
	}
	if cfg.DatabaseURL != "postgres://test:test@localhost:5432/kurator?sslmode=disable" {
		t.Errorf("DatabaseURL = %q, unexpected", cfg.DatabaseURL)
	}
	if cfg.MeilisearchHost != "http://meili.test:7700" {
		t.Errorf("MeilisearchHost = %q, want %q", cfg.MeilisearchHost, "http://meili.test:7700")
	}
}

func TestLoadAutoDiscoversKuratorTOMLOnFS(t *testing.T) {
	clearKuratorEnv(t)

	mem := afero.NewMemMapFs()
	if err := afero.WriteFile(mem, "kurator.toml", []byte(sampleTOML), 0o644); err != nil {
		t.Fatalf("seed memory fs: %v", err)
	}

	cfg, err := Load(mem, &LoadOptions{SessionMaxAge: -1})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.HTTPAddr != ":9090" {
		t.Errorf("auto-discover HTTPAddr = %q, want %q", cfg.HTTPAddr, ":9090")
	}
}

func TestLoadFallsBackToDefaultsWhenNoFileExists(t *testing.T) {
	clearKuratorEnv(t)

	cfg, err := Load(afero.NewMemMapFs(), &LoadOptions{SessionMaxAge: -1})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.HTTPAddr != ":8080" {
		t.Errorf("default HTTPAddr = %q, want %q", cfg.HTTPAddr, ":8080")
	}
	if cfg.MeilisearchIndex != "kurator_items" {
		t.Errorf("default MeilisearchIndex = %q, want %q", cfg.MeilisearchIndex, "kurator_items")
	}
}

func TestLoadCLIOptsBeatFile(t *testing.T) {
	clearKuratorEnv(t)

	mem := afero.NewMemMapFs()
	if err := afero.WriteFile(mem, "kurator.toml", []byte(sampleTOML), 0o644); err != nil {
		t.Fatalf("seed memory fs: %v", err)
	}

	cfg, err := Load(mem, &LoadOptions{HTTPAddr: ":7000", SessionMaxAge: -1})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.HTTPAddr != ":7000" {
		t.Errorf("HTTPAddr = %q, want CLI override %q", cfg.HTTPAddr, ":7000")
	}
	if cfg.DatabaseURL == "" {
		t.Error("DatabaseURL should still be loaded from file when CLI is silent")
	}
}
