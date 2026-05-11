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
	"github.com/spf13/afero"
)

// migrationFS exposes the bundled SQL migrations through an afero.Fs so that all file lookups in
// this package go through a single abstraction. The underlying source is still the compiled-in
// embed.FS — afero.FromIOFS is just a read-only adapter — so the deployed binary remains
// self-contained.
var migrationFS afero.Fs = afero.FromIOFS{FS: migrations.SQL}

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

		body, err := afero.ReadFile(migrationFS, name)
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

	applied, err = statusAppliedFromPool(ctx, pool)
	if err != nil {
		return nil, expected, err
	}
	return applied, expected, nil
}

// StatusWithExistingPool returns applied migration versions and expected filenames using an existing pool.
func StatusWithExistingPool(ctx context.Context, pool *pgxpool.Pool) (applied []string, expected []string, err error) {
	expected, err = listMigrationFiles()
	if err != nil {
		return nil, nil, err
	}
	applied, err = statusAppliedFromPool(ctx, pool)
	if err != nil {
		return nil, expected, err
	}
	return applied, expected, nil
}

func statusAppliedFromPool(ctx context.Context, pool *pgxpool.Pool) ([]string, error) {
	var exists bool
	err := pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations')`,
	).Scan(&exists)
	if err != nil || !exists {
		return nil, nil
	}

	rows, err := pool.Query(ctx, `SELECT version FROM schema_migrations ORDER BY version`)
	if err != nil {
		return nil, fmt.Errorf("list applied: %w", err)
	}
	defer rows.Close()
	var applied []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		applied = append(applied, v)
	}
	return applied, rows.Err()
}

func listMigrationFiles() ([]string, error) {
	entries, err := afero.ReadDir(migrationFS, ".")
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
	parts := splitMigrationStatements(sql)
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

// splitMigrationStatements splits on ';' outside SQL single-quoted strings and PostgreSQL
// dollar-quoted string literals ($$...$$ or $tag$...$tag$). Naive strings.Split breaks DO blocks
// and other dollar-quoted bodies that contain semicolons (see migration 025).
func splitMigrationStatements(sql string) []string {
	sql = strings.TrimSpace(sql)
	if sql == "" {
		return nil
	}
	var stmts []string
	var b strings.Builder
	for i := 0; i < len(sql); {
		switch sql[i] {
		case '\'':
			b.WriteByte('\'')
			i++
			for i < len(sql) {
				b.WriteByte(sql[i])
				if sql[i] == '\'' {
					if i+1 < len(sql) && sql[i+1] == '\'' {
						b.WriteByte('\'')
						i += 2
						continue
					}
					i++
					break
				}
				i++
			}
		case '$':
			start := i
			opener, afterOpen := readPgDollarQuoteOpener(sql, i)
			if opener == "" {
				b.WriteByte('$')
				i++
				continue
			}
			b.WriteString(sql[start:afterOpen])
			idx := strings.Index(sql[afterOpen:], opener)
			if idx < 0 {
				b.WriteString(sql[afterOpen:])
				i = len(sql)
				break
			}
			end := afterOpen + idx + len(opener)
			b.WriteString(sql[afterOpen:end])
			i = end
		case ';':
			s := strings.TrimSpace(b.String())
			if s != "" {
				stmts = append(stmts, s)
			}
			b.Reset()
			i++
		default:
			b.WriteByte(sql[i])
			i++
		}
	}
	if tail := strings.TrimSpace(b.String()); tail != "" {
		stmts = append(stmts, tail)
	}
	return stmts
}

// readPgDollarQuoteOpener returns the full opening delimiter (e.g. $$ or $body$) and the index
// after it, or ("", start) if position start is not the beginning of a dollar-quoted literal.
func readPgDollarQuoteOpener(s string, start int) (opener string, afterOpen int) {
	if start >= len(s) || s[start] != '$' {
		return "", start
	}
	j := start + 1
	for j < len(s) && s[j] != '$' {
		j++
	}
	if j >= len(s) {
		return "", start
	}
	return s[start : j+1], j + 1
}
