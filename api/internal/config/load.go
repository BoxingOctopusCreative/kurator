package config

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"strings"

	"github.com/pelletier/go-toml"
	"github.com/spf13/afero"
)

// Load merges configuration from environment variables (highest precedence), then CLI (LoadOptions),
// then an optional TOML file, then built-in defaults. The fs argument is the filesystem used for
// reading the TOML file and for probing the default ./kurator.toml path; production code passes
// afero.NewOsFs(), tests can pass afero.NewMemMapFs() (see config_test.go). A nil fs is treated as
// the OS filesystem so existing callers keep working without code changes.
//
// Pass nil opts for CLI-only defaults (e.g. tools that do not register flags).
func Load(filesystem afero.Fs, opts *LoadOptions) (Config, error) {
	if filesystem == nil {
		filesystem = afero.NewOsFs()
	}
	if opts == nil {
		opts = &LoadOptions{SessionMaxAge: -1}
	}

	path, err := resolveConfigPath(filesystem, opts.ConfigFile)
	if err != nil {
		return Config{}, err
	}

	var fc fileConfig
	if path != "" {
		b, err := afero.ReadFile(filesystem, path)
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

	cors := mergeStringSlice("CORS_ORIGINS", opts.CORSOrigins, fc.CORS.Origins, defaultCORS)

	cfg := Config{
		HTTPAddr: mergeString("HTTP_ADDR", opts.HTTPAddr, fc.Server.HTTPAddr, ":8080"),
		DatabaseURL: mergeString(
			"DATABASE_URL",
			opts.DatabaseURL,
			fc.Database.URL,
			"postgres://kurator:kurator@localhost:5432/kurator?sslmode=disable",
		),
		MeilisearchHost: mergeString(
			"MEILISEARCH_HOST",
			opts.MeilisearchHost,
			fc.Meilisearch.Host,
			"http://localhost:7700",
		),
		MeilisearchKey: mergeString("MEILISEARCH_API_KEY", opts.MeilisearchKey, fc.Meilisearch.APIKey, ""),
		MeilisearchIndex: mergeString(
			"MEILISEARCH_INDEX",
			opts.MeilisearchIndex,
			fc.Meilisearch.Index,
			"kurator_items",
		),
		CORSOrigins: cors,
		AuthJWTSecret: mergeString(
			"AUTH_JWT_SECRET",
			opts.AuthJWTSecret,
			fc.Auth.JWTSecret,
			"dev_only_change_me_in_production_use_long_random",
		),
		SessionMaxAge: mergeSessionMaxAge(
			"SESSION_MAX_AGE_SECONDS",
			cliSession,
			fc.Auth.SessionMaxAgeSeconds,
			sessionDef,
		),
		CookieSecure:    mergeBool("COOKIE_SECURE", opts.CookieSecure, fc.Auth.CookieSecure, false),
		S3Bucket:        mergeString("S3_BUCKET", opts.S3Bucket, fc.S3.Bucket, ""),
		S3Region:        mergeString("S3_REGION", opts.S3Region, fc.S3.Region, "us-east-1"),
		S3Endpoint:      mergeString("S3_ENDPOINT", opts.S3Endpoint, fc.S3.Endpoint, ""),
		S3AccessKey:     mergeString("S3_ACCESS_KEY_ID", opts.S3AccessKey, fc.S3.AccessKeyID, ""),
		S3SecretKey:     mergeString("S3_SECRET_ACCESS_KEY", opts.S3SecretKey, fc.S3.SecretAccessKey, ""),
		S3PublicBaseURL: mergeString("S3_PUBLIC_BASE_URL", opts.S3PublicBaseURL, fc.S3.PublicBaseURL, ""),
		S3KeyPrefix:     mergeString("S3_KEY_PREFIX", opts.S3KeyPrefix, fc.S3.KeyPrefix, "covers"),
		MetadataUserAgent: mergeString(
			"METADATA_USER_AGENT",
			opts.MetadataUserAgent,
			fc.Metadata.UserAgent,
			"",
		),
		DiscogsPersonalToken: mergeString(
			"DISCOGS_PERSONAL_TOKEN",
			opts.DiscogsPersonalToken,
			fc.Metadata.DiscogsPersonalToken,
			"",
		),
		TheGamesDBAPIKey: mergeString(
			"THEGAMESDB_API_KEY",
			opts.TheGamesDBAPIKey,
			fc.Metadata.TheGamesDBAPIKey,
			"",
		),
		GoogleBooksAPIKey: mergeString(
			"GOOGLE_BOOKS_API_KEY",
			opts.GoogleBooksAPIKey,
			fc.Metadata.GoogleBooksAPIKey,
			"",
		),
		TMDBAPIKey: mergeString("TMDB_API_KEY", opts.TMDBAPIKey, fc.Metadata.TMDBAPIKey, ""),
		ComicVineAPIKey: mergeString(
			"COMICVINE_API_KEY",
			opts.ComicVineAPIKey,
			fc.Metadata.ComicVineAPIKey,
			"",
		),
		BetaAccessRequired: mergeBool("BETA_ACCESS_REQUIRED", "", fc.Beta.AccessRequired, false),
		TurnstileEnabled: mergeBool(
			"CLOUDFLARE_TURNSTILE_ENABLED",
			opts.TurnstileEnabled,
			fc.Turnstile.Enabled,
			false,
		),
		TurnstileSecretKey: mergeString(
			"CLOUDFLARE_TURNSTILE_SECRETKEY",
			opts.TurnstileSecretKey,
			fc.Turnstile.SecretKey,
			"",
		),
		MailgunAPIKey: mergeString(
			"MAILGUN_API_KEY",
			opts.MailgunAPIKey,
			fc.Mailgun.APIKey,
			"",
		),
		MailgunDomain: mergeString(
			"MAILGUN_DOMAIN",
			opts.MailgunDomain,
			fc.Mailgun.Domain,
			"",
		),
		MailgunFrom: mergeString(
			"MAILGUN_FROM",
			opts.MailgunFrom,
			fc.Mailgun.From,
			"",
		),
		MailgunAPIBase: mergeString(
			"MAILGUN_API_BASE",
			opts.MailgunAPIBase,
			fc.Mailgun.APIBase,
			"",
		),
		SentryDSN: mergeString(
			"SENTRY_DSN",
			"",
			fc.Sentry.DSN,
			"",
		),
		SentryEnvironment: mergeString(
			"SENTRY_ENVIRONMENT",
			"",
			fc.Sentry.Environment,
			"",
		),
	}

	return cfg, nil
}

// resolveConfigPath picks the TOML config file path, in order: explicit CLI override, KURATOR_CONFIG
// env var, then ./kurator.toml when present on filesystem. Returns ("", nil) when no config file is
// configured and the default file does not exist.
func resolveConfigPath(filesystem afero.Fs, cliPath string) (string, error) {
	if p := strings.TrimSpace(cliPath); p != "" {
		return p, nil
	}
	if p := strings.TrimSpace(os.Getenv("KURATOR_CONFIG")); p != "" {
		return p, nil
	}
	if _, err := filesystem.Stat("kurator.toml"); err == nil {
		return "kurator.toml", nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return "", fmt.Errorf("kurator.toml: %w", err)
	}
	return "", nil
}
