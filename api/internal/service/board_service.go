package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
)

var (
	ErrBoardAccessDenied     = errors.New("board access denied")
	ErrBoardNotOwner         = errors.New("only the board owner may do that")
	ErrBoardPrivateInvite    = errors.New("invites are only for private boards")
	ErrBoardNotMutualFriend  = errors.New("can only invite mutual friends")
	ErrBoardCannotPost       = errors.New("you cannot post on this board")
	ErrBoardFlairNotAllowed  = errors.New("you cannot set flair on this thread")
	ErrBoardNotAuthor        = errors.New("only the thread or reply author may edit that content")
	ErrBoardThreadLocked     = errors.New("this thread is locked")
	ErrBoardCannotViewHistory = errors.New("you cannot view edit history on this thread")
	ErrBoardCannotLock        = errors.New("you cannot lock or unlock this thread")
)

const boardFlairLabelMax = 64

type BoardService struct {
	boards *repository.PostgresBoardRepository
	follow *repository.PostgresFollowRepository
	notif  *repository.PostgresNotificationRepository
}

func NewBoardService(
	boards *repository.PostgresBoardRepository,
	follow *repository.PostgresFollowRepository,
	notif *repository.PostgresNotificationRepository,
) *BoardService {
	return &BoardService{boards: boards, follow: follow, notif: notif}
}

func (s *BoardService) SuggestSlug(ctx context.Context, stem, excludeID string, alternate bool) (map[string]string, error) {
	stem = strings.TrimSpace(stem)
	if stem == "" {
		stem = "board"
	}
	base, err := validation.HitlistSlug(validation.HitlistSlugFromTitle(stem))
	if err != nil {
		return nil, err
	}
	candidate := base
	if alternate {
		candidate = base + "-" + validation.HitlistSlugCollisionSuffix(stem)
	}
	for attempt := 0; attempt < 8; attempt++ {
		taken, err := s.boards.SlugTaken(ctx, candidate, excludeID)
		if err != nil {
			return nil, err
		}
		if !taken {
			return map[string]string{"slug": candidate}, nil
		}
		candidate = base + "-" + validation.HitlistSlugCollisionSuffixAt(stem, attempt)
	}
	return nil, fmt.Errorf("could not find an available slug")
}

func parseBoardVisibility(s string) (models.BoardVisibility, error) {
	v := models.BoardVisibility(strings.ToLower(strings.TrimSpace(s)))
	if v == "" {
		return models.BoardVisibilityPublic, nil
	}
	if !v.Valid() {
		return "", fmt.Errorf("visibility must be public or private")
	}
	return v, nil
}

func (s *BoardService) Create(ctx context.Context, ownerID int64, name, description, visStr, slug string, inviteeIDs []int64) (*models.Board, error) {
	name, err := validation.CollectionOrWishlistName(name, "name")
	if err != nil {
		return nil, err
	}
	description, err = validation.CollectionDescription(description)
	if err != nil {
		return nil, err
	}
	vis, err := parseBoardVisibility(visStr)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(slug) == "" {
		slug = validation.HitlistSlugFromTitle(name)
	}
	slug, err = validation.HitlistSlug(slug)
	if err != nil {
		return nil, err
	}
	sug, err := s.SuggestSlug(ctx, slug, "", false)
	if err != nil {
		return nil, err
	}
	slug = sug["slug"]
	b, err := s.boards.Insert(ctx, ownerID, name, description, vis, slug)
	if err != nil {
		return nil, err
	}
	if vis == models.BoardVisibilityPrivate && len(inviteeIDs) > 0 {
		if err := s.Invite(ctx, ownerID, b.ID, inviteeIDs); err != nil {
			return nil, err
		}
	}
	v := ownerID
	return s.boards.GetByID(ctx, b.ID, &v)
}

func (s *BoardService) List(ctx context.Context, tab repository.BoardListTab, viewer int64, limit int) ([]models.Board, error) {
	if viewer < 1 {
		return nil, fmt.Errorf("sign in required")
	}
	return s.boards.List(ctx, tab, viewer, limit)
}

func (s *BoardService) ListDiscoverPublic(ctx context.Context, limit int) ([]models.Board, error) {
	return s.boards.List(ctx, repository.BoardListDiscover, 0, limit)
}

