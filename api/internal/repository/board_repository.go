package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrBoardNotFound        = errors.New("board not found")
	ErrBoardThreadNotFound  = errors.New("board thread not found")
	ErrBoardReplyNotFound   = errors.New("board reply not found")
	ErrBoardFlairNotFound   = errors.New("board flair not found")
	ErrBoardInviteNotFound  = errors.New("board invite not found")
	ErrBoardInvitePending   = errors.New("a pending board invite already exists")
	ErrBoardInviteNotPending = errors.New("board invite is not pending")
	ErrBoardModeratorNotFound = errors.New("board moderator not found")
	ErrBoardModeratorNotAdded = errors.New("board moderator not added")
)

type PostgresBoardRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresBoardRepository(pool *pgxpool.Pool) *PostgresBoardRepository {
	return &PostgresBoardRepository{pool: pool}
}

const boardSelectCols = `
	b.id, b.owner_user_id, b.name, b.description, b.visibility, b.slug, b.banner_url, b.icon_url,
	b.created_at, b.updated_at,
	ou.username, ou.display_name, ou.avatar_url
`

func scanBoard(row pgx.Row) (*models.Board, error) {
	var b models.Board
	var vis string
	var banner, icon sql.NullString
	var ou, od, oa sql.NullString
	if err := row.Scan(
		&b.ID, &b.OwnerUserID, &b.Name, &b.Description, &vis, &b.Slug, &banner, &icon,
		&b.CreatedAt, &b.UpdatedAt,
		&ou, &od, &oa,
	); err != nil {
		return nil, err
	}
	b.Visibility = models.BoardVisibility(vis)
	if banner.Valid && banner.String != "" {
		s := banner.String
		b.BannerURL = &s
	}
	if icon.Valid && icon.String != "" {
		s := icon.String
		b.IconURL = &s
	}
	b.Owner = shelfAuthorPtr(ou, od, oa)
	return &b, nil
}

func (r *PostgresBoardRepository) SlugTaken(ctx context.Context, slug, excludeID string) (bool, error) {
	var taken bool
	q := `SELECT EXISTS (SELECT 1 FROM boards WHERE slug = $1`
	args := []any{slug}
	if excludeID != "" {
		q += ` AND id <> $2::uuid`
		args = append(args, excludeID)
	}
	q += `)`
	if err := r.pool.QueryRow(ctx, q, args...).Scan(&taken); err != nil {
		return false, fmt.Errorf("board slug taken: %w", err)
	}
	return taken, nil
}

func (r *PostgresBoardRepository) Insert(ctx context.Context, ownerID int64, name, description string, vis models.BoardVisibility, slug string) (*models.Board, error) {
	var id string
	err := r.pool.QueryRow(ctx, `
		INSERT INTO boards (owner_user_id, name, description, visibility, slug)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, ownerID, name, description, string(vis), slug).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("insert board: %w", err)
	}
	v := ownerID
	return r.GetByID(ctx, id, &v)
}

func (r *PostgresBoardRepository) IsModerator(ctx context.Context, boardID string, userID int64) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM board_moderators WHERE board_id = $1::uuid AND user_id = $2)
	`, boardID, userID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("board is moderator: %w", err)
	}
	return ok, nil
}

func (r *PostgresBoardRepository) AddModerator(ctx context.Context, boardID string, userID int64) error {
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO board_moderators (board_id, user_id)
		SELECT $1::uuid, $2
		WHERE EXISTS (SELECT 1 FROM boards WHERE id = $1::uuid AND owner_user_id <> $2)
		ON CONFLICT DO NOTHING
	`, boardID, userID)
	if err != nil {
		return fmt.Errorf("board add moderator: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrBoardModeratorNotAdded
	}
	return nil
}

func (r *PostgresBoardRepository) RemoveModerator(ctx context.Context, boardID string, userID int64) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM board_moderators WHERE board_id = $1::uuid AND user_id = $2
	`, boardID, userID)
	if err != nil {
		return fmt.Errorf("board remove moderator: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrBoardModeratorNotFound
	}
	return nil
}

func (r *PostgresBoardRepository) ListModerators(ctx context.Context, boardID string) ([]models.BoardModerator, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT m.board_id, m.user_id, m.created_at,
		       u.username, u.display_name, u.avatar_url
		FROM board_moderators m
		JOIN users u ON u.id = m.user_id
		WHERE m.board_id = $1::uuid
		ORDER BY m.created_at ASC
	`, boardID)
	if err != nil {
		return nil, fmt.Errorf("list board moderators: %w", err)
	}
	defer rows.Close()
	out := make([]models.BoardModerator, 0)
	for rows.Next() {
		var m models.BoardModerator
		var au, ad, av sql.NullString
		if err := rows.Scan(&m.BoardID, &m.UserID, &m.CreatedAt, &au, &ad, &av); err != nil {
			return nil, err
		}
		m.User = shelfAuthorPtr(au, ad, av)
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *PostgresBoardRepository) IsMember(ctx context.Context, boardID string, userID int64) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM board_members WHERE board_id = $1::uuid AND user_id = $2)
	`, boardID, userID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("board is member: %w", err)
	}
	return ok, nil
}

