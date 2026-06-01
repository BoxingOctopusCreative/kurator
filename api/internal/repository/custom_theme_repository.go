package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrCustomThemeNotFound = errors.New("custom theme not found")
var ErrPublishedThemeNotFound = errors.New("published theme not found")
var ErrThemeLibraryNotFound = errors.New("theme library entry not found")
var ErrThemeLibraryAlreadyInstalled = errors.New("theme already in your library")

type CustomThemeRepository interface {
	GetUserTheme(ctx context.Context, userID int64) (*models.UserCustomTheme, error)
	UpsertUserTheme(ctx context.Context, row *models.UserCustomTheme) error
	DeleteUserTheme(ctx context.Context, userID int64) error
	CountUploadsSince(ctx context.Context, userID int64, since time.Time) (int, error)
	RecordUpload(ctx context.Context, userID int64) error
	ListPublished(ctx context.Context, query string, limit, offset int) ([]models.PublishedCustomTheme, int, error)
	GetPublishedByID(ctx context.Context, id uuid.UUID) (*models.PublishedCustomTheme, error)
	GetLatestPublishedVersion(ctx context.Context, themeFamilyID uuid.UUID) (int, error)
	InsertPublished(ctx context.Context, row *models.PublishedCustomTheme) error
	InsertReport(ctx context.Context, publishedThemeID uuid.UUID, reporterUserID int64, reason string) error
	AnonymizePublishedAuthors(ctx context.Context, userID int64) error
	UpsertOwnLibraryEntry(ctx context.Context, row *models.CustomThemeLibraryEntry) (*models.CustomThemeLibraryEntry, error)
	ListLibrary(ctx context.Context, userID int64) ([]models.CustomThemeLibraryEntry, error)
	GetLibraryEntry(ctx context.Context, userID int64, libraryID uuid.UUID) (*models.CustomThemeLibraryEntry, error)
	InsertLibraryEntry(ctx context.Context, row *models.CustomThemeLibraryEntry) (*models.CustomThemeLibraryEntry, error)
	DeleteOwnLibraryEntry(ctx context.Context, userID int64) error
	ListPublishedByFamilyAndAuthor(ctx context.Context, themeFamilyID uuid.UUID, authorUserID int64) ([]models.PublishedCustomTheme, error)
	CountPublishedByFamilyAndAuthor(ctx context.Context, themeFamilyID uuid.UUID, authorUserID int64) (int, error)
	DeletePublishedByFamilyAndAuthor(ctx context.Context, themeFamilyID uuid.UUID, authorUserID int64) error
	ListUsersWithActiveCustomThemeForUnpublish(ctx context.Context, ownerUserID int64, themeFamilyID uuid.UUID, publishedIDs []uuid.UUID) ([]int64, error)
	ListMarketplaceLibraryByPublishedIDs(ctx context.Context, publishedIDs []uuid.UUID) ([]models.CustomThemeLibraryEntry, error)
	DeleteMarketplaceLibraryByPublishedIDs(ctx context.Context, publishedIDs []uuid.UUID) error
	DeleteLibraryEntry(ctx context.Context, userID int64, libraryID uuid.UUID) error
}

type PostgresCustomThemeRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresCustomThemeRepository(pool *pgxpool.Pool) *PostgresCustomThemeRepository {
	return &PostgresCustomThemeRepository{pool: pool}
}

func (r *PostgresCustomThemeRepository) GetUserTheme(ctx context.Context, userID int64) (*models.UserCustomTheme, error) {
	var row models.UserCustomTheme
	err := r.pool.QueryRow(ctx, `
		SELECT user_id, theme_id, name, description, s3_key, created_at, updated_at
		FROM user_custom_themes WHERE user_id = $1
	`, userID).Scan(&row.UserID, &row.ThemeID, &row.Name, &row.Description, &row.S3Key, &row.CreatedAt, &row.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrCustomThemeNotFound
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *PostgresCustomThemeRepository) UpsertUserTheme(ctx context.Context, row *models.UserCustomTheme) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_custom_themes (user_id, theme_id, name, description, s3_key, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			theme_id = EXCLUDED.theme_id,
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			s3_key = EXCLUDED.s3_key,
			updated_at = NOW()
	`, row.UserID, row.ThemeID, row.Name, row.Description, row.S3Key)
	return err
}

func (r *PostgresCustomThemeRepository) DeleteUserTheme(ctx context.Context, userID int64) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM user_custom_themes WHERE user_id = $1`, userID)
	return err
}