func (s *BoardService) ListPublicFeed(ctx context.Context, sort, q string, limit int, viewer *int64) ([]models.BoardFeedThread, error) {
	return s.boards.ListPublicFeed(ctx, sort, q, limit, viewer)
}

func (s *BoardService) Get(ctx context.Context, boardID string, viewer *int64) (*models.Board, error) {
	return s.boards.GetByID(ctx, boardID, viewer)
}

func (s *BoardService) GetBySlug(ctx context.Context, slug string, viewer *int64) (*models.Board, error) {
	return s.boards.GetBySlug(ctx, slug, viewer)
}

func (s *BoardService) Update(ctx context.Context, ownerID int64, boardID string, name, description, visStr, slug, banner, icon *string) (*models.Board, error) {
	owner, vis, _, err := s.boards.LoadBoardMeta(ctx, boardID)
	if err != nil {
		return nil, err
	}
	if owner != ownerID {
		return nil, ErrBoardNotOwner
	}
	var namePtr, descPtr *string
	if name != nil {
		n, err := validation.CollectionOrWishlistName(*name, "name")
		if err != nil {
			return nil, err
		}
		namePtr = &n
	}
	if description != nil {
		d, err := validation.CollectionDescription(*description)
		if err != nil {
			return nil, err
		}
		descPtr = &d
	}
	var visPtr *models.BoardVisibility
	if visStr != nil {
		v, err := parseBoardVisibility(*visStr)
		if err != nil {
			return nil, err
		}
		visPtr = &v
	}
	_ = vis
	var slugPtr *string
	if slug != nil {
		sl, err := validation.HitlistSlug(*slug)
		if err != nil {
			return nil, err
		}
		taken, err := s.boards.SlugTaken(ctx, sl, boardID)
		if err != nil {
			return nil, err
		}
		if taken {
			return nil, fmt.Errorf("slug already taken")
		}
		slugPtr = &sl
	}
	var bannerPtr, iconPtr *string
	setBanner, setIcon := false, false
	if banner != nil {
		setBanner = true
		n, err := validation.NormalizeCoverArtURLPointer(banner, "banner_url")
		if err != nil {
			return nil, err
		}
		bannerPtr = n
	}
	if icon != nil {
		setIcon = true
		n, err := validation.NormalizeCoverArtURLPointer(icon, "icon_url")
		if err != nil {
			return nil, err
		}
		iconPtr = n
	}
	return s.boards.Update(ctx, boardID, ownerID, namePtr, descPtr, visPtr, slugPtr, bannerPtr, iconPtr, setBanner, setIcon)
}

func (s *BoardService) Delete(ctx context.Context, ownerID int64, boardID string) error {
	owner, _, _, err := s.boards.LoadBoardMeta(ctx, boardID)
	if err != nil {
		return err
	}
	if owner != ownerID {
		return ErrBoardNotOwner
	}
	return s.boards.Delete(ctx, boardID, ownerID)
}

func (s *BoardService) Invite(ctx context.Context, ownerID int64, boardID string, inviteeIDs []int64) error {
	owner, vis, boardName, err := s.boards.LoadBoardMeta(ctx, boardID)
	if err != nil {
		return err
	}
	if owner != ownerID {
		return ErrBoardNotOwner
	}
	if vis != models.BoardVisibilityPrivate {
		return ErrBoardPrivateInvite
	}
	seen := make(map[int64]struct{})
	for _, invitee := range inviteeIDs {
		if invitee < 1 {
			continue
		}
		if _, ok := seen[invitee]; ok {
			continue
		}
		seen[invitee] = struct{}{}
		if invitee == ownerID {
			return fmt.Errorf("cannot invite yourself")
		}
		mutual, err := s.follow.AreMutualFollowers(ctx, ownerID, invitee)
		if err != nil {
			return err
		}
		if !mutual {
			return ErrBoardNotMutualFriend
		}
		member, err := s.boards.IsMember(ctx, boardID, invitee)
		if err != nil {
			return err
		}
		if member {
			continue
		}
		inviteID, err := s.boards.InsertInvite(ctx, boardID, ownerID, invitee)
		if err != nil {
			if errors.Is(err, repository.ErrBoardInvitePending) {
				continue
			}
			return err
		}
		if s.notif != nil {
			payload, _ := json.Marshal(map[string]interface{}{
				"board_id":   boardID,
				"board_name": boardName,
				"invite_id":  inviteID,
			})
			_ = s.notif.InsertOne(ctx, invitee, ownerID, models.NotificationKindBoardInvite, payload)
		}
	}
	return nil
}

