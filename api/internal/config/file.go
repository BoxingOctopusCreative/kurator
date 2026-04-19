package config

// fileConfig is the optional TOML file shape (all fields optional).
type fileConfig struct {
	HTTPAddr         string   `toml:"http_addr"`
	DatabaseURL      string   `toml:"database_url"`
	MeilisearchHost  string   `toml:"meilisearch_host"`
	MeilisearchKey   string   `toml:"meilisearch_api_key"`
	MeilisearchIndex string   `toml:"meilisearch_index"`
	CORSOrigins      []string `toml:"cors_origins"`
	AuthJWTSecret    string   `toml:"auth_jwt_secret"`
	SessionMaxAge    int      `toml:"session_max_age_seconds"`
	CookieSecure     *bool    `toml:"cookie_secure"`
	S3Bucket         string   `toml:"s3_bucket"`
	S3Region         string   `toml:"s3_region"`
	S3Endpoint       string   `toml:"s3_endpoint"`
	S3AccessKey      string   `toml:"s3_access_key_id"`
	S3SecretKey      string   `toml:"s3_secret_access_key"`
	S3PublicBaseURL  string   `toml:"s3_public_base_url"`
	S3KeyPrefix      string   `toml:"s3_key_prefix"`
	MetadataUserAgent    string `toml:"metadata_user_agent"`
	DiscogsPersonalToken string `toml:"discogs_personal_token"`
	TheGamesDBAPIKey     string `toml:"thegamesdb_api_key"`
	GoogleBooksAPIKey    string `toml:"google_books_api_key"`
	TMDBAPIKey           string `toml:"tmdb_api_key"`
	ComicVineAPIKey      string `toml:"comicvine_api_key"`
	SetupEnabled         *bool  `toml:"setup_enabled"`
	TurnstileEnabled     *bool  `toml:"turnstile_enabled"`
	TurnstileSecretKey   string `toml:"turnstile_secret_key"`
}