func (r *PostgresCustomThemeRepository) CountUploadsSince(ctx context.Context, userID int64, since time.Time) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM custom_theme_upload_log
		WHERE user_id = $1 AND uploaded_at >= $2
	`, userID, since).Scan(&n)
	return n, err
}

func (r *PostgresCustomThemeRepository) RecordUpload(ctx context.Context, userID int64) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO custom_theme_upload_log (user_id) VALUES ($1)
	`, userID)
	return err
}

func (r *PostgresCustomThemeRepository) ListPublished(ctx context.Context, query string, limit, offset int) ([]models.PublishedCustomTheme, int, error) {
	query = strings.TrimSpace(query)
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	var total int
	var rows pgx.Rows
	var err error
	if query == "" {
		err = r.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM published_custom_themes`).Scan(&total)
		if err != nil {
			return nil, 0, err
		}
		rows, err = r.pool.Query(ctx, `
			SELECT id, theme_family_id, version, author_user_id, author_display_name, author_profile_url,
			       author_deleted, name, description, s3_key, created_at
			FROM published_custom_themes
			ORDER BY created_at DESC
			LIMIT $1 OFFSET $2
		`, limit, offset)
	} else {
		pattern := "%" + strings.ToLower(query) + "%"
		err = r.pool.QueryRow(ctx, `
			SELECT COUNT(*)::int FROM published_custom_themes
			WHERE LOWER(name) LIKE $1 OR LOWER(description) LIKE $1 OR LOWER(author_display_name) LIKE $1
		`, pattern).Scan(&total)
		if err != nil {
			return nil, 0, err
		}
		rows, err = r.pool.Query(ctx, `
			SELECT id, theme_family_id, version, author_user_id, author_display_name, author_profile_url,
			       author_deleted, name, description, s3_key, created_at
			FROM published_custom_themes
			WHERE LOWER(name) LIKE $1 OR LOWER(description) LIKE $1 OR LOWER(author_display_name) LIKE $1
			ORDER BY created_at DESC
			LIMIT $2 OFFSET $3
		`, pattern, limit, offset)
	}
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []models.PublishedCustomTheme
	for rows.Next() {
		var row models.PublishedCustomTheme
		if err := rows.Scan(
			&row.ID, &row.ThemeFamilyID, &row.Version, &row.AuthorUserID, &row.AuthorDisplayName, &row.AuthorProfileURL,
			&row.AuthorDeleted, &row.Name, &row.Description, &row.S3Key, &row.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, row)
	}
	return out, total, rows.Err()
}

func (r *PostgresCustomThemeRepository) GetPublishedByID(ctx context.Context, id uuid.UUID) (*models.PublishedCustomTheme, error) {
	var row models.PublishedCustomTheme
	err := r.pool.QueryRow(ctx, `
		SELECT id, theme_family_id, version, author_user_id, author_display_name, author_profile_url,
		       author_deleted, name, description, s3_key, created_at
		FROM published_custom_themes WHERE id = $1
	`, id).Scan(
		&row.ID, &row.ThemeFamilyID, &row.Version, &row.AuthorUserID, &row.AuthorDisplayName, &row.AuthorProfileURL,
		&row.AuthorDeleted, &row.Name, &row.Description, &row.S3Key, &row.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPublishedThemeNotFound
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *PostgresCustomThemeRepository) GetLatestPublishedVersion(ctx context.Context, themeFamilyID uuid.UUID) (int, error) {
	var version int
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(version), 0)::int FROM published_custom_themes WHERE theme_family_id = $1
	`, themeFamilyID).Scan(&version)
	return version, err
}