func (r *PostgresBoardRepository) AddMember(ctx context.Context, boardID string, userID int64) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO board_members (board_id, user_id) VALUES ($1::uuid, $2)
		ON CONFLICT DO NOTHING
	`, boardID, userID)
	if err != nil {
		return fmt.Errorf("board add member: %w", err)
	}
	return nil
}

func (r *PostgresBoardRepository) CanAccess(ctx context.Context, boardID string, viewer *int64) (bool, error) {
	var vis string
	var ownerID int64
	err := r.pool.QueryRow(ctx, `
		SELECT visibility, owner_user_id FROM boards WHERE id = $1::uuid
	`, boardID).Scan(&vis, &ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrBoardNotFound
	}
	if err != nil {
		return false, fmt.Errorf("board can access: %w", err)
	}
	if vis == string(models.BoardVisibilityPublic) {
		return true, nil
	}
	if viewer == nil || *viewer < 1 {
		return false, nil
	}
	if ownerID == *viewer {
		return true, nil
	}
	mod, err := r.IsModerator(ctx, boardID, *viewer)
	if err != nil {
		return false, err
	}
	if mod {
		return true, nil
	}
	member, err := r.IsMember(ctx, boardID, *viewer)
	if err != nil {
		return false, err
	}
	return member, nil
}

func (r *PostgresBoardRepository) GetByID(ctx context.Context, boardID string, viewer *int64) (*models.Board, error) {
	ok, err := r.CanAccess(ctx, boardID, viewer)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrBoardNotFound
	}
	row := r.pool.QueryRow(ctx, `SELECT `+boardSelectCols+` FROM boards b
		JOIN users ou ON ou.id = b.owner_user_id
		WHERE b.id = $1::uuid`, boardID)
	b, err := scanBoard(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrBoardNotFound
		}
		return nil, fmt.Errorf("get board: %w", err)
	}
	if err := r.enrichBoard(ctx, b, viewer); err != nil {
		return nil, err
	}
	return b, nil
}

func (r *PostgresBoardRepository) GetBySlug(ctx context.Context, slug string, viewer *int64) (*models.Board, error) {
	var id string
	err := r.pool.QueryRow(ctx, `SELECT id FROM boards WHERE slug = $1`, slug).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrBoardNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get board by slug: %w", err)
	}
	return r.GetByID(ctx, id, viewer)
}

func (r *PostgresBoardRepository) enrichBoard(ctx context.Context, b *models.Board, viewer *int64) error {
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*)::bigint FROM board_threads WHERE board_id = $1::uuid`, b.ID).Scan(&b.ThreadCount); err != nil {
		return fmt.Errorf("board thread count: %w", err)
	}
	if b.Visibility == models.BoardVisibilityPrivate {
		if err := r.pool.QueryRow(ctx, `
			SELECT 1 + COUNT(*)::bigint FROM board_members WHERE board_id = $1::uuid
		`, b.ID).Scan(&b.MemberCount); err != nil {
			return fmt.Errorf("board member count: %w", err)
		}
	}
	if viewer != nil && *viewer > 0 {
		switch {
		case b.OwnerUserID == *viewer:
			b.ViewerRole = "owner"
			b.MayManage = true
			b.MayPost = true
		default:
			mod, err := r.IsModerator(ctx, b.ID, *viewer)
			if err != nil {
				return err
			}
			if mod {
				b.ViewerRole = "moderator"
				b.MayPost = true
				break
			}
			member, err := r.IsMember(ctx, b.ID, *viewer)
			if err != nil {
				return err
			}
			if member {
				b.ViewerRole = "member"
				b.MayPost = true
			}
		}
		if b.Visibility == models.BoardVisibilityPublic && b.ViewerRole == "" && *viewer > 0 {
			b.MayPost = true
		}
	}
	return nil
}

type BoardListTab string

const (
	BoardListDiscover BoardListTab = "discover"
	BoardListMine     BoardListTab = "mine"
	BoardListMember   BoardListTab = "member"
)

func (r *PostgresBoardRepository) List(ctx context.Context, tab BoardListTab, viewer int64, limit int) ([]models.Board, error) {
	if limit < 1 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	var q string
	var args []any
	switch tab {
	case BoardListMine:
		q = `SELECT ` + boardSelectCols + ` FROM boards b
			JOIN users ou ON ou.id = b.owner_user_id
			WHERE b.owner_user_id = $1
			ORDER BY b.updated_at DESC LIMIT $2`
		args = []any{viewer, limit}
	case BoardListMember:
		q = `SELECT ` + boardSelectCols + ` FROM boards b
			JOIN users ou ON ou.id = b.owner_user_id
			JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $1
			WHERE b.visibility = 'private' AND b.owner_user_id <> $1
			ORDER BY b.updated_at DESC LIMIT $2`
		args = []any{viewer, limit}
	default:
		q = `SELECT ` + boardSelectCols + ` FROM boards b
			JOIN users ou ON ou.id = b.owner_user_id
			WHERE b.visibility = 'public'
			ORDER BY b.updated_at DESC LIMIT $1`
		args = []any{limit}
	}
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list boards: %w", err)
	}
	defer rows.Close()
	out := make([]models.Board, 0)
	for rows.Next() {
		b, err := scanBoard(rows)
		if err != nil {
			return nil, err
		}
		v := viewer
		if err := r.enrichBoard(ctx, b, &v); err != nil {
			return nil, err
		}
		out = append(out, *b)
	}
	return out, rows.Err()
}

