package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
)

var (
	ErrShelfShareNotShared       = errors.New("this shelf is not shared")
	ErrShelfShareNoSelf          = errors.New("cannot share with yourself")
	ErrShelfShareNotMutualFriend = errors.New("you can only invite mutual friends to a shared shelf")
	ErrShelfShareNotVisible      = errors.New("shelf not found or not visible")
	ErrShelfShareAlreadyMember   = errors.New("you are already a member of this shelf")
	ErrShelfShareIsOwner         = errors.New("you already own this shelf")
)

type ShelfShareService struct {
	share    *repository.PostgresShelfShareRepository
	follow   *repository.PostgresFollowRepository
	notif    *repository.PostgresNotificationRepository
	coll     *repository.PostgresCollectionRepository
	lists    *repository.PostgresListRepository
	wishlist *repository.PostgresWishlistRepository
}

func NewShelfShareService(
	share *repository.PostgresShelfShareRepository,
	follow *repository.PostgresFollowRepository,
	notif *repository.PostgresNotificationRepository,
	coll *repository.PostgresCollectionRepository,
	lists *repository.PostgresListRepository,
	wishlist *repository.PostgresWishlistRepository,
) *ShelfShareService {
	return &ShelfShareService{
		share:    share,
		follow:   follow,
		notif:    notif,
		coll:     coll,
		lists:    lists,
		wishlist: wishlist,
	}
}

func (s *ShelfShareService) shelfVisibleToViewer(ctx context.Context, kind repository.ShelfKind, shelfID string, viewerID int64) error {
	v := viewerID
	switch kind {
	case repository.ShelfKindCollection:
		_, err := s.coll.GetByID(ctx, shelfID, &v)
		if err != nil {
			if errors.Is(err, repository.ErrCollectionNotFound) {
				return ErrShelfShareNotVisible
			}
			return err
		}
	case repository.ShelfKindList:
		_, err := s.lists.GetByIDForViewer(ctx, shelfID, viewerID)
		if err != nil {
			if errors.Is(err, repository.ErrListNotFound) {
				return ErrShelfShareNotVisible
			}
			return err
		}
	case repository.ShelfKindWishlist:
		_, err := s.wishlist.GetByIDForViewer(ctx, shelfID, viewerID)
		if err != nil {
			if errors.Is(err, repository.ErrWishlistNotFound) {
				return ErrShelfShareNotVisible
			}
			return err
		}
	default:
		return fmt.Errorf("invalid shelf kind")
	}
	return nil
}

func (s *ShelfShareService) accessRequestPayload(kind repository.ShelfKind, shelfID, shelfName string, requestID int64, flow string) (json.RawMessage, error) {
	p := map[string]interface{}{
		"shelf_kind": string(kind),
		"shelf_id":   shelfID,
		"shelf_name": shelfName,
		"request_id": requestID,
		"flow":       flow,
	}
	b, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return b, nil
}

// RequestJoin creates a pending join request for a shared shelf (recipient is the owner).
func (s *ShelfShareService) RequestJoin(ctx context.Context, viewerID int64, kind repository.ShelfKind, shelfID string) error {
	shelfID = strings.TrimSpace(shelfID)
	if shelfID == "" {
		return fmt.Errorf("invalid shelf id")
	}
	if err := s.shelfVisibleToViewer(ctx, kind, shelfID, viewerID); err != nil {
		return err
	}
	isShared, ownerID, name, err := s.share.LoadShelfShareMeta(ctx, kind, shelfID)
	if err != nil {
		return err
	}
	if ownerID < 1 {
		return ErrShelfShareNotVisible
	}
	if !isShared {
		return ErrShelfShareNotShared
	}
	if ownerID == viewerID {
		return ErrShelfShareIsOwner
	}
	member, err := s.share.IsMember(ctx, kind, shelfID, viewerID)
	if err != nil {
		return err
	}
	if member {
		return ErrShelfShareAlreadyMember
	}
	rid, err := s.share.InsertAccessRequest(ctx, kind, shelfID, "join_request", viewerID, ownerID)
	if err != nil {
		if errors.Is(err, repository.ErrShelfAccessPendingExists) {
			return repository.ErrShelfAccessPendingExists
		}
		return err
	}
	payload, err := s.accessRequestPayload(kind, shelfID, name, rid, "join_request")
	if err != nil {
		return err
	}
	return s.notif.InsertOne(ctx, ownerID, viewerID, models.NotificationKindShelfAccessRequest, payload)
}

// InviteToShelf sends invite requests from the shelf owner to mutual friends (recipient approves).
func (s *ShelfShareService) InviteToShelf(ctx context.Context, ownerID int64, kind repository.ShelfKind, shelfID string, inviteeIDs []int64) error {
	shelfID = strings.TrimSpace(shelfID)
	if len(inviteeIDs) == 0 {
		return nil
	}
	isShared, shelfOwner, name, err := s.share.LoadShelfShareMeta(ctx, kind, shelfID)
	if err != nil {
		return err
	}
	if shelfOwner != ownerID {
		return ErrShelfShareNotVisible
	}
	if !isShared {
		return ErrShelfShareNotShared
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
			return ErrShelfShareNoSelf
		}
		mutual, err := s.follow.AreMutualFollowers(ctx, ownerID, invitee)
		if err != nil {
			return err
		}
		if !mutual {
			return ErrShelfShareNotMutualFriend
		}
		member, err := s.share.IsMember(ctx, kind, shelfID, invitee)
		if err != nil {
			return err
		}
		if member {
			continue
		}
		rid, err := s.share.InsertAccessRequest(ctx, kind, shelfID, "invite", ownerID, invitee)
		if err != nil {
			if errors.Is(err, repository.ErrShelfAccessPendingExists) {
				continue
			}
			return err
		}
		payload, err := s.accessRequestPayload(kind, shelfID, name, rid, "invite")
		if err != nil {
			return err
		}
		if err := s.notif.InsertOne(ctx, invitee, ownerID, models.NotificationKindShelfAccessRequest, payload); err != nil {
			return err
		}
	}
	return nil
}

// ApproveRequest approves a pending shelf access request addressed to the current user.
func (s *ShelfShareService) ApproveRequest(ctx context.Context, recipientID int64, requestID int64) error {
	return s.share.ResolveAccessRequest(ctx, requestID, recipientID, true)
}

// DismissRequest dismisses a pending shelf access request addressed to the current user.
func (s *ShelfShareService) DismissRequest(ctx context.Context, recipientID int64, requestID int64) error {
	return s.share.ResolveAccessRequest(ctx, requestID, recipientID, false)
}
