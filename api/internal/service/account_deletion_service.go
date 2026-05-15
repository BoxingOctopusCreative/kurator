package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/mailgun"
	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
)

const (
	accountDeactivationGrace = 30 * 24 * time.Hour
	reactivationTokenTTL     = 30 * 24 * time.Hour
)

var ErrAccountAlreadyDeactivated = errors.New("account is already deactivated")

type AccountDeletionService struct {
	users     repository.UserRepository
	sessions  repository.SessionRepository
	account   *repository.PostgresAccountDeletionRepository
	notif     *repository.PostgresNotificationRepository
	mail      *mailgun.Client
	publicWeb string
}

func NewAccountDeletionService(
	users repository.UserRepository,
	sessions repository.SessionRepository,
	account *repository.PostgresAccountDeletionRepository,
	notif *repository.PostgresNotificationRepository,
	mail *mailgun.Client,
	publicWebBaseURL string,
) *AccountDeletionService {
	return &AccountDeletionService{
		users:     users,
		sessions:  sessions,
		account:   account,
		notif:     notif,
		mail:      mail,
		publicWeb: strings.TrimRight(strings.TrimSpace(publicWebBaseURL), "/"),
	}
}

func (s *AccountDeletionService) DeletionContext(ctx context.Context, userID int64) ([]models.SharedShelfForDeletion, error) {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u.AccountStatus != models.AccountStatusActive {
		return nil, repository.ErrAccountNotActive
	}
	return s.account.ListSharedOwnedShelves(ctx, userID)
}

type DeactivateAccountInput struct {
	Transfers []models.ShelfOwnershipTransfer `json:"transfers"`
}

func (s *AccountDeletionService) DeactivateAccount(ctx context.Context, userID int64, in DeactivateAccountInput) error {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if u.AccountStatus != models.AccountStatusActive {
		return ErrAccountAlreadyDeactivated
	}

	shared, err := s.account.ListSharedOwnedShelves(ctx, userID)
	if err != nil {
		return err
	}
	transferKeys := map[string]int64{}
	for _, t := range in.Transfers {
		key := t.Kind + ":" + strings.TrimSpace(t.ShelfID)
		transferKeys[key] = t.NewOwnerID
	}
	for _, sh := range shared {
		key := sh.Kind + ":" + sh.ID
		newOwner, ok := transferKeys[key]
		if !ok {
			continue
		}
		valid := false
		for _, m := range sh.Members {
			if m.UserID == newOwner {
				valid = true
				break
			}
		}
		if !valid {
			return repository.ErrInvalidOwnershipTransfer
		}
	}

	rawToken, tokenHash, err := newOpaqueToken()
	if err != nil {
		return err
	}
	purgeAt := time.Now().Add(accountDeactivationGrace)
	successions, err := s.account.DeactivateAccount(ctx, userID, in.Transfers, transferKeys, purgeAt, time.Now().Add(reactivationTokenTTL), tokenHash)
	if err != nil {
		return err
	}
	if err := s.sessions.DeleteAllForUser(ctx, userID); err != nil {
		return err
	}
	for _, succ := range successions {
		s.notifySuccession(ctx, userID, succ)
	}
	s.sendDeactivationEmail(ctx, u.Email, rawToken, purgeAt)
	return nil
}

func (s *AccountDeletionService) notifySuccession(ctx context.Context, outgoingID int64, succ repository.SuccessionNotify) {
	body := map[string]any{
		"succession_id": succ.ID,
		"shelf_kind":    string(succ.Kind),
		"shelf_id":      succ.ShelfID,
		"shelf_name":    succ.ShelfName,
		"mode":          succ.Mode,
	}
	if succ.Mode == "election" && len(succ.Members) > 0 {
		candidates := make([]map[string]any, 0, len(succ.Members))
		for _, m := range succ.Members {
			candidates = append(candidates, map[string]any{
				"user_id":      m.UserID,
				"username":     m.Username,
				"display_name": m.DisplayName,
			})
		}
		body["candidates"] = candidates
	}
	payload, _ := json.Marshal(body)
	kindNotif := models.NotificationKindShelfOwnershipElection
	if succ.Mode == "sole_takeover" {
		kindNotif = models.NotificationKindShelfOwnershipTakeover
	}
	for _, m := range succ.Members {
		if err := s.notif.InsertOne(ctx, m.UserID, outgoingID, kindNotif, payload); err != nil {
			log.Printf("account deletion: notify member %d: %v", m.UserID, err)
		}
	}
}

func (s *AccountDeletionService) sendDeactivationEmail(ctx context.Context, email, rawToken string, purgeAt time.Time) {
	if s.mail == nil || s.publicWeb == "" {
		log.Printf("account deletion: mail or public web URL not configured; skipping email to %q", email)
		return
	}
	link := s.publicWeb + "/reactivate-account?token=" + rawToken
	subject := "Your Kurator account is scheduled for deletion"
	body := fmt.Sprintf(`Hello,

Your Kurator account has been deactivated and is scheduled for permanent deletion on %s.

If you did not mean to delete your account, reactivate it within 30 days using this link:

%s

After reactivation you can sign in again with your existing password.

— Kurator
`, purgeAt.Format("January 2, 2006"), link)
	if err := s.mail.Send(ctx, email, subject, body); err != nil {
		log.Printf("account deletion: mail send failed: %v", err)
	}
}

func (s *AccountDeletionService) ReactivateByToken(ctx context.Context, rawToken string) error {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return repository.ErrUserNotFound
	}
	hash := hashOpaqueToken(rawToken)
	uid, err := s.account.UserIDByReactivationTokenHash(ctx, hash)
	if err != nil {
		return err
	}
	return s.account.ReactivateUserByID(ctx, uid)
}

func (s *AccountDeletionService) AcceptSuccessionTakeover(ctx context.Context, actorID, successionID int64) error {
	return s.account.ResolveSuccessionTakeover(ctx, successionID, actorID)
}

func (s *AccountDeletionService) VoteSuccession(ctx context.Context, voterID, successionID, candidateID int64) error {
	return s.account.CastElectionVote(ctx, successionID, voterID, candidateID)
}

func (s *AccountDeletionService) RunPurgeCycle(ctx context.Context) error {
	ids, err := s.account.ListUsersDueForPurge(ctx, 20)
	if err != nil {
		return err
	}
	for _, id := range ids {
		if err := s.account.ResolvePendingSuccessionsForPurge(ctx, id); err != nil {
			log.Printf("account purge: resolve successions user %d: %v", id, err)
		}
		if err := s.account.PurgeUserContent(ctx, id); err != nil {
			log.Printf("account purge: user %d: %v", id, err)
			continue
		}
		log.Printf("account purge: permanently deleted user_id=%d", id)
	}
	return nil
}

func newOpaqueToken() (raw string, hash string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	raw = hex.EncodeToString(b)
	return raw, hashOpaqueToken(raw), nil
}

func hashOpaqueToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
