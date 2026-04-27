// Betakeygen prints a new beta access key and inserts it into beta_keys.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/config"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	var opts config.LoadOptions
	config.RegisterFlags(flag.CommandLine, &opts)
	flag.Parse()

	cfg, err := config.Load(&opts)
	if err != nil {
		log.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pool.Close()

	var b [24]byte
	if _, err := rand.Read(b[:]); err != nil {
		log.Fatal(err)
	}
	key := "kurator_beta_" + hex.EncodeToString(b[:])
	keyHash := service.BetaKeyHash(key)

	repo := repository.NewPostgresBetaKeyRepository(pool)
	id, err := repo.InsertKeyHash(ctx, keyHash)
	if err != nil {
		log.Fatalf("insert beta key: %v", err)
	}

	fmt.Println(key)
	fmt.Fprintf(os.Stderr, "Stored key_hash in beta_keys.id=%s (claimed=false until unlock).\n", id.String())
}
