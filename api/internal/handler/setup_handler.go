package handler

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/config"
	"github.com/boxingoctopus/kurator/api/internal/migrate"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/gofiber/fiber/v2"
)

type SetupHandler struct {
	cfg config.Config
}

func NewSetupHandler(cfg config.Config) *SetupHandler {
	return &SetupHandler{cfg: cfg}
}

// Info returns whether setup endpoints are enabled (for the UI).
// @Summary Setup availability
// @Tags setup
// @Produce json
// @Success 200 {object} map[string]bool "setup_enabled"
// @Router /api/v1/setup [get]
func (h *SetupHandler) Info(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"setup_enabled": h.cfg.SetupEnabled,
	})
}

// Status reports migration progress using DATABASE_URL from server config (no secrets in the request).
// @Summary Migration status
// @Tags setup
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/setup/status [get]
func (h *SetupHandler) Status(c *fiber.Ctx) error {
	if !h.cfg.SetupEnabled {
		return c.JSON(fiber.Map{"setup_enabled": false})
	}
	applied, expected, err := migrate.Status(c.Context(), h.cfg.DatabaseURL)
	if err != nil {
		return c.JSON(fiber.Map{
			"setup_enabled": true,
			"connected":     false,
			"message":       err.Error(),
		})
	}
	return c.JSON(fiber.Map{
		"setup_enabled":  true,
		"connected":      true,
		"applied":        applied,
		"expected":       expected,
		"pending":        len(applied) < len(expected),
		"applied_count":  len(applied),
		"expected_count": len(expected),
	})
}

// SetupMigrateBody is the JSON body for POST /api/v1/setup/migrate.
type SetupMigrateBody struct {
	DatabaseURL string `json:"database_url"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	User        string `json:"user"`
	Password    string `json:"password"`
	Database    string `json:"database"`
	SSLMode     string `json:"sslmode"`
}

// Migrate runs bundled SQL migrations against the given database (or DATABASE_URL when omitted). Requires SETUP_ENABLED=true on the server.
// @Summary Run migrations
// @Tags setup
// @Accept json
// @Produce json
// @Param body body SetupMigrateBody false "Connection (optional if server DATABASE_URL is set)"
// @Success 200 {object} map[string]interface{} "ok, applied"
// @Failure 400 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/setup/migrate [post]
func (h *SetupHandler) Migrate(c *fiber.Ctx) error {
	if !h.cfg.SetupEnabled {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"message": "Database setup API is disabled (set SETUP_ENABLED=true to enable).",
		})
	}

	var body SetupMigrateBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"message": "Invalid JSON body."})
	}

	conn, err := postgresURLFromBody(body, strings.TrimSpace(h.cfg.DatabaseURL))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"message": err.Error()})
	}

	applied, err := migrate.Up(c.Context(), conn)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": err.Error()})
	}

	return c.JSON(fiber.Map{
		"ok":      true,
		"applied": applied,
	})
}

func postgresURLFromBody(body SetupMigrateBody, fallback string) (string, error) {
	if u := strings.TrimSpace(body.DatabaseURL); u != "" {
		return validation.PostgresDatabaseURL(u, "Database URL")
	}

	if strings.TrimSpace(body.Host) != "" && strings.TrimSpace(body.User) != "" && strings.TrimSpace(body.Database) != "" {
		port := body.Port
		if port <= 0 {
			port = 5432
		}
		if err := validation.Port(port, "Port"); err != nil {
			return "", err
		}
		host, err := validation.DBHost(body.Host, "Host")
		if err != nil {
			return "", err
		}
		user, err := validation.DBUserOrName(body.User, "User")
		if err != nil {
			return "", err
		}
		dbName, err := validation.DBUserOrName(body.Database, "Database")
		if err != nil {
			return "", err
		}
		if err := validation.DBPassword(body.Password, "Password"); err != nil {
			return "", err
		}
		ssl, err := validation.SSLMode(body.SSLMode, "SSL mode")
		if err != nil {
			return "", err
		}
		u := url.URL{
			Scheme: "postgres",
			User:   url.UserPassword(user, body.Password),
			Host:   fmt.Sprintf("%s:%d", host, port),
			Path:   "/" + strings.TrimPrefix(dbName, "/"),
		}
		q := url.Values{}
		q.Set("sslmode", ssl)
		u.RawQuery = q.Encode()
		return u.String(), nil
	}

	if fallback != "" {
		return fallback, nil
	}

	return "", fmt.Errorf("provide database_url or host, user, and database name")
}
