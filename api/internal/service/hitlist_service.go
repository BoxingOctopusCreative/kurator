package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/jackc/pgx/v5/pgconn"
)

// HitlistService extends ListService with v2 slug rules, votes, and comments.
type HitlistService struct {
	*ListService
	social *repository.PostgresHitlistSocialRepository
}

func NewHitlistService(base *ListService, social *repository.PostgresHitlistSocialRepository) *HitlistService {
	return &HitlistService{ListService: base, social: social}
}

// SlugSuggestion is the response shape for POST /api/v2/hitlists/slug-suggestions.
type SlugSuggestion struct {
	Stem      string `json:"stem"`
	Slug      string `json:"slug"`
	Available bool   `json:"available"`
	Suggested string `json:"suggested,omitempty"`
}

func (s *HitlistService) normalizeOptionalSlug(ctx context.Context, visibility models.Visibility, slug *string, excludeListID string) (*string, error) {
	if slug == nil || strings.TrimSpace(*slug) == "" {
		if visibility == models.VisibilityPublic {
			return nil, fmt.Errorf("public hitlists require a slug")
		}
		return nil, nil
	}
	norm, err := validation.HitlistSlug(*slug)
	if err != nil {
		return nil, err
	}
	taken, err := s.list.SlugInUse(ctx, norm, excludeListID)
	if err != nil {
		return nil, err
	}
	if taken {
		return nil, repository.ErrListSlugTaken
	}
	return &norm, nil
}

// CreateHitlist creates a list with optional slug / comments_enabled / entries_numbered (v2).
func (s *HitlistService) CreateHitlist(ctx context.Context, userID int64, name, desc string, vis *models.Visibility, isShared bool, slug *string, commentsEnabled *bool, entriesNumbered *bool) (*models.List, error) {
	v := models.DefaultVisibility
	if vis != nil && (*vis).Valid() {
		v = *vis
	}
	ns, err := s.normalizeOptionalSlug(ctx, v, slug, "")
	if err != nil {
		return nil, err
	}
	l, err := s.Create(ctx, userID, name, desc, &v, isShared, ns, commentsEnabled, entriesNumbered)
	if err == nil {
		return l, nil
	}
	var pe *pgconn.PgError
	if errors.As(err, &pe) && pe.Code == "23505" {
		return nil, repository.ErrListSlugTaken
	}
	return nil, err
}

