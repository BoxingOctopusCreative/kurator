package service

import (
	"context"
	"encoding/json"
	"log"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
)

// ActivityFanout emits in-app notifications to users who follow the actor and are allowed
// by the shelf visibility (followers vs friends-only mutuals). Private shelves emit nothing.
type ActivityFanout struct {
	notif *repository.PostgresNotificationRepository
}

func NewActivityFanout(notif *repository.PostgresNotificationRepository) *ActivityFanout {
	return &ActivityFanout{notif: notif}
}

func (f *ActivityFanout) insert(ctx context.Context, actorID int64, visibility models.Visibility, kind string, payload map[string]any) {
	if f == nil || f.notif == nil {
		return
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		log.Printf("activity fanout: marshal payload: %v", err)
		return
	}
	if err := f.notif.InsertFanout(ctx, actorID, visibility, kind, raw); err != nil {
		log.Printf("activity fanout: %v", err)
	}
}

// NotifyCollectionCreated tells followers of actorID when a new collection is visible to them.
func (f *ActivityFanout) NotifyCollectionCreated(ctx context.Context, actorID int64, visibility models.Visibility, collectionID, name string) {
	f.insert(ctx, actorID, visibility, models.NotificationKindCollectionCreated, map[string]any{
		"collection_id": collectionID,
		"name":          name,
	})
}

func (f *ActivityFanout) NotifyListCreated(ctx context.Context, actorID int64, visibility models.Visibility, listID, name string) {
	f.insert(ctx, actorID, visibility, models.NotificationKindListCreated, map[string]any{
		"list_id": listID,
		"name":    name,
	})
}

func (f *ActivityFanout) NotifyWishlistCreated(ctx context.Context, actorID int64, visibility models.Visibility, wishlistID, name string) {
	f.insert(ctx, actorID, visibility, models.NotificationKindWishlistCreated, map[string]any{
		"wishlist_id": wishlistID,
		"name":        name,
	})
}

// NotifyItemAdded notifies when actorID adds an item to a collection they own (owner-only mutations today).
func (f *ActivityFanout) NotifyItemAdded(ctx context.Context, actorID, collectionOwnerID int64, visibility models.Visibility, collectionID, collectionName, itemID, itemTitle string, initialRating *int) {
	if actorID != collectionOwnerID {
		return
	}
	p := map[string]any{
		"collection_id":   collectionID,
		"collection_name": collectionName,
		"item_id":         itemID,
		"item_title":      itemTitle,
	}
	if initialRating != nil {
		p["rating"] = *initialRating
	}
	f.insert(ctx, actorID, visibility, models.NotificationKindItemAdded, p)
}

func (f *ActivityFanout) NotifyItemRated(ctx context.Context, actorID, collectionOwnerID int64, visibility models.Visibility, collectionID, collectionName, itemID, itemTitle string, stars int) {
	if actorID != collectionOwnerID {
		return
	}
	f.insert(ctx, actorID, visibility, models.NotificationKindItemRated, map[string]any{
		"collection_id":   collectionID,
		"collection_name": collectionName,
		"item_id":         itemID,
		"item_title":      itemTitle,
		"stars":           stars,
	})
}

// NotifyNewFollower tells followedUserID that followerID started following them.
func (f *ActivityFanout) NotifyNewFollower(ctx context.Context, followedUserID, followerID int64) {
	if f == nil || f.notif == nil {
		return
	}
	if followedUserID < 1 || followerID < 1 || followedUserID == followerID {
		return
	}
	raw, err := json.Marshal(map[string]any{})
	if err != nil {
		log.Printf("activity fanout: marshal payload: %v", err)
		return
	}
	if err := f.notif.InsertOne(ctx, followedUserID, followerID, models.NotificationKindNewFollower, raw); err != nil {
		log.Printf("activity fanout: %v", err)
	}
}
