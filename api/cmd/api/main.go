// @title Kurator API
// @version 1.0
// @description REST API for Kurator: collections, items, search, external metadata lookup, session-based auth, bundled SQL migrations with first-boot bootstrap, and optional S3-backed image uploads.
// @host localhost:8080
// @BasePath /

// @securityDefinitions.apikey SessionCookie
// @in cookie
// @name kurator_session
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/config"
	"github.com/boxingoctopus/kurator/api/internal/handler"
	"github.com/boxingoctopus/kurator/api/internal/mailgun"
	"github.com/boxingoctopus/kurator/api/internal/middleware"
	"github.com/boxingoctopus/kurator/api/internal/migrate"
	"github.com/boxingoctopus/kurator/api/internal/notifyqueue"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/getsentry/sentry-go"
	sentryfiber "github.com/getsentry/sentry-go/fiber"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spf13/afero"
	"github.com/spf13/cobra"
)

func main() {
	var opts config.LoadOptions
	cmd := &cobra.Command{
		Use:   "kurator-api",
		Short: "Run the Kurator API HTTP server.",
		Long: "Run the Kurator API HTTP server.\n\n" +
			"Configuration is layered from highest to lowest precedence: environment variables, " +
			"CLI flags, the TOML config file (-c/--config or KURATOR_CONFIG, default ./kurator.toml), " +
			"and built-in defaults.",
		SilenceUsage:  true,
		SilenceErrors: true,
		Args:          cobra.NoArgs,
		RunE: func(_ *cobra.Command, _ []string) error {
			cfg, err := config.Load(afero.NewOsFs(), &opts)
			if err != nil {
				return fmt.Errorf("config: %w", err)
			}
			return runAPI(cfg)
		},
	}
	config.RegisterFlags(cmd.Flags(), &opts)

	if err := cmd.Execute(); err != nil {
		log.Fatal(err)
	}
}