func (r *PostgresBoardRepository) Update(ctx context.Context, boardID string, ownerID int64, name, description *string, vis *models.BoardVisibility, slug *string, banner, icon *string, setBanner, setIcon bool) (*models.Board, error) {
	sets := []string{"updated_at = NOW()"}
	args := []any{}
	n := 1
	if name != nil {
		sets = append(sets, fmt.Sprintf("name = $%d", n))
		args = append(args, *name)
		n++
	}
	if description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", n))
		args = append(args, *description)
		n++
	}
	if vis != nil {
		sets = append(sets, fmt.Sprintf("visibility = $%d", n))
		args = append(args, string(*vis))
		n++
	}
	if slug != nil {
		sets = append(sets, fmt.Sprintf("slug = $%d", n))
		args = append(args, *slug)
		n++
	}
	if setBanner {
		var bannerVal any
		if banner != nil && *banner != "" {
			bannerVal = *banner
		}
		sets = append(sets, fmt.Sprintf("banner_url = $%d", n))
		args = append(args, bannerVal)
		n++
	}
	if setIcon {
		var iconVal any
		if icon != nil && *icon != "" {
			iconVal = *icon
		}
		sets = append(sets, fmt.Sprintf("icon_url = $%d", n))
		args = append(args, iconVal)
		n++
	}
	if len(args) == 0 {
		return r.GetByID(ctx, boardID, &ownerID)
	}
	args = append(args, boardID, ownerID)
	q := fmt.Sprintf(`UPDATE boards SET %s WHERE id = $%d::uuid AND owner_user_id = $%d`, strings.Join(sets, ", "), n, n+1)
	tag, err := r.pool.Exec(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("update board: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrBoardNotFound
	}
	v := ownerID
	return r.GetByID(ctx, boardID, &v)
}