func (r *PostgresCustomThemeRepository) InsertPublished(ctx context.Context, row *models.PublishedCustomTheme) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO published_custom_themes (
			id, theme_family_id, version, author_user_id, author_display_name, author_profile_url,
			author_deleted, name, description, s3_key
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, row.ID, row.ThemeFamilyID, row.Version, row.AuthorUserID, row.AuthorDisplayName, row.AuthorProfileURL,
		row.AuthorDeleted, row.Name, row.Description, row.S3Key)
	return err
}

func (r *PostgresCustomThemeRepository) InsertReport(ctx context.Context, publishedThemeID uuid.UUID, reporterUserID int64, reason string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO custom_theme_reports (published_theme_id, reporter_user_id, reason)
		VALUES ($1, $2, $3)
		ON CONFLICT (published_theme_id, reporter_user_id) DO UPDATE SET reason = EXCLUDED.reason, status = 'pending'
	`, publishedThemeID, reporterUserID, reason)
	return err
}

func (r *PostgresCustomThemeRepository) AnonymizePublishedAuthors(ctx context.Context, userID int64) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE published_custom_themes
		SET author_user_id = NULL,
		    author_display_name = '[deleted]',
		    author_profile_url = NULL,
		    author_deleted = TRUE
		WHERE author_user_id = $1
	`, userID)
	return err
}