func runAPI(cfg config.Config) error {
	startupCtx, startupCancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer startupCancel()

	pool, err := connectPostgres(startupCtx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pool.Close()

	applied, expected, err := migrate.StatusWithExistingPool(startupCtx, pool)
	if err != nil {
		log.Fatalf("migrations: %v", err)
	}
	if len(applied) < len(expected) {
		logStartup("bootstrap", "database not fully populated; applying migrations")
		appliedNow, err := migrate.UpWithExistingPool(startupCtx, pool)
		if err != nil {
			log.Fatalf("bootstrap: %v", err)
		}
		if len(appliedNow) == 0 {
			logStartup("bootstrap", "no bootstrap migrations were needed")
		} else {
			logStartup("bootstrap", "applied "+strings.Join(appliedNow, ", "))
		}
	} else {
		logStartup("bootstrap", "database already populated")
	}

	var indexer service.SearchIndexer
	if strings.TrimSpace(cfg.MeilisearchHost) == "" {
		logStartup("meilisearch", "skipped (not configured)")
	} else {
		idx := service.NewMeilisearchIndexer(cfg.MeilisearchHost, cfg.MeilisearchKey, cfg.MeilisearchIndex)
		pingCtx, pingCancel := context.WithTimeout(startupCtx, 10*time.Second)
		meiliErr := idx.Ping(pingCtx)
		pingCancel()
		if meiliErr != nil {
			logStartup("meilisearch", "failed: "+meiliErr.Error())
		} else {
			logStartup("meilisearch", "ok")
		}
		if err := idx.EnsureIndex(context.Background()); err != nil {
			log.Printf("meilisearch ensure index: %v (search may fail until Meilisearch is ready)", err)
		}
		indexer = idx
	}

	var imgSvc *service.ImageService
	if cfg.S3Bucket == "" {
		logStartup("s3", "skipped (not configured)")
	} else {
		if cfg.S3AccessKey == "" || cfg.S3SecretKey == "" {
			log.Fatalf("S3_BUCKET is set: provide S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY")
		}
		imgSvc, err = service.NewImageService(
			cfg.S3Bucket,
			cfg.S3Region,
			cfg.S3Endpoint,
			cfg.S3AccessKey,
			cfg.S3SecretKey,
			cfg.S3PublicBaseURL,
			cfg.S3KeyPrefix,
		)
		if err != nil {
			log.Fatalf("image storage: %v", err)
		}
		s3PingCtx, s3PingCancel := context.WithTimeout(startupCtx, 15*time.Second)
		s3Err := imgSvc.Ping(s3PingCtx)
		s3PingCancel()
		if s3Err != nil {
			log.Fatalf("startup: s3: failed: %v", s3Err)
		}
		logStartup("s3", "ok (bucket="+cfg.S3Bucket+")")
		log.Printf("S3 image uploads enabled (bucket=%s)", cfg.S3Bucket)
	}

	sentryEnabled := initSentry(cfg)
	if strings.TrimSpace(cfg.SentryDSN) == "" {
		logStartup("sentry", "skipped (not configured)")
	} else if sentryEnabled {
		logStartup("sentry", "ok")
	} else {
		logStartup("sentry", "failed (initialization error; see log above)")
	}
	if sentryEnabled {
		defer sentry.Flush(2 * time.Second)
	}

	itemRepo := repository.NewPostgresItemRepository(pool)
	collRepo := repository.NewPostgresCollectionRepository(pool)
	wishRepo := repository.NewPostgresWishlistRepository(pool)
	notifRepo := repository.NewPostgresNotificationRepository(pool)
	userRepo := repository.NewPostgresUserRepository(pool)
	followRepo := repository.NewPostgresFollowRepository(pool)
	sessionRepo := repository.NewPostgresSessionRepository(pool)
	recoveryRepo := repository.NewPostgresPasswordRecoveryRepository(pool)
	mg := mailgun.New(cfg.MailgunAPIKey, cfg.MailgunDomain, cfg.MailgunFrom, cfg.MailgunAPIBase)
	notifyClient, err := notifyqueue.New(cfg.RedisURL, cfg.RedisNotifyQueueKey, notifyqueue.Deps{
		DiscordWebhookURL: cfg.BetaDiscordWebhookURL,
		BetaAdminEmail:    cfg.BetaAdminEmail,
		Mail:              mg,
	})
	if err != nil {
		log.Fatalf("notifyqueue: %v", err)
	}
	defer func() { _ = notifyClient.Close() }()
	notifyClient.Start(context.Background())
	if notifyClient.RedisEnabled() {
		qk := strings.TrimSpace(cfg.RedisNotifyQueueKey)
		if qk == "" {
			qk = "kurator:notify:jobs"
		}
		logStartup("redis", "notification queue enabled (list="+qk+")")
	} else {
		logStartup("redis", "skipped (set REDIS_URL for durable outbound notification retries)")
	}
	recoverySvc := service.NewPasswordRecoveryService(userRepo, sessionRepo, recoveryRepo, mg, cfg.AuthJWTSecret)
	itemSvc := service.NewItemService(itemRepo, collRepo, indexer)
	collSvc := service.NewCollectionService(collRepo, itemRepo, indexer)
	wishSvc := service.NewWishlistService(wishRepo, collRepo, indexer)
	listRepo := repository.NewPostgresListRepository(pool)
	listSvc := service.NewListService(listRepo, collRepo, itemRepo)
	dashboardRepo := repository.NewPostgresDashboardRepository(pool)
	dashboardSvc := service.NewDashboardService(dashboardRepo)
	shelfShareRepo := repository.NewPostgresShelfShareRepository(pool)
	shelfShareSvc := service.NewShelfShareService(shelfShareRepo, followRepo, notifRepo, collRepo, listRepo, wishRepo)
	activityFanout := service.NewActivityFanout(notifRepo)
	searchSvc := service.NewSearchService(indexer)
	metaSvc := service.NewMetadataService(service.MetadataConfig{
		UserAgent:        cfg.MetadataUserAgent,
		DiscogsToken:     cfg.DiscogsPersonalToken,
		TheGamesDBAPIKey: cfg.TheGamesDBAPIKey,
		GoogleBooksKey:   cfg.GoogleBooksAPIKey,
		TMDBAPIKey:       cfg.TMDBAPIKey,
		ComicVineAPIKey:  cfg.ComicVineAPIKey,
	})
	betaRepo := repository.NewPostgresBetaKeyRepository(pool)
	betaInviteRepo := repository.NewPostgresBetaAccessInviteRepository(pool)
	publicWeb := strings.TrimRight(strings.TrimSpace(cfg.PublicWebBaseURL), "/")
	if publicWeb == "" && len(cfg.CORSOrigins) > 0 {
		publicWeb = strings.TrimRight(strings.TrimSpace(cfg.CORSOrigins[0]), "/")
	}
	authSvc := service.NewAuthService(
		pool,
		userRepo,
		sessionRepo,
		betaRepo,
		betaInviteRepo,
		publicWeb,
		cfg.AuthJWTSecret,
		cfg.SessionMaxAge,
		cfg.BetaAccessRequired,
		notifyClient,
	)
	if cfg.BetaAccessRequired {
		if strings.TrimSpace(cfg.BetaDiscordWebhookURL) != "" {
			logStartup("beta", "access requests: Discord webhook configured")
		} else {
			logStartup("beta", betaDiscordWebhookStartupHint())
		}
	}
	socialSvc := service.NewSocialService(userRepo, followRepo, activityFanout)

	itemH := handler.NewItemHandler(itemSvc, collRepo, authSvc, metaSvc, listSvc, activityFanout)
	collH := handler.NewCollectionHandler(collSvc, authSvc, itemSvc, collRepo, activityFanout, shelfShareSvc)
	socialH := handler.NewSocialHandler(socialSvc, authSvc)
	wishH := handler.NewWishlistHandler(wishSvc, authSvc, activityFanout, shelfShareSvc)
	listH := handler.NewListHandler(listSvc, authSvc, activityFanout, shelfShareSvc)
	shelfShareH := handler.NewShelfShareHandler(shelfShareSvc)
	dashboardH := handler.NewDashboardHandler(dashboardSvc)
	notifH := handler.NewNotificationHandler(notifRepo)
	searchH := handler.NewSearchHandler(searchSvc)
	metaH := handler.NewMetadataHandler(metaSvc)
	authH := handler.NewAuthHandler(authSvc, cfg.CookieSecure, cfg.SessionMaxAge, cfg.TurnstileEnabled, cfg.TurnstileSecretKey, cfg.BetaAccessRequired, publicWeb)
	recoveryH := handler.NewPasswordRecoveryHandler(recoverySvc, cfg.TurnstileEnabled, cfg.TurnstileSecretKey)
	requireAuth := middleware.RequireAuth(authSvc)

	imgH := handler.NewImageHandler(imgSvc)

	app := fiber.New(fiber.Config{
		AppName:      "Kurator API",
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		BodyLimit:    12 * 1024 * 1024,
	})

	app.Use(recover.New())
	if sentryEnabled {
		app.Use(sentryfiber.New(sentryfiber.Options{
			Repanic:         true,
			WaitForDelivery: false,
		}))
	}
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     joinOrigins(cfg.CORSOrigins),
		AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		AllowCredentials: true,
	}))

	app.Get("/health", health)

	v1 := app.Group("/api/v1")
	v1.Get("/auth/beta/status", authH.BetaAccessStatus)
	v1.Post("/auth/beta/unlock", authH.BetaUnlock)
	v1.Post("/auth/beta/request-access", authH.BetaRequestAccess)
	v1.Get("/auth/beta/approve-access", authH.BetaApproveAccess)
	v1.Get("/auth/beta/open-invite", authH.BetaOpenInvite)
	v1.Post("/auth/register", authH.Register)
	v1.Post("/auth/login", authH.Login)
	v1.Post("/auth/login/2fa", authH.Login2FA)
	v1.Post("/auth/logout", authH.Logout)
	v1.Post("/auth/forgot-password", recoveryH.ForgotPassword)
	v1.Post("/auth/forgot-password/verify", recoveryH.VerifyForgotPassword)
	v1.Post("/auth/forgot-password/reset", recoveryH.ResetForgotPassword)

	me := v1.Group("/me", requireAuth)
	me.Get("/", authH.Me)
	me.Patch("/", authH.PatchMe)
	me.Get("/notifications", notifH.List)
	me.Patch("/notifications/:id/read", notifH.MarkRead)
	me.Post("/notifications/read-all", notifH.MarkAllRead)
	me.Post("/2fa/setup", authH.TwoFASetup)
	me.Post("/2fa/enable", authH.TwoFAEnable)
	me.Post("/2fa/disable", authH.TwoFADisable)
	me.Post("/password/verification-code", recoveryH.RequestMePasswordVerificationCode)
	me.Post("/password", recoveryH.ChangeMePassword)
	me.Get("/friends", socialH.ListMyFriends)
	me.Get("/people-you-may-know", socialH.ListPeopleYouMayKnow)
	me.Post("/shelf-share/join", shelfShareH.RequestJoin)
	me.Post("/shelf-share/invite", shelfShareH.Invite)
	me.Post("/shelf-access-requests/:id/approve", shelfShareH.ApproveRequest)
	me.Post("/shelf-access-requests/:id/dismiss", shelfShareH.DismissRequest)
	me.Get("/shelves", dashboardH.RecentShelves)

	v1.Post("/images", requireAuth, imgH.Upload)

	v1.Get("/users/search", requireAuth, socialH.SearchUsers)
	v1.Get("/users/:userRef/followers", socialH.ListFollowers)
	v1.Get("/users/:userRef/following", socialH.ListFollowing)
	v1.Get("/users/:userRef", socialH.GetUser)
	v1.Post("/users/:userRef/follow", requireAuth, socialH.Follow)
	v1.Delete("/users/:userRef/follow", requireAuth, socialH.Unfollow)

	v1.Get("/collections", collH.List)
	v1.Post("/collections", requireAuth, collH.Create)
	v1.Get("/collections/:id/items.csv", requireAuth, collH.ExportItemsCSV)
	v1.Post("/collections/:id/items/import", requireAuth, collH.ImportItemsCSV)
	v1.Get("/collections/:id", collH.Get)
	v1.Patch("/collections/:id", requireAuth, collH.Patch)
	v1.Delete("/collections/:id", requireAuth, collH.Delete)
	v1.Get("/wishlists", wishH.List)
	v1.Post("/wishlists", requireAuth, wishH.Create)
	v1.Get("/wishlists/:id/entries.csv", requireAuth, wishH.ExportEntriesCSV)
	v1.Post("/wishlists/:id/entries/import", requireAuth, wishH.ImportEntriesCSV)
	v1.Get("/wishlists/:id", requireAuth, wishH.Get)
	v1.Put("/wishlists/:id", requireAuth, wishH.Update)
	v1.Delete("/wishlists/:id", requireAuth, wishH.Delete)
	v1.Get("/lists", listH.List)
	v1.Post("/lists", requireAuth, listH.Create)
	v1.Get("/lists/:id/items", requireAuth, listH.ListItems)
	v1.Post("/lists/:id/items", requireAuth, listH.AddItem)
	v1.Delete("/lists/:id/items/:itemId", requireAuth, listH.RemoveItem)
	v1.Get("/lists/:id", requireAuth, listH.Get)
	v1.Put("/lists/:id", requireAuth, listH.Update)
	v1.Delete("/lists/:id", requireAuth, listH.Delete)
	v1.Get("/wishlists/:id/entries", requireAuth, wishH.ListEntries)
	v1.Post("/wishlists/:id/entries", requireAuth, wishH.CreateEntry)
	v1.Delete("/wishlists/:id/entries/:entryId", requireAuth, wishH.DeleteEntry)
	v1.Post("/wishlists/:id/entries/:entryId/obtain", requireAuth, wishH.Obtain)
	v1.Get("/items", itemH.List)
	v1.Get("/items/:id/enrichment", itemH.Enrichment)
	v1.Get("/items/:id/lists", itemH.ListRefsContainingItem)
	v1.Get("/items/:id", itemH.Get)
	v1.Post("/items", requireAuth, itemH.Create)
	v1.Put("/items/:id", requireAuth, itemH.Update)
	v1.Delete("/items/:id", requireAuth, itemH.Delete)
	v1.Get("/search", searchH.Search)
	v1.Get("/metadata/lookup", metaH.Lookup)

	addr := cfg.HTTPAddr
	log.Printf("listening on %s", addr)
	if err := app.Listen(addr); err != nil {
		return fmt.Errorf("listen %s: %w", addr, err)
	}
	return nil
}

