package handler

import (
	"errors"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type AccountDeletionHandler struct {
	svc *service.AccountDeletionService
}

func NewAccountDeletionHandler(svc *service.AccountDeletionService) *AccountDeletionHandler {
	return &AccountDeletionHandler{svc: svc}
}

// DeletionContext returns shared shelves the user owns for the delete-account modal.
func (h *AccountDeletionHandler) DeletionContext(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	shelves, err := h.svc.DeletionContext(c.Context(), uid)
	if err != nil {
		if errors.Is(err, repository.ErrAccountNotActive) {
			return fiber.NewError(fiber.StatusConflict, "account is not active")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"shared_shelves": shelves})
}

type deactivateAccountBody struct {
	Transfers []models.ShelfOwnershipTransfer `json:"transfers"`
}

// DeactivateAccount starts the 30-day deletion grace period and logs the user out.
func (h *AccountDeletionHandler) DeactivateAccount(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	var body deactivateAccountBody
	if len(c.Body()) > 0 {
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid json body")
		}
	}
	if err := h.svc.DeactivateAccount(c.Context(), uid, service.DeactivateAccountInput{Transfers: body.Transfers}); err != nil {
		if errors.Is(err, repository.ErrInvalidOwnershipTransfer) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		if errors.Is(err, service.ErrAccountAlreadyDeactivated) {
			return fiber.NewError(fiber.StatusConflict, err.Error())
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

type reactivateAccountBody struct {
	Token string `json:"token"`
}

// ReactivateAccount restores a deactivated account within the grace period.
func (h *AccountDeletionHandler) ReactivateAccount(c *fiber.Ctx) error {
	var body reactivateAccountBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json body")
	}
	if err := h.svc.ReactivateByToken(c.Context(), body.Token); err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return fiber.NewError(fiber.StatusBadRequest, "invalid or expired reactivation link")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

type successionVoteBody struct {
	CandidateID int64 `json:"candidate_id"`
}

// AcceptShelfOwnershipTakeover transfers shelf ownership when you are the sole remaining collaborator.
func (h *AccountDeletionHandler) AcceptShelfOwnershipTakeover(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	sid, err := c.ParamsInt("id")
	if err != nil || sid < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.svc.AcceptSuccessionTakeover(c.Context(), uid, int64(sid)); err != nil {
		return successionErr(err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

// VoteShelfOwnershipElection casts a vote for who should own a shared shelf after the owner deleted their account.
func (h *AccountDeletionHandler) VoteShelfOwnershipElection(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	sid, err := c.ParamsInt("id")
	if err != nil || sid < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body successionVoteBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json body")
	}
	if body.CandidateID < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "candidate_id is required")
	}
	if err := h.svc.VoteSuccession(c.Context(), uid, int64(sid), body.CandidateID); err != nil {
		return successionErr(err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

func successionErr(err error) error {
	switch {
	case errors.Is(err, repository.ErrSuccessionNotFound):
		return fiber.NewError(fiber.StatusNotFound, "not found")
	case errors.Is(err, repository.ErrSuccessionNotPending), errors.Is(err, repository.ErrSuccessionNotEligible):
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	default:
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
}