func (r *PostgresCustomThemeRepository) UpsertOwnLibraryEntry(ctx context.Context, row *models.CustomThemeLibraryEntry) (*models.CustomThemeLibraryEntry, error) {
	var out models.CustomThemeLibraryEntry
	err := r.pool.QueryRow(ctx, `
		INSERT INTO user_custom_theme_library (user_id, source, ref_id, name, description, s3_key)
		VALUES ($1, 'own', $2, $3, $4, $5)
		ON CONFLICT (user_id, source, ref_id) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			s3_key = EXCLUDED.s3_key
		RETURNING id, user_id, source, ref_id, name, description, s3_key, created_at
	`, row.UserID, row.RefID, row.Name, row.Description, row.S3Key).Scan(
		&out.ID, &out.UserID, &out.Source, &out.RefID, &out.Name, &out.Description, &out.S3Key, &out.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *PostgresCustomThemeRepository) ListLibrary(ctx context.Context, userID int64) ([]models.CustomThemeLibraryEntry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, source, ref_id, name, description, s3_key, created_at
		FROM user_custom_theme_library
		WHERE user_id = $1
		ORDER BY CASE source WHEN 'own' THEN 0 ELSE 1 END, created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.CustomThemeLibraryEntry
	for rows.Next() {
		var row models.CustomThemeLibraryEntry
		if err := rows.Scan(&row.ID, &row.UserID, &row.Source, &row.RefID, &row.Name, &row.Description, &row.S3Key, &row.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (r *PostgresCustomThemeRepository) GetLibraryEntry(ctx context.Context, userID int64, libraryID uuid.UUID) (*models.CustomThemeLibraryEntry, error) {
	var row models.CustomThemeLibraryEntry
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, source, ref_id, name, description, s3_key, created_at
		FROM user_custom_theme_library
		WHERE user_id = $1 AND id = $2
	`, userID, libraryID).Scan(&row.ID, &row.UserID, &row.Source, &row.RefID, &row.Name, &row.Description, &row.S3Key, &row.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrThemeLibraryNotFound
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *PostgresCustomThemeRepository) InsertLibraryEntry(ctx context.Context, row *models.CustomThemeLibraryEntry) (*models.CustomThemeLibraryEntry, error) {
	var out models.CustomThemeLibraryEntry
	err := r.pool.QueryRow(ctx, `
		INSERT INTO user_custom_theme_library (id, user_id, source, ref_id, name, description, s3_key)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, user_id, source, ref_id, name, description, s3_key, created_at
	`, row.ID, row.UserID, row.Source, row.RefID, row.Name, row.Description, row.S3Key).Scan(
		&out.ID, &out.UserID, &out.Source, &out.RefID, &out.Name, &out.Description, &out.S3Key, &out.CreatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrThemeLibraryAlreadyInstalled
		}
		return nil, err
	}
	return &out, nil
}

func (r *PostgresCustomThemeRepository) DeleteOwnLibraryEntry(ctx context.Context, userID int64) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM user_custom_theme_library WHERE user_id = $1 AND source = 'own'
	`, userID)
	return err
}

func (r *PostgresCustomThemeRepository) ListPublishedByFamilyAndAuthor(ctx context.Context, themeFamilyID uuid.UUID, authorUserID int64) ([]models.PublishedCustomTheme, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, theme_family_id, version, author_user_id, author_display_name, author_profile_url,
		       author_deleted, name, description, s3_key, created_at
		FROM published_custom_themes
		WHERE theme_family_id = $1 AND author_user_id = $2
		ORDER BY version DESC
	`, themeFamilyID, authorUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.PublishedCustomTheme
	for rows.Next() {
		var row models.PublishedCustomTheme
		if err := rows.Scan(
			&row.ID, &row.ThemeFamilyID, &row.Version, &row.AuthorUserID, &row.AuthorDisplayName, &row.AuthorProfileURL,
			&row.AuthorDeleted, &row.Name, &row.Description, &row.S3Key, &row.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (r *PostgresCustomThemeRepository) CountPublishedByFamilyAndAuthor(ctx context.Context, themeFamilyID uuid.UUID, authorUserID int64) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM published_custom_themes
		WHERE theme_family_id = $1 AND author_user_id = $2
	`, themeFamilyID, authorUserID).Scan(&n)
	return n, err
}

func (r *PostgresCustomThemeRepository) DeletePublishedByFamilyAndAuthor(ctx context.Context, themeFamilyID uuid.UUID, authorUserID int64) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM published_custom_themes
		WHERE theme_family_id = $1 AND author_user_id = $2
	`, themeFamilyID, authorUserID)
	return err
}

func (r *PostgresCustomThemeRepository) ListUsersWithActiveCustomThemeForUnpublish(
	ctx context.Context,
	ownerUserID int64,
	themeFamilyID uuid.UUID,
	publishedIDs []uuid.UUID,
) ([]int64, error) {
	if len(publishedIDs) == 0 {
		rows, err := r.pool.Query(ctx, `
			SELECT DISTINCT u.id
			FROM users u
			INNER JOIN user_custom_theme_library lib ON lib.id = u.active_custom_theme_library_id
			WHERE u.id = $1 AND lib.source = 'own' AND lib.ref_id = $2
		`, ownerUserID, themeFamilyID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		return scanInt64IDs(rows)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT u.id
		FROM users u
		INNER JOIN user_custom_theme_library lib ON lib.id = u.active_custom_theme_library_id
		WHERE (u.id = $1 AND lib.source = 'own' AND lib.ref_id = $2)
		   OR (lib.source = 'marketplace' AND lib.ref_id = ANY($3::uuid[]))
	`, ownerUserID, themeFamilyID, publishedIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanInt64IDs(rows)
}

func scanInt64IDs(rows pgx.Rows) ([]int64, error) {
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (r *PostgresCustomThemeRepository) ListMarketplaceLibraryByPublishedIDs(ctx context.Context, publishedIDs []uuid.UUID) ([]models.CustomThemeLibraryEntry, error) {
	if len(publishedIDs) == 0 {
		return nil, nil
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, source, ref_id, name, description, s3_key, created_at
		FROM user_custom_theme_library
		WHERE source = 'marketplace' AND ref_id = ANY($1::uuid[])
	`, publishedIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.CustomThemeLibraryEntry
	for rows.Next() {
		var row models.CustomThemeLibraryEntry
		if err := rows.Scan(&row.ID, &row.UserID, &row.Source, &row.RefID, &row.Name, &row.Description, &row.S3Key, &row.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (r *PostgresCustomThemeRepository) DeleteMarketplaceLibraryByPublishedIDs(ctx context.Context, publishedIDs []uuid.UUID) error {
	if len(publishedIDs) == 0 {
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		DELETE FROM user_custom_theme_library
		WHERE source = 'marketplace' AND ref_id = ANY($1::uuid[])
	`, publishedIDs)
	return err
}

func (r *PostgresCustomThemeRepository) DeleteLibraryEntry(ctx context.Context, userID int64, libraryID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM user_custom_theme_library WHERE user_id = $1 AND id = $2
	`, userID, libraryID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrThemeLibraryNotFound
	}
	return nil
}