// initSentry configures the Sentry SDK when SENTRY_DSN / config [sentry] dsn is set.
// Returns whether the sentryfiber middleware should be registered (requires successful Init).
func initSentry(cfg config.Config) bool {
	dsn := strings.TrimSpace(cfg.SentryDSN)
	if dsn == "" {
		return false
	}

	tracesSampleRate := 0.1
	if v := strings.TrimSpace(os.Getenv("SENTRY_TRACES_SAMPLE_RATE")); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 && f <= 1 {
			tracesSampleRate = f
		}
	}

	opts := sentry.ClientOptions{
		Dsn:              dsn,
		SendDefaultPII:   false,
		EnableTracing:    true,
		TracesSampleRate: tracesSampleRate,
	}
	if env := strings.TrimSpace(cfg.SentryEnvironment); env != "" {
		opts.Environment = env
	}

	if err := sentry.Init(opts); err != nil {
		log.Printf("sentry: initialization failed: %v", err)
		return false
	}
	return true
}

func connectPostgres(ctx context.Context, url string) (*pgxpool.Pool, error) {
	var last error
	for i := 0; i < 30; i++ {
		pool, err := pgxpool.New(ctx, url)
		if err == nil {
			pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err = pool.Ping(pingCtx)
			cancel()
			if err == nil {
				logStartup("postgres", "ok")
				return pool, nil
			}
			pool.Close()
		}
		last = err
		log.Printf("startup: postgres: waiting (attempt %d/30): %v", i+1, err)
		select {
		case <-ctx.Done():
			logStartup("postgres", "failed: "+ctx.Err().Error())
			return nil, fmt.Errorf("context done: %w", ctx.Err())
		case <-time.After(2 * time.Second):
		}
	}
	logStartup("postgres", "failed: "+last.Error())
	return nil, fmt.Errorf("postgres unavailable: %w", last)
}