func (s *BoardService) ListMyInvites(ctx context.Context, userID int64) ([]models.BoardInvite, error) {
	return s.boards.ListPendingInvitesForUser(ctx, userID)
}

func (s *BoardService) AcceptInvite(ctx context.Context, userID, inviteID int64) error {
	_, err := s.boards.ResolveInvite(ctx, inviteID, userID, true)
	return err
}

func (s *BoardService) DismissInvite(ctx context.Context, userID, inviteID int64) error {
	_, err := s.boards.ResolveInvite(ctx, inviteID, userID, false)
	return err
}

func (s *BoardService) requireCanPost(ctx context.Context, boardID string, userID int64) (*models.Board, error) {
	viewer := userID
	b, err := s.boards.GetByID(ctx, boardID, &viewer)
	if err != nil {
		return nil, err
	}
	if !b.MayPost {
		return nil, ErrBoardCannotPost
	}
	return b, nil
}

func parseBoardFlairLabel(label string) (string, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		return "", fmt.Errorf("flair label required")
	}
	if len(label) > boardFlairLabelMax {
		return "", fmt.Errorf("flair label too long")
	}
	return label, nil
}

func (s *BoardService) ListFlairs(ctx context.Context, boardID string, viewer *int64) ([]models.BoardFlair, error) {
	if _, err := s.boards.GetByID(ctx, boardID, viewer); err != nil {
		return nil, err
	}
	return s.boards.ListFlairs(ctx, boardID)
}

func (s *BoardService) CreateFlair(ctx context.Context, ownerID int64, boardID, label string) (*models.BoardFlair, error) {
	owner, _, _, err := s.boards.LoadBoardMeta(ctx, boardID)
	if err != nil {
		return nil, err
	}
	if owner != ownerID {
		return nil, ErrBoardNotOwner
	}
	label, err = parseBoardFlairLabel(label)
	if err != nil {
		return nil, err
	}
	return s.boards.InsertFlair(ctx, boardID, label)
}

func (s *BoardService) DeleteFlair(ctx context.Context, ownerID int64, boardID, flairID string) error {
	return s.boards.DeleteFlair(ctx, boardID, flairID, ownerID)
}

func (s *BoardService) SetThreadFlair(ctx context.Context, actorID int64, boardID, threadID string, flairID *string) (*models.BoardThread, error) {
	if _, err := s.boards.GetByID(ctx, boardID, &actorID); err != nil {
		return nil, err
	}
	t, err := s.boards.GetThread(ctx, boardID, threadID, &actorID)
	if err != nil {
		return nil, err
	}
	if !t.MaySetFlair {
		return nil, ErrBoardFlairNotAllowed
	}
	return s.boards.SetThreadFlair(ctx, boardID, threadID, actorID, flairID)
}

func (s *BoardService) ListThreads(ctx context.Context, boardID string, viewer *int64, limit int) ([]models.BoardThread, error) {
	if _, err := s.boards.GetByID(ctx, boardID, viewer); err != nil {
		return nil, err
	}
	return s.boards.ListThreads(ctx, boardID, viewer, limit)
}

func (s *BoardService) GetThread(ctx context.Context, boardID, threadID string, viewer *int64) (*models.BoardThread, error) {
	if _, err := s.boards.GetByID(ctx, boardID, viewer); err != nil {
		return nil, err
	}
	return s.boards.GetThread(ctx, boardID, threadID, viewer)
}

func (s *BoardService) CreateThread(ctx context.Context, boardID string, userID int64, title, body string) (*models.BoardThread, error) {
	if _, err := s.requireCanPost(ctx, boardID, userID); err != nil {
		return nil, err
	}
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, fmt.Errorf("title required")
	}
	if len(title) > 200 {
		return nil, fmt.Errorf("title too long")
	}
	body, err := validation.CollectionDescription(body)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(body) == "" {
		return nil, fmt.Errorf("body required")
	}
	t, err := s.boards.InsertThread(ctx, boardID, userID, title, body)
	if err != nil {
		return nil, err
	}
	return s.boards.GetThread(ctx, boardID, t.ID, &userID)
}

