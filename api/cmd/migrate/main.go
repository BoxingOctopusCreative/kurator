package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/boxingoctopus/kurator/api/internal/config"
	"github.com/boxingoctopus/kurator/api/internal/migrate"
)

// Standalone migrate command (same SQL bundle as API boot and POST /api/v1/setup/migrate).
func main() {
	var opts config.LoadOptions
	config.RegisterFlags(flag.CommandLine, &opts)
	flag.Parse()
	cfg, err := config.Load(&opts)
	if err != nil {
		log.Fatal(err)
	}
	applied, err := migrate.Up(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	if len(applied) == 0 {
		fmt.Fprintln(os.Stderr, "No new migrations (already up to date).")
		return
	}
	fmt.Printf("Applied: %v\n", applied)
}