func betaDiscordWebhookStartupHint() string {
	envKeys := []string{
		"BETA_DISCORD_WEBHOOK",
		"KURATOR_BETA_DISCORD_WEBHOOK",
		"BETA_DISCORD_WEBHOOK_URL",
	}
	for _, k := range envKeys {
		raw, set := os.LookupEnv(k)
		if !set {
			continue
		}
		if strings.TrimSpace(raw) == "" {
			return fmt.Sprintf(
				"access requests: %s is present but empty after trim (fix Portainer/Compose substitution or remove the empty override)",
				k,
			)
		}
		// Variable is set and non-empty after trim, but config did not pick it up — should not happen.
		return fmt.Sprintf(
			"access requests: %s is set in the environment but the loaded webhook URL is empty (report as a bug)",
			k,
		)
	}
	return "access requests: no Discord webhook URL loaded; set BETA_DISCORD_WEBHOOK (or KURATOR_BETA_DISCORD_WEBHOOK) " +
		"on this API container's environment, or [beta].discord_webhook_url in config; stack-level env alone does not reach the container unless the service inherits it"
}

func logStartup(component, detail string) {
	log.Printf("startup: %s: %s", component, detail)
}

// Health reports that the HTTP server is running.
// @Summary Health check
// @Tags health
// @Produce json
// @Success 200 {object} map[string]string "status=ok"
// @Router /health [get]
func health(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "ok"})
}

func joinOrigins(origins []string) string {
	if len(origins) == 0 {
		return "http://localhost:3000"
	}
	out := origins[0]
	for i := 1; i < len(origins); i++ {
		out += "," + origins[i]
	}
	return out
}