func (s *BoardService) DeleteThread(ctx context.Context, boardID, threadID string, actorID int64) error {
	if _, err := s.boards.GetByID(ctx, boardID, &actorID); err != nil {
		return err
	}
	return s.boards.DeleteThread(ctx, boardID, threadID, actorID)
}

func (s *BoardService) UpdateThreadContent(ctx context.Context, actorID int64, boardID, threadID string, title, body *string) (*models.BoardThread, error) {
	if title == nil && body == nil {
		return nil, fmt.Errorf("title or body required")
	}
	t, err := s.boards.GetThread(ctx, boardID, threadID, &actorID)
	if err != nil {
		return nil, err
	}
	if t.UserID != actorID {
		return nil, ErrBoardNotAuthor
	}
	nextTitle := t.Title
	if title != nil {
		nextTitle = strings.TrimSpace(*title)
		if nextTitle == "" {
			return nil, fmt.Errorf("title required")
		}
		if len(nextTitle) > 200 {
			return nil, fmt.Errorf("title too long")
		}
	}
	nextBody := t.Body
	if body != nil {
		b, err := validation.CollectionDescription(*body)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(b) == "" {
			return nil, fmt.Errorf("body required")
		}
		nextBody = b
	}
	return s.boards.UpdateThreadContent(ctx, boardID, threadID, actorID, nextTitle, nextBody)
}

func (s *BoardService) SetThreadLocked(ctx context.Context, actorID int64, boardID, threadID string, locked bool) (*models.BoardThread, error) {
	if _, err := s.boards.GetByID(ctx, boardID, &actorID); err != nil {
		return nil, err
	}
	t, err := s.boards.GetThread(ctx, boardID, threadID, &actorID)
	if err != nil {
		return nil, err
	}
	if !t.MayLock {
		return nil, ErrBoardCannotLock
	}
	return s.boards.SetThreadLocked(ctx, boardID, threadID, actorID, locked)
}

func (s *BoardService) ListThreadEdits(ctx context.Context, actorID int64, boardID, threadID string, limit int) ([]models.BoardThreadEdit, error) {
	if _, err := s.boards.GetByID(ctx, boardID, &actorID); err != nil {
		return nil, err
	}
	t, err := s.boards.GetThread(ctx, boardID, threadID, &actorID)
	if err != nil {
		return nil, err
	}
	if !t.MayViewHistory {
		return nil, ErrBoardCannotViewHistory
	}
	return s.boards.ListThreadEdits(ctx, threadID, limit)
}

func (s *BoardService) ListReplyEdits(ctx context.Context, actorID int64, boardID, threadID, replyID string, limit int) ([]models.BoardReplyEdit, error) {
	if _, err := s.boards.GetByID(ctx, boardID, &actorID); err != nil {
		return nil, err
	}
	t, err := s.boards.GetThread(ctx, boardID, threadID, &actorID)
	if err != nil {
		return nil, err
	}
	if !t.MayViewHistory {
		return nil, ErrBoardCannotViewHistory
	}
	replies, err := s.boards.ListReplies(ctx, boardID, threadID, &actorID, 1000)
	if err != nil {
		return nil, err
	}
	found := false
	for i := range replies {
		if replies[i].ID == replyID {
			found = true
			break
		}
	}
	if !found {
		return nil, repository.ErrBoardReplyNotFound
	}
	return s.boards.ListReplyEdits(ctx, replyID, limit)
}

