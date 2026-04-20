package migrate

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/migrations"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const metaTable = `
CREATE TABLE IF NOT EXISTS schema_migrations (
	version TEXT PRIMARY KEY,
	applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

// Up applies embedded SQL migrations that are not yet recorded in schema_migrations.
// It opens its own short-lived pool to the given database URL.
func Up(ctx context.Context, databaseURL string) (applied []string, err error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	defer pool.Close()

	return UpWithExistingPool(ctx, pool)
}

// UpWithExistingPool applies embedded SQL migrations using an already-connected pool
// (e.g. the API server's long-lived pool after startup checks).
func UpWithExistingPool(ctx context.Context, pool *pgxpool.Pool) (applied []string, err error) {
	pingCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}

	if _, err := pool.Exec(ctx, metaTable); err != nil {
		return nil, fmt.Errorf("schema_migrations: %w", err)
	}

	names, err := listMigrationFiles()
	if err != nil {
		return nil, err
	}

	for _, name := range names {
		var exists bool
		err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, name).Scan(&exists)
		if err != nil {
			return applied, fmt.Errorf("check migration %s: %w", name, err)
		}
		if exists {
			continue
		}

		body, err := migrations.SQL.ReadFile(name)
		if err != nil {
			return applied, fmt.Errorf("read %s: %w", name, err)
		}

		tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
		if err != nil {
			return applied, fmt.Errorf("begin %s: %w", name, err)
		}

		if err := execMigrationSQL(ctx, tx, string(body)); err != nil {
			_ = tx.Rollback(ctx)
			return applied, fmt.Errorf("migrate %s: %w", name, err)
		}

		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, name); err != nil {
			_ = tx.Rollback(ctx)
			return applied, fmt.Errorf("record %s: %w", name, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return applied, fmt.Errorf("commit %s: %w", name, err)
		}
		applied = append(applied, name)
	}

	return applied, nil
}

// Status returns applied migration versions and expected filenames from the bundle.
func Status(ctx context.Context, databaseURL string) (applied []string, expected []string, err error) {
	expected, err = listMigrationFiles()
	if err != nil {
		return nil, nil, err
	}

	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, expected, fmt.Errorf("parse database url: %w", err)
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, expected, fmt.Errorf("connect: %w", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		return nil, expected, fmt.Errorf("ping: %w", err)
	}

	var exists bool
	err = pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations')`,
	).Scan(&exists)
	if err != nil || !exists {
		return nil, expected, nil
	}

	rows, err := pool.Query(ctx, `SELECT version FROM schema_migrations ORDER BY version`)
	if err != nil {
		return nil, expected, fmt.Errorf("list applied: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, expected, err
		}
		applied = append(applied, v)
	}
	return applied, expected, rows.Err()
}

func listMigrationFiles() ([]string, error) {
	entries, err := migrations.SQL.ReadDir(".")
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		n := e.Name()
		if strings.HasSuffix(strings.ToLower(n), ".sql") {
			names = append(names, n)
		}
	}
	sort.Strings(names)
	return names, nil
}

// stripSQLLineComments removes `--` to-end-of-line comments so naive `;` splitting does not
// treat semicolons inside comments as statement terminators (see migration 011 header).
func stripSQLLineComments(sql string) string {
	var b strings.Builder
	for _, line := range strings.Split(sql, "\n") {
		s := line
		if i := strings.Index(s, "--"); i >= 0 {
			s = s[:i]
		}
		b.WriteString(s)
		b.WriteByte('\n')
	}
	return b.String()
}

func execMigrationSQL(ctx context.Context, tx pgx.Tx, sql string) error {
	sql = strings.TrimSpace(stripSQLLineComments(sql))
	if sql == "" {
		return nil
	}
	parts := strings.Split(sql, ";")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if _, err := tx.Exec(ctx, part); err != nil {
			return err
		}
	}
	return nil
}
