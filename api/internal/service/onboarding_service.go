package service

import (
	"context"
	"errors"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
)

const onboardingMinShelfItems = 3

var (
	ErrOnboardingAlreadyComplete = errors.New("onboarding already completed")
	ErrOnboardingStepInvalid     = errors.New("invalid onboarding step")
	ErrOnboardingStepIncomplete  = errors.New("complete the current onboarding step before continuing")
)

// OnboardingStatus is returned to clients driving the overlay flow.
type OnboardingStatus struct {
	OnboardingCompleted bool   `json:"onboarding_completed"`
	OnboardingStep      int    `json:"onboarding_step"`
	HasShelves          bool   `json:"has_shelves"`
	CollectionShelfID   string `json:"collection_shelf_id,omitempty"`
	CollectionItemCount int64  `json:"collection_item_count"`
	WishlistShelfID     string `json:"wishlist_shelf_id,omitempty"`
	WishlistEntryCount  int64  `json:"wishlist_entry_count"`
}

type OnboardingService struct {
	users      repository.UserRepository
	onboarding *repository.OnboardingRepository
}

func NewOnboardingService(users repository.UserRepository, onboarding *repository.OnboardingRepository) *OnboardingService {
	return &OnboardingService{users: users, onboarding: onboarding}
}

func effectiveOnboardingStep(u *models.User) int {
	if u == nil {
		return 1
	}
	if u.OnboardingStep < 1 {
		return 1
	}
	if u.OnboardingStep > 5 {
		return 5
	}
	return u.OnboardingStep
}

// NeedsOnboarding reports whether the overlay should be shown for this account.
func NeedsOnboarding(u *models.User, hasShelves bool) bool {
	if u == nil || u.OnboardingCompleted || hasShelves {
		return false
	}
	return true
}

func (s *OnboardingService) GetStatus(ctx context.Context, userID int64) (*OnboardingStatus, error) {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	hasShelves, err := s.users.UserHasAnyShelves(ctx, userID)
	if err != nil {
		return nil, err
	}
	st := &OnboardingStatus{
		OnboardingCompleted: u.OnboardingCompleted,
		OnboardingStep:      effectiveOnboardingStep(u),
		HasShelves:          hasShelves,
	}
	if u.OnboardingCompleted || hasShelves {
		st.OnboardingStep = 5
		return st, nil
	}
	col, err := s.onboarding.LatestCollectionProgress(ctx, userID)
	if err != nil {
		return nil, err
	}
	if col != nil {
		st.CollectionShelfID = col.ShelfID
		st.CollectionItemCount = col.ItemCount
	}
	wl, err := s.onboarding.LatestWishlistProgress(ctx, userID)
	if err != nil {
		return nil, err
	}
	if wl != nil {
		st.WishlistShelfID = wl.ShelfID
		st.WishlistEntryCount = wl.ItemCount
	}
	return st, nil
}

func (s *OnboardingService) validateStepComplete(ctx context.Context, u *models.User, step int) error {
	switch step {
	case 1:
		if strings.TrimSpace(u.DisplayName) == "" {
			return ErrOnboardingStepIncomplete
		}
		if strings.TrimSpace(u.Bio) == "" {
			return ErrOnboardingStepIncomplete
		}
		if u.AvatarURL == nil || strings.TrimSpace(*u.AvatarURL) == "" {
			return ErrOnboardingStepIncomplete
		}
	case 2:
		if !u.TwoFactorEnabled {
			return ErrOnboardingStepIncomplete
		}
	case 3:
		ok, err := s.onboarding.HasCollectionWithMinItems(ctx, u.ID, onboardingMinShelfItems)
		if err != nil {
			return err
		}
		if !ok {
			return ErrOnboardingStepIncomplete
		}
	case 4:
		ok, err := s.onboarding.HasWishlistWithMinEntries(ctx, u.ID, onboardingMinShelfItems)
		if err != nil {
			return err
		}
		if !ok {
			return ErrOnboardingStepIncomplete
		}
	case 5:
		return nil
	default:
		return ErrOnboardingStepInvalid
	}
	return nil
}

// AdvanceStep validates the current step, then moves to nextStep (must be current+1, or 5 with complete=true).
func (s *OnboardingService) AdvanceStep(ctx context.Context, userID int64, nextStep int, markComplete bool) (*OnboardingStatus, error) {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u.OnboardingCompleted {
		return nil, ErrOnboardingAlreadyComplete
	}
	hasShelves, err := s.users.UserHasAnyShelves(ctx, userID)
	if err != nil {
		return nil, err
	}
	if hasShelves {
		if err := s.users.UpdateOnboarding(ctx, userID, 5, true); err != nil {
			return nil, err
		}
		return s.GetStatus(ctx, userID)
	}
	current := effectiveOnboardingStep(u)
	if nextStep < 1 || nextStep > 5 {
		return nil, ErrOnboardingStepInvalid
	}
	if markComplete {
		if current != 5 {
			return nil, ErrOnboardingStepInvalid
		}
		if err := s.users.UpdateOnboarding(ctx, userID, 5, true); err != nil {
			return nil, err
		}
		return s.GetStatus(ctx, userID)
	}
	if nextStep != current+1 {
		return nil, ErrOnboardingStepInvalid
	}
	if err := s.validateStepComplete(ctx, u, current); err != nil {
		return nil, err
	}
	if err := s.users.UpdateOnboarding(ctx, userID, nextStep, false); err != nil {
		return nil, err
	}
	return s.GetStatus(ctx, userID)
}
