package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/boxingoctopus/kurator/api/internal/config"
	"github.com/boxingoctopus/kurator/api/internal/migrate"
	"github.com/spf13/afero"
	"github.com/spf13/cobra"
)

// Standalone migrate command (same SQL bundle as API startup bootstrap).
func main() {
	var opts config.LoadOptions
	cmd := &cobra.Command{
		Use:   "kurator-migrate",
		Short: "Apply Kurator database migrations.",
		Long: "Apply the bundled SQL migrations against DATABASE_URL.\n\n" +
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
			applied, err := migrate.Up(context.Background(), cfg.DatabaseURL)
			if err != nil {
				return err
			}
			if len(applied) == 0 {
				fmt.Fprintln(os.Stderr, "No new migrations (already up to date).")
				return nil
			}
			fmt.Printf("Applied: %v\n", applied)
			return nil
		},
	}
	config.RegisterFlags(cmd.Flags(), &opts)

	if err := cmd.Execute(); err != nil {
		log.Fatal(err)
	}
}
