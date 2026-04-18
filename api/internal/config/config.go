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
	// SetupEnabled allows GET/POST /api/v1/setup/* (run migrations from the API). Disable in production after bootstrap.
	SetupEnabled bool
}