func (r *PostgresBoardRepository) Delete(ctx context.Context, boardID string, ownerID int64) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM boards WHERE id = $1::uuid AND owner_user_id = $2`, boardID, ownerID)
	if err != nil {
		return fmt.Errorf("delete board: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrBoardNotFound
	}
	return nil
}

func (r *PostgresBoardRepository) InsertInvite(ctx context.Context, boardID string, inviterID, inviteeID int64) (int64, error) {
	var id int64
	err := r.pool.QueryRow(ctx, `
		INSERT INTO board_invites (board_id, inviter_id, invitee_id)
		VALUES ($1::uuid, $2, $3)
		RETURNING id
	`, boardID, inviterID, inviteeID).Scan(&id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return 0, ErrBoardInvitePending
		}
		return 0, fmt.Errorf("insert board invite: %w", err)
	}
	return id, nil
}

func (r *PostgresBoardRepository) ListPendingInvitesForUser(ctx context.Context, inviteeID int64) ([]models.BoardInvite, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT i.id, i.board_id, b.name, i.inviter_id, i.invitee_id, i.status, i.created_at
		FROM board_invites i
		JOIN boards b ON b.id = i.board_id
		WHERE i.invitee_id = $1 AND i.status = 'pending'
		ORDER BY i.created_at DESC
	`, inviteeID)
	if err != nil {
		return nil, fmt.Errorf("list board invites: %w", err)
	}
	defer rows.Close()
	out := make([]models.BoardInvite, 0)
	for rows.Next() {
		var inv models.BoardInvite
		if err := rows.Scan(&inv.ID, &inv.BoardID, &inv.BoardName, &inv.InviterID, &inv.InviteeID, &inv.Status, &inv.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, rows.Err()
}

func (r *PostgresBoardRepository) ResolveInvite(ctx context.Context, inviteID, inviteeID int64, accept bool) (boardID string, err error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var status string
	var bid string
	err = tx.QueryRow(ctx, `
		SELECT status, board_id::text FROM board_invites
		WHERE id = $1 AND invitee_id = $2
	`, inviteID, inviteeID).Scan(&status, &bid)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrBoardInviteNotFound
	}
	if err != nil {
		return "", fmt.Errorf("resolve invite load: %w", err)
	}
	if status != "pending" {
		return "", ErrBoardInviteNotPending
	}
	newStatus := "dismissed"
	if accept {
		newStatus = "accepted"
	}
	tag, err := tx.Exec(ctx, `
		UPDATE board_invites SET status = $1, resolved_at = NOW()
		WHERE id = $2 AND invitee_id = $3 AND status = 'pending'
	`, newStatus, inviteID, inviteeID)
	if err != nil {
		return "", fmt.Errorf("resolve invite update: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return "", ErrBoardInviteNotFound
	}
	if accept {
		if _, err := tx.Exec(ctx, `
			INSERT INTO board_members (board_id, user_id) VALUES ($1::uuid, $2)
			ON CONFLICT DO NOTHING
		`, bid, inviteeID); err != nil {
			return "", fmt.Errorf("resolve invite member: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return bid, nil
}

const boardReplySelectCols = `
	r.id, r.thread_id, r.parent_reply_id, r.user_id, r.body, r.created_at, r.updated_at,
	u.username, u.display_name, u.avatar_url
`

func scanBoardReply(sc interface {
	Scan(dest ...any) error
}) (models.BoardReply, error) {
	var rep models.BoardReply
	var parent sql.NullString
	var au, ad, av sql.NullString
	if err := sc.Scan(
		&rep.ID, &rep.ThreadID, &parent, &rep.UserID, &rep.Body, &rep.CreatedAt, &rep.UpdatedAt,
		&au, &ad, &av,
	); err != nil {
		return rep, err
	}
	if parent.Valid {
		rep.ParentReplyID = &parent.String
	}
	rep.Author = shelfAuthorPtr(au, ad, av)
	return rep, nil
}

func scanBoardReplyWithEditFlag(sc interface {
	Scan(dest ...any) error
}) (models.BoardReply, bool, error) {
	var rep models.BoardReply
	var parent sql.NullString
	var au, ad, av sql.NullString
	var hasEdits bool
	if err := sc.Scan(
		&rep.ID, &rep.ThreadID, &parent, &rep.UserID, &rep.Body, &rep.CreatedAt, &rep.UpdatedAt,
		&au, &ad, &av, &hasEdits,
	); err != nil {
		return rep, false, err
	}
	if parent.Valid {
		rep.ParentReplyID = &parent.String
	}
	rep.Author = shelfAuthorPtr(au, ad, av)
	return rep, hasEdits, nil
}

const threadSelectCols = `
	t.id, t.board_id, t.user_id, t.title, t.body, t.flair_id, t.locked_at, t.created_at, t.updated_at,
	u.username, u.display_name, u.avatar_url,
	f.label AS flair_label,
	b.owner_user_id
`

func applyThreadViewerPerms(t *models.BoardThread, ownerID int64, viewer *int64, viewerIsModerator bool) {
	if viewer == nil || *viewer < 1 {
		return
	}
	if *viewer == t.UserID || *viewer == ownerID {
		t.MaySetFlair = true
	}
	if *viewer == t.UserID || *viewer == ownerID || viewerIsModerator {
		t.MayDelete = true
	}
	if *viewer == t.UserID {
		t.MayEdit = true
	}
	if *viewer == ownerID || viewerIsModerator {
		t.MayLock = true
		t.MayViewHistory = true
	}
}

func applyReplyViewerPerms(rep *models.BoardReply, ownerID int64, viewer *int64, viewerIsModerator bool) {
	if viewer == nil || *viewer < 1 {
		return
	}
	if *viewer == rep.UserID || *viewer == ownerID || viewerIsModerator {
		rep.MayDelete = true
	}
	if *viewer == rep.UserID {
		rep.MayEdit = true
	}
}

func viewerMayViewBoardEditHints(viewer *int64, ownerID int64, viewerIsModerator bool) bool {
	if viewer == nil || *viewer < 1 {
		return false
	}
	return *viewer == ownerID || viewerIsModerator
}

func boardAuthorTags(authorUserID, ownerUserID, threadAuthorUserID int64, modIDs map[int64]struct{}) []string {
	tags := make([]string, 0, 3)
	if authorUserID == ownerUserID {
		tags = append(tags, "OWNER")
	}
	if _, ok := modIDs[authorUserID]; ok {
		tags = append(tags, "MOD")
	}
	if authorUserID == threadAuthorUserID {
		tags = append(tags, "OP")
	}
	return tags
}

func (r *PostgresBoardRepository) moderatorIDSet(ctx context.Context, boardID string) (map[int64]struct{}, error) {
	rows, err := r.pool.Query(ctx, `SELECT user_id FROM board_moderators WHERE board_id = $1::uuid`, boardID)
	if err != nil {
		return nil, fmt.Errorf("board moderator ids: %w", err)
	}
	defer rows.Close()
	out := make(map[int64]struct{})
	for rows.Next() {
		var uid int64
		if err := rows.Scan(&uid); err != nil {
			return nil, err
		}
		out[uid] = struct{}{}
	}
	return out, rows.Err()
}

func scanThreadFields(
	t *models.BoardThread,
	flairID sql.NullString,
	flairLabel sql.NullString,
	lockedAt sql.NullTime,
	ownerID int64,
	au, ad, av sql.NullString,
	viewer *int64,
	viewerIsModerator bool,
	modIDs map[int64]struct{},
) {
	t.Author = shelfAuthorPtr(au, ad, av)
	if flairID.Valid {
		s := flairID.String
		t.FlairID = &s
	}
	if flairLabel.Valid {
		l := flairLabel.String
		t.FlairLabel = &l
	}
	if lockedAt.Valid {
		t.IsLocked = true
		t.LockedAt = &lockedAt.Time
	}
	t.AuthorTags = boardAuthorTags(t.UserID, ownerID, t.UserID, modIDs)
	applyThreadViewerPerms(t, ownerID, viewer, viewerIsModerator)
}

func (r *PostgresBoardRepository) ListFlairs(ctx context.Context, boardID string) ([]models.BoardFlair, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, board_id, label, sort_order, created_at
		FROM board_flairs
		WHERE board_id = $1::uuid
		ORDER BY sort_order ASC, label ASC
	`, boardID)
	if err != nil {
		return nil, fmt.Errorf("list board flairs: %w", err)
	}
	defer rows.Close()
	out := make([]models.BoardFlair, 0)
	for rows.Next() {
		var f models.BoardFlair
		if err := rows.Scan(&f.ID, &f.BoardID, &f.Label, &f.SortOrder, &f.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (r *PostgresBoardRepository) InsertFlair(ctx context.Context, boardID, label string) (*models.BoardFlair, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO board_flairs (board_id, label)
		VALUES ($1::uuid, $2)
		RETURNING id, board_id, label, sort_order, created_at
	`, boardID, label)
	var f models.BoardFlair
	if err := row.Scan(&f.ID, &f.BoardID, &f.Label, &f.SortOrder, &f.CreatedAt); err != nil {
		return nil, fmt.Errorf("insert board flair: %w", err)
	}
	return &f, nil
}

func (r *PostgresBoardRepository) DeleteFlair(ctx context.Context, boardID, flairID string, ownerID int64) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM board_flairs f
		USING boards b
		WHERE f.id = $1::uuid AND f.board_id = $2::uuid AND f.board_id = b.id AND b.owner_user_id = $3
	`, flairID, boardID, ownerID)
	if err != nil {
		return fmt.Errorf("delete board flair: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrBoardFlairNotFound
	}
	return nil
}

func (r *PostgresBoardRepository) SetThreadFlair(ctx context.Context, boardID, threadID string, actorID int64, flairID *string) (*models.BoardThread, error) {
	var flairArg any
	if flairID != nil && strings.TrimSpace(*flairID) != "" {
		flairArg = *flairID
	} else {
		flairArg = nil
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE board_threads t
		SET flair_id = $1::uuid, updated_at = NOW()
		FROM boards b
		WHERE t.id = $2::uuid AND t.board_id = $3::uuid AND t.board_id = b.id
		  AND (t.user_id = $4 OR b.owner_user_id = $4)
		  AND (
		    $1::uuid IS NULL
		    OR EXISTS (SELECT 1 FROM board_flairs f WHERE f.id = $1::uuid AND f.board_id = t.board_id)
		  )
	`, flairArg, threadID, boardID, actorID)
	if err != nil {
		return nil, fmt.Errorf("set thread flair: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrBoardThreadNotFound
	}
	return r.GetThread(ctx, boardID, threadID, &actorID)
}

// ErrInvalidBoardFeedSort is returned when the boards feed sort query parameter is not recognized.
var ErrInvalidBoardFeedSort = errors.New("invalid board feed sort")

func boardFeedOrderBy(sort string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(sort)) {
	case "newest":
		return "t.created_at DESC", nil
	case "oldest":
		return "t.created_at ASC", nil
	case "active":
		return "(SELECT COUNT(*)::bigint FROM board_replies r WHERE r.thread_id = t.id) DESC, t.updated_at DESC", nil
	case "updated", "":
		return "t.updated_at DESC", nil
	default:
		return "", ErrInvalidBoardFeedSort
	}
}

func (r *PostgresBoardRepository) ListPublicFeed(
	ctx context.Context,
	sort, q string,
	limit int,
	viewer *int64,
) ([]models.BoardFeedThread, error) {
	if limit < 1 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	orderBy, err := boardFeedOrderBy(sort)
	if err != nil {
		return nil, err
	}
	q = strings.TrimSpace(q)
	args := []any{}
	n := 1
	where := []string{"b.visibility = 'public'"}
	if q != "" {
		pat := "%" + q + "%"
		where = append(where, fmt.Sprintf(`(
			t.title ILIKE $%d OR t.body ILIKE $%d OR b.name ILIKE $%d
			OR u.username ILIKE $%d OR COALESCE(u.display_name, '') ILIKE $%d
		)`, n, n+1, n+2, n+3, n+4))
		args = append(args, pat, pat, pat, pat, pat)
		n += 5
	}
	args = append(args, limit)
	limitPh := fmt.Sprintf("$%d", n)

	query := fmt.Sprintf(`
		SELECT `+threadSelectCols+`,
			(SELECT COUNT(*)::bigint FROM board_replies r WHERE r.thread_id = t.id) AS reply_count,
			b.name, b.slug, b.icon_url
		FROM board_threads t
		JOIN boards b ON b.id = t.board_id
		JOIN users u ON u.id = t.user_id
		LEFT JOIN board_flairs f ON f.id = t.flair_id
		WHERE %s
		ORDER BY %s
		LIMIT %s
	`, strings.Join(where, " AND "), orderBy, limitPh)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list public board feed: %w", err)
	}
	defer rows.Close()
	out := make([]models.BoardFeedThread, 0)
	for rows.Next() {
		var item models.BoardFeedThread
		var flairID sql.NullString
		var flairLabel sql.NullString
		var lockedAt sql.NullTime
		var ownerID int64
		var au, ad, av sql.NullString
		var icon sql.NullString
		if err := rows.Scan(
			&item.ID, &item.BoardID, &item.UserID, &item.Title, &item.Body, &flairID, &lockedAt, &item.CreatedAt, &item.UpdatedAt,
			&au, &ad, &av, &flairLabel, &ownerID, &item.ReplyCount,
			&item.BoardName, &item.BoardSlug, &icon,
		); err != nil {
			return nil, err
		}
		if icon.Valid && icon.String != "" {
			item.BoardIconURL = &icon.String
		}
		scanThreadFields(&item.BoardThread, flairID, flairLabel, lockedAt, ownerID, au, ad, av, viewer, false, nil)
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *PostgresBoardRepository) ListThreads(ctx context.Context, boardID string, viewer *int64, limit int) ([]models.BoardThread, error) {
	if limit < 1 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	viewerIsModerator := false
	if viewer != nil && *viewer > 0 {
		mod, err := r.IsModerator(ctx, boardID, *viewer)
		if err != nil {
			return nil, err
		}
		viewerIsModerator = mod
	}
	modIDs, err := r.moderatorIDSet(ctx, boardID)
	if err != nil {
		return nil, err
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+threadSelectCols+`,
			(SELECT COUNT(*)::bigint FROM board_replies r WHERE r.thread_id = t.id) AS reply_count
		FROM board_threads t
		JOIN boards b ON b.id = t.board_id
		JOIN users u ON u.id = t.user_id
		LEFT JOIN board_flairs f ON f.id = t.flair_id
		WHERE t.board_id = $1::uuid
		ORDER BY t.created_at DESC
		LIMIT $2
	`, boardID, limit)
	if err != nil {
		return nil, fmt.Errorf("list board threads: %w", err)
	}
	defer rows.Close()
	out := make([]models.BoardThread, 0)
	for rows.Next() {
		var t models.BoardThread
		var flairID sql.NullString
		var flairLabel sql.NullString
		var lockedAt sql.NullTime
		var ownerID int64
		var au, ad, av sql.NullString
		if err := rows.Scan(
			&t.ID, &t.BoardID, &t.UserID, &t.Title, &t.Body, &flairID, &lockedAt, &t.CreatedAt, &t.UpdatedAt,
			&au, &ad, &av, &flairLabel, &ownerID, &t.ReplyCount,
		); err != nil {
			return nil, err
		}
		scanThreadFields(&t, flairID, flairLabel, lockedAt, ownerID, au, ad, av, viewer, viewerIsModerator, modIDs)
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *PostgresBoardRepository) GetThread(ctx context.Context, boardID, threadID string, viewer *int64) (*models.BoardThread, error) {
	viewerIsModerator := false
	if viewer != nil && *viewer > 0 {
		mod, err := r.IsModerator(ctx, boardID, *viewer)
		if err != nil {
			return nil, err
		}
		viewerIsModerator = mod
	}
	modIDs, err := r.moderatorIDSet(ctx, boardID)
	if err != nil {
		return nil, err
	}
	row := r.pool.QueryRow(ctx, `
		SELECT `+threadSelectCols+`,
			(SELECT COUNT(*)::bigint FROM board_replies r WHERE r.thread_id = t.id) AS reply_count
		FROM board_threads t
		JOIN boards b ON b.id = t.board_id
		JOIN users u ON u.id = t.user_id
		LEFT JOIN board_flairs f ON f.id = t.flair_id
		WHERE t.id = $1::uuid AND t.board_id = $2::uuid
	`, threadID, boardID)
	var t models.BoardThread
	var flairID sql.NullString
	var flairLabel sql.NullString
	var lockedAt sql.NullTime
	var ownerID int64
	var au, ad, av sql.NullString
	if err := row.Scan(
		&t.ID, &t.BoardID, &t.UserID, &t.Title, &t.Body, &flairID, &lockedAt, &t.CreatedAt, &t.UpdatedAt,
		&au, &ad, &av, &flairLabel, &ownerID, &t.ReplyCount,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrBoardThreadNotFound
		}
		return nil, fmt.Errorf("get board thread: %w", err)
	}
	scanThreadFields(&t, flairID, flairLabel, lockedAt, ownerID, au, ad, av, viewer, viewerIsModerator, modIDs)
	return &t, nil
}

func (r *PostgresBoardRepository) InsertThread(ctx context.Context, boardID string, userID int64, title, body string) (*models.BoardThread, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO board_threads (board_id, user_id, title, body)
		VALUES ($1::uuid, $2, $3, $4)
		RETURNING id, board_id, user_id, title, body, created_at, updated_at
	`, boardID, userID, title, body)
	var t models.BoardThread
	if err := row.Scan(&t.ID, &t.BoardID, &t.UserID, &t.Title, &t.Body, &t.CreatedAt, &t.UpdatedAt); err != nil {
		return nil, fmt.Errorf("insert board thread: %w", err)
	}
	return &t, nil
}

func (r *PostgresBoardRepository) DeleteThread(ctx context.Context, boardID, threadID string, actorID int64) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM board_threads t
		USING boards b
		WHERE t.id = $1::uuid AND t.board_id = $2::uuid AND t.board_id = b.id
		  AND (
		    t.user_id = $3
		    OR b.owner_user_id = $3
		    OR EXISTS (SELECT 1 FROM board_moderators m WHERE m.board_id = b.id AND m.user_id = $3)
		  )
	`, threadID, boardID, actorID)
	if err != nil {
		return fmt.Errorf("delete board thread: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrBoardThreadNotFound
	}
	return nil
}

func (r *PostgresBoardRepository) SetThreadLocked(ctx context.Context, boardID, threadID string, actorID int64, locked bool) (*models.BoardThread, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE board_threads t
		SET locked_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
		    locked_by_user_id = CASE WHEN $1 THEN $2 ELSE NULL END,
		    updated_at = NOW()
		FROM boards b
		WHERE t.id = $3::uuid AND t.board_id = $4::uuid AND t.board_id = b.id
		  AND (
		    b.owner_user_id = $2
		    OR EXISTS (SELECT 1 FROM board_moderators m WHERE m.board_id = b.id AND m.user_id = $2)
		  )
	`, locked, actorID, threadID, boardID)
	if err != nil {
		return nil, fmt.Errorf("set board thread locked: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrBoardThreadNotFound
	}
	return r.GetThread(ctx, boardID, threadID, &actorID)
}

func (r *PostgresBoardRepository) UpdateThreadContent(ctx context.Context, boardID, threadID string, authorID int64, title, body string) (*models.BoardThread, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("update board thread begin: %w", err)
	}
	defer tx.Rollback(ctx)

	var oldTitle, oldBody string
	err = tx.QueryRow(ctx, `
		SELECT title, body FROM board_threads
		WHERE id = $1::uuid AND board_id = $2::uuid AND user_id = $3
	`, threadID, boardID, authorID).Scan(&oldTitle, &oldBody)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrBoardThreadNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("update board thread read: %w", err)
	}
	if oldTitle != title || oldBody != body {
		if _, err := tx.Exec(ctx, `
			INSERT INTO board_thread_edits (thread_id, editor_user_id, title, body)
			VALUES ($1::uuid, $2, $3, $4)
		`, threadID, authorID, oldTitle, oldBody); err != nil {
			return nil, fmt.Errorf("insert board thread edit: %w", err)
		}
	}
	tag, err := tx.Exec(ctx, `
		UPDATE board_threads t
		SET title = $1, body = $2, updated_at = NOW()
		WHERE t.id = $3::uuid AND t.board_id = $4::uuid AND t.user_id = $5
	`, title, body, threadID, boardID, authorID)
	if err != nil {
		return nil, fmt.Errorf("update board thread: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrBoardThreadNotFound
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("update board thread commit: %w", err)
	}
	return r.GetThread(ctx, boardID, threadID, &authorID)
}

func (r *PostgresBoardRepository) UpdateReplyBody(ctx context.Context, boardID, threadID, replyID string, authorID int64, body string) (*models.BoardReply, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("update board reply begin: %w", err)
	}
	defer tx.Rollback(ctx)

	var oldBody string
	err = tx.QueryRow(ctx, `
		SELECT r.body
		FROM board_replies r
		JOIN board_threads t ON t.id = r.thread_id
		WHERE r.id = $1::uuid AND r.thread_id = $2::uuid AND t.board_id = $3::uuid AND r.user_id = $4
	`, replyID, threadID, boardID, authorID).Scan(&oldBody)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrBoardReplyNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("update board reply read: %w", err)
	}
	if oldBody != body {
		if _, err := tx.Exec(ctx, `
			INSERT INTO board_reply_edits (reply_id, editor_user_id, body)
			VALUES ($1::uuid, $2, $3)
		`, replyID, authorID, oldBody); err != nil {
			return nil, fmt.Errorf("insert board reply edit: %w", err)
		}
	}
	tag, err := tx.Exec(ctx, `
		UPDATE board_replies r
		SET body = $1, updated_at = NOW()
		FROM board_threads t
		WHERE r.id = $2::uuid AND r.thread_id = $3::uuid AND r.thread_id = t.id AND t.board_id = $4::uuid AND r.user_id = $5
	`, body, replyID, threadID, boardID, authorID)
	if err != nil {
		return nil, fmt.Errorf("update board reply: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrBoardReplyNotFound
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("update board reply commit: %w", err)
	}
	viewer := authorID
	replies, err := r.ListReplies(ctx, boardID, threadID, &viewer, 1000)
	if err != nil {
		return nil, err
	}
	for i := range replies {
		if replies[i].ID == replyID {
			return &replies[i], nil
		}
	}
	return nil, ErrBoardReplyNotFound
}

func (r *PostgresBoardRepository) ListReplies(ctx context.Context, boardID, threadID string, viewer *int64, limit int) ([]models.BoardReply, error) {
	if limit < 1 {
		limit = 200
	}
	var ownerID int64
	var threadAuthorID int64
	err := r.pool.QueryRow(ctx, `
		SELECT b.owner_user_id, t.user_id
		FROM board_threads t
		JOIN boards b ON b.id = t.board_id
		WHERE t.id = $1::uuid AND t.board_id = $2::uuid
	`, threadID, boardID).Scan(&ownerID, &threadAuthorID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrBoardThreadNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("list board replies meta: %w", err)
	}
	viewerIsModerator := false
	if viewer != nil && *viewer > 0 {
		mod, err := r.IsModerator(ctx, boardID, *viewer)
		if err != nil {
			return nil, err
		}
		viewerIsModerator = mod
	}
	modIDs, err := r.moderatorIDSet(ctx, boardID)
	if err != nil {
		return nil, err
	}
	showEditHints := viewerMayViewBoardEditHints(viewer, ownerID, viewerIsModerator)
	rows, err := r.pool.Query(ctx, `
		SELECT `+boardReplySelectCols+`,
			EXISTS (SELECT 1 FROM board_reply_edits e WHERE e.reply_id = r.id) AS has_edits
		FROM board_replies r
		JOIN users u ON u.id = r.user_id
		WHERE r.thread_id = $1::uuid
		ORDER BY r.created_at ASC
		LIMIT $2
	`, threadID, limit)
	if err != nil {
		return nil, fmt.Errorf("list board replies: %w", err)
	}
	defer rows.Close()
	out := make([]models.BoardReply, 0)
	for rows.Next() {
		rep, hasEdits, err := scanBoardReplyWithEditFlag(rows)
		if err != nil {
			return nil, err
		}
		applyReplyViewerPerms(&rep, ownerID, viewer, viewerIsModerator)
		if showEditHints && hasEdits {
			rep.IsEdited = true
		}
		rep.AuthorTags = boardAuthorTags(rep.UserID, ownerID, threadAuthorID, modIDs)
		out = append(out, rep)
	}
	return out, rows.Err()
}

func (r *PostgresBoardRepository) LoadThreadNotificationMeta(
	ctx context.Context,
	boardID, threadID string,
) (ownerID int64, slug, boardName, threadTitle string, threadAuthorID int64, err error) {
	err = r.pool.QueryRow(ctx, `
		SELECT b.owner_user_id, b.slug, b.name, t.title, t.user_id
		FROM board_threads t
		JOIN boards b ON b.id = t.board_id
		WHERE t.id = $1::uuid AND t.board_id = $2::uuid
	`, threadID, boardID).Scan(&ownerID, &slug, &boardName, &threadTitle, &threadAuthorID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, "", "", "", 0, ErrBoardThreadNotFound
	}
	if err != nil {
		return 0, "", "", "", 0, fmt.Errorf("load thread notification meta: %w", err)
	}
	return ownerID, slug, boardName, threadTitle, threadAuthorID, nil
}

func (r *PostgresBoardRepository) ListThreadParticipantUserIDs(ctx context.Context, threadID string) ([]int64, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT user_id
		FROM board_replies
		WHERE thread_id = $1::uuid
		ORDER BY user_id
	`, threadID)
	if err != nil {
		return nil, fmt.Errorf("list thread participant user ids: %w", err)
	}
	defer rows.Close()
	out := make([]int64, 0)
	for rows.Next() {
		var uid int64
		if err := rows.Scan(&uid); err != nil {
			return nil, err
		}
		out = append(out, uid)
	}
	return out, rows.Err()
}

