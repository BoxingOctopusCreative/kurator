package config

// fileConfig is the optional TOML file shape (sections and fields are all optional).
type fileConfig struct {
	Server      fileServer      `toml:"server"`
	Beta        fileBeta        `toml:"beta"`
	Database    fileDatabase    `toml:"database"`
	Meilisearch fileMeilisearch `toml:"meilisearch"`
	CORS        fileCORS        `toml:"cors"`
	Auth        fileAuth        `toml:"auth"`
	OAuth       fileOAuth       `toml:"oauth"`
	S3          fileS3          `toml:"s3"`
	Metadata    fileMetadata    `toml:"metadata"`
	Turnstile   fileTurnstile   `toml:"turnstile"`
	Mailgun     fileMailgun     `toml:"mailgun"`
	Sentry      fileSentry      `toml:"sentry"`
	Redis       fileRedis       `toml:"redis"`
	Stripe      fileStripe      `toml:"stripe"`
}

type fileStripe struct {
	SecretKey         string `toml:"secret_key"`
	WebhookSecret     string `toml:"webhook_secret"`
	ProMonthlyPriceID string `toml:"pro_monthly_price_id"`
	ProAnnualPriceID  string `toml:"pro_annual_price_id"`
}

type fileSentry struct {
	DSN         string `toml:"dsn"`
	Environment string `toml:"environment"`
}

type fileServer struct {
	HTTPAddr string `toml:"http_addr"`
}

type fileBeta struct {
	AccessRequired    *bool  `toml:"access_required"`
	AdminEmail        string `toml:"admin_email"`
	PublicWebBaseURL  string `toml:"public_web_base_url"`
	DiscordWebhookURL string `toml:"discord_webhook_url"`
}

type fileDatabase struct {
	URL string `toml:"url"`
}

type fileMeilisearch struct {
	Host   string `toml:"host"`
	APIKey string `toml:"api_key"`
	Index  string `toml:"index"`
}

type fileCORS struct {
	Origins []string `toml:"origins"`
}

type fileAuth struct {
	JWTSecret            string `toml:"jwt_secret"`
	SessionMaxAgeSeconds int    `toml:"session_max_age_seconds"`
	CookieSecure         *bool  `toml:"cookie_secure"`
}

type fileOAuth struct {
	GoogleClientID        string `toml:"google_client_id"`
	GoogleClientSecret    string `toml:"google_client_secret"`
	DiscordClientID       string `toml:"discord_client_id"`
	DiscordClientSecret   string `toml:"discord_client_secret"`
}

type fileS3 struct {
	Bucket          string `toml:"bucket"`
	Region          string `toml:"region"`
	Endpoint        string `toml:"endpoint"`
	AccessKeyID     string `toml:"access_key_id"`
	SecretAccessKey string `toml:"secret_access_key"`
	PublicBaseURL   string `toml:"public_base_url"`
	KeyPrefix       string `toml:"key_prefix"`
	UserAssetsBucket string `toml:"user_assets_bucket"`
}

type fileMetadata struct {
	UserAgent            string `toml:"user_agent"`
	DiscogsPersonalToken string `toml:"discogs_personal_token"`
	TheGamesDBAPIKey     string `toml:"thegamesdb_api_key"`
	GoogleBooksAPIKey    string `toml:"google_books_api_key"`
	GoogleFontsAPIKey    string `toml:"google_fonts_api_key"`
	TMDBAPIKey           string `toml:"tmdb_api_key"`
	ComicVineAPIKey      string `toml:"comicvine_api_key"`
}

type fileTurnstile struct {
	Enabled   *bool  `toml:"enabled"`
	SecretKey string `toml:"secret_key"`
}

type fileMailgun struct {
	APIKey  string `toml:"api_key"`
	Domain  string `toml:"domain"`
	From    string `toml:"from"`
	APIBase string `toml:"api_base"`
}

type fileRedis struct {
	URL            string `toml:"url"`
	NotifyQueueKey string `toml:"notify_queue_key"`
}
