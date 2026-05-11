// Betakeygen prints a new beta access key and inserts it into beta_keys.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/config"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spf13/afero"
	"github.com/spf13/cobra"
)

func main() {
	var opts config.LoadOptions
	cmd := &cobra.Command{
		Use:   "kurator-betakeygen",
		Short: "Generate a new Kurator beta access key.",
		Long: "Generate a new beta access key, insert its hash into beta_keys, and print the plaintext " +
			"key to stdout (and a short status line to stderr).\n\n" +
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
			return runBetaKeygen(cfg)
		},
	}
	config.RegisterFlags(cmd.Flags(), &opts)

	if err := cmd.Execute(); err != nil {
		log.Fatal(err)
	}
}

func runBetaKeygen(cfg config.Config) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("postgres: %w", err)
	}
	defer pool.Close()

	var b [24]byte
	if _, err := rand.Read(b[:]); err != nil {
		return err
	}
	key := "kurator_beta_" + hex.EncodeToString(b[:])
	keyHash := service.BetaKeyHash(key)

	repo := repository.NewPostgresBetaKeyRepository(pool)
	id, err := repo.InsertKeyHash(ctx, keyHash)
	if err != nil {
		return fmt.Errorf("insert beta key: %w", err)
	}

	fmt.Println(key)
	fmt.Fprintf(os.Stderr, "Stored key_hash in beta_keys.id=%s (claimed=false until unlock).\n", id.String())
	return nil
}
