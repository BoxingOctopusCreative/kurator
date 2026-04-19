// @title Kurator API
// @version 1.0
// @description REST API for Kurator: collections, items, search, external metadata lookup, session-based auth, setup/migrations, and optional S3-backed image uploads.
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
	"time"

	"github.com/boxingoctopus/kurator/api/internal/config"
	"github.com/boxingoctopus/kurator/api/internal/handler"
	"github.com/boxingoctopus/kurator/api/internal/mailgun"
	"github.com/boxingoctopus/kurator/api/internal/middleware"
	"github.com/boxingoctopus/kurator/api/internal/migrate"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	migrateOnly := flag.Bool("migrate", false, "apply bundled SQL migrations using DATABASE_URL, then exit (same migrations as POST /api/v1/setup/migrate)")
	var opts config.LoadOptions
	config.RegisterFlags(flag.CommandLine, &opts)
	flag.Parse()

	cfg, err := config.Load(&opts)
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	if *migrateOnly {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		applied, err := migrate.Up(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("migrate: %v", err)
		}
		if len(applied) == 0 {
			fmt.Fprintln(os.Stderr, "No new migrations (already up to date).")
			return
		}
		fmt.Printf("Applied migrations: %v\n", applied)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, err := connectPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pool.Close()

	var indexer service.SearchIndexer
	if cfg.MeilisearchHost != "" {
		idx := service.NewMeilisearchIndexer(cfg.MeilisearchHost, cfg.MeilisearchKey, cfg.MeilisearchIndex)
		if err := idx.EnsureIndex(context.Background()); err != nil {
			log.Printf("meilisearch ensure index: %v (search may fail until Meilisearch is ready)", err)
		}
		indexer = idx
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
		UserAgent:         cfg.MetadataUserAgent,
		DiscogsToken:      cfg.DiscogsPersonalToken,
		TheGamesDBAPIKey:  cfg.TheGamesDBAPIKey,
		GoogleBooksKey:    cfg.GoogleBooksAPIKey,
		TMDBAPIKey:        cfg.TMDBAPIKey,
		ComicVineAPIKey:   cfg.ComicVineAPIKey,
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

	var imgSvc *service.ImageService
	if cfg.S3Bucket != "" {
		if cfg.S3AccessKey == "" || cfg.S3SecretKey == "" {
			log.Fatal("S3_BUCKET is set: provide S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY")
		}
		var err error
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
		log.Printf("S3 image uploads enabled (bucket=%s)", cfg.S3Bucket)
	}
	imgH := handler.NewImageHandler(imgSvc)

	app := fiber.New(fiber.Config{
		AppName:      "Kurator API",
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		BodyLimit:    12 * 1024 * 1024,
	})

	app.Use(recover.New())
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
	v1.Post("/items", itemH.Create)
	v1.Put("/items/:id", itemH.Update)
	v1.Delete("/items/:id", itemH.Delete)
	v1.Get("/search", searchH.Search)
	v1.Get("/metadata/lookup", metaH.Lookup)

	addr := cfg.HTTPAddr
	log.Printf("listening on %s", addr)
	if err := app.Listen(addr); err != nil {
		log.Fatal(err)
	}
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
				return pool, nil
			}
			pool.Close()
		}
		last = err
		log.Printf("waiting for postgres (%d/30): %v", i+1, err)
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("context done: %w", ctx.Err())
		case <-time.After(2 * time.Second):
		}
	}
	return nil, fmt.Errorf("postgres unavailable: %w", last)
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
