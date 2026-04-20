// @title Kurator API
// @version 1.0
// @description REST API for Kurator: collections, items, search, external metadata lookup, session-based auth, setup status, bundled SQL migrations on boot, and optional S3-backed image uploads.
// @host localhost:8080
// @BasePath /

// @securityDefinitions.apikey SessionCookie
// @in cookie
// @name kurator_session
package main

import (
	"context"
	"flag"
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
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/getsentry/sentry-go"
	sentryfiber "github.com/getsentry/sentry-go/fiber"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	var opts config.LoadOptions
	config.RegisterFlags(flag.CommandLine, &opts)
	flag.Parse()

	cfg, err := config.Load(&opts)
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	startupCtx, startupCancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer startupCancel()

	pool, err := connectPostgres(startupCtx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pool.Close()

	applied, err := migrate.UpWithExistingPool(startupCtx, pool)
	if err != nil {
		log.Fatalf("migrations: %v", err)
	}
	if len(applied) == 0 {
		logStartup("migrations", "no pending migrations")
	} else {
		logStartup("migrations", "applied "+strings.Join(applied, ", "))
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
	userRepo := repository.NewPostgresUserRepository(pool)
	followRepo := repository.NewPostgresFollowRepository(pool)
	sessionRepo := repository.NewPostgresSessionRepository(pool)
	recoveryRepo := repository.NewPostgresPasswordRecoveryRepository(pool)
	mg := mailgun.New(cfg.MailgunAPIKey, cfg.MailgunDomain, cfg.MailgunFrom, cfg.MailgunAPIBase)
	recoverySvc := service.NewPasswordRecoveryService(userRepo, sessionRepo, recoveryRepo, mg, cfg.AuthJWTSecret)
	itemSvc := service.NewItemService(itemRepo, indexer)
	collSvc := service.NewCollectionService(collRepo)
	wishSvc := service.NewWishlistService(wishRepo, collRepo, indexer)
	searchSvc := service.NewSearchService(indexer)
	metaSvc := service.NewMetadataService(service.MetadataConfig{
		UserAgent:        cfg.MetadataUserAgent,
		DiscogsToken:     cfg.DiscogsPersonalToken,
		TheGamesDBAPIKey: cfg.TheGamesDBAPIKey,
		GoogleBooksKey:   cfg.GoogleBooksAPIKey,
		TMDBAPIKey:       cfg.TMDBAPIKey,
		ComicVineAPIKey:  cfg.ComicVineAPIKey,
	})
	authSvc := service.NewAuthService(userRepo, sessionRepo, cfg.AuthJWTSecret, cfg.SessionMaxAge)
	socialSvc := service.NewSocialService(userRepo, followRepo)

	itemH := handler.NewItemHandler(itemSvc, collRepo, authSvc, metaSvc)
	collH := handler.NewCollectionHandler(collSvc, authSvc, itemSvc, collRepo)
	socialH := handler.NewSocialHandler(socialSvc, authSvc)
	wishH := handler.NewWishlistHandler(wishSvc)
	searchH := handler.NewSearchHandler(searchSvc)
	metaH := handler.NewMetadataHandler(metaSvc)
	setupH := handler.NewSetupHandler(cfg)
	authH := handler.NewAuthHandler(authSvc, cfg.CookieSecure, cfg.SessionMaxAge, cfg.TurnstileEnabled, cfg.TurnstileSecretKey)
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
	v1.Get("/setup", setupH.Info)
	v1.Get("/setup/status", setupH.Status)
	v1.Post("/setup/migrate", setupH.Migrate)
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
	me.Post("/2fa/setup", authH.TwoFASetup)
	me.Post("/2fa/enable", authH.TwoFAEnable)
	me.Post("/2fa/disable", authH.TwoFADisable)

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
	v1.Get("/wishlists", requireAuth, wishH.List)
	v1.Post("/wishlists", requireAuth, wishH.Create)
	v1.Get("/wishlists/:id", requireAuth, wishH.Get)
	v1.Put("/wishlists/:id", requireAuth, wishH.Update)
	v1.Delete("/wishlists/:id", requireAuth, wishH.Delete)
	v1.Get("/wishlists/:id/entries", requireAuth, wishH.ListEntries)
	v1.Post("/wishlists/:id/entries", requireAuth, wishH.CreateEntry)
	v1.Delete("/wishlists/:id/entries/:entryId", requireAuth, wishH.DeleteEntry)
	v1.Post("/wishlists/:id/entries/:entryId/obtain", requireAuth, wishH.Obtain)
	v1.Get("/items", itemH.List)
	v1.Get("/items/:id/enrichment", itemH.Enrichment)
	v1.Get("/items/:id", itemH.Get)
	v1.Post("/items", requireAuth, itemH.Create)
	v1.Put("/items/:id", requireAuth, itemH.Update)
	v1.Delete("/items/:id", requireAuth, itemH.Delete)
	v1.Get("/search", searchH.Search)
	v1.Get("/metadata/lookup", metaH.Lookup)

	addr := cfg.HTTPAddr
	log.Printf("listening on %s", addr)
	if err := app.Listen(addr); err != nil {
		log.Fatal(err)
	}
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