func (s *BoardService) UpdateReplyBody(ctx context.Context, actorID int64, boardID, threadID, replyID string, body string) (*models.BoardReply, error) {
	if _, err := s.boards.GetByID(ctx, boardID, &actorID); err != nil {
		return nil, err
	}
	if _, err := s.boards.GetThread(ctx, boardID, threadID, &actorID); err != nil {
		return nil, err
	}
	body, err := validation.CollectionDescription(body)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(body) == "" {
		return nil, fmt.Errorf("body required")
	}
	replies, err := s.boards.ListReplies(ctx, boardID, threadID, &actorID, 1000)
	if err != nil {
		return nil, err
	}
	var target *models.BoardReply
	for i := range replies {
		if replies[i].ID == replyID {
			target = &replies[i]
			break
		}
	}
	if target == nil {
		return nil, repository.ErrBoardReplyNotFound
	}
	if target.UserID != actorID {
		return nil, ErrBoardNotAuthor
	}
	return s.boards.UpdateReplyBody(ctx, boardID, threadID, replyID, actorID, body)
}

func (s *BoardService) ListReplies(ctx context.Context, boardID, threadID string, viewer *int64, limit int) ([]models.BoardReply, error) {
	if _, err := s.boards.GetByID(ctx, boardID, viewer); err != nil {
		return nil, err
	}
	if _, err := s.boards.GetThread(ctx, boardID, threadID, viewer); err != nil {
		return nil, err
	}
	return s.boards.ListReplies(ctx, boardID, threadID, viewer, limit)
}

func (s *BoardService) CreateReply(ctx context.Context, boardID, threadID string, userID int64, body string, parentID *string) (*models.BoardReply, error) {
	if _, err := s.requireCanPost(ctx, boardID, userID); err != nil {
		return nil, err
	}
	t, err := s.boards.GetThread(ctx, boardID, threadID, &userID)
	if err != nil {
		return nil, err
	}
	if t.IsLocked {
		return nil, ErrBoardThreadLocked
	}
	body, err = validation.CollectionDescription(body)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(body) == "" {
		return nil, fmt.Errorf("body required")
	}
	var parentArg *string
	if parentID != nil && strings.TrimSpace(*parentID) != "" {
		pid := strings.TrimSpace(*parentID)
		ok, err := s.boards.ReplyExistsInThread(ctx, threadID, pid)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("parent reply not found")
		}
		parentArg = &pid
	}
	rep, err := s.boards.InsertReply(ctx, boardID, threadID, userID, body, parentArg, &userID)
	if err != nil {
		return nil, err
	}
	s.notifyBoardReply(ctx, userID, boardID, threadID, rep.ID, parentArg)
	return rep, nil
}

func (s *BoardService) DeleteReply(ctx context.Context, boardID, threadID, replyID string, actorID int64) error {
	if _, err := s.boards.GetByID(ctx, boardID, &actorID); err != nil {
		return err
	}
	return s.boards.DeleteReply(ctx, threadID, replyID, actorID)
}

func (s *BoardService) ListModerators(ctx context.Context, boardID string, viewer *int64) ([]models.BoardModerator, error) {
	if _, err := s.boards.GetByID(ctx, boardID, viewer); err != nil {
		return nil, err
	}
	return s.boards.ListModerators(ctx, boardID)
}

func (s *BoardService) AddModerators(ctx context.Context, ownerID int64, boardID string, userIDs []int64) error {
	owner, _, _, err := s.boards.LoadBoardMeta(ctx, boardID)
	if err != nil {
		return err
	}
	if owner != ownerID {
		return ErrBoardNotOwner
	}
	seen := make(map[int64]struct{})
	for _, uid := range userIDs {
		if uid < 1 {
			continue
		}
		if _, ok := seen[uid]; ok {
			continue
		}
		seen[uid] = struct{}{}
		if uid == ownerID {
			return fmt.Errorf("cannot add yourself as a moderator")
		}
		mutual, err := s.follow.AreMutualFollowers(ctx, ownerID, uid)
		if err != nil {
			return err
		}
		if !mutual {
			return ErrBoardNotMutualFriend
		}
		if err := s.boards.AddModerator(ctx, boardID, uid); err != nil {
			if errors.Is(err, repository.ErrBoardModeratorNotAdded) {
				continue
			}
			return err
		}
	}
	return nil
}

func (s *BoardService) RemoveModerator(ctx context.Context, ownerID int64, boardID string, moderatorID int64) error {
	owner, _, _, err := s.boards.LoadBoardMeta(ctx, boardID)
	if err != nil {
		return err
	}
	if owner != ownerID {
		return ErrBoardNotOwner
	}
	return s.boards.RemoveModerator(ctx, boardID, moderatorID)
}
