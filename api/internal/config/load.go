package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/pelletier/go-toml"
)

// Load merges configuration from environment variables (highest precedence), then CLI (LoadOptions),
// then an optional TOML file, then built-in defaults.
// Pass nil opts for CLI-only defaults (e.g. tools that do not register flags).
func Load(opts *LoadOptions) (Config, error) {
	if opts == nil {
		opts = &LoadOptions{SessionMaxAge: -1}
	}

	path, err := resolveConfigPath(opts.ConfigFile)
	if err != nil {
		return Config{}, err
	}

	var fc fileConfig
	if path != "" {
		b, err := os.ReadFile(path)
		if err != nil {
			return Config{}, fmt.Errorf("config file %q: %w", path, err)
		}
		if err := toml.Unmarshal(b, &fc); err != nil {
			return Config{}, fmt.Errorf("parse config file %q: %w", path, err)
		}
	}

	defaultCORS := []string{"http://localhost:3000"}
	sessionDef := 30 * 24 * 3600

	cliSession := opts.SessionMaxAge
	if cliSession < 0 {
		cliSession = 0
	}

	cors := mergeStringSlice("CORS_ORIGINS", opts.CORSOrigins, fc.CORSOrigins, defaultCORS)

	cfg := Config{
		HTTPAddr: mergeString("HTTP_ADDR", opts.HTTPAddr, fc.HTTPAddr, ":8080"),
		DatabaseURL: mergeString(
			"DATABASE_URL",
			opts.DatabaseURL,
			fc.DatabaseURL,
			"postgres://kurator:kurator@localhost:5432/kurator?sslmode=disable",
		),
		MeilisearchHost: mergeString(
			"MEILISEARCH_HOST",
			opts.MeilisearchHost,
			fc.MeilisearchHost,
			"http://localhost:7700",
		),
		MeilisearchKey: mergeString("MEILISEARCH_API_KEY", opts.MeilisearchKey, fc.MeilisearchKey, ""),
		MeilisearchIndex: mergeString(
			"MEILISEARCH_INDEX",
			opts.MeilisearchIndex,
			fc.MeilisearchIndex,
			"kurator_items",
		),
		CORSOrigins: cors,
		AuthJWTSecret: mergeString(
			"AUTH_JWT_SECRET",
			opts.AuthJWTSecret,
			fc.AuthJWTSecret,
			"dev_only_change_me_in_production_use_long_random",
		),
		SessionMaxAge: mergeSessionMaxAge("SESSION_MAX_AGE_SECONDS", cliSession, fc.SessionMaxAge, sessionDef),
		CookieSecure: mergeBool("COOKIE_SECURE", opts.CookieSecure, fc.CookieSecure, false),
		S3Bucket:         mergeString("S3_BUCKET", opts.S3Bucket, fc.S3Bucket, ""),
		S3Region:         mergeString("S3_REGION", opts.S3Region, fc.S3Region, "us-east-1"),
		S3Endpoint:       mergeString("S3_ENDPOINT", opts.S3Endpoint, fc.S3Endpoint, ""),
		S3AccessKey:      mergeString("S3_ACCESS_KEY_ID", opts.S3AccessKey, fc.S3AccessKey, ""),
		S3SecretKey:      mergeString("S3_SECRET_ACCESS_KEY", opts.S3SecretKey, fc.S3SecretKey, ""),
		S3PublicBaseURL:  mergeString("S3_PUBLIC_BASE_URL", opts.S3PublicBaseURL, fc.S3PublicBaseURL, ""),
		S3KeyPrefix:      mergeString("S3_KEY_PREFIX", opts.S3KeyPrefix, fc.S3KeyPrefix, "covers"),
		MetadataUserAgent: mergeString(
			"METADATA_USER_AGENT",
			opts.MetadataUserAgent,
			fc.MetadataUserAgent,
			"",
		),
		DiscogsPersonalToken: mergeString(
			"DISCOGS_PERSONAL_TOKEN",
			opts.DiscogsPersonalToken,
			fc.DiscogsPersonalToken,
			"",
		),
		TheGamesDBAPIKey: mergeString(
			"THEGAMESDB_API_KEY",
			opts.TheGamesDBAPIKey,
			fc.TheGamesDBAPIKey,
			"",
		),
		GoogleBooksAPIKey: mergeString(
			"GOOGLE_BOOKS_API_KEY",
			opts.GoogleBooksAPIKey,
			fc.GoogleBooksAPIKey,
			"",
		),
		TMDBAPIKey: mergeString("TMDB_API_KEY", opts.TMDBAPIKey, fc.TMDBAPIKey, ""),
		ComicVineAPIKey: mergeString(
			"COMICVINE_API_KEY",
			opts.ComicVineAPIKey,
			fc.ComicVineAPIKey,
			"",
		),
		SetupEnabled: mergeBool("SETUP_ENABLED", opts.SetupEnabled, fc.SetupEnabled, false),
	}

	return cfg, nil
}

func resolveConfigPath(cliPath string) (string, error) {
	if p := strings.TrimSpace(cliPath); p != "" {
		return p, nil
	}
	if p := strings.TrimSpace(os.Getenv("KURATOR_CONFIG")); p != "" {
		return p, nil
	}
	if _, err := os.Stat("kurator.toml"); err == nil {
		return "kurator.toml", nil
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("kurator.toml: %w", err)
	}
	return "", nil
}
