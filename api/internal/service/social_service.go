package service

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
)

type SocialService struct {
	users  *repository.PostgresUserRepository
	follow *repository.PostgresFollowRepository
	fanout *ActivityFanout
}

func NewSocialService(
	users *repository.PostgresUserRepository,
	follow *repository.PostgresFollowRepository,
	fanout *ActivityFanout,
) *SocialService {
	return &SocialService{users: users, follow: follow, fanout: fanout}
}

func isNumericUserRef(s string) bool {
	if len(s) == 0 || len(s) > 15 {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// ResolveUserRef resolves a profile URL segment to a user id (username first, then legacy numeric id).
func (s *SocialService) ResolveUserRef(ctx context.Context, ref string) (int64, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return 0, repository.ErrUserNotFound
	}
	id, err := s.users.GetIDByUsernameCI(ctx, ref)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, repository.ErrUserNotFound) {
		return 0, err
	}
	if isNumericUserRef(ref) {
		n, err := strconv.ParseInt(ref, 10, 64)
		if err == nil && n >= 1 {
			return n, nil
		}
	}
	return 0, repository.ErrUserNotFound
}

func (s *SocialService) SearchUsers(ctx context.Context, q string, excludeUserID *int64) ([]models.PublicUser, error) {
	q2, err := validation.SearchQuery(q, "Search")
	if err != nil {
		return nil, err
	}
	if q2 == "" {
		return []models.PublicUser{}, nil
	}
	return s.users.SearchPublic(ctx, q2, 20, excludeUserID)
}

func (s *SocialService) assertProfileVisible(ctx context.Context, userID int64, viewer *int64) error {
	_, isPublic, err := s.users.GetPublicByID(ctx, userID, nil)
	if err != nil {
		return err
	}
	if !isPublic && (viewer == nil || *viewer != userID) {
		return repository.ErrUserNotFound
	}
	return nil
}

func (s *SocialService) GetProfile(ctx context.Context, userID int64, viewer *int64) (*models.UserProfile, error) {
	u, isPublic, err := s.users.GetPublicByID(ctx, userID, viewer)
	if err != nil {
		return nil, err
	}
	if !isPublic && (viewer == nil || *viewer != userID) {
		return nil, repository.ErrUserNotFound
	}
	fc, err := s.follow.FollowerCount(ctx, userID)
	if err != nil {
		return nil, err
	}
	fg, err := s.follow.FollowingCount(ctx, userID)
	if err != nil {
		return nil, err
	}
	p := &models.UserProfile{
		PublicUser:      *u,
		ProfileIsPublic: isPublic,
		FollowerCount:   fc,
		FollowingCount:  fg,
	}
	if viewer != nil && *viewer != userID {
		ok, err := s.follow.IsFollowing(ctx, *viewer, userID)
		if err != nil {
			return nil, err
		}
		p.IsFollowing = &ok
	}
	return p, nil
}

func (s *SocialService) Follow(ctx context.Context, followerID, targetID int64) error {
	if followerID == targetID {
		return repository.ErrCannotFollowSelf
	}
	v := followerID
	if err := s.assertProfileVisible(ctx, targetID, &v); err != nil {
		return err
	}
	inserted, err := s.follow.Follow(ctx, followerID, targetID)
	if err != nil {
		return err
	}
	if inserted && s.fanout != nil {
		s.fanout.NotifyNewFollower(ctx, targetID, followerID)
	}
	return nil
}

func (s *SocialService) Unfollow(ctx context.Context, followerID, targetID int64) error {
	return s.follow.Unfollow(ctx, followerID, targetID)
}

func (s *SocialService) ListFollowers(ctx context.Context, userID int64, viewer *int64, page, limit int) ([]models.PublicUser, int64, error) {
	if err := s.assertProfileVisible(ctx, userID, viewer); err != nil {
		return nil, 0, err
	}
	if page < 1 {
		page = 1
	}
	if limit <= 0 || limit > 48 {
		limit = 24
	}
	offset := (page - 1) * limit
	return s.follow.ListFollowers(ctx, userID, limit, offset)
}

func (s *SocialService) ListFollowing(ctx context.Context, userID int64, viewer *int64, page, limit int) ([]models.PublicUser, int64, error) {
	if err := s.assertProfileVisible(ctx, userID, viewer); err != nil {
		return nil, 0, err
	}
	if page < 1 {
		page = 1
	}
	if limit <= 0 || limit > 48 {
		limit = 24
	}
	offset := (page - 1) * limit
	return s.follow.ListFollowing(ctx, userID, limit, offset)
}

// ListMyFriends returns mutual followers for the authenticated user only.
func (s *SocialService) ListMyFriends(ctx context.Context, viewerID int64, page, limit int) ([]models.PublicUser, int64, error) {
	if page < 1 {
		page = 1
	}
	if limit <= 0 || limit > 48 {
		limit = 24
	}
	offset := (page - 1) * limit
	return s.follow.ListMutualFriends(ctx, viewerID, limit, offset)
}

// ListPeopleYouMayKnow returns public profiles followed by the viewer's mutual friends,
// excluding the viewer and accounts the viewer already follows.
func (s *SocialService) ListPeopleYouMayKnow(ctx context.Context, viewerID int64, page, limit int) ([]models.PublicUser, int64, error) {
	if page < 1 {
		page = 1
	}
	if limit <= 0 || limit > 48 {
		limit = 24
	}
	offset := (page - 1) * limit
	return s.follow.ListPeopleYouMayKnow(ctx, viewerID, limit, offset)
}