func (r *PostgresBoardRepository) GetReplyUserID(ctx context.Context, threadID, replyID string) (int64, error) {
	var uid int64
	err := r.pool.QueryRow(ctx, `
		SELECT user_id FROM board_replies WHERE id = $1::uuid AND thread_id = $2::uuid
	`, replyID, threadID).Scan(&uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrBoardReplyNotFound
	}
	if err != nil {
		return 0, fmt.Errorf("get board reply user id: %w", err)
	}
	return uid, nil
}

func (r *PostgresBoardRepository) ReplyExistsInThread(ctx context.Context, threadID, replyID string) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM board_replies WHERE id = $1::uuid AND thread_id = $2::uuid)
	`, replyID, threadID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("board reply exists: %w", err)
	}
	return ok, nil
}

func (r *PostgresBoardRepository) InsertReply(ctx context.Context, boardID, threadID string, userID int64, body string, parentID *string, viewer *int64) (*models.BoardReply, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO board_replies (thread_id, user_id, body, parent_reply_id)
		VALUES ($1::uuid, $2, $3, $4::uuid)
		RETURNING id, thread_id, parent_reply_id, user_id, body, created_at, updated_at,
		          (SELECT username FROM users u WHERE u.id = $2),
		          (SELECT display_name FROM users u WHERE u.id = $2),
		          (SELECT avatar_url FROM users u WHERE u.id = $2)
	`, threadID, userID, body, parentID)
	rep, err := scanBoardReply(row)
	if err != nil {
		return nil, fmt.Errorf("insert board reply: %w", err)
	}
	if _, err := r.pool.Exec(ctx, `UPDATE board_threads SET updated_at = NOW() WHERE id = $1::uuid`, threadID); err != nil {
		return nil, fmt.Errorf("touch thread updated_at: %w", err)
	}
	var ownerID int64
	var threadAuthorID int64
	err = r.pool.QueryRow(ctx, `
		SELECT b.owner_user_id, t.user_id
		FROM board_threads t
		JOIN boards b ON b.id = t.board_id
		WHERE t.id = $1::uuid AND t.board_id = $2::uuid
	`, threadID, boardID).Scan(&ownerID, &threadAuthorID)
	if err != nil {
		return nil, fmt.Errorf("insert board reply meta: %w", err)
	}
	viewerIsModerator := false
	if viewer != nil && *viewer > 0 {
		mod, err := r.IsModerator(ctx, boardID, *viewer)
		if err != nil {
			return nil, err
		}
		viewerIsModerator = mod
	}
	modIDs, err := r.moderatorIDSet(ctx, boardID)
	if err != nil {
		return nil, err
	}
	applyReplyViewerPerms(&rep, ownerID, viewer, viewerIsModerator)
	rep.AuthorTags = boardAuthorTags(rep.UserID, ownerID, threadAuthorID, modIDs)
	return &rep, nil
}