// UpdateHitlist updates a list including optional slug, comments_enabled, and entries_numbered.
// When updateSlug is false, the slug column is left unchanged. When true, slugInput nil or empty clears the slug.
func (s *HitlistService) UpdateHitlist(ctx context.Context, userID int64, id, name, desc string, vis *models.Visibility, cover *string, isShared *bool, slugInput *string, updateSlug bool, commentsEnabled *bool, setComments bool, entriesNumbered *bool, setEntriesNumbered bool) (*models.List, error) {
	cur, err := s.list.GetByIDForUser(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	targetVis := cur.Visibility
	if vis != nil && (*vis).Valid() {
		targetVis = *vis
	}
	extra := &repository.ListUpdateExtras{}
	if updateSlug {
		extra.SetSlug = true
		if slugInput != nil && strings.TrimSpace(*slugInput) != "" {
			norm, err := validation.HitlistSlug(*slugInput)
			if err != nil {
				return nil, err
			}
			taken, err := s.list.SlugInUse(ctx, norm, id)
			if err != nil {
				return nil, err
			}
			if taken {
				return nil, repository.ErrListSlugTaken
			}
			extra.Slug = &norm
		} else {
			extra.Slug = nil
		}
	}
	var effectiveSlug *string
	if updateSlug {
		effectiveSlug = extra.Slug
	} else {
		effectiveSlug = cur.Slug
	}
	if targetVis == models.VisibilityPublic {
		if effectiveSlug == nil || strings.TrimSpace(*effectiveSlug) == "" {
			return nil, fmt.Errorf("public hitlists require a slug")
		}
	}
	if setComments && commentsEnabled != nil {
		extra.SetComments = true
		extra.CommentsEnabled = commentsEnabled
	}
	if setEntriesNumbered && entriesNumbered != nil {
		extra.SetEntriesNumbered = true
		extra.EntriesNumbered = entriesNumbered
	}
	l, err := s.Update(ctx, userID, id, name, desc, vis, cover, isShared, extra)
	if err != nil {
		var pe *pgconn.PgError
		if errors.As(err, &pe) && pe.Code == "23505" {
			return nil, repository.ErrListSlugTaken
		}
		return nil, err
	}
	return l, nil
}

// SuggestSlug checks availability and returns a deterministic alphanumeric suffix suggestion when taken.
func (s *HitlistService) SuggestSlug(ctx context.Context, stem, excludeListID string) (SlugSuggestion, error) {
	var out SlugSuggestion
	norm, err := validation.HitlistSlug(stem)
	if err != nil {
		return out, err
	}
	out.Stem = stem
	out.Slug = norm
	taken, err := s.list.SlugInUse(ctx, norm, excludeListID)
	if err != nil {
		return out, err
	}
	if !taken {
		out.Available = true
		return out, nil
	}
	out.Available = false
	suf := validation.HitlistSlugCollisionSuffix(norm)
	candidate := norm + "-" + suf
	inUse, err := s.list.SlugInUse(ctx, candidate, excludeListID)
	if err != nil {
		return out, err
	}
	if !inUse {
		out.Suggested = candidate
		return out, nil
	}
	for i := 0; i < 8; i++ {
		b := make([]byte, 4)
		if _, err := rand.Read(b); err != nil {
			continue
		}
		enc := base64.RawStdEncoding.EncodeToString(b)
		var alnum strings.Builder
		for _, c := range enc {
			if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') {
				alnum.WriteRune(c)
			}
		}
		tail := alnum.String()
		if len(tail) > 6 {
			tail = tail[:6]
		}
		candidate = norm + "-" + tail
		inUse, err = s.list.SlugInUse(ctx, candidate, excludeListID)
		if err != nil {
			return out, err
		}
		if !inUse {
			out.Suggested = candidate
			return out, nil
		}
	}
	out.Suggested = norm + "-pick-another"
	return out, nil
}

func (s *HitlistService) Vote(ctx context.Context, listID string, userID int64) error {
	if _, err := s.list.GetByIDForViewer(ctx, listID, userID); err != nil {
		return err
	}
	return s.social.VoteUpsert(ctx, listID, userID)
}

func (s *HitlistService) Unvote(ctx context.Context, listID string, userID int64) error {
	if _, err := s.list.GetByIDForViewer(ctx, listID, userID); err != nil {
		return err
	}
	return s.social.VoteDelete(ctx, listID, userID)
}

func (s *HitlistService) VoteStats(ctx context.Context, listID string, viewer *int64) (count int64, viewerVoted bool, err error) {
	if _, err := s.list.GetByIDVisible(ctx, listID, viewer); err != nil {
		return 0, false, err
	}
	return s.social.VoteStats(ctx, listID, viewer)
}

func (s *HitlistService) ListComments(ctx context.Context, listID string, viewer *int64, limit int) ([]models.HitlistComment, error) {
	l, err := s.list.GetByIDVisible(ctx, listID, viewer)
	if err != nil {
		return nil, err
	}
	if !l.CommentsEnabled {
		return []models.HitlistComment{}, nil
	}
	return s.social.ListComments(ctx, listID, limit)
}

func (s *HitlistService) AddComment(ctx context.Context, listID string, userID int64, body string) (*models.HitlistComment, error) {
	l, err := s.list.GetByIDForViewer(ctx, listID, userID)
	if err != nil {
		return nil, err
	}
	if !l.CommentsEnabled {
		return nil, fmt.Errorf("comments are disabled for this hitlist")
	}
	body, err = validation.CollectionDescription(body)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(body) == "" {
		return nil, fmt.Errorf("body required")
	}
	return s.social.InsertComment(ctx, listID, userID, body)
}

func (s *HitlistService) DeleteComment(ctx context.Context, listID, commentID string, actorUserID int64) error {
	if _, err := s.list.GetByIDForViewer(ctx, listID, actorUserID); err != nil {
		return err
	}
	return s.social.DeleteCommentIfAuthorOrListOwner(ctx, listID, commentID, actorUserID)
}
