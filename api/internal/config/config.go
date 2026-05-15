package config

// Config holds runtime settings for the API (from env, CLI, TOML, defaults — see Load).
type Config struct {
	HTTPAddr         string
	DatabaseURL      string
	MeilisearchHost  string
	MeilisearchKey   string
	MeilisearchIndex string
	CORSOrigins      []string
	// AuthJWTSecret signs short-lived 2FA pending tokens (HS256). Required for auth in production.
	AuthJWTSecret string
	SessionMaxAge int // seconds, default 30 days
	CookieSecure  bool
	// S3-compatible image storage (optional). When S3Bucket is set, PublicBaseURL and keys are required.
	S3Bucket        string
	S3Region        string
	S3Endpoint      string
	S3AccessKey     string
	S3SecretKey     string
	S3PublicBaseURL string
	S3KeyPrefix     string
	// External metadata APIs (optional)
	MetadataUserAgent    string
	DiscogsPersonalToken string
	TheGamesDBAPIKey     string
	GoogleBooksAPIKey    string
	TMDBAPIKey           string
	ComicVineAPIKey      string
	// BetaAccessRequired enforces email-invite beta flow before register (env: BETA_ACCESS_REQUIRED, default false).
	BetaAccessRequired bool
	// BetaAdminEmail receives POST /auth/beta/request-access notifications via Mailgun (env: BETA_ADMIN_EMAIL). Used only when BetaDiscordWebhookURL is empty.
	BetaAdminEmail string
	// PublicWebBaseURL is the browser-facing app origin for beta invite links (no trailing slash), e.g. https://app.example.com (env: PUBLIC_WEB_BASE_URL). Falls back to the first CORS origin when empty.
	PublicWebBaseURL string
	// BetaDiscordWebhookURL is a Discord incoming webhook URL; when set, request-access notifications go there instead of BetaAdminEmail.
	// Env (first non-empty): BETA_DISCORD_WEBHOOK, KURATOR_BETA_DISCORD_WEBHOOK, BETA_DISCORD_WEBHOOK_URL; TOML [beta].discord_webhook_url.
	BetaDiscordWebhookURL string
	// TurnstileEnabled opts in to Cloudflare Turnstile on POST /auth/login and /auth/register (env: CLOUDFLARE_TURNSTILE_ENABLED, default false).
	TurnstileEnabled bool
	// TurnstileSecretKey is required when TurnstileEnabled is true (env: CLOUDFLARE_TURNSTILE_SECRETKEY).
	TurnstileSecretKey string
	// Mailgun (optional): when API key and domain are set, password recovery emails are sent via Mailgun.
	MailgunAPIKey  string
	MailgunDomain  string
	MailgunFrom    string
	MailgunAPIBase string
	// SentryDSN enables Sentry error reporting and the Fiber middleware when non-empty (env: SENTRY_DSN).
	SentryDSN string
	// SentryEnvironment is optional (e.g. production, staging); env: SENTRY_ENVIRONMENT.
	SentryEnvironment string
	// RedisURL enables Valkey/Redis-backed durable notification queue (env: REDIS_URL). Empty = synchronous delivery only.
	RedisURL string
	// RedisNotifyQueueKey is the Redis list key for outbound notification jobs (env: REDIS_NOTIFY_QUEUE_KEY).
	RedisNotifyQueueKey string
}