func (r *PostgresBoardRepository) DeleteReply(ctx context.Context, threadID, replyID string, actorID int64) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM board_replies r
		USING board_threads t, boards b
		WHERE r.id = $1::uuid AND r.thread_id = $2::uuid AND r.thread_id = t.id AND t.board_id = b.id
		  AND (
		    r.user_id = $3
		    OR b.owner_user_id = $3
		    OR EXISTS (SELECT 1 FROM board_moderators m WHERE m.board_id = b.id AND m.user_id = $3)
		  )
	`, replyID, threadID, actorID)
	if err != nil {
		return fmt.Errorf("delete board reply: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrBoardReplyNotFound
	}
	if _, err := r.pool.Exec(ctx, `UPDATE board_threads SET updated_at = NOW() WHERE id = $1::uuid`, threadID); err != nil {
		return fmt.Errorf("touch thread updated_at: %w", err)
	}
	return nil
}

func (r *PostgresBoardRepository) ListThreadEdits(ctx context.Context, threadID string, limit int) ([]models.BoardThreadEdit, error) {
	if limit < 1 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx, `
		SELECT e.id, e.thread_id, e.editor_user_id, e.title, e.body, e.created_at,
		       u.username, u.display_name, u.avatar_url
		FROM board_thread_edits e
		JOIN users u ON u.id = e.editor_user_id
		WHERE e.thread_id = $1::uuid
		ORDER BY e.created_at DESC
		LIMIT $2
	`, threadID, limit)
	if err != nil {
		return nil, fmt.Errorf("list board thread edits: %w", err)
	}
	defer rows.Close()
	out := make([]models.BoardThreadEdit, 0)
	for rows.Next() {
		var e models.BoardThreadEdit
		var au, ad, av sql.NullString
		if err := rows.Scan(
			&e.ID, &e.ThreadID, &e.EditorUserID, &e.Title, &e.Body, &e.CreatedAt,
			&au, &ad, &av,
		); err != nil {
			return nil, err
		}
		e.Editor = shelfAuthorPtr(au, ad, av)
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *PostgresBoardRepository) ListReplyEdits(ctx context.Context, replyID string, limit int) ([]models.BoardReplyEdit, error) {
	if limit < 1 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx, `
		SELECT e.id, e.reply_id, e.editor_user_id, e.body, e.created_at,
		       u.username, u.display_name, u.avatar_url
		FROM board_reply_edits e
		JOIN users u ON u.id = e.editor_user_id
		WHERE e.reply_id = $1::uuid
		ORDER BY e.created_at DESC
		LIMIT $2
	`, replyID, limit)
	if err != nil {
		return nil, fmt.Errorf("list board reply edits: %w", err)
	}
	defer rows.Close()
	out := make([]models.BoardReplyEdit, 0)
	for rows.Next() {
		var e models.BoardReplyEdit
		var au, ad, av sql.NullString
		if err := rows.Scan(
			&e.ID, &e.ReplyID, &e.EditorUserID, &e.Body, &e.CreatedAt,
			&au, &ad, &av,
		); err != nil {
			return nil, err
		}
		e.Editor = shelfAuthorPtr(au, ad, av)
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *PostgresBoardRepository) LoadBoardMeta(ctx context.Context, boardID string) (ownerID int64, vis models.BoardVisibility, name string, err error) {
	var visStr string
	err = r.pool.QueryRow(ctx, `
		SELECT owner_user_id, visibility, name FROM boards WHERE id = $1::uuid
	`, boardID).Scan(&ownerID, &visStr, &name)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, "", "", ErrBoardNotFound
	}
	if err != nil {
		return 0, "", "", fmt.Errorf("load board meta: %w", err)
	}
	return ownerID, models.BoardVisibility(visStr), name, nil
}
