package config

import "flag"

// LoadOptions holds CLI overrides. Empty strings mean "not set on CLI" (fall back to file, then defaults).
// SessionMaxAge: -1 means not set via CLI; 0 from flag.Parse with default -1.
type LoadOptions struct {
	ConfigFile string

	HTTPAddr             string
	DatabaseURL          string
	MeilisearchHost      string
	MeilisearchKey       string
	MeilisearchIndex     string
	CORSOrigins          string
	AuthJWTSecret        string
	SessionMaxAge        int
	CookieSecure         string
	S3Bucket             string
	S3Region             string
	S3Endpoint           string
	S3AccessKey          string
	S3SecretKey          string
	S3PublicBaseURL      string
	S3KeyPrefix          string
	MetadataUserAgent    string
	DiscogsPersonalToken string
	TheGamesDBAPIKey     string
	GoogleBooksAPIKey    string
	TMDBAPIKey           string
	ComicVineAPIKey      string
	TurnstileEnabled     string
	TurnstileSecretKey   string
	MailgunAPIKey        string
	MailgunDomain        string
	MailgunFrom          string
	MailgunAPIBase       string
}

// RegisterFlags binds Kurator settings to the given FlagSet (use flag.CommandLine or a custom set).
func RegisterFlags(fs *flag.FlagSet, o *LoadOptions) {
	fs.StringVar(&o.ConfigFile, "config", "", "path to TOML config file (overrides KURATOR_CONFIG env; default file: ./kurator.toml if it exists)")
	fs.StringVar(&o.HTTPAddr, "http-addr", "", "HTTP listen address (env: HTTP_ADDR)")
	fs.StringVar(&o.DatabaseURL, "database-url", "", "Postgres URL (env: DATABASE_URL)")
	fs.StringVar(&o.MeilisearchHost, "meilisearch-host", "", "env: MEILISEARCH_HOST")
	fs.StringVar(&o.MeilisearchKey, "meilisearch-api-key", "", "env: MEILISEARCH_API_KEY")
	fs.StringVar(&o.MeilisearchIndex, "meilisearch-index", "", "env: MEILISEARCH_INDEX")
	fs.StringVar(&o.CORSOrigins, "cors-origins", "", "comma-separated (env: CORS_ORIGINS)")
	fs.StringVar(&o.AuthJWTSecret, "auth-jwt-secret", "", "env: AUTH_JWT_SECRET")
	fs.IntVar(&o.SessionMaxAge, "session-max-age", -1, "seconds (env: SESSION_MAX_AGE_SECONDS); omit or -1 to use file/default")
	fs.StringVar(&o.CookieSecure, "cookie-secure", "", "true|false (env: COOKIE_SECURE)")
	fs.StringVar(&o.S3Bucket, "s3-bucket", "", "env: S3_BUCKET")
	fs.StringVar(&o.S3Region, "s3-region", "", "env: S3_REGION")
	fs.StringVar(&o.S3Endpoint, "s3-endpoint", "", "env: S3_ENDPOINT")
	fs.StringVar(&o.S3AccessKey, "s3-access-key-id", "", "env: S3_ACCESS_KEY_ID")
	fs.StringVar(&o.S3SecretKey, "s3-secret-access-key", "", "env: S3_SECRET_ACCESS_KEY")
	fs.StringVar(&o.S3PublicBaseURL, "s3-public-base-url", "", "env: S3_PUBLIC_BASE_URL")
	fs.StringVar(&o.S3KeyPrefix, "s3-key-prefix", "", "env: S3_KEY_PREFIX")
	fs.StringVar(&o.MetadataUserAgent, "metadata-user-agent", "", "env: METADATA_USER_AGENT")
	fs.StringVar(&o.DiscogsPersonalToken, "discogs-token", "", "env: DISCOGS_PERSONAL_TOKEN")
	fs.StringVar(&o.TheGamesDBAPIKey, "thegamesdb-api-key", "", "env: THEGAMESDB_API_KEY")
	fs.StringVar(&o.GoogleBooksAPIKey, "google-books-api-key", "", "env: GOOGLE_BOOKS_API_KEY")
	fs.StringVar(&o.TMDBAPIKey, "tmdb-api-key", "", "env: TMDB_API_KEY")
	fs.StringVar(&o.ComicVineAPIKey, "comicvine-api-key", "", "env: COMICVINE_API_KEY")
	fs.StringVar(&o.TurnstileEnabled, "turnstile-enabled", "", "true|false (env: CLOUDFLARE_TURNSTILE_ENABLED); empty uses file/default")
	fs.StringVar(&o.TurnstileSecretKey, "turnstile-secret-key", "", "env: CLOUDFLARE_TURNSTILE_SECRETKEY")
	fs.StringVar(&o.MailgunAPIKey, "mailgun-api-key", "", "env: MAILGUN_API_KEY")
	fs.StringVar(&o.MailgunDomain, "mailgun-domain", "", "env: MAILGUN_DOMAIN")
	fs.StringVar(&o.MailgunFrom, "mailgun-from", "", "env: MAILGUN_FROM")
	fs.StringVar(&o.MailgunAPIBase, "mailgun-api-base", "", "env: MAILGUN_API_BASE")
}
